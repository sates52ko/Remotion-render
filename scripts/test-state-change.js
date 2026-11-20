#!/usr/bin/env node
// Authored STATE CHANGE (2026-10-20, plan P2 candidate 1; burn scene-218: "finally break the curse" drew one
// intact chains icon — the authored beforeAfter had no after-state, the break lived only in the caption).
//   art.json beat: "concept": "chains", "conceptMotion": "break" [+ "conceptMotionCue"]   (phone: "light")
//   -> storyboard merge validates it (icon draws it, cue spoken, a continued stage keeps the end state,
//      authored beforeAfter refused) -> plan-antidote sets props[].motion/motionAt (word-synced) -> lock ->
//      continuity.ts carries the cue into continued beats -> the motif draws stateProgress(), pure in frame.
// Default unchanged: no field = the icon's old drawing.
// Runs the REAL merge (--root=<temp>) and planner (--out) on a word-timed fixture.
// Run: node scripts/test-state-change.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");

// ── (A) schema + pure state function ────────────────────────────────────────
const { propSchema, CONCEPT_MOTIONS, STATE_MOTIONS } = require("../src/engines/antidote/schema.ts");
t("schema: chains break / phone light are authorable", JSON.stringify(CONCEPT_MOTIONS.chains) === '["break"]' && JSON.stringify(CONCEPT_MOTIONS.phone) === '["light"]' && !CONCEPT_MOTIONS.lightbulb);
t("schema: compass keeps only spin", JSON.stringify(CONCEPT_MOTIONS.compass) === '["spin"]');
t("schema: break and light are state motions, spin is not", STATE_MOTIONS.includes("break") && STATE_MOTIONS.includes("light") && !STATE_MOTIONS.includes("spin"));
t("schema: a chains prop with motion break validates", propSchema.safeParse({ type: "chains", motion: "break", motionAt: 40 }).success);
const { stateProgress } = require("../src/engines/antidote/conceptMotion.ts");
let before = true, after = true, mono = true, same = true, other = true;
for (let f = 0; f <= 900; f++) {
  const v = stateProgress(f, "break", "break", 40);
  if (f < 40 && v !== 0) before = false;
  if (f >= 52 && v !== 1) after = false;
  if (f > 0 && v < stateProgress(f - 1, "break", "break", 40)) mono = false;
  if (v !== stateProgress(f, "break", "break", 40)) same = false;
  if (stateProgress(f, undefined, "break", 40) !== 0 || stateProgress(f, "light", "break", 40) !== 0) other = false;
}
t("state: start state (0) on every frame before the cue", before);
t("state: end state (1) on every frame from cue + 12 through 900 — it is kept", after);
t("state: never goes back (monotonic)", mono);
t("state: pure — same frame, same value (a jump to any frame = the clip)", same);
t("state: no motion / another motion = start state forever (default drawing)", other);
const motifs = fs.readFileSync(path.join(REPO, "src/engines/antidote/motifs.tsx"), "utf8");
t("wiring: Chains draws stateProgress(frame, spec.motion, \"break\", motionCueLocal(spec))", /stateProgress\(frame, spec\.motion, "break", motionCueLocal\(spec\)\)/.test(motifs));
t("wiring: Phone draws stateProgress(frame, spec.motion, \"light\", cue) with cue = motionCueLocal(spec)", /const cue = motionCueLocal\(spec\);\s+const lit = stateProgress\(frame, spec\.motion, "light", cue\);/.test(motifs));
t("wiring: the message pops only from the cue (never before)", /const pop = frame < cue \? 0 : spring\(/.test(motifs));
const sbSrc = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
t("rules: the rules line describes both state changes and the kept end state", /STATE CHANGE: intact chains snap apart/.test(sbSrc) && /STATE CHANGE: a dark phone screen lights up/.test(sbSrc) && /the end state is kept/.test(sbSrc));

// ── (B) merge -> planner -> lock -> continuity ──────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "state-change-"));
const SLUG = `zz-state-change-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into burning crowns.",
  "For centuries the old chains held him fast.",
  "Then at last the chains break apart completely.",
  "The broken chains lie in the dust now.",
  "Then the phone screen lights up with news.",
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
const CAST = { ignas: { name: "Ignas", role: "the cursed king", look: "old man, grey robe" }, narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Fire Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["chains", "phone"] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const base = [PLAN, `--slug=${SLUG}`, "--title=Fire Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = (write) => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, ...(write ? ["--write"] : []), `--root=${tmp}`]);
try {
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iHeld = find(/held him fast/), iBreak = find(/chains break/), iAfter = find(/lie in the dust/), iBulb = find(/screen lights up/);
  t("fixture: every case sentence is its own beat", [iHeld, iBreak, iAfter, iBulb].every((k) => k > 0) && new Set([iHeld, iBreak, iAfter, iBulb]).size === 4, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const authoredFor = (mut) => beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, cast: [], set: "forest", shotOverride: "illustration", storyboard: SB };
    if (b.i === iHeld) Object.assign(x, { concept: "chains", callout: { text: "Bound for a thousand years", style: "reveal" } });
    if (b.i === iBreak) Object.assign(x, { concept: "chains", continue: true, conceptMotion: "break", conceptMotionCue: "chains break", callout: { text: "The curse breaks", style: "reveal" } });
    if (b.i === iAfter) Object.assign(x, { concept: "chains", continue: true, conceptMotion: "break" });
    if (b.i === iBulb) Object.assign(x, { concept: "phone", conceptMotion: "light", conceptMotionCue: "lights up", set: "horizon" });
    if (mut) mut(x, b.i);
    return x;
  });
  const writeA = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(authoredFor(mut)));

  // refusals (nothing written)
  writeA((x, i) => { if (i === iAfter) delete x.conceptMotion; });
  let r = merge(true);
  t("merge: a continued chains beat without the break would jump back to intact — refused", r.status !== 0 && new RegExp(`${iAfter}: continues "chains" after its state change "break"`).test(r.stdout), (r.stdout || "").slice(-600));
  writeA((x, i) => { if (i === iHeld) x.shotOverride = "beforeAfter"; });
  r = merge(true);
  t("merge: an authored beforeAfter (one icon, no after-state) is refused and names the state changes", r.status !== 0 && /shotOverride "beforeAfter" draws only ONE icon/.test(r.stdout) && /chains: break/.test(r.stdout), (r.stdout || "").slice(-600));
  writeA((x, i) => { if (i === iBulb) x.conceptMotion = "break"; });
  r = merge(true);
  t("merge: a state change the icon does not draw is refused", r.status !== 0 && /conceptMotion "break" is not drawn by icon "phone"/.test(r.stdout));
  t("merge: nothing is written on a problem", !fs.existsSync(path.join(BOOK, "art.json")));

  // the valid sequence: held (start) -> break on its word (change) -> kept broken (result)
  writeA(null);
  r = merge(true);
  const art = read(path.join(BOOK, "art.json"));
  t("merge --write writes art.json", !!art, (r.stdout || "").slice(-800) + (r.stderr || "").slice(-300));
  const ab = (i) => ((art && art.beats) || []).find((b) => b.i === i) || {};
  t("merge: the break + cue + continue reach art.json", ab(iBreak).conceptMotion === "break" && ab(iBreak).conceptMotionCue === "chains break" && ab(iBreak).continue === true && ab(iAfter).conceptMotion === "break");
  t("merge: no motion on the start-state beat", !("conceptMotion" in ab(iHeld)));

  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-600));
  if (process.env.STATE_CHANGE_CONFIG_OUT && cfg) fs.writeFileSync(process.env.STATE_CHANGE_CONFIG_OUT, JSON.stringify(cfg, null, 2));
  if (cfg) {
    const sc = (i) => cfg.scenes[i] || {};
    const icon = (s, ty) => (s.props || []).find((p) => p.type === ty);
    const h = icon(sc(iHeld), "chains"), b = icon(sc(iBreak), "chains"), a = icon(sc(iAfter), "chains"), l = icon(sc(iBulb), "phone");
    t("plan: the chains are on screen in all three beats, the phone in its beat", !!h && !!b && !!a && !!l, JSON.stringify([sc(iHeld).props, sc(iBreak).props, sc(iAfter).props, sc(iBulb).props]));
    if (h && b && a && l) {
      t("plan: start-state beat has no motion", h.motion === undefined && h.motionAt === undefined);
      // "break" is word 5 of "Then at last the chains break ..." (1.2 s); "chains" word 4 (0.9 s); anchorAt leads by 4 frames
      const expect = Math.round(4 * 0.3 * 30) - 4;
      t("plan: the break starts on the authored cue phrase (word-timed)", b.motion === "break" && Math.abs(b.motionAt - expect) <= 3, JSON.stringify({ b, expect }));
      t("plan: the phone lights on \"lights up\"", l.motion === "light" && Math.abs(l.motionAt - (Math.round(4 * 0.3 * 30) - 4)) <= 3, JSON.stringify(l));
      t("plan: both continued beats are continuations", sc(iBreak).continueFromPrev === true && sc(iAfter).continueFromPrev === true, JSON.stringify([sc(iBreak).continueFromPrev, sc(iAfter).continueFromPrev]));
      const L = sc(iBreak)._authorship && sc(iBreak)._authorship.lock;
      t("lock: seals the break on the chains prop", !!L && L.conceptMotion === "break" && (L.props || []).some((p) => p.type === "chains" && p.motion === "break"));
      const { stagingDrift } = require("./lib/authorship");
      t("gate: no motion drift on the planned beats", ![iBreak, iAfter, iBulb].some((i) => stagingDrift(sc(i)).some((d) => d.startsWith("icon motion"))));
      for (const i of [iHeld, iBreak, iAfter, iBulb]) t(`schema: scene ${i} props validate`, (sc(i).props || []).every((p) => propSchema.safeParse(p).success));

      // continuity: the renderer's decision for the carried chains (Scene.tsx draws motionAt = plan cue)
      const C = require("../src/engines/antidote/continuity.ts");
      const scenes = cfg.scenes;
      const plans = C.planContinuity(scenes, () => true);
      const pi = (i) => (scenes[i].props || []).findIndex((p) => p.type === "chains");
      const pb = plans[iBreak].props[pi(iBreak)], pa = plans[iAfter].props[pi(iAfter)];
      t("continuity: the chains are carried into the break beat and the after beat (same object)", pb && pb.carried && pa && pa.carried, JSON.stringify({ pb, pa }));
      if (pb && pa && pb.carried && pa.carried) {
        // the motif's local frame for scene-local frame f is f - (transIn - clock); cue is on that clock
        const localOf = (plan, f) => f + plan.clock; // continued scenes: transIn = 0
        t("continuity: break beat — intact before its cue, broken after it", stateProgress(localOf(pb, 0), "break", "break", pb.cue) === 0 && stateProgress(localOf(pb, sc(iBreak).durationFrames - 1), "break", "break", pb.cue) === 1, JSON.stringify(pb));
        t("continuity: after beat — inherits the break beat's cue (the chains are broken from its first frame)", pa.cue === pb.cue && stateProgress(localOf(pa, 0), "break", "break", pa.cue) === 1, JSON.stringify({ pa, pb }));
      }
    }
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : "\nall state-change checks passed");
process.exit(failed ? 1 : 0);
