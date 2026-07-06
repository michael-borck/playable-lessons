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
 * The package is "content-only": it declares its library dependencies in
 * h5p.json but does not bundle the libraries themselves. It imports into any
 * host that already has Branching Scenario installed (an LMS with H5P, Lumi
 * via the H5P Hub). Targets H5P.BranchingScenario 1.x semantics.
 */

import { parseInkSource, type InkKnot, type ParsedInk } from './inkParser.js'
import { escapeHtml } from './storyExport.js'

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
export function describeStateConstructs(issues: StateConstruct[]): string {
  const shown = issues
    .slice(0, 5)
    .map((c) => `  line ${c.line} (${c.kind}): ${c.snippet}`)
    .join('\n')
  const more = issues.length > 5 ? `\n  …and ${issues.length - 5} more` : ''
  return (
    `This story uses state that H5P Branching Scenario cannot represent:\n${shown}${more}\n` +
    `Regenerate the story with "H5P / LMS compatible" enabled to get a convertible version.`
  )
}

// ─── Ink graph → Branching Scenario content ──────────────────────────────────

/** Divert targets that mean "the story ends here". */
const END_TARGETS = new Set(['END', 'DONE'])

/**
 * The passage prose shown for a knot: lines up to the first choice, minus
 * structural lines (tags, diverts, stitch markers). Returned as escaped HTML
 * paragraphs.
 */
function passageHtml(knot: InkKnot): string {
  const paragraphs: string[] = []
  for (const raw of knot.rawContent.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('*') || line.startsWith('+')) break // choices begin
    if (line.startsWith('#') || line.startsWith('->') || line.startsWith('=')) continue
    paragraphs.push(`<p>${escapeHtml(line)}</p>`)
  }
  return paragraphs.join('\n') || '<p></p>'
}

/** The knot's plain divert target (first `-> target` outside a choice), if any. */
function plainDivertTarget(knot: InkKnot): string | null {
  for (const raw of knot.rawContent.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('*') || line.startsWith('+')) break // choice diverts don't count
    const m = line.match(/^->\s*(\w+)/)
    if (m) return m[1]
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
 * Build the Branching Scenario content.json object from Ink source.
 * Throws if the story uses state (variables/conditionals).
 *
 * Mapping: each knot becomes one screen. A knot with choices becomes a
 * Branching Question (passage prose as the question, choices as alternatives);
 * a knot without choices becomes a text screen whose "proceed" follows the
 * knot's divert. Diverts to END/DONE (or nowhere) go to the end screen (-1).
 */
export function toBranchingScenarioContent(source: string, title: string): object {
  const issues = findStateConstructs(source)
  if (issues.length > 0) {
    throw new Error(describeStateConstructs(issues))
  }

  const parsed: ParsedInk = parseInkSource(source)
  if (parsed.knots.length === 0) {
    throw new Error('No knots found in the Ink source — nothing to export.')
  }

  // Order knots start-first: content[0] is where Branching Scenario begins.
  const startId = parsed.topLevelDivert && parsed.knots.some((k) => k.id === parsed.topLevelDivert)
    ? parsed.topLevelDivert
    : parsed.knots[0].id
  const knots = [
    ...parsed.knots.filter((k) => k.id === startId),
    ...parsed.knots.filter((k) => k.id !== startId)
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
        text: c.text,
        nextContentId: resolve(c.target),
        addFeedback: false,
        feedback: { title: '', subtitle: '' }
      }))
      return {
        ...common,
        type: {
          library: 'H5P.BranchingQuestion 1.0',
          params: { branchingQuestion: { question: passageHtml(knot), alternatives } },
          subContentId: subContentId(i),
          metadata: { contentType: 'Branching Question', license: 'U', title: knot.title }
        },
        nextContentId: -1
      }
    }
    return {
      ...common,
      type: {
        library: 'H5P.AdvancedText 1.1',
        params: { text: passageHtml(knot) },
        subContentId: subContentId(i),
        metadata: { contentType: 'Text', license: 'U', title: knot.title }
      },
      nextContentId: resolve(plainDivertTarget(knot) ?? '')
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

// ─── Minimal ZIP writer (store method, no compression) ───────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// Fixed DOS timestamp (2026-01-01 00:00) keeps output byte-identical across runs.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1
const DOS_TIME = 0

/** Assemble a store-only (uncompressed) zip from named UTF-8 entries. */
function zipStore(entries: { name: string; text: string }[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff])
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])
  const cat = (...parts: Uint8Array[]) => {
    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let pos = 0
    for (const p of parts) {
      out.set(p, pos)
      pos += p.length
    }
    return out
  }

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const data = encoder.encode(entry.text)
    const crc = crc32(data)
    // Local file header: flag bit 11 set = UTF-8 names; method 0 = store.
    const local = cat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0),
      u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0),
      name, data
    )
    central.push(
      cat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(DOS_TIME), u16(DOS_DATE),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset),
        name
      )
    )
    chunks.push(local)
    offset += local.length
  }

  const centralBlob = cat(...central)
  const eocd = cat(
    u32(0x06054b50), u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(centralBlob.length), u32(offset),
    u16(0)
  )
  return cat(...chunks, centralBlob, eocd)
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Convert a pure-branching Ink story to a .h5p package (zip bytes).
 * Throws with a construct-by-construct explanation if the story uses state.
 */
export function exportH5P(inkSource: string, title: string): Uint8Array {
  const content = toBranchingScenarioContent(inkSource, title)
  return zipStore([
    { name: 'h5p.json', text: JSON.stringify(h5pManifest(title)) },
    { name: 'content/content.json', text: JSON.stringify(content) }
  ])
}

/** Base64-encode package bytes (works in both Node and the browser). */
export function bytesToBase64(bytes: Uint8Array): string {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(e: string): string } } }).Buffer
  if (B) return B.from(bytes).toString('base64')
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
