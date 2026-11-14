import { describe, it, expect } from 'vitest'
import { countIssues, lintInk } from './storyLint'

const VALID = `-> start
=== start ===
Hello.
* [Go on] -> next
=== next ===
Bye.
# ENDING: good
-> END
`

describe('lintInk', () => {
  it('reports a clean story and basic stats', () => {
    const result = lintInk(VALID)
    expect(result.issues).toEqual([])
    expect(result.stats).toEqual({ nodes: 2, choices: 1, endings: 1, variables: 0 })
  })

  it('warns about a reachable dead end', () => {
    const result = lintInk('-> start\n=== start ===\n* [Go] -> next\n=== next ===\nBye.\n')
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'dead-end', knotId: 'next' })
    )
  })

  it('warns about an unreachable passage', () => {
    const result = lintInk(`${VALID}\n=== orphan ===\nNobody gets here.\n-> END\n`)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'unreachable-knot', knotId: 'orphan' })
    )
  })

  it('warns about a choice without a divert target', () => {
    const result = lintInk('-> start\n=== start ===\n* [Go]\n')
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'empty-choice', knotId: 'start' })
    )
  })

  it('warns about image and timer tags that cannot render', () => {
    const result = lintInk('-> start\n=== start ===\n# IMAGE: local.png\n# TIMER: soon\nHello.\n-> END\n')
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'broken-image-tag' })
    )
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'invalid-timer' })
    )
  })

  it('reports duplicate passage names as an error', () => {
    const result = lintInk('-> start\n=== start ===\nA\n-> END\n=== start ===\nB\n-> END\n')
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'duplicate-knot' })
    )
  })

  it('notes advanced Ink as best-effort', () => {
    const result = lintInk('-> start\n=== start ===\n= stitch\nHello.\n-> END\n')
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'info', code: 'advanced-ink' })
    )
  })

  it('treats a missing top-level divert as info, not an error', () => {
    const result = lintInk('=== start ===\nHello.\n-> END\n')
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'info', code: 'no-start-divert' })
    )
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false)
  })

  it('counts issues by severity', () => {
    const result = lintInk('-> start\n=== start ===\n# IMAGE: local.png\n* [Go] -> start\n')
    expect(countIssues(result.issues)).toEqual({ error: 0, warning: 1, info: 0 })
  })
})
