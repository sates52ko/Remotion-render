#!/usr/bin/env node
// Single-relation cause → visible effect (capability, cycle 13, default OFF).  node scripts/test-single-relation.js
// Fixtures B05 / B17 (cycle 11) and C24 (cycle 12) are the real misreads the claim-safety rules exist for; they are
// development / regression data, never ship evidence.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const R = require("./lib/single-relation");
const ROOT = path.join(__dirname, "..");
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("  ok", name); };
const has = (errs, re) => errs.some((e) => re.test(e));

const narration = "Every notification pulls you out of deep work, so by noon your focus is drained and the hard project never gets touched.";
const ctx = { narration, cast: ["you"], castNames: ["You"] };
const base = () => ({
  schema: R.SCHEMA, type: "B",
  understanding: "Each notification takes focus until none is left.",
  evidence: "Every notification pulls you out of deep work, so by noon your focus is drained",
  claim: { asserted: "Notifications drain your focus.", polarity: "asserted", speaker: "narrator", notAsserted: [] },
  before: "a full focus tank beside the phone", transformation: "each ping drains the tank", after: "the tank is empty",
  camera: { framing: "wide-locked", purpose: "phone and tank in one frame" },
  entities: [{ id: "phone", kind: "object", glyph: "smartphone", label: "notification" }, { id: "focus", kind: "stock", label: "focus", value: 1 }],
  events: [{ at: 0.3, cause: "phone", effects: [{ entity: "focus", value: 0.1 }], repeat: 3 }],
  required: ["the phone", "the focus level falling"], omitted: ["noon", "the hard project"],
});
const scene = { id: "s1", fromFrame: 100, durationFrames: 240, bg: { kind: "office" }, transition: { type: "cut", frames: 0 }, characters: [{ role: "x" }], texts: [{ text: "hi" }], props: [] };

ok("a well-formed cause → effect contract validates", () => assert.deepStrictEqual(R.validate(base(), ctx), []));

ok("compile: same id / timing / set, the stage replaces cast / texts, field is singleRelation (not semantic)", () => {
  const s = R.compile(base(), scene);
  assert.strictEqual(s.id, "s1"); assert.strictEqual(s.fromFrame, 100); assert.strictEqual(s.durationFrames, 240);
  assert.deepStrictEqual(s.bg, scene.bg); assert.deepStrictEqual(s.characters, []); assert.deepStrictEqual(s.texts, []);
  assert.strictEqual(s.semantic, undefined); assert.strictEqual(s.singleRelation.capability, R.SCHEMA);
  assert(s.singleRelation.occ.length === 3 && s.singleRelation.occ.every((o) => o.cue + 50 <= 0.88 * 240 + 1));
});

ok("compile keeps the source scene's HUD and narration metadata (cycle 14: a dropped hud changed the insight badge)", () => {
  const src = { ...scene, hud: { insight: 7, of: 8, label: "CLOSE" }, _narration: "x", _beat: "story" };
  const s2 = R.compile(base(), src);
  assert.deepStrictEqual(s2.hud, src.hud); assert.strictEqual(s2._narration, "x"); assert.strictEqual(s2._beat, "story");
});

