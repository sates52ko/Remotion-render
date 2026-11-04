/**
 * scripts/semantic-benchmark-runner.js — Semantic Benchmark Suite Runner
 *
 * Runs 30 canonical test cases across the 10 failure modes:
 *   1. Structural Equivalence
 *   2. Contrast
 *   3. Transformation
 *   4. Cause / Effect
 *   5. Metaphor
 *   6. Historical Coherence
 *   7. Sensory Attribute Fidelity
 *   8. Narrative Voice Separation
 *   9. Outcome Polarity
 *  10. Domain Isolation
 *
 * Usage:
 *   node scripts/semantic-benchmark-runner.js
 *   npm run semantic:benchmark
 */

import fs from 'fs';
import path from 'path';
import { createVisualContractFromAtom, evaluateSceneVisualContract } from '../src/semantic/visualContract.ts';

const rootDir = process.cwd();
const benchPath = path.join(rootDir, 'audit', 'benchmark', 'semantic-benchmark-30.json');

if (!fs.existsSync(benchPath)) {
  console.error(`Benchmark dataset not found at ${benchPath}`);
  process.exit(1);
}

const benchmarkCases = JSON.parse(fs.readFileSync(benchPath, 'utf8'));

console.log(`================================================================================`);
console.log(`SEMANTIC BENCHMARK SUITE — 30 CANONICAL CASES ACROSS 10 COGNITIVE MODES`);
console.log(`================================================================================\n`);

const results = [];
let passedCount = 0;

for (const tc of benchmarkCases) {
  // Construct NarrativeAtom for test case
  const atom = {
    text: tc.narration,
    subject: null,
    action: null,
    object: null,
    relationship: null,
    concepts: [],
    abstraction: 'conceptual',
    visualNeed: tc.narration
  };

  // 1. Generate VisualContract (which internally derives VisualIntent)
  const contract = createVisualContractFromAtom(atom, tc.id);

  // 2. Evaluate Bad Fixture (Must REJECT)
  const badEval = evaluateSceneVisualContract(tc.badVisualFixture, contract);
  const badRejected = badEval.verdict === 'REJECT';

  // Check that at least one expected violation was caught
  const caughtExpectedViolation = tc.expectedViolations.some(ev => 
    badEval.violations.some(v => v.includes(ev)) || badEval.hardViolations.some(hv => hv.includes(ev))
  );

  // 3. Evaluate Good Fixture (Must have NO hard violations)
  const goodEval = evaluateSceneVisualContract(tc.goodVisualFixture, contract);
  const goodHasNoHardViolations = goodEval.hardViolations.length === 0;

  // Archetype & domain check
  const archetypeMatch = contract.intent.archetype === tc.expectedIntent.archetype;
  const domainMatch = contract.intent.domain === tc.expectedIntent.domain;

  const testPassed = badRejected && caughtExpectedViolation && goodHasNoHardViolations && archetypeMatch && domainMatch;

  if (testPassed) {
    passedCount++;
  }

  results.push({
    id: tc.id,
    category: tc.category,
    title: tc.title,
    narration: tc.narration,
    passed: testPassed,
    archetypeMatch,
    domainMatch,
    badRejected,
    caughtExpectedViolation,
    goodHasNoHardViolations,
    badScore: badEval.finalScore,
    goodScore: goodEval.finalScore,
    hardViolations: badEval.hardViolations,
    allViolations: badEval.violations
  });

  const icon = testPassed ? '✅' : '❌';
  console.log(`${icon} [${tc.id}] ${tc.category.toUpperCase()} — ${tc.title}`);
  console.log(`    Archetype: ${contract.intent.archetype} | Domain: ${contract.intent.domain}`);
  console.log(`    Bad Fixture: ${badEval.verdict} (${badEval.finalScore}/100) | Hard Violations: ${badEval.hardViolations.length}`);
  if (badEval.hardViolations.length > 0) {
    badEval.hardViolations.forEach(hv => console.log(`      ⚠️  ${hv}`));
  }
  console.log(`    Good Fixture: ${goodEval.verdict} (${goodEval.finalScore}/100) | Hard Violations: ${goodEval.hardViolations.length}\n`);
}

const passRate = ((passedCount / benchmarkCases.length) * 100).toFixed(1);

console.log(`================================================================================`);
console.log(`BENCHMARK SUMMARY: ${passedCount} / ${benchmarkCases.length} PASSED (${passRate}%)`);
console.log(`================================================================================\n`);

// Breakdown by category
const categories = [...new Set(benchmarkCases.map(tc => tc.category))];
console.log(`Category Breakdown:`);
for (const cat of categories) {
  const catCases = results.filter(r => r.category === cat);
  const catPassed = catCases.filter(r => r.passed).length;
  console.log(`  - ${cat.padEnd(28)}: ${catPassed} / ${catCases.length} (${((catPassed / catCases.length) * 100).toFixed(0)}%)`);
}

// Write JSON & Markdown report
const outDir = path.join(rootDir, 'audit', 'benchmark');
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({
  date: new Date().toISOString(),
  total: benchmarkCases.length,
  passed: passedCount,
  passRate: `${passRate}%`,
  results
}, null, 2));

let md = `# Semantic Benchmark Suite (30 Cases)\n\n`;
md += `**Date:** ${new Date().toISOString()}\n`;
md += `**Overall Score:** **${passedCount} / ${benchmarkCases.length} (${passRate}%)**\n\n`;

md += `### Category Breakdown\n\n`;
md += `| Category | Passed | Total | Rate |\n`;
md += `|---|---|---|---|\n`;
for (const cat of categories) {
  const catCases = results.filter(r => r.category === cat);
  const catPassed = catCases.filter(r => r.passed).length;
  md += `| \`${cat}\` | ${catPassed} | ${catCases.length} | ${((catPassed / catCases.length) * 100).toFixed(0)}% |\n`;
}

md += `\n### Case Details\n\n`;
md += `| ID | Category | Title | Bad Score | Good Score | Status | Caught Hard Violations |\n`;
md += `|---|---|---|---|---|---|---|\n`;

for (const r of results) {
  const status = r.passed ? '🟢 PASS' : '🔴 FAIL';
  const hvs = r.hardViolations.join('; ') || 'None';
  md += `| \`${r.id}\` | ${r.category} | ${r.title} | ${r.badScore}/100 | ${r.goodScore}/100 | ${status} | ${hvs} |\n`;
}

fs.writeFileSync(path.join(outDir, 'report.md'), md);
console.log(`\nReports generated:`);
console.log(`  - audit/benchmark/report.json`);
console.log(`  - audit/benchmark/report.md\n`);

if (passedCount < benchmarkCases.length) {
  process.exit(1);
}
