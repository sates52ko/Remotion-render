/**
 * semantic-director.js — SEMANTIC FILM DIRECTOR 1.0 (cycle 11, experiment branch dev/c11).
 *
 * The director answers, per beat, ONE question before anything is drawn: what should a MUTED viewer understand from this
 * scene? — as a visible mechanism, comparison, event or result that the narration itself states (never invented
 * causality). Its answer is a RENDERER-NEUTRAL CONTRACT (schema "semantic-director/1", spec:
 * audit/c11-pilots/director-spec.md): what must be understood, the narration evidence, the representation class, the
 * before state, the transformation, the after state, the camera's purpose, the entities and the state-changing events,
 * what is required on screen and what is deliberately omitted. Nothing in it names an engine.
 *
 * validate(contract, ctx) → errors[] (the compile-fix pass of an author sees exactly these).
 * compile(contract, scene) → the Antidote scene (the same set, transition, id, timing) whose `semantic` field
 *   components/SemanticStage.tsx draws. Another renderer (Vox, a diagram engine) would compile the same contract.
 *
 * Representation classes:
 *   A action → consequence   someone does something, and something else is visibly different after
 *   B cause → effect         the narration states a cause and its effect (quote must carry the causal link)
 *   C before → after         one thing's state changes over time
 *   D comparison             two lanes on ONE shared scale, read side by side
 *   E data / magnitude       a quantity, its size made visible
 *   F abstract concept model a model of the idea built from entities whose state changes
 *   G environmental          a place / situation, no change required
 *   H text-only              nothing can be shown honestly: a short narration quote
 * Visibility rules (compiler errors, not advice): every A–F contract has a state-changing event; an "effect" must
 * change state (a level by ≥ 0.2 of the shared scale, a face, presence, a move, a break) — a colour, a highlight, a
 * zoom or a callout is not a change and cannot be written; A / B need an effect on something other than the cause;
 * D needs two lanes with the same kind of measure; labels are ≤ 2 words, the narration's own.
 */
"use strict";

const TYPES = { A: "action-consequence", B: "cause-effect", C: "before-after", D: "comparison", E: "magnitude", F: "concept-model", G: "environment", H: "text-only" };
const REPRESENTATION = { A: "cause-pause-effect", B: "cause-pause-effect", C: "before-after", D: "same-scale", E: "magnitude", F: "concept-model", G: "environment", H: "quote" };
const KINDS = ["person", "stock", "object", "group"];
const MOODS = ["neutral", "happy", "sad", "surprised", "worried", "angry", "smirk", "blank", "afraid"];
const HAND_GLYPHS = ["cigarette", "book", "phone", "key", "notes", "letter", "coin", "cup", "lightbulb", "mask", "photo", "mirror", "flower", "compass", "briefcase", "shield", "trophy", "hourglass", "sword", "target", "magnifier", "wallet", "gift", "zap", "laptop", "creditCard", "smartphone", "wrench"];
const ICON_GLYPHS = ["home", "family", "star", "heart", "road", "storm", "school", "medical", "grave", "water", "fire", "crash", "tree", "work", "game", "war", "food", "city", "law", "chains", "alarmClock", "car", "coffee", "boulder", "door", "clock", "ladder", "balance"];
const GLYPHS = [...HAND_GLYPHS, ...ICON_GLYPHS];
// a stated causal link (B must quote one): the narration says WHY, not the author
const CAUSAL = /\b(because|cause[sd]?|causing|so that|so|therefore|thus|hence|leads?|led|leading|makes?|made|making|drives?|drove|results?|resulting|turns? into|creates?|created|triggers?|produces?|means|when|whenever|if|then|until|unless|without|by|forces?|forced|kills?|destroys?|stops?|prevents?|breaks?|costs?|drains?|grows?|shrinks?|lets?|allows?|enables?)\b/i;
const TIMING = { token: 16, pause: 14, change: 20, gap: 10 };

