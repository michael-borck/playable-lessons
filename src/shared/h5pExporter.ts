/**
 * H5P export: convert a pure-branching Ink story into an H5P Branching
 * Scenario package (.h5p).
 *
 * H5P's Branching Scenario is a decision tree — it has no variables and no
 * conditional logic, so only stories with no state can be converted
 * faithfully. `findStateConstructs` detects state so callers can refuse (with
 * a useful message) rather than silently flatten; `exportH5P` throws on
 * stateful sources for the same reason.
 *
 * The graph comes from the compiled Ink JSON (`parseCompiledInk`), so choice
 * text and divert targets match what the player actually executes.
 *
 * The package is "content-only": it declares its library dependencies in
 * h5p.json but does not bundle the libraries themselves. It imports into any
 * host that already has Branching Scenario installed (an LMS with H5P, Lumi
 * via the H5P Hub). Targets H5P.BranchingScenario 1.x semantics.
 */

import { compileInk, escapeHtml } from './storyExport.js'
import { parseCompiledInk, type InkGraph, type InkGraphKnot } from './inkGraph.js'
import { zipStore } from './zip.js'

export { bytesToBase64 } from './zip.js'

// ─── State detection ─────────────────────────────────────────────────────────

export interface StateConstruct {
  /** 1-based line number in the Ink source. */
  line: number
  /** What kind of state was found (for user-facing messages). */
  kind: 'variable declaration' | 'variable assignment' | 'conditional logic'
  /** The offending line, trimmed. */
  snippet: string
}

/**
 * Scan Ink source for constructs Branching Scenario cannot represent:
 * VAR declarations, ~ assignments/expressions, and any { ... } logic
 * (conditional blocks, inline conditionals, alternatives, choice conditions).
 * Tag lines (# ...) are ignored.
 */
export function findStateConstructs(source: string): StateConstruct[] {
  const issues: StateConstruct[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue
    const push = (kind: StateConstruct['kind']) =>
      issues.push({ line: i + 1, kind, snippet: trimmed.slice(0, 80) })
    if (/^VAR\s+\w+\s*=/.test(trimmed)) {
      push('variable declaration')
    } else if (trimmed.startsWith('~')) {
      push('variable assignment')
    } else if (/[{}]/.test(trimmed)) {
      push('conditional logic')
    }
  }
  return issues
}

/** One-line human summary of why a story can't convert, for error messages. */
export function describeStateConstructs(
  issues: StateConstruct[],
  target = 'H5P Branching Scenario'
): string {
  const shown = issues
    .slice(0, 5)
    .map((c) => `  line ${c.line} (${c.kind}): ${c.snippet}`)
    .join('\n')
  const more = issues.length > 5 ? `\n  …and ${issues.length - 5} more` : ''
  return (
    `This story uses state that ${target} cannot represent:\n${shown}${more}\n` +
    `Regenerate the story with "H5P / LMS compatible" enabled to get a convertible version.`
  )
}

// ─── Ink graph → Branching Scenario content ──────────────────────────────────

/** Divert targets that mean "the story ends here". */
const END_TARGETS = new Set(['END', 'DONE'])

/** The passage prose for a knot, as escaped HTML, plus any resolved image. */
function passageHtml(knot: InkGraphKnot, sceneImages?: Record<string, string>): string {
  const paragraphs = knot.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`)

  const image = resolvedImage(knot, sceneImages)
  if (image) {
    paragraphs.unshift(
      `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" style="max-width:100%">`
    )
  }

  return paragraphs.join('\n') || '<p></p>'
}

/**
 * Pick the image for a knot. `# IMAGE:` must already be a data URL or an
 * absolute http(s) URL (H5P has no access to the project's filesystem);
 * `# IMAGE_PROMPT:` resolves through the generated scene-image map.
 */
function resolvedImage(
  knot: InkGraphKnot,
  sceneImages?: Record<string, string>
): { src: string; alt: string } | null {
  if (knot.imagePrompt && sceneImages?.[knot.imagePrompt]) {
    return { src: sceneImages[knot.imagePrompt], alt: knot.imagePrompt }
  }
  if (knot.imagePath && /^(data:|https?:)/.test(knot.imagePath)) {
    return { src: knot.imagePath, alt: knot.id.replace(/_/g, ' ') }
  }
  return null
}

