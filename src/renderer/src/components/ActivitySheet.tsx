import { useEffect, useState } from 'react'
import type { ActivityResult } from '../../../shared/generate'

/**
 * Inline renderer for reflective activities. Grid: tap a cell for its feedback.
 * Slider: move each control and the feedback updates for that position.
 */
export default function ActivitySheet({ result }: { result: ActivityResult }) {
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
