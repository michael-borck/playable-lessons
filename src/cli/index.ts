#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { compileInk, exportStandaloneHTML } from '../shared/storyExport.js'
import { generateInk, generateFlashcards, generateQuiz, generateSummary, generateAiTask, generateCaseStudy, generatePlan, applyPlan } from '../shared/generate.js'
import { toCSV, toAnkiTSV, toStandaloneHTML as toFlashcardHTML } from '../shared/flashcardExport.js'
import { toStandaloneHTML as toQuizHTML, toPlainText as toQuizText } from '../shared/quizExport.js'
import { toStandaloneHTML as toSummaryHTML, toPlainText as toSummaryText } from '../shared/summaryExport.js'
import { toStandaloneHTML as toAiTaskHTML, toPlainText as toAiTaskText } from '../shared/aiTaskExport.js'
import { toStandaloneHTML as toCaseStudyHTML, toPlainText as toCaseStudyText } from '../shared/caseStudyExport.js'
import { toStandaloneHTML as toPlanHTML, toPlainText as toPlanText } from '../shared/planExport.js'
import { APP_VERSION } from '../shared/version.generated.js'
import type { ProviderConfig, ResolvedProvider } from '../shared/aiClient.js'

/** Pick a provider from the environment when --provider isn't given. */
function resolveProviderFromEnv(): ResolvedProvider {
  if (process.env.ANTHROPIC_API_KEY) return 'claude'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return 'ollama'
}

/**
 * Build a ProviderConfig from CLI flags + environment. API keys come from
 * env vars (CI/headless-friendly), never the OS keychain (that's GUI-only).
 */
