#!/usr/bin/env node
// CHARACTER ACTION 2.0 — leave / flee (src/engines/antidote/leaveLayout.ts, movements.ts, endState.ts), 2026-10-28.
// The rules that matter: nothing moves before the cue word; on it the body turns, walks (leave) or runs (flee) along a
// path to an exit — past the partner (leave) / away from them (flee), to the beat's icon or off the frame — and is
// GONE at the end; a continued beat keeps them gone (no teleport back to the slot); the actionCue is anchored.
// Run: node scripts/test-leave.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const M = require("../src/engines/antidote/movements.ts");
const LL = require("../src/engines/antidote/leaveLayout.ts");
const ES = require("../src/engines/antidote/endState.ts");
const { charAction } = require("../src/engines/antidote/schema.ts");

// ── (A) vocabulary ──────────────────────────────────────────────────────────
t("schema: leave and flee are actions", charAction.safeParse("leave").success && charAction.safeParse("flee").success);

// ── (B) the pose: nothing before the cue; a path, a turn, gone at the end ──
const CUE = 60;
let early = 0;
for (let f = 0; f < CUE; f++) for (const a of ["leave", "flee"]) { const p = M.pose(a, f, 30, CUE); if (p.exit || p.gone || p.turned || p.legL) early++; }
t("pose: before the cue word the body stands still (no step, no turn) — 60 frames × 2 actions", early === 0, String(early));
const lv = (f) => M.pose("leave", f, 30, CUE), fl = (f) => M.pose("flee", f, 30, CUE);
t("pose: on the cue the body turns first (within 6 frames)", lv(CUE + M.TURN_LEN).turned === 1 && lv(CUE).turned === 0);
t("pose: the path progresses monotonically to the exit", Array.from({ length: 100 }, (_, k) => lv(CUE + k).exit).every((x, k, a) => k === 0 || x >= a[k - 1]) && lv(CUE + M.LEAVE_LEN).exit === 1);
t("pose: gone at the end of the path, visible before it", lv(CUE + M.LEAVE_LEN).gone === 1 && lv(CUE + M.LEAVE_LEN * 0.7).gone === 0);
t("pose: flee is a RUN — reaches the exit in about half the time, leans forward, motion streaks, wider stride", M.FLEE_LEN < M.LEAVE_LEN * 0.6 && fl(CUE + 10).lean > lv(CUE + 10).lean + 5 && fl(CUE + 10).streaks > 0 && !lv(CUE + 10).streaks && Math.max(...Array.from({ length: 30 }, (_, k) => Math.abs(fl(CUE + k).legL))) > Math.max(...Array.from({ length: 30 }, (_, k) => Math.abs(lv(CUE + k).legL))));
t("pose: the legs actually stride while going (not a slide)", new Set(Array.from({ length: 20 }, (_, k) => Math.round(lv(CUE + k).legL))).size > 5);

// ── (C) the path: past the partner (leave), away from them (flee), to the icon or off the frame ──
const lead = { x: 700, y: 560, scale: 1 }, partner = { x: 1150, y: 560, scale: 1 };
let L = LL.leaveLayout(lead, partner, "leave", true);
t("leave + icon: the exit is on the partner's FAR side (walks past him), inside the frame", L.dir === 1 && L.dest.x > partner.x + 200 && L.dest.x <= 1920 - 200, JSON.stringify(L));
L = LL.leaveLayout(lead, partner, "flee", true);
t("flee + icon: the exit is AWAY from the partner", L.dir === -1 && L.dest.x < lead.x - 200, JSON.stringify(L));
L = LL.leaveLayout(lead, partner, "flee", false);
t("flee, no icon: off the frame (fully out)", L.dest.x < -100 && L.exitDx < 0);
L = LL.leaveLayout({ x: 700, y: 560, scale: 1 }, null, "flee", true, 1300);
t("flee alone from an icon: the icon is the THREAT - runs away from it, off the frame (never toward it)", L.dir === -1 && L.dest.x < 0, JSON.stringify(L));
L = LL.leaveLayout({ x: 1300, y: 560, scale: 1 }, null, "flee", true, 600);
t("flee alone from an icon on the left: runs off the right edge", L.dir === 1 && L.dest.x > 1920, JSON.stringify(L));
t("renderer: a lone flee keeps the icon where it is (the threat), a leave draws it at the exit", /fleeFromIcon/.test(require("fs").readFileSync(require("path").join(REPO, "src/engines/antidote/components/Scene.tsx"), "utf8")));
L = LL.leaveLayout({ x: 1600, y: 560, scale: 1 }, null, "leave", false);
t("alone: towards the farther edge, off the frame", L.dir === -1 && L.dest.x < 0);
L = LL.leaveLayout({ x: 1500, y: 560, scale: 1 }, { x: 1700, y: 560, scale: 1 }, "leave", true);
t("partner near the edge: the exit stays inside the frame on the far side", L.dest.x > 1500 && L.dest.x <= 1720, JSON.stringify(L.dest));
t("path ease: starts with a step (slow), ends at 1", LL.pathOf(0) === 0 && Math.abs(LL.pathOf(1) - 1) < 1e-9 && LL.pathOf(0.05) < 0.05);