const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter(Boolean);
const stem = (w) => w.replace(/'s$/, "").slice(0, Math.max(4, Math.min(w.length, 5)));

function labelGrounded(label, narration, castNames) {
  const nw = new Set(words(narration).map(stem));
  const cw = new Set(castNames.flatMap((n) => words(n)).map(stem));
  return words(label).every((w) => nw.has(stem(w)) || cw.has(stem(w)) || ["the", "a", "of", "no", "more", "less"].includes(w));
}

/** validate a contract against its beat. ctx = { narration, cast: [key...], castNames: [name...] } */
function validate(c, ctx) {
  const E = [];
  const err = (m) => E.push(m);
  if (!c || typeof c !== "object") return ["contract is not an object"];
  if (c.schema !== "semantic-director/1") err('schema must be "semantic-director/1"');
  if (!TYPES[c.type]) err(`type must be one of ${Object.keys(TYPES).join(" ")} (got ${JSON.stringify(c.type)})`);
  const narration = ctx.narration || "";
  for (const f of ["understanding", "evidence"]) if (typeof c[f] !== "string" || !c[f].trim()) err(`${f} is required`);
  if (c.understanding && words(c.understanding).length > 30) err("understanding: at most 30 words");
  if (c.evidence) {
    if (words(c.evidence).length < 4) err("evidence: quote at least 4 words of the narration");
    else if (!norm(narration).includes(norm(c.evidence))) err("evidence must be a VERBATIM quote of the narration");
  }
  if (c.representation !== REPRESENTATION[c.type]) err(`representation for type ${c.type} is "${REPRESENTATION[c.type]}"`);
  if (!Array.isArray(c.required) || !c.required.length) err("required: list what must be visible (at least one item)");
  if (!Array.isArray(c.omitted)) err("omitted: list the narration facts deliberately not shown ([] if none)");
  if (!c.camera || typeof c.camera.purpose !== "string" || !c.camera.purpose.trim()) err("camera.purpose is required");
  else if (c.camera.framing && c.camera.framing !== "wide-locked") err('camera.framing: "wide-locked" is the only framing in 1.0');

  if (c.type === "H") {
    if (typeof c.text !== "string" || !c.text.trim()) err("type H needs text");
    else {
      const tw = words(c.text), nw = new Set(words(narration));
      if (tw.length > 14) err("text: at most 14 words");
      if (tw.filter((w) => nw.has(w)).length / Math.max(1, tw.length) < 0.7) err("text must be the narration's own words (≥ 70 %)");
    }
    if ((c.entities || []).length || (c.events || []).length) err("type H has no entities / events");
    return E;
  }
  for (const f of ["before", "transformation", "after"]) if (c.type !== "G" && (typeof c[f] !== "string" || !c[f].trim())) err(`${f} is required for type ${c.type}`);

  const ents = Array.isArray(c.entities) ? c.entities : [];
  if (!ents.length) err("entities: at least one");
  if (ents.length > 6) err("entities: at most 6");
  const lanes = c.lanes === 2 ? 2 : 1;
  if (c.lanes != null && c.lanes !== 1 && c.lanes !== 2) err("lanes is 1 or 2");
  const byId = {};
  for (const e of ents) {
    const where = `entity ${JSON.stringify(e && e.id)}`;
    if (!e || typeof e.id !== "string" || !e.id) { err("every entity needs an id"); continue; }
    if (byId[e.id]) err(`${where}: duplicate id`);
    byId[e.id] = e;
    if (!KINDS.includes(e.kind)) err(`${where}: kind must be ${KINDS.join(" / ")}`);
    if (e.label != null) {
      if (words(e.label).length > 2) err(`${where}: label at most 2 words`);
      else if (!labelGrounded(e.label, narration, ctx.castNames || [])) err(`${where}: label "${e.label}" must use the narration's own words`);
    }
    if (e.kind === "object" && !GLYPHS.includes(e.glyph)) err(`${where}: object glyph must be one of the vocabulary (got ${JSON.stringify(e.glyph)})`);
    if (e.kind === "person" && e.cast != null && !(ctx.cast || []).includes(e.cast)) err(`${where}: cast "${e.cast}" is not in this book's cast (${(ctx.cast || []).join(", ") || "none"})`);
    if ((e.kind === "stock" || e.kind === "group") && (typeof e.value !== "number" || e.value < 0 || e.value > 1)) err(`${where}: a ${e.kind} needs value 0..1 (share of the shared scale)`);
    if (e.mood != null && !MOODS.includes(e.mood)) err(`${where}: mood must be ${MOODS.join(" / ")}`);
    if (lanes === 2 && e.lane !== 0 && e.lane !== 1) err(`${where}: with two lanes every entity needs lane 0 or 1`);
  }
  for (let l = 0; l < lanes; l++) if (ents.filter((e) => (lanes === 2 ? e.lane === l : true)).length > 4) err(`lane ${l}: at most 4 entities`);

  // events: replay the state so an "effect" that changes nothing is caught
  const st = {};
  for (const e of ents) st[e.id] = { value: e.value ?? 1, mood: e.mood || "neutral", present: e.present !== false, at: e.id, broken: false };
  const evs = Array.isArray(c.events) ? c.events.slice().sort((a, b) => (a.at ?? 0) - (b.at ?? 0)) : [];
  if ("ABCDEF".includes(c.type) && c.type && !evs.length) err(`type ${c.type} needs at least one event that changes the state`);
  let otherEffect = false;
  for (const [i, ev] of evs.entries()) {
    const where = `event ${i}`;
    if (typeof ev.at !== "number" || ev.at < 0.1 || ev.at > 0.75) err(`${where}: at is a fraction of the beat in 0.1..0.75`);
    if (!byId[ev.cause]) err(`${where}: cause "${ev.cause}" is not an entity`);
    if (ev.repeat != null && (!Number.isInteger(ev.repeat) || ev.repeat < 1 || ev.repeat > 4)) err(`${where}: repeat is 1..4`);
    if (!Array.isArray(ev.effects) || !ev.effects.length) { err(`${where}: at least one effect`); continue; }
    const n = ev.repeat || 1;
    for (const [j, f] of ev.effects.entries()) {
      const w2 = `${where} effect ${j}`;
      const s = st[f.entity];
      if (!s) { err(`${w2}: entity "${f.entity}" does not exist`); continue; }
      if (f.entity !== ev.cause) otherEffect = true;
      const keys = Object.keys(f).filter((k) => k !== "entity");
      const bad = keys.filter((k) => !["value", "mood", "present", "moveTo", "broken"].includes(k));
      if (bad.length) err(`${w2}: ${bad.join(", ")} is not a state change (allowed: value, mood, present, moveTo, broken)`);
      let changes = false;
      if (f.value != null) {
        if (typeof f.value !== "number" || f.value < 0 || f.value > 1) err(`${w2}: value 0..1`);
        else if (Math.abs(f.value - s.value) >= 0.2) { changes = true; s.value = f.value; }
        else err(`${w2}: value ${s.value} → ${f.value} is not a visible change (≥ 0.2 of the scale)`);
      }
      if (f.mood != null) { if (!MOODS.includes(f.mood)) err(`${w2}: mood must be ${MOODS.join(" / ")}`); else if (f.mood !== s.mood) { changes = true; s.mood = f.mood; } }
      if (f.present != null) { if (f.present !== s.present) { changes = true; s.present = f.present; } }
      if (f.moveTo != null) { if (!byId[f.moveTo] || f.moveTo === f.entity) err(`${w2}: moveTo must be another entity`); else if (byId[f.entity].kind !== "object") err(`${w2}: only an object moves`); else { changes = true; s.at = f.moveTo; } }
      if (f.broken === true) { if (!s.broken) { changes = true; s.broken = true; } }
      if (!changes) err(`${w2}: changes nothing visible`);
      if (n > 1 && f.value == null) err(`${w2}: a repeated event steps a value (each repetition moves it a share of the way)`);
      if (f.value != null && byId[f.entity] && !["stock", "group"].includes(byId[f.entity].kind)) err(`${w2}: only a stock or a group has a value`);
    }
  }
  if ((c.type === "A" || c.type === "B") && evs.length && !otherEffect) err(`type ${c.type}: the effect must land on something other than the cause`);
  if (c.type === "B" && c.evidence && !CAUSAL.test(c.evidence)) err("type B: the evidence quote must contain the narration's causal link (because / so / makes / leads / when …) — if the narration states no cause, choose C, D, E or F");
  if (c.type === "D") {
    if (lanes !== 2) err("type D compares two lanes: lanes 2");
    else {
      const meas = (l) => ents.filter((e) => e.lane === l && (e.kind === "stock" || e.kind === "group")).map((e) => e.kind);
      const m0 = meas(0), m1 = meas(1);
      if (!m0.length || !m1.length) err("type D: each lane needs a stock or group (the shared scale)");
      else if (m0[0] !== m1[0]) err("type D: both lanes measure with the SAME kind (stock vs stock or group vs group)");
    }
  }
  if (c.type === "E" && !ents.some((e) => e.kind === "stock" || e.kind === "group")) err("type E needs a stock or a group (the magnitude)");
  if (lanes === 2 && c.laneLabels != null) {
    if (!Array.isArray(c.laneLabels) || c.laneLabels.length !== 2) err("laneLabels: two labels");
    else c.laneLabels.forEach((t) => { if (words(t).length > 2) err(`lane label "${t}": at most 2 words`); else if (!labelGrounded(t, narration, ctx.castNames || [])) err(`lane label "${t}" must use the narration's own words`); });
  }
  return E;
}

/** frame timing: each occurrence = the cause marked, the token flies, a pause, the change; all done by 88 % of the beat */
function timeline(c, dur) {
  const span = TIMING.token + TIMING.pause + TIMING.change + TIMING.gap;
  const occ = [];
  for (const ev of (c.events || []).slice().sort((a, b) => a.at - b.at)) {
    const n = ev.repeat || 1;
    let start = Math.round(ev.at * dur);
    const last = (s) => s + (n - 1) * span + TIMING.token + TIMING.pause + TIMING.change;
    if (last(start) > 0.88 * dur) start = Math.max(Math.round(0.08 * dur), Math.floor(0.88 * dur) - last(0));
    for (let k = 0; k < n; k++) {
      const effects = ev.effects.map((f) => {
        if (n === 1 || f.value == null) return { ...f };
        return { ...f, __step: [k + 1, n] };
      });
      occ.push({ cause: ev.cause, cue: start + k * span, effects });
    }
  }
  occ.sort((a, b) => a.cue - b.cue);
  // repeated value steps: each repetition moves the level a share of the way from where it stood when the event began
  const level = {};
  for (const e of c.entities || []) level[e.id] = e.value ?? 1;
  const base = new Map();
  for (const o of occ) for (const f of o.effects) {
    if (f.value == null) continue;
    if (f.__step) {
      const key = `${o.cause}|${f.entity}|${f.value}`;
      if (!base.has(key)) base.set(key, level[f.entity]);
      const b = base.get(key), [k, n] = f.__step;
      f.value = b + (f.value - b) * (k / n);
      delete f.__step;
    }
    level[f.entity] = f.value;
  }
  return occ;
}

/** compile a valid contract onto the A scene: same id / timing / set / transition; the stage replaces cast, props, texts */
function compile(c, scene) {
  const dur = scene.durationFrames;
  const spec = {
    type: c.type, lanes: c.lanes === 2 ? 2 : 1, laneLabels: c.laneLabels, text: c.text,
    entities: (c.entities || []).map((e) => ({ id: e.id, kind: e.kind, label: e.label, glyph: e.glyph, cast: e.cast, value: e.value, mood: e.mood, present: e.present, lane: e.lane })),
    occ: c.type === "H" ? [] : timeline(c, dur),
    timing: { token: TIMING.token, pause: TIMING.pause, change: TIMING.change },
  };
  const { id, fromFrame, durationFrames, bg, transition } = scene;
  return { id, fromFrame, durationFrames, bg, transition, shot: "wide", camera: { zoom: [1, 1], panX: [0, 0], panY: [0, 0] }, characters: [], props: [], texts: [], semantic: spec };
}

module.exports = { TYPES, REPRESENTATION, KINDS, MOODS, GLYPHS, HAND_GLYPHS, ICON_GLYPHS, TIMING, validate, compile, timeline, labelGrounded };
