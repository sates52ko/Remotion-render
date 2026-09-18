#!/usr/bin/env node
/**
 * apply-chapters.js — copy an existing book's chapter marks into its Vox config.
 *
 * plan-meta now writes chapters straight into config.vox.json, but re-running it
 * on an already-published book would REGENERATE youtube-meta.json — throwing away
 * Claude's hand-refined titles/description/chapter labels. This script only reads
 * the finished books/<slug>/youtube-meta.json and copies its chapters across, so
 * the refined labels are exactly what ends up on screen.
 *
 * Chapter 0 sits at t=0 (the cold open owns that) and is never carded — it is
 * still copied so the progress rail can show the first tick.
 *
 * Usage:
 *   node scripts/apply-chapters.js --slug=the-frozen-river [--dry]
 */
const fs = require("fs");
const { abs, rel } = require("./lib/paths");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
if (!SLUG) {
  console.error("Kullanım: node scripts/apply-chapters.js --slug=<slug> [--dry]");
  process.exit(1);
}
const cfgAbs = abs.voxConfig(SLUG);
const metaAbs = abs.youtubeMeta(SLUG);
for (const [label, p] of [["config.vox.json", cfgAbs], ["youtube-meta.json", metaAbs]]) {
  if (!fs.existsSync(p)) { console.error(`❌ ${label} yok: ${p}`); process.exit(1); }
}
const cfg = JSON.parse(fs.readFileSync(cfgAbs, "utf8"));
const meta = JSON.parse(fs.readFileSync(metaAbs, "utf8"));
const fps = cfg.meta.fps || 30;

if (!Array.isArray(meta.chapters) || !meta.chapters.length) {
  console.error(`❌ ${rel.youtubeMeta(SLUG)} içinde chapters yok.`);
  process.exit(1);
}

const chapters = meta.chapters.map((c, i) => ({
  index: i,
  fromFrame: Math.round(c.t * fps),
  label: String(c.label || "").trim(),
  teaser: String(c.teaser || "").trim(),
}));

const fmt = (f) => {
  const s = Math.round(f / fps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
console.log(`\n══ BÖLÜMLER → ${SLUG}`);
chapters.forEach((c) =>
  console.log(`   ${fmt(c.fromFrame).padStart(6)}  ${String(c.index).padStart(2, "0")}  ${c.label}${c.index === 0 ? "   (kart gösterilmez — cold open)" : ""}`),
);
const noTeaser = chapters.filter((c) => c.index > 0 && !c.teaser).length;
if (noTeaser) console.log(`\n   ℹ ${noTeaser} bölümde teaser yok — kart sadece başlığı gösterir. youtube-meta.json'daki chapters[].teaser alanına bir merak sorusu yazarsan open loop olur.`);

if (args.dry) { console.log(`\n(--dry: dosya yazılmadı)`); process.exit(0); }
cfg.chapters = chapters;
fs.writeFileSync(cfgAbs, JSON.stringify(cfg, null, 2));
console.log(`\n✓ ${rel.voxConfig(SLUG)} → ${chapters.length} bölüm yazıldı`);
