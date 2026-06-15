# Playable Lessons

Turn educational source material into **playable interactive fiction**. Paste in a case study, lecture notes, a methodology, or just a topic, and Playable Lessons uses AI to weave it into a branching [Ink](https://www.inklestudios.com/ink/) story that learners can play — then export it as a self-contained HTML file, an Ink/Twee source file, or a printable walkthrough.

It ships in two forms:

- **Desktop app** (Electron + React) — the full authoring experience: AI generation with an interactive clarification step, a node-graph editor, live player, and exports. Aimed at non-technical authors (e.g. educators).
- **CLI** (`playable-lessons`, on npm) — the same engine, headless: **generate**, **validate**, and **export**. Handy for scripts, CI, batch runs, and local/offline generation against Ollama.

The desktop app and the CLI share one generation pipeline; the app adds the interactive clarification step and visual editor on top.

---

## CLI

### Install

```bash
npm install -g playable-lessons
```

### Generate a story from source material

```bash
# Local + offline against Ollama (no API key needed):
playable-lessons generate --input notes.md --provider ollama --model llama3.1:8b --output lesson/

# Anthropic Claude (key from the environment):
ANTHROPIC_API_KEY=sk-ant-... playable-lessons generate -i case-study.md -p claude -o lesson/

# From a topic instead of a file, choosing formats:
playable-lessons generate --topic "Phishing awareness for staff" -p openai -o lesson/ -f ink,html,json

# Pipe source material via stdin:
cat lecture.txt | playable-lessons generate -o lesson/ -p ollama -m llama3.1:8b
```

Provider selection and API keys:

| Provider | `--provider` | Key (env var) | Notes |
| --- | --- | --- | --- |
| Claude | `claude` | `ANTHROPIC_API_KEY` | default model `claude-opus-4-8` |
| OpenAI | `openai` | `OPENAI_API_KEY` | default model `gpt-4o` |
| Ollama | `ollama` | none (or `OLLAMA_API_KEY`) | local by default; `--ollama-url` for remote |
| Custom | `custom` | `PLAYABLE_LESSONS_API_KEY` / `OPENAI_API_KEY` | OpenAI-compatible; requires `--base-url` + `--model` |

If `--provider` is omitted it's inferred from the environment (Claude → OpenAI → Ollama). Keys are read from env vars only — the CLI never touches the OS keychain (that's the desktop app). Other flags: `--mode`, `--length` (short/medium/long), `--tone`, `--protagonist`, `--answers`, `--title`. Run `playable-lessons generate --help` for all options.

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
