#!/usr/bin/env node
/**
 * repair-joins.js — put a split-render film back on the composition clock (lib/join-repair.js). Never edits its input.
 *
 *   node scripts/repair-joins.js --in=<film.mp4> --out=<repaired.mp4> [--check] [--json] [--encoder-delay=<samples>]
 *
 * --excerpt: an A/B excerpt cut from a film (audio may run past the last whole chunk; it is dropped).
 * --check: plan + audio guard only (read-only). Without it: writes --out (video packets copied with N/fps timestamps,
 * audio = every chunk's content samples, one AAC encode at the input's bitrate), then verifies the result:
 * same frame count, video pts == N/fps, audio length == frames × sr/fps (± one AAC frame), no join holds left.
 * Refuses (exit 3, nothing written) when the joins do not follow one encoder delay, or a head about to be cut does not
 * look like an inserted head (lib/join-repair.js checkHeads: digital silence in its middle, codec leakage only at its
 * edges, far below the speech beside it). Exit 0 repaired / nothing to repair, 1 verify failed, 2 usage, 3 refused.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const JR = require("./lib/join-repair");
const MV = require("./lib/media-verify");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
if (!args.in || (!args.check && !args.out)) { console.error("usage: node scripts/repair-joins.js --in=<film.mp4> --out=<repaired.mp4> [--check] [--json] [--excerpt] [--encoder-delay=<samples>]"); process.exit(2); }
const IN = path.resolve(args.in);
if (!fs.existsSync(IN)) { console.error(`❌ ${IN} not found`); process.exit(2); }
const OUT = args.out ? path.resolve(args.out) : null;
if (OUT && path.resolve(OUT) === IN) { console.error("❌ --out must be a new file (the input is never edited)"); process.exit(2); }
// the encoder delay of the chunks' audio: the render pool's Remotion chunks carry 2048 samples (measured on Hamnet,
// 2026-11-04, by correlation with the source narration). Another encoder → --encoder-delay=<samples>.
const ENCODER_DELAY = args["encoder-delay"] !== undefined ? Number(args["encoder-delay"]) : 2048;
const run = (a) => spawnSync("ffmpeg", a, { encoding: "buffer", maxBuffer: 1 << 30, windowsHide: true });
const json = (o) => (args.json ? console.log(JSON.stringify(o, null, 2)) : null);

function probe(file) {
  const st = MV.probeStreams(file);
  const h = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,time_base,bit_rate,sample_rate,channels,duration_ts", "-of", "json", file], { encoding: "utf8" }).stdout || "{}");
  const vh = (h.streams || []).find((s) => s.codec_type === "video") || {};
  const ah = (h.streams || []).find((s) => s.codec_type === "audio") || {};
  const fps = (() => { const [a, b] = String(st.video && st.video.r_frame_rate || "30/1").split("/").map(Number); return b ? a / b : 30; })();
  return { st, fps, vtb: vh.time_base, abr: Number(ah.bit_rate) || 192000, sr: Number(ah.sample_rate) || 48000, ch: Number(ah.channels) || 2, audioSamples: Number(ah.duration_ts) || null };
}

/** the heads about to be cut, checked against the inserted-head signature (mono mix of channel 0, decoded once) */
function heads(file, p) {
  const b = run(["-v", "error", "-i", file, "-map", "0:a:0", "-af", "pan=mono|c0=c0", "-ar", String(p.sampleRate), "-f", "s16le", "-"]).stdout;
  const sample = (i) => (i >= 0 && i * 2 + 1 < b.length ? b.readInt16LE(i * 2) : 0);
  // + the extra flush frames a hold-read plan cuts (2026-11-09): quiet too, or nothing is repaired
  return { ...JR.checkHeads(sample, p), tails: JR.checkTails(sample, p) };
}

