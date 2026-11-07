#!/usr/bin/env node
/**
 * frame-risk-eval.js — do framecheck's risk flags (scripts/lib/frame-risk.js) concentrate the misreads?
 * Measured against the blind mute-test verdicts on disk: for every Antidote book, the LATEST judged run
 * only (its config is the one that was judged; earlier runs may predate fix rounds). Read-only.
 *
 *   node scripts/frame-risk-eval.js [--root=<tree with books/ audit/mute/>] [--slugs=a,b] [--json=<out>]
 *
 * A flag is useful when its WRONG/dead rate is clearly above the unflagged frames'. With ~30 frames per
 * book the counts are small; read the n column before trusting a rate.
 */
const fs = require("fs");
const path = require("path");
const { risks } = require("./lib/frame-risk");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = path.resolve(args.root || path.join(__dirname, ".."));
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const readings = (readJSON(path.join(ROOT, "data", "icon-readings.json"), {}) || {}).icons || {};
const muteRoot = path.join(ROOT, "audit", "mute");
const slugs = args.slugs ? String(args.slugs).split(",") : (fs.existsSync(muteRoot) ? fs.readdirSync(muteRoot) : []);

const rows = [];
const books = [];
for (const slug of slugs) {
  const cfg = readJSON(path.join(ROOT, "books", slug, "config.antidote.json"));
  if (!cfg) continue;
  const base = path.join(muteRoot, slug);
  const runs = (fs.existsSync(base) ? fs.readdirSync(base) : [])
    .filter((l) => fs.existsSync(path.join(base, l, "judge-result.json")) && fs.existsSync(path.join(base, l, "judge-key.json")))
    .map((l) => ({ l, t: fs.statSync(path.join(base, l, "judge-result.json")).mtimeMs })).sort((a, b) => a.t - b.t);
  if (!runs.length) continue;
  const label = runs[runs.length - 1].l;
  const res = readJSON(path.join(base, label, "judge-result.json"));
  const key = readJSON(path.join(base, label, "judge-key.json"));
  if (!res || !key || Object.values(key).some((k) => k.vs)) continue; // --vs diagnostics are not a plain verdict
  // config must not be newer than the judged run by a fix round: skip books whose art.json changed after the judge
  const art = path.join(ROOT, "books", slug, "art.json");
  const stale = fs.existsSync(art) && fs.statSync(art).mtimeMs > runs[runs.length - 1].t;
  let n = 0;
  for (const it of res.items || []) {
    const k = key[it.id]; const v = it.V; if (!k || !v) continue;
    const s = (cfg.scenes || []).find((x) => k.frame >= x.fromFrame && k.frame < x.fromFrame + x.durationFrames);
    if (!s) continue;
    n++;
    rows.push({ slug, label, scene: s.id, flags: risks(s, readings).map((r) => r.split(":")[0]), wrong: v.correctness === "WRONG", dead: v.contribution === "NONE", stale });
  }
  books.push({ slug, label, n, stale });
}

const use = rows.filter((r) => !r.stale);
function stat(sel) { const n = sel.length; const w = sel.filter((r) => r.wrong).length; const d = sel.filter((r) => r.dead).length; return { n, wrong: w, dead: d, wrongRate: n ? w / n : null, deadRate: n ? d / n : null }; }
const table = { all: stat(use), unflagged: stat(use.filter((r) => !r.flags.length)), anyFlag: stat(use.filter((r) => r.flags.length)) };
for (const f of ["bare", "icon", "polarity", "strike"]) { table[f] = stat(use.filter((r) => r.flags.includes(f))); table[`not-${f}`] = stat(use.filter((r) => !r.flags.includes(f))); }

const pct = (x) => (x == null ? "  -" : `${(100 * x).toFixed(0).padStart(3)}%`);
console.log(`── frame-risk flags vs blind mute verdicts (latest run per book) · ${books.filter((b) => !b.stale).length} books, ${use.length} judged frames`);
const stale = books.filter((b) => b.stale);
if (stale.length) console.log(`   skipped (art.json changed after the latest judged run): ${stale.map((b) => b.slug).join(", ")}`);
for (const [k, v] of Object.entries(table)) console.log(`   ${k.padEnd(13)} n=${String(v.n).padStart(4)}  WRONG ${String(v.wrong).padStart(3)} ${pct(v.wrongRate)}   dead ${String(v.dead).padStart(3)} ${pct(v.deadRate)}`);
if (args.json) fs.writeFileSync(path.resolve(args.json), JSON.stringify({ date: new Date().toISOString(), books, table }, null, 2) + "\n");
