#!/usr/bin/env node
/**
 * visual-sameness.js — how alike the channel's films LOOK, frame for frame (2026-11-23, YPP "inauthentic content").
 * Stills render on GitHub Actions (scripts/stills-cloud.js); nothing renders on this PC.
 *
 *   node scripts/visual-sameness.js plan    --slugs=a,b,c [--frames=24] [--tag=<name>] [--book-root=<checkout>]
 *        → audit/visual-sameness/<tag>/{antidote,vox}/manifest.json: N frames per film, evenly spaced, from the planned configs
 *        a book produced in its own worktree: `dracula@../wt-book-dracula` (its config is read there, its code is NOT used:
 *        the stills render on this checkout's engine — the look of the planned config, not of its pinned engine)
 *   node scripts/visual-sameness.js cloud   --slugs=a,b,c [--frames=24] [--tag=<name>]      plan + push + fetch + compare, waits
 *   node scripts/visual-sameness.js compare --tag=<name> | --dir=<stills dir> [--json]      the matrix from stills on disk
 * Output: audit/visual-sameness/<tag>/visual-sameness.json + a table: every film's nearest film (layout = pHash,
 * palette = colour histogram, alike = their mean), the pairs, the dark share. Report only; the bar is the operator's
 * once two new-system films have been measured against the old ones (quality-policy → visualSameness, not yet written).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const VS = require("./lib/visual-sameness");

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const cmd = process.argv[2];
const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : path.join(__dirname, ".."));
const CODE = path.join(__dirname, "..");
const FRAMES = Math.max(4, Number(args.frames) || 24);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return null; } };
const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const TAG = (typeof args.tag === "string" && args.tag) || `vs-${stamp()}`;
const DIR = path.join(ROOT, "audit", "visual-sameness", TAG);

/** `slug` or `slug@<checkout>` — a book produced in its own worktree (../wt-book-<slug>) is read from there */
function configOf(spec) {
  const [slug, at] = String(spec).split("@");
  const root = at ? path.resolve(ROOT, at) : ROOT;
  for (const [engine, f] of [["antidote", "config.antidote.json"], ["vox", "config.vox.json"]]) {
    const c = read(path.join(root, "books", slug, f));
    if (c) return { engine, config: c, slug };
  }
  return null;
}
function totalFramesOf(engine, c) {
  if (engine === "antidote") return c.totalFrames || (c.meta && c.meta.durationInFrames) || (c.scenes || []).reduce((m, s) => Math.max(m, s.fromFrame + s.durationFrames), 0);
  return (c.meta && c.meta.totalFrames) || (c.beats || []).reduce((m, b) => Math.max(m, b.fromFrame + b.durationFrames), 0);
}

function plan(slugs) {
  const byEngine = { antidote: [], vox: [] };
  for (const spec of slugs) {
    const got = configOf(spec);
    if (!got) { console.error(`✗ ${spec}: no planned config (books/<slug>/config.*.json; a book in its own worktree: <slug>@../wt-book-<slug>)`); process.exit(2); }
    const slug = got.slug;
    const total = totalFramesOf(got.engine, got.config);
    if (!total) { console.error(`✗ ${slug}: no frames in the config`); process.exit(2); }
    // evenly spaced, inside the film (2 % margins): the opening card and the end are not the film's look
    const frames = Array.from({ length: FRAMES }, (_, i) => Math.round(total * (0.02 + (0.96 * (i + 0.5)) / FRAMES)));
    const cfg = { ...got.config }; if (cfg.meta) cfg.meta = { ...cfg.meta, audio: undefined };
    const dir = path.join(DIR, got.engine, "configs"); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(cfg));
    byEngine[got.engine].push({ id: slug, config: `configs/${slug}.json`, frames });
  }
  const manifests = [];
  for (const engine of ["antidote", "vox"]) {
    if (!byEngine[engine].length) continue;
    const m = path.join(DIR, engine, "manifest.json");
    fs.writeFileSync(m, JSON.stringify({ schema: "stills/1", name: `visual sameness ${TAG} ${engine}`, composition: engine === "antidote" ? "Antidote-lab" : "Vox-lab", entry: "src/index.ts", silent: true, gl: "default", shards: Math.min(8, Math.max(1, Math.ceil((byEngine[engine].length * FRAMES) / 30))), jobs: byEngine[engine] }, null, 2));
    manifests.push({ engine, manifest: m, tag: `${TAG}-${engine}`.slice(0, 60), out: path.join(DIR, engine, "stills") });
  }
  fs.writeFileSync(path.join(DIR, "plan.json"), JSON.stringify({ tag: TAG, at: new Date().toISOString(), frames: FRAMES, slugs, manifests: manifests.map((m) => ({ ...m, manifest: path.relative(ROOT, m.manifest), out: path.relative(ROOT, m.out) })) }, null, 2));
  return manifests;
}

