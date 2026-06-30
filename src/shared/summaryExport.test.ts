import { describe, it, expect } from 'vitest'
import { toPlainText, toStandaloneHTML } from './summaryExport'
import type { SummaryResult } from './generate'

const sample: SummaryResult = {
  title: 'Supply Chain Basics',
  overview: 'How goods, information, and money flow from suppliers to customers.',
  keyPoints: ['Bullwhip effect amplifies demand upstream.', 'Safety stock buffers variability.'],
  glossary: [
    { term: 'Bullwhip effect', definition: 'Demand distortion growing upstream.' },
    { term: 'JIT', definition: 'Just-In-Time inventory.' }
  ],
  raw: ''
}

describe('toPlainText', () => {
  it('prints the overview, numbered key points, and glossary', () => {
    const txt = toPlainText(sample)
    expect(txt.startsWith('Supply Chain Basics\n')).toBe(true)
    expect(txt).toContain(sample.overview)
    expect(txt).toContain('Key Points:')
    expect(txt).toContain('1. Bullwhip effect amplifies demand upstream.')
    expect(txt).toContain('Glossary:')
    expect(txt).toContain('Bullwhip effect: Demand distortion growing upstream.')
  })

  it('falls back to the passed-in title when the summary has none', () => {
    const txt = toPlainText({ ...sample, title: '' }, 'Fallback')
    expect(txt.startsWith('Fallback\n')).toBe(true)
  })
})

describe('toStandaloneHTML', () => {
  it('is fully self-contained (no external resources)', () => {
    const html = toStandaloneHTML(sample, 'Summary')
    expect(html).not.toMatch(/<script\s+src=/)
    expect(html).not.toMatch(/<link\s/i)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('escapes the title', () => {
    const html = toStandaloneHTML({ ...sample, title: '<b>x</b>' }, 'Fallback')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('<title>&lt;b&gt;x&lt;/b&gt; — Summary</title>')
  })

  it('neutralizes content that would break out of the embedded <script>', () => {
    const risky: SummaryResult = {
      title: 'D',
      overview: '',
      keyPoints: ['a </script> b'],
      glossary: [],
      raw: ''
    }
    const html = toStandaloneHTML(risky, 'D')
    expect(html).toContain('a \\u003c/script> b')
    expect(html).not.toContain('a </script> b')
    const opens = (html.match(/<script/g) || []).length
    const closes = (html.match(/<\/script>/g) || []).length
    expect(opens).toBe(closes)
  })

  it('renders the sheet UI (overview, points, glossary, footer)', () => {
    const html = toStandaloneHTML(sample, 'Summary')
    expect(html).toContain('id="overview"')
    expect(html).toContain('id="points"')
    expect(html).toContain('id="glossary"')
    expect(html).toContain('Created with Playable Lessons')
  })
})
