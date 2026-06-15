/**
 * Ink compiler for Playable Lessons.
 *
 * The actual compile logic lives in the shared module so the CLI and renderer
 * stay in lockstep. This file re-exports it and adds renderer-only helpers.
 */

import { compileInk, ensureStartDivert } from '../../../shared/storyExport'

export { compileInk, ensureStartDivert }

/**
 * Validates Ink source without surfacing the compiled JSON.
 * Returns an array of error messages (empty if valid).
 */
export async function validateInk(inkSource: string): Promise<string[]> {
  try {
    await compileInk(inkSource)
    return []
  } catch (err) {
    return [err instanceof Error ? err.message : 'Unknown compilation error']
  }
}
