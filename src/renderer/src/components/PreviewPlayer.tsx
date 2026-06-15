import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import { compileInk } from '../lib/inkCompiler'
import { parseInkSource } from '../lib/inkParser'

interface StoryState {
  text: string[]
  choices: { index: number; text: string }[]
  ended: boolean
  tags: string[]
}

export default function PreviewPlayer() {
  const inkSource = useAppStore((s) => s.inkSource)
  const [story, setStory] = useState<any>(null)
  const [storyState, setStoryState] = useState<StoryState>({
    text: [],
    choices: [],
    ended: false,
    tags: []
  })
  const [history, setHistory] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showVarInspector, setShowVarInspector] = useState(false)
  const [variables, setVariables] = useState<Record<string, any>>({})

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerRemaining, setTimerRemaining] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Ending type
  const [endingType, setEndingType] = useState<string | null>(null)

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<{ label: string; state: string }[]>([])

  // Holds the latest makeChoice so the timer's interval never calls a stale
  // closure (it's defined below and assigned on every render).
  const makeChoiceRef = useRef<(index: number) => void>(() => {})

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setTimerSeconds(0)
    setTimerRemaining(0)
  }, [])

  const readVariables = useCallback((storyInstance: any) => {
    const parsed = parseInkSource(inkSource)
    const vars: Record<string, any> = {}
    for (const v of parsed.variables) {
      try {
        vars[v.name] = storyInstance.variablesState.$(v.name)
      } catch {
        vars[v.name] = v.initialValue
      }
    }
    setVariables(vars)
  }, [inkSource])

  const continueStory = useCallback((storyInstance: any) => {
    const text: string[] = []
    const tags: string[] = []

    while (storyInstance.canContinue) {
      const line = storyInstance.Continue()
      if (line.trim()) text.push(line)
      if (storyInstance.currentTags) {
        tags.push(...storyInstance.currentTags)
      }
    }

    // Check for timer tag
    clearTimer()
    const timerTag = tags.find((t) => t.startsWith('TIMER:'))
    if (timerTag) {
      const seconds = parseInt(timerTag.replace('TIMER:', '').trim())
      if (seconds > 0 && storyInstance.currentChoices.length > 0) {
        setTimerSeconds(seconds)
        setTimerRemaining(seconds)
      }
    }

    // Check for ending tag
    const endingTag = tags.find((t) => t.startsWith('ENDING:'))
    setEndingType(endingTag ? endingTag.replace('ENDING:', '').trim() : null)

    setStoryState({
      text,
      choices: storyInstance.currentChoices.map((c: any, i: number) => ({
        index: i,
        text: c.text
      })),
      ended: !storyInstance.canContinue && storyInstance.currentChoices.length === 0,
      tags
    })

    readVariables(storyInstance)
  }, [clearTimer, readVariables])

  const loadStory = useCallback(async () => {
    if (!inkSource.trim()) {
      setError('No story to preview. Generate a story first.')
      return
    }
    try {
      setError(null)
      clearTimer()
      const compiled = await compileInk(inkSource)
      const { Story } = await import('inkjs/engine/Story')
      const storyInstance = new Story(compiled)
      setStory(storyInstance)
      setHistory([])
      setEndingType(null)
      continueStory(storyInstance)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load story')
    }
  }, [inkSource, continueStory, clearTimer])

  useEffect(() => {
    loadStory()
    return () => clearTimer()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Timer countdown
  useEffect(() => {
    if (timerRemaining > 0 && storyState.choices.length > 0) {
      timerRef.current = setInterval(() => {
        setTimerRemaining((prev) => {
          if (prev <= 1) {
            // Time's up — auto-select first choice
            clearTimer()
            if (story && storyState.choices.length > 0) {
              makeChoiceRef.current(0)
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
  }, [timerRemaining, storyState.choices.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const makeChoice = (index: number) => {
    if (!story) return
    clearTimer()
    setHistory((h) => [...h, story.state.toJson()])
    story.ChooseChoiceIndex(index)
    continueStory(story)
  }
  makeChoiceRef.current = makeChoice

  const undo = () => {
    if (!story || history.length === 0) return
    clearTimer()
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    story.state.LoadJson(prev)
    continueStory(story)
  }

  const restart = () => {
    if (!story) return
    clearTimer()
    story.ResetState()
    setHistory([])
    setEndingType(null)
    continueStory(story)
  }

  const saveBookmark = () => {
    if (!story) return
    setBookmarks((b) => [...b, { label: `Turn ${history.length + 1}`, state: story.state.toJson() }])
  }

  const loadBookmark = (state: string) => {
    if (!story) return
    clearTimer()
    story.state.LoadJson(state)
    setHistory([])
    continueStory(story)
  }

  if (error) {
    return (
      <div className="panel">
        <h2 className="panel-title">Preview</h2>
        <div className="error-banner"><span>{error}</span></div>
        <button className="btn btn-primary" onClick={loadStory}>Retry</button>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Preview</h2>

      <div className="player-controls">
        <button className="btn btn-secondary" onClick={restart}>Restart</button>
        <button className="btn btn-secondary" onClick={undo} disabled={history.length === 0}>Undo</button>
        <button className="btn btn-secondary" onClick={loadStory}>Reload</button>
        <button className="btn btn-secondary" onClick={saveBookmark}>Bookmark</button>
        <button
          className={`btn btn-secondary ${showVarInspector ? 'active' : ''}`}
          onClick={() => setShowVarInspector(!showVarInspector)}
          style={showVarInspector ? { background: 'var(--accent-dim)' } : {}}
        >
          Variables
        </button>
      </div>

      {/* Bookmarks */}
      {bookmarks.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {bookmarks.map((b, i) => (
            <button
              key={i}
              className="btn btn-secondary"
              onClick={() => loadBookmark(b.state)}
              style={{ padding: '2px 8px', fontSize: 11 }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      <div className="player-container">
        {/* Timer display */}
        {timerSeconds > 0 && timerRemaining > 0 && (
          <div className="timer-display">
            <div className="timer-bar">
              <div
                className="timer-bar-fill"
                style={{ width: `${(timerRemaining / timerSeconds) * 100}%` }}
              />
            </div>
            <div className={`timer-text ${timerRemaining <= 5 ? 'urgent' : ''}`}>
              {timerRemaining}s remaining
            </div>
          </div>
        )}

        {/* Images */}
        {storyState.tags
          .filter((t) => t.startsWith('IMAGE:'))
          .map((t, i) => (
            <img
              key={i}
              src={t.replace('IMAGE:', '').trim()}
              alt=""
              style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 16 }}
            />
          ))}

        {/* Story text */}
        <div className="player-text">
          {storyState.text.map((line, i) => (
            <p key={i} style={{ marginBottom: 12 }}>{line}</p>
          ))}
        </div>

        {/* Choices */}
        {storyState.choices.length > 0 && (
          <div className="player-choices">
            {storyState.choices.map((c) => (
              <button key={c.index} className="player-choice" onClick={() => makeChoice(c.index)}>
                {c.text}
              </button>
            ))}
          </div>
        )}

        {/* Ending */}
        {storyState.ended && (
          <>
            {endingType && (
              <div className={`ending-display ${endingType}`}>
                <div className="ending-label">{endingType} ending</div>
              </div>
            )}
            <div className="player-ending">
              <p>-- End of Story --</p>
              <button className="btn btn-primary" onClick={restart} style={{ marginTop: 16 }}>
                Play Again
              </button>
            </div>
          </>
        )}
      </div>

      {/* Variable Inspector */}
      {showVarInspector && (
        <div className="variable-inspector">
          <div className="variable-inspector-title">Variable Inspector</div>
          {Object.entries(variables).map(([name, value]) => (
            <div key={name} className="var-inspector-row">
              <span className="var-inspector-name">{name}</span>
              <span className="var-inspector-value">{String(value)}</span>
            </div>
          ))}
          {Object.keys(variables).length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No variables in this story</div>
          )}
        </div>
      )}
    </div>
  )
}
