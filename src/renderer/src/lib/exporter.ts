/**
 * Standalone HTML export.
 *
 * The implementation lives in the shared module (used by the CLI too); this
 * file re-exports it so existing renderer imports keep working.
 */
export { exportStandaloneHTML, escapeHtml } from '../../../shared/storyExport'
