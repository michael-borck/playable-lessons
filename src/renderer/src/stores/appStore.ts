import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FlashcardResult, QuizResult, SummaryResult, AiTaskResult, CaseStudyResult, PlanResult, BranchingStyle } from '../../../shared/generate'
import type { ProjectMeta } from '../../../shared/project'

export type { BranchingStyle }

export type InputMode = 'topic' | 'lesson' | 'methodology' | 'case-study' | 'lecture-notes' | 'scenario'
export type View = 'input' | 'generation' | 'graph' | 'preview' | 'study' | 'export' | 'settings' | 'projects'
export type AIProvider = 'claude' | 'openai' | 'ollama' | 'custom' | 'auto'
export type StoryLength = 'short' | 'medium' | 'long'
export type GenerationStage = 'idle' | 'analysis' | 'clarification' | 'outline' | 'ink-generation' | 'review' | 'compile' | 'done' | 'error'
export type GenerationTarget = 'story' | 'flashcards' | 'quiz' | 'summary' | 'ai-task' | 'case-study' | 'plan'

export interface StoryOutlineNode {
  id: string
  title: string
  summary: string
}

export interface StoryOutlineEdge {
  from: string
  to: string
  choiceText: string
}

export interface StoryOutline {
  nodes: StoryOutlineNode[]
  edges: StoryOutlineEdge[]
  variables: { name: string; type: string; initialValue: string | number | boolean }[]
  canonPath: string[]
}

export interface ClarificationQuestion {
  id: string
  question: string
  answer: string
}

export interface AppState {
  // Navigation
  currentView: View
  setCurrentView: (view: View) => void

  // Project
  projectName: string
  setProjectName: (name: string) => void

  // Input
  inputMode: InputMode
  setInputMode: (mode: InputMode) => void
  inputText: string
  setInputText: (text: string) => void

  // AI Settings
  aiProvider: AIProvider
  setAIProvider: (provider: AIProvider) => void
  apiKey: string
  setApiKey: (key: string) => void
  claudeModel: string
  setClaudeModel: (model: string) => void
  openaiModel: string
  setOpenaiModel: (model: string) => void
  ollamaUrl: string
  setOllamaUrl: (url: string) => void
  ollamaModel: string
  setOllamaModel: (model: string) => void
  ollamaToken: string
  setOllamaToken: (token: string) => void
  // Custom OpenAI-compatible endpoint (remote Ollama, OpenRouter, LiteLLM, vLLM, …)
  customBaseUrl: string
  setCustomBaseUrl: (url: string) => void
  customApiKey: string
  setCustomApiKey: (key: string) => void
  customModel: string
  setCustomModel: (model: string) => void

  // Generation state
  generationStage: GenerationStage
  setGenerationStage: (stage: GenerationStage) => void
  generationLog: string[]
  addGenerationLog: (msg: string) => void
  clearGenerationLog: () => void

  // Clarification
  clarificationQuestions: ClarificationQuestion[]
  setClarificationQuestions: (questions: ClarificationQuestion[]) => void
  updateClarificationAnswer: (id: string, answer: string) => void

  // Story data
  storyOutline: StoryOutline | null
  setStoryOutline: (outline: StoryOutline | null) => void
  inkSource: string
  setInkSource: (ink: string) => void
  compiledStoryJson: string
  setCompiledStoryJson: (json: string) => void

  // Generation target & non-story artifacts
  generationTarget: GenerationTarget
  setGenerationTarget: (target: GenerationTarget) => void
  flashcards: FlashcardResult | null
  setFlashcards: (flashcards: FlashcardResult | null) => void
  quiz: QuizResult | null
  setQuiz: (quiz: QuizResult | null) => void
  summary: SummaryResult | null
  setSummary: (summary: SummaryResult | null) => void
  aiTask: AiTaskResult | null
  setAiTask: (aiTask: AiTaskResult | null) => void
  caseStudy: CaseStudyResult | null
  setCaseStudy: (caseStudy: CaseStudyResult | null) => void
  plan: PlanResult | null
  setPlan: (plan: PlanResult | null) => void

  // Projects (local dashboard)
  projects: ProjectMeta[]
  setProjects: (projects: ProjectMeta[]) => void
  loadedProjectId: string | null
  setLoadedProjectId: (id: string | null) => void

  // Story preferences
  storyLength: StoryLength
  setStoryLength: (length: StoryLength) => void
  branchingStyle: BranchingStyle
  setBranchingStyle: (style: BranchingStyle) => void
  protagonistType: string
  setProtagonistType: (type: string) => void
  tone: string
  setTone: (tone: string) => void

  // Theme
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void

  // Node editor
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  nodePositions: Record<string, { x: number; y: number }>
  setNodePositions: (positions: Record<string, { x: number; y: number }>) => void
  updateNodePosition: (id: string, x: number, y: number) => void

