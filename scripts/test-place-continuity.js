#!/usr/bin/env node
/**
 * test-place-continuity.js — a beat that names no place stays where the film was (V5S books), the measures that say
 * where a film stands, and the narration's place words (2026-11-23, Then She Was Gone: 82 % of the film in the kitchen).
 *   node scripts/test-place-continuity.js
 */
const A = require("./lib/told-apply");
const FM = require("./lib/film-metrics");
const SS = require("./lib/story-share");

let fails = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`); if (!ok) fails++; };

const strip = { d: "M0 600 H1920 V760 H0 Z", fill: "#7D6E62" };
const wall = { d: "M200 300 H900 V600 H200 Z", fill: "#BFB4A6" };
const place = (label, extra = {}, scene = true) => ({ kind: "place", label, backdrop: { viewBox: "0 0 1920 760", paths: [wall, strip], ...(scene ? { sky: "#E8E1D6", ground: "#7D6E62" } : {}) }, ...extra });
const ENT = { kitchen: place("THE KITCHEN", { home: true, reads: ["kitchen"] }), library: place("THE LIBRARY", { reads: ["library", "reading room"] }), woodland: place("THE WOODS", { reads: ["forest", "woods"] }) };
const OLD = { kitchen: place("THE KITCHEN", { home: true }, false), library: place("THE LIBRARY", {}, false) }; // no sky: a wash book
const sc = (id, set, extra = {}) => ({ id, fromFrame: Number(id.slice(1)) * 100, durationFrames: 100, bg: { set }, characters: [{ role: "a" }], props: [], ...extra });
const cfg = () => ({ meta: {}, scenes: [sc("s0", "none"), sc("s1", "none"), sc("s2", "kitchen"), sc("s3", "office"), sc("s4", "forest"), sc("s5", "none")] });
const own = (r, id) => { const s = r.config.scenes.find((x) => x.id === id); return s.bg.own ? s.bg.own.id : null; };

// 1. V5S book, authored places on s1 only; s2's "kitchen" set was the PLANNER's (no authored set)
let r = A.applyPlaces(cfg(), { s1: "library" }, ENT, { authoredSets: {} });
check("the film starts at home", own(r, "s0") === "kitchen", own(r, "s0"));
check("an authored place is drawn", own(r, "s1") === "library");
check("a beat that names no place stays where the film was (not the home)", own(r, "s3") === "library" && own(r, "s5") === "library", `${own(r, "s3")} ${own(r, "s5")}`);
check("a planner-picked shared set is no decision: the beat stays where the film was", own(r, "s2") === "library", own(r, "s2"));
check("the report counts the continued scenes", r.report.continued >= 3, JSON.stringify(r.report));

// 2. an AUTHORED shared set that names one of the book's own places is drawn as that place
r = A.applyPlaces(cfg(), { s1: "library" }, ENT, { authoredSets: { s4: "forest" } });
check("an authored set 'forest' is the book's own woods, and the film then stays there", own(r, "s4") === "woodland" && own(r, "s5") === "woodland", `${own(r, "s4")} ${own(r, "s5")}`);

// 3. a told stage moves the film: the figure scene after it stands where the stage ended
const c3 = cfg(); c3.scenes[2] = { ...c3.scenes[2], told: { v: 5, items: [], backdrops: [{ id: "kitchen", exit: { at: 20, dur: 12 } }, { id: "woodland" }] } };
r = A.applyPlaces(c3, { s1: "library" }, ENT, { authoredSets: {} });
check("after a told stage that ends in the woods, the next figure scene is in the woods", own(r, "s3") === "woodland", own(r, "s3"));

// 4. a book without scene backdrops (washes) is applied exactly as before: no place → home, planner sets count
r = A.applyPlaces(cfg(), { s1: "library" }, OLD, {});
check("a wash book: a beat with no place falls to the home as before", own(r, "s3") === "kitchen" && own(r, "s5") === "kitchen" && r.report.continued === undefined, `${own(r, "s3")} ${own(r, "s5")} ${JSON.stringify(r.report)}`);

// 5. film metrics: top place, distinct, empty share, part openings
const m0 = { meta: { form: { parts: [{ n: 1, from: 0 }, { n: 2, from: 200 }, { n: 3, from: 400 }] } }, scenes: [
  sc("s0", "none", { bg: { set: "none", own: { id: "kitchen" } } }),
  sc("s1", "none", { bg: { set: "none", own: { id: "kitchen" } } }),
  sc("s2", "kitchen"),
  sc("s3", "none", { characters: [], bg: { set: "none", own: { id: "kitchen" } } }),
  sc("s4", "none", { bg: { set: "none", own: { id: "library" } } }),
  sc("s5", "none", { told: { v: 5, items: [], backdrops: [{ id: "library" }] } }),
] };
const m = FM.filmMetrics(m0);
check("the shared kitchen set and the own kitchen are the same room", m.topPlace === "kitchen" && Math.abs(m.topShare - 4 / 6) < 1e-9, JSON.stringify(m.places));
check("distinct places and the told share", m.distinct === 2 && Math.abs(m.toldShare - 1 / 6) < 1e-9);
check("an empty figure scene (nobody, nothing) is counted", m.emptyScenes === 1 && Math.abs(m.emptyShare - 1 / 6) < 1e-9, JSON.stringify(m));
check("part openings and a repeat (parts 1 and 2 both open in the kitchen)", m.partOpenings.map((p) => p.place).join() === "kitchen,kitchen,library" && m.partRepeats === 1, JSON.stringify(m.partOpenings));
check("metric lines print three lines with parts", FM.metricLines(m).length === 3);

// 6. the narration's place words
const pw = SS.placeWordsOf(ENT);
check("place words: id, label and readings; generic words dropped", pw.find((p) => p.id === "library").phrases.includes("reading room") && !pw.some((p) => p.phrases.includes("room")), JSON.stringify(pw));
check("a narration naming the library is matched; one naming no place is not", SS.placesNamedIn("Ellie walks to the library and never arrives.", pw).map((h) => h.id).join() === "library" && SS.placesNamedIn("She waits by the phone all night.", pw).length === 0);
check("plural and multi-word readings match", SS.placesNamedIn("They search the woods for days.", pw)[0].id === "woodland");

// 7. the told compiler: a new stage that names no place stays where the film is (V5S), across a figure beat too
{
  const { compileTold } = require("./lib/told-compile");
  const words = [{ w: "the", f: 2 }, { w: "library", f: 10 }];
  const beats = [
    { id: "b0", frames: 90, words, told: { stage: { layout: "solo", who: ["library"], at: "library" } } },
    { id: "b1", frames: 90, words },
    { id: "b2", frames: 90, words, told: { stage: { layout: "solo", who: ["library"] } } },
  ];
  const at = (st) => ((st && st.backdrops) || []).filter((b) => !b.exit).map((b) => b.id).pop();
  const v5 = compileTold(beats, ENT, {});
  check("V5S: a stage without 'at' after a figure beat stays at the library (not the home)", at(v5.stages[2]) === "library", JSON.stringify(v5.stages[2] && v5.stages[2].backdrops && v5.stages[2].backdrops.map((b) => b.id)));
  const v5moved = compileTold(beats, ENT, { placeByScene: { b1: "woodland" } });
  check("V5S: …and in the woods when the figure beat between them stood there", at(v5moved.stages[2]) === "woodland", JSON.stringify(v5moved.stages[2] && v5moved.stages[2].backdrops));
  const old = compileTold(beats, OLD, {});
  check("a wash book: the stage without 'at' goes home as before", at(old.stages[2]) === "kitchen", JSON.stringify(old.stages[2] && old.stages[2].backdrops));
}

// the band folds by default for new books (operator "tamam" on the stills, 2026-11-24)
{
  const pa = require("fs").readFileSync(require("path").join(__dirname, "plan-antidote.js"), "utf8");
  const hud = pa.slice(pa.indexOf("hud: {", pa.indexOf("multiplane: true")), pa.indexOf("thumbnail,", pa.indexOf("multiplane: true")));
  check("plan-antidote writes meta.hud.fold: true", hud.includes("fold: true,"), hud);
}

console.log(fails ? `\n✗ ${fails} failing` : "\n✓ place continuity regression passes");
process.exit(fails ? 1 : 0);
