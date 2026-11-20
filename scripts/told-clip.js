#!/usr/bin/env node
/**
 * told-clip.js — ONE command from a planned book to watchable clips of its passages (Film Flow 2.1, 2026-11-16).
 *
 *   node scripts/told-clip.js --slug=<slug> [--windows=0-90,mid] [--out=<dir>] [--tag=<name>] [--wait-min=90] [--dry]
 *
 * Why it exists: the first agent that had to show clips of a told book (dracula) ran `npx remotion render … --props`
 * on the PC — the wrong composition props (it got the lab reel, not the book) and heavy work the PC must not do.
 * This is the only way to make a preview clip. It does, in order:
 *   1. flow-passage.js --full   the passages of books/<slug>/config.antidote.json as isolated configs + a manifest:
 *                               FULL HD (scale 1, crf 16), drawn with the film's own browser settings (gl: default)
 *   2. stills-cloud.js push     the working tree's engine + those configs → GitHub Actions (nothing renders here)
 *   3. stills-cloud.js fetch    waits for the run, downloads and verifies the clips
 *   4. flicker-check.js         every clip; the numbers are printed next to its path
 * The clips are silent (the passages carry their captions). The book's files are only read. --dry stops after 1.
 * Never: `npx remotion render`, `remotion still`, a local ffmpeg batch — see LOCAL_RENDER_RULES.md.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
if (typeof args.slug !== "string" || args.slug.includes(",")) { console.error("usage: node scripts/told-clip.js --slug=<slug> [--windows=0-90,mid] [--out=<dir>] [--tag=<name>] [--wait-min=90] [--dry]"); process.exit(2); }
const ROOT = path.join(__dirname, "..");
const SLUG = args.slug;
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const TAG = typeof args.tag === "string" ? args.tag : `clip-${SLUG}-${stamp}`;
const OUT = path.resolve(typeof args.out === "string" ? args.out : path.join(os.tmpdir(), "told-clip", TAG));

const run = (label, script, argv, { allowFail = false } = {}) => {
  console.log(`\n── ${label}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...argv], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0 && !allowFail) { console.error(`told-clip: ${label} failed (exit ${r.status}). Nothing was rendered on this PC; fix what the step printed and run the same command again.`); process.exit(r.status || 1); }
  return r.status === 0;
};
const mp4s = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? mp4s(path.join(dir, e.name)) : e.name.endsWith(".mp4") ? [path.join(dir, e.name)] : [])) : []);

if (!fs.existsSync(path.join(ROOT, "books", SLUG, "config.antidote.json"))) { console.error(`told-clip: books/${SLUG}/config.antidote.json is missing — plan the book first (make-book).`); process.exit(1); }
run("1/4 passages (full HD)", "flow-passage.js", [`--slug=${SLUG}`, `--out=${OUT}`, `--windows=${typeof args.windows === "string" ? args.windows : "0-90,mid"}`, "--arm=film", "--keep-flow", "--full"]);
if (args.dry) { console.log(`\n(dry) manifest: ${path.join(OUT, "manifest.json")}`); process.exit(0); }
run("2/4 push to GitHub Actions", "stills-cloud.js", ["push", `--manifest=${path.join(OUT, "manifest.json")}`, `--tag=${TAG}`]);
run("3/4 wait + download", "stills-cloud.js", ["fetch", `--tag=${TAG}`, `--out=${path.join(OUT, "clips")}`, `--wait-min=${Number(args["wait-min"]) > 0 ? Number(args["wait-min"]) : 90}`]);
const clips = mp4s(path.join(OUT, "clips"));
if (!clips.length) { console.error("told-clip: the run finished but no .mp4 came back — `node scripts/stills-cloud.js status --tag=" + TAG + "`"); process.exit(1); }
console.log("\n── 4/4 flicker check");
for (const c of clips) run(path.basename(c), "flicker-check.js", [c, "--top=3"], { allowFail: true });
console.log(`\nCLIPS READY (full HD, rendered in the cloud):\n${clips.map((c) => `  ${c}`).join("\n")}\nShow these to the operator. A clip whose "there-and-back frames" is far above the others: report it, do not show it.`);
