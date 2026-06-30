import type { CaseStudyResult } from '../../../shared/generate'
import { useAppStore } from '../stores/appStore'
import RefineButton from './RefineButton'

/** Inline case study. When editable, all fields are editable. */
export default function CaseStudySheet({ result, editable }: { result: CaseStudyResult; editable?: boolean }) {
  const setCaseStudy = useAppStore((s) => s.setCaseStudy)
  const cs = result.caseStudy

  if (editable) {
    const updateField = (field: string, value: string) =>
      setCaseStudy({ ...result, caseStudy: { ...cs, [field]: value } })
    const updateArr = (field: 'keyFacts' | 'decisionPoints' | 'discussionQuestions', i: number, value: string) =>
      setCaseStudy({ ...result, caseStudy: { ...cs, [field]: cs[field].map((x, j) => (j === i ? value : x)) } })
    const addArr = (field: 'keyFacts' | 'decisionPoints' | 'discussionQuestions') =>
      setCaseStudy({ ...result, caseStudy: { ...cs, [field]: [...cs[field], ''] } })
    const delArr = (field: 'keyFacts' | 'decisionPoints' | 'discussionQuestions', i: number) =>
      setCaseStudy({ ...result, caseStudy: { ...cs, [field]: cs[field].filter((_, j) => j !== i) } })

    return (
      <div className="casestudy-sheet">
        {cs.narrative !== undefined && (
          <>
            <h3 className="casestudy-h">Narrative</h3>
            <textarea className="edit-input" value={cs.narrative} onChange={(e) => updateField('narrative', e.target.value)} rows={4} />
            <RefineButton text={cs.narrative} onRefine={(v) => updateField('narrative', v)} defaultInstruction="Rewrite this case-study narrative to be more vivid and engaging." />
          </>
        )}
        <h3 className="casestudy-h">Protagonist</h3>
        <input className="edit-input" value={cs.protagonist} onChange={(e) => updateField('protagonist', e.target.value)} />
        <h3 className="casestudy-h">Situation</h3>
        <textarea className="edit-input" value={cs.situation} onChange={(e) => updateField('situation', e.target.value)} rows={2} />
        <RefineButton text={cs.situation} onRefine={(v) => updateField('situation', v)} defaultInstruction="Rewrite this situation to be more concrete." />

        <h3 className="casestudy-h">Key Facts</h3>
        {cs.keyFacts.map((f, i) => (
          <div className="edit-item" key={i}>
            <input className="edit-input" value={f} onChange={(e) => updateArr('keyFacts', i, e.target.value)} />
            <button className="btn btn-secondary edit-delete" onClick={() => delArr('keyFacts', i)}>Delete</button>
          </div>
        ))}
        <button className="btn btn-secondary" onClick={() => addArr('keyFacts')}>+ Add fact</button>

        <h3 className="casestudy-h">Conflict</h3>
        <textarea className="edit-input" value={cs.conflict} onChange={(e) => updateField('conflict', e.target.value)} rows={2} />

        <h3 className="casestudy-h">Decision Points</h3>
        {cs.decisionPoints.map((d, i) => (
          <div className="edit-item" key={i}>
            <input className="edit-input" value={d} onChange={(e) => updateArr('decisionPoints', i, e.target.value)} />
            <button className="btn btn-secondary edit-delete" onClick={() => delArr('decisionPoints', i)}>Delete</button>
          </div>
        ))}
        <button className="btn btn-secondary" onClick={() => addArr('decisionPoints')}>+ Add decision point</button>

        <h3 className="casestudy-h">Discussion Questions</h3>
        {cs.discussionQuestions.map((q, i) => (
          <div className="edit-item" key={i}>
            <input className="edit-input" value={q} onChange={(e) => updateArr('discussionQuestions', i, e.target.value)} />
            <button className="btn btn-secondary edit-delete" onClick={() => delArr('discussionQuestions', i)}>Delete</button>
          </div>
        ))}
        <button className="btn btn-secondary" onClick={() => addArr('discussionQuestions')}>+ Add question</button>
      </div>
    )
  }

  // ─── Read-only mode ───
  return (
    <div className="casestudy-sheet">
      {cs.narrative && <p className="casestudy-narrative">{cs.narrative}</p>}
      {cs.protagonist && (<div><h3 className="casestudy-h">Protagonist</h3><p>{cs.protagonist}</p></div>)}
      {cs.situation && (<div><h3 className="casestudy-h">Situation</h3><p>{cs.situation}</p></div>)}
      {cs.keyFacts.length > 0 && (
        <div><h3 className="casestudy-h">Key facts</h3><ul>{cs.keyFacts.map((f, i) => <li key={i}>{f}</li>)}</ul></div>
      )}
      {cs.conflict && (<div><h3 className="casestudy-h">The conflict</h3><p>{cs.conflict}</p></div>)}
      {cs.decisionPoints.length > 0 && (
        <div><h3 className="casestudy-h">Decision points</h3><ul>{cs.decisionPoints.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
      )}
      {cs.discussionQuestions.length > 0 && (
        <div><h3 className="casestudy-h">Discussion questions</h3><ul>{cs.discussionQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
      )}
    </div>
  )
}
