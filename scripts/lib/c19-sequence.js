/**
 * c19-sequence.js — C19 (2026-11-07): the narrated ACTION and its RESULT followed across consecutive shots INSIDE a
 * beat (`scene.shots`), possibly over consecutive beats (the result carried into the next one). One contract = one
 * sequence; it is validated, A/B'd, sealed, applied and reverted as ONE unit (operator): if any beat fails, none
 * changes.
 *
 * contract {schema: "c19-sequence/1", evidence: "<verbatim narration>", mechanism?, _author,
 *   beats: [{ sceneIndex, shots: [{ at: null | "<narration words>", stage: {shot, bg:{set}, characters, props},
 *                                   cues: {"<characterIndex>": "<words>"}, motionCues: {"<propIndex>": "<words>"} }] }]}
 *   props: { motif: "<book motifs.json key>", x, y, scale, motion?: "split", splitAt?, splitBase?, startState?: "split" }
 *          or any Antidote prop. A hand object is a character's `holds`.
 *
 * What the beat keeps: id, order, fromFrame, durationFrames, transition, its authored top-level staging (gates read
 * it; the renderer draws `shots` instead) and its records. Readcheck reads the storyboard (art.json); C19 is checked
 * on the frames it renders (A/B, narration review, mute test).
 */
"use strict";
const crypto = require("crypto");
const { findPhrase } = require("./semantic-director");
const { HARD } = require("./single-relation");
const { wordsOf } = require("./shot-plan");

const SCHEMA = "c19-sequence/1";
// the actions whose MOMENT is a result on screen — each must sit on the narrator's word (the timing rule)
const CUED = ["sign", "chop", "throw", "take", "place", "stop", "reach", "offer", "drink", "leave", "flee", "embrace", "lift", "grabbing", "fighting", "falling"];
const ACTIONS = ["idle", "talk", "point", "celebrate", "slump", "think", "walk", "sit", "hold", "reach", "offer", "leave", "flee", "drink", "lying", "collapsed",
  "falling", "fighting", "struggling", "grabbing", "place", "take", "embrace", "lift", "lifted", "run", "stop", "chop", "throw", "sign"];
// the narration words that name each hand object (grounding: an object is drawn only when the narration names it)
const HAND_WORDS = { pen: ["pen", "sign", "signs", "signed", "signing", "signature"], cash: ["cash", "money", "bills", "banknote"], axe: ["axe", "ax", "hacking", "chop"], shoe: ["shoe", "sneaker"], pebble: ["pebble", "stone", "rock"], ball: ["ball"], sword: ["sword", "blade"],
  book: ["book"], phone: ["phone"], key: ["key"], letter: ["letter"], coin: ["coin", "money", "cash"], cup: ["cup", "coffee", "tea"], wrench: ["wrench", "tool"] };
// the shots whose preset frames a FULL body (src/engines/antidote/shots.ts charsFull); any other shot is waist-up and a
// forced full body there crops the head off the frame (C19 e2e, the-choice-factory 123)
const FULL_SHOTS = ["wide", "silhouette", "lowAngle", "crowd", "illustration", "diorama"];
// actions the legs carry: they need a full-body shot
const LEG_ACTIONS = ["run", "stop", "chop", "walk", "flee", "leave"];
// hand objects too small to read in a full-body shot at their natural size (Free to Focus #5: a coin in a wide shot was
// a dot) — drawn 1.8× there; every C19 hand object gets a light outline (holdHalo) so it separates from the clothes
const SMALL_HAND = ["coin", "cash", "key", "pebble", "phone", "smartphone", "letter", "notes", "photo", "creditCard", "wallet", "cup", "cigarette", "compass", "lightbulb"];
const SMALL_SCALE = 1.8;
/** the beat's own authored texts that show during [from, to) of the beat, shifted so each keeps its ORIGINAL in / out
 *  frame (a text already on screen at the cut continues: its `at` goes negative, its entry is long finished) */
function textsDuring(scene, from, to) {
  return (scene.texts || []).filter((t) => {
    const a = t.at || 0, end = t.duration != null ? a + t.duration : scene.durationFrames;
    return a < to && end > from;
  }).map((t) => ({ ...t, at: (t.at || 0) - from }));
}
const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const sha = (x) => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);

function narrationOf(config, idxs) { return idxs.map((i) => (config.scenes[i] || {})._narration || "").join(" "); }
const named = (words, text) => { const t = ` ${norm(text)} `; return words.some((w) => t.includes(` ${norm(w)} `) || t.includes(` ${norm(w)}s `)); };

