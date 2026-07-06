/**
 * Headless story generation pipeline, shared by the renderer and the CLI.
 *
 * Unlike the renderer's interactive flow (which pauses to ask the user
 * clarification questions), this runs end-to-end with no interaction:
 * outline → Ink generation → review → compile (with AI-assisted fix retries).
 */

import { callAI, type AIMessage, type ProviderConfig } from './aiClient.js'
import { PROMPTS, storyPrompts, type BranchingStyle } from './prompts.js'
import { compileInk } from './storyExport.js'

export type { BranchingStyle }

export interface GenerateParams {
  /** topic | lesson | methodology | case-study | lecture-notes | scenario */
  inputMode: string
  inputText: string
  storyLength?: string // short | medium | long
  protagonistType?: string
  tone?: string
  /**
   * stateful (default): Ink-native variables + conditional text.
   * branching: pure branching tree, no state — convertible to H5P/LMS formats.
   */
  branchingStyle?: BranchingStyle
  /** Optional pre-supplied answers to clarification questions. */
  answers?: string
}

export interface GenerateResult {
  inkSource: string
  compiledJson: string
  outlineRaw: string
}

export type CallFn = (messages: AIMessage[]) => Promise<string>

export interface GenerateOptions {
  log?: (msg: string) => void
  /** Override the AI transport (used by tests). Defaults to callAI(_, config). */
  call?: CallFn
  maxCompileRetries?: number
}

/** Pull Ink source out of an AI response — prefer a ```ink block, then any fence. */
export function extractInk(raw: string): string {
  const inkBlock = raw.match(/```ink\s*([\s\S]*?)```/)
  if (inkBlock) return inkBlock[1].trim()
  const anyBlock = raw.match(/```\s*([\s\S]*?)```/)
  if (anyBlock) return anyBlock[1].trim()
  return raw.trim()
}

/** Match a corrected ```ink block from a review/fix response (only `ink` fences). */
function extractInkCorrection(raw: string): string | null {
  const m = raw.match(/```ink\s*([\s\S]*?)```/)
  return m ? m[1].trim() : null
}
/**
 * Pull a JSON object out of an AI response — prefer a ```json fence, then any
 * fence, then the outermost {...} span. Throws if nothing parses.
 */
export function extractJson<T = unknown>(raw: string): T {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fence ? fence[1] : raw).trim()
  try {
    return JSON.parse(candidate) as T
  } catch {
    // Fall through and try slicing the outermost object span.
  }
  const first = candidate.indexOf('{')
  const last = candidate.lastIndexOf('}')
  if (first !== -1 && last > first) {
    return JSON.parse(candidate.slice(first, last + 1)) as T
  }
  throw new Error('Could not parse JSON from the AI response')
}
/**
 * Shared core of the single-call JSON generators (flashcards, quiz, summary):
 * resolve the transport from `opts` (defaulting to callAI with `config`), invoke
 * it, and parse the response as JSON. Returns the parsed data and the raw
 * response — the raw is kept on each result for the `json` export + debugging.
 */
async function callForJson<T = unknown>(
  messages: AIMessage[],
  config: ProviderConfig,
  opts: GenerateOptions
): Promise<{ data: T; raw: string }> {
  const call = opts.call ?? ((m: AIMessage[]) => callAI(m, config))
  const raw = await call(messages)
  return { data: extractJson<T>(raw), raw }
}

