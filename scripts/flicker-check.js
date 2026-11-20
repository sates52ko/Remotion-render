#!/usr/bin/env node
/**
 * flicker-check.js — does a rendered clip FLICKER? (Film Flow, 2026-11-13; the operator saw trembling in the told pilots.)
 *
 *   node scripts/flicker-check.js <clip.mp4> [--top=12] [--json]
 *
 * A flicker is a picture that changes and changes straight back: frame n differs from n-1, and n+1 is n-1 again
 * (A-B-A). Motion is A-B-C. So for every frame, on a small grey copy of the film:
 *   back[n] = d(n-1, n) + d(n, n+1) - d(n-1, n+1)      (0 for steady motion, large for a there-and-back)
 * measured per 16×9 cell, so a small trembling thing is not averaged away by a still frame around it. Needs ffmpeg
 * on PATH; one decode of a short clip (light work). Report-only.
 */
const { spawnSync } = require("child_process");
const W = 160, H = 90, CW = 16, CH = 9;

function analyse(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${String(r.stderr).slice(0, 300)}`);
  const buf = r.stdout, size = W * H, n = Math.floor(buf.length / size);
  const frame = (i) => buf.subarray(i * size, (i + 1) * size);
  // mean absolute difference per cell
  const cells = (a, b) => {
    const out = new Float32Array(CW * CH), cw = W / CW, ch = H / CH;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[Math.floor(y / ch) * CW + Math.floor(x / cw)] += Math.abs(a[y * W + x] - b[y * W + x]);
    for (let i = 0; i < out.length; i++) out[i] /= cw * ch;
    return out;
  };
  const rows = [];
  for (let i = 1; i < n - 1; i++) {
    const d1 = cells(frame(i - 1), frame(i)), d2 = cells(frame(i), frame(i + 1)), d3 = cells(frame(i - 1), frame(i + 1));
    let worst = 0, at = 0;
    for (let c = 0; c < d1.length; c++) { const back = d1[c] + d2[c] - d3[c]; if (back > worst) { worst = back; at = c; } }
    rows.push({ frame: i, back: worst, cell: at, cx: at % CW, cy: Math.floor(at / CW) });
  }
  return { frames: n, rows };
}

function summarise(rows, fps = 30, threshold = 6) {
  const hits = rows.filter((r) => r.back >= threshold);
  // group hits that are close in time: one flicker event
  const events = [];
  for (const h of hits) {
    const last = events[events.length - 1];
    if (last && h.frame - last.to <= 6) { last.to = h.frame; last.count++; if (h.back > last.back) Object.assign(last, { back: h.back, cx: h.cx, cy: h.cy, peak: h.frame }); }
    else events.push({ from: h.frame, to: h.frame, peak: h.frame, count: 1, back: h.back, cx: h.cx, cy: h.cy });
  }
  return { threshold, flickerFrames: hits.length, events: events.map((e) => ({ ...e, sec: +(e.peak / fps).toFixed(2) })) };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.log("usage: node scripts/flicker-check.js <clip.mp4> [--top=12] [--json]"); process.exit(2); }
  const top = Number((process.argv.find((a) => a.startsWith("--top=")) || "").slice(6)) || 12;
  const { frames, rows } = analyse(file);
  const s = summarise(rows);
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ frames, ...s }, null, 2)); process.exit(0); }
  console.log(`${file}\n${frames} frames · there-and-back frames: ${s.flickerFrames} · events: ${s.events.length}  (a cell changes by ≥ ${s.threshold} grey levels and comes straight back)`);
  for (const e of [...s.events].sort((a, b) => b.back - a.back).slice(0, top)) console.log(`  ${String(e.sec).padStart(6)} s  frames ${e.from}–${e.to} (${e.count})  strength ${e.back.toFixed(1)}  at column ${e.cx + 1}/16, row ${e.cy + 1}/9`);
}
module.exports = { analyse, summarise };
