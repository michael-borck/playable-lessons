# Playable Lessons

Turn educational source material into **playable interactive fiction**. Paste in a case study, lecture notes, a methodology, or just a topic, and Playable Lessons uses AI to weave it into a branching [Ink](https://www.inklestudios.com/ink/) story that learners can play — then export it as a self-contained HTML file, an Ink/Twee source file, or a printable walkthrough. It can also turn the same material into **study flashcards**, a **multiple-choice quiz**, a **study summary**, **AI-collaboration tasks**, or a **teaching case study**. A **Plan** mode recommends which outputs suit your material and can generate them all at once.

It ships in two forms:

- **Desktop app** (Electron + React) — the full authoring experience: AI generation with an interactive clarification step, a node-graph editor, live player, a **Projects dashboard** (save / reopen / delete lessons as ownable folders on disk), **inline editing** with AI refinement (✨), and exports. Aimed at non-technical authors (e.g. educators).
- **CLI** (`playable-lessons`, on npm) — the same engine, headless: **generate** an Ink story, **flashcards**, a **quiz**, a **summary**, **AI-collaboration tasks**, or a **case study**; **plan** a recommended set; **validate**, and **export**. Handy for scripts, CI, batch runs, and local/offline generation against Ollama.
- **Self-hosted web** (Docker) — a browser-based version for institutions (e.g. university staff). The server holds the API key; users just enter an access code. No per-user keys, no accounts — work is stored per-browser.

The desktop app and the CLI share one generation pipeline; the app adds the interactive clarification step, visual editor, and inline editing on top.

A public landing page with a **try-it demo** (bring your own key) is at **[michael-borck.github.io/playable-lessons](https://michael-borck.github.io/playable-lessons/)**.

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

If `--provider` is omitted it's inferred from the environment (Claude → OpenAI → Ollama). Keys are read from env vars only — the CLI never touches the OS keychain (that's the desktop app). Other flags: `--mode`, `--length` (short/medium/long), `--tone`, `--protagonist`, `--answers`, `--title`, and `--target` (story | flashcards | quiz | summary | ai-task | case-study — see the per-target sections below). Run `playable-lessons generate --help` for all options.

### Generate flashcards

Add `--target flashcards` to turn the same source material into a deck of study flashcards instead of an Ink story. Each card has a front, back, optional hint, and optional tag.

```bash
# Flashcards from a topic, offline via Ollama (no API key needed):
playable-lessons generate --topic "Supply chain resilience" --target flashcards -p ollama -m llama3.1:8b -o deck/

# From a file, exporting every format and setting the card count:
playable-lessons generate -i notes.md --target flashcards --cards 20 -o deck/ -f csv,html,anki,json
```

| Format | Output |
| ------ | ------ |
| `csv` | `front,back,hint,tag` — imports into Anki, Quizlet, Excel (`.flashcards.csv`) |
| `html` | Self-contained flip-card deck (`.flashcards.html`) — click or Space to flip, arrow keys to navigate; works offline |
| `anki` | Tab-separated import for Anki: front, back, tag (`.flashcards.txt`) |
| `json` | The raw structured deck (`.flashcards.json`) |

The default format for flashcards is `csv,html`; use `--cards N` to set the count (default 12). The same source can yield both a story and a deck — run `generate` twice with different `--target`.

### Generate a quiz

Add `--target quiz` to produce a self-marking multiple-choice quiz from the same source material. Each question has a stem, 2–6 options, the correct option's index, and an optional explanation.

```bash
playable-lessons generate --topic "Supply chain resilience" --target quiz -p ollama -m llama3.1:8b -o quiz/

playable-lessons generate -i notes.md --target quiz --cards 20 -o quiz/ -f html,json,txt
```

| Format | Output |
| ------ | ------ |
| `html` | Self-contained interactive quiz (`.quiz.html`) — pick answers, submit for an instant score, with correct/wrong highlighting and explanations; works offline |
| `json` | The raw structured quiz (`.quiz.json`) |
| `txt` | A printable quiz with an answer key (`.quiz.txt`) |

The default format for quiz is `html,json`; `--cards N` sets the number of questions.

### Generate a summary

Add `--target summary` to distill the source material into a study summary: a short overview, the key points, and a glossary of essential terms.

```bash
playable-lessons generate --topic "Supply chain resilience" --target summary -p ollama -m llama3.1:8b -o summary/

playable-lessons generate -i notes.md --target summary --cards 10 -o summary/ -f html,txt,json
```

| Format | Output |
| ------ | ------ |
| `html` | Self-contained study sheet (`.summary.html`) — overview, numbered key points, glossary; works offline |
| `txt` | A printable summary with key points and a glossary (`.summary.txt`) |
| `json` | The raw structured summary (`.summary.json`) |

The default format for summary is `html,txt`; `--cards N` sets the target number of key points.

### Generate AI-collaboration tasks

Add `--target ai-task` to re-engineer the material into **AI-collaboration tasks** — tasks a learner completes by *iteratively interrogating* an LLM chatbot. Each task is built so the chatbot's first answer is wrong or incomplete until the learner probes it: a concrete scenario with 2–4 **load-bearing specifics**, a student-facing brief, a deliverable, an **engagement-anchored rubric** (not a correctness rubric), and a note on why a delegating learner loses. (This output never produces quizzes/flashcards/summaries — pick those targets for those.)

```bash
playable-lessons generate --topic "clinic outreach on a budget cut" --target ai-task -p ollama -m llama3.1:8b -o tasks/ --cards 3

playable-lessons generate -i worksheet.md --target ai-task -o tasks/ -f html,txt,json
```

| Format | Output |
| ------ | ------ |
| `html` | Self-contained task sheet (`.ai-task.html`) — scenario, brief, deliverable, load-bearing specifics, rubric; works offline |
| `txt` | A printable version of the tasks (`.ai-task.txt`) |
| `json` | The raw structured task set (`.ai-task.json`) |

The default format for ai-task is `html,txt`; `--cards N` sets the number of tasks (try `--cards 3` for richer tasks).

### Generate a case study

Add `--target case-study` to turn the material into a **teaching case study** — a realistic situation (protagonist, situation, key facts, conflict, decision points, discussion questions) a learner analyzes. Use `--depth` to control how much is produced:

| depth | produces |
| --- | --- |
| `idea` | a brief premise (protagonist, situation, conflict) |
| `outline` | the full structured skeleton, no prose |
| `complete` *(default)* | the full skeleton plus a written narrative |

```bash
playable-lessons generate --topic "clinic scheduling under staff shortages" --target case-study --depth complete -p ollama -m llama3.1:8b -o case/

playable-lessons generate -i notes.md --target case-study --depth outline -o case/ -f html,txt,json
```

| Format | Output |
| ------ | ------ |
| `html` | Self-contained case-study sheet (`.case-study.html`) — narrative + structured sections; works offline |
| `txt` | A printable version of the case study (`.case-study.txt`) |
| `json` | The raw structured case study (`.case-study.json`) |

The default format for case-study is `html,txt`; `--depth` selects idea | outline | complete (default complete).

### Plan a set of outputs (recommender)

Not sure which outputs to make? `plan` analyzes the material and recommends a complementary set (2–4 of the targets above), then optionally generates them all into the output folder.

```bash
# Just recommend a set:
playable-lessons plan --topic "supply chain resilience" -p ollama -m llama3.1:8b -o plan/

# Recommend AND generate every recommended output:
playable-lessons plan -i notes.md --apply -o plan/
```

`plan` writes `plan.json` + `plan.txt` + `plan.html` (the recommendation). With `--apply` it also generates each recommended target (`.html` + `.json`). In the desktop app, the **Plan** target shows the recommendation with a “Generate all → new project” action that writes the whole set to a project folder.

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

### Inline editing + AI refinement

After generating any output (flashcards, quiz, summary, AI-collaboration tasks, case study), switch to **Study → Edit** to tweak the content inline — edit text fields, add/delete items, and use the **✨** button to AI-refine individual fields. Click **💬** before ✨ to give a custom direction (e.g. "simplify for beginners"). Changes flow through to exports.

---

## Self-hosted web (Docker)

For institutions or teams that want a browser-based version without per-user API keys. The server holds the key; users enter a shared access code.

### Quick start

```bash
# 1. Grab the files
curl -sL https://raw.githubusercontent.com/michael-borck/playable-lessons/main/docker-compose.yml -o docker-compose.yml
mkdir -p server
curl -sL https://raw.githubusercontent.com/michael-borck/playable-lessons/main/server/.env.example -o server/.env

# 2. Edit server/.env — set your API key + optional access code
#    ANTHROPIC_API_KEY=sk-ant-...
#    ACCESS_CODE=staff-2024   (comma-separated for multiple groups; blank = no gate)

# 3. Swap build for the prebuilt image in docker-compose.yml
#    image: ghcr.io/michael-borck/playable-lessons:latest

# 4. Deploy
docker compose pull && docker compose up -d
```

Staff access the server at `http://your-server:3000`, enter the access code, and generate. Work is stored per-browser (localStorage); the AI key stays server-side. Rate limiting is configurable (`RATE_LIMIT_PER_HOUR`, default 30).

To revoke a group: remove their code from `.env` → `docker compose restart`. To update: change the image tag → `docker compose pull && docker compose up -d`.

---

## Tech stack

Electron + electron-vite · React 19 + TypeScript · Zustand · [inkjs](https://github.com/y-lohse/inkjs) (Ink compiler + runtime) · @xyflow/react (graph editor) · yargs (CLI) · Express (self-hosted server).


## License

MIT © michael-borck
