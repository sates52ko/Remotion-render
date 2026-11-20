import fs from 'fs';
import path from 'path';
import { createVisualContractFromAtom, evaluateSceneVisualContract } from '../src/semantic/visualContract.ts';

/**
 * P1.5 benchmark regression (C2) — P2.0c strip sonrası.
 *
 * evaluate-gate-p15.mjs is the historical hardcoded benchmark and its first
 * input (lord-of-the-flies) no longer exists in the repo, so it cannot be
 * re-run as-is. This comparator re-evaluates the SAME scene ids with the SAME
 * evaluation path and diffs against the saved baseline.
 *
 * Expected diffs (documented, allowed):
 *   - removal of violations whose code is one of EXPECTED_REMOVAL_CODES,
 *     because the banned callout that triggered them was stripped;
 *   - verdict changes ONLY in the REJECT→PASS direction and ONLY for scenes
 *     whose every baseline violation was an expected removal.
 * Anything else = regression (exit 1).
 *   - lotf scenes: skipped, config no longer exists in the repo (documented).
 */

const rootDir = process.cwd();
const baseline = JSON.parse(fs.readFileSync(path.join(rootDir, 'audit/p1.5-benchmark/gate-results.baseline-p2.json'), 'utf8'));

const EXPECTED_REMOVAL_CODES = new Set(['GENERIC_TEMPLATE_TEXT', 'FORBIDDEN_GENERIC_TEXT', 'DOMAIN_LEAKAGE']);

const REP_IDS = [
  'scene-151', 'scene-262', 'scene-217', 'scene-221', 'scene-195',
  'scene-184', 'scene-37', 'scene-152', 'scene-236', 'scene-271',
];

const repConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'books/the-republic/config.antidote.json'), 'utf8'));

function evalScene(s) {
  const narration = s._narration || s.subtitle || s.text || '';
  const atom = {
    text: narration, subject: s._subject || null, action: null, object: null,
    relationship: null, concepts: [], abstraction: 'conceptual', visualNeed: narration,
  };
  const contract = createVisualContractFromAtom(atom, s.id);
  const r = evaluateSceneVisualContract(s, contract);
  return { gateVerdict: r.verdict, violations: r.violations, hardViolations: r.hardViolations };
}

const codeOf = (v) => String(v).split(':')[0].trim();
let regressions = 0;
let allowedDiffs = 0;
let skipped = 0;

console.log('═══ P1.5 benchmark regression (C2) ═══');

// lotf: documented skip
const lotfConfigPath = path.join(rootDir, 'books/lord-of-the-flies/config.antidote.json');
if (!fs.existsSync(lotfConfigPath)) {
  skipped += baseline.lotf.length;
  console.log(`  ~ SKIP ${baseline.lotf.length} lotf scene(s): books/lord-of-the-flies no longer exists in the repo (documented)`);
}

for (const base of baseline.republic) {
  const scene = repConfig.scenes.find((s) => s.id === base.sceneId);
  if (!scene) {
    console.log(`  ✗ REGRESSION ${base.sceneId}: scene missing from current config`);
    regressions++;
    continue;
  }
  const now = evalScene(scene);
  const baseV = new Set(base.violations || []);
  const nowV = new Set(now.violations);

  const added = [...nowV].filter((v) => !baseV.has(v));
  const removed = [...baseV].filter((v) => !nowV.has(v));

  const badAdded = added.filter((v) => true); // any NEW violation is a regression
  const badRemoved = removed.filter((v) => !EXPECTED_REMOVAL_CODES.has(codeOf(v)));
  const verdictFlip = base.gateVerdict !== now.gateVerdict;
  const allowedFlip = verdictFlip && base.gateVerdict === 'REJECT' && now.gateVerdict === 'PASS'
    && (base.violations || []).every((v) => EXPECTED_REMOVAL_CODES.has(codeOf(v)));

  if (badAdded.length || badRemoved.length || (verdictFlip && !allowedFlip)) {
    console.log(`  ✗ REGRESSION ${base.sceneId}: added=[${added}] removedNotAllowed=[${badRemoved}] verdict ${base.gateVerdict}→${now.gateVerdict}`);
    regressions++;
  } else if (added.length || removed.length || verdictFlip) {
    allowedDiffs++;
    console.log(`  ~ allowed diff ${base.sceneId}: removed=[${removed}]${verdictFlip ? ` verdict ${base.gateVerdict}→${now.gateVerdict}` : ''}`);
  } else {
    console.log(`  ✓ ${base.sceneId} identical`);
  }
}

console.log(`\nallowed diffs: ${allowedDiffs}, skipped: ${skipped}, regressions: ${regressions}`);
if (regressions > 0) {
  console.log('\n❌ P1.5 REGRESSION FAILED\n');
  process.exit(1);
}
console.log('\n✅ P1.5 REGRESSION OK — only documented forbidden-template removals differ\n');
process.exit(0);
