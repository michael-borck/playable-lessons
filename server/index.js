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
const helmet = require('helmet')
const path = require('path')
const crypto = require('crypto')
const {
  generateInk,
  generateSummary,
  generateFlashcards,
  generateQuiz,
  generateAiTask,
  generateCaseStudy,
  generateActivity,
  generateSceneImages
} = require('../out/shared/generate.js')
const { exportStandaloneHTML } = require('../out/shared/storyExport.js')
const { exportH5P, findStateConstructs } = require('../out/shared/h5pExporter.js')
const { exportEpub } = require('../out/shared/epubExporter.js')
const { exportScorm } = require('../out/shared/scormExporter.js')
const { isImageProviderConfigured } = require('../out/shared/imageClient.js')
const { APP_VERSION } = require('../out/shared/version.generated.js')
const { createGenerationQueue } = require('./queue')

const app = express()

// Security headers. The single-page UI uses inline scripts/styles, so the CSP
// keeps 'unsafe-inline' for those (there is no build step for server/public).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // The static page uses inline `onclick=` handlers; Helmet would
      // otherwise block them with `script-src-attr 'none'`.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://api.github.com'],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'none'"],
      // Helmet adds this by default; it would upgrade same-origin fetches to
      // HTTPS and break the documented `http://localhost:3000` deployment.
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  // HSTS only helps behind TLS; browsers ignore it on plain HTTP.
  strictTransportSecurity: { maxAge: 15552000, includeSubDomains: false }
}))

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
function intFromEnv(name, fallback, min, max) {
  const n = parseInt(process.env[name] ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const ACCESS_CODES = (process.env.ACCESS_CODE || '').split(',').map((s) => s.trim()).filter(Boolean)
const RATE_LIMIT = intFromEnv('RATE_LIMIT_PER_HOUR', 30, 1, 100_000)
const PORT = intFromEnv('PORT', 3000, 1, 65_535)
const MAX_INPUT_CHARS = intFromEnv('MAX_INPUT_CHARS', 20_000, 1, 1_000_000)

/** Constant-time access-code check (hash first so lengths always match). */
function accessCodeMatches(provided) {
  if (typeof provided !== 'string' || !provided) return false
  const a = crypto.createHash('sha256').update(provided).digest()
  return ACCESS_CODES.some((code) => {
    const b = crypto.createHash('sha256').update(code).digest()
    return crypto.timingSafeEqual(a, b)
  })
}

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
const COMPILE_RETRIES = intFromEnv('COMPILE_RETRIES', 3, 0, 20)
// Force every story to one length (e.g. STORY_LENGTH=short for a public
// teaser). Unset: length follows the requested scene count.
const STORY_LENGTH = ['short', 'medium', 'long'].includes(process.env.STORY_LENGTH || '')
  ? process.env.STORY_LENGTH
  : null
// Generations run as queued jobs (see queue.js) — one at a time by default,
// so a busy public server serializes LLM + image spend instead of stacking it.
const queue = createGenerationQueue({
  concurrency: intFromEnv('GENERATE_CONCURRENCY', 1, 1, 8),
  maxJobs: intFromEnv('MAX_JOBS', 100, 1, 10_000),
  // Cap retained memory per job: the small public result, and the internal
  // Ink source + scene images kept for on-demand downloads (same limit unless
  // MAX_ARTIFACT_MB is set). A public teaser must not be fillable by a few
  // large requests.
  maxResultBytes: intFromEnv('MAX_RESULT_MB', 16, 1, 256) * 1024 * 1024,
  maxArtifactBytes:
    intFromEnv('MAX_ARTIFACT_MB', intFromEnv('MAX_RESULT_MB', 16, 1, 256), 1, 512) * 1024 * 1024
})

// ─── Scene images (optional, opt-in via SCENE_IMAGES=true) ───
// A public story request can trigger many image generations, so this is off
// unless the operator enables it AND a provider is configured. Costs/rate are
// bounded by IMAGE_MAX_SCENES and the per-IP rate limit above.
const SCENE_IMAGES = /^(1|true|yes)$/i.test(process.env.SCENE_IMAGES || '')
const IMAGE_STYLE = process.env.IMAGE_STYLE === 'photorealistic' ? 'photorealistic' : 'cartoon'
const IMAGE_MAX_SCENES = intFromEnv('IMAGE_MAX_SCENES', 8, 0, 64)

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
    // /api/health stays public so the UI can discover that a code is needed.
    if (req.path === '/health') return next()
    if (!accessCodeMatches(req.headers['x-access-code'])) {
      return res.status(403).json({ error: 'Invalid or missing access code.' })
    }
    next()
  })
}

