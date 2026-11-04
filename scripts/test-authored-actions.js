#!/usr/bin/env node
// Authored ACTIONS that happen on screen (2026-10-20): `take` (reach -> the hand closes on the object on the cue ->
// it stays in hand) and `embrace` (two people: the lead closes the gap, contact on the cue, they hold each other).
//   art.json: "action": "take", "holds": X / "action": "embrace", "cast": [a, b]; optional "actionCue": "<phrase>"
//   -> merge validates (holds / two people / cue spoken / a continued take keeps the object) -> planner: word-timed
//   actionAt on the lead (+ partner), partner embraces back -> lock seals actionAt + partnerAction -> gate/restore
//   -> continuity carries the cue (a continued action is not replayed) -> pose() is a pure function of (frame, cue).
// Run: node scripts/test-authored-actions.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");

// ── (A) schema + poses ──────────────────────────────────────────────────────
const { charAction, characterSchema } = require("../src/engines/antidote/schema.ts");
t("schema: take and embrace are actions", charAction.options.includes("take") && charAction.options.includes("embrace"));
t("schema: a character with actionAt validates", !!characterSchema && characterSchema.safeParse({ id: "c", rig: "everyman", action: "take", holds: "phone", actionAt: 40 }).success);
const M = require("../src/engines/antidote/movements.ts");
const { pose, TAKE_BRING, EMBRACE_APPROACH, TAKE_REST_ARM, TAKE_REST_ELBOW } = M;
const fps = 30, CUE = 60;
{
  let rest = true, held = true, same = true, jump = 0, atCue = 0;
  for (let f = 0; f <= 400; f++) {
    const p = pose("take", f, fps, CUE);
    if (f < CUE && p.take !== 0) rest = false;
    if (f >= CUE && p.take !== 1) held = false;
    if (JSON.stringify(p) !== JSON.stringify(pose("take", f, fps, CUE))) same = false;
    if (f > CUE) jump = Math.max(jump, Math.abs(p.armR - pose("take", f - 1, fps, CUE).armR));
    if (f === CUE) atCue = Math.abs(p.armR - pose("take", f - 1, fps, CUE).armR);
  }
  t("take: object rests (take 0) on every frame before the cue", rest);
  t("take: object in hand (take 1) on every frame from the cue", held);
  t("take: pure — same frame, same pose", same);
  t("take: no arm jump at the cue (< 2 deg)", atCue < 2, String(atCue));
  t("take: the bring-in is a motion, not a snap (< 15 deg/frame)", jump < 15, String(jump));
  const settled = pose("reach", 400, fps);
  t("take: the rest spot is the settled reach (shared constants)", Math.abs(settled.armR - TAKE_REST_ARM) < 0.5 && Math.abs((settled.elbowR ?? 0) - TAKE_REST_ELBOW) < 0.5, JSON.stringify([settled.armR, settled.elbowR]));
  const end = pose("take", CUE + TAKE_BRING + 30, fps, CUE), hold = pose("hold", 400, fps);
  t("take: ends in the hold pose (object at the chest)", Math.abs(end.armR - hold.armR) < 0.5 && Math.abs((end.elbowR ?? 0) - (hold.elbowR ?? 0)) < 0.5, JSON.stringify([end.armR, end.elbowR, hold.armR, hold.elbowR]));
}
{
  let before = true, after = true, mono = true;
  for (let f = 0; f <= 400; f++) {
    const c = pose("embrace", f, fps, CUE).contact;
    if (f <= CUE - EMBRACE_APPROACH && c !== 0) before = false;
    if (f >= CUE && Math.abs(c - 1) > 1e-9) after = false;
    if (f > 0 && c < pose("embrace", f - 1, fps, CUE).contact) mono = false;
  }
  t("embrace: apart (contact 0) until the approach starts", before);
  t("embrace: contact 1 on and after the cue — kept", after);
  t("embrace: the gap only closes (monotonic)", mono);
  t("embrace: arms wrap after the cue", pose("embrace", CUE + 30, fps, CUE).elbowR > 60 && pose("embrace", CUE - 30, fps, CUE).elbowR < 10);
}
const motifsSrc = fs.readFileSync(path.join(REPO, "src/engines/antidote/characters/Everyman.tsx"), "utf8");
// since `drink` (39b84789) the held arm has two draw places: behind the face, and in front of it while the hand is at
// the mouth (pose.front) — both must exist, and together they cover every frame after the take (pose.take !== 0)
t("wiring: Everyman draws a resting object before the cue and the held one after", /holds && pose\.take === 0 \?/.test(motifsSrc) && /holds && pose\.take !== 0 && !frontHand \?/.test(motifsSrc) && /holds && pose\.take !== 0 && frontHand \?/.test(motifsSrc));
const sceneSrc = fs.readFileSync(path.join(REPO, "src/engines/antidote/components/Scene.tsx"), "utf8");
t("wiring: the embrace step is scaled by the pose's contact", /if \(spec\.action === "embrace"\) approach \*= p\.contact \?\? 1;/.test(sceneSrc));
t("wiring: the pose gets the cue on the pose clock (carried cue first)", /const cue = carry && carry\.cue != null \? carry\.cue : actionCueFrame\(spec, durationFrames\) \+ clockOff;/.test(sceneSrc));

