import { useAppStore } from '../stores/appStore'
import { PROMPTS, storyPrompts } from './prompts'
import { compileInk } from './inkCompiler'
import {
  callAI,
  listModels as clientListModels,
  testConnection as clientTestConnection,
  type AIMessage,
  type ProviderConfig,
  type ResolvedProvider
} from '../../../shared/aiClient'
import { extractInk, generateFlashcards, generateQuiz, generateSummary, generateAiTask, generateCaseStudy, generatePlan, applyPlan, refineText } from '../../../shared/generate'
import { projectIdFromName, type ProjectFull } from '../../../shared/project'
import { projectService } from './projectService'

/** Refine a single piece of text via the current provider (for the ✨ buttons). */
export async function refineTextGUI(text: string, instruction: string): Promise<string> {
  return refineText(text, instruction, buildProviderConfig(), { call: ai })
}

/** Build a provider config from the current store state, resolving `auto`. */
function buildProviderConfig(): ProviderConfig {
  const s = useAppStore.getState()
  const provider: ResolvedProvider =
    s.aiProvider === 'auto' ? (s.apiKey ? 'claude' : 'ollama') : (s.aiProvider as ResolvedProvider)

  switch (provider) {
    case 'claude':
      return { provider, model: s.claudeModel, apiKey: s.apiKey }
    case 'openai':
      return { provider, model: s.openaiModel, apiKey: s.apiKey }
    case 'custom':
      return { provider, model: s.customModel, apiKey: s.customApiKey, baseUrl: s.customBaseUrl }
    case 'ollama':
    default:
      return { provider: 'ollama', model: s.ollamaModel, ollamaUrl: s.ollamaUrl, ollamaToken: s.ollamaToken }
  }
}

/** Re-read config per call so settings changes take effect immediately. */
const ai = (messages: AIMessage[]) => callAI(messages, buildProviderConfig())

/** List models for the current provider (used by Settings → Refresh models). */
export function listModels(): Promise<string[]> {
  return clientListModels(buildProviderConfig())
}

/** Test connection for the current provider (used by Settings → Test connection). */
export function testConnection(): Promise<{ ok: boolean; message: string; models: string[] }> {
  return clientTestConnection(buildProviderConfig())
}

/**
 * Interactive generation pipeline for the GUI. Runs stages 1-6, pausing after
 * stage 2 so the UI can collect clarification answers; the UI calls
 * generateStory(true) to resume. (The CLI uses the headless generateInk in
 * src/shared/generate.ts instead.)
 */
