#!/usr/bin/env node
// MECHANISM (10x P1, 2026-10-27): cause -> mechanism -> effect as ONE diagram over continued beats
// (src/engines/antidote/mechanism.ts, components/Diagram.tsx Mechanism). The rules that matter: every cause and the
// effect appear ON the word that says them (strict anchor, frame sweeps); what persists is visibly the same; the
// reference line is derived, not invented; no number is printed that the narration does not say.
// Run: node scripts/test-mechanism.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const M = require("../src/engines/antidote/mechanism.ts");
const { diagramSchema, mechanismSchema } = require("../src/engines/antidote/schema.ts");

const JUMP = {
  outcome: "JUMP",
  factors: [{ label: "SKILL", persists: true }, { label: "WIND", persists: false }, { label: "TIMING", persists: false }],
  group: "LUCK",
  trials: [{ label: "A PHENOMENAL JUMP", levels: ["peak", "peak", "peak"] }, { label: "THE NEXT JUMP", levels: ["peak", "normal", "normal"] }],
  average: "THEIR AVERAGE",
  result: "REGRESSES BACK",
};

// ── (A) schema ───────────────────────────────────────────────────────────────
t("schema: a mechanism diagram parses", diagramSchema.safeParse({ type: "mechanism", labels: [], mechanism: JUMP }).success);
t("schema: one level per factor in every trial", !mechanismSchema.safeParse({ ...JUMP, trials: [{ label: "X", levels: ["peak", "peak"] }] }).success);
t("schema: a mechanism needs a factor that persists AND one drawn again", !mechanismSchema.safeParse({ ...JUMP, factors: JUMP.factors.map((f) => ({ ...f, persists: true })) }).success);
t("schema: levels are words, never numbers", !mechanismSchema.safeParse({ ...JUMP, trials: [{ label: "X", levels: [9, 9, 9] }] }).success);

// ── (B) the state: nothing before its word; what a chain reached stays drawn ──
const beat3 = { ...JUMP, at: { redraw: 89, settle: 165, average: 200 }, done: ["trial1", "f0", "f1", "f2", "group", "trial2", "carry"] };
let early = 0;
for (let f = 0; f < 240; f++) { const p = M.mechanismState(beat3, f).p; if ((f < 89 && p.redraw > 0) || (f < 165 && p.settle > 0) || (f < 200 && p.average > 0)) early++; }
t("state: redraw / settle / average never start before their word (240 frames swept)", early === 0, String(early));
t("state: elements the chain reached are drawn settled from frame 0", ["trial1", "f0", "f1", "f2", "group", "trial2", "carry"].every((e) => M.mechanismState(beat3, 0).p[e] === 1));
t("state: an element with no frame and not done is NOT drawn (never guessed)", M.mechanismState({ ...JUMP, at: {} }, 500).p.settle === 0);
t("state: elements settle after their build", M.mechanismState(beat3, 89 + M.REDRAW_LEN).p.redraw === 1 && M.mechanismState(beat3, 165 + M.BUILD).p.settle === 1);

// ── (C) the model: persisting factors keep their size; the reference line is derived ──
const s1 = M.stackOf(JUMP, 0), s2 = M.stackOf(JUMP, 1);
t("model: the persisting factor sits at the bottom of every stack", s1[0].k === 0 && s2[0].k === 0);
t("model: the persisting factor is the SAME size in both trials (it carries over unchanged)", s1[0].h === s2[0].h);
t("model: the drawn-again factors are smaller on the next trial (perfect -> normal)", s2.slice(1).every((b, n) => b.h < s1[n + 1].h));
t("model: the average line = the total with the drawn-again factors at normal — the next trial lands ON it", M.averageTotal(JUMP) === M.totalOf(JUMP, 1) && M.totalOf(JUMP, 0) > M.averageTotal(JUMP));
const MIRROR = { outcome: "JUMP", factors: [{ label: "SKILL", persists: true }, { label: "CROSSWIND", persists: false }], trials: [{ label: "A TERRIBLE JUMP", levels: ["peak", "minus"] }, { label: "THE NEXT JUMP", levels: ["peak", "normal"] }], result: "BETTER" };
t("model: bad luck ('minus') takes away — the terrible jump is below the next one", M.totalOf(MIRROR, 0) < M.totalOf(MIRROR, 1));

// ── (D) readcheck words: only what is drawn ─────────────────────────────────
const early2 = M.mechanismSeen(JUMP, new Set(["trial1", "f0"]));
t("seen: before the luck beat the reader is told only the skill block", /SKILL peak/.test(early2) && !/WIND|LUCK|AVERAGE|REGRESSES/.test(early2), early2);
const full = M.mechanismSeen(JUMP, new Set(M.MECH_ELS));
t("seen: the full chain names the carry-over, the new level, the average and the result", /unchanged, marked SAME/.test(full) && /WIND now normal/.test(full) && /THEIR AVERAGE/.test(full) && /REGRESSES BACK/.test(full), full);
t("labels: every printed word is listed for the text gates", ["JUMP", "SKILL", "WIND", "TIMING", "LUCK", "A PHENOMENAL JUMP", "THE NEXT JUMP", "THEIR AVERAGE", "REGRESSES BACK"].every((w) => M.mechanismLabels(JUMP).includes(w)));

