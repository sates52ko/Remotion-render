/**
 * told-apply.js — put compiled told stages into a film config (Film Flow 2, 2026-11-14).
 *
 *   applyTold(config, toldByScene, entities) → { config, report }
 *     toldByScene: { "<scene id>": { stage?, events? } }  (what the author wrote for that beat)
 *
 * For every scene that has a told beat: its narration words are taken from the film's own captions (frames relative
 * to the scene), the stage is compiled (lib/told-compile.js) and written to `scene.told`; the figure-and-text staging
 * of that scene is set aside under `scene._beforeTold` (nothing an author wrote is lost — the stage REPLACES the
 * picture only where the film's flow level draws it), consecutive told scenes are one stage (a 0-frame cut), and the
 * film's `meta.flow` is raised to 2. A compile error leaves that scene exactly as it was and is reported — a film is
 * never half-told by accident. Pure given its inputs; the caller writes the file.
 */
const { compileTold } = require("./told-compile");
const { resolveLook } = require("./own-drawings");

/**
 * ONE PERSON, ONE HEAD (Film Flow 5). A person the lead agent drew a head for (entities.json look.drawn) who is also
 * in the film's cast under the same id wears that look in EVERY scene — the told stages and the figure scenes between
 * them — or the film would show two different people under one name. The cast as planned is kept under
 * meta._castBeforeTold (revertTold puts it back). A book without a drawn head: nothing changes.
 */
function castHeads(meta, entities, palette) {
  const cast = (meta && meta.cast) || null, before = {}, next = { ...(cast || {}) };
  if (!cast) return { meta, heads: [] };
  for (const [id, e] of Object.entries(entities || {})) {
    if (!e || e.kind !== "person" || !e.look || !e.look.drawn || !cast[id]) continue;
    before[id] = cast[id];
    next[id] = { ...cast[id], variant: { ...(cast[id].variant || {}), ...resolveLook(e.look, palette) } };
  }
  const heads = Object.keys(before);
  return heads.length ? { meta: { ...meta, cast: next, _castBeforeTold: { ...(meta._castBeforeTold || {}), ...before } }, heads } : { meta, heads };
}

/** The words said during a scene, as frames from the scene's start. */
function sceneWords(config, scene) {
  const a = scene.fromFrame, b = a + scene.durationFrames, out = [];
  let last = null;
  for (const c of config.captions || []) {
    if (c.endFrame <= a || c.startFrame >= b) continue;
    for (const w of c.words || []) {
      if (w.s < a || w.s >= b) continue;
      if (last && w.s < last.e && w.w === last.w) continue; // a word repeated at a caption break
      out.push({ w: w.w, f: w.s - a }); last = w;
    }
  }
  return out;
}

const crypto = require("crypto");
const stageHash = (stage) => crypto.createHash("sha256").update(JSON.stringify(stage)).digest("hex").slice(0, 16);

/**
 * The told stage IS the beat's authored decision (as lib/single-relation.js sealAuthored does for its contracts):
 * the authorship lock is rewritten to what is on screen now — nobody from the cast, no icon prop, no callout — so
 * make-book's restoreAuthoredStaging keeps the stage instead of putting the old figures back, and gate-authorship
 * checks the scene against it. The planner's lock stays as `previousLock`. The VisualContract's staging side (which
 * figures must be on screen, which lever represents the idea) described the picture that was replaced: it is rebound;
 * its narration side is untouched.
 */
