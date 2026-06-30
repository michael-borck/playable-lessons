/**
 * Project model for the local dashboard. Shared by the main process (filesystem
 * persistence), the preload bridge (IPC typing), and the renderer (store + UI).
 *
 * A "project" is a real folder on disk under the projects root, containing a
 * single `project.json` — so projects are ownable and fully offline.
 */
import type { FlashcardResult, QuizResult, SummaryResult, AiTaskResult, CaseStudyResult } from './generate.js'

export interface ProjectArtifacts {
  story: boolean
  flashcards: boolean
  quiz: boolean
  summary: boolean
  aiTask: boolean
  caseStudy: boolean
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
  id: string
  name: string
  inputMode: string
  inputText: string
  createdAt: number
  updatedAt: number
  inkSource?: string
  compiledStoryJson?: string
  flashcards?: FlashcardResult
  quiz?: QuizResult
  summary?: SummaryResult
  aiTask?: AiTaskResult
  caseStudy?: CaseStudyResult
}

/** A filesystem-safe, unique id derived from a name (+ short suffix). */
export function projectIdFromName(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'project'
  return `${slug}-${Date.now().toString(36)}`
}
