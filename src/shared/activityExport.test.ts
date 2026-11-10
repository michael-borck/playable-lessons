import { describe, it, expect } from 'vitest'
import { toPlainText, toStandaloneHTML } from './activityExport'
import type { ActivityResult } from './generate'

const GRID: ActivityResult = {
  title: 'Risk grid',
  instructions: 'Place the case on the grid.',
  activity: {
    kind: 'grid',
    xLabel: 'Likelihood',
    yLabel: 'Impact',
    columns: ['Unlikely', 'Possible', 'Likely'],
    rows: ['Severe', 'Moderate', 'Minor'],
    cells: Array.from({ length: 9 }, (_, i) => ({
      label: `Cell ${i + 1}`,
      feedback: `Feedback ${i + 1}`
    })),
    debrief: 'Use the grid to prioritise.'
  },
  raw: 'raw response'
}

const SLIDER: ActivityResult = {
  title: 'Confidence check',
  instructions: 'Rate each statement.',
  activity: {
    kind: 'slider',
    statements: [
      {
        text: 'The plan is safe to ship.',
        lowLabel: 'Strongly disagree',
        highLabel: 'Strongly agree',
        feedback: 'Consider what evidence would change your mind.'
      }
    ],
    debrief: 'Compare your ratings with the source material.'
  },
  raw: 'raw response'
}

describe('toPlainText', () => {
  it('prints the grid, its axes, and every cell feedback', () => {
    const text = toPlainText(GRID)
    expect(text.startsWith('Risk grid\n')).toBe(true)
    expect(text).toContain('Likelihood (columns, left to right): Unlikely | Possible | Likely')
    expect(text).toContain('Impact (rows, top to bottom): Severe | Moderate | Minor')
    expect(text).toContain('Severe × Unlikely — Cell 1: Feedback 1')
    expect(text).toContain('Use the grid to prioritise.')
  })

  it('prints slider statements with their endpoints', () => {
    const text = toPlainText(SLIDER)
    expect(text).toContain('The plan is safe to ship.')
    expect(text).toContain('Strongly disagree  ←→  Strongly agree')
    expect(text).toContain('Consider what evidence would change your mind.')
  })
})

describe('toStandaloneHTML', () => {
  it('is fully self-contained', () => {
    const html = toStandaloneHTML(GRID, 'Fallback')
    expect(html).not.toMatch(/<script\s+src=/)
    expect(html).not.toMatch(/<link\s(?![^>]*href="data:)/i)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('escapes the title and neutralizes embedded script closers', () => {
    const risky: ActivityResult = {
      ...GRID,
      title: '</script><b>x</b>',
      activity: { ...GRID.activity, debrief: '</script> boom' }
    }
    const html = toStandaloneHTML(risky, 'Fallback')
    expect(html).toContain('&lt;/script&gt;&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('\\u003c/script> boom')
    expect((html.match(/<script/g) || []).length).toBe((html.match(/<\/script>/g) || []).length)
  })

  it('renders the grid UI', () => {
    const html = toStandaloneHTML(GRID, 'Fallback')
    expect(html).toContain("activity.kind === 'grid'")
    expect(html).toContain('Likelihood')
    expect(html).toContain('Cell 1')
    expect(html).toContain('Feedback 1')
  })

  it('renders the slider UI', () => {
    const html = toStandaloneHTML(SLIDER, 'Fallback')
    expect(html).toContain("activity.kind === 'grid'")
    expect(html).toContain('The plan is safe to ship.')
    expect(html).toContain('Strongly disagree')
    expect(html).toContain("input.type = 'range'")
  })
})
