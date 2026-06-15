# Playable Lessons — Product Specification
**Interactive Fiction Authoring Tool for Education**
Version 0.1 | March 2026 | Working Draft

---

## 1. Vision and Purpose

Playable Lessons is a cross-platform desktop application (Electron + React, TypeScript) that transforms educational source material into playable interactive fiction. A lecturer pastes in a case study, a set of lecture notes, a methodology document, or even just a topic or a "lesson to learn," and the tool uses AI to weave that content into a branching narrative. The finished story is exported as a playable file, shareable HTML, or pushed to a web URL.

The tool serves two equal audiences:

- **Lecturers and instructional designers** who want to create stories without writing code or learning a new authoring system.
- **Students** who are asked to create their own reflective or exploratory narratives as assessed tasks.

The unifying design principle: **source material in, playable story out, no authoring expertise required**.

---

## 2. Core Concepts

### 2.1 Input Modes

The tool accepts six named input modes. The user selects one before pasting or uploading content. Each mode shapes how the AI frames the narrative.

| Mode | What the user provides | How the AI approaches it |
|---|---|---|
| **Topic** | A word or phrase ("supply chain resilience", "project scope creep") | Builds a scenario from scratch around the concept, asks clarifying questions about context and lesson goals |
| **Lesson to Learn** | A moral, insight, or principle ("moving fast without experience costs you later") | Works backward: designs the story so choices lead the reader to discover the lesson organically |
| **Methodology** | A process or framework (design thinking, Agile, SWOT) | Maps the methodology steps to story beats; each stage becomes a narrative moment |
| **Case Study** | A real or fictional business/professional case | Retells the case as a lived experience from the protagonist's perspective, with branching at key decision points |
| **Lecture Notes / Handout / Worksheet** | Pasted or uploaded text | Extracts key concepts, decision points, and learning outcomes; restructures as interactive narrative |
| **Scenario** | A "you are..." situation description | Accepts the framing as-is and branches forward from the opening situation |

### 2.2 Story Format: Ink

Playable Lessons uses **Ink** (by Inkle Studios) as its native story format.

**Why Ink over Twine/Twee:**

