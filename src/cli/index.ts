#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { compileInk, exportStandaloneHTML } from '../shared/storyExport.js'
import { generateInk } from '../shared/generate.js'
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

  .command('generate', 'Generate an Ink story from source material using AI', (yargs) => {
    return yargs
      .option('input', { alias: 'i', type: 'string', describe: 'Path to source material (text/markdown). Omit to use --topic or stdin.' })
      .option('topic', { type: 'string', describe: 'A topic or brief to generate from (instead of --input)' })
      .option('output', { alias: 'o', type: 'string', demandOption: true, describe: 'Output directory' })
      .option('provider', { alias: 'p', type: 'string', describe: 'claude | openai | ollama | custom (default: inferred from env)' })
      .option('model', { alias: 'm', type: 'string', describe: 'Model id (provider-specific default if omitted)' })
      .option('base-url', { type: 'string', describe: 'Base URL for a custom OpenAI-compatible endpoint' })
      .option('ollama-url', { type: 'string', default: 'http://localhost:11434', describe: 'Ollama base URL' })
      .option('mode', { type: 'string', default: 'topic', describe: 'Input mode: topic | lesson | methodology | case-study | lecture-notes | scenario' })
      .option('length', { alias: 'l', type: 'string', default: 'medium', describe: 'Story length: short | medium | long' })
      .option('tone', { type: 'string', default: 'professional', describe: 'Narrative tone' })
      .option('protagonist', { type: 'string', default: 'the reader', describe: 'Protagonist type' })
      .option('answers', { type: 'string', describe: 'Optional answers to clarifying questions' })
      .option('retries', { type: 'number', default: 3, describe: 'Max compile attempts, with AI-assisted fixes between them (raise for weaker local models)' })
      .option('format', { alias: 'f', type: 'string', default: 'ink,html', describe: 'Output formats: ink, html, json' })
      .option('title', { alias: 't', type: 'string', describe: 'Story title (defaults to the input/topic name)' })
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

      const outputDir = argv.output as string
      await mkdir(outputDir, { recursive: true })
      const title = (argv.title as string) || base

      const formats = (argv.format as string).split(',').map((f) => f.trim()).filter(Boolean)
      if (!formats.includes('ink')) formats.unshift('ink') // always keep the source

      for (const format of formats) {
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
      console.log('Done.')
    } catch (err) {
      console.error('Generation failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

  .demandCommand(1, 'You must specify a command')
  .help()
  .version('0.2.1')
  .parse()
