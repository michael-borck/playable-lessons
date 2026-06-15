/**
 * Headless story generation pipeline, shared by the renderer and the CLI.
 *
 * Unlike the renderer's interactive flow (which pauses to ask the user
 * clarification questions), this runs end-to-end with no interaction:
 * outline → Ink generation → review → compile (with AI-assisted fix retries).
 */

import { callAI, type AIMessage, type ProviderConfig } from './aiClient.js'
import { PROMPTS } from './prompts.js'
import { compileInk } from './storyExport.js'

export interface GenerateParams {
  /** topic | lesson | methodology | case-study | lecture-notes | scenario */
  inputMode: string
  inputText: string
  storyLength?: string // short | medium | long
  protagonistType?: string
  tone?: string
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
  const inkSystem = PROMPTS.system + '\n\n' + PROMPTS.inkSyntaxRef

  // ─── Stage 1: Outline ───
  log('[1/4] Generating story outline…')
  const outlineRaw = await call([
    { role: 'system', content: PROMPTS.system },
    {
      role: 'user',
      content: PROMPTS.outline
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
      content: PROMPTS.inkGeneration
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
