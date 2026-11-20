#!/usr/bin/env node
/** test-thing-events.js — things that happen on a told stage: thrown, dropped (2026-11-20). No render, no network. */
const assert = require("assert");
const C = require("./lib/told-compile");
const T = require("../src/engines/antidote/told.ts");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const words = (s, step = 12) => s.split(" ").map((w, i) => ({ w, f: i * step }));
const P = [{ d: "M60 60 H460 V460 H60 Z", fill: "#C9D0D6" }], BROKEN = [{ d: "M60 60 L260 300 L460 60 Z", fill: "#C9D0D6" }, { d: "M60 460 L260 320 L460 460 Z", fill: "#C9D0D6" }];
const ENT = {
  count: { label: "THE COUNT", kind: "person", look: {} },
  harker: { label: "HARKER", kind: "person", look: {} },
  mirror: { label: "THE MIRROR", kind: "object", paths: P, reads: ["mirror"], states: { shattered: { reads: ["broken glass"], paths: BROKEN } } },
  bank: { label: "THE BANK", kind: "company", glyph: "monitor" },
};
const beat = (id, text, told, frames = 300) => ({ id, frames, words: words(text), told });
const stageOf = (events) => C.compileTold([beat("b1", "the count grabs the mirror and throws it out and it breaks on the stones below", { events: [{ on: "count", do: "arrange", layout: "versus", who: ["count", "harker"] }, ...events] })], ENT);
const flying = (r) => r.stages[0].items.filter((x) => /^mirror\.(thrown|fallen)/.test(x.id));

t("thrown off the stage: out of the hand in one arc that lands on the word, then gone", () => {
  const r = stageOf([{ on: "grabs", do: "change", who: "count", holds: "mirror" }, { on: "throws", do: "throw", who: "count", what: "mirror" }]);
  assert.deepStrictEqual(r.errors, []);
  const [h] = flying(r), at = 6 * 12;
  assert.ok(h && h.keys.length === 2, "up, then away");
  assert.strictEqual(h.keys[1].at, at, "it lands on the word");
  assert.ok(h.keys[1].x > 1920 || h.keys[1].x < 0, "off the frame");
  assert.ok(h.keys[0].y < h.keys[1].y + 400 && Math.abs(h.keys[1].r) === 300, "it rises and turns once");
  assert.ok(h.exit && h.exit.at <= at + 8, "and is gone");
  assert.ok(!r.stages[0].items.some((x) => x._role === "held" && !x._gone && x._ent === "mirror"), "the hand is empty");
});

t("thrown to the ground with a state: it lies there as what it has become, knocked once", () => {
  const r = stageOf([{ on: "throws", do: "throw", who: "count", what: "mirror", to: "ground", state: "shattered" }]);
  assert.deepStrictEqual(r.errors, []);
  const fallen = flying(r).find((x) => /fallen/.test(x.id));
  assert.ok(fallen && fallen.state === "shattered");
  assert.deepStrictEqual(fallen.paths.map((p) => p.d), BROKEN.map((p) => p.d));
  assert.ok(fallen.shake && fallen.shake.dur <= 20, "one knock that dies away");
  assert.ok(fallen.y <= 860 - 70, "above the subtitle band");
  assert.ok(flying(r).find((x) => /thrown/.test(x.id)).exit, "the whole one gives way to it");
});

t("thrown at someone: it reaches them on the word and they are knocked; dropped: straight down beside the feet", () => {
  const r = stageOf([{ on: "throws", do: "throw", who: "count", what: "mirror", to: "harker" }]);
  assert.deepStrictEqual(r.errors, []);
  const harker = r.stages[0].items.find((x) => x.id === "harker" && !x._gone) || r.stages[0].items.filter((x) => x._ent === "harker" || x.id === "harker").pop();
  assert.ok(harker.shake && harker.shake.at === 6 * 12);
  const d = stageOf([{ on: "grabs", do: "change", who: "count", holds: "mirror" }, { on: "breaks", do: "drop", who: "count", what: "mirror" }]);
  assert.deepStrictEqual(d.errors, []);
  const [h] = flying(d);
  assert.strictEqual(h.keys.length, 1); assert.ok(Math.abs(h.keys[0].r) <= 40 && !h.exit, "it falls, tips and stays");
});

t("what cannot happen is refused with the reason", () => {
  const bad = (ev, re) => { const r = stageOf([ev]); assert.ok(r.errors.some((e) => re.test(e.message)), `${JSON.stringify(ev)} → ${JSON.stringify(r.errors.map((e) => e.message))}`); };
  bad({ on: "throws", do: "throw", who: "mirror", what: "mirror" }, /PERSON who throws|is not on stage/);
  bad({ on: "throws", do: "throw", who: "count", what: "bank" }, /DRAWN thing/);
  bad({ on: "throws", do: "throw", who: "count", what: "mirror", to: "nobody" }, /"off", "ground" or someone/);
  bad({ on: "throws", do: "throw", who: "count", what: "mirror", state: "shattered" }, /only with "to": "ground"/);
  bad({ on: "throws", do: "throw", who: "count", what: "mirror", to: "ground", state: "melted" }, /no state "melted"/);
  bad({ on: "breaks", do: "drop", who: "count", what: "mirror", to: "harker" }, /falls to the ground/);
});

t("one motion, no loop: every key of the flight lies inside the beat and the renderer's eases are the old ones", () => {
  const r = stageOf([{ on: "throws", do: "throw", who: "count", what: "mirror", to: "ground", state: "shattered" }]);
  for (const it of flying(r)) for (const k of it.keys || []) { assert.ok(k.at <= 300 && k.at >= 0); assert.ok(["out", "back", "inout", undefined].includes(k.ease)); }
  assert.ok(typeof T.itemState === "function");
});

console.log(`\nall thing-events checks passed (${n})`);
