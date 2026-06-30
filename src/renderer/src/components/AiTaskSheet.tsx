import type { AiTaskResult } from '../../../shared/generate'
import { useAppStore } from '../stores/appStore'
import RefineButton from './RefineButton'

/** Inline AI-collaboration task sheet. When editable, all fields are editable. */
export default function AiTaskSheet({ result, editable }: { result: AiTaskResult; editable?: boolean }) {
  const setAiTask = useAppStore((s) => s.setAiTask)

  if (editable) {
    const update = (i: number, field: string, value: string) =>
      setAiTask({
        ...result,
        tasks: result.tasks.map((t, j) => (j === i ? { ...t, [field]: value } : t))
      })

    return (
      <div className="aitask-sheet">
        {result.tasks.map((t, i) => (
          <div className="edit-card" key={i}>
            <div className="edit-card-head">
              <span className="edit-card-no">Task {i + 1}</span>
              <button
                className="btn btn-secondary edit-delete"
                onClick={() => setAiTask({ ...result, tasks: result.tasks.filter((_, j) => j !== i) })}
              >Delete</button>
            </div>
            <h3 className="aitask-h">Scenario</h3>
            <textarea className="edit-input" value={t.scenario} onChange={(e) => update(i, 'scenario', e.target.value)} rows={3} />
            <RefineButton text={t.scenario} onRefine={(v) => update(i, 'scenario', v)} defaultInstruction="Rewrite this scenario to be more concrete and specific." />
            <h3 className="aitask-h">Brief</h3>
            <textarea className="edit-input" value={t.brief} onChange={(e) => update(i, 'brief', e.target.value)} rows={2} />
            <RefineButton text={t.brief} onRefine={(v) => update(i, 'brief', v)} defaultInstruction="Rewrite this brief to be clearer for a student with zero chatbot experience." />
            <h3 className="aitask-h">Deliverable</h3>
            <textarea className="edit-input" value={t.deliverable} onChange={(e) => update(i, 'deliverable', e.target.value)} rows={2} />
            <h3 className="aitask-h">Why it works</h3>
            <textarea className="edit-input" value={t.whyItWorks} onChange={(e) => update(i, 'whyItWorks', e.target.value)} rows={2} />
            <RefineButton text={t.whyItWorks} onRefine={(v) => update(i, 'whyItWorks', v)} defaultInstruction="Rewrite this explanation to be sharper." />
          </div>
        ))}
        <button
          className="btn btn-secondary"
          onClick={() => setAiTask({
            ...result,
            tasks: [...result.tasks, { scenario: '', brief: '', deliverable: '', loadBearingSpecifics: [], rubric: [], whyItWorks: '' }]
          })}
        >+ Add task</button>
      </div>
    )
  }

  // ─── Read-only mode ───
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
