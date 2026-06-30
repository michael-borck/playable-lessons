import { useState } from 'react'
import type { QuizResult } from '../../../shared/generate'
import { quizLetter } from '../../../shared/generate'
import { useAppStore } from '../stores/appStore'

/** Inline multiple-choice quiz. When editable, shows a question editor. */
export default function QuizPlayer({ result, editable }: { result: QuizResult; editable?: boolean }) {
  const setQuiz = useAppStore((s) => s.setQuiz)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)

  // ─── Editable mode ───
  if (editable) {
    const update = (patch: Partial<QuizResult>) => setQuiz({ ...result, ...patch })
    const updateQ = (i: number, opts: Record<string, unknown>) =>
      update({ questions: result.questions.map((q, j) => (j === i ? { ...q, ...opts } : q)) })
    const deleteQ = (i: number) =>
      update({ questions: result.questions.filter((_, j) => j !== i) })
    const addQ = () =>
      update({ questions: [...result.questions, { stem: '', options: ['', ''], correctIndex: 0 }] })

    return (
      <div className="quiz-editor">
        {result.questions.map((q, qi) => (
          <div className="edit-card" key={qi}>
            <div className="edit-card-head">
              <span className="edit-card-no">Question {qi + 1}</span>
              <button className="btn btn-secondary edit-delete" onClick={() => deleteQ(qi)}>Delete</button>
            </div>
            <textarea
              className="edit-input"
              value={q.stem}
              onChange={(e) => updateQ(qi, { stem: e.target.value })}
              placeholder="Question"
              rows={2}
            />
            {q.options.map((opt, oi) => (
              <div className="edit-option" key={oi}>
                <input
                  type="radio"
                  checked={q.correctIndex === oi}
                  onChange={() => updateQ(qi, { correctIndex: oi })}
                />
                <input
                  className="edit-input"
                  value={opt}
                  onChange={(e) =>
                    updateQ(qi, {
                      options: q.options.map((o, j) => (j === oi ? e.target.value : o))
                    })
                  }
                  placeholder={`Option ${quizLetter(oi)}`}
                />
                <button
                  className="btn btn-secondary edit-delete"
                  onClick={() => {
                    const newOpts = q.options.filter((_, j) => j !== oi)
                    const newCorrect =
                      q.correctIndex > oi
                        ? q.correctIndex - 1
                        : q.correctIndex === oi
                          ? 0
                          : q.correctIndex
                    updateQ(qi, { options: newOpts, correctIndex: newCorrect })
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="btn btn-secondary"
              onClick={() => updateQ(qi, { options: [...q.options, ''] })}
            >
              + Add option
            </button>
            <input
              className="edit-input"
              value={q.explanation ?? ''}
              onChange={(e) => updateQ(qi, { explanation: e.target.value })}
              placeholder="Explanation (optional)"
            />
          </div>
        ))}
        <button className="btn btn-secondary" onClick={addQ}>+ Add question</button>
      </div>
    )
  }

  // ─── Read-only mode: interactive quiz ───
  const score = result.questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0),
    0
  )
  const allAnswered = result.questions.every((_, i) => answers[i] !== undefined)

  const pick = (qi: number, oi: number) => {
    if (submitted) return
    setAnswers((a) => ({ ...a, [qi]: oi }))
  }
  const reset = () => {
    setAnswers({})
    setSubmitted(false)
  }

  return (
    <div className="quiz">
      {submitted && (
        <div className="quiz-score">Score: {score} / {result.questions.length}</div>
      )}
      {result.questions.map((q, qi) => (
        <fieldset className="quiz-question" key={qi}>
          <legend>{qi + 1}. {q.stem}</legend>
          {q.options.map((opt, oi) => {
            const chosen = answers[qi] === oi
            let cls = 'quiz-option'
            if (submitted) {
              if (oi === q.correctIndex) cls += ' correct'
              else if (chosen) cls += ' wrong'
            } else if (chosen) {
              cls += ' selected'
            }
            return (
              <label key={oi} className={cls}>
                <input
                  type="radio"
                  name={`q${qi}`}
                  checked={chosen}
                  disabled={submitted}
                  onChange={() => pick(qi, oi)}
                />
                <span>{quizLetter(oi)}) {opt}</span>
              </label>
            )
          })}
          {submitted && q.explanation && (
            <div className="quiz-explanation">{q.explanation}</div>
          )}
        </fieldset>
      ))}
      <div className="btn-row quiz-controls">
        {!submitted ? (
          <button className="btn btn-primary" disabled={!allAnswered} onClick={() => setSubmitted(true)}>
            Submit answers
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={reset}>Try again</button>
        )}
      </div>
    </div>
  )
}
