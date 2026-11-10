/**
 * Reflective activity exports (grid / slider), shared by the renderer and CLI.
 *
 * Standalone, offline HTML: the learner taps a grid cell or moves a slider and
 * gets immediate explanatory feedback. Text is rendered via textContent (no
 * innerHTML), and the embedded JSON is guarded against breaking out of its
 * <script> by escaping '<' to '\u003c'.
 */

import type { ActivityResult, GridActivity, SliderActivity } from './generate.js'
import { FAVICON_LINK } from './favicon.js'

function escapeTitle(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A printable version: the activity, endpoints, and all feedback. */
export function toPlainText(result: ActivityResult, title?: string): string {
  const heading = result.title || title || 'Reflective activity'
  const lines: string[] = [heading, '']
  if (result.instructions) lines.push(result.instructions, '')

  const activity = result.activity
  if (activity.kind === 'grid') {
    lines.push(`${activity.yLabel} (rows, top to bottom): ${activity.rows.join(' | ')}`)
    lines.push(`${activity.xLabel} (columns, left to right): ${activity.columns.join(' | ')}`)
    lines.push('')
    activity.rows.forEach((row, ri) => {
      activity.columns.forEach((col, ci) => {
        const cell = activity.cells[ri * activity.columns.length + ci]
        const label = cell?.label ? ` — ${cell.label}` : ''
        const feedback = cell?.feedback ? `: ${cell.feedback}` : ''
        lines.push(`- ${row} × ${col}${label}${feedback}`)
      })
    })
  } else {
    activity.statements.forEach((statement) => {
      lines.push(`- ${statement.text}`)
      lines.push(`  ${statement.lowLabel}  ←→  ${statement.highLabel}`)
      if (statement.feedback) lines.push(`  ${statement.feedback}`)
    })
  }

  if (activity.debrief) lines.push('', activity.debrief)
  return lines.join('\n') + '\n'
}

/** A self-contained, interactive HTML activity (grid or slider). */
export function toStandaloneHTML(result: ActivityResult, title: string): string {
  const safeTitle = escapeTitle(result.title || title)
  // `raw` is debugging data, not needed in the exported page.
  const dataJson = JSON.stringify({ ...result, raw: '' }).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${FAVICON_LINK}
<title>${safeTitle} — Activity</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
  #wrap { max-width: 760px; width: 100%; }
  h1 { font-size: 26px; margin-bottom: 8px; color: #a78bfa; text-align: center; }
  .instructions { text-align: center; color: #b8b8cc; font-size: 16px; line-height: 1.6; margin-bottom: 24px; }
  .debrief { margin-top: 22px; padding: 16px 18px; background: rgba(167,139,250,0.1); border-left: 3px solid #a78bfa; border-radius: 0 8px 8px 0; color: #c4b5fd; line-height: 1.6; }
  .debrief:empty { display: none; }
  .axis-label { text-align: center; color: #888; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; margin: 8px 0; }
  .grid-wrap { overflow-x: auto; }
  table.grid { border-collapse: separate; border-spacing: 4px; width: 100%; min-width: 460px; }
  table.grid th { color: #a0a0b8; font-size: 12px; font-weight: 600; padding: 8px 6px; text-align: center; }
  table.grid th.corner { color: #6b6b8f; text-align: right; white-space: nowrap; }
  table.grid td { padding: 0; }
  .cell { width: 100%; min-height: 64px; padding: 10px 8px; background: #252547; border: 1px solid #3a3a5c; border-radius: 8px; color: #e0e0e0; font-family: inherit; font-size: 13px; line-height: 1.3; cursor: pointer; transition: all 0.15s; }
  .cell:hover { border-color: #a78bfa; background: rgba(167,139,250,0.1); }
  .cell.selected { border-color: #a78bfa; background: rgba(167,139,250,0.22); }
  .feedback { margin-top: 14px; padding: 14px 16px; background: #252547; border: 1px solid #3a3a5c; border-radius: 10px; color: #d8d8e8; font-size: 15px; line-height: 1.6; min-height: 52px; }
  .sliders { display: flex; flex-direction: column; gap: 16px; }
  .slider-card { background: #252547; border: 1px solid #3a3a5c; border-radius: 12px; padding: 18px; }
  .statement { font-size: 17px; line-height: 1.5; margin-bottom: 14px; }
  .slider-row { display: flex; align-items: center; gap: 10px; }
  .end-label { flex: 0 0 96px; color: #a0a0b8; font-size: 12px; line-height: 1.3; }
  .end-label:last-child { text-align: right; }
  .slider { flex: 1; accent-color: #a78bfa; cursor: pointer; }
  .slider-card .feedback { margin-top: 12px; min-height: 46px; background: rgba(167,139,250,0.08); }
  .meta { text-align: center; color: #555; font-size: 12px; margin-top: 36px; }
</style>
</head>
<body>
<div id="wrap">
  <h1>${safeTitle}</h1>
  <p class="instructions" id="instructions"></p>
  <div id="activity"></div>
  <div class="debrief" id="debrief"></div>
  <div class="meta">Created with Playable Lessons</div>
</div>
<script>
(function () {
  var DATA = ${dataJson};
  var activity = DATA.activity || {};
  document.getElementById('instructions').textContent = DATA.instructions || '';

  function showGrid(host, g) {
    var wrap = document.createElement('div');
    wrap.className = 'grid-wrap';

    var top = document.createElement('div');
    top.className = 'axis-label';
    top.textContent = g.xLabel || '';
    wrap.appendChild(top);

    var table = document.createElement('table');
    table.className = 'grid';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'corner';
    corner.textContent = g.yLabel || '';
    headRow.appendChild(corner);
    (g.columns || []).forEach(function (label) {
      var th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var feedback = document.createElement('div');
    feedback.className = 'feedback';
    feedback.textContent = 'Tap a cell to see what it means.';

    (g.rows || []).forEach(function (rowLabel, ri) {
      var row = document.createElement('tr');
      var th = document.createElement('th');
      th.textContent = rowLabel;
      row.appendChild(th);
      (g.columns || []).forEach(function (colLabel, ci) {
        var td = document.createElement('td');
        var cell = (g.cells || [])[ri * g.columns.length + ci] || { label: '', feedback: '' };
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cell';
        btn.textContent = cell.label || '';
        btn.addEventListener('click', function () {
          table.querySelectorAll('.cell').forEach(function (b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          feedback.textContent = (cell.label ? cell.label + ' — ' : '') + (cell.feedback || 'No feedback for this cell.');
        });
        td.appendChild(btn);
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    var bottom = document.createElement('div');
    bottom.className = 'axis-label';
    bottom.textContent = g.xLabel || '';
    wrap.appendChild(bottom);
    wrap.appendChild(feedback);
    host.appendChild(wrap);
  }

  function showSliders(host, s) {
    var wrap = document.createElement('div');
    wrap.className = 'sliders';
    (s.statements || []).forEach(function (statement) {
      var card = document.createElement('div');
      card.className = 'slider-card';

      var question = document.createElement('div');
      question.className = 'statement';
      question.textContent = statement.text || '';
      card.appendChild(question);

      var row = document.createElement('div');
      row.className = 'slider-row';
      var low = document.createElement('span');
      low.className = 'end-label';
      low.textContent = statement.lowLabel || 'Low';
      var input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      input.value = '50';
      input.className = 'slider';
      var high = document.createElement('span');
      high.className = 'end-label';
      high.textContent = statement.highLabel || 'High';
      row.appendChild(low);
      row.appendChild(input);
      row.appendChild(high);
      card.appendChild(row);

      var feedback = document.createElement('div');
      feedback.className = 'feedback';
      feedback.textContent = 'Move the slider to see feedback.';
      card.appendChild(feedback);

      input.addEventListener('input', function () {
        var value = Number(input.value);
        var leaning = value < 45 ? (statement.lowLabel || 'the low end') : value > 55 ? (statement.highLabel || 'the high end') : 'the middle';
        feedback.textContent = (statement.feedback ? statement.feedback + ' ' : '') + 'You are leaning toward ' + leaning + '.';
      });

      wrap.appendChild(card);
    });
    host.appendChild(wrap);
  }

  var host = document.getElementById('activity');
  if (activity.kind === 'grid') showGrid(host, activity);
  else showSliders(host, activity);

  var debrief = document.getElementById('debrief');
  if (activity.debrief) debrief.textContent = activity.debrief;
})();
</script>
</body>
</html>`
}

// Re-exported for callers that want to narrow the activity without importing
// the whole generator module.
export type { GridActivity, SliderActivity }
