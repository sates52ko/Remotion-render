#!/usr/bin/env node
// CARRIED STATE across beats (10x P1, 2026-10-27): a deed leaves an END STATE (endState.ts) that the next authored
// `continue` beat starts from — after a lift she is still IN the destination and the lifter beside it (also on a
// closer shot: a uniform reframe, liftLayout.reframeGroup), a person who sat down stays seated, one who fell stays
// down; a new action composes on top (upper body / face). Pure plan (continuity.ts) + render wiring + merge + planner
// stamp `carryState` + lock / gate / restore. Configs without the stamp plan exactly as before.
// Run: node scripts/test-authored-carry-state.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const E = require("../src/engines/antidote/endState.ts");
const L = require("../src/engines/antidote/liftLayout.ts");
const C = require("../src/engines/antidote/continuity.ts");
const M = require("../src/engines/antidote/movements.ts");

// ── (T) the state rules ─────────────────────────────────────────────────────
t("rules: a lift leaves her seated IN the place and the lifter standing beside it", E.endStateOf("lifted", true).anchor === "inPlace" && E.endStateOf("lift", true).anchor === "besidePlace");
t("rules: lift / lifted leave nothing outside a lift pair", E.endStateOf("lift", false) === null && E.endStateOf("lifted", false) === null);
t("rules: sit -> seated, a fall -> down, talk -> nothing", E.endStateOf("sit", false).posture === "seated" && E.endStateOf("falling", false).posture === "down" && E.endStateOf("talk", false) === null);
t("rules: seated keeps upper-body actions, ends on legs", E.keepsRest("seatedIn", "hold") && E.keepsRest("seated", "talk") && !E.keepsRest("seatedIn", "walk") && !E.keepsRest("seated", "fighting"));
t("rules: down keeps only face actions", E.keepsRest("down", "talk") && !E.keepsRest("down", "reach") && !E.keepsRest("lying", "walk"));

// ── (G) geometry: the end of the deed and the camera-like reframe ───────────
const lead = { x: 700, y: 644, scale: 0.66 }, occ = { x: 1268, y: 644, scale: 0.66, flip: true };
{
  const lay = L.liftLayout(lead, occ), end = L.liftEnd(lead, occ);
  // Scene moves the lifter by approach·contact + carry·carry + stepBack·back; on the last frame of the deed all are 1
  const last = M.pose("lift", 60 + M.LIFT_DONE + M.LIFT_RELEASE + 20, 30, 60);
  t("geometry: the lift's last frame is all done (contact, carry, back = 1)", last.contact === 1 && last.carry === 1 && last.back === 1, JSON.stringify([last.contact, last.carry, last.back]));
  t("geometry: liftEnd = where Scene leaves them (approach + carry + step back; she at the destination)", Math.abs(end.lead.x - (lead.x + lay.approach * last.contact + lay.carry * last.carry + lay.stepBack * last.back)) < 0.5 && Math.abs(end.occ.x - lay.dest.x) < 0.5);
  t("geometry: released, the lifter stands BESIDE her (LIFT_BESIDE), not overlapping her", Math.abs((end.occ.x - end.lead.x) / occ.scale - L.LIFT_BESIDE) < 1e-6 && L.LIFT_BESIDE * occ.scale > 2 * 150 * occ.scale);
  const g = { lead: end.lead, occ: end.occ, dest: end.dest };
  t("reframe: the same shot is the identity", L.reframeGroup(g, "wide", "wide") === g);
  for (const shot of ["twoShot", "medium", "lowAngle"]) {
    const r = L.reframeGroup(g, "wide", shot), k = r.occ.scale / g.occ.scale;
    const box = L.groupBox(r);
    t(`reframe wide->${shot}: closer (k ${k.toFixed(2)} > 1), order, flips, gap and destination size kept, inside the safe frame`,
      k > 1 && Math.sign(r.occ.x - r.lead.x) === Math.sign(g.occ.x - g.lead.x) && r.occ.flip === g.occ.flip &&
      Math.abs((r.occ.x - r.lead.x) / r.occ.scale - (g.occ.x - g.lead.x) / g.occ.scale) < 1e-6 && Math.abs(r.dest.scale / r.occ.scale - g.dest.scale / g.occ.scale) < 1e-9 &&
      box.l >= L.SIDE_SAFE - 1e-6 && box.r <= 1920 - L.SIDE_SAFE + 1e-6 && box.t >= L.TOP_SAFE - 1e-6, JSON.stringify(box));
  }
  const mirrored = L.reframeGroup({ lead: { ...end.lead, x: 1920 - end.lead.x }, occ: { ...end.occ, x: 1920 - end.occ.x }, dest: { ...end.dest, x: 1920 - end.dest.x } }, "wide", "twoShot");
  const plain = L.reframeGroup(g, "wide", "twoShot");
  t("reframe: a mirrored group reframes mirrored", Math.abs(mirrored.occ.x - (1920 - plain.occ.x)) < 1e-6);
}

