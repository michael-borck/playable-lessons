import { describe, it, expect } from 'vitest'
import { extractInk, generateInk } from './generate'
import type { ProviderConfig } from './aiClient'

describe('extractInk', () => {
  it('prefers a ```ink fenced block', () => {
    const raw = 'Here you go:\n```ink\n=== start ===\nHi.\n-> END\n```\nEnjoy!'
    expect(extractInk(raw)).toBe('=== start ===\nHi.\n-> END')
  })

  it('falls back to any fenced block', () => {
    expect(extractInk('```\n=== start ===\n-> END\n```')).toBe('=== start ===\n-> END')
  })

  it('falls back to the trimmed raw text when unfenced', () => {
    expect(extractInk('  === start ===\n-> END  ')).toBe('=== start ===\n-> END')
  })
})

describe('generateInk', () => {
  const config: ProviderConfig = { provider: 'ollama', model: 'test' }
  const VALID = '```ink\n=== start ===\nThe lesson begins.\n* [Continue] -> conclusion\n=== conclusion ===\nWell done.\n# ENDING: good\n-> END\n```'

  it('runs the pipeline with an injected transport and returns compiled JSON', async () => {
    const calls: number = 0
    const result = await generateInk(
      { inputMode: 'topic', inputText: 'Photosynthesis basics', storyLength: 'short' },
      config,
      { call: async () => VALID }
    )
    expect(result.inkSource).toContain('=== start ===')
    expect(() => JSON.parse(result.compiledJson)).not.toThrow()
    void calls
  })

  it('retries compilation with AI fixes and gives up after maxCompileRetries', async () => {
    let n = 0
    const call = async () => {
      n++
      // Always return Ink that references a missing knot -> never compiles.
      return '```ink\n=== start ===\n-> nonexistent\n```'
    }
    await expect(
      generateInk({ inputMode: 'topic', inputText: 'x' }, config, { call, maxCompileRetries: 2 })
    ).rejects.toThrow(/Failed to compile/)
    expect(n).toBeGreaterThanOrEqual(2) // outline + ink + review + at least one fix attempt
  })
})
