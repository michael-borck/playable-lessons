import { compileInk } from '../../../shared/storyExport'
import { parseCompiledInk } from '../../../shared/inkGraph'
import { findStateConstructs, describeStateConstructs } from '../../../shared/h5pExporter'

/**
 * Convert Ink source to Twee3 format compatible with Twinery.org and Tweego.
 *
 * Only pure-branching stories are convertible: Ink's variables, assignments,
 * and conditional text have no faithful Harlowe equivalent without writing a
 * full expression translator, and a half-translated story silently breaks in
 * Twine. `findStateConstructs` gates the export with a line-level explanation
 * instead (the same policy as the H5P exporter).
 *
 * The graph comes from the compiled Ink JSON, so choice text and targets are
 * exactly what the player executes.
 */
export async function exportToTwee3(inkSource: string, title?: string): Promise<string> {
  const issues = findStateConstructs(inkSource)
  if (issues.length > 0) throw new Error(describeStateConstructs(issues, 'Twine/Harlowe'))

  const graph = parseCompiledInk(await compileInk(inkSource))
  const ifid = generateUUID()
  const storyTitle = singleLine(title || 'Untitled Story')

  const nameOf = new Map(graph.knots.map((k) => [k.id, k.id]))
  const lines: string[] = []

  // StoryData passage (required by Twee3)
  lines.push(':: StoryData')
  lines.push(JSON.stringify({
    ifid,
    format: 'Harlowe',
    'format-version': '3.3.7',
    start: graph.start || graph.knots[0].id
  }))
  lines.push('')

  // StoryTitle passage
  lines.push(':: StoryTitle')
  lines.push(storyTitle)
  lines.push('')

  for (const knot of graph.knots) {
    const passageName = nameOf.get(knot.id) ?? knot.id
    const tags = knot.endingType ? [singleLine(knot.endingType).replace(/\s+/g, '_')] : []
    const tagStr = tags.length > 0 ? ` [${tags.join(' ')}]` : ''

    lines.push(`:: ${passageName}${tagStr}`)
    if (knot.paragraphs.length > 0) lines.push(knot.paragraphs.join('\n\n'))

    if (knot.choices.length > 0) {
      lines.push('')
      for (const choice of knot.choices) {
        const text = linkText(choice.text)
        const target = nameOf.get(choice.target) ?? choice.target
        lines.push(target ? `[[${text}->${target}]]` : text)
      }
    } else if (knot.nextTarget) {
      const target = nameOf.get(knot.nextTarget) ?? knot.nextTarget
      lines.push('')
      lines.push(`[[Continue->${target}]]`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

/** A passage-heading value must stay on one line. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/** Keep choice text from terminating the `[[text->target]]` link early. */
function linkText(text: string): string {
  return singleLine(text)
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/->/g, '\u2192')
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16).toUpperCase()
  })
}
