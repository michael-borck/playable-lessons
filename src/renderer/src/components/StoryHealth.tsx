import { useMemo, useState } from 'react'
import { countIssues, lintInk } from '../../../shared/storyLint'

/**
 * Advisory structural checks for the current Ink source. Not a gate: compile
 * errors are still the only thing that blocks preview/export.
 */
export default function StoryHealth({ inkSource }: { inkSource: string }) {
  const result = useMemo(() => lintInk(inkSource), [inkSource])
  const counts = useMemo(() => countIssues(result.issues), [result.issues])
  const [open, setOpen] = useState(false)

  if (!inkSource.trim() || result.stats.nodes === 0) return null

  const summary: string[] = []
  if (counts.error) summary.push(`${counts.error} error${counts.error === 1 ? '' : 's'}`)
  if (counts.warning) summary.push(`${counts.warning} warning${counts.warning === 1 ? '' : 's'}`)
  if (counts.info) summary.push(`${counts.info} info`)
  const status = summary.length > 0 ? summary.join(' · ') : 'No structural issues'
  const tone = counts.error ? 'has-errors' : counts.warning ? 'has-warnings' : 'is-clean'

  return (
    <div className={`story-health ${tone}`}>
      <button className="story-health-head" onClick={() => setOpen((value) => !value)}>
        <span>
          <strong>Story health</strong> — {status}
        </span>
        <span className="story-health-toggle">
          {result.issues.length > 0 ? (open ? 'Hide details' : 'Details') : ''}
        </span>
      </button>
      <div className="story-health-stats">
        {result.stats.nodes} passages · {result.stats.choices} choices · {result.stats.endings} tagged endings ·{' '}
        {result.stats.variables} variables
      </div>
      {open && result.issues.length > 0 && (
        <ul className="story-health-issues">
          {result.issues.map((issue, i) => (
            <li key={`${issue.code}-${issue.knotId ?? 'story'}-${i}`} className={`story-issue ${issue.severity}`}>
              <span className="story-issue-severity">{issue.severity}</span>
              <span className="story-issue-message">{issue.message}</span>
              {(issue.knotId || issue.line) && (
                <span className="story-issue-where">
                  {[issue.knotId, issue.line ? `line ${issue.line}` : ''].filter(Boolean).join(' · ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
