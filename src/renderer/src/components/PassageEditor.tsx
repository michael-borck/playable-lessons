import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { parseInkSource, updateKnotContent, type InkKnot } from '../lib/inkParser'
import { generateSceneImage } from '../lib/aiService'

export default function PassageEditor() {
  const selectedNodeId = useAppStore((s) => s.selectedNodeId)
  const inkSource = useAppStore((s) => s.inkSource)
  const applyInkEdit = useAppStore((s) => s.applyInkEdit)
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId)

  const parsed = useMemo(() => parseInkSource(inkSource), [inkSource])
  const knot = parsed.knots.find((k) => k.id === selectedNodeId)

  const [editContent, setEditContent] = useState('')
  const [timerValue, setTimerValue] = useState(0)
  const [endingType, setEndingType] = useState('')
  const [imagePath, setImagePath] = useState<string | null>(null)
  const sceneImages = useAppStore((s) => s.sceneImages)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  useEffect(() => {
    if (knot) {
      // The IMAGE tag is managed by its own control (a data URL is far too
      // large to edit as raw text), so keep it out of the textarea.
      setEditContent(stripImageTag(knot.rawContent))
      setTimerValue(knot.timerSeconds)
      setEndingType(knot.endingType || '')
      setImagePath(knot.imagePath)
    }
  }, [selectedNodeId, knot?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedNodeId || !knot) {
    return (
      <div className="passage-editor-empty">
        <p>Click a node to edit its passage</p>
      </div>
    )
  }

  const handleSave = () => {
    // Tags managed by dedicated controls are stripped from the textarea and
    // rebuilt here, so users cannot accidentally lose or paste over them.
    let content = stripImageTag(editContent)

    content = content.replace(/^#\s*TIMER:\s*\d+\s*$/m, '')
    if (timerValue > 0) {
      content = `# TIMER: ${timerValue}\n${content.trim()}`
    }

    content = content.replace(/^#\s*ENDING:\s*\w+\s*$/m, '')
    if (endingType) {
      content = `# ENDING: ${endingType}\n${content.trim()}`
    }

    if (imagePath) {
      content = `# IMAGE: ${imagePath}\n${content.trim()}`
    }

    const newSource = updateKnotContent(inkSource, selectedNodeId, content.trim())
    applyInkEdit(newSource)
  }

  return (
    <div className="passage-editor">
      <div className="passage-editor-header">
        <h3 className="passage-editor-title">{knot.title}</h3>
        <button className="btn btn-secondary" onClick={() => setSelectedNodeId(null)} style={{ padding: '4px 12px', fontSize: 12 }}>
          Close
        </button>
      </div>

      <div className="passage-editor-meta">
        <div className="form-group" style={{ marginBottom: 8 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Timer (seconds, 0 = none)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            value={timerValue}
            onChange={(e) => setTimerValue(parseInt(e.target.value) || 0)}
            style={{ width: 100, padding: '4px 8px', fontSize: 13 }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 8 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Ending Type</label>
          <select
            className="form-select"
            value={endingType}
            onChange={(e) => setEndingType(e.target.value)}
            style={{ width: 140, padding: '4px 8px', fontSize: 13 }}
          >
            <option value="">Not an ending</option>
            <option value="good">Good</option>
            <option value="neutral">Neutral</option>
            <option value="bad">Bad</option>
          </select>
        </div>
      </div>

      {/* Generated scene image (from a # IMAGE_PROMPT: tag) */}
      {knot.imagePrompt && (
        <div style={{ marginBottom: 8 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Scene Image</label>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {sceneImages[knot.imagePrompt] ? (
              <img
                src={sceneImages[knot.imagePrompt]}
                alt={knot.imagePrompt}
                style={{ width: 160, borderRadius: 6, display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: 160,
                  padding: '12px 8px',
                  border: '1px dashed var(--border, #3a3a5c)',
                  borderRadius: 6,
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  fontStyle: 'italic'
                }}
              >
                Not generated
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                className="btn btn-secondary"
                disabled={imageBusy}
                onClick={async () => {
                  setImageBusy(true)
                  setImageError(null)
                  try {
                    await generateSceneImage(knot.imagePrompt!)
                  } catch (err) {
                    setImageError(err instanceof Error ? err.message : 'Image generation failed')
                  } finally {
                    setImageBusy(false)
                  }
                }}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                {imageBusy ? 'Generating…' : sceneImages[knot.imagePrompt] ? 'Regenerate' : 'Generate Image'}
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 320 }}>
                {knot.imagePrompt}
              </div>
              {imageError && (
                <div style={{ fontSize: 11, color: 'var(--error)' }}>{imageError}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image attachment */}
      <div style={{ marginBottom: 8 }}>
        <label className="form-label" style={{ fontSize: 11 }}>Image</label>
        {imagePath ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {/^(data:|https?:)/.test(imagePath) && (
              <img
                src={imagePath}
                alt="Attached"
                style={{ width: 120, borderRadius: 6, display: 'block' }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all', maxWidth: 320 }}>
                {imagePath.startsWith('data:') ? 'Embedded image' : imagePath}
              </span>
              <button
                onClick={() => setImagePath(null)}
                style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: 11, textAlign: 'left' }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={async () => {
              setImageError(null)
              try {
                const result = await window.api.importImage()
                if (result) setImagePath(result.dataUrl)
              } catch (err) {
                setImageError(err instanceof Error ? err.message : 'Could not attach the image')
              }
            }}
            style={{ padding: '4px 10px', fontSize: 11 }}
          >
            Attach Image
          </button>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          Local images are embedded as data URLs so previews and exports work offline.
        </div>
      </div>

      <div className="passage-editor-body">
        <textarea
          className="passage-editor-textarea"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          spellCheck={false}
        />
        <div className="passage-editor-preview">
          <div className="passage-preview-label">Preview</div>
          <PassagePreview content={editContent} knot={knot} />
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        <button className="btn btn-secondary" onClick={() => {
          setEditContent(stripImageTag(knot.rawContent))
          setTimerValue(knot.timerSeconds)
          setEndingType(knot.endingType || '')
          setImagePath(knot.imagePath)
        }}>
          Revert
        </button>
      </div>
    </div>
  )
}

/** Remove IMAGE tags from editable prose (the dedicated control owns them). */
function stripImageTag(content: string): string {
  return content
    .replace(/^#\s*IMAGE:\s*.+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function PassagePreview({ content }: { content: string; knot: InkKnot }) {
  const lines = content.split('\n')

  return (
    <div className="passage-preview-content">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return null
        if (trimmed.startsWith('#')) {
          return <div key={i} className="preview-tag">{trimmed}</div>
        }
        if (trimmed.startsWith('*') || trimmed.startsWith('+')) {
          const choiceMatch = trimmed.match(/^[*+]\s*(?:\{[^}]+\}\s*)?\[([^\]]*)\]/)
          if (choiceMatch) {
            return <div key={i} className="preview-choice">&rarr; {choiceMatch[1]}</div>
          }
        }
        if (trimmed.startsWith('~')) {
          return <div key={i} className="preview-assignment">{trimmed}</div>
        }
        if (trimmed.startsWith('->')) {
          return <div key={i} className="preview-divert">{trimmed}</div>
        }
        if (trimmed.startsWith('{')) {
          return <div key={i} className="preview-conditional">{trimmed}</div>
        }
        return <div key={i} className="preview-text">{trimmed}</div>
      })}
    </div>
  )
}
