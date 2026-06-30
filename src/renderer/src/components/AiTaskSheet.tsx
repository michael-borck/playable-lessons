import type { AiTaskResult } from '../../../shared/generate'

/** Inline AI-collaboration task sheet: scenario, brief, deliverable, specifics, rubric, why-it-works. */
export default function AiTaskSheet({ result }: { result: AiTaskResult }) {
  return (
    <div className="aitask-sheet">
      {result.tasks.map((t, i) => (
        <div className="aitask-card" key={i}>
          <div className="aitask-no">Task {i + 1}</div>

          <h3 className="aitask-h">Scenario</h3>
          <p>{t.scenario}</p>

          <h3 className="aitask-h">Your brief</h3>
          <p className="aitask-brief">{t.brief}</p>

          <h3 className="aitask-h">Deliverable</h3>
          <p>{t.deliverable}</p>

          {t.loadBearingSpecifics.length > 0 && (
            <>
              <h3 className="aitask-h">Load-bearing specifics</h3>
              <ul className="aitask-list">
                {t.loadBearingSpecifics.map((s, j) => (
                  <li key={j}>
                    <span>{s.detail}</span>
                    <span className="aitask-why">Generic answers miss it: {s.whyGenericAnswersMissIt}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {t.rubric.length > 0 && (
            <>
              <h3 className="aitask-h">Rubric (engagement-anchored)</h3>
              <ul className="aitask-list">
                {t.rubric.map((r, j) => (
                  <li key={j}>
                    <span>{r.criterion}</span>
                    <span className="aitask-why">{r.description}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="aitask-h">Why it works</h3>
          <p className="aitask-works">{t.whyItWorks}</p>
        </div>
      ))}
    </div>
  )
}
