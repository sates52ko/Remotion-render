#!/usr/bin/env node
/** test-own-fallback.js — two blind rounds, then the fallback (2026-11-23): the judge counts rounds, the second miss
 *  moves the drawing aside in the data, every reader sees no drawing and nothing blocks; a redraw takes it back.
 *  No render, no network. */
const assert = require("assert");
const OD = require("./lib/own-drawings");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const P = (c) => [{ d: "M20 20 H500 V500 H20 Z", fill: c }, { d: "M60 60 H460 V460 H60 Z", fill: "paper" }, { d: "M100 100 L420 100 L260 420 Z", fill: "ink" }];
const BD = (c) => [{ d: "M0 0 H1200 V675 H0 Z", fill: c }, { d: "M0 420 H1200 V675 H0 Z", fill: "ink" }, { d: "M100 120 H500 V420 H100 Z", fill: "paper" }];
const book = () => ({
  rucksack: { kind: "thing", label: "Rucksack", glyph: "bag", reads: ["rucksack", "backpack"], paths: P("red"), states: { torn: { reads: ["torn rucksack"], paths: P("accent") } } },
  street: { kind: "place", label: "The street", reads: ["street"], home: true, backdrop: { reads: ["street", "road"], paths: BD("sky") } },
  noelle: { kind: "person", label: "Noelle", reads: ["woman in a hood"], look: { suit: "#556B2F", drawn: { hair: P("hair") } } },
});
const draw = (e) => OD.resolveEntities(e, { motifs: {}, palette: OD.DEFAULT_PALETTE });

t("judge: a miss is round 1; the same drawing judged again is still round 1; a redrawn miss is round 2 and the fallback", () => {
  const d0 = draw(book()).drawings, street = d0.find((d) => d.key === "street@backdrop");
  const v1 = OD.judge(d0, { [street.n || d0.indexOf(street) + 1]: "row houses" });
  assert.strictEqual(v1.drawings["street@backdrop"].rounds, 1); assert.ok(!v1.drawings["street@backdrop"].fallback);
  const v1b = OD.judge(d0, { [d0.indexOf(street) + 1]: "houses" }, v1);
  assert.strictEqual(v1b.drawings["street@backdrop"].rounds, 1, "the same hash: one round");
  const b2 = book(); b2.street.backdrop.paths = BD("accent");
  const d2 = draw(b2).drawings, s2 = d2.find((d) => d.key === "street@backdrop");
  assert.notStrictEqual(s2.hash, street.hash);
  const v2 = OD.judge(d2, { [d2.indexOf(s2) + 1]: "terraced houses" }, v1b);
  assert.strictEqual(v2.drawings["street@backdrop"].rounds, 2); assert.strictEqual(v2.drawings["street@backdrop"].fallback, true); assert.strictEqual(v2.fallbacks, 1);
  const v3 = OD.judge(d2, { [d2.indexOf(s2) + 1]: "a street" }, v2);
  assert.strictEqual(v3.drawings["street@backdrop"].ok, true); assert.ok(!v3.drawings["street@backdrop"].rounds && !v3.drawings["street@backdrop"].fallback, "read as intended: no rounds, no fallback");
});

