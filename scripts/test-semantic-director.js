#!/usr/bin/env node
// Semantic Film Director 1.0 (cycle 11, dev/c11): the contract's visibility rules are compiler errors, and the compiled
// timeline puts every change on screen before the beat ends.  node scripts/test-semantic-director.js
const assert = require("assert");
const D = require("./lib/semantic-director");
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("  ok", name); };
const narration = "Every notification pulls you out of deep work, so by noon your focus is drained and the hard project never gets touched.";
const ctx = { narration, cast: ["you"], castNames: ["You"] };
const base = () => ({
  schema: "semantic-director/1", type: "B", representation: "cause-pause-effect",
  understanding: "Each notification takes a chunk of focus until none is left for the hard project.",
  evidence: "pulls you out of deep work, so by noon your focus is drained",
  before: "a full focus tank beside the phone", transformation: "each ping drains the tank", after: "the tank is empty, the project untouched",
  camera: { framing: "wide-locked", purpose: "keep the phone and the tank in one frame so the drain is seen as caused by the pings" },
  entities: [{ id: "phone", kind: "object", glyph: "smartphone", label: "notification" }, { id: "focus", kind: "stock", label: "focus", value: 1 }],
  events: [{ at: 0.3, cause: "phone", effects: [{ entity: "focus", value: 0.1 }], repeat: 3 }],
  required: ["the phone", "the focus level falling with each ping"], omitted: ["noon", "the hard project"],
});
const errs = (c) => D.validate(c, ctx);

ok("a well-formed B contract validates", () => assert.deepStrictEqual(errs(base()), []));
ok("evidence must be verbatim", () => { const c = base(); c.evidence = "notifications destroy your focus"; assert(errs(c).some((e) => /VERBATIM/.test(e))); });
ok("B without a stated causal link is refused (no invented causality)", () => {
  const c = base(); c.evidence = "the hard project never gets touched"; assert(errs(c).some((e) => /causal link/.test(e)));
});
ok("an effect that changes nothing visible is refused", () => { const c = base(); c.events[0].effects[0].value = 0.9; c.events[0].repeat = 1; assert(errs(c).some((e) => /not a visible change/.test(e))); });
ok("colour / highlight / zoom are not state changes", () => { const c = base(); c.events[0].effects = [{ entity: "focus", color: "red" }]; assert(errs(c).some((e) => /not a state change/.test(e))); });
ok("A/B effect on the cause only is refused", () => { const c = base(); c.events[0].effects = [{ entity: "phone", present: false }]; c.events[0].repeat = 1; assert(errs(c).some((e) => /other than the cause/.test(e))); });
ok("labels: ≤ 2 words, narration's own", () => {
  const c = base(); c.entities[1].label = "mental energy"; assert(errs(c).some((e) => /narration's own words/.test(e)));
  c.entities[1].label = "your deep focus"; assert(errs(c).some((e) => /at most 2 words/.test(e)));
});
ok("A–F without an event is refused", () => { const c = base(); c.type = "F"; c.representation = "concept-model"; c.events = []; assert(errs(c).some((e) => /at least one event/.test(e))); });
ok("D needs two lanes on the same measure", () => {
  const c = base(); c.type = "D"; c.representation = "same-scale"; c.lanes = 2;
  c.entities = [{ id: "a", kind: "stock", label: "focus", value: 1, lane: 0 }, { id: "b", kind: "group", label: "project", value: 0.5, lane: 1 }];
  c.events = [{ at: 0.3, cause: "a", effects: [{ entity: "a", value: 0.2 }] }];
  assert(errs(c).some((e) => /SAME kind/.test(e)));
  c.entities[1].kind = "stock"; assert.deepStrictEqual(errs(c), []);
});
ok("H is a short quote of the narration", () => {
  const c = { schema: "semantic-director/1", type: "H", representation: "quote", understanding: "The project never gets touched.", evidence: "the hard project never gets touched",
    camera: { purpose: "hold the line" }, text: "the hard project never gets touched", required: ["the line"], omitted: [] };
  assert.deepStrictEqual(errs(c), []);
  c.text = "productivity is a myth invented by managers"; assert(errs(c).some((e) => /narration's own words/.test(e)));
});
ok("unknown cast / glyph / mood are refused", () => {
  const c = base(); c.entities.push({ id: "p", kind: "person", cast: "boss" }); c.entities[0].glyph = "rocket";
  c.events[0].effects.push({ entity: "p", mood: "furious" });
  const e = errs(c); assert(e.some((x) => /not in this book's cast/.test(x)) && e.some((x) => /vocabulary/.test(x)) && e.some((x) => /mood must be/.test(x)));
});
ok("compile: repeats step the level, every change ends by 88 % of the beat", () => {
  const sc = D.compile(base(), { id: "s9", fromFrame: 900, durationFrames: 240, bg: { type: "flat", colors: ["#fff"] }, transition: { type: "cut", frames: 10 } });
  assert.strictEqual(sc.id, "s9"); assert.strictEqual(sc.shot, "wide"); assert.deepStrictEqual(sc.characters, []);
  const occ = sc.semantic.occ; assert.strictEqual(occ.length, 3);
  const vals = occ.map((o) => +o.effects[0].value.toFixed(3)); assert.deepStrictEqual(vals, [0.7, 0.4, 0.1]);
  const T = sc.semantic.timing; for (const o of occ) assert(o.cue + T.token + T.pause + T.change <= 0.88 * 240 + 1e-9);
});
ok("compile: a late event is pulled forward so its change is seen", () => {
  const c = base(); c.events[0].at = 0.75; c.events[0].repeat = 1;
  const sc = D.compile(c, { id: "s", fromFrame: 0, durationFrames: 220, bg: {}, transition: {} });
  const o = sc.semantic.occ[0], T = sc.semantic.timing; assert(o.cue + T.token + T.pause + T.change <= 0.88 * 220);
});
console.log(`semantic-director: ${n} passed`);
