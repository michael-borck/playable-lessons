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
})