export async function generateInk(
  params: GenerateParams,
  config: ProviderConfig,
  opts: GenerateOptions = {}
): Promise<GenerateResult> {
  const log = opts.log ?? (() => {})
  const call = opts.call ?? ((messages: AIMessage[]) => callAI(messages, config))
  const maxRetries = opts.maxCompileRetries ?? 3

  const mode = params.inputMode
  const length = params.storyLength || 'medium'
  const protagonist = params.protagonistType || 'the reader'
  const tone = params.tone || 'professional'
  const answers = params.answers || '(no specific preferences provided — use sensible defaults)'
  const sp = storyPrompts(params.branchingStyle)
  const inkSystem = sp.system + '\n\n' + sp.inkSyntaxRef

  // ─── Stage 1: Outline ───
  log('[1/4] Generating story outline…')
  const outlineRaw = await call([
    { role: 'system', content: sp.system },
    {
      role: 'user',
      content: sp.outline
        .replace('{{inputMode}}', mode)
        .replace('{{inputText}}', params.inputText)
        .replace('{{storyLength}}', length)
        .replace('{{answers}}', answers)
        .replace('{{protagonistType}}', protagonist)
        .replace('{{tone}}', tone)
    }
  ])

  // ─── Stage 2: Ink generation ───
  log('[2/4] Generating Ink source…')
  const inkRaw = await call([
    { role: 'system', content: inkSystem },
    {
      role: 'user',
      content: sp.inkGeneration
        .replace('{{outline}}', outlineRaw)
        .replace('{{inputMode}}', mode)
        .replace('{{inputText}}', params.inputText)
        .replace('{{storyLength}}', length)
    }
  ])
  let inkSource = extractInk(inkRaw)

  // ─── Stage 3: Review pass ───
  log('[3/4] Reviewing for errors and inconsistencies…')
  const reviewRaw = await call([
    { role: 'system', content: inkSystem },
    { role: 'user', content: PROMPTS.review.replace('{{inkSource}}', inkSource) }
  ])
  const corrected = extractInkCorrection(reviewRaw)
  // Only accept the rewrite if it retains at least half the original's length
  // (guards against a truncated/partial snippet).
  if (corrected && corrected.length > inkSource.length * 0.5) {
    inkSource = corrected
    log('Applied corrections from review.')
  }

  // ─── Stage 4: Compile, with AI-assisted fix retries ───
  log('[4/4] Compiling Ink source…')
  let current = inkSource
  for (let attempt = 1; ; attempt++) {
    try {
      const compiledJson = await compileInk(current)
      log('Compiled successfully.')
      return { inkSource: current, compiledJson, outlineRaw }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (attempt >= maxRetries) {
        throw new Error(`Failed to compile after ${maxRetries} attempt(s): ${errMsg}`)
      }
      log(`Compilation failed (attempt ${attempt}/${maxRetries}): ${errMsg}`)
      log('Asking the model to fix it…')
      const fixRaw = await call([
        { role: 'system', content: inkSystem },
        {
          role: 'user',
          content:
            `The following Ink source failed to compile with this error:\n\n${errMsg}\n\n` +
            `Here is the Ink source:\n\`\`\`ink\n${current}\n\`\`\`\n\n` +
            'Please fix the errors and return the complete corrected Ink source in a ```ink code block.'
        }
      ])
      const fixed = extractInkCorrection(fixRaw)
      if (fixed) current = fixed
    }
  }
}

// ─── Flashcards ──────────────────────────────────────────────────────────────

export interface Flashcard {
  front: string
  back: string
  hint?: string
  tag?: string
}

export interface FlashcardResult {
  deckTitle: string
  cards: Flashcard[]
  /** The raw AI response, kept for debugging and the `json` export format. */
  raw: string
}

export interface FlashcardParams {
  /** topic | lesson | methodology | case-study | lecture-notes | scenario */
  inputMode: string
  inputText: string
  cardCount?: number
  tone?: string
}

/**
 * Coerce a parsed AI payload into a valid FlashcardResult. Drops any card that
 * lacks a usable front/back (models occasionally emit malformed entries) and
 * drops empty hint/tag strings so exporters can treat them as absent.
 */
function normalizeFlashcards(data: unknown, fallbackTitle: string): FlashcardResult {
  const obj = (data ?? {}) as Record<string, unknown>
  const deckTitle =
    typeof obj.deckTitle === 'string' && obj.deckTitle.trim() ? obj.deckTitle.trim() : fallbackTitle
  const rawCards = Array.isArray(obj.cards) ? obj.cards : []
  const cards: Flashcard[] = []
  for (const entry of rawCards) {
    const c = entry as Record<string, unknown>
    const front = typeof c?.front === 'string' ? c.front.trim() : ''
    const back = typeof c?.back === 'string' ? c.back.trim() : ''
    if (!front || !back) continue
    const hint = typeof c.hint === 'string' ? c.hint.trim() : ''
    const tag = typeof c.tag === 'string' ? c.tag.trim() : ''
    cards.push({ front, back, ...(hint ? { hint } : {}), ...(tag ? { tag } : {}) })
  }
  return { deckTitle, cards, raw: '' }
}