// ── (C) a new action on top of a kept state ─────────────────────────────────
{
  const rest = M.pose("lifted", 100000, 30), reach = M.pose("reach", 50, 30), hold = M.pose("hold", 50, 30);
  const c = E.composeRest(rest, hold, "seatedIn", "hold");
  t("compose: seated in the tub + hold = her seat and legs, the hold's arms", c.sit === rest.sit && c.hipY === rest.hipY && c.noStool === true && c.armR === hold.armR && c.elbowR === hold.elbowR);
  t("compose: idle in the tub = the rest pose itself", E.composeRest(rest, reach, "seatedIn", "idle") === rest);
  const down = M.pose("collapsed", 100000, 30), talk = M.pose("talk", 7, 30);
  const d = E.composeRest(down, talk, "down", "talk");
  t("compose: down + talk = the body stays down, only the face talks", d.tip === down.tip && d.armR === down.armR && d.mouth === talk.mouth);
  t("compose: standing = the action as is", E.composeRest(rest, reach, "standing", "reach") === reach);
}

// ── (A) the plan: carried only on stamped continuations ─────────────────────
const deps = { slotOf: (shot, c, k) => [lead, occ][Math.min(k, 1)], endStateOf: E.endStateOf, keepsRest: E.keepsRest, liftEnd: L.liftEnd, reframeGroup: L.reframeGroup };
const tub = { type: "customSvg", customSvg: { title: "Bathtub", viewBox: "0 0 520 520", paths: [] } };
const S = (id, shot, chars, extra = {}) => ({ id, shot, durationFrames: 300, characters: chars, props: [], ...extra });
{
  const scenes = [
    S("a", "wide", [{ identity: "demi", action: "lift" }, { identity: "mother", action: "lifted" }], { props: [tub] }),
    S("b", "twoShot", [{ identity: "demi", action: "hold" }, { identity: "mother", action: "idle" }], { continueFromPrev: true, carryState: true }),
    S("i", "insert", [], { continueFromPrev: true, carryState: true }),
    S("c", "twoShot", [{ identity: "demi", action: "talk" }, { identity: "mother", action: "talk" }], { continueFromPrev: true, carryState: true }),
    S("d", "twoShot", [{ identity: "demi", action: "talk" }, { identity: "mother", action: "walk" }], { continueFromPrev: true, carryState: true }),
  ];
  const drawsCast = (shot) => shot !== "insert";
  const p = C.planContinuity(scenes, drawsCast, deps);
  const mb = p[1].chars[1].rest, db = p[1].chars[0].rest;
  t("plan: after the lift she is seated IN the place, the lifter beside it", mb && mb.anchor === "inPlace" && mb.posture === "seatedIn" && mb.since === 0 && db && db.anchor === "besidePlace", JSON.stringify([mb, db]));
  t("plan: the place is the lift's own destination, kept", p[1].place && p[1].place.prop.customSvg.title === "Bathtub" && p[1].place.occupant === "mother");
  t("plan: on the closer shot she sits at the destination's centre", mb && Math.abs(mb.stage.x - p[1].place.dest.x) < 1e-6);
  t("plan: an insert passes the state on (chain through a cast-dropping shot)", p[3].chars[1].rest && p[3].chars[1].rest.since === 0 && p[3].place);
  t("plan: walking ends her rest and the place goes with it", !p[4].chars[1].rest && !p[4].place);
  // without the stamp, or without the rules, nothing is carried — and the rest of the plan is untouched
  const unstamped = scenes.map((s) => ({ ...s, carryState: undefined }));
  const a1 = JSON.stringify(C.planContinuity(unstamped, drawsCast, deps)), a0 = JSON.stringify(C.planContinuity(unstamped, drawsCast));
  t("plan: without carryState the plan is byte-for-byte the pre-P1 plan", a1 === a0);
  t("plan: without the rules (old callers) nothing is carried", JSON.stringify(C.planContinuity(scenes, drawsCast)) === JSON.stringify(C.planContinuity(scenes, drawsCast).map((x) => { const y = { ...x }; delete y.place; return y; })) && !C.planContinuity(scenes, drawsCast)[1].chars[1].rest);
  const sit = C.planContinuity([S("s", "medium", [{ identity: "barbie", action: "sit" }]), S("t", "medium", [{ identity: "barbie", action: "hold" }], { continueFromPrev: true, carryState: true })], () => true, deps);
  t("plan: sit -> continue hold keeps him seated (no anchor)", sit[1].chars[0].rest && sit[1].chars[0].rest.posture === "seated" && !sit[1].chars[0].rest.stage);
  // a WAIST-UP shot cannot show a seat: the full figure is reframed from where he sat (under-the-dome 53)
  const fdeps = { ...deps, reframeOne: L.reframeOne, fullBody: (shot) => shot !== "medium" };
  const bust = C.planContinuity([S("s", "wide", [{ identity: "barbie", action: "sit" }]), S("t", "wide", [{ identity: "barbie", action: "take" }], { continueFromPrev: true, carryState: true }), S("u", "medium", [{ identity: "barbie", action: "hold" }], { continueFromPrev: true, carryState: true })], () => true, fdeps);
  const r2 = bust[2].chars[0].rest;
  t("plan: seated on a waist-up shot = the full figure, reframed closer (the seat stays in frame)", r2 && r2.body === "full" && r2.stage && r2.stage.scale > lead.scale && r2.stage.y + (L.RIG_FLOOR - L.RIG_MID) * r2.stage.scale <= L.FLOOR_Y + 1e-6, JSON.stringify(r2));
  t("plan: on a full-body shot a seated rest keeps its slot (no stage)", !bust[1].chars[0].rest.stage);
  const fall = C.planContinuity([S("f", "wide", [{ identity: "x", action: "falling" }]), S("g", "wide", [{ identity: "x", action: "reach" }], { continueFromPrev: true, carryState: true })], () => true, deps);
  t("plan: down -> continue reach ends the rest (the authored action wins)", !fall[1].chars[0].rest);
}

