import type { SummaryResult } from '../../../shared/generate'
import { useAppStore } from '../stores/appStore'

/** Inline study summary. When editable, all fields become editable with add/delete. */
export default function SummarySheet({ result, editable }: { result: SummaryResult; editable?: boolean }) {
  const setSummary = useAppStore((s) => s.setSummary)

  // ─── Editable mode ───
  if (editable) {
    const update = (patch: Partial<SummaryResult>) => setSummary({ ...result, ...patch })

    return (
      <div className="summary-sheet">
        <h3 className="summary-section-title">Overview</h3>
        <textarea
          className="edit-input"
          value={result.overview}
          onChange={(e) => update({ overview: e.target.value })}
          rows={3}
        />

        <h3 className="summary-section-title">Key Points</h3>
        {result.keyPoints.map((p, i) => (
          <div className="edit-item" key={i}>
            <textarea
              className="edit-input"
              value={p}
              onChange={(e) =>
                update({ keyPoints: result.keyPoints.map((x, j) => (j === i ? e.target.value : x)) })
              }
              rows={2}
            />
            <button
              className="btn btn-secondary edit-delete"
              onClick={() => update({ keyPoints: result.keyPoints.filter((_, j) => j !== i) })}
            >
              Delete
            </button>
          </div>
        ))}
        <button className="btn btn-secondary" onClick={() => update({ keyPoints: [...result.keyPoints, ''] })}>
          + Add point
        </button>

        <h3 className="summary-section-title">Glossary</h3>
        {result.glossary.map((g, i) => (
          <div className="edit-item" key={i}>
            <div className="edit-glossary-fields">
              <input
                className="edit-input"
                value={g.term}
                onChange={(e) =>
                  update({
                    glossary: result.glossary.map((x, j) => (j === i ? { ...x, term: e.target.value } : x))
                  })
                }
                placeholder="Term"
              />
              <input
                className="edit-input"
                value={g.definition}
                onChange={(e) =>
                  update({
                    glossary: result.glossary.map((x, j) =>
                      j === i ? { ...x, definition: e.target.value } : x
                    )
                  })
                }
                placeholder="Definition"
              />
            </div>
            <button
              className="btn btn-secondary edit-delete"
              onClick={() => update({ glossary: result.glossary.filter((_, j) => j !== i) })}
            >
              Delete
            </button>
          </div>
        ))}
        <button
          className="btn btn-secondary"
          onClick={() => update({ glossary: [...result.glossary, { term: '', definition: '' }] })}
        >
          + Add term
        </button>
      </div>
    )
  }

  // ─── Read-only mode ───
  return (
    <div className="summary-sheet">
      {result.overview && <p className="summary-overview">{result.overview}</p>}

      {result.keyPoints.length > 0 && (
        <div>
          <h3 className="summary-section-title">Key Points</h3>
          <ol className="summary-points">
            {result.keyPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      )}

      {result.glossary.length > 0 && (
        <div>
          <h3 className="summary-section-title">Glossary</h3>
          <dl className="summary-glossary">
            {result.glossary.flatMap((g, i) => [
              <dt key={`t${i}`}>{g.term}</dt>,
              <dd key={`d${i}`}>{g.definition}</dd>
            ])}
          </dl>
        </div>
      )}
    </div>
  )
}
