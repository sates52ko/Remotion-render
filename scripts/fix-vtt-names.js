#!/usr/bin/env node
/**
 * fix-vtt-names.js — normalize ASR name misspellings in the RAW VTT, BEFORE planning.
 *
 * Why this exists (and why it is not fix-names.js): the YouTube auto-caption VTT
 * garbles proper nouns ("Flannry O' Conor", "Holga", "Shiflet"). Both planners copy
 * that text verbatim into on-screen emphasis + captions, so the errors ship on
 * screen. `fix-names.js` repairs them AFTERWARDS, but only for Vox — it hard-requires
 * `config.vox.json`, so an Antidote book had no fix at all. Fixing the SOURCE instead
 * is engine-agnostic and needs no retrofit: plan from correct names and every
 * downstream artifact (config, clean.vtt, chapters, meta, thumbnail) is right by
 * construction.
 *
 * Reads the same per-book map as fix-names.js: books/<slug>/names.json
 *   { "garble": "Correct", ... }   (a leading "_comment" key is ignored)
 *   - matched case-insensitively, on word boundaries
 *   - longest keys applied first (so "O' Conor" wins before "Conor")
 *   - a MULTI-WORD key is matched across VTT word-timing tags and MERGED into one
 *     token ("O'</c><00:00:03.6><c> Conor's" -> "O'Connor's"), which is what you want
 *     for a name the ASR split; the merged word keeps the FIRST token's timestamp.
 *
 * YouTube VTTs carry each line twice (a tagged cue + a plain rolling-caption cue),
 * so replacements are applied to the whole file and both forms are covered.
 *
 * Writes <slug>.vtt in place, after saving <slug>.vtt.orig.bak once (first run only).
 *
 * Usage: node scripts/fix-vtt-names.js --slug=<slug> [--dry]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
const DRY = !!args.dry;
if (!SLUG) {
  console.error("Kullanım: node scripts/fix-vtt-names.js --slug=<slug> [--dry]");
  process.exit(1);
}

const mapPath = path.join(ROOT, "books", SLUG, "names.json");
if (!fs.existsSync(mapPath)) {
  console.log(`ℹ  books/${SLUG}/names.json yok — VTT isim düzeltmesi atlandı (opsiyonel adım).`);
  process.exit(0);
}
const vttPath = path.join(ROOT, "public", "captions", `${SLUG}.vtt`);
if (!fs.existsSync(vttPath)) {
  console.error(`❌ public/captions/${SLUG}.vtt yok.`);
  process.exit(1);
}

const pairs = Object.entries(JSON.parse(fs.readFileSync(mapPath, "utf8")))
  .filter(([k]) => k !== "_comment")
  .sort((a, b) => b[0].length - a[0].length); // longest first

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The bridge between two words inside a cue: either plain whitespace, or the
// word-timing tag sandwich YouTube puts between tokens. Matching both is what lets
// a multi-word key merge a name the ASR split across timestamps.
//
// `</c>` is OPTIONAL because the FIRST word of a cue is not wrapped in <c> at all —
// the cue reads `The<00:00:00.320><c> grandmother</c>…`, so a phrase that starts on
// that first word has no closing tag to match and would otherwise be missed.
const SEP = `(?:\\s*(?:<\\/c>)?\\s*<[0-9:.]+>\\s*<c>\\s*|\\s+)`;
const rxFor = (k) => {
  const body = k.trim().split(/\s+/).map(esc).join(SEP);
  return new RegExp(`(^|[^A-Za-z0-9])(${body})(?=[^A-Za-z0-9]|$)`, "gi");
};

let vtt = fs.readFileSync(vttPath, "utf8");
const report = [];
for (const [k, v] of pairs) {
  let n = 0;
  vtt = vtt.replace(rxFor(k), (m, pre) => { n++; return pre + v; });
  report.push([k, v, n]);
}

const total = report.reduce((s, r) => s + r[2], 0);
for (const [k, v, n] of report) {
  console.log(`  ${n ? "✓" : "·"} ${String(n).padStart(4)}  ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
}
if (!total) { console.log("ℹ  değişiklik yok."); process.exit(0); }

if (DRY) { console.log(`\n[dry] ${total} değişiklik yapılacaktı → ${vttPath}`); process.exit(0); }

const bak = vttPath + ".orig.bak";
if (!fs.existsSync(bak)) fs.copyFileSync(vttPath, bak);
fs.writeFileSync(vttPath, vtt);
console.log(`\n✓ ${total} isim düzeltildi → public/captions/${SLUG}.vtt`);
console.log(`  (yedek: public/captions/${SLUG}.vtt.orig.bak)`);
