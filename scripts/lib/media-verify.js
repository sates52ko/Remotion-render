/**
 * media-verify.js — what a finished film's A/V actually is (cycle 9, 2026-11-03). Measures; decides only real sync.
 *
 * Why: the frame count + full decode said every split film was fine, and a 0.4 % "duration overhang" was written off
 * as benign. Measured on Hamnet (60586 frames, 400-frame chunks): every chunk join holds the video one frame longer
 * (76 ms instead of 33.3 ms: 150 joins + 9 segment joins = +6.9 s) and inserts ~20-45 ms of DIGITAL SILENCE into the
 * narration at the same instant (162 zero-level runs in the film, 5 in the source narration). Both streams stretch
 * together, so lips/cuts stay in sync — but the narration has an audible micro-gap every 13.3 s. This module tells
 * those apart:
 *   SYNC (verdict, can FAIL): audio and video start together (≤ 1 video frame), end together (≤ 1 video frame + 2 AAC
 *     frames: encoder priming + last-frame rounding), the audio timeline has no discontinuity, and every video hold
 *     sits on a chunk/segment join and is short (a long or off-grid hold = frames lost / a broken join).
 *   JOIN DROPOUTS (reported, never blocks here): zero-level audio runs at video joins vs the source narration's own.
 *   STRETCH (reported): film length vs frames/fps and vs the narration file.
 *   LOUDNESS (reported only, 2026-11-03 operator: no new hard gate): integrated LUFS, LRA, sample peak.
 * Pure analysis (analyze) is tested with fixtures; probe() runs ffprobe/ffmpeg (read-only on the file).
 */
const { spawnSync } = require("child_process");

const AAC_FRAME = 1024;

function run(cmd, args, max = 256 * 1024 * 1024) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: max, windowsHide: true });
  if (r.error) throw new Error(`${cmd}: ${r.error.code || r.error.message}`);
  return r;
}

/** stream headers + packet timelines (pts) of the first video and audio stream */
function probeStreams(file) {
  const h = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=index,codec_type,codec_name,start_time,duration,nb_frames,r_frame_rate,sample_rate:format=duration", "-of", "json", file]).stdout || "{}");
  const v = (h.streams || []).find((s) => s.codec_type === "video") || null;
  const a = (h.streams || []).find((s) => s.codec_type === "audio") || null;
  const pk = (sel) => run("ffprobe", ["-v", "error", "-select_streams", sel, "-show_entries", "packet=pts_time,duration_time", "-of", "csv=p=0", file]).stdout
    .trim().split(/\r?\n/).filter(Boolean).map((l) => l.split(",").map(Number));
  return { header: h, video: v, audio: a, videoPackets: v ? pk("v:0") : [], audioPackets: a ? pk("a:0") : [] };
}

/** zero-level runs (≥ minSec) + loudness of a file's first audio stream, one decode pass */
function probeAudio(file, { minSec = 0.015, loudness = true } = {}) {
  const af = [`silencedetect=noise=-90dB:d=${minSec}`, ...(loudness ? ["ebur128=peak=sample:framelog=verbose"] : [])].join(",");
  const r = run("ffmpeg", ["-v", "info", "-nostats", "-i", file, "-map", "0:a:0", "-af", af, "-f", "null", "-"]);
  const err = String(r.stderr || "");
  const silences = [];
  const re = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g;
  let m;
  while ((m = re.exec(err))) silences.push({ start: +m[1] - +m[2], end: +m[1], sec: +m[2] });
  const sum = err.slice(err.lastIndexOf("Summary:"));
  const num = (rx) => { const x = sum.match(rx); return x ? +x[1] : null; };
  return { silences, loudness: loudness ? { integratedLufs: num(/I:\s+(-?[\d.]+) LUFS/), lraLu: num(/LRA:\s+(-?[\d.]+) LU/), samplePeakDbfs: num(/Peak:\s+(-?[\d.]+) dBFS/) } : null };
}

const rate = (s) => { const [n, d] = String(s || "0/1").split("/").map(Number); return d ? n / d : 0; };

