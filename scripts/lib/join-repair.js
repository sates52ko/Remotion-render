/**
 * join-repair.js — undo the chunk-join artifact of a split render, sample-exact (cycle 9, 2026-11-04).
 *
 * Root cause (measured on Hamnet, 2026-11-03/04): every chunk is rendered as its own MP4 (`remotion render --frames=a-b`)
 * with its own AAC track. Each chunk's audio starts with H encoder-delay samples (H = 2048 on the pool: the narration in
 * the film lags the source by exactly 2048 samples before the first join, 4096 after it, correlation 0.9999) and is
 * padded at its end to a whole AAC frame (1024 samples). `ffmpeg -f concat -c copy` keeps those samples as audio and
 * starts the next chunk after the longest stream, so at every join the narration gets H (+ pad) samples of near/exact
 * digital silence and the video holds its last frame for the same time. Nothing is lost — it is INSERTED: the film is
 * 0.35 % long, A/V stay together (the narration is constantly ~H late), and speech is cut by a 20-45 ms gap every chunk.
 *
 * Repair = put both streams back on the composition clock, keeping every rendered sample and frame:
 *   audio: keep exactly frames_j × sr/fps content samples of chunk j, starting H samples after the chunk's start; drop
 *          the H head + the tail pad; one AAC encode of the joined result (SFX and narration alike — no source swap);
 *   video: the same packets in the same order, timestamps rewritten to N/fps (decode index) keeping each packet's
 *          composition offset (setts) — no re-encode; decoded frames are identical.
 * The geometry comes from the film itself: a video hold (> 1.5 frames) marks a chunk start; H is solved so that every
 * chunk's AAC length rounds up exactly to what the holds show. If any join disagrees, plan() refuses — the film is left
 * as it is (never a guess). Pure planning here (tested with fixtures); scripts/repair-joins.js applies it with ffmpeg.
 */

const AAC = 1024;

/**
 * videoPts: presentation times (s) of every frame, any order. audioSamples: total decoded audio samples of the film.
 * → { ok, reason?, H, chunks: [{ startFrame, frames, filmStartSample, headSamples, contentSamples, tailSamples }], ... }
 */
function plan({ videoPts, fps, sampleRate = 48000, audioSamples, maxHead = 4096, excerpt = false, encoderDelay = null }) {
  const fd = 1 / fps;
  const spf = sampleRate / fps;
  if (!Number.isInteger(spf)) return { ok: false, reason: `${sampleRate} Hz / ${fps} fps is not a whole number of samples per frame — not repaired` };
  const pts = [...videoPts].sort((a, b) => a - b);
  const n = pts.length;
  if (n < 2) return { ok: false, reason: "no video timeline" };
  // chunk starts: frame 0 and every frame that follows a hold
  const starts = [0];
  const holdExtra = []; // samples inserted before chunk k (k ≥ 1)
  let irregular = 0;
  for (let i = 1; i < n; i++) {
    const d = pts[i] - pts[i - 1];
    if (d > fd * 1.5) { starts.push(i); holdExtra.push(Math.round((d - fd) * sampleRate)); }
    else if (Math.abs(d - fd) > 0.0005) irregular++; // inside a chunk every frame is exactly 1/fps after the last
  }
  if (irregular) return { ok: false, reason: `${irregular} frame interval(s) inside a chunk are not 1/${fps} s — the timeline is not the chunk-join pattern; not repaired` };
  if (starts.length === 1) return { ok: true, H: 0, chunks: [], nothingToRepair: true, reason: "no chunk joins in this film" };
  const frames = starts.map((s, k) => (k + 1 < starts.length ? starts[k + 1] : n) - s);
  // a chunk occupies ceil((H + content) / 1024) AAC frames; the hold before chunk k+1 = that length − content
  const lenOf = (H, k) => Math.ceil((H + frames[k] * spf) / AAC) * AAC;
  const fits = (H) => holdExtra.every((e, k) => Math.abs(lenOf(H, k) - frames[k] * spf - e) <= 2);
  const cands = [];
  for (let H = 0; H <= maxHead; H++) if (fits(H)) cands.push(H);
  if (!cands.length) return { ok: false, reason: "the joins do not follow one encoder delay (no H fits every hold) — not repaired" };
  // The holds pin H + tail per chunk, i.e. only a RANGE of H (Hamnet: 1857-2048) — where the head ends is the ENCODER's
  // delay, not something the holds can tell (a synthetic ffmpeg fixture: range 129-1152, real delay 1024; "largest"
  // would have cut 128 content samples per chunk — checkHeads refused it). So H is the known delay of the encoder that
  // made the chunks (render pool / Remotion: 2048, proven on Hamnet by correlation with the source narration: lag
  // exactly 2048 before the first join, 4096 after, r = 0.9998). Not in the range → not repaired.
  if (encoderDelay == null) return cands.length === 1 ? finish(cands[0]) : { ok: false, reason: `encoder delay not given and the joins allow ${cands[0]}-${cands[cands.length - 1]} — not repaired` };
  if (!cands.includes(encoderDelay)) return { ok: false, reason: `the joins allow an encoder delay of ${cands[0]}-${cands[cands.length - 1]} samples, not ${encoderDelay} — a different encoder made these chunks; not repaired` };
  return finish(encoderDelay);

  function finish(H) {
    let at = 0;
    const chunks = frames.map((f, k) => {
      const len = k + 1 < frames.length ? lenOf(H, k) : null;
      const c = { startFrame: starts[k], frames: f, filmStartSample: at, headSamples: H, contentSamples: f * spf, tailSamples: len === null ? null : len - H - f * spf };
      at += len === null ? 0 : len;
      return c;
    });
    const last = chunks[chunks.length - 1];
    const remaining = audioSamples - last.filmStartSample - H - last.contentSamples;
    // a whole film ends inside its last AAC frame; an EXCERPT (A/B tests only) may carry the next chunk's start after it
    if (remaining < -2 || (!excerpt && remaining >= AAC + 2)) return { ok: false, reason: `the audio length does not match the chunk geometry (last chunk leaves ${remaining} samples) — not repaired` };
    last.tailSamples = Math.max(0, remaining);
    const inserted = chunks.reduce((s, c) => s + c.headSamples + c.tailSamples, 0);
    return { ok: true, H, headRange: [cands[0], cands[cands.length - 1]], chunks, joins: starts.length - 1, insertedSamples: inserted, insertedSec: +(inserted / sampleRate).toFixed(3), contentSamples: n * spf, sampleRate, fps };
  }
}