/** one beat → its shots (beat-relative), cut on the narrator's words; throws with the reason */
function compileBeat(config, b, motifs = {}) {
  const scene = config.scenes[b.sceneIndex];
  if (!scene) throw new Error(`beat ${b.sceneIndex}: no such scene`);
  const W = wordsOf(config, scene), starts = [];
  let after = -Infinity;
  for (const [k, sh] of (b.shots || []).entries()) {
    let at = 0;
    if (k > 0) { at = findPhrase(W, sh.at, after + 1); if (at == null) throw new Error(`beat ${b.sceneIndex} shot ${k + 1}: cut word "${sh.at}" is not in the word timings after frame ${after}`); }
    else if (sh.at != null) throw new Error(`beat ${b.sceneIndex}: the first shot starts with the beat (at: null)`);
    if (k > 0 && at <= starts[k - 1]) throw new Error(`beat ${b.sceneIndex} shot ${k + 1}: cut ${at} is not after ${starts[k - 1]}`);
    if (at >= scene.durationFrames) throw new Error(`beat ${b.sceneIndex} shot ${k + 1}: cut ${at} is past the beat`);
    starts.push(at); after = at;
  }
  return (b.shots || []).map((sh, k) => {
    const from = starts[k], to = k + 1 < starts.length ? starts[k + 1] : scene.durationFrames;
    // "keep": this shot shows the beat's own authored staging (e.g. the establishing shot before the action is told)
    const st = sh.stage === "keep" ? JSON.parse(JSON.stringify({ shot: scene.shot, bg: scene.bg, camera: scene.camera, characters: scene.characters || [], props: scene.props || [], texts: scene.texts || [] })) : JSON.parse(JSON.stringify(sh.stage || {}));
    const keep = sh.stage === "keep";
    const full = FULL_SHOTS.includes(st.shot || scene.shot);
    const characters = keep ? (st.characters || []) : (st.characters || []).map((c) => ({ rig: "everyman", enter: "none", silhouette: false, lookAt: "viewer", ...(full ? { body: "full" } : {}), expression: "neutral", action: "idle", role: c.identity, id: `${c.identity}-c`,
      ...(c.holds ? { holdHalo: true, ...(full && SMALL_HAND.includes(c.holds) ? { holdScale: SMALL_SCALE } : {}) } : {}), ...c }));
    for (const [ci, phrase] of Object.entries(sh.cues || {})) {
      const f = findPhrase(W, phrase, from);
      if (f == null || f >= to) throw new Error(`beat ${b.sceneIndex} shot ${k + 1}: cue "${phrase}" is not said inside the shot (${from}–${to})`);
      if (!characters[ci]) throw new Error(`beat ${b.sceneIndex} shot ${k + 1}: no character ${ci} for cue "${phrase}"`);
      characters[ci].actionAt = f - from; characters[ci].cueExact = true;
    }
    const props = (st.props || []).map((p) => {
      if (!p.motif) return p;
      const m = motifs[p.motif];
      if (!m) throw new Error(`beat ${b.sceneIndex} shot ${k + 1}: motif "${p.motif}" is not in the book's motifs.json`);
      const { motif, startState, ...rest } = p;
      const out = { type: "customSvg", customSvg: { viewBox: m.viewBox, paths: m.paths, title: "" }, enter: "none", at: 0, ...rest, _motif: motif };
      if (startState === "split") { out.motion = "split"; out.motionAt = -30; }
      return out;
    });
    for (const [pi, phrase] of Object.entries(sh.motionCues || {})) {
      const f = findPhrase(W, phrase, from);
      if (f == null || f >= to) throw new Error(`beat ${b.sceneIndex} shot ${k + 1}: motion cue "${phrase}" is not said inside the shot`);
      if (!props[pi]) throw new Error(`beat ${b.sceneIndex} shot ${k + 1}: no prop ${pi} for motion cue "${phrase}"`);
      props[pi].motionAt = f - from;
    }
    // the beat's own words stay on screen through the inner cuts (2026-11-09: B lost "A MASSIVE HEART ATTACK" at the cut
    // and with it the beat's point) — unless the author drops them with a reason (dropTexts)
    const from_ = starts[k], to_ = k + 1 < starts.length ? starts[k + 1] : scene.durationFrames;
    const texts = keep ? textsDuring(scene, from_, to_) : b.dropTexts ? [] : textsDuring(scene, from_, to_);
    return { from, to, shot: st.shot || scene.shot, bg: st.bg || {}, camera: st.camera, characters, props, texts, cutAt: k === 0 ? null : sh.at, ...(keep ? { kept: true } : {}) };
  });
}

