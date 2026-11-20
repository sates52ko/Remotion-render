#!/usr/bin/env node
/**
 * told.js — FILM FLOW 2: the picture shows what the narration names (2026-11-14).
 *
 *   node scripts/told.js entities --slug=<slug>            what the narration names → storyboard/entities.candidates.json
 *                                                          (the lead agent writes storyboard/entities.json from it,
 *                                                           BEFORE the storyboard authors start; rules.md then lists them)
 *   node scripts/told.js check    --slug=<slug>            compile every told beat of art.json against the planned config
 *                                                          (word timings): errors, warnings, name coverage. Writes nothing.
 *   node scripts/told.js apply    --slug=<slug> [--write] [--pipeline]
 *                                                          the told stages into config.antidote.json, sealed as the
 *                                                          authored decision; make-book runs it (step 1.886) after every
 *                                                          plan, before the gates. Without --write: the report only.
 *   node scripts/told.js revert   --slug=<slug> --write    the figure-and-text picture back on every told scene
 *   node scripts/told.js status   --slug=<slug>            how many scenes are told, coverage before / after
 *   all: [--book-root=<checkout>]  (a book in its own worktree; this script runs from current code)
 *
 * Authoring: .claude/skills/antidote-visual-authoring/told.md (every harness) · the book's storyboard/rules.md.
 * A beat i of art.json is scene i of the config (the planner keeps one scene per beat; the narration is compared).
 * A told beat that does not compile is an ERROR: nothing is written and the pipeline stops — a film is never half-told
 * by accident. No model call, no render.
 */
const fs = require("fs");
const path = require("path");
const { applyTold, revertTold, applyPlaces, placeShare, formArt } = require("./lib/told-apply");
const { entitiesOf, termsOf, mentionCoverage } = require("./lib/told-entities");
const { validateEntities, KINDS, GLYPHS } = require("./lib/told-compile");
const OD = require("./lib/own-drawings");

const cmd = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : path.join(__dirname, ".."));
const SLUG = args.slug;
const usage = () => { console.log("usage: node scripts/told.js entities | check | apply [--write] [--pipeline] | revert --write | status   --slug=<slug> [--book-root=<checkout>]"); process.exit(2); };
if (!cmd || typeof SLUG !== "string") usage();
const BOOK = path.join(ROOT, "books", SLUG), SB = path.join(BOOK, "storyboard");
const F = { config: path.join(BOOK, "config.antidote.json"), art: path.join(BOOK, "art.json"), entities: path.join(SB, "entities.json"), candidates: path.join(SB, "entities.candidates.json"), beats: path.join(SB, "beats.json"), report: path.join(BOOK, "told-report.json") };
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)} %`);

/** art.json beat i → the scene it became. The planner keeps one scene per beat; a narration that does not match is refused. */
function toldByScene(config, art) {
  const out = {}, problems = [], places = {};
  for (const b of (art && art.beats) || []) {
    // Film Flow 6: a figure beat's `place` — the book's own drawing of where it happens, behind the cast
    if (!b.told && b.place != null && (config.scenes || [])[b.i]) places[config.scenes[b.i].id] = b.place;
    if (!b.told) continue;
    const s = (config.scenes || [])[b.i];
    if (!s) { problems.push(`beat ${b.i}: the config has no scene ${b.i}`); continue; }
    const a = norm(b.narration).slice(0, 40), c = norm(s._narration).slice(0, 40);
    if (a && c && !c.startsWith(a.slice(0, 24)) && !a.startsWith(c.slice(0, 24))) { problems.push(`beat ${b.i}: art.json narration "${a}…" is not scene ${s.id}'s "${c}…" — re-run storyboard prep / merge on this plan`); continue; }
    out[s.id] = b.told;
  }
  return { map: out, problems, places };
}

function load({ needArt = true } = {}) {
  const config = readJSON(F.config);
  if (!config) { console.error(`told: no ${path.relative(ROOT, F.config)} (plan the book first; told is an Antidote stage)`); process.exit(1); }
  const art = readJSON(F.art);
  if (needArt && !art) { console.error(`told: no ${path.relative(ROOT, F.art)} (storyboard merge --write first)`); process.exit(1); }
  return { config, art, entities: readJSON(F.entities) || {} };
}

