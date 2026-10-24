const assert = require('node:assert/strict');
const { resolveSvgMotif } = require('./lib/svg-motif-identity');
const { withOutcomes } = require('./lib/firewall-outcomes');
const { validateScene } = require('./lib/narrative-visual-firewall');
const svg = { viewBox: '0 0 100 100', paths: [{ d: 'M0 0 L20 20', fill: 'ink' }] };
assert.equal(resolveSvgMotif({ type: 'customSvg', customSvg: svg }, { loom: svg }).motif, 'loom');
assert.equal(resolveSvgMotif({ type: 'customSvg', customSvg: { ...svg, paths: [{ d: 'M9 9' }] } }, { loom: svg }).motif, 'customSvg');
assert.equal(resolveSvgMotif({ type: 'customSvg' }, { loom: svg }).invalid, true);
assert.equal(resolveSvgMotif({ type: 'customSvg', customSvg: svg }, { loom: svg, candy: svg }).motif, 'customSvg');
const provenance = { bookId: 'synthetic', sourceChapter: 'test', narrativeSubject: 'loom', narrativeRelation: 'owns', narrativeState: 'present', worldId: 'synthetic-world', allowedMotifs: ['loom'], forbiddenMotifs: [], allowedProps: [], allowedLocations: [], allowedCharacters: [] };
const scene = { id: 'fixture', props: [{ type: 'customSvg', customSvg: svg }], narrativeAtom: provenance, visualIntent: provenance,
  visualContract: { ...provenance, visualEvidence: { subjects: ['loom'], relations: ['owns'], states: ['present'] } } };
const bible = { visualProvenance: provenance, world: { worldId: provenance.worldId } };
const codes = s => validateScene(s, 1, bible, 'synthetic', { loom: svg }).map(v => v.reasonCode);
assert(!codes(scene).includes('MOTIF_NOT_ALLOWED'));
assert(codes({ ...scene, props: [{ type: 'customSvg', customSvg: { ...svg, paths: [{ d: 'M9 9' }] } }] }).includes('MOTIF_NOT_ALLOWED'));
assert(codes({ ...scene, props: [{ type: 'customSvg' }] }).includes('SVG_ASSET_INVALID'));
assert(codes({ ...scene, visualContract: { ...scene.visualContract, forbiddenMotifs: ['loom'] } }).includes('FOREIGN_WORLD'));
const foreign = { ...scene, visualContract: { ...scene.visualContract, allowedMotifs: ['caveAllegory'] } };
assert(validateScene(foreign, 1, bible, 'synthetic', { caveAllegory: svg }).some(v => v.reasonCode === 'FOREIGN_WORLD'));
const report = { status: 'FAIL', counts: { violations: 3, diagnostics: 1 }, violations: [
  { reasonCode: 'STRATEGY_UNRESOLVED' }, { reasonCode: 'SUBJECT_MISMATCH' },
  { reasonCode: 'UNKNOWN_FAILURE' }, { reasonCode: 'CONTRACT_VACUOUS', severity: 'diagnostic' },
] };
const preview = withOutcomes(report, true);
assert.equal(preview.status, 'PREVIEW-BLOCKED');
assert.equal(preview.counts.blocks, 2);
assert.equal(preview.counts.reviews, 2);
assert.equal(preview.violations.length, 4);
assert.equal(preview.productionStatus, 'FAIL');
assert.equal(withOutcomes(report).status, 'FAIL');
assert.equal(withOutcomes({ ...report, violations: [report.violations[0]] }, true).status, 'PREVIEW-REVIEW');
console.log('PASS preview contract: registered geometry, altered/missing/ambiguous SVG, fail-closed BLOCK, preserved strict production and findings');
