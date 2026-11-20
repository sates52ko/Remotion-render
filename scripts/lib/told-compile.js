/**
 * told-compile.js — FILM FLOW 2: an author says WHO is on stage and WHAT HAPPENS ON WHICH WORD; this turns it into the
 * keyframed stage the engine draws (src/engines/antidote/told.ts → components/ToldStage.tsx). 2026-11-14.
 *
 * Why a compiler: the two pilots the operator approved (zero-to-one, the-creative-curve) were written by hand as frame
 * numbers and pixel positions — 21 scenes took a session. An author of a 300-beat book must not count frames. So:
 *
 *   entities  (book level, storyboard/entities.json): every thing the narration names, once —
 *             { "<id>": { label, kind: company|product|place|idea|person|object|animal, glyph?, color?, look?, paths?, w? } }
 *             company / product / place / idea → an EMBLEM (its name in its colour + a plain glyph, never a copied logo);
 *             person → a FIGURE (the engine's own rig: look = age, outfit, headwear, hair, …); object / animal → the
 *             book's own DRAWING (paths, as in motifs.json).
 *   a told beat (in the authored chunk):
 *             "told": { "stage": { "layout": "versus", "who": ["microsoft", "google"] },
 *                       "events": [ { "on": "king", "do": "crown", "who": "microsoft" }, … ] }
 *             `on` is a word (or the first words of a phrase) of THIS beat's narration: the event LANDS on it.
 *
 * The compiler places things (layouts, label sides, rows, the title band), keeps what is on stage from beat to beat
 * (a thing stays where the last beat left it; nothing re-enters at a cut), moves what belongs to a thing with it (its
 * crown, its world, its labels), and refuses what it cannot honour (an unknown name, a word the narrator does not say).
 * Pure: (beats, entities) → stages. No clock, no randomness, no model call. Tested by test-told-compile.js.
 *
 * TOLD v2 — THE BOOK'S OWN DRAWINGS (Film Flow 3, 2026-11-16; lib/own-drawings.js):
 *   - a thing of ANY kind that carries a drawing (`paths`, or `motif`: an own icon of motifs.json) is drawn as that
 *     drawing with its name under it; the emblem (a tile + a glyph) is only the fallback for a thing nobody drew;
 *   - a drawing has STATES (`states: { wrecked: { paths } }`): `change` + `state` swaps it on the word and the thing
 *     stays that way for the rest of the film (until changed again);
 *   - a person HOLDS a drawing (`change` + `holds: <id>`), GIVES it (`give`, who: [from, to], what) or TAKES one that
 *     stands on stage (`take`) — the thing travels from hand to hand and lands on the word;
 *   - the stage is AT a place (`stage.at`, or the event `at`): that place's drawing, pale, behind everything.
 *
 * TOLD v3 — PEOPLE PLAY THE VERB (Film Flow 4, 2026-11-17; src/engines/antidote/toldActs.ts):
 *   { "on": "<word>", "do": "act", "who": "<person>", "verb": "<verb>", "target": "<id>"? } — the person DOES it, on the
 *   word: they turn to the other, close the distance the verb needs, the gesture lands on the word, the other reacts
 *   (struck, bitten), and what the verb needs is put where it belongs (the typewriter on a desk in front of the seated
 *   typist, the book in the reader's hands). Only an `act` event does any of this: a beat without one compiles exactly
 *   as told v2 compiled it.
 */
const T = require("../../src/engines/antidote/told.ts");
const OD = require("./own-drawings");
const TA = require("../../src/engines/antidote/toldActs.ts");

const INK = "#1E1E22", ACCENT = "#D9603C", RED = "#C2362B", GOLD = "#E8B93C";
const PALETTE = ["#2563EB", "#E0503A", "#2F8F5B", "#8A4FC7", "#D08A1E", "#0E8C96", "#B5372F", "#5A6B7A"];
const GLYPHS = ["monitor", "search", "doc", "browser", "building", "book", "coin", "globe", "gear", "phone", "chart", "star", "heart", "flag", "cart", "people", "bolt", "leaf"];
const KINDS = { company: "emblem", product: "emblem", place: "emblem", idea: "emblem", person: "figure", object: "icon", animal: "icon" };
// "flow" (2026-11-18, a book of ideas): the things are ONE mechanism — large, in the order the narration gives them,
// an arrow from each to the next (inflow → stock → outflow; cause → effect). A row put three small things side by side
// with nothing between them ("Thinking in Systems", the bathtub: the faucet did not pour into anything).
const LAYOUTS = ["solo", "versus", "row", "court", "pairs", "flow"];
const DOS = ["enter", "exit", "arrange", "title", "label", "crown", "uncrown", "world", "cross", "stamp", "cover", "uncover", "dim", "restore", "grow", "shake", "apart", "together", "collide", "burst", "coins", "pair", "date", "focus", "wide", "clear", "change", "raw", "give", "take", "throw", "drop", "at", "act"];
/** told v3 — what each verb needs: the other it is done to ("person" | "thing" = a drawn thing | "any"), and whether it must be there */
const VERBS = {
  hit: { target: "person", need: true }, bite: { target: "person", need: true }, chase: { target: "person", need: true },
  hide: { target: "any", need: true }, type: { target: "thing", need: true }, read: { target: "thing", need: true },
  write: { target: "thing", need: false }, dig: { target: "any", need: false }, point: { target: "any", need: true },
  come: { target: "any", need: true }, fall: { target: "any", need: false },
};
/** how close two people stand for a verb (px at scale 1, centre to centre) and how early an approach starts */
// (first lab clip: at 215 / 150 the two bodies and their name plates lay on each other)
// hit: the fist (≈ 180 px from the body's middle at scale 1) arrives at the other's near shoulder
const REACH = { hit: 260, bite: 215, come: 340, dig: 380, chase: 330 };
/** two people in contact (round 2): the one who acts carries their name plate one plate HIGHER — at 215–260 px apart
 *  two plates of 300 px lay on each other, and shrinking them (round 1) did not part them */
const PLATE_UP = -(38 + 22 + 10);
/** what a digger digs: a mound of earth and the spade standing in it — an engine drawing, at the digger's feet */
const DIG_PATHS = [
  { d: "M40 470 Q120 330 230 380 Q330 300 480 470 Z", fill: "#4A3527" },
  { d: "M120 470 Q170 410 230 440 Q300 400 360 470 Z", fill: "#33241B" },
  { d: "M300 150 H322 V372 H300 Z M276 132 H346 V156 H276 Z", fill: "#7A4A21" },
  { d: "M278 362 H344 V420 Q311 456 278 420 Z", fill: "#5E6B73" },
  { d: "M70 462 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 Z M420 452 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 Z", fill: "#E9E1CF" },
];
const ACT_MIN = 36; // an act that needs an approach does not land before this stage frame
/** how a named thing is DRAWN: a person is the rig; anything with a drawing is that drawing; the rest is an emblem */
const drawnAs = (e) => (!e ? null : e.kind === "person" ? "figure" : (Array.isArray(e.paths) && e.paths.length) || e.motif ? "icon" : KINDS[e.kind] || null);
const Y = { emblem: 470, figure: 850, icon: 600 };
// IN THE HAND: a held drawing is this share of the person's width, at the hand of the arm that faces the middle
// (round 2: the first version put it BESIDE the hand — the operator saw a journal floating next to Mina.) The rig's
// `hold` pose brings the forearm across the body: the hand rests in front of the chest at (228, 431) of the rig's
// 400 × 900 box (movements.ts "hold"). The drawing is raised a little above that point, so the fingers show under its
// lower edge — how the rig's own hand props sit (Everyman.tsx heldArmEl).
const HELD = { box: 0.44, rigX: 228, rigY: 431, rigW: 400, rigH: 900, raise: 0.3 };
const handOf = (fig, p) => {
  const w = fig.w || 260, k = (w / HELD.rigW) * p.s * Math.min(1, (fig.variant && fig.variant.height) || 1), box = Math.round(w * HELD.box);
  const feet = fig.body === "bust" ? 600 : HELD.rigH;
  return { x: p.x + (fig.flip ? -1 : 1) * (HELD.rigX - HELD.rigW / 2) * k, y: p.y - (feet - HELD.rigY) * k - box * HELD.raise * p.s, s: p.s };
};
// A NAME PLATE'S WIDTH (told.ts plateW: per-letter widths — 0.62 em per letter hid the ends of "WAX PHONOGRAPH")
/** from a thing's point down to the lower edge of its name plate (at scale 1) */
const footOff = (it) => (it.kind === "emblem" ? 180 : (it.w || 312) / 2 + 66);
const plateHalf = (it, s) => (it && it.label ? (T.plateW(it.label, it.kind === "emblem" ? 56 : it.size || 38) / 2) * s : 0);
// TOLD v2 LAYOUT — where a drawn thing leaves room for what is written about it
const V2L = { foot: 764, midIcon: 390, midEmblem: 360, midFeet: 600, midTop: 190, lineY: 812, dateY: 742, maxTall: 520 };
// A PERSON FITS UNDER THE TITLE BAND (dracula's first clips: "COUNT DRACULA" cut by the top of the frame, a title
// printed over "MINA HARKER", the crown sitting on the name). A person is feet-to-name-plate: the body (taller for a
// look.height above 1), the plate above the head, and a crown above the plate when they wear one. That whole column
// starts below the title band; a person who would not fit is drawn smaller, never cropped.
const FIG_TOP = 250, FIG_TOP_HARD = 140, TAG_H = 78, CROWN_H = 104;
const figH = (it) => (it.w || 260) * (it.body === "bust" ? 1.5 : 2.25) * Math.max(1, (it.variant && it.variant.height) || 1);
const fitS = (it, y, { crown = false, top = FIG_TOP } = {}) => Math.max(0.35, (y - top) / (figH(it) + TAG_H + (crown ? CROWN_H : 0)));
// a label is a tile centred on x: this wide (ToldStage textW ≈ 0.62 em per capital + the dot and padding)
const tileW = (text, size = 38) => String(text).length * size * 0.7 + 118;
const EDGE = 40;
const UNDER_FEET = 700; // where people stand when labels go under them
// where a mark ON a thing goes: a thing's own point is its middle, a person's is their FEET — a stamp, a cross or a
// burst belongs on the chest, a blindfold bar on the eyes (dracula: a stamp at a person's feet, under the subtitles)
const midOf = (it, p) => (it && it.kind === "figure" ? { ...p, y: p.y - figH(it) * 0.5 * p.s } : p);
const eyesOf = (it, p) => (it && it.kind === "figure" ? p.y - figH(it) * 0.86 * p.s : p.y - 30 * p.s);
const SAFE = { top: 130, bottom: 860 }; // the HUD above, the subtitle band below
// EXTRAS EXPIRE, THINGS STAY (dracula, the first real told book: 123 label events and no `clear` — one scene carried
// 16 labels and two crosses). How many beats AFTER the one it lands in an extra stays: a label is the fact of this
// sentence and the next; an effect (a burst, a cross, coins) belongs to its own beat; a stamp / a cover and a set of
// rows stay a little longer. A crown and a world are states: they stay until taken off.
const TTL = { label: 1, fx: 0, row: 2 };
const TTL_DECO = 2;
const LABELS_PER_THING = 2;