// ── (W) wiring ──────────────────────────────────────────────────────────────
const idx = fs.readFileSync(path.join(REPO, "src/engines/antidote/index.tsx"), "utf8");
const scn = fs.readFileSync(path.join(REPO, "src/engines/antidote/components/Scene.tsx"), "utf8");
t("wiring: index.tsx hands the state rules to planContinuity", /\.dropsCast, CARRY\), \[config\.scenes\]\)/.test(idx) && /endStateOf, keepsRest, liftEnd, reframeGroup/.test(idx));
t("wiring: CharacterLayer stands a kept body where the deed left it and composes its rest", /rest && rest\.stage\s*\n?\s*\? \{ x: rest\.stage\.x/.test(scn) && /composeRest\(pose\(rest\.restAction/.test(scn));
t("wiring: the kept place is drawn after the cast, once", /i === liftDest \|\| i === placeIdx \? null/.test(scn) && scn.indexOf("{place ? (") > scn.indexOf("rest={cc && cc.rest"));

// ── (P/E/F) merge -> planner stamp -> lock -> gate on a word-timed fixture ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "carry-state-"));
const SLUG = `zz-carry-state-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into a family story.",
  "She sits by her mother in the quiet ward.",
  "Then she gently lifts her frail mother into the bathtub.",
  "The water is warm and her mother smiles.",
];
const tsf = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of SENTENCES) {
  const words = sent.split(" "); const start = clock; let line = words[0];
  for (let k = 1; k < words.length; k++) line += `<${tsf(start + k * 0.3)}><c> ${words[k]}</c>`;
  const end = start + words.length * 0.3;
  vtt += `${tsf(start)} --> ${tsf(end)} align:start position:0%\n \n${line}\n\n${tsf(end)} --> ${tsf(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 1.0;
}
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
const CAST = { demi: { name: "Demi", role: "the daughter", look: "woman, long dark hair" }, mother: { name: "Mother", role: "her frail mother", look: "older woman, short red hair" }, narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Carry Test", author: "A. Writer", genre: "memoir", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["water"] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const base = [PLAN, `--slug=${SLUG}`, "--title=Carry Test", "--author=A. Writer", "--genre=memoir", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
try {
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const iLift = (beats.find((b) => /gently lifts/.test(b.narration || "")) || {}).i;
  // the beat right after the lift (the splitter cuts by duration; what matters is that it FOLLOWS the lift)
  const iCup = beats.some((b) => b.i === iLift + 1) ? iLift + 1 : undefined;
  t("fixture: a lift beat and the beat after it", iLift > 0 && iCup === iLift + 1, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const write = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, set: "hospital" };
    if (b.i === iLift) Object.assign(x, { cast: ["demi", "mother"], action: "lift", concept: "water", actionCue: "gently lifts", expression: "neutral", partnerExpression: "sad" });
    if (b.i === iCup) Object.assign(x, { cast: ["demi", "mother"], action: "hold", holds: "cup", expression: "sad", partnerExpression: "blank", continue: true });
    if (mut) mut(x, b.i);
    return x;
  })));
  write((x, i) => { if (i === iCup) x.shotOverride = "closeUp"; });
  let r = merge();
  t("merge: a shot that cannot show her IN the place is refused", r.status !== 0 && /cannot show mother IN the water/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iCup) delete x.continue; });
  r = merge();
  t("merge: a NEW stage right after the lift warns that she pops out of the place", r.status === 0 && /pops out of the water/.test(r.stdout + r.stderr), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iCup) x.shotOverride = "twoShot"; });
  r = merge();
  t("merge: continue after the lift on a closer STATE shot is accepted", r.status === 0, (r.stdout || "").slice(-400));
  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-400));
  if (cfg) {
    const sc = cfg.scenes[iCup] || {};
    t("plan: the continued beat is stamped carryState, kept on the author's closer shot", sc.continueFromPrev === true && sc.carryState === true && sc.shot === "twoShot", JSON.stringify([sc.continueFromPrev, sc.carryState, sc.shot]));
    t("plan: the planner adds no cast, props or coordinates", (sc.characters || []).every((c) => c.x === undefined && c.y === undefined) && (sc.props || []).length === 0, JSON.stringify(sc.props));
    const Lk = sc._authorship && sc._authorship.lock;
    t("lock: seals carryState with the continuation", !!Lk && Lk.carryState === true && Lk.continue === true, JSON.stringify(Lk));
    const { stagingDrift, restoreAuthoredStaging } = require("./lib/authorship");
    t("gate: the planned beat has no drift", stagingDrift(sc).length === 0, JSON.stringify(stagingDrift(sc)));
    const later = JSON.parse(JSON.stringify(cfg));
    delete later.scenes[iCup].carryState;
    t("gate: an engine that drops the carried state is drift", stagingDrift(later.scenes[iCup]).includes("carryState→none"));
    restoreAuthoredStaging(later);
    t("restore: the carried state is put back", later.scenes[iCup].carryState === true);
    const plans = C.planContinuity(cfg.scenes, () => true, deps);
    const rest = plans[iCup].chars[1] && plans[iCup].chars[1].rest;
    t("plan -> render: she is IN the water in the cup beat, the lifter beside her", rest && rest.anchor === "inPlace" && plans[iCup].place && plans[iCup].chars[0].rest.anchor === "besidePlace", JSON.stringify(rest));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall carry-state checks passed");
process.exit(failed ? 1 : 0);