/**
 * Generate a set of study flashcards from source material. A single AI call
 * that must return strict JSON — no compile/review loop (unlike generateInk).
 */
export async function generateFlashcards(
  params: FlashcardParams,
  config: ProviderConfig,
  opts: GenerateOptions = {}
): Promise<FlashcardResult> {
  const log = opts.log ?? (() => {})

  const cardCount = params.cardCount && params.cardCount > 0 ? params.cardCount : 12
  const tone = params.tone || 'professional'

  log('[1/1] Generating flashcards…')
  const { data, raw } = await callForJson([
    { role: 'system', content: PROMPTS.flashcardsSystem },
    {
      role: 'user',
      content: PROMPTS.flashcards
        .replace('{{inputMode}}', params.inputMode)
        .replace('{{inputText}}', params.inputText)
        .replace('{{cardCount}}', String(cardCount))
        .replace('{{tone}}', tone)
    }
  ], config, opts)

  const result = normalizeFlashcards(data, 'Flashcards')
  result.raw = raw

  if (result.cards.length === 0) {
    throw new Error('The model returned no usable flashcards')
  }
  log(`Generated ${result.cards.length} flashcard(s).`)
  return result
}

// ─── Quiz ────────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  stem: string
  options: string[]
  /** 0-based index of the correct option within `options`. */
  correctIndex: number
  explanation?: string
}

export interface QuizResult {
  quizTitle: string
  questions: QuizQuestion[]
  /** The raw AI response, kept for debugging and the `json` export format. */
  raw: string
}

export interface QuizParams {
  /** topic | lesson | methodology | case-study | lecture-notes | scenario */
  inputMode: string
  inputText: string
  questionCount?: number
  tone?: string
}

const QUIZ_LETTERS = 'ABCDEFGHIJ'

/**
 * Coerce a parsed AI payload into a valid QuizResult. Drops any question whose
 * stem is empty, that has fewer than 2 usable options, or whose correctIndex is
 * out of range. Empty explanations are dropped.
 */
function normalizeQuiz(data: unknown, fallbackTitle: string): QuizResult {
  const obj = (data ?? {}) as Record<string, unknown>
  const quizTitle =
    typeof obj.quizTitle === 'string' && obj.quizTitle.trim() ? obj.quizTitle.trim() : fallbackTitle
  const rawQs = Array.isArray(obj.questions) ? obj.questions : []
  const questions: QuizQuestion[] = []
  for (const entry of rawQs) {
    const q = entry as Record<string, unknown>
    const stem = typeof q?.stem === 'string' ? q.stem.trim() : ''
    if (!stem) continue
    const options = Array.isArray(q.options)
      ? (q.options as unknown[])
          .map((o) => (typeof o === 'string' ? o.trim() : ''))
          .filter((s) => s.length > 0)
      : []
    if (options.length < 2) continue
    const idx = Number(q.correctIndex)
    const correctIndex = Number.isInteger(idx) && idx >= 0 && idx < options.length ? idx : -1
    if (correctIndex < 0) continue
    const explanation = typeof q.explanation === 'string' ? q.explanation.trim() : ''
    questions.push({ stem, options, correctIndex, ...(explanation ? { explanation } : {}) })
  }
  return { quizTitle, questions, raw: '' }
}

/** 1-based letter (A, B, …) for an option index, used by exporters. */
export function quizLetter(index: number): string {
  return QUIZ_LETTERS[index] ?? String(index + 1)
}

/**
 * Generate a multiple-choice quiz from source material. A single AI call that
 * must return strict JSON — no compile/review loop (unlike generateInk).
 */
export async function generateQuiz(
  params: QuizParams,
  config: ProviderConfig,
  opts: GenerateOptions = {}
): Promise<QuizResult> {
  const log = opts.log ?? (() => {})

  const questionCount = params.questionCount && params.questionCount > 0 ? params.questionCount : 10
  const tone = params.tone || 'professional'

  log('[1/1] Generating quiz…')
  const { data, raw } = await callForJson([
    { role: 'system', content: PROMPTS.quizSystem },
    {
      role: 'user',
      content: PROMPTS.quiz
        .replace('{{inputMode}}', params.inputMode)
        .replace('{{inputText}}', params.inputText)
        .replace('{{questionCount}}', String(questionCount))
        .replace('{{tone}}', tone)
    }
  ], config, opts)

  const result = normalizeQuiz(data, 'Quiz')
  result.raw = raw

  if (result.questions.length === 0) {
    throw new Error('The model returned no usable quiz questions')
  }
  log(`Generated ${result.questions.length} quiz question(s).`)
  return result
}

