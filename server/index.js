#!/usr/bin/env node
/**
 * Playable Lessons — self-hosted web server.
 *
 * A thin Express wrapper around the shared generators. Holds the LLM key
 * server-side (from .env), serves a browser UI, optional access-code gate,
 * and per-IP rate limiting. Packaged as a Docker image via GHCR.
 *
 * Run:  node server/index.js   (after `npm run build:cli`)
 * Docker:  docker compose up   (pulls from GHCR, reads .env)
 */
const express = require('express')
const path = require('path')
const {
  generateInk,
  generateSummary,
  generateFlashcards,
  generateQuiz,
  generateAiTask,
  generateCaseStudy,
  generateSceneImages
} = require('../out/shared/generate.js')
const { exportStandaloneHTML } = require('../out/shared/storyExport.js')
const { exportH5P, findStateConstructs } = require('../out/shared/h5pExporter.js')
const { isImageProviderConfigured } = require('../out/shared/imageClient.js')
const { APP_VERSION } = require('../out/shared/version.generated.js')
const { createGenerationQueue } = require('./queue')

const app = express()
app.use(express.json({ limit: '1mb' }))

// Behind a reverse proxy (nginx/Caddy), req.ip is the proxy's address — the
// per-IP rate limiter would share one bucket across ALL visitors. Set
// TRUST_PROXY=1 (one proxy hop) so req.ip reflects the real client. Off by
// default: when the app port is directly reachable, trusting X-Forwarded-For
// would let clients spoof their IP and bypass the rate limit.
const TRUST_PROXY = process.env.TRUST_PROXY
if (TRUST_PROXY) {
  const hops = parseInt(TRUST_PROXY, 10)
  app.set('trust proxy', Number.isNaN(hops) ? TRUST_PROXY === 'true' : hops)
}

// ─── Config from environment ───
const ACCESS_CODES = (process.env.ACCESS_CODE || '').split(',').map((s) => s.trim()).filter(Boolean)
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_HOUR || '30', 10)
const PORT = parseInt(process.env.PORT || '3000', 10)
const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || '20000', 10)

function buildConfig() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'claude', model: process.env.MODEL || 'claude-sonnet-4-20250514', apiKey: process.env.ANTHROPIC_API_KEY }
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', model: process.env.MODEL || 'gpt-4o', apiKey: process.env.OPENAI_API_KEY }
  }
  return {
    provider: 'ollama',
    model: process.env.MODEL || 'llama3.1:8b',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaToken: process.env.OLLAMA_TOKEN || ''
  }
}
const config = buildConfig()
// Compile-fix retries: the AI gets real Ink error messages and repairs its own
// source between attempts — a weaker model may need more than the default 3.
const COMPILE_RETRIES = parseInt(process.env.COMPILE_RETRIES || '3', 10)
// Force every story to one length (e.g. STORY_LENGTH=short for a public
// teaser). Unset: length follows the requested scene count.
const STORY_LENGTH = ['short', 'medium', 'long'].includes(process.env.STORY_LENGTH || '')
  ? process.env.STORY_LENGTH
  : null
// Generations run as queued jobs (see queue.js) — one at a time by default,
// so a busy public server serializes LLM + image spend instead of stacking it.
const queue = createGenerationQueue({ concurrency: parseInt(process.env.GENERATE_CONCURRENCY || '1', 10) })

// ─── Scene images (optional, opt-in via SCENE_IMAGES=true) ───
// A public story request can trigger many image generations, so this is off
// unless the operator enables it AND a provider is configured. Costs/rate are
// bounded by IMAGE_MAX_SCENES and the per-IP rate limit above.
const SCENE_IMAGES = /^(1|true|yes)$/i.test(process.env.SCENE_IMAGES || '')
const IMAGE_STYLE = process.env.IMAGE_STYLE === 'photorealistic' ? 'photorealistic' : 'cartoon'
const IMAGE_MAX_SCENES = parseInt(process.env.IMAGE_MAX_SCENES || '8', 10)

function buildImageConfig() {
  if (!SCENE_IMAGES) return null
  const provider =
    process.env.IMAGE_PROVIDER ||
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      ? 'gemini'
      : process.env.IMAGE_BASE_URL
        ? 'custom'
        : process.env.OPENAI_API_KEY
          ? 'openai'
          : '')
  if (!provider) return null
  const config = { provider, model: process.env.IMAGE_MODEL || undefined }
  // Size: '1024x1024' etc. for OpenAI/custom, an aspect ratio for Gemini.
  if (process.env.IMAGE_SIZE) config.size = process.env.IMAGE_SIZE
  if (provider === 'openai') {
    config.apiKey = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY
  } else if (provider === 'gemini') {
    config.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  } else if (provider === 'custom') {
    config.baseUrl = process.env.IMAGE_BASE_URL
    config.apiKey = process.env.IMAGE_API_KEY || ''
  } else if (provider === 'swarmui') {
    config.baseUrl = process.env.IMAGE_BASE_URL
    config.apiKey = process.env.IMAGE_API_KEY || process.env.SWARMUI_TOKEN || ''
  }
  return isImageProviderConfigured(config) ? config : null
}
const imageConfig = buildImageConfig()

// ─── Access-code gate (optional) ───
if (ACCESS_CODES.length > 0) {
  app.use('/api', (req, res, next) => {
    if (!ACCESS_CODES.includes(req.headers['x-access-code'])) {
      return res.status(403).json({ error: 'Invalid or missing access code.' })
    }
    next()
  })
}

