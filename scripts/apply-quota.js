#!/usr/bin/env node
/**
 * apply-quota.js — retrofit the archetype spread onto an ALREADY-PLANNED book.
 *
 * Same reasoning as apply-coldopen.js: re-running plan-vox would discard
 * hand-authored art direction and orphan the generated Flux images (they are
 * keyed to beat id + type). This only RETYPES image-less `statement` beats, so
 * nothing upstream has to be regenerated.
 *
 * The rule itself lives in lib/beat-text.js, shared with plan-vox.
 *
 * Usage:
 *   node scripts/apply-quota.js --slug=the-frozen-river [--window=10] [--min=2] [--dry]
 */
const fs = require("fs");
const { abs, rel } = require("./lib/paths");
const { TEXTURE, applyQuota } = require("./lib/beat-text");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
if (!SLUG) {
  console.error("Kullanım: node scripts/apply-quota.js --slug=<slug> [--window=10] [--min=2] [--dry]");
  process.exit(1);
}
const cfgAbs = abs.voxConfig(SLUG);
if (!fs.existsSync(cfgAbs)) { console.error(`❌ ${rel.voxConfig(SLUG)} yok.`); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync(cfgAbs, "utf8"));
const before = cfg.beats.reduce((a, b) => ((a[b.type] = (a[b.type] || 0) + 1), a), {});
const beforeTexture = cfg.beats.filter((b) => TEXTURE.has(b.type)).length;

const opts = {};
if (args.window) opts.window = parseInt(args.window, 10);
if (args.min) opts.min = parseInt(args.min, 10);
const { promoted, short, texture } = applyQuota(cfg.beats, opts);

const after = cfg.beats.reduce((a, b) => ((a[b.type] = (a[b.type] || 0) + 1), a), {});
const n = cfg.beats.length;
const pct = (v) => `${((100 * v) / n).toFixed(0)}%`;

console.log(`\n══ ARKETİP KOTASI → ${SLUG}`);
console.log(`   önce : ${JSON.stringify(before)}`);
console.log(`   sonra: ${JSON.stringify(after)}`);
console.log(`\n   texture beat: ${beforeTexture} (${pct(beforeTexture)}) → ${texture} (${pct(texture)})`);
console.log(`   terfi: list ${promoted.list}, stat ${promoted.stat}, quote ${promoted.quote}`);
if (short) {
  console.log(`   ⚠ ${short} pencere doldurulamadı — o beat'lerde terfi edilecek içerik yok (sayı/liste/alıntı).`);
  console.log(`     Bu normal: kalan çeşitliliği StatementScene'in 3 layout varyantı taşıyor.`);
}
console.log(`   ℹ 'compare' burada üretilmez (2 görsel gerektirir) — art-direction'da işaretlenmeli.`);

if (promoted.list + promoted.stat + promoted.quote === 0) {
  console.log(`\n✓ Değişiklik yok — kota zaten karşılanıyor.`);
  process.exit(0);
}
if (args.dry) { console.log(`\n(--dry: dosya yazılmadı)`); process.exit(0); }
fs.copyFileSync(cfgAbs, cfgAbs + ".bak");
fs.writeFileSync(cfgAbs, JSON.stringify(cfg, null, 2));
console.log(`\n✓ ${rel.voxConfig(SLUG)} güncellendi  (yedek: ${rel.voxConfig(SLUG)}.bak)`);
