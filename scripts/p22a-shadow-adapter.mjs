/**
 * P2.2a shadow adapter experiment.
 * Audit-only: reads existing Antidote configs, runs the real NarrativeAtom and
 * VisualIntent path, and compares the result to production scene metadata.
 * It never writes production configs or changes generation/gate behaviour.
 */
import fs from 'fs';
import path from 'path';
import { extractNarrativeAtom } from '../src/semantic/narrativeAtom.ts';
import { deriveVisualIntent } from '../src/semantic/visualIntent.ts';
import { createVisualContractFromAtom, evaluateSceneVisualContract } from '../src/semantic/visualContract.ts';

const ROOT = process.cwd();
// Discover current production configs at runtime. The workspace is actively
// shared by other agents, so a hard-coded historical book list would make a
// diagnosis silently stale or fail when an unfinished config is moved.
const BOOKS = fs.readdirSync(path.join(ROOT, 'books'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, 'books', entry.name, 'config.antidote.json')))
  .map((entry) => entry.name)
  .sort();
const OUT = path.join(ROOT, 'audit', 'p2.2a-pass-generation-diagnosis');
const TYPE_RULES = [
  ['action_kinetic', /kill|murder|strike|fall|drop|drag|fight|attack|seize|arrest|flee|crash|burn|smash/i],
  ['emotional', /fear|dread|grief|rage|humiliat|shame|terror|anxious|despair|love|jealous/i],
  ['causal', /because|when|therefore|leads? to|causes?|results? in|makes? .* (become|turn|fall)/i],
  ['contrast', /\bnot\b|instead|rather than|versus|\bvs\b|whereas|while|but|difference|contrast/i],
  ['structural', /mirror|analog|allegor|parallel|equivalent|reflect|same as|two .* one/i],
  ['abstract_reflective', /justice|soul|meaning|truth|idea|concept|freedom|power|identity|moral|philosoph/i],
];
const primaryViolation = (evaluation) => evaluation.hardViolations.some((v) => v.startsWith('MISSING_STRUCTURAL_EQUIVALENCE'))
  ? 'MISSING_STRUCTURAL_EQUIVALENCE'
  : evaluation.hardViolations.some((v) => v.startsWith('IDLE_ACTOR_WALLPAPER'))
    ? 'IDLE_ACTOR_WALLPAPER' : null;

function classifyType(text) {
  return TYPE_RULES.find(([, pattern]) => pattern.test(text))?.[0] || 'abstract_reflective';
}
function productionSupport(scene, intent) {
  const characters = Array.isArray(scene.characters) ? scene.characters : [];
  const props = [...(Array.isArray(scene.props) ? scene.props : []), scene.motif ? { type: typeof scene.motif === 'string' ? scene.motif : scene.motif.type } : null].filter(Boolean);
  const propTypes = props.map((p) => String(p.type || '').toLowerCase());
  const comparison = characters.length >= 2 && characters.some((c) => c.action !== 'idle') || propTypes.some((type) => /scale|mirror|split|versus|parallel|soul|analogy|equivalence|contrast|divide|diagram/.test(type));
  const structural = propTypes.some((type) => /diagram|card|split|contrast|sequence|analogy|mirror|scale|equivalence|flow|metamorphosis|tear/.test(type));
  const passive = characters.length === 1 && /^(talk|idle|walk|point)$/.test(characters[0]?.action || '') || characters.some((c) => c.action === 'idle');
  const needsComparison = intent.semanticRequirements.includes('two_distinct_comparative_elements');
  const needsFlow = intent.requiredActions.includes('depict_trigger_to_consequence_flow');
  const needsTension = intent.requiredActions.includes('visualize_internal_tension_or_rupture');
  return { characters: characters.map((c) => ({ role: c.role, action: c.action })), propTypes, comparison, structural, passive, needsComparison, needsFlow, needsTension };
}

const rows = [];
for (const book of BOOKS) {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'books', book, 'config.antidote.json'), 'utf8'));
  for (let index = 0; index < config.scenes.length; index++) {
    const scene = config.scenes[index];
    const narration = scene._narration || scene.subtitle || scene.text || '';
    // First evaluate against the existing P2.2 synthetic atom solely to select
    // the known blocked population; analysis below uses the real extractor.
    const synthetic = { text: narration, subject: scene._subject || null, action: null, object: null, relationship: null, concepts: [], abstraction: 'conceptual', visualNeed: narration };
    const baseline = evaluateSceneVisualContract(scene, createVisualContractFromAtom(synthetic, scene.id), config);
    const violation = primaryViolation(baseline);
    if (violation) rows.push({ book, config, scene, index, narration, violation, type: classifyType(narration) });
  }
}

