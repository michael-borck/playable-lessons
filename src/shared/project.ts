/**
 * Project model for the local dashboard. Shared by the main process (filesystem
 * persistence), the preload bridge (IPC typing), and the renderer (store + UI).
 *
 * A "project" is a real folder on disk under the projects root, containing a
 * single `project.json` — so projects are ownable and fully offline.
 */
import type { FlashcardResult, QuizResult, SummaryResult, AiTaskResult, CaseStudyResult, ActivityResult } from './generate.js'

export { isSafeProjectId, projectIdFromName } from './projectId.js'

export interface ProjectArtifacts {
  story: boolean
  flashcards: boolean
  quiz: boolean
  summary: boolean
  aiTask: boolean
  caseStudy: boolean
  activity: boolean
}

/** Lightweight metadata for the project list (no large payloads sent to the UI). */
export interface ProjectMeta {
  id: string
  name: string
  inputMode: string
  createdAt: number
  updatedAt: number
  artifacts: ProjectArtifacts
}

/** Full project snapshot, persisted verbatim as `project.json`. */
export interface ProjectFull {
  /** Bumped by the main process on save; anchors future migrations. */
  schemaVersion?: number
  id: string
  name: string
  inputMode: string
  inputText: string
  createdAt: number
  updatedAt: number
  inkSource?: string
  compiledStoryJson?: string
  /** Saved React Flow layout for the story graph. */
  nodePositions?: Record<string, { x: number; y: number }>
  /** Generated scene illustrations: raw `# IMAGE_PROMPT:` text → data URL. */
  sceneImages?: Record<string, string>
  flashcards?: FlashcardResult
  quiz?: QuizResult
  summary?: SummaryResult
  aiTask?: AiTaskResult
  caseStudy?: CaseStudyResult
  activity?: ActivityResult
}

/** Autosaved working copy, stored in the app's userData directory. */
export interface AutosaveDraft {
  /** Set by the main process when the draft is written. */
  savedAt: number
  project: ProjectFull
}
