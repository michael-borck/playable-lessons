import { useState } from 'react'
import { refineTextGUI } from '../lib/aiService'

/**
 * A small "✨ Improve" button for editable fields. Click ✨ to AI-refine the
 * text with a default instruction; click 💬 to add a custom direction first
 * (e.g. "simplify for beginners"). Shows ⏳ while waiting for the LLM.
 */
export default function RefineButton({
  text,
  onRefine,
  defaultInstruction
}: {
  text: string
  onRefine: (improved: string) => void
  defaultInstruction: string
}) {
  const [loading, setLoading] = useState(false)
  const [showDir, setShowDir] = useState(false)
  const [direction, setDirection] = useState('')

  const handleRefine = async () => {
    if (!text.trim() || loading) return
    setLoading(true)
    try {
      const improved = await refineTextGUI(text, direction.trim() || defaultInstruction)
      onRefine(improved)
    } catch {
      /* silent — user can retry or edit manually */
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="refine-row">
      {showDir && (
        <input
          className="edit-input refine-direction"
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder="Direction (e.g. 'simplify for beginners')..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleRefine()
            }
          }}
        />
      )}
      <button
        className="btn btn-secondary refine-btn"
        disabled={loading || !text.trim()}
        onClick={handleRefine}
        title="AI-refine this text"
      >
        {loading ? '⏳' : '✨'}
      </button>
      <button
        className="btn btn-secondary refine-dir-btn"
        onClick={() => setShowDir(!showDir)}
        title={showDir ? 'Hide direction' : 'Add a custom direction'}
      >
        {showDir ? '×' : '💬'}
      </button>
    </div>
  )
}