// ── (E) merge + planner on a word-timed fixture ─────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mechanism-"));
const SLUG = `zz-mechanism-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into judgement.",
  "A phenomenal jump means the peak of his skill.",
  "Plus perfect wind and perfect timing. He got incredibly lucky.",
  "On the next jump his skill remains exactly the same, but the wind will just be normal.",
  "So his performance regresses back toward his average.",
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
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Mechanism Test", author: "A. Writer", genre: "nonfiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: [] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const baseArgs = [PLAN, `--slug=${SLUG}`, "--title=Mechanism Test", "--author=A. Writer", "--genre=nonfiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
try {
  run([...baseArgs, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iA = find(/phenomenal jump/), iB = find(/perfect wind/), iC = find(/remains exactly the same/), iD = find(/regresses back/);
  t("fixture: the four mechanism sentences are four consecutive beats", iA > 0 && iB === iA + 1 && iC === iB + 1 && iD === iC + 1, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const CUES = { [iA]: { trial1: "phenomenal jump", f0: "skill" }, [iB]: { f1: "wind", f2: "timing", group: "lucky" }, [iC]: { trial2: "next jump", carry: "remains exactly the same", redraw: "normal" }, [iD]: { settle: "regresses", average: "average" } };
  const write = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, cast: [] };
    if (CUES[b.i]) Object.assign(x, { diagram: { type: "mechanism", labels: [], mechanism: { ...JSON.parse(JSON.stringify(JUMP)), average: "HIS AVERAGE", cues: { ...CUES[b.i] } } }, ...(b.i === iA ? {} : { continue: true }) });
    if (mut) mut(x, b.i);
    return x;
  })));
  write((x, i) => { if (i === iD) x.diagram.mechanism.cues.settle = "collapses"; });
  let r = merge();
  t("merge: an effect cue that is not spoken in its beat is refused", r.status !== 0 && /mechanism cue settle "collapses" is not spoken/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iA) x.diagram.mechanism.trials[0].label = "A 95 METRE JUMP"; });
  r = merge();
  t("merge: a number the narration does not say is refused", r.status !== 0 && /prints 95, which the narration does not say/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iA) { x.diagram.mechanism.trials = [x.diagram.mechanism.trials[0]]; x.diagram.mechanism.cues.carry = "skill"; } });
  r = merge();
  t("merge: carry / settle need a second trial", r.status !== 0 && /mechanism cue carry needs a second trial/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iA) x.diagram.mechanism.trials[0].levels = ["peak", "minus", "peak"]; });
  r = merge();
  t("merge: bad luck as 'minus' is refused (measured misleading) — author it as 'low'", r.status !== 0 && /level "minus" misleads/.test(r.stdout), (r.stdout || "").slice(-300));
  write(null);
  r = merge();
  t("merge: the authored chain is accepted", r.status === 0, (r.stdout || "").slice(-600));
  r = run([...baseArgs, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-400));
  if (cfg) {
    // every element sits ON its word: compare with the scene's word timings
    const { anchorOnWord } = require("./lib/word-anchor");
    let off = [];
    for (const i of [iA, iB, iC, iD]) {
      const sc = cfg.scenes[i], m = sc.diagram.mechanism;
      for (const [el, cue] of Object.entries(CUES[i])) {
        const want = anchorOnWord({ from: sc.fromFrame, words: (cfg.captions || []).flatMap((c) => c.words || []).map((w) => ({ w: w.w, s: w.s })) }, cue, { lag: el === "settle" ? 3 : 0 });
        if (m.at[el] == null || m.at[el] < 0) off.push(`${i}.${el} missing`);
        else if (want != null && m.at[el] < want) off.push(`${i}.${el} ${m.at[el]} < word ${want}`);
      }
    }
    t("plan: every cause and the effect is anchored at or after its spoken word", !off.length, off.join("; "));
    t("plan: each continued beat knows what the chain already reached", JSON.stringify(cfg.scenes[iD].diagram.mechanism.done) === JSON.stringify(["trial1", "f0", "f1", "f2", "group", "trial2", "carry", "redraw"]), JSON.stringify(cfg.scenes[iD].diagram.mechanism.done));
    t("plan: the chain links are cuts (a wipe would hide the carry-over)", [iB, iC, iD].every((i) => cfg.scenes[i].transition && cfg.scenes[i].transition.type === "cut"));
    // the unspoken cue stops the PLAN too (planner is the last line, merge the first)
    const art = read(path.join(BOOK, "art.json"));
    art.beats.find((b) => b.i === iD).diagram.mechanism.cues.settle = "collapses";
    fs.writeFileSync(path.join(tmp, "bad-art.json"), JSON.stringify(art));
    r = run([...baseArgs, `--callouts=${path.join(tmp, "bad-art.json")}`, `--out=${path.join(tmp, "bad.json")}`]);
    t("plan: an unspoken cue stops the planner (nothing is guessed)", r.status !== 0 && /mechanism "settle" cue "collapses" is not spoken/.test(r.stderr + r.stdout), (r.stderr || "").slice(-300));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall mechanism checks passed");
process.exit(failed ? 1 : 0);
