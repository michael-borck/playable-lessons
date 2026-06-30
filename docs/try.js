// Playable Lessons — browser demo.
// The user pastes their own API key; the JS calls the LLM provider directly.
// No server, no storage. Key is used in-session only.

const DEFAULT_MODELS = { claude: 'claude-sonnet-4-20250514', openai: 'gpt-4o' }

// ─── Prompts (simplified from src/shared/prompts.ts for the demo) ───

const PROMPTS = {
  summarySystem: `You are the Playable Lessons assistant. You distill educational source material into a clear, accurate study summary. Preserve factual accuracy. Respond with ONLY the JSON object requested — no commentary.`,

  summary: (text, count) => `Create a study summary from the following source material.

Source material:
"""
${text}
"""

Target number of key points: ${count}

Return ONLY this JSON shape (wrapped in a \`\`\`json block is fine):
{
  "title": "a short title",
  "overview": "1-3 sentences capturing the essence",
  "keyPoints": ["a concise point", "..."],
  "glossary": [{ "term": "a key term", "definition": "a short definition" }]
}

Do not output any text outside the JSON object.`,

  flashcardsSystem: `You are the Playable Lessons assistant. You transform educational source material into concise, effective study flashcards. Each card has a clear front (question or term) and a precise, self-contained back (answer). Respond with ONLY the JSON object requested — no commentary.`,

  flashcards: (text, count) => `Create study flashcards from the following source material.

Source material:
"""
${text}
"""

Target number of cards: ${count}

Return ONLY this JSON shape (wrapped in a \`\`\`json block is fine):
{
  "deckTitle": "a short title for the deck",
  "cards": [
    { "front": "a question or term", "back": "the answer", "hint": "optional", "tag": "optional" }
  ]
}

Do not output any text outside the JSON object.`
}

// ─── API calls (direct from browser — both providers support CORS) ───

async function callAI(provider, key, model, systemPrompt, userPrompt) {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.claude,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Claude API error (${res.status}): ${err.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.content[0].text
  } else {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.openai,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API error (${res.status}): ${err.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.choices[0].message.content
  }
}

// ─── JSON extraction (mirrors src/shared/generate.ts extractJson) ───

function extractJson(raw) {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fence ? fence[1] : raw).trim()
  try {
    return JSON.parse(candidate)
  } catch {
    // fall through
  }
  const first = candidate.indexOf('{')
  const last = candidate.lastIndexOf('}')
  if (first !== -1 && last > first) {
    return JSON.parse(candidate.slice(first, last + 1))
  }
  throw new Error('Could not parse JSON from the AI response. Try again or use a different model.')
}

// ─── Rendering ───

function renderSummary(data) {
  const area = document.getElementById('result-area')
  let html = ''

  if (data.title) html += `<h2 class="result-title">${esc(data.title)}</h2>`
  if (data.overview) html += `<p class="result-overview">${esc(data.overview)}</p>`

  if (data.keyPoints?.length) {
    html += '<div class="result-section-h">Key Points</div><ol class="result-points">'
    data.keyPoints.forEach((p) => { html += `<li>${esc(p)}</li>` })
    html += '</ol>'
  }

  if (data.glossary?.length) {
    html += '<div class="result-section-h">Glossary</div>'
    data.glossary.forEach((g) => {
      html += `<div class="flashcard"><div class="flashcard-front">${esc(g.term)}</div><div class="flashcard-back">${esc(g.definition)}</div></div>`
    })
  }

  area.innerHTML = html
}

function renderFlashcards(data) {
  const area = document.getElementById('result-area')
  let html = ''

  if (data.deckTitle) html += `<h2 class="result-title">${esc(data.deckTitle)}</h2>`

  if (data.cards?.length) {
    data.cards.forEach((c) => {
      html += '<div class="flashcard">'
      html += `<div class="flashcard-front">${esc(c.front)}</div>`
      html += `<div class="flashcard-back">${esc(c.back)}</div>`
      if (c.hint) html += `<div class="flashcard-hint">Hint: ${esc(c.hint)}</div>`
      html += '</div>'
    })
  }

  area.innerHTML = html
}

// Escape HTML to prevent injection from AI-generated content.
function esc(text) {
  const div = document.createElement('div')
  div.textContent = String(text || '')
  return div.innerHTML
}

// ─── Main generate function ───

async function generate() {
  const text = document.getElementById('source-text').value.trim()
  const provider = document.getElementById('provider').value
  const key = document.getElementById('api-key').value.trim()
  const target = document.getElementById('target').value
  const count = parseInt(document.getElementById('count').value, 10) || 8

  const btn = document.getElementById('generate-btn')
  const errorArea = document.getElementById('error-area')
  const resultArea = document.getElementById('result-area')

  errorArea.style.display = 'none'
  errorArea.textContent = ''
  resultArea.innerHTML = ''

  if (!text) { showError('Please paste some source material first.'); return }
  if (!key) { showError('Please paste your API key.'); return }

  btn.disabled = true
  btn.textContent = 'Generating…'
  resultArea.innerHTML = '<div class="loading">Generating</div>'

  try {
    const systemPrompt = target === 'summary' ? PROMPTS.summarySystem : PROMPTS.flashcardsSystem
    const userPrompt = target === 'summary'
      ? PROMPTS.summary(text, count)
      : PROMPTS.flashcards(text, count)

    const raw = await callAI(provider, key, null, systemPrompt, userPrompt)
    const data = extractJson(raw)

    if (target === 'summary') {
      renderSummary(data)
    } else {
      renderFlashcards(data)
    }
  } catch (err) {
    showError(err.message || 'Generation failed. Please check your key and try again.')
    resultArea.innerHTML = ''
  } finally {
    btn.disabled = false
    btn.textContent = 'Generate'
  }
}

function showError(msg) {
  const area = document.getElementById('error-area')
  area.textContent = msg
  area.style.display = 'block'
}
