import { describe, it, expect } from 'vitest'
import { exportToTwee3 } from './tweeExporter'

const BRANCHING_INK = `-> start
=== start ===
You arrive at the crossroads.
* [Take the forest path] -> forest
* [Take the mountain path] -> mountain
=== forest ===
The forest is quiet.
-> END
=== mountain ===
The climb is hard.
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

describe('exportToTwee3', () => {
  it('emits a Twee3 header and one passage per knot', async () => {
    const twee = await exportToTwee3(BRANCHING_INK, 'Crossroads')
    expect(twee).toContain(':: StoryData')
    expect(twee).toContain('"format":"Harlowe"')
    expect(twee).toContain(':: StoryTitle\nCrossroads')
    expect(twee).toContain(':: start')
    expect(twee).toContain(':: forest')
    expect(twee).toContain('[[Take the forest path->forest]]')
  })

  it('keeps the story title on one line', async () => {
    const twee = await exportToTwee3(BRANCHING_INK, 'Line\nBreak')
    expect(twee).toContain(':: StoryTitle\nLine Break')
  })

  it('adds a continue link for a linear knot', async () => {
    const ink = '-> start\n=== start ===\nOne.\n-> middle\n=== middle ===\nTwo.\n-> END\n'
    const twee = await exportToTwee3(ink, 'T')
    expect(twee).toContain('[[Continue->middle]]')
  })

  it('refuses a stateful story instead of emitting broken Harlowe', async () => {
    await expect(exportToTwee3(STATEFUL_INK, 'T')).rejects.toThrow(/cannot represent/)
  })

  it('refuses a story with no knots', async () => {
    await expect(exportToTwee3('Just prose.\n', 'T')).rejects.toThrow(/No knots/)
  })
})
