/**
 * P0 non-render verification. Replays the 22 P2.2a A diagnoses through the
 * adapter's emitted minimum metadata, then evaluates the unchanged Gate.
 * This intentionally never edits production configs or renders pixels.
 */
import fs from 'fs';
import path from 'path';
import { createVisualContractFromAtom, evaluateSceneVisualContract } from '../src/semantic/visualContract.ts';
import adapter from './lib/director-adapter.js';
import screenText from './lib/screen-text.js';

const root = process.cwd();
const source = JSON.parse(fs.readFileSync(path.join(root, 'audit/p2.2a-pass-generation-diagnosis/shadow-adapter.json'), 'utf8'));
const cases = source.results.filter((row) => row.diagnosis === 'A');
const bFixtures = source.results.filter((row) => row.diagnosis === 'B');
const dFixtures = source.results.filter((row) => row.diagnosis === 'D');
const expectedGrammar = {
  contrast: 'comparison',
  allegory_equivalence: 'two_domain_comparison',
  cause_effect: 'cause_effect_flow',
  character_psychology: 'internal_tension',
};

function materialize(row, result) {
  const direction = result.override || {};
  const cast = direction.cast || { count: row.metadata.characters.length, roles: [] };
  const original = row.metadata.characters[0]?.action || 'talk';
  const payload = result.semanticPayload;
  const diagram = direction.diagram && payload?.kind === 'flow_labels'
    ? { ...direction.diagram, labels: [payload.triggerLabel, payload.consequenceLabel] }
    : direction.diagram && payload?.kind === 'internal_tension_labels'
      ? { ...direction.diagram, labels: [payload.internalPoleA, payload.internalPoleB] }
      : direction.diagram;
  const texts = payload?.kind === 'comparison_labels'
    ? [{ text: payload.leftLabel, x: 470, y: 250 }, { text: payload.rightLabel, x: 1450, y: 250 }]
    : payload?.kind === 'two_domain_labels'
      ? [{ text: payload.sourceLabel, x: 470, y: 250 }, { text: payload.targetLabel, x: 1450, y: 250 }]
      : [];
  return {
    id: `${row.book}-${row.sceneId}`,
    shot: direction.shot || 'medium',
    ...(direction.semanticGrammar ? { semanticGrammar: direction.semanticGrammar } : {}),
    ...(diagram ? { diagram } : {}),
    characters: Array.from({ length: cast.count || 0 }, (_, index) => ({
      role: cast.roles?.[index] || (index === 0 ? 'protagonist' : 'foil'),
      action: index === 0 ? original : (cast.secondaryAction || 'idle'),
    })),
    props: direction.props || [],
    texts,
  };
}

const evidence = cases.map((row) => {
  // The direction here deliberately resembles the deficient production shape:
  // the test asks whether the adapter supplies only the missing semantic floor.
  const direction = { shot: 'medium', cast: { count: row.metadata.characters.length, roles: [] }, props: [] };
  const result = adapter.buildDirectorOverrides({ intent: row.intent, atom: row.atom, direction });
  const scene = materialize(row, result);
  const contract = createVisualContractFromAtom(row.atom, scene.id, undefined, row.intent);
  const gate = evaluateSceneVisualContract(scene, contract);
  const semanticViolations = gate.hardViolations.filter((violation) =>
    /MISSING_STRUCTURAL_EQUIVALENCE|IDLE_ACTOR_WALLPAPER/.test(violation),
  );
  return {
    book: row.book, sceneId: row.sceneId, archetype: row.intent.archetype,
    reason: result.reason, applied: !!result.override, verdict: gate.verdict,
    grammar: result.override?.semanticGrammar?.kind || null,
    payload: result.semanticPayload,
    renderedPayload: scene.diagram?.labels || scene.texts.map((text) => text.text),
    provenanceAttached: Boolean(result.provenance &&
      Array.isArray(result.provenance.forbiddenTropes) &&
      Array.isArray(result.provenance.semanticRequirements) &&
      result.provenance.requiredAttributes),
    semanticViolations, hardViolations: gate.hardViolations,
  };
});

// P0 verifies that required grammar reaches metadata. Overall score remains a
// later P2.2 concern because this no-render harness deliberately omits scene
// copy, palette, and other non-semantic production signals.
const bEvidence = bFixtures.map((row) => {
  const result = adapter.buildDirectorOverrides({ intent: row.intent, atom: row.atom, direction: { shot: 'medium', cast: { count: 1 }, props: [] } });
  return { book: row.book, sceneId: row.sceneId, applied: !!result.override, reason: result.reason };
});
const dEvidence = dFixtures.map((row) => {
  const direction = { shot: 'insert', cast: { count: 0, crowd: 0, roles: [] }, props: [] };
  const result = adapter.buildDirectorOverrides({ intent: row.intent, atom: row.atom, direction });
  const finalDirection = adapter.applyDirectorOverrides(direction, result);
  return { book: row.book, sceneId: row.sceneId, applied: !!result.override, presenterFallback: (finalDirection.cast?.count || 0) > 0 };
});
// 2026-09-23 (screen-text gate): the adapter no longer invents a floor when the
// narration states no readable pair. A case is correct EITHER as a silent
// no-floor (payload null, nothing applied) OR as an applied floor whose grammar
// matches and whose labels pass the shared screen-text check. The pre-change
// run forced a payload on all 22 cases — P0.2 had already shown 10/22 of those
// were garbage ("IDEAS SOME GRAND U").
const silent = (row) => !row.payload && !row.applied;
const labelsOk = (row) => row.renderedPayload.length === 2 && row.renderedPayload.every((l) => screenText.isLabel(l));
const grammarFailures = evidence.filter((row) => !silent(row) &&
  (row.grammar !== expectedGrammar[row.archetype] || !row.provenanceAttached || !row.payload || !labelsOk(row)));
const failed = evidence.filter((row) => !silent(row) && (row.semanticViolations.length > 0 || !row.applied)).concat(grammarFailures);
const bFailures = bEvidence.filter((row) => row.applied);
const dFailures = dEvidence.filter((row) => row.applied || row.presenterFallback);
const output = {
  audit: 'P0 Director Adapter semantic-floor verification',
  total: evidence.length,
  semanticFloorMet: evidence.length - failed.length,
  floorApplied: evidence.filter((row) => row.applied).length,
  silentNoPayload: evidence.filter(silent).length,
  failed: failed.length,
  grammarCounts: evidence.reduce((counts, row) => ({ ...counts, [row.grammar]: (counts[row.grammar] || 0) + 1 }), {}),
  bFixtures: { total: bEvidence.length, unchanged: bEvidence.length - bFailures.length, evidence: bEvidence },
  dFixtures: { total: dEvidence.length, noPresenterFallback: dEvidence.length - dFailures.length, evidence: dEvidence },
  evidence,
};
const out = path.join(root, 'audit/p2.2a-pass-generation-diagnosis/director-adapter-verification.json');
fs.writeFileSync(out, JSON.stringify(output, null, 2) + '\n');
console.log(`P0 adapter semantic floor: ${output.semanticFloorMet}/${output.total} correct (${output.floorApplied} floors with readable labels, ${output.silentNoPayload} silent — no readable pair); B unchanged ${output.bFixtures.unchanged}/${output.bFixtures.total}; D no presenter fallback ${output.dFixtures.noPresenterFallback}/${output.dFixtures.total} → ${path.relative(root, out)}`);
if (failed.length || bFailures.length || dFailures.length) {
  console.error(JSON.stringify({ failed, bFailures, dFailures }, null, 2));
  process.exitCode = 1;
}
