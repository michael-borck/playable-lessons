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
  generateSummary,
  generateFlashcards,
  generateQuiz,
  generateAiTask,
  generateCaseStudy
} = require('../out/shared/generate.js')

const app = express()
app.use(express.json({ limit: '1mb' }))

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
const ipHits = new Map()
const WINDOW_MS = 60 * 60 * 1000
setInterval(() => ipHits.clear(), WINDOW_MS)
app.use('/api', (req, res, next) => {
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
    provider: config.provider,
    model: config.model,
    requiresAccessCode: ACCESS_CODES.length > 0
  })
})

// ─── Generate ───
app.post('/api/generate', async (req, res) => {
  const { source, target, count, depth, inputMode, tone } = req.body
  if (!source || !source.trim()) {
    return res.status(400).json({ error: 'No source material provided.' })
  }
  if (source.length > MAX_INPUT_CHARS) {
    return res.status(400).json({ error: `Source too long (max ${MAX_INPUT_CHARS} chars).` })
  }
  const params = { inputMode: inputMode || 'topic', inputText: source, tone: tone || 'professional' }
  try {
    let result
    switch (target) {
      case 'summary':
        result = await generateSummary({ ...params, keyPointCount: count || 8 }, config)
        break
      case 'flashcards':
        result = await generateFlashcards({ ...params, cardCount: count || 12 }, config)
        break
      case 'quiz':
        result = await generateQuiz({ ...params, questionCount: count || 10 }, config)
        break
      case 'ai-task':
        result = await generateAiTask({ ...params, taskCount: count || 3 }, config)
        break
      case 'case-study':
        result = await generateCaseStudy({ ...params, depth: depth || 'complete' }, config)
        break
      default:
        return res.status(400).json({ error: `Unknown target: ${target}` })
    }
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Generation failed.' })
  }
})

// ─── Serve web UI ───
app.use(express.static(path.join(__dirname, 'public')))
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Playable Lessons server running on :${PORT}`)
  console.log(`Provider: ${config.provider} (${config.model})`)
  console.log(`Rate limit: ${RATE_LIMIT}/hour per IP`)
  console.log(`Access codes: ${ACCESS_CODES.length ? ACCESS_CODES.length + ' configured' : 'not required'}`)
})
