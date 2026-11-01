import { describe, it, expect } from 'vitest'
import { compileInk } from './storyExport'
import { parseCompiledInk } from './inkGraph'

const STORY = `-> start
=== start ===
You arrive.
Second line.
* [Forest] -> forest
* [Mountain] -> mountain
=== forest ===
The forest.
# IMAGE_PROMPT: trees at dawn
-> middle
=== mountain ===
The mountain.
# ENDING: good
-> END
=== middle ===
The middle.
-> END
`

describe('parseCompiledInk', () => {
  it('reads the start divert, knots, choice text, and targets from the compiled JSON', async () => {
    const graph = parseCompiledInk(await compileInk(STORY))
    expect(graph.start).toBe('start')
    expect(graph.knots.map((k) => k.id)).toEqual(['start', 'forest', 'mountain', 'middle'])

    const start = graph.knots.find((k) => k.id === 'start')!
    expect(start.paragraphs).toEqual(['You arrive.', 'Second line.'])
    expect(start.choices).toEqual([
      { text: 'Forest', target: 'forest' },
      { text: 'Mountain', target: 'mountain' }
    ])
    expect(start.nextTarget).toBeNull()
  })

  it('reads tags and plain diverts', async () => {
    const graph = parseCompiledInk(await compileInk(STORY))
    const forest = graph.knots.find((k) => k.id === 'forest')!
    expect(forest.imagePrompt).toBe('trees at dawn')
    expect(forest.nextTarget).toBe('middle')

    const mountain = graph.knots.find((k) => k.id === 'mountain')!
    expect(mountain.endingType).toBe('good')
    expect(mountain.nextTarget).toBeNull()
  })

  it('rejects a payload that is not a compiled story', () => {
    expect(() => parseCompiledInk('{}')).toThrow(/compiled Ink story/)
    expect(() => parseCompiledInk({ root: ['nope', null] })).toThrow(/No knots/)
  })
})
