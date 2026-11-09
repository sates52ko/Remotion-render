#!/usr/bin/env node
// caption-sync.js — re-time a book's clean.vtt to the film that is on YouTube, from the FILM itself.
//   node caption-sync.js --root=<book worktree> --slug=<slug> [--write]
// 1. identity: out/<slug>.mp4 sha256 == the cloud record of the delivered film (unrepaired), else stop.
// 2. join steps: every video frame's pts (ffprobe packets, no decode) → off(n) = pts(n) − n/fps (constant inside a chunk,
//    steps at each join hold).
// 3. head: film audio vs source audio cross-correlation in the first chunk → H (encoder delay), so
//    D(s) = off(floor(s·fps)) + H  = how late the speech plays in the film vs the source the VTT is timed to.
// 4. verify D independently (xcorr) at start / 25 / 50 / 75 % / end and 2 s before + after several joins.
// 5. --write: <slug>.youtube-sync.vtt = clean.vtt with every cue start/end t → t + D(t) (text untouched).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = path.resolve(args.root), SLUG = args.slug;
const film = path.join(ROOT, "out", `${SLUG}.mp4`);
const src = ["mp3", "m4a"].map((e) => path.join(ROOT, "public", "audio", `${SLUG}.${e}`)).find(fs.existsSync);
const clean = path.join(ROOT, "public", "captions", `${SLUG}.clean.vtt`);
const out = path.join(ROOT, "public", "captions", `${SLUG}.youtube-sync.vtt`);
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

if (!fs.existsSync(film)) die(`no film ${film} — no estimated timecodes`);
if (!src) die("no source audio");
if (!fs.existsSync(clean)) die(`no clean.vtt ${clean}`);

// ── 1. identity ──
const cloud = readJson(path.join(ROOT, `.render-github-cloud.${SLUG}.json`));
const sha = (() => { const h = crypto.createHash("sha256"); const fd = fs.openSync(film, "r"); const b = Buffer.alloc(16 << 20); let n; while ((n = fs.readSync(fd, b, 0, b.length, null)) > 0) h.update(b.subarray(0, n)); fs.closeSync(fd); return h.digest("hex"); })();
const rec = cloud && cloud.report && cloud.report.final;
const jr = cloud && cloud.report && cloud.report.joinRepair;
console.log(`film ${path.relative(ROOT, film)} ${(fs.statSync(film).size / 1e6).toFixed(1)} MB mtime ${fs.statSync(film).mtime.toISOString()} sha ${sha.slice(0, 12)}`);
console.log(`cloud record: run ${cloud && cloud.run && cloud.run.url} sha ${rec && rec.sha256 && rec.sha256.slice(0, 12)} frames ${rec && rec.frames} joinRepair ${jr && jr.status}${jr && jr.reason ? ` (${String(jr.reason).slice(0, 80)})` : ""}`);
if (!rec || rec.sha256 !== sha) die("the film on disk is not the delivered cloud film (sha256 differs) — stop");

// ── 2. video pts ──
const fpsR = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "default=nw=1:nk=1", film], { encoding: "utf8" }).stdout.match(/(\d+)\/(\d+)/).slice(1, 3).join("/");
const fps = fpsR.split("/").reduce((a, b) => Number(a) / Number(b));
const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", film], { encoding: "utf8", maxBuffer: 256 << 20 });
const pts = pr.stdout.split(/\r?\n/).map((x) => x.trim().replace(/,$/, "")).filter((x) => /^-?\d/.test(x)).map(Number).sort((a, b) => a - b);
const off = Float64Array.from(pts, (p, n) => p - n / fps);
const joins = [];
for (let n = 1; n < pts.length; n++) { const st = pts[n] - pts[n - 1]; if (st > 1.5 / fps) joins.push({ n, film: pts[n], extra: st - 1 / fps }); }
const fdur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", film], { encoding: "utf8" }).stdout.trim());
const sdur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src], { encoding: "utf8" }).stdout.trim());
console.log(`fps ${fps} · ${pts.length} frames · film ${fdur.toFixed(3)} s · source ${sdur.toFixed(3)} s · ${joins.length} join holds, total ${joins.reduce((a, j) => a + j.extra, 0).toFixed(3)} s (min ${Math.min(...joins.map((j) => j.extra)).toFixed(4)}, max ${Math.max(...joins.map((j) => j.extra)).toFixed(4)})`);

// ── 3/4. audio xcorr ──
const SR = 8000;
function pcm(file, start, dur) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(Math.max(0, start)), "-t", String(dur), "-i", file, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], { maxBuffer: 64 << 20 });
  const b = r.stdout; const a = new Float32Array(b.length / 2); for (let i = 0; i < a.length; i++) a[i] = b.readInt16LE(i * 2); return a;
}
/** lag (s) of the speech at source time s in the film, searched within ±win around guess. Returns { lag, r }. */
function lagAt(s, guess, { len = 6, win = 0.6 } = {}) {
  const a = pcm(src, s, len);
  const fStart = s + guess - win;
  const b = pcm(film, fStart, len + 2 * win);
  let best = -2, bestK = 0;
  const na = Math.sqrt(a.reduce((x, v) => x + v * v, 0)) || 1;
  for (let k = 0; k + a.length <= b.length; k++) {
    let dot = 0, nb = 0;
    for (let i = 0; i < a.length; i += 1) { const v = b[k + i]; dot += a[i] * v; nb += v * v; }
    const r = dot / (na * (Math.sqrt(nb) || 1));
    if (r > best) { best = r; bestK = k; }
  }
  return { lag: fStart + bestK / SR - s, r: best };
}
const offAt = (s) => off[Math.min(off.length - 1, Math.max(0, Math.floor(s * fps + 1e-9)))];
const head = lagAt(3, offAt(3) + 0.04);
const H = head.lag - offAt(3);
console.log(`head (film audio vs source, first chunk, t=3 s): lag ${(head.lag * 1000).toFixed(1)} ms r ${head.r.toFixed(3)} → H = ${(H * 1000).toFixed(1)} ms (${Math.round(H * 48000)} samples @48k)`);
const D = (s) => offAt(s) + H;

