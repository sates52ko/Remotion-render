#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { validateConfig, loadBook } = require("./lib/narrative-visual-firewall");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.slice(2), true]; }));
const slug = args.slug;
if (!slug) { console.error("Usage: node scripts/validate-narrative-visual-firewall.js --slug=<slug> [--report-only] [--preview-only]"); process.exit(1); }
const root = args.root ? path.resolve(String(args.root)) : path.resolve(__dirname, "..");
const dir = path.join(root, "books", slug);

// ENGINE-AWARE (2026-10-27): the narrative firewall checks an ANTIDOTE plan (config.antidote.json + story bible). On a
// Vox book it does not apply — it used to read config.antidote.json anyway, fail on ENOENT and file that as a
// "STORY_BIBLE_INCOMPLETE" BLOCK (their-eyes-were-watching-god: a hand-run validator produced a BLOCK the render
// preflight never had, and the agent stopped on it). make-book and the render preflight already call it for Antidote
// only; this makes a hand run agree with them. Vox quality = its own gates + the mute test. No report is written.
let engine = null;
try { engine = JSON.parse(fs.readFileSync(path.join(dir, "book.json"), "utf8")).engine || null; } catch {}
if (!engine) engine = fs.existsSync(path.join(dir, "config.antidote.json")) ? "antidote" : fs.existsSync(path.join(dir, "config.vox.json")) ? "vox" : null;
if (engine && engine !== "antidote") {
  console.log(`NOT_APPLICABLE ${slug}: the narrative firewall is Antidote-only (engine=${engine}) — no report written. Vox quality = its own gates + the mute test; the render preflight prints "quality: n/a" for it.`);
  process.exit(0);
}

let report;
// a missing file is named for what it is — a missing config is not an incomplete story bible
const fail = (reasonCode, message) => ({ version: "P1.1", slug, status: "FAIL", counts: { scenes: 0, violations: 1 }, violations: [{ reasonCode, message }] });
if (!fs.existsSync(path.join(dir, "config.antidote.json"))) report = fail("CONFIG_MISSING", `books/${slug}/config.antidote.json does not exist — plan the book first (plan-antidote.js / make-book.js)`);
else if (!fs.existsSync(path.join(dir, "story-bible.json"))) report = fail("STORY_BIBLE_INCOMPLETE", `books/${slug}/story-bible.json does not exist`);
else {
  try { report = validateConfig({ ...loadBook(root, slug), slug }); }
  catch (error) { report = fail(/story-bible/.test(error.message) ? "STORY_BIBLE_INCOMPLETE" : "LOAD_ERROR", error.message); }
}
const { withOutcomes } = require('./lib/firewall-outcomes');
const preview = args['preview-only'] === true || args['preview-only'] === 'true';
report = withOutcomes(report, preview);
// which config this verdict is about (render-decision.js reads a report computed on another config as STALE)
{ const rp = require("./lib/render-preflight"); const cf = path.join(dir, "config.antidote.json"); report.configHash = rp.configHash(cf); report.renderInputHash = rp.inputHashOf(cf); }
const out = path.join(dir, preview ? 'narrative-visual-firewall.preview.report.json' : 'narrative-visual-firewall.report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(report.status + ' ' + slug + ': ' + report.counts.blocks + ' BLOCK, ' + report.counts.reviews + ' REVIEW; production=' + report.productionStatus);
for (const v of report.violations.slice(0, 20)) console.log('  [' + v.outcome + '] ' + v.reasonCode + ': ' + v.message);
if (preview) console.log('PREVIEW-ONLY — not approved for production delivery. Full findings: ' + out);
if (!args['report-only'] && (preview ? report.counts.blocks > 0 : report.status !== 'PASS')) process.exit(1);
