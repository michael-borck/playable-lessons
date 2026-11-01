/**
 * EPUB 3 export: a self-contained, offline "reader" edition of a
 * pure-branching story. Each knot becomes an XHTML chapter and each choice a
 * hyperlink, so the book is still playable in any EPUB 3 reader.
 *
 * Stateful stories are refused (same gate as H5P/Twee): Ink variables and
 * conditional text cannot be evaluated by an e-reader. The graph comes from
 * the compiled Ink JSON.
 */

import { compileInk, escapeHtml } from './storyExport.js'
import { parseCompiledInk, type InkGraph, type InkGraphKnot } from './inkGraph.js'
import { findStateConstructs, describeStateConstructs } from './h5pExporter.js'
import { zipStore, base64ToBytes, type ZipEntry } from './zip.js'

interface EpubImage {
  href: string
  bytes: Uint8Array
  mediaType: string
  alt: string
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
}

/** Decode a `data:` URL into bytes + media type; null for anything else. */
function decodeDataUrl(value: string): { bytes: Uint8Array; mediaType: string } | null {
  const match = value.match(/^data:([^;,]+);base64,(.*)$/s)
  if (!match) return null
  return { mediaType: match[1], bytes: base64ToBytes(match[2]) }
}

function imageForKnot(
  knot: InkGraphKnot,
  sceneImages: Record<string, string> | undefined,
  index: number,
  images: EpubImage[]
): EpubImage | null {
  const source =
    (knot.imagePrompt && sceneImages?.[knot.imagePrompt]) ||
    (knot.imagePath && /^data:/.test(knot.imagePath) ? knot.imagePath : null)
  if (!source) return null

  const decoded = decodeDataUrl(source)
  if (!decoded) return null
  const ext = IMAGE_EXT[decoded.mediaType]
  if (!ext) return null

  const image: EpubImage = {
    href: `images/scene-${index}.${ext}`,
    bytes: decoded.bytes,
    mediaType: decoded.mediaType,
    alt: knot.imagePrompt || knot.id.replace(/_/g, ' ')
  }
  images.push(image)
  return image
}

