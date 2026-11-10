import { describe, it, expect } from 'vitest'
import { parseInkSource, connectKnots } from './inkParser'

const SAMPLE = `VAR score = 0
VAR name = "Ada"
VAR passed = true

-> intro

=== intro ===
Welcome to the lesson.
# IMAGE: intro.png
# IMAGE_PROMPT: a sunlit classroom with empty desks
# TIMER: 30
* [Continue] -> chapter_one

=== chapter_one ===
The first chapter.
~ score = score + 1
+ {score > 0} [Proceed] -> ending

=== ending ===
The end.
# ENDING: good
`

describe('parseInkSource', () => {
  const parsed = parseInkSource(SAMPLE)

  it('detects the top-level divert', () => {
    expect(parsed.topLevelDivert).toBe('intro')
  })

  it('parses variables with inferred types', () => {
    const byName = Object.fromEntries(parsed.variables.map((v) => [v.name, v]))
    expect(byName.score).toMatchObject({ type: 'number', initialValue: 0 })
    expect(byName.name).toMatchObject({ type: 'string', initialValue: 'Ada' })
    expect(byName.passed).toMatchObject({ type: 'boolean', initialValue: true })
  })

  it('parses all knots', () => {
    expect(parsed.knots.map((k) => k.id)).toEqual(['intro', 'chapter_one', 'ending'])
  })

  it('extracts special tags (image, timer, ending)', () => {
    const intro = parsed.knots.find((k) => k.id === 'intro')!
    expect(intro.imagePath).toBe('intro.png')
    expect(intro.timerSeconds).toBe(30)
    const ending = parsed.knots.find((k) => k.id === 'ending')!
    expect(ending.endingType).toBe('good')
  })

  it('parses IMAGE_PROMPT tags into knot.imagePrompt', () => {
    const intro = parsed.knots.find((k) => k.id === 'intro')!
    expect(intro.imagePrompt).toBe('a sunlit classroom with empty desks')
    // Knots without the tag get null, not an empty string
    const ch1 = parsed.knots.find((k) => k.id === 'chapter_one')!
    expect(ch1.imagePrompt).toBeNull()
  })

  it('parses choices with targets, conditions, and stickiness', () => {
    const intro = parsed.knots.find((k) => k.id === 'intro')!
    expect(intro.choices[0]).toMatchObject({ text: 'Continue', target: 'chapter_one', isSticky: false })

    const ch1 = parsed.knots.find((k) => k.id === 'chapter_one')!
    expect(ch1.choices[0]).toMatchObject({ text: 'Proceed', target: 'ending', isSticky: true })
    expect(ch1.choices[0].condition).toContain('score > 0')
  })

  it('captures variable assignments', () => {
    const ch1 = parsed.knots.find((k) => k.id === 'chapter_one')!
    expect(ch1.variableAssignments[0]).toMatchObject({ variable: 'score' })
  })

  it('captures a plain top-level divert as nextTarget', () => {
    const linear = parseInkSource(`-> a\n=== a ===\nText.\n-> b\n=== b ===\nEnd.\n-> END\n`)
    expect(linear.knots[0].nextTarget).toBe('b')
    expect(linear.knots[0].choices).toHaveLength(0)
  })
})

describe('connectKnots', () => {
  const BASE = `-> a

=== a ===
Opening.
* [Go to B] -> b

=== b ===
Middle.
-> END

=== c ===
Other branch.
-> END
`

  it('adds a choice to a knot that already has choices', () => {
    const result = connectKnots(BASE, 'a', 'c', 'Take C')
    expect(result.error).toBeUndefined()
    const a = parseInkSource(result.source).knots.find((k) => k.id === 'a')!
    expect(a.choices.map((c) => c.target)).toEqual(['b', 'c'])
    expect(a.choices[1].text).toBe('Take C')
  })

  it('replaces a single linear divert', () => {
    const source = `-> a\n=== a ===\nOpening.\n-> b\n=== b ===\nB\n=== c ===\nC\n`
    const a = parseInkSource(connectKnots(source, 'a', 'c').source).knots.find((k) => k.id === 'a')!
    expect(a.choices).toHaveLength(0)
    expect(connectKnots(source, 'a', 'c').source).toContain('-> c')
    expect(connectKnots(source, 'a', 'c').source).not.toContain('-> b')
  })

  it('adds a linear divert when the knot has no flow control', () => {
    const source = `-> a\n=== a ===\nJust prose.\n=== b ===\nB\n`
    const result = connectKnots(source, 'a', 'b')
    expect(result.error).toBeUndefined()
    expect(parseInkSource(result.source).knots.find((k) => k.id === 'a')!.choices).toHaveLength(0)
    expect(result.source).toMatch(/=== a ===\nJust prose\.\n-> b/)
  })

  it('refuses to duplicate an existing choice', () => {
    const result = connectKnots(BASE, 'a', 'b')
    expect(result.error).toBeUndefined()
    expect(result.source).toBe(BASE)
  })

  it('refuses a self-connection', () => {
    expect(connectKnots(BASE, 'a', 'a').error).toMatch(/itself/i)
  })

  it('produces compilable Ink when adding a choice', async () => {
    const { compileInk } = await import('../../../shared/storyExport')
    const source = `-> a\n=== a ===\nOpening.\n* [B] -> b\n=== b ===\nB\n-> END\n=== c ===\nC\n-> END\n`
    const result = connectKnots(source, 'a', 'c')
    await expect(compileInk(result.source)).resolves.toBeTruthy()
  })

  it('refuses a passage with several linear diverts', () => {
    const source = `-> a\n=== a ===\nOpening.\n-> b\n-> c\n=== b ===\nB\n=== c ===\nC\n`
    expect(connectKnots(source, 'a', 'c').error).toMatch(/several linear diverts/i)
  })
})
