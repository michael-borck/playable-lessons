// The Ink parser now lives in the shared module so the H5P exporter and the
// CLI can use it too. Re-exported here to keep existing import paths stable.
export { parseInkSource, updateKnotContent, addKnot, removeKnot } from '../../../shared/inkParser'
export type { InkKnot, InkChoice, InkVariable, ParsedInk } from '../../../shared/inkParser'
