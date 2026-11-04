#!/usr/bin/env node
// CHUNK-JOIN REPAIR (cycle 9, 2026-11-04). A split render's chunks each carry their own AAC encoder delay; a stream-copy
// concat keeps it as inserted silence at every join + a held video frame (Hamnet: 159 joins, ~4.4 s of digital
// silence mid-speech, narration 42.7 ms behind the picture). lib/join-repair.js + scripts/repair-joins.js put audio and
// video back on the composition clock. Pure geometry fixtures + one real ffmpeg fixture that reproduces the fault
// (ADTS chunks: the encoder delay becomes real samples, as in the pool's chunks). Run: node scripts/test-join-repair.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const JR = require("./lib/join-repair");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info !== undefined ? `  (${String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300)})` : ""}`); if (!ok) failed++; };
const SR = 48000, FPS = 30, SPF = 1600, AAC = 1024;

// a film timeline as the pool makes it: segments of `segFrames`, chunks of `chunk`, each chunk = H + content + pad
function film({ segFrames, chunk = 400, H = 2048 }) {
  const pts = [], chunks = []; let t0 = 0, samples = 0;
  for (const sf of segFrames) for (let s = 0; s < sf; s += chunk) chunks.push(Math.min(chunk, sf - s));
  chunks.forEach((f) => {
    for (let i = 0; i < f; i++) pts.push(t0 + i / FPS);
    const len = Math.ceil((H + f * SPF) / AAC) * AAC;
    t0 += len / SR; samples += len;
  });
  return { pts, samples, chunks };
}

// ── geometry ────────────────────────────────────────────────────────────────
{
  const f = film({ segFrames: [1259, 1259, 1260] }); // short tail chunks like Hamnet's 6059-frame segments
  const p = JR.plan({ videoPts: f.pts, fps: FPS, audioSamples: f.samples, encoderDelay: 2048 });
  t("plan: pool-shaped film → every chunk found, head 2048, the short tails' pad derived", p.ok && p.chunks.length === f.chunks.length && p.chunks.every((c) => c.headSamples === 2048) && p.chunks.filter((c) => c.frames === 59).every((c) => c.tailSamples === Math.ceil((2048 + 59 * SPF) / AAC) * AAC - 2048 - 59 * SPF), p.reason);
  t("plan: content = frames × 1600 samples, nothing of it counted as inserted", p.ok && p.chunks.reduce((s, c) => s + c.contentSamples, 0) === f.pts.length * SPF);
  t("plan: the holds alone allow a RANGE of heads (here 1857-2048) — H is the encoder's, not guessed", p.ok && p.headRange[0] > 1024 && p.headRange[1] === 2048);
  const q = JR.plan({ videoPts: f.pts, fps: FPS, audioSamples: f.samples, encoderDelay: 1024 });
  t("plan: an encoder delay the joins do not allow → refused (film left as it is)", !q.ok && /not 1024/.test(q.reason));
  const r = JR.plan({ videoPts: f.pts, fps: FPS, audioSamples: f.samples });
  t("plan: no encoder delay given and the range is wide → refused, never 'the largest'", !r.ok);
  const drift = f.pts.slice(); for (let i = 650; i < drift.length; i++) drift[i] += 0.011; // under the hold threshold
  const pd = JR.plan({ videoPts: drift, fps: FPS, audioSamples: f.samples + 528, encoderDelay: 2048 });
  t("plan: an 11 ms shift inside a chunk (below the hold threshold) → refused, not absorbed as padding", !pd.ok && pd.reason.includes("not 1/30 s"), pd.reason);
  const hold = f.pts.slice(); for (let i = 650; i < hold.length; i++) hold[i] += 0.03; // a hold off the chunk grid
  t("plan: a hold no encoder delay explains → refused", !JR.plan({ videoPts: hold, fps: FPS, audioSamples: f.samples + 1440, encoderDelay: 2048 }).ok);
  t("plan: audio length that does not match the geometry → refused", !JR.plan({ videoPts: f.pts, fps: FPS, audioSamples: f.samples + 4096, encoderDelay: 2048 }).ok);
  t("plan: 29.97 fps (no whole samples per frame) → refused", !JR.plan({ videoPts: f.pts, fps: 29.97, audioSamples: f.samples, encoderDelay: 2048 }).ok);
  const one = film({ segFrames: [300] });
  t("plan: a single-chunk film → nothing to repair", JR.plan({ videoPts: one.pts, fps: FPS, audioSamples: one.samples, encoderDelay: 2048 }).nothingToRepair === true);
  t("filter: one sample-exact atrim per chunk, concatenated", /atrim=start_sample=2048:end_sample=642048/.test(JR.audioFilter(JR.plan({ videoPts: film({ segFrames: [800] }).pts, fps: FPS, audioSamples: film({ segFrames: [800] }).samples, encoderDelay: 2048 }))));
  t("setts: decode index × frame ticks, composition offset kept", JR.videoSetts({ ticksPerFrame: 3000, firstDts: -6000 }) === "setts=dts=N*3000-6000:pts=N*3000-6000+PTS-DTS");
}

