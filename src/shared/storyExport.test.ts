import { describe, it, expect } from 'vitest'
import { escapeHtml, ensureStartDivert, compileInk, exportStandaloneHTML } from './storyExport'

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" class='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; class=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    )
  })

  it('escapes & before other entities (no double-encoding bug)', () => {
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('ensureStartDivert', () => {
  it('inserts a top-level divert to the first knot when missing', () => {
    const out = ensureStartDivert('=== intro ===\nHello.\n-> END\n')
    expect(out).toMatch(/^->\s*intro/m)
  })

  it('leaves source untouched when a divert already exists', () => {
    const src = '-> intro\n=== intro ===\nHello.\n-> END\n'
    expect(ensureStartDivert(src)).toBe(src)
  })

  it('leaves source untouched when there are no knots', () => {
    const src = 'Just some text.\n'
    expect(ensureStartDivert(src)).toBe(src)
  })
})

describe('compileInk', () => {
  it('compiles valid Ink to a JSON string', async () => {
    const json = await compileInk('=== start ===\nHello world.\n* [Go] -> END\n')
    expect(typeof json).toBe('string')
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('rejects invalid Ink', async () => {
    await expect(compileInk('=== start ===\n-> nonexistent_knot\n')).rejects.toThrow()
  })

  it('surfaces the compiler\'s real error messages, not a bare "Compilation failed."', async () => {
    // The AI fix-retry loop and the error banner both depend on this detail.
    try {
      await compileInk('=== start ===\nHi.\n-> nonexistent_knot\n')
      expect.unreachable('should have thrown')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).toMatch(/nonexistent_knot|line \d+/i)
    }
  })
})

describe('scene-image tags at runtime', () => {
  // The whole feature rests on inkjs delivering `# IMAGE_PROMPT:` tags through
  // currentTags as the player continues — pin that behavior.
  it('compiled stories deliver IMAGE_PROMPT tags via currentTags', async () => {
    const ink = [
      '=== start ===',
      '# IMAGE_PROMPT: a lighthouse at dawn',
      'Hello.',
      '* [Go] -> ending',
      '=== ending ===',
      '# IMAGE_PROMPT: storm clouds over the sea',
      '# ENDING: good',
      'Done.',
      '-> END'
    ].join('\n')
    const json = await compileInk(ink)
    const { Story } = await import('inkjs/engine/Story')
    const story = new Story(json)

    const first: string[] = []
    while (story.canContinue) {
      story.Continue()
      if (story.currentTags) first.push(...story.currentTags)
    }
    expect(first).toContain('IMAGE_PROMPT: a lighthouse at dawn')

    story.ChooseChoiceIndex(0)
    const second: string[] = []
    while (story.canContinue) {
      story.Continue()
      if (story.currentTags) second.push(...story.currentTags)
    }
    expect(second).toContain('IMAGE_PROMPT: storm clouds over the sea')
    expect(second).toContain('ENDING: good')
  })
})

describe('exportStandaloneHTML', () => {
  it('escapes the title to prevent HTML injection', async () => {
    const html = await exportStandaloneHTML('=== start ===\nHi.\n-> END\n', '</title><script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('embeds the inkjs runtime inline (no CDN) for fully offline play', async () => {
    const html = await exportStandaloneHTML('=== start ===\nHi.\n-> END\n', 'Story')
    expect(html).not.toContain('cdn.jsdelivr.net')
    expect(html).not.toMatch(/<script\s+src=/)
    expect(html).toContain('new inkjs.Story')
    // The runtime is ~128 KB — confirm it's actually inlined, not linked.
    expect(html.length).toBeGreaterThan(100_000)
  })

  it('embeds the scene-image map and resolves IMAGE_PROMPT tags', async () => {
    const ink = '=== start ===\n# IMAGE_PROMPT: a lighthouse at dawn\nHi.\n-> END\n'
    const images = { 'a lighthouse at dawn': 'data:image/png;base64,ABC123' }
    const html = await exportStandaloneHTML(ink, 'Story', images)
    expect(html).toContain('data:image/png;base64,ABC123')
    expect(html).toContain('IMAGE_PROMPT:')
    expect(html).toContain('scene-img')
  })

  it('defaults to an empty scene-image map (no breakage for text-only stories)', async () => {
    const html = await exportStandaloneHTML('=== start ===\nHi.\n-> END\n', 'Story')
    expect(html).toContain('var sceneImages = {}')
  })

  it('escapes </script> in scene-image payloads', async () => {
    const ink = '=== start ===\n# IMAGE_PROMPT: evil\nHi.\n-> END\n'
    const images = { evil: 'data:image/png;base64,</script><script>alert(1)</script>' }
    const html = await exportStandaloneHTML(ink, 'Story', images)
    expect(html).not.toContain('</script><script>alert(1)</script>')
  })
})
