#!/usr/bin/env node
// Authored LIFT (10x pilot B, 2026-10-26): "Demi gently lifts her frail mother into the bathtub".
//   art.json: "action": "lift", "cast": [who lifts, who is lifted], "concept": <the destination>, optional "actionCue"
//   -> merge validates (two people, a destination, cue spoken) -> planner: wide shot, word-timed actionAt on both,
//   partner `lifted` -> lock seals actionAt + partnerAction -> gate/restore -> Scene carries both bodies to the
//   destination icon (drawn in front of her once she is set down) -> pose() is a pure function of (frame, cue).
// Run: node scripts/test-authored-lift.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");

// ── (A) schema, poses, layout ───────────────────────────────────────────────
const { charAction, characterSchema } = require("../src/engines/antidote/schema.ts");
t("schema: lift and lifted are actions", charAction.options.includes("lift") && charAction.options.includes("lifted"));
const M = require("../src/engines/antidote/movements.ts");
const { pose, LIFT_APPROACH, LIFT_RISE, LIFT_CARRY, LIFT_LOWER } = M;
const fps = 30, CUE = 60;
{
  let still = true, mono = true, same = true, kept = true, jump = 0;
  for (let f = 0; f <= 500; f++) {
    const a = pose("lift", f, fps, CUE), b = pose("lifted", f, fps, CUE);
    if (f <= CUE - LIFT_APPROACH && (a.contact || 0) !== 0) still = false;
    if (f > 0) {
      const pa = pose("lift", f - 1, fps, CUE), pb = pose("lifted", f - 1, fps, CUE);
      if ((a.contact || 0) < (pa.contact || 0) || (a.carry || 0) < (pa.carry || 0) || (b.placed || 0) < (pb.placed || 0)) mono = false;
      jump = Math.max(jump, Math.abs((b.hipY || 0) - (pb.hipY || 0)));
    }
    if (Math.abs((a.carry || 0) - (b.carry || 0)) > 1e-9) same = false; // both bodies move by ONE carry
    if (f >= CUE + LIFT_RISE + LIFT_CARRY + LIFT_LOWER + 20 && ((b.placed || 0) < 1 || (b.carry || 0) < 1)) kept = false;
    if (JSON.stringify(b) !== JSON.stringify(pose("lifted", f, fps, CUE))) same = false;
  }
  t("lift: the lifter stays put until the approach starts", still);
  t("lift: approach, carry and set-down only move forward (monotonic)", mono);
  t("lift: lifter and lifted share one carry clock; pure", same);
  t("lift: she stays set down in the destination (result kept)", kept);
  t("lift: no vertical snap (< 30 rig px/frame ≈ 0.9 body-heights/s)", jump < 30, String(jump));
  const held = pose("lifted", CUE + LIFT_RISE + 5, fps, CUE), before = pose("lifted", CUE - 10, fps, CUE);
  t("lifted: off the floor while held, standing before the cue", (held.hipY || 0) < -100 && (before.hipY || 0) === 0 && (before.sit || 0) === 0, JSON.stringify([held.hipY, before.hipY]));
  t("lifted: held, never on the rig's stool (v1 read it as a ladder)", held.noStool === true);
}
const { liftLayout, isLift, LIFT_GAP } = require("../src/engines/antidote/liftLayout.ts");
{
  const L = liftLayout({ x: 600, y: 540, scale: 0.6 }, { x: 1100, y: 540, scale: 0.6 });
  t("layout: the lifter ends LIFT_GAP short of her (arms under her, not inside her)", Math.abs(600 + L.approach - (1100 - LIFT_GAP * 0.6)) < 1e-6);
  t("layout: the destination is BEYOND her, in the lifter's direction (a forward carry)", L.dir === 1 && L.dest.x > 1100 && L.carry > 0);
  const R = liftLayout({ x: 1300, y: 540, scale: 0.6 }, { x: 800, y: 540, scale: 0.6 });
  t("layout: mirrored when the lifter stands on the right", R.dir === -1 && R.dest.x < 800 && R.carry < 0);
  t("layout: the destination stands on the floor line", L.dest.y < L.floorY && L.floorY - L.dest.y < 300);
  t("isLift: only lift + lifted, two bodies", isLift([{ action: "lift" }, { action: "lifted" }]) && !isLift([{ action: "lift" }]) && !isLift([{ action: "embrace" }, { action: "embrace" }]));
}
const everyman = fs.readFileSync(path.join(REPO, "src/engines/antidote/characters/Everyman.tsx"), "utf8");
t("wiring: Everyman skips the stool for a held body", /sit > 0\.35 && !pose\.noStool/.test(everyman));
const sceneSrc = fs.readFileSync(path.join(REPO, "src/engines/antidote/components/Scene.tsx"), "utf8");
t("wiring: Scene moves the bodies by approach·contact + carry·carry", /liftDx\.approach \* \(p\.contact \?\? 0\) \+ liftDx\.carry \* \(p\.carry \?\? 0\)/.test(sceneSrc));
t("wiring: the destination icon is drawn IN FRONT of the cast", /liftDest >= 0 \? renderProp\(props\[liftDest\], liftDest\) : null/.test(sceneSrc));
const { PAIRED } = require("./lib/partner-contract");
t("partner contract: lift pairs with lifted", PAIRED && PAIRED.lift === "lifted");

