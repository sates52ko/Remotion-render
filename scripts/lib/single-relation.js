/**
 * single-relation.js — SINGLE-RELATION CAUSE → VISIBLE EFFECT (capability, cycle 13, default OFF).
 *
 * NOT a new visual invention: this productises the part of SEMANTIC FILM DIRECTOR 1.0 (cycle 11, dev/c11 —
 * lib/semantic-director.js + components/SemanticStage.tsx, both reused unchanged in behaviour) that worked in the
 * cycle 11 / 12 blind tests: ONE locked wide frame in which the cause is marked, a token travels, a pause, and the effect
 * visibly changes ANOTHER entity — or, when that cannot be shown honestly, a quote card in the narration's own words.
 * Director 2.0's progressive build, reads, new verbs and camera moves are deliberately NOT carried (cycle 12: they
 * lowered comprehension). From Director 2.0 only the claim-safety checks are kept, and made stricter.
 *
 * Contract (schema "single-relation/1"): the v1 contract restricted to type A (action → consequence), B (cause →
 * effect) or H (quote card), plus `claim`:
 *   { asserted, polarity: asserted | contrast | negated | hypothetical, speaker?, notAsserted: [{ text, kind }], cueCheck? }
 * Extra rules on top of v1 (every one a compiler error):
 *   - one relation: exactly one event, at most 4 entities, no duplicated entity (same label / cast / object glyph);
 *   - source-grounded causality: the evidence quote must name BOTH the cause and every affected entity (and a moveTo
 *     target), so a consequence the narration does not state cannot be drawn;
 *   - hypothesis ≠ fact: a staged scene needs polarity asserted / contrast, and its evidence may carry no plan /
 *     proposal / conditional-mood, negation or question cue — such a beat becomes a quote card (no override);
 *   - claim polarity: evidence, quote text and labels may not come from a part the narration does not assert; a
 *     rejected-premise cue around the evidence must be resolved in claim.notAsserted (no cueCheck override);
 *   - speaker: a quote card of someone other than the narrator carries the speaker on screen.
 * compile(contract, scene) → the scene with `singleRelation` (drawn by SemanticStage when meta.singleRelation is true).
 * Deterministic: pure functions of (contract, scene); no clock, no randomness.
 */
"use strict";
const V1 = require("./semantic-director");

