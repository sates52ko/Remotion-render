#!/usr/bin/env node
/**
 * test-vox-places.js — the Vox film stands in the book's own places (2026-11-23).
 *   node scripts/test-vox-places.js
 */
const fs = require("fs");
const path = require("path");
let fails = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`); if (!ok) fails++; };
const src = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

// 1. the renderer's place runs (pure function copied from backgrounds.tsx by evaluating its body)
const bg = src("src/engines/vox/backgrounds.tsx");
const body = bg.slice(bg.indexOf("export function placeRuns"), bg.indexOf("export const PlaceImage"));
// strip the TypeScript annotations of this one function so it runs as JavaScript
const js = body.replace("export function", "function")
  .replace(/\(beats: PlaceBeat\[\], places: Record<string, string>, home\?: string\): \{[^}]*\}\[\]/, "(beats, places, home)")
  .replace(/const runs: \{[^}]*\}\[\] = \[\];/, "const runs = [];");
const placeRuns = new Function(`${js}; return placeRuns;`)();
const beats = [
  { fromFrame: 0, durationFrames: 100 }, { fromFrame: 100, durationFrames: 100, place: "silo" },
  { fromFrame: 200, durationFrames: 100 }, { fromFrame: 300, durationFrames: 100, place: "tunnel" }, { fromFrame: 400, durationFrames: 50, place: "nowhere" },
];
const places = { silo: "scenes/x/place-silo.png", tunnel: "scenes/x/place-tunnel.png" };
const runs = placeRuns(beats, places, "tunnel");
check("the film starts at home, then each beat in its place; a beat without one stays", runs.map((r) => `${r.id}:${r.from}+${r.frames}`).join(" ") === "tunnel:0+100 silo:100+200 tunnel:300+150", JSON.stringify(runs));
check("no places → no runs (the shared paper shows, as before)", placeRuns(beats, {}, undefined).length === 0);
check("the renderer draws places only when meta.places is set", /config\.meta\.places && Object\.keys\(config\.meta\.places\)\.length/.test(src("src/engines/vox/index.tsx")));

// 2. the planner writes place / places / placeImages from the story bible, and keeps the picture of a book with places
const pv = src("scripts/plan-vox.js");
check("plan-vox reads the story bible's places and writes beat.place", /BOOK_PLACES/.test(pv) && /\.\.\.\(bookPlace \? \{ place: bookPlace \} : \{\}\)/.test(pv));
check("plan-vox writes meta.places, placeImages and home", /ownFrame\.places = /.test(pv) && /ownFrame\.placeImages = /.test(pv) && /ownFrame\.home = /.test(pv));
check("a book with places is not demoted imagefocus → statement", /!Object\.keys\(BOOK_PLACES\)\.length\) type = "statement"/.test(pv));
check("the place prompt asks for an empty place with a calm middle and no text", /No people, no figures, nobody/.test(pv) && /calm open middle third/.test(pv) && /no text/.test(pv));

// 3. the generator makes the place images and drops a place whose image did not generate
const gen = src("scripts/gen-vox-images.py");
check("gen-vox-images reads meta.placeImages and selects them as place:<id>", /placeImages/.test(gen) && /place:\{p\.get\('id'\)\}/.test(gen));
check("a missing place image is dropped from meta.places (never a missing file in the render)", /del _meta\["places"\]\[k\]/.test(gen));

// 4. merge validates the place and says which beat the narration puts somewhere
const sb = src("scripts/storyboard.js");
check("merge refuses a place that is not in the story bible", /one of the story bible's places/.test(sb));
check("merge warns when the narration names a place the beat does not stand in", /the narration names "\$\{hit\}" but the beat stands at no place/.test(sb));

// 5. the originality report measures the place share and the cards left on the shared paper
const or = src("scripts/originality-report.js");
check("originality-report prints PLACES and cards on the shared paper for Vox", /cardsOnSharedPaper/.test(or) && /text cards on the shared paper/.test(or));

console.log(fails ? `\n✗ ${fails} failing` : "\n✓ vox places regression passes");
process.exit(fails ? 1 : 0);
