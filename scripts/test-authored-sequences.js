#!/usr/bin/env node
// Authored sequences survive the engine, and author chunks are not cut mid-idea (2026-10-20, plan P1).
//   (A) storyboard prep chunk cuts (lib/storyboard-chunks): never after a beat that does not end a sentence, never
//       before a continuation word; inside size ± slack; deterministic; no clean cut -> fixed cut, reported
//   (B) plan-sequence-arcs: an authored `continue` run is ONE sequence (source "authored", roles authored-start /
//       authored-kept, no curiosity arc); an engine continuation is not authored; fallback clustering for the rest
//   (C) apply-semantic-arcs (real script): no engine visualArc transform on an authored run; other scenes unchanged
//   (D) real chain: a `continue` on the first beat of authored-2.json (continuing the last beat of authored-1.json)
//       -> merge -> planner -> config continueFromPrev + lock -> one authored sequence
// Run: node scripts/test-authored-sequences.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");

// ── (A) chunk cuts ──────────────────────────────────────────────────────────
const { chunkRanges } = require("./lib/storyboard-chunks");
{
  // 100 beats; topic A until 41, topic B from 42 ("Okay, now ..."); beat 40 opens with "But" mid-idea
  const beats = Array.from({ length: 100 }, (_, i) => ({ i, narration: i < 42 ? `The compass needle spins near the island number ${i}.` : `Okay, the bond forces a choice for the queen ${i}.` }));
  beats[40].narration = "But for Luther, that spinning compass needle is his only tether.";
  beats[39].narration = "So that compass just spins uselessly near the island";  // no sentence end -> no cut at 40
  const { chunks, moves } = chunkRanges(beats, 40);
  const cuts = chunks.slice(1).map(([a]) => a);
  t("chunks: the fixed cut at 40 (mid-sentence, 'But ...') is moved", !cuts.includes(40) && moves.some((m) => m.fixed === 40 && m.at !== 40), JSON.stringify({ cuts, moves }));
  t("chunks: the cut lands on the topic shift at 42", cuts[0] === 42, JSON.stringify(cuts));
  t("chunks: every beat in exactly one chunk, in order", chunks.flatMap(([a, z]) => Array.from({ length: z - a + 1 }, (_, k) => a + k)).join(",") === beats.map((b) => b.i).join(","));
  t("chunks: no chunk larger than size + slack (48)", chunks.every(([a, z]) => z - a + 1 <= 48), JSON.stringify(chunks));
  t("chunks: deterministic", JSON.stringify(chunkRanges(beats, 40)) === JSON.stringify({ chunks, moves }));
  // no clean cut anywhere in the window -> the fixed cut, reported
  const run = Array.from({ length: 90 }, (_, i) => ({ i, narration: "and the same sentence goes on" }));
  const r2 = chunkRanges(run, 40);
  t("chunks: no clean cut in the window -> fixed cut kept and reported", r2.chunks[1][0] === 40 && r2.moves.some((m) => m.fixed === 40 && m.at === 40 && /no clean cut/.test(m.why)), JSON.stringify(r2));
  // a short book is one chunk; a tail <= size + slack is not split off
  t("chunks: <= size + slack beats -> one chunk", chunkRanges(beats.slice(0, 47), 40).chunks.length === 1);
}

// ── (B) authored runs in plan-sequence-arcs ─────────────────────────────────
const { planSequences, authoredRuns } = require("./plan-sequence-arcs");
const mkScene = (i, extra = {}) => ({ id: `scene-${String(i).padStart(2, "0")}`, fromFrame: i * 240, durationFrames: 240, shot: "medium", bg: { set: "forest", colors: ["#eee", "#ccc"] }, props: [{ type: "compass" }], _narration: i === 6 ? "Why does it spin?" : `beat ${i}`, _authorship: { src: "art", lock: {} }, ...extra });
const authoredCont = (i) => mkScene(i, { continueFromPrev: true, _authorship: { src: "art", lock: { continue: true } } });
const scenes = Array.from({ length: 16 }, (_, i) => mkScene(i));
scenes[6] = authoredCont(6); scenes[7] = authoredCont(7);         // authored run 5,6,7
scenes[12] = mkScene(12, { continueFromPrev: true });              // ENGINE continuation (no lock.continue)
{
  const { runs } = authoredRuns(scenes);
  t("runs: the authored continue run is [5,6,7]", JSON.stringify(runs) === "[[5,6,7]]", JSON.stringify(runs));
  const seqs = planSequences(scenes, 30);
  const auth = seqs.filter((q) => q.source === "authored");
  t("sequences: one authored sequence = the author's run", auth.length === 1 && auth[0].beats.map((b) => b.index).join(",") === "5,6,7", JSON.stringify(auth.map((q) => q.beats.map((b) => b.index))));
  t("sequences: authored roles only (start / kept), no curiosity arc", auth[0] && auth[0].beats.map((b) => b.role).join(",") === "authored-start,authored-kept,authored-kept" && auth[0].curiosityArc.length === 0);
  t("sequences: no question invented inside the run (beat 6 asks 'Why')", auth[0] && !auth[0].beats.some((b) => b.role === "question"));
  const eng = seqs.filter((q) => q.source === "engine");
  t("sequences: engine clusters never include an authored scene", eng.every((q) => q.beats.every((b) => ![5, 6, 7].includes(b.index))), JSON.stringify(eng.map((q) => q.beats.map((b) => b.index))));
  t("sequences: every scene in exactly one sequence", seqs.flatMap((q) => q.beats.map((b) => b.index)).sort((a, b) => a - b).join(",") === scenes.map((_, i) => i).join(","));
  t("sequences: an engine continuation is not an authored sequence", !auth.some((q) => q.beats.some((b) => b.index === 12)));
  t("sequences: without any authored continue, the old clustering is unchanged", JSON.stringify(planSequences(Array.from({ length: 16 }, (_, i) => mkScene(i)), 30).map((q) => [q.source, q.beats.map((b) => [b.index, b.role])])) === JSON.stringify(planSequences(Array.from({ length: 16 }, (_, i) => mkScene(i)), 30).map((q) => [q.source, q.beats.map((b) => [b.index, b.role])])) && planSequences(Array.from({ length: 16 }, (_, i) => mkScene(i)), 30).every((q) => q.source === "engine"));
}