/**
 * Pure. input: { fps, frames (expected), videoPts[], audioPackets[[pts,dur]], audioStart, videoStart,
 *   sampleRate, chunkSize, segmentStarts[] (frame numbers), filmSilences[], sourceSilences[] | null, narrationSec | null }
 */
function analyze({ fps, frames = null, videoPts, audioPackets, audioStart = 0, videoStart = 0, sampleRate = 48000, chunkSize = null, segmentStarts = [], filmSilences = [], sourceSilences = null, narrationSec = null }) {
  const fd = 1 / fps;
  const aacSec = AAC_FRAME / (sampleRate || 48000);
  const pts = [...videoPts].sort((a, b) => a - b);
  const problems = [];
  const n = pts.length;
  const videoEnd = n ? pts[n - 1] + fd : 0;
  const aLast = audioPackets[audioPackets.length - 1];
  const audioEnd = aLast ? aLast[0] + (aLast[1] || aacSec) : 0;

  // video holds: a frame shown longer than 1.5 frames
  // chunks restart at every segment start (each runner renders its own range in chunkSize pieces)
  const segs = [...new Set([0, ...segmentStarts])].sort((a, b) => a - b);
  const segSet = new Set(segs.filter((s) => s > 0));
  const segStartOf = (i) => { let s = 0; for (const x of segs) if (x <= i) s = x; return s; };
  const holds = [];
  for (let i = 1; i < n; i++) {
    const d = pts[i] - pts[i - 1];
    if (d > fd * 1.5) holds.push({ frame: i, at: +pts[i - 1].toFixed(4), extraSec: +(d - fd).toFixed(4), join: segSet.has(i) ? "segment" : chunkSize && (i - segStartOf(i)) % chunkSize === 0 ? "chunk" : "none" });
  }
  const offGrid = holds.filter((h) => h.join === "none");
  const longHolds = holds.filter((h) => h.extraSec > 0.2);
  // audio timeline continuity
  let audioGaps = 0, audioGapSec = 0;
  for (let i = 1; i < audioPackets.length; i++) {
    const g = audioPackets[i][0] - (audioPackets[i - 1][0] + (audioPackets[i - 1][1] || aacSec));
    if (Math.abs(g) > 0.001) { audioGaps++; audioGapSec += g; }
  }
  const startOffset = +(audioStart - videoStart).toFixed(4);
  const endOffset = +(audioEnd - videoEnd).toFixed(4);
  const endTol = fd + 2 * aacSec;
  if (!n) problems.push("no video packets");
  if (!audioPackets.length) problems.push("no audio packets");
  if (Math.abs(startOffset) > fd) problems.push(`audio starts ${startOffset}s from the video (> 1 frame)`);
  if (n && audioPackets.length && Math.abs(endOffset) > endTol) problems.push(`audio ends ${endOffset}s from the video (> ${endTol.toFixed(3)}s = 1 frame + 2 AAC frames)`);
  if (audioGaps) problems.push(`audio timeline has ${audioGaps} discontinuit${audioGaps === 1 ? "y" : "ies"} (${audioGapSec.toFixed(3)}s)`);
  // without the render's chunk size the grid is unknown: holds are reported, not judged (the state was cleaned)
  if (chunkSize && offGrid.length) problems.push(`${offGrid.length} video hold(s) off the chunk/segment grid (first at frame ${offGrid[0].frame}, ${offGrid[0].at}s)`);
  if (longHolds.length) problems.push(`${longHolds.length} video hold(s) longer than 0.2s (first at frame ${longHolds[0].frame}: +${longHolds[0].extraSec}s)`);
  if (frames && n && n !== frames) problems.push(`video packets ${n} != expected frames ${frames}`);

  // dropouts: zero-level audio runs within 0.15 s of a video hold (a join), compared with the source's own
  const near = (s) => holds.some((h) => s.end >= h.at - 0.15 && s.start <= h.at + h.extraSec + fd + 0.15);
  const joinDropouts = filmSilences.filter((s) => s.sec <= 0.25 && near(s));
  const dropoutSec = joinDropouts.reduce((t, s) => t + s.sec, 0);
  const stretchSec = +(videoEnd - (n || 0) * fd).toFixed(3);
  // CLOCK (2026-11-09): A/V moving together is not enough. The five 2026-11-07 films had the right frame count, holds on
  // the grid and both streams ending together — and ran 7.8-15.1 s longer than their composition (+64 ms per 400-frame
  // join, joins NOT repaired), so clean.vtt (timed to the source) drifted up to 15 s on YouTube. A film is on the
  // composition clock when its N frames last N/fps (2 frames of slack for container rounding); otherwise sync FAILs.
  const clockTolSec = 2 * fd;
  if (n && stretchSec > clockTolSec) {
    const ch = holds.filter((h) => h.join === "chunk").length, sg = holds.filter((h) => h.join === "segment").length;
    problems.push(`the film runs ${stretchSec}s longer than its ${n} frames on the composition clock (${ch} chunk + ${sg} segment join holds) — the chunk joins are not repaired; captions timed to the source (clean.vtt) would drift by up to ${stretchSec}s`);
  }
  return {
    sync: { verdict: problems.length ? "FAIL" : "PASS", startOffsetSec: startOffset, endOffsetSec: endOffset, endToleranceSec: +endTol.toFixed(4), audioDiscontinuities: audioGaps, clock: stretchSec > clockTolSec ? "OFF" : "ON", clockToleranceSec: +clockTolSec.toFixed(4), problems },
    video: { packets: n, endSec: +videoEnd.toFixed(4), holds: holds.length, chunkHolds: holds.filter((h) => h.join === "chunk").length, segmentHolds: holds.filter((h) => h.join === "segment").length, offGridHolds: offGrid.length, stretchSec, stretchPct: n ? +((stretchSec / (n * fd)) * 100).toFixed(3) : null },
    audio: { packets: audioPackets.length, endSec: +audioEnd.toFixed(4), excessOverNarrationSec: narrationSec ? +(audioEnd - narrationSec).toFixed(3) : null },
    joinDropouts: {
      status: joinDropouts.length ? "DEFECT_REPORTED" : "NONE",
      count: joinDropouts.length, totalSec: +dropoutSec.toFixed(3), maxSec: joinDropouts.length ? +Math.max(...joinDropouts.map((s) => s.sec)).toFixed(4) : 0,
      filmZeroRuns: filmSilences.length, sourceZeroRuns: sourceSilences ? sourceSilences.length : null,
      first: joinDropouts.slice(0, 3).map((s) => +s.start.toFixed(3)),
    },
  };
}