// ── the head guard ──────────────────────────────────────────────────────────
{
  const f = film({ segFrames: [800] });
  const p = JR.plan({ videoPts: f.pts, fps: FPS, audioSamples: f.samples, encoderDelay: 2048 });
  // speech everywhere except the heads: middle zeros, edges with small leakage (Hamnet's measured shape)
  const inserted = (i) => { const c = p.chunks.find((x) => i >= x.filmStartSample && i < x.filmStartSample + x.headSamples); if (!c) return 20000; const o = i - c.filmStartSample; return o < 400 || o > 1700 ? 1500 : 0; };
  t("guard: zeros in the middle, leakage ≤ 0.1 of the speech at the edges → accepted", JR.checkHeads(inserted, p).ok);
  const content = (i) => 20000; // a head that is really speech (the geometry is wrong)
  const g = JR.checkHeads(content, p);
  t("guard: a head at the speech's own level → refused", !g.ok && g.bad.length === p.chunks.length);
}

// ── the real fault, reproduced with ffmpeg, repaired end to end ─────────────
{
  const have = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" }).stdout.includes("libx264");
  if (!have) console.log("- ffmpeg/libx264 missing: the end-to-end fixture is skipped");
  else {
    const D = fs.mkdtempSync(path.join(os.tmpdir(), "join-repair-"));
    try {
      const ff = (a) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a], { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr); };
      ff(["-f", "lavfi", "-i", "anoisesrc=d=4:c=pink:r=48000:a=0.3:seed=7", "-ac", "2", path.join(D, "src.wav")]);
      const list = [];
      for (let k = 0; k < 4; k++) {
        ff(["-ss", String(k), "-t", "1", "-i", path.join(D, "src.wav"), "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-f", "adts", path.join(D, `a${k}.aac`)]);
        ff(["-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=1", "-i", path.join(D, `a${k}.aac`), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-bf", "2", "-g", "15", "-pix_fmt", "yuv420p", "-c:a", "copy", path.join(D, `c${k}.mp4`)]);
        list.push(`file 'c${k}.mp4'`);
      }
      fs.writeFileSync(path.join(D, "list.txt"), list.join("\n"));
      ff(["-f", "concat", "-safe", "0", "-i", path.join(D, "list.txt"), "-c", "copy", path.join(D, "film.mp4")]);
      const rj = (extra) => spawnSync(process.execPath, [path.join(__dirname, "repair-joins.js"), `--in=${path.join(D, "film.mp4")}`, ...extra, "--json"], { encoding: "utf8" });
      const MV = require("./lib/media-verify");
      const st = MV.probeStreams(path.join(D, "film.mp4"));
      const holds = st.videoPackets.map((x) => x[0]).sort((a, b) => a - b).filter((x, i, a) => i && a[i] - a[i - 1] > 1.5 / 30).length;
      t("fixture: the concat reproduces the fault (3 joins → 3 video holds)", holds === 3);
      let r = rj([`--out=${path.join(D, "x.mp4")}`]);
      t("fixture: the pool's 2048 delay does not fit ffmpeg's chunks → refused, nothing written", r.status === 3 && !fs.existsSync(path.join(D, "x.mp4")), r.stderr);
      r = rj([`--out=${path.join(D, "wrong.mp4")}`, "--encoder-delay=1152"]);
      t("fixture: a wrong head (would cut 128 content samples per chunk) → refused by the audio guard", r.status === 3 && !fs.existsSync(path.join(D, "wrong.mp4")), r.stdout);
      r = rj([`--out=${path.join(D, "fixed.mp4")}`, "--encoder-delay=1024"]);
      const j = (() => { try { return JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch { return {}; } })();
      t("fixture: ffmpeg's own 1024 delay → repaired, verified (frames on N/fps, audio = frames × 1600)", r.status === 0 && j.ok && j.audioDiffSamples === 0 && j.frames === 120, r.stdout + r.stderr);
      const md5 = (f) => spawnSync("ffmpeg", ["-v", "error", "-i", f, "-map", "0:v", "-f", "framemd5", "-"], { encoding: "utf8" }).stdout.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split(",").pop().trim());
      const a = md5(path.join(D, "film.mp4")), b = md5(path.join(D, "fixed.mp4"));
      t("fixture: decoded video frames identical (no re-encode, order kept)", a.length === 120 && a.join() === b.join());
      // the repaired audio sits on the source's clock: best lag 0 everywhere (the film's grows 1024 → 2176 → 3328)
      const dec = (f, from) => { const o = spawnSync("ffmpeg", ["-v", "error", "-ss", String(from), "-t", "0.3", "-i", f, "-map", "0:a:0", "-af", "pan=mono|c0=c0", "-f", "s16le", "-"], { maxBuffer: 1 << 26 }).stdout; const x = new Float64Array(o.length / 2); for (let i = 0; i < x.length; i++) x[i] = o.readInt16LE(i * 2); return x; };
      const lagAt = (f, at) => { const F = dec(f, at), S = dec(path.join(D, "src.wav"), at - 0.1); let best = [0, -2]; for (let L = -4000; L <= 4000; L += 1) { let s = 0, u = 0, v = 0; for (let i = 0; i < 9000; i += 3) { const y = S[4800 + i - L]; if (y === undefined) continue; s += F[i] * y; u += F[i] * F[i]; v += y * y; } const c = s / Math.sqrt(u * v || 1); if (c > best[1]) best = [L, c]; } return best; };
      const lagsFilm = [0.4, 1.5, 2.5].map((x) => lagAt(path.join(D, "film.mp4"), x)[0]);
      const lagsFixed = [0.4, 1.5, 2.5, 3.4].map((x) => lagAt(path.join(D, "fixed.mp4"), x));
      t("fixture: before — the audio drifts 1024 → 2176 → 3328 samples behind the source", JSON.stringify(lagsFilm) === "[1024,2176,3328]", lagsFilm);
      t("fixture: after — lag 0 at every point, correlation > 0.85 (content kept)", lagsFixed.every(([L, c]) => L === 0 && c > 0.85), lagsFixed);
      r = spawnSync(process.execPath, [path.join(__dirname, "repair-joins.js"), `--in=${path.join(D, "film.mp4")}`, `--out=${path.join(D, "film.mp4")}`], { encoding: "utf8" });
      t("the input is never edited (--out = --in refused)", r.status === 2);
    } finally { fs.rmSync(D, { recursive: true, force: true }); }
  }
}

// ── wired into cloud assembly with the old behaviour as the fallback ─────────
{
  const src = fs.readFileSync(path.join(__dirname, "render-cloud-assemble.js"), "utf8");
  t("cloud assembly runs the repair, verifies the result, else delivers the film as concatenated", /repair-joins\.js/.test(src) && /CA\.verifyFilm\(fixed, expected\)/.test(src) && /NOT_REPAIRED/.test(src) && /no-join-repair/.test(src));
  t("the sha256 in the cloud report is taken AFTER the repair (the downloaded film is the repaired one)", src.indexOf("repair-joins.js") < src.indexOf("fin.sha256 = await CA.sha256File(out)"));
}

console.log(failed ? `\n${failed} FAILED` : "\nall join-repair checks passed");
process.exit(failed ? 1 : 0);
