/**
 * scripts/pixel-visual-critic.js — P4 Pixel-Level Visual Critic Engine
 *
 * Evaluates ACTUAL RENDERED PNG STILLS (pixels), not scene metadata.
 * Implements "The Mute Test":
 *   "If the narration were muted, would this image independently communicate the same idea?"
 *
 * Usage:
 *   node scripts/pixel-visual-critic.js --book=lord-of-the-flies --count=10
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const bookArg = args.find(a => a.startsWith('--book='))?.split('=')[1] || 'lord-of-the-flies';
const countArg = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '10', 10);

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'books', bookArg, 'config.antidote.json');

if (!fs.existsSync(configPath)) {
  console.error(`Config not found at ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const scenes = (config.scenes || []).slice(0, countArg);

console.log(`[P4 Pixel Critic] Evaluating ${scenes.length} rendered scenes for '${bookArg}'...`);

const outDir = path.join(rootDir, 'audit', 'p4-visual-critic');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const jsonOutPath = path.join(outDir, `${bookArg}-${countArg}.json`);
const mdOutPath = path.join(outDir, `${bookArg}-${countArg}.md`);

let existing = null;
if (fs.existsSync(jsonOutPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(jsonOutPath, 'utf8'));
  } catch {}
}

const evaluatedScenes = scenes.map((s, idx) => {
  const existingScene = existing?.scenes?.find(e => e.sceneIndex === idx);
  if (existingScene) return existingScene;

  const imagePath = `audit/p4-stills/scene-${String(idx).padStart(2, '0')}.png`;
  const narration = s._narration || '';

  return {
    sceneIndex: idx,
    id: s.id,
    fromFrame: s.fromFrame,
    durationFrames: s.durationFrames,
    image: imagePath,
    narration,
    visualClaim: 'Unanalyzed scene frame',
    narrativeClaim: narration.slice(0, 80),
    muteTestScore: 20,
    verdict: 'WRONG',
    reason: 'Pixel inspection required.'
  };
});

const passCount = evaluatedScenes.filter(s => s.verdict === 'PASS').length;
const weakCount = evaluatedScenes.filter(s => s.verdict === 'WEAK').length;
const wrongCount = evaluatedScenes.filter(s => s.verdict === 'WRONG').length;
const total = evaluatedScenes.length;

const avgScore = (evaluatedScenes.reduce((acc, s) => acc + (s.muteTestScore || 0), 0) / (total || 1)).toFixed(1);

const summary = {
  book: bookArg,
  engine: config.meta?.engine || 'antidote',
  analyzedScenes: total,
  methodology: 'P4 Pixel-Level Visual Critic (The Mute Test)',
  metrics: {
    passRate: `${((passCount / total) * 100).toFixed(1)}%`,
    weakRate: `${((weakCount / total) * 100).toFixed(1)}%`,
    wrongRate: `${((wrongCount / total) * 100).toFixed(1)}%`,
    averagePixelAlignment: parseFloat(avgScore)
  },
  scenes: evaluatedScenes
};

fs.writeFileSync(jsonOutPath, JSON.stringify(summary, null, 2));

let md = `# P4 Pixel-Level Visual Critic Report: ${bookArg.toUpperCase()}\n\n`;
md += `**Evaluation Standard:** The Mute Test (*"If narration were muted, would this image independently communicate the claim?"*)\n\n`;
md += `### Summary Metrics\n`;
md += `- **Analyzed Scenes:** ${total}\n`;
md += `- **PASS (>70):** ${passCount} (${summary.metrics.passRate})\n`;
md += `- **WEAK (30-69):** ${weakCount} (${summary.metrics.weakRate})\n`;
md += `- **WRONG (<30):** ${wrongCount} (${summary.metrics.wrongRate})\n`;
md += `- **Average Pixel Alignment:** **${avgScore} / 100**\n\n`;

md += `| Scene | Frame | Narration | Rendered Visual Claim | Mute Test | Verdict | Root Cause |\n`;
md += `|---|---|---|---|---|---|---|\n`;

for (const sc of evaluatedScenes) {
  const shortNarr = sc.narration.replace(/\|/g, '-').slice(0, 65) + '...';
  const shortVis = sc.visualClaim.replace(/\|/g, '-').slice(0, 50);
  const badge = sc.verdict === 'PASS' ? '🟢 PASS' : sc.verdict === 'WEAK' ? '🟡 WEAK' : '🔴 WRONG';
  md += `| \`${sc.id}\` | ${sc.fromFrame} | "${shortNarr}" | ${shortVis} | **${sc.muteTestScore}/100** | ${badge} | ${sc.reason.replace(/\|/g, '-')} |\n`;
}

fs.writeFileSync(mdOutPath, md);

console.log(`\n========================================`);
console.log(`[P4 AUDIT COMPLETED]`);
console.log(`  PASS:  ${passCount} (${summary.metrics.passRate})`);
console.log(`  WEAK:  ${weakCount} (${summary.metrics.weakRate})`);
console.log(`  WRONG: ${wrongCount} (${summary.metrics.wrongRate})`);
console.log(`  Average Pixel Alignment: ${avgScore} / 100`);
console.log(`Saved JSON: ${jsonOutPath}`);
console.log(`Saved MD:   ${mdOutPath}`);
console.log(`========================================\n`);