if (cmd === "entities") {
  const raw = readJSON(F.beats);
  const beats = Array.isArray(raw) ? raw : raw && Array.isArray(raw.beats) ? raw.beats : ((readJSON(F.config) || {}).scenes || []).map((s, i) => ({ i, narration: s._narration }));
  if (!beats.length) { console.error("told entities: no storyboard/beats.json and no planned config — run storyboard prep first"); process.exit(1); }
  const ents = entitiesOf(beats.map((b) => ({ _narration: b.narration })), { min: 2 });
  // the book's own TERMS (2026-11-18): a book of ideas names few people and no companies — it says "feedback loop" and "delay" in scene after scene
  let background = null; try { background = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "narration-background.json"), "utf8")); } catch {}
  const terms = termsOf(beats.map((b) => ({ _narration: b.narration })), { background });
  const out = { note: "CANDIDATES from the narration (proper names said in 2+ beats, years, and the book's own TERMS). Write storyboard/entities.json from them: keep what a viewer should SEE, fix ASR spellings, add what is missing, give each a kind.",
    terms: { note: "phrases this narration says in many beats and the other films of the channel do not — the book's own IDEAS. Keep the ones that are its ideas (not every frequent word), give each ONE drawing a stranger could name (kind \"idea\" or \"object\": a stock is a bathtub, a delay is an hourglass on the pipe — the book's own picture when it gives one), with \"states\" for what the narration changes (full / empty), and stage them in told beats. A book of ideas with no drawn ideas stands in the shared office.", list: terms.map((t) => ({ term: t.term, saidInBeats: t.count, beats: t.scenes.slice(0, 12), ...(t.sharedBy ? { alsoInOtherFilms: t.sharedBy } : {}) })) },
    kinds: Object.keys(KINDS), glyphs: GLYPHS,
    // told v2: how the lead agent DRAWS the things (generated from the lint's own numbers and this book's palette)
    drawing: OD.drawingGuide(OD.readBook(BOOK).palette),
    // Film Flow 5: how the lead agent draws the PEOPLE a head of their own (generated from the rig's own numbers)
    cast: OD.castGuide(OD.readBook(BOOK).palette),
    example: { microsoft: { label: "MICROSOFT", kind: "company", glyph: "monitor" }, mozart: { label: "MOZART", kind: "person", look: { age: "child", height: 0.72, headScale: 1.18, outfit: "coat", hairStyle: "curly" } },
      piano: { label: "PIANO", kind: "object", w: 330, reads: ["piano", "grand piano"], paths: [{ d: "M40 150 H480 V200 H40 Z", fill: "ink" }, { d: "…at least five paths: body, lid, keys, legs, the accent detail…", fill: "accent" }], states: { closed: { reads: ["piano", "closed piano"], paths: [{ d: "…", fill: "ink" }] } } },
      vienna: { label: "VIENNA", kind: "place", glyph: "building", reads: ["city", "cathedral"], paths: [{ d: "…", fill: "ink" }], backdrop: { reads: ["city skyline", "skyline"], paths: [{ d: "…", fill: "ink" }] } } },
    candidates: ents.map((e) => ({ name: e.name, kind: e.kind, saidInBeats: e.count, beats: e.scenes.slice(0, 12) })) };
  fs.mkdirSync(SB, { recursive: true });
  fs.writeFileSync(F.candidates, JSON.stringify(out, null, 2));
  console.log(`told entities: ${ents.length} candidates → ${path.relative(ROOT, F.candidates)}`);
  for (const e of ents.slice(0, 20)) console.log(`  ${String(e.count).padStart(3)}×  ${e.name}${e.kind === "year" ? "  (year)" : ""}`);
  console.log(`the book's own terms (said in many beats, not by the other films): ${terms.length ? terms.slice(0, 16).map((t) => `${t.term} ×${t.count}`).join(" · ") : "none found"}`);
  if (ents.filter((e) => e.kind === "name").length < 6 && terms.length >= 4) console.log("  → a book of IDEAS: its terms are what the film must show. Draw them (entities.json, kind \"idea\", with states) and stage them in told beats.");
  console.log(fs.existsSync(F.entities) ? `entities.json exists (${Object.keys(readJSON(F.entities) || {}).length} named things)` : `→ write ${path.relative(ROOT, F.entities)} before the authors start, then re-run storyboard prep (rules.md lists them)`);
  process.exit(0);
}

if (cmd === "status") {
  const { config } = load({ needArt: false });
  const told = config.scenes.filter((s) => s.told).length, cov = mentionCoverage(config), before = mentionCoverage(revertTold(config).config);
  console.log(`${SLUG}: ${told} of ${config.scenes.length} scenes told · flow level ${config.meta.flow || 0}`);
  console.log(`what the narration names is on screen: ${pct(cov.share)} (${cov.shown} of ${cov.mentions} scenes)${told ? ` — without told ${pct(before.share)}` : ""}`);
  const share = OD.drawnShare(config), own = OD.readBook(BOOK), named = Object.values((own.verdict && own.verdict.drawings) || {});
  { const ic = OD.iconShare(config); if (ic.own + ic.library) console.log(`concept icons of the scenes that are not told: ${ic.own} the book's own, ${ic.library} from the shared library${ic.library ? ` (${ic.libraryTop.map(([k, n]) => `${k} ×${n}`).join(", ")})` : ""}`); }
  { const p = placeShare(config); if (p.at) console.log(`film time at a place the book drew: ${pct(p.share)}`); }
  if (told) console.log(`things on told stages shown as the book's own drawing: ${pct(share.share)} (${share.drawn} of ${share.drawn + share.emblem}; the rest are emblems)`);
  if (own.drawings.length) console.log(`own drawings: ${own.drawings.length} · named blind as intended: ${named.filter((r) => r.ok).length} of ${own.drawings.length}${OD.gate(own.drawings, own.verdict).length ? " — NOT all named: node scripts/own-icons-sheet.js --slug=" + SLUG : ""}`);
  process.exit(0);
}

