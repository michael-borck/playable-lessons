/**
 * SCORM 1.2 export: wrap the standalone story player in a single-SCO package
 * that reports completion to an LMS (Moodle, Canvas, Blackboard, …).
 *
 * Unlike H5P/Twee/EPUB this works for *stateful* stories too — the SCO is the
 * full HTML player, and completion is reported when the story reaches an
 * ending. The package is self-contained (one index.html), so no assets folder
 * is needed.
 */

import { exportStandaloneHTML, escapeHtml } from './storyExport.js'
import { zipStore } from './zip.js'

/** Report completion/exit to a SCORM 1.2 LMS found on the parent chain. */
const SCORM_WRAPPER = `
<script>
(function () {
  function findAPI(win) {
    var tries = 0;
    while (win && !win.API && win.parent && win.parent !== win && tries < 10) {
      win = win.parent;
      tries++;
    }
    return (win && win.API) || null;
  }
  var api = null;
  try { api = findAPI(window); } catch (e) { api = null; }
  if (!api) { try { api = window.opener && window.opener.API; } catch (e) { api = null; } }
  if (!api) return;

  var done = false;
  function init() {
    try {
      api.LMSInitialize('');
      api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
      api.LMSCommit('');
    } catch (e) {}
  }
  function complete() {
    try {
      api.LMSSetValue('cmi.core.lesson_status', 'completed');
      api.LMSSetValue('cmi.core.exit', '');
      api.LMSCommit('');
    } catch (e) {}
  }
  function check() {
    if (done) return;
    if (document.querySelector('.ending')) { done = true; complete(); }
  }

  init();
  var target = document.getElementById('content') || document.body;
  if (window.MutationObserver) new MutationObserver(check).observe(target, { childList: true, subtree: true });
  setInterval(check, 1000);

  window.addEventListener('beforeunload', function () {
    try {
      if (!done) api.LMSSetValue('cmi.core.exit', 'suspend');
      api.LMSCommit('');
      api.LMSFinish('');
    } catch (e) {}
  });
})();
</script>
`

/** SCORM 1.2 imsmanifest.xml for a single web-content SCO. */
function manifest(title: string): string {
  const safeTitle = escapeHtml(title)
  const id = `com.playablelessons.${Math.random().toString(36).slice(2, 10)}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.2"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
    http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
    http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${safeTitle}</title>
      <item identifier="ITEM-1" identifierref="RES-1">
        <title>${safeTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>
`
}

function injectWrapper(html: string): string {
  return html.includes('</body>')
    ? html.replace('</body>', `${SCORM_WRAPPER}</body>`)
    : html + SCORM_WRAPPER
}

/**
 * Build a SCORM 1.2 package (zip bytes) from a story. Never gated on state:
 * the SCO is the same standalone HTML player, so variables/conditionals work.
 */
export async function exportScorm(
  inkSource: string,
  title: string,
  sceneImages?: Record<string, string>
): Promise<Uint8Array> {
  const html = injectWrapper(await exportStandaloneHTML(inkSource, title, sceneImages))
  return zipStore([
    { name: 'imsmanifest.xml', data: manifest(title) },
    { name: 'index.html', data: html }
  ])
}