export async function generateStory(resumeAfterClarification = false): Promise<void> {
  const store = useAppStore.getState()
  const { inputMode, inputText } = store
  const log = (msg: string) => useAppStore.getState().addGenerationLog(msg)
  // Style-dependent prompts — same selector the headless pipeline uses, so the
  // GUI, CLI, and web server all generate a given style identically.
  const sp = storyPrompts(store.branchingStyle)

  if (!resumeAfterClarification) {
    store.clearGenerationLog()

    // ─── Stage 1: Analysis ───
    store.setGenerationStage('analysis')
    log('[Stage 1] Analyzing source material...')

    const analysis = await ai([
      { role: 'system', content: sp.system },
      {
        role: 'user',
        content: PROMPTS.analysis.replace('{{inputMode}}', inputMode).replace('{{inputText}}', inputText)
      }
    ])
    log('Analysis complete.')

    // ─── Stage 2: Clarification ───
    store.setGenerationStage('clarification')
    log('[Stage 2] Generating clarification questions...')

    const clarificationRaw = await ai([
      { role: 'system', content: sp.system },
      {
        role: 'user',
        content: PROMPTS.clarification.replace('{{analysis}}', analysis).replace('{{inputMode}}', inputMode)
      }
    ])

    const questions = parseClarificationQuestions(clarificationRaw)
    store.setClarificationQuestions(questions)
    log(`Generated ${questions.length} clarification questions.`)
    log('Awaiting user input...')

    // Pause here — the UI will call generateStory(true) to resume
    return
  }

  // ─── Stage 3: Outline ───
  const storeNow = useAppStore.getState()
  const log2 = (msg: string) => useAppStore.getState().addGenerationLog(msg)

  storeNow.setGenerationStage('outline')
  log2('[Stage 3] Generating story outline...')

  const answers = storeNow.clarificationQuestions
    .map((q) => `Q: ${q.question}\nA: ${q.answer || '(no preference)'}`)
    .join('\n\n')

  const outlineRaw = await ai([
    { role: 'system', content: sp.system },
    {
      role: 'user',
      content: sp.outline
        .replace('{{inputMode}}', storeNow.inputMode)
        .replace('{{inputText}}', storeNow.inputText)
        .replace('{{storyLength}}', storeNow.storyLength)
        .replace('{{answers}}', answers)
        .replace('{{protagonistType}}', storeNow.protagonistType)
        .replace('{{tone}}', storeNow.tone)
    }
  ])

  // Try to parse JSON outline
  try {
    const jsonMatch = outlineRaw.match(/```json\s*([\s\S]*?)```/) || outlineRaw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const outline = JSON.parse(jsonMatch[1] || jsonMatch[0])
      storeNow.setStoryOutline(outline)
      log2(`Outline: ${outline.nodes?.length || 0} nodes, ${outline.edges?.length || 0} edges`)
    }
  } catch {
    log2('(Could not parse structured outline, continuing with text outline)')
  }

  // ─── Stage 4: Ink Generation ───
  storeNow.setGenerationStage('ink-generation')
  log2('[Stage 4] Generating Ink source...')

  const inkRaw = await ai([
    { role: 'system', content: sp.system + '\n\n' + sp.inkSyntaxRef },
    {
      role: 'user',
      content: sp.inkGeneration
        .replace('{{outline}}', outlineRaw)
        .replace('{{inputMode}}', storeNow.inputMode)
        .replace('{{inputText}}', storeNow.inputText)
        .replace('{{storyLength}}', storeNow.storyLength)
    }
  ])

  let inkSource = extractInk(inkRaw)
  storeNow.setInkSource(inkSource)
  log2(`Generated ${inkSource.split('\n').length} lines of Ink source.`)

  // ─── Stage 5: Review Pass ───
  storeNow.setGenerationStage('review')
  log2('[Stage 5] Reviewing for errors and inconsistencies...')

  const reviewResult = await ai([
    { role: 'system', content: sp.system + '\n\n' + sp.inkSyntaxRef },
    { role: 'user', content: PROMPTS.review.replace('{{inkSource}}', inkSource) }
  ])

  const correctedMatch = reviewResult.match(/```ink\s*([\s\S]*?)```/)
  if (correctedMatch) {
    const corrected = correctedMatch[1].trim()
    // Guard against the review returning a truncated/partial snippet: only
    // accept the rewrite if it retains at least half the original's length.
    if (corrected.length > inkSource.length * 0.5) {
      storeNow.setInkSource(corrected)
      inkSource = corrected
      log2('Applied corrections from review.')
    }
  } else {
    log2('Review passed with no corrections needed.')
  }

  // ─── Stage 6: Compile and Validate ───
  storeNow.setGenerationStage('compile')
  log2('[Stage 6] Compiling Ink source...')

  let compiled = false
  let retries = 0
  let currentSource = useAppStore.getState().inkSource

  while (!compiled && retries < 3) {
    try {
      const json = await compileInk(currentSource)
      useAppStore.getState().setCompiledStoryJson(json)
      compiled = true
      log2('[Done] Story compiled successfully!')
    } catch (err) {
      retries++
      const errMsg = err instanceof Error ? err.message : String(err)
      log2(`[Error] Compilation failed (attempt ${retries}/3): ${errMsg}`)

      if (retries < 3) {
        log2('Asking AI to fix compilation errors...')
        const fixResult = await ai([
          { role: 'system', content: sp.system + '\n\n' + sp.inkSyntaxRef },
          {
            role: 'user',
            content:
              `The following Ink source failed to compile with this error:\n\n${errMsg}\n\n` +
              `Here is the Ink source:\n\`\`\`ink\n${currentSource}\n\`\`\`\n\n` +
              'Please fix the errors and return the complete corrected Ink source in a ```ink code block.'
          }
        ])

        const fixMatch = fixResult.match(/```ink\s*([\s\S]*?)```/)
        if (fixMatch) {
          currentSource = fixMatch[1].trim()
          useAppStore.getState().setInkSource(currentSource)
          log2('Applied AI fix, retrying compilation...')
        }
      }
    }
  }

  if (!compiled) {
    useAppStore.getState().setGenerationStage('error')
    useAppStore.getState().setError('Failed to compile story after 3 attempts. You can manually edit the Ink source above.')
    return
  }

  useAppStore.getState().setGenerationStage('done')
}

/**
 * Generate a flashcard deck from the current input + provider settings. Single
 * AI call (no clarification/compile loop). Stores the result and clears any quiz.
 */
