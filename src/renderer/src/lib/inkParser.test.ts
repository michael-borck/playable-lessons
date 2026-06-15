import { describe, it, expect } from 'vitest'
import { parseInkSource } from './inkParser'

const SAMPLE = `VAR score = 0
VAR name = "Ada"
VAR passed = true

-> intro

=== intro ===
Welcome to the lesson.
# IMAGE: intro.png
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
})
