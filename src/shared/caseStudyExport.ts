/**
 * Case-study export formats, shared by the renderer and the CLI.
 *
 * Standalone (no runtime imports from sibling shared modules) — only the
 * CaseStudyResult *type* is imported, which is erased at compile time, so it
 * resolves under both bundler (renderer) and NodeNext (CLI) module resolution.
 */

import type { CaseStudyResult } from './generate.js'

/** A printable case study: narrative (if present) then the structured fields. */
export function toPlainText(result: CaseStudyResult, title?: string): string {
  const cs = result.caseStudy
  const heading = result.title || title || 'Case Study'
  const lines: string[] = [heading, '']

  if (cs.narrative) {
    lines.push(cs.narrative, '')
  }
  if (cs.protagonist) lines.push(`Protagonist: ${cs.protagonist}`)
  if (cs.situation) lines.push(`Situation: ${cs.situation}`)
  if (cs.keyFacts.length) {
    lines.push('Key facts:')
    cs.keyFacts.forEach((f) => lines.push(`  - ${f}`))
  }
  if (cs.conflict) lines.push(`Conflict: ${cs.conflict}`)
  if (cs.decisionPoints.length) {
    lines.push('Decision points:')
    cs.decisionPoints.forEach((d) => lines.push(`  - ${d}`))
  }
  if (cs.discussionQuestions.length) {
    lines.push('Discussion questions:')
    cs.discussionQuestions.forEach((q) => lines.push(`  - ${q}`))
  }

  return lines.join('\n') + '\n'
}

/**
 * A self-contained, offline HTML case study. Renders the narrative (if present)
 * as prose, then structured sections. Text via textContent (no innerHTML); the
 * embedded JSON is guarded against breaking out of its <script> by escaping
 * '<' to '\u003c'.
 */
export function toStandaloneHTML(result: CaseStudyResult, title: string): string {
  const pageTitle = result.title || title
  const dataJson = JSON.stringify(result.caseStudy).replace(/</g, '\\u003c')
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
<title>${safeTitle} — Case Study</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; display: flex; justify-content: center; padding: 40px 20px; line-height: 1.7; }
  #sheet { max-width: 740px; width: 100%; }
  h1 { font-size: 28px; color: #a78bfa; margin-bottom: 18px; }
  .narrative { font-size: 17px; color: #cfcfe6; margin-bottom: 24px; white-space: pre-wrap; }
  h2 { font-size: 15px; color: #a78bfa; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .field { font-size: 16px; color: #cfcfe6; margin-bottom: 10px; }
  ul { list-style: none; }
  ul li { padding: 5px 0 5px 18px; position: relative; font-size: 16px; color: #cfcfe6; }
  ul li::before { content: '•'; position: absolute; left: 0; color: #a78bfa; }
  .meta { text-align: center; color: #555; font-size: 12px; margin-top: 36px; }
</style>
</head>
<body>
<div id="sheet">
  <h1 id="title"></h1>
  <div id="body"></div>
</div>
<script>
(function () {
  var cs = ${dataJson};
  document.getElementById('title').textContent = cs.title || 'Case Study';
  var body = document.getElementById('body');

  function para(txt, cls) { var e = document.createElement('p'); e.textContent = txt; if (cls) e.className = cls; return e; }
  function heading(label) { var e = document.createElement('h2'); e.textContent = label; return e; }
  function list(items) {
    var ul = document.createElement('ul');
    items.forEach(function (it) { var li = document.createElement('li'); li.textContent = it; ul.appendChild(li); });
    return ul;
  }

  if (cs.narrative) {
    var n = document.createElement('div');
    n.className = 'narrative';
    n.textContent = cs.narrative;
    body.appendChild(n);
  }
  if (cs.protagonist) { body.appendChild(heading('Protagonist')); body.appendChild(para(cs.protagonist, 'field')); }
  if (cs.situation) { body.appendChild(heading('Situation')); body.appendChild(para(cs.situation, 'field')); }
  if (cs.keyFacts && cs.keyFacts.length) { body.appendChild(heading('Key facts')); body.appendChild(list(cs.keyFacts)); }
  if (cs.conflict) { body.appendChild(heading('The conflict')); body.appendChild(para(cs.conflict, 'field')); }
  if (cs.decisionPoints && cs.decisionPoints.length) { body.appendChild(heading('Decision points')); body.appendChild(list(cs.decisionPoints)); }
  if (cs.discussionQuestions && cs.discussionQuestions.length) { body.appendChild(heading('Discussion questions')); body.appendChild(list(cs.discussionQuestions)); }

  var meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'Created with Playable Lessons';
  document.getElementById('sheet').appendChild(meta);
})();
</script>
</body>
</html>`
}
