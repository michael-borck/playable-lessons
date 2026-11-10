import { describe, it, expect } from 'vitest'
import { addGridColumn, addGridRow, removeGridColumn, removeGridRow } from './activityEdit'
import type { GridActivity } from './generate'

const GRID: GridActivity = {
  kind: 'grid',
  xLabel: 'Likelihood',
  yLabel: 'Impact',
  columns: ['Low', 'High'],
  rows: ['Severe', 'Minor'],
  cells: [
    { label: 'a', feedback: 'A' },
    { label: 'b', feedback: 'B' },
    { label: 'c', feedback: 'C' },
    { label: 'd', feedback: 'D' }
  ],
  debrief: ''
}

const GRID_3: GridActivity = {
  kind: 'grid',
  xLabel: 'X',
  yLabel: 'Y',
  columns: ['A', 'B', 'C'],
  rows: ['R1', 'R2', 'R3'],
  cells: 'abcdefghi'.split('').map((label) => ({ label, feedback: label.toUpperCase() })),
  debrief: ''
}

describe('activity grid editing', () => {
  it('adds a column without disturbing existing cells', () => {
    const next = addGridColumn(GRID)
    expect(next.columns).toHaveLength(3)
    expect(next.cells).toHaveLength(6)
    expect(next.cells.slice(0, 3)).toEqual([
      { label: 'a', feedback: 'A' },
      { label: 'b', feedback: 'B' },
      { label: '', feedback: '' }
    ])
    expect(next.cells[3]).toEqual({ label: 'c', feedback: 'C' })
  })

  it('removes a column from every row', () => {
    const first = removeGridColumn(GRID_3, 0)
    expect(first.columns).toEqual(['B', 'C'])
    expect(first.cells.map((c) => c.label)).toEqual(['b', 'c', 'e', 'f', 'h', 'i'])

    const middle = removeGridColumn(GRID_3, 1)
    expect(middle.columns).toEqual(['A', 'C'])
    expect(middle.cells.map((c) => c.label)).toEqual(['a', 'c', 'd', 'f', 'g', 'i'])
  })

  it('adds a row padded with empty cells', () => {
    const next = addGridRow(GRID)
    expect(next.rows).toHaveLength(3)
    expect(next.cells).toHaveLength(6)
    expect(next.cells.slice(4)).toEqual([
      { label: '', feedback: '' },
      { label: '', feedback: '' }
    ])
  })

  it('removes a row and its cells', () => {
    const first = removeGridRow(GRID_3, 0)
    expect(first.rows).toEqual(['R2', 'R3'])
    expect(first.cells.map((c) => c.label)).toEqual(['d', 'e', 'f', 'g', 'h', 'i'])

    const middle = removeGridRow(GRID_3, 1)
    expect(middle.rows).toEqual(['R1', 'R3'])
    expect(middle.cells.map((c) => c.label)).toEqual(['a', 'b', 'c', 'g', 'h', 'i'])
  })

  it('enforces the 2-4 dimension bounds', () => {
    expect(removeGridColumn(GRID, 0)).toBe(GRID)
    expect(removeGridRow(GRID, 0)).toBe(GRID)

    const fourByFour: GridActivity = {
      ...GRID,
      columns: ['1', '2', '3', '4'],
      rows: ['1', '2', '3', '4'],
      cells: Array.from({ length: 16 }, () => ({ label: '', feedback: '' }))
    }
    expect(addGridColumn(fourByFour)).toBe(fourByFour)
    expect(addGridRow(fourByFour)).toBe(fourByFour)
  })
})
