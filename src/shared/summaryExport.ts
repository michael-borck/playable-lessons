/**
 * Study-summary export formats, shared by the renderer and the CLI.
 *
 * Standalone (no runtime imports from sibling shared modules) — only the
 * SummaryResult *type* is imported, which is erased at compile time, so it
 * resolves under both bundler (renderer) and NodeNext (CLI) module resolution.
 */

import type { SummaryResult } from './generate.js'

/** A printable study summary: overview, numbered key points, glossary. */
export function toPlainText(result: SummaryResult, title?: string): string {
  const heading = result.title || title || 'Summary'
  const lines: string[] = [heading, '']

  if (result.overview) {
    lines.push(result.overview, '')
  }

  if (result.keyPoints.length) {
    lines.push('Key Points:')
    result.keyPoints.forEach((p, i) => lines.push(`${i + 1}. ${p}`))
    lines.push('')
  }

  if (result.glossary.length) {
    lines.push('Glossary:')
    result.glossary.forEach((g) => lines.push(`${g.term}: ${g.definition}`))
    lines.push('')
  }

  return lines.join('\n') + '\n'
}

/**
 * A self-contained, offline HTML study sheet: title, overview, key points, and
 * a glossary. All text is rendered via textContent (no innerHTML), and the
 * embedded JSON is guarded against breaking out of its <script> by escaping
 * '<' to '\u003c'.
 */
export function toStandaloneHTML(result: SummaryResult, title: string): string {
  const pageTitle = result.title || title
  const dataJson = JSON.stringify(result).replace(/</g, '\\u003c')
  const safeTitle = String(pageTitle)
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
<title>${safeTitle} — Summary</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    background: #1a1a2e;
    color: #e0e0e0;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    padding: 40px 20px;
    line-height: 1.7;
  }
  #sheet { max-width: 720px; width: 100%; }
  h1 { font-size: 28px; color: #a78bfa; margin-bottom: 16px; }
  #overview { font-size: 18px; color: #cfcfe6; margin-bottom: 28px; }
  h2 { font-size: 18px; color: #a78bfa; margin: 28px 0 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  ol { list-style: none; counter-reset: pt; }
  ol li {
    counter-increment: pt;
    position: relative;
    padding: 10px 0 10px 44px;
    border-bottom: 1px solid #2a2a44;
    font-size: 17px;
  }
  ol li::before {
    content: counter(pt);
    position: absolute;
    left: 0;
    top: 10px;
    width: 28px;
    height: 28px;
    background: #252547;
    border: 1px solid #3a3a5c;
    border-radius: 50%;
    color: #a78bfa;
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; }
  dt { color: #c4b5fd; font-weight: 700; font-size: 16px; }
  dd { font-size: 16px; color: #cfcfe6; }
  .meta { text-align: center; color: #555; font-size: 12px; margin-top: 40px; }
</style>
</head>
<body>
<div id="sheet">
  <h1 id="title"></h1>
  <p id="overview"></p>
  <h2 id="points-h" style="display:none">Key Points</h2>
  <ol id="points"></ol>
  <h2 id="glossary-h" style="display:none">Glossary</h2>
  <dl id="glossary"></dl>
</div>
<script>
(function () {
  var s = ${dataJson};
  document.getElementById('title').textContent = s.title || 'Summary';
  if (s.overview) document.getElementById('overview').textContent = s.overview;
  var ol = document.getElementById('points');
  var points = s.keyPoints || [];
  if (points.length) {
    document.getElementById('points-h').style.display = '';
    points.forEach(function (p) {
      var li = document.createElement('li');
      li.textContent = p;
      ol.appendChild(li);
    });
  }
  var dl = document.getElementById('glossary');
  var glossary = s.glossary || [];
  if (glossary.length) {
    document.getElementById('glossary-h').style.display = '';
    glossary.forEach(function (g) {
      var dt = document.createElement('dt');
      dt.textContent = g.term;
      var dd = document.createElement('dd');
      dd.textContent = g.definition;
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  }
  var meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'Created with Playable Lessons';
  document.getElementById('sheet').appendChild(meta);
})();
</script>
</body>
</html>`
}