- Plain text format — version-control friendly, human-readable, AI-generatable
- Native support for variables, flags, conditional logic, and state tracking without custom macros
- The `inkjs` runtime runs in the browser and in Electron with no server required
- Mature ecosystem with commercial validation (80 Days, Heaven's Vault, Sorcery!)
- Easier to generate programmatically than Twine's HTML-blob format
- Twee3 is the closest alternative but has a thinner ecosystem and less predictable parser behaviour

Ink is the **internal format**. Users never need to see or edit raw Ink unless they want to. The export pipeline converts Ink to other formats on demand.

### 2.3 Story Structure

Every generated story is built around a **node graph** where each node is a passage (scene), each edge is a player choice, and variables carry state across the session.

Supported structural features:

- **Branching paths** — choices with different narrative consequences
- **Converging paths** — multiple routes that arrive at the same scene (but with different state, so the scene can respond differently)
- **Variables and flags** — track experience points, decisions made, roles held, trust scores, etc.
- **Conditional branches** — story paths that only appear if certain variables are set
- **Timed decisions** — a passage can have a countdown; failure to choose triggers a default branch
- **Media nodes** — passages can embed images (local files or URLs) and optionally audio

---

## 3. Application Architecture

### 3.1 Stack Decision: Pure TypeScript, No Python

All logic runs in a single TypeScript/Node.js process inside Electron. There is no Python runtime to bundle or install.

**Rationale:** AI generation goes through API calls (Claude, GPT) or HTTP calls to a local Ollama instance. Neither requires Python. The `inkjs` runtime is native TypeScript. Image handling uses Sharp (Node). A pure-TypeScript stack means one build pipeline, one language, and a single distributable binary per platform with no external runtime dependencies.

### 3.2 Top-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Shell                                                  │
│  ┌──────────────────────────────────────┐  ┌─────────────────┐  │
│  │  Renderer Process (React + Vite)     │  │  Main Process   │  │
│  │                                      │  │  (Node.js)      │  │
│  │  InputPanel → GenerationPanel        │  │                 │  │
│  │  NodeEditor (React Flow)             │◄─►  IPC Bridge     │  │
│  │  PreviewPlayer (inkjs)               │  │  AI Service     │  │
│  │  ExportPanel                         │  │  Ink Compiler   │  │
│  └──────────────────────────────────────┘  │  File I/O       │  │
│                                            │  HTTP Client    │  │
│                                            └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
   External AI APIs           Local Ollama
   (Claude / GPT-4o)          (localhost:11434)
```

### 3.3 Key Dependencies

| Layer | Library | Purpose |
|---|---|---|
| Shell | `electron` + `electron-builder` | Cross-platform desktop packaging |
| UI | `react` + `vite` | Renderer process |
| State | `zustand` | App-wide state (project, settings, generation status) |
| Graph editor | `@xyflow/react` (React Flow) | Visual node editor for the story graph |
| Story runtime | `inkjs` | Compile and play Ink stories in-app |
| Ink compiler | `ink-compiler` (WASM port) or bundled `inklecate` | Compile `.ink` source to `.ink.json` |
| Image processing | `sharp` | Resize/optimise embedded images in main process |
| Export | `jszip` | Bundle HTML + assets into a distributable ZIP |
| AI HTTP | `openai` SDK + custom Ollama client | Unified AI request layer |
| Markdown | `marked` | Render AI clarification prompts and help text |
| CLI | `yargs` | Command-line entry point |

### 3.4 Project File Format

A Playable Lessons project is a single `.nfproj` file (ZIP archive containing):

```
project.json          # metadata, settings, AI provider config
story.ink             # the Ink source (human-editable)
story.ink.json        # compiled runtime JSON (generated)
assets/
  images/             # embedded images
  audio/              # embedded audio (future)
export/               # last export outputs (not committed to version control)
```

---

## 4. User Flows

### 4.1 Lecturer Flow — New Story from Source Material

```
1. Open Playable Lessons
2. New Project → select Input Mode (e.g. Case Study)
3. Paste or upload source text
4. AI asks 3–5 clarifying questions:
      - Who is the protagonist? (generic professional / named character / the reader themselves)
      - What is the primary learning outcome?
      - What tone? (professional/realistic | light/exploratory | challenging/provocative)
      - Approximate length? (short ~5 nodes | medium ~15 | long ~30+)
      - Should there be a "best path" or are all paths equally valid?
5. User answers questions (can skip any)
6. AI generates:
      - Story outline (tree of passages and choices)
      - Full Ink source
      - Suggested variable names and their meaning
7. Visual node graph appears in the editor
8. User previews story in the built-in player
9. Edits nodes directly in the graph (click to open passage editor)
10. Exports / publishes
```

### 4.2 Student Flow — Topic or Lesson-to-Learn

```
1. Open Playable Lessons (or receive a pre-configured template from lecturer)
2. Select Input Mode: Topic or Lesson to Learn
3. Enter text (e.g. "The cost of prioritising speed over experience in early career")
4. Answer clarifying questions
5. Review and iterate: "regenerate this branch", "make this choice harder"
6. Play through their own story
7. Export and submit
```

### 4.3 CLI Flow

```bash
# Generate a story from a text file, no GUI
playable-lessons generate \
  --mode case-study \
  --input ./my_case_study.txt \
  --output ./output/ \
  --format html,ink \
  --provider ollama \
  --model llama3.2

# Compile an existing .ink file and export
playable-lessons export \
  --input ./story.ink \
  --format html \
  --output ./dist/

# Validate an .ink file
playable-lessons validate --input ./story.ink
```

---

## 5. AI Generation Pipeline

### 5.1 Provider Strategy

The AI layer uses a **provider chain**:

1. **Primary: External API** — Claude (claude-sonnet-4) or OpenAI (gpt-4o). User supplies an API key in Settings, stored in system keychain (not in project file).
2. **Fallback: Local Ollama** — automatically tried if the API call fails or if the user selects "Local only" mode. Recommended models: `llama3.1:8b`, `mistral`, `phi4`.
3. **Offline: Template mode** — a structured prompt-free generator using the input text directly, producing a minimal but valid story skeleton without AI.

### 5.2 Generation Stages

Generation is broken into discrete stages, each with its own prompt, so partial results are recoverable and stages can be individually regenerated:

**Stage 1 — Analysis**
Extract: protagonist, setting, key decision points, learning outcomes, factual claims to preserve.

**Stage 2 — Clarification**
Based on Stage 1 output, generate 3–5 targeted questions. Display to user. Collect answers.

**Stage 3 — Outline**
Generate a structured JSON outline: nodes (id, title, summary), edges (from, to, choice text), variables (name, type, initial value), and a recommended "canon path."

**Stage 4 — Ink Generation**
Convert the outline to valid Ink source. This is a dedicated prompt with the Ink syntax spec injected as context. Generated in chunks (one passage at a time for long stories) to avoid context window issues.

**Stage 5 — Review Pass**
Send the complete Ink source back with a "check for errors, inconsistencies, and dead ends" prompt. Apply corrections.

**Stage 6 — Compile and Validate**
Compile with `inklecate`/WASM. If compilation fails, send error back to AI for targeted correction (up to 3 retries).

### 5.3 Prompt Architecture

Prompts are stored as versioned templates in `src/prompts/`. Each template uses a simple `{{variable}}` substitution. Templates are user-overridable (advanced mode) so educators can tune generation style for their institution.

System prompt includes:
- Ink syntax reference (condensed)
- Institution/course context (optional, set in project settings)
- Tone and complexity constraints from user answers
- A strict instruction: "Never invent facts about named real people or institutions"

---

## 6. Node Editor

The visual graph editor is built on **React Flow** and provides:

- **Passage nodes** — show title, first line of text, variable reads/writes, and any media attachments
- **Choice edges** — labelled with the choice text; show conditions if the edge is conditional
- **Variable panel** — sidebar showing all variables with current initial values
- **Timeline view** — linear view of the canon path for reviewing the "main" story
- **Mini-map** — overview of large graphs
- **Inline passage editor** — click any node to open a split-pane with the raw Ink for that passage alongside a formatted preview

Editing actions:
- Add / delete nodes
- Edit passage text (rich text or raw Ink toggle)
- Add / remove choices
- Drag to reorder
- Set timer on a passage (seconds; 0 = no timer)
- Attach image to a passage (drag-and-drop or file picker)
- Set variable assignments on an edge or inside a passage
- Mark a node as an "ending" (good / neutral / bad — for export metadata)

---

## 7. Preview Player

The built-in player uses `inkjs` to execute the compiled story inside the renderer process. It presents a clean reading UI that mirrors what the exported HTML will look like.

Features:
- Full story playback with choices
- Countdown timer display for timed nodes
- Image rendering (inline, full-width, or aside)
- Variable inspector panel (toggle on/off — useful for testing)
- "Play from this node" — start playback at any node, with ability to pre-set variable values
- Restart, undo last choice, and bookmark
- Ending classification display (which ending did you reach, and what was the "lesson" label)

---

## 8. Export and Publishing

### 8.1 Export Formats

| Format | Description | Use case |
|---|---|---|
| **Standalone HTML** | Single `.html` file, assets base64-inlined, inkjs bundled | Email attachment, LMS upload, USB distribution |
| **HTML + Assets ZIP** | Separate HTML + `/assets/` folder | Web server hosting |
| **Ink source** | Raw `.ink` text file | Version control, remixing, use in other tools |
| **Twine/Twee3** | `.twee` file compatible with Twinery.org and Tweego | Hand-off to users who prefer Twine |
| **PDF walkthrough** | Flattened document showing all paths (tree layout) | Printed handout, accessibility fallback |
| **EPUB (future v2)** | Linear version as an ebook | Reading without a player |

All exports support embedded images. The PDF walkthrough uses a tree-layout algorithm to render the full branching structure as a readable document.

### 8.2 Web Publishing / Share Link

Playable Lessons can push a standalone HTML export to a hosting target. Two options:

**Option A — GitHub Pages (built-in)**
The app can authenticate with GitHub (OAuth device flow, no browser redirect required from Electron) and push the export to a repository's `gh-pages` branch. Produces a permanent URL like `https://username.github.io/story-name`.

**Option B — Custom endpoint**
A configurable HTTP POST endpoint. The app sends a multipart form upload. A small companion server script (`playable-lessons-server`, ~50 lines of Node/Python) can be self-hosted on a VPS or the LocoLabo infrastructure. This would be the preferred route for locolabo.org or an institutional deployment.

Share links are copyable from within the app immediately after publish. The share URL is also embedded as metadata in the exported HTML.

---

## 9. Settings and Configuration

### 9.1 Application Settings (persisted in system config dir)

- AI provider: Claude API / OpenAI API / Ollama / Auto (API with local fallback)
- API keys (stored in OS keychain, not in config file)
- Ollama endpoint URL (default: `http://localhost:11434`)
- Preferred Ollama model
- Default export directory
- GitHub credentials (OAuth token, stored in keychain)
- Custom publish endpoint URL
- UI theme: light / dark / system
- Default story length: short / medium / long
- Advanced: custom prompt templates directory

### 9.2 Project Settings (per project, stored in `.nfproj`)

- Project name, author, institution/course name
- Target audience (lecturer-defined label shown in the player's title screen)
- Ink compiler path override (for users who have `inklecate` installed system-wide)
- Variable definitions and their display labels (for the variable inspector)
- Ending labels and their associated lesson text
- Export profile (which formats to produce, image quality settings)

---

## 10. Media Support

Images are supported at the passage level. The Ink standard does not have native image syntax, so Playable Lessons uses a custom tag convention that the bundled player interprets:

```ink
# IMAGE: assets/images/office_hallway.jpg
You stand in the corridor outside the CEO's office.
```

The export pipeline:
1. Strips `# IMAGE:` tags from source before passing to `inklecate` (the compiler ignores them; they are Ink comments to the compiler but parsed by the player)
2. Injects image rendering logic into the player wrapper
3. Base64-inlines images in the standalone HTML export

**Supported formats:** JPG, PNG, WebP, SVG, GIF. Images are auto-resized to a maximum of 1200px wide on import to keep export file sizes reasonable. Original files are preserved in the project archive.

**Audio (Phase 2):** The same tag convention will extend to `# AUDIO:` for ambient sound and `# MUSIC:` for background tracks.

---

## 11. Phased Roadmap

### Phase 1 — Core Loop (MVP)

- Input panel with all six modes
- AI generation stages 1–6 with Claude and Ollama providers
- Ink source generation and compilation
- Basic node graph view (view only, no editing)
- Inline preview player
- Standalone HTML export
- Ink source export
- Settings: API key, Ollama URL, theme

### Phase 2 — Editor and Polish

- Full interactive node editor (React Flow)
- Variable panel and conditional edge editor
- Timed decisions
- Image embedding
- Twee3 export
- PDF walkthrough export
- GitHub Pages publish
- CLI entry point

### Phase 3 — Collaboration and Distribution

- Custom publish endpoint + companion server
- Lecturer template system (pre-configured project templates shared as `.nfproj` files)
- Student submission mode (export includes a completion token / reflection prompt at the ending)
- EPUB export
- Audio support
- Multi-language generation (prompt the AI in a target language)
- LMS integration hooks (LTI-compatible completion reporting)

---

## 12. Non-Functional Requirements

**Performance**
- App startup under 3 seconds on a mid-range machine
- AI generation for a medium story (15 nodes) completes in under 90 seconds on Claude Sonnet; under 5 minutes on a local 8B model
- Graph editor handles up to 200 nodes without degradation

**Privacy**
- No telemetry by default
- API keys never leave the local machine except in authenticated requests to their respective providers
- Source material is not logged or stored externally

**Accessibility**
- Player HTML output meets WCAG 2.1 AA
- Keyboard-navigable choices in the player
- High-contrast theme option

**Portability**
- Distributed as a single installer per platform: `.exe` (Windows, NSIS), `.dmg` (macOS, universal), `.AppImage` (Linux)
- No admin rights required to install on Windows or Linux
- No external runtime (Python, Node, etc.) required on the end user's machine

---

## 13. Open Questions / Deferred Decisions

1. **Ink vs custom runtime:** If timed decisions and audio grow complex, it may be worth forking `inkjs` or writing a thin wrapper rather than abusing comment-tags. Worth revisiting at Phase 2.

2. **AI hallucination guardrails for factual case studies:** When input contains real company names, financial figures, or named individuals, the generation prompt should include an explicit grounding instruction. A post-generation fact-diff against the input could flag invented numbers. Needs design work.

3. **Assessment integrity:** If students submit stories as assessed work, what prevents a student from submitting an AI-generated story with no personal input? May need a "reflection mode" that requires annotated decision points. Deferred to Phase 3 design.

4. **Collaborative editing:** Two lecturers working on the same story file simultaneously is out of scope for Phase 1, but the `.nfproj` ZIP format is git-friendly if both edit `story.ink` directly.

5. **Twinery.org import:** Importing an existing Twine story and re-processing it with AI would be a useful on-ramp. Not in Phase 1.

---

## Appendix A — Ink Syntax Quick Reference (for AI prompts)

```ink
// A basic passage
=== office_corridor ===
You stand outside the CEO's office.

* [Walk in confidently]
    -> boardroom_confrontation
* [Wait for an invitation]
    -> wait_outcome

// Variable declaration (at top of file)
VAR experience = 0
VAR trust = 50

// Variable assignment
~ experience = experience + 1

// Conditional branch
{ experience > 3:
    You've seen this before.
- else:
    This is unfamiliar territory.
}

// Timed decision (Playable Lessons custom tag)
# TIMER: 15
You have fifteen seconds to decide.

// Image (Playable Lessons custom tag)
# IMAGE: assets/images/boardroom.jpg
```

---

## Appendix B — Recommended Name

**Playable Lessons** — chosen name (renamed from the working title "NarrativeForge"). The name was picked to be self-describing: it states what the tool produces — interactive, playable lessons from source material — so the project's purpose is obvious at a glance. Earlier candidates included NarrativeForge, StoryLoom, Threadline, InkWeave, PathCraft, Lesson Loom, Branching Lessons, and Inkucate.

---

*End of specification v0.1*