/**
 * The audio signature of an inserted head: codec leakage, well below the signal beside it. Measured: Hamnet (render
 * pool, 2048-sample heads) — middle exact zeros (≤ 30), edges ≤ 1600 next to 13000-25000 speech (MDCT tail of the
 * previous chunk / pre-echo of the next); an ffmpeg-encoded fixture (1024-sample heads) — pre-echo across the whole
 * head, ≤ 0.21 of the neighbouring signal. Content in a head (a wrong geometry) sits at the neighbour's level (a fixture
 * cut 128 samples early: 2950 vs 2967) — refused. sample(i) → int16 of the mono mix; returns per-chunk rows + ok.
 */
function checkHeads(sample, p, { midRatio = 0.2, edgeRatio = 0.4, floor = 64 } = {}) {
  const rows = p.chunks.map((c, k) => {
    const s = c.filmStartSample, H = c.headSamples;
    let mid = 0, edge = 0, near = 0;
    for (let i = 0; i < H; i++) {
      const v = Math.abs(sample(s + i));
      if (i >= H / 4 && i < (3 * H) / 4) mid = Math.max(mid, v); else edge = Math.max(edge, v);
    }
    // the speech beside the head: 50 ms after it, and 50 ms before it (the previous chunk's end)
    const W = Math.round(p.sampleRate * 0.05);
    for (let i = s + H; i < s + H + W; i++) near = Math.max(near, Math.abs(sample(i)));
    if (k > 0) for (let i = s - W; i < s; i++) near = Math.max(near, Math.abs(sample(i)));
    const ok = mid <= Math.max(floor, midRatio * near) && edge <= Math.max(floor, edgeRatio * near);
    return { chunk: k, midPeak: mid, edgePeak: edge, neighbourPeak: near, ok };
  });
  return { ok: rows.every((r) => r.ok), rows, bad: rows.filter((r) => !r.ok) };
}

/** the ffmpeg audio filter that keeps exactly the content of every chunk (sample-exact atrim + concat) */
function audioFilter(p, input = "0:a:0") {
  const k = p.chunks.length;
  const parts = [`[${input}]asplit=${k}${p.chunks.map((_, i) => `[s${i}]`).join("")}`];
  p.chunks.forEach((c, i) => {
    const a = c.filmStartSample + c.headSamples;
    parts.push(`[s${i}]atrim=start_sample=${a}:end_sample=${a + c.contentSamples},asetpts=N/SR/TB[c${i}]`);
  });
  parts.push(`${p.chunks.map((_, i) => `[c${i}]`).join("")}concat=n=${k}:v=0:a=1[aout]`);
  return parts.join(";");
}

/** setts expression: decode index N → N frames, each packet keeps its composition offset (PTS − DTS) */
function videoSetts({ ticksPerFrame, firstDts }) {
  return `setts=dts=N*${ticksPerFrame}${firstDts >= 0 ? "+" : ""}${firstDts}:pts=N*${ticksPerFrame}${firstDts >= 0 ? "+" : ""}${firstDts}+PTS-DTS`;
}

module.exports = { plan, checkHeads, audioFilter, videoSetts, AAC };