const firstJoinSrc = joins.length ? joins[0].n / fps : null;
const pts2src = (j) => j.n / fps; // source time of the first frame after the hold
const pick = [joins[0], joins[Math.floor(joins.length / 3)], joins[Math.floor(joins.length * 2 / 3)], joins[joins.length - 1]].filter(Boolean);
const points = [
  ["start", 8], ["25 %", sdur * 0.25], ["50 %", sdur * 0.5], ["75 %", sdur * 0.75], ["end", sdur - 12],
  ...pick.flatMap((j) => [[`join @${pts2src(j).toFixed(1)}s −2s`, pts2src(j) - 2.5], [`join @${pts2src(j).toFixed(1)}s +2s`, pts2src(j) + 0.5]]),
];
let worst = 0;
const rows = [];
// a check window must lie inside ONE chunk: a window that straddles a hold measures the lag after it (2026-11-09:
// the 50 % point started 33 ms before a segment hold and read +58.7 ms)
const holdSrc = joins.map((j) => j.n / fps);
const inChunk = (s, len = 2) => { const h = holdSrc.find((x) => x > s && x < s + len + 0.05); return h === undefined ? s : h - len - 0.15; };
for (const [label, s0] of points) {
  const s = inChunk(s0);
  const pred = D(s), m = lagAt(s, pred, { len: 2, win: 0.4 });
  const res = m.lag - pred; worst = Math.max(worst, Math.abs(res));
  rows.push({ label, s: +s.toFixed(2), predictedMs: +(pred * 1000).toFixed(1), measuredMs: +(m.lag * 1000).toFixed(1), residualMs: +(res * 1000).toFixed(1), r: +m.r.toFixed(3) });
  console.log(`  ${label.padEnd(22)} s=${s.toFixed(1).padStart(7)}  D predicted ${(pred * 1000).toFixed(1).padStart(8)} ms  measured ${(m.lag * 1000).toFixed(1).padStart(8)} ms  residual ${(res * 1000).toFixed(1).padStart(6)} ms  r ${m.r.toFixed(3)}`);
}
const ok = worst <= 25 && rows.every((r) => r.r >= 0.5);
console.log(`verification: worst residual ${(worst * 1000).toFixed(1)} ms, min r ${Math.min(...rows.map((r) => r.r)).toFixed(3)} → ${ok ? "PASS" : "FAIL"}`);
console.log(`captions early by: start ${(D(8) * 1000).toFixed(0)} ms · middle ${(D(sdur / 2)).toFixed(2)} s · end ${(D(sdur - 12)).toFixed(2)} s`);

// ── 5. re-time ──
const fmt = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
const parse = (x) => { const p = x.split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
const TS = /^(\s*)(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})(.*)$/;
const text = fs.readFileSync(clean, "utf8");
const eol = text.includes("\r\n") ? "\r\n" : "\n";
let cues = 0, maxShift = 0, prevEnd = -1, nonMono = 0, clamped = 0;
const lines = text.split(/\r?\n/).map((l) => {
  const m = l.match(TS); if (!m) return l;
  const a = parse(m[2]), b = parse(m[3]);
  // clean.vtt may end past its audio; nothing is spoken after the film ends → clamp to the film's duration
  const a2 = Math.min(a + D(a), fdur - 0.001), b2 = Math.min(b + D(Math.max(a, b - 0.001)), fdur);
  if (b + D(Math.max(a, b - 0.001)) > fdur) clamped++;
  if (a2 < prevEnd - 0.0005) nonMono++;
  prevEnd = b2; cues++; maxShift = Math.max(maxShift, b2 - b);
  return `${m[1]}${fmt(a2)} --> ${fmt(b2)}${m[4]}`;
});
const lastEnd = prevEnd;
console.log(`clean.vtt: ${cues} cues · last end → ${fmt(lastEnd)} (film ${fmt(fdur)}) · max shift ${maxShift.toFixed(3)} s · overlaps created ${nonMono} · clamped to film end ${clamped}`);
const report = { slug: SLUG, film: { sha256: sha, frames: pts.length, durationSec: fdur, fps }, source: { file: path.relative(ROOT, src), durationSec: sdur }, joins: joins.length, insertedSec: +joins.reduce((a, j) => a + j.extra, 0).toFixed(4), headMs: +(H * 1000).toFixed(2), verification: { worstResidualMs: +(worst * 1000).toFixed(1), pass: ok, points: rows }, cues, maxShiftSec: +maxShift.toFixed(3) };
fs.writeFileSync(path.join(path.dirname(process.argv[1]), `${SLUG}.sync-report.json`), JSON.stringify(report, null, 2));
if (args.write) {
  if (!ok) die("verification FAILED — nothing written");
  fs.writeFileSync(out, lines.join(eol));
  console.log(`✓ wrote ${out}`);
}
