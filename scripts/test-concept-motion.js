#!/usr/bin/env node
// Authorable icon behaviour (2026-10-19, burn-of-the-everflame scene-39: "the compass spins
// uselessly" while the shared compass only swayed ±14°).
//   art.json beat: "conceptMotion": "spin" [+ "conceptMotionCue": "<phrase in this beat>"]
//   -> storyboard merge carries + validates it -> plan-antidote sets props[].motion/motionAt
//      on the beat's own concept icon (word-synced) -> the lock seals it -> the gate reports
//      a lost motion and --restore puts it back -> schema.ts validates it -> the Compass
//      motif draws compassNeedleAngle(), a pure function of frame.
// Default unchanged: no field = no motion = the old sway, frame for frame.
// Runs the REAL merge (--root=<temp>) and planner (--out) on a word-timed fixture.
// Run: node scripts/test-concept-motion.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");

// ── (A) schema ──────────────────────────────────────────────────────────────
const { propSchema, CONCEPT_MOTIONS } = require("../src/engines/antidote/schema.ts");
t("schema: a compass prop with motion spin + motionAt validates", propSchema.safeParse({ type: "compass", motion: "spin", motionAt: 30 }).success);
t("schema: an unknown motion is refused", !propSchema.safeParse({ type: "compass", motion: "wobble" }).success);
t("schema: a default prop carries no motion", propSchema.parse({ type: "compass" }).motion === undefined);
t("schema: CONCEPT_MOTIONS names compass: spin", JSON.stringify(CONCEPT_MOTIONS.compass) === JSON.stringify(["spin"]));

