import { useEffect, useState } from 'react'
import { useAppStore, type InputMode } from '../stores/appStore'
import { projectService } from '../lib/projectService'
import { projectIdFromName, type AutosaveDraft, type ProjectFull } from '../../../shared/project'
import { isMeaningfulProject, setAutosaveBaseline } from '../lib/autosave'

function fmtDate(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/** Load a project (or draft) snapshot into the working store. */
function applyProjectSnapshot(full: ProjectFull): 'preview' | 'study' | 'input' {
  const s = useAppStore.getState()
  // Reset all per-project state first — otherwise a plan, outline, or node
  // layout from the previously open project leaks into this one.
  s.setPlan(null)
  s.setStoryOutline(null)
  s.setClarificationQuestions([])
  s.clearGenerationLog()
  s.setNodePositions(full.nodePositions || {})
  s.setSelectedNodeId(null)
  s.setGenerationStage('idle')
  s.setError(null)
  s.setInputMode((full.inputMode as InputMode) || 'topic')
  s.setInputText(full.inputText || '')
  s.setProjectName(full.name || 'Untitled')
  s.setInkSource(full.inkSource || '')
  s.setCompiledStoryJson(full.compiledStoryJson || '')
  s.setSceneImages(full.sceneImages || {})
  s.setFlashcards(full.flashcards || null)
  s.setQuiz(full.quiz || null)
  s.setSummary(full.summary || null)
  s.setAiTask(full.aiTask || null)
  s.setCaseStudy(full.caseStudy || null)
  s.setActivity(full.activity || null)
  s.setLoadedProjectId(full.id && full.id !== 'draft' ? full.id : null)
  return full.inkSource
    ? 'preview'
    : full.flashcards || full.quiz || full.summary || full.aiTask || full.caseStudy || full.activity
      ? 'study'
      : 'input'
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
  const [draft, setDraft] = useState<AutosaveDraft | null>(null)

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
    window.api.autosave
      .read()
      .then((saved) => {
        if (saved && isMeaningfulProject(saved.project)) setDraft(saved)
      })
      .catch(() => {})
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
        nodePositions: Object.keys(s.nodePositions).length > 0 ? s.nodePositions : undefined,
        sceneImages: Object.keys(s.sceneImages).length > 0 ? s.sceneImages : undefined,
        flashcards: s.flashcards || undefined,
        quiz: s.quiz || undefined,
        summary: s.summary || undefined,
        aiTask: s.aiTask || undefined,
        caseStudy: s.caseStudy || undefined,
        activity: s.activity || undefined
      }
      await projectService.save(project)
      useAppStore.getState().setLoadedProjectId(id)
      setAutosaveBaseline(project)
      window.api.autosave.clear().catch(() => {})
      setDraft(null)
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
      const view = applyProjectSnapshot(full)
      setAutosaveBaseline(full)
      window.api.autosave.clear().catch(() => {})
      setDraft(null)
      setView(view)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Open failed')
    } finally {
      setBusy(null)
    }
  }

  const restoreDraft = async () => {
    if (!draft) return
    const view = applyProjectSnapshot(draft.project)
    setAutosaveBaseline(draft.project)
    await window.api.autosave.clear().catch(() => {})
    setDraft(null)
    setView(view)
  }

  const discardDraft = async () => {
    await window.api.autosave.clear().catch(() => {})
    setAutosaveBaseline(null)
    setDraft(null)
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

      {draft && (
        <div className="draft-banner">
          <div>
            <strong>Unsaved working copy</strong> from {new Date(draft.savedAt).toLocaleString()}
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={restoreDraft}>Restore draft</button>
            <button className="btn btn-secondary" onClick={discardDraft}>Discard</button>
          </div>
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
                  {p.artifacts.activity && <span className="badge">Activity</span>}
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