  // Error
  error: string | null
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>()(persist((set) => ({
  // Navigation
  currentView: 'projects',
  setCurrentView: (view) => set({ currentView: view }),

  // Project
  projectName: '',
  setProjectName: (projectName) => set({ projectName }),

  // Input
  inputMode: 'topic',
  setInputMode: (inputMode) => set({ inputMode }),
  inputText: '',
  setInputText: (inputText) => set({ inputText }),

  // AI Settings
  aiProvider: 'auto',
  setAIProvider: (aiProvider) => set({ aiProvider }),
  apiKey: '',
  setApiKey: (apiKey) => set({ apiKey }),
  claudeModel: 'claude-opus-4-8',
  setClaudeModel: (claudeModel) => set({ claudeModel }),
  openaiModel: 'gpt-4o',
  setOpenaiModel: (openaiModel) => set({ openaiModel }),
  ollamaUrl: 'http://localhost:11434',
  setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
  ollamaModel: 'llama3.1:8b',
  setOllamaModel: (ollamaModel) => set({ ollamaModel }),
  ollamaToken: '',
  setOllamaToken: (ollamaToken) => set({ ollamaToken }),
  customBaseUrl: '',
  setCustomBaseUrl: (customBaseUrl) => set({ customBaseUrl }),
  customApiKey: '',
  setCustomApiKey: (customApiKey) => set({ customApiKey }),
  customModel: '',
  setCustomModel: (customModel) => set({ customModel }),

  // Generation state
  generationStage: 'idle',
  setGenerationStage: (generationStage) => set({ generationStage }),
  generationLog: [],
  addGenerationLog: (msg) => set((s) => ({ generationLog: [...s.generationLog, msg] })),
  clearGenerationLog: () => set({ generationLog: [] }),

  // Clarification
  clarificationQuestions: [],
  setClarificationQuestions: (clarificationQuestions) => set({ clarificationQuestions }),
  updateClarificationAnswer: (id, answer) =>
    set((s) => ({
      clarificationQuestions: s.clarificationQuestions.map((q) =>
        q.id === id ? { ...q, answer } : q
      )
    })),

  // Story data
  storyOutline: null,
  setStoryOutline: (storyOutline) => set({ storyOutline }),
  inkSource: '',
  setInkSource: (inkSource) => set({ inkSource }),
  compiledStoryJson: '',
  setCompiledStoryJson: (compiledStoryJson) => set({ compiledStoryJson }),

  // Generation target & non-story artifacts
  generationTarget: 'story',
  setGenerationTarget: (generationTarget) => set({ generationTarget }),
  flashcards: null,
  setFlashcards: (flashcards) => set({ flashcards }),
  quiz: null,
  setQuiz: (quiz) => set({ quiz }),
  summary: null,
  setSummary: (summary) => set({ summary }),
  aiTask: null,
  setAiTask: (aiTask) => set({ aiTask }),
  caseStudy: null,
  setCaseStudy: (caseStudy) => set({ caseStudy }),
  plan: null,
  setPlan: (plan) => set({ plan }),

  // Projects (local dashboard)
  projects: [],
  setProjects: (projects) => set({ projects }),
  loadedProjectId: null,
  setLoadedProjectId: (loadedProjectId) => set({ loadedProjectId }),

  // Story preferences
  storyLength: 'medium',
  setStoryLength: (storyLength) => set({ storyLength }),
  branchingStyle: 'stateful',
  setBranchingStyle: (branchingStyle) => set({ branchingStyle }),
  protagonistType: 'the reader',
  setProtagonistType: (protagonistType) => set({ protagonistType }),
  tone: 'professional',
  setTone: (tone) => set({ tone }),

  // Theme
  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  // Node editor
  selectedNodeId: null,
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  nodePositions: {},
  setNodePositions: (nodePositions) => set({ nodePositions }),
  updateNodePosition: (id, x, y) =>
    set((s) => ({ nodePositions: { ...s.nodePositions, [id]: { x, y } } })),

  // Error
  error: null,
  setError: (error) => set({ error })
}), {
  name: 'playable-lessons-settings',
  // NOTE: secrets (apiKey, ollamaToken, customApiKey) are deliberately NOT
  // persisted here. They live in the OS keychain via safeStorage (see App
  // bootstrap + SettingsPanel) and are held in memory only for the session.
  partialize: (state) => ({
    aiProvider: state.aiProvider,
    claudeModel: state.claudeModel,
    openaiModel: state.openaiModel,
    ollamaUrl: state.ollamaUrl,
    ollamaModel: state.ollamaModel,
    customBaseUrl: state.customBaseUrl,
    customModel: state.customModel,
    theme: state.theme,
    storyLength: state.storyLength,
    branchingStyle: state.branchingStyle,
    protagonistType: state.protagonistType,
    tone: state.tone,
    generationTarget: state.generationTarget
  })
}))
