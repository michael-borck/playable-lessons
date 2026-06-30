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

type View = 'input' | 'generation' | 'graph' | 'preview' | 'study' | 'export' | 'settings' | 'projects'

function App(): React.ReactElement {
  const view = useAppStore((s) => s.currentView)
  const setView = useAppStore((s) => s.setCurrentView)
  const projectName = useAppStore((s) => s.projectName)

  // Load secrets from the OS keychain into memory for this session.
  useEffect(() => {
    const store = useAppStore.getState()
    window.api.getSecret('apiKey').then((v) => { if (v) store.setApiKey(v) })
    window.api.getSecret('ollamaToken').then((v) => { if (v) store.setOllamaToken(v) })
    window.api.getSecret('customApiKey').then((v) => { if (v) store.setCustomApiKey(v) })
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Playable Lessons</h1>
        {projectName && <span className="project-name">{projectName}</span>}
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
