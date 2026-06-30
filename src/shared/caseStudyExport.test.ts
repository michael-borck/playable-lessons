import { describe, it, expect } from 'vitest'
import { toPlainText, toStandaloneHTML } from './caseStudyExport'
import type { CaseStudyResult } from './generate'

const complete: CaseStudyResult = {
  title: 'The Rushed Rollout',
  caseStudy: {
    title: 'The Rushed Rollout',
    protagonist: 'Priya, a newly promoted project lead at a mid-sized SaaS firm',
    situation: 'A flagship feature must ship in three weeks to meet a promised date.',
    keyFacts: ['QA is on leave for week two.', 'A competitor announced a similar feature.', 'The contract penalizes slips over five days.'],
    conflict: 'Ship on time with thin QA, or slip and lose first-mover advantage.',
    decisionPoints: ['Cut scope to fit QA capacity', 'Ship with known gaps and patch later'],
    discussionQuestions: ['How should Priya weigh contractual penalties against quality risk?'],
    narrative: 'Priya stared at the calendar. Three weeks, and week two was already gone.'
  },
  raw: ''
}

describe('toPlainText', () => {
  it('prints the narrative plus the structured fields', () => {
    const txt = toPlainText(complete)
    expect(txt.startsWith('The Rushed Rollout\n')).toBe(true)
    expect(txt).toContain(complete.caseStudy.narrative as string)
    expect(txt).toContain('Protagonist: Priya')
    expect(txt).toContain('Key facts:')
    expect(txt).toContain('Discussion questions:')
  })

  it('omits empty sections (idea/outline depth have no narrative)', () => {
    const idea: CaseStudyResult = {
      title: 'Idea',
      caseStudy: { title: 'Idea', protagonist: '', situation: 'A brief premise.', keyFacts: [], conflict: '', decisionPoints: [], discussionQuestions: [] },
      raw: ''
    }
    const txt = toPlainText(idea)
    expect(txt).not.toContain('Protagonist:')
    expect(txt).toContain('Situation: A brief premise.')
  })
})

describe('toStandaloneHTML', () => {
  it('is fully self-contained (no external resources)', () => {
    const html = toStandaloneHTML(complete, 'CS')
    expect(html).not.toMatch(/<script\s+src=/)
    expect(html).not.toMatch(/<link\s/i)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('escapes the title', () => {
    const html = toStandaloneHTML({ ...complete, title: '<b>x</b>' }, 'Fallback')
    expect(html).toContain('<title>&lt;b&gt;x&lt;/b&gt; — Case Study</title>')
  })

  it('neutralizes content that would break out of the embedded <script>', () => {
    const risky: CaseStudyResult = {
      title: 'D',
      caseStudy: { title: 'D', protagonist: '', situation: 'a </script> b', keyFacts: [], conflict: '', decisionPoints: [], discussionQuestions: [] },
      raw: ''
    }
    const html = toStandaloneHTML(risky, 'D')
    expect(html).toContain('a \\u003c/script> b')
    const opens = (html.match(/<script/g) || []).length
    const closes = (html.match(/<\/script>/g) || []).length
    expect(opens).toBe(closes)
  })

  it('renders the sheet sections', () => {
    const html = toStandaloneHTML(complete, 'CS')
    expect(html).toContain('id="body"')
    expect(html).toContain('Discussion questions')
    expect(html).toContain('Created with Playable Lessons')
  })
})