// ─── Rate limiting (per-IP, rolling hourly window, in-memory) ───
// Only job SUBMISSION counts — polling /api/job/:id every few seconds would
// otherwise burn a visitor's whole budget before one story finishes.
//
// Timestamps per IP (not a single global counter cleared hourly): a global
// reset let every client burst twice the limit around the boundary, and one
// busy hour grew the map without bound.
const ipHits = new Map() // ip -> number[] (submission timestamps, oldest first)
const WINDOW_MS = 60 * 60 * 1000
const RATE_SWEEP_MS = 10 * 60 * 1000

/** Drop timestamps older than the window for one IP. */
function recentHits(ip, now) {
  const times = ipHits.get(ip)
  if (!times) return []
  const fresh = times.filter((t) => now - t < WINDOW_MS)
  if (fresh.length > 0) ipHits.set(ip, fresh)
  else ipHits.delete(ip)
  return fresh
}

const rateSweeper = setInterval(() => {
  const now = Date.now()
  for (const ip of [...ipHits.keys()]) recentHits(ip, now)
}, RATE_SWEEP_MS)
rateSweeper.unref?.()

app.use('/api/generate', (req, res, next) => {
  const ip = req.ip
  const now = Date.now()
  const times = recentHits(ip, now)
  if (times.length >= RATE_LIMIT) {
    return res.status(429).json({ error: `Rate limit exceeded (${RATE_LIMIT}/hour). Try again later.` })
  }
  times.push(now)
  ipHits.set(ip, times)
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
const TARGETS = ['story', 'summary', 'flashcards', 'quiz', 'ai-task', 'case-study', 'activity']
// Same framing cards as the desktop app's Input Mode — injected into every
// generation prompt so the AI knows what KIND of material it was handed.
const INPUT_MODES = ['topic', 'lesson', 'methodology', 'case-study', 'lecture-notes', 'scenario']

app.post('/api/generate', (req, res) => {
  // A missing/non-JSON body leaves req.body undefined in Express 5.
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
  const { source, target } = body
  if (typeof source !== 'string' || !source.trim()) {
    return res.status(400).json({ error: 'No source material provided.' })
  }
  if (source.length > MAX_INPUT_CHARS) {
    return res.status(400).json({ error: `Source too long (max ${MAX_INPUT_CHARS} chars).` })
  }
  if (typeof target !== 'string' || !TARGETS.includes(target)) {
    return res.status(400).json({ error: `Unknown target: ${target}` })
  }

  // Preserve the per-target defaults when the caller omits `count`.
  const DEFAULT_COUNTS = { story: 5, summary: 8, flashcards: 12, quiz: 10, 'ai-task': 3, 'case-study': 5, activity: 4 }
  const rawCount = Number(body.count)
  const itemCount = Number.isFinite(rawCount)
    ? Math.min(50, Math.max(1, Math.floor(rawCount)))
    : (DEFAULT_COUNTS[target] ?? 5)
  const safeDepth = ['idea', 'outline', 'complete'].includes(body.depth) ? body.depth : 'complete'
  const safeTone = typeof body.tone === 'string' ? body.tone.slice(0, 200) : 'professional'
  const params = {
    inputMode: INPUT_MODES.includes(body.inputMode) ? body.inputMode : 'topic',
    inputText: source,
    tone: safeTone
  }

  const job = queue.submit(async (log, jobId) => {
    const logBoth = (m) => { log(m); console.log('[generate]', m) }
    try {
      switch (target) {
        case 'story': {
          const wantImages = body.images === true && !!imageConfig
          const story = await generateInk(
            {
              ...params,
              storyLength: STORY_LENGTH || (itemCount > 15 ? 'long' : itemCount > 8 ? 'medium' : 'short'),
              branchingStyle: body.style === 'branching' ? 'branching' : 'stateful',
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
                style: body.imageStyle === 'photorealistic' ? 'photorealistic' : IMAGE_STYLE,
                maxImages: IMAGE_MAX_SCENES,
                log: logBoth
              })
            } catch (err) {
              logBoth(`Scene image generation failed: ${err.message || err}`)
            }
          }
          // Store the story data internally; the download endpoints build the
          // HTML/H5P/EPUB/SCORM packages on demand. Returning all four as
          // base64 here multiplied memory and payload for exports the visitor
          // may never fetch.
          queue.setArtifact(jobId, {
            title: 'Interactive Story',
            inkSource: story.inkSource,
            sceneImages
          })
          // H5P and EPUB are decision-tree formats — only offered when the
          // story has no variables/conditionals. SCORM/HTML work for any story.
          const convertible = findStateConstructs(story.inkSource).length === 0
          const result = {
            type: 'story',
            title: 'Interactive Story',
            formats: { html: true, scorm: true, h5p: convertible, epub: convertible }
          }
          if (sceneImages) result.imageCount = Object.keys(sceneImages).length
          return result
        }
        case 'summary':
          return await generateSummary({ ...params, keyPointCount: itemCount }, config, { log: logBoth })
        case 'flashcards':
          return await generateFlashcards({ ...params, cardCount: itemCount }, config, { log: logBoth })
        case 'quiz':
          return await generateQuiz({ ...params, questionCount: itemCount }, config, { log: logBoth })
        case 'ai-task':
          return await generateAiTask({ ...params, taskCount: itemCount }, config, { log: logBoth })
        case 'activity':
          return await generateActivity(
            {
              ...params,
              kind: body.activityKind === 'slider' ? 'slider' : 'grid',
              statementCount: itemCount
            },
            config,
            { log: logBoth }
          )
        case 'case-study':
        default:
          return await generateCaseStudy({ ...params, depth: safeDepth }, config, { log: logBoth })
      }
    } catch (err) {
      // Log server-side too — the client's job status is the only other trace.
      console.error(`[generate] ${target} failed:`, err.message || err)
      throw err
    }
  })

  if (!job) {
    return res.status(503).json({ error: 'Server is at capacity — try again in a few minutes.' })
  }
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

// ─── Story downloads (built on demand) ───
// The job response only carries metadata, so a story with several generated
// images doesn't ship four near-duplicate base64 packages over the wire.
const EXPORT_FORMATS = {
  html: { mime: 'text/html; charset=utf-8', filename: 'playable-story.html' },
  h5p: { mime: 'application/zip', filename: 'playable-story.h5p' },
  epub: { mime: 'application/epub+zip', filename: 'playable-story.epub' },
  scorm: { mime: 'application/zip', filename: 'playable-story-scorm.zip' }
}

app.get('/api/job/:id/export/:format', async (req, res) => {
  const format = req.params.format
  const spec = EXPORT_FORMATS[format]
  if (!spec) return res.status(400).json({ error: `Unknown export format: ${format}` })

  const view = queue.get(req.params.id)
  if (!view) {
    return res.status(404).json({ error: 'Job not found — it may have expired or the server restarted.' })
  }
  if (view.status !== 'complete') {
    return res.status(409).json({ error: 'The job is not complete yet.' })
  }
  const artifact = queue.getArtifact(req.params.id)
  if (!artifact) {
    return res.status(404).json({ error: 'Exports for this job are no longer available.' })
  }

  try {
    let body
    if (format === 'html') {
      body = await exportStandaloneHTML(artifact.inkSource, artifact.title, artifact.sceneImages)
    } else if (format === 'h5p') {
      body = Buffer.from(await exportH5P(artifact.inkSource, artifact.title, artifact.sceneImages))
    } else if (format === 'epub') {
      body = Buffer.from(await exportEpub(artifact.inkSource, artifact.title, artifact.sceneImages))
    } else {
      body = Buffer.from(await exportScorm(artifact.inkSource, artifact.title, artifact.sceneImages))
    }
    res.setHeader('Content-Type', spec.mime)
    res.setHeader('Content-Disposition', `attachment; filename="${spec.filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(body)
  } catch (err) {
    // Usually a stateful story being exported to H5P/EPUB; that is a client
    // mismatch (409), not a server fault.
    const message = err && err.message ? err.message : String(err)
    const status = /cannot represent/.test(message) ? 409 : 500
    res.status(status).json({ error: message })
  }
})

// ─── Errors (incl. malformed JSON bodies) ───
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  const status = Number(err && (err.status || err.statusCode)) || 500
  if (status >= 500) console.error('[server]', err && err.message ? err.message : err)
  res.status(status).json({ error: status === 400 ? 'Invalid request body.' : 'Server error.' })
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
server.headersTimeout = 20_000
server.keepAliveTimeout = 5_000
