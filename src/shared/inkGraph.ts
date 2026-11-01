/**
 * Read the story graph out of inkjs's compiled JSON instead of re-parsing the
 * generated source with regular expressions.
 *
 * The compiled form is the runtime's own canonical representation, so choice
 * text, divert targets, and tag placement are exactly what the player will
 * see — no drifting from Ink's escaping/indentation rules.
 *
 * Scope: the exporters that use this (H5P, Twee, EPUB) only accept flat
 * branching stories (see `findStateConstructs`). The reader extracts each
 * knot's intro prose, its first-level choices, its plain divert, and its tags.
 *
 * Container wire format (inkjs `JsonSerialisation`):
 *   [ ...contentItems, namedContentObjectOrNull ]
 * Content items are `"^text"`, `"\n"`, control strings (`ev`, `str`, `end`, …),
 * objects (`{"->": target}`, `{"*": path}`, `{"#": tag}`), or nested arrays.
 */

export interface InkGraphChoice {
  text: string
  /** Divert target; empty when the choice ends the story. */
  target: string
}

export interface InkGraphKnot {
  id: string
  /** Intro prose lines, before the first choice. */
  paragraphs: string[]
  tags: string[]
  choices: InkGraphChoice[]
  /** Plain divert outside a choice (`null` = end of story). */
  nextTarget: string | null
  imagePath: string | null
  imagePrompt: string | null
  endingType: string | null
}

export interface InkGraph {
  /** Top-level `-> knot` target, if any. */
  start: string | null
  knots: InkGraphKnot[]
}

interface SplitContainer {
  content: unknown[]
  named: Record<string, unknown> | null
}

function splitContainer(arr: unknown[]): SplitContainer {
  const content = arr.slice(0, -1)
  const last = arr[arr.length - 1]
  const named =
    last && typeof last === 'object' && !Array.isArray(last)
      ? (last as Record<string, unknown>)
      : null
  return { content, named }
}

/** Resolve a relative choice-body path (`".^.c-0"`) against a container's named content. */
function namedTarget(named: Record<string, unknown> | null, relPath: string): unknown[] | null {
  const parts = String(relPath)
    .split('.')
    .filter((p) => p && p !== '^')
  let obj = named
  for (let i = 0; i < parts.length - 1; i++) {
    const next = obj ? obj[parts[i]] : null
    if (!Array.isArray(next)) return null
    obj = splitContainer(next).named
  }
  const found = parts.length > 0 && obj ? obj[parts[parts.length - 1]] : null
  return Array.isArray(found) ? found : null
}

/** First divert target anywhere in a container's content (choice bodies included). */
function firstDivert(container: unknown[]): string | null {
  const { content } = splitContainer(container)
  for (const item of content) {
    if (Array.isArray(item)) {
      const nested = firstDivert(item)
      if (nested) return nested
    } else if (item && typeof item === 'object' && '->' in item) {
      const target = (item as { '->'?: unknown })['->']
      if (typeof target === 'string') return target
    }
  }
  return null
}

/** First divert in a container, not descending into named content. */
function firstDivertInContent(items: unknown[]): string | null {
  for (const item of items) {
    if (Array.isArray(item)) {
      const nested = firstDivert(item)
      if (nested) return nested
    } else if (item && typeof item === 'object' && '->' in item) {
      const target = (item as { '->'?: unknown })['->']
      if (typeof target === 'string') return target
    }
  }
  return null
}

function collectKnot(id: string, container: unknown[]): InkGraphKnot {
  const paragraphs: string[] = []
  const tags: string[] = []
  const choices: InkGraphChoice[] = []
  let nextTarget: string | null = null
  let prose = ''
  let choiceText: string | null = null
  let tagMode = false
  let firstChoiceSeen = false

  const walk = (items: unknown[], namedHere: Record<string, unknown> | null): void => {
    for (const item of items) {
      if (typeof item === 'string') {
        if (item === 'str') {
          choiceText = ''
        } else if (item === '/str' || item === 'ev' || item === '/ev') {
          // Choice text stays buffered until the choice point consumes it.
        } else if (item === '#') {
          tagMode = true
        } else if (item === '/#') {
          tagMode = false
        } else if (item === 'done' || item === 'end') {
          // Story terminator; nothing to record.
        } else if (item.startsWith('^')) {
          const text = item.slice(1)
          // Tags on a choice body belong to that branch, not the knot.
          if (tagMode) {
            if (!firstChoiceSeen) tags.push(text)
          } else if (choiceText !== null) choiceText += text
          else if (!firstChoiceSeen) prose += text
        } else if (item === '\n') {
          if (choiceText === null && !firstChoiceSeen) prose += '\n'
        }
      } else if (Array.isArray(item)) {
        const inner = splitContainer(item)
        walk(inner.content, inner.named)
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if (typeof obj['*'] === 'string') {
          firstChoiceSeen = true
          const body = namedTarget(namedHere, obj['*'])
          choices.push({ text: (choiceText ?? '').trim(), target: (body && firstDivert(body)) || '' })
          choiceText = null
        } else if (typeof obj['->'] === 'string') {
          if (!firstChoiceSeen && nextTarget === null) nextTarget = obj['->']
        } else if (typeof obj['#'] === 'string') {
          if (!firstChoiceSeen) tags.push(obj['#'])
        }
      }
    }
  }

  const root = splitContainer(container)
  walk(root.content, root.named)

  for (const line of prose.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) paragraphs.push(trimmed)
  }

  const tagValue = (prefix: string): string | null => {
    const hit = tags.find((t) => t.startsWith(prefix))
    return hit ? hit.slice(prefix.length).trim() || null : null
  }

  return {
    id,
    paragraphs,
    tags,
    choices,
    nextTarget,
    imagePath: tagValue('IMAGE:'),
    imagePrompt: tagValue('IMAGE_PROMPT:'),
    endingType: tagValue('ENDING:')
  }
}

/**
 * Parse a compiled Ink JSON string/object into the knot-level graph the
 * exporters need. Throws if the payload is not a compiled story.
 */
export function parseCompiledInk(json: string | unknown): InkGraph {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  if (!data || typeof data !== 'object' || !Array.isArray((data as { root?: unknown }).root)) {
    throw new Error('Not a compiled Ink story (missing root container)')
  }
  const root = splitContainer((data as { root: unknown[] }).root)
  const start = firstDivertInContent(root.content)

  const knots: InkGraphKnot[] = []
  for (const [id, container] of Object.entries(root.named ?? {})) {
    // `#f` and other flags are metadata, not knots.
    if (id.startsWith('#') || !Array.isArray(container)) continue
    knots.push(collectKnot(id, container))
  }

  if (knots.length === 0) {
    throw new Error('No knots found in the compiled story')
  }

  return { start, knots }
}