export async function generateFlashcardsGUI(count: number): Promise<void> {
  const store = useAppStore.getState()
  const { inputMode, inputText, tone } = store
  store.clearGenerationLog()
  store.setGenerationStage('analysis')
  const log = (msg: string) => useAppStore.getState().addGenerationLog(msg)
  try {
    const result = await generateFlashcards(
      { inputMode, inputText, cardCount: count, tone },
      buildProviderConfig(),
      { log, call: ai }
    )
    useAppStore.getState().setFlashcards(result)
    useAppStore.getState().setQuiz(null)
    useAppStore.getState().setSummary(null)
    useAppStore.getState().setAiTask(null)
    useAppStore.getState().setCaseStudy(null)
    useAppStore.getState().setGenerationStage('done')
    log('[Done] Flashcards ready.')
  } catch (err) {
    useAppStore.getState().setGenerationStage('error')
    log(`[Error] ${err instanceof Error ? err.message : 'Flashcard generation failed'}`)
    throw err
  }
}

/**
 * Generate a multiple-choice quiz from the current input + provider settings.
 * Single AI call. Stores the result and clears any flashcard deck.
 */
export async function generateQuizGUI(count: number): Promise<void> {
  const store = useAppStore.getState()
  const { inputMode, inputText, tone } = store
  store.clearGenerationLog()
  store.setGenerationStage('analysis')
  const log = (msg: string) => useAppStore.getState().addGenerationLog(msg)
  try {
    const result = await generateQuiz(
      { inputMode, inputText, questionCount: count, tone },
      buildProviderConfig(),
      { log, call: ai }
    )
    useAppStore.getState().setQuiz(result)
    useAppStore.getState().setFlashcards(null)
    useAppStore.getState().setSummary(null)
    useAppStore.getState().setAiTask(null)
    useAppStore.getState().setCaseStudy(null)
    useAppStore.getState().setGenerationStage('done')
    log('[Done] Quiz ready.')
  } catch (err) {
    useAppStore.getState().setGenerationStage('error')
    log(`[Error] ${err instanceof Error ? err.message : 'Quiz generation failed'}`)
    throw err
  }
}

/**
 * Generate a study summary from the current input + provider settings. Single
 * AI call. Stores the result and clears any flashcard deck / quiz.
 */
export async function generateSummaryGUI(count: number): Promise<void> {
  const store = useAppStore.getState()
  const { inputMode, inputText, tone } = store
  store.clearGenerationLog()
  store.setGenerationStage('analysis')
  const log = (msg: string) => useAppStore.getState().addGenerationLog(msg)
  try {
    const result = await generateSummary(
      { inputMode, inputText, keyPointCount: count, tone },
      buildProviderConfig(),
      { log, call: ai }
    )
    useAppStore.getState().setSummary(result)
    useAppStore.getState().setFlashcards(null)
    useAppStore.getState().setQuiz(null)
    useAppStore.getState().setAiTask(null)
    useAppStore.getState().setCaseStudy(null)
    useAppStore.getState().setGenerationStage('done')
    log('[Done] Summary ready.')
  } catch (err) {
    useAppStore.getState().setGenerationStage('error')
    log(`[Error] ${err instanceof Error ? err.message : 'Summary generation failed'}`)
    throw err
  }
}

/**
 * Generate AI-collaboration tasks from the current input + provider settings.
 * Single AI call. Stores the result and clears any other artifact.
 */
export async function generateAiTaskGUI(count: number): Promise<void> {
  const store = useAppStore.getState()
  const { inputMode, inputText, tone } = store
  store.clearGenerationLog()
  store.setGenerationStage('analysis')
  const log = (msg: string) => useAppStore.getState().addGenerationLog(msg)
  try {
    const result = await generateAiTask(
      { inputMode, inputText, taskCount: count, tone },
      buildProviderConfig(),
      { log, call: ai }
    )
    useAppStore.getState().setAiTask(result)
    useAppStore.getState().setFlashcards(null)
    useAppStore.getState().setQuiz(null)
    useAppStore.getState().setSummary(null)
    useAppStore.getState().setCaseStudy(null)
    useAppStore.getState().setGenerationStage('done')
    log('[Done] AI-collaboration tasks ready.')
  } catch (err) {
    useAppStore.getState().setGenerationStage('error')
    log(`[Error] ${err instanceof Error ? err.message : 'AI-task generation failed'}`)
    throw err
  }
}

/**
 * Generate a teaching case study from the current input + provider settings.
 * Single AI call. Stores the result and clears any other artifact.
 */
