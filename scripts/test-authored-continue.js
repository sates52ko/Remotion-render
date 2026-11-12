#!/usr/bin/env node
// AUTHORED scene continuation (2026-10-19): art.json beat `"continue": true` = "this beat
// continues the previous beat's stage". Every Antidote scene is its own <Sequence> and
// restarts its clock, so without it a person re-enters, a prop pops again and a diagram
// rebuilds every beat. The only continuation was the director's automatic sustained take,
// which an author could not request — and which let an authored cast swap the person on
// screen with no entrance (burn-of-the-everflame scene-97: diem -> luther, enter "none").
//   storyboard merge validates + carries `continue` -> plan-antidote sets scene
//   `continueFromPrev: true` + a 0-frame cut -> the lock seals it, the gate reports it lost,
//   --restore puts it back -> schema.ts validates it -> continuity.ts (pure) decides what the
//   renderer keeps: same identity = no entrance + settled/continuing pose + same slot; same
//   prop type = no pop, no arc replay; same diagram type = previous labels pre-built.
//   enterNewcomers (planner, every continuation): a person NEW to the take enters normally.
// Old configs (no field) get the neutral plan = the pre-2026-10-19 drawing.
// Runs the REAL merge (--root=<temp>) and planner (--out) on a word-timed fixture.
// Run: node scripts/test-authored-continue.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const SRC = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// ── (A) schema ──────────────────────────────────────────────────────────────
const { sceneSchema } = require("../src/engines/antidote/schema.ts");
const SC = { id: "s", fromFrame: 0, durationFrames: 60 };
t("schema: a scene with continueFromPrev: true validates", sceneSchema.safeParse({ ...SC, continueFromPrev: true }).success);
t("schema: continueFromPrev: false is refused (absent = not continued)", !sceneSchema.safeParse({ ...SC, continueFromPrev: false }).success);
t("schema: a default scene carries no continueFromPrev", sceneSchema.parse(SC).continueFromPrev === undefined);

// ── (B) the renderer's decision (continuity.ts, pure) ──────────────────────────
const C = require("../src/engines/antidote/continuity.ts");
const { shotPreset } = require("../src/engines/antidote/shots.ts");
const drawsCast = (shot) => !shotPreset(shot).dropsCast;
let nid = 0;
const ch = (identity, extra = {}) => ({ id: `${identity}-${nid++}`, identity, role: identity, enter: "left", action: "idle", ...extra });
const scene = (id, from, dur, extra = {}) => ({ id, fromFrame: from, durationFrames: dur, shot: "medium", transition: { type: "wipeRight", frames: 10 }, characters: [], props: [], ...extra });

// old configs: no flag anywhere -> every plan inactive; transIn = the old index.tsx formula
{
  const old = [
    scene("a", 0, 90, { characters: [ch("diem")], props: [{ type: "compass", at: 6 }], diagram: { type: "flow", labels: ["A", "B"] } }),
    scene("b", 90, 80, { characters: [ch("diem")], props: [{ type: "compass", at: 6 }], diagram: { type: "flow", labels: ["A", "B"] } }),
    scene("c", 170, 70, { transition: { type: "cut", frames: 0 }, _take: "sustained", characters: [ch("diem", { enter: "none", poseAt: 60 })] }),
    scene("d", 240, 70, { relationshipStaging: {} }),
    scene("e", 310, 70),
  ];
  const plans = C.planContinuity(old, drawsCast);
  t("old config: no scene is a continuation (all plans inactive)", plans.every((p) => !p.active));
  const OLD_TRANSIN = (scenes, i) => {
    const s = scenes[i], tr = s.transition ?? { type: "cut", frames: 0 };
    const afterStaged = i > 0 && !!scenes[i - 1].relationshipStaging;
    return i === 0 || tr.type === "cut" || afterStaged ? 0 : Math.min(tr.frames, Math.max(0, s.fromFrame));
  };
  t("old config: sceneTransIn = the pre-continuity formula, scene for scene", old.every((_, i) => C.sceneTransIn(old, i) === OLD_TRANSIN(old, i)), JSON.stringify(old.map((_, i) => [C.sceneTransIn(old, i), OLD_TRANSIN(old, i)])));
  t("old config: a sustained take is NOT a renderer continuation (it renders as before)", !C.isAuthoredContinuation(old[2], 2));
}

