#!/usr/bin/env node
/** test-told-compile.js — Film Flow 2: an author's told beat becomes a stage; no render, no network. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const C = require("./lib/told-compile");
const A = require("./lib/told-apply");
const T = require("../src/engines/antidote/told.ts");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const words = (s, step = 10) => s.split(" ").map((w, i) => ({ w, f: i * step }));
const ENT = {
  microsoft: { label: "MICROSOFT", kind: "company", glyph: "monitor" },
  google: { label: "GOOGLE", kind: "company", glyph: "search" },
  mozart: { label: "MOZART", kind: "person", look: { age: "child", height: 0.72 }, w: 230 },
  piano: { label: "", kind: "object", paths: [{ d: "M0 0 H10 V10 Z", fill: "#000" }] },
};
const beat = (id, text, told, frames = 300) => ({ id, frames, words: words(text), told });
const item = (stage, id) => stage.items.find((x) => x.id === id);

t("a word anchors an event: the first match from where the last event was; a phrase; a looser start-of-word match", () => {
  const w = words("it was Windows versus Chrome OS and then Chrome again");
  assert.deepStrictEqual(C.wordFrame(w, "Chrome"), { frame: 40, index: 4 });
  assert.deepStrictEqual(C.wordFrame(w, "Chrome", 5), { frame: 80, index: 8 });
  assert.deepStrictEqual(C.wordFrame(w, "chrome os"), { frame: 40, index: 4 });
  assert.deepStrictEqual(C.wordFrame(w, "versu"), { frame: 30, index: 3 });
  assert.strictEqual(C.wordFrame(w, "Linux"), null);
});

t("entities are checked: kind, label, an own drawing's paths, a glyph that can be drawn", () => {
  assert.deepStrictEqual(C.validateEntities(ENT), []);
  const bad = C.validateEntities({ Bad: { kind: "company" }, cat: { kind: "animal", label: "CAT" }, x: { kind: "wizard", label: "X" }, y: { kind: "company", label: "Y", glyph: "swoosh" } });
  assert.strictEqual(bad.length, 5);
  assert.ok(bad.some((e) => /own drawing/.test(e)) && bad.some((e) => /cannot be drawn/.test(e)));
});

t("stage: two things face each other; they enter from their own side, on the word", () => {
  const r = C.compileTold([beat("b1", "the fight between Microsoft and Google began", { events: [{ on: "Microsoft", do: "arrange", layout: "versus", who: ["microsoft", "google"] }] })], ENT);
  assert.deepStrictEqual(r.errors, []);
  const ms = item(r.stages[0], "microsoft"), g = item(r.stages[0], "google");
  assert.deepStrictEqual([ms.kind, ms.x, ms.y, ms.enter.from, ms.enter.at], ["emblem", 560, 470, "left", 30]);
  assert.deepStrictEqual([g.x, g.enter.from], [1360, "right"]);
  assert.ok(ms.color && g.color && ms.color !== g.color, "each thing has its own colour");
  assert.strictEqual(r.stages[0].v, T.TOLD_VERSION);
});

t("what is on stage stays for the next beat, where the last beat left it — nothing re-enters at the cut", () => {
  const r = C.compileTold([
    beat("b1", "Microsoft and Google lived in different universes", { stage: { layout: "versus", who: ["microsoft", "google"] }, events: [{ on: "universes", do: "apart", who: ["microsoft", "google"] }] }),
    beat("b2", "and Microsoft was the king", { events: [{ on: "king", do: "crown", who: "microsoft" }] }),
  ], ENT);
  assert.deepStrictEqual(r.errors, []);
  const ms2 = item(r.stages[1], "microsoft");
  assert.strictEqual(ms2.enter, undefined);
  assert.strictEqual(ms2.x, 440, "carried at the position the first beat ended on");
  const crown = item(r.stages[1], "microsoft.crown");
  assert.deepStrictEqual([crown.kind, crown.x, crown.enter.at], ["crown", 440, 40]);
});

t("what belongs to a thing moves with it: the crown follows its owner", () => {
  const r = C.compileTold([beat("b1", "the king then walked far away from here", { stage: { layout: "versus", who: ["microsoft", "google"] }, events: [{ on: "king", do: "crown", who: "microsoft" }, { on: "away", do: "apart", who: ["microsoft", "google"] }] })], ENT);
  const ms = item(r.stages[0], "microsoft"), crown = item(r.stages[0], "microsoft.crown");
  const a = T.itemState(ms, 299), c = T.itemState(crown, 299);
  assert.ok(Math.abs(a.x - 440) < 1e-6 && Math.abs(c.x - 440) < 1e-6, `owner ${a.x}, crown ${c.x}`);
});

t("a title is on the screen (not in the camera), one at a time, cleared at the start of the next beat", () => {
  const r = C.compileTold([
    beat("b1", "competition is for losers and winners alike", { stage: { layout: "versus", who: ["microsoft", "google"] }, events: [{ on: "competition", do: "title", text: "Competition is for losers", box: "accent" }, { on: "winners", do: "title", text: "Winners" }] }),
    beat("b2", "next", {}),
  ], ENT);
  const titles = r.stages[0].items.filter((x) => x.kind === "word");
  assert.strictEqual(titles.length, 2);
  assert.ok(titles.every((x) => x.screen === true && x.x === 960 && x.y === 160));
  assert.strictEqual(titles[0].label, "COMPETITION IS FOR LOSERS");
  assert.ok(titles[0].exit && titles[0].exit.at <= titles[1].enter.at, "the first leaves as the second lands");
  const carriedTitle = r.stages[1].items.find((x) => x.kind === "word");
  assert.ok(carriedTitle && carriedTitle.exit.at === 24, "the next beat starts by clearing the band");
});

t("product pairs line up in rows under the two things; a fifth row is refused with a warning", () => {
  const ev = (l, r2, on) => ({ on, do: "pair", left: l, right: r2 });
  const r = C.compileTold([beat("b1", "Windows a b Bing c d Explorer e f Office g h Extra", { stage: { layout: "versus", who: ["microsoft", "google"] }, events: [ev("Windows", "Chrome OS", "Windows"), ev("Bing", "Search", "Bing"), ev("Explorer", "Chrome", "Explorer"), ev("Office", "Docs", "Office"), ev("X", "Y", "Extra")] }, 600)], ENT);
  assert.deepStrictEqual(r.errors, []);
  const tiles = r.stages[0].items.filter((x) => x.kind === "tile");
  assert.strictEqual(tiles.length, 8);
  assert.deepStrictEqual([...new Set(tiles.map((x) => x.y))], [440, 552, 664, 776]);
  assert.deepStrictEqual([T.itemState(item(r.stages[0], "microsoft"), 599).y, T.itemState(item(r.stages[0], "microsoft"), 599).s], [230, 0.5]);
  assert.ok(r.warnings.some((w) => /fifth row/.test(w.message)));
});

t("a person is a figure, an object the book's own drawing; `change` swaps the person's look on a word", () => {
  const r = C.compileTold([beat("b1", "the tiny kid Mozart was blindfolded at the piano", { stage: { layout: "court", who: ["mozart"] }, events: [{ on: "blindfolded", do: "change", who: "mozart", look: { overlay: [{ d: "M0 0", fill: "#000" }] } }, { on: "piano", do: "enter", who: "piano", x: 1215, y: 650 }] })], ENT);
  assert.deepStrictEqual(r.errors, []);
  const figs = r.stages[0].items.filter((x) => x.kind === "figure");
  assert.strictEqual(figs.length, 2);
  assert.ok(figs[0].exit && figs[1].enter.at === 50 && figs[1].variant.overlay && figs[1].variant.age === "child");
  assert.deepStrictEqual([figs[1].id, figs[1].y], ["mozart", 850]);
  const piano = item(r.stages[0], "piano");
  assert.deepStrictEqual([piano.kind, piano.x, piano.y, piano.paths.length], ["icon", 1215, 650, 1]);
});

t("refused, never guessed: a name not in entities, a word the narrator does not say, an unknown action, a thing not on stage", () => {
  const r = C.compileTold([beat("b1", "hello there", { stage: { layout: "versus", who: ["microsoft", "apple"] }, events: [{ on: "goodbye", do: "crown", who: "microsoft" }, { do: "explode" }, { on: "there", do: "crown", who: "google" }] })], ENT);
  const msgs = r.errors.map((e) => e.message).join(" | ");
  assert.ok(/"apple" is not in entities/.test(msgs) && /does not say it/.test(msgs) && /"explode"/.test(msgs) && /not on stage/.test(msgs), msgs);
  assert.ok(r.errors.every((e) => e.beat === "b1"));
});

t("the camera: focus pushes in on a thing and is carried; wide returns; a beat without told ends the stage", () => {
  const r = C.compileTold([
    beat("b1", "look at Microsoft now", { stage: { layout: "versus", who: ["microsoft", "google"] }, events: [{ on: "Microsoft", do: "focus", who: "microsoft" }] }),
    beat("b2", "and back we go", { events: [{ on: "back", do: "wide" }] }),
    beat("b3", "something else", undefined),
    beat("b4", "a new stage", { stage: { layout: "solo", who: ["google"] } }),
  ], ENT);
  assert.ok(r.stages[0].cam[0].s === 1.3 && r.stages[0].cam[0].x === 760);
  assert.deepStrictEqual(r.stages[1].cam.map((k) => [k.at, k.s]), [[0, 1.3], [24, 1]]);
  assert.strictEqual(r.stages[2], null);
  assert.ok(!item(r.stages[3], "microsoft") && item(r.stages[3], "google").x === 960 && !r.stages[3].cam);
});

t("applied to a film: words come from its captions, the stage replaces the figure-and-text picture, the level is raised", () => {
  const cfg = { meta: { fps: 30 }, captions: [{ startFrame: 0, endFrame: 120, words: [{ w: "Microsoft", s: 100, e: 110 }, { w: "and", s: 110, e: 114 }, { w: "Google", s: 114, e: 120 }] }],
    scenes: [{ id: "s0", fromFrame: 0, durationFrames: 90, shot: "medium", characters: [{ action: "talk" }], props: [], texts: [{ text: "X" }], transition: { type: "wipeLeft", frames: 10 } },
      { id: "s1", fromFrame: 90, durationFrames: 90, shot: "twoShot", characters: [{ action: "talk" }], props: [], texts: [{ text: "Y" }], transition: { type: "wipeLeft", frames: 10 } },
      { id: "s2", fromFrame: 180, durationFrames: 90, shot: "twoShot", characters: [{ action: "idle" }], props: [], texts: [], transition: { type: "iris", frames: 12 } }] };
  assert.deepStrictEqual(A.sceneWords(cfg, cfg.scenes[1]), [{ w: "Microsoft", f: 10 }, { w: "and", f: 20 }, { w: "Google", f: 24 }]);
  const told = { s1: { events: [{ on: "Microsoft", do: "arrange", layout: "versus", who: ["microsoft", "google"] }] }, s2: { events: [{ at: 30, do: "crown", who: "microsoft" }] }, nope: {} };
  const r = A.applyTold(cfg, told, ENT);
  assert.deepStrictEqual([r.report.applied, r.report.errors.length, r.report.unknownScenes], [2, 0, ["nope"]]);
  const [s0, s1, s2] = r.config.scenes;
  assert.ok(!s0.told && s0.characters.length === 1, "an untold scene is untouched");
  assert.ok(s1.told && s1.characters.length === 0 && s1.texts.length === 0 && s1._beforeTold.texts[0].text === "Y");
  assert.strictEqual(s1.transition.type, "wipeLeft", "the first told beat keeps its transition");
  assert.deepStrictEqual([s2.transition.type, s2.transition.frames], ["cut", 0]);
  assert.strictEqual(r.config.meta.flow, 2);
  const bad = A.applyTold(cfg, { s1: { events: [{ on: "nothing", do: "title", text: "x" }] } }, ENT);
  assert.ok(bad.report.applied === 0 && !bad.config.scenes[1].told && bad.config.meta.flow === undefined, "a beat with an error is left exactly as it was");
});

t("the approved pilot compiles from its authored form with no error (audit/film-flow/zero-to-one)", () => {
  const dir = path.join(__dirname, "..", "audit", "film-flow", "zero-to-one");
  const told = JSON.parse(fs.readFileSync(path.join(dir, "told.json"), "utf8")), ent = JSON.parse(fs.readFileSync(path.join(dir, "entities.json"), "utf8"));
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, "passage.json"), "utf8"));
  const r = A.applyTold(cfg, told, ent);
  assert.deepStrictEqual(r.report.errors, []);
  assert.strictEqual(r.report.applied, 10);
  for (const s of r.config.scenes) for (const it of s.told.items) for (const f of [0, Math.floor(s.durationFrames / 2), s.durationFrames - 1]) {
    const st = T.itemState(it, f); if (st) assert.ok([st.x, st.y, st.s, st.o, st.r].every(Number.isFinite), `${s.id} ${it.id} @${f}`);
  }
});

// ── told v1.1: what the first real told book (dracula) showed ────────────────────────────────────────────────────────
const labelsOf = (stage) => stage.items.filter((x) => x.kind === "tile" && /\.label\d+$/.test(x.id));
const staying = (stage) => stage.items.filter((x) => !x.exit);

t("extras expire: a label stays for its beat and the next, then leaves by itself; the thing stays", () => {
  const r = C.compileTold([
    beat("b1", "Microsoft made operating systems for years", { stage: { layout: "solo", who: ["microsoft"] }, events: [{ on: "operating", do: "label", who: "microsoft", text: "Operating systems" }] }),
    beat("b2", "and it grew every single year", { events: [{ on: "grew", do: "grow", who: "microsoft" }] }),
    beat("b3", "until the day it stopped", { events: [{ on: "stopped", do: "shake", who: "microsoft" }] }),
    beat("b4", "nothing else was said", { events: [{ on: "nothing", do: "dim", who: "microsoft" }] }),
  ], ENT);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(labelsOf(r.stages[0]).length, 1);
  assert.strictEqual(staying(r.stages[1]).filter((x) => /\.label/.test(x.id)).length, 1, "still there in the next beat");
  assert.ok(labelsOf(r.stages[2])[0].exit, "leaves as the third beat starts");
  assert.strictEqual(labelsOf(r.stages[3]).length, 0);
  assert.ok(item(r.stages[3], "microsoft") && !item(r.stages[3], "microsoft").exit);
});

t("a thing has at most two labels: the third replaces the oldest, in its place", () => {
  const r = C.compileTold([beat("b1", "Microsoft sold Windows then Office then Xbox to everyone", { stage: { layout: "solo", who: ["microsoft"] }, events: [
    { on: "Windows", do: "label", who: "microsoft", text: "Windows" }, { on: "Office", do: "label", who: "microsoft", text: "Office" }, { on: "Xbox", do: "label", who: "microsoft", text: "Xbox" }] })], ENT);
  assert.deepStrictEqual(r.errors, []);
  const ls = labelsOf(r.stages[0]);
  assert.strictEqual(ls.length, 3);
  assert.deepStrictEqual(staying(r.stages[0]).filter((x) => /\.label/.test(x.id)).map((x) => x.label), ["OFFICE", "XBOX"]);
  assert.strictEqual(ls[2].y, ls[0].y, "the third takes the place of the one that left");
  assert.strictEqual(C.LABELS_PER_THING, 2);
});

t("the stage lists exactly who is on it: whoever is not named leaves with what belongs to them", () => {
  const r = C.compileTold([
    beat("b1", "Microsoft the king met Google", { stage: { layout: "versus", who: ["microsoft", "google"] }, events: [{ on: "king", do: "label", who: "microsoft", text: "The king" }] }),
    beat("b2", "then young Mozart sat at the piano", { stage: { layout: "versus", who: ["mozart", "piano"] }, events: [] }),
    beat("b3", "and he played all night", { events: [{ on: "played", do: "shake", who: "piano" }] }),
  ], ENT);
  assert.deepStrictEqual(r.errors, []);
  for (const id of ["microsoft", "google"]) assert.ok(item(r.stages[1], id).exit, `${id} leaves`);
  assert.ok(labelsOf(r.stages[1]).every((x) => x.exit));
  assert.deepStrictEqual(r.stages[2].items.filter((x) => ["microsoft", "google"].includes(x.id)), []);
  assert.ok(item(r.stages[2], "mozart") && item(r.stages[2], "piano"));
});

t("an effect belongs to its own beat: a cross is gone in the next one; a crown stays", () => {
  const r = C.compileTold([
    beat("b1", "Microsoft the king never reached Google", { stage: { layout: "versus", who: ["microsoft", "google"] }, events: [{ on: "king", do: "crown", who: "microsoft" }, { on: "never", do: "cross", who: ["microsoft", "google"] }] }),
    beat("b2", "and so it went on", { events: [{ on: "went", do: "grow", who: "google" }] }),
    beat("b3", "for a long time", { events: [{ on: "long", do: "shake", who: "google" }] }),
  ], ENT);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.stages[0].items.some((x) => x.kind === "cross"));
  assert.ok(r.stages[1].items.filter((x) => x.kind === "cross").every((x) => x.exit));
  assert.strictEqual(r.stages[2].items.filter((x) => x.kind === "cross").length, 0);
  assert.ok(item(r.stages[2], "microsoft.crown") && !item(r.stages[2], "microsoft.crown").exit);
});

t("the screen-text gate reads a word where it is printed: a kept label is not a repetition, a name plate is not a text", () => {
  const ST = require("./lib/screen-text");
  const r = C.compileTold([1, 2, 3, 4, 5].map((k) => beat(`b${k}`, "Microsoft the king of operating systems stood", k === 1
    ? { stage: { layout: "solo", who: ["microsoft"] }, events: [{ on: "king", do: "crown", who: "microsoft" }] } : { events: [{ on: "stood", do: "shake", who: "microsoft" }] })), ENT);
  assert.deepStrictEqual(r.stages.map((s, k) => ST.collectScreenStrings({ id: `s${k}`, told: s }, {}).map((x) => x.text)), [[], [], [], [], []], "MICROSOFT on five kept stages is its name plate");
  const withLabel = C.compileTold([beat("b1", "Microsoft made operating systems", { stage: { layout: "solo", who: ["microsoft"] }, events: [{ on: "operating", do: "label", who: "microsoft", text: "Operating systems" }] }), beat("b2", "and it grew", { events: [{ on: "grew", do: "grow", who: "microsoft" }] })], ENT);
  assert.deepStrictEqual(withLabel.stages.map((s, k) => ST.collectScreenStrings({ id: `s${k}`, told: s }, {}).map((x) => x.text)), [["OPERATING SYSTEMS"], []]);
});

// ── told 1.2: layout faults seen in dracula's first clips ────────────────────────────────────────────────────────────
const PEOPLE = { ...ENT, count: { label: "COUNT DRACULA", kind: "person", look: { height: 1.05 }, w: 300 }, mina: { label: "MINA HARKER", kind: "person", look: { height: 0.92 } } };
const topOf = (it, st) => st.y - (C.figH(it) + 78) * st.s; // body + name plate

t("a person fits under the title band: a tall one is drawn smaller, never cropped; growing stops at the frame", () => {
  const r = C.compileTold([
    beat("b1", "Count Dracula stood alone and grew stronger", { stage: { layout: "solo", who: ["count"] }, events: [{ on: "grew", do: "grow", who: "count", to: 1.6 }] }),
  ], PEOPLE);
  assert.deepStrictEqual(r.errors, []);
  const c = item(r.stages[0], "count");
  assert.ok(c.s < 1 && topOf(c, { y: c.y, s: c.s }) >= C.FIG_TOP - 1, `rests below the title band (top ${topOf(c, c)})`);
  const end = T.itemState(c, 299);
  assert.ok(topOf(c, end) >= C.FIG_TOP_HARD - 1, `grown, the name is still in the frame (top ${topOf(c, end)})`);
  assert.deepStrictEqual(r.warnings.filter((w) => /above the frame/.test(w.message)), []);
});

t("a person's crown sits above the name plate, inside the frame", () => {
  const r = C.compileTold([beat("b1", "Mina Harker was the real winner here", { stage: { layout: "solo", who: ["mina"] }, events: [{ on: "winner", do: "crown", who: "mina" }] })], PEOPLE);
  assert.deepStrictEqual(r.errors, []);
  const m = item(r.stages[0], "mina"), crown = item(r.stages[0], "mina.crown"), end = T.itemState(m, 299);
  assert.ok(crown.y + 36 * crown.s <= topOf(m, end) + 1, `crown bottom ${crown.y + 36 * crown.s} is above the plate top ${topOf(m, end)}`);
  assert.ok(crown.y - 58 * crown.s >= C.FIG_TOP_HARD - 60, `crown top ${crown.y - 58 * crown.s} is in the frame`);
});

t("a label never leaves the frame: it takes the side with room, or is pulled in; beside a person it is at shoulder height", () => {
  const r = C.compileTold([beat("b1", "Mina and Microsoft and Google worked with demanding physical labor every day", { stage: { layout: "row", who: ["mina", "microsoft", "google"] }, events: [
    { on: "demanding", do: "label", who: "google", text: "Demanding physical labor" }, { on: "labor", do: "label", who: "mina", text: "A very efficient modern mind" }] })], PEOPLE);
  assert.deepStrictEqual(r.errors, []);
  const ls = labelsOf(r.stages[0]);
  assert.strictEqual(ls.length, 2);
  for (const l of ls) { const w = C.tileW(l.label, l.size); assert.ok(l.x - w / 2 >= 39 && l.x + w / 2 <= 1881, `${l.label}: ${l.x - w / 2} … ${l.x + w / 2}`); }
  const mina = item(r.stages[0], "mina"), ml = ls.find((l) => /MODERN MIND/.test(l.label));
  const mEnd = T.itemState(mina, 299), lEnd = T.itemState(ml, 299);
  assert.ok((lEnd.y < mEnd.y - 150 && lEnd.y > mEnd.y - C.figH(mina) * mEnd.s) || (lEnd.y > mEnd.y && lEnd.y <= 860), `at her shoulders, or under her feet above the subtitles (label ${lEnd.y}, feet ${mEnd.y})`);
});

t("no room beside (a row of people): the label goes under its person, people step up, nothing reaches the subtitles", () => {
  const R4 = { ...PEOPLE, a: { label: "JONATHAN HARKER", kind: "person" }, b: { label: "DR. SEWARD", kind: "person" } };
  const r = C.compileTold([beat("b1", "Jonathan kept a journal and Seward recorded wax cylinders while Mina typed", { stage: { layout: "row", who: ["a", "b", "mina", "count"] }, events: [
    { on: "journal", do: "label", who: "a", text: "Shorthand journal" }, { on: "wax", do: "label", who: "b", text: "Wax phonograph cylinders" }] })], R4);
  assert.deepStrictEqual(r.errors, []); assert.deepStrictEqual(r.warnings, []);
  const st = r.stages[0], ls = labelsOf(st).map((l) => ({ l, e: T.itemState(l, 299) }));
  assert.strictEqual(ls.length, 2);
  for (const id of ["a", "b", "mina", "count"]) assert.ok(T.itemState(item(st, id), 299).y <= 701, `${id} stands on the raised line`);
  for (const { l, e } of ls) { const w = C.tileW(l.label, l.size); assert.ok(e.y > 700 && e.y <= 860 && e.x - w / 2 >= 39 && e.x + w / 2 <= 1881, `${l.label} @ ${e.x},${e.y}`); }
  assert.notStrictEqual(ls[0].e.y, ls[1].e.y, "neighbours' labels are on alternate lines");
});

t("someone joins: everyone makes room; an arrangement is exact; a label does not follow its thing across the stage or grow with it", () => {
  const r = C.compileTold([
    beat("b1", "Microsoft made systems and then Google arrived and then Mozart", { stage: { layout: "solo", who: ["microsoft"] }, events: [
      { on: "systems", do: "label", who: "microsoft", text: "Operating systems" }, { on: "Google", do: "enter", who: "google" }, { on: "Mozart", do: "enter", who: "mozart" }] }),
    beat("b2", "only Google and Mozart remained and Google grew", { events: [{ on: "only", do: "arrange", layout: "versus", who: ["google", "mozart"] }, { at: 30, do: "label", who: "google", text: "Search" }, { on: "grew", do: "grow", who: "google", to: 1.5 }] }),
  ], ENT);
  assert.deepStrictEqual(r.errors, []);
  const xs = ["microsoft", "google", "mozart"].map((id) => T.itemState(item(r.stages[0], id), 299).x);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2] && xs[1] - xs[0] > 300 && xs[2] - xs[1] > 300, `three in a row, apart: ${xs}`);
  assert.ok(labelsOf(r.stages[0])[0].exit, "the label left when its thing walked to its new place");
  assert.ok(item(r.stages[1], "microsoft").exit, "the arrangement did not name it: it leaves");
  const lab = labelsOf(r.stages[1]).find((l) => l.label === "SEARCH");
  assert.strictEqual(T.itemState(lab, 299).s, 1, "the thing grew, its label did not");
});

t("a timeline needs the middle: the things step up into a row of heads; a newcomer joins the heads", () => {
  const r = C.compileTold([beat("b1", "on the seventeenth of July the ship sailed and then Google came", { stage: { layout: "versus", who: ["microsoft", "mozart"] }, events: [
    { on: "seventeenth", do: "date", text: "17 July" }, { on: "Google", do: "enter", who: "google" }] })], ENT);
  assert.deepStrictEqual(r.errors, []); assert.deepStrictEqual(r.warnings, []);
  const end = (id) => T.itemState(item(r.stages[0], id), 299);
  for (const id of ["microsoft", "google"]) assert.ok(end(id).y < 300 && end(id).s <= 0.5, `${id} is a head (${end(id).y}, ${end(id).s})`);
  assert.ok(end("mozart").y < 450 && end("mozart").y - C.figH(item(r.stages[0], "mozart")) * end("mozart").s > 0, "a person among the heads stands inside the frame");
});

t("merge holds a told beat's words to the screen-text rules", () => {
  const R = require("./lib/told-rules");
  const bad = R.checkToldBeat({ events: [{ on: "men", do: "label", who: "microsoft", text: "Four men pool blood" }] }, "four men pool their blood", ENT);
  assert.ok(bad.some((m) => /TELEGRAPHIC/.test(m)), bad.join(" | "));
  assert.deepStrictEqual(R.checkToldBeat({ events: [{ on: "operating", do: "label", who: "microsoft", text: "Operating systems" }] }, "it made operating systems", ENT), []);
  assert.ok(/EXACTLY who is on stage/.test(R.toldSection(ENT)) && /Extras expire/.test(R.toldSection(ENT)));
});

t("flow: the things of an idea are one mechanism — large, in order, an arrow from each to the next; a new arrangement takes the arrows away", () => {
  const P = [{ d: "M40 150 H480 V200 H40 Z", fill: "ink" }, { d: "M100 200 V400 H140 V200 Z", fill: "accent" }, { d: "M200 200 V400 H240 V200 Z", fill: "ink" }, { d: "M300 200 V400 H340 V200 Z", fill: "ink" }, { d: "M60 400 H460 V430 H60 Z", fill: "ink" }];
  const E3 = { faucet: { label: "INFLOW", kind: "object", reads: ["faucet"], paths: P }, tub: { label: "THE STOCK", kind: "object", reads: ["bathtub"], paths: P }, drain: { label: "OUTFLOW", kind: "object", reads: ["drain"], paths: P }, a: { label: "A", kind: "object", reads: ["a"], paths: P }, b: { label: "B", kind: "object", reads: ["b"], paths: P } };
  assert.deepStrictEqual(C.slots("flow", 3).map((x) => x.x), [330, 960, 1590]);
  assert.ok(C.slots("flow", 3)[0].s > C.slots("row", 3)[0].s && C.slots("flow", 2)[0].s > C.slots("flow", 4)[0].s, "a mechanism is read large");
  const r = C.compileTold([beat("b1", "the water rises in the tub and then it drains away slowly", { stage: { layout: "flow", who: ["faucet", "tub", "drain"] } }),
    beat("b2", "now look at only the tub by itself here", { events: [{ on: "only", do: "arrange", layout: "solo", who: ["tub"] }] })], E3);
  assert.deepStrictEqual(r.errors, []);
  const arrows = r.stages[0].items.filter((x) => x.kind === "arrow");
  assert.strictEqual(arrows.length, 2);
  assert.deepStrictEqual(arrows.map((x) => x.x), [645, 1275], "between the slots");
  const things = ["faucet", "tub", "drain"].map((id) => r.stages[0].items.find((x) => x.id === id));
  assert.ok(things.every((x) => x && x.s === 1.2 && x.y === arrows[0].y) && things[0].x < arrows[0].x && arrows[0].x < things[1].x);
  assert.ok(r.stages[1].items.filter((x) => x.kind === "arrow").every((x) => x.exit), "the arrows of an arrangement leave with it");
  assert.ok(C.compileTold([beat("b1", "one two three four five six seven", { stage: { layout: "flow", who: ["faucet", "tub", "drain", "a", "b"] } })], E3).errors.some((e) => /at most four things/.test(e.message)));
  assert.ok(C.LAYOUTS.includes("flow"));
});

console.log(`\n${n} checks passed`);
