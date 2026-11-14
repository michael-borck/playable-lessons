import { useEffect, useRef, useState } from 'react'
import type { ProjectFull } from '../../../shared/project'
import { useAppStore } from '../stores/appStore'

/**
 * Autosave is a crash-safety net, not a replacement for saving a project.
 * The draft lives in the app's userData directory; explicit project saves and
 * opening a project clear it.
 */

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

let baselineSignature: string | null = null

/** Content-only signature: timestamps and ids do not make a project dirty. */
export function autosaveSignature(project: ProjectFull): string {
  return JSON.stringify({
    name: project.name ?? '',
    inputMode: project.inputMode ?? '',
    inputText: project.inputText ?? '',
    inkSource: project.inkSource ?? '',
    compiledStoryJson: project.compiledStoryJson ?? '',
    nodePositions: project.nodePositions ?? {},
    sceneImages: project.sceneImages ?? {},
    flashcards: project.flashcards ?? null,
    quiz: project.quiz ?? null,
    summary: project.summary ?? null,
    aiTask: project.aiTask ?? null,
    caseStudy: project.caseStudy ?? null,
    activity: project.activity ?? null
  })
}

/** Don't write an empty draft just because the app is open. */
export function isMeaningfulProject(project: ProjectFull): boolean {
  const name = typeof project.name === 'string' ? project.name : ''
  const inputText = typeof project.inputText === 'string' ? project.inputText : ''
  const inkSource = typeof project.inkSource === 'string' ? project.inkSource : ''
  return Boolean(
    name.trim() ||
      inputText.trim() ||
      inkSource.trim() ||
      project.flashcards ||
      project.quiz ||
      project.summary ||
      project.aiTask ||
      project.caseStudy ||
      project.activity ||
      (project.sceneImages && Object.keys(project.sceneImages).length > 0)
  )
}

/** Mark the current snapshot as clean (after open/save/restore). */
export function setAutosaveBaseline(project: ProjectFull | null): void {
  baselineSignature = project ? autosaveSignature(project) : null
}

const DEBOUNCE_MS = 1200

/** Watches the working state and writes a draft after edits settle. */
export function useAutosave(): { status: AutosaveStatus; savedAt: number | null } {
  const projectName = useAppStore((s) => s.projectName)
  const inputMode = useAppStore((s) => s.inputMode)
  const inputText = useAppStore((s) => s.inputText)
  const inkSource = useAppStore((s) => s.inkSource)
  const compiledStoryJson = useAppStore((s) => s.compiledStoryJson)
  const nodePositions = useAppStore((s) => s.nodePositions)
  const sceneImages = useAppStore((s) => s.sceneImages)
  const flashcards = useAppStore((s) => s.flashcards)
  const quiz = useAppStore((s) => s.quiz)
  const summary = useAppStore((s) => s.summary)
  const aiTask = useAppStore((s) => s.aiTask)
  const caseStudy = useAppStore((s) => s.caseStudy)
  const activity = useAppStore((s) => s.activity)
  const loadedProjectId = useAppStore((s) => s.loadedProjectId)

  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const project: ProjectFull = {
      id: loadedProjectId || 'draft',
      name: projectName || 'Untitled',
      inputMode,
      inputText,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      inkSource: inkSource || undefined,
      compiledStoryJson: compiledStoryJson || undefined,
      nodePositions: Object.keys(nodePositions).length > 0 ? nodePositions : undefined,
      sceneImages: Object.keys(sceneImages).length > 0 ? sceneImages : undefined,
      flashcards: flashcards || undefined,
      quiz: quiz || undefined,
      summary: summary || undefined,
      aiTask: aiTask || undefined,
      caseStudy: caseStudy || undefined,
      activity: activity || undefined
    }

    if (!isMeaningfulProject(project)) {
      setStatus('idle')
      return
    }
    if (baselineSignature && autosaveSignature(project) === baselineSignature) {
      // Back to the last saved/opened state (e.g. after undo): drop any stale draft.
      setStatus('idle')
      window.api.autosave.clear().catch(() => {})
      return
    }

    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // A manual save/open may have set a new baseline while the debounce was
      // pending. Don't resurrect a draft that no longer represents dirty work.
      if (baselineSignature && autosaveSignature(project) === baselineSignature) {
        setStatus('idle')
        return
      }
      setStatus('saving')
      window.api.autosave
        .save({ savedAt: 0, project })
        .then((at) => {
          setSavedAt(at)
          setStatus('saved')
        })
        .catch(() => setStatus('error'))
    }, DEBOUNCE_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [
    projectName,
    inputMode,
    inputText,
    inkSource,
    compiledStoryJson,
    nodePositions,
    sceneImages,
    flashcards,
    quiz,
    summary,
    aiTask,
    caseStudy,
    activity,
    loadedProjectId
  ])

  return { status, savedAt }
}
