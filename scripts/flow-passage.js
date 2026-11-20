#!/usr/bin/env node
/**
 * flow-passage.js — cut the same passages out of real films as isolated configs + a cloud clip manifest, so a Film Flow
 * change is shown BEFORE / AFTER on moving picture (2026-11-12). The book's own files are only read.
 *
 *   node scripts/flow-passage.js --slug=<a>,<b> --out=<dir> [--windows=0-90,mid] [--arm=A] [--book-root=<checkout>]
 *                                [--flow=<n> | --keep-flow] [--full]
 *   (clips of ONE book for the operator: `node scripts/told-clip.js --slug=<slug>` runs this, the cloud render and the checks)
 *
 * For each book and window: <out>/configs/<slug>-<window>-<arm>.json = the scenes that start inside the window, moved to
 * frame 0, with their captions (the films are watched with captions), no narration (clips are silent), and a
 * stills/1 manifest with one `clip` job each (half size) for scripts/stills-cloud.js. `mid` = 90 s around the middle.
 * Run it again with --arm=B from a checkout that carries the change: same passages, same ids, the other arm.
 * A passage is planned exactly as the film was: nothing here re-plans, restages or re-times a scene.
 */
const fs = require("fs");
const path = require("path");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
if (typeof args.slug !== "string" || typeof args.out !== "string") { console.error("usage: node scripts/flow-passage.js --slug=<a>,<b> --out=<dir> [--windows=0-90,mid] [--arm=A] [--book-root=<checkout>]"); process.exit(2); }
const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : path.join(__dirname, ".."));
const OUT = path.resolve(args.out);
const ARM = typeof args.arm === "string" ? args.arm : "A";
const FLOW = Number(args.flow) > 0 ? Math.floor(Number(args.flow)) : 0;
const WINDOWS = (typeof args.windows === "string" ? args.windows : "0-90,mid").split(",");

/** The scenes starting in [from, to) seconds, rebased to frame 0, with their captions. Pure. */
function passage(config, fromSec, toSec) {
  const fps = (config.meta && config.meta.fps) || 30;
  const scenes = (config.scenes || []).filter((s) => s.fromFrame / fps >= fromSec && s.fromFrame / fps < toSec);
  if (!scenes.length) return null;
  const off = scenes[0].fromFrame, last = scenes[scenes.length - 1], total = last.fromFrame + last.durationFrames - off;
  const shift = (n) => n - off;
  const captions = (config.captions || []).filter((c) => c.endFrame > off && c.startFrame < off + total).map((c) => ({
    ...c, startFrame: Math.max(0, shift(c.startFrame)), endFrame: Math.min(total, shift(c.endFrame)),
    words: (c.words || []).map((w) => ({ ...w, s: shift(w.s), e: shift(w.e) })),
  }));
  return {
    config: { ...config, scenes: scenes.map((s) => ({ ...s, fromFrame: shift(s.fromFrame) })), captions, promises: [], audioEvents: [], totalFrames: total, meta: { ...(config.meta || {}), durationInFrames: total } },
    fromFrame: off, frames: total, scenes: scenes.length, firstScene: scenes[0].id, lastScene: last.id,
  };
}

function main() {
  fs.mkdirSync(path.join(OUT, "configs"), { recursive: true });
  const jobs = [], record = [];
  for (const slug of args.slug.split(",")) {
    const file = path.join(ROOT, "books", slug, "config.antidote.json");
    if (!fs.existsSync(file)) { console.error(`flow-passage: ${slug}: no config.antidote.json under ${ROOT}`); process.exit(1); }
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    const fps = (config.meta && config.meta.fps) || 30, filmSec = (config.meta.durationInFrames || 0) / fps;
    for (const w of WINDOWS) {
      const [a, b] = w === "mid" ? [filmSec / 2 - 45, filmSec / 2 + 45] : w.split("-").map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) { console.error(`flow-passage: bad window "${w}"`); process.exit(2); }
      const p = passage(config, a, b);
      if (!p) { console.error(`flow-passage: ${slug} ${w}: no scene starts there`); process.exit(1); }
      const id = `${slug}-${w}-${ARM}`;
      // the "after" arm is the same passage with a Film Flow level switched on (src/engines/antidote/flow.ts)
      // --keep-flow: the passage as the BOOK is planned (a told book keeps its level — told-clip.js)
      if (FLOW) p.config.meta.flow = FLOW; else if (!args["keep-flow"]) delete p.config.meta.flow;
      fs.writeFileSync(path.join(OUT, "configs", `${id}.json`), JSON.stringify(p.config));
      jobs.push({ id, config: `configs/${id}.json`, frames: [Math.round(p.frames * 0.5)], clip: { from: 0, to: p.frames - 1, ...(args.full ? { scale: 1, crf: 16 } : {}) } }); // --full: 1920×1080 (the operator judges full-size clips; half size read as "broken")
      record.push({ id, slug, window: w, arm: ARM, fromFrame: p.fromFrame, frames: p.frames, seconds: +(p.frames / fps).toFixed(1), scenes: p.scenes, firstScene: p.firstScene, lastScene: p.lastScene });
    }
  }
  // the scenes carry their own sound cues: the runner needs the effect files even for a silent clip
  const sfx = path.join(__dirname, "..", "public", "sfx");
  const extra = fs.existsSync(sfx) ? fs.readdirSync(sfx).filter((f) => f.endsWith(".wav")).map((f) => `public/sfx/${f}`) : [];
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ schema: "stills/1", name: `film-flow passages ${ARM}${FLOW ? ` flow ${FLOW}` : ""}`, composition: "Antidote-lab", entry: "src/index.ts", silent: true,
    // drawn the way the FILM is drawn: the production render gives the browser no graphics flag. Under the stills
    // pipeline's "swangle" a clip showed stale picture tiles on most frames (flicker-check.js: 135 of 161 frames;
    // 21 with this setting) — the operator saw the pilots tremble.
    gl: "default", shards: jobs.length, extra, jobs }, null, 2));
  fs.writeFileSync(path.join(OUT, "passages.json"), JSON.stringify(record, null, 2));
  for (const r of record) console.log(`  ${r.id}: ${r.scenes} scenes, ${r.seconds} s (${r.firstScene}…${r.lastScene})`);
  console.log(`→ ${OUT}\n  push: node scripts/stills-cloud.js push --manifest=${path.join(OUT, "manifest.json")} --tag=<name>`);
}

if (require.main === module) main();
module.exports = { passage };
