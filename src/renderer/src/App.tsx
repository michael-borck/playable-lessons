import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import InputPanel from './components/InputPanel'
import GenerationPanel from './components/GenerationPanel'
import PreviewPlayer from './components/PreviewPlayer'
import StudyView from './components/StudyView'
import NodeEditor from './components/NodeEditor'
import ExportPanel from './components/ExportPanel'
import SettingsPanel from './components/SettingsPanel'
import ProjectsView from './components/ProjectsView'
import { useAutosave } from './lib/autosave'

type View = 'input' | 'generation' | 'graph' | 'preview' | 'study' | 'export' | 'settings' | 'projects'

function App(): React.ReactElement {
  const view = useAppStore((s) => s.currentView)
  const setView = useAppStore((s) => s.setCurrentView)
  const projectName = useAppStore((s) => s.projectName)
  const autosave = useAutosave()

  // Load secrets from the OS keychain into memory for this session.
  useEffect(() => {
    const store = useAppStore.getState()
    const load = (key: string, apply: (v: string) => void) => {
      window.api.getSecret(key).then((v) => { if (v) apply(v) }).catch(() => {})
    }
    load('apiKey', store.setApiKey)
    load('ollamaToken', store.setOllamaToken)
    load('customApiKey', store.setCustomApiKey)
    load('imageApiKey', store.setImageApiKey)
    load('geminiApiKey', store.setGeminiApiKey)
  }, [])

  // Source-level undo/redo. Leave native undo alone while typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) useAppStore.getState().redoInk()
        else useAppStore.getState().undoInk()
      } else if (key === 'y') {
        e.preventDefault()
        useAppStore.getState().redoInk()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Playable Lessons</h1>
        {projectName && <span className="project-name">{projectName}</span>}
        {autosave.status === 'pending' && <span className="autosave-status">Unsaved changes</span>}
        {autosave.status === 'saving' && <span className="autosave-status">Saving draft…</span>}
        {autosave.status === 'saved' && autosave.savedAt && (
          <span className="autosave-status saved">
            Draft saved {new Date(autosave.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {autosave.status === 'error' && <span className="autosave-status error">Draft save failed</span>}
        <nav className="app-nav">
          <NavButton view="projects" current={view} onClick={setView}>Projects</NavButton>
          <NavButton view="input" current={view} onClick={setView}>Input</NavButton>
          <NavButton view="generation" current={view} onClick={setView}>Generate</NavButton>
          <NavButton view="graph" current={view} onClick={setView}>Editor</NavButton>
          <NavButton view="preview" current={view} onClick={setView}>Preview</NavButton>
          <NavButton view="study" current={view} onClick={setView}>Study</NavButton>
          <NavButton view="export" current={view} onClick={setView}>Export</NavButton>
          <NavButton view="settings" current={view} onClick={setView}>Settings</NavButton>
        </nav>
      </header>
      <main className={`app-main ${view === 'graph' ? 'no-padding' : ''}`}>
        {view === 'projects' && <ProjectsView />}
        {view === 'input' && <InputPanel />}
        {view === 'generation' && <GenerationPanel />}
        {view === 'graph' && <NodeEditor />}
        {view === 'preview' && <PreviewPlayer />}
        {view === 'study' && <StudyView />}
        {view === 'export' && <ExportPanel />}
        {view === 'settings' && <SettingsPanel />}
      </main>
    </div>
  )
}

function NavButton({
  view,
  current,
  onClick,
  children
}: {
  view: View
  current: View
  onClick: (v: View) => void
  children: React.ReactNode
}) {
  return (
    <button
      className={`nav-btn ${current === view ? 'active' : ''}`}
      onClick={() => onClick(view)}
    >
      {children}
    </button>
  )
}

export default App
