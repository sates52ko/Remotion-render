#!/usr/bin/env node
/**
 * single-relation-preview.js — isolated before / after preview of VALID single-relation contracts (Level 1). Never
 * edits the book: it writes experiment configs (the beat's previous scene + the beat, re-timed from 0, captions off)
 * next to a stills/1 manifest for scripts/stills-cloud.js (GitHub Actions — never rendered on this PC).
 *
 *   node scripts/single-relation-preview.js build --slug=<s> [--book-root=<wt>] [--out=<dir>] [--clips]
 *       A = the authored scene unchanged; B = the same scene compiled from its contract, meta.singleRelation on (this
 *       experiment config only). Per beat: a 3-frame strip at 30 / 60 / 90 % (+ a silent clip with --clips).
 *       Reads <book>/single-relation/contracts.json (from single-relation-scan.js validate): only VALID contracts.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const R = require("./lib/single-relation");

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
if (process.argv[2] !== "build" || !args.slug) { console.error("usage: single-relation-preview.js build --slug=<s> [--book-root=<wt>] [--out=<dir>] [--clips]"); process.exit(2); }
const root = path.resolve(args["book-root"] || path.join(__dirname, ".."));
const B = path.join(root, "books", args.slug);
const SR = path.resolve(args.contracts || path.join(B, "single-relation"));
const OUT = path.resolve(args.out || path.join(SR, "preview"));
const cfg = JSON.parse(fs.readFileSync(path.join(B, "config.antidote.json"), "utf8"));
const rec = JSON.parse(fs.readFileSync(path.join(SR, "contracts.json"), "utf8"));
fs.mkdirSync(path.join(OUT, "configs"), { recursive: true });
const jobs = [], pairs = [], timingDropped = [];
for (const i of rec.valid || []) {
  const c0 = JSON.parse(fs.readFileSync(path.join(SR, "contracts", `${i}.json`), "utf8"));
  const prev = cfg.scenes[i - 1], cur = cfg.scenes[i];
  // cycle 18 timing rule — the same one apply uses: B is previewed exactly as it would ship (anchored to the words the
  // narrator says the result with); a beat that cannot be timed honestly is not rendered at all (it would keep A)
  const tv = R.verifyTiming(c0, cur, require("./apply-single-relation").wordsOf(cfg, cur));
  if (!tv.ok) { timingDropped.push({ sceneIndex: i, keep: "A", why: `timing: ${tv.reason}` }); continue; }
  const c = tv.contract;
  const off = prev ? prev.fromFrame : cur.fromFrame;
  const A = [prev, cur].filter(Boolean).map((s) => ({ ...s, fromFrame: s.fromFrame - off }));
  const curA = A[A.length - 1], total = curA.fromFrame + curA.durationFrames;
  const mk = (scenes) => ({ ...cfg, scenes, captions: [], totalFrames: total, meta: { ...(cfg.meta || {}), durationInFrames: total } });
  const cfgs = { A: mk(A), B: R.enable(mk(A.slice(0, -1).concat([R.compile(c, curA, { words: require("./apply-single-relation").wordsOf(cfg, cur) })]))) };
  const frames = [0.3, 0.6, 0.9].map((p) => Math.round(curA.fromFrame + p * curA.durationFrames));
  for (const arm of ["A", "B"]) {
    const id = `s${i}-${arm}`;
    fs.writeFileSync(path.join(OUT, "configs", `${id}.json`), JSON.stringify(cfgs[arm]));
    jobs.push({ id, config: `configs/${id}.json`, frames, strip: true, ...(args.clips ? { clip: { from: curA.fromFrame, to: total - 1 } } : {}) });
  }
  pairs.push({ sceneIndex: i, sceneId: cur.id, narration: cur._narration, previousNarration: prev ? prev._narration || "" : "", contract: `contracts/${i}.json`, type: c.type, frames, timing: tv.events, derived: tv.derived || [],
    // the exact B that is rendered and reviewed (cycle 19): apply ships it only if it is still this one
    bContractHash: require("crypto").createHash("sha256").update(JSON.stringify(c)).digest("hex").slice(0, 16) });
}
const extra = fs.existsSync(path.join(root, "public", "sfx")) ? fs.readdirSync(path.join(root, "public", "sfx")).filter((f) => f.endsWith(".wav")).map((f) => `public/sfx/${f}`) : [];
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ schema: "stills/1", name: `single-relation A/B ${args.slug}`, composition: "Antidote-lab", entry: "src/index.ts", silent: true, shards: Math.max(1, Math.min(10, jobs.length / 2)), extra, jobs }, null, 1));
fs.writeFileSync(path.join(OUT, "pairs.json"), JSON.stringify({ schema: "single-relation-preview/1", slug: args.slug, level: "isolated A/B preview configs — the book is unchanged", pairs, timingDropped }, null, 1));
console.log(`${args.slug}: ${pairs.length} A/B pair(s)${timingDropped.length ? `, ${timingDropped.length} kept A by the timing rule` : ""} → ${OUT} (push: node scripts/stills-cloud.js push --manifest=${path.join(OUT, "manifest.json")} --tag=<t>)`);
