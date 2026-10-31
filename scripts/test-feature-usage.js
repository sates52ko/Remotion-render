#!/usr/bin/env node
// Offline tests for feature-usage.js on a temp-dir fixture (no render, no LLM).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
let fail = 0;
const t = (name, ok) => { console.log(`${ok ? "✓" : "✗"} ${name}`); if (!ok) fail++; };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "feature-usage-"));
const slug = "fixture-book";
const BOOK = path.join(root, "books", slug);
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
const narr = (k) => `beat ${k} the chains break when she finally speaks the truth aloud`;
const who = (identity, extra = {}) => ({ identity, rig: "everyman", expression: "neutral", action: "talk", ...extra });
const scenes = [
  { id: "intro", type: "title", fromFrame: 0, durationFrames: 90, _narration: narr(0) },
  { id: "scene-01", fromFrame: 90, durationFrames: 300, _narration: narr(1), characters: [who("mara")], continueFromPrev: true },
  { id: "scene-02", fromFrame: 390, durationFrames: 300, _narration: narr(2), characters: [who("mara", { action: "take", actionAt: 40 })] },
  { id: "scene-03", fromFrame: 690, durationFrames: 300, _narration: narr(3), characters: [who("narrator")], concept: "chains", props: [{ type: "chains" }] },
  { id: "scene-04", fromFrame: 990, durationFrames: 300, _narration: narr(4), characters: [], continueFromPrev: true },
];
fs.writeFileSync(path.join(BOOK, "config.antidote.json"), JSON.stringify({ meta: {}, scenes }));
const beats = [
  { i: 0, narration: narr(0), cast: ["mara"] },
  { i: 1, narration: narr(1), cast: ["mara"], continue: true, explainedBy: "she keeps the stage", storyboard: { claim: "c1" } },
  { i: 2, narration: narr(2), cast: ["mara"], action: "take", actionCue: "speaks", storyboard: { claim: "c2" } },
  { i: 3, narration: narr(3), cast: ["mara"], concept: "chains", conceptMotion: "break", storyboard: { claim: "c3" } }, // cast + motion dropped
  { i: 4, narration: narr(4), cast: [], storyboard: { claim: "c4" } },
];
fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats));
fs.writeFileSync(path.join(BOOK, "art.json"), JSON.stringify({ beats: beats.map(({ explainedBy, ...b }) => b) }));
const before = fs.readFileSync(path.join(BOOK, "config.antidote.json"), "utf8") + fs.readFileSync(path.join(BOOK, "art.json"), "utf8");

const r = spawnSync(process.execPath, [path.join(__dirname, "feature-usage.js"), `--slug=${slug}`, `--root=${root}`], { encoding: "utf8" });
const dir = path.join(root, "audit", "feature-usage", slug);
const rep = fs.existsSync(dir) ? JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), "utf8")) : null;
const F = (k) => rep && rep.features.find((x) => x.feature === k);
t("runs, exit 0, writes a report", r.status === 0 && !!rep && rep.reportOnly === true);
t("continue: authored 1 / merged 1 / planned 1; 1 engine-only scene", F("continue").authored === 1 && F("continue").merged === 1 && F("continue").planned === 1 && F("continue").engineOnly === 1);
t("take + actionCue reach the config", F("action:take").planned === 1 && F("actionCue").planned === 1);
t("authored cast not drawn -> dropped, with the beat i", F("cast (named)").dropped === 1 && F("cast (named)").droppedBeats.join() === "3");
t("conceptMotion not on any prop -> dropped", F("conceptMotion").merged === 1 && F("conceptMotion").planned === 0 && F("conceptMotion").dropped === 1);
t("title scene is skipped, not a drop: merged 4 = planned 2 + dropped 1 + title 1", F("cast (named)").merged === 4 && F("cast (named)").planned === 2 && F("cast (named)").dropped === 1 && F("cast (named)").skippedTitle === 1);
t("explainedBy never reaches art.json -> NOT_CARRIED, not 0", F("explainedBy").authored === 1 && F("explainedBy").merged === "NOT_CARRIED" && F("explainedBy").planned === "NOT_CARRIED");
t("rendered is NOT_VERIFIED for every feature", rep.features.every((x) => x.rendered === "NOT_VERIFIED"));
t("cue resolution not recorded -> NOT_VERIFIED", F("conceptMotionCue").planned === "NOT_VERIFIED");
t("zero use is reported as 0, not as an error", F("action:embrace").merged === 0 && !/error|fail/i.test(r.stdout));
t("never writes the book", fs.readFileSync(path.join(BOOK, "config.antidote.json"), "utf8") + fs.readFileSync(path.join(BOOK, "art.json"), "utf8") === before);
const v = spawnSync(process.execPath, [path.join(__dirname, "feature-usage.js"), "--slug=no-such-book", `--root=${root}`], { encoding: "utf8" });
t("a book without an Antidote config: exit 0, says so", v.status === 0 && /Antidote only/.test(v.stdout));

fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
