#!/usr/bin/env node
// SPEECH TIED TO A SPEAKER (CSD 1.1, cycle 8, 2026-11-02). Real case: cycle-7 holdouts — a reported line ("I have a
// problem" / "right for you", a phone call) staged as a free callout read as "a man holds a phone, no exchange" or as
// an accusation. `says` / `partnerSays` put the narration's OWN words in a balloon above the speaker's head.
// Checks: schema, merge (verbatim only, word cap, cast), planner (anchored on the words, the second person's line),
// renderer wiring, readcheck, and that the rules text is an experiment (off unless STORYBOARD_SPEECH=1).
// Run: node scripts/test-says.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");

// (A) schema
const { characterSchema } = require("../src/engines/antidote/schema.ts");
t("schema: says {text, at} is a character field", characterSchema.safeParse({ id: "c1", says: { text: "I have a problem", at: 12 } }).success);
t("schema: an empty balloon is refused", !characterSchema.safeParse({ id: "c1", says: { text: "" } }).success);

// (B) renderer wiring (static: the balloon is drawn inside the character layer and counter-mirrored)
const scene = fs.readFileSync(path.join(REPO, "src/engines/antidote/components/Scene.tsx"), "utf8");
const balloon = fs.readFileSync(path.join(REPO, "src/engines/antidote/components/SpeechBalloon.tsx"), "utf8");
t("Scene draws a SpeechBalloon for spec.says inside the character layer", /spec\.says && spec\.says\.text[\s\S]{0,600}<SpeechBalloon/.test(scene));
t("the balloon mirrors back on a flipped figure (text reads left to right)", /flip \? "scaleX\(-1\)"/.test(balloon));
t("the balloon keeps a screen-constant font (divided by the layer scale)", /const font = 40 \/ s/.test(balloon));

// (C) merge + planner on a fixture book
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "says-"));
const SLUG = `zz-says-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = ["Welcome to this deep dive into rapport.", "She tells him I have a problem with my landlord.", "He answers right for you that sounds hard.", "That is the whole trick."];
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of SENTENCES) {
  const words = sent.split(" "); const start = clock; let line = words[0];
  for (let k = 1; k < words.length; k++) line += `<${ts(start + k * 0.3)}><c> ${words[k]}</c>`;
  const end = start + words.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 2.5;
}
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
fs.mkdirSync(path.join(tmp, "public", "captions"), { recursive: true });
fs.writeFileSync(path.join(tmp, "public", "captions", `${SLUG}.vtt`), vtt);
const CAST = { ana: { name: "Ana", role: "tenant", look: "young woman", variant: { gender: "female", age: "young", hairStyle: "long" } }, ben: { name: "Ben", role: "friend", look: "young man", variant: { gender: "male", age: "young", hairStyle: "short" } } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Says Test", author: "A. Writer", genre: "self-help", engine: "antidote", engineProfile: { kind: "nonfiction", world: "ideas", era: 2020, realPeople: false, format: "argument", violence: "none", minorHarm: false, mustSee: ["a landlord", "a phone call"] } }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: [] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const baseArgs = [PLAN, `--slug=${SLUG}`, "--title=Says Test", "--author=A. Writer", "--genre=self-help", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv, e = env) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env: e });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
try {
  run([...baseArgs, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iA = find(/I have a problem/), iB = find(/right for you/);
  t("fixture: the two speech beats exist (two different beats)", iA != null && iB != null && iA !== iB, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const AUTH = {
    [iA]: { cast: ["ana", "ben"], action: "talk", says: "I have a problem with my landlord", set: "room" },
    [iB]: { cast: ["ben", "ana"], action: "talk", says: "right for you", partnerExpression: "happy", set: "room", continue: true },
  };
  const write = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, cast: [], ...(AUTH[b.i] ? JSON.parse(JSON.stringify(AUTH[b.i])) : {}) };
    if (mut) mut(x, b.i);
    return x;
  })));
  write((x, i) => { if (i === iA) x.says = "I really hate my landlord"; });
  let r = merge();
  t("merge: invented words in a balloon are refused (not said in this beat)", r.status !== 0 && /is not said in this beat/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iA) x.says = "She tells him I have a problem with my landlord and more words here now"; });
  r = merge();
  t("merge: a balloon of more than 12 words is refused", r.status !== 0 && /at most 12/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iA) { x.cast = ["ana"]; x.partnerSays = "right for you"; } });
  r = merge();
  t("merge: partnerSays needs two cast members", r.status !== 0 && /partnerSays is the second person's line/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iA) x.cast = []; });
  r = merge();
  t("merge: says needs the speaker on screen", r.status !== 0 && /says needs the speaker on screen/.test(r.stdout), (r.stdout || "").slice(-300));
  write(null);
  r = merge();
  t("merge: verbatim balloons are accepted", r.status === 0, (r.stdout || "").slice(-600));
  r = run([...baseArgs, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-400));
  if (cfg) {
    const a = cfg.scenes.find((x) => /I have a problem/.test(x._narration || x.narration || "")) || {}, lead = (a.characters || [])[0] || {};
    t("plan: the speaker carries the balloon text", lead.says && lead.says.text === "I have a problem with my landlord", JSON.stringify(lead.says));
    t("plan: the balloon is anchored on its words (after the beat start, inside the beat)", lead.says && lead.says.at > 0 && lead.says.at < a.durationFrames, JSON.stringify({ says: lead.says, dur: a.durationFrames }));
    t("plan: the partner without a line has no balloon", !((a.characters || [])[1] || {}).says);
  }
  // (D) readcheck shows the balloon as drawn
  const { execFileSync } = require("child_process");
  const rc = fs.readFileSync(path.join(__dirname, "readcheck.js"), "utf8");
  t("readcheck: the blind text reader is told who says what in a balloon", /in a speech balloon above their head/.test(rc));
  // (E) the rules text is an experiment: off by default (the end-to-end prep check runs on the A/B arms)
  const sbSrc = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
  const gated = 'process.env.STORYBOARD_SPEECH === "1" ? SPEECH_LINE : ""';
  const interpolations = sbSrc.split("${").slice(1).filter((x) => x.split("}")[0].includes("SPEECH_LINE"));
  t("rules: SPEECH_LINE is interpolated only behind STORYBOARD_SPEECH=1 (experiment, off by default)", interpolations.length === 1 && interpolations[0].startsWith(gated), JSON.stringify(interpolations.map((x) => x.split("}")[0])));
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall says checks passed");
process.exit(failed ? 1 : 0);
