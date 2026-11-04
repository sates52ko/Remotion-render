#!/usr/bin/env node
// CARRIED BODY STATE at merge (P3, 2026-10-29). Real case: the fahrenheit-451 sandbox continued a collapsed Montag with
// "slump" while the narration kept him "pressed into the dirt" — he stood up again in the next shot (blind readers:
// kept N N P). A continued beat starts where each person's last deed left them: DOWN after collapsed / falling (only a
// face action keeps it), SEATED after sit, GONE after leave / flee, an object SET DOWN by place stays down; drinking
// keeps the cup in hand. Getting up / coming back needs the narration to say so. Merge refuses (or flags REVIEW_REQUIRED)
// instead of letting the renderer draw the contradiction.
// Run: node scripts/test-body-state.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "body-state-"));
const SLUG = `zz-body-state-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into a quiet story.",
  "The blast throws him hard to the earth.",
  "Pressed into the dirt, he finally remembers her.",
  "At last he gets up and looks around.",
  "She sits down at the old kitchen table.",
  "She waits there for a very long time.",
  "He walks out of the house in silence.",
  "The room feels empty without him now.",
  "She sets the cup down on the shelf.",
  "Later she thinks about the long winter.",
  "She drinks slowly from the warm mug.",
  "The tea tastes of smoke and honey.",
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
const CAST = { man: { name: "Guy", role: "the man", look: "man, dark suit, glasses" }, wife: { name: "Mila", role: "his wife", look: "woman, short blond hair" }, narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Body Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: [] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => { const r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]); r.out = (r.stdout || "") + (r.stderr || ""); return r; };
try {
  run([PLAN, `--slug=${SLUG}`, "--title=Body Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2", `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const at = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const I = { fall: at(/throws him/), dirt: at(/Pressed into/), up: at(/gets up/), sit: at(/sits down/), wait: at(/waits there/), out: at(/walks out/), empty: at(/feels empty/), place: at(/sets the cup/), later: at(/long winter/), drink: at(/drinks slowly/), tea: at(/tastes of smoke/) };
  const order = [["fall", "dirt"], ["dirt", "up"], ["sit", "wait"], ["out", "empty"], ["place", "later"], ["drink", "tea"]];
  t("fixture: every chain is two consecutive beats", Object.values(I).every((v) => Number.isInteger(v)) && order.every(([a, b]) => I[b] === I[a] + 1), JSON.stringify(beats.map((b) => [b.i, b.narration])));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  // a sound baseline: every chain authored correctly; each case below changes ONE beat
  const BASE = {
    [I.fall]: { cast: ["man"], action: "collapsed", expression: "afraid", set: "forest" },
    [I.dirt]: { cast: ["man"], action: "think", expression: "sad", continue: true, set: "forest" },
    [I.up]: { cast: ["man"], action: "walk", expression: "neutral", continue: true, set: "forest" },
    [I.sit]: { cast: ["wife"], action: "sit", expression: "sad", set: "kitchen" },
    [I.wait]: { cast: ["wife"], action: "think", expression: "sad", continue: true, set: "kitchen" },
    [I.out]: { cast: ["man", "wife"], action: "leave", expression: "blank", partnerExpression: "sad", set: "kitchen" },
    [I.empty]: { cast: ["wife"], action: "idle", expression: "sad", continue: true, set: "kitchen" },
    [I.place]: { cast: ["wife"], action: "place", holds: "cup", expression: "neutral", set: "kitchen" },
    [I.later]: { cast: ["wife"], action: "think", expression: "neutral", continue: true, set: "kitchen" },
    [I.drink]: { cast: ["wife"], action: "drink", holds: "cup", expression: "neutral", set: "kitchen" },
    [I.tea]: { cast: ["wife"], action: "hold", holds: "cup", expression: "happy", continue: true, set: "kitchen" },
  };
  const write = (patch = {}) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, set: "kitchen", ...(BASE[b.i] || {}) };
    if (patch[b.i]) { Object.assign(x, patch[b.i]); for (const [k, v] of Object.entries(patch[b.i])) if (v === undefined) delete x[k]; }
    return x;
  })));
  write();
  let r = merge();
  t("baseline: collapsed -> think (continue), 'gets up' -> walk, sit -> think, leave -> idle, place -> think, drink -> hold the cup: accepted", r.status === 0 && !/DOWN|SEATED|GONE|set the cup down|without a take/.test(r.out), r.out.slice(-600));

  write({ [I.dirt]: { action: "slump" } });
  r = merge();
  t("collapsed -> continue with a standing action (the f451 case) is refused", r.status !== 0 && /continues man DOWN \(beat \d+\) with "slump" — that stands them up again/.test(r.out), r.out.slice(-400));
  write({ [I.dirt]: { action: "walk" } });
  r = merge();
  { const MR = require("./lib/merge-recovery"); const line = (r.out.match(/\d+: continues man DOWN[^\n]*/) || [""])[0];
    t("the refusal is classified BODY_STATE (re-author from the narration), not OTHER", MR.classify(line).code === "BODY_STATE", line); }
  t("collapsed -> continue with walk is refused (no narrated rise)", r.status !== 0 && /continues man DOWN/.test(r.out), r.out.slice(-300));
  write({ [I.dirt]: { action: "talk" } });
  t("collapsed -> continue with talk (a face action) keeps him down: accepted", merge().status === 0);
  write({ [I.dirt]: { action: "think", continue: undefined } });
  t("collapsed -> a NEW stage (no continue: time has passed) is not held to the state", merge().status === 0);
  write({ [I.dirt]: { action: "talk" }, [I.up]: { action: "walk" } });
  r = merge();
  t("collapsed -> talk -> the narration says he GETS UP: walk is allowed", r.status === 0 && !/DOWN/.test(r.out), r.out.slice(-300));
  write({ [I.dirt]: { action: "talk", shotOverride: "closeUp" } });
  r = merge();
  t("a camera change does not reset the state: a closer shot with a face action is fine…", r.status === 0, r.out.slice(-300));
  write({ [I.dirt]: { action: "reach", shotOverride: "medium" } });
  r = merge();
  t("…and a new shot does not excuse a standing action", r.status !== 0 && /continues man DOWN/.test(r.out), r.out.slice(-300));

  write({ [I.wait]: { action: "walk" } });
  r = merge();
  t("sit -> continue with walk is flagged REVIEW_REQUIRED (the legs; nothing says she stands)", /REVIEW_REQUIRED continues wife SEATED/.test(r.out), r.out.slice(-300));
  write({ [I.wait]: { action: "talk" } });
  t("sit -> continue with talk: kept seated, no flag", !/SEATED/.test(merge().out));

  write({ [I.empty]: { cast: ["wife", "man"], action: "idle", partnerAction: "talk" } });
  r = merge();
  t("leave -> continue that brings him back without a return is flagged REVIEW_REQUIRED", /REVIEW_REQUIRED man left in beat \d+ and is GONE/.test(r.out), r.out.slice(-300));

  write({ [I.later]: { holds: "cup" } });
  r = merge();
  t("place -> continue holding the same cup without a take is refused (released stays released)", r.status !== 0 && /set the cup down in beat \d+; "holds": "cup" puts it back in hand without a take/.test(r.out), r.out.slice(-300));
  t("…classified PLACE_RELEASED (routine)", require("./lib/merge-recovery").classify((r.out.match(/\d+: wife set the cup down[^\n]*/) || [""])[0]).code === "PLACE_RELEASED");
  write({ [I.later]: { holds: "cup", action: "take" } });
  t("place -> take the cup again: accepted", !/set the cup down/.test(merge().out));

  write({ [I.tea]: { holds: undefined } });
  r = merge();
  t("drink -> continue drops the cup: the hold is carried (merge flags the dropped object)", /drinking from/.test(r.out), r.out.slice(-300));
  // 2026-10-30 chains the operator listed: take -> place (the object taken is the one set down), drink -> leave
  write({ [I.drink]: { action: "take", holds: "cup", actionCue: undefined }, [I.tea]: { action: "place", holds: "cup" } });
  r = merge();
  t("take -> continue place of the same cup: accepted (the hand that took it sets it down)", r.status === 0 && !/set the cup down in beat/.test(r.out), r.out.slice(-300));
  write({ [I.drink]: { action: "drink", holds: "cup" }, [I.tea]: { action: "leave", holds: undefined } });
  r = merge();
  t("drink -> continue leave WITHOUT the cup: flagged (the cup would vanish at the cut)", /drinking from "cup"/.test(r.out), r.out.slice(-300));
  write({ [I.drink]: { action: "drink", holds: "cup" }, [I.tea]: { action: "leave", holds: "cup" } });
  r = merge();
  t("drink -> continue leave carrying the cup: accepted (she walks out with it)", r.status === 0 && !/GONE|DOWN|SEATED|drinking from/.test(r.out), r.out.slice(-300));
  // The Art of Strategy 293: an action with nobody to do it was merged, then dropped by the planner
  write({ [I.empty]: { cast: [], action: "place", holds: "cup", continue: undefined } });
  r = merge();
  t("cast [] + action place: refused (nobody does it — it was silently dropped at planning), classified ACTION_NO_PERSON", r.status !== 0 && /action "place" with cast \[\] — nobody on screen does it/.test(r.out) && require("./lib/merge-recovery").classify((r.out.match(/\d+: action "place" with cast[^\n]*/) || [""])[0]).code === "ACTION_NO_PERSON", r.out.slice(-400));
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall body-state checks passed");
process.exit(failed ? 1 : 0);
