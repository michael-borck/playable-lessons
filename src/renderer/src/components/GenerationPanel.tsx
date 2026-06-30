import { useState, useEffect, useCallback } from 'react'
import { useAppStore, GenerationStage, GenerationTarget } from '../stores/appStore'
import { generateStory, generateFlashcardsGUI, generateQuizGUI, generateSummaryGUI, generateAiTaskGUI, generateCaseStudyGUI, generatePlanGUI } from '../lib/aiService'
import { SAMPLE_INK_SOURCE } from '../lib/sampleStory'

const STAGES: { key: GenerationStage; label: string }[] = [
  { key: 'analysis', label: 'Analysis' },
  { key: 'clarification', label: 'Clarification' },
  { key: 'outline', label: 'Outline' },
  { key: 'ink-generation', label: 'Ink Generation' },
  { key: 'review', label: 'Review' },
  { key: 'compile', label: 'Compile' }
]

const TARGETS: { key: GenerationTarget; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'flashcards', label: 'Flashcards' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'summary', label: 'Summary' },
  { key: 'ai-task', label: 'AI Task' },
  { key: 'case-study', label: 'Case Study' },
  { key: 'plan', label: 'Plan' }
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
  const target = useAppStore((s) => s.generationTarget)
  const setTarget = useAppStore((s) => s.setGenerationTarget)
  const flashcards = useAppStore((s) => s.flashcards)
  const quiz = useAppStore((s) => s.quiz)
  const summary = useAppStore((s) => s.summary)
  const aiTask = useAppStore((s) => s.aiTask)
  const caseStudy = useAppStore((s) => s.caseStudy)
  const plan = useAppStore((s) => s.plan)
  const inputText = useAppStore((s) => s.inputText)
  const [isGenerating, setIsGenerating] = useState(false)
  const [count, setCount] = useState(12)
  const [depth, setDepth] = useState<'idea' | 'outline' | 'complete'>('complete')

  const stageIndex = STAGES.findIndex((s) => s.key === stage)
  const awaitingClarification = stage === 'clarification' && questions.length > 0

  const needsApiKey = (aiProvider === 'claude' || aiProvider === 'openai' || aiProvider === 'auto') && !apiKey
  // Ollama needs no key, so it never sets needsApiKey in the first place.
  const canGenerate = !needsApiKey
  const hasInput = inputText.trim().length > 0

  // For non-story targets, the "done" signal is the matching artifact in the store.
  const artifact = target === 'flashcards' ? flashcards : target === 'quiz' ? quiz : target === 'summary' ? summary : target === 'ai-task' ? aiTask : target === 'case-study' ? caseStudy : target === 'plan' ? plan : null
  const artifactCount = target === 'flashcards'
    ? flashcards?.cards.length
    : target === 'quiz'
      ? quiz?.questions.length
      : target === 'summary'
        ? summary?.keyPoints.length
          : target === 'ai-task'
            ? aiTask?.tasks.length
            : target === 'plan'
              ? plan?.recommendations.length
              : undefined

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
    // Auto-start only applies to the story pipeline (flashcards/quiz are explicit).
    if (target === 'story' && stage === 'idle' && !isGenerating && canGenerate) {
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

  const startArtifact = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      if (target === 'flashcards') await generateFlashcardsGUI(count)
      else if (target === 'quiz') await generateQuizGUI(count)
      else if (target === 'summary') await generateSummaryGUI(count)
      else if (target === 'ai-task') await generateAiTaskGUI(count)
      else if (target === 'case-study') await generateCaseStudyGUI(depth)
      else if (target === 'plan') await generatePlanGUI()
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
      <h2 className="panel-title">Generation</h2>

      {/* Target selector */}
      <div className="form-group">
        <label className="form-label">What to generate</label>
        <div className="btn-row target-selector">
          {TARGETS.map((t) => (
            <button
              key={t.key}
              className={`btn ${target === t.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTarget(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-dismiss" onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {target === 'story' ? (
        <>
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
        </>
      ) : (
        <>
          <p className="panel-subtitle">
            {isGenerating
              ? `Generating ${target === 'flashcards' ? 'flashcards' : target === 'quiz' ? 'a quiz' : target === 'summary' ? 'a summary' : target === 'ai-task' ? 'AI tasks' : target === 'case-study' ? 'a case study' : 'a plan'}...`
              : artifact
                ? (target === 'case-study' ? 'Case study ready' : target === 'plan' ? `${artifactCount} recommendations` : `${artifactCount} ${target === 'flashcards' ? 'flashcards' : target === 'quiz' ? 'questions' : target === 'summary' ? 'key points' : 'tasks'} ready`)
                : needsApiKey
                  ? 'API key required to generate'
                  : 'Ready to generate'}
          </p>

          {needsApiKey ? (
            <div className="form-group" style={{ color: 'var(--warning)' }}>
              No API key configured. Set one in Settings, or switch to Ollama for local generation.
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => setView('settings')}>Open Settings</button>
              </div>
            </div>
          ) : target === 'case-study' ? (
            <div className="form-group">
              <label className="form-label">Depth</label>
              <select className="form-input" value={depth} onChange={(e) => setDepth(e.target.value as 'idea' | 'outline' | 'complete')}>
                <option value="idea">Idea — a brief premise</option>
                <option value="outline">Outline — a structured skeleton</option>
                <option value="complete">Complete — a full case study</option>
              </select>
            </div>
          ) : target === 'plan' ? null : (
            <div className="form-group">
              <label className="form-label">
                {target === 'flashcards' ? 'Number of flashcards' : target === 'quiz' ? 'Number of questions' : target === 'summary' ? 'Number of key points' : 'Number of tasks'}
              </label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                style={{ width: 100 }}
              />
            </div>
          )}

          {/* Generation log */}
          <div className="gen-log">
            {log.length === 0 && !needsApiKey && <div className="gen-log-entry">Waiting to start...</div>}
            {log.map((entry, i) => (
              <div
                key={i}
                className={`gen-log-entry ${
                  entry.startsWith('[Done') ? 'success' : entry.startsWith('[Error') ? 'error' : entry.startsWith('[Stage') || entry.startsWith('[1/') ? 'stage' : ''
                }`}
              >
                {entry}
              </div>
            ))}
          </div>

          {!needsApiKey && !isGenerating && (
            <div className="btn-row">
              {!artifact ? (
                <button className="btn btn-primary" disabled={!hasInput} onClick={startArtifact}>
                  Generate {target === 'flashcards' ? 'Flashcards' : target === 'quiz' ? 'Quiz' : target === 'summary' ? 'Summary' : target === 'ai-task' ? 'AI Tasks' : target === 'case-study' ? 'Case Study' : 'Plan'}
                </button>
              ) : (
                <>
                  <button className="btn btn-primary" onClick={() => setView('study')}>View in Study</button>
                  <button className="btn btn-secondary" onClick={() => setView('export')}>Export</button>
                  <button className="btn btn-secondary" onClick={startArtifact}>Regenerate</button>
                </>
              )}
              <button className="btn btn-secondary" onClick={() => setView('input')}>Back to Input</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