// ─── Study summary ───────────────────────────────────────────────────────────

export interface GlossaryEntry {
  term: string
  definition: string
}

export interface SummaryResult {
  title: string
  overview: string
  keyPoints: string[]
  glossary: GlossaryEntry[]
  /** The raw AI response, kept for debugging and the `json` export format. */
  raw: string
}

export interface SummaryParams {
  /** topic | lesson | methodology | case-study | lecture-notes | scenario */
  inputMode: string
  inputText: string
  keyPointCount?: number
  tone?: string
}

/**
 * Coerce a parsed AI payload into a valid SummaryResult. Drops empty key points
 * and glossary entries missing a term or definition.
 */
function normalizeSummary(data: unknown, fallbackTitle: string): SummaryResult {
  const obj = (data ?? {}) as Record<string, unknown>
  const title =
    typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : fallbackTitle
  const overview = typeof obj.overview === 'string' ? obj.overview.trim() : ''
  const keyPoints = Array.isArray(obj.keyPoints)
    ? (obj.keyPoints as unknown[])
        .map((p) => (typeof p === 'string' ? p.trim() : ''))
        .filter((p) => p.length > 0)
    : []
  const glossary: GlossaryEntry[] = []
  const rawEntries = Array.isArray(obj.glossary) ? obj.glossary : []
  for (const entry of rawEntries) {
    const g = entry as Record<string, unknown>
    const term = typeof g?.term === 'string' ? g.term.trim() : ''
    const definition = typeof g?.definition === 'string' ? g.definition.trim() : ''
    if (term && definition) glossary.push({ term, definition })
  }
  return { title, overview, keyPoints, glossary, raw: '' }
}

/**
 * Generate a study summary from source material. A single AI call that must
 * return strict JSON — no compile/review loop (unlike generateInk).
 */
export async function generateSummary(
  params: SummaryParams,
  config: ProviderConfig,
  opts: GenerateOptions = {}
): Promise<SummaryResult> {
  const log = opts.log ?? (() => {})

  const keyPointCount = params.keyPointCount && params.keyPointCount > 0 ? params.keyPointCount : 8
  const tone = params.tone || 'professional'

  log('[1/1] Generating study summary…')
  const { data, raw } = await callForJson([
    { role: 'system', content: PROMPTS.summarySystem },
    {
      role: 'user',
      content: PROMPTS.summary
        .replace('{{inputMode}}', params.inputMode)
        .replace('{{inputText}}', params.inputText)
        .replace('{{keyPointCount}}', String(keyPointCount))
        .replace('{{tone}}', tone)
    }
  ], config, opts)

  const result = normalizeSummary(data, 'Summary')
  result.raw = raw

  if (!result.overview && result.keyPoints.length === 0) {
    throw new Error('The model returned no usable summary content')
  }
  log(`Generated ${result.keyPoints.length} key point(s), ${result.glossary.length} glossary term(s).`)
  return result
}

// ─── AI-collaboration tasks ──────────────────────────────────────────────────

export interface LoadBearingSpecific {
  detail: string
  whyGenericAnswersMissIt: string
}

export interface AiRubricItem {
  criterion: string
  description: string
}

export interface AiTask {
  scenario: string
  brief: string
  deliverable: string
  loadBearingSpecifics: LoadBearingSpecific[]
  rubric: AiRubricItem[]
  whyItWorks: string
}

export interface AiTaskResult {
  title: string
  tasks: AiTask[]
  /** The raw AI response, kept for debugging and the `json` export format. */
  raw: string
}

export interface AiTaskParams {
  /** topic | lesson | methodology | case-study | lecture-notes | scenario */
  inputMode: string
  inputText: string
  taskCount?: number
  tone?: string
}

