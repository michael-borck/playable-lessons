const STORAGE_KEY = 'pl-history'
let accessCode = localStorage.getItem('pl-access-code') || ''

// ─── On load: check if access code is needed ───
async function init() {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    if (data.requiresAccessCode && !accessCode) {
      showGate()
    } else if (data.requiresAccessCode) {
      const check = await fetch('/api/health', { headers: { 'x-access-code': accessCode } })
      if (check.ok) showApp(data)
      else { localStorage.removeItem('pl-access-code'); accessCode = ''; showGate() }
    } else {
      showApp(data)
    }
  } catch {
    document.getElementById('gate').style.display = 'none'
    document.getElementById('app').style.display = 'block'
    document.getElementById('provider-info').textContent = 'Server unreachable.'
  }
}

function showGate() {
  document.getElementById('gate').style.display = 'block'
  document.getElementById('app').style.display = 'none'
}

function showApp(health) {
  document.getElementById('gate').style.display = 'none'
  document.getElementById('app').style.display = 'block'
  document.getElementById('provider-info').textContent = `${health.provider} · ${health.model}`
  renderHistory()
}

function submitAccessCode() {
  const code = document.getElementById('access-code-input').value.trim()
  if (!code) return
  accessCode = code
  localStorage.setItem('pl-access-code', code)
  init()
}

// ─── Generate ───
async function generate() {
  const source = document.getElementById('source').value.trim()
  const target = document.getElementById('target').value
  const count = parseInt(document.getElementById('count').value, 10) || 8
  const depth = document.getElementById('depth').value

  if (!source) { showError('Please paste some source material.'); return }

  const btn = document.getElementById('generate-btn')
  const resultArea = document.getElementById('result')
  const errorArea = document.getElementById('error')

  btn.disabled = true
  btn.textContent = 'Generating…'
  errorArea.style.display = 'none'
  resultArea.innerHTML = '<div class="loading">Generating</div>'

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessCode ? { 'x-access-code': accessCode } : {})
      },
      body: JSON.stringify({ source, target, count, depth })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Generation failed.')

    renderResult(data.result, target)
    saveToHistory(data.result, target)
  } catch (err) {
    errorArea.textContent = err.message
    errorArea.style.display = 'block'
    resultArea.innerHTML = ''
  } finally {
    btn.disabled = false
    btn.textContent = 'Generate'
  }
}

// ─── Render ───
function renderResult(result, target) {
  const area = document.getElementById('result')
  let html = ''

  if (target === 'summary') {
    if (result.title) html += `<h3 class="result-title">${esc(result.title)}</h3>`
    if (result.overview) html += `<p class="result-overview">${esc(result.overview)}</p>`
    if (result.keyPoints?.length) {
      html += '<div class="result-h">Key Points</div><ol class="result-points">'
      result.keyPoints.forEach((p) => { html += `<li>${esc(p)}</li>` })
      html += '</ol>'
    }
    if (result.glossary?.length) {
      html += '<div class="result-h">Glossary</div>'
      result.glossary.forEach((g) => {
        html += `<div class="card-item"><span class="card-front">${esc(g.term)}</span><span class="card-back">${esc(g.definition)}</span></div>`
      })
    }
  } else if (target === 'flashcards') {
    if (result.deckTitle) html += `<h3 class="result-title">${esc(result.deckTitle)}</h3>`
    result.cards?.forEach((c) => {
      html += `<div class="card-item"><span class="card-front">${esc(c.front)}</span><span class="card-back">${esc(c.back)}</span>`
      if (c.hint) html += `<span class="card-hint">Hint: ${esc(c.hint)}</span>`
      html += '</div>'
    })
  } else if (target === 'quiz') {
    result.questions?.forEach((q, i) => {
      html += `<div class="card-item"><span class="card-front">${i + 1}. ${esc(q.stem)}</span>`
      q.options?.forEach((opt, j) => {
        const mark = j === q.correctIndex ? ' ✅' : ''
        html += `<span class="card-back">${'ABCD'[j]}) ${esc(opt)}${mark}</span>`
      })
      if (q.explanation) html += `<span class="card-hint">${esc(q.explanation)}</span>`
      html += '</div>'
    })
  } else if (target === 'ai-task') {
    result.tasks?.forEach((t, i) => {
      html += `<div class="card-item"><span class="card-front">Task ${i + 1}: ${esc(t.scenario)}</span>`
      html += `<span class="card-back">Brief: ${esc(t.brief)}</span>`
      html += `<span class="card-back">Deliverable: ${esc(t.deliverable)}</span></div>`
    })
  } else if (target === 'case-study') {
    const cs = result.caseStudy
    if (result.title) html += `<h3 class="result-title">${esc(result.title)}</h3>`
    if (cs?.narrative) html += `<p class="result-overview">${esc(cs.narrative)}</p>`
    if (cs?.situation) html += `<div class="result-h">Situation</div><p>${esc(cs.situation)}</p>`
    if (cs?.conflict) html += `<div class="result-h">Conflict</div><p>${esc(cs.conflict)}</p>`
    if (cs?.keyFacts?.length) {
      html += '<div class="result-h">Key Facts</div><ul>'
      cs.keyFacts.forEach((f) => { html += `<li>${esc(f)}</li>` })
      html += '</ul>'
    }
  }

  area.innerHTML = html || '<p>No content returned.</p>'
}

// ─── localStorage history ───
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}

function saveToHistory(result, target) {
  const history = loadHistory()
  const title = result.title || result.deckTitle || result.quizTitle || `${target} ${new Date().toLocaleTimeString()}`
  history.unshift({ id: Date.now(), title, type: target, date: new Date().toISOString(), result })
  if (history.length > 50) history.pop()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  renderHistory()
}

function renderHistory() {
  const history = loadHistory()
  const area = document.getElementById('history')
  if (history.length === 0) {
    area.innerHTML = '<p class="muted">Nothing yet — generate something above.</p>'
    return
  }
  const labels = { summary: '📝 Summary', flashcards: '🃏 Flashcards', quiz: '✅ Quiz', 'ai-task': '🤝 AI Task', 'case-study': '🔍 Case Study' }
  area.innerHTML = history.map((h) => {
    const date = new Date(h.date).toLocaleString()
    return `<div class="history-item" onclick="viewHistory(${h.id})">
      <span class="history-type">${labels[h.type] || h.type}</span>
      <span class="history-title">${esc(h.title)}</span>
      <span class="history-date">${date}</span>
      <button class="history-delete" onclick="event.stopPropagation(); deleteHistory(${h.id})">×</button>
    </div>`
  }).join('')
}

function viewHistory(id) {
  const item = loadHistory().find((h) => h.id === id)
  if (item) renderResult(item.result, item.type)
}

function deleteHistory(id) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loadHistory().filter((h) => h.id !== id)))
  renderHistory()
}

function showError(msg) {
  const a = document.getElementById('error')
  a.textContent = msg; a.style.display = 'block'
}

function esc(text) {
  const d = document.createElement('div'); d.textContent = String(text || ''); return d.innerHTML
}

// ─── Wire up ───
document.getElementById('access-code-btn')?.addEventListener('click', submitAccessCode)
document.getElementById('access-code-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAccessCode() })
document.getElementById('target')?.addEventListener('change', (e) => {
  document.getElementById('depth-group').style.display = e.target.value === 'case-study' ? 'flex' : 'none'
})

init()