// Exactly five examples per narration type. Book round-robin prevents one long
// config from defining a stratum; source order is only a per-stratum fallback.
const selected = [];
const used = new Set();
for (const [type] of TYPE_RULES) {
  for (let pick = 0; pick < 5; pick++) {
    const preferredBook = BOOKS[pick % BOOKS.length];
    const candidate = rows.find((row) => row.type === type && row.book === preferredBook && !used.has(`${row.book}:${row.index}`))
      || rows.find((row) => row.type === type && !used.has(`${row.book}:${row.index}`));
    if (candidate) { selected.push(candidate); used.add(`${candidate.book}:${candidate.index}`); }
  }
}

const results = [];
for (const row of selected) {
  const atom = await extractNarrativeAtom(row.narration, { bookTitle: row.config.meta?.title || row.book, author: row.config.meta?.author || '' });
  const intent = deriveVisualIntent(atom);
  const contract = createVisualContractFromAtom(atom, row.scene.id, undefined, intent);
  const realGate = evaluateSceneVisualContract(row.scene, contract, row.config);
  const support = productionSupport(row.scene, intent);
  let diagnosis;
  const atomIsEmpty = !atom.action && !atom.relationship && !atom.object && atom.concepts.length === 0;
  if (realGate.verdict === 'PASS') diagnosis = 'C';
  else if (intent.archetype === 'static_reflection' && intent.requiredActions.length === 0 && row.type !== 'abstract_reflective' && atomIsEmpty) diagnosis = 'B';
  else if (intent.archetype === 'static_reflection' && intent.requiredActions.length === 0) diagnosis = 'D';
  else diagnosis = 'A';
  results.push({ book: row.book, sceneId: row.scene.id, sceneIndex: row.index, type: row.type, baselineViolation: row.violation, narration: row.narration, atom, intent, metadata: support, realGate: { verdict: realGate.verdict, score: realGate.finalScore, hardViolations: realGate.hardViolations }, diagnosis });
}

const countBy = (key) => Object.fromEntries([...new Set(results.map((row) => row[key]))].map((value) => [value, results.filter((row) => row[key] === value).length]));
const output = { audit: 'P2.2a shadow adapter', generatedAt: new Date().toISOString(), method: 'Real NarrativeAtom extractor + VisualIntent compared with existing metadata; no production mutation.', sample: { total: results.length, byType: countBy('type'), byBaselineViolation: countBy('baselineViolation'), byDiagnosis: countBy('diagnosis') }, results };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'shadow-adapter.json'), JSON.stringify(output, null, 2));

const lines = [
  '# P2.2a shadow-adapter results', '',
  '**Audit-only.** Real `extractNarrativeAtom()` and `deriveVisualIntent()` were compared with existing production metadata. No planner, Gate, or config was changed.', '',
  '## Sample', '', `- Total: ${results.length}`, `- By narration type: ${Object.entries(output.sample.byType).map(([k,v]) => `${k}=${v}`).join(', ')}`, `- By P2.2 primary violation: ${Object.entries(output.sample.byBaselineViolation).map(([k,v]) => `${k}=${v}`).join(', ')}`, `- Diagnosis: ${Object.entries(output.sample.byDiagnosis).map(([k,v]) => `${k}=${v}`).join(', ')}`, '',
  '## Classification', '',
  '- **A**: real intent has a concrete requirement but current metadata does not represent it.',
  '- **B**: real atom/intent is materially empty for a non-static claim.',
  '- **C**: metadata meets real intent but the real-atom Gate rejects it.',
  '- **D**: real intent is static reflection; a different, deliberate visual strategy is needed.', '',
  '## Scene evidence', '',
  '| Book / scene | Type | P2.2 violation | Real intent | Existing metadata | A/B/C/D |', '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.book} / ${r.sceneId} | ${r.type} | ${r.baselineViolation} | ${r.intent.archetype}; ${r.intent.requiredActions.join(', ') || 'none'} | actions: ${r.metadata.characters.map((c) => c.action).join(', ') || 'none'}; props: ${r.metadata.propTypes.join(', ') || 'none'} | ${r.diagnosis} |`), '',
  'Full atom, intent, Gate, narration, and metadata evidence: `shadow-adapter.json`.'
];
fs.writeFileSync(path.join(OUT, 'SHADOW_RESULTS.md'), lines.join('\n') + '\n');
console.log(`P2.2a shadow sample: ${results.length} scenes → ${path.relative(ROOT, OUT)}`);
