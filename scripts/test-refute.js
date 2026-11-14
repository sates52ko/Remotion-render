#!/usr/bin/env node
// REFUTE (10x P2, 2026-10-27): a claim put forward, doubted, rejected ON the narration's word, explained, replaced by
// the correct model — one diagram over continued beats (src/engines/antidote/refute.ts, components/Diagram.tsx Refute).
// The rule that matters: the picture never rejects before the narrator does (strict word anchor, frame sweeps).
// Run: node scripts/test-refute.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const { anchorOnWord, occurrences } = require("./lib/word-anchor");
const R = require("../src/engines/antidote/refute.ts");
const { diagramSchema, refuteSchema } = require("../src/engines/antidote/schema.ts");

// ── (A) the strict word anchor ──────────────────────────────────────────────
const W = (words, from = 1000) => ({ from, words: words.map((w, k) => ({ w, s: from + 10 + k * 12 })) });
const sc = W(["entirely", "Really?", "Entirely.", "Entirely.", "What", "you"]);
t("anchor: the word's own frame, no lead (copy anchors lead by 4)", anchorOnWord(sc, "entirely") === 10);
t("anchor: the Nth occurrence", anchorOnWord(sc, "entirely", { occurrence: 3 }) === 46 && occurrences(sc, "entirely") === 3);
t("anchor: a lag only delays", anchorOnWord(sc, "entirely", { lag: 3 }) === 13);
t("anchor: not spoken -> null (never a fallback)", anchorOnWord(sc, "never said") === null && anchorOnWord(sc, "entirely", { occurrence: 4 }) === null);
t("anchor: a word past the beat -> null (never pulled earlier)", anchorOnWord(sc, "you", { durationFrames: 50 }) === null);

// ── (B) the state: nothing rejects early, and the claim is always readable ──
const base = { owner: "THE DEFENSE SAYS", claim: "MULTIPLE INPUTS STIMULATE THE BRAIN", inputs: ["CODE", "MUSIC", "SLACK"], hub: "BRAIN", verdict: "ENTIRELY A MYTH", reason: "CANNOT PROCESS SIMULTANEOUSLY", truth: "CONTINUOUS PARTIAL ATTENTION" };
const b58 = { ...base, at: { links: 39, result: 138, doubt: 267 } };
let early = 0, chipQ = -1;
for (let f = 0; f < 330; f++) { const s = R.refuteState(b58, f); if (s.grey > 0 || s.chip === "REJECTED" || s.corner > 0) early++; if (chipQ < 0 && s.chip === "?") chipQ = f; }
t("state: the claim beat never looks rejected (330 frames swept)", early === 0, String(early));
t("state: the doubt '?' comes ON 'But', not before", chipQ === 267, String(chipQ));
const b59 = { ...base, at: { rejected: 3 }, done: ["links", "result", "doubt"] };
let bad = 0;
for (let f = 0; f < 3; f++) if (R.refuteState(b59, f).grey > 0) bad++;
t("state: grey / stamp start exactly at the rejection frame", bad === 0 && R.refuteState(b59, 3).grey > 0 && R.refuteState(b59, 3 + R.REJECT_DRAIN).grey === 1);
t("state: the rejected claim stays centre stage until the correct model arrives (no empty stage)", R.refuteState(b59, 300).corner === 0);
const b60 = { ...base, at: { truth: 29 }, done: ["links", "result", "doubt", "rejected"] };
t("state: the correct model moves the grey claim to the corner, still drawn", R.refuteState(b60, 10).corner === 0 && R.refuteState(b60, 100).corner === 1 && R.refuteState(b60, 100).grey === 1);
const b61 = { ...base, at: { reason: 130, run: [305, 365] }, done: ["links", "result", "doubt", "rejected", "truth"] };
t("state: the WHY appears on its word; the spotlight is ONE input at a time", R.refuteState(b61, 129).p.reason === 0 && R.refuteState(b61, 131).p.reason > 0 && R.refuteState(b61, 300).spot === -1 && R.refuteState(b61, 310).spot === 0 && R.refuteState(b61, 370).spot === 1);
t("state: an element with no frame is not drawn (never guessed)", R.refuteState({ ...base }, 500).grey === 0 && R.refuteState({ ...base }, 500).p.truth === 0);
t("labels: every word the diagram can print is reported to the gates", R.refuteLabels(base).includes("ENTIRELY A MYTH") && R.refuteLabels(base).includes("CONTINUOUS PARTIAL ATTENTION"));
t("schema: a refute diagram validates; a missing reason does not", diagramSchema.safeParse({ type: "refute", refute: base }).success && !refuteSchema.safeParse({ ...base, reason: undefined }).success);

