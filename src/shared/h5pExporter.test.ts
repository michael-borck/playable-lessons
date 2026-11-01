import { describe, it, expect } from 'vitest'
import {
  findStateConstructs,
  toBranchingScenarioContent,
  exportH5P,
  bytesToBase64
} from './h5pExporter'

const BRANCHING_INK = `-> start
=== start ===
You arrive at the crossroads.
A sign points in two directions.
* [Take the forest path] -> forest
* [Take the mountain path] -> mountain
=== forest ===
The forest is quiet.
-> ending
=== mountain ===
The climb is hard but the view is worth it.
# ENDING: good
-> END
=== ending ===
You made it through.
# ENDING: neutral
-> END
`

const STATEFUL_INK = `VAR trust = 0
-> start
=== start ===
Hello.
~ trust = trust + 1
{ trust > 0: You feel welcome. }
* [Go on] -> DONE
`

describe('findStateConstructs', () => {
  it('returns nothing for a pure branching story', () => {
    expect(findStateConstructs(BRANCHING_INK)).toEqual([])
  })

  it('flags VAR declarations, assignments, and conditional logic with line numbers', () => {
    const issues = findStateConstructs(STATEFUL_INK)
    const kinds = issues.map((i) => i.kind)
    expect(kinds).toContain('variable declaration')
    expect(kinds).toContain('variable assignment')
    expect(kinds).toContain('conditional logic')
    expect(issues[0].line).toBe(1)
  })

  it('ignores tag and comment lines', () => {
    expect(findStateConstructs('# TIMER: 15\n// a comment { not logic }\nProse.')).toEqual([])
  })
})

describe('toBranchingScenarioContent', () => {
  async function content() {
    return (await toBranchingScenarioContent(BRANCHING_INK, 'Crossroads')) as {
      branchingScenario: {
        content: {
          contentId: number
          nextContentId: number
          type: { library: string; params: Record<string, unknown> }
        }[]
        startScreen: { startScreenTitle: string }
      }
    }
  }

  it('puts the start knot first and titles the start screen', async () => {
    const c = await content()
    expect(c.branchingScenario.startScreen.startScreenTitle).toBe('Crossroads')
    expect(c.branchingScenario.content[0].type.library).toBe('H5P.BranchingQuestion 1.0')
  })

  it('maps choice knots to branching questions with resolved targets', async () => {
    const items = (await content()).branchingScenario.content
    const q = items[0].type.params as {
      branchingQuestion: { question: string; alternatives: { text: string; nextContentId: number }[] }
    }
    expect(q.branchingQuestion.question).toContain('You arrive at the crossroads.')
    expect(q.branchingQuestion.alternatives).toHaveLength(2)
    const forest = items.findIndex((i) => JSON.stringify(i).includes('The forest is quiet.'))
    expect(q.branchingQuestion.alternatives[0]).toMatchObject({
      text: 'Take the forest path',
      nextContentId: forest
    })
  })

  it('maps linear knots to text screens following their divert', async () => {
    const items = (await content()).branchingScenario.content
    const forest = items.find((i) => JSON.stringify(i).includes('The forest is quiet.'))!
    const ending = items.findIndex((i) => JSON.stringify(i).includes('You made it through.'))
    expect(forest.type.library).toBe('H5P.AdvancedText 1.1')
    expect(forest.nextContentId).toBe(ending)
  })

  it('routes END diverts to the default end screen (-1)', async () => {
    const items = (await content()).branchingScenario.content
    const mountain = items.find((i) => JSON.stringify(i).includes('The climb is hard'))!
    expect(mountain.nextContentId).toBe(-1)
  })

  it('refuses a stateful story with a construct-by-construct message', async () => {
    await expect(toBranchingScenarioContent(STATEFUL_INK, 'X')).rejects.toThrow(
      /H5P Branching Scenario cannot represent/
    )
    await expect(toBranchingScenarioContent(STATEFUL_INK, 'X')).rejects.toThrow(/line 1/)
  })
})

describe('exportH5P', () => {
  it('produces a valid zip containing h5p.json and content/content.json', async () => {
    const bytes = await exportH5P(BRANCHING_INK, 'Crossroads')
    // Zip local-file-header magic
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text).toContain('h5p.json')
    expect(text).toContain('content/content.json')
    expect(text).toContain('H5P.BranchingScenario')
  })

  it('is deterministic (same input, byte-identical output)', async () => {
    const a = await exportH5P(BRANCHING_INK, 'T')
    const b = await exportH5P(BRANCHING_INK, 'T')
    expect(bytesToBase64(a)).toBe(bytesToBase64(b))
  })

  it('throws on a stateful story', async () => {
    await expect(exportH5P(STATEFUL_INK, 'X')).rejects.toThrow(/cannot represent/)
  })
})

describe('H5P content safety', () => {
  it('escapes choice text so AI output cannot inject HTML', async () => {
    const ink = '-> start\n=== start ===\nHi.\n* [<script>alert(1)</script>] -> END\n'
    const text = new TextDecoder('latin1').decode(await exportH5P(ink, 'T'))
    expect(text).not.toContain('<script>alert(1)</script>')
    expect(text).toContain('&lt;script&gt;')
  })

  it('embeds resolved scene images with alt text', async () => {
    const ink = '-> start\n=== start ===\n# IMAGE_PROMPT: a lighthouse\nHi.\n-> END\n'
    const text = new TextDecoder('latin1').decode(
      await exportH5P(ink, 'T', { 'a lighthouse': 'data:image/png;base64,AAA' })
    )
    expect(text).toContain('data:image/png;base64,AAA')
    expect(text).toContain('alt=\\"a lighthouse\\"')
  })
})

describe('bytesToBase64', () => {
  it('round-trips bytes through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252])
    expect(Buffer.from(bytesToBase64(bytes), 'base64')).toEqual(Buffer.from(bytes))
  })
})
