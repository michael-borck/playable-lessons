import { describe, it, expect } from 'vitest'
import { exportEpub } from './epubExporter'

const BRANCHING_INK = `-> start
=== start ===
You arrive at the crossroads.
* [Take the forest path] -> forest
* [Take the mountain path] -> mountain
=== forest ===
# IMAGE_PROMPT: a quiet forest
The forest is quiet.
-> END
=== mountain ===
The climb is hard.
-> END
`

const STATEFUL_INK = `VAR trust = 0
-> start
=== start ===
Hello.
~ trust = trust + 1
{ trust > 0: You feel welcome. }
* [Go on] -> DONE
`

describe('exportEpub', () => {
  it('produces an EPUB with the required OCF entries in order', async () => {
    const bytes = await exportEpub(BRANCHING_INK, 'Crossroads')
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])

    const text = new TextDecoder('latin1').decode(bytes)
    // mimetype must be the first entry and uncompressed.
    expect(text.indexOf('mimetype')).toBeLessThan(text.indexOf('META-INF/container.xml'))
    expect(text).toContain('application/epub+zip')
    expect(text).toContain('OEBPS/content.opf')
    expect(text).toContain('OEBPS/nav.xhtml')
    expect(text).toContain('OEBPS/start.xhtml')
    expect(text).toContain('OEBPS/forest.xhtml')
  })

  it('turns choices into links and keeps branches out of the linear spine', async () => {
    const text = new TextDecoder('latin1').decode(await exportEpub(BRANCHING_INK, 'T'))
    expect(text).toContain('href="forest.xhtml"')
    expect(text).toContain('href="mountain.xhtml"')
    expect(text).toContain('<itemref idref="ch-forest" linear="no"/>')
  })

  it('embeds scene images in the package', async () => {
    const text = new TextDecoder('latin1').decode(
      await exportEpub(BRANCHING_INK, 'T', { 'a quiet forest': 'data:image/png;base64,QUJD' })
    )
    expect(text).toContain('OEBPS/images/scene-')
    expect(text).toContain('media-type="image/png"')
  })

  it('refuses a stateful story', async () => {
    await expect(exportEpub(STATEFUL_INK, 'T')).rejects.toThrow(/cannot represent/)
  })
})
