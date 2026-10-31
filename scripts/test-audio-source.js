#!/usr/bin/env node
/**
 * test-audio-source.js — the narration may be .mp3 or .m4a (scripts/lib/audio-source.js, 2026-10-26).
 * Real ffmpeg fixtures (synthetic speech-band noise, so no book audio is needed): format by content, decode QC,
 * MP3-vs-M4A choice, two-recordings stop, VTT gaps, mastered → raw resolution (bundle + runner preflight), the
 * 100 MB GitHub limit, and master-audio end to end on an MP3 (one AAC transcode, -14 LUFS, no duration drift).
 *   node scripts/test-audio-source.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const A = require("./lib/audio-source");
const { checkMasteredAudio } = require("./lib/render-preflight");

let fail = 0;
const t = (name, ok, extra) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? "  → " + extra : ""}`); if (!ok) fail++; };
const ff = (argv) => { const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv], { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr); };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "audio-src-"));
const ROOT = path.join(TMP, "repo");
fs.mkdirSync(path.join(ROOT, "public", "audio"), { recursive: true });
const AUD = (f) => path.join(ROOT, "public", "audio", f);
const book = (slug, manifest) => { fs.mkdirSync(path.join(ROOT, "books", slug), { recursive: true }); fs.writeFileSync(path.join(ROOT, "books", slug, "book.json"), JSON.stringify(manifest)); };
const vtt = (file, endS) => { const hh = (s) => new Date(s * 1000).toISOString().slice(11, 23); fs.writeFileSync(file, `WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nhello\n\n${hh(endS - 5)} --> ${hh(endS)}\nthe end\n`); };

try {
  // one 40 s "recording" (band-limited noise at a quiet, narration-like level), encoded two ways
  const SRC = path.join(TMP, "src.wav");
  ff(["-f", "lavfi", "-i", "anoisesrc=d=40:c=pink:a=0.05", "-af", "highpass=f=120,lowpass=f=6000", "-ar", "44100", "-ac", "1", SRC]);
  // encode each format ONCE, then copy (the native AAC encoder is slow on a busy machine)
  const MP3 = path.join(TMP, "one.mp3"), M4A = path.join(TMP, "one.m4a");
  ff(["-i", SRC, "-c:a", "libmp3lame", "-b:a", "128k", MP3]);
  ff(["-i", SRC, "-c:a", "aac", "-aac_coder", "fast", "-b:a", "256k", M4A]);
  const mp3 = (dst) => fs.copyFileSync(MP3, dst);
  const m4a = (dst) => fs.copyFileSync(M4A, dst);

  // ── 1. MP3-only book ──
  mp3(AUD("solo.mp3"));
  let c = A.chooseNarration(ROOT, "solo");
  t("MP3-only: chosen, valid, decoded length ≈ 40 s", c.rel === "public/audio/solo.mp3" && !c.problems.length && Math.abs(c.duration - 40) < 0.2, JSON.stringify(c.problems));

  // ── 2. M4A-only book (every existing book) ──
  m4a(AUD("old.m4a"));
  c = A.chooseNarration(ROOT, "old");
  t("M4A-only: chosen as before", c.rel === "public/audio/old.m4a" && !c.problems.length);

  // ── 3. both, one recording → the smaller valid one (the MP3) ──
  mp3(AUD("both.mp3")); m4a(AUD("both.m4a"));
  c = A.chooseNarration(ROOT, "both");
  const sz = (f) => fs.statSync(AUD(f)).size;
  t("both, same recording: the smaller file wins", c.rel === (sz("both.mp3") < sz("both.m4a") ? "public/audio/both.mp3" : "public/audio/both.m4a") && !c.problems.length, c.reason);
  t("both: the MP3 here really is smaller (fixture sanity)", sz("both.mp3") < sz("both.m4a"));

  // ── 4. both, DIFFERENT recordings → stop, never pick silently ──
  mp3(AUD("diff.mp3")); ff(["-i", M4A, "-t", "33", "-c", "copy", AUD("diff.m4a")]);
  c = A.chooseNarration(ROOT, "diff");
  t("two different lengths: problem, nothing chosen", c.rel === null && c.problems.some((p) => /different recordings/.test(p)), JSON.stringify(c.problems));

  // ── 5. the real format, not the extension ──
  fs.writeFileSync(AUD("fake.mp3"), "this is not audio\n".repeat(200));
  c = A.chooseNarration(ROOT, "fake");
  t("a text file named .mp3: problem (no audio stream)", c.rel === null && c.problems.some((p) => /no audio stream/.test(p)));
  ff(["-i", M4A, "-c", "copy", "-f", "mp4", AUD("disguised.mp3")]);
  c = A.chooseNarration(ROOT, "disguised");
  t("AAC inside a .mp3 name: usable, but warned", c.rel === "public/audio/disguised.mp3" && c.warnings.some((w) => /really aac/.test(w)), JSON.stringify(c.warnings));

  // ── 6. decode QC: a corrupted middle must not pass ──
  const good = fs.readFileSync(AUD("solo.mp3"));
  const bad = Buffer.from(good);
  for (let i = Math.floor(bad.length * 0.4); i < Math.floor(bad.length * 0.4) + 40000; i++) bad[i] = (i * 7919) & 0xff;
  fs.writeFileSync(AUD("broken.mp3"), bad);
  c = A.chooseNarration(ROOT, "broken");
  t("MP3 with a corrupted middle: decode errors → problem", c.rel === null && c.problems.some((p) => /decode error/.test(p)), JSON.stringify(c.problems).slice(0, 300));
  // …and when a sound M4A of the same recording is also there, the broken MP3 is ignored (warned), not chosen
  fs.copyFileSync(AUD("broken.mp3"), AUD("fallback.mp3")); m4a(AUD("fallback.m4a"));
  c = A.chooseNarration(ROOT, "fallback");
  t("broken MP3 + sound M4A: the M4A is used, the MP3 is reported", c.rel === "public/audio/fallback.m4a" && c.warnings.some((w) => /ignored: .*decode error/.test(w)));

  // ── 7. audio vs captions: a gap is never accepted silently ──
  const V = path.join(TMP, "x.vtt");
  vtt(V, 39.5); c = A.chooseNarration(ROOT, "solo", { vtt: V });
  t("captions end with the audio: fine", !c.problems.length, JSON.stringify(c.problems));
  vtt(V, 55); c = A.chooseNarration(ROOT, "solo", { vtt: V });
  t("captions longer than the audio: problem", c.problems.some((p) => /another recording/.test(p)));
  t("audio much longer than its captions: problem", A.durationVsVtt(3600, 3000).problems.length === 1 && A.durationVsVtt(3600, 3590).problems.length === 0);

  // ── 8. mastered → raw (what the bundle ships, what the runner compares) ──
  book("both", { audioSource: "public/audio/both.mp3" });
  t("rawAudioFor: book.json audioSource (mp3) wins", A.rawAudioFor(ROOT, "audio/both.mastered.m4a", "both") === "audio/both.mp3");
  book("both", {});
  t("rawAudioFor: no audioSource → legacy m4a first (pinned books unchanged)", A.rawAudioFor(ROOT, "audio/both.mastered.m4a", "both") === "audio/both.m4a");
  t("rawAudioFor: MP3-only book → the mp3", A.rawAudioFor(ROOT, "audio/solo.mastered.m4a", "solo") === "audio/solo.mp3");
  t("rawAudioFor: a raw path passes through", A.rawAudioFor(ROOT, "audio/solo.mp3", "solo") === "audio/solo.mp3");

  // ── 9. GitHub's 100 MB file limit, checked before any push ──
  const big = AUD("huge.m4a");
  const fd = fs.openSync(big, "w"); fs.ftruncateSync(fd, A.GITHUB_FILE_LIMIT + 1); fs.closeSync(fd);
  t("oversize: a 100 MB + 1 B file is caught, a small one is not", A.oversize(ROOT, ["public/audio/huge.m4a", "public/audio/solo.mp3"]).map((b) => b.rel).join() === "public/audio/huge.m4a");
  fs.unlinkSync(big);

  // ── 10. master-audio end to end on the MP3 + the runner's preflight gate ──
  const r = spawnSync(process.execPath, [path.join(__dirname, "master-audio.js"), `--audio=${AUD("solo.mp3")}`, `--out=${AUD("solo.mastered.m4a")}`, "--quiet"], { encoding: "utf8" });
  t("master-audio masters an MP3 (exit 0)", r.status === 0, (r.stderr || "").slice(-400));
  const out = A.probe(AUD("solo.mastered.m4a"));
  t("mastered output is AAC 48 kHz (one transcode from the MP3)", out && out.codec === "aac" && out.sampleRate === 48000, JSON.stringify(out));
  const lufs = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", AUD("solo.mastered.m4a"), "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const I = parseFloat(((lufs.stderr || "").match(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+)/) || [])[1]);
  t("mastered loudness ≈ -14 LUFS", Math.abs(I + 14) < 1, String(I));
  fs.writeFileSync(path.join(ROOT, "books", "solo-config.json"), JSON.stringify({ meta: { audio: "audio/solo.mastered.m4a" } }));
  const pf = checkMasteredAudio({ root: ROOT, configFile: "books/solo-config.json" });
  t("runner preflight passes: mastered vs MP3 raw within 0.1 s", pf.ok, pf.detail);
  const r2 = spawnSync(process.execPath, [path.join(__dirname, "master-audio.js"), `--audio=${AUD("fake.mp3")}`, `--out=${AUD("fake.mastered.m4a")}`, "--quiet"], { encoding: "utf8" });
  t("master-audio refuses a non-audio .mp3 before mastering", r2.status === 1 && /no audio stream/.test(r2.stderr) && !fs.existsSync(AUD("fake.mastered.m4a")));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} audio-source check(s) FAILED` : "\nall audio-source checks passed");
process.exit(fail ? 1 : 0);
