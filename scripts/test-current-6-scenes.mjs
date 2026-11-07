import fs from 'fs';
import path from 'path';
import { createVisualContractFromAtom, evaluateSceneVisualContract } from '../src/semantic/visualContract.ts';

const lotf = JSON.parse(fs.readFileSync('books/lord-of-the-flies/config.antidote.json', 'utf8'));
const targetIds = ['scene-12', 'scene-80', 'scene-86', 'scene-92', 'scene-182', 'scene-190'];

console.log('--- Current Evaluation of the 6 False Accept scenes ---');
for (const id of targetIds) {
  const s = lotf.scenes.find(sc => sc.id === id);
  const narration = s._narration || s.subtitle || s.text || '';
  const atom = { text: narration, subject: s._subject || null, action: null, object: null, relationship: null, concepts: [], abstraction: 'conceptual', visualNeed: narration };
  const contract = createVisualContractFromAtom(atom, s.id);
  const res = evaluateSceneVisualContract(s, contract);
  console.log(id + ': verdict=' + res.verdict + ', finalScore=' + res.finalScore + ', hardViolations=' + JSON.stringify(res.hardViolations));
}
