import { useEffect, useState } from 'react'
import { useAppStore, type InputMode } from '../stores/appStore'
import { projectService } from '../lib/projectService'
import { projectIdFromName, type ProjectFull } from '../../../shared/project'

function fmtDate(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/** Local dashboard: list/save/open/delete on-disk project folders. */
export default function ProjectsView() {
  const projects = useAppStore((s) => s.projects)
  const setProjects = useAppStore((s) => s.setProjects)
  const setView = useAppStore((s) => s.setCurrentView)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [root, setRoot] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const [r, list] = await Promise.all([projectService.root(), projectService.list()])
      setRoot(r)
      setProjects(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveCurrent = async () => {
    setBusy('save')
    setError(null)
    try {
      const s = useAppStore.getState()
      const existing = s.projects.find((p) => p.id === s.loadedProjectId)
      const id = s.loadedProjectId || projectIdFromName(s.projectName || 'Untitled')
      const project: ProjectFull = {
        id,
        name: s.projectName || 'Untitled',
        inputMode: s.inputMode,
        inputText: s.inputText,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
        inkSource: s.inkSource || undefined,
        compiledStoryJson: s.compiledStoryJson || undefined,
        flashcards: s.flashcards || undefined,
        quiz: s.quiz || undefined,
        summary: s.summary || undefined,
        aiTask: s.aiTask || undefined,
        caseStudy: s.caseStudy || undefined
      }
      await projectService.save(project)
      useAppStore.getState().setLoadedProjectId(id)
      await refresh()
      setView('study')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(null)
    }
  }

  const open = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      const full = await projectService.read(id)
      if (!full) {
        setError('Project not found')
        return
      }
      const s = useAppStore.getState()
      s.setInputMode(full.inputMode as InputMode)
      s.setInputText(full.inputText)
      s.setProjectName(full.name)
      s.setInkSource(full.inkSource || '')
      s.setCompiledStoryJson(full.compiledStoryJson || '')
      s.setFlashcards(full.flashcards || null)
      s.setQuiz(full.quiz || null)
      s.setSummary(full.summary || null)
      s.setAiTask(full.aiTask || null)
      s.setCaseStudy(full.caseStudy || null)
      s.setLoadedProjectId(full.id)
      setView(
        full.inkSource
          ? 'preview'
          : full.flashcards || full.quiz || full.summary || full.aiTask || full.caseStudy
            ? 'study'
            : 'input'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Open failed')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete project "${name}"? This removes its folder on disk.`)) return
    setBusy('del-' + id)
    setError(null)
    try {
      await projectService.delete(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Projects</h2>
      <p className="panel-subtitle">
        {root ? `Saved on disk in: ${root}` : 'Local project folders on disk.'}
      </p>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-dismiss" onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      <div className="btn-row" style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" disabled={busy === 'save'} onClick={saveCurrent}>
          {busy === 'save' ? 'Saving…' : 'Save current as project'}
        </button>
        <button className="btn btn-secondary" onClick={() => setView('input')}>New from Input</button>
        <button className="btn btn-secondary" onClick={refresh} disabled={loading}>Refresh</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : projects.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No saved projects yet. Generate something, then “Save current as project”.
        </p>
      ) : (
        <div className="project-list">
          {projects.map((p) => (
            <div key={p.id} className="project-card">
              <div className="project-card-main">
                <div className="project-card-name">{p.name}</div>
                <div className="project-card-meta">
                  {fmtDate(p.updatedAt)}{p.inputMode ? ` · ${p.inputMode}` : ''}
                </div>
                <div className="project-badges">
                  {p.artifacts.story && <span className="badge">Story</span>}
                  {p.artifacts.flashcards && <span className="badge">Flashcards</span>}
                  {p.artifacts.quiz && <span className="badge">Quiz</span>}
                  {p.artifacts.summary && <span className="badge">Summary</span>}
                </div>
              </div>
              <div className="project-card-actions">
                <button className="btn btn-primary" disabled={busy === p.id} onClick={() => open(p.id)}>
                  {busy === p.id ? 'Opening…' : 'Open'}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={busy === 'del-' + p.id}
                  onClick={() => remove(p.id, p.name)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
