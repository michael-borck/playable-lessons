/**
 * Small undo/redo history for the Ink source.
 *
 * Edits made within COALESCE_MS are folded into one entry so typing does not
 * create a history entry per keystroke. Programmatic loads (generation, project
 * open, demo) reset the history instead of adding to it.
 */

export interface InkHistoryState {
  entries: string[]
  index: number
}

export const MAX_HISTORY = 100
export const COALESCE_MS = 800

export function resetInkHistory(source: string): InkHistoryState {
  return { entries: [source], index: 0 }
}

export function pushInkHistory(
  state: InkHistoryState,
  next: string,
  now: number,
  lastEditAt: number
): { state: InkHistoryState; recordedAt: number } {
  if (next === state.entries[state.index]) return { state, recordedAt: lastEditAt }

  let entries = state.entries.slice(0, state.index + 1)
  const coalesce = now - lastEditAt < COALESCE_MS && entries.length > 1
  if (coalesce) {
    entries[entries.length - 1] = next
  } else {
    entries.push(next)
    if (entries.length > MAX_HISTORY) entries = entries.slice(entries.length - MAX_HISTORY)
  }
  return { state: { entries, index: entries.length - 1 }, recordedAt: now }
}

export function undoInkHistory(
  state: InkHistoryState
): { state: InkHistoryState; source: string } | null {
  if (state.index <= 0) return null
  const index = state.index - 1
  return { state: { ...state, index }, source: state.entries[index] }
}

export function redoInkHistory(
  state: InkHistoryState
): { state: InkHistoryState; source: string } | null {
  if (state.index >= state.entries.length - 1) return null
  const index = state.index + 1
  return { state: { ...state, index }, source: state.entries[index] }
}

export function canUndoInk(state: InkHistoryState): boolean {
  return state.index > 0
}

export function canRedoInk(state: InkHistoryState): boolean {
  return state.index < state.entries.length - 1
}
