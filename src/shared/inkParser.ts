/**
 * Parse Ink source into structured data for the node editor and other consumers.
 */

export interface InkKnot {
  id: string
  title: string
  content: string
  rawContent: string
  startLine: number
  endLine: number
  choices: InkChoice[]
  /** A plain top-level divert at the end of the knot (linear link), if any. */
  nextTarget: string | null
  tags: string[]
  timerSeconds: number
  imagePath: string | null
  /** Visual description from a `# IMAGE_PROMPT:` tag — resolved to an image via the scene-image pipeline. */
  imagePrompt: string | null
  endingType: string | null
  variableAssignments: { variable: string; expression: string }[]
}

export interface InkChoice {
  text: string
  target: string
  condition: string | null
  isSticky: boolean
}

export interface InkVariable {
  name: string
  type: 'string' | 'number' | 'boolean'
  initialValue: string | number | boolean
  line: number
}

export interface ParsedInk {
  knots: InkKnot[]
  variables: InkVariable[]
  topLevelDivert: string | null
}

export function parseInkSource(source: string): ParsedInk {
  const lines = source.split('\n')
  const variables: InkVariable[] = []
  let topLevelDivert: string | null = null
  const knots: InkKnot[] = []

  // First pass: find variables and top-level divert
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Variable declarations
    const varMatch = line.match(/^VAR\s+(\w+)\s*=\s*(.+)$/)
    if (varMatch) {
      const [, name, rawValue] = varMatch
      const value = rawValue.trim()
      let type: 'string' | 'number' | 'boolean' = 'string'
      let initialValue: string | number | boolean = value

      if (value === 'true' || value === 'false') {
        type = 'boolean'
        initialValue = value === 'true'
      } else if (/^-?\d+(\.\d+)?$/.test(value)) {
        type = 'number'
        initialValue = parseFloat(value)
      } else if (value.startsWith('"') && value.endsWith('"')) {
        type = 'string'
        initialValue = value.slice(1, -1)
      }

      variables.push({ name, type, initialValue, line: i })
      continue
    }

    // Top-level divert (before first knot)
    const divertMatch = line.match(/^->\s*(\w+)\s*$/)
    if (divertMatch && !knots.length) {
      topLevelDivert = divertMatch[1]
      continue
    }

    // Knot declaration
    const knotMatch = line.match(/^===\s*(\w+)\s*===?\s*$/)
    if (knotMatch) {
      knots.push({
        id: knotMatch[1],
        title: knotMatch[1].replace(/_/g, ' '),
        content: '',
        rawContent: '',
        startLine: i,
        endLine: lines.length - 1, // will be adjusted
        choices: [],
        nextTarget: null,
        tags: [],
        timerSeconds: 0,
        imagePath: null,
        imagePrompt: null,
        endingType: null,
        variableAssignments: []
      })
    }
  }

  // Second pass: parse content within each knot
  for (let k = 0; k < knots.length; k++) {
    const knot = knots[k]
    const nextKnotStart = k + 1 < knots.length ? knots[k + 1].startLine : lines.length
    knot.endLine = nextKnotStart - 1

    const knotLines = lines.slice(knot.startLine + 1, nextKnotStart)
    knot.rawContent = knotLines.join('\n')

    const contentLines: string[] = []

    for (const line of knotLines) {
      const trimmed = line.trim()

      // Tags
      if (trimmed.startsWith('#')) {
        const tagContent = trimmed.substring(1).trim()
        knot.tags.push(tagContent)

        // Special tags
        const timerMatch = tagContent.match(/^TIMER:\s*(\d+)/)
        if (timerMatch) {
          knot.timerSeconds = parseInt(timerMatch[1])
        }

        const imageMatch = tagContent.match(/^IMAGE:\s*(.+)/)
        if (imageMatch) {
          knot.imagePath = imageMatch[1].trim()
        }

        const imagePromptMatch = tagContent.match(/^IMAGE_PROMPT:\s*(.+)/)
        if (imagePromptMatch) {
          knot.imagePrompt = imagePromptMatch[1].trim()
        }

        const endingMatch = tagContent.match(/^ENDING:\s*(.+)/)
        if (endingMatch) {
          knot.endingType = endingMatch[1].trim()
        }
        continue
      }

      // Choices
      const choiceMatch = trimmed.match(/^([*+])\s*(?:\{([^}]+)\}\s*)?\[([^\]]*)\]/)
      if (choiceMatch) {
        const isSticky = choiceMatch[1] === '+'
        const condition = choiceMatch[2] || null
        const text = choiceMatch[3]

        // Find divert target in the choice block
        let target = ''
        const divertInLine = trimmed.match(/->\s*(\w+)/)
        if (divertInLine) {
          target = divertInLine[1]
        } else {
          // Check subsequent lines for the divert
          const lineIdx = knotLines.indexOf(line)
          for (let j = lineIdx + 1; j < knotLines.length; j++) {
            const nextLine = knotLines[j].trim()
            if (nextLine.startsWith('*') || nextLine.startsWith('+') || nextLine.startsWith('===')) break
            const d = nextLine.match(/^->\s*(\w+)/)
            if (d) {
              target = d[1]
              break
            }
          }
        }

        knot.choices.push({ text, target, condition, isSticky })
        continue
      }

      // Variable assignments
      const assignMatch = trimmed.match(/^~\s*(\w+)\s*=\s*(.+)$/)
      if (assignMatch) {
        knot.variableAssignments.push({
          variable: assignMatch[1],
          expression: assignMatch[2].trim()
        })
        continue
      }

      // Plain top-level divert (a linear link). Indented diverts belong to
      // choice blocks and are captured by the choice handling above.
      if (!/^\s/.test(line)) {
        const nextDivert = trimmed.match(/^->\s*(\w+)\s*$/)
        if (nextDivert) {
          if (knot.nextTarget === null) knot.nextTarget = nextDivert[1]
          continue
        }
      }

      // Regular content
      if (trimmed && !trimmed.startsWith('->') && !trimmed.startsWith('=')) {
        contentLines.push(trimmed)
      }
    }

    knot.content = contentLines.join('\n')
  }

  return { knots, variables, topLevelDivert }
}