/**
 * Coerce a parsed AI payload into a valid AiTaskResult. Drops tasks missing a
 * scenario/brief/deliverable/whyItWorks, and drops specifics/rubric items that
 * lack both fields. Keeps only tasks that retain at least one load-bearing
 * specific and one rubric criterion.
 */
function normalizeAiTask(data: unknown, fallbackTitle: string): AiTaskResult {
  const obj = (data ?? {}) as Record<string, unknown>
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : fallbackTitle
  const rawTasks = Array.isArray(obj.tasks) ? obj.tasks : []
  const tasks: AiTask[] = []
  for (const entry of rawTasks) {
    const t = entry as Record<string, unknown>
    const scenario = typeof t?.scenario === 'string' ? t.scenario.trim() : ''
    const brief = typeof t?.brief === 'string' ? t.brief.trim() : ''
    const deliverable = typeof t?.deliverable === 'string' ? t.deliverable.trim() : ''
    const whyItWorks = typeof t?.whyItWorks === 'string' ? t.whyItWorks.trim() : ''
    if (!scenario || !brief || !deliverable || !whyItWorks) continue

    const specifics: LoadBearingSpecific[] = []
    for (const s of Array.isArray(t.loadBearingSpecifics) ? t.loadBearingSpecifics : []) {
      const sp = s as Record<string, unknown>
      const detail = typeof sp?.detail === 'string' ? sp.detail.trim() : ''
      const why = typeof sp?.whyGenericAnswersMissIt === 'string' ? sp.whyGenericAnswersMissIt.trim() : ''
      if (detail && why) specifics.push({ detail, whyGenericAnswersMissIt: why })
    }

    const rubric: AiRubricItem[] = []
    for (const r of Array.isArray(t.rubric) ? t.rubric : []) {
      const rr = r as Record<string, unknown>
      const criterion = typeof rr?.criterion === 'string' ? rr.criterion.trim() : ''
      const description = typeof rr?.description === 'string' ? rr.description.trim() : ''
      if (criterion && description) rubric.push({ criterion, description })
    }

    if (specifics.length === 0 || rubric.length === 0) continue
    tasks.push({ scenario, brief, deliverable, loadBearingSpecifics: specifics, rubric, whyItWorks })
  }
  return { title, tasks, raw: '' }
}

/**
 * Generate AI-collaboration tasks from source material. A single AI call that
 * must return strict JSON — no compile/review loop (unlike generateInk).
 */
export async function generateAiTask(
  params: AiTaskParams,
  config: ProviderConfig,
  opts: GenerateOptions = {}
): Promise<AiTaskResult> {
  const log = opts.log ?? (() => {})
  const taskCount = params.taskCount && params.taskCount > 0 ? params.taskCount : 3
  const tone = params.tone || 'professional'

  log('[1/1] Generating AI-collaboration tasks…')
  const { data, raw } = await callForJson([
    { role: 'system', content: PROMPTS.aiTaskSystem },
    {
      role: 'user',
      content: PROMPTS.aiTask
        .replace('{{inputMode}}', params.inputMode)
        .replace('{{inputText}}', params.inputText)
        .replace('{{taskCount}}', String(taskCount))
        .replace('{{tone}}', tone)
    }
  ], config, opts)

  const result = normalizeAiTask(data, 'AI-Collaboration Tasks')
  result.raw = raw

  if (result.tasks.length === 0) {
    throw new Error('The model returned no usable AI-collaboration tasks')
  }
  log(`Generated ${result.tasks.length} AI-collaboration task(s).`)
  return result
}

// ─── Case study ──────────────────────────────────────────────────────────────

export type CaseStudyDepth = 'idea' | 'outline' | 'complete'

export interface CaseStudy {
  title: string
  protagonist: string
  situation: string
  keyFacts: string[]
  conflict: string
  decisionPoints: string[]
  discussionQuestions: string[]
  /** Full prose narrative; present only at depth "complete". */
  narrative?: string
}

export interface CaseStudyResult {
  title: string
  caseStudy: CaseStudy
  /** The raw AI response, kept for debugging and the `json` export format. */
  raw: string
}

export interface CaseStudyParams {
  /** topic | lesson | methodology | case-study | lecture-notes | scenario */
  inputMode: string
  inputText: string
  depth?: CaseStudyDepth
  tone?: string
}

