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
  tags: string[]
  timerSeconds: number
  imagePath: string | null
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
        tags: [],
        timerSeconds: 0,
        imagePath: null,
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
