#!/usr/bin/env node
/**
 * render-stills.js — render the stills (and 3-frame strips) a stills manifest asks for. Built to run on GitHub Actions
 * (.github/workflows/render-stills.yml via scripts/stills-cloud.js); on this PC it is held to a small budget by
 * scripts/lib/local-load-guard.js (operator 2026-11-04: heavy work never chokes the PC).
 *
 *   node scripts/render-stills.js --manifest=<stills/manifest.json> --out=<dir> [--shard=k/n] [--operator-local="…"]
 *
 * Manifest (schema "stills/1"; paths relative to the manifest's folder):
 *   { "schema": "stills/1", "name": "…", "composition": "Antidote-lab", "entry": "src/index.ts", "shards": 8,
 *     "silent": true,
 *     "jobs": [ { "id": "B01-A", "config": "configs/B01-A.json", "frames": [449, 553, 656], "strip": true } ] }
 * Each job: the config is passed as inputProps { config } to the composition (props are resolved at selectComposition —
 * renderStill drops them on an already-selected composition); one PNG per frame, and with `strip` the frames side by
 * side (640 px each) in one PNG; with `grid: { cols, width }` the same frames tiled in reading order (grids/<id>.png,
 * dense-frame studies); with `clip: { from, to, crf?, scale? }` a silent h264 video of that frame range (clips/<id>.mp4,
 * half size by default — human video studies; every clip frame counts against the local budget). `silent` (default true) drops meta.audio: a still has no sound, and the runner has no
 * narration file. Shard k of n takes jobs k, k+n, k+2n… (round robin keeps long and short jobs mixed).
 * Output: <out>/raw/<id>-f<frame>.png, <out>/strips/<id>.png, <out>/shard-<k>.json (timing, failures, sha256 of every
 * file written — the fetch side checks them).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { guardStills } = require("./lib/local-load-guard");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
if (!args.manifest || !args.out) { console.error('usage: render-stills.js --manifest=<file> --out=<dir> [--shard=k/n] [--operator-local="…"]'); process.exit(1); }
const MAN = path.resolve(args.manifest);
const BASE = path.dirname(MAN);
const OUT = path.resolve(args.out);
const man = JSON.parse(fs.readFileSync(MAN, "utf8"));
if (man.schema !== "stills/1" || !Array.isArray(man.jobs)) { console.error("✗ not a stills/1 manifest"); process.exit(1); }
const [k, n] = String(args.shard || "0/1").split("/").map(Number);
const jobs = man.jobs.filter((_, i) => i % n === k);
// a clip counts every frame it renders: clips are never light work for this PC
const stills = jobs.reduce((s, j) => s + (j.frames || []).length + (j.clip ? j.clip.to - j.clip.from + 1 : 0), 0);
guardStills({ what: `render-stills ${man.name || ""} shard ${k}/${n}`, stills, operatorLocal: args["operator-local"] });

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

(async () => {
  const { bundle } = require("@remotion/bundler");
  const { renderStill, renderMedia, selectComposition, openBrowser } = require("@remotion/renderer");
  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, man.entry || "src/index.ts"), webpackOverride: (c) => c });
  const bundleSec = (Date.now() - t0) / 1000;
  console.log(`bundle ${bundleSec.toFixed(0)} s · shard ${k}/${n}: ${jobs.length} jobs, ${stills} stills`);
  const browser = await openBrowser("chrome", { chromiumOptions: { gl: "swangle" } });
  for (const d of ["raw", "strips", "grids", "clips"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const files = {}, failed = [];
  for (const j of jobs) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(BASE, j.config), "utf8"));
      // silent: no narration and no sound effects (a clip would fetch every SFX file; the runner has none)
      if (man.silent !== false && config.meta) { config.meta = { ...config.meta, audio: null }; config.audioEvents = []; }
      const inputProps = { config };
      const composition = await selectComposition({ serveUrl, id: man.composition || "Antidote-lab", puppeteerInstance: browser, inputProps, timeoutInMilliseconds: 240000 });
      const parts = [];
      for (const fr of j.frames || []) {
        const o = path.join(OUT, "raw", `${j.id}-f${fr}.png`);
        await renderStill({ composition, serveUrl, output: o, frame: fr, imageFormat: "png", puppeteerInstance: browser, inputProps, timeoutInMilliseconds: 240000 });
        parts.push(o); files[path.relative(OUT, o).split(path.sep).join("/")] = sha(o);
      }
      if (j.strip && parts.length > 1) {
        const s = path.join(OUT, "strips", `${j.id}.png`);
        execFileSync("ffmpeg", ["-v", "error", "-y", ...parts.flatMap((x) => ["-i", x]), "-filter_complex",
          parts.map((_, i) => `[${i}:v]scale=640:-2,pad=iw+8:ih:0:0:white[v${i}]`).join(";") + ";" + parts.map((_, i) => `[v${i}]`).join("") + `hstack=inputs=${parts.length}`, s]);
        files[`strips/${j.id}.png`] = sha(s);
      }
      // grid: the same frames in reading order (left → right, top → bottom), for dense-frame studies
      if (j.grid && parts.length > 1) {
        const cols = Math.max(1, Math.min(parts.length, j.grid.cols || 6)), w = j.grid.width || 480;
        const g = path.join(OUT, "grids", `${j.id}.png`);
        const layout = parts.map((_, i) => `${(i % cols) * (w + 6)}_${Math.floor(i / cols) * (Math.round(w * 9 / 16) + 6)}`).join("|");
        execFileSync("ffmpeg", ["-v", "error", "-y", ...parts.flatMap((x) => ["-i", x]), "-filter_complex",
          parts.map((_, i) => `[${i}:v]scale=${w}:${Math.round(w * 9 / 16)}[g${i}]`).join(";") + ";" + parts.map((_, i) => `[g${i}]`).join("") + `xstack=inputs=${parts.length}:layout=${layout}:fill=white`, g]);
        files[`grids/${j.id}.png`] = sha(g);
      }
      // clip: a silent video of a frame range (human video studies), h264, half size
      if (j.clip) {
        const c = path.join(OUT, "clips", `${j.id}.mp4`);
        await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: c, inputProps, frameRange: [j.clip.from, j.clip.to], muted: true,
          crf: j.clip.crf || 23, scale: j.clip.scale || 0.5, puppeteerInstance: browser, timeoutInMilliseconds: 240000, concurrency: 2 });
        files[`clips/${j.id}.mp4`] = sha(c);
      }
      console.log(`  ${j.id}: ${(j.frames || []).join(",")}${j.clip ? ` clip ${j.clip.from}-${j.clip.to}` : ""}`);
    } catch (e) { failed.push({ id: j.id, error: String(e && e.message || e).slice(0, 500) }); console.log(`  ${j.id}: FAILED ${String(e && e.message || e).slice(0, 160)}`); }
  }
  await browser.close({ silent: true });
  const rec = { shard: k, of: n, name: man.name, inputHash: man.inputHash || null, jobs: jobs.map((j) => j.id), failed, files,
    bundleSec, totalSec: (Date.now() - t0) / 1000, run: process.env.GITHUB_RUN_ID || null, commit: process.env.GITHUB_SHA || null };
  fs.writeFileSync(path.join(OUT, `shard-${k}.json`), JSON.stringify(rec, null, 1));
  console.log(`shard ${k}/${n}: ${Object.keys(files).length} files in ${rec.totalSec.toFixed(0)} s, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