export async function generateCaseStudyGUI(depth: 'idea' | 'outline' | 'complete'): Promise<void> {
  const store = useAppStore.getState()
  const { inputMode, inputText, tone } = store
  store.clearGenerationLog()
  store.setGenerationStage('analysis')
  const log = (msg: string) => useAppStore.getState().addGenerationLog(msg)
  try {
    const result = await generateCaseStudy(
      { inputMode, inputText, depth, tone },
      buildProviderConfig(),
      { log, call: ai }
    )
    useAppStore.getState().setCaseStudy(result)
    useAppStore.getState().setFlashcards(null)
    useAppStore.getState().setQuiz(null)
    useAppStore.getState().setSummary(null)
    useAppStore.getState().setAiTask(null)
    useAppStore.getState().setGenerationStage('done')
    log('[Done] Case study ready.')
  } catch (err) {
    useAppStore.getState().setGenerationStage('error')
    log(`[Error] ${err instanceof Error ? err.message : 'Case-study generation failed'}`)
    throw err
  }
}

/**
 * Recommend a set of outputs for the current input. Single AI call; stores the
 * plan (shown in Study with a "generate all" action).
 */
export async function generatePlanGUI(): Promise<void> {
  const store = useAppStore.getState()
  const { inputMode, inputText, tone } = store
  store.clearGenerationLog()
  store.setGenerationStage('analysis')
  const log = (msg: string) => useAppStore.getState().addGenerationLog(msg)
  try {
    const result = await generatePlan(
      { inputMode, inputText, tone },
      buildProviderConfig(),
      { log, call: ai }
    )
    useAppStore.getState().setPlan(result)
    useAppStore.getState().setGenerationStage('done')
    log('[Done] Plan ready.')
  } catch (err) {
    useAppStore.getState().setGenerationStage('error')
    log(`[Error] ${err instanceof Error ? err.message : 'Planning failed'}`)
    throw err
  }
}

/**
 * Apply the current plan: generate every recommended output and save the set
 * as a new on-disk project, then switch to the Projects dashboard. This is the
 * "complete the loop" action — the recommendation becomes ownable artifacts.
 */
export async function generateAllToProject(): Promise<void> {
  const store = useAppStore.getState()
  const plan = store.plan
  if (!plan) throw new Error('No plan to apply')
  const { inputMode, inputText, tone, branchingStyle } = store
  store.clearGenerationLog()
  store.setGenerationStage('analysis')
  const log = (msg: string) => useAppStore.getState().addGenerationLog(msg)
  try {
    const artifacts = await applyPlan(
      plan,
      { inputMode, inputText, tone, branchingStyle },
      buildProviderConfig(),
      { log, call: ai }
    )
    const name = store.projectName || plan.title || 'Generated set'
    const project: ProjectFull = {
      id: projectIdFromName(name),
      name,
      inputMode,
      inputText,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      inkSource: artifacts.story?.inkSource,
      compiledStoryJson: artifacts.story?.compiledJson,
      flashcards: artifacts.flashcards,
      quiz: artifacts.quiz,
      summary: artifacts.summary,
      aiTask: artifacts.aiTask,
      caseStudy: artifacts.caseStudy
    }
    await projectService.save(project)
    const list = await projectService.list()
    useAppStore.getState().setProjects(list)
    useAppStore.getState().setLoadedProjectId(project.id)
    useAppStore.getState().setPlan(null)
    useAppStore.getState().setGenerationStage('done')
    log('[Done] Generated all outputs into a new project.')
    useAppStore.getState().setCurrentView('projects')
  } catch (err) {
    useAppStore.getState().setGenerationStage('error')
    log(`[Error] ${err instanceof Error ? err.message : 'Apply failed'}`)
    throw err
  }
}

function parseClarificationQuestions(raw: string): { id: string; question: string; answer: string }[] {
  const lines = raw.split('\n').filter((l) => l.trim())
  const questions: { id: string; question: string; answer: string }[] = []

  for (const line of lines) {
    // Match numbered questions like "1. ..." or "- ..."
    const match = line.match(/^(?:\d+[\.\)]\s*|-\s*|\*\s*)(.+)/)
    if (match) {
      questions.push({ id: `q${questions.length + 1}`, question: match[1].trim(), answer: '' })
    }
  }

  // If no structured questions found, treat whole response as questions
  if (questions.length === 0 && raw.trim()) {
    questions.push({ id: 'q1', question: raw.trim(), answer: '' })
  }

  return questions.slice(0, 5)
}
