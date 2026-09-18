import fs from 'fs';
import path from 'path';
import { createVisualContractFromAtom, evaluateSceneVisualContract } from '../src/semantic/visualContract.ts';

const rootDir = process.cwd();

// 1. Lord of the Flies
const lotfConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'books/lord-of-the-flies/config.antidote.json'), 'utf8'));
const lotfScenes = lotfConfig.scenes.slice(0, 10);

// 2. The Republic
const repConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'books/the-republic/config.antidote.json'), 'utf8'));
const targetRepIds = [
  'scene-151', 'scene-262', 'scene-217', 'scene-221', 'scene-195',
  'scene-184', 'scene-37', 'scene-152', 'scene-236', 'scene-271'
];
const repScenes = targetRepIds.map(id => repConfig.scenes.find(s => s.id === id));

function evalScenes(bookSlug, scenes) {
  return scenes.map((s, idx) => {
    const narration = s._narration || s.subtitle || s.text || '';
    const atom = {
      text: narration,
      subject: s._subject || null,
      action: null,
      object: null,
      relationship: null,
      concepts: [],
      abstraction: 'conceptual',
      visualNeed: narration,
    };
    const contract = createVisualContractFromAtom(atom, s.id);
    const result = evaluateSceneVisualContract(s, contract);
    return {
      book: bookSlug,
      sceneId: s.id,
      sceneIndex: idx,
      narration,
      gateVerdict: result.verdict, // 'PASS' | 'REJECT'
      gateScore: result.score,
      hardViolations: result.hardViolations,
      violations: result.violations,
      intentArchetype: contract.intent.archetype,
      intentDomain: contract.intent.domain,
    };
  });
}

const lotfGateResults = evalScenes('lord-of-the-flies', lotfScenes);
const repGateResults = evalScenes('the-republic', repScenes);

const allGateResults = {
  lotf: lotfGateResults,
  republic: repGateResults,
};

fs.writeFileSync(path.join(rootDir, 'audit/p1.5-benchmark/gate-results.json'), JSON.stringify(allGateResults, null, 2));
console.log('Saved gate-results.json successfully!');