// ─── Rate limiting (per-IP, hourly window, in-memory) ───
// Only job SUBMISSION counts — polling /api/job/:id every few seconds would
// otherwise burn a visitor's whole budget before one story finishes.
const ipHits = new Map()
const WINDOW_MS = 60 * 60 * 1000
setInterval(() => ipHits.clear(), WINDOW_MS)
app.use('/api/generate', (req, res, next) => {
  const ip = req.ip
  const hits = (ipHits.get(ip) || 0) + 1
  ipHits.set(ip, hits)
  if (hits > RATE_LIMIT) {
    return res.status(429).json({ error: `Rate limit exceeded (${RATE_LIMIT}/hour). Try again later.` })
  }
  next()
})

// ─── Health / config check (lets the UI know if an access code is needed) ───
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: APP_VERSION,
    provider: config.provider,
    model: config.model,
    requiresAccessCode: ACCESS_CODES.length > 0,
    // The web UI shows the scene-images option only when the operator has it
    // configured — visitors never see a checkbox that can't work.
    sceneImages: imageConfig ? { available: true, style: IMAGE_STYLE } : { available: false },
    queue: queue.stats()
  })
})

// ─── Generate (async job) ───
// POST validates + enqueues, then the client polls /api/job/:id — so a queued
// visitor sees their position, can cancel while waiting, and can leave and
// come back (job results are kept for an hour, in memory).
const TARGETS = ['story', 'summary', 'flashcards', 'quiz', 'ai-task', 'case-study']

app.post('/api/generate', (req, res) => {
  const { source, target, count, depth, inputMode, tone, style, images, imageStyle } = req.body
  if (!source || !source.trim()) {
    return res.status(400).json({ error: 'No source material provided.' })
  }
  if (source.length > MAX_INPUT_CHARS) {
    return res.status(400).json({ error: `Source too long (max ${MAX_INPUT_CHARS} chars).` })
  }
  if (!TARGETS.includes(target)) {
    return res.status(400).json({ error: `Unknown target: ${target}` })
  }
  const params = { inputMode: inputMode || 'topic', inputText: source, tone: tone || 'professional' }

  const job = queue.submit(async (log) => {
    const logBoth = (m) => { log(m); console.log('[generate]', m) }
    try {
      switch (target) {
        case 'story': {
          const wantImages = images === true && !!imageConfig
          const story = await generateInk(
            {
              ...params,
              storyLength: STORY_LENGTH || (count > 15 ? 'long' : count > 8 ? 'medium' : 'short'),
              branchingStyle: style === 'branching' ? 'branching' : 'stateful',
              sceneImages: wantImages
            },
            config,
            { log: logBoth, maxCompileRetries: COMPILE_RETRIES }
          )
          // Resolve # IMAGE_PROMPT: tags to real images. Never fatal — a
          // failed batch still returns the (text-only) story.
          let sceneImages
          if (wantImages) {
            try {
              sceneImages = await generateSceneImages(story.inkSource, imageConfig, {
                style: imageStyle === 'photorealistic' ? 'photorealistic' : IMAGE_STYLE,
                maxImages: IMAGE_MAX_SCENES,
                log: logBoth
              })
            } catch (err) {
              logBoth(`Scene image generation failed: ${err.message || err}`)
            }
          }
          const html = await exportStandaloneHTML(story.inkSource, 'Interactive Story', sceneImages)
          const result = { type: 'story', title: 'Interactive Story', html }
          if (sceneImages) result.imageCount = Object.keys(sceneImages).length
          // A .h5p download is only offered when the story is actually
          // convertible (no variables/conditionals) — i.e. H5P-compatible mode.
          if (findStateConstructs(story.inkSource).length === 0) {
            result.h5p = Buffer.from(exportH5P(story.inkSource, 'Interactive Story')).toString('base64')
          }
          return result
        }
        case 'summary':
          return await generateSummary({ ...params, keyPointCount: count || 8 }, config, { log: logBoth })
        case 'flashcards':
          return await generateFlashcards({ ...params, cardCount: count || 12 }, config, { log: logBoth })
        case 'quiz':
          return await generateQuiz({ ...params, questionCount: count || 10 }, config, { log: logBoth })
        case 'ai-task':
          return await generateAiTask({ ...params, taskCount: count || 3 }, config, { log: logBoth })
        case 'case-study':
        default:
          return await generateCaseStudy({ ...params, depth: depth || 'complete' }, config, { log: logBoth })
      }
    } catch (err) {
      // Log server-side too — the client's job status is the only other trace.
      console.error(`[generate] ${target} failed:`, err.message || err)
      throw err
    }
  })

  res.status(202).json({ jobId: job.id, position: queue.position(job.id) })
})

// ─── Job status / cancel ───
app.get('/api/job/:id', (req, res) => {
  const view = queue.get(req.params.id)
  if (!view) {
    return res.status(404).json({ error: 'Job not found — it may have expired (results are kept for an hour) or the server restarted.' })
  }
  res.json(view)
})

app.delete('/api/job/:id', (req, res) => {
  // 'cancelled' | 'running' | 'finished' | 'not_found' — the pipeline has no
  // abort signal, so a job already running plays out to the end.
  res.json({ status: queue.cancel(req.params.id) })
})

// ─── Serve web UI ───
app.use(express.static(path.join(__dirname, 'public')))
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Playable Lessons server running on :${PORT}`)
  console.log(`Provider: ${config.provider} (${config.model})`)
  console.log(`Rate limit: ${RATE_LIMIT}/hour per IP`)
  console.log(`Access codes: ${ACCESS_CODES.length ? ACCESS_CODES.length + ' configured' : 'not required'}`)
  console.log(`Scene images: ${imageConfig ? `on (${imageConfig.provider}, ${IMAGE_STYLE}, max ${IMAGE_MAX_SCENES}/story)` : 'off'}`)
})
// A story request can run for minutes (LLM passes + image generation,
// especially against a CPU image backend) — allow long in-flight requests.
server.requestTimeout = 15 * 60 * 1000
