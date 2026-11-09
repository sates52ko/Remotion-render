#!/usr/bin/env node
// test-shot-plan.js — C19: a beat cut into shots at the narrator's words tiles its frames exactly, keeps the narration
// / HUD, puts each cue on its word, and refuses a cut or a cue the word timings do not contain. < 1 s.
const assert = require("assert");
const { splitBeat, applyPlan } = require("./lib/shot-plan");

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ok ${name}`); };
const N = "Just hacking away. Swing, strike, split. He is hunting down pieces of wood";
const W = N.split(" ").map((w, k) => ({ w, s: 1000 + k * 20, e: 1015 + k * 20 }));
const cfg = () => ({ captions: [{ text: N, startFrame: 1000, endFrame: 1300, words: W }], scenes: [
  { id: "s0", fromFrame: 700, durationFrames: 300 },
  { id: "s1", fromFrame: 1000, durationFrames: 283, hud: { insight: 1 }, _narration: N, audioEvents: [{ at: 10, sfx: "a" }, { at: 130, sfx: "b" }], transition: { type: "fade", frames: 10 } },
] });
const shots = [
  { scene: { shot: "medium", characters: [{ identity: "luther", action: "idle" }] } },
  { at: "Swing,", scene: { shot: "medium", characters: [{ identity: "luther", action: "chop", holds: "axe" }] }, cues: { 0: "strike," } },
  { at: "split.", scene: { shot: "medium" } },
];

ok("the shots tile the beat's frames exactly, cut on the words", () => {
  const s = splitBeat(cfg(), 1, shots);
  assert.deepStrictEqual(s.map((x) => [x.fromFrame, x.durationFrames]), [[1000, 60], [1060, 40], [1100, 183]]);
  assert.strictEqual(s.reduce((a, x) => a + x.durationFrames, 0), 283);
});
ok("every shot keeps the narration and HUD; the first keeps the beat's transition, later ones cut", () => {
  const s = splitBeat(cfg(), 1, shots);
  assert(s.every((x) => x._narration === N && x.hud.insight === 1));
  assert.deepStrictEqual(s[0].transition, { type: "fade", frames: 10 }); assert.deepStrictEqual(s[1].transition, { type: "cut", frames: 0 });
});
ok("a cue lands on its word, relative to the shot; audio events move with their shot", () => {
  const s = splitBeat(cfg(), 1, shots);
  assert.strictEqual(s[1].characters[0].actionAt, 1080 - 1060);
  assert.deepStrictEqual(s[0].audioEvents, [{ at: 10, sfx: "a" }]); assert.deepStrictEqual(s[2].audioEvents, [{ at: 30, sfx: "b" }]);
});
ok("a cut or a cue not in the word timings is refused (never a guessed moment)", () => {
  assert.throws(() => splitBeat(cfg(), 1, [shots[0], { at: "chop", scene: {} }]), /not in the word timings/);
  assert.throws(() => splitBeat(cfg(), 1, [shots[0], { ...shots[1], cues: { 0: "wood" } }, shots[2]]), /not said inside the shot/);
});
ok("applyPlan replaces only the planned beat", () => {
  const c = applyPlan(cfg(), [{ sceneIndex: 1, shots }]);
  assert.deepStrictEqual(c.scenes.map((x) => x.id), ["s0", "s1-shot1", "s1-shot2", "s1-shot3"]);
});
console.log(`shot-plan: ${n} passed`);
