import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { exportStandaloneHTML } from '../lib/exporter'
import { exportToTwee3 } from '../lib/tweeExporter'
import { generateWalkthroughHTML } from '../lib/pdfExporter'
import { publishToGitHubPages } from '../lib/githubPublisher'

export default function ExportPanel() {
  const inkSource = useAppStore((s) => s.inkSource)
  const projectName = useAppStore((s) => s.projectName)
  const [exporting, setExporting] = useState<string | null>(null)
  const [ghToken, setGhToken] = useState('')
  const [ghRepoName, setGhRepoName] = useState('')
  const [publishUrl, setPublishUrl] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [exportDone, setExportDone] = useState<string | null>(null)

  const name = projectName || 'story'

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

  if (!inkSource.trim()) {
    return (
      <div className="panel">
        <h2 className="panel-title">Export</h2>
        <p className="panel-subtitle">Generate a story first before exporting.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Export</h2>
      <p className="panel-subtitle">Export your story in different formats</p>

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
