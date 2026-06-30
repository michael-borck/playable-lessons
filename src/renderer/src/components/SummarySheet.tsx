import type { SummaryResult } from '../../../shared/generate'

/** Inline study summary: overview, numbered key points, and glossary. */
export default function SummarySheet({ result }: { result: SummaryResult }) {
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