// a three-scene authored sequence
const S1 = scene("s1", 0, 90, {
  shot: "twoShot", characters: [ch("diem", { action: "talk" }), ch("teller")],
  props: [{ type: "compass", at: 6, arc: "grow" }, { type: "fire", at: 0 }],
  diagram: { type: "sorter", title: "WHO", labels: ["HEIRS", "TRAITORS"], values: [2, 3], at: 4 },
});
const S2 = scene("s2", 90, 75, {
  continueFromPrev: true, transition: { type: "cut", frames: 0 }, shot: "twoShot",
  characters: [ch("teller", { action: "think" }), ch("diem", { action: "talk" })],
  props: [{ type: "compass", at: 9, arc: "grow" }, { type: "crown", at: 0 }],
  diagram: { type: "sorter", title: "WHO", labels: ["HEIRS", "TRAITORS", "EXILES"], values: [2, 4, 1], at: 0 },
});
const S3 = scene("s3", 165, 60, {
  continueFromPrev: true, transition: { type: "cut", frames: 0 }, shot: "twoShot",
  characters: [ch("luther"), ch("diem", { action: "talk" })],
  props: [{ type: "compass", at: 0, arc: "shrink" }],
  diagram: { type: "flow", labels: ["HEIRS", "TRAITORS"] },
});
const seq = [S1, S2, S3];
const P = C.planContinuity(seq, drawsCast);
t("plan: the first scene is never a continuation", !P[0].active);
t("plan: an authored continuation is active", P[1].active && P[2].active);
t("transition: a continued scene mounts with 0 transition frames", C.sceneTransIn(seq, 1) === 0 && C.sceneTransIn(seq, 2) === 0);
t("transition: even when its config still carries a wipe", C.sceneTransIn([S1, { ...S2, transition: { type: "wipeRight", frames: 12 } }], 1) === 0);
// characters
{
  const [teller, diem] = P[1].chars;
  t("char: same identity -> carried (no entrance)", teller.carried && diem.carried);
  t("char: same action -> the pose clock runs on through the cut (prev clock + prev transIn + prev duration)", diem.poseClock === 0 + C.sceneTransIn(seq, 0) + 90, JSON.stringify(diem));
  t("char: a changed action starts settled, never springing from rest", teller.poseClock === C.SETTLED_POSE, JSON.stringify(teller));
  t("char: same shot -> each keeps its screen slot (diem 0, teller 1)", diem.slot === 0 && teller.slot === 1, JSON.stringify(P[1].chars));
  const [luther, diem3] = P[2].chars;
  t("char: a NEW identity is not carried (it enters normally)", !luther.carried && diem3.carried);
  t("char: the carried figure keeps its slot, the newcomer takes the free one", diem3.slot === 0 && luther.slot === 1, JSON.stringify(P[2].chars));
  t("char: a chain carries the clock through every link", diem3.poseClock === diem.poseClock + 75);
  const slots = P[2].chars.map((c) => c.slot).sort().join(",");
  t("char: slots are always a permutation of 0..n-1", slots === "0,1");
  const shotChange = C.planContinuity([S1, { ...S2, shot: "medium" }], drawsCast)[1].chars;
  t("char: a different shot re-slots by order (the shot does not allow the old slot)", shotChange[0].slot === 0 && shotChange[1].slot === 1 && shotChange.every((c) => c.carried));
  const fromInsert = C.planContinuity([{ ...S1, shot: "insert" }, S2], drawsCast)[1].chars;
  t("char: nobody is carried out of a shot that drew nobody (insert drops its cast)", fromInsert.every((c) => !c.carried));
}
// props
{
  const [compass, crown] = P[1].props;
  t("prop: same type -> carried (visible from frame 0, no pop)", compass.carried && !crown.carried);
  t("prop: its own clock carries on (prev motif clock at the cut = prev duration - prev at)", compass.clock === 90 - 6, JSON.stringify(compass));
  t("prop: the arc it already ran is held, the same arc does not replay", compass.heldArcs.join() === "grow" && compass.arc === undefined, JSON.stringify(compass));
  t("prop: the ambient float keeps its seed and phase", compass.seed === P[0].props[0].seed && compass.ambClock === 90);
  t("prop: a new prop draws as before (clock -at, its own arc)", crown.clock === -0 && crown.heldArcs.length === 0);
  const [c3] = P[2].props;
  t("prop: a NEW arc on a carried prop runs on top of the held one", c3.carried && c3.heldArcs.join() === "grow" && c3.arc === "shrink", JSON.stringify(c3));
  t("prop: chain clock", c3.clock === compass.clock + 75);
  t("prop: a prop that disappeared is simply not planned (only current props)", P[1].props.length === 2 && !P[1].props.some((p) => p.type === "fire"));
  const spin = C.planContinuity([
    scene("x", 0, 90, { props: [{ type: "compass", at: 10, motion: "spin", motionAt: 30 }] }),
    scene("y", 90, 60, { continueFromPrev: true, props: [{ type: "compass", at: 0, motion: "spin", motionAt: 5 }] }),
  ], drawsCast);
  t("prop: a carried spin keeps its cue (no restart of the spin-up)", spin[1].props[0].cue === 20, JSON.stringify(spin[1].props[0]));
}
// diagrams
{
  const d = P[1].diagram;
  t("diagram: same type -> carried with its shell (title, frame) built", !!d && d.shell && d.title);
  t("diagram: labels it had are pre-built, the NEW one animates", d.labels[0] && d.labels[1] && !d.labels[2], JSON.stringify(d.labels.slice(0, 3)));
  t("diagram: an unchanged value is kept, a changed value is not (it moves on from the old one)", d.values[0] && !d.values[1] && d.prevValues[1] === 3);
  t("diagram: builtFrame settles a kept label and leaves a new one on the scene clock", C.builtFrame(d, 0, 5) === C.SETTLED_FRAME && C.builtFrame(d, 2, 5) === 5);
  t("diagram: no carry -> every part builds from the scene clock (as before)", C.builtFrame(null, 0, 5) === 5 && C.shellFrame(undefined, 5) === 5);
  t("diagram: a different TYPE is a new diagram (rebuilt)", P[2].diagram === null);
  t("diagram: the loop clock carries on (prev local - prev at + prev duration)", d.clock === -4 + 90);
  const moved = C.diagramCarry({ type: "flow", labels: ["A", "B"] }, { type: "flow", labels: ["B", "A"] });
  t("diagram: a label that moved position builds in where it now is", !moved.labels[0] && !moved.labels[1]);
}
// the first-beat rule and the newcomers' entrance
t("continue on the first scene is ignored by the renderer", !C.planContinuity([{ ...S1, continueFromPrev: true }], drawsCast)[0].active);
{
  // burn-of-the-everflame scene-96/97 as the director + authored cast left them
  const burn = [
    scene("scene-96", 0, 120, { characters: [{ id: "c96-0", identity: "diem", role: "diem", enter: "left" }] }),
    scene("scene-97", 120, 90, { _take: "sustained", transition: { type: "cut", frames: 0 }, characters: [{ id: "c97-0", identity: "luther", role: "luther", enter: "none", poseAt: 60 }] }),
    scene("scene-98", 210, 90, { _take: "sustained", transition: { type: "cut", frames: 0 }, characters: [{ id: "c98-0", identity: "luther", role: "luther", enter: "none", poseAt: 60 }] }),
    scene("scene-99", 300, 90, { continueFromPrev: true, transition: { type: "cut", frames: 0 }, characters: [{ id: "c99-0", identity: "luther", role: "luther", enter: "fade" }, { id: "c99-1", identity: "teller", role: "teller", enter: "none" }] }),
  ];
  const fixed = C.enterNewcomers(burn, drawsCast);
  t("bug: a person NEW to a sustained take gets a normal entrance (scene-97 luther)", burn[1].characters[0].enter !== "none" && burn[1].characters[0].poseAt === undefined, JSON.stringify(burn[1].characters[0]));
  t("bug: the entrance is the planner's normal one for that shot/index", burn[1].characters[0].enter === C.normalEnter("medium", 0, 1));
  t("bug: a person who WAS on screen keeps the continued take (scene-98 luther: enter none)", burn[2].characters[0].enter === "none" && burn[2].characters[0].poseAt === 60);
  t("bug: on an authored continuation too (scene-99 teller enters)", burn[3].characters[1].enter !== "none" && burn[3].characters[0].enter === "fade");
  t("bug: enterNewcomers names exactly the figures it gave an entrance", fixed.join() === "c97-0,c99-1", fixed.join());
  const real = path.join(REPO, "books", "burn-of-the-everflame", "config.antidote.json");
  if (fs.existsSync(real)) {
    const cfg = JSON.parse(fs.readFileSync(real, "utf8"));
    const k = cfg.scenes.findIndex((s) => s.id === "scene-97");
    const before = cfg.scenes[k] && (cfg.scenes[k].characters || [])[0];
    t("bug (real data): the shipped burn scene-97 shows luther with enter none after diem", !!before && before.identity === "luther" && before.enter === "none" && (cfg.scenes[k - 1].characters || []).every((c) => c.identity !== "luther"), JSON.stringify(before));
    C.enterNewcomers(cfg.scenes, drawsCast);
    t("bug (real data): enterNewcomers gives burn scene-97 luther an entrance", cfg.scenes[k].characters[0].enter !== "none");
  }
}
// purity + wiring
{
  const cc = code(SRC("src/engines/antidote/continuity.ts"));
  t("purity: continuity.ts uses no Math.random / Date / random() / remotion", !/Math\.random|Date\.|performance\.|\brandom\(|from "remotion"/.test(cc));
  const idx = code(SRC("src/engines/antidote/index.tsx"));
  t("wiring: index.tsx plans continuity once and hands a plan ONLY to a continued scene", /planContinuity\(config\.scenes/.test(idx) && /continuity=\{continues \? continuity\[i\] : undefined\}/.test(idx) && /const transIn = sceneTransIn\(config\.scenes, i\);/.test(idx));
  const sc = code(SRC("src/engines/antidote/components/Scene.tsx"));
  t("wiring: a carried figure enters with none and runs its carried pose clock", /enter\(carry \? "none" : spec\.enter, frame, fps\)/.test(sc) && /const clockOff = carry \? carry\.poseClock : \(spec\.poseAt \?\? 0\);/.test(sc) && /pose\(spec\.action, frame \+ clockOff, fps, cue(, embraceRole)?\)/.test(sc));
  t("wiring: a carried prop mounts on its carried clock with enter none", /from=\{transIn - pc\.clock\}/.test(sc) && /enter: "none"/.test(sc));
  t("wiring: a carried diagram gets its carry + loop clock", /carry=\{plan\.diagram\}/.test(sc) && /loopFrame=\{local \+ plan\.diagram\.clock\}/.test(sc));
  t("wiring: without a plan the scene draws as before (plan = null when inactive)", /const plan = continuity && continuity\.active \? continuity : null;/.test(sc));
  const dg = code(SRC("src/engines/antidote/components/Diagram.tsx"));
  const archs = ["Sorter", "Flow", "Spectrum", "Matrix", "Tree", "Funnel", "MatchWave"];
  t("wiring: every diagram archetype reads the carry", archs.every((a) => new RegExp(`const ${a}: React\\.FC<ArchProps> = \\([^)]*carry`).test(dg)), archs.filter((a) => !new RegExp(`const ${a}: React\\.FC<ArchProps> = \\([^)]*carry`).test(dg)).join());
  const pl = code(SRC("scripts/plan-antidote.js"));
  t("wiring: the planner gives newcomers an entrance on every continuation", /enterNewcomers\(sceneSpecs/.test(pl));
  t("wiring: the planner sets continueFromPrev only from the authored art beat", /const authorContinue = !isTitle && i > 0 && !!\(ART && ART\[i\] && ART\[i\]\.continue === true\);/.test(pl) && (pl.match(/continueFromPrev/g) || []).length === 1);
  const sb = SRC("scripts/storyboard.js");
  t("rules: rulesAntidote explains \"continue\": true to authors", /\$\{CONTINUE_LINE\}/.test(sb) && /Never as a default/.test(sb) && /"continue": true,\s+\/\/ optional: only where this beat keeps the previous beat's stage/.test(sb));
}

// ── (C) merge -> planner -> lock -> gate ─────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "authored-continue-"));
const SLUG = `zz-authored-continue-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into burning crowns.",
  "Diem stands alone inside the cold stone hall.",
  "Diem lifts her old compass toward the window.",
  "Then Luther walks in and watches her closely.",
  "Later the market square fills with angry crowds.",
];
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of SENTENCES) {
  const words = sent.split(" ");
  const start = clock;
  let line = words[0];
  for (let k = 1; k < words.length; k++) line += `<${ts(start + k * 0.3)}><c> ${words[k]}</c>`;
  const end = start + words.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 1.0;
}
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
const CAST = { diem: { name: "Diem", role: "the heir", look: "young woman" }, luther: { name: "Luther", role: "the guard", look: "older man" }, narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Fire Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["compass", "fire"] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const base = [PLAN, `--slug=${SLUG}`, "--title=Fire Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
try {
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iAlone = find(/stands alone/), iLift = find(/lifts her old compass/), iLuther = find(/Luther walks in/), iMarket = find(/market square/);
  t("fixture: every case sentence is its own beat, in order", [iAlone, iLift, iLuther, iMarket].every((k) => k > 0) && iAlone < iLift && iLift < iLuther && iLuther < iMarket, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const authoredFor = (bad) => beats.map((b, k) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, cast: [], storyboard: SB };
    if (b.i === iAlone) Object.assign(x, { cast: ["diem"], action: "think" });
    if (b.i === iLift) Object.assign(x, { cast: ["diem"], action: "think", expression: "worried", continue: true });
    if (b.i === iLuther) Object.assign(x, { cast: ["diem", "luther"], continue: true });
    if (b.i === iMarket) Object.assign(x, { cast: ["diem"], set: "abstract", continue: true });
    if (bad && k === 0) x.continue = true;
    if (bad && b.i === iLift) x.continue = "yes";
    return x;
  });
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(authoredFor(true)));
  let r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  t("merge: continue on the first beat is a problem", r.status !== 0 && /"continue": true on the first beat/.test(r.stdout), (r.stdout || "").slice(-600));
  t("merge: continue other than true is a problem", /continue must be true or left out \(got "yes"\)/.test(r.stdout));
  t("merge: nothing is written on a problem", !fs.existsSync(path.join(BOOK, "art.json")));
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(authoredFor(false)));
  r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  const art = read(path.join(BOOK, "art.json"));
  t("merge --write writes art.json (a set change is a warning, not a problem)", !!art, (r.stdout || "").slice(-600) + (r.stderr || "").slice(-300));
  t("merge: warns when the continued beat's set differs from the previous beat's", new RegExp(`${iMarket}: "continue" but set "abstract" differs`).test(r.stdout), (r.stdout || "").slice(-500));
  t("merge: no set warning where the set is the same", !new RegExp(`${iLift}: "continue" but set`).test(r.stdout) && !new RegExp(`${iLuther}: "continue" but set`).test(r.stdout));
  const ab = (i) => ((art && art.beats) || []).find((b) => b.i === i) || {};
  t("merge: continue reaches art.json", ab(iLift).continue === true && ab(iLuther).continue === true);
  t("merge: no continue where none was authored", !("continue" in ab(iAlone)));

  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written from the merged art.json", !!cfg, (r.stderr || r.stdout || "").slice(-600));
  if (process.env.CONTINUE_CONFIG_OUT && cfg) fs.writeFileSync(process.env.CONTINUE_CONFIG_OUT, JSON.stringify(cfg, null, 2));
  if (cfg) {
    const sc = (i) => cfg.scenes[i] || {};
    t("plan: continueFromPrev reaches the continued scenes", sc(iLift).continueFromPrev === true && sc(iLuther).continueFromPrev === true);
    t("plan: the transition into a continued scene is a 0-frame cut", [iLift, iLuther].every((k) => { const tr = sc(k).transition || {}; return tr.type === "cut" && tr.frames === 0; }));
    const flagged = cfg.scenes.map((s, i) => (s.continueFromPrev ? i : -1)).filter((i) => i >= 0);
    t("plan: the planner never adds continueFromPrev on its own (exactly the authored beats)", flagged.join() === [iLift, iLuther, iMarket].join(), flagged.join());
    t("schema: the planned continued scenes validate", sceneSchema.safeParse(sc(iLift)).success && sceneSchema.safeParse(sc(iLuther)).success);
    const L = sc(iLift)._authorship && sc(iLift)._authorship.lock;
    t("lock: seals continue", !!L && L.continue === true, JSON.stringify(L));
    const La = sc(iAlone)._authorship && sc(iAlone)._authorship.lock;
    t("lock: no continue sealed where none was authored", !La || !("continue" in La));
    const { stagingDrift, restoreAuthoredStaging } = require("./lib/authorship");
    t("gate: the planned continued beat has no continue drift", !stagingDrift(sc(iLift)).some((d) => d.startsWith("continue")), JSON.stringify(stagingDrift(sc(iLift))));
    const lost = JSON.parse(JSON.stringify(sc(iLift)));
    delete lost.continueFromPrev; lost.transition = { type: "wipeRight", frames: 10 };
    t("gate: an engine that drops the authored continue is drift", stagingDrift(lost).some((d) => d.startsWith("continue")), JSON.stringify(stagingDrift(lost)));
    const rewiped = JSON.parse(JSON.stringify(sc(iLift)));
    rewiped.transition = { type: "dissolve", frames: 12 };
    t("gate: a transition put back into a continued scene is drift", stagingDrift(rewiped).some((d) => d.startsWith("continue transition")));
    restoreAuthoredStaging({ scenes: [lost, rewiped] });
    t("gate --restore: the authored continue and its cut are back", lost.continueFromPrev === true && lost.transition.type === "cut" && lost.transition.frames === 0 && rewiped.transition.type === "cut");
    const added = JSON.parse(JSON.stringify(sc(iAlone)));
    added.continueFromPrev = true;
    const { evaluateAuthorship } = require("./lib/authorship");
    const ev = evaluateAuthorship({ scenes: [added] }, { engine: "antidote", slug: SLUG });
    t("gate: a continue nobody authored is reported (an engine may not continue a stage)", ev.violations.some((v) => v.code === "STAGING_OVERRIDDEN" && /continue/.test(v.message)), JSON.stringify(ev.violations.map((v) => v.message)));
    // the renderer's plan over the REAL planned config
    const plans = C.planContinuity(cfg.scenes, drawsCast);
    const who = (s) => (s.characters || []).map((c) => c.identity);
    t("render plan: the continued scene keeps diem on stage (no entrance)", plans[iLift].active && who(sc(iAlone)).includes("diem") && plans[iLift].chars[who(sc(iLift)).indexOf("diem")].carried, JSON.stringify({ a: who(sc(iAlone)), b: who(sc(iLift)), plan: plans[iLift] }));
    const li = who(sc(iLuther)).indexOf("luther");
    t("render plan: luther (new) enters normally, diem stays", li >= 0 && !plans[iLuther].chars[li].carried && plans[iLuther].chars[who(sc(iLuther)).indexOf("diem")].carried, JSON.stringify(plans[iLuther]));
    t("plan: luther's entrance in the continued scene is a real one", li >= 0 && sc(iLuther).characters[li].enter !== "none", JSON.stringify(sc(iLuther).characters));
    t("plan: no figure new to its take shows with enter none (whole config)", cfg.scenes.every((s, i) => i === 0 || !(s.continueFromPrev || s._take === "sustained") || (s.characters || []).every((c) => c.enter !== "none" || (drawsCast(cfg.scenes[i - 1].shot) ? (cfg.scenes[i - 1].characters || []) : []).some((p) => p.identity === c.identity))));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}

// ── (D) an authored person is never framed out (2026-10-21) ──────────────────
// threshing-day 40/68/70-72/78/107/197/221-226: a `continue` inherited the previous castless insert, so the
// authored person was planned on a shot that draws nobody (shots.ts dropsCast) and the frame showed an empty
// forest under the callout. Exceptions that must hold: the author's own shotOverride, and a diagram beat.
// art.json is written directly (an older book can carry diagram + cast, which merge now refuses).
{
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "authored-cast-shot-"));
  const SLUG2 = `zz-authored-cast-shot-${process.pid}`;
  const BOOK2 = path.join(tmp2, "books", SLUG2);
  const LINES = [
    "Welcome to this deep dive into burning crowns.",
    "A single brass key lies on the empty table.",
    "Diem picks it up and studies the strange teeth.",
    "Diem keeps turning the key over in her hands.",
    "The key alone fills the frame, close and heavy.",
    "The old map shows every road to the river.",
    "Then Luther walks in and greets Diem.",
    "A second key rests beside the lamp.",
    "Diem wants peace, but Luther wants war.",
  ];
  let v2 = "WEBVTT\nKind: captions\nLanguage: en\n\n", t2 = 0;
  for (const sent of LINES) {
    const w = sent.split(" "), start = t2;
    let line = w[0];
    for (let k = 1; k < w.length; k++) line += `<${ts(start + k * 0.3)}><c> ${w[k]}</c>`;
    const end = start + w.length * 0.3;
    v2 += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
    t2 = end + 1.0;
  }
  fs.mkdirSync(BOOK2, { recursive: true });
  fs.mkdirSync(path.join(tmp2, "data"), { recursive: true });
  for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp2, "data", f));
  fs.writeFileSync(path.join(tmp2, "fx.vtt"), v2);
  fs.writeFileSync(path.join(tmp2, "cast.json"), JSON.stringify({ cast: CAST }));
  fs.writeFileSync(path.join(BOOK2, "book.json"), JSON.stringify({ slug: SLUG2, title: "Key Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
  fs.writeFileSync(path.join(BOOK2, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["key"] } }));
  const base2 = [PLAN, `--slug=${SLUG2}`, "--title=Key Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp2, "fx.vtt")}`, `--cast=${path.join(tmp2, "cast.json")}`, "--scene-secs=2"];
  try {
    run([...base2, `--emit-beats=${path.join(tmp2, "beats.json")}`]);
    const em = read(path.join(tmp2, "beats.json"));
    const bs = em ? (em.beats || em) : [];
    const at = (re) => (bs.find((b) => re.test(b.narration || "")) || {}).i;
    const iTable = at(/lies on the empty table/), iPick = at(/picks it up/), iKeep = at(/keeps turning/), iClose = at(/fills the frame/), iMap = at(/old map/), iLuth = at(/Luther walks in/);
    const iSecond = at(/second key rests/), iContrast = at(/wants peace, but/);
    t("cast-shot fixture: every case sentence is its own beat, in order", [iTable, iPick, iKeep, iClose, iMap, iLuth, iSecond, iContrast].every((k) => k > 0) && iTable < iPick && iPick < iKeep && iKeep < iClose && iClose < iMap && iMap < iLuth && iLuth < iSecond && iSecond < iContrast, JSON.stringify(bs.map((b) => b.narration)));
    const beat = (b) => {
      const x = { i: b.i, narration: b.narration, concept: null, diagram: null, callout: null, cast: [], storyboard: SB };
      if (b.i === iTable) Object.assign(x, { concept: "key", shotOverride: "insert" });                       // castless insert, authored
      if (b.i === iPick) Object.assign(x, { cast: ["diem"], holds: "key", continue: true });                   // continues the insert
      if (b.i === iKeep) Object.assign(x, { cast: ["diem"], holds: "key", continue: true });                   // continues the fixed beat
      if (b.i === iClose) Object.assign(x, { cast: ["diem"], concept: "key", shotOverride: "insert" });        // the author frames her out
      if (b.i === iMap) Object.assign(x, { cast: ["diem"], diagram: { type: "flow", labels: ["ROAD", "RIVER"] } }); // older-book diagram + cast
      if (b.i === iLuth) Object.assign(x, { cast: ["diem", "luther"], continue: true });                       // two people after the diagram
      if (b.i === iSecond) Object.assign(x, { concept: "key", shotOverride: "insert" });                      // castless insert, authored
      if (b.i === iContrast) Object.assign(x, { cast: ["diem"], continue: true });                             // director plans a split (contrast)
      return x;
    };
    const artFile = path.join(BOOK2, "art.json");
    fs.writeFileSync(artFile, JSON.stringify({ beats: bs.map(beat) }));
    const r2 = run([...base2, `--callouts=${artFile}`, `--out=${path.join(tmp2, "config.json")}`]);
    const cfg2 = read(path.join(tmp2, "config.json"));
    t("cast-shot plan: config written", !!cfg2, (r2.stderr || r2.stdout || "").slice(-600));
    if (cfg2) {
      const sc = (i) => cfg2.scenes[i] || {};
      const ids = (s) => (s.characters || []).filter((c) => !c.silhouette).map((c) => c.identity);
      const drawn = (s) => (drawsCast(s.shot) ? ids(s) : []);
      t("cast-shot: the authored castless insert stays an insert", sc(iTable).shot === "insert" && !drawn(sc(iTable)).length, sc(iTable).shot);
      t("cast-shot: a continue with an authored cast does not inherit the castless insert — diem is drawn", sc(iPick).shot === "medium" && drawn(sc(iPick)).join() === "diem", `${sc(iPick).shot} ${JSON.stringify(ids(sc(iPick)))}`);
      t("cast-shot: the lock seals the people-holding shot (gate-authorship sees no drift)", ((sc(iPick)._authorship || {}).lock || {}).shot === "medium" && !require("./lib/authorship").stagingDrift(sc(iPick)).length, JSON.stringify((sc(iPick)._authorship || {}).lock));
      t("cast-shot: the next continued beat inherits the fixed shot and keeps diem on stage", sc(iKeep).shot === "medium" && drawn(sc(iKeep)).join() === "diem", sc(iKeep).shot);
      const plans2 = C.planContinuity(cfg2.scenes, drawsCast);
      t("cast-shot render plan: diem enters once (pick) and is carried (keep)", !plans2[iPick].chars[0].carried && plans2[iKeep].chars[0].carried, JSON.stringify([plans2[iPick].chars, plans2[iKeep].chars]));
      t("cast-shot: the author's own shotOverride insert wins (invariant 1)", sc(iClose).shot === "insert", sc(iClose).shot);
      t("cast-shot: a diagram beat stays an insert and shows nobody", sc(iMap).shot === "insert" && !!sc(iMap).diagram && !drawn(sc(iMap)).length, `${sc(iMap).shot} ${JSON.stringify(ids(sc(iMap)))}`);
      t("cast-shot: a two-person authored cast after a castless shot gets a two-person shot", sc(iLuth).shot === "twoShot" && drawn(sc(iLuth)).sort().join() === "diem,luther", `${sc(iLuth).shot} ${JSON.stringify(ids(sc(iLuth)))}`);
      // threshing-day 71: the director's split backdrop (half-and-half field) stayed behind the re-framed person
      t("cast-shot: the re-framed beat leaves no split backdrop behind the person (contrast beat after a castless insert)", sc(iContrast).shot === "medium" && drawn(sc(iContrast)).join() === "diem" && !(sc(iContrast).bg || {}).split, `${sc(iContrast).shot} split=${JSON.stringify((sc(iContrast).bg || {}).split)}`);
      t("cast-shot: the planner says which beat it re-framed (stdout)", new RegExp(`scene ${iPick}: authored cast diem on "insert"`).test(r2.stdout || "") && !new RegExp(`scene ${iClose}: authored cast`).test(r2.stdout || ""), (r2.stdout || "").split("\n").filter((l) => /↻ scene/.test(l)).join(" | "));
    }
  } finally {
    if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp2, { recursive: true, force: true }); else console.log("fixture kept: " + tmp2);
    if (fs.existsSync(path.join(REPO, "books", SLUG2))) fs.rmSync(path.join(REPO, "books", SLUG2), { recursive: true, force: true });
  }
}

console.log(failed ? `\n${failed} FAILED` : "\nall authored-continue checks passed");
process.exit(failed ? 1 : 0);
