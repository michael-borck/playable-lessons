import { useAppStore } from '../stores/appStore'
import FlashcardDeck from './FlashcardDeck'
import QuizPlayer from './QuizPlayer'
import SummarySheet from './SummarySheet'
import AiTaskSheet from './AiTaskSheet'
import CaseStudySheet from './CaseStudySheet'
import PlanSheet from './PlanSheet'

/** Renders the most recent artifact(s) inline — content outputs and/or a plan. */
export default function StudyView() {
  const flashcards = useAppStore((s) => s.flashcards)
  const quiz = useAppStore((s) => s.quiz)
  const summary = useAppStore((s) => s.summary)
  const aiTask = useAppStore((s) => s.aiTask)
  const caseStudy = useAppStore((s) => s.caseStudy)
  const plan = useAppStore((s) => s.plan)
  const setView = useAppStore((s) => s.setCurrentView)

  const hasContent = !!(flashcards || quiz || summary || aiTask || caseStudy)

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
            : 'Recommended outputs'
  const subtitle =
    flashcards?.deckTitle ??
    quiz?.quizTitle ??
    summary?.title ??
    aiTask?.title ??
    caseStudy?.title ??
    plan?.title

  return (
    <div className="panel study">
      <h2 className="panel-title">{title}</h2>
      {subtitle && <p className="panel-subtitle">{subtitle}</p>}
      {plan && <PlanSheet result={plan} />}
      {flashcards && <FlashcardDeck result={flashcards} />}
      {quiz && <QuizPlayer result={quiz} />}
      {summary && <SummarySheet result={summary} />}
      {aiTask && <AiTaskSheet result={aiTask} />}
      {caseStudy && <CaseStudySheet result={caseStudy} />}
    </div>
  )
}
