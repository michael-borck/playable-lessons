/**
 * Recommender "plan" export formats, shared by the renderer and the CLI.
 *
 * Standalone (only the PlanResult *type* is imported — erased at compile time).
 */

import type { PlanResult } from './generate.js'

const TARGET_LABEL: Record<string, string> = {
  story: 'Story (interactive fiction)',
  flashcards: 'Flashcards',
  quiz: 'Quiz',
  summary: 'Summary',
  'ai-task': 'AI-collaboration tasks',
  'case-study': 'Case study'
}


/** A printable plan: material summary + the recommended targets with rationale. */
export function toPlainText(result: PlanResult, title?: string): string {
  const heading = result.title || title || 'Recommended outputs'
  const lines: string[] = [heading, '']
  if (result.summary) {
    lines.push(result.summary, '')
  }
  lines.push('Recommended outputs:')
  result.recommendations.forEach((r, i) => {
    let line = `${i + 1}. ${TARGET_LABEL[r.target] ?? r.target}`
    if (r.depth) line += ` (${r.depth})`
    if (r.count) line += ` ×${r.count}`
    lines.push(line)
    lines.push(`   ${r.rationale}`)
  })
  return lines.join('\n') + '\n'
}

/**
 * A self-contained, offline HTML plan: material summary + recommended outputs
 * with rationale. Text via textContent; embedded JSON guarded by escaping '<'.
 */
export function toStandaloneHTML(result: PlanResult, title: string): string {
  const pageTitle = result.title || title
  const labels = TARGET_LABEL
  const dataJson = JSON.stringify({ ...result, labels }).replace(/</g, '\\u003c')
  const safeTitle = String(pageTitle)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — Recommended Outputs</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; display: flex; justify-content: center; padding: 40px 20px; line-height: 1.7; }
  #sheet { max-width: 720px; width: 100%; }
  h1 { font-size: 26px; color: #a78bfa; margin-bottom: 10px; }
  .summary { font-size: 17px; color: #cfcfe6; margin-bottom: 24px; }
  .rec { background: #252547; border: 1px solid #3a3a5c; border-radius: 12px; padding: 16px 20px; margin-bottom: 14px; }
  .rec-head { font-size: 16px; color: #a78bfa; font-weight: 700; }
  .rec-meta { font-size: 13px; color: #888; margin-left: 8px; font-weight: 400; }
  .rec-why { font-size: 15px; color: #cfcfe6; margin-top: 6px; }
  .meta { text-align: center; color: #555; font-size: 12px; margin-top: 32px; }
</style>
</head>
<body>
<div id="sheet">
  <h1 id="title"></h1>
  <p id="summary" class="summary"></p>
  <div id="recs"></div>
</div>
<script>
(function () {
  var p = ${dataJson};
  document.getElementById('title').textContent = p.title || 'Recommended outputs';
  if (p.summary) document.getElementById('summary').textContent = p.summary;
  var host = document.getElementById('recs');
  var labels = p.labels || {};
  (p.recommendations || []).forEach(function (r, i) {
    var card = document.createElement('div');
    card.className = 'rec';
    var head = document.createElement('div');
    head.className = 'rec-head';
    head.textContent = (i + 1) + '. ' + (labels[r.target] || r.target);
    var meta = [];
    if (r.depth) meta.push(r.depth);
    if (r.count) meta.push('×' + r.count);
    if (meta.length) {
      var m = document.createElement('span');
      m.className = 'rec-meta';
      m.textContent = '(' + meta.join(', ') + ')';
      head.appendChild(m);
    }
    card.appendChild(head);
    var why = document.createElement('div');
    why.className = 'rec-why';
    why.textContent = r.rationale;
    card.appendChild(why);
    host.appendChild(card);
  });
  var meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'Created with Playable Lessons';
  document.getElementById('sheet').appendChild(meta);
})();
</script>
</body>
</html>`
}
