import { useAppStore, InputMode } from '../stores/appStore'

const INPUT_MODES: { mode: InputMode; title: string; desc: string }[] = [
  { mode: 'topic', title: 'Topic', desc: 'A word or phrase to build a scenario around' },
  { mode: 'lesson', title: 'Lesson to Learn', desc: 'A moral or insight the story should reveal' },
  { mode: 'methodology', title: 'Methodology', desc: 'A process or framework to map to story beats' },
  { mode: 'case-study', title: 'Case Study', desc: 'A real or fictional case retold as lived experience' },
  { mode: 'lecture-notes', title: 'Lecture Notes', desc: 'Pasted text restructured as interactive narrative' },
  { mode: 'scenario', title: 'Scenario', desc: 'A "you are..." situation that branches forward' }
]

export default function InputPanel() {
  const inputMode = useAppStore((s) => s.inputMode)
  const setInputMode = useAppStore((s) => s.setInputMode)
  const inputText = useAppStore((s) => s.inputText)
  const setInputText = useAppStore((s) => s.setInputText)
  const projectName = useAppStore((s) => s.projectName)
  const setProjectName = useAppStore((s) => s.setProjectName)
  const setView = useAppStore((s) => s.setCurrentView)
  const storyLength = useAppStore((s) => s.storyLength)
  const setStoryLength = useAppStore((s) => s.setStoryLength)
  const branchingStyle = useAppStore((s) => s.branchingStyle)
  const setBranchingStyle = useAppStore((s) => s.setBranchingStyle)
  const sceneImagesEnabled = useAppStore((s) => s.sceneImagesEnabled)
  const setSceneImagesEnabled = useAppStore((s) => s.setSceneImagesEnabled)
  const imageStyle = useAppStore((s) => s.imageStyle)
  const setImageStyle = useAppStore((s) => s.setImageStyle)

  const canProceed = inputText.trim().length > 0

  const handleUpload = async () => {
    const result = await window.api.openFile([
      { name: 'Text Files', extensions: ['txt', 'md', 'doc'] }
    ])
    if (result) {
      setInputText(result.content)
      if (!projectName) {
        const name = result.filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || ''
        setProjectName(name)
      }
    }
  }

  return (
    <div className="panel">
      <h2 className="panel-title">New Story</h2>
      <p className="panel-subtitle">Select an input mode and provide your source material</p>

      <div className="form-group">
        <label className="form-label">Project Name</label>
        <input
          className="form-input"
          type="text"
          placeholder="My Interactive Story"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Input Mode</label>
        <div className="mode-grid">
          {INPUT_MODES.map((m) => (
            <div
              key={m.mode}
              className={`mode-card ${inputMode === m.mode ? 'selected' : ''}`}
              onClick={() => setInputMode(m.mode)}
            >
              <div className="mode-card-title">{m.title}</div>
              <div className="mode-card-desc">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Story Length</label>
        <select
          className="form-select"
          value={storyLength}
          onChange={(e) => setStoryLength(e.target.value as 'short' | 'medium' | 'long')}
        >
          <option value="short">Short (~5 nodes)</option>
          <option value="medium">Medium (~15 nodes)</option>
          <option value="long">Long (~30+ nodes)</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Output Compatibility</label>
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={branchingStyle === 'branching'}
            onChange={(e) => setBranchingStyle(e.target.checked ? 'branching' : 'stateful')}
          />
          <span>H5P / LMS compatible</span>
        </label>
        <p className="form-hint">
          {branchingStyle === 'branching'
            ? 'The story becomes a simpler choice tree (no scene memory) so it can be exported as an .h5p file for LMS import.'
            : 'Default: a rich story with a memory — later scenes react to the choices made earlier. Tick only if you need an .h5p file (Moodle, Canvas, etc.).'}
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Scene Images</label>
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={sceneImagesEnabled}
            onChange={(e) => setSceneImagesEnabled(e.target.checked)}
          />
          <span>Generate an illustration for every scene</span>
        </label>
        {sceneImagesEnabled && (
          <div style={{ marginTop: 8 }}>
            <select
              className="form-select"
              value={imageStyle}
              onChange={(e) => setImageStyle(e.target.value as 'cartoon' | 'photorealistic')}
            >
              <option value="cartoon">Cartoon — flat storybook illustration</option>
              <option value="photorealistic">Photorealistic — cinematic photo</option>
            </select>
          </div>
        )}
        <p className="form-hint">
          {sceneImagesEnabled
            ? 'Each passage gets a generated image, shown in the preview and embedded in HTML exports. Configure the image provider in Settings.'
            : 'Off by default: the story is text-only. Tick to add a generated illustration to every scene.'}
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Source Material</label>
        <textarea
          className="form-textarea"
          placeholder={getPlaceholder(inputMode)}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={handleUpload}>
          Upload File
        </button>
        <button
          className="btn btn-primary"
          disabled={!canProceed}
          onClick={() => setView('generation')}
        >
          Generate Story
        </button>
      </div>
    </div>
  )
}

function getPlaceholder(mode: InputMode): string {
  switch (mode) {
    case 'topic': return 'Enter a topic, e.g. "supply chain resilience" or "ethical AI deployment"...'
    case 'lesson': return 'Enter the lesson or insight, e.g. "moving fast without experience costs you later"...'
    case 'methodology': return 'Describe the methodology, e.g. "Design Thinking: Empathize, Define, Ideate, Prototype, Test"...'
    case 'case-study': return 'Paste or describe your case study...'
    case 'lecture-notes': return 'Paste your lecture notes, handout, or worksheet content...'
    case 'scenario': return 'Describe the scenario, e.g. "You are a new project manager at a tech startup..."...'
  }
}
