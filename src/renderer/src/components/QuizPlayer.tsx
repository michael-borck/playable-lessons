import { useState } from 'react'
import type { QuizResult } from '../../../shared/generate'
import { quizLetter } from '../../../shared/generate'

/** Inline multiple-choice quiz with self-grading. Mirrors the offline HTML quiz. */
export default function QuizPlayer({ result }: { result: QuizResult }) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)

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
