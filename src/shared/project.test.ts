import { describe, it, expect } from 'vitest'
import { isSafeProjectId, projectIdFromName } from './projectId'

describe('isSafeProjectId', () => {
  it('accepts ids produced by projectIdFromName', () => {
    const id = projectIdFromName('My Lesson: Part 1')
    expect(id).toMatch(/^[a-z0-9-]+$/)
    expect(isSafeProjectId(id)).toBe(true)
  })

  it('rejects path traversal and absolute paths', () => {
    for (const bad of ['../secrets', '..', '.', '/etc/passwd', 'a/b', 'a\\b', '', 'A-Upper']) {
      expect(isSafeProjectId(bad)).toBe(false)
    }
  })

  it('rejects non-strings', () => {
    expect(isSafeProjectId(null)).toBe(false)
    expect(isSafeProjectId(42)).toBe(false)
    expect(isSafeProjectId({})).toBe(false)
  })
})