/** Deterministic uuid-shaped subContentId (H5P requires the uuid format). */
function subContentId(n: number): string {
  const hex = n.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

interface BranchingAlternative {
  text: string
  nextContentId: number
  addFeedback: boolean
  feedback: { title: string; subtitle: string }
}

/**
 * Build the Branching Scenario content.json object from a compiled story.
 * Throws if the source uses state (variables/conditionals).
 */
export function toBranchingScenarioContentFromCompiled(
  compiledJson: string | object,
  title: string,
  sceneImages?: Record<string, string>
): object {
  const graph: InkGraph = parseCompiledInk(compiledJson)
  return graphToContent(graph, title, sceneImages)
}

/**
 * Compile, gate, and build the Branching Scenario content object.
 * Throws with a construct-by-construct explanation if the story uses state.
 */
export async function toBranchingScenarioContent(
  source: string,
  title: string,
  sceneImages?: Record<string, string>
): Promise<object> {
  const issues = findStateConstructs(source)
  if (issues.length > 0) throw new Error(describeStateConstructs(issues))

  const compiled = await compileInk(source)
  return toBranchingScenarioContentFromCompiled(compiled, title, sceneImages)
}

function graphToContent(
  graph: InkGraph,
  title: string,
  sceneImages?: Record<string, string>
): object {
  if (graph.knots.length === 0) {
    throw new Error('No knots found in the Ink source — nothing to export.')
  }

  // Order knots start-first: content[0] is where Branching Scenario begins.
  const startId =
    graph.start && graph.knots.some((k) => k.id === graph.start)
      ? graph.start
      : graph.knots[0].id
  const knots = [
    ...graph.knots.filter((k) => k.id === startId),
    ...graph.knots.filter((k) => k.id !== startId)
  ]

  const idOf = new Map<string, number>()
  knots.forEach((k, i) => idOf.set(k.id, i))
  const resolve = (target: string): number => {
    if (!target || END_TARGETS.has(target)) return -1
    return idOf.get(target) ?? -1
  }

  const content = knots.map((knot, i) => {
    const common = {
      contentBehaviour: 'useBehavioural',
      forceContentFinished: 'useBehavioural',
      showContentTitle: false,
      feedback: { subtitle: '' },
      contentId: i
    }
    if (knot.choices.length > 0) {
      const alternatives: BranchingAlternative[] = knot.choices.map((c) => ({
        text: escapeHtml(c.text),
        nextContentId: resolve(c.target),
        addFeedback: false,
        feedback: { title: '', subtitle: '' }
      }))
      return {
        ...common,
        type: {
          library: 'H5P.BranchingQuestion 1.0',
          params: { branchingQuestion: { question: passageHtml(knot, sceneImages), alternatives } },
          subContentId: subContentId(i),
          metadata: {
            contentType: 'Branching Question',
            license: 'U',
            title: knot.id.replace(/_/g, ' ')
          }
        },
        nextContentId: -1
      }
    }
    return {
      ...common,
      type: {
        library: 'H5P.AdvancedText 1.1',
        params: { text: passageHtml(knot, sceneImages) },
        subContentId: subContentId(i),
        metadata: { contentType: 'Text', license: 'U', title: knot.id.replace(/_/g, ' ') }
      },
      nextContentId: resolve(knot.nextTarget ?? '')
    }
  })

  return {
    branchingScenario: {
      content,
      startScreen: { startScreenTitle: title, startScreenSubtitle: '' },
      endScreens: [
        { endScreenTitle: 'The End', endScreenSubtitle: '', contentId: -1, endScreenScore: 0 }
      ],
      scoringOptionGroup: { scoringOption: 'no-score', includeInteractionsScores: false },
      behaviour: {
        enableBackwardsNavigation: false,
        forceContentFinished: false,
        randomizeBranchingQuestions: false
      },
      l10n: {
        startScreenButtonText: 'Start',
        endScreenButtonText: 'Restart',
        backButtonText: 'Back',
        disableProceedButtonText: 'Require to complete the current module',
        replayButtonText: 'Replay',
        scoreText: 'Your score:',
        fullscreenAria: 'Fullscreen'
      }
    }
  }
}

/** The h5p.json package manifest (content-only: dependencies declared, not bundled). */
function h5pManifest(title: string): object {
  return {
    title,
    language: 'und',
    defaultLanguage: 'en',
    mainLibrary: 'H5P.BranchingScenario',
    embedTypes: ['iframe'],
    license: 'U',
    preloadedDependencies: [
      { machineName: 'H5P.BranchingScenario', majorVersion: '1', minorVersion: '8' },
      { machineName: 'H5P.AdvancedText', majorVersion: '1', minorVersion: '1' },
      { machineName: 'H5P.BranchingQuestion', majorVersion: '1', minorVersion: '0' }
    ]
  }
}

/** Assemble the .h5p zip from an already-built content object. */
function h5pZip(content: object, title: string): Uint8Array {
  return zipStore([
    { name: 'h5p.json', data: JSON.stringify(h5pManifest(title)) },
    { name: 'content/content.json', data: JSON.stringify(content) }
  ])
}

/**
 * Convert a pure-branching Ink story to a .h5p package (zip bytes).
 * Throws with a construct-by-construct explanation if the story uses state.
 */
export async function exportH5P(
  inkSource: string,
  title: string,
  sceneImages?: Record<string, string>
): Promise<Uint8Array> {
  return h5pZip(await toBranchingScenarioContent(inkSource, title, sceneImages), title)
}

/** Same as `exportH5P` when the caller already has the compiled JSON. */
export function exportH5PFromCompiled(
  compiledJson: string | object,
  title: string,
  sceneImages?: Record<string, string>
): Uint8Array {
  return h5pZip(toBranchingScenarioContentFromCompiled(compiledJson, title, sceneImages), title)
}
