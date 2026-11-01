/**
 * Project-id helpers with no imports, so the Electron main process can use
 * them without pulling the renderer/AI modules into its TypeScript project.
 */

/**
 * True when a string is a project id this app created. Anything else (slashes,
 * dots, absolute paths, empty) is rejected before it reaches a filesystem path.
 */
export function isSafeProjectId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,80}$/.test(id)
}

/** A filesystem-safe, unique id derived from a name (+ short suffix). */
export function projectIdFromName(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'project'
  return `${slug}-${Date.now().toString(36)}`
}
