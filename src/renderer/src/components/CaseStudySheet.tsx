import type { CaseStudyResult } from '../../../shared/generate'

/** Inline case study: optional narrative prose, then the structured fields. */
export default function CaseStudySheet({ result }: { result: CaseStudyResult }) {
  const cs = result.caseStudy
  return (
    <div className="casestudy-sheet">
      {cs.narrative && <p className="casestudy-narrative">{cs.narrative}</p>}

      {cs.protagonist && (
        <div>
          <h3 className="casestudy-h">Protagonist</h3>
          <p>{cs.protagonist}</p>
        </div>
      )}
      {cs.situation && (
        <div>
          <h3 className="casestudy-h">Situation</h3>
          <p>{cs.situation}</p>
        </div>
      )}
      {cs.keyFacts.length > 0 && (
        <div>
          <h3 className="casestudy-h">Key facts</h3>
          <ul>
            {cs.keyFacts.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}
      {cs.conflict && (
        <div>
          <h3 className="casestudy-h">The conflict</h3>
          <p>{cs.conflict}</p>
        </div>
      )}
      {cs.decisionPoints.length > 0 && (
        <div>
          <h3 className="casestudy-h">Decision points</h3>
          <ul>
            {cs.decisionPoints.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
      {cs.discussionQuestions.length > 0 && (
        <div>
          <h3 className="casestudy-h">Discussion questions</h3>
          <ul>
            {cs.discussionQuestions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
