// Prompt templates now live in the shared module so the CLI and renderer use
// the exact same prompts. Re-exported here to keep existing import paths stable.
export { PROMPTS, storyPrompts, type BranchingStyle } from '../../../shared/prompts'
