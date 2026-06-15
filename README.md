# Playable Lessons

Turn educational source material into **playable interactive fiction**. Paste in a case study, lecture notes, a methodology, or just a topic, and Playable Lessons uses AI to weave it into a branching [Ink](https://www.inklestudios.com/ink/) story that learners can play — then export it as a self-contained HTML file, an Ink/Twee source file, or a printable walkthrough.

It ships in two forms:

- **Desktop app** (Electron + React) — the full authoring experience: AI generation pipeline, node-graph editor, live player, and exports. Aimed at non-technical authors (e.g. educators).
- **CLI** (`playable-lessons`, on npm) — a headless tool for **validating and exporting** existing `.ink` files. Handy for scripts, CI, and batch export.

> **Note:** AI _generation_ currently lives in the desktop app only. The CLI does **not** generate stories or call any LLM — it validates and exports Ink you already have. (A headless `generate` command is on the roadmap.)

---

## CLI

### Install

```bash
npm install -g playable-lessons
```

### Validate an Ink file

```bash
playable-lessons validate --input story.ink
```

### Export

```bash
# Standalone playable HTML
playable-lessons export --input story.ink --output dist/ --format html --title "My Lesson"

# Compiled Ink JSON
playable-lessons export --input story.ink --output dist/ --format json

# Multiple formats at once
playable-lessons export -i story.ink -o dist/ -f html,json,ink
```

| Format | Output |
| ------ | ------ |
| `html` | Self-contained player (`.html`) — works offline, share via LMS/email |
| `json` | Compiled Ink story JSON |
| `ink`  | The raw Ink source (copied through) |

Run `playable-lessons --help` for all options.

---

## Desktop app (development)

```bash
npm install --legacy-peer-deps
npm run dev          # launch the Electron app with hot reload
npm run build        # production build
npm run build:mac    # / build:win / build:linux — package installers
npm run typecheck
npm test
```

### AI providers

The desktop app supports **Claude**, **OpenAI**, a local **Ollama**, and any **OpenAI-compatible endpoint** (remote Ollama, OpenRouter, LiteLLM, vLLM, …) via a base URL + bearer token. Model IDs are editable, with live model listing and a connection test. API keys are stored in your OS keychain (via Electron `safeStorage`), not in plain config.

---

## Tech stack

Electron + electron-vite · React 19 + TypeScript · Zustand · [inkjs](https://github.com/y-lohse/inkjs) (Ink compiler + runtime) · @xyflow/react (graph editor) · yargs (CLI).

## License

MIT © michael-borck