ok("deterministic: compiling twice gives byte-identical output; no clock / randomness in the capability path", () => {
  assert.strictEqual(JSON.stringify(R.compile(base(), scene)), JSON.stringify(R.compile(base(), scene)));
  for (const f of ["scripts/lib/single-relation.js", "scripts/lib/semantic-director.js", "src/engines/antidote/components/SemanticStage.tsx"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert(!/Math\.random|Date\.now|new Date\(|performance\.now/.test(src), `${f} uses a clock or randomness`);
  }
});

ok("one relation: two events, five entities or a second lane are refused", () => {
  const c = base(); c.events.push({ at: 0.6, cause: "phone", effects: [{ entity: "focus", value: 0.5 }] });
  assert(has(R.validate(c, ctx), /exactly one event/));
  const d = base(); d.entities.push(...["a", "b", "c"].map((id) => ({ id, kind: "stock", label: "focus", value: 0.5 })));
  assert(has(R.validate(d, ctx), /at most 4 entities/));
});

ok("no duplicated object: the same glyph / label / cast twice is refused", () => {
  const c = base(); c.entities.push({ id: "phone2", kind: "object", glyph: "smartphone", label: "notification" });
  assert(has(R.validate(c, ctx), /duplicates/));
});

ok("source-grounded causality: an effect not stated where the evidence is is refused (no false consequence)", () => {
  const far = { ...ctx, narration: narration + " Meanwhile the office is quiet. Two weeks later your salary is cut." };
  const c = base(); c.entities.push({ id: "pay", kind: "stock", label: "salary", value: 1 });
  c.events[0].effects = [{ entity: "pay", value: 0.1 }];
  assert(has(R.validate(c, far), /not named where the evidence is/));
  const near = base(); near.entities.push({ id: "proj", kind: "stock", label: "project", value: 1 }); near.events[0].effects = [{ entity: "proj", value: 0.1 }];
  assert(!has(R.validate(near, ctx), /not named where/), "an effect stated in the evidence's sentence is grounded");
});
ok("a person may be named by a pronoun where the evidence is; an object may not", () => {
  const k = { narration: "Buffett is infuriated. He feels Stanton lied to him.", cast: ["buffett"], castNames: ["Buffett"], castLabels: { buffett: "Buffett" } };
  const c = { ...base(), type: "A", evidence: "He feels Stanton lied to him", claim: { asserted: "Stanton lied to Buffett.", polarity: "asserted", notAsserted: [] },
    entities: [{ id: "s", kind: "object", glyph: "mask", label: "Stanton" }, { id: "b", kind: "person", cast: "buffett", mood: "neutral" }],
    events: [{ at: 0.3, cause: "s", effects: [{ entity: "b", mood: "angry" }] }] };
  assert(!has(R.validate(c, k), /not named where/));
});
ok("rhetorical question answered in the evidence is not a question cue; a claim that IS a question is", () => {
  const k = { narration: "Reading builds empathy. How does that work? Because when you read a novel, you simulate another mind.", cast: [], castNames: [] };
  const c = { ...base(), evidence: "How does that work? Because when you read a novel", claim: { asserted: "Reading novels builds empathy.", polarity: "asserted", notAsserted: [] },
    entities: [{ id: "n", kind: "object", glyph: "book", label: "novel" }, { id: "e", kind: "stock", label: "empathy", value: 0.2 }],
    events: [{ at: 0.3, cause: "n", effects: [{ entity: "e", value: 0.9 }] }] };
  assert(!has(R.validate(c, k), /question cue/));
  assert(has(R.validate({ ...c, evidence: "Because when you read a novel, you simulate another mind?" }, { ...k, narration: k.narration.replace("another mind.", "another mind?") }), /question cue/));
});

ok("type B without the narration's causal link is refused (v1 rule kept)", () => {
  const c = base(); c.evidence = "your focus is drained and the hard project never gets touched";
  assert(has(R.validate(c, ctx), /causal link/));
});

ok("hypothetical / negated polarity cannot be staged", () => {
  for (const p of ["hypothetical", "negated"]) { const c = base(); c.claim.polarity = p; assert(has(R.validate(c, ctx), /cannot be staged/)); }
});

// ── C24 (cycle 12): a proposed scheme drawn as a thrown bomb → "hypothetical/planned event realized as fact" ──
const C24 = { narration: "crazy schemes. I mean, someone literally proposed throwing specialized stink bombs over the 15t wall to see how the occupants reacted.", cast: ["analyst"], castNames: ["Analyst"], castLabels: { analyst: "someone" } };
ok("C24: staging the content of a proposal is refused (planned event ≠ fact)", () => {
  const c = { schema: R.SCHEMA, type: "A", understanding: "Someone proposed throwing stink bombs over the wall.",
    evidence: "someone literally proposed throwing specialized stink bombs over the 15t wall",
    claim: { asserted: "Someone proposed throwing stink bombs over the wall.", polarity: "asserted", speaker: "narrator", notAsserted: [], cueCheck: "'I mean ... literally' only stresses that the proposal was real." },
    before: "b", transformation: "t", after: "a", camera: { purpose: "consequence" },
    entities: [{ id: "a", kind: "person", cast: "analyst" }, { id: "b", kind: "object", glyph: "crash", label: "stink bombs" }, { id: "w", kind: "object", glyph: "home", label: "wall" }],
    events: [{ at: 0.3, cause: "a", effects: [{ entity: "b", moveTo: "w" }] }], required: ["x"], omitted: [] };
  assert(has(R.validate(c, C24), /planned \/ hypothetical cue/));
});
ok("C24: the same beat as a quote card validates", () => {
  const c = { schema: R.SCHEMA, type: "H", understanding: "One proposed scheme: stink bombs over the wall.",
    evidence: "someone literally proposed throwing specialized stink bombs over the 15t wall", text: "someone literally proposed throwing specialized stink bombs over the 15t wall",
    claim: { asserted: "Someone proposed throwing stink bombs over the wall.", polarity: "asserted", speaker: "narrator", notAsserted: [{ text: "throwing specialized stink bombs over the 15t wall", kind: "planned" }] },
    camera: { purpose: "the quote alone" }, required: ["the proposal"], omitted: [] };
  assert.deepStrictEqual(R.validate(c, C24), []);
});

// ── B05 (cycle 11): a rejected premise put on the quote card read as the narrator's concession ──
const B05 = { narration: "to See, I hear your point about her intellect being useless against his psychopathy. But I have to interject here because her brain", cast: [], castNames: [] };
const b05 = (text, na) => ({ schema: R.SCHEMA, type: "H", understanding: "The speaker pushes back: her brain did help.", evidence: text, text,
  claim: { asserted: "Her brain did help her.", polarity: "asserted", speaker: "narrator", notAsserted: na }, camera: { purpose: "quote" }, required: ["x"], omitted: [] });
ok("B05: the premise on a card without resolving its rejected-premise cue is refused (no cueCheck override)", () => {
  const c = b05("I hear your point about her intellect being useless against his psychopathy", []); c.claim.cueCheck = "the speaker restates the point before answering";
  assert(has(R.validate(c, B05), /rejected-premise cue/));
});
ok("B05: the rejected premise cannot be the quote card", () => {
  const c = b05("I hear your point about her intellect being useless against his psychopathy", [{ text: "I hear your point about her intellect being useless against his psychopathy", kind: "rejected-premise" }]);
  assert(has(R.validate(c, B05), /does not assert/));
});
ok("B05: the pushback as the quote card validates", () => {
  assert.deepStrictEqual(R.validate(b05("But I have to interject here because her brain", [{ text: "I hear your point about her intellect being useless against his psychopathy", kind: "rejected-premise" }]), B05), []);
});

// ── B17 (cycle 11): "don't force a binary choice" — the rejected half must not be drawn as the event ──
const B17 = { narration: "When the deep values are irreconcilable, don't force a binary choice that crushes one of them. Let the conflict of values force you to widen the map before you choose.", cast: [], castNames: [] };
const b17 = () => ({ schema: R.SCHEMA, type: "B", understanding: "The conflict of values makes you widen the map.",
  evidence: "Let the conflict of values force you to widen the map",
  claim: { asserted: "The conflict should make you widen the map.", polarity: "contrast", speaker: "narrator", notAsserted: [{ text: "don't force a binary choice that crushes one of them", kind: "setup-half-of-contrast" }] },
  before: "a small map beside the conflict", transformation: "the conflict widens the map", after: "a wide map", camera: { purpose: "both in one frame" },
  entities: [{ id: "v", kind: "object", glyph: "balance", label: "conflict" }, { id: "m", kind: "stock", label: "map", value: 0.3 }],
  events: [{ at: 0.3, cause: "v", effects: [{ entity: "m", value: 0.9 }] }], required: ["x"], omitted: [] });
ok("B17: the asserted half validates", () => assert.deepStrictEqual(R.validate(b17(), B17), []));
ok("B17: evidence from the negated half is refused (it is listed as not asserted)", () => {
  const c = b17(); c.evidence = "don't force a binary choice that crushes one of them";
  assert(has(R.validate(c, B17), /does not assert/));
});
ok("B17: a negation in the evidence of an ASSERTED claim (no contrast resolved) cannot be staged", () => {
  const c = b17(); c.evidence = "don't force a binary choice that crushes one of them"; c.claim = { asserted: "Do not force a binary choice.", polarity: "asserted", notAsserted: [] };
  assert(has(R.validate(c, B17), /negation cue/));
});
ok("B17: a 'binary choice' entity taken from the rejected half is refused", () => {
  const c = b17(); c.entities.push({ id: "x", kind: "object", glyph: "sword", label: "binary choice" });
  assert(has(R.validate(c, B17), /does not assert/));
});

// ── deep-work 250 (cycle 14 real-book preview): a "without <doing>" clause drawn as the effect read as its opposite ──
ok("deep-work 250: 'without demanding focus' cannot be staged as focus falling", () => {
  const k = { narration: "Like nature. Nature is great for this, even if it's freezing, because it engages your mind softly without demanding focus.", cast: [], castNames: [] };
  const c = { ...base(), evidence: "Nature is great for this, even if it's freezing, because it engages your mind softly without demanding focus",
    claim: { asserted: "Nature engages the mind softly.", polarity: "asserted", notAsserted: [] },
    entities: [{ id: "n", kind: "object", glyph: "tree", label: "nature" }, { id: "f", kind: "stock", label: "focus", value: 0.8 }],
    events: [{ at: 0.3, cause: "n", effects: [{ entity: "f", value: 0.2 }] }] };
  assert(has(R.validate(c, k), /negation cue .*without demanding/));
});

ok("quoted speech on a card needs the speaker, and the speaker reaches the screen", () => {
  const nar = 'Her coach told her "you will never make the team" and she quit the next day.';
  const c = { schema: R.SCHEMA, type: "H", understanding: "Her coach said she would never make the team.", evidence: "you will never make the team", text: '"you will never make the team"',
    claim: { asserted: "Her coach told her she would never make the team.", polarity: "asserted", notAsserted: [{ text: "you will never make the team", kind: "quoted-speech" }] }, camera: { purpose: "quote" }, required: ["x"], omitted: [] };
  const k = { narration: nar, cast: [], castNames: [] };
  assert(has(R.validate(c, k), /speaker/));
  c.claim.notAsserted = []; c.claim.speaker = "her coach"; c.claim.cueCheck = "the quote is reported as said, not as true";
  assert.deepStrictEqual(R.validate(c, k), []);
  assert.strictEqual(R.compile(c, scene).singleRelation.speaker, "her coach");
});

ok("default OFF: the renderer draws singleRelation only behind meta.singleRelation === true", () => {
  const sceneSrc = fs.readFileSync(path.join(ROOT, "src/engines/antidote/components/Scene.tsx"), "utf8");
  const indexSrc = fs.readFileSync(path.join(ROOT, "src/engines/antidote/index.tsx"), "utf8");
  assert(/const rel = singleRelation \? \(scene as \{ singleRelation\?: SemanticCompiled \}\)\.singleRelation : undefined;/.test(sceneSrc));
  assert(/singleRelation = false \}/.test(sceneSrc), "Scene's flag must default to false");
  assert(/singleRelation=\{\(config\.meta as \{ singleRelation\?: boolean \}\)\.singleRelation === true\}/.test(indexSrc));
  assert(!/scene\.semantic\b/.test(sceneSrc), "the research field scene.semantic must not be drawn by production code");
  const cfg = { meta: { slug: "x" }, scenes: [] };
  assert.strictEqual(R.enable(cfg).meta.singleRelation, true); assert.strictEqual(cfg.meta.singleRelation, undefined);
});

ok("no production config opts in (the capability changes no shipped or planned book)", () => {
  const books = path.join(ROOT, "books");
  const hits = [];
  for (const slug of fs.existsSync(books) ? fs.readdirSync(books) : []) {
    const p = path.join(books, slug, "config.antidote.json");
    if (!fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, "utf8");
    if (/"singleRelation"\s*:/.test(s)) hits.push(slug);
  }
  assert.deepStrictEqual(hits, []);
});

// ── relational motion (cycle 16): a declared mechanism must match what the event does ──
ok("mechanism: depletion needs a falling level; a rising one is refused (motion on the right entity, right direction)", () => {
  const c = base(); c.mechanism = "depletion"; assert.deepStrictEqual(R.validate(c, ctx), []);
  const d = base(); d.mechanism = "recovery"; assert(has(R.validate(d, ctx), /mechanism "recovery"/));
});
ok("mechanism: transfer needs an object that moves to another entity; removal needs a disappearance plus a change", () => {
  const c = base(); c.mechanism = "transfer"; assert(has(R.validate(c, ctx), /mechanism "transfer"/));
  const r = base(); r.mechanism = "removal"; r.events[0].effects = [{ entity: "phone", present: false }, { entity: "focus", value: 0.1 }]; r.events[0].repeat = 1;
  assert.deepStrictEqual(R.validate(r, ctx), []);
  const u = base(); u.mechanism = "teleport"; assert(has(R.validate(u, ctx), /mechanism must be one of/));
});
ok("review: both ends carried by their label alone and nothing moving → TRY_CONCRETE; a literal object or a person → OK (advisory, validity unchanged)", () => {
  const lab = { ...base(), entities: [{ id: "c", kind: "object", glyph: "mask", label: "laughed at" }, { id: "e", kind: "stock", label: "terror", value: 0.9 }], events: [{ at: 0.3, cause: "c", effects: [{ entity: "e", value: 0.1 }] }] };
  assert.strictEqual(R.review(lab).verdict, "TRY_CONCRETE");
  assert.strictEqual(R.review(base()).verdict, "OK", "a smartphone labelled 'notification' is literal");
  const person = { ...lab, entities: [{ id: "c", kind: "person", cast: "you" }, lab.entities[1]] };
  assert.strictEqual(R.review(person).verdict, "OK");
  const leaves = { ...lab, events: [{ at: 0.3, cause: "c", effects: [{ entity: "c", present: false }, { entity: "e", value: 0.1 }] }] };
  assert.strictEqual(R.review(leaves).verdict, "OK", "something visibly leaves");
});

// ── apply-single-relation.js: the only writer of the field ──
const { apply, narrationOf } = require("./apply-single-relation");
const book = () => ({ meta: { slug: "test-book", cast: {} }, captions: [{ text: "Every notification pulls you out of deep work, so by noon your focus is drained", startFrame: 100, endFrame: 250 }, { text: "and the hard project never gets touched.", startFrame: 250, endFrame: 340 }, { text: "Later on.", startFrame: 400, endFrame: 450 }],
  scenes: [{ id: "a", fromFrame: 0, durationFrames: 100, bg: {}, characters: [], texts: [], props: [] }, { ...scene, id: "b", fromFrame: 100, durationFrames: 240 }] });
ok("apply: narration of a scene = the captions inside its frames", () => assert.strictEqual(narrationOf(book(), book().scenes[1]), narration));
ok("apply: a valid contract compiles into its scene and opts the book in; other scenes untouched", () => {
  const b = book(); const r = apply(b, { 1: base() });
  assert(r.ok); assert.strictEqual(r.config.meta.singleRelation, true); assert(r.config.scenes[1].singleRelation); assert.deepStrictEqual(r.config.scenes[0], b.scenes[0]);
  assert.strictEqual(b.meta.singleRelation, undefined, "the input config is not mutated");
});
ok("apply: one invalid contract refuses the whole apply; a published book is refused", () => {
  const bad = base(); bad.evidence = "notifications destroy your focus";
  const r = apply(book(), { 1: base(), 0: bad }); assert(!r.ok && r.errors.some((e) => /scene 0/.test(e)) && !r.config);
  assert(!apply(book(), { 1: base() }, { published: true }).ok);
});

// ── relational motion 2.0 + multi-phase single-frame storytelling (cycle 18) ──
const D = require("./lib/semantic-director");
const ev1 = (effects, extra = {}) => ({ ...base(), events: [{ at: 0.3, cause: "phone", effects, ...extra }] });
const errs = (c) => R.validate(c, ctx);
ok("overload: a stock filled to the top in steps may overflow; not short of the rim; the mechanism needs the steps", () => {
  const good = { ...ev1([{ entity: "focus", value: 1, overflow: true }], { repeat: 3 }), mechanism: "overload", entities: [base().entities[0], { id: "focus", kind: "stock", label: "focus", value: 0.2 }] };
  assert.deepStrictEqual(errs(good), []);
  assert(errs({ ...good, events: [{ ...good.events[0], effects: [{ entity: "focus", value: 0.7, overflow: true }] }] }).some((e) => /overflow needs/.test(e)));
  assert(errs({ ...good, events: [{ ...good.events[0], repeat: 1 }] }).some((e) => /mechanism "overload"/.test(e)));
});
ok("passage: a move routed via an obstacle needs the obstacle removed first; mergeInto / from are checked", () => {
  const ents = [{ id: "phone", kind: "object", glyph: "smartphone", label: "notification" }, { id: "wall", kind: "object", glyph: "boulder", label: "deep work" }, { id: "focus", kind: "stock", label: "focus", value: 1 }];
  const blocked = { ...base(), entities: ents, events: [{ at: 0.3, cause: "phone", effects: [{ entity: "phone", moveTo: "focus", via: "wall" }] }] };
  assert(errs(blocked).some((e) => /still in the way/.test(e)));
  const open = { ...blocked, mechanism: "passage", events: [{ at: 0.3, cause: "phone", effects: [{ entity: "wall", present: false }, { entity: "phone", moveTo: "focus", via: "wall" }] }] };
  assert.deepStrictEqual(errs(open).filter((e) => /via|still|mechanism/.test(e)), []);
  const merge = { ...base(), mechanism: "merge", entities: ents.slice(0, 2), events: [{ at: 0.3, cause: "phone", effects: [{ entity: "phone", mergeInto: "wall" }] }] };
  assert.deepStrictEqual(errs(merge).filter((e) => /merge|mechanism/.test(e)), []);
  const split = { ...base(), mechanism: "split", entities: [ents[0], { ...ents[1], present: false }], events: [{ at: 0.3, cause: "phone", effects: [{ entity: "wall", present: true, from: "phone" }] }] };
  assert.deepStrictEqual(errs(split).filter((e) => /from|mechanism/.test(e)), []);
  assert(errs({ ...split, events: [{ at: 0.3, cause: "phone", effects: [{ entity: "wall", from: "phone" }] }] }).some((e) => /from needs present: true/.test(e)));
});
ok("phases: 2–3 events only with phases: true and word anchors that are verbatim narration", () => {
  const two = { ...base(), events: [{ at: 0.2, cause: "phone", effects: [{ entity: "focus", value: 0.5 }], anchors: { cause: "every notification" } }, { at: 0.5, cause: "phone", effects: [{ entity: "focus", value: 0.1 }], anchors: { effect: "focus is drained" } }] };
  assert(errs(two).some((e) => /exactly one event/.test(e)));
  assert.deepStrictEqual(errs({ ...two, phases: true }), []);
  assert(errs({ ...two, phases: true, events: [two.events[0], { ...two.events[1], anchors: { effect: "focus is gone" } }] }).some((e) => /not a verbatim phrase/.test(e)));
  assert(errs({ ...two, phases: true, events: [two.events[0], { ...two.events[1], anchors: undefined }] }).some((e) => /every event needs anchors/.test(e)));
});
ok("word-anchored timing: cause marked when said, change not before the effect is said; a missing anchor → fraction timing for the whole contract", () => {
  const W = [{ w: "Every", s: 10 }, { w: "notification", s: 20 }, { w: "pulls", s: 40 }, { w: "your", s: 120 }, { w: "focus", s: 130 }, { w: "is", s: 140 }, { w: "drained", s: 150 }];
  const c = { ...base(), events: [{ ...base().events[0], repeat: 1, anchors: { cause: "every notification", effect: "focus is drained" } }] };
  const o = D.timeline(c, 300, W);
  assert.strictEqual(o.source, "anchored"); assert.strictEqual(o[0].cue, 10); assert(o[0].cue + D.TIMING.token + o[0].pause >= 130, JSON.stringify(o));
  const miss = D.timeline({ ...c, events: [{ ...c.events[0], anchors: { cause: "never said" } }] }, 300, W);
  assert(/^fraction \(anchor/.test(miss.source)); assert.strictEqual(miss[0].cue, Math.round(0.3 * 300));
  const plain = D.timeline(base(), 300, W);
  assert.strictEqual(plain.source, "fraction");
  assert.strictEqual(JSON.stringify(D.timeline(base(), 300)), JSON.stringify(plain));
});
ok("compile: anchored contracts record timingSource; one-event contracts without anchors compile byte-identically to before", () => {
  const W = [{ w: "Every", s: 10 }, { w: "notification", s: 20 }];
  const plain = R.compile(base(), scene), withWords = R.compile(base(), scene, { words: W });
  assert.strictEqual(JSON.stringify(plain), JSON.stringify(withWords));
  const anch = R.compile({ ...base(), events: [{ ...base().events[0], anchors: { cause: "every notification" } }] }, scene, { words: W });
  assert.strictEqual(anch.singleRelation.timingSource, "anchored");
});

// ── production timing rule (cycle 18, operator) ──
const breakC = () => ({ type: "B", entities: [{ id: "p", kind: "person" }, { id: "o", kind: "object", glyph: "boulder" }], events: [{ at: 0.4, cause: "p", anchors: { cause: "you push harder", effect: "breaks" }, effects: [{ entity: "o", broken: true }] }] });
const W190 = [{ w: "You", s: 100 }, { w: "push", s: 110 }, { w: "harder,", s: 120 }, { w: "and", s: 170 }, { w: "it", s: 180 }, { w: "breaks.", s: 190 }];
ok("REGRESSION 190/174: an anchor at frame 190 in a 200-frame beat used to give an 'anchored' change at 174 — now UNFIT, never earlier than the words", () => {
  const o = D.timeline(breakC(), 200, W190);
  assert(/^fraction \(unfit/.test(o.source), o.source);
  const v = R.verifyTiming(breakC(), { durationFrames: 200 }, W190);
  assert.strictEqual(v.ok, false); assert(/unfit/.test(v.reason), v.reason);
  // with room, the change starts exactly when "breaks" is said
  const ok2 = R.verifyTiming(breakC(), { durationFrames: 260 }, W190);
  assert(ok2.ok && ok2.events[0].effectAt === 190 && ok2.events[0].changeStart >= 190, JSON.stringify(ok2));
});
ok("timing: a phrase said twice is matched in context (the effect after its own cause)", () => {
  const W = [{ w: "the", s: 10 }, { w: "water", s: 20 }, { w: "then", s: 60 }, { w: "the", s: 70 }, { w: "phone", s: 80 }, { w: "goes", s: 90 }, { w: "in", s: 95 }, { w: "the", s: 100 }, { w: "water", s: 110 }];
  assert.strictEqual(D.findPhrase(W, "the water"), 10); assert.strictEqual(D.findPhrase(W, "the water", 80), 100);
  const c = { type: "B", entities: [{ id: "f", kind: "object", glyph: "phone" }, { id: "w", kind: "object", glyph: "water" }], events: [{ at: 0.3, cause: "f", anchors: { cause: "phone", effect: "the water" }, effects: [{ entity: "f", moveTo: "w" }] }] };
  const o = D.timeline(c, 300, W); assert.strictEqual(o.effectAt[0], 100);
});
ok("timing: no author anchor → the result is derived from the evidence; a forward clause ('so … that she snaps') anchors on the evidence's end", () => {
  const c = { type: "B", evidence: "The load so unbearable that she just snaps", entities: [{ id: "t", kind: "person" }, { id: "l", kind: "stock", label: "load", value: 0.2 }], events: [{ at: 0.2, cause: "t", effects: [{ entity: "l", value: 1 }] }] };
  const W = [{ w: "The", s: 0 }, { w: "load", s: 7 }, { w: "so", s: 40 }, { w: "unbearable", s: 50 }, { w: "that", s: 75 }, { w: "she", s: 85 }, { w: "just", s: 100 }, { w: "snaps", s: 110 }];
  const v = R.verifyTiming(c, { durationFrames: 220 }, W);
  assert(v.ok, v.reason); assert.strictEqual(v.events[0].effect, "she just snaps"); assert(v.events[0].changeStart >= 85, JSON.stringify(v.events));
  const none = R.verifyTiming({ ...c, entities: [c.entities[0], { ...c.entities[1], label: "pressure" }] }, { durationFrames: 220 }, W);
  assert.strictEqual(none.ok, false); assert(/result phrase is not found/.test(none.reason));
});
ok("timing: a repeated (build-up) event holds only its LAST step to the result words", () => {
  const c = { type: "B", entities: [{ id: "t", kind: "person" }, { id: "l", kind: "stock", value: 0.2 }], events: [{ at: 0.2, cause: "t", repeat: 3, anchors: { effect: "snaps" }, effects: [{ entity: "l", value: 1, overflow: true }] }] };
  const W = [{ w: "until", s: 90 }, { w: "it", s: 100 }, { w: "snaps", s: 110 }];
  const o = D.timeline(c, 240, W);
  assert.strictEqual(o.source, "anchored");
  const T = D.TIMING, last = o[o.length - 1];
  assert(last.cue + T.token + last.pause >= 110 && o[0].cue + T.token + o[0].pause < 110, JSON.stringify(o));
});

console.log(`single-relation: ${n} passed`);
