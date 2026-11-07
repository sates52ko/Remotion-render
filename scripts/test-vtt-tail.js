#!/usr/bin/env node
// AUDIO/VTT BOUNDARY (2026-10-29): fix-vtt-tail.js clamps the END of the final cue to the audio end ONLY when that is
// provable ASR padding (the-magician-s-nephew: last cue end 1918.640 vs MP3 1916.459, speech ends 1916.112) — and
// refuses every case that could be a real input mismatch. The make-book gate's +2 s tolerance never changes.
// Fixtures: a synthetic narration (tone = speech, gaps = pauses) with captions aligned to it.
// Run: node scripts/test-vtt-tail.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 500)})` : ""}`); if (!ok) failed++; };
const AS = require("./lib/audio-source");
const VT = require("./lib/vtt-tail");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vtt-tail-"));
const fmt = VT.fmt;

// ── the narration: 15 "words" of 1.6 s speech each with 0.5 s pauses, then 0.4 s of silence to EOF (~32 s) ───────────
const SPEECH = 1.6, GAP = 0.5, N = 15, TAILSIL = 0.4;
const onsets = Array.from({ length: N }, (_, k) => k * (SPEECH + GAP));
const audioLen = onsets[N - 1] + SPEECH + TAILSIL;
const mkAudio = (file, { tail = TAILSIL } = {}) => {
  const parts = [], inputs = [];
  for (let k = 0; k < N; k++) {
    inputs.push("-f", "lavfi", "-i", `sine=frequency=${300 + k * 20}:duration=${SPEECH}:sample_rate=44100`);
    const gap = k < N - 1 ? GAP : tail;
    if (gap > 0) inputs.push("-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono:d=${gap}`);
  }
  const n = inputs.filter((x) => x === "-i").length;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-y", ...inputs, "-filter_complex", `${Array.from({ length: n }, (_, k) => `[${k}:a]`).join("")}concat=n=${n}:v=0:a=1[a]`, "-map", "[a]", "-c:a", "libmp3lame", "-b:a", "128k", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr.slice(-400));
};
// a YouTube-style rolling VTT: each cue = 3 words with inline word times; the last cue's END is `lastEnd`
const mkVtt = ({ shift = 0, lastEnd = null, lastStart = null, middleEndPast = false, wordPast = false } = {}) => {
  let v = "WEBVTT\nKind: captions\nLanguage: en\n\n";
  for (let c = 0; c < N / 3; c++) {
    const w = onsets.slice(c * 3, c * 3 + 3).map((x) => x + shift);
    const start = lastStart != null && c === N / 3 - 1 ? lastStart : w[0];
    let end = c < N / 3 - 1 ? onsets[(c + 1) * 3] + shift : (lastEnd != null ? lastEnd : w[2] + SPEECH);
    if (middleEndPast && c === 1) end = audioLen + 1.5;
    const third = wordPast && c === N / 3 - 1 ? audioLen + 0.3 : w[2];
    v += `${fmt(start)} --> ${fmt(end)} align:start position:0%\n \nword${c * 3}<${fmt(w[1])}><c> word${c * 3 + 1}</c><${fmt(third)}><c> word${c * 3 + 2}</c>\n\n`;
  }
  return v;
};
const ROOT = path.join(tmp, "root");
const SLUG = "zz-tail";
const audio = path.join(ROOT, "public", "audio", `${SLUG}.mp3`);
const vtt = path.join(ROOT, "public", "captions", `${SLUG}.vtt`);
fs.mkdirSync(path.dirname(audio), { recursive: true });
fs.mkdirSync(path.dirname(vtt), { recursive: true });
const run = (...extra) => spawnSync(process.execPath, [path.join(__dirname, "fix-vtt-tail.js"), `--slug=${SLUG}`, `--root=${ROOT}`, ...extra], { encoding: "utf8" });
try {
  mkAudio(audio);
  const E = AS.validate(audio, { full: true }).info.duration;
  t("fixture: the synthetic narration decodes to its planned length (±0.1 s)", Math.abs(E - audioLen) < 0.1, `${E} vs ${audioLen}`);

  // (A) the magician's-nephew case: the final cue's END padded 2.18 s past the file; speech ends inside -> CLAMP
  const padded = mkVtt({ lastEnd: E + 2.18 });
  fs.writeFileSync(vtt, padded);
  t("the gate (unchanged +2 s) refuses the padded VTT, and its message names the verifying tool", AS.durationVsVtt(E, AS.vttEnd(vtt)).problems.some((p) => /another recording/.test(p) && /fix-vtt-tail\.js/.test(p)));
  let r = run("--dry");
  t("--dry: plans the clamp, writes nothing", r.status === 0 && /CLAMP/.test(r.stdout) && fs.readFileSync(vtt, "utf8") === padded && !fs.existsSync(vtt + ".pre-tail-clamp.bak"), r.stdout + r.stderr);
  r = run();
  const out = fs.readFileSync(vtt, "utf8");
  t("apply: exit 0, original kept byte-for-byte as .pre-tail-clamp.bak", r.status === 0 && fs.readFileSync(vtt + ".pre-tail-clamp.bak", "utf8") === padded, r.stdout + r.stderr);
  const a = padded.split("\n"), b = out.split("\n");
  const diff = a.map((x, k) => (x !== b[k] ? k : -1)).filter((k) => k >= 0);
  t("only ONE line changed — the final cue's timing line, its start kept, its end = the audio end", diff.length === 1 && a[diff[0]].split(" --> ")[0] === b[diff[0]].split(" --> ")[0] && b[diff[0]].includes(`--> ${fmt(Math.floor(E * 1000) / 1000)}`), JSON.stringify(diff.map((k) => [a[k], b[k]])));
  t("text and every other cue untouched (same line count, same words)", a.length === b.length && a.filter((x) => !/-->/.test(x)).join("\n") === b.filter((x) => !/-->/.test(x)).join("\n"));
  const cues = VT.parseCues(out).cues;
  t("cue order kept and every start < its end", cues.every((c, k) => c.start < c.end && (k === 0 || c.start >= cues[k - 1].start)));
  t("the SAME gate now passes (tolerance unchanged)", AS.durationVsVtt(E, AS.vttEnd(vtt)).problems.length === 0);
  const rec = JSON.parse(fs.readFileSync(path.join(ROOT, "books", SLUG, "vtt-tail-clamp.json"), "utf8"));
  t("recorded: before/after hashes, audio hash, the change and the evidence (no silent edit)", rec.runs.length === 1 && rec.runs[0].vttSha256Before !== rec.runs[0].vttSha256After && rec.runs[0].audioSha256 && rec.runs[0].changes.length === 1 && rec.runs[0].evidence.alignedPauses >= 1);
  r = run();
  t("a second run: nothing to do, the backup is not overwritten", r.status === 0 && /NOTHING_TO_DO/.test(r.stdout) && fs.readFileSync(vtt + ".pre-tail-clamp.bak", "utf8") === padded);

  const refuses = (name, text, code, opts = {}) => {
    fs.rmSync(vtt + ".pre-tail-clamp.bak", { force: true });
    fs.writeFileSync(vtt, text);
    const rr = run(...(opts.args || []));
    t(name, rr.status === 2 && new RegExp(code).test(rr.stdout + rr.stderr) && fs.readFileSync(vtt, "utf8") === text && !fs.existsSync(vtt + ".pre-tail-clamp.bak"), rr.stdout + rr.stderr);
  };
  // (B) refusals: every way the overhang can be a REAL mismatch — nothing written in any of them
  refuses("refuses an overhang far beyond padding (another recording / a cut audio)", mkVtt({ lastEnd: E + 12 }), "TOO_LONG");
  refuses("refuses a word timestamped past the audio end", mkVtt({ lastEnd: E + 2.18, wordPast: true }), "SPEECH_PAST_END");
  refuses("refuses a final cue that STARTS after the audio end", mkVtt({ lastEnd: E + 3, lastStart: E + 0.5 }), "SPEECH_PAST_END");
  refuses("refuses when a middle cue ends past the audio (not a padded final cue)", mkVtt({ lastEnd: E + 1, middleEndPast: true }), "NOT_TRAILING");
  refuses("refuses captions of another cut: the pauses do not line up with the words (shifted 0.9 s)", mkVtt({ shift: 0.9, lastEnd: E + 2 }), "NOT_ALIGNED|SPEECH_PAST_END|TAIL_NOT_SILENT");
  // a recording cut mid-speech: no silence at the end
  const cut = path.join(ROOT, "public", "audio", "cut.mp3");
  mkAudio(cut, { tail: 0 });
  refuses("refuses a recording whose speech runs to EOF (the tail is not silent)", mkVtt({ lastEnd: E + 2.18 }), "TAIL_NOT_SILENT", { args: ["--audio=public/audio/cut.mp3"] });
  // inside the audio: nothing to do, never a write
  fs.writeFileSync(vtt, mkVtt({}));
  r = run();
  t("captions ending inside the audio: NOTHING_TO_DO, no write", r.status === 0 && /NOTHING_TO_DO/.test(r.stdout) && !fs.existsSync(vtt + ".pre-tail-clamp.bak"));
  const MB = fs.readFileSync(path.join(__dirname, "lib", "audio-source.js"), "utf8");
  t("the gate's tolerance is still +2 s (only the message gained the pointer)", /vttSeconds > seconds \+ 2\)/.test(MB));
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
}
console.log(failed ? `\n${failed} FAILED` : "\nall vtt-tail checks passed");
process.exit(failed ? 1 : 0);
