/**
 * P0 non-render verification. Replays the 22 P2.2a A diagnoses through the
 * adapter's emitted minimum metadata, then evaluates the unchanged Gate.
 * This intentionally never edits production configs or renders pixels.
 */
import fs from 'fs';
import path from 'path';
import { createVisualContractFromAtom, evaluateSceneVisualContract } from '../src/semantic/visualContract.ts';
import adapter from './lib/director-adapter.js';

const root = process.cwd();
const source = JSON.parse(fs.readFileSync(path.join(root, 'audit/p2.2a-pass-generation-diagnosis/shadow-adapter.json'), 'utf8'));
const cases = source.results.filter((row) => row.diagnosis === 'A');

function materialize(row, result) {
  const direction = result.override || {};
  const cast = direction.cast || { count: row.metadata.characters.length, roles: [] };
  const original = row.metadata.characters[0]?.action || 'talk';
  return {
    id: `${row.book}-${row.sceneId}`,
    shot: direction.shot || 'medium',
    ...(direction.diagram ? { diagram: direction.diagram } : {}),
    characters: Array.from({ length: cast.count || 0 }, (_, index) => ({
      role: cast.roles?.[index] || (index === 0 ? 'protagonist' : 'foil'),
      action: index === 0 ? original : (cast.secondaryAction || 'idle'),
    })),
    props: direction.props || [],
    texts: [],
  };
}

const evidence = cases.map((row) => {
  // The direction here deliberately resembles the deficient production shape:
  // the test asks whether the adapter supplies only the missing semantic floor.
  const direction = { shot: 'medium', cast: { count: row.metadata.characters.length, roles: [] }, props: [] };
  const result = adapter.buildDirectorOverrides({ intent: row.intent, direction });
  const scene = materialize(row, result);
  const contract = createVisualContractFromAtom(row.atom, scene.id, undefined, row.intent);
  const gate = evaluateSceneVisualContract(scene, contract);
  const semanticViolations = gate.hardViolations.filter((violation) =>
    /MISSING_STRUCTURAL_EQUIVALENCE|IDLE_ACTOR_WALLPAPER/.test(violation),
  );
  return {
    book: row.book, sceneId: row.sceneId, archetype: row.intent.archetype,
    reason: result.reason, applied: !!result.override, verdict: gate.verdict,
    semanticViolations, hardViolations: gate.hardViolations,
  };
});

// P0 verifies that required grammar reaches metadata. Overall score remains a
// later P2.2 concern because this no-render harness deliberately omits scene
// copy, palette, and other non-semantic production signals.
const failed = evidence.filter((row) => row.semanticViolations.length > 0 || !row.applied);
const output = { audit: 'P0 Director Adapter semantic-floor verification', total: evidence.length, semanticFloorMet: evidence.length - failed.length, failed: failed.length, evidence };
const out = path.join(root, 'audit/p2.2a-pass-generation-diagnosis/director-adapter-verification.json');
fs.writeFileSync(out, JSON.stringify(output, null, 2) + '\n');
console.log(`P0 adapter semantic floor: ${output.semanticFloorMet}/${output.total} critical grammar requirements met → ${path.relative(root, out)}`);
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2));
  process.exitCode = 1;
}
