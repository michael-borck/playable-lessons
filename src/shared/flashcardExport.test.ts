import { describe, it, expect } from 'vitest'
import { toCSV, toAnkiTSV, toStandaloneHTML } from './flashcardExport'
import type { FlashcardResult } from './generate'

const sample: FlashcardResult = {
  deckTitle: 'Supply Chain Basics',
  cards: [
    {
      front: 'What is a "bullwhip"?',
      back: 'Demand distortion amplifying upstream.\nLine two.',
      hint: 'think amplification',
      tag: 'concepts'
    },
    { front: 'Plain', back: 'Simple answer' }
  ],
  raw: ''
}

describe('toCSV', () => {
  it('emits a header row then one record per card', () => {
    const csv = toCSV(sample)
    expect(csv.startsWith('front,back,hint,tag\n')).toBe(true)
    expect(csv.endsWith('\n')).toBe(true)
  })

  it('quotes fields containing commas, quotes, or newlines (RFC 4180)', () => {
    const csv = toCSV(sample)
    // front with embedded quotes -> doubled and wrapped
    expect(csv).toContain('"What is a ""bullwhip""?"')
    // back with a newline -> wrapped, newline preserved inside the field
    expect(csv).toContain('"Demand distortion amplifying upstream.\nLine two."')
    // hint/tag with no special chars stay unquoted
    expect(csv).toContain(',think amplification,concepts')
    // second card: plain fields, empty hint/tag
    expect(csv).toContain('\nPlain,Simple answer,,\n')
  })
})

describe('toAnkiTSV', () => {
  it('emits three columns (front, back, tag) with newlines as <br>', () => {
    const tsv = toAnkiTSV(sample)
    const lines = tsv.split('\n').filter(Boolean)
    expect(lines[0]).toBe(
      'What is a "bullwhip"?\tDemand distortion amplifying upstream.<br>Line two.\tconcepts'
    )
    expect(lines[1]).toBe('Plain\tSimple answer\t')
    // every row is exactly 3 columns — no stray tabs splitting fields
    expect(lines.every((l) => l.split('\t').length === 3)).toBe(true)
  })
})

describe('toStandaloneHTML', () => {
  it('is fully self-contained (no external resources)', () => {
    const html = toStandaloneHTML(sample, 'Deck')
    expect(html).not.toMatch(/<script\s+src=/)
    expect(html).not.toMatch(/<link\s/i)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('escapes the deck title', () => {
    const html = toStandaloneHTML({ ...sample, deckTitle: '<b>x</b>' }, 'Fallback')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('<title>&lt;b&gt;x&lt;/b&gt; — Flashcards</title>')
  })

  it('neutralizes card text that would break out of the embedded <script>', () => {
    const risky: FlashcardResult = {
      deckTitle: 'D',
      cards: [{ front: 'a </script> b', back: 'c' }],
      raw: ''
    }
    const html = toStandaloneHTML(risky, 'D')
    // the dangerous '<' must be escaped in the embedded JSON ...
    expect(html).toContain('a \\u003c/script> b')
    expect(html).not.toContain('a </script> b')
    // ... so the page's own script tags still balance
    const opens = (html.match(/<script/g) || []).length
    const closes = (html.match(/<\/script>/g) || []).length
    expect(opens).toBe(closes)
  })

  it('renders the deck UI (progress, controls, footer)', () => {
    const html = toStandaloneHTML(sample, 'Deck')
    expect(html).toContain('Card ')
    expect(html).toContain('Flip')
    expect(html).toContain('Shuffle')
    expect(html).toContain('Created with Playable Lessons')
  })

  it('falls back to the passed-in title when the deck has none', () => {
    const html = toStandaloneHTML({ ...sample, deckTitle: '' }, 'Fallback Title')
    expect(html).toContain('<title>Fallback Title — Flashcards</title>')
    expect(html).toContain('<h1>Fallback Title</h1>')
  })
})