/** every reason this contract may not ship (empty = valid) */
function validate(c, config, ctx = {}) {
  const E = [], err = (m) => E.push(m);
  const motifs = ctx.motifs || {}, cast = Object.keys((config.meta && config.meta.cast) || {});
  if (!c || c.schema !== SCHEMA) return [`schema must be "${SCHEMA}"`];
  const beats = Array.isArray(c.beats) ? c.beats : [];
  if (!beats.length) err("at least one beat");
  for (let k = 1; k < beats.length; k++) if (beats[k].sceneIndex !== beats[k - 1].sceneIndex + 1) err(`beats must be consecutive (${beats[k - 1].sceneIndex} → ${beats[k].sceneIndex})`);
  const idxs = beats.map((b) => b.sceneIndex);
  const narration = narrationOf(config, idxs), around = narrationOf(config, [idxs[0] - 1, ...idxs]);
  if (!c.evidence || !norm(narration).includes(norm(c.evidence))) err("evidence must be a VERBATIM quote of the beats' narration");
  // the author's reading (operator 2026-11-09): the beat's MAIN IDEA, how the chosen action makes it VISIBLE, and whether
  // the action IS that idea — a side detail (Free to Focus #5: the cash, not the heart-attack panic) keeps A
  const sentence = (x) => typeof x === "string" && x.trim().split(/\s+/).length >= 4;
  if (!sentence(c.mainIdea)) err("mainIdea: one sentence — what this beat is about (the narration's point, not the action)");
  if (!sentence(c.howShown)) err("howShown: one sentence — how the chosen action makes that idea visible");
  if (c.actionIsCentral !== true) err(`the action is not the beat's main idea (actionIsCentral ${JSON.stringify(c.actionIsCentral)}) — a side detail keeps A`);
  for (const b of beats) if (b.dropTexts != null && !sentence(b.dropTexts)) err(`beat ${b.sceneIndex}: dropTexts needs the reason the beat's own words may go (one sentence)`);
  for (const h of HARD) if (c.evidence && h.re.test(c.evidence)) err(`the evidence carries a ${h.kind} cue ("${(c.evidence.match(h.re) || [""])[0]}") — a sequence would stage it as a real event`);
  const looks = {};
  let compiled = [];
  for (const b of beats) {
    let shots;
    try { shots = compileBeat(config, b, motifs); } catch (e) { err(e.message); continue; }
    compiled.push({ sceneIndex: b.sceneIndex, shots, spec: b });
    for (const [k, sh] of shots.entries()) {
      const where = `beat ${b.sceneIndex} shot ${k + 1}`;
      if (sh.kept) continue;
      if ((b.shots[k].stage || {}).texts && b.shots[k].stage.texts.length) err(`${where}: no new on-screen words in a sequence (texts)`);
      for (const ch of sh.characters) {
        if (!cast.includes(ch.identity)) err(`${where}: "${ch.identity}" is not in the book's cast`);
        if (!ACTIONS.includes(ch.action)) err(`${where}: action "${ch.action}" is not an Antidote action`);
        // signing needs the paper on the table at a readable size: the full-body rig never reaches it (sign lab 2026-11-10)
        if (ch.action === "sign" && ch.body === "full") err(`${where}: "sign" needs a waist-up shot (medium / closeUp) — the hand, the pen and the signature are too small or out of reach in a full-body shot`);
        if (LEG_ACTIONS.includes(ch.action) && ch.body !== "full") err(`${where}: "${ch.action}" needs the legs — use a full-body shot (${FULL_SHOTS.join(", ")})`);
        if (CUED.includes(ch.action) && !(b.shots[k].cues && Object.values(b.shots[k].cues).length && ch.cueExact)) err(`${where}: "${ch.action}" must be cued on the narrator's word (cues)`);
        if (ch.holds && !named(HAND_WORDS[ch.holds] || [ch.holds], around)) err(`${where}: "${ch.holds}" is drawn but the narration never names it`);
        const look = JSON.stringify(ch.variant || {});
        if (looks[ch.identity] != null && looks[ch.identity] !== look) err(`${where}: "${ch.identity}" changes look between shots (one character, one look)`);
        looks[ch.identity] = look;
      }
      for (const [pi, p] of sh.props.entries()) {
        if (p._motif) { const m = motifs[p._motif]; if (!named(m.words || [p._motif], around)) err(`${where}: motif "${p._motif}" is drawn but the narration never names it (motifs.json words)`); }
        if (p.motion === "split" && p.motionAt != null && p.motionAt >= 0 && !(b.shots[k].motionCues && b.shots[k].motionCues[pi] != null)) err(`${where}: the split must be cued on the narrator's word (motionCues)`);
      }
    }
  }
  // carried state: a prop that STARTS split needs the split earlier in this contract, in the SAME set (the set-change rule)
  const seen = [];
  for (const cb of compiled) for (const [k, sh] of cb.shots.entries()) {
    const set = (sh.bg && sh.bg.set) || ((config.scenes[cb.sceneIndex].bg || {}).set);
    for (const p of sh.props) {
      if (p._motif && p.motion === "split" && p.motionAt < 0) {
        const src = seen.find((s) => s.motif === p._motif);
        if (!src) err(`beat ${cb.sceneIndex} shot ${k + 1}: "${p._motif}" starts split but no earlier shot of this sequence splits it`);
        else if (src.set !== set) err(`beat ${cb.sceneIndex} shot ${k + 1}: the set changes (${src.set} → ${set}) — the result cannot be carried there; keep it inside its own beat or keep A`);
      }
      if (p._motif && p.motion === "split" && p.motionAt >= 0) seen.push({ motif: p._motif, set });
    }
  }
  return E;
}

