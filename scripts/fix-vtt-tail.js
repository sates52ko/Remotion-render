#!/usr/bin/env node
/**
 * fix-vtt-tail.js — clamp the END of a VTT's final cue to the end of its audio, only when that is provably ASR padding
 * (2026-10-29; the checks and the why: scripts/lib/vtt-tail.js).
 *
 *   node scripts/fix-vtt-tail.js --slug=<slug> --dry      # measure + plan, change nothing (always run this first)
 *   node scripts/fix-vtt-tail.js --slug=<slug>            # apply: only the trailing cue's end timestamp changes
 *     [--root=<tree with public/ and books/>] [--vtt=<file>] [--audio=<file>]
 *
 * Keeps the original as public/captions/<slug>.vtt.pre-tail-clamp.bak (never overwritten), records every applied clamp
 * in books/<slug>/vtt-tail-clamp.json, and leaves make-book's audio/VTT tolerance (+2 s) exactly as it is — the gate
 * runs again on the clamped file. A refusal (exit 2) is an INPUT problem to report, never a reason to edit by hand.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const AS = require("./lib/audio-source");
const VT = require("./lib/vtt-tail");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const SLUG = args.slug;
if (!SLUG) { console.error("Usage: node scripts/fix-vtt-tail.js --slug=<slug> [--dry] [--root=<dir>] [--vtt=<file>] [--audio=<file>]"); process.exit(1); }
const ROOT = path.resolve(args.root || path.join(__dirname, ".."));
const BOOK = path.join(ROOT, "books", SLUG);
const VTT = path.resolve(ROOT, args.vtt || `public/captions/${SLUG}.vtt`);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
if (!fs.existsSync(VTT)) { console.error(`❌ no VTT at ${VTT}`); process.exit(1); }

// the narration the book uses (book.json audioSource), else the raw candidates make-book would choose from
let audio = args.audio ? path.resolve(ROOT, args.audio) : null;
if (!audio) {
  let book = {}; try { book = JSON.parse(fs.readFileSync(path.join(BOOK, "book.json"), "utf8")); } catch { /* none */ }
  const rel = book.audioSource || (AS.rawCandidates(ROOT, SLUG)[0] || null);
  audio = rel ? path.join(ROOT, rel) : null;
}
if (!audio || !fs.existsSync(audio)) { console.error(`❌ no narration audio for ${SLUG} (public/audio/${SLUG}.mp3|.m4a or book.json audioSource)`); process.exit(1); }
const v = AS.validate(audio, { full: true }); // decoded length, not the header's
if (!v.ok) { console.error(`❌ ${path.basename(audio)}: ${v.problems.join("; ")}`); process.exit(1); }
const E = v.info.duration;

// pauses over the last 20 s (absolute seconds); a silence still open at EOF has end null
const W = Math.min(20, E);
const from = E - W;
const sd = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", from.toFixed(3), "-i", audio, "-af", "silencedetect=noise=-45dB:d=0.2", "-f", "null", "-"], { encoding: "utf8" });
const silences = [];
for (const line of String(sd.stderr || "").split(/\r?\n/)) {
  let m = /silence_start: (-?[\d.]+)/.exec(line);
  if (m) silences.push({ start: from + Math.max(0, Number(m[1])), end: null });
  m = /silence_end: ([\d.]+)/.exec(line);
  if (m && silences.length) silences[silences.length - 1].end = from + Number(m[1]);
}
for (const s of silences) if (s.end != null && s.end >= E - 0.02) s.end = null; // ends at EOF = runs to the end

const text = fs.readFileSync(VTT, "utf8");
const plan = VT.planTailClamp(text, { audioEnd: E, silences, window: [from, E] });
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
console.log(`── fix-vtt-tail · ${SLUG} · audio ${rel(audio)} ${E.toFixed(3)} s (decoded) · ${rel(VTT)}`);
console.log(`   ${plan.code}: ${plan.why}`);
for (const c of plan.changes) console.log(`   line ${c.line + 1}: ${c.from.trim()}\n          -> ${c.to.trim()}`);
if (!plan.ok) {
  console.error(`❌ refused (${plan.code}) — an input problem: the captions may not be of this recording. Nothing was changed. Report it (the VTT or the audio must be replaced); never edit the timestamps by hand.`);
  process.exit(2);
}
if (plan.code === "NOTHING_TO_DO") process.exit(0);
const before = AS.durationVsVtt(E, AS.vttEnd(VTT));
const after = AS.durationVsVtt(E, Math.max(...VT.parseCues(VT.applyChanges(text, plan.changes)).cues.map((c) => c.end)));
console.log(`   audio/VTT gate (unchanged, +2 s): before ${before.problems.length ? "FAIL" : "pass"} → after ${after.problems.length ? "FAIL" : "pass"}`);
if (args.dry) { console.log("   --dry: nothing written"); process.exit(0); }

const bak = `${VTT}.pre-tail-clamp.bak`;
if (!fs.existsSync(bak)) fs.writeFileSync(bak, text);
const out = VT.applyChanges(text, plan.changes);
fs.writeFileSync(VTT, out);
fs.mkdirSync(BOOK, { recursive: true });
const recFile = path.join(BOOK, "vtt-tail-clamp.json");
let rec = { note: "fix-vtt-tail.js: the final cue's END clamped to the audio end (ASR padding); text, starts and other cues untouched", runs: [] };
try { rec = JSON.parse(fs.readFileSync(recFile, "utf8")); } catch { /* first */ }
rec.runs.push({ at: new Date().toISOString(), vtt: rel(VTT), backup: rel(bak), vttSha256Before: sha(text), vttSha256After: sha(out), audio: rel(audio), audioSha256: sha(fs.readFileSync(audio)),
  audioEnd: E, overhang: plan.overhang, changes: plan.changes.map((c) => ({ line: c.line + 1, from: c.from.trim(), to: c.to.trim() })), evidence: plan.evidence });
fs.writeFileSync(recFile, JSON.stringify(rec, null, 2) + "\n");
console.log(`✓ clamped ${plan.changes.length} cue end(s); original kept at ${rel(bak)}; recorded in ${rel(recFile)}`);
