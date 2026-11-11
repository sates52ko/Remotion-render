#!/usr/bin/env node
/**
 * apply-emphasis.js — recompute on-screen EMPHASIS for an ALREADY-PLANNED book.
 *
 * The emphasis words are the big text on ~94% of beats. The old heuristic picked
 * scattered high-scoring words (and gave every capitalised token a bonus, so ASR
 * sentence-openers like "It's"/"Let" won) → garbage like "IT'S LET". The rule now
 * lives in lib/beat-text.js (phraseEmphasis) and picks the single most salient
 * CONTIGUOUS phrase. This retrofits that onto a finished config WITHOUT replanning
 * (same reasoning as apply-quota / apply-coldopen: a replan discards hand art
 * direction and orphans Flux images keyed to beat id+type).
 *
 * Only beat.props.emphasis is rewritten. Timing, types, images, captions untouched.
 * Beats whose emphasis was hand-authored can be protected with props.emphasisLocked.
 *
 * Usage:
 *   node scripts/apply-emphasis.js --slug=martyr [--dry] [--show=20]
 */
const fs = require("fs");
const { abs, rel } = require("./lib/paths");
const { phraseEmphasis } = require("./lib/beat-text");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
if (!SLUG) {
  console.error("Kullanım: node scripts/apply-emphasis.js --slug=<slug> [--dry] [--show=20]");
  process.exit(1);
}
const cfgAbs = abs.voxConfig(SLUG);
if (!fs.existsSync(cfgAbs)) { console.error(`❌ ${rel.voxConfig(SLUG)} yok.`); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync(cfgAbs, "utf8"));
const show = args.show ? parseInt(args.show, 10) : 16;
let changed = 0, locked = 0, empty = 0;
const samples = [];

for (const b of cfg.beats) {
  const p = b.props || (b.props = {});
  if (p.emphasisLocked) { locked++; continue; }
  const text = String(p.text || "");
  if (!text.trim()) continue;
  // match plan-vox: list beats want a single phrase, others up to a 3-word phrase
  const n = b.type === "list" ? 1 : 2;
  const next = phraseEmphasis(text, { max: n === 1 ? 2 : 3, want: n === 1 ? 1 : 2 }).slice(0, 3);
  if (!next.length) { empty++; continue; }
  const before = (p.emphasis || []).join(" ");
  const after = next.join(" ");
  if (before !== after) {
    if (samples.length < show) samples.push({ i: b.id, before, after, txt: text.slice(0, 70) });
    p.emphasis = next;
    changed++;
  }
}

console.log(`\n══ EMPHASIS YENİLE → ${SLUG}  (${cfg.beats.length} beat)`);
console.log(`   değişen: ${changed} · kilitli(elle): ${locked} · boş(atlandı): ${empty}`);
if (samples.length) {
  console.log(`\n   örnekler:`);
  for (const s of samples) console.log(`   ${s.i}: "${s.before}" → "${s.after}"   ⟵ ${s.txt}`);
}
if (!changed) { console.log(`\n✓ Değişiklik yok.`); process.exit(0); }
if (args.dry) { console.log(`\n(--dry: dosya yazılmadı)`); process.exit(0); }
fs.copyFileSync(cfgAbs, cfgAbs + ".bak");
fs.writeFileSync(cfgAbs, JSON.stringify(cfg, null, 2));
console.log(`\n✓ ${rel.voxConfig(SLUG)} güncellendi  (yedek: ${rel.voxConfig(SLUG)}.bak)`);