// the author's-reading errors (mainIdea / howShown / side detail): a DIAGNOSTIC preview may render past them — never apply
const AUTHOR_ERR = /^(mainIdea:|howShown:|the action is not the beat's main idea)/;

/** apply ONE contract atomically: every beat gets its shots, or none does (ctx.diagnostic: render-only, author errors waived) */
function apply(config, c, ctx = {}) {
  const errors = validate(c, config, ctx).filter((e) => !(ctx.diagnostic && AUTHOR_ERR.test(e)));
  if (errors.length) return { ok: false, errors };
  const scenes = config.scenes.slice(), previous = {};
  const contractHash = sha(c);
  for (const b of c.beats) {
    const shots = compileBeat(config, b, ctx.motifs || {});
    const before = config.scenes[b.sceneIndex];
    previous[b.sceneIndex] = before;
    scenes[b.sceneIndex] = { ...before, shots, _c19: { schema: SCHEMA, contractHash, beats: c.beats.map((x) => x.sceneIndex), author: c._author || null } };
  }
  return { ok: true, config: { ...config, scenes }, previous, contractHash };
}

/**
 * Overlapping winners (operator 2026-11-09): two sequences that both won their A/B may cover the same beat (20–21 and
 * 21–22). A beat can carry ONE sequence, and a sequence ships whole or not at all — so pick one WHOLE: the larger B−A
 * margin, then fewer wrong inferences with B, then the earlier first beat. Every other overlapping winner keeps A with
 * the reason naming the sequence that took its beat(s). `items`: [{sceneIndex, beats: [..], ab: {A, B, wiB}}].
 */
function resolveOverlaps(items) {
  const rank = [...items].sort((x, y) => ((y.ab.B - y.ab.A) - (x.ab.B - x.ab.A)) || ((x.ab.wiB || 0) - (y.ab.wiB || 0)) || (x.sceneIndex - y.sceneIndex));
  const taken = new Map(), chosen = [], kept = [];
  for (const it of rank) {
    const clash = it.beats.filter((b) => taken.has(b));
    if (!clash.length) { chosen.push(it); for (const b of it.beats) taken.set(b, it); continue; }
    const w = taken.get(clash[0]);
    kept.push({ sceneIndex: it.sceneIndex, keep: "A", why: `overlaps C19 sequence ${w.sceneIndex} (beats ${w.beats.join("+")}) on beat(s) ${clash.join(", ")} — that one won by more (B−A ${(w.ab.B - w.ab.A).toFixed(1)} vs ${(it.ab.B - it.ab.A).toFixed(1)}); a beat carries one sequence, chosen whole` });
  }
  return { chosen: chosen.sort((a, b) => a.sceneIndex - b.sceneIndex), kept };
}

/** is this contract live in the config (every beat carries its shots with this contract's hash)? */
const isLive = (config, entry) => entry.beats.every((i) => { const s = config.scenes[i]; return s && s.shots && s._c19 && s._c19.contractHash === entry.contractHash; });

module.exports = { AUTHOR_ERR, SCHEMA, CUED, ACTIONS, HAND_WORDS, FULL_SHOTS, SMALL_HAND, SMALL_SCALE, textsDuring, compileBeat, validate, apply, isLive, resolveOverlaps };
