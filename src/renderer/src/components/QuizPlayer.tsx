import { useState } from 'react'
import type { QuizResult } from '../../../shared/generate'
import { quizLetter } from '../../../shared/generate'
import { useAppStore } from '../stores/appStore'

const QUIZ_SIZE = 5

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Inline multiple-choice quiz. Supports one-at-a-time and all-on-page modes.
 *  Randomly selects QUIZ_SIZE questions from the full set; restart = new random set. */
export default function QuizPlayer({ result, editable }: { result: QuizResult; editable?: boolean }) {
  const setQuiz = useAppStore((s) => s.setQuiz)
  const [mode, setMode] = useState<'one' | 'all'>('one')
  const [deck, setDeck] = useState(() =>
    result.questions.length <= QUIZ_SIZE
      ? shuffle(result.questions)
      : shuffle(result.questions).slice(0, QUIZ_SIZE)
  )
  const [pos, setPos] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)

  // ─── Editable mode ───
  if (editable) {
    const update = (patch: Partial<QuizResult>) => setQuiz({ ...result, ...patch })
    const updateQ = (i: number, opts: Record<string, unknown>) =>
      update({ questions: result.questions.map((q, j) => (j === i ? { ...q, ...opts } : q)) })
    const deleteQ = (i: number) => update({ questions: result.questions.filter((_, j) => j !== i) })
    const addQ = () => update({ questions: [...result.questions, { stem: '', options: ['', ''], correctIndex: 0 }] })
    return (
      <div className="quiz-editor">
        {result.questions.map((q, qi) => (
          <div className="edit-card" key={qi}>
            <div className="edit-card-head">
              <span className="edit-card-no">Question {qi + 1}</span>
              <button className="btn btn-secondary edit-delete" onClick={() => deleteQ(qi)}>Delete</button>
            </div>
            <textarea className="edit-input" value={q.stem} onChange={(e) => updateQ(qi, { stem: e.target.value })} placeholder="Question" rows={2} />
            {q.options.map((opt, oi) => (
              <div className="edit-option" key={oi}>
                <input type="radio" checked={q.correctIndex === oi} onChange={() => updateQ(qi, { correctIndex: oi })} />
                <input className="edit-input" value={opt} onChange={(e) => updateQ(qi, { options: q.options.map((o, j) => (j === oi ? e.target.value : o)) })} placeholder={`Option ${quizLetter(oi)}`} />
                <button className="btn btn-secondary edit-delete" onClick={() => {
                  const newOpts = q.options.filter((_, j) => j !== oi)
                  const newCorrect = q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex === oi ? 0 : q.correctIndex
                  updateQ(qi, { options: newOpts, correctIndex: newCorrect })
                }}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary" onClick={() => updateQ(qi, { options: [...q.options, ''] })}>+ Add option</button>
            <input className="edit-input" value={q.explanation ?? ''} onChange={(e) => updateQ(qi, { explanation: e.target.value })} placeholder="Explanation (optional)" />
          </div>
        ))}
        <button className="btn btn-secondary" onClick={addQ}>+ Add question</button>
      </div>
    )
  }

  // ─── Play mode ───
  const score = deck.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0)
  const allAnswered = deck.every((_, i) => answers[i] !== undefined)

  const pick = (qi: number, oi: number) => { if (submitted) return; setAnswers((a) => ({ ...a, [qi]: oi })) }
  const newDeck = () => {
    setDeck(result.questions.length <= QUIZ_SIZE ? shuffle(result.questions) : shuffle(result.questions).slice(0, QUIZ_SIZE))
    setPos(0); setAnswers({}); setSubmitted(false)
  }

  // Mode toggle
  const ModeToggle = (
    <div className="btn-row" style={{ marginBottom: 16 }}>
      <button className={`btn ${mode === 'one' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setMode('one'); setSubmitted(false); setPos(0) }}>One at a time</button>
      <button className={`btn ${mode === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setMode('all'); setSubmitted(false) }}>All questions</button>
      {result.questions.length > QUIZ_SIZE && <span style={{ color: 'var(--text-muted)', fontSize: 14, alignSelf: 'center' }}>{QUIZ_SIZE} of {result.questions.length} (random)</span>}
    </div>
  )

  if (mode === 'all') {
    // All-on-page mode (original behavior, but with random subset)
    return (
      <div className="quiz">
        {ModeToggle}
        {submitted && <div className="quiz-score">Score: {score} / {deck.length}</div>}
        {deck.map((q, qi) => (
          <fieldset className="quiz-question" key={qi}>
            <legend>{qi + 1}. {q.stem}</legend>
            {q.options.map((opt, oi) => {
              const chosen = answers[qi] === oi
              let cls = 'quiz-option'
              if (submitted) {
                if (oi === q.correctIndex) cls += ' correct'
                else if (chosen) cls += ' wrong'
              } else if (chosen) cls += ' selected'
              return (
                <label key={oi} className={cls}>
                  <input type="radio" name={`q${qi}`} checked={chosen} disabled={submitted} onChange={() => pick(qi, oi)} />
                  <span>{quizLetter(oi)}) {opt}</span>
                </label>
              )
            })}
            {submitted && q.explanation && <div className="quiz-explanation">{q.explanation}</div>}
          </fieldset>
        ))}
        <div className="btn-row quiz-controls">
          {!submitted
            ? <button className="btn btn-primary" disabled={!allAnswered} onClick={() => setSubmitted(true)}>Submit answers</button>
            : <button className="btn btn-secondary" onClick={newDeck}>Try again (new questions)</button>}
        </div>
      </div>
    )
  }

  // One-at-a-time mode
  const q = deck[pos]
  if (!q) return null

  return (
    <div className="quiz">
      {ModeToggle}
      {submitted ? (
        <>
          <div className="quiz-score" style={{ fontSize: 28, marginBottom: 20 }}>Score: {score} / {deck.length}</div>
          {deck.map((q2, qi) => (
            <fieldset className="quiz-question" key={qi}>
              <legend>{qi + 1}. {q2.stem}</legend>
              {q2.options.map((opt, oi) => {
                let cls = 'quiz-option'
                if (oi === q2.correctIndex) cls += ' correct'
                else if (answers[qi] === oi) cls += ' wrong'
                return <label key={oi} className={cls}><span>{quizLetter(oi)}) {opt}{oi === q2.correctIndex ? ' ✅' : ''}</span></label>
              })}
              {q2.explanation && <div className="quiz-explanation">{q2.explanation}</div>}
            </fieldset>
          ))}
          <div className="btn-row quiz-controls">
            <button className="btn btn-primary" onClick={newDeck}>Try again (new questions)</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 12 }}>Question {pos + 1} of {deck.length}</div>
          <div style={{ height: 4, background: 'var(--bg-card)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(pos / deck.length) * 100}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' }} />
          </div>
          <fieldset className="quiz-question">
            <legend>{q.stem}</legend>
            {q.options.map((opt, oi) => {
              const chosen = answers[pos] === oi
              return (
                <label key={oi} className={`quiz-option${chosen ? ' selected' : ''}`}>
                  <input type="radio" name="current" checked={chosen} onChange={() => pick(pos, oi)} />
                  <span>{quizLetter(oi)}) {opt}</span>
                </label>
              )
            })}
          </fieldset>
          <div className="btn-row quiz-controls">
            {pos > 0 && <button className="btn btn-secondary" onClick={() => setPos(pos - 1)}>‹ Prev</button>}
            {pos < deck.length - 1
              ? <button className="btn btn-primary" disabled={answers[pos] === undefined} onClick={() => setPos(pos + 1)}>Next ›</button>
              : <button className="btn btn-primary" disabled={!allAnswered} onClick={() => setSubmitted(true)}>Submit</button>}
          </div>
        </>
      )}
    </div>
  )
}