// ── (C) apply-semantic-arcs on a temp book (real script) ────────────────────
const SLUGC = `zz-authored-seq-c-${process.pid}`;
const BOOKC = path.join(REPO, "books", SLUGC);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
try {
  fs.mkdirSync(BOOKC, { recursive: true });
  const cfg = { meta: { fps: 30, durationInFrames: 16 * 240 }, scenes: JSON.parse(JSON.stringify(scenes)), captions: [] };
  fs.writeFileSync(path.join(BOOKC, "config.antidote.json"), JSON.stringify(cfg));
  let r = run([path.join(__dirname, "plan-sequence-arcs.js"), `--slug=${SLUGC}`]);
  const seqFile = JSON.parse(fs.readFileSync(path.join(BOOKC, "sequence-arcs.json"), "utf8"));
  t("cli: sequence-arcs.json records the authored sequence", seqFile.sequences.some((q) => q.source === "authored"), (r.stderr || "").slice(-300));
  r = run([path.join(__dirname, "apply-semantic-arcs.js"), `--slug=${SLUGC}`]);
  const out = JSON.parse(fs.readFileSync(path.join(BOOKC, "config.antidote.json"), "utf8"));
  const tf = (i) => (out.scenes[i].visualArc || {}).transformation;
  t("semantic arcs ran", r.status === 0, (r.stderr || r.stdout || "").slice(-400));
  t("semantic arcs: no engine transform on the authored run (5,6,7)", [5, 6, 7].every((i) => tf(i) === "none"), JSON.stringify([5, 6, 7].map(tf)));
  t("semantic arcs: other scenes still get the engine's arcs", out.scenes.some((s, i) => ![5, 6, 7].includes(i) && s.visualArc && s.visualArc.transformation !== "none"), JSON.stringify(out.scenes.map((s) => (s.visualArc || {}).transformation)));
} finally {
  fs.rmSync(BOOKC, { recursive: true, force: true });
}

// ── (D) a continue across two authored files survives merge -> planner -> sequences ─
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "authored-seq-"));
const SLUG = `zz-authored-seq-d-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const SENTENCES = [
  "Welcome to this deep dive into burning crowns.",
  "Her old compass spins uselessly in his palm.",
  "That spinning needle is his only real tether.",
  "If the needle stops then she is truly free.",
  "The crowd stares up at their silent queen.",
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
const CAST = { luther: { name: "Luther", role: "a commander", look: "tall man, dark coat" }, narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Fire Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["compass"] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const base = [PLAN, `--slug=${SLUG}`, "--title=Fire Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
try {
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iA = find(/spins uselessly/), iB = find(/only real tether/), iC = find(/needle stops/);
  t("fixture: the three sequence sentences are their own beats", [iA, iB, iC].every((k) => k > 0) && new Set([iA, iB, iC]).size === 3, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const rec = (b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB };
    if (b.i === iA) Object.assign(x, { concept: "compass", conceptMotion: "spin", cast: ["luther"], expression: "worried", action: "hold", callout: { text: "Spins uselessly", style: "reveal" } });
    if (b.i === iB) Object.assign(x, { concept: "compass", conceptMotion: "spin", continue: true, cast: ["luther"], expression: "worried", action: "hold", callout: { text: "His only tether", style: "highlight" } });
    if (b.i === iC) Object.assign(x, { concept: "compass", conceptMotion: "spin", continue: true, cast: ["luther"], expression: "afraid", action: "hold", callout: { text: "If the needle stops", style: "highlight" } });
    return x;
  };
  // the chunk boundary falls between iA and iB: two different authors' files
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.filter((b) => b.i <= iA).map(rec)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-2.json"), JSON.stringify(beats.filter((b) => b.i > iA).map(rec)));
  let r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  const art = read(path.join(BOOK, "art.json"));
  t("chain: merge --write across two authored files", !!art, (r.stdout || "").slice(-500));
  const ab = (i) => ((art && art.beats) || []).find((b) => b.i === i) || {};
  t("chain: the continue on the first beat of authored-2.json reaches art.json", ab(iB).continue === true && ab(iC).continue === true);
  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("chain: planner writes the config", !!cfg, (r.stderr || r.stdout || "").slice(-500));
  if (cfg) {
    const sc = (i) => cfg.scenes[i] || {};
    t("chain: continueFromPrev + lock.continue on both kept beats", [iB, iC].every((i) => sc(i).continueFromPrev === true && sc(i)._authorship && sc(i)._authorship.lock && sc(i)._authorship.lock.continue === true));
    const seqs = planSequences(cfg.scenes, 30);
    const auth = seqs.filter((q) => q.source === "authored");
    t("chain: one authored sequence = the author's three beats", auth.length === 1 && auth[0].beats.map((b) => b.index).join(",") === [iA, iB, iC].join(","), JSON.stringify(auth.map((q) => q.beats.map((b) => b.index))));
    t("chain: the compass + spin are kept on every beat of it", [iA, iB, iC].every((i) => (sc(i).props || []).some((p) => p.type === "compass" && p.motion === "spin")));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall authored-sequence checks passed");
process.exit(failed ? 1 : 0);