const norm = (w) => String(w || "").toLowerCase().replace(/[^a-z0-9']/g, "");
const clone = (o) => JSON.parse(JSON.stringify(o));

/** The frame (beat-relative) at which `on` is said, searching from word index `from`. → {frame, index} or null */
function wordFrame(words, on, from = 0) {
  const want = String(on).split(/\s+/).map(norm).filter(Boolean);
  if (!want.length) return null;
  for (let i = from; i < words.length; i++) {
    if (want.every((w, k) => words[i + k] && norm(words[i + k].w) === w)) return { frame: words[i].f, index: i };
  }
  // a looser match: the word starts with what the author wrote ("compet" → "competition")
  for (let i = from; i < words.length; i++) if (norm(words[i].w).startsWith(want[0]) && want[0].length >= 4) return { frame: words[i].f, index: i };
  return null;
}

function slots(layout, n) {
  if (layout === "solo") return [{ x: 960, s: 1 }];
  if (layout === "versus") return [{ x: 560, s: 1 }, { x: 1360, s: 1 }];
  if (layout === "pairs") return [{ x: 560, y: 230, s: 0.5, head: true }, { x: 1360, y: 230, s: 0.5, head: true }];
  if (layout === "court") { // the first is in the middle, the others stand around: left, right, left, right
    const side = [330, 1590, 580, 1340, 130, 1790];
    return Array.from({ length: n }, (_, i) => (i === 0 ? { x: 960, s: 1 } : { x: side[(i - 1) % side.length], s: 1 }));
  }
  if (layout === "flow") { // at most four links read at this size; the arrows stand between the slots
    // the things stand in the MIDDLE of the stage (their names under them stay clear of the subtitles at this size)
    const fs_ = n <= 2 ? 1.4 : n === 3 ? 1.2 : 1, fa = n <= 2 ? 520 : 330, fb = 1920 - fa;
    return Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 960 : fa + ((fb - fa) * i) / (n - 1), s: fs_, mid: true, flow: true }));
  }
  const s = n <= 3 ? 1 : n === 4 ? 0.8 : 0.65, a = 340, b = 1580;
  return Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 960 : a + ((b - a) * i) / (n - 1), s }));
}

const titleSize = (text) => (text.length <= 14 ? 104 : text.length <= 22 ? 84 : text.length <= 30 ? 68 : 56);

/** The entity as a stage item (no position yet). */
function entityItem(id, e, colorOf, state) {
  const kind = drawnAs(e);
  if (kind === "icon") {
    // the book's own drawing (in the state the film has left it in); a drawn company / product / place / idea keeps
    // its emblem colour for its labels
    const st = (state && e.states && e.states[state]) || null;
    return { id, kind: "icon", label: e.label, paths: (st || e).paths || [], viewBox: (st || e).viewBox, w: e.w || 312, ...(KINDS[e.kind] === "emblem" ? { color: e.color || colorOf(id) } : {}), ...(st ? { state } : {}), _role: "entity", _ent: id };
  }
  if (kind === "emblem") return { id, kind: "emblem", label: e.label, sub: e.sub, glyph: e.glyph, color: e.color || colorOf(id), _role: "entity", _ent: id };
  if (kind === "figure") return { id, kind: "figure", label: e.label, variant: e.look || {}, w: e.w || 260, body: e.body || "full", action: e.action || "idle", holds: e.holds, flip: e.flip, _role: "entity", _ent: id };
  return null;
}

function validateEntities(entities) {
  const errors = [];
  const homes = Object.entries(entities || {}).filter(([, e]) => e && e.home === true);
  if (homes.length > 1) errors.push(`"home": true on ${homes.map(([id]) => id).join(", ")} — a book has ONE home (the place behind every scene that names none)`);
  for (const [id, e] of homes) if (e.kind !== "place" || !((e.backdrop && Array.isArray(e.backdrop.paths) && e.backdrop.paths.length) || (Array.isArray(e.paths) && e.paths.length))) errors.push(`entity "${id}": "home": true needs a place with a drawing (a "backdrop")`);
  for (const [id, e] of Object.entries(entities || {})) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) errors.push(`entity "${id}": the id is lower-case letters, digits and "-"`);
    if (!KINDS[e.kind]) errors.push(`entity "${id}": kind is one of ${Object.keys(KINDS).join(" | ")}`);
    if (KINDS[e.kind] !== "icon" && !String(e.label || "").trim()) errors.push(`entity "${id}": a ${e.kind} needs a label (the name the narration uses)`);
    if (KINDS[e.kind] === "icon" && !(Array.isArray(e.paths) && e.paths.length) && !e.motif) errors.push(`entity "${id}": an ${e.kind} is the book's own drawing — give its paths (or "motif": an own icon of motifs.json)`);
    if (e.glyph && !GLYPHS.includes(e.glyph)) errors.push(`entity "${id}": glyph "${e.glyph}" cannot be drawn — one of ${GLYPHS.join(", ")} (or none: the first letter is shown)`);
  }
  return errors;
}

/**
 * compileTold(beats, entities) → { stages: [ToldSpec | null], errors: [{beat, message}], warnings: [...] }
 *   beats: [{ id, frames, words: [{w, f}], told? }] in film order; a beat without `told` ends the carried stage.
 */