/** Coerce a parsed payload into a valid CaseStudyResult (trims, drops empties). */
function normalizeCaseStudy(data: unknown, fallbackTitle: string): CaseStudyResult {
  const obj = (data ?? {}) as Record<string, unknown>
  const strArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? (v as unknown[])
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter((s) => s.length > 0)
      : []
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : fallbackTitle
  const narrative = typeof obj.narrative === 'string' ? obj.narrative.trim() : ''
  const caseStudy: CaseStudy = {
    title,
    protagonist: typeof obj.protagonist === 'string' ? obj.protagonist.trim() : '',
    situation: typeof obj.situation === 'string' ? obj.situation.trim() : '',
    keyFacts: strArr(obj.keyFacts),
    conflict: typeof obj.conflict === 'string' ? obj.conflict.trim() : '',
    decisionPoints: strArr(obj.decisionPoints),
    discussionQuestions: strArr(obj.discussionQuestions),
    ...(narrative ? { narrative } : {})
  }
  return { title, caseStudy, raw: '' }
}

/**
 * Generate a teaching case study from source material. A single AI call that
 * must return strict JSON — no compile/review loop (unlike generateInk).
 */
export async function generateCaseStudy(
  params: CaseStudyParams,
  config: ProviderConfig,
  opts: GenerateOptions = {}
): Promise<CaseStudyResult> {
  const log = opts.log ?? (() => {})
  const depth: CaseStudyDepth =
    params.depth === 'idea' || params.depth === 'outline' ? params.depth : 'complete'
  const tone = params.tone || 'professional'

  log(`[1/1] Generating case study (${depth})…`)
  const { data, raw } = await callForJson([
    { role: 'system', content: PROMPTS.caseStudySystem },
    {
      role: 'user',
      content: PROMPTS.caseStudy
        .replace('{{inputMode}}', params.inputMode)
        .replace('{{inputText}}', params.inputText)
        .replace('{{depth}}', depth)
        .replace('{{tone}}', tone)
    }
  ], config, opts)

  const result = normalizeCaseStudy(data, 'Case Study')
  result.raw = raw

  const cs = result.caseStudy
  if (!cs.situation && !cs.conflict && cs.keyFacts.length === 0) {
    throw new Error('The model returned no usable case study content')
  }
  log('Generated case study.')
  return result
}

// ─── Recommender (plan) ──────────────────────────────────────────────────────

export type PlanTarget = 'story' | 'flashcards' | 'quiz' | 'summary' | 'ai-task' | 'case-study'

export interface PlanRecommendation {
  target: PlanTarget
  rationale: string
  depth?: CaseStudyDepth
  count?: number
}

export interface PlanResult {
  title: string
  summary: string
  recommendations: PlanRecommendation[]
  /** The raw AI response, kept for debugging and the `json` export format. */
  raw: string
}

export interface PlanParams {
  /** topic | lesson | methodology | case-study | lecture-notes | scenario */
  inputMode: string
  inputText: string
  tone?: string
  /** Story style used when a plan's recommended set includes a story. */
  branchingStyle?: BranchingStyle
}

const PLAN_TARGETS: PlanTarget[] = ['story', 'flashcards', 'quiz', 'summary', 'ai-task', 'case-study']

/** Coerce a parsed payload into a valid PlanResult (validates targets, drops junk). */
function normalizePlan(data: unknown, fallbackTitle: string): PlanResult {
  const obj = (data ?? {}) as Record<string, unknown>
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : fallbackTitle
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''
  const recommendations: PlanRecommendation[] = []
  for (const r of Array.isArray(obj.recommendations) ? obj.recommendations : []) {
    const rr = r as Record<string, unknown>
    const target = typeof rr?.target === 'string' ? rr.target.trim() : ''
    if (!PLAN_TARGETS.includes(target as PlanTarget)) continue
    const rationale = typeof rr.rationale === 'string' ? rr.rationale.trim() : ''
    if (!rationale) continue
    const rec: PlanRecommendation = { target: target as PlanTarget, rationale }
    const depth = typeof rr.depth === 'string' ? rr.depth.trim() : ''
    if (depth === 'idea' || depth === 'outline' || depth === 'complete') rec.depth = depth
    const count = Number(rr.count)
    if (Number.isInteger(count) && count > 0) rec.count = count
    recommendations.push(rec)
  }
  return { title, summary, recommendations, raw: '' }
}

