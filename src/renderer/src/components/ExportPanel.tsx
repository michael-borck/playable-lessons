import { useMemo, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { exportStandaloneHTML } from '../lib/exporter'
import { exportToTwee3 } from '../lib/tweeExporter'
import { exportH5P, findStateConstructs, bytesToBase64 } from '../../../shared/h5pExporter'
import { generateWalkthroughHTML } from '../lib/pdfExporter'
import { publishToGitHubPages } from '../lib/githubPublisher'
import { toCSV, toAnkiTSV, toStandaloneHTML as toFlashcardHTML } from '../../../shared/flashcardExport'
import { toStandaloneHTML as toQuizHTML, toPlainText as toQuizText } from '../../../shared/quizExport'
import { toStandaloneHTML as toSummaryHTML, toPlainText as toSummaryText } from '../../../shared/summaryExport'
import { toStandaloneHTML as toAiTaskHTML, toPlainText as toAiTaskText } from '../../../shared/aiTaskExport'
import { toStandaloneHTML as toCaseStudyHTML, toPlainText as toCaseStudyText } from '../../../shared/caseStudyExport'
import { toStandaloneHTML as toPlanHTML, toPlainText as toPlanText } from '../../../shared/planExport'

export default function ExportPanel() {
  const inkSource = useAppStore((s) => s.inkSource)
  const flashcards = useAppStore((s) => s.flashcards)
  const quiz = useAppStore((s) => s.quiz)
  const summary = useAppStore((s) => s.summary)
  const aiTask = useAppStore((s) => s.aiTask)
  const caseStudy = useAppStore((s) => s.caseStudy)
  const plan = useAppStore((s) => s.plan)
  const projectName = useAppStore((s) => s.projectName)
  const [exporting, setExporting] = useState<string | null>(null)
  const [ghToken, setGhToken] = useState('')
  const [ghRepoName, setGhRepoName] = useState('')
  const [publishUrl, setPublishUrl] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [exportDone, setExportDone] = useState<string | null>(null)

  const name = projectName || 'story'

  // H5P can only represent stateless branching — check the current story once.
  const h5pBlockers = useMemo(
    () => (inkSource.trim() ? findStateConstructs(inkSource) : []),
    [inkSource]
  )

  const handleExportH5P = async () => {
    if (!inkSource.trim() || h5pBlockers.length > 0) return
    setExporting('h5p')
    setExportDone(null)
    try {
      const bytes = exportH5P(inkSource, name)
      const saved = await window.api.saveBinaryFile(`${name}.h5p`, bytesToBase64(bytes), [
        { name: 'H5P Packages', extensions: ['h5p'] }
      ])
      if (saved) setExportDone(saved)
    } finally {
      setExporting(null)
    }
  }

  const handleExportHTML = async () => {
    if (!inkSource.trim()) return
    setExporting('html')
    setExportDone(null)
    try {
      const html = await exportStandaloneHTML(inkSource, name)
      const saved = await window.api.saveFile(`${name}.html`, html, [{ name: 'HTML Files', extensions: ['html'] }])
      if (saved) setExportDone(saved)
    } finally {
      setExporting(null)
    }
  }

  const handleExportInk = async () => {
    if (!inkSource.trim()) return
    const saved = await window.api.saveFile(`${name}.ink`, inkSource, [{ name: 'Ink Files', extensions: ['ink'] }])
    if (saved) setExportDone(saved)
  }

  const handleExportTwee = async () => {
    if (!inkSource.trim()) return
    setExporting('twee')
    try {
      const twee = exportToTwee3(inkSource, name)
      const saved = await window.api.saveFile(`${name}.twee`, twee, [{ name: 'Twee Files', extensions: ['twee', 'tw'] }])
      if (saved) setExportDone(saved)
    } finally {
      setExporting(null)
    }
  }

  const handleExportPDF = async () => {
    if (!inkSource.trim()) return
    setExporting('pdf')
    try {
      const html = generateWalkthroughHTML(inkSource, name)
      const saved = await window.api.saveFile(
        `${name}_walkthrough.html`,
        html,
        [{ name: 'HTML Files', extensions: ['html'] }]
      )
      if (saved) setExportDone(saved)
    } finally {
      setExporting(null)
    }
  }

  // ─── Flashcard exports ───
  const handleExportFlashCSV = async () => {
    if (!flashcards) return
    const saved = await window.api.saveFile(`${name}.flashcards.csv`, toCSV(flashcards), [{ name: 'CSV Files', extensions: ['csv'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportFlashAnki = async () => {
    if (!flashcards) return
    const saved = await window.api.saveFile(`${name}.flashcards.txt`, toAnkiTSV(flashcards), [{ name: 'Text Files', extensions: ['txt'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportFlashHTML = async () => {
    if (!flashcards) return
    const saved = await window.api.saveFile(`${name}.flashcards.html`, toFlashcardHTML(flashcards, name), [{ name: 'HTML Files', extensions: ['html'] }])
    if (saved) setExportDone(saved)
  }

  // ─── Quiz exports ───
  const handleExportQuizHTML = async () => {
    if (!quiz) return
    const saved = await window.api.saveFile(`${name}.quiz.html`, toQuizHTML(quiz, name), [{ name: 'HTML Files', extensions: ['html'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportQuizTxt = async () => {
    if (!quiz) return
    const saved = await window.api.saveFile(`${name}.quiz.txt`, toQuizText(quiz, name), [{ name: 'Text Files', extensions: ['txt'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportQuizJson = async () => {
    if (!quiz) return
    const saved = await window.api.saveFile(`${name}.quiz.json`, JSON.stringify(quiz, null, 2), [{ name: 'JSON Files', extensions: ['json'] }])
    if (saved) setExportDone(saved)
  }

  // ─── Summary exports ───
  const handleExportSummaryHTML = async () => {
    if (!summary) return
    const saved = await window.api.saveFile(`${name}.summary.html`, toSummaryHTML(summary, name), [{ name: 'HTML Files', extensions: ['html'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportSummaryTxt = async () => {
    if (!summary) return
    const saved = await window.api.saveFile(`${name}.summary.txt`, toSummaryText(summary, name), [{ name: 'Text Files', extensions: ['txt'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportSummaryJson = async () => {
    if (!summary) return
    const saved = await window.api.saveFile(`${name}.summary.json`, JSON.stringify(summary, null, 2), [{ name: 'JSON Files', extensions: ['json'] }])
    if (saved) setExportDone(saved)
  }

  // ─── AI-task exports ───
  const handleExportAiTaskHTML = async () => {
    if (!aiTask) return
    const saved = await window.api.saveFile(`${name}.ai-task.html`, toAiTaskHTML(aiTask, name), [{ name: 'HTML Files', extensions: ['html'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportAiTaskTxt = async () => {
    if (!aiTask) return
    const saved = await window.api.saveFile(`${name}.ai-task.txt`, toAiTaskText(aiTask, name), [{ name: 'Text Files', extensions: ['txt'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportAiTaskJson = async () => {
    if (!aiTask) return
    const saved = await window.api.saveFile(`${name}.ai-task.json`, JSON.stringify(aiTask, null, 2), [{ name: 'JSON Files', extensions: ['json'] }])
    if (saved) setExportDone(saved)
  }

  // ─── Case-study exports ───
  const handleExportCaseStudyHTML = async () => {
    if (!caseStudy) return
    const saved = await window.api.saveFile(`${name}.case-study.html`, toCaseStudyHTML(caseStudy, name), [{ name: 'HTML Files', extensions: ['html'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportCaseStudyTxt = async () => {
    if (!caseStudy) return
    const saved = await window.api.saveFile(`${name}.case-study.txt`, toCaseStudyText(caseStudy, name), [{ name: 'Text Files', extensions: ['txt'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportCaseStudyJson = async () => {
    if (!caseStudy) return
    const saved = await window.api.saveFile(`${name}.case-study.json`, JSON.stringify(caseStudy, null, 2), [{ name: 'JSON Files', extensions: ['json'] }])
    if (saved) setExportDone(saved)
  }

  // ─── Plan exports ───
  const handleExportPlanHTML = async () => {
    if (!plan) return
    const saved = await window.api.saveFile(`${name}.plan.html`, toPlanHTML(plan, name), [{ name: 'HTML Files', extensions: ['html'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportPlanTxt = async () => {
    if (!plan) return
    const saved = await window.api.saveFile(`${name}.plan.txt`, toPlanText(plan), [{ name: 'Text Files', extensions: ['txt'] }])
    if (saved) setExportDone(saved)
  }
  const handleExportPlanJson = async () => {
    if (!plan) return
    const saved = await window.api.saveFile(`${name}.plan.json`, JSON.stringify(plan, null, 2), [{ name: 'JSON Files', extensions: ['json'] }])
    if (saved) setExportDone(saved)
  }

  if (!inkSource.trim() && !flashcards && !quiz && !summary && !aiTask && !caseStudy && !plan) {
    return (
      <div className="panel">
        <h2 className="panel-title">Export</h2>
        <p className="panel-subtitle">Generate a story, flashcards, or a quiz first before exporting.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Export</h2>
      <p className="panel-subtitle">Export your generated materials</p>

      {exportDone && (
        <div style={{
          background: 'rgba(76, 175, 124, 0.15)',
          border: '1px solid var(--success)',
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          marginBottom: 20,
          color: 'var(--success)'
        }}>
          Exported to: {exportDone}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Story exports */}
        {inkSource.trim() && (
          <>
            <ExportCard
              title="Standalone HTML"
              desc="A single .html file with the story player bundled. Works offline, can be uploaded to any LMS or shared via email."
              buttonText={exporting === 'html' ? 'Exporting...' : 'Export HTML'}
              onClick={handleExportHTML}
              disabled={exporting === 'html'}
            />

            <ExportCard
              title="Ink Source"
              desc="Raw .ink text file. Version-control friendly, editable in any text editor, compatible with Inky and other Ink tools."
              buttonText="Export .ink"
              onClick={handleExportInk}
            />

            <ExportCard
              title="Twee3 / Twine"
              desc="A .twee file compatible with Twinery.org and Tweego. Useful for handing off to users who prefer the Twine ecosystem."
              buttonText={exporting === 'twee' ? 'Exporting...' : 'Export .twee'}
              onClick={handleExportTwee}
              disabled={exporting === 'twee'}
            />

            <ExportCard
              title="PDF Walkthrough"
              desc="An HTML document showing all story paths in a tree layout. Open in a browser and print to PDF for a printed handout."
              buttonText={exporting === 'pdf' ? 'Generating...' : 'Export Walkthrough'}
              onClick={handleExportPDF}
              disabled={exporting === 'pdf'}
            />

            {/* H5P export — only stateless branching stories convert faithfully */}
            <div className="settings-section">
              <div className="settings-section-title">H5P Branching Scenario</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>
                A .h5p package for import into an LMS with H5P (Moodle, Blackboard) or Lumi.
                Requires the Branching Scenario content type on the host.
              </p>
              {h5pBlockers.length > 0 && (
                <div style={{
                  background: 'rgba(232, 168, 56, 0.15)',
                  border: '1px solid var(--warning)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  marginBottom: 12,
                  color: 'var(--warning)',
                  fontSize: 13
                }}>
                  This story uses adaptive state (variables / conditional text), which H5P
                  can&apos;t represent — {h5pBlockers.length} construct{h5pBlockers.length === 1 ? '' : 's'} found,
                  first at line {h5pBlockers[0].line}: <code>{h5pBlockers[0].snippet}</code>.
                  Regenerate with &ldquo;H5P / LMS compatible&rdquo; ticked on the input screen.
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={handleExportH5P}
                disabled={h5pBlockers.length > 0 || exporting === 'h5p'}
              >
                {exporting === 'h5p' ? 'Exporting...' : 'Export .h5p'}
              </button>
            </div>

            {/* GitHub Pages publish */}
            <div className="settings-section">
              <div className="settings-section-title">Publish to GitHub Pages</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>
                Push your story to a GitHub repository and get a shareable URL via GitHub Pages.
              </p>

              {publishUrl && (
                <div style={{ background: 'rgba(76, 175, 124, 0.15)', border: '1px solid var(--success)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 12, color: 'var(--success)' }}>
                  Published: <a href={publishUrl} target="_blank" rel="noopener" style={{ color: 'var(--success)' }}>{publishUrl}</a>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    GitHub Pages can take up to a minute to build — if the link 404s, wait and refresh.
                  </div>
                </div>
              )}

              {publishError && (
                <div className="error-banner" style={{ marginBottom: 12 }}>
                  <span>{publishError}</span>
                  <button className="error-dismiss" onClick={() => setPublishError(null)}>&times;</button>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="form-label" style={{ fontSize: 11 }}>GitHub Personal Access Token</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="ghp_..."
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  style={{ fontSize: 13 }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Needs &apos;repo&apos; scope. Create at github.com/settings/tokens
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Repository Name</label>
                <input
                  className="form-input"
                  placeholder={name.replace(/\s+/g, '-').toLowerCase()}
                  value={ghRepoName}
                  onChange={(e) => setGhRepoName(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>

              <button
                className="btn btn-primary"
                disabled={!ghToken || exporting === 'github'}
                onClick={async () => {
                  setExporting('github')
                  setPublishError(null)
                  setPublishUrl(null)
                  try {
                    const html = await exportStandaloneHTML(inkSource, name)
                    const repoName = ghRepoName || name.replace(/\s+/g, '-').toLowerCase()
                    const result = await publishToGitHubPages(ghToken, repoName, html)
                    setPublishUrl(result.url)
                  } catch (err) {
                    setPublishError(err instanceof Error ? err.message : 'Publish failed')
                  } finally {
                    setExporting(null)
                  }
                }}
              >
                {exporting === 'github' ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </>
        )}

        {/* Flashcard exports */}
        {flashcards && (
          <>
            <ExportCard
              title="Flashcards — CSV"
              desc="front,back,hint,tag columns. Imports into Anki, Quizlet, and Excel."
              buttonText="Export .csv"
              onClick={handleExportFlashCSV}
            />
            <ExportCard
              title="Flashcards — Anki TSV"
              desc="Tab-separated front, back, and tag for direct Anki import."
              buttonText="Export .txt"
              onClick={handleExportFlashAnki}
            />
            <ExportCard
              title="Flashcards — HTML Deck"
              desc="A self-contained flip-card deck. Works offline; share via LMS or email."
              buttonText="Export .html"
              onClick={handleExportFlashHTML}
            />
          </>
        )}

        {/* Quiz exports */}
        {quiz && (
          <>
            <ExportCard
              title="Quiz — Interactive HTML"
              desc="A self-contained, self-marking quiz. Works offline; share via LMS or email."
              buttonText="Export .html"
              onClick={handleExportQuizHTML}
            />
            <ExportCard
              title="Quiz — Printable"
              desc="A text quiz with a separate answer key. Print or paste into a handout."
              buttonText="Export .txt"
              onClick={handleExportQuizTxt}
            />
            <ExportCard
              title="Quiz — JSON"
              desc="The raw structured quiz, for pipelines or re-import."
              buttonText="Export .json"
              onClick={handleExportQuizJson}
            />
          </>
        )}

        {/* Summary exports */}
        {summary && (
          <>
            <ExportCard
              title="Summary — Study Sheet"
              desc="A self-contained HTML study sheet (overview, key points, glossary). Works offline."
              buttonText="Export .html"
              onClick={handleExportSummaryHTML}
            />
            <ExportCard
              title="Summary — Printable"
              desc="A text summary with key points and a glossary."
              buttonText="Export .txt"
              onClick={handleExportSummaryTxt}
            />
            <ExportCard
              title="Summary — JSON"
              desc="The raw structured summary, for pipelines or re-import."
              buttonText="Export .json"
              onClick={handleExportSummaryJson}
            />
          </>
        )}

        {/* AI-task exports */}
        {aiTask && (
          <>
            <ExportCard
              title="AI Tasks — Task Sheet"
              desc="A self-contained HTML task sheet (scenario, brief, load-bearing specifics, rubric). Works offline."
              buttonText="Export .html"
              onClick={handleExportAiTaskHTML}
            />
            <ExportCard
              title="AI Tasks — Printable"
              desc="A text version of the AI-collaboration tasks."
              buttonText="Export .txt"
              onClick={handleExportAiTaskTxt}
            />
            <ExportCard
              title="AI Tasks — JSON"
              desc="The raw structured task set, for pipelines or re-import."
              buttonText="Export .json"
              onClick={handleExportAiTaskJson}
            />
          </>
        )}

        {/* Case-study exports */}
        {caseStudy && (
          <>
            <ExportCard
              title="Case Study — HTML"
              desc="A self-contained case-study sheet (narrative, situation, key facts, conflict, questions). Works offline."
              buttonText="Export .html"
              onClick={handleExportCaseStudyHTML}
            />
            <ExportCard
              title="Case Study — Printable"
              desc="A text version of the case study."
              buttonText="Export .txt"
              onClick={handleExportCaseStudyTxt}
            />
            <ExportCard
              title="Case Study — JSON"
              desc="The raw structured case study, for pipelines or re-import."
              buttonText="Export .json"
              onClick={handleExportCaseStudyJson}
            />
          </>
        )}

        {/* Plan exports */}
        {plan && (
          <>
            <ExportCard
              title="Plan — HTML"
              desc="A self-contained recommendation sheet (suggested outputs + rationale). Works offline."
              buttonText="Export .html"
              onClick={handleExportPlanHTML}
            />
            <ExportCard
              title="Plan — Printable"
              desc="A text version of the recommendations."
              buttonText="Export .txt"
              onClick={handleExportPlanTxt}
            />
            <ExportCard
              title="Plan — JSON"
              desc="The raw structured plan, for pipelines or re-import."
              buttonText="Export .json"
              onClick={handleExportPlanJson}
            />
          </>
        )}
      </div>
    </div>
  )
}

function ExportCard({
  title,
  desc,
  buttonText,
  onClick,
  disabled
}: {
  title: string
  desc: string
  buttonText: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{title}</div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>{desc}</p>
      <button className="btn btn-primary" onClick={onClick} disabled={disabled}>{buttonText}</button>
    </div>
  )
}