// ── (C) merge + planner on a word-timed fixture ─────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "refute-"));
const SLUG = `zz-refute-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into attention.",
  "Isn't there a threshold where multiple inputs increase productivity? But it is",
  "entirely wrong. What you describe is continuous partial attention.",
  "The brain physically cannot process two tasks simultaneously.",
];
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of SENTENCES) {
  const words = sent.split(" "); const start = clock; let line = words[0];
  for (let k = 1; k < words.length; k++) line += `<${ts(start + k * 0.3)}><c> ${words[k]}</c>`;
  const end = start + words.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 1.0;
}
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
const CAST = { narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Refute Test", author: "A. Writer", genre: "nonfiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: [] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const baseArgs = [PLAN, `--slug=${SLUG}`, "--title=Refute Test", "--author=A. Writer", "--genre=nonfiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
try {
  run([...baseArgs, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const iClaim = (beats.find((b) => /multiple inputs/.test(b.narration || "")) || {}).i;
  const iRej = (beats.find((b) => /entirely wrong/i.test(b.narration || "")) || {}).i;
  const iTruth = (beats.find((b) => /continuous partial/i.test(b.narration || "")) || {}).i;
  t("fixture: claim, rejection and correct model are consecutive beats", iClaim > 0 && iRej === iClaim + 1 && iTruth === iRej + 1, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const write = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, cast: [] };
    if (b.i === iClaim) Object.assign(x, { diagram: { type: "refute", labels: [], refute: { ...base, cues: { links: "multiple inputs", result: "increase productivity" } } } });
    if (b.i === iRej) Object.assign(x, { continue: true, diagram: { type: "refute", labels: [], refute: { ...base, cues: { doubt: "But", rejected: "entirely" } } } });
    if (b.i === iTruth) Object.assign(x, { continue: true, diagram: { type: "refute", labels: [], refute: { ...base, cues: { truth: "continuous partial" } } } });
    if (mut) mut(x, b.i);
    return x;
  })));
  write((x, i) => { if (i === iRej) x.diagram.refute.cues.rejected = "nonsense"; });
  let r = merge();
  t("merge: a stance cue that is not spoken in its beat is refused", r.status !== 0 && /refute cue rejected "nonsense" is not spoken/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iRej) x.diagram.refute.cues.rejected = { phrase: "entirely", occurrence: 2 }; });
  r = merge();
  t("merge: an occurrence the beat does not have is refused", r.status !== 0 && /occurrence 2 but it is spoken 1 time/.test(r.stdout));
  write((x, i) => { if (i === iClaim) x.diagram.refute.verdict = x.diagram.refute.claim; });
  r = merge();
  t("merge: a verdict that only restates the claim is refused", r.status !== 0 && /verdict repeats the claim/.test(r.stdout));
  write(null);
  r = merge();
  t("merge: the authored chain is accepted", r.status === 0, (r.stdout || "").slice(-500));
  r = run([...baseArgs, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-400));
  if (cfg) {
    const d = cfg.scenes[iRej].diagram.refute, e = cfg.scenes[iTruth].diagram.refute;
    // "But it is" ends one caption, "entirely wrong." starts the next after the 1 s pause: But @0, entirely @27 + 30
    t("plan: the doubt is anchored ON 'But' (no lead)", d.at && d.at.doubt === 0, JSON.stringify(d.at));
    t("plan: the rejection is ON 'entirely' + lag 3 (never before the word)", d.at && d.at.rejected === 57 + 3, JSON.stringify(d.at));
    t("plan: each continued beat knows what the chain already reached", JSON.stringify(d.done) === JSON.stringify(["links", "result"]) && JSON.stringify(e.done) === JSON.stringify(["links", "result", "doubt", "rejected"]), JSON.stringify([d.done, e.done]));
    t("plan: the chain link is a cut (a wipe would hide the rejection)", cfg.scenes[iRej].transition && cfg.scenes[iRej].transition.type === "cut" && cfg.scenes[iRej].transition.frames === 0);
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall refute checks passed");
process.exit(failed ? 1 : 0);
