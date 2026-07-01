/**
 * Flashcard export formats, shared by the renderer and the CLI.
 *
 * Standalone (no runtime imports from sibling shared modules) — it only needs
 * the FlashcardResult *type*, which is erased at compile time, so it resolves
 * cleanly under both bundler (renderer) and NodeNext (CLI) module resolution.
 */

import type { FlashcardResult } from './generate.js'

/** Quote a CSV field per RFC 4180 when it contains a comma, quote, or newline. */
function csvField(value: string): string {
  const needsQuote = /[",\n\r]/.test(value)
  const escaped = value.replace(/"/g, '""')
  return needsQuote ? `"${escaped}"` : escaped
}

/** CSV with a header row: front,back,hint,tag (imports into Anki, Quizlet, Excel). */
export function toCSV(result: FlashcardResult): string {
  const header = 'front,back,hint,tag'
  const rows = result.cards.map((c) =>
    [csvField(c.front), csvField(c.back), csvField(c.hint ?? ''), csvField(c.tag ?? '')].join(',')
  )
  return [header, ...rows].join('\n') + '\n'
}

/**
 * Anki-importable TSV: three columns — front <TAB> back <TAB> tag (empty when a
 * card has no tag). Anki renders fields as HTML, so newlines become <br> and
 * tabs (which would split columns) are collapsed to spaces. Hints are omitted
 * here — use CSV or the HTML deck for hints.
 */
export function toAnkiTSV(result: FlashcardResult): string {
  const clean = (s: string): string => s.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>')
  return (
    result.cards
      .map((c) => [clean(c.front), clean(c.back), clean(c.tag ?? '')].join('\t'))
      .join('\n') + '\n'
  )
}

/**
 * A self-contained, offline HTML flip-card deck: click/Space to flip, arrow keys
 * to navigate, plus shuffle and restart. Card text is rendered via textContent
 * (no innerHTML), and the embedded card JSON is guarded against breaking out of
 * its <script> by escaping '<' to '\u003c'.
 */
export function toStandaloneHTML(result: FlashcardResult, title: string): string {
  const deckTitle = result.deckTitle || title
  const cardsJson = JSON.stringify(result.cards).replace(/</g, '\\u003c')
  const safeTitle = String(deckTitle)
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
<title>${safeTitle} \u2014 Flashcards</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
  #deck { max-width: 640px; width: 100%; }
  h1 { font-size: 26px; margin-bottom: 8px; color: #a78bfa; text-align: center; }
  .progress { text-align: center; color: #888; font-size: 14px; margin-bottom: 8px; }
  .progress-bar { height: 4px; background: #252547; border-radius: 2px; margin-bottom: 20px; overflow: hidden; }
  .progress-fill { height: 100%; background: #a78bfa; border-radius: 2px; transition: width 0.3s ease; }
  .card { background: #252547; border: 1px solid #3a3a5c; border-radius: 14px; min-height: 220px; padding: 32px 28px; display: flex; flex-direction: column; justify-content: center; cursor: pointer; transition: border-color 0.15s, transform 0.1s; user-select: none; outline: none; }
  .card:hover, .card:focus { border-color: #a78bfa; }
  .card:active { transform: scale(0.99); }
  .face-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b8f; margin-bottom: 12px; }
  .face-text { font-size: 20px; line-height: 1.6; }
  .hint { margin-top: 16px; font-size: 15px; color: #a78bfa; font-style: italic; }
  .controls { display: flex; gap: 10px; justify-content: center; margin-top: 24px; flex-wrap: wrap; }
  button { padding: 12px 22px; background: #252547; border: 1px solid #3a3a5c; border-radius: 8px; color: #e0e0e0; cursor: pointer; font-size: 15px; font-family: inherit; transition: all 0.15s; }
  button:hover:not(:disabled) { border-color: #a78bfa; background: rgba(167,139,250,0.1); }
  button:disabled { opacity: 0.4; cursor: default; }
  button.primary { background: #a78bfa; color: #1a1a2e; border-color: #a78bfa; font-weight: 600; }
  button.primary:hover:not(:disabled) { background: #8b6fdf; }
  .keys { text-align: center; color: #555; font-size: 12px; margin-top: 20px; }
  .meta { text-align: center; color: #555; font-size: 12px; margin-top: 32px; }
</style>
</head>
<body>
<div id="deck">
  <h1>${safeTitle}</h1>
  <div class="progress" id="progress"></div>
  <div class="progress-bar"><div class="progress-fill" id="pfill" style="width:0%"></div></div>
  <div class="card" id="card" tabindex="0" role="button" aria-label="Flashcard \u2014 click or press Space to flip"></div>
  <div class="controls">
    <button id="prev">&lsaquo; Prev</button>
    <button id="flip" class="primary">Flip</button>
    <button id="next">Next &rsaquo;</button>
    <button id="shuffle">Shuffle</button>
    <button id="newdeck" class="primary">New deck</button>
  </div>
  <div class="keys">Space = flip &middot; &larr; &rarr; = navigate</div>
</div>
<script>
(function () {
  var ALL = ${cardsJson};
  var DECK_SIZE = 5;
  var deck = [], idx = 0, flipped = false;
  var cardEl = document.getElementById('card');
  var progressEl = document.getElementById('progress');
  var fillEl = document.getElementById('pfill');

  function shuffleArr(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random()*(i+1)); var t = a[i]; a[i]=a[j]; a[j]=t; }
    return a;
  }

  function newDeck() {
    deck = ALL.length <= DECK_SIZE ? shuffleArr(ALL) : shuffleArr(ALL).slice(0, DECK_SIZE);
    idx = 0; flipped = false; render();
  }

  function render() {
    var c = deck[idx]; if (!c) return;
    cardEl.innerHTML = '';
    var label = document.createElement('div');
    label.className = 'face-label';
    label.textContent = flipped ? 'Back' : 'Front';
    var text = document.createElement('div');
    text.className = 'face-text';
    text.textContent = flipped ? c.back : c.front;
    cardEl.appendChild(label); cardEl.appendChild(text);
    if (flipped && c.hint) {
      var hint = document.createElement('div'); hint.className = 'hint';
      hint.textContent = 'Hint: ' + c.hint; cardEl.appendChild(hint);
    }
    progressEl.textContent = 'Card ' + (idx + 1) + ' of ' + deck.length;
    fillEl.style.width = ((idx + 1) / deck.length * 100) + '%';
    document.getElementById('prev').disabled = idx === 0;
    document.getElementById('next').disabled = idx === deck.length - 1;
  }

  function flip() { flipped = !flipped; render(); }
  function go(n) { var j = idx + n; if (j < 0 || j >= deck.length) return; idx = j; flipped = false; render(); }
  function shuffleDeck() { deck = shuffleArr(deck); idx = 0; flipped = false; render(); }

  cardEl.addEventListener('click', flip);
  document.getElementById('flip').addEventListener('click', flip);
  document.getElementById('prev').addEventListener('click', function () { go(-1); });
  document.getElementById('next').addEventListener('click', function () { go(1); });
  document.getElementById('shuffle').addEventListener('click', shuffleDeck);
  document.getElementById('newdeck').addEventListener('click', newDeck);
  document.addEventListener('keydown', function (e) {
    if (e.key === ' ') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowLeft') { go(-1); }
    else if (e.key === 'ArrowRight') { go(1); }
  });

  newDeck();
  var meta = document.createElement('div'); meta.className = 'meta';
  meta.textContent = 'Created with Playable Lessons';
  document.getElementById('deck').appendChild(meta);
})();
</script>
</body>
</html>`
}
