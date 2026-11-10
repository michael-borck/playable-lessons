/**
 * Pure grid resizing helpers used by the activity editor. Keeping these out of
 * the React component makes the row-major cell remapping testable.
 */
import type { GridActivity, GridCell } from './generate.js'

const MIN_DIM = 2
const MAX_DIM = 4

const emptyCell = (): GridCell => ({ label: '', feedback: '' })

/** Append a column (max 4). Existing cells keep their row/column positions. */
export function addGridColumn(activity: GridActivity): GridActivity {
  const cols = activity.columns.length
  if (cols >= MAX_DIM) return activity
  const cells = activity.rows.flatMap((_, ri) => [
    ...activity.cells.slice(ri * cols, ri * cols + cols),
    emptyCell()
  ])
  return { ...activity, columns: [...activity.columns, 'New column'], cells }
}

/** Remove one column (min 2), dropping that column's cell in every row. */
export function removeGridColumn(activity: GridActivity, columnIndex: number): GridActivity {
  const cols = activity.columns.length
  if (cols <= MIN_DIM || columnIndex < 0 || columnIndex >= cols) return activity
  const cells = activity.rows.flatMap((_, ri) =>
    activity.cells.slice(ri * cols, ri * cols + cols).filter((_, ci) => ci !== columnIndex)
  )
  return { ...activity, columns: activity.columns.filter((_, i) => i !== columnIndex), cells }
}

/** Append a row (max 4), padded with empty cells. */
export function addGridRow(activity: GridActivity): GridActivity {
  if (activity.rows.length >= MAX_DIM) return activity
  const cells = [
    ...activity.cells,
    ...Array.from({ length: activity.columns.length }, emptyCell)
  ]
  return { ...activity, rows: [...activity.rows, 'New row'], cells }
}

/** Remove one row (min 2), dropping that row's cells. */
export function removeGridRow(activity: GridActivity, rowIndex: number): GridActivity {
  const rows = activity.rows.length
  const cols = activity.columns.length
  if (rows <= MIN_DIM || rowIndex < 0 || rowIndex >= rows) return activity
  const cells = activity.rows.flatMap((_, ri) =>
    ri === rowIndex ? [] : activity.cells.slice(ri * cols, ri * cols + cols)
  )
  return { ...activity, rows: activity.rows.filter((_, i) => i !== rowIndex), cells }
}
