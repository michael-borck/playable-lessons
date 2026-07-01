import { useState, useEffect } from 'react'
import type { FlashcardResult } from '../../../shared/generate'
import { useAppStore } from '../stores/appStore'

/** Inline flip-card deck. When editable, shows a list editor instead. */
export default function FlashcardDeck({ result, editable }: { result: FlashcardResult; editable?: boolean }) {
  const setFlashcards = useAppStore((s) => s.setFlashcards)
  const [cards, setCards] = useState(result.cards)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  // Sync local state when leaving edit mode (the store may have changed).
  useEffect(() => {
    if (!editable) {
      setCards(result.cards)
      setIdx(0)
      setFlipped(false)
    }
  }, [editable]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Editable mode: list of editable cards ───
  if (editable) {
    const updateCard = (i: number, field: 'front' | 'back' | 'hint' | 'tag', value: string) => {
      setFlashcards({
        ...result,
        cards: result.cards.map((c, j) => (j === i ? { ...c, [field]: value } : c))
      })
    }
    const addCard = () => setFlashcards({ ...result, cards: [...result.cards, { front: '', back: '' }] })
    const deleteCard = (i: number) =>
      setFlashcards({ ...result, cards: result.cards.filter((_, j) => j !== i) })

    return (
      <div className="deck-editor">
        {result.cards.map((c, i) => (
          <div className="edit-card" key={i}>
            <div className="edit-card-head">
              <span className="edit-card-no">Card {i + 1}</span>
              <button className="btn btn-secondary edit-delete" onClick={() => deleteCard(i)}>Delete</button>
            </div>
            <textarea className="edit-input" value={c.front} onChange={(e) => updateCard(i, 'front', e.target.value)} placeholder="Front (question or term)" rows={2} />
            <textarea className="edit-input" value={c.back} onChange={(e) => updateCard(i, 'back', e.target.value)} placeholder="Back (answer)" rows={2} />
            <input className="edit-input" value={c.hint ?? ''} onChange={(e) => updateCard(i, 'hint', e.target.value)} placeholder="Hint (optional)" />
            <input className="edit-input" value={c.tag ?? ''} onChange={(e) => updateCard(i, 'tag', e.target.value)} placeholder="Tag (optional)" />
          </div>
        ))}
        <button className="btn btn-secondary" onClick={addCard}>+ Add card</button>
      </div>
    )
  }

  // ─── Read-only mode: flip-card study UX ───
  const card = cards[idx]
  if (!card) return null

  const go = (n: number) => {
    const j = idx + n
    if (j < 0 || j >= cards.length) return
    setIdx(j)
    setFlipped(false)
  }
  const shuffle = () => {
    const a = [...cards]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    setCards(a)
    setIdx(0)
    setFlipped(false)
  }
  const restart = () => {
    setIdx(0)
    setFlipped(false)
  }
  const flip = () => setFlipped((f) => !f)

  return (
    <div className="deck">
      <div className="deck-progress">Card {idx + 1} of {cards.length}</div>
      <div
        className={`flashcard ${flipped ? 'flipped' : ''}`}
        role="button"
        tabIndex={0}
        onClick={flip}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            flip()
          }
        }}
      >
        <div className="flashcard-label">{flipped ? 'Back' : 'Front'}</div>
        <div className="flashcard-text">{flipped ? card.back : card.front}</div>
        {flipped && card.hint && <div className="flashcard-hint">Hint: {card.hint}</div>}
      </div>
      <div className="btn-row deck-controls">
        <button className="btn btn-secondary" disabled={idx === 0} onClick={() => go(-1)}>&lsaquo; Prev</button>
        <button className="btn btn-primary" onClick={flip}>Flip</button>
        <button className="btn btn-secondary" disabled={idx === cards.length - 1} onClick={() => go(1)}>Next &rsaquo;</button>
        <button className="btn btn-secondary" onClick={shuffle}>Shuffle</button>
        {result.cards.length > 5 && (
          <button className="btn btn-secondary" onClick={() => {
            const shuffled = [...result.cards]
            for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] }
            setCards(shuffled.slice(0, 5)); setIdx(0); setFlipped(false)
          }}>Random 5</button>
        )}
        <button className="btn btn-secondary" onClick={restart}>Restart</button>
      </div>
      <p className="study-hint">Click the card or press Space to flip · ← → to navigate</p>
    </div>
  )
}