// ── (D) the result persists: gone stays gone on a continued beat ────────────
t("end state: leave / flee leave the person GONE", ES.endStateOf("leave", false).posture === "gone" && ES.endStateOf("flee", false).posture === "gone");
t("a continued beat that still lists them idle keeps them gone (no teleport back)", ES.keepsRest("gone", "idle") && ES.keepsRest("gone", undefined));
t("an authored new action means they came back (the author decides)", !ES.keepsRest("gone", "talk") && !ES.keepsRest("gone", "sit"));
const SC = fs.readFileSync(path.join(REPO, "src/engines/antidote/components/Scene.tsx"), "utf8");
t("renderer: a carried 'gone' body is not drawn", /rest && rest\.posture === "gone"\) return null/.test(SC));
t("renderer: the body moves by the path and faces its exit; the icon is drawn where the path ends", /exitShift/.test(SC) && /faceFlip/.test(SC) && /leave0 && props\.length && !fleeFromIcon \? leave0\.dest/.test(SC));
const RC = fs.readFileSync(path.join(__dirname, "readcheck.js"), "utf8");
t("readcheck: the blind text reader is told the person goes away and is gone", /walks out/.test(RC) && /runs away/.test(RC) && /gone — left the scene/.test(RC));

// ── (E) merge + planner: the cue is spoken and anchored; closeUp / diagram refused ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leave-"));
const SLUG = `zz-leave-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = ["Welcome to this deep dive into pride.", "The president sits in the parlor and waits for an hour.", "The general finally arrives and walks right past him and goes upstairs.", "Lincoln is left waiting alone."];
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
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
const CAST = { lincoln: { name: "Lincoln", role: "president", look: "tall man" }, general: { name: "General", role: "general", look: "officer" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Leave Test", author: "A. Writer", genre: "history", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: [] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const baseArgs = [PLAN, `--slug=${SLUG}`, "--title=Leave Test", "--author=A. Writer", "--genre=history", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
try {
  run([...baseArgs, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iA = find(/sits in the parlor/), iB = find(/walks right past/), iC = find(/left waiting/);
  t("fixture: three consecutive beats", iA > 0 && iB === iA + 1 && iC === iB + 1, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const AUTH = {
    [iA]: { cast: ["lincoln"], action: "sit", set: "room" },
    [iB]: { cast: ["general", "lincoln"], action: "leave", actionCue: "walks right past", partnerAction: "sit", concept: "door", set: "room", continue: true },
    [iC]: { cast: ["lincoln"], action: "sit", set: "room", continue: true },
  };
  const write = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, cast: [], ...(AUTH[b.i] ? JSON.parse(JSON.stringify(AUTH[b.i])) : {}) };
    if (mut) mut(x, b.i);
    return x;
  })));
  write((x, i) => { if (i === iB) x.actionCue = "storms out"; });
  let r = merge();
  t("merge: a leave cue that is not spoken is refused", r.status !== 0 && /actionCue "storms out" is not spoken/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iB) x.shotOverride = "closeUp"; });
  r = merge();
  t("merge: a leave in a closeUp is refused (no legs, no exit)", r.status !== 0 && /closeUp shows no legs/.test(r.stdout), (r.stdout || "").slice(-300));
  write(null);
  r = merge();
  t("merge: the authored leave is accepted", r.status === 0, (r.stdout || "").slice(-600));
  r = run([...baseArgs, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-400));
  if (cfg) {
    const sc = cfg.scenes[iB], lead = (sc.characters || [])[0] || {};
    const { anchorOnWord } = require("./lib/word-anchor");
    const want = anchorOnWord({ from: sc.fromFrame, words: (cfg.captions || []).flatMap((x) => x.words || []).map((w) => ({ w: w.w, s: w.s })) }, "walks right past", {});
    t("plan: the leaver keeps the authored action and its moment sits on the spoken word", lead.action === "leave" && lead.actionAt != null && (want == null || lead.actionAt >= want - 1), JSON.stringify({ action: lead.action, actionAt: lead.actionAt, want }));
    t("plan: the door icon is on stage (the exit)", (sc.props || []).some((p) => p.type === "door"), JSON.stringify(sc.props));
    t("plan: the shot shows legs (not a closeUp)", sc.shot !== "closeUp", sc.shot);
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall leave checks passed");
process.exit(failed ? 1 : 0);
