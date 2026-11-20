import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { FORBIDDEN_GENERIC_TEXTS } from '../src/semantic/visualContract.ts';

/**
 * P2.0c guard — the cleaned generator must never emit a banned template again,
 * and no production config may contain one.
 *
 *   1. every literal in scripts/lib/antidote-semantic-director.js
 *      (CONCEPT_ANCHORS + deriveComplementaryPunch fallbacks) is checked
 *      against FORBIDDEN_GENERIC_TEXTS;
 *   2. deriveComplementaryPunch is fuzzed over representative narrations and
 *      must never return a banned string;
 *   3. every config.antidote.json in books/ is scanned: 0 banned callouts;
 *   4. the export contract itself (FORBIDDEN_GENERIC_TEXTS non-empty) —
 *      the render gate depends on it.
 *
 * Exit 0 = clean, 1 = banned template present somewhere.
 */

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { deriveComplementaryPunch } = require(path.join(rootDir, 'scripts/lib/antidote-semantic-director.js'));

let failed = 0;
const assert = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : ' — ' + (detail || '')}`);
  if (!ok) failed++;
};

console.log('═══ P2.0c Forbidden Template Guard ═══');

assert('FORBIDDEN_GENERIC_TEXTS exported and non-empty', FORBIDDEN_GENERIC_TEXTS.size > 0, 'empty set');

// 1. static scan of the generator source
{
  const src = fs.readFileSync(path.join(rootDir, 'scripts/lib/antidote-semantic-director.js'), 'utf8');
  const hits = [...FORBIDDEN_GENERIC_TEXTS].filter((t) => src.toUpperCase().includes(t.toUpperCase()));
  assert('generator source contains no banned literal', hits.length === 0, `found: ${hits.join(', ')}`);
}

// 2. runtime fuzz of deriveComplementaryPunch
{
  const narrations = [
    'anger rises and the room screams back',
    'a fire spreads through the emergency exits',
    'the conscious mind thinks and thinks again',
    'your boss and the CEO set the hierarchy',
    'a new job and a promotion at the workplace',
    'you scroll the phone app and get distracted',
    'a small daily habit routine compounds',
    'people save money and invest for wealth',
    'we delay until tomorrow and procrastinate',
    'failure and every mistake you lose',
    'ego and pride defend the status',
    'too fast, hurry rush, now slow down',
    'not what you expected at all',
    'everyone and all people agree',
    'the key truth and the real secret',
    'a completely neutral sentence with no anchors',
  ];
  const callouts = [
    'ANGER', 'FIRE', 'THINKING', 'BOSS', 'JOB', 'SCROLL', 'HABIT',
    'MONEY', 'DELAY', 'FAILURE', 'EGO', 'SPEED', 'ALWAYS', 'EVERYONE',
    'SECRET', 'NOTHING', 'THE SAME WORDS AS THE VO', 'repeat repeat repeat',
  ];
  const banned = [];
  for (const n of narrations) {
    for (const c of callouts) {
      const out = deriveComplementaryPunch(n, c);
      if (out && FORBIDDEN_GENERIC_TEXTS.has(String(out).toUpperCase().trim())) {
        banned.push(`(${n.slice(0, 20)}…, ${c}) → ${out}`);
      }
    }
  }
  assert(`fuzz (${narrations.length}×${callouts.length}) never returns a banned template`, banned.length === 0, banned.slice(0, 3).join(' | '));
}

// 3. every production config is free of banned callouts
{
  const booksDir = path.join(rootDir, 'books');
  const offenders = [];
  let scanned = 0;
  for (const d of fs.readdirSync(booksDir, { withFileTypes: true })) {
    const cfgPath = path.join(booksDir, d.name, 'config.antidote.json');
    if (!d.isDirectory() || !fs.existsSync(cfgPath)) continue;
    scanned++;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    for (const scene of cfg.scenes || []) {
      for (const t of scene.texts || []) {
        if (FORBIDDEN_GENERIC_TEXTS.has(String(t.text ?? '').toUpperCase().trim())) {
          offenders.push(`${d.name}/${scene.id}: ${t.text}`);
        }
      }
    }
  }
  assert(`all ${scanned} book config(s) contain 0 banned callouts`, offenders.length === 0, offenders.slice(0, 3).join(' | '));
}

console.log(`\n═══ ${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} ═══`);
process.exit(failed === 0 ? 0 : 1);
