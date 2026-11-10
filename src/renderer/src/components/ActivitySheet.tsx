import { useEffect, useState } from 'react'
import type {
  ActivityResult,
  GridActivity,
  GridCell,
  SliderActivity,
  SliderStatement
} from '../../../shared/generate'
import { addGridColumn, addGridRow, removeGridColumn, removeGridRow } from '../../../shared/activityEdit'
import { useAppStore } from '../stores/appStore'

/**
 * Inline renderer for reflective activities. Grid: tap a cell for its feedback.
 * Slider: move each control and the feedback updates for that position.
 * When `editable`, renders a form editor instead of the learner view.
 */
export default function ActivitySheet({
  result,
  editable
}: {
  result: ActivityResult
  editable?: boolean
}) {
  const setActivity = useAppStore((s) => s.setActivity)
  const [picked, setPicked] = useState<number | null>(null)
  const [values, setValues] = useState<Record<number, number>>({})
  const [touched, setTouched] = useState<Record<number, boolean>>({})

  // A regenerated activity may have different cells/statements; clear the
  // learner's previous selections so indices cannot point at stale data.
  useEffect(() => {
    setPicked(null)
    setValues({})
    setTouched({})
  }, [result])

  const activity = result.activity

  if (editable) {
    return <ActivityEditor result={result} onChange={(next) => setActivity(next)} />
  }

  return (
    <div className="activity-sheet">
      {result.instructions && <p className="activity-instructions">{result.instructions}</p>}

      {activity.kind === 'grid' ? (
        <div className="activity-grid-wrap">
          <div className="activity-axis">{activity.yLabel}</div>
          <table className="activity-grid">
            <thead>
              <tr>
                <th aria-hidden="true" />
                {activity.columns.map((column) => (
                  <th key={column} scope="col">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activity.rows.map((row, ri) => (
                <tr key={row}>
                  <th scope="row">{row}</th>
                  {activity.columns.map((column, ci) => {
                    const index = ri * activity.columns.length + ci
                    const cell = activity.cells[index] ?? { label: '', feedback: '' }
                    return (
                      <td key={column}>
                        <button
                          type="button"
                          className={`activity-cell ${picked === index ? 'selected' : ''}`}
                          aria-label={`${row}, ${column}${cell.label ? `: ${cell.label}` : ''}`}
                          onClick={() => setPicked(index)}
                        >
                          {cell.label || 'Choose'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="activity-axis">{activity.xLabel}</div>

          {picked !== null ? (
            <div className="activity-feedback">
              {activity.cells[picked]?.label && <strong>{activity.cells[picked].label}</strong>}
              <p>{activity.cells[picked]?.feedback || 'No feedback for this cell.'}</p>
            </div>
          ) : (
            <p className="activity-hint">Tap a cell to see what it means.</p>
          )}
        </div>
      ) : (
        <div className="activity-sliders">
          {activity.statements.map((statement, i) => {
            const value = values[i] ?? 50
            const leaning =
              value < 45 ? statement.lowLabel : value > 55 ? statement.highLabel : 'the middle'
            return (
              <div className="activity-slider" key={i}>
                <div className="activity-statement">{statement.text}</div>
                <div className="activity-slider-row">
                  <span className="activity-end-label">{statement.lowLabel}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={value}
                    aria-label={statement.text}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setValues((prev) => ({ ...prev, [i]: next }))
                      setTouched((prev) => ({ ...prev, [i]: true }))
                    }}
                  />
                  <span className="activity-end-label">{statement.highLabel}</span>
                </div>
                {touched[i] ? (
                  <div className="activity-feedback">
                    {statement.feedback && <p>{statement.feedback}</p>}
                    <p className="activity-leaning">You are leaning toward {leaning}.</p>
                  </div>
                ) : (
                  <p className="activity-hint">Move the slider to see feedback.</p>
                )}
              </div>
            )
          })}
          <button
            className="btn btn-secondary"
            onClick={() => {
              setValues({})
              setTouched({})
            }}
            style={{ alignSelf: 'flex-start', padding: '4px 12px', fontSize: 12 }}
          >
            Reset sliders
          </button>
        </div>
      )}

      {activity.debrief && <div className="activity-debrief">{activity.debrief}</div>}
    </div>
  )
}

/** Shared title/instructions shell for both activity editors. */
function ActivityEditor({
  result,
  onChange
}: {
  result: ActivityResult
  onChange: (next: ActivityResult) => void
}) {
  const activity = result.activity
  return (
    <div className="deck-editor">
      <div className="edit-card">
        <div className="edit-card-no">Activity</div>
        <input
          className="edit-input"
          value={result.title}
          placeholder="Activity title"
          onChange={(e) => onChange({ ...result, title: e.target.value })}
        />
        <textarea
          className="edit-input"
          value={result.instructions}
          placeholder="Instructions for the learner"
          rows={3}
          onChange={(e) => onChange({ ...result, instructions: e.target.value })}
        />
      </div>

      {activity.kind === 'grid' ? (
        <GridEditor activity={activity} onChange={(next) => onChange({ ...result, activity: next })} />
      ) : (
        <SliderEditor activity={activity} onChange={(next) => onChange({ ...result, activity: next })} />
      )}

      <div className="edit-card">
        <div className="edit-card-no">Debrief</div>
        <textarea
          className="edit-input"
          value={activity.debrief}
          placeholder="Closing synthesis shown after the activity"
          rows={3}
          onChange={(e) => onChange({ ...result, activity: { ...activity, debrief: e.target.value } })}
        />
      </div>
    </div>
  )
}

function GridEditor({
  activity,
  onChange
}: {
  activity: GridActivity
  onChange: (next: GridActivity) => void
}) {
  const cols = activity.columns.length
  const rows = activity.rows.length
  const update = (patch: Partial<GridActivity>) => onChange({ ...activity, ...patch })
  const cellAt = (index: number): GridCell => activity.cells[index] ?? { label: '', feedback: '' }

  const setColumn = (index: number, label: string) =>
    update({ columns: activity.columns.map((c, i) => (i === index ? label : c)) })
  const setRow = (index: number, label: string) =>
    update({ rows: activity.rows.map((r, i) => (i === index ? label : r)) })
  const setCell = (index: number, patch: Partial<GridCell>) =>
    update({ cells: activity.cells.map((c, i) => (i === index ? { ...cellAt(i), ...patch } : cellAt(i))) })

  return (
    <>
      <div className="edit-card">
        <div className="edit-card-no">Axes</div>
        <div className="edit-item">
          <input
            className="edit-input"
            value={activity.xLabel}
            placeholder="Horizontal axis label"
            onChange={(e) => update({ xLabel: e.target.value })}
          />
          <input
            className="edit-input"
            value={activity.yLabel}
            placeholder="Vertical axis label"
            onChange={(e) => update({ yLabel: e.target.value })}
          />
        </div>
      </div>

      <div className="edit-card">
        <div className="edit-card-head">
          <span className="edit-card-no">Columns ({cols}/4)</span>
          <button className="btn btn-secondary edit-delete" disabled={cols >= 4} onClick={() => onChange(addGridColumn(activity))}>
            + Add column
          </button>
        </div>
        {activity.columns.map((column, ci) => (
          <div className="edit-item" key={ci}>
            <input
              className="edit-input"
              value={column}
              placeholder={`Column ${ci + 1}`}
              onChange={(e) => setColumn(ci, e.target.value)}
            />
            <button
              className="btn btn-secondary edit-delete"
              disabled={cols <= 2}
              onClick={() => onChange(removeGridColumn(activity, ci))}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div className="edit-card">
        <div className="edit-card-head">
          <span className="edit-card-no">Rows ({rows}/4)</span>
          <button className="btn btn-secondary edit-delete" disabled={rows >= 4} onClick={() => onChange(addGridRow(activity))}>
            + Add row
          </button>
        </div>
        {activity.rows.map((row, ri) => (
          <div className="edit-item" key={ri}>
            <input
              className="edit-input"
              value={row}
              placeholder={`Row ${ri + 1}`}
              onChange={(e) => setRow(ri, e.target.value)}
            />
            <button
              className="btn btn-secondary edit-delete"
              disabled={rows <= 2}
              onClick={() => onChange(removeGridRow(activity, ri))}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div className="edit-card">
        <div className="edit-card-no">Cell labels &amp; feedback</div>
        {activity.rows.map((row, ri) => (
          <div key={ri} style={{ marginTop: ri === 0 ? 0 : 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{row}</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: 8
              }}
            >
              {activity.columns.map((column, ci) => {
                const index = ri * cols + ci
                const cell = cellAt(index)
                return (
                  <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{column}</div>
                    <input
                      className="edit-input"
                      value={cell.label}
                      placeholder="Cell label"
                      onChange={(e) => setCell(index, { label: e.target.value })}
                    />
                    <textarea
                      className="edit-input"
                      value={cell.feedback}
                      placeholder="Feedback"
                      rows={3}
                      onChange={(e) => setCell(index, { feedback: e.target.value })}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function SliderEditor({
  activity,
  onChange
}: {
  activity: SliderActivity
  onChange: (next: SliderActivity) => void
}) {
  const updateStatement = (index: number, patch: Partial<SliderStatement>) =>
    onChange({
      ...activity,
      statements: activity.statements.map((s, i) => (i === index ? { ...s, ...patch } : s))
    })
  const addStatement = () => {
    if (activity.statements.length >= 8) return
    onChange({
      ...activity,
      statements: [
        ...activity.statements,
        { text: '', lowLabel: 'Low', highLabel: 'High', feedback: '' }
      ]
    })
  }
  const removeStatement = (index: number) => {
    if (activity.statements.length <= 1) return
    onChange({ ...activity, statements: activity.statements.filter((_, i) => i !== index) })
  }

  return (
    <div className="edit-card">
      <div className="edit-card-head">
        <span className="edit-card-no">Statements ({activity.statements.length}/8)</span>
        <button
          className="btn btn-secondary edit-delete"
          disabled={activity.statements.length >= 8}
          onClick={addStatement}
        >
          + Add statement
        </button>
      </div>
      {activity.statements.map((statement, i) => (
        <div className="edit-card" key={i} style={{ marginBottom: 10 }}>
          <div className="edit-card-head">
            <span className="edit-card-no">Statement {i + 1}</span>
            <button
              className="btn btn-secondary edit-delete"
              disabled={activity.statements.length <= 1}
              onClick={() => removeStatement(i)}
            >
              Delete
            </button>
          </div>
          <textarea
            className="edit-input"
            value={statement.text}
            placeholder="Claim or judgement to rate"
            rows={2}
            onChange={(e) => updateStatement(i, { text: e.target.value })}
          />
          <div className="edit-item">
            <input
              className="edit-input"
              value={statement.lowLabel}
              placeholder="Low end label"
              onChange={(e) => updateStatement(i, { lowLabel: e.target.value })}
            />
            <input
              className="edit-input"
              value={statement.highLabel}
              placeholder="High end label"
              onChange={(e) => updateStatement(i, { highLabel: e.target.value })}
            />
          </div>
          <textarea
            className="edit-input"
            value={statement.feedback}
            placeholder="Feedback for this statement"
            rows={3}
            onChange={(e) => updateStatement(i, { feedback: e.target.value })}
          />
        </div>
      ))}
    </div>
  )
}
