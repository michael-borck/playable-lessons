/**
 * Quiz export formats, shared by the renderer and the CLI.
 *
 * Standalone (no runtime imports from sibling shared modules) — only the
 * QuizResult *type* is imported, which is erased at compile time, so it resolves
 * under both bundler (renderer) and NodeNext (CLI) module resolution.
 */

import type { QuizResult } from './generate.js'
import { quizLetter } from './generate.js'

/**
 * A printable quiz with a separate answer key — for handouts or offline review.
 * Questions are numbered; options are lettered A, B, C, …
 */
export function toPlainText(result: QuizResult, title?: string): string {
  const heading = result.quizTitle || title || 'Quiz'
  const lines: string[] = [heading, '']

  result.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.stem}`)
    q.options.forEach((opt, j) => {
      lines.push(`   ${quizLetter(j)}) ${opt}`)
    })
    lines.push('')
  })

  lines.push('--- Answer Key ---')
  result.questions.forEach((q, i) => {
    const entry = `${i + 1}. ${quizLetter(q.correctIndex)}${q.explanation ? ` — ${q.explanation}` : ''}`
    lines.push(entry)
  })

  return lines.join('\n') + '\n'
}

/**
 * A self-contained, offline HTML quiz. Each question is multiple-choice; on
 * submit it grades the answers, shows a score, marks each option correct/wrong,
 * and reveals explanations. Option/question text is rendered via textContent
 * (no innerHTML), and the embedded question JSON is guarded against breaking out
 * of its <script> by escaping '<' to '\u003c'.
 */
export function toStandaloneHTML(result: QuizResult, title: string): string {
  const quizTitle = result.quizTitle || title
  const dataJson = JSON.stringify(result.questions).replace(/</g, '\\u003c')
  const safeTitle = String(quizTitle)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — Quiz</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
  #wrap { max-width: 640px; width: 100%; }
  h1 { font-size: 26px; margin-bottom: 4px; color: #a78bfa; text-align: center; }
  .progress-bar { height: 4px; background: #252547; border-radius: 2px; margin: 16px 0 24px; overflow: hidden; }
  .progress-fill { height: 100%; background: #a78bfa; border-radius: 2px; transition: width 0.3s ease; }
  .progress-text { text-align: center; font-size: 14px; color: #888; margin-bottom: 20px; }
  .question-card { background: #252547; border: 1px solid #3a3a5c; border-radius: 14px; padding: 28px 26px; margin-bottom: 20px; }
  .question-card .stem { font-size: 19px; line-height: 1.5; margin-bottom: 18px; }
  .option { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; margin-top: 8px; border: 1px solid transparent; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
  .option:hover { border-color: #3a3a5c; background: rgba(167,139,250,0.05); }
  .option input { margin-top: 3px; accent-color: #a78bfa; cursor: pointer; }
  .option span { line-height: 1.5; font-size: 16px; }
  .option.correct { border-color: #4ade80; background: rgba(74,222,128,0.12); }
  .option.wrong { border-color: #f87171; background: rgba(248,113,113,0.12); }
  .option.selected { border-color: #a78bfa; background: rgba(167,139,250,0.1); }
  .explanation { display: none; margin-top: 12px; padding: 12px 14px; background: rgba(167,139,250,0.1); border-left: 3px solid #a78bfa; color: #c4b5fd; font-size: 15px; border-radius: 0 6px 6px 0; font-style: italic; }
  .score-display { text-align: center; padding: 20px; }
  .score-display .score-num { font-size: 36px; font-weight: 700; color: #a78bfa; }
  .score-display .score-label { font-size: 16px; color: #888; margin-bottom: 20px; }
  .controls { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
  button { padding: 14px 32px; background: #a78bfa; color: #1a1a2e; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; }
  button:hover:not(:disabled) { background: #8b6fdf; }
  button:disabled { opacity: 0.4; cursor: default; }
  button.secondary { background: #252547; color: #e0e0e0; border: 1px solid #3a3a5c; font-weight: 400; }
  button.secondary:hover:not(:disabled) { border-color: #a78bfa; }
  .meta { text-align: center; color: #555; font-size: 12px; margin-top: 32px; }
</style>
</head>
<body>
<div id="wrap">
  <h1>${safeTitle}</h1>
  <div id="content"></div>
</div>
<script>
(function () {
  var ALL = ${dataJson};
  var QUIZ_SIZE = 5;
  var deck = [], pos = 0, answers = {}, submitted = false;
  var content = document.getElementById('content');

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random()*(i+1)); var t = a[i]; a[i]=a[j]; a[j]=t; }
    return a;
  }

  function newDeck() {
    deck = ALL.length <= QUIZ_SIZE ? shuffle(ALL) : shuffle(ALL).slice(0, QUIZ_SIZE);
    pos = 0; answers = {}; submitted = false;
    renderQuestion();
  }

  function renderQuestion() {
    var q = deck[pos];
    var html = '<div class="progress-bar"><div class="progress-fill" style="width:' + (pos / deck.length * 100) + '%"></div></div>';
    html += '<div class="progress-text">Question ' + (pos + 1) + ' of ' + deck.length + '</div>';
    html += '<div class="question-card"><div class="stem">' + esc(q.stem) + '</div>';
    html += '<div id="options">';
    q.options.forEach(function (opt, oi) {
      var sel = answers[pos] === oi ? ' selected' : '';
      html += '<div class="option' + sel + '" data-oi="' + oi + '"><input type="radio" name="q" id="o' + oi + '"' + (answers[pos] === oi ? ' checked' : '') + '><span>' + letters(oi) + ') ' + esc(opt) + '</span></div>';
    });
    html += '</div>';
    if (q.explanation) html += '<div class="explanation" id="exp">' + esc(q.explanation) + '</div>';
    html += '</div>';
    html += '<div class="controls">';
    if (pos > 0) html += '<button class="secondary" id="prev">&lsaquo; Prev</button>';
    if (pos < deck.length - 1) html += '<button id="next">Next &rsaquo;</button>';
    else html += '<button id="submit">Submit</button>';
    html += '</div>';
    content.innerHTML = html;

    content.querySelectorAll('.option').forEach(function (el) {
      el.addEventListener('click', function () {
        if (submitted) return;
        answers[pos] = parseInt(el.dataset.oi);
        content.querySelectorAll('.option').forEach(function (e) { e.classList.remove('selected'); });
        el.classList.add('selected');
        el.querySelector('input').checked = true;
      });
    });
    var prev = document.getElementById('prev'); if (prev) prev.addEventListener('click', function () { pos--; renderQuestion(); });
    var next = document.getElementById('next'); if (next) next.addEventListener('click', function () { pos++; renderQuestion(); });
    var sub = document.getElementById('submit'); if (sub) sub.addEventListener('click', grade);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function grade() {
    submitted = true;
    var score = 0;
    deck.forEach(function (q, qi) { if (answers[qi] === q.correctIndex) score++; });

    var html = '<div class="score-display"><div class="score-num">' + score + ' / ' + deck.length + '</div><div class="score-label">Score</div></div>';
    deck.forEach(function (q, qi) {
      var chosen = answers[qi];
      var correct = chosen === q.correctIndex;
      html += '<div class="question-card"><div class="stem">' + (qi+1) + '. ' + esc(q.stem) + '</div>';
      q.options.forEach(function (opt, oi) {
        var cls = 'option';
        if (oi === q.correctIndex) cls += ' correct';
        else if (oi === chosen) cls += ' wrong';
        html += '<div class="' + cls + '"><span>' + letters(oi) + ') ' + esc(opt);
        if (oi === q.correctIndex) html += ' \\u2705';
        html += '</span></div>';
      });
      if (q.explanation) html += '<div class="explanation" style="display:block">' + esc(q.explanation) + '</div>';
      html += '</div>';
    });
    html += '<div class="controls"><button id="again">Try again (new questions)</button></div>';
    content.innerHTML = html;
    document.getElementById('again').addEventListener('click', newDeck);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function letters(i) { return 'ABCDEFGHIJ'[i] || (i+1); }
  function esc(t) { var d = document.createElement('div'); d.textContent = String(t||''); return d.innerHTML; }

  newDeck();
  var meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = 'Created with Playable Lessons';
  document.getElementById('wrap').appendChild(meta);
})();
</script>
</body>
</html>`
}