// ── (B) continuity carries the cue of the same action ───────────────────────
const C = require("../src/engines/antidote/continuity.ts");
{
  const mk = (id, chars, cont) => ({ id, shot: "twoShot", durationFrames: 200, characters: chars, props: [], ...(cont ? { continueFromPrev: true, transition: { type: "cut", frames: 0 }, _authorship: { src: "art", lock: { continue: true } } } : {}) });
  const s1 = mk("s1", [{ identity: "a", action: "embrace", actionAt: 80 }, { identity: "b", action: "embrace", actionAt: 80 }]);
  const s2 = mk("s2", [{ identity: "a", action: "embrace" }, { identity: "b", action: "embrace" }], true);
  const s3 = mk("s3", [{ identity: "a", action: "hold" }], true);
  const plans = C.planContinuity([s1, s2], () => true);
  const c2 = plans[1].chars[0];
  t("continuity: a continued embrace carries its passed cue (not replayed)", c2.carried && c2.cue === 80, JSON.stringify(c2));
  t("continuity: on the carried clock the contact is already 1 at frame 0", pose("embrace", 0 + c2.poseClock, fps, c2.cue).contact === 1, JSON.stringify(c2));
  const t1 = mk("t1", [{ identity: "a", action: "take", holds: "phone", actionAt: 70 }]);
  const p3 = C.planContinuity([t1, s3], () => true)[1].chars[0];
  t("continuity: take -> hold continues settled (no cue needed, hold pose from frame 0)", p3.carried && p3.cue === undefined && p3.poseClock >= 60, JSON.stringify(p3));
  t("continuity: actionCueFrame defaults to 40% and never before 24", C.actionCueFrame({}, 200) === 80 && C.actionCueFrame({ actionAt: 5 }, 200) === 24 && C.actionCueFrame({ actionAt: 900 }, 200) === 199);
  t("constants: movements.ACTION_CUE_MIN === continuity.ACTION_CUE_MIN", M.ACTION_CUE_MIN === C.ACTION_CUE_MIN);
}

