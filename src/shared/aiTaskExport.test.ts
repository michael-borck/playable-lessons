import { describe, it, expect } from 'vitest'
import { toPlainText, toStandaloneHTML } from './aiTaskExport'
import type { AiTaskResult } from './generate'

const sample: AiTaskResult = {
  title: 'Engaging the Bot',
  tasks: [
    {
      scenario: 'A budget cut hits a public clinic mid-quarter; a funder opposes paid ads.',
      brief: 'Use a chatbot to draft a revised outreach plan — probe its assumptions.',
      deliverable: 'A 1-page plan, with the assumptions you challenged noted.',
      loadBearingSpecifics: [
        { detail: 'The cut is mid-quarter (committed spend exists).', whyGenericAnswersMissIt: 'A generic plan ignores sunk/committed costs.' },
        { detail: 'The funder opposes paid ads.', whyGenericAnswersMissIt: 'A generic plan leans on paid ads.' }
      ],
      rubric: [
        { criterion: 'Surfaces the mid-quarter constraint', description: 'Did the learner make the bot account for committed spend?' },
        { criterion: 'Tests the no-paid-ads stance', description: 'Did the learner probe ad-driven suggestions?' }
      ],
      whyItWorks: 'A delegating learner gets a generic plan; an interrogating one exposes the funder conflict.'
    }
  ],
  raw: ''
}

describe('toPlainText', () => {
  it('prints scenario, brief, deliverable, specifics, rubric, why-it-works', () => {
    const txt = toPlainText(sample)
    expect(txt.startsWith('Engaging the Bot\n')).toBe(true)
    expect(txt).toContain('Task 1')
    expect(txt).toContain(`Scenario: ${sample.tasks[0].scenario}`)
    expect(txt).toContain(`Brief: ${sample.tasks[0].brief}`)
    expect(txt).toContain('Load-bearing specifics:')
    expect(txt).toContain('The cut is mid-quarter')
    expect(txt).toContain('Rubric (engagement-anchored):')
    expect(txt).toContain(`Why it works: ${sample.tasks[0].whyItWorks}`)
  })

  it('falls back to the passed-in title', () => {
    expect(toPlainText({ ...sample, title: '' }, 'Fallback').startsWith('Fallback\n')).toBe(true)
  })
})

describe('toStandaloneHTML', () => {
  it('is fully self-contained (no external resources)', () => {
    const html = toStandaloneHTML(sample, 'Tasks')
    expect(html).not.toMatch(/<script\s+src=/)
    expect(html).not.toMatch(/<link\s/i)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('escapes the title', () => {
    const html = toStandaloneHTML({ ...sample, title: '<b>x</b>' }, 'Fallback')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('<title>&lt;b&gt;x&lt;/b&gt; — AI-Collaboration Tasks</title>')
  })

  it('neutralizes content that would break out of the embedded <script>', () => {
    const risky: AiTaskResult = {
      title: 'D',
      tasks: [
        {
          scenario: 'a </script> b', brief: 'b', deliverable: 'd',
          loadBearingSpecifics: [{ detail: 'x', whyGenericAnswersMissIt: 'y' }],
          rubric: [{ criterion: 'c', description: 'e' }],
          whyItWorks: 'w'
        }
      ],
      raw: ''
    }
    const html = toStandaloneHTML(risky, 'D')
    expect(html).toContain('a \\u003c/script> b')
    expect(html).not.toContain('a </script> b')
    const opens = (html.match(/<script/g) || []).length
    const closes = (html.match(/<\/script>/g) || []).length
    expect(opens).toBe(closes)
  })

  it('renders the task sheet UI', () => {
    const html = toStandaloneHTML(sample, 'Tasks')
    expect(html).toContain('id="tasks"')
    expect(html).toContain('interrogating')
    expect(html).toContain('Created with Playable Lessons')
  })
})