// ── (B) determinism + default unchanged ─────────────────────────────────────
const { interpolate } = require("remotion");
const { compassNeedleAngle, compassSway, motionCueLocal } = require("../src/engines/antidote/conceptMotion.ts");
const OLD = (frame) => interpolate(Math.sin(frame * 0.08), [-1, 1], [-14, 14]); // the pre-2026-10-19 Compass line
let same = true, def = true, pre = true;
for (let f = 0; f <= 900; f++) {
  if (compassNeedleAngle(f, "spin", 40) !== compassNeedleAngle(f, "spin", 40)) same = false;
  if (compassNeedleAngle(f) !== OLD(f) || compassNeedleAngle(f, undefined, 40) !== OLD(f) || compassSway(f) !== OLD(f)) def = false;
  if (f < 40 && compassNeedleAngle(f, "spin", 40) !== OLD(f)) pre = false;
}
t("determinism: same frame -> same angle (0..900, twice)", same);
t("default: no motion = the old sway, frame for frame", def);
t("spin: before its cue the needle sways exactly as the default", pre);
t("spin: continuous at the cue (no jump)", Math.abs(compassNeedleAngle(40, "spin", 40) - OLD(40)) < 1e-9 && Math.abs(compassNeedleAngle(41, "spin", 40) - compassNeedleAngle(40, "spin", 40)) < 6);
let fast = true;
for (let f = 60; f <= 900; f++) if (Math.abs(compassNeedleAngle(f + 1, "spin", 40) - compassNeedleAngle(f, "spin", 40)) < 8) fast = false;
t("spin: after spin-up it never settles (≥ 8°/frame through frame 900)", fast);
t("spin: at full speed it turns more than 1.5 times a second (30 fps)", compassNeedleAngle(90, "spin", 40) - compassNeedleAngle(60, "spin", 40) > 540);
t("cue: motionAt is scene-relative like `at` (local = motionAt - at)", motionCueLocal({ at: 8, motionAt: 50 }) === 42 && motionCueLocal({ at: 8 }) === 0);
const cm = fs.readFileSync(path.join(REPO, "src/engines/antidote/conceptMotion.ts"), "utf8");
const cmCode = cm.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
t("purity: conceptMotion.ts code uses no Math.random / Date / random()", !/Math\.random|Date\.|performance\.|\brandom\(/.test(cmCode));
const motifs = fs.readFileSync(path.join(REPO, "src/engines/antidote/motifs.tsx"), "utf8");
t("wiring: Compass draws compassNeedleAngle(frame, spec.motion, motionCueLocal(spec))", /const needleAngle = compassNeedleAngle\(frame, spec\.motion, motionCueLocal\(spec\)\);/.test(motifs));
const sbSrc = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
t("rules: rulesAntidote shows the conceptMotion line to authors", /\$\{conceptMotionLine\(v\)\}/.test(sbSrc) && /spins \/ turns uselessly \/ keeps changing direction/.test(sbSrc));

// ── (C) merge -> planner -> lock -> gate ─────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "concept-motion-"));
const SLUG = `zz-concept-motion-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into burning crowns.",
  "Her old compass spins uselessly in her palm.",
  "She lifts the compass and it keeps turning.",
  "The compass needle points north toward home again.",
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
const CAST = { diem: { name: "Diem", role: "the heir", look: "young woman" }, narrator: { name: "Narrator", role: "host", look: "host" } };
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
  const iCallout = find(/spins uselessly/), iCue = find(/keeps turning/), iPlain = find(/points north/);
  t("fixture: every case sentence is its own beat", [iCallout, iCue, iPlain].every((k) => k > 0) && new Set([iCallout, iCue, iPlain]).size === 3, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const authoredFor = (bad) => beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, cast: [], storyboard: SB };
    if (b.i === iCallout) Object.assign(x, { concept: "compass", conceptMotion: "spin", callout: { text: "Spins uselessly", style: "reveal" } });
    if (b.i === iCue) Object.assign(x, { concept: "compass", conceptMotion: "spin", conceptMotionCue: "keeps turning" });
    if (b.i === iPlain) Object.assign(x, { concept: "compass" });
    if (bad && b.i === iPlain) Object.assign(x, { concept: "fire", conceptMotion: "spin" });
    if (bad && b.i === iCue) x.conceptMotionCue = "never said here";
    return x;
  });
  // a bad authoring is refused by merge (and art.json is not written)
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(authoredFor(true)));
  let r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  t("merge: conceptMotion on an icon that does not draw it is a problem", r.status !== 0 && /conceptMotion "spin" is not drawn by icon "fire"/.test(r.stdout), (r.stdout || "").slice(-500));
  t("merge: a conceptMotionCue not spoken in the beat is a problem", /conceptMotionCue "never said here" is not spoken/.test(r.stdout));
  t("merge: nothing is written on a problem", !fs.existsSync(path.join(BOOK, "art.json")));
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(authoredFor(false)));
  r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  const art = read(path.join(BOOK, "art.json"));
  t("merge --write writes art.json", !!art, (r.stdout || "").slice(-600) + (r.stderr || "").slice(-300));
  const ab = (i) => ((art && art.beats) || []).find((b) => b.i === i) || {};
  t("merge: conceptMotion (+ cue) reach art.json", ab(iCallout).conceptMotion === "spin" && ab(iCue).conceptMotion === "spin" && ab(iCue).conceptMotionCue === "keeps turning");
  t("merge: no conceptMotion where none was authored", !("conceptMotion" in ab(iPlain)));

  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written from the merged art.json", !!cfg, (r.stderr || r.stdout || "").slice(-600));
  if (process.env.CONCEPT_MOTION_CONFIG_OUT && cfg) fs.writeFileSync(process.env.CONCEPT_MOTION_CONFIG_OUT, JSON.stringify(cfg, null, 2));
  if (cfg) {
    const sc = (i) => cfg.scenes[i] || {};
    const compassOf = (s) => (s.props || []).find((p) => p.type === "compass");
    const pc = compassOf(sc(iCallout)), pq = compassOf(sc(iCue)), pp = compassOf(sc(iPlain));
    t("plan: the compass is on screen in all three beats", !!pc && !!pq && !!pp, JSON.stringify([sc(iCallout).props, sc(iCue).props, sc(iPlain).props]));
    if (pc && pq && pp) {
      const callout = (sc(iCallout).texts || []).find((x) => /USELESSLY/.test(x.text));
      t("plan: spin without a cue starts on the callout's anchored word", pc.motion === "spin" && !!callout && pc.motionAt === Math.max(pc.at ?? 0, callout.at), JSON.stringify({ pc, callout: callout && callout.at }));
      // "keeps" is word 7 of its caption (1.8 s in); anchorAt leads the word by 4 frames
      // (fixture: words every 0.3 s from the caption start = the scene start; 30 fps)
      const s = sc(iCue), capStart = Math.round(s.fromFrame ?? 0);
      const expect = Math.round((6 * 0.3) * 30) - 4;
      t("plan: spin with conceptMotionCue starts on that phrase (word-timed)", pq.motion === "spin" && Math.abs(pq.motionAt - expect) <= 2, JSON.stringify({ pq, expect, capStart }));
      t("plan: a compass without conceptMotion has no motion (sway)", pp.motion === undefined && pp.motionAt === undefined, JSON.stringify(pp));
      const { propSchema: PS } = require("../src/engines/antidote/schema.ts");
      t("schema: the planned motion props validate", PS.safeParse(pc).success && PS.safeParse(pq).success);
      const L = sc(iCallout)._authorship && sc(iCallout)._authorship.lock;
      t("lock: seals conceptMotion and the props carrying it", !!L && L.conceptMotion === "spin" && (L.props || []).some((p) => p.type === "compass" && p.motion === "spin"), JSON.stringify(L && { cm: L.conceptMotion, props: L.props }));
      const { stagingDrift, restoreAuthoredStaging } = require("./lib/authorship");
      t("gate: the planned spin beat has no motion drift", !stagingDrift(sc(iCallout)).some((d) => d.startsWith("icon motion")), JSON.stringify(stagingDrift(sc(iCallout))));
      const later = JSON.parse(JSON.stringify(sc(iCallout)));
      later.props.forEach((p) => { delete p.motion; delete p.motionAt; });
      t("gate: an engine that drops the authored spin is drift", stagingDrift(later).some((d) => d.startsWith("icon motion")), JSON.stringify(stagingDrift(later)));
      restoreAuthoredStaging({ scenes: [later] });
      t("gate --restore: the authored spin is back", (compassOf(later) || {}).motion === "spin" && (compassOf(later) || {}).motionAt === pc.motionAt);
      const Lp = sc(iPlain)._authorship && sc(iPlain)._authorship.lock;
      t("lock: no conceptMotion sealed where none was authored", !Lp || !("conceptMotion" in Lp));
    }
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : "\nall concept-motion checks passed");
process.exit(failed ? 1 : 0);
