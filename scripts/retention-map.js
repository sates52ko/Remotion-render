#!/usr/bin/env node
/**
 * retention-map.js — where a film loses its viewers, laid over the config that was rendered (2026-11-11).
 *
 *   node scripts/retention-map.js --slug=<slug> [--book-root=<checkout>] [--top=10] [--json]
 *
 * Reads the retention curve yt-analytics.js pulled (100 points per video) and the book's config scenes / beats.
 * Honest about resolution: on a 40-minute film one point covers ~24 s, several scenes. The unit is therefore the
 * retention BUCKET; a bucket's drop is shared among the scenes inside it by time — an attribution to look at, never a
 * verdict on one scene. Report-only: it reads the published book and writes nothing into it.
 */
const fs = require("fs");
const path = require("path");
const auth = require("./lib/yt-auth");
const ch = require("./lib/yt-channel");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** Scenes of either engine as {id, startSec, endSec, kind, text}. */
function scenesOf(config) {
  const fps = (config.meta && config.meta.fps) || 30;
  const list = config.scenes || config.beats || [];
  return list.filter((s) => Number.isFinite(s.fromFrame) && Number.isFinite(s.durationFrames)).map((s) => ({
    id: s.id, startSec: s.fromFrame / fps, endSec: (s.fromFrame + s.durationFrames) / fps,
    kind: s.shot || s.type || "unknown",
    text: s._narration || (s.props && s.props.text) || ((s.texts || [])[0] || {}).text || "",
  }));
}

function main() {
  const slug = args.slug;
  if (!slug || slug === true) { console.log("usage: node scripts/retention-map.js --slug=<slug> [--book-root=<checkout>] [--top=10] [--json]"); process.exit(2); }
  const data = path.join(auth.storeDir(), "data");
  const map = readJSON(path.join(data, "video-map.json"));
  const vids = readJSON(path.join(data, "videos.json"));
  if (!map || !vids) throw new Error("no channel data yet: run  node scripts/yt-analytics.js all");
  const m = map.matches.find((x) => x.slug === slug);
  if (!m) throw new Error(`${slug}: not matched to a video (see yt-analytics.js match)`);
  const video = vids.videos.find((v) => v.id === m.videoId);
  const an = readJSON(path.join(data, "analytics", `${m.videoId}.json`));
  if (!an || !an.retention || !an.retention.length) throw new Error(`${slug}: no retention curve for ${m.videoId} yet (run yt-analytics.js pull)`);
  const root = path.resolve(args["book-root"] && args["book-root"] !== true ? args["book-root"] : path.join(__dirname, ".."));
  const dir = path.join(root, "books", slug);
  const file = ["config.antidote.json", "config.vox.json"].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!file) throw new Error(`${slug}: no config in ${dir} (config yok — pass --book-root=<the book's checkout>)`);
  const scenes = scenesOf(readJSON(file));
  const res = ch.retentionByScene(an.retention.map((r) => [r[0], r[1]]), scenes, video.durationSec);
  const filmEnd = Math.max(...scenes.map((s) => s.endSec));
  const top = Number(args.top) || 10;
  const worst = [...res.buckets].filter((b) => b.t0 > 30).sort((a, b) => b.drop - a.drop).slice(0, top);
  const typical = ch.median(res.buckets.filter((b) => b.t0 > 30).map((b) => b.drop));
  if (args.json) { console.log(JSON.stringify({ slug, videoId: m.videoId, secondsPerBucket: res.secondsPerBucket, typicalDrop: typical, worst, byKind: res.byKind }, null, 2)); return; }

  const textOf = new Map(scenes.map((s) => [s.id, s.text]));
  console.log(`${slug} — ${video.title}`);
  console.log(`video ${ch.clock(video.durationSec)}, config ${ch.clock(filmEnd)}${Math.abs(filmEnd - video.durationSec) > 5 ? "  (lengths differ: timings are approximate)" : ""}; ${scenes.length} scenes; one retention point = ${res.secondsPerBucket.toFixed(1)} s`);
  console.log(`first 30 s: ${(ch.interp(an.retention.map((r) => [r[0], r[1]]), 30 / video.durationSec) * 100).toFixed(0)}% still watching; typical drop per point after that: ${(typical * 100).toFixed(2)} pp\n`);
  console.log(`Steepest ${worst.length} points after 0:30 (drop in percentage points, then the scenes on screen):`);
  for (const b of worst) {
    console.log(`  ${ch.clock(b.t0)}–${ch.clock(b.t1)}  −${(b.drop * 100).toFixed(2)} pp  (${typical > 0 ? (b.drop / typical).toFixed(1) : "?"}× typical)`);
    for (const s of b.scenes) console.log(`      ${s.id} [${s.kind}] ${String(textOf.get(s.id) || "").slice(0, 90)}`);
  }
  console.log(`\nBy scene kind (attributed drop per minute on screen; kinds with under 60 s on screen are too thin to read):`);
  for (const k of [...res.byKind].sort((a, b) => (b.dropPerMin || 0) - (a.dropPerMin || 0))) {
    console.log(`  ${String(k.kind).padEnd(16)} ${String(k.n).padStart(4)} scenes  ${ch.clock(k.seconds).padStart(7)}  ${k.dropPerMin === null ? "–" : (k.dropPerMin * 100).toFixed(2) + " pp/min"}${k.seconds < 60 ? "  (thin)" : ""}`);
  }
}

if (require.main === module) { try { main(); } catch (e) { console.error(`retention-map: ${e.message}`); process.exit(1); } }
module.exports = { scenesOf };
