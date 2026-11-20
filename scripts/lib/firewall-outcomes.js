// REVIEW is uncertainty, never production approval. Unknown errors fail closed.
const REVIEW_CODES = new Set(['STRATEGY_REQUIREMENT_UNMET', 'STRATEGY_UNRESOLVED']);
function classifyFinding(finding) {
  return finding.severity === 'diagnostic' || REVIEW_CODES.has(finding.reasonCode) ? 'REVIEW' : 'BLOCK';
}
function withOutcomes(report, preview = false) {
  const violations = report.violations.map(v => ({ ...v, outcome: classifyFinding(v) }));
  const blocks = violations.filter(v => v.outcome === 'BLOCK').length;
  const reviews = violations.length - blocks;
  return { ...report, mode: preview ? 'PREVIEW-ONLY' : 'PRODUCTION',
    productionStatus: report.status,
    status: preview ? (blocks ? 'PREVIEW-BLOCKED' : reviews ? 'PREVIEW-REVIEW' : 'PREVIEW-PASS') : report.status,
    counts: { ...report.counts, blocks, reviews }, violations };
}
module.exports = { classifyFinding, withOutcomes };