function chapterXhtml(
  knot: InkGraphKnot,
  image: EpubImage | null,
  title: string,
  isStart: boolean
): string {
  const body: string[] = []
  if (isStart) body.push(`<h1>${escapeHtml(title)}</h1>`)
  if (image) {
    body.push(`<p class="scene"><img src="${image.href}" alt="${escapeHtml(image.alt)}"/></p>`)
  }
  for (const paragraph of knot.paragraphs) body.push(`<p>${escapeHtml(paragraph)}</p>`)

  if (knot.choices.length > 0) {
    body.push('<ul class="choices">')
    for (const choice of knot.choices) {
      const href = choice.target ? `${choice.target}.xhtml` : 'end.xhtml'
      body.push(`<li><a href="${href}">${escapeHtml(choice.text)}</a></li>`)
    }
    body.push('</ul>')
  } else if (knot.nextTarget) {
    body.push(`<p class="continue"><a href="${knot.nextTarget}.xhtml">Continue &#8594;</a></p>`)
  } else {
    body.push('<p class="end">&#8212; End of Story &#8212;</p>')
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="style.css" type="text/css"/>
</head>
<body>
<section epub:type="chapter">
${body.join('\n')}
</section>
</body>
</html>
`
}

function endXhtml(title: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="style.css" type="text/css"/>
</head>
<body>
<section epub:type="chapter">
<p class="end">&#8212; End of Story &#8212;</p>
<p><a href="__START__.xhtml">Play again</a></p>
</section>
</body>
</html>
`
}

const STYLESHEET = `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; margin: 5%; color: #222; }
h1 { font-size: 1.6em; margin-bottom: 1em; }
p { margin: 0 0 1em; }
.scene img { max-width: 100%; height: auto; display: block; margin: 0 auto 1.2em; }
.choices { list-style: none; padding: 0; }
.choices li { margin: 0 0 0.6em; }
.choices a, .continue a { display: block; padding: 0.7em 1em; border: 1px solid #ccc; border-radius: 6px; text-decoration: none; color: #3b2a80; }
.choices a:hover, .continue a:hover { background: #f3f0ff; }
.end { text-align: center; color: #666; font-style: italic; margin-top: 2em; }
`

function contentOpf(
  title: string,
  chapters: { id: string; href: string }[],
  images: EpubImage[],
  startId: string
): string {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16).toUpperCase()
  })
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  const items = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    '<item id="end" href="end.xhtml" media-type="application/xhtml+xml"/>',
    ...chapters.map(
      (c) => `<item id="ch-${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`
    ),
    ...images.map(
      (img, i) => `<item id="img-${i}" href="${img.href}" media-type="${img.mediaType}"/>`
    )
  ]

  const spine = [
    `<itemref idref="ch-${startId}"/>`,
    ...chapters
      .filter((c) => c.id !== startId)
      .map((c) => `<itemref idref="ch-${c.id}" linear="no"/>`),
    '<itemref idref="end" linear="no"/>'
  ]

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
<dc:title>${escapeHtml(title)}</dc:title>
<dc:language>en</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
${items.join('\n')}
</manifest>
<spine>
${spine.join('\n')}
</spine>
</package>
`
}

function navXhtml(title: string, startId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head>
<body>
<nav epub:type="toc" id="toc">
<h1>${escapeHtml(title)}</h1>
<ol><li><a href="${startId}.xhtml">Start</a></li></ol>
</nav>
<nav epub:type="landmarks" hidden="hidden">
<ol><li><a epub:type="bodymatter" href="${startId}.xhtml">Start</a></li></ol>
</nav>
</body>
</html>
`
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`

function buildPackage(graph: InkGraph, title: string, sceneImages?: Record<string, string>): Uint8Array {
  if (graph.knots.length === 0) throw new Error('No knots found in the Ink source — nothing to export.')

  const startId =
    graph.start && graph.knots.some((k) => k.id === graph.start)
      ? graph.start
      : graph.knots[0].id

  const knots = [
    ...graph.knots.filter((k) => k.id === startId),
    ...graph.knots.filter((k) => k.id !== startId)
  ]

  const images: EpubImage[] = []
  const entries: ZipEntry[] = [
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: CONTAINER_XML },
    { name: 'OEBPS/style.css', data: STYLESHEET },
    { name: 'OEBPS/nav.xhtml', data: navXhtml(title, startId) },
    { name: 'OEBPS/end.xhtml', data: endXhtml(title).replace(/__START__/g, startId) }
  ]

  knots.forEach((knot, i) => {
    const image = imageForKnot(knot, sceneImages, i, images)
    entries.push({
      name: `OEBPS/${knot.id}.xhtml`,
      data: chapterXhtml(knot, image, title, knot.id === startId)
    })
  })

  for (const image of images) {
    entries.push({ name: `OEBPS/${image.href}`, data: image.bytes })
  }

  entries.push({
    name: 'OEBPS/content.opf',
    data: contentOpf(
      title,
      graph.knots.map((k) => ({ id: k.id, href: `${k.id}.xhtml` })),
      images,
      startId
    )
  })

  return zipStore(entries)
}

/**
 * Build an EPUB 3 package from a pure-branching story. Throws with a
 * construct-by-construct explanation when the story uses state.
 */
export async function exportEpub(
  inkSource: string,
  title: string,
  sceneImages?: Record<string, string>
): Promise<Uint8Array> {
  const issues = findStateConstructs(inkSource)
  if (issues.length > 0) throw new Error(describeStateConstructs(issues, 'EPUB 3 readers'))

  const graph = parseCompiledInk(await compileInk(inkSource))
  return buildPackage(graph, title, sceneImages)
}

/** Same as `exportEpub` when the caller already has compiled JSON. */
export function exportEpubFromCompiled(
  compiledJson: string | object,
  title: string,
  sceneImages?: Record<string, string>
): Uint8Array {
  return buildPackage(parseCompiledInk(compiledJson), title, sceneImages)
}