/**
 * Measure a film. opts: { expectedFrames, chunkSize, segmentStarts, narrationFile, loudness } → analyze() + loudness.
 * Read-only on every file. ~1 min for a 35-min film (two packet listings + one audio decode, + one for the source).
 */
function measure(file, { expectedFrames = null, chunkSize = null, segmentStarts = [], narrationFile = null, loudness = true } = {}) {
  const st = probeStreams(file);
  if (!st.video) return { file, error: "no video stream", sync: { verdict: "FAIL", problems: ["no video stream"] } };
  const fps = rate(st.video.r_frame_rate) || 30;
  const au = st.audio ? probeAudio(file, { loudness }) : { silences: [], loudness: null };
  let src = null, narrationSec = null;
  if (narrationFile) {
    try {
      src = probeAudio(narrationFile, { loudness: false }).silences;
      narrationSec = parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", narrationFile]).stdout) || null;
    } catch { src = null; }
  }
  const res = analyze({
    fps, frames: expectedFrames, videoPts: st.videoPackets.map((p) => p[0]), audioPackets: st.audioPackets,
    audioStart: st.audio ? +st.audio.start_time || 0 : 0, videoStart: +st.video.start_time || 0, sampleRate: st.audio ? +st.audio.sample_rate : 48000,
    chunkSize, segmentStarts, filmSilences: au.silences, sourceSilences: src, narrationSec,
  });
  return { file, fps, ...res, loudness: au.loudness ? { ...au.loudness, status: "REPORT_ONLY" } : null };
}

module.exports = { analyze, measure, probeStreams, probeAudio };