/**
 * Update a single knot's text content in the Ink source.
 */
export function updateKnotContent(
  source: string,
  knotId: string,
  newRawContent: string
): string {
  const lines = source.split('\n')
  const parsed = parseInkSource(source)
  const knot = parsed.knots.find((k) => k.id === knotId)
  if (!knot) return source

  const before = lines.slice(0, knot.startLine + 1)
  const after = lines.slice(knot.endLine + 1)

  return [...before, newRawContent, ...after].join('\n')
}

/**
 * Add a new knot to the Ink source.
 */
export function addKnot(source: string, knotId: string, title?: string): string {
  const displayTitle = title || knotId.replace(/_/g, ' ')
  const newKnot = `\n=== ${knotId} ===\n${displayTitle}.\n* [Continue]\n    -> END\n`
  return source.trimEnd() + '\n' + newKnot
}

export interface ConnectKnotsResult {
  source: string
  error?: string
}

/**
 * Connect two knots in the Ink source.
 *
 * - A knot with choices gets a new choice pointing at `toId`.
 * - A knot with a single linear divert has that divert retargeted.
 * - A knot with no flow control gets a linear divert appended.
 *
 * A knot with several top-level diverts is ambiguous; the caller gets an error
 * rather than a silently unreachable choice.
 */
export function connectKnots(
  source: string,
  fromId: string,
  toId: string,
  choiceText = 'Continue'
): ConnectKnotsResult {
  const parsed = parseInkSource(source)
  const from = parsed.knots.find((k) => k.id === fromId)
  const to = parsed.knots.find((k) => k.id === toId)
  if (!from) return { source, error: `Unknown passage: ${fromId}` }
  if (!to) return { source, error: `Unknown passage: ${toId}` }
  if (fromId === toId) return { source, error: 'A passage cannot connect to itself.' }
  if (from.choices.some((c) => c.target === toId)) return { source }

  const lines = source.split('\n')
  const bodyStart = from.startLine + 1
  const bodyEnd = from.endLine
  const body = lines.slice(bodyStart, bodyEnd + 1)

  // Walk the knot body: record top-level diverts and where the last choice
  // block ends (choices plus their indented result/divert lines).
  const topDiverts: number[] = []
  let inChoiceBlock = false
  let lastChoiceEnd = -1
  for (let i = 0; i < body.length; i++) {
    const line = body[i]
    const trimmed = line.trim()
    const indented = /^\s/.test(line)
    if (/^[*+]\s/.test(trimmed)) {
      inChoiceBlock = true
      lastChoiceEnd = i
      continue
    }
    if (inChoiceBlock) {
      if (!trimmed || indented) {
        lastChoiceEnd = i
        continue
      }
      inChoiceBlock = false
    }
    if (!indented && /^->\s*\w+/.test(trimmed)) topDiverts.push(i)
  }

  const spliceBody = (newBody: string[]): string =>
    [...lines.slice(0, bodyStart), ...newBody, ...lines.slice(bodyEnd + 1)].join('\n')

  if (from.choices.length === 0) {
    if (topDiverts.length === 1) {
      const idx = topDiverts[0]
      const current = body[idx].trim().match(/^->\s*(\w+)/)?.[1]
      if (current === toId) return { source }
      body[idx] = `-> ${toId}`
      return { source: spliceBody(body) }
    }
    if (topDiverts.length > 1) {
      return {
        source,
        error: 'This passage already has several linear diverts; add a choice manually instead.'
      }
    }
    body.push(`-> ${toId}`)
    return { source: spliceBody(body) }
  }

  // Insert after the last choice block so the new choice stays reachable and
  // ahead of any trailing top-level END/DONE divert.
  const insertAt = lastChoiceEnd >= 0 ? lastChoiceEnd + 1 : body.length
  body.splice(insertAt, 0, `* [${choiceText}] -> ${toId}`)
  return { source: spliceBody(body) }
}

/**
 * Remove a knot from the Ink source.
 */
export function removeKnot(source: string, knotId: string): string {
  const parsed = parseInkSource(source)
  const knot = parsed.knots.find((k) => k.id === knotId)
  if (!knot) return source

  const lines = source.split('\n')
  const before = lines.slice(0, knot.startLine)
  const after = lines.slice(knot.endLine + 1)

  // Also update the top-level divert if it pointed to this knot
  let result = [...before, ...after].join('\n')
  if (parsed.topLevelDivert === knotId && parsed.knots.length > 1) {
    const nextKnot = parsed.knots.find((k) => k.id !== knotId)
    if (nextKnot) {
      result = result.replace(
        new RegExp(`^->\\s*${knotId}\\s*$`, 'm'),
        `-> ${nextKnot.id}`
      )
    }
  }

  return result
}
