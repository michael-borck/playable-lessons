# Playable Lessons - Development Guide

## Project Overview
Playable Lessons is an Electron + React + TypeScript desktop app that transforms educational source material into playable interactive fiction using the Ink scripting language. (Formerly "NarrativeForge".)

## Tech Stack
- **Shell**: Electron + electron-vite
- **UI**: React 19, Vite, TypeScript
- **State**: Zustand (with persist middleware for settings)
- **Story format**: Ink (via inkjs — compiler and runtime)
- **Graph editor**: @xyflow/react (React Flow)
- **AI**: Claude API, OpenAI API, Ollama (local)
- **CLI**: yargs + tsx

## Project Structure
```
src/
  main/            # Electron main process (IPC handlers)
  preload/         # Electron preload scripts (IPC bridge)
  cli/             # CLI entry point (playable-lessons validate/export)
  renderer/
    src/
      components/  # React components
        NodeEditor.tsx      # React Flow graph editor (main canvas)
        StoryNode.tsx       # Custom React Flow node component
        ChoiceEdge.tsx      # Custom React Flow edge with labels
        PassageEditor.tsx   # Side panel editor for node content
        VariablePanel.tsx   # Variable management sidebar
        PreviewPlayer.tsx   # Ink story player with timer/bookmarks
        InputPanel.tsx      # Input mode selection and source text
        GenerationPanel.tsx # AI generation pipeline UI
        ExportPanel.tsx     # Export formats + GitHub Pages publish
        SettingsPanel.tsx   # AI provider and app settings
      stores/      # Zustand store (appStore.ts)
      lib/
        aiService.ts        # AI provider abstraction (Claude/OpenAI/Ollama)
        inkCompiler.ts      # Ink source → JSON compilation
        inkParser.ts        # Structured parsing of Ink source
        prompts.ts          # AI prompt templates
        exporter.ts         # Standalone HTML export
        tweeExporter.ts     # Ink → Twee3 conversion
        pdfExporter.ts      # Tree-layout walkthrough HTML
        githubPublisher.ts  # GitHub Pages publish via API
        sampleStory.ts      # Demo story for testing without AI
      styles/      # Global CSS
  shared/          # Code shared by the renderer AND the CLI (no store, no DOM)
    storyExport.ts # escapeHtml, compileInk, standalone-HTML export
    aiClient.ts    # provider-agnostic AI calls + model listing (config-driven)
    prompts.ts     # AI prompt templates
    generate.ts    # headless generation pipeline (outline → ink → review → compile)
resources/         # App icons and static assets
```

## Commands
- `npm run dev` — Start Electron dev server with hot reload
- `npm run build` — Build for production
- `npm run cli -- generate --input notes.md --provider ollama --output lesson/` — Generate via CLI
- `npm run cli -- validate --input story.ink` — Validate Ink via CLI
- `npm run cli -- export --input story.ink --output dist/ --format html` — Export via CLI
- `npm run typecheck` — Run TypeScript type checking
- `npm test` — Run unit tests (vitest)
- `npm run lint` — Run ESLint

## Architecture Notes
- The AI layer is shared: provider calls + model listing live in `src/shared/aiClient.ts` (config-driven, no store), the headless pipeline in `src/shared/generate.ts`. The renderer's `src/renderer/src/lib/aiService.ts` builds a ProviderConfig from the Zustand store and wraps the pipeline with the GUI's interactive clarification flow; the CLI calls `generateInk` directly.
- Shared modules are standalone-ish: the CLI imports them with explicit `.js` extensions (NodeNext); the renderer imports them extensionless (Vite/bundler resolves `.js` → `.ts`).
- GUI generation: 6 stages (analysis → clarification → outline → ink-gen → review → compile). CLI generation skips the interactive clarification and runs 4 stages.
- Ink compilation uses inkjs's built-in Compiler class
- Stories MUST have `-> start` divert at top level (ensureStartDivert handles this)
- Ink parser (`inkParser.ts`) extracts structured data for the node editor
- Node editor uses React Flow with custom node/edge types
- Settings persist to localStorage via Zustand persist middleware
- electron-vite requires explicit `external: ['electron']` in rollup config
- IPC bridge in preload exposes file I/O, dialogs, and image import to renderer

## Current Status
- Phase 1 (MVP): Complete
- Phase 2 (Editor + Polish): Complete
- Phase 3 (Collaboration + Distribution): Not started
