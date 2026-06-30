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
  body {
    font-family: Georgia, 'Times New Roman', serif;
    background: #1a1a2e;
    color: #e0e0e0;
    min-height: 100vh;
    padding: 40px 20px;
  }
  #wrap { max-width: 680px; margin: 0 auto; }
  h1 { font-size: 26px; margin-bottom: 8px; color: #a78bfa; text-align: center; }
  #score { display: none; text-align: center; font-size: 20px; color: #a78bfa; margin: 10px 0 24px; }
  .question { background: #252547; border: 1px solid #3a3a5c; border-radius: 12px; padding: 20px 22px; margin-bottom: 18px; }
  legend { font-size: 18px; line-height: 1.5; padding: 0 4px; }
  .option { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; margin-top: 8px; border: 1px solid transparent; border-radius: 8px; cursor: pointer; }
  .option:hover { border-color: #3a3a5c; }
  .option input { margin-top: 4px; accent-color: #a78bfa; cursor: pointer; }
  .option span { line-height: 1.5; }
  .option.correct { border-color: #4ade80; background: rgba(74, 222, 128, 0.12); }
  .option.wrong { border-color: #f87171; background: rgba(248, 113, 113, 0.12); }
  .explanation { display: none; margin-top: 10px; padding: 10px 12px; background: rgba(167, 139, 250, 0.1); border-left: 3px solid #a78bfa; color: #c4b5fd; font-size: 15px; line-height: 1.5; border-radius: 0 6px 6px 0; font-style: italic; }
  .controls { text-align: center; margin-top: 8px; }
  button { padding: 12px 26px; background: #a78bfa; color: #1a1a2e; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; font-family: inherit; }
  button:hover:not(:disabled) { background: #8b6fdf; }
  button:disabled { opacity: 0.4; cursor: default; }
  #restart { display: none; margin-left: 10px; background: #252547; color: #e0e0e0; border: 1px solid #3a3a5c; font-weight: 400; }
  .meta { text-align: center; color: #555; font-size: 12px; margin-top: 32px; }
</style>
</head>
<body>
<div id="wrap">
  <h1>${safeTitle}</h1>
  <div id="score"></div>
  <form id="quiz"></form>
  <div class="controls">
    <button id="submit" type="button">Submit answers</button>
    <button id="restart" type="button">Try again</button>
  </div>
</div>
<script>
(function () {
  var questions = ${dataJson};
  var letters = 'ABCDEFGHIJ';
  var form = document.getElementById('quiz');

  questions.forEach(function (q, qi) {
    var fs = document.createElement('fieldset');
    fs.className = 'question';
    var legend = document.createElement('legend');
    legend.textContent = (qi + 1) + '. ' + q.stem;
    fs.appendChild(legend);

    q.options.forEach(function (opt, oi) {
      var label = document.createElement('label');
      label.className = 'option';
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'q' + qi;
      radio.value = String(oi);
      label.appendChild(radio);
      var span = document.createElement('span');
      span.textContent = (letters[oi] || (oi + 1)) + ') ' + opt;
      label.appendChild(span);
      fs.appendChild(label);
    });

    var exp = document.createElement('div');
    exp.className = 'explanation';
    fs.appendChild(exp);

    form.appendChild(fs);
  });

  function grade() {
    var score = 0;
    var fieldsets = form.querySelectorAll('fieldset.question');
    fieldsets.forEach(function (fs, qi) {
      var q = questions[qi];
      var labels = fs.querySelectorAll('label.option');
      var chosen = -1;
      labels.forEach(function (lab, oi) {
        if (lab.querySelector('input').checked) chosen = oi;
      });
      if (chosen === q.correctIndex) score++;
      labels.forEach(function (lab, oi) {
        if (oi === q.correctIndex) lab.classList.add('correct');
        else if (oi === chosen) lab.classList.add('wrong');
        lab.querySelector('input').disabled = true;
      });
      var exp = fs.querySelector('.explanation');
      if (exp && q.explanation) { exp.textContent = q.explanation; exp.style.display = 'block'; }
    });
    var scoreEl = document.getElementById('score');
    scoreEl.style.display = 'block';
    scoreEl.textContent = 'Score: ' + score + ' / ' + questions.length;
    document.getElementById('submit').disabled = true;
    document.getElementById('restart').style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('submit').addEventListener('click', grade);
  document.getElementById('restart').addEventListener('click', function () { location.reload(); });

  var meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'Created with Playable Lessons';
  document.getElementById('wrap').appendChild(meta);
})();
</script>
</body>
</html>`
}
