import fs from 'fs';
import path from 'path';
import { createVisualContractFromAtom, evaluateSceneVisualContract, FORBIDDEN_GENERIC_TEXTS } from '../src/semantic/visualContract.ts';

/**
 * P2.1 — Semantic Text Gate (production enforcement runner).
 *
 * Distinct from scripts/evaluate-gate-p15.mjs: that file is the historical
 * hardcoded 2-book benchmark (report-only, never wired to production). This
 * runner takes an arbitrary --slug and exits non-zero, so render.js can use
 * it as a real gate.
 *
 * Enforcement policy (P2.1 initial):
 *   - enforced codes   : --codes, default FORBIDDEN_GENERIC_TEXT (hard fail)
 *   - everything else  : report-only (collected in the audit file, exit stays 0)
 *
 * Usage:
 *   node scripts/gate-p15.mjs --slug=<slug>                # enforce defaults
 *   node scripts/gate-p15.mjs --slug=<slug> --mode=report  # never fail
 *   node scripts/gate-p15.mjs --slug=<slug> --codes=A,B    # override codes
 *
 * Exit 0 = no enforced violation (or --mode=report), 1 = enforced violation
 * or unreadable input (fail closed).
 */

const rootDir = process.cwd();
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; })
);

const slug = args.slug ? String(args.slug) : null;
if (!slug) {
  console.error('Usage: node scripts/gate-p15.mjs --slug=<slug> [--mode=enforce|report] [--codes=CODE1,CODE2]');
  process.exit(1);
}

const mode = args.mode === 'report' ? 'report' : 'enforce';
const enforcedCodes = String(args.codes || 'FORBIDDEN_GENERIC_TEXT')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Fail closed on unreadable input.
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(rootDir, 'books', slug, 'config.antidote.json'), 'utf8'));
} catch (error) {
  console.error(`gate-p15: cannot read config for '${slug}': ${error.message}`);
  process.exit(1);
}

const codeOf = (violation) => String(violation).split(':')[0].trim();

const perScene = [];
const enforcedHits = [];
const reportOnly = new Map();

for (const scene of config.scenes || []) {
  const narration = scene._narration || scene.subtitle || scene.text || '';
  const atom = {
    text: narration,
    subject: scene._subject || null,
    action: null,
    object: null,
    relationship: null,
    concepts: [],
    abstraction: 'conceptual',
    visualNeed: narration,
  };
  const contract = createVisualContractFromAtom(atom, scene.id);
  const result = evaluateSceneVisualContract(scene, contract);

  const sceneEnforced = [];
  // result.violations contains soft + hard entries (hard are merged in).
  for (const v of result.violations || []) {
    const code = codeOf(v);
    if (enforcedCodes.includes(code)) {
      sceneEnforced.push(v);
      enforcedHits.push({ sceneId: scene.id, code, violation: v });
    } else {
      reportOnly.set(code, (reportOnly.get(code) || 0) + 1);
    }
  }
  if (sceneEnforced.length) {
    perScene.push({ sceneId: scene.id, enforced: sceneEnforced });
  }
}

const auditDir = path.join(rootDir, 'audit', 'p15-enforcement');
fs.mkdirSync(auditDir, { recursive: true });
const audit = {
  slug,
  mode,
  enforcedCodes,
  forbiddenTemplateCount: FORBIDDEN_GENERIC_TEXTS.size,
  scenes: (config.scenes || []).length,
  scenesWithEnforcedViolations: perScene.length,
  enforcedViolations: enforcedHits,
  reportOnlyCounts: Object.fromEntries(reportOnly),
  generatedAt: new Date().toISOString(),
};
const outPath = path.join(auditDir, `${slug}.json`);
fs.writeFileSync(outPath, JSON.stringify(audit, null, 2) + '\n');

console.log(`gate-p15 [${mode}] ${slug}: ${(config.scenes || []).length} scenes, ${enforcedHits.length} enforced violation(s), report-only: ${JSON.stringify(audit.reportOnlyCounts)}`);
console.log(`  audit → ${path.relative(rootDir, outPath)}`);
for (const h of enforcedHits.slice(0, 10)) console.log(`  ENFORCED ${h.sceneId}: ${h.violation}`);

if (mode === 'enforce' && enforcedHits.length > 0) {
  console.error(`❌ gate-p15: ${enforcedHits.length} enforced violation(s) (codes: ${enforcedCodes.join(', ')})`);
  process.exit(1);
}
process.exit(0);
