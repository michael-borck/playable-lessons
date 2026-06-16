/**
 * Shared story logic used by BOTH the renderer (via Vite) and the CLI (via
 * tsc/NodeNext). Intra-shared imports use explicit `.js` extensions so they
 * resolve under both bundler and NodeNext module resolution.
 *
 * Side dependencies: a dynamic import of inkjs's Compiler, and the embedded
 * inkjs runtime (so HTML exports are fully offline).
 */

import { INKJS_RUNTIME, INKJS_VERSION } from './inkRuntime.generated.js'

/**
 * Escape a string for safe interpolation into HTML text or double-quoted
 * attribute values. Escapes &, <, >, ", and ' (the single quote matters for
 * single-quoted attributes and is cheap to include).
 */
export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Neutralize any `</script>` sequence so embedded JS/JSON can't break out of
 * its <script> element. Safe to apply to runtime code and JSON alike.
 */
function escapeScriptClose(text: string): string {
  return text.replace(/<\/(script)/gi, '<\\/$1')
}

/**
 * Ensures the Ink source has a top-level divert to the first knot.
 * Without this, the story starts at the root and immediately ends.
 */
export function ensureStartDivert(source: string): string {
  const trimmed = source.trim()

  // Check if there's already a top-level divert before the first knot
  const firstKnotIndex = trimmed.search(/^===\s*\w+\s*===/m)
  if (firstKnotIndex === -1) return source // no knots at all

  const beforeFirstKnot = trimmed.substring(0, firstKnotIndex)
  if (/^->\s*\w+/m.test(beforeFirstKnot)) return source // already has a divert

  // Find the name of the first knot
  const knotMatch = trimmed.match(/^===\s*(\w+)\s*===/m)
  if (!knotMatch) return source

  const firstKnotName = knotMatch[1]

  // Insert a divert just before the first knot
  return trimmed.substring(0, firstKnotIndex) + `-> ${firstKnotName}\n` + trimmed.substring(firstKnotIndex)
}

/**
 * Compiles Ink source to JSON using inkjs's Compiler.
 * Returns the compiled JSON string.
 */
export async function compileInk(inkSource: string): Promise<string> {
  const { Compiler } = await import('inkjs/compiler/Compiler')

  const source = ensureStartDivert(inkSource)
  const compiler = new Compiler(source)
  const story = compiler.Compile()

  if (!story) {
    throw new Error('Ink compilation failed: no story produced')
  }

  const json = story.ToJson()

  if (!json) {
    throw new Error('Ink compilation failed: could not serialize to JSON')
  }

  return json
}

/**
 * Exports a standalone HTML file that plays the story.
 * The inkjs runtime is loaded from a pinned CDN URL (with SRI) in the export.
 *
 * The inkjs runtime is embedded inline (no CDN), so the file is fully offline.
 * `title` is escaped; the compiled JSON and the runtime are guarded against
 * breaking out of their <script> elements.
 */
export async function exportStandaloneHTML(inkSource: string, title: string): Promise<string> {
  const compiledJson = await compileInk(inkSource)
  const escapedJson = escapeScriptClose(JSON.stringify(compiledJson))
  const safeTitle = escapeHtml(title)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — Playable Lessons</title>
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
  }
  #story { max-width: 650px; width: 100%; }
  h1 { font-size: 28px; margin-bottom: 32px; color: #a78bfa; text-align: center; }
  .text p { font-size: 18px; line-height: 1.8; margin-bottom: 16px; }
  .choices { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
  .choice {
    padding: 14px 20px;
    background: #252547;
    border: 1px solid #3a3a5c;
    border-radius: 8px;
    color: #e0e0e0;
    cursor: pointer;
    font-size: 16px;
    font-family: inherit;
    text-align: left;
    transition: all 0.15s;
  }
  .choice:hover { border-color: #a78bfa; background: rgba(167, 139, 250, 0.1); }
  .ending { text-align: center; padding: 32px; color: #888; font-style: italic; font-size: 18px; }
  .restart {
    display: block;
    margin: 24px auto;
    padding: 12px 28px;
    background: #a78bfa;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    font-family: inherit;
  }
  .restart:hover { background: #8b6fdf; }
  .meta { text-align: center; color: #555; font-size: 12px; margin-top: 48px; }
</style>
</head>
<body>
<div id="story">
  <h1>${safeTitle}</h1>
  <div id="content"></div>
</div>

<!-- inkjs ${INKJS_VERSION} runtime embedded inline so this file plays fully offline -->
<script>${escapeScriptClose(INKJS_RUNTIME)}</script>
<script>
(function() {
  var storyJson = ${escapedJson};
  var story = new inkjs.Story(storyJson);
  var content = document.getElementById('content');

  function continueStory() {
    var textDiv = document.createElement('div');
    textDiv.className = 'text';
    while (story.canContinue) {
      var line = story.Continue().trim();
      if (line) {
        var p = document.createElement('p');
        p.textContent = line;
        textDiv.appendChild(p);
      }
    }
    content.appendChild(textDiv);

    if (story.currentChoices.length > 0) {
      var choicesDiv = document.createElement('div');
      choicesDiv.className = 'choices';
      story.currentChoices.forEach(function(choice, i) {
        var btn = document.createElement('button');
        btn.className = 'choice';
        btn.textContent = choice.text;
        btn.addEventListener('click', function() {
          choicesDiv.remove();
          story.ChooseChoiceIndex(i);
          continueStory();
        });
        choicesDiv.appendChild(btn);
      });
      content.appendChild(choicesDiv);
    }

    if (!story.canContinue && story.currentChoices.length === 0) {
      var endDiv = document.createElement('div');
      endDiv.className = 'ending';
      endDiv.textContent = '\\u2014 End of Story \\u2014';
      content.appendChild(endDiv);
      var restartBtn = document.createElement('button');
      restartBtn.className = 'restart';
      restartBtn.textContent = 'Play Again';
      restartBtn.addEventListener('click', function() { location.reload(); });
      content.appendChild(restartBtn);
    }

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  continueStory();

  var meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'Created with Playable Lessons';
  document.getElementById('story').appendChild(meta);
})();
</script>
</body>
</html>`
}