function sealTold(scene) {
  const a = scene._authorship;
  const provenance = { v: scene.told.v || 1, hash: stageHash(scene.told), items: scene.told.items.length };
  const out = { ...scene };
  if (a) {
    const old = a.src === "told" ? a.previousLock || null : a.lock || null;
    const lock = { planShot: scene.shot, shot: scene.shot, cast: [], concept: scene.concept ?? null, propTypes: [], artTexts: [], told: provenance };
    if (scene.bg && scene.bg.set) lock.set = scene.bg.set;
    out._authorship = { ...a, src: "told", lock, previousLock: old };
  }
  if (scene.visualContract) {
    const vc = JSON.parse(JSON.stringify(scene.visualContract));
    if (Array.isArray(vc.characterIntent)) { if (vc.characterIntent.length && !vc.previousCharacterIntent) vc.previousCharacterIntent = vc.characterIntent; vc.characterIntent = []; }
    if (vc.visualEvidence && vc.visualEvidence.representation != null) { vc.visualEvidence.previousRepresentation = vc.visualEvidence.representation; delete vc.visualEvidence.representation; }
    vc.told = provenance;
    out.visualContract = vc;
  }
  return out;
}

/**
 * THE BOOK'S OWN PLACE BEHIND A FIGURE SCENE (Film Flow 6). placeByScene: { "<scene id>": "<place id>" } — what the
 * author wrote as the beat's `place`. The scene's `bg.own` becomes that place's drawing (its backdrop, or its own
 * paths), in the book's colours; the shared `set` stays in the config (and in the lock) but is not drawn. A told
 * scene is not touched (its place is the stage's `at`). An unknown or undrawn place is an error; nothing is written.
 */
/** the shared sets that mean "nowhere in particular": only these give way to the book's home */
const NOWHERE = new Set(["none", "abstract", "office", "room"]);
/** a book that draws at least one place as a SCENE (a backdrop with a sky): the told-v5 books */
const isV5S = (entities) => Object.values(entities || {}).some((e) => e && e.backdrop && e.backdrop.sky != null);
/** shared set name → the book's own drawn place of that name (its id, a one-word label or reading); generic sets never */
function ownPlaceBySet(ent, drawingOf) {
  const out = new Map();
  for (const [k, e] of Object.entries(ent || {})) {
    if (!e || e.kind !== "place" || !drawingOf(k)) continue;
    const names = [k, e.label, ...(Array.isArray(e.reads) ? e.reads : []), ...((e.backdrop && Array.isArray(e.backdrop.reads)) ? e.backdrop.reads : [])];
    for (const n of names) { const w = String(n || "").toLowerCase().replace(/^the\s+/, "").trim(); if (w && !/\s/.test(w) && !NOWHERE.has(w) && !out.has(w)) out.set(w, k); }
  }
  return out;
}
function applyPlaces(config, placeByScene = {}, entities = {}, drawings = {}) {
  const { resolveEntities, DEFAULT_PALETTE } = require("./own-drawings");
  const ent = resolveEntities(entities, { motifs: drawings.motifs || {}, palette: drawings.palette || DEFAULT_PALETTE }).entities;
  // told v5 slice 4: a backdrop drawn as a SCENE carries its sky and ground (resolved) to the figure scene's bg.own
  const errors = [], drawingOf = (id) => { const e = ent[id]; if (!e || e.kind !== "place") return null; return e.backdrop && Array.isArray(e.backdrop.paths) && e.backdrop.paths.length ? { id, wide: true, paths: e.backdrop.paths, ...(e.backdrop.viewBox ? { viewBox: e.backdrop.viewBox } : {}), ...(e.backdrop.sky ? { sky: e.backdrop.sky, ground: e.backdrop.ground } : {}) } : Array.isArray(e.paths) && e.paths.length ? { id, paths: e.paths, ...(e.viewBox ? { viewBox: e.viewBox } : {}) } : null; };
  // the book's HOME stands behind a figure scene whose beat names no place AND whose authored set is nowhere in
  // particular (told-compile.js does the same for a stage). A set that says where the beat is — a forest, a shore, a
  // street — is the author's decision and stays.
  const home = Object.keys(ent).find((k) => ent[k] && ent[k].home === true && drawingOf(k)) || null;
  // PLACE CONTINUITY (2026-11-23, Then She Was Gone: the film stood in the kitchen 81 % of the time — every beat that
  // named no place fell back to the home, and the shared `kitchen` set stood beside the book's own kitchen). In a book
  // that draws its places as SCENES (a backdrop with a sky — the told-v5 books), a beat that names no place stays where
  // the film last was, as a cut in a film does; the home is only where the film starts. A shared set whose name is one
  // of the book's own places (its id, a one-word label or reading) is drawn as that place. Any other book: as before.
  const V5S = isV5S(entities);
  const ownBySet = V5S ? ownPlaceBySet(ent, drawingOf) : new Map();
  /** where a told stage ends: its last backdrop without an exit */
  const toldPlace = (s) => { const b = ((s.told && s.told.backdrops) || []).filter((x) => !x.exit).pop(); return b ? b.id : null; };
  // in a V5S book only the set the AUTHOR wrote says where a beat is (drawings.authoredSets: { sceneId: set }); the set
  // the planner picked for a beat that named none (a "kitchen" here and there) is no decision — the beat stays where
  // the film is. Without authoredSets (an older caller) every set counts, as before.
  const authoredSets = drawings.authoredSets || null;
  let applied = 0, atHome = 0, carried = 0, current = null;
  const scenes = (config.scenes || []).map((s) => {
    const named = placeByScene[s.id];
    if (s.told) { if (V5S) current = toldPlace(s) || current; return s; }
    const planned = String((s.bg && s.bg.set) || "none").toLowerCase();
    const set = V5S && authoredSets ? String(authoredSets[s.id] || "none").toLowerCase() : planned;
    let id;
    if (named != null) id = named;
    else if (V5S && ownBySet.has(set)) id = ownBySet.get(set);
    else if (NOWHERE.has(set)) { id = V5S && current ? current : home; if (V5S && current) carried++; }
    else id = null;
    if (named == null && id != null && id === home && !(V5S && current)) atHome++;
    if (V5S && id != null) current = id;
    if (id == null) return s;
    const d = drawingOf(id);
    if (!d) { errors.push({ beat: s.id, message: `place: "${id}" is not a place of entities.json with a drawing (kind "place" + paths, or a "backdrop")` }); return s; }
    applied++;
    return { ...s, bg: { ...(s.bg || {}), own: d } };
  });
  return errors.length ? { config, report: { applied: 0, errors } } : { config: { ...config, scenes }, report: { applied, errors, ...(home ? { home, atHome } : {}), ...(V5S ? { continued: carried } : {}) } };
}

