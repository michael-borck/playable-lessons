import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { generateAllToProject } from '../lib/aiService'
import type { PlanResult } from '../../../shared/generate'

const LABELS: Record<string, string> = {
  story: 'Story (interactive fiction)',
  flashcards: 'Flashcards',
  quiz: 'Quiz',
  summary: 'Summary',
  'ai-task': 'AI-collaboration tasks',
  'case-study': 'Case study'
}

/** Shows the recommended outputs + the "generate all → new project" action. */
export default function PlanSheet({ result }: { result: PlanResult }) {
  const setView = useAppStore((s) => s.setCurrentView)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateAll = async () => {
    setApplying(true)
    setError(null)
    try {
      await generateAllToProject()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="plan-sheet">
      {result.summary && <p className="plan-summary">{result.summary}</p>}
      <div className="plan-recs">
        {result.recommendations.map((r, i) => (
          <div className="plan-rec" key={i}>
            <div className="plan-rec-head">
              {i + 1}. {LABELS[r.target] ?? r.target}
              {(r.depth || r.count) && (
                <span className="plan-rec-meta">
                  ({[r.depth, r.count ? `×${r.count}` : ''].filter(Boolean).join(', ')})
                </span>
              )}
            </div>
            <div className="plan-rec-why">{r.rationale}</div>
          </div>
        ))}
      </div>
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-dismiss" onClick={() => setError(null)}>&times;</button>
        </div>
      )}
      <p className="plan-hint">
        “Generate all” runs every recommended output and saves the set as a new project on disk.
      </p>
      <div className="btn-row">
        <button className="btn btn-primary" disabled={applying} onClick={generateAll}>
          {applying ? 'Generating all…' : 'Generate all → new project'}
        </button>
        <button className="btn btn-secondary" disabled={applying} onClick={() => setView('input')}>
          Back to Input
        </button>
      </div>
    </div>
  )
}