// ── (C)(D) merge -> planner -> lock -> gate on a word-timed fixture ─────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "authored-actions-"));
const SLUG = `zz-authored-actions-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into burning crowns.",
  "She reaches over and grabs the old phone.",
  "She still holds it and the screen glows.",
  "Then she launches herself into his waiting arms.",
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
const CAST = { diem: { name: "Diem", role: "the queen", look: "young woman" }, luther: { name: "Luther", role: "her mate", look: "tall man" }, narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Fire Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["phone"] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const base = [PLAN, `--slug=${SLUG}`, "--title=Fire Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
try {
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iTake = find(/grabs the old phone/), iHold = find(/still holds it/), iHug = find(/launches herself/);
  t("fixture: case sentences are their own beats", [iTake, iHold, iHug].every((k) => k > 0) && new Set([iTake, iHold, iHug]).size === 3, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const recs = (mut) => beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, set: "forest" };
    if (b.i === iTake) Object.assign(x, { cast: ["diem"], action: "take", holds: "phone", actionCue: "grabs the old phone", expression: "neutral" });
    if (b.i === iHold) Object.assign(x, { cast: ["diem"], action: "hold", holds: "phone", continue: true, expression: "surprised" });
    if (b.i === iHug) Object.assign(x, { cast: ["diem", "luther"], action: "embrace", actionCue: "launches herself", expression: "happy", partnerExpression: "happy" });
    if (mut) mut(x, b.i);
    return x;
  });
  const write = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(recs(mut)));
  write((x, i) => { if (i === iTake) delete x.holds; });
  let r = merge();
  t("merge: take without holds is refused", r.status !== 0 && /action "take" needs "holds"/.test(r.stdout), (r.stdout || "").slice(-400));
  write((x, i) => { if (i === iHug) x.cast = ["diem"]; });
  r = merge();
  t("merge: embrace without exactly two people is refused", r.status !== 0 && /action "embrace" needs exactly two cast members/.test(r.stdout));
  write((x, i) => { if (i === iHug) x.actionCue = "never said"; });
  r = merge();
  t("merge: an actionCue not spoken in the beat is refused", r.status !== 0 && /actionCue "never said" is not spoken/.test(r.stdout));
  write((x, i) => { if (i === iTake) x.partnerExpression = "happy"; });
  r = merge();
  t("merge: partnerExpression without two people is refused", r.status !== 0 && /partnerExpression is the second cast member's face/.test(r.stdout));
  write((x, i) => { if (i === iHold) delete x.holds; });
  r = merge();
  t("merge: a continued beat that drops the taken object is refused", r.status !== 0 && /after taking "phone"/.test(r.stdout));
  t("merge: nothing written on a problem", !fs.existsSync(path.join(BOOK, "art.json")));
  write(null);
  r = merge();
  const art = read(path.join(BOOK, "art.json"));
  t("merge --write writes art.json", !!art, (r.stdout || "").slice(-600));
  const ab = (i) => ((art && art.beats) || []).find((b) => b.i === i) || {};
  t("merge: action, holds, actionCue reach art.json", ab(iTake).action === "take" && ab(iTake).holds === "phone" && ab(iTake).actionCue === "grabs the old phone" && ab(iHug).action === "embrace" && ab(iHug).actionCue === "launches herself");
  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-500));
  if (cfg) {
    const sc = (i) => cfg.scenes[i] || {};
    const take = (sc(iTake).characters || [])[0] || {}, hold = (sc(iHold).characters || [])[0] || {}, hug = sc(iHug).characters || [];
    // "grabs" is word 3 of "She reaches over and grabs ..." (1.2 s); anchorAt leads by 4 frames
    t("plan: take on the lead with the phone, actionAt on the cue word", take.action === "take" && take.holds === "phone" && Math.abs(take.actionAt - (Math.round(4 * 0.3 * 30) - 4)) <= 3, JSON.stringify(take));
    t("plan: the continued beat holds the same phone", hold.action === "hold" && hold.holds === "phone" && sc(iHold).continueFromPrev === true, JSON.stringify(hold));
    t("plan: embrace — two people, the partner embraces back, both on the cue", hug.length === 2 && hug.every((c) => c.action === "embrace") && hug[0].actionAt != null && hug[0].actionAt === hug[1].actionAt && hug.map((c) => c.identity).join(",") === "diem,luther", JSON.stringify(hug.map((c) => [c.identity, c.action, c.actionAt])));
    const Lh = sc(iHug)._authorship && sc(iHug)._authorship.lock;
    t("lock: seals the action moment and the partner's embrace", !!Lh && Lh.actionAt === hug[0].actionAt && Lh.partnerAction === "embrace", JSON.stringify(Lh));
    t("plan + lock: the author's partner face reaches the second figure and is sealed", hug[1].expression === "happy" && Lh && Lh.partnerExpression === "happy", JSON.stringify([hug[1].expression, Lh && Lh.partnerExpression]));
    const { stagingDrift, restoreAuthoredStaging } = require("./lib/authorship");
    t("gate: the planned beats have no drift", [iTake, iHold, iHug].every((i) => stagingDrift(sc(i)).length === 0), JSON.stringify([iTake, iHold, iHug].map((i) => stagingDrift(sc(i)))));
    const later = JSON.parse(JSON.stringify(cfg));
    later.scenes[iHug].characters[1].action = "idle"; later.scenes[iHug].characters[1].expression = "neutral"; delete later.scenes[iHug].characters[0].actionAt;
    const d = stagingDrift(later.scenes[iHug]);
    t("gate: an engine that drops the partner's embrace or the moment is drift", d.some((x) => /^partner embrace/.test(x)) && d.some((x) => /^action moment/.test(x)), JSON.stringify(d));
    restoreAuthoredStaging(later);
    t("restore: the partner embraces again, on the authored moment, with the authored face", later.scenes[iHug].characters[1].action === "embrace" && later.scenes[iHug].characters[1].expression === "happy" && later.scenes[iHug].characters[0].actionAt === hug[0].actionAt);
    const { characterSchema: CS } = require("../src/engines/antidote/schema.ts");
    t("schema: the planned figures validate", [take, hold, ...hug].every((c) => CS.safeParse(c).success));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall authored-action checks passed");
process.exit(failed ? 1 : 0);