if (cmd === "revert") {
  const { config } = load({ needArt: false });
  const r = revertTold(config);
  if (args.write && r.reverted) fs.writeFileSync(F.config, JSON.stringify(r.config));
  console.log(`told revert: ${r.reverted} scene(s)${args.write ? " written" : " (add --write)"}`);
  process.exit(0);
}

if (cmd === "check" || cmd === "apply") {
  const { config, art, entities } = load();
  const { map, problems, places } = toldByScene(config, art);
  const n = Object.keys(map).length;
  if (!n && !problems.length && !Object.keys(places).length) { console.log(`told ${cmd}: ${SLUG} has no told beat in art.json — nothing to do`); process.exit(0); }
  const entErrors = validateEntities(entities);
  // a re-apply starts from the picture the planner made: apply is idempotent on a config that is already told
  const base = revertTold(config).config;
  // told v2: the book's own drawings — motifs.json icons an entity points at, and the book's colours for the tokens
  const own = OD.readBook(BOOK);
  const r0 = applyTold(base, map, entities, { motifs: own.motifs, palette: own.palette });
  const pl = applyPlaces(r0.config, places, entities, { motifs: own.motifs, palette: own.palette });
  // the book's own drawings on the boards of its narrative form (a part whose title names a person / thing / place it drew)
  const fa = formArt(pl.config, entities, { motifs: own.motifs, palette: own.palette });
  const r = { config: fa.config, report: { ...r0.report, errors: [...r0.report.errors, ...pl.report.errors], places: pl.report.applied, formArt: { matched: fa.matched, parts: fa.parts } } };
  const atPlace = placeShare(r.config);
  const gateMsgs = OD.gate(own.drawings, own.verdict, new Set(Object.values(map).flatMap((t) => [...OD.usedBy(t)])));
  const errors = [...problems.map((m) => ({ beat: null, message: m })), ...r.report.errors];
  const before = mentionCoverage(base), after = mentionCoverage(r.config);
  console.log(`told ${cmd}: ${SLUG} — ${n} told beat(s), ${Object.keys(entities).length} named thing(s)`);
  for (const e of errors) console.log(`  ✗ ${e.beat ? `${e.beat}: ` : ""}${e.message}`);
  for (const w of r.report.warnings) console.log(`  ⚠ ${w.beat}: ${w.message}`);
  // the blind-naming gate is merge's (storyboard.js); here it is said again so a hand-edited art.json does not hide it
  for (const m of gateMsgs) console.log(`  ⚠ ${m}`);
  const share = OD.drawnShare(r.config);
  if (!errors.length && pl.report.home) console.log(`  ✓ the book's home "${pl.report.home}" stands behind ${pl.report.atHome} figure scene(s) that name no place`);
  if (!errors.length && (Object.keys(places).length || atPlace.at)) console.log(`  ✓ ${pl.report.applied} figure scene(s) at a place of the book · film time at a place the book drew: ${pct(atPlace.share)}`);
  if (!errors.length && fa.parts) console.log(`  ✓ form boards: ${fa.matched} of ${fa.parts} parts carry a drawing of the book (a part's title names a person, thing or place of entities.json)`);
  if (!errors.length) console.log(`  ✓ ${r.report.applied} stage(s) compiled · what the narration names is on screen: ${pct(before.share)} → ${pct(after.share)} (${after.shown} of ${after.mentions} scenes) · things shown as the book's own drawing: ${pct(share.share)} (${share.drawn} of ${share.drawn + share.emblem})`);
  const report = { slug: SLUG, at: new Date().toISOString(), told: n, applied: errors.length ? 0 : r.report.applied, errors, warnings: r.report.warnings, coverage: { before: before.share, after: after.share, shown: after.shown, mentions: after.mentions }, ownPlaces: { figureScenes: pl.report.applied, share: atPlace.share }, ownIcons: OD.iconShare(r.config), ownDrawings: { ...share, drawings: own.drawings.length, notNamedBlind: gateMsgs }, missing: after.missing.slice(0, 60), entityErrors: entErrors };
  if (errors.length) {
    if (cmd === "apply" && args.write) fs.writeFileSync(F.report, JSON.stringify(report, null, 2));
    console.log(`TOLD NOT APPLIED — ${errors.length} error(s). Nothing was written. Fix the beats in storyboard/authored-N.json (the messages name them), merge --write, and run again.`);
    process.exit(1);
  }
  if (cmd === "apply" && args.write) {
    fs.writeFileSync(F.config, JSON.stringify(r.config));
    fs.writeFileSync(F.report, JSON.stringify(report, null, 2));
    console.log(`  written: ${path.relative(ROOT, F.config)} (meta.flow ${r.config.meta.flow}), ${path.relative(ROOT, F.report)}`);
  } else if (cmd === "apply") console.log("  (report only — add --write)");
  process.exit(0);
}
usage();
