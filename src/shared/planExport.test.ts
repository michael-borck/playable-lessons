import { describe, it, expect } from 'vitest'
import { toPlainText, toStandaloneHTML } from './planExport'
import type { PlanResult } from './generate'

const sample: PlanResult = {
  title: 'Supply Chain Resilience',
  summary: 'A methodology case on managing disruption in supply chains.',
  recommendations: [
    { target: 'summary', rationale: 'Gives learners the core concepts before applied work.' },
    { target: 'case-study', rationale: 'A dilemma forces applied analysis.', depth: 'complete' },
    { target: 'quiz', rationale: 'Checks comprehension of the key terms.', count: 10 }
  ],
  raw: ''
}

describe('toPlainText', () => {
  it('prints the summary + numbered recommendations with rationale', () => {
    const txt = toPlainText(sample)
    expect(txt.startsWith('Supply Chain Resilience\n')).toBe(true)
    expect(txt).toContain(sample.summary)
    expect(txt).toContain('1. Summary')
    expect(txt).toContain('2. Case study (complete)')
    expect(txt).toContain('3. Quiz ×10')
    expect(txt).toContain(sample.recommendations[0].rationale)
  })
})

describe('toStandaloneHTML', () => {
  it('is fully self-contained', () => {
    const html = toStandaloneHTML(sample, 'Plan')
    expect(html).not.toMatch(/<script\s+src=/)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('escapes the title', () => {
    const html = toStandaloneHTML({ ...sample, title: '<b>x</b>' }, 'Fallback')
    expect(html).toContain('<title>&lt;b&gt;x&lt;/b&gt; — Recommended Outputs</title>')
  })

  it('renders the recommendations', () => {
    const html = toStandaloneHTML(sample, 'Plan')
    expect(html).toContain('id="recs"')
    expect(html).toContain('Checks comprehension')
    expect(html).toContain('Created with Playable Lessons')
  })
})