function compileTold(beats, written = {}, opts = {}) {
  // one source for a drawing (own-drawings.js): `motif` → the own icon's paths, colour tokens → the book's colours
  const resolved = OD.resolveEntities(written, { motifs: opts.motifs || {}, palette: opts.palette || OD.DEFAULT_PALETTE });
  const entities = resolved.entities;
  const errors = [...validateEntities(written), ...resolved.errors].map((message) => ({ beat: null, message })), warnings = [];
  const ids = Object.keys(entities);
  const colorOf = (id) => PALETTE[ids.filter((k) => KINDS[entities[k].kind] === "emblem").indexOf(id) % PALETTE.length] || PALETTE[0];
  let carried = [], cam = { x: 960, y: 540, s: 1 }, seq = 0, beatNo = 0;
  const stages = [];
  // A CHANGED THING STAYS CHANGED: the state a drawing was last given, for the rest of the film (the ship that was
  // wrecked in act two is not whole again in act three because a new stage was set)
  const stateOf = {};
  // THE v2 LAYOUT RULES (round 2, 2026-11-17) apply to a book that carries told-v2 drawings — an entity with `reads`,
  // `states`, a `backdrop` or a `motif` pointer. A book written for told v1 (dracula as authored, zero-to-one, the
  // golden fixture) is placed exactly as told 1.2 placed it.
  const V2 = Object.values(written || {}).some((e) => e && (e.reads != null || e.states || e.backdrop || e.motif));
  let place = null; // the place the told run is AT (its drawing is the stage's backdrop); a run's end clears it

  for (const beat of beats) {
    if (!beat.told) { stages.push(null); carried = []; cam = { x: 960, y: 540, s: 1 }; place = null; continue; }
    const err = (message) => errors.push({ beat: beat.id, message });
    const told = beat.told, words = beat.words || [], D = beat.frames;
    beatNo++;
    // what the last beat left on stage: where it was at its last frame, already there (no entrance)
    const items = carried.map((it) => { const c = clone(it); delete c.enter; delete c.keys; delete c.exit; delete c.shake; return c; });
    const camKeys = cam.x !== 960 || cam.y !== 540 || cam.s !== 1 ? [{ at: 0, dur: 1, x: cam.x, y: cam.y, s: cam.s }] : [];
    const curCam = { ...cam };
    const find = (id) => items.find((it) => it.id === id && !it._gone);
    const stateAt = (it, f) => T.itemState(it, f) || { x: it.x, y: it.y, s: it.s ?? 1, o: it.o ?? 1, r: it.r ?? 0 };
    const key = (it, k) => { (it.keys = it.keys || []).push(k); };
    const bound = (ent) => items.filter((it) => it._bind === ent && !it._gone);
    /** move an entity; what belongs to it (crown, world, labels, cover) keeps its place relative to it */
    const move = (ent, at, to, dur = 18, ease = "inout") => {
      const it = find(ent); if (!it) return;
      const from = stateAt(it, at - dur), ns = to.s ?? from.s, nx = to.x ?? from.x, ny = to.y ?? from.y;
      key(it, { at, dur, ease, x: nx, y: ny, s: ns, ...(to.o != null ? { o: to.o } : {}), ...(to.r != null ? { r: to.r } : {}) });
      for (const b of bound(ent)) {
        // a LABEL was placed for where its thing stood and at reading size: when the thing walks somewhere else the
        // label leaves (it would land on a neighbour or outside the frame), and when the thing grows the label does
        // not (dracula: a label at 1.8× across the stage, another at x −30)
        // v3 (round 2): the crown of a person who sits — or has just got up — is put exactly over their name plate
        // (which is down with a seated head: labelDy), not carried by proportion from wherever it was a moment ago
        if (b.kind === "crown" && it.kind === "figure" && (it.labelDy != null || recrownAfter.has(ent))) { key(b, { at, dur, ease, x: nx, y: ny - (figH(it) + TAG_H + 46) * ns + (it.labelDy || 0) * ns, s: ns }); continue; }
        // v2: a label that stands UNDER a thing's name plate keeps standing under it when the thing grows or rises
        if (b._role === "label" && b._below != null && Math.abs(nx - from.x) <= 40) { key(b, { at, dur, ease, y: Math.min(SAFE.bottom - 40, ny + footOff(it) * ns + 56 + b._below) }); continue; }
        if (b._role === "label") { if (Math.abs(nx - from.x) > 40 || Math.abs(ny - from.y) > 40) leave(b, Math.max(10, at - dur)); continue; }
        // v2: a verdict stamped on a thing (or a bar across it) was made for where it stood, at that size — when the
        // layout sends the thing elsewhere it is gone BEFORE the thing sets off (it was left fading in the old place,
        // or rode along as a ghost onto the timeline: dracula "MASSACRE")
        if (V2 && b._role === "deco" && b._ttl != null && (Math.abs(nx - from.x) > 40 || Math.abs(ny - from.y) > 40)) { leave(b, Math.max(6, at - dur), 6); continue; }
        const bs = stateAt(b, at - dur), ratio = ns / (from.s || 1);
        key(b, { at, dur, ease, x: nx + (bs.x - from.x) * ratio, y: ny + (bs.y - from.y) * ratio, s: bs.s * ratio });
      }
    };
    const leave = (it, at, dur = 10) => { it.exit = { at: Math.max(dur, at), dur }; it._gone = true; };
    const add = (it) => { if (it._born == null) it._born = beatNo; if (it._ttl === undefined && TTL[it._role] != null) it._ttl = TTL[it._role]; items.push(it); return it; };
    const ensure = (ent, at, slot, from) => {
      const e = entities[ent];
      if (!e) { err(`"${ent}" is not in entities.json`); return null; }
      let it = find(ent);
      // the two column heads of a comparison: a thing is centred at the slot, a person STANDS there (feet lower)
      // while labels stand under the people, people keep the raised line (a re-arrangement must not push the labels
      // down into the subtitles)
      const lineup = drawnAs(e) === "figure" && slot.y == null && items.some((x) => x._under && !x._gone);
      if (lineup) slot = { ...slot, s: slot.s * 0.86 };
      // v2 timeline (`mid`): the things stay in the middle of the stage at reading size, each kind on its own line
      const kind = drawnAs(e), y = slot.mid ? (kind === "figure" ? V2L.midFeet : kind === "emblem" ? V2L.midEmblem : V2L.midIcon) : slot.head && kind === "figure" ? slot.y + 170 : slot.y ?? (lineup ? UNDER_FEET : Y[kind]);
      if (kind === "figure") { const probe = it || entityItem(ent, e, colorOf, stateOf[ent]); slot = { ...slot, s: Math.min(slot.s, fitS(probe, y, { crown: !!it && bound(ent).some((b) => b.kind === "crown"), top: slot.mid ? V2L.midTop : slot.head ? 60 : FIG_TOP })) }; }
      // v2: a NAME PLATE stays in the frame, as a label does — the thing stands far enough from the edge for its name
      if (V2) { const half = plateHalf({ label: e.label, kind }, slot.s); if (half) slot = { ...slot, x: Math.max(EDGE + half, Math.min(1920 - EDGE - half, slot.x)) }; }
      if (it) { const st = stateAt(it, at); if (Math.abs(st.x - slot.x) > 1 || Math.abs(st.y - y) > 1 || Math.abs(st.s - slot.s) > 0.01) move(ent, Math.max(at, 20), { x: slot.x, y, s: slot.s }); return it; }
      it = add({ ...entityItem(ent, e, colorOf, stateOf[ent]), x: slot.x, y, s: slot.s });
      // v3 — a person's SIGNATURE: the one drawn thing of the book they are never without comes on stage in their hand
      if (kind === "figure" && e.carries && drawing(e.carries)) { if (it.action === "idle") it.action = "hold"; const h = add({ ...inHand(e.carries, it, { x: slot.x, y, s: slot.s }) }); if (at > 0 || from) h.enter = { at: Math.max(14, at) + 6, from: "fade", dur: 8 }; }
      if (kind === "figure" && slot.x > 960 && it.flip == null) it.flip = true; // faces the middle
      if (at > 0 || from) it.enter = { at: Math.max(14, at), from: from || (slot.x < 900 ? "left" : slot.x > 1020 ? "right" : kind === "figure" ? "bottom" : "pop"), dur: 14 };
      return it;
    };
    const arrange = (layout, who, at) => {
      if (!LAYOUTS.includes(layout)) return err(`layout "${layout}" — one of ${LAYOUTS.join(", ")}`);
      // v3 (round 2): someone who sits at a desk and is given another place GETS UP first — the desk slid across their
      // legs with them and the typewriter went back to its slot without them (dracula 154, an `enter` after a `type`)
      const stood = [];
      for (const w of who) { const it = find(w); if (it && it.act && bound(w).some((b) => b._role === "desk")) { stood.push(w); standUp(w, Math.max(8, at - 12)); swap(w, Math.max(3, at - 10), (n) => { delete n.act; delete n.labelDy; n.action = "idle"; }, 3, true); } }
      const sl = slots(layout, who.length);
      // an arrangement is exact, like `stage`: a thing it does not name leaves (dracula scene-108: eight things from
      // three arrangements standing in each other)
      for (const it of items.filter((x) => x._role === "entity" && !x._gone && !who.includes(x._ent))) { for (const b of bound(it._ent)) leave(b, Math.max(12, at)); leave(it, Math.max(12, at)); }
      who.forEach((ent, i) => ensure(ent, at + (at > 0 ? i * 8 : 0), sl[Math.min(i, sl.length - 1)]));
      // flow: the arrows of this arrangement (the ones of an earlier arrangement leave with it)
      for (const old of items.filter((x) => x._role === "flowArrow" && !x._gone)) leave(old, Math.max(12, at));
      if (layout === "flow" && who.length > 4) err(`layout "flow" holds at most four things (${who.length} given) — a mechanism a viewer can follow`);
      if (layout === "flow") for (let i = 0; i + 1 < Math.min(who.length, 4); i++) {
        const xa = sl[i].x, xb = sl[i + 1].x, when = Math.max(10, at + 14 + i * 8);
        add({ id: `flow${++seq}`, kind: "arrow", x: (xa + xb) / 2, y: V2L.midIcon, s: 1, o: 1, r: 0, enter: { at: when, from: "fade", dur: 10 }, _role: "flowArrow", _ttl: null });
      }
      // … and in their new place a crown sits exactly over their name plate again (where `crown` puts it)
      for (const w of new Set([...stood, ...who.filter((x) => recrownAfter.has(x))])) { const it = find(w), p = it && T.itemState(it, 1e6); if (p) for (const c of bound(w).filter((x) => x.kind === "crown")) key(c, { at: Math.max(at, 20) + 6, dur: 6, x: p.x, y: p.y - (figH(it) + TAG_H + 46) * p.s, s: p.s }); }
      st8.layout = layout; st8.who = who.slice();
    };
    /** the things as a small row of heads along the top: the middle of the stage is free for a timeline */
    // v2 (round 2): at 0.4–0.5 along the top a drawing was a smudge and the middle of the stage stood empty — the
    // things keep the MIDDLE at reading size and the timeline runs under them, above the subtitles
    const heads = (who, t0) => { const n = who.length;
      if (V2) { const s = n <= 2 ? 0.85 : n === 3 ? 0.75 : n === 4 ? 0.62 : 0.5; return who.forEach((w, i) => ensure(w, t0, { x: n === 1 ? 960 : 360 + (1200 * i) / (n - 1), s, mid: true })); }
      who.forEach((w, i) => ensure(w, t0, { x: n === 1 ? 960 : 420 + (1080 * i) / (n - 1), y: 230, s: n > 3 ? 0.4 : 0.5, head: true })); };
    // titles sit in a band at the top of what the camera sees; a new one replaces the old
    const title = (text, at, box) => {
      for (const t of items.filter((x) => x._role === "title" && !x._gone)) leave(t, at - 2);
      const size = titleSize(text);
      add({ id: `title${++seq}`, kind: "word", label: String(text).toUpperCase(), size, box: box === "accent" ? ACCENT : box === "red" ? RED : box === "ink" ? INK : undefined,
        screen: true, x: 960, y: 160, enter: { at: Math.max(12, at), from: box ? "pop" : "top", dur: 12 }, _role: "title" });
    };
    /** the same thing, differently, from `at`: the old one fades out as the new one fades in, in the same place */
    const swap = (ent, at, patch, fade = 3, carry = false) => {
      const old = find(ent), p = stateAt(old, at), next = clone(old); delete next.keys; delete next.exit; delete next.shake;
      // v2: a thing that is still on its way somewhere when it changes ARRIVES — the walk it had not finished goes on
      // (told 1.2 froze it mid-stage: dracula 141, Mina stopped between her old place and her new one)
      if (V2 || carry) { const rest = (old.keys || []).filter((k) => k.at > at).map((k) => ({ ...k })); if (rest.length) next.keys = rest; }
      Object.assign(next, { id: ent, x: p.x, y: p.y, s: p.s, o: 1, r: 0, enter: { at: Math.max(fade, at), from: "fade", dur: fade } });
      patch(next);
      old.id = `${ent}~${++seq}`; leave(old, at + (fade > 3 ? 2 : 1), fade > 3 ? fade - 2 : fade); items.splice(items.indexOf(old) + 1, 0, next);
      return next;
    };
    // THE PLACE BEHIND THE STAGE (told v2): one backdrop at a time; a new one fades in as the old one fades out
    const recrownAfter = new Set(); // v3: people who got up at a change of stage — their crown is set over the name plate again once they have their place
    const backdrops = [];
    const backdropOf = (id) => { const e = entities[id]; if (!e || e.kind !== "place") return null; return e.backdrop ? { id, wide: true, paths: e.backdrop.paths, viewBox: e.backdrop.viewBox } : Array.isArray(e.paths) && e.paths.length ? { id, paths: e.paths, viewBox: e.viewBox } : null; };
    // THE BOOK'S HOME (2026-11-18): the one place marked "home": true is the ground of this book — a stage that names
    // no place stands there, not on blank paper (a book of ideas has no castle; it has the room its ideas live in)
    const HOME = Object.keys(entities).find((id) => entities[id] && entities[id].home === true && backdropOf(id)) || null;
    if (!place && HOME) place = HOME;
    if (place && backdropOf(place)) backdrops.push(backdropOf(place));
    const setPlace = (id0, at) => {
      const id = id0 || HOME; // "the plain ground again" is the book's home when it has one
      if ((id || null) === place) return;
      if (id) { if (!entities[id]) return err(`at: "${id}" is not in entities.json`); if (!backdropOf(id)) return err(`at: "${id}" is not a place with a drawing (kind "place" + paths, or a "backdrop")`); }
      const cur = backdrops.find((b) => !b.exit); if (cur) cur.exit = { at: Math.max(12, at), dur: 12 };
      // a stage that starts at a place is there from its first frame (as its things are); a change of place fades
      if (id) backdrops.push({ ...backdropOf(id), ...(at > 0 || cur ? { enter: { at: Math.max(12, at), dur: 12 } } : {}) });
      place = id || null;
    };
    /** v3: a person leaves their desk — the desk goes, and the thing that stood on it returns to its own place */
    const standUp = (ent, when) => {
      for (const b of bound(ent).filter((x) => x._role === "desk")) {
        leave(b, Math.max(8, when), 8);
        // the crown that came down with the seated head goes back up
        if (b._seat) for (const c of bound(ent).filter((x) => x.kind === "crown")) key(c, { at: Math.max(12, when + 8), dur: 10, y: stateAt(c, when).y - b._seat });
        if (b._thing && find(b._thing) && find(b._thing)._role === "entity") move(b._thing, Math.max(20, when + 12), b._home, 16);
      }
    };
    /** a drawn thing in a person's hand; it belongs to the person (moves, shrinks and leaves with them) */
    const heldOf = (who) => bound(who).filter((b) => b._role === "held");
    const drawing = (ent) => { const e = entities[ent]; if (!e || drawnAs(e) !== "icon" || !(e.paths || []).length) return null; const st = (stateOf[ent] && e.states && e.states[stateOf[ent]]) || e; return { paths: st.paths, viewBox: st.viewBox }; };
    const inHand = (ent, holder, p) => { const h = handOf(holder, p); return { id: `${holder._ent}.held`, kind: "icon", ...drawing(ent), w: Math.round((holder.w || 260) * HELD.box), x: h.x, y: h.y, s: h.s, _bind: holder._ent, _role: "held", _ent: ent }; };
    /** the thing on its way to a hand: out of another hand, from where it stands on stage, or (a gift nobody held yet) from the giver */
    const toHand = (ent, to, at, from) => {
      const receiver = find(to), pt = stateAt(receiver, at), ht = handOf(receiver, pt), w = Math.round((receiver.w || 260) * HELD.box);
      for (const b of heldOf(to)) leave(b, Math.max(8, at - 4), 6);
      let h = from ? heldOf(from).find((b) => b._ent === ent) : null;
      if (!h) {
        const thing = find(ent);
        if (thing && thing._role === "entity") {
          // it stands on stage: the standing thing goes, the same drawing (no name plate) travels to the hand
          const p = stateAt(thing, at); for (const b of bound(ent)) leave(b, Math.max(8, at - 20), 6); leave(thing, Math.max(8, at - 14), 6); st8.who = st8.who.filter((x) => x !== ent);
          h = add({ id: `${to}.held`, kind: "icon", ...drawing(ent), w, x: p.x, y: p.y, s: (p.s * (thing.w || 312)) / w, enter: { at: Math.max(6, at - 16), from: "fade", dur: 6 }, _bind: to, _role: "held", _ent: ent });
        } else if (from) { const giver = find(from); h = add({ ...inHand(ent, giver, stateAt(giver, at)), enter: { at: Math.max(8, at - 26), from: "pop", dur: 8 } }); }
        else return null;
      }
      h.id = `${to}.held~${++seq}`; h._bind = to;
      key(h, { at, dur: 16, ease: "inout", x: ht.x, y: ht.y, s: ht.s });
      return h;
    };
    const st8 = { layout: (carried._layout) || null, who: (carried._who) || [], rows: carried._rows || 0, dates: carried._dates || 0 };

    // a title the last beat left is cleared early in this one: every beat starts with a clean band
    for (const t of items.filter((x) => x._role === "title")) leave(t, 24);
    // an extra that has had its beats leaves as this one starts
    for (const it of items.filter((x) => x._ttl != null && !x._gone && beatNo - x._born > x._ttl)) leave(it, 20);
    if (told.stage) {
      // THE STAGE LISTS EXACTLY WHO IS ON IT: whoever is not named leaves, with what belongs to them, and the rows of
      // the stage that is replaced go too (dracula scene-42: four things and all their labels from three stages)
      const who = told.stage.who || [], keep = new Set(who);
      const leaving = items.filter((x) => x._role === "entity" && !x._gone && !keep.has(x._ent));
      // v2 (round 2): ONE THING AT A TIME at a change of stage. In told 1.2 those who leave fade, those who stay
      // walk and those who come rise in the same 14 frames — dracula 1289 s: a faded Mina, a dimmed Jonathan and a
      // rising Seward on top of each other. Now: who leaves is gone by frame 8, then the others take their places,
      // and whoever stays comes back from a `dim` (a new stage shows its things as themselves).
      const out = V2 && leaving.length ? 8 : 14;
      for (const it of leaving) { for (const b of bound(it._ent)) leave(b, out, V2 ? 8 : 10); leave(it, out, V2 ? 8 : 10); }
      if (leaving.length || st8.who.some((w) => !keep.has(w))) { for (const it of items.filter((x) => x._role === "row" && !x._gone)) leave(it, out, V2 ? 8 : 10); st8.rows = 0; st8.dates = 0; }
      if (V2) for (const it of items.filter((x) => x._role === "entity" && !x._gone)) { const st = stateAt(it, 0); if (st.o < 0.99 || Math.abs(st.r) > 0.5) key(it, { at: 12, dur: 10, o: 1, r: 0, y: st.y - (st.o < 0.99 ? 35 : 0) }); }
      // v3: a new stage shows its people as themselves — whoever stays stands up from the verb they were left in
      // (seated at a desk, bent over a hole), and the desk goes
      for (const it of items.filter((x) => x._role === "entity" && !x._gone && x.act)) { for (const b of bound(it._ent).filter((x) => x._role === "desk")) { leave(b, 10, 8); if (b._seat) recrownAfter.add(it._ent); } /* the arrangement below gives the thing its place */ swap(it._ent, 12, (n) => { delete n.act; delete n.labelDy; n.action = "idle"; }, 3, true); }
      const wasOn = items.some((x) => x._role === "entity");
      arrange(told.stage.layout || "row", who, wasOn ? (V2 && leaving.length ? 26 : 14) : 0);
      // … and WHERE it is: a new stage without `at` is nowhere in particular (the plain ground)
      setPlace(told.stage.at || null, wasOn || place ? 14 : 0);
    }

    let cursor = 0;
    for (const ev of told.events || []) {
      if (!DOS.includes(ev.do)) { err(`"do": "${ev.do}" — one of ${DOS.join(", ")}`); continue; }
      let at = 0;
      if (ev.on != null) {
        const hit = wordFrame(words, ev.on, cursor) || wordFrame(words, ev.on, 0);
        if (!hit) { err(`"on": "${ev.on}" — the narrator does not say it in this beat (${words.map((w) => w.w).join(" ").slice(0, 160)})`); continue; }
        at = hit.frame; cursor = hit.index;
      } else if (Number.isFinite(ev.at)) at = Math.round(ev.at <= 1 ? ev.at * D : ev.at);
      at = Math.max(0, Math.min(D - 1, at));
      const who = Array.isArray(ev.who) ? ev.who : ev.who != null ? [ev.who] : [];
      const need = (n) => { if (who.length < n) { err(`${ev.do}: needs ${n === 1 ? "who" : `${n} names in who`}`); return false; } const missing = who.filter((w) => !find(w)); if (missing.length) { err(`${ev.do}: ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not on stage (enter or arrange first)`); return false; } return true; };
      const posOf = (ent) => stateAt(find(ent), at);
      switch (ev.do) {
        case "arrange": arrange(ev.layout || "row", who, at); break;
        case "enter": {
          if (ev.x != null) { for (const w of who) { ensure(w, at, { x: ev.x, y: ev.y, s: ev.s ?? 1 }, ev.from); if (!st8.who.includes(w)) st8.who.push(w); } break; }
          // someone joins: EVERYONE makes room (dracula: a newcomer was put in "the next slot" of a layout the others
          // were not standing in — a ship, a box, a port and a man on top of each other). A stage for one becomes a
          // stage for two, a stage for two becomes a row.
          const all = [...st8.who, ...who.filter((w) => !st8.who.includes(w))];
          if (st8.layout === "heads") { heads(all, at); st8.who = all; break; } // a timeline is up: the newcomer joins the row of heads
          const lay = st8.layout === "court" ? "court" : all.length === 1 ? "solo" : all.length === 2 ? "versus" : "row";
          arrange(lay, all, at); break; }
        case "exit": if (need(1)) for (const w of who) { leave(find(w), at); for (const b of bound(w)) leave(b, at); st8.who = st8.who.filter((x) => x !== w); } break;
        case "title": if (!ev.text) err("title: needs text"); else title(ev.text, at, ev.box); break;
        case "label": if (need(1) && ev.text) {
          const p = posOf(who[0]), live = bound(who[0]).filter((b) => b._role === "label"), ent0 = find(who[0]), fig = ent0.kind === "figure";
          const others = items.filter((x) => x._role === "entity" && !x._gone && x.id !== who[0]).map((x) => stateAt(x, at));
          const text = String(ev.text).toUpperCase();
          // BESIDE the thing (a person: at shoulder height, p.y is their feet) — on a side where it stays inside the
          // frame and does not lie across a neighbour (dracula: "EFFICIE…" cut by the edge, a label printed over VARNA)
          const tw = tileW(text), reach = (fig ? (ent0.w || 260) * 0.5 + 60 : 440) * p.s + (fig ? tw / 2 : 0);
          const free = (sd) => { const cx = p.x + sd * reach; return cx - tw / 2 >= EDGE && cx + tw / 2 <= 1920 - EDGE && !others.some((q) => Math.abs(q.x - cx) < tw / 2 + 130 * q.s); };
          const pref = p.x < 960 ? 1 : -1, side = free(pref) ? pref : free(-pref) ? -pref : 0;
          if (side) {
            // at most two labels beside a thing: a third replaces the oldest, in its place
            while (live.length >= LABELS_PER_THING) leave(live.shift(), Math.max(10, at - 2));
            const slot = [0, 1].find((k) => !live.some((b) => b._slot === k)) ?? 0;
            add({ id: `${who[0]}.label${++seq}`, kind: "tile", label: text, color: ent0.color || INK, size: 38, x: p.x + side * reach, y: (fig ? p.y - figH(ent0) * 0.62 * p.s : p.y - 70 * p.s) + slot * 110, enter: { at: Math.max(12, at), from: side > 0 ? "right" : "left", dur: 12 }, _bind: who[0], _role: "label", _slot: slot });
            break;
          }
          // NO ROOM BESIDE (a row of things): the label goes UNDER its thing, one per thing, neighbours on alternate
          // lines. People step up and back first so there is a band under their feet above the subtitles.
          for (const b of live) leave(b, Math.max(10, at - 2));
          if (fig) for (const g of items.filter((x) => x._role === "entity" && !x._gone && x.kind === "figure")) { const q = stateAt(g, at); if (q.y > UNDER_FEET + 1) move(g._ent, Math.max(16, at - 6), { y: UNDER_FEET, s: q.s * 0.86 }, 16); }
          let q = fig ? { ...p, y: Math.min(p.y, UNDER_FEET) } : p; const tw2 = tileW(text, 32), par = Math.max(0, st8.who.indexOf(who[0])) % 2;
          // v2 (round 2): a THING too low or too large for a label under its name plate rises first — the label was
          // clamped up ONTO the plate ("CARBON PAPER TRANSFER" across "PORTABLE TYPEWRITER")
          if (V2 && !fig && q.y + footOff(ent0) * q.s > V2L.foot + 1) { const y = V2L.foot - footOff(ent0) * q.s; move(who[0], Math.max(16, at - 6), { y }, 16); q = { ...q, y }; }
          const base = fig ? q.y + 52 : q.y + (ent0.kind === "emblem" ? 180 : (ent0.w || 312) / 2 + 66) * q.s + 56;
          add({ id: `${who[0]}.label${++seq}`, kind: "tile", label: text, color: ent0.color || INK, size: 32, x: Math.max(EDGE + tw2 / 2, Math.min(1920 - EDGE - tw2 / 2, q.x)), y: Math.min(SAFE.bottom - 40, base + par * (fig ? 70 : 84)), enter: { at: Math.max(12, at), from: "bottom", dur: 12 }, _bind: who[0], _role: "label", _slot: 0, _under: fig || undefined, ...(V2 && !fig ? { _below: par * 84 } : {}) });
        } break;
        case "crown": if (need(1)) {
          const ent0 = find(who[0]), k = ent0.kind; let p = posOf(who[0]);
          // a person's crown goes ABOVE the name plate; if that column would leave the frame, the person steps down a size
          if (k === "figure") { const room = fitS(ent0, p.y, { crown: true, top: FIG_TOP_HARD }); if (p.s > room + 0.005) { move(who[0], Math.max(14, at - 4), { s: room }, 14); p = { ...p, s: room }; } }
          add({ id: `${who[0]}.crown`, kind: "crown", x: p.x, y: p.y - (k === "figure" ? figH(ent0) + TAG_H + 46 : 202) * p.s, s: p.s, enter: { at: Math.max(12, at), from: "top", dur: 12 }, _bind: who[0], _role: "deco" }); } break;
        case "uncrown": if (need(1)) for (const b of bound(who[0]).filter((x) => x.kind === "crown")) leave(b, at); break;
        case "world": if (need(1)) for (const w of who) { const p = posOf(w); items.unshift({ id: `${w}.world`, kind: "planet", color: find(w).color || colorOf(w), size: 290, x: p.x, y: p.y, s: p.s, enter: { at: Math.max(14, at), from: "pop", dur: 14 }, _bind: w, _role: "world" }); } break;
        case "cross": { let p; if (who.length >= 2 && need(2)) { const a = midOf(find(who[0]), posOf(who[0])), b = midOf(find(who[1]), posOf(who[1])); p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; add({ id: `dash${++seq}`, kind: "dash", x: a.x + 180, y: a.y, x2: b.x - 180, y2: b.y, drawFrom: Math.max(0, at - 30), drawTo: at, enter: { at: Math.max(2, at - 30), from: "fade", dur: 2 }, _role: "fx" }); } else if (need(1)) p = midOf(find(who[0]), posOf(who[0])); if (p) add({ id: `cross${++seq}`, kind: "cross", color: ACCENT, x: p.x, y: p.y, enter: { at: Math.max(10, at), from: "pop", dur: 8 }, _role: "fx", ...(who.length === 1 ? { _bind: who[0] } : {}) }); break; }
        case "stamp": if (need(1) && ev.text) { const p = midOf(find(who[0]), posOf(who[0])); add({ id: `${who[0]}.stamp`, kind: "word", label: String(ev.text).toUpperCase(), size: 104 * p.s, box: RED, r: -12, x: p.x, y: p.y, enter: { at: Math.max(8, at), from: "pop", dur: 7 }, _bind: who[0], _role: "deco", _ttl: TTL_DECO }); find(who[0]).shake = { at, dur: 18 }; } break;
        case "cover": if (need(1)) for (const w of who) { const p = posOf(w); add({ id: `${w}.cover`, kind: "bar", w: (find(w).kind === "figure" ? 170 : 280) * p.s, h: (find(w).kind === "figure" ? 44 : 64) * p.s, x: p.x, y: eyesOf(find(w), p), enter: { at: Math.max(12, at), from: "top", dur: 12 }, _bind: w, _role: "deco", _ttl: TTL_DECO }); } break;
        case "uncover": if (need(1)) for (const w of who) for (const b of bound(w).filter((x) => x.kind === "bar")) leave(b, at); break;
        case "dim": if (need(1)) for (const w of who) { const p = posOf(w); key(find(w), { at, dur: 14, o: 0.5, r: p.x < 960 ? -9 : 9, y: p.y + 35 }); } break;
        case "restore": if (need(1)) for (const w of who) { const e = entities[w], p = posOf(w); key(find(w), { at, dur: 14, o: 1, r: 0, y: p.y - (p.o < 0.99 ? 35 : 0) }); void e; } break;
        case "grow": if (need(1)) for (const w of who) { const g = find(w), p = posOf(w); let to = p.s * (ev.to || 1.25);
          // a person grows only as far as the frame lets them (their name must stay readable)
          // v2: a DRAWING grows only as far as the stage lets it (two `grow`s made a typewriter 1.56× — under the title,
          // over the subtitles, no room for a label), and it rises as it grows so that its name plate — and a label
          // under the plate — stay above the subtitle band (dracula: things under the subtitle line 10 → 22 without this)
          let lift = {};
          if (V2 && g.kind === "icon") { to = Math.min(to, Math.max(p.s, V2L.maxTall / ((g.w || 312) + 66))); if (p.y + footOff(g) * to > V2L.foot) lift = { y: V2L.foot - footOff(g) * to }; }
          move(w, at, { ...lift, s: g.kind === "figure" ? Math.min(to, Math.max(p.s, fitS(g, p.y, { crown: bound(w).some((b) => b.kind === "crown"), top: FIG_TOP_HARD }))) : to }, 14, "back"); } break;
        case "shake": if (need(1)) for (const w of who) find(w).shake = { at, dur: 20, amp: 14 }; break;
        case "apart": if (need(2)) { const a = posOf(who[0]), b = posOf(who[1]), l = a.x <= b.x ? 0 : 1; move(who[l], at, { x: 440 }); move(who[1 - l], at, { x: 1480 }); } break;
        case "together": case "collide": if (need(2)) {
          const a = posOf(who[0]), b = posOf(who[1]), l = a.x <= b.x ? 0 : 1, gap = 220 * Math.max(a.s, b.s) + 20;
          for (const w of who) for (const wd of bound(w).filter((x) => x._role === "world")) leave(wd, Math.max(16, at - 14), 16);
          move(who[l], at, { x: 960 - gap }, 26); move(who[1 - l], at, { x: 960 + gap }, 26);
          if (ev.do === "together") break;
        } else break;
        // falls through: a collision is a meeting and a burst
        case "burst": { let p = { x: 960, y: 450 }; if (who.length >= 2 && find(who[0]) && find(who[1])) { const a = midOf(find(who[0]), posOf(who[0])), b = midOf(find(who[1]), posOf(who[1])); p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 20 }; for (const w of who) find(w).shake = { at, dur: 22, amp: 16 }; } add({ id: `burst${++seq}`, kind: "burst", color: "#F2C84B", x: p.x, y: p.y, s: 1.2, enter: { at: Math.max(8, at), from: "pop", dur: 8 }, _role: "fx" }); break; }
        case "coins": { const p = who.length && find(who[0]) ? posOf(who[0]) : { x: 960, y: 450 }, n = Math.max(1, Math.min(8, ev.n || 6)); for (let i = 0; i < n; i++) { const dx = ((i + 0.5) / n - 0.5) * 900, dy = 320 + ((i * 37) % 60); add({ id: `coin${++seq}`, kind: "coin", x: p.x, y: p.y, s: 1.4, enter: { at: Math.max(6, at + i * 2), from: "pop", dur: 6 }, keys: [{ at: at + 28 + i * 3, dur: 24, x: p.x + dx, y: Math.min(SAFE.bottom - 40, p.y + dy) }], _role: "fx" }); } break; }
        case "pair": {
          if (st8.who.length < 2) { err("pair: needs two things on stage (stage.who) — they become the two columns"); break; }
          if (st8.layout !== "pairs") { arrange("pairs", st8.who.slice(0, 2), Math.max(22, at - 16)); for (const w of st8.who.slice(0, 2)) for (const b of bound(w)) leave(b, Math.max(10, at - 20)); for (const f of items.filter((x) => x._role === "fx" && !x._gone)) leave(f, Math.max(10, at - 20)); }
          const y = 440 + st8.rows * 112, [a, b] = st8.who; st8.rows++;
          for (const r0 of items.filter((x) => x._role === "row" && !x._gone)) r0._born = beatNo; // a set of rows lives while it grows
          if (y > SAFE.bottom - 60) { warnings.push({ beat: beat.id, message: `pair "${ev.left}": a fifth row would sit under the subtitles — start a new stage` }); break; }
          const row = (id, text, x, color, from, f) => add({ id, kind: "tile", label: String(text).toUpperCase(), color, size: 46, x, y, enter: { at: Math.max(12, f), from, dur: 12 }, _role: "row" });
          row(`row${++seq}a`, ev.left, 560, find(a).color || INK, "left", at);
          const rf = ev.onRight ? (wordFrame(words, ev.onRight, cursor) || { frame: at + 30 }).frame : at + 30;
          add({ id: `row${seq}v`, kind: "word", label: "VS", size: 46, x: 960, y: y + 15, enter: { at: Math.max(12, Math.round((at + rf) / 2)), from: "pop", dur: 8 }, _role: "row" });
          row(`row${seq}b`, ev.right, 1360, find(b).color || INK, "right", rf);
          break; }
        case "date": { if (!ev.text) { err("date: needs text"); break; }
          // a timeline needs the middle of the stage: the things step up into a small row of heads, as for `pair`
          // (dracula: date tiles printed across the ship and the port)
          if (st8.layout !== "heads" && st8.layout !== "pairs" && st8.who.length) {
            heads(st8.who, Math.max(22, at - 16));
            for (const w of st8.who) for (const b of bound(w).filter((x) => x._role === "label")) leave(b, Math.max(10, at - 20));
            for (const f of items.filter((x) => x._role === "fx" && !x._gone)) leave(f, Math.max(10, at - 20));
            st8.layout = "heads";
          }
          if (!items.some((x) => x.id === "timeline" && !x._gone)) add({ id: "timeline", kind: "dash", x: 280, y: V2 ? V2L.lineY : 640, x2: 1640, y2: V2 ? V2L.lineY : 640, drawFrom: Math.max(0, at - 40), drawTo: Math.max(4, at - 4), enter: { at: Math.max(2, at - 40), from: "fade", dur: 2 }, _role: "row" });
          const x = ev.side === "left" ? 500 : ev.side === "right" ? 1340 : [960, 500, 1340][st8.dates % 3]; st8.dates++;
          for (const r0 of items.filter((x) => x._role === "row" && !x._gone)) r0._born = beatNo;
          add({ id: `date${++seq}`, kind: "tile", label: String(ev.text).toUpperCase(), color: ev.color === "red" ? RED : INK, size: 44, x, y: V2 ? V2L.dateY : 540, enter: { at: Math.max(12, at), from: "top", dur: 12 }, _role: "row" }); break; }
        case "focus": if (need(1)) { const p = posOf(who[0]), s = ev.zoom || 1.3; 
          // the push-in keeps the thing's foot (a person's feet, a thing's name plate) above the subtitle band
          // (dracula: "PORTABLE TYPEWRITER" pushed under the captions by the zoom)
          const g = find(who[0]), foot = g.kind === "figure" ? p.y : g.kind === "icon" ? p.y + ((g.w || 312) / 2 + 66) * p.s : p.y + 180 * p.s;
          Object.assign(curCam, { x: p.x + (p.x < 960 ? 200 : -200), y: Math.max(Math.min(p.y, 520), foot - (SAFE.bottom - 540) / s), s }); camKeys.push({ at: Math.max(22, at), dur: 22, ease: "inout", ...curCam }); } break;
        case "wide": Object.assign(curCam, { x: 960, y: 540, s: 1 }); camKeys.push({ at: Math.max(24, at), dur: 24, ease: "inout", ...curCam }); break;
        case "clear": { const what = ev.what || "extras", roles = what === "titles" ? ["title"] : what === "labels" ? ["label"] : what === "rows" ? ["row"] : ["title", "label", "row", "fx", "deco"]; for (const it of items.filter((x) => roles.includes(x._role) && !x._gone)) leave(it, at); if (roles.includes("row")) { st8.rows = 0; st8.dates = 0; } break; }
        case "change": if (need(1)) {
          const w0 = who[0], cur = find(w0), e0 = entities[w0];
          // (told v1 let an author write a person's `change` on a thing — dracula has three: "the ship reads" — and
          // drew the thing again unchanged. That still compiles, as it did, with a warning; merge asks for a state.)
          if (cur.kind !== "figure" && ev.state == null) warnings.push({ beat: beat.id, message: `change: "${w0}" is a thing — action / look / holds are a person's and do nothing here; a drawn thing changes by "state"` });
          if (cur.kind !== "figure" && ev.state != null) {
            // A DRAWING CHANGES BY STATE (told v2): the same thing in the same place, drawn as what it has become
            const st = ev.state === "base" ? e0 : ev.state && e0.states && e0.states[ev.state];
            if (cur.kind !== "icon" || !st) { err(`change: "${w0}" ${cur.kind !== "icon" ? "is an emblem — only a drawn thing has states" : `has no state "${ev.state}" — ${Object.keys(e0.states || {}).length ? `one of ${["base", ...Object.keys(e0.states)].join(", ")}` : "none is drawn (entities.json states)"}`}`); break; }
            if (ev.state === "base") delete stateOf[w0]; else stateOf[w0] = ev.state;
            // round 2: the change is an EVENT, not a cut — the thing is knocked (one knock that dies away, told.ts
            // `shake`: no loop) and what it was gives way to what it has become over 12 frames, landing on the word
            const when = Math.max(14, at), knock = { at: when - 12, dur: 28, amp: 14 };
            const becomes = swap(w0, when, (next) => { next.paths = st.paths; next.viewBox = st.viewBox; if (ev.state === "base") delete next.state; else next.state = ev.state; if (ev.label) next.label = String(ev.label).toUpperCase(); }, 12);
            cur.shake = { ...knock }; becomes.shake = { ...knock };
            break;
          }
          // the same person, differently: another action, a blindfold, something in the hand
          const own = typeof ev.holds === "string" && drawing(ev.holds), empty = ev.holds === null || ev.holds === "none";
          if (typeof ev.holds === "string" && entities[ev.holds] && !own) { err(`change: "${ev.holds}" has no drawing to hold (entities.json paths) — or name one of the engine's hand props`); break; }
          if (ev.action && cur.act) standUp(w0, at);
          const next = swap(w0, at, (n) => {
            if (ev.action) { n.action = ev.action; delete n.act; } if (ev.label) n.label = String(ev.label).toUpperCase();
            if (ev.look) n.variant = { ...(n.variant || {}), ...ev.look };
            if (own || empty) { delete n.holds; if (own && !ev.action) n.action = "hold"; } else if (ev.holds) n.holds = ev.holds;
          });
          if (own || empty) for (const b of heldOf(w0)) leave(b, Math.max(8, at), 6);
          if (own) add({ ...inHand(ev.holds, next, posOf(w0)), enter: { at: Math.max(8, at), from: "pop", dur: 8 } });
        } break;
        // HAND TO HAND (told v2): the thing leaves the giver's hand — or the place where it stands — and lands in the
        // other's hand ON THE WORD; the giver reaches out before it, the receiver holds it from then on
        case "give": if (need(2)) {
          const [a, b] = who;
          if (find(a).kind !== "figure" || find(b).kind !== "figure") { err("give: who is [the person who gives, the person who gets]"); break; }
          if (!drawing(ev.what)) { err(`give: "what" is a DRAWN thing of entities.json${ev.what ? ` ("${ev.what}" is not)` : ""}`); break; }
          if (at > 22) swap(a, at - 16, (n) => { n.action = "offer"; delete n.holds; });
          toHand(ev.what, b, at, a);
          swap(b, at, (n) => { n.action = "hold"; delete n.holds; });
        } break;
        case "take": if (need(1)) {
          if (find(who[0]).kind !== "figure") { err("take: who is the person who takes it"); break; }
          if (!drawing(ev.what) || !find(ev.what)) { err(`take: "what" is a drawn thing that stands on stage${ev.what ? ` ("${ev.what}" does not)` : ""}`); break; }
          toHand(ev.what, who[0], at, null);
          swap(who[0], at, (n) => { n.action = "hold"; delete n.holds; });
        } break;
        // THINGS THAT HAPPEN (2026-11-20, the first real book: "he throws the mirror out of the window and it shatters",
        // "the bottle falls" were a thing standing still). A drawn thing leaves a hand - or the place where it stands -
        // in ONE arc that lands on the word: thrown off the stage, at someone / something, or to the ground; dropped
        // straight down. With "state" it lies there as what it has become (entities.json states). One motion, no loop.
        case "throw": case "drop": if (need(1)) {
          const a = who[0], P = find(a), isThrow = ev.do === "throw", to = ev.to == null ? (isThrow ? "off" : "ground") : ev.to;
          if (!P || P.kind !== "figure") { err(`${ev.do}: "who" is the PERSON who ${isThrow ? "throws" : "drops"} it (on stage)`); break; }
          const e0 = entities[ev.what], base = drawing(ev.what);
          if (!base) { err(`${ev.do}: "what" is a DRAWN thing of entities.json${ev.what ? ` ("${ev.what}" is not)` : ""}`); break; }
          if (!isThrow && to !== "ground") { err('drop: a dropped thing falls to the ground (no "to")'); break; }
          if (isThrow && to !== "off" && to !== "ground" && !find(to)) { err(`throw: "to" is "off", "ground" or someone / something on stage ("${to}" is not)`); break; }
          if (isThrow && to === a) { err("throw: a person does not throw a thing at themselves"); break; }
          const st = ev.state != null ? (e0.states && e0.states[ev.state]) : null;
          if (ev.state != null && !st) { err(`${ev.do}: "${ev.what}" has no state "${ev.state}" (entities.json states)`); break; }
          if (ev.state != null && to !== "ground") { err(`${ev.do}: "state" is how the thing LIES after it lands - only with "to": "ground"`); break; }
          const when = Math.max(at, 26), pp = stateAt(P, when), hp = handOf(P, pp), w = Math.round((P.w || 260) * HELD.box);
          // the thing in flight: out of this hand, or picked from where it stands on stage
          let h = heldOf(a).find((b) => b._ent === ev.what);
          const standing = !h && find(ev.what) && find(ev.what)._role === "entity" ? find(ev.what) : null;
          if (h) { for (const k of ["_bind"]) delete h[k]; h._role = "fx"; h.id = `${ev.what}.thrown~${++seq}`; }
          else if (standing) { const p = stateAt(standing, when); for (const b of bound(ev.what)) leave(b, Math.max(8, when - 26), 6); leave(standing, Math.max(8, when - 22), 6); st8.who = st8.who.filter((x) => x !== ev.what);
            h = add({ id: `${ev.what}.thrown~${++seq}`, kind: "icon", ...base, w, x: p.x, y: p.y, s: (p.s * (standing.w || 312)) / w, enter: { at: Math.max(6, when - 24), from: "fade", dur: 6 }, _role: "fx", _ent: ev.what });
            key(h, { at: when - 14, dur: 8, ease: "inout", x: hp.x, y: hp.y, s: hp.s }); }
          else h = add({ id: `${ev.what}.thrown~${++seq}`, kind: "icon", ...base, w, x: hp.x, y: hp.y, s: hp.s, enter: { at: Math.max(6, when - 22), from: "pop", dur: 6 }, _role: "fx", _ent: ev.what });
          // the person: the arm goes out before the word, comes back after it
          if (isThrow) swap(a, Math.max(4, when - 16), (n) => { n.action = "offer"; delete n.holds; delete n.act; });
          else swap(a, Math.max(4, when - 10), (n) => { n.action = "idle"; delete n.holds; delete n.act; });
          // in the air a hand-sized thing is a dot: it grows as it leaves the hand (first clip, 2026-11-20), and what
          // lies on the ground is drawn large, clear of the subtitle band
          const big = hp.s * 1.9, lie = hp.s * 2.3, half = (w * lie) / 2;
          const T0 = to !== "off" && to !== "ground" ? find(to) : null, tp = T0 ? midOf(T0, stateAt(T0, when)) : null;
          const dir = T0 ? (tp.x >= pp.x ? 1 : -1) : (ev.side === "left" ? -1 : ev.side === "right" ? 1 : P.flip ? -1 : pp.x > 1180 ? -1 : 1), ground = Math.min(SAFE.bottom - half - 12, pp.y - 50 * pp.s);
          const dest = !isThrow ? { x: hp.x + 30 * dir, y: ground } : T0 ? { x: tp.x - dir * 40, y: tp.y } : to === "ground" ? { x: Math.max(160, Math.min(1760, hp.x + dir * 430)), y: ground } : { x: dir > 0 ? 2160 : -240, y: hp.y - 60 };
          const spin = dir * (isThrow ? 300 : 35);
          if (isThrow) { key(h, { at: when - 6, dur: 7, ease: "out", x: hp.x + (dest.x - hp.x) * 0.5, y: Math.min(hp.y, dest.y) - 150 * pp.s, r: spin * 0.5, s: big }); key(h, { at: when, dur: 6, ease: "inout", x: dest.x, y: dest.y, r: spin, s: to === "ground" ? lie : big }); }
          else key(h, { at: when, dur: 9, ease: "inout", x: dest.x, y: dest.y, r: spin, s: lie });
          if (T0) { T0.shake = { at: when, dur: 18, amp: 12 }; leave(h, when + 8, 6); }
          else if (to === "off") leave(h, when + 4, 4);
          else {
            // it lies where it fell: as itself, or as what it has become - a knock that dies away (no loop)
            h.shake = { at: when, dur: 16, amp: 10 }; h._role = "deco"; h._ttl = TTL_DECO;
            if (st) { leave(h, when + 6, 6); stateOf[ev.what] = ev.state; add({ id: `${ev.what}.fallen~${++seq}`, kind: "icon", paths: st.paths, viewBox: st.viewBox, w, x: dest.x, y: dest.y, s: lie, r: 0, enter: { at: when, from: "fade", dur: 6 }, shake: { at: when, dur: 16, amp: 10 }, _role: "deco", _ttl: TTL_DECO, _ent: ev.what, state: ev.state }); }
          }
          swap(a, when + 12, (n) => { n.action = "idle"; });
        } break;
        case "at": setPlace(who[0] || null, at); break;
        // ── told v3: THE PERSON PLAYS THE VERB ───────────────────────────────────────────────────────────────────────
        case "act": {
          const verb = ev.verb, spec = VERBS[verb], a = who[0], tgt = ev.target;
          if (!spec) { err(`act: verb "${verb}" — one of ${Object.keys(VERBS).join(", ")}`); break; }
          if (!a || !entities[a] || entities[a].kind !== "person") { err(`act (${verb}): "who" is the PERSON who does it`); break; }
          if (spec.need && tgt == null) { err(`act (${verb}): needs "target" — ${spec.target === "person" ? "the person it is done to" : spec.target === "thing" ? "the drawn thing it is done with" : "who or what it is turned to"}`); break; }
          if (tgt != null && !entities[tgt]) { err(`act (${verb}): target "${tgt}" is not in entities.json`); break; }
          if (tgt != null && spec.target === "person" && entities[tgt].kind !== "person") { err(`act (${verb}): target "${tgt}" is not a person`); break; }
          if (tgt != null && spec.target === "thing" && !drawing(tgt)) { err(`act (${verb}): target "${tgt}" is not a drawn thing (entities.json paths)`); break; }
          if (tgt === a) { err(`act (${verb}): a person does not ${verb} themselves`); break; }
          const held = (ent) => heldOf(a).find((h) => h._ent === ent);
          // who must already stand on stage: the one who acts (except `come`) and the other (except a thing that is read)
          if (verb !== "come" && !find(a)) { err(`act (${verb}): ${a} is not on stage (stage / enter first — or the verb "come")`); break; }
          if (tgt != null && !find(tgt) && !(verb === "read" && drawing(tgt))) { err(`act (${verb}): ${tgt} is not on stage`); break; }
          const T0 = tgt != null ? find(tgt) : null;
          const facing = (n, selfX, otherX) => { if (otherX < selfX - 1) n.flip = true; else if (otherX > selfX + 1) delete n.flip; };
          const play = (ent, v, when, patch) => swap(ent, Math.max(3, when - (TA.ACT_LEAD[v] || 0) - 2), (n) => { n.act = { verb: v, at: when }; n.action = "idle"; delete n.holds; delete n.labelDy; if (patch) patch(n); }, 3, true);
          const emptyHands = (ent, when) => { for (const b of heldOf(ent)) leave(b, Math.max(8, when), 6); };
          const sOf = (ent, f) => stateAt(find(ent), f);
          switch (verb) {
            case "hit": case "bite": {
              // close the distance the verb needs, land it on the word; the other is struck / bitten on the same word
              const when = Math.max(at, ACT_MIN), pa = sOf(a, when), pt = sOf(tgt, when), dir = pt.x >= pa.x ? 1 : -1;
              const dest = pt.x - dir * REACH[verb] * Math.max(pa.s, pt.s);
              standUp(a, when - 20); emptyHands(a, when - 20);
              if (Math.abs(pa.x - dest) > 12) move(a, when - TA.ACT_LEAD[verb], { x: dest }, 16);
              play(a, verb, when, (n) => { facing(n, dest, pt.x); n.labelDy = PLATE_UP; });
              standUp(tgt, when);
              swap(tgt, when, (n) => { n.act = { verb: verb === "hit" ? "struck" : "bitten", at: when }; n.action = "idle"; delete n.labelDy; facing(n, pt.x, dest); }, 3, true);
              find(tgt).shake = { at: when, dur: 18, amp: verb === "hit" ? 14 : 8 };
              // the one it is done to is drawn IN FRONT: the head (and hat) that leans over them would otherwise cover
              // their name plate (round 2, first clips: "LUCY WES▮ENRA" under a top hat)
              for (const it of items.filter((x) => x._ent === tgt && x._role === "entity")) { items.splice(items.indexOf(it), 1); items.push(it); }
              break; }
            case "chase": {
              // the other runs for the far side, the chaser after them — both RUN while they travel and stand when they arrive
              const pa = sOf(a, at), pt = sOf(tgt, at), dir = pt.x >= pa.x ? 1 : -1, destT = dir > 0 ? 1640 : 280, destA = destT - dir * REACH.chase * Math.max(pa.s, pt.s);
              standUp(a, at); standUp(tgt, at); emptyHands(a, at);
              const run = (ent, to, dur, selfX) => { swap(ent, Math.max(3, at), (n) => { n.action = "run"; delete n.act; n._stopAfter = true; facing(n, selfX, selfX + dir * 100); }, 3, true); move(ent, at + dur, { x: to }, dur - 2); };
              // (first lab clip: 280 px to the side read as two people shuffling) the one who flees runs OFF the stage
              // and is gone; the chaser runs most of the way after them and stops, looking where they went
              run(tgt, dir > 0 ? 2140 : -220, 44, pt.x);
              for (const b of bound(tgt)) leave(b, at + 30, 8);
              leave(find(tgt), at + 46, 6); st8.who = st8.who.filter((x) => x !== tgt);
              run(a, destA, 50, pa.x);
              if (at + 58 < D - 2) swap(a, at + 52, (n) => { n.action = "idle"; delete n._stopAfter; n.act = { verb: "look", at: at + 60 }; }, 3, true);
              break; }
            case "point": {
              const pa = sOf(a, at), pt = sOf(tgt, at);
              // the arm that points is the free one: what the person carries is put away for the gesture (round 1: a
              // journal at the chest hid the point — "standing, holding an open notebook")
              emptyHands(a, at - 12);
              swap(a, Math.max(3, at - 10), (n) => { n.action = "point"; delete n.act; delete n.labelDy; facing(n, pa.x, pt.x); }, 3, true);
              break; }
            case "hide": {
              // behind the thing, a little to the far side, DOWN: the head shows over its edge; drawn behind it
              const when = Math.max(at, ACT_MIN), pa = sOf(a, when), pt = sOf(tgt, when), side = pa.x >= pt.x ? 1 : -1;
              const wide = T0.kind === "figure" ? (T0.w || 260) * 0.5 : (T0.w || 312) * 0.3;
              // (first lab clip: standing on the thing's ground the whole upper body showed) only the HEAD AND SHOULDERS
              // rise over its top edge — the rest of the person is behind it
              // (second lab clip: still the whole chest above the box — a person is taller than a crate) behind a THING
              // the person is also a size smaller (further away), so small that from the shoulders down they fit
              // inside its outline: top of the thing + 76 % of their height = their feet, above the thing's foot
              const boxTop = pt.y - ((T0.w || 312) / 2) * pt.s, boxH = (T0.w || 312) * pt.s, H0 = figH(find(a));
              const s2 = T0.kind === "figure" ? pa.s : Math.min(pa.s * 0.86, (boxH * 0.92) / (H0 * 0.76));
              const y = T0.kind === "figure" ? pt.y : boxTop + H0 * s2 * 0.76;
              standUp(a, when - 20); emptyHands(a, when - 20);
              move(a, when - TA.ACT_LEAD.hide, { x: pt.x + side * wide * pt.s, y, s: s2 }, 16);
              const n2 = play(a, "hide", when, (n) => facing(n, pt.x + side, pt.x - side * 400)); // looks out past the thing, toward the stage
              for (const it of items.filter((x) => x._ent === a && x._role === "entity")) { items.splice(items.indexOf(it), 1); items.splice(items.indexOf(T0), 0, it); } // behind what hides them
              void n2; break; }
            case "dig": case "fall": {
              const when = Math.max(at, verb === "dig" && T0 ? ACT_MIN : at), pa = sOf(a, when);
              standUp(a, when - 20); emptyHands(a, when - 20);
              if (verb === "fall") { swap(a, Math.max(3, at - 8), (n) => { n.action = "falling"; delete n.act; }, 3, true); if (at + 20 < D - 2) swap(a, at + 14, (n) => { n.action = "collapsed"; }, 3, true); else find(a)._lands = true; break; }
              let x = pa.x;
              let toward = 1;
              if (T0) { const pt = sOf(tgt, when), side = pa.x >= pt.x ? 1 : -1; x = pt.x + side * REACH.dig * Math.max(pa.s, pt.s); toward = -side; if (Math.abs(pa.x - x) > 12) move(a, when - TA.ACT_LEAD.dig, { x }, 16); play(a, "dig", when, (n) => facing(n, x, pt.x)); }
              else play(a, "dig", when);
              // the earth and the spade: without them a bent figure read as someone falling (first lab clip)
              const mw = Math.round((find(a).w || 260) * 0.9);
              add({ id: `${a}.dig`, kind: "icon", paths: DIG_PATHS, w: mw, x: x + toward * mw * 0.62 * pa.s, y: pa.y - mw * 0.36 * pa.s, s: pa.s, enter: { at: Math.max(10, when - 8), from: "fade", dur: 8 }, _bind: a, _role: "desk" });
              break; }
            case "type": case "write": {
              // SEATED AT IT: a desk in front of the person, the thing on the desk under their hands — not a person
              // standing beside a typewriter (dracula, "TYPING IN MANIFOLD")
              const when = Math.max(at, ACT_MIN), A0 = find(a), hgt = Math.min(1, (A0.variant && A0.variant.height) || 1), unit = ((A0.w || 260) / 400) * hgt;
              standUp(a, when - 30); emptyHands(a, when - 20);
              // round 2 — THE TYPIST IS THE SUBJECT: as large as the stage lets a seated person be (seated, the column
              // is shorter by the seat drop), the name plate and a crown come DOWN with the head, the desk is at lap
              // height and the thing on it leaves head, shoulders and arms free
              let pa = sOf(a, when);
              const crowned = bound(a).some((b) => b.kind === "crown"), drop = TA.SEAT_DROP * unit;
              const sA = Math.min(1.12, (pa.y - FIG_TOP) / (figH(A0) - drop + TAG_H + (crowned ? CROWN_H : 0)));
              if (sA > pa.s * 1.03) { move(a, Math.max(20, when - TA.ACT_LEAD[verb] - 4), { s: sA }, 14); pa = { ...pa, s: sA }; }
              const k = unit * pa.s, rigY = (y) => pa.y - (900 - y) * k;
              const lead = play(a, verb, when, (n) => { n.labelDy = Math.round(drop); });
              for (const c of bound(a).filter((x) => x.kind === "crown")) key(c, { at: when - 2, dur: 12, y: stateAt(c, when).y + drop * pa.s });
              const dw = (A0.w || 260) * TA.DESK.deskW * pa.s, dh = TA.DESK.deskH * (pa.s * 1.2);
              const home = T0 && T0._role === "entity" ? (({ x, y, s: sc }) => ({ x, y, s: sc }))(sOf(tgt, when)) : null;
              items.splice(items.indexOf(lead) + 1, 0, { id: `${a}.desk`, kind: "bar", w: dw, h: dh, x: pa.x, y: rigY(TA.DESK.topY) + dh / 2, enter: { at: Math.max(10, when - 12), from: "fade", dur: 8 }, _bind: a, _role: "desk", _born: beatNo, _seat: drop * pa.s, ...(home ? { _thing: tgt, _home: home } : {}) });
              if (T0 && T0._role === "entity") {
                const sT = ((A0.w || 260) * (verb === "type" ? TA.DESK.thingW : 0.5) * pa.s) / (T0.w || 312);
                move(tgt, Math.max(20, when - 6), { x: pa.x, y: rigY(TA.DESK.topY) - (T0.w || 312) * 0.36 * sT, s: sT }, 16);
                const all = items.filter((x) => x._ent === tgt && x._role === "entity"); for (const it of all) { items.splice(items.indexOf(it), 1); items.splice(items.findIndex((x) => x.id === `${a}.desk`) + 1, 0, it); } // on the desk, in front of the person
                for (const b of bound(tgt).filter((x) => x._role === "label")) leave(b, Math.max(10, when - 22));
              }
              break; }
            case "read": {
              // the thing comes into their hands (from where it stands, or it is simply there) and they read it
              standUp(a, at - 20);
              if (!held(tgt)) { if (find(tgt) && find(tgt)._role === "entity") toHand(tgt, a, Math.max(18, at - 4), null); else { emptyHands(a, at - 8); add({ ...inHand(tgt, find(a), sOf(a, at)), enter: { at: Math.max(8, at - 10), from: "pop", dur: 8 } }); } }
              play(a, "read", at);
              break; }
            case "come": {
              // WALKS up to the other — from off the stage when they are not on it — and stands NEXT TO them on the
              // word. The stage makes room as it does for `enter` (the first version walked the newcomer onto whoever
              // already stood beside the other: dracula 107, Van Helsing on Quincey).
              const when = Math.max(at, 54), on = !!find(a);
              const others = st8.who.filter((w) => w !== a), k = Math.max(0, others.indexOf(tgt));
              const fromLeft = on ? sOf(a, when).x < sOf(tgt, when).x : sOf(tgt, when).x > 960; // off stage: from the nearer edge of the far side
              const all = [...others.slice(0, fromLeft ? k : k + 1), a, ...others.slice(fromLeft ? k : k + 1)];
              const lay = st8.layout === "court" ? "court" : all.length === 1 ? "solo" : all.length === 2 ? "versus" : "row";
              if (on) { standUp(a, when - 44); swap(a, Math.max(3, when - 44), (n) => { n.action = "walk"; delete n.act; n._stopAfter = true; facing(n, 0, fromLeft ? 1 : -1); }, 3, true); }
              arrange(lay, all, Math.max(20, when - 20));
              const it = find(a);
              if (!on) { // not a slide-in: a walk from beyond the edge to the place the arrangement gave them
                const dest = it.x; delete it.enter; it.x = fromLeft ? -200 : 2120; it.action = "walk"; it._stopAfter = true; facing(it, 0, fromLeft ? 1 : -1);
                key(it, { at: when, dur: 44, ease: "inout", x: dest });
              }
              if (when + 6 < D - 2) swap(a, when + 2, (n) => { n.action = "idle"; delete n._stopAfter; facing(n, T.itemState(n, when + 2) ? n.x : 0, sOf(tgt, when).x); }, 3, true);
              break; }
            default: break;
          }
          break; }
        case "raw": if (!ev.item || !ev.item.kind) err("raw: needs item {kind, x, y, …}"); else { const it = clone(ev.item); it.id = it.id || `raw${++seq}`; it._role = it._role || "fx"; if (!it.enter && at > 0) it.enter = { at: Math.max(10, at), from: "pop", dur: 10 }; add(it); } break;
        default: break;
      }
    }

    // nothing may sit under the subtitles or over the HUD when it comes to rest
    for (const it of items) {
      const end = T.itemState(it, D - 1); if (!end || it._role === "world" || it.kind === "panel" || it.kind === "dash") continue;
      const top = it.kind === "figure" ? end.y - (figH(it) + TAG_H) * end.s : end.y - 150 * end.s;
      if (it.kind !== "figure" && end.y > SAFE.bottom) warnings.push({ beat: beat.id, message: `${it.id} rests at y ${Math.round(end.y)} — under the subtitle band` });
      if (it._role !== "title" && top < 0) warnings.push({ beat: beat.id, message: `${it.id} rests above the frame (top ${Math.round(top)})` });
    }

    // draw order: worlds behind, the things, what belongs to them, rows and effects, titles on top
    const order = { world: 0, entity: 1, desk: 1, held: 2, deco: 2, label: 3, row: 3, fx: 4, title: 5 };
    const drawn = items.map((it, i) => [it, i]).sort((a, b) => (order[a[0]._role] ?? 3) - (order[b[0]._role] ?? 3) || a[1] - b[1]).map(([it]) => it);
    const strip = (it) => { const c = {}; for (const [k, v] of Object.entries(it)) if (!k.startsWith("_") && v !== undefined) c[k] = v; return c; };
    stages.push({ v: T.TOLD_VERSION, items: drawn.map(strip), ...(camKeys.length ? { cam: camKeys } : {}), ...(backdrops.length ? { backdrops } : {}), ...(V2 ? { plate: "fit" } : {}) });

    // what stays for the next beat: everything still on stage at this beat's last frame, where it stands then
    carried = [];
    for (const it of drawn) {
      const end = T.itemState(it, D); if (!end || end.o < 0.02 || it._gone) continue;
      const keep = clone(it); delete keep.enter; delete keep.keys; delete keep.exit; delete keep.shake;
      Object.assign(keep, { x: end.x, y: end.y, s: end.s, o: end.o, r: end.r });
      if (keep.kind === "dash") { keep.drawFrom = -10; keep.drawTo = 0; }
      // v3: over the cut a person is at REST in their verb (seated at the desk, slumped) — the gesture is not played
      // again; one who was still running / walking / falling when the beat ended has arrived
      if (keep.act) keep.act = { verb: keep.act.verb, at: -9999 };
      if (it._stopAfter) { keep.action = "idle"; delete keep._stopAfter; }
      if (it._lands) { keep.action = "collapsed"; delete keep._lands; }
      carried.push(keep);
    }
    Object.assign(carried, { _layout: st8.layout, _who: st8.who, _rows: st8.rows, _dates: st8.dates });
    cam = { ...curCam };
  }
  return { stages, errors, warnings };
}

module.exports = { compileTold, validateEntities, wordFrame, slots, drawnAs, handOf, HELD, VERBS, REACH, GLYPHS, KINDS, LAYOUTS, DOS, PALETTE, TTL, TTL_DECO, LABELS_PER_THING, FIG_TOP, FIG_TOP_HARD, figH, fitS, tileW };
