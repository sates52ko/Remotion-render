#!/usr/bin/env node
/**
 * apply-phrases.js — lock hand-authored "phrase-that-pays" lines onto a book's
 * hero beats, from books/<slug>/phrases.json.
 *
 * The heuristic (phraseEmphasis) makes every beat's on-screen text meaningful,
 * but the PIVOTAL moments — the thesis, the reveal, the payoff — deserve an
 * authored editorial line ("ITS HOLIEST MASK", "ORKIDEH IS ROYA", "BE A PERSON")
 * the way the thumbnail hook is authored. Each phrase is keyed by TIMESTAMP (so it
 * survives a replan), mapped to the beat playing then, written to props.emphasis
 * and marked props.emphasisLocked=true so apply-emphasis never overwrites it.
 *
 * Timing/images/types are untouched (no replan).
 *
 * Usage: node scripts/apply-phrases.js --slug=martyr [--dry]
 */
const fs = require("fs");
const path = require("path");
const { abs, rel } = require("./lib/paths");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
if (!SLUG) { console.error("Kullanım: node scripts/apply-phrases.js --slug=<slug> [--dry]"); process.exit(1); }

const pPath = path.join(ROOT, "books", SLUG, "phrases.json");
if (!fs.existsSync(pPath)) { console.error(`❌ books/${SLUG}/phrases.json yok.`); process.exit(1); }
const phrases = (JSON.parse(fs.readFileSync(pPath, "utf8")).phrases || []);

const cfgAbs = abs.voxConfig(SLUG);
if (!fs.existsSync(cfgAbs)) { console.error(`❌ ${rel.voxConfig(SLUG)} yok.`); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgAbs, "utf8"));
const fps = cfg.meta.fps || 30;

const beatAt = (t) => {
  const f = t * fps;
  return cfg.beats.find((b) => b.fromFrame <= f && f < b.fromFrame + b.durationFrames)
    || cfg.beats.reduce((best, b) => (Math.abs(b.fromFrame - f) < Math.abs((best?.fromFrame ?? Infinity) - f) ? b : best), null);
};

let set = 0; const seenIds = new Set();
for (const { t, phrase } of phrases) {
  const b = beatAt(t);
  if (!b) { console.warn(`   ⚠ t=${t}s için beat bulunamadı`); continue; }
  if (seenIds.has(b.id)) console.warn(`   ⚠ ${b.id} birden çok phrase'e denk geldi (t=${t}s "${phrase}") — sonuncu geçerli`);
  seenIds.add(b.id);
  const words = String(phrase).toUpperCase().split(/\s+/).filter(Boolean).slice(0, 3);
  b.props = b.props || {};
  const mm = String(Math.floor(t / 60)).padStart(2, "0"), ss = String(t % 60).padStart(2, "0");
  console.log(`   ${mm}:${ss} → ${b.id} [${b.type}]  "${(b.props.emphasis || []).join(" ")}" ⇒ "${words.join(" ")}"`);
  b.props.emphasis = words;
  b.props.emphasisLocked = true;
  set++;
}

console.log(`\n══ PHRASE-THAT-PAYS → ${SLUG}  (${set}/${phrases.length} beat kilitlendi)`);
if (args.dry) { console.log("(--dry: dosya yazılmadı)"); process.exit(0); }
if (!set) process.exit(0);
fs.copyFileSync(cfgAbs, cfgAbs + ".bak");
fs.writeFileSync(cfgAbs, JSON.stringify(cfg, null, 2));
console.log(`\n✓ ${rel.voxConfig(SLUG)} güncellendi (yedek: .bak)`);