/**
 * Recommend a set of outputs for the source material. A single AI call that
 * must return strict JSON — no compile/review loop (unlike generateInk).
 */
export async function generatePlan(
  params: PlanParams,
  config: ProviderConfig,
  opts: GenerateOptions = {}
): Promise<PlanResult> {
  const log = opts.log ?? (() => {})
  const tone = params.tone || 'professional'

  log('[1/1] Planning recommendations…')
  const { data, raw } = await callForJson([
    { role: 'system', content: PROMPTS.planSystem },
    {
      role: 'user',
      content: PROMPTS.plan
        .replace('{{inputMode}}', params.inputMode)
        .replace('{{inputText}}', params.inputText)
        .replace('{{tone}}', tone)
    }
  ], config, opts)

  const result = normalizePlan(data, 'Plan')
  result.raw = raw

  if (result.recommendations.length === 0) {
    throw new Error('The model returned no usable recommendations')
  }
  log(`Planned ${result.recommendations.length} output(s).`)
  return result
}

/** Artifacts produced by applying a plan (at most one of each target). */
export interface PlanArtifacts {
  story?: GenerateResult
  flashcards?: FlashcardResult
  quiz?: QuizResult
  summary?: SummaryResult
  aiTask?: AiTaskResult
  caseStudy?: CaseStudyResult
}

/**
 * Generate every recommended output, returning the assembled artifacts. Used by
 * the CLI (`plan --apply`) and the GUI ("generate all → project"). Reuses the
 * per-target generators via the shared transport in `opts`.
 */
export async function applyPlan(
  plan: PlanResult,
  params: PlanParams,
  config: ProviderConfig,
  opts: GenerateOptions = {}
): Promise<PlanArtifacts> {
  const log = opts.log ?? (() => {})
  const { inputMode, inputText, tone, branchingStyle } = params
  const artifacts: PlanArtifacts = {}
  const recs = plan.recommendations
  recs.forEach((rec, i) => {
    log(`[${i + 1}/${recs.length}] Generating ${rec.target}…`)
  })
  for (const rec of recs) {
    switch (rec.target) {
      case 'story':
        artifacts.story = await generateInk(
          { inputMode, inputText, storyLength: 'medium', tone, branchingStyle }, config, opts
        )
        break
      case 'flashcards':
        artifacts.flashcards = await generateFlashcards(
          { inputMode, inputText, cardCount: rec.count, tone }, config, opts
        )
        break
      case 'quiz':
        artifacts.quiz = await generateQuiz(
          { inputMode, inputText, questionCount: rec.count, tone }, config, opts
        )
        break
      case 'summary':
        artifacts.summary = await generateSummary(
          { inputMode, inputText, keyPointCount: rec.count, tone }, config, opts
        )
        break
      case 'ai-task':
        artifacts.aiTask = await generateAiTask(
          { inputMode, inputText, taskCount: rec.count, tone }, config, opts
        )
        break
      case 'case-study':
        artifacts.caseStudy = await generateCaseStudy(
          { inputMode, inputText, depth: rec.depth, tone }, config, opts
        )
        break
    }
  }
  return artifacts
}

// ─── AI refinement (per-item) ────────────────────────────────────────────────

/**
 * Refine a single piece of text via the LLM. Returns the improved text (not
 * JSON — just cleaned-up prose). Used by the inline "✨ Improve" buttons.
 */
export async function refineText(
  text: string,
  instruction: string,
  config: ProviderConfig,
  opts: GenerateOptions = {}
): Promise<string> {
  const call = opts.call ?? ((messages: AIMessage[]) => callAI(messages, config))
  const result = await call([
    {
      role: 'system',
      content:
        'You improve educational content. Return ONLY the improved text — no preamble, no explanation, no markdown.'
    },
    {
      role: 'user',
      content: `${instruction}\n\nCurrent text:\n"""\n${text}\n"""\n\nReturn only the improved version.`
    }
  ])
  return result.trim()
}
