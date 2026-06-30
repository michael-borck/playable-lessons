import { useState } from 'react'
import type { FlashcardResult } from '../../../shared/generate'

/** Inline flip-card deck. Mirrors the offline HTML deck's UX (flip/nav/shuffle). */
export default function FlashcardDeck({ result }: { result: FlashcardResult }) {
  const [cards, setCards] = useState(result.cards)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

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
        <button className="btn btn-secondary" disabled={idx === 0} onClick={() => go(-1)}>‹ Prev</button>
        <button className="btn btn-primary" onClick={flip}>Flip</button>
        <button className="btn btn-secondary" disabled={idx === cards.length - 1} onClick={() => go(1)}>Next ›</button>
        <button className="btn btn-secondary" onClick={shuffle}>Shuffle</button>
        <button className="btn btn-secondary" onClick={restart}>Restart</button>
      </div>
      <p className="study-hint">Click the card or press Space to flip · ← → to navigate</p>
    </div>
  )
}
