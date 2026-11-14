import { describe, it, expect } from 'vitest'
import {
  COALESCE_MS,
  MAX_HISTORY,
  canRedoInk,
  canUndoInk,
  pushInkHistory,
  redoInkHistory,
  resetInkHistory,
  undoInkHistory
} from './inkHistory'

describe('ink history', () => {
  it('resets to a single entry', () => {
    const state = resetInkHistory('A')
    expect(state).toEqual({ entries: ['A'], index: 0 })
    expect(canUndoInk(state)).toBe(false)
    expect(canRedoInk(state)).toBe(false)
  })

  it('records edits and supports undo/redo', () => {
    let state = resetInkHistory('A')
    let result = pushInkHistory(state, 'B', 10_000, 0)
    state = result.state
    expect(state.entries).toEqual(['A', 'B'])

    result = pushInkHistory(state, 'C', 10_000 + COALESCE_MS + 1, result.recordedAt)
    state = result.state
    expect(state.entries).toEqual(['A', 'B', 'C'])

    const undo = undoInkHistory(state)!
    expect(undo.source).toBe('B')
    expect(undo.state.index).toBe(1)
    const undoAgain = undoInkHistory(undo.state)!
    expect(undoAgain.source).toBe('A')
    expect(undoInkHistory(undoAgain.state)).toBeNull()

    const redo = redoInkHistory(undoAgain.state)!
    expect(redo.source).toBe('B')
  })

  it('coalesces rapid edits into one history entry', () => {
    let state = resetInkHistory('A')
    let result = pushInkHistory(state, 'B', 10_000, 0)
    state = result.state
    result = pushInkHistory(state, 'BC', 10_000 + COALESCE_MS - 1, result.recordedAt)
    state = result.state
    expect(state.entries).toEqual(['A', 'BC'])

    const undo = undoInkHistory(state)!
    expect(undo.source).toBe('A')
  })

  it('ignores a no-op edit', () => {
    const state = resetInkHistory('A')
    const result = pushInkHistory(state, 'A', 10_000, 0)
    expect(result.state).toBe(state)
  })

  it('caps the history length', () => {
    let state = resetInkHistory('0')
    let at = 0
    for (let i = 1; i <= MAX_HISTORY + 20; i++) {
      const result = pushInkHistory(state, String(i), at + COALESCE_MS + 1, at)
      state = result.state
      at = result.recordedAt
    }
    expect(state.entries).toHaveLength(MAX_HISTORY)
    expect(state.entries[state.entries.length - 1]).toBe(String(MAX_HISTORY + 20))
    expect(canUndoInk(state)).toBe(true)
  })
})
