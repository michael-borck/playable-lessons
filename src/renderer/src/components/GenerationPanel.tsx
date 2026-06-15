import { useState, useEffect, useCallback } from 'react'
import { useAppStore, GenerationStage } from '../stores/appStore'
import { generateStory } from '../lib/aiService'
import { SAMPLE_INK_SOURCE } from '../lib/sampleStory'

const STAGES: { key: GenerationStage; label: string }[] = [
  { key: 'analysis', label: 'Analysis' },
  { key: 'clarification', label: 'Clarification' },
  { key: 'outline', label: 'Outline' },
  { key: 'ink-generation', label: 'Ink Generation' },
  { key: 'review', label: 'Review' },
  { key: 'compile', label: 'Compile' }
]

export default function GenerationPanel() {
  const stage = useAppStore((s) => s.generationStage)
  const log = useAppStore((s) => s.generationLog)
  const questions = useAppStore((s) => s.clarificationQuestions)
  const updateAnswer = useAppStore((s) => s.updateClarificationAnswer)
  const error = useAppStore((s) => s.error)
  const setError = useAppStore((s) => s.setError)
  const setView = useAppStore((s) => s.setCurrentView)
  const inkSource = useAppStore((s) => s.inkSource)
  const apiKey = useAppStore((s) => s.apiKey)
  const aiProvider = useAppStore((s) => s.aiProvider)
  const [isGenerating, setIsGenerating] = useState(false)

  const stageIndex = STAGES.findIndex((s) => s.key === stage)
  const awaitingClarification = stage === 'clarification' && questions.length > 0

  const needsApiKey = (aiProvider === 'claude' || aiProvider === 'openai' || aiProvider === 'auto') && !apiKey
  // Ollama needs no key, so it never sets needsApiKey in the first place.
  const canGenerate = !needsApiKey

  const startGeneration = useCallback(async () => {
    setIsGenerating(true)
    setError(null)
    try {
      await generateStory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [setError])

  useEffect(() => {
    if (stage === 'idle' && !isGenerating && canGenerate) {
      startGeneration()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleContinueAfterClarification = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      await generateStory(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const loadDemoStory = () => {
    useAppStore.getState().setInkSource(SAMPLE_INK_SOURCE)
    useAppStore.getState().setProjectName(useAppStore.getState().projectName || 'Demo Story')
    useAppStore.getState().setGenerationStage('done')
    useAppStore.getState().addGenerationLog('[Demo] Loaded sample story: "The New Project Manager"')
    useAppStore.getState().addGenerationLog('[Done] Demo story ready for preview and export.')
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Story Generation</h2>
      <p className="panel-subtitle">
        {stage === 'done'
          ? 'Generation complete!'
          : isGenerating
            ? 'Generating your interactive story...'
            : awaitingClarification
              ? 'Please answer the questions below to guide the story'
              : needsApiKey
                ? 'API key required to generate'
                : 'Ready to generate'}
      </p>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-dismiss" onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* No API key warning */}
      {needsApiKey && stage !== 'done' && (
        <div style={{
          background: 'rgba(232, 168, 56, 0.15)',
          border: '1px solid var(--warning)',
          borderRadius: 'var(--radius)',
          padding: '16px',
          marginBottom: 20,
          color: 'var(--warning)'
        }}>
          <p style={{ marginBottom: 12 }}>
            No API key configured. Set one in Settings, or switch to Ollama for local generation.
          </p>
          <div className="btn-row" style={{ marginTop: 0 }}>
            <button className="btn btn-secondary" onClick={() => setView('settings')}>
              Open Settings
            </button>
            <button className="btn btn-secondary" onClick={loadDemoStory}>
              Load Demo Story
            </button>
          </div>
        </div>
      )}

      {/* Stage progress indicator */}
      <div className="stage-indicator">
        {STAGES.map((s, i) => (
          <div
            key={s.key}
            className={`stage-dot ${i < stageIndex ? 'completed' : ''} ${i === stageIndex ? 'active' : ''}`}
            title={s.label}
          />
        ))}
      </div>

      {/* Clarification questions */}
      {awaitingClarification && (
        <div className="clarification-list">
          {questions.map((q) => (
            <div key={q.id} className="clarification-item">
              <div className="clarification-question">{q.question}</div>
              <input
                className="form-input"
                placeholder="Your answer (optional — skip to use defaults)"
                value={q.answer}
                onChange={(e) => updateAnswer(q.id, e.target.value)}
              />
            </div>
          ))}
          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleContinueAfterClarification}>
              Continue Generation
            </button>
          </div>
        </div>
      )}

      {/* Generation log */}
      <div className="gen-log">
        {log.length === 0 && !needsApiKey && <div className="gen-log-entry">Waiting to start...</div>}
        {log.length === 0 && needsApiKey && <div className="gen-log-entry">Configure an AI provider to begin generation, or load the demo story.</div>}
        {log.map((entry, i) => (
          <div
            key={i}
            className={`gen-log-entry ${
              entry.startsWith('[Stage') || entry.startsWith('[Demo') ? 'stage' : entry.startsWith('[Error') ? 'error' : entry.startsWith('[Done') ? 'success' : ''
            }`}
          >
            {entry}
          </div>
        ))}
      </div>

      {/* Ink source preview when done */}
      {stage === 'done' && inkSource && (
        <>
          <div className="form-group">
            <label className="form-label">Generated Ink Source</label>
            <textarea
              className="ink-editor"
              value={inkSource}
              onChange={(e) => useAppStore.getState().setInkSource(e.target.value)}
            />
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => setView('preview')}>
              Preview Story
            </button>
            <button className="btn btn-secondary" onClick={() => setView('graph')}>
              View Graph
            </button>
            <button className="btn btn-secondary" onClick={() => setView('export')}>
              Export
            </button>
          </div>
        </>
      )}

      {/* Retry/back buttons on error */}
      {error && !isGenerating && (
        <div className="btn-row">
          <button className="btn btn-primary" onClick={startGeneration}>
            Retry Generation
          </button>
          <button className="btn btn-secondary" onClick={loadDemoStory}>
            Load Demo Instead
          </button>
          <button className="btn btn-secondary" onClick={() => setView('input')}>
            Back to Input
          </button>
        </div>
      )}
    </div>
  )
}
