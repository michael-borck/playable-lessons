/**
 * AI-collaboration task export formats, shared by the renderer and the CLI.
 *
 * Standalone (no runtime imports from sibling shared modules) — only the
 * AiTaskResult *type* is imported, which is erased at compile time, so it
 * resolves under both bundler (renderer) and NodeNext (CLI) module resolution.
 */

import type { AiTaskResult } from './generate.js'

/**
 * A printable task sheet: for each task, the scenario, student brief,
 * deliverable, load-bearing specifics (with why a generic answer misses them),
 * the engagement-anchored rubric, and why a delegating learner loses.
 */
export function toPlainText(result: AiTaskResult, title?: string): string {
  const heading = result.title || title || 'AI-Collaboration Tasks'
  const lines: string[] = [heading, '']

  result.tasks.forEach((t, i) => {
    lines.push(`Task ${i + 1}`)
    lines.push(`Scenario: ${t.scenario}`)
    lines.push(`Brief: ${t.brief}`)
    lines.push(`Deliverable: ${t.deliverable}`)
    lines.push('Load-bearing specifics:')
    t.loadBearingSpecifics.forEach((s) => {
      lines.push(`  - ${s.detail} — ${s.whyGenericAnswersMissIt}`)
    })
    lines.push('Rubric (engagement-anchored):')
    t.rubric.forEach((r) => {
      lines.push(`  - ${r.criterion}: ${r.description}`)
    })
    lines.push(`Why it works: ${t.whyItWorks}`)
    lines.push('')
  })

  return lines.join('\n') + '\n'
}

/**
 * A self-contained, offline HTML task sheet. All text is rendered via
 * textContent (no innerHTML); the embedded JSON is guarded against breaking out
 * of its <script> by escaping '<' to '\u003c'.
 */
export function toStandaloneHTML(result: AiTaskResult, title: string): string {
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
<title>${safeTitle} — AI-Collaboration Tasks</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; display: flex; justify-content: center; padding: 40px 20px; line-height: 1.7; }
  #sheet { max-width: 760px; width: 100%; }
  h1 { font-size: 26px; color: #a78bfa; margin-bottom: 8px; }
  .lede { font-size: 14px; color: #888; margin-bottom: 28px; }
  .task { background: #252547; border: 1px solid #3a3a5c; border-radius: 14px; padding: 24px 26px; margin-bottom: 22px; }
  .task-no { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #a78bfa; font-weight: 700; margin-bottom: 6px; }
  h2 { font-size: 16px; color: #a78bfa; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  p { font-size: 16px; color: #cfcfe6; }
  .brief { font-size: 17px; background: rgba(167,139,250,0.08); border-left: 3px solid #a78bfa; padding: 12px 14px; border-radius: 0 6px 6px 0; }
  ul { list-style: none; }
  ul li { padding: 6px 0 6px 18px; position: relative; font-size: 15px; color: #cfcfe6; }
  ul li::before { content: '•'; position: absolute; left: 0; color: #a78bfa; }
  .why { font-size: 14px; color: #6b8; font-style: italic; }
  .specifics li .why, .rubric li .why { display: block; color: #9aa; font-size: 14px; }
  .works { font-size: 15px; color: #c4b5fd; font-style: italic; margin-top: 6px; }
  .meta { text-align: center; color: #555; font-size: 12px; margin-top: 32px; }
</style>
</head>
<body>
<div id="sheet">
  <h1 id="title"></h1>
  <p class="lede">The learner works iteratively with a chatbot; interrogating it — not pasting its first answer — is what produces a good result.</p>
  <div id="tasks"></div>
</div>
<script>
(function () {
  var r = ${dataJson};
  document.getElementById('title').textContent = r.title || 'AI-Collaboration Tasks';
  var host = document.getElementById('tasks');
  (r.tasks || []).forEach(function (t, i) {
    var card = document.createElement('div');
    card.className = 'task';

    var no = document.createElement('div');
    no.className = 'task-no';
    no.textContent = 'Task ' + (i + 1);
    card.appendChild(no);

    var h = function (label) { var e = document.createElement('h2'); e.textContent = label; return e; };
    var para = function (txt, cls) { var e = document.createElement('p'); e.textContent = txt; if (cls) e.className = cls; return e; };

    card.appendChild(h('Scenario'));
    card.appendChild(para(t.scenario));
    card.appendChild(h('Your brief'));
    card.appendChild(para(t.brief, 'brief'));
    card.appendChild(h('Deliverable'));
    card.appendChild(para(t.deliverable));

    if (t.loadBearingSpecifics && t.loadBearingSpecifics.length) {
      card.appendChild(h('Load-bearing specifics'));
      var ul = document.createElement('ul');
      ul.className = 'specifics';
      t.loadBearingSpecifics.forEach(function (s) {
        var li = document.createElement('li');
        var main = document.createElement('span');
        main.textContent = s.detail;
        var why = document.createElement('span');
        why.className = 'why';
        why.textContent = 'Generic answers miss it: ' + s.whyGenericAnswersMissIt;
        li.appendChild(main);
        li.appendChild(why);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    if (t.rubric && t.rubric.length) {
      card.appendChild(h('Rubric (engagement-anchored)'));
      var rl = document.createElement('ul');
      rl.className = 'rubric';
      t.rubric.forEach(function (rb) {
        var li = document.createElement('li');
        var main = document.createElement('span');
        main.textContent = rb.criterion;
        var why = document.createElement('span');
        why.className = 'why';
        why.textContent = rb.description;
        li.appendChild(main);
        li.appendChild(why);
        rl.appendChild(li);
      });
      card.appendChild(rl);
    }

    card.appendChild(h('Why it works'));
    var w = document.createElement('p');
    w.className = 'works';
    w.textContent = t.whyItWorks;
    card.appendChild(w);

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