t("applyFallbacks: the backdrop, a state, a thing and a head move aside with a record; nothing is deleted", () => {
  const e = book();
  const rows = { "street@backdrop": { ok: false, fallback: true, rounds: 2, answer: "row houses", accepted: ["street", "road"] }, "rucksack#torn": { ok: false, fallback: true, rounds: 2, answer: "red square", accepted: ["torn rucksack"] }, "person:noelle": { ok: false, fallback: true, rounds: 2, answer: "blonde woman in olive coat", accepted: ["woman in a hood"] }, rucksack: { ok: true } };
  const { entities: out, applied } = OD.applyFallbacks(e, { at: "2026-11-23T00:00:00Z", drawings: rows });
  assert.deepStrictEqual(applied.map((a) => a.key).sort(), ["person:noelle", "rucksack#torn", "street@backdrop"]);
  assert.ok(!out.street.backdrop.paths && Array.isArray(out.street.backdrop.pathsFallback) && out.street.backdrop.fallback.read === "row houses");
  assert.ok(!out.rucksack.states.torn.paths && out.rucksack.states.torn.pathsFallback && out.rucksack.paths, "the thing itself keeps its drawing");
  assert.ok(!out.noelle.look.drawn && out.noelle.look.drawnFallback && out.noelle.look.suit === "#556B2F", "the signature stays");
  assert.ok(e.street.backdrop.paths, "pure: the input is untouched");
  assert.deepStrictEqual(OD.applyFallbacks(out, { drawings: rows }).applied, [], "already aside: left alone");
  const fb = OD.fallbacksOf(out);
  assert.deepStrictEqual(fb.map((f) => f.key).sort(), ["person:noelle", "rucksack#torn", "street@backdrop"]);
});

t("after the fallback every reader sees no drawing and nothing refuses: resolve has no error, the gates are silent, the gaps count the step as done", () => {
  const e = book();
  const rows = { "street@backdrop": { ok: false, fallback: true, rounds: 2, answer: "row houses", accepted: ["street", "road"] }, "rucksack#torn": { ok: false, fallback: true, rounds: 2, answer: "red square", accepted: ["torn rucksack"] }, "person:noelle": { ok: false, fallback: true, rounds: 2, answer: "x", accepted: ["woman in a hood"] } };
  const out = OD.applyFallbacks(e, { drawings: rows }).entities;
  const r = draw(out);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.drawings.map((d) => d.key), ["rucksack"], "only the drawing that stands is a picture to show");
  assert.ok(!r.entities.street.backdrop && !r.entities.rucksack.states.torn, "the compiler sees the shared set and the thing unchanged");
  assert.deepStrictEqual(OD.gate(r.drawings, { drawings: { rucksack: { hash: r.drawings[0].hash, accepted: r.drawings[0].accepted, answer: "backpack", ok: true } } }), []);
  const people = OD.peopleOf(out);
  assert.strictEqual(people[0].fallback, true);
  assert.deepStrictEqual(OD.gatePeople(people, null), [], "a head aside is not gated");
  const gaps = OD.ownGaps(out);
  assert.deepStrictEqual(gaps.heads, []); assert.strictEqual(gaps.home, true); assert.strictEqual(gaps.any, false);
  // a thing itself aside: the emblem; its states are not an error
  const out2 = OD.applyFallbacks(book(), { drawings: { rucksack: { ok: false, fallback: true, rounds: 2, answer: "square", accepted: ["rucksack"] } } }).entities;
  const r2 = draw(out2); assert.deepStrictEqual(r2.errors, []); assert.ok(!r2.entities.rucksack.paths);
});

t("redrawNote: a miss that is not yet a fallback gets its reason, its round and the measured misreads; nothing to say → null", () => {
  const d = draw(book()).drawings, street = d.find((x) => x.key === "street@backdrop");
  const v = OD.judge(d, { [d.indexOf(street) + 1]: "row houses" });
  const note = OD.redrawNote({ slug: "x", rows: v.drawings, items: d, readings: [{ intended: "street / road", read: "row houses", slug: "then-she-was-gone-v2", note: "the houses were the body" }, { intended: "crate of soil", read: "wooden crate" }] });
  assert.ok(note.includes('street@backdrop — read as "row houses", wanted street / road (round 1 of 2)'));
  assert.ok(note.includes("SURFACE and ONE fixture") && note.includes('measured before: "street / road" read as "row houses"') && !note.includes("crate"));
  const v2 = { drawings: { ...v.drawings, "street@backdrop": { ...v.drawings["street@backdrop"], fallback: true, rounds: 2 } } };
  assert.strictEqual(OD.redrawNote({ slug: "x", rows: v2.drawings, items: d }), null, "a fallback is not redrawn");
  assert.ok(OD.drawingReadings().length >= 4, "data/drawing-readings.json is read");
});

console.log(`\n${n} checks passed`);
