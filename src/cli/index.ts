#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { compileInk, exportStandaloneHTML } from '../shared/storyExport.js'

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

  .demandCommand(1, 'You must specify a command')
  .help()
  .version('0.1.0')
  .parse()