function collect(dirs) {
  const films = {};
  for (const d of dirs) {
    const raw = path.join(d, "raw");
    if (!fs.existsSync(raw)) continue;
    for (const f of fs.readdirSync(raw).filter((f) => f.endsWith(".png")).sort()) {
      const m = f.match(/^(.*)-f(\d+)\.png$/); if (!m) continue;
      try { (films[m[1]] = films[m[1]] || []).push(VS.frameOf(fs.readFileSync(path.join(raw, f)))); } catch (e) { console.error(`  ✗ ${f}: ${e.message}`); }
    }
  }
  return films;
}
function report(films, where) {
  const ids = Object.keys(films);
  if (ids.length < 2) { console.error(`✗ ${ids.length} film(s) with frames under ${where} — two are needed`); process.exit(1); }
  const r = VS.compareAll(films);
  const out = { tag: TAG, at: new Date().toISOString(), frames: Object.fromEntries(ids.map((id) => [id, films[id].length])), ...r };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "visual-sameness.json"), JSON.stringify(out, null, 2));
  if (args.json) { console.log(JSON.stringify(out, null, 2)); return; }
  const pct = (x) => `${(x * 100).toFixed(0).padStart(3)} %`;
  // the bar (data/quality-policy.json → visualSameness.reviewAlike, operator 2026-11-23): a film whose nearest film is at
  // or over it looks like the shelf; measured: old films 72–73 % to each other, Dracula (Film Flow) 58–61 % to them
  let bar = null; try { bar = (read(path.join(ROOT, "data", "quality-policy.json")) || {}).visualSameness; } catch {}
  const review = bar && Number.isFinite(bar.reviewAlike) ? bar.reviewAlike : null;
  console.log(`── visual sameness · ${ids.length} films · ${Object.values(out.frames).reduce((a, b) => a + b, 0)} frames · layout = pHash nearest frame, palette = colour histogram, alike = mean${review != null ? ` · REVIEW ≥ ${pct(review)}` : ""}`);
  for (const id of ids) console.log(`   ${review != null ? (r.nearest[id].alike >= review ? "✗" : "·") : " "} ${id.padEnd(44).slice(0, 44)} nearest ${String(r.nearest[id].to).padEnd(30).slice(0, 30)} alike ${pct(r.nearest[id].alike)} · dark ${pct(r.dark[id])} · ${films[id].length} frames`);
  console.log(`   pairs:`);
  for (const p of r.pairs) console.log(`     ${p.a.slice(0, 28).padEnd(28)} ↔ ${p.b.slice(0, 28).padEnd(28)} layout ${pct(p.layout)} palette ${pct(p.palette)} alike ${pct(p.alike)}`);
  console.log(`   → ${path.relative(ROOT, path.join(DIR, "visual-sameness.json")).replace(/\\/g, "/")} (report; the bar is quality-policy visualSameness.reviewAlike — no stage stops on it yet)`);
}
const run = (label, argv) => { console.log(`\n── ${label}`); const r = spawnSync(process.execPath, [path.join(__dirname, "stills-cloud.js"), ...argv], { cwd: CODE, stdio: "inherit" }); if (r.status !== 0) { console.error(`visual-sameness: ${label} failed (exit ${r.status}). Nothing was rendered on this PC.`); process.exit(r.status || 1); } };

if (cmd === "plan" || cmd === "cloud") {
  const slugs = String(args.slugs || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (slugs.length < 2) { console.error("usage: node scripts/visual-sameness.js plan|cloud --slugs=a,b[,c…] [--frames=24] [--tag=<name>]"); process.exit(2); }
  const manifests = plan(slugs);
  for (const m of manifests) console.log(`✓ ${path.relative(ROOT, m.manifest)} — ${m.engine}: push with  node scripts/stills-cloud.js push --manifest=${m.manifest} --tag=${m.tag}  then fetch --tag=${m.tag} --out=${m.out}`);
  if (cmd === "plan") { console.log(`then: node scripts/visual-sameness.js compare --tag=${TAG}`); process.exit(0); }
  for (const m of manifests) run(`push ${m.engine} to GitHub Actions`, ["push", `--manifest=${m.manifest}`, `--tag=${m.tag}`]);
  for (const m of manifests) run(`wait + download ${m.engine}`, ["fetch", `--tag=${m.tag}`, `--out=${m.out}`, "--wait-min=60"]);
  report(collect(manifests.map((m) => m.out)), DIR);
} else if (cmd === "compare") {
  const dirs = typeof args.dir === "string" ? [path.resolve(args.dir)] : ["antidote", "vox"].map((e) => path.join(DIR, e, "stills"));
  report(collect(dirs), dirs.join(", "));
} else { console.error("usage: node scripts/visual-sameness.js plan|cloud --slugs=… | compare --tag=<name>|--dir=<stills>"); process.exit(2); }
