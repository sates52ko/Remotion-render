#!/usr/bin/env node
/**
 * gate-authorship.js — Faz 0: a film nobody authored does not render.
 *
 * Reads books/<slug>/config.{antidote,vox}.json (config only — works inside a
 * render bundle) and fails when a beat has no authored decision, when a prop or
 * diagram on screen was invented by an engine, when intents are templates, or
 * when another book's vocabulary leaked in. Rules: scripts/lib/authorship.js.
 *
 *   node scripts/gate-authorship.js --slug=<slug> [--engine=antidote|vox] [--report-only] [--restore]
 *
 * Exit 1 on FAIL. Published books (publish register in PUBLISHED_BOOKS.md) are frozen: reported,
 * never blocked — their config is the record of what shipped.
 * Writes books/<slug>/authorship.report.json (never for a frozen book).
 */
const fs = require("fs");
const path = require("path");
const { evaluateAuthorship } = require("./lib/authorship");
const { isFrozen } = require("./lib/frozen");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const SLUG = args.slug;
if (!SLUG) { console.error("Usage: node scripts/gate-authorship.js --slug=<slug> [--engine=antidote|vox] [--report-only]"); process.exit(1); }

const bookDir = path.join(ROOT, "books", SLUG);
const candidates = { antidote: path.join(bookDir, "config.antidote.json"), vox: path.join(bookDir, "config.vox.json") };
const engine = args.engine || (fs.existsSync(candidates.antidote) ? "antidote" : fs.existsSync(candidates.vox) ? "vox" : null);
if (!engine || !fs.existsSync(candidates[engine])) { console.error(`❌ ${SLUG}: no config for engine ${engine || "?"}`); process.exit(1); }
const config = JSON.parse(fs.readFileSync(candidates[engine], "utf8"));

let worldId = null;
try { worldId = JSON.parse(fs.readFileSync(path.join(bookDir, "story-bible.json"), "utf8")).visualProvenance.worldId; } catch {}

// Publish register = the 📊 Summary Table in PUBLISHED_BOOKS.md (lib/frozen.js).
// Prose backticks — detailed records, motif names, file paths — never froze a
// book; the loose whole-document match used to freeze into-the-wild off its
// detailed record #31 while the thumbnail side (which always parsed the table)
// ran it unfrozen. One parse now, shared by every gate.
const frozen = isFrozen(SLUG);

// --restore: put sealed authored staging back after the post-plan engines
// (make-book step 1.8906). Never on a frozen book.
if (args.restore && !frozen) {
  const { restoreAuthoredStaging } = require("./lib/authorship");
  const n = restoreAuthoredStaging(config);
  if (n) {
    fs.writeFileSync(candidates[engine], JSON.stringify(config, null, 2) + "\n");
    console.log(`   ↺ restored authored staging on ${n} scene(s) that a post-plan engine had restaged`);
  }
}
const res = evaluateAuthorship(config, { engine, slug: SLUG, worldId });
const report = { slug: SLUG, engine, generatedAt: new Date().toISOString(), frozen, ...res };
// A frozen book's folder is the record of what shipped — never write into it.
if (!frozen) {
  try { fs.writeFileSync(path.join(bookDir, "authorship.report.json"), JSON.stringify(report, null, 2) + "\n"); } catch {}
}

console.log(`\n── Authorship Gate (Faz 0) · ${SLUG} [${engine}] → ${res.status}${frozen ? " (frozen: report only)" : ""}`);
console.log(`   beats: ${res.counts.beats}   unauthored: ${res.counts.unauthored}`);
for (const [code, n] of Object.entries(res.counts)) {
  if (code !== "beats" && code !== "unauthored") console.log(`   ${code}: ${n}`);
}
const shown = res.violations.slice(0, 12);
for (const v of shown) console.log(`   ✗ ${v.code}${v.sceneId ? ` ${v.sceneId}` : ""} — ${v.message}`);
if (res.violations.length > shown.length) console.log(`   … ${res.violations.length - shown.length} more in books/${SLUG}/authorship.report.json`);

if (res.status === "FAIL" && !frozen && !args["report-only"]) {
  console.error(`\n❌ ${SLUG} is not authored. Author every beat: node scripts/storyboard.js prep --slug=${SLUG} (see STORYBOARD_RUNBOOK.md), then re-run make-book.`);
  process.exit(1);
}