const P = probe(IN);
const pl = JR.plan({ videoPts: P.st.videoPackets.map((x) => x[0]), fps: P.fps, sampleRate: P.sr, audioSamples: P.audioSamples, excerpt: !!args.excerpt, encoderDelay: ENCODER_DELAY });
if (!pl.ok) { console.error(`❌ not repaired: ${pl.reason}`); json({ ok: false, reason: pl.reason }); process.exit(3); }
if (pl.nothingToRepair) { console.log(`✓ ${path.basename(IN)}: no chunk joins — nothing to repair`); json({ ok: true, nothingToRepair: true }); process.exit(0); }
const hc = heads(IN, pl);
const summary = { joins: pl.joins, encoderDelaySamples: pl.H, headRange: pl.headRange, insertedSec: pl.insertedSec, headMidPeakMax: Math.max(...hc.rows.map((r) => r.midPeak)), headEdgePeakMax: Math.max(...hc.rows.map((r) => r.edgePeak)), headsRefused: hc.bad.length };
console.log(`plan: ${pl.chunks.length} chunks, ${pl.joins} joins, head ${pl.H} samples (fits ${pl.headRange.join("–")}), inserted ${pl.insertedSec}s; heads: middle peak ≤ ${summary.headMidPeakMax}, edge peak ≤ ${summary.headEdgePeakMax}`);
if (!hc.ok) { const b = hc.bad[0]; console.error(`❌ not repaired: ${hc.bad.length} head(s) do not look inserted (chunk ${b.chunk}: middle ${b.midPeak}, edge ${b.edgePeak} vs speech ${b.neighbourPeak}) — the geometry is not what the joins say`); json({ ok: false, ...summary, bad: hc.bad }); process.exit(3); }
if (!hc.tails.ok) { const b = hc.tails.bad[0]; console.error(`❌ not repaired: ${hc.tails.bad.length} extra tail frame(s) carry signal (chunk ${b.chunk}: middle ${b.midPeak} vs speech ${b.neighbourPeak}) — not a flush frame`); json({ ok: false, ...summary, badTails: hc.tails.bad }); process.exit(3); }
summary.extraTailFrames = pl.extraTailFrames || 0; summary.tailMidPeakMax = hc.tails.rows.length ? Math.max(...hc.tails.rows.map((r) => r.midPeak)) : null;
if (pl.extraTailFrames) console.log(`tails: ${pl.extraTailFrames} chunk(s) carry one extra AAC flush frame (${pl.tailRule}); middle peak ≤ ${summary.tailMidPeakMax}`);
if (args.check) { json({ ok: true, check: true, ...summary }); process.exit(0); }

// video: same packets, N/fps clock (time base of the input track), composition offsets kept
const [tn, td] = String(P.vtb || "1/90000").split("/").map(Number);
const ticks = Math.round(td / tn / P.fps);
const firstDts = (() => { const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-read_intervals", "%+#1", "-show_entries", "packet=dts", "-of", "csv=p=0", IN], { encoding: "utf8" }); return parseInt(String(r.stdout).trim(), 10) || 0; })();
const tmpV = `${OUT}.video.mp4`;
let r = run(["-v", "error", "-y", "-i", IN, "-map", "0:v:0", "-c", "copy", "-bsf:v", JR.videoSetts({ ticksPerFrame: ticks, firstDts }), "-video_track_timescale", String(td / tn), tmpV]);
if (r.status !== 0) { console.error(`❌ video retime failed: ${String(r.stderr).slice(0, 400)}`); process.exit(1); }
r = run(["-v", "error", "-y", "-i", tmpV, "-i", IN, "-filter_complex", JR.audioFilter(pl, "1:a:0"), "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", String(P.abr), "-ar", String(P.sr), "-movflags", "+faststart", OUT]);
fs.rmSync(tmpV, { force: true });
if (r.status !== 0) { console.error(`❌ mux failed: ${String(r.stderr).slice(0, 400)}`); process.exit(1); }

// verify the result on its own terms
const Q = probe(OUT);
const vp = Q.st.videoPackets.map((x) => x[0]).sort((a, b) => a - b);
const fd = 1 / Q.fps;
const offClock = vp.filter((t, i) => Math.abs(t - i * fd) > fd / 2).length;
const expectSamples = vp.length * (Q.sr / Q.fps);
const audioDiff = (Q.audioSamples || 0) - expectSamples;
const problems = [];
if (vp.length !== P.st.videoPackets.length) problems.push(`frames ${vp.length} != input ${P.st.videoPackets.length}`);
if (offClock) problems.push(`${offClock} frame(s) not at N/fps`);
if (Math.abs(audioDiff) > 2 * JR.AAC) problems.push(`audio ${Q.audioSamples} samples vs ${expectSamples} expected (${audioDiff})`);
const out = { ok: !problems.length, in: IN, out: OUT, ...summary, frames: vp.length, audioSamples: Q.audioSamples, audioDiffSamples: audioDiff, problems };
json(out);
if (!args.json) console.log(problems.length ? `❌ verify: ${problems.join("; ")}` : `✅ ${path.basename(OUT)}: ${vp.length} frames on the N/fps clock, audio ${Q.audioSamples} samples (${audioDiff >= 0 ? "+" : ""}${audioDiff} vs frames), ${pl.joins} joins repaired`);
process.exit(problems.length ? 1 : 0);
