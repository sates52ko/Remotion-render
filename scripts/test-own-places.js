#!/usr/bin/env node
/** test-own-places.js — Film Flow 6: the book's own place behind a figure scene. No render, no network. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const A = require("./lib/told-apply");
const R = require("./lib/told-rules");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const PAL = { ink: "#101820", accent: "#B5121B", paper: "#F4EFE6" };
const ENT = {
  whitby: { label: "WHITBY", kind: "place", reads: ["harbor"], backdrop: { viewBox: "0 0 1920 760", reads: ["harbor"], paths: [{ d: "M0 760 V600 H1920 V760 Z", fill: "ink" }, { d: "M100 600 V300 H300 V600 Z", fill: "accent" }] } },
  varna: { label: "VARNA", kind: "place" },
  mina: { label: "MINA", kind: "person" },
};
const config = () => ({ meta: { fps: 30 }, scenes: [
  { id: "s0", fromFrame: 0, durationFrames: 100, bg: { type: "flat", colors: ["#EEE"], set: "office", texture: "none" }, characters: [] },
  { id: "s1", fromFrame: 100, durationFrames: 300, bg: { type: "flat", colors: ["#EEE"], set: "room", texture: "none" }, characters: [] },
  { id: "s2", fromFrame: 400, durationFrames: 100, told: { v: 4, items: [], backdrops: [{ id: "whitby", paths: [] }] }, bg: { type: "flat", colors: ["#EEE"], set: "none", texture: "none" } },
] });

t("a figure scene stands at the place its beat names: the book's drawing in the book's colours; the set stays in the config", () => {
  const c = config(), r = A.applyPlaces(c, { s1: "whitby" }, ENT, { palette: PAL });
  assert.deepStrictEqual(r.report, { applied: 1, errors: [] });
  const own = r.config.scenes[1].bg.own;
  assert.strictEqual(own.id, "whitby"); assert.strictEqual(own.wide, true); assert.strictEqual(own.viewBox, "0 0 1920 760");
  assert.deepStrictEqual(own.paths.map((p) => p.fill), ["#101820", "#B5121B"]);
  assert.strictEqual(r.config.scenes[1].bg.set, "room", "the authored set is kept (and its lock)");
  assert.strictEqual(r.config.scenes[0], c.scenes[0], "a scene nobody placed is the same object");
  assert.strictEqual(c.scenes[1].bg.own, undefined, "the input is not changed");
});

t("a told scene is not touched; an undrawn or unknown place is an error and nothing is written", () => {
  const c = config();
  assert.strictEqual(A.applyPlaces(c, { s2: "whitby" }, ENT, { palette: PAL }).config.scenes[2], c.scenes[2]);
  for (const id of ["varna", "mina", "nowhere"]) {
    const r = A.applyPlaces(c, { s0: "whitby", s1: id }, ENT, { palette: PAL });
    assert.strictEqual(r.config, c); assert.strictEqual(r.report.applied, 0);
    assert.ok(/is not a place of entities\.json with a drawing/.test(r.report.errors[0].message));
  }
});

t("the share of film time at a place the book drew counts both kinds of scene; revert takes the place away again", () => {
  const c = config();
  assert.strictEqual(A.placeShare(c).share, 0.2);
  const r = A.applyPlaces(c, { s1: "whitby" }, ENT, { palette: PAL });
  assert.strictEqual(A.placeShare(r.config).share, 0.8);
  const back = A.revertTold(r.config).config;
  assert.ok(back.scenes.every((s) => !(s.bg && s.bg.own)));
  assert.strictEqual(back.scenes[1].bg.set, "room");
});

t("the engine draws the own place INSTEAD of the shared set, where a told stage draws it, without the ambient drift", () => {
  const b = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/components/Backdrop.tsx"), "utf8");
  assert.ok(b.includes("const layers = own ? null : SETS[bg.set] || null;"));
  assert.ok(b.includes("const ownFit = own ? backdropFit(own) : null;"), "the same fit as behind a told stage: the place holds across the cut");
  const block = b.slice(b.indexOf("{own && ownFit ?"), b.indexOf("{tex ?"));
  assert.ok(block.length > 50 && !/amb\(|Math\.sin/.test(block), "no perpetual oscillation on the book's place");
  const schema = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/schema.ts"), "utf8");
  assert.ok(/own: z\.object\(\{ id: z\.string\(\)[^\n]*\)\.optional\(\),/.test(schema), "optional: every config written before it renders as it did");
});

t("authors are told about it, and merge knows the field", () => {
  const rules = R.toldSection(ENT);
  assert.ok(/"place": "<place id>"/.test(rules) && /behind the cast instead of the generic set/.test(rules));
  assert.ok(!/"place": "<place id>"/.test(R.toldSection({ mina: ENT.mina, varna: ENT.varna })), "a book without a drawn place is not told to use one");
  assert.strictEqual(R.isPlaceDrawn(ENT.whitby), true); assert.strictEqual(R.isPlaceDrawn(ENT.varna), false);
  const sb = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
  assert.ok(sb.includes('"told", "place"]') && sb.includes("...(a.place != null && !a.told ? { place: a.place } : {}),") && sb.includes("a told beat's place is its stage's"));
});

t("the book's HOME stands behind every stage and every nowhere-scene that names no place; a set that says where stays", () => {
  const C = require("./lib/told-compile");
  const HOME = { ...ENT, lab: { label: "THE WORKSHOP", kind: "place", home: true, backdrop: { viewBox: "0 0 1920 760", paths: [{ d: "M0 760 V600 H1920 V760 Z", fill: "ink" }] } } };
  const c = { meta: { fps: 30 }, scenes: [
    { id: "a", fromFrame: 0, durationFrames: 100, bg: { set: "office" } }, { id: "b", fromFrame: 100, durationFrames: 100, bg: { set: "forest" } },
    { id: "c", fromFrame: 200, durationFrames: 100, bg: { set: "room" } }, { id: "d", fromFrame: 300, durationFrames: 100, bg: { set: "none" }, told: { v: 4, items: [] } },
  ] };
  const r = A.applyPlaces(c, { c: "whitby" }, HOME, { palette: PAL });
  assert.deepStrictEqual(r.config.scenes.map((x) => (x.bg.own ? x.bg.own.id : null)), ["lab", null, "whitby", null], "office → home; forest stays; a named place wins; a told scene is the compiler's");
  assert.deepStrictEqual([r.report.home, r.report.atHome, r.report.applied], ["lab", 1, 2]);
  assert.ok(A.NOWHERE.has("office") && A.NOWHERE.has("abstract") && !A.NOWHERE.has("forest") && !A.NOWHERE.has("street"));
  assert.strictEqual(A.applyPlaces(c, {}, ENT, { palette: PAL }).report.home, undefined, "a book without a home is as before");
  // a told stage that names no place stands at home; an explicit place replaces it; "no place" is home again
  const words = (t) => t.split(" ").map((w, i) => ({ w, f: i * 12 }));
  const E2 = { ...HOME, ship: { label: "THE SHIP", kind: "object", reads: ["ship"], paths: [{ d: "M40 150 H480 V200 H40 Z", fill: "ink" }, { d: "M100 200 V400 H140 V200 Z", fill: "accent" }, { d: "M200 200 V400 H240 V200 Z", fill: "ink" }, { d: "M300 200 V400 H340 V200 Z", fill: "ink" }, { d: "M60 400 H460 V430 H60 Z", fill: "ink" }] } };
  const k = C.compileTold([{ id: "s1", frames: 300, words: words("the ship lay there in the harbour then it left"), told: { stage: { layout: "solo", who: ["ship"] }, events: [{ on: "harbour", do: "at", who: "whitby" }, { on: "left", do: "at" }] } }], E2, { palette: PAL });
  assert.deepStrictEqual(k.errors, []);
  assert.deepStrictEqual(k.stages[0].backdrops.map((b) => b.id), ["lab", "whitby", "lab"]);
  assert.ok(!k.stages[0].backdrops[0].enter, "the home is there from the first frame");
  const none = C.compileTold([{ id: "s1", frames: 300, words: words("the ship lay there"), told: { stage: { layout: "solo", who: ["ship"] } } }], { ...ENT, ship: E2.ship }, { palette: PAL });
  assert.ok(!none.stages[0].backdrops, "without a home a stage that names no place is on plain ground, as before");
  assert.ok(C.validateEntities({ ...E2, x: { label: "X", kind: "place", home: true, backdrop: { paths: [{ d: "M0 0 H9 V9 Z", fill: "ink" }] } } }).some((m) => /a book has ONE home/.test(m)));
  assert.ok(C.validateEntities({ y: { label: "Y", kind: "place", home: true } }).some((m) => /"home": true needs a place with a drawing/.test(m)));
  assert.ok(/THE BOOK'S HOME/.test(require("./lib/own-drawings").drawingGuide().join("\n")));
});

console.log(`\n${n} checks passed`);