const SCHEMA = "single-relation/1";
const TYPES = ["A", "B", "H"];
const POLARITY = ["asserted", "contrast", "negated", "hypothetical"];
const STAGED_POLARITY = ["asserted", "contrast"];
const NOT_KINDS = ["rejected-premise", "counterfactual", "hypothesis", "planned", "question", "quoted-speech", "uncertain", "setup-half-of-contrast"];
const MAX_ENTITIES = 4;
// cues IN the evidence quote that forbid staging it as a real event (no override: the beat becomes a quote card)
const HARD = [
  // (a motive — "want to fit in", "hope to" — is a real state, not a plan: not a cue)
  { kind: "planned / hypothetical", re: /\b(propos(e|ed|es|al)|suggest(ed|s)?|plan(s|ned|ning)?|scheme[sd]?|brainstorm\w*|idea (of|to|was|is)|consider(ed|s)?|thought about|would|could|might|imagine[sd]?|what if|suppose|let'?s say|should have|supposed to|meant to|tr(y|ied|ies) to)\b/i },
  // negation: refused unless the claim is a contrast whose negated half is listed in notAsserted (see validate).
  // "without <doing>" too (cycle 14, deep-work 250: "engages your mind softly without demanding focus" was drawn as
  // focus falling — the blind viewer read "nature depletes focus")
  { kind: "negation", re: /\b(not|no longer|never|don'?t|doesn'?t|didn'?t|isn'?t|wasn'?t|aren'?t|weren'?t|won'?t|can'?t|cannot|couldn'?t|wouldn'?t|shouldn'?t|without \w+ing)\b/i },
  // the claim itself is a question (a rhetorical "How does that work? Because …" answers it: not a cue)
  { kind: "question", re: /\?\s*$/ },
];
// cues in the evidence's SENTENCE that must be resolved (v2 claim logic)
const SOFT = [
  { kind: "rejected-premise", strict: true, re: /\b(i hear (your|you)|you might think|people (think|assume|believe|say)|it'?s (tempting|easy) to (think|assume)|the (myth|misconception)|contrary to|that'?s not)\b/i },
  { kind: "setup-half-of-contrast", re: /\b(not because|instead of|rather than|even though|although)\b/i },
  { kind: "uncertain", re: /\b(maybe|perhaps|arguably|you (could|might) argue|possibly)\b/i },
  { kind: "quoted-speech", re: /["“”]/ },
];

const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'? ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).replace(/\?/g, " ").split(" ").filter(Boolean);
const stem = (w) => w.replace(/'s$/, "").slice(0, Math.max(4, Math.min(w.length, 5)));
const STOP = new Set(["the", "a", "an", "of", "no", "more", "less", "his", "her", "their", "its", "my", "your"]);
const sentences = (t) => String(t || "").split(/(?<=[.!?])\s+/).filter(Boolean);
const overlap = (a, b) => { const aw = words(a), bw = new Set(words(b)); return aw.length ? aw.filter((w) => bw.has(w)).length / aw.length : 0; };
const named = (label, text) => { const tw = new Set(words(text).map(stem)); const lw = words(label).filter((w) => !STOP.has(w)); return lw.length > 0 && lw.every((w) => tw.has(stem(w))); };

/** what the evidence names an entity by: its label, else (a person) its cast name */
function nameOf(e, ctx) {
  if (e.label) return e.label;
  if (e.kind === "person" && e.cast && ctx.castLabels && ctx.castLabels[e.cast]) return ctx.castLabels[e.cast];
  return "";
}

function sentenceSpan(narration, evidence) {
  const ne = norm(evidence);
  const hit = sentences(narration).filter((s) => { const ns = norm(s); return ns && (ns.includes(ne) || ne.includes(ns) || overlap(evidence, s) > 0.6); });
  return hit.length ? hit.join(" ") : narration;
}

/** validate a contract. ctx = { narration, cast: [key], castNames: [name], castLabels: { key: name } } */
function validate(c, ctx = {}) {
  const E = [];
  const err = (m) => E.push(m);
  if (!c || typeof c !== "object") return ["contract is not an object"];
  if (c.schema !== SCHEMA) return [`schema must be "${SCHEMA}"`];
  if (!TYPES.includes(c.type)) return [`type must be A (action → consequence), B (cause → effect) or H (quote card) — got ${JSON.stringify(c.type)}`];
  const narration = ctx.narration || "";
  const castNames = ctx.castNames || Object.values(ctx.castLabels || {});
  // every Director 1.0 rule still holds (verbatim evidence, grounded labels, glyph vocabulary, visible change, …)
  for (const m of V1.validate({ ...c, schema: "semantic-director/1", representation: V1.REPRESENTATION[c.type] }, { ...ctx, castNames })) err(m);

  // ── claim ─────────────────────────────────────────────────────────────────
  const cl = c.claim;
  const na = cl && Array.isArray(cl.notAsserted) ? cl.notAsserted : [];
  if (!cl || typeof cl.asserted !== "string" || !cl.asserted.trim()) err("claim.asserted: the claim the narration asserts here (one sentence)");
  else {
    if (!POLARITY.includes(cl.polarity)) err(`claim.polarity is ${POLARITY.join(" / ")}`);
    if (!Array.isArray(cl.notAsserted)) err("claim.notAsserted: [] or the parts the narration mentions without asserting");
    na.forEach((n, i) => {
      if (!n || !NOT_KINDS.includes(n.kind)) err(`claim.notAsserted[${i}].kind is ${NOT_KINDS.join(" / ")}`);
      if (!n || !n.text || !norm(narration).includes(norm(n.text))) err(`claim.notAsserted[${i}].text must be a verbatim quote of the narration`);
    });
  }
  // a planned / hypothetical / quoted part may be QUOTED WITH ITS FRAME ("someone proposed …", "she said …") — that is a
  // report, not the claim; a rejected premise, a counterfactual or a contrast half is never shown as the point
  const REPORTABLE = ["planned", "hypothesis", "quoted-speech"];
  const framed = (t, n) => REPORTABLE.includes(n.kind) && !norm(n.text).includes(norm(t)) && (HARD[0].re.test(t) || /["“”]|\b(said|says|told|tells|asked|asks|wrote|writes)\b/i.test(t));
  const fromNotAsserted = (t, k = 0.7) => na.find((n) => n && n.text && t && (norm(n.text).includes(norm(t)) || overlap(t, n.text) >= k) && !framed(t, n));
  if (c.evidence) {
    const hit = fromNotAsserted(c.evidence);
    if (hit) err(`evidence comes from a part the narration does not assert (${hit.kind}: "${hit.text}") — quote the asserted claim`);
    const span = sentenceSpan(narration, c.evidence);
    for (const q of SOFT) if (q.re.test(span)) {
      const resolved = na.length > 0 || (!q.strict && cl && typeof cl.cueCheck === "string" && cl.cueCheck.trim().length >= 12);
      if (!resolved) err(`the sentence of your evidence carries a ${q.kind} cue — list what is not asserted in claim.notAsserted${q.strict ? "" : " (or say in claim.cueCheck why the cue does not change the claim)"}`);
    }
  }

  if (c.type === "H") {
    if (c.text && fromNotAsserted(c.text, 0.6)) err("quote card: the text comes from a part the narration does not assert — quote the asserted claim");
    const quoted = /["“”]/.test(c.text || "") || (cl && cl.speaker && cl.speaker !== "narrator");
    if (quoted && !(cl && typeof cl.speaker === "string" && cl.speaker.trim() && cl.speaker !== "narrator")) err("quote card of quoted speech: claim.speaker must name who says it (it is shown on the card)");
    return E;
  }

  // ── staged (A / B): one relation, grounded in the evidence, asserted as fact ──
  if (cl && !STAGED_POLARITY.includes(cl.polarity)) err(`a ${cl.polarity} claim cannot be staged as an event that happened — use a quote card (type H)`);
  const contrastResolved = !!cl && cl.polarity === "contrast" && na.length > 0;
  for (const h of HARD) if (c.evidence && h.re.test(c.evidence) && !(h.kind === "negation" && contrastResolved)) err(`the evidence carries a ${h.kind} cue ("${(c.evidence.match(h.re) || [""])[0]}") — a staged scene would show it as a real event; use a quote card (type H)`);
  const ents = Array.isArray(c.entities) ? c.entities : [];
  const evs = Array.isArray(c.events) ? c.events : [];
  if (ents.length > MAX_ENTITIES) err(`one relation: at most ${MAX_ENTITIES} entities`);
  // multi-phase single-frame storytelling (cycle 18, pilot): setup → action → result as 2–3 events of ONE relation in ONE
  // frame, each timed to the narration's own words (anchors). Without `phases: true` a contract is exactly one event.
  if (c.phases === true) {
    if (evs.length < 2 || evs.length > 3) err("phases: 2 or 3 events (setup → action → result)");
    if (!evs.every((ev) => ev && ev.anchors && (ev.anchors.cause || ev.anchors.effect))) err("phases: every event needs anchors {cause and/or effect} — the narration's words that time it");
  } else if (evs.length !== 1) err("one relation: exactly one event (one cause, its effect) — or phases: true for setup → action → result");
  for (const [i, ev] of evs.entries()) for (const [k, ph] of Object.entries((ev && ev.anchors) || {})) {
    if (k === "effectAfter") continue; // a derived search start (deriveAnchors), not an author field
    if (!["cause", "effect"].includes(k)) { err(`event ${i}: anchors has only cause / effect (got "${k}")`); continue; }
    const w = norm(ph).split(" ").filter(Boolean);
    if (!w.length || w.length > 6) err(`event ${i}: anchor ${k} is 1–6 of the narration's words`);
    else if (!(" " + norm(narration) + " ").includes(" " + w.join(" ") + " ")) err(`event ${i}: anchor ${k} "${ph}" is not a verbatim phrase of the narration`);
  }
  if ((c.lanes || 1) !== 1) err("one relation: one lane");
  const seen = new Map();
  for (const e of ents) {
    const keys = [e.label && `label:${norm(e.label)}`, e.kind === "person" && e.cast && `cast:${e.cast}`, e.kind === "object" && e.glyph && `glyph:${e.glyph}`].filter(Boolean);
    for (const k of keys) { if (seen.has(k)) err(`entity "${e.id}" duplicates "${seen.get(k)}" (${k}) — one thing is drawn once`); else seen.set(k, e.id); }
    const lab = nameOf(e, ctx);
    if (lab && na.some((n) => n && n.text && named(lab, n.text)) && !named(lab, c.evidence || "")) err(`entity "${e.id}": "${lab}" comes from a part the narration does not assert`);
  }
  const byId = Object.fromEntries(ents.map((e) => [e.id, e]));
  // the relation must be stated where the evidence is: its sentence(s) and the sentence on either side; a person may be
  // referred to there by a pronoun ("you", "he", …)
  const sents = sentences(narration);
  const at = sents.map((x, i) => (norm(x).includes(norm(c.evidence)) || norm(c.evidence).includes(norm(x)) || overlap(c.evidence || "", x) > 0.5 ? i : -1)).filter((i) => i >= 0);
  const span = at.length ? sents.slice(Math.max(0, Math.min(...at) - 1), Math.max(...at) + 2).join(" ") : (c.evidence || "");
  const PRONOUN = /\b(you|your|he|she|they|him|her|them|we|his|their|someone|people)\b/i;
  const mustName = (id, role) => {
    const e = byId[id]; if (!e) return;
    const lab = nameOf(e, ctx);
    if (e.kind === "person" && ((lab && named(lab, span)) || PRONOUN.test(span))) return;
    if (!lab) err(`${role} "${id}" needs a label (or a cast name) so the evidence can name it`);
    else if (!named(lab, span)) err(`${role} "${id}" ("${lab}") is not named where the evidence is (its sentence or the one before / after) — the narration must state this end of the relation`);
  };
  for (const ev of evs) {
    mustName(ev.cause, "cause");
    for (const f of ev.effects || []) {
      if (f.entity !== ev.cause) mustName(f.entity, "effect");
      if (f.moveTo) mustName(f.moveTo, "moveTo target");
      if (f.mergeInto) mustName(f.mergeInto, "mergeInto target");
      if (f.via) mustName(f.via, "via (the removed obstacle)");
    }
  }
  // RELATIONAL MOTION (cycle 16): a declared mechanism must be what the motion actually does — the change lands on the
  // right entity in the right direction (a "transfer" with no moving object, or a "depletion" whose level rises, is refused)
  if (c.mechanism != null) for (const m of mechanismErrors(c, ents, evs)) err(m);
  return E;
}

/** Relational-motion mechanisms the renderer can draw honestly, and what each requires of the ONE event */
const MECHANISMS = {
  "cause-effect": "the cause changes another entity",
  transfer: "an object moves from where it was to another entity (moveTo; its old place stays as a dashed slot)",
  accumulation: "a level rises in steps (repeat ≥ 2, value up)",
  depletion: "a level falls (value down)",
  recovery: "a level rises (value up)",
  removal: "an obstacle disappears (present: false) AND, in the same event, another entity changes",
  transformation: "an entity's state flips (mood or broken)",
  "character-action": "a person (the cause) acts and another entity changes",
  // relational motion 2.0 (cycle 18): each is an event the renderer draws, not a label
  overload: "a level rises in steps until the container gives way (repeat ≥ 2, value up to the top, overflow: true)",
  passage: "an obstacle is removed (present: false), then something goes through where it stood to its goal (moveTo + via)",
  merge: "an object goes into another and becomes part of it (mergeInto)",
  split: "a new entity comes out of another one (present: true + from)",
};
function mechanismErrors(c, ents, evs) {
  const out = [], m = c.mechanism, ev = evs[evs.length - 1];
  if (!MECHANISMS[m]) return [`mechanism must be one of ${Object.keys(MECHANISMS).join(" / ")} (connection / separation / choice are not drawable in one relation yet)`];
  if (!ev) return out;
  const byId = Object.fromEntries(ents.map((e) => [e.id, e]));
  // every phase's effects count (a one-event contract: just its own)
  const fx = evs.flatMap((e) => (e && e.effects) || []).filter(Boolean);
  const start = (id) => (byId[id] && typeof byId[id].value === "number" ? byId[id].value : 1);
  const up = fx.some((f) => typeof f.value === "number" && f.value > start(f.entity));
  const down = fx.some((f) => typeof f.value === "number" && f.value < start(f.entity));
  const need = (ok) => { if (!ok) out.push(`mechanism "${m}": ${MECHANISMS[m]} — the event does not do that`); };
  if (m === "transfer") need(fx.some((f) => f.moveTo && f.entity !== f.moveTo));
  if (m === "accumulation") need(up && evs.some((e) => (e.repeat || 1) >= 2));
  if (m === "overload") need(up && evs.some((e) => (e.repeat || 1) >= 2) && fx.some((f) => f.overflow === true));
  if (m === "passage") need(fx.some((f) => f.present === false) && fx.some((f) => f.moveTo && f.via));
  if (m === "merge") need(fx.some((f) => f.mergeInto));
  if (m === "split") need(fx.some((f) => f.from && f.present === true));
  if (m === "depletion") need(down);
  if (m === "recovery") need(up);
  if (m === "removal") need(fx.some((f) => f.present === false) && fx.some((f) => f.present !== false && f.entity !== (fx.find((g) => g.present === false) || {}).entity));
  if (m === "transformation") need(fx.some((f) => f.mood || f.broken));
  if (m === "character-action") need(evs.some((e) => byId[e.cause] && byId[e.cause].kind === "person") && fx.some((f) => !evs.some((e) => e.cause === f.entity)));
  if (m === "cause-effect") need(fx.some((f) => f.entity !== ev.cause));
  return out;
}

// glyphs that look like what they ARE (a coin is money, a clock is time); every other glyph standing for an idea
// (a mask for "fake", a door for "rejecting") and every level tank carry their meaning by the LABEL alone
const LITERAL = { coin: ["money", "coin", "cash", "pay", "wealth", "dollar", "price", "cost"], wallet: ["money", "wallet", "savings"], clock: ["time", "timing", "clock", "hour", "deadline"],
  hourglass: ["time", "hourglass", "wait"], book: ["book", "novel", "read", "story", "chapter"], phone: ["phone", "call"], smartphone: ["phone", "notification", "screen", "app"],
  laptop: ["laptop", "computer", "work", "email"], letter: ["letter", "mail", "message"], notes: ["notes", "list", "plan", "memo"], key: ["key", "access", "unlock"],
  cup: ["cup", "coffee", "tea", "drink"], coffee: ["coffee"], food: ["food", "eat", "meal", "hunger"], trophy: ["trophy", "prize", "award", "win", "winner"], car: ["car", "drive"],
  home: ["home", "house", "family"], family: ["family", "parent", "child", "kid"], school: ["school", "class", "teacher", "student"], medical: ["doctor", "medical", "hospital", "health", "drug"],
  water: ["water", "rain", "flood"], fire: ["fire", "burn", "flame"], storm: ["storm", "noise", "chaos", "thunder"], crash: ["crash", "accident"], tree: ["tree", "nature", "forest"],
  work: ["work", "job", "office"], city: ["city"], law: ["law", "court", "judge", "rule"], chains: ["chains", "trapped", "prison"], ladder: ["ladder", "climb", "promotion"],
  door: ["door", "leave", "exit", "enter"], boulder: ["boulder", "obstacle", "burden"], creditCard: ["card", "credit", "debt", "spend"], gift: ["gift", "present"], photo: ["photo", "picture", "memory"],
  flower: ["flower"], magnifier: ["search", "look", "detail", "find"], wrench: ["fix", "repair", "tool"], grave: ["death", "grave", "die"], war: ["war", "battle", "fight"] };
const stemOf = (w) => w.replace(/'s$/, "").slice(0, Math.max(4, Math.min(w.length, 5)));

/** review(contract) — decision 2 of the pipeline: does the NEW scene show the relation, or only label it? Advisory: it
 *  never changes validity. labelCarried = the ends whose meaning comes from their label text alone (a level tank, or a
 *  glyph that is a metaphor for the label). Both ends label-carried → "TRY_CONCRETE": author a version where at least one
 *  end is a literal object or a person (cycle 16: the fresh scene the operator "did not understand"). */
function review(c) {
  const ents = Array.isArray(c.entities) ? c.entities : [], evs = (c.events || []).filter(Boolean), ev = evs[0];
  if (c.type === "H" || !ev) return { verdict: "QUOTE_CARD", labelCarried: [], ends: [] };
  const byId = Object.fromEntries(ents.map((e) => [e.id, e]));
  const endIds = [...new Set(evs.flatMap((e) => [e.cause, ...(e.effects || []).map((f) => f.entity)]))];
  const carried = (e) => {
    if (!e) return false;
    if (e.kind === "person") return false;                 // a person (with a face) is read without the label
    if (e.kind === "stock" || e.kind === "group") return true; // a level / count means only what its label says
    const lex = LITERAL[e.glyph] || [];
    return !(String(e.label || "").toLowerCase().split(/\s+/).filter(Boolean).some((w) => lex.some((x) => stemOf(x) === stemOf(w))));
  };
  const labelCarried = endIds.filter((id) => carried(byId[id]));
  const moves = evs.flatMap((e) => e.effects || []).some((f) => f.moveTo || f.present === false || f.mood || f.broken || f.overflow || f.mergeInto || f.from);
  const verdict = labelCarried.length === endIds.length && !moves ? "TRY_CONCRETE" : "OK";
  return { verdict, ends: endIds, labelCarried, labelDependence: Math.round((labelCarried.length / Math.max(1, endIds.length)) * 100) / 100,
    note: verdict === "TRY_CONCRETE" ? "every end of the relation is carried by its label alone (a tank / a metaphor glyph) and nothing moves, appears, leaves or changes face — try a version with a literal object or a person first (creative-direction.md)" : undefined };
}

/**
 * Production timing rule (cycle 18, operator): a B goes into a film only when the moment the narrator SAYS the result is
 * found in the word timings and the compiled change does not start before it, and fits (with a hold) inside the beat.
 * deriveAnchors — when the author gave no effect anchor, the result phrase is the effect entity's label (the narration's
 * own words) looked for AFTER the moment the evidence sentence starts (a phrase said twice is matched in context).
 */
function deriveAnchors(c, timed) {
  const out = JSON.parse(JSON.stringify(c)), derived = [];
  const byId = Object.fromEntries((out.entities || []).map((e) => [e.id, e]));
  const ew = norm(c.evidence || "").split(" ").filter(Boolean);
  const evidenceAt = ew.length ? V1.findPhrase(timed, ew.slice(0, Math.min(4, ew.length)).join(" ")) : null;
  const evidenceEnd = evidenceAt != null && ew.length ? V1.findPhrase(timed, ew.slice(-Math.min(3, ew.length)).join(" "), evidenceAt) : null;
  // conservative: the LAST time the label is said inside the evidence sentence (a label named early — "her cognitive
  // load …" — is not the moment the result is told)
  const lastSaid = (label) => { let at = null, from = evidenceAt; for (;;) { const s = V1.findPhrase(timed, label, from); if (s == null || (evidenceEnd != null && s > evidenceEnd)) break; at = s; from = s + 1; } return at; };
  for (const [i, ev] of (out.events || []).entries()) {
    if (ev.anchors && ev.anchors.effect) continue;
    const f = (ev.effects || []).find((x) => x.entity !== ev.cause) || (ev.effects || [])[0];
    const e = f && byId[f.entity];
    const label = e && (e.label || (e.kind === "person" ? e.cast : null));
    if (!label || evidenceAt == null || lastSaid(label) == null) continue;
    // "the load so unbearable THAT she just snaps": a forward link after the label → the result is the clause that
    // follows, told at the END of the evidence — anchor on its last words (never earlier than the narrator says it)
    const lw = norm(label).split(" ").filter(Boolean), li = ew.findIndex((w, j) => lw.every((t, k) => ew[j + k] === t));
    const forward = li >= 0 && /\b(so|that|until|then|and|which|therefore|thus|leads?|makes?|made|causes?|caused)\b/.test(ew.slice(li + lw.length).join(" "));
    const tail = ew.slice(-Math.min(3, ew.length)).join(" ");
    if (forward && evidenceEnd != null) { ev.anchors = { ...(ev.anchors || {}), effect: tail, effectAfter: evidenceEnd }; derived.push(`event ${i}: result "${tail}" (end of the evidence — the clause after "${label}")`); }
    else { ev.anchors = { ...(ev.anchors || {}), effect: label, effectAfter: lastSaid(label) }; derived.push(`event ${i}: result "${label}" (derived from the evidence)`); }
  }
  return { contract: out, derived, evidenceAt };
}
/** verifyTiming(contract, scene, words) → {ok, contract (anchored), events[{effect, effectAt, changeStart, changeEnd}]} or {ok:false, reason} */
function verifyTiming(c, scene, timed) {
  if (c.type === "H") return { ok: true, contract: c, events: [], note: "quote card (no change to time)" };
  if (!timed || !timed.length) return { ok: false, reason: "no word timings for this scene" };
  const d = deriveAnchors(c, timed), evs = d.contract.events || [];
  const missing = evs.findIndex((e) => !(e.anchors && e.anchors.effect));
  if (missing >= 0) return { ok: false, reason: `event ${missing}: the narration's result phrase is not found where the evidence is said (give anchors.effect)` };
  const occ = V1.timeline(d.contract, scene.durationFrames, timed);
  if (occ.source !== "anchored") return { ok: false, reason: occ.source.replace(/^fraction \(/, "").replace(/\)$/, "") };
  const T = V1.TIMING, events = [];
  let k = 0;
  for (const [i, ev] of evs.entries()) {
    // the result is the event's LAST step (a repeated event builds up before it)
    const n = ev.repeat || 1, last = occ[k + n - 1];
    const start = last.cue + T.token + (last.pause ?? T.pause), ef = occ.effectAt[i];
    if (ef != null && start < ef) return { ok: false, reason: `event ${i}: the change starts at frame ${start}, before "${ev.anchors.effect}" is said at ${ef}` };
    events.push({ effect: ev.anchors.effect, effectAt: ef, changeStart: start, changeEnd: last.cue + T.token + (last.pause ?? T.pause) + T.change });
    k += n;
  }
  return { ok: true, contract: d.contract, derived: d.derived, events };
}

/** compile a valid contract onto its source scene (same id, timing, set, transition) */
function compile(c, scene, ctx = {}) {
  const out = V1.compile({ ...c, schema: "semantic-director/1" }, scene, ctx);
  const spec = { ...out.semantic, capability: SCHEMA };
  if (c.type === "H" && c.claim && c.claim.speaker && c.claim.speaker !== "narrator") spec.speaker = c.claim.speaker;
  delete out.semantic;
  // the scene's frame furniture and records stay the source scene's: the HUD (insight badge / progress — cycle 14: a
  // dropped `hud` made the badge read "INSIGHT 2/2" instead of the book's "07/08") and the narration / beat metadata
  const keep = Object.fromEntries(["hud", "_narration", "_beat", "_act", "audioEvents", "narrativeAtom", "visualIntent", "visualContract"].filter((k) => scene[k] !== undefined).map((k) => [k, scene[k]]));
  // the authorship stamp stays and names the authored contract that replaced the staging (cycle 17: a dropped stamp
  // failed gate-authorship UNSTAMPED_CONFIG on every applied scene)
  const contractHash = require("crypto").createHash("sha256").update(JSON.stringify(c)).digest("hex").slice(0, 16);
  if (scene._authorship) keep._authorship = { ...scene._authorship, singleRelation: { schema: SCHEMA, contractHash, author: c._author || null } };
  return { ...out, ...keep, singleRelation: spec };
}

/**
 * Seal a compiled scene as its beat's AUTHORED decision (operator-approved selective rollout, cycle 17). The contract is
 * an authored storyboard decision, so the beat's lock becomes that staging — gate-authorship then checks the scene
 * against it (no STAGING_OVERRIDDEN) and make-book's restoreAuthoredStaging keeps it instead of restaging the old one.
 * The replaced lock is kept as `previousLock` (revert). Never used without a validated contract.
 */
function sealAuthored(scene, provenance = {}) {
  const a = scene._authorship || {};
  const old = a.lock || null;
  const ch = scene.characters || [], c0 = ch[0] || {};
  const who = (x) => (x && (x.identity || x.role)) || "?";
  const lock = {
    planShot: scene.shot, shot: scene.shot, cast: ch.map(who),
    concept: scene.concept ?? null, propTypes: (scene.props || []).map((p) => p && p.type).filter(Boolean),
    artTexts: (scene.texts || []).filter((t) => t && t.text).map((t) => JSON.parse(JSON.stringify(t))),
  };
  if (scene.bg && scene.bg.set) lock.set = scene.bg.set;
  if (c0.expression) lock.expression = c0.expression;
  if (c0.action) lock.action = c0.action;
  if (c0.holds) lock.holds = c0.holds;
  if (scene.continueFromPrev === true) lock.continue = true;
  if (scene.carryState === true) lock.carryState = true;
  lock.singleRelation = { schema: SCHEMA, ...provenance };
  const out = { ...scene, _authorship: { ...a, src: "single-relation", lock, previousLock: old } };
  // the planner's VisualContract described the OLD staging: its characters must be on screen and its representation
  // requirement names the old strategy's lever. The narration side (atom subject / relation / state, allowed cast and
  // locations) stays as it is; the staging side is rebound to what the authored contract puts on screen.
  if (scene.visualContract) {
    const vc = JSON.parse(JSON.stringify(scene.visualContract));
    const onScreen = new Set(ch.map(who));
    if (Array.isArray(vc.characterIntent)) vc.characterIntent = vc.characterIntent.filter((x) => x && onScreen.has(x.identity));
    if (vc.visualEvidence && vc.visualEvidence.representation != null) { vc.visualEvidence.previousRepresentation = vc.visualEvidence.representation; delete vc.visualEvidence.representation; }
    vc.singleRelation = { schema: SCHEMA, ...provenance };
    out.visualContract = vc;
  }
  return out;
}

/** a book opts in by meta.singleRelation; without it the renderer ignores every singleRelation field */
function enable(config) { return { ...config, meta: { ...config.meta, singleRelation: true } }; }

module.exports = { SCHEMA, TYPES, POLARITY, NOT_KINDS, MAX_ENTITIES, HARD, SOFT, MECHANISMS, validate, compile, enable, review, sealAuthored, deriveAnchors, verifyTiming };