// ── (B) merge -> planner -> lock -> gate on a word-timed fixture ────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "authored-lift-"));
const SLUG = `zz-authored-lift-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into a family story.",
  "She sits by her mother in the quiet ward.",
  "Then she gently lifts her frail mother into the bathtub.",
  "The water is warm and her mother smiles.",
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
const CAST = { demi: { name: "Demi", role: "the daughter", look: "woman, long dark hair" }, mother: { name: "Mother", role: "her frail mother", look: "older woman, short red hair" }, narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Lift Test", author: "A. Writer", genre: "memoir", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["water"] } }));
fs.writeFileSync(path.join(BOOK, "motifs.json"), JSON.stringify({ bathtub: { title: "Bathtub", reads: "a white bathtub seen from the side", viewBox: "0 0 520 520", paths: [{ d: "M52 236 L468 236 L446 372 Q436 416 392 416 L128 416 Q84 416 74 372 Z", fill: "#F3F0EA", stroke: "ink", strokeWidth: 12 }] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const base = [PLAN, `--slug=${SLUG}`, "--title=Lift Test", "--author=A. Writer", "--genre=memoir", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
try {
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const iLift = (beats.find((b) => /gently lifts/.test(b.narration || "")) || {}).i;
  t("fixture: the lift sentence is its own beat", iLift > 0, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const write = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, set: "hospital" };
    if (b.i === iLift) Object.assign(x, { cast: ["demi", "mother"], action: "lift", concept: "water", actionCue: "gently lifts", expression: "neutral", partnerExpression: "sad" });
    if (mut) mut(x, b.i);
    return x;
  })));
  write((x, i) => { if (i === iLift) x.cast = ["demi"]; });
  let r = merge();
  t("merge: lift without exactly two people is refused", r.status !== 0 && /action "lift" needs exactly two cast members/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iLift) x.concept = null; });
  r = merge();
  t("merge: lift without a destination is refused", r.status !== 0 && /action "lift" needs a destination/.test(r.stdout));
  write((x, i) => { if (i === iLift) x.actionCue = "never said"; });
  r = merge();
  t("merge: an unspoken lift cue is refused", r.status !== 0 && /actionCue "never said" is not spoken/.test(r.stdout));
  // 10x P1 (2026-10-27): the next beat MAY continue a lift — she stays in the destination (carried state)…
  write((x, i) => { if (i === iLift + 1) Object.assign(x, { cast: ["demi", "mother"], action: "idle", continue: true }); });
  r = merge();
  t("merge: continuing after a lift is accepted (the end state is carried)", r.status === 0, (r.stdout || "").slice(-300));
  // …but an action that needs her legs would teleport her out of it
  write((x, i) => { if (i === iLift + 1) Object.assign(x, { cast: ["mother", "demi"], action: "walk", continue: true }); });
  r = merge();
  t("merge: walking out of the destination in a continued beat is refused", r.status !== 0 && /would teleport her out/.test(r.stdout), (r.stdout || "").slice(-300));
  write(null);
  r = merge();
  const art = read(path.join(BOOK, "art.json"));
  t("merge --write writes the lift", !!art && ((art.beats || []).find((b) => b.i === iLift) || {}).action === "lift", (r.stdout || "").slice(-600));
  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-500));
  if (cfg) {
    const sc = cfg.scenes[iLift] || {}, ch = sc.characters || [];
    // the cue "gently lifts" starts at word 3 of "Then she gently lifts ..." (0.6 s); anchorAt leads by 4 frames
    t("plan: wide shot (the carry needs the room)", sc.shot === "wide", sc.shot);
    t("plan: demi lifts, mother is lifted, both on the cue word", ch.length === 2 && ch[0].identity === "demi" && ch[0].action === "lift" && ch[1].identity === "mother" && ch[1].action === "lifted" && ch[0].actionAt != null && ch[0].actionAt === ch[1].actionAt && Math.abs(ch[0].actionAt - (Math.round(2 * 0.3 * 30) - 4)) <= 3, JSON.stringify(ch.map((c) => [c.identity, c.action, c.actionAt])));
    t("plan: the destination is on stage", (sc.props || []).length >= 1, JSON.stringify(sc.props));
    t("plan: the author's faces reach both figures", ch[0].expression === "neutral" && ch[1].expression === "sad", JSON.stringify(ch.map((c) => c.expression)));
    const L = sc._authorship && sc._authorship.lock;
    t("lock: seals the moment and the partner's `lifted`", !!L && L.actionAt === ch[0].actionAt && L.partnerAction === "lifted", JSON.stringify(L));
    const { stagingDrift, restoreAuthoredStaging } = require("./lib/authorship");
    t("gate: the planned beat has no drift", stagingDrift(sc).length === 0, JSON.stringify(stagingDrift(sc)));
    const later = JSON.parse(JSON.stringify(cfg));
    later.scenes[iLift].characters[1].action = "idle"; delete later.scenes[iLift].characters[0].actionAt;
    const d = stagingDrift(later.scenes[iLift]);
    t("gate: dropping the partner's lifted / the moment is drift", d.some((x) => /^partner lifted/.test(x)) && d.some((x) => /^action moment/.test(x)), JSON.stringify(d));
    restoreAuthoredStaging(later);
    t("restore: she is lifted again, on the authored moment", later.scenes[iLift].characters[1].action === "lifted" && later.scenes[iLift].characters[0].actionAt === ch[0].actionAt);
    t("schema: the planned figures validate", ch.every((c) => characterSchema.safeParse(c).success));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall authored-lift checks passed");
process.exit(failed ? 1 : 0);
