import { describe, it, expect } from 'vitest'
import { toPlainText, toStandaloneHTML } from './quizExport'
import type { QuizResult } from './generate'

const sample: QuizResult = {
  quizTitle: 'Basics',
  questions: [
    { stem: 'What is 2+2?', options: ['3', '4', '5'], correctIndex: 1, explanation: 'basic arithmetic' },
    { stem: 'Pick the prime.', options: ['4', '7'], correctIndex: 1 }
  ],
  raw: ''
}

describe('toPlainText', () => {
  it('numbers questions, letters options, and prints an answer key', () => {
    const txt = toPlainText(sample)
    expect(txt.startsWith('Basics\n')).toBe(true)
    expect(txt).toContain('1. What is 2+2?')
    expect(txt).toContain('   A) 3')
    expect(txt).toContain('   B) 4')
    expect(txt).toContain('2. Pick the prime.')
    expect(txt).toContain('--- Answer Key ---')
    expect(txt).toContain('1. B — basic arithmetic')
    expect(txt).toContain('2. B')
  })

  it('falls back to the passed-in title when the quiz has none', () => {
    const txt = toPlainText({ ...sample, quizTitle: '' }, 'Fallback')
    expect(txt.startsWith('Fallback\n')).toBe(true)
  })
})

describe('toStandaloneHTML', () => {
  it('is fully self-contained (no external resources)', () => {
    const html = toStandaloneHTML(sample, 'Quiz')
    expect(html).not.toMatch(/<script\s+src=/)
    expect(html).not.toMatch(/<link\s/i)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('escapes the quiz title', () => {
    const html = toStandaloneHTML({ ...sample, quizTitle: '<b>x</b>' }, 'Fallback')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('<title>&lt;b&gt;x&lt;/b&gt; — Quiz</title>')
  })

  it('neutralizes question text that would break out of the embedded <script>', () => {
    const risky: QuizResult = {
      quizTitle: 'D',
      questions: [{ stem: 'a </script> b', options: ['1', '2'], correctIndex: 0 }],
      raw: ''
    }
    const html = toStandaloneHTML(risky, 'D')
    expect(html).toContain('a \\u003c/script> b')
    expect(html).not.toContain('a </script> b')
    const opens = (html.match(/<script/g) || []).length
    const closes = (html.match(/<\/script>/g) || []).length
    expect(opens).toBe(closes)
  })

  it('renders the quiz UI (form, submit, score, footer)', () => {
    const html = toStandaloneHTML(sample, 'Quiz')
    expect(html).toContain('id="quiz"')
    expect(html).toContain('id="submit"')
    expect(html).toContain('id="score"')
    expect(html).toContain('Created with Playable Lessons')
  })
})