function buildCliConfig(o: {
  provider?: string
  model?: string
  baseUrl?: string
  ollamaUrl: string
}): ProviderConfig {
  const provider = (o.provider as ResolvedProvider) || resolveProviderFromEnv()

  switch (provider) {
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
      return { provider, model: o.model || 'gpt-4o', apiKey }
    }
    case 'custom': {
      if (!o.baseUrl) throw new Error('--base-url is required for the custom provider')
      if (!o.model) throw new Error('--model is required for the custom provider')
      return {
        provider,
        model: o.model,
        baseUrl: o.baseUrl,
        apiKey: process.env.PLAYABLE_LESSONS_API_KEY || process.env.OPENAI_API_KEY || ''
      }
    }
    case 'ollama':
      return {
        provider,
        model: o.model || 'llama3.1:8b',
        ollamaUrl: o.ollamaUrl,
        ollamaToken: process.env.OLLAMA_API_KEY || ''
      }
    case 'claude':
    default: {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
      return { provider: 'claude', model: o.model || 'claude-opus-4-8', apiKey }
    }
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'story'
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

yargs(hideBin(process.argv))
  .scriptName('playable-lessons')
  .usage('$0 <command> [options]')

  .command('validate', 'Validate an Ink source file', (yargs) => {
    return yargs.option('input', { alias: 'i', type: 'string', demandOption: true, describe: 'Path to .ink file' })
  }, async (argv) => {
    try {
      const source = await readFile(argv.input as string, 'utf-8')
      await compileInk(source)
      console.log('Valid! Story compiled successfully.')
    } catch (err) {
      console.error('Validation failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

  .command('export', 'Export an Ink file to another format', (yargs) => {
    return yargs
      .option('input', { alias: 'i', type: 'string', demandOption: true, describe: 'Path to .ink file' })
      .option('output', { alias: 'o', type: 'string', demandOption: true, describe: 'Output directory' })
      .option('format', { alias: 'f', type: 'string', default: 'html', describe: 'Export format: html, ink, json' })
      .option('title', { alias: 't', type: 'string', default: 'Story', describe: 'Story title' })
  }, async (argv) => {
    try {
      const source = await readFile(argv.input as string, 'utf-8')
      const outputDir = argv.output as string
      await mkdir(outputDir, { recursive: true })

      const formats = (argv.format as string).split(',')
      const title = argv.title as string
      const baseName = basename(argv.input as string, '.ink')

      for (const format of formats) {
        switch (format.trim()) {
          case 'html': {
            const html = await exportStandaloneHTML(source, title)
            const outPath = join(outputDir, `${baseName}.html`)
            await writeFile(outPath, html)
            console.log(`Exported HTML: ${outPath}`)
            break
          }
          case 'json': {
            const json = await compileInk(source)
            const outPath = join(outputDir, `${baseName}.ink.json`)
            await writeFile(outPath, json)
            console.log(`Exported JSON: ${outPath}`)
            break
          }
          case 'ink': {
            const outPath = join(outputDir, `${baseName}.ink`)
            await writeFile(outPath, source)
            console.log(`Exported Ink: ${outPath}`)
            break
          }
          default:
            console.warn(`Unknown format: ${format}`)
        }
      }
    } catch (err) {
      console.error('Export failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

  .command('generate', 'Generate an Ink story or flashcards from source material using AI', (yargs) => {
    return yargs
      .option('input', { alias: 'i', type: 'string', describe: 'Path to source material (text/markdown). Omit to use --topic or stdin.' })
      .option('topic', { type: 'string', describe: 'A topic or brief to generate from (instead of --input)' })
      .option('output', { alias: 'o', type: 'string', demandOption: true, describe: 'Output directory' })
      .option('provider', { alias: 'p', type: 'string', describe: 'claude | openai | ollama | custom (default: inferred from env)' })
      .option('model', { alias: 'm', type: 'string', describe: 'Model id (provider-specific default if omitted)' })
      .option('base-url', { type: 'string', describe: 'Base URL for a custom OpenAI-compatible endpoint' })
      .option('ollama-url', { type: 'string', default: 'http://localhost:11434', describe: 'Ollama base URL' })
      .option('mode', { type: 'string', default: 'topic', describe: 'Input mode: topic | lesson | methodology | case-study | lecture-notes | scenario' })
      .option('target', { type: 'string', default: 'story', describe: 'What to generate: story (interactive fiction) | flashcards | quiz | summary | ai-task | case-study' })
      .option('cards', { type: 'number', default: 12, describe: 'Number of items to generate — flashcards, quiz questions, summary key points, or AI-collaboration tasks (target=flashcards|quiz|summary|ai-task)' })
      .option('depth', { type: 'string', default: 'complete', describe: 'Case-study depth: idea | outline | complete (target=case-study)' })
      .option('length', { alias: 'l', type: 'string', default: 'medium', describe: 'Story length: short | medium | long' })
      .option('tone', { type: 'string', default: 'professional', describe: 'Narrative tone' })
      .option('protagonist', { type: 'string', default: 'the reader', describe: 'Protagonist type' })
      .option('answers', { type: 'string', describe: 'Optional answers to clarifying questions' })
      .option('retries', { type: 'number', default: 3, describe: 'Max compile attempts, with AI-assisted fixes between them (raise for weaker local models)' })
      .option('format', { alias: 'f', type: 'string', describe: 'Output formats. story: ink|html|json (default ink,html). flashcards: csv|html|anki|json (default csv,html). quiz: html|txt|json (default html,json). summary: html|txt|json (default html,txt). ai-task: html|txt|json (default html,txt). case-study: html|txt|json (default html,txt).' })
      .option('title', { alias: 't', type: 'string', describe: 'Title for the story, flashcard deck, quiz, summary, AI-task set, or case study (defaults to the input/topic name)' })
  }, async (argv) => {
    try {
      // Resolve the source material: --input file, --topic string, or stdin.
      let inputText = ''
      let base = 'story'
      if (argv.input) {
        inputText = await readFile(argv.input as string, 'utf-8')
        base = basename(argv.input as string).replace(/\.[^.]+$/, '')
      } else if (argv.topic) {
        inputText = argv.topic as string
        base = slug(argv.topic as string)
      } else {
        inputText = await readStdin()
      }
      if (!inputText.trim()) {
        throw new Error('No source material — provide --input <file>, --topic "<brief>", or pipe text via stdin')
      }

      const config = buildCliConfig({
        provider: argv.provider as string | undefined,
        model: argv.model as string | undefined,
        baseUrl: argv['base-url'] as string | undefined,
        ollamaUrl: (argv['ollama-url'] as string) || 'http://localhost:11434'
      })
      const outputDir = argv.output as string
      await mkdir(outputDir, { recursive: true })
      const title = (argv.title as string) || base
      const target = (argv.target as string) || 'story'
      if (target !== 'story' && target !== 'flashcards' && target !== 'quiz' && target !== 'summary' && target !== 'ai-task' && target !== 'case-study') {
        throw new Error(`Unknown --target "${target}". Use story, flashcards, quiz, summary, ai-task, or case-study.`)
      }

      const formatRaw = argv.format as string | undefined
      const formats = formatRaw
        ? formatRaw.split(',').map((f) => f.trim()).filter(Boolean)
        : target === 'flashcards'
          ? ['csv', 'html']
          : target === 'quiz'
            ? ['html', 'json']
            : target === 'summary'
              ? ['html', 'txt']
              : target === 'ai-task'
                ? ['html', 'txt']
                : target === 'case-study'
                  ? ['html', 'txt']
                  : ['ink', 'html']

      if (target === 'flashcards') {
        console.error(`Generating flashcards with ${config.provider} (${config.model})…`)
        const result = await generateFlashcards(
          {
            inputMode: argv.mode as string,
            inputText,
            cardCount: argv.cards as number,
            tone: argv.tone as string
          },
          config,
          { log: (m) => console.error(m) }
        )

        for (const format of formats) {
          switch (format) {
            case 'csv': {
              const outPath = join(outputDir, `${base}.flashcards.csv`)
              await writeFile(outPath, toCSV(result))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'html': {
              const outPath = join(outputDir, `${base}.flashcards.html`)
              await writeFile(outPath, toFlashcardHTML(result, title))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'anki': {
              const outPath = join(outputDir, `${base}.flashcards.txt`)
              await writeFile(outPath, toAnkiTSV(result))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'json': {
              const outPath = join(outputDir, `${base}.flashcards.json`)
              await writeFile(outPath, JSON.stringify(result, null, 2))
              console.log(`Wrote ${outPath}`)
              break
            }
            default:
              console.warn(`Unknown format: ${format}`)
          }
        }
      } else if (target === 'quiz') {
        console.error(`Generating a quiz with ${config.provider} (${config.model})…`)
        const result = await generateQuiz(
          {
            inputMode: argv.mode as string,
            inputText,
            questionCount: argv.cards as number,
            tone: argv.tone as string
          },
          config,
          { log: (m) => console.error(m) }
        )

        for (const format of formats) {
          switch (format) {
            case 'html': {
              const outPath = join(outputDir, `${base}.quiz.html`)
              await writeFile(outPath, toQuizHTML(result, title))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'json': {
              const outPath = join(outputDir, `${base}.quiz.json`)
              await writeFile(outPath, JSON.stringify(result, null, 2))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'txt': {
              const outPath = join(outputDir, `${base}.quiz.txt`)
              await writeFile(outPath, toQuizText(result, title))
              console.log(`Wrote ${outPath}`)
              break
            }
            default:
              console.warn(`Unknown format: ${format}`)
          }
        }
      } else if (target === 'summary') {
        console.error(`Generating a summary with ${config.provider} (${config.model})…`)
        const result = await generateSummary(
          {
            inputMode: argv.mode as string,
            inputText,
            keyPointCount: argv.cards as number,
            tone: argv.tone as string
          },
          config,
          { log: (m) => console.error(m) }
        )

        for (const format of formats) {
          switch (format) {
            case 'html': {
              const outPath = join(outputDir, `${base}.summary.html`)
              await writeFile(outPath, toSummaryHTML(result, title))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'txt': {
              const outPath = join(outputDir, `${base}.summary.txt`)
              await writeFile(outPath, toSummaryText(result, title))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'json': {
              const outPath = join(outputDir, `${base}.summary.json`)
              await writeFile(outPath, JSON.stringify(result, null, 2))
              console.log(`Wrote ${outPath}`)
              break
            }
            default:
              console.warn(`Unknown format: ${format}`)
          }
        }
      } else if (target === 'ai-task') {
        console.error(`Generating AI-collaboration tasks with ${config.provider} (${config.model})…`)
        const result = await generateAiTask(
          {
            inputMode: argv.mode as string,
            inputText,
            taskCount: argv.cards as number,
            tone: argv.tone as string
          },
          config,
          { log: (m) => console.error(m) }
        )

        for (const format of formats) {
          switch (format) {
            case 'html': {
              const outPath = join(outputDir, `${base}.ai-task.html`)
              await writeFile(outPath, toAiTaskHTML(result, title))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'txt': {
              const outPath = join(outputDir, `${base}.ai-task.txt`)
              await writeFile(outPath, toAiTaskText(result, title))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'json': {
              const outPath = join(outputDir, `${base}.ai-task.json`)
              await writeFile(outPath, JSON.stringify(result, null, 2))
              console.log(`Wrote ${outPath}`)
              break
            }
            default:
              console.warn(`Unknown format: ${format}`)
          }
        }
      } else if (target === 'case-study') {
        console.error(`Generating a case study with ${config.provider} (${config.model})…`)
        const result = await generateCaseStudy(
          {
            inputMode: argv.mode as string,
            inputText,
            depth: ((argv.depth as string) || 'complete') as 'idea' | 'outline' | 'complete',
            tone: argv.tone as string
          },
          config,
          { log: (m) => console.error(m) }
        )

        for (const format of formats) {
          switch (format) {
            case 'html': {
              const outPath = join(outputDir, `${base}.case-study.html`)
              await writeFile(outPath, toCaseStudyHTML(result, title))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'txt': {
              const outPath = join(outputDir, `${base}.case-study.txt`)
              await writeFile(outPath, toCaseStudyText(result, title))
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'json': {
              const outPath = join(outputDir, `${base}.case-study.json`)
              await writeFile(outPath, JSON.stringify(result, null, 2))
              console.log(`Wrote ${outPath}`)
              break
            }
            default:
              console.warn(`Unknown format: ${format}`)
          }
        }
      } else {
        console.error(`Generating with ${config.provider} (${config.model})…`)
        const result = await generateInk(
          {
            inputMode: argv.mode as string,
            inputText,
            storyLength: argv.length as string,
            protagonistType: argv.protagonist as string,
            tone: argv.tone as string,
            answers: argv.answers as string | undefined
          },
          config,
          { log: (m) => console.error(m), maxCompileRetries: argv.retries as number }
        )

        const storyFormats = formats.includes('ink') ? formats : ['ink', ...formats]
        for (const format of storyFormats) {
          switch (format) {
            case 'ink': {
              const outPath = join(outputDir, `${base}.ink`)
              await writeFile(outPath, result.inkSource)
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'json': {
              const outPath = join(outputDir, `${base}.ink.json`)
              await writeFile(outPath, result.compiledJson)
              console.log(`Wrote ${outPath}`)
              break
            }
            case 'html': {
              const html = await exportStandaloneHTML(result.inkSource, title)
              const outPath = join(outputDir, `${base}.html`)
              await writeFile(outPath, html)
              console.log(`Wrote ${outPath}`)
              break
            }
            default:
              console.warn(`Unknown format: ${format}`)
          }
        }
      }
      console.log('Done.')
    } catch (err) {
      console.error('Generation failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

  .command('plan', 'Recommend a set of outputs for source material (optionally generate them all)', (yargs) => {
    return yargs
      .option('input', { alias: 'i', type: 'string', describe: 'Path to source material. Omit to use --topic or stdin.' })
      .option('topic', { type: 'string', describe: 'A topic or brief to plan from (instead of --input)' })
      .option('output', { alias: 'o', type: 'string', demandOption: true, describe: 'Output directory' })
      .option('provider', { alias: 'p', type: 'string', describe: 'claude | openai | ollama | custom (default: inferred from env)' })
      .option('model', { alias: 'm', type: 'string', describe: 'Model id' })
      .option('base-url', { type: 'string', describe: 'Base URL for a custom OpenAI-compatible endpoint' })
      .option('ollama-url', { type: 'string', default: 'http://localhost:11434', describe: 'Ollama base URL' })
      .option('mode', { type: 'string', default: 'topic', describe: 'Input mode: topic | lesson | methodology | case-study | lecture-notes | scenario' })
      .option('tone', { type: 'string', default: 'professional', describe: 'Narrative tone' })
      .option('apply', { type: 'boolean', default: false, describe: 'Also generate every recommended output' })
      .option('format', { alias: 'f', type: 'string', default: 'html,json', describe: 'When applying: artifact formats html|json' })
  }, async (argv) => {
    try {
      let inputText = ''
      let base = 'plan'
      if (argv.input) {
        inputText = await readFile(argv.input as string, 'utf-8')
        base = basename(argv.input as string).replace(/\.[^.]+$/, '')
      } else if (argv.topic) {
        inputText = argv.topic as string
        base = slug(argv.topic as string)
      } else {
        inputText = await readStdin()
      }
      if (!inputText.trim()) {
        throw new Error('No source material — provide --input <file>, --topic "<brief>", or pipe text via stdin')
      }

      const config = buildCliConfig({
        provider: argv.provider as string | undefined,
        model: argv.model as string | undefined,
        baseUrl: argv['base-url'] as string | undefined,
        ollamaUrl: (argv['ollama-url'] as string) || 'http://localhost:11434'
      })
      const outputDir = argv.output as string
      await mkdir(outputDir, { recursive: true })
      const tone = argv.tone as string
      const log = (m: string) => console.error(m)

      console.error(`Planning with ${config.provider} (${config.model})…`)
      const plan = await generatePlan({ inputMode: argv.mode as string, inputText, tone }, config, { log })

      await writeFile(join(outputDir, `${base}.plan.json`), JSON.stringify(plan, null, 2))
      await writeFile(join(outputDir, `${base}.plan.txt`), toPlanText(plan))
      await writeFile(join(outputDir, `${base}.plan.html`), toPlanHTML(plan, plan.title || base))
      console.log(`Wrote plan: ${plan.recommendations.length} recommendation(s).`)

      if (argv.apply) {
        const formats = (argv.format as string).split(',').map((f) => f.trim()).filter(Boolean)
        const artifacts = await applyPlan(plan, { inputMode: argv.mode as string, inputText, tone }, config, { log })
        const write = async (kind: string, html: string | null, json: object) => {
          if (formats.includes('html') && html) {
            await writeFile(join(outputDir, `${base}.${kind}.html`), html)
          }
          if (formats.includes('json')) {
            await writeFile(join(outputDir, `${base}.${kind}.json`), JSON.stringify(json, null, 2))
          }
        }
        if (artifacts.story) await write('story', await exportStandaloneHTML(artifacts.story.inkSource, base), artifacts.story)
        if (artifacts.flashcards) await write('flashcards', toFlashcardHTML(artifacts.flashcards, base), artifacts.flashcards)
        if (artifacts.quiz) await write('quiz', toQuizHTML(artifacts.quiz, base), artifacts.quiz)
        if (artifacts.summary) await write('summary', toSummaryHTML(artifacts.summary, base), artifacts.summary)
        if (artifacts.aiTask) await write('ai-task', toAiTaskHTML(artifacts.aiTask, base), artifacts.aiTask)
        if (artifacts.caseStudy) await write('case-study', toCaseStudyHTML(artifacts.caseStudy, base), artifacts.caseStudy)
        console.log('Applied: generated every recommended output.')
      }
      console.log('Done.')
    } catch (err) {
      console.error('Planning failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

  .demandCommand(1, 'You must specify a command')
  .help()
  .version(APP_VERSION)
  .parse()