/**
 * THE BOOK'S OWN DRAWINGS ON ITS FORM BOARDS (2026-11-18). A part of the film's narrative form (config.meta.form.parts,
 * scripts/lib/narrative-form.js) whose TITLE names something the book drew — a person, a thing, a place of
 * entities.json — carries that drawing: the gallery frame shows that person's own head, the exhibit card that thing.
 * The author's word wins: an entity with `"part": <n>` IS part n's drawing. Otherwise the title is matched by its
 * words (four letters or more): the entity's id is in the title, or its whole label is, or the whole title is in its
 * label; a one-word title may also match a reading ("The castle" → the place read as "castle"). A shared first name is
 * not enough ("Lucy's chart" is not "Lucy's room"). For a form of people a person is preferred, for the others a
 * thing. A title that names nothing drawn carries no art: the board shows its name only. Fresh at every apply; pure.
 */
function formArt(config, entities = {}, drawings = {}) {
  const form = config && config.meta && config.meta.form;
  if (!form || !Array.isArray(form.parts) || !form.parts.length) return { config, matched: 0, parts: 0 };
  const { resolveEntities, DEFAULT_PALETTE } = require("./own-drawings");
  const ent = resolveEntities(entities, { motifs: drawings.motifs || {}, palette: drawings.palette || DEFAULT_PALETTE }).entities;
  const STOP = new Set(["the", "and", "with", "from", "that", "this", "into", "book", "last", "first"]);
  const words = (s) => String(s || "").toLowerCase().replace(/'s\b/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
  const cands = Object.entries(ent).map(([id, e]) => {
    const person = e.kind === "person";
    const art = person ? (e.look ? { kind: "person", variant: e.look } : null)
      : Array.isArray(e.paths) && e.paths.length ? { kind: "thing", viewBox: e.viewBox || "0 0 520 520", paths: e.paths }
      : e.backdrop && Array.isArray(e.backdrop.paths) && e.backdrop.paths.length ? { kind: "thing", viewBox: e.backdrop.viewBox || "0 0 1920 760", paths: e.backdrop.paths } : null;
    return art ? { id, person, art, part: Number.isInteger(e.part) ? e.part : null, idw: words(id), label: words(e.label), reads: new Set((e.reads || []).flatMap(words)) } : null;
  }).filter(Boolean);
  const wantPerson = form.key === "portraits" || form.key === "journey" ? form.key === "portraits" : false;
  let matched = 0;
  const parts = form.parts.map((p) => {
    const { art: _old, ...rest } = p;
    const said = cands.find((c) => c.part === p.n);
    if (said) { matched++; return { ...rest, art: { ...said.art, entity: said.id } }; }
    const tw = words(p.title), T = new Set(tw);
    if (!tw.length) return rest;
    let best = null;
    for (const c of cands) {
      const byId = c.idw.length > 0 && c.idw.every((w) => T.has(w)), labelIn = c.label.length > 0 && c.label.every((w) => T.has(w)), titleIn = tw.every((w) => c.label.includes(w));
      const byRead = tw.length === 1 && c.reads.has(tw[0]);
      if (!byId && !labelIn && !titleIn && !byRead) continue;
      const score = (byId ? 20 : 0) + (labelIn ? 12 : 0) + (titleIn ? 10 : 0) + (byRead ? 3 : 0) + (c.person === wantPerson ? 2 : 0) + (form.key !== "portraits" && !c.person ? 1 : 0);
      if (!best || score > best.score) best = { score, c };
    }
    if (!best) return rest;
    matched++;
    return { ...rest, art: { ...best.c.art, entity: best.c.id } };
  });
  return { config: { ...config, meta: { ...config.meta, form: { ...form, parts } } }, matched, parts: parts.length };
}

/** how much of the film's time stands at a place the book drew (told stages with a backdrop + figure scenes with bg.own) */
function placeShare(config) {
  let total = 0, at = 0;
  for (const s of config.scenes || []) { total += s.durationFrames || 0; if (s.told ? (s.told.backdrops || []).length : s.bg && s.bg.own) at += s.durationFrames || 0; }
  return { frames: total, at, share: total ? at / total : 0 };
}

/** `drawings` (told v2): { motifs, palette } — the book's own icons and colours (lib/own-drawings.js readBook) */
function applyTold(config, toldByScene, entities = {}, drawings = {}) {
  const scenes = config.scenes || [];
  const beats = scenes.map((s) => ({ id: s.id, frames: s.durationFrames, words: sceneWords(config, s), told: toldByScene[s.id] }));
  const unknown = Object.keys(toldByScene).filter((id) => !scenes.some((s) => s.id === id));
  // place continuity (V5S books): the stages need to know where the figure beats between them stand — the author's
  // `place`, else a shared set that names one of the book's own places (the same rule applyPlaces draws by)
  let placeByScene = drawings.placeByScene || {};
  if (isV5S(entities)) {
    const { resolveEntities, DEFAULT_PALETTE } = require("./own-drawings");
    const ent = resolveEntities(entities, { motifs: drawings.motifs || {}, palette: drawings.palette || DEFAULT_PALETTE }).entities;
    const drawn = (k) => !!(ent[k] && ent[k].kind === "place" && ((ent[k].backdrop && (ent[k].backdrop.paths || []).length) || (ent[k].paths || []).length));
    const bySet = ownPlaceBySet(ent, drawn);
    placeByScene = { ...placeByScene };
    const authoredSets = drawings.authoredSets || null;
    for (const s of scenes) if (!toldByScene[s.id] && placeByScene[s.id] == null) { const set = String((authoredSets ? authoredSets[s.id] : s.bg && s.bg.set) || "").toLowerCase(); if (bySet.has(set)) placeByScene[s.id] = bySet.get(set); }
  }
  const { stages, errors, warnings } = compileTold(beats, entities, { ...drawings, placeByScene });
  const bad = new Set(errors.filter((e) => e.beat).map((e) => e.beat));
  const global = errors.filter((e) => !e.beat);
  let applied = 0;
  const next = scenes.map((s, i) => {
    const stage = stages[i];
    if (!stage || bad.has(s.id) || global.length) return s;
    applied++;
    const prevTold = i > 0 && stages[i - 1] && !bad.has(scenes[i - 1].id);
    const before = s._beforeTold || { shot: s.shot, characters: s.characters, props: s.props, texts: s.texts, diagram: s.diagram, transition: s.transition, camera: s.camera, shots: s.shots };
    const out = { ...s, told: stage, _beforeTold: before, characters: [], props: [], texts: [], camera: { zoom: [1, 1], panX: [0, 0], panY: [0, 0] } };
    delete out.diagram; delete out.shots;
    // the same stage carried over the cut: no wipe between two beats of it
    if (prevTold) out.transition = { ...(s.transition || {}), type: "cut", frames: 0 };
    return sealTold(out);
  });
  const flowMeta = applied ? { ...(config.meta || {}), flow: Math.max(2, Number((config.meta || {}).flow) || 0) } : config.meta;
  const { meta, heads } = applied ? castHeads(flowMeta, entities, drawings.palette) : { meta: flowMeta, heads: [] };
  return {
    config: { ...config, meta, scenes: next },
    report: { told: Object.keys(toldByScene).length, applied, castHeads: heads, errors: [...global, ...errors.filter((e) => e.beat)], warnings, unknownScenes: unknown },
  };
}

/** Undo: every told scene gets its figure-and-text picture and its planner lock back. */
function revertTold(config) {
  let n = 0;
  const scenes = (config.scenes || []).map((s0) => {
    let s = s0;
    if (!s.told && s.bg && s.bg.own) { const bg = { ...s.bg }; delete bg.own; s = { ...s, bg }; }
    if (!s.told) return s;
    n++;
    const b = s._beforeTold || {}, out = { ...s, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
    delete out.told; delete out._beforeTold;
    if (out._authorship && out._authorship.src === "told") { const a = { ...out._authorship, lock: out._authorship.previousLock, src: "art" }; delete a.previousLock; out._authorship = a; }
    if (out.visualContract && out.visualContract.told) {
      const vc = JSON.parse(JSON.stringify(out.visualContract));
      if (vc.previousCharacterIntent) { vc.characterIntent = vc.previousCharacterIntent; delete vc.previousCharacterIntent; }
      if (vc.visualEvidence && vc.visualEvidence.previousRepresentation != null) { vc.visualEvidence.representation = vc.visualEvidence.previousRepresentation; delete vc.visualEvidence.previousRepresentation; }
      delete vc.told; out.visualContract = vc;
    }
    return out;
  });
  let meta = config.meta;
  if (meta && meta._castBeforeTold) { meta = { ...meta, cast: { ...(meta.cast || {}), ...meta._castBeforeTold } }; delete meta._castBeforeTold; }
  return { config: { ...config, meta, scenes }, reverted: n };
}

module.exports = { NOWHERE, isV5S, ownPlaceBySet, formArt, applyPlaces, placeShare, castHeads, applyTold, revertTold, sealTold, sceneWords, stageHash };
