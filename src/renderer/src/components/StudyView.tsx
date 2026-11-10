import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import FlashcardDeck from './FlashcardDeck'
import QuizPlayer from './QuizPlayer'
import SummarySheet from './SummarySheet'
import AiTaskSheet from './AiTaskSheet'
import CaseStudySheet from './CaseStudySheet'
import ActivitySheet from './ActivitySheet'
import PlanSheet from './PlanSheet'

/** Renders the most recent artifact(s) inline — content outputs and/or a plan. */
export default function StudyView() {
  const flashcards = useAppStore((s) => s.flashcards)
  const quiz = useAppStore((s) => s.quiz)
  const summary = useAppStore((s) => s.summary)
  const aiTask = useAppStore((s) => s.aiTask)
  const caseStudy = useAppStore((s) => s.caseStudy)
  const activity = useAppStore((s) => s.activity)
  const plan = useAppStore((s) => s.plan)
  const setView = useAppStore((s) => s.setCurrentView)
  const [editing, setEditing] = useState(false)

  const hasContent = !!(flashcards || quiz || summary || aiTask || caseStudy || activity)
  const canEdit = !!(flashcards || quiz || summary || aiTask || caseStudy || activity)

  if (!hasContent && !plan) {
    return (
      <div className="panel">
        <h2 className="panel-title">Study</h2>
        <p className="panel-subtitle">
          Generate a target first (Generate → choose a target), or run a Plan to recommend a set.
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => setView('generation')}>
            Go to Generate
          </button>
        </div>
      </div>
    )
  }

  const title = flashcards
    ? 'Flashcards'
    : quiz
      ? 'Quiz'
      : summary
        ? 'Summary'
        : aiTask
          ? 'AI-Collaboration Tasks'
          : caseStudy
            ? 'Case Study'
            : activity
              ? 'Reflection Activity'
              : 'Recommended outputs'
  const subtitle =
    flashcards?.deckTitle ??
    quiz?.quizTitle ??
    summary?.title ??
    aiTask?.title ??
    caseStudy?.title ??
    activity?.title ??
    plan?.title

  return (
    <div className="panel study">
      <h2 className="panel-title">{title}</h2>
      {subtitle && <p className="panel-subtitle">{subtitle}</p>}
      {canEdit && (
        <div className="btn-row" style={{ marginBottom: 16 }}>
          <button
            className={`btn ${editing ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setEditing(!editing)}
          >
            {editing ? '✓ Done editing' : '✎ Edit'}
          </button>
        </div>
      )}
      {plan && <PlanSheet result={plan} />}
      {flashcards && <FlashcardDeck result={flashcards} editable={editing} />}
      {quiz && <QuizPlayer result={quiz} editable={editing} />}
      {summary && <SummarySheet result={summary} editable={editing} />}
      {aiTask && <AiTaskSheet result={aiTask} editable={editing} />}
      {caseStudy && <CaseStudySheet result={caseStudy} editable={editing} />}
      {activity && <ActivitySheet result={activity} editable={editing} />}
    </div>
  )
}
