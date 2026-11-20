/**
 * P2.2 blind production sample selector.
 *
 * This is audit-only: it evaluates existing production scenes and emits a
 * reproducible PASS-only manifest. It deliberately does not mutate configs or
 * VisualContract rules.
 *
 * Usage: node scripts/p22-select-blind-sample.mjs --book=crime-and-punishment --count=25
 */
import fs from 'fs';
import path from 'path';
import { createVisualContractFromAtom, evaluateSceneVisualContract } from '../src/semantic/visualContract.ts';

const args = process.argv.slice(2);
const book = args.find((a) => a.startsWith('--book='))?.slice(7) || 'crime-and-punishment';
const count = Number(args.find((a) => a.startsWith('--count='))?.slice(8) || 25);
if (!Number.isInteger(count) || count < 20 || count > 30) {
  throw new Error('--count must be an integer from 20 to 30');
}

const configPath = path.join(process.cwd(), 'books', book, 'config.antidote.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const scenes = config.scenes || [];

// Reserve an evenly distributed stratum for every twenty consecutive scenes;
// the first PASS in each stratum is selected, then the remaining PASS scenes
// are taken in source order. This prevents a convenient all-intro sample.
const candidateRows = scenes.map((scene, sceneIndex) => {
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
  const contract = createVisualContractFromAtom(atom, scene.id || `scene-${sceneIndex}`);
  const evaluation = evaluateSceneVisualContract(scene, contract, config);
  return { sceneIndex, scene, narration, contract, evaluation };
});

const passing = candidateRows.filter((row) => row.evaluation.verdict === 'PASS');
const selected = [];
const selectedIndexes = new Set();
for (let start = 0; start < scenes.length && selected.length < count; start += 20) {
  const row = passing.find((candidate) => candidate.sceneIndex >= start && candidate.sceneIndex < start + 20);
  if (row) {
    selected.push(row);
    selectedIndexes.add(row.sceneIndex);
  }
}
for (const row of passing) {
  if (selected.length >= count) break;
  if (!selectedIndexes.has(row.sceneIndex)) {
    selected.push(row);
    selectedIndexes.add(row.sceneIndex);
  }
}
if (selected.length < count) {
  throw new Error(`Only ${selected.length} Gate PASS scenes available; required ${count}.`);
}

const outDir = path.join(process.cwd(), 'audit', 'p2.2-blind-production-sample');
fs.mkdirSync(outDir, { recursive: true });
const manifest = {
  audit: 'P2.2 Blind Production Sample',
  generatedAt: new Date().toISOString(),
  book,
  composition: `Antidote-${book}`,
  sampleCriteria: {
    source: 'Existing production config; book has no entries in P1.5 benchmark',
    gate: 'VisualContract PASS (score >= 60, no violations, no hard violations)',
    selection: 'PASS-only, deterministic stratified sample: first PASS per 20-scene block, then source order',
    count,
  },
  population: { scenes: scenes.length, gatePass: passing.length, gateReject: scenes.length - passing.length },
  scenes: selected.map((row, sampleIndex) => ({
    sampleIndex,
    sceneIndex: row.sceneIndex,
    id: row.scene.id,
    fromFrame: row.scene.fromFrame,
    durationFrames: row.scene.durationFrames,
    captureFrame: row.scene.fromFrame + Math.max(1, Math.floor(row.scene.durationFrames / 2)),
    narration: row.narration,
    gate: {
      verdict: row.evaluation.verdict,
      score: row.evaluation.finalScore,
      violations: row.evaluation.violations,
      hardViolations: row.evaluation.hardViolations,
    },
    image: `audit/p2.2-blind-production-sample/stills/${String(sampleIndex + 1).padStart(2, '0')}-${row.scene.id}.png`,
  })),
};
fs.writeFileSync(path.join(outDir, `${book}-manifest.json`), JSON.stringify(manifest, null, 2));
console.log(`Selected ${manifest.scenes.length}/${count} Gate PASS scenes from ${book}.`);
console.log(`Population: ${passing.length}/${scenes.length} PASS.`);
console.log(`Manifest: audit/p2.2-blind-production-sample/${book}-manifest.json`);
