#!/usr/bin/env node
/** test-speech.js — Film Flow slice 1: the narration drives the body; nothing moves in a pause; old films are untouched. */
const assert = require("assert");
const S = require("../src/engines/antidote/speech.ts");
const M = require("../src/engines/antidote/movements.ts");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const FPS = 30;
// "Mama   made   apple pie. ……(pause)…… Absolutely unbelievable."
const captions = [
  { words: [{ w: "Mama", s: 0, e: 12 }, { w: "made", s: 12, e: 20 }, { w: "apple", s: 20, e: 30 }, { w: "pie.", s: 30, e: 42 }] },
  { words: [{ w: "pie.", s: 30, e: 42 }, { w: "Absolutely", s: 90, e: 112 }, { w: "unbelievable.", s: 112, e: 140 }] },
];
const sp = S.buildSpeech(captions, FPS);

t("words: every word once, in order; a word repeated at a caption break is kept once", () => {
  assert.deepStrictEqual(sp.words.map((w) => w.w), ["Mama", "made", "apple", "pie.", "Absolutely", "unbelievable."]);
});

t("beats: a phrase starts after a pause; a long word inside a phrase is a weak beat; strokes are phrase starts only", () => {
  assert.deepStrictEqual(sp.beats.map((b) => [b.frame, b.strength]), [[0, 1], [90, 1], [112, 0.6]]);
  assert.deepStrictEqual(sp.strokes.map((b) => b.frame), [0, 90]);
  const close = S.speechBeats([{ w: "a", s: 0, e: 2 }, { w: "b", s: 10, e: 12 }, { w: "c", s: 20, e: 22 }], FPS);
  assert.deepStrictEqual(close.map((b) => b.frame), [0], "three phrase starts inside 700 ms: one beat");
});

t("mouth: open on a vowel, lips closed on m / b / p, closed in a pause, never a jump", () => {
  const v = (f) => S.voiceAt(sp, f);
  assert.ok(v(4).mouth > 0.6, `the "a" of Mama is open (${v(4).mouth})`);
  assert.ok(v(0).mouth < 0.25 && v(7).mouth < v(4).mouth - 0.2, "m brings the lips together");
  assert.strictEqual(v(60).mouth, 0, "silence: the mouth is shut");
  assert.strictEqual(v(75).mouth, 0);
  assert.strictEqual(v(60).speaking, 0);
  assert.strictEqual(v(100).speaking, 1);
  for (let f = 1; f < 140; f++) assert.ok(Math.abs(v(f).mouth - v(f - 1).mouth) < 0.5, `mouth jump at frame ${f}: ${v(f - 1).mouth.toFixed(2)} → ${v(f).mouth.toFixed(2)}`);
  assert.deepStrictEqual(S.voiceAt(null, 10), S.SILENT);
  assert.deepStrictEqual(S.voiceAt(S.buildSpeech([], FPS), 10), S.SILENT);
});

t("head and brows mark the phrase; the hand is fully out ON the stressed word and at rest in the pause", () => {
  const v = (f) => S.voiceAt(sp, f);
  assert.ok(v(92).nod > 0.5 && v(92).brow > 0.2, "a nod and a brow lift around the second phrase start");
  assert.strictEqual(v(70).nod, 0);
  assert.strictEqual(v(90).stroke, 1, "the stroke peaks on the word");
  assert.ok(v(84).stroke > 0 && v(84).stroke < 1, "it starts before the word");
  assert.strictEqual(v(72).stroke, 0, "no stroke in the pause");
  assert.strictEqual(v(90).strokeIndex, 1, "the second stroke (the other hand)");
  assert.strictEqual(v(105).stroke, 1, "held");
  assert.ok(v(112).stroke < 1 && v(125).stroke === 0, "retracted");
});

t("a film without the flow level renders exactly as before", () => {
  for (const a of ["talk", "idle", "think", "point", "hold", "slump", "celebrate"]) for (const f of [0, 7, 33, 120, 400]) {
    assert.deepStrictEqual(M.pose(a, f, FPS), M.pose(a, f, FPS, M.ACTION_CUE_MIN, "lead", undefined), `${a}@${f}`);
  }
  const legacy = M.pose("talk", 60, FPS);
  assert.ok(legacy.mouth > 0 || M.pose("talk", 61, FPS).mouth > 0, "the old talk still flaps without a voice");
});

t("live talk: the mouth follows the narration, hands rest in the pause, the stroke raises one forearm then the other", () => {
  const live = (f) => M.pose("talk", f, FPS, undefined, "lead", { voice: S.voiceAt(sp, f), seed: 3 });
  assert.strictEqual(live(60).mouth, 0, "silent in the pause (the old rig kept flapping)");
  assert.ok(live(4).mouth > 0.6);
  const rest = live(60), out1 = live(0), out2 = live(100);
  assert.ok(out1.elbowR > rest.elbowR + 40 && Math.abs(out1.elbowL - rest.elbowL) < 1e-9, "first stroke: the right forearm");
  assert.ok(out2.elbowL < rest.elbowL - 40 && Math.abs(out2.elbowR - rest.elbowR) < 1e-9, "second stroke: the left forearm");
  assert.ok(live(92).headY > 1, "the head marks the phrase");
});

t("live idle and think: no wave — the figure holds, then changes; two figures never move in step", () => {
  const idle = (f, seed) => M.pose("idle", f, FPS, undefined, "lead", { voice: S.SILENT, seed });
  let moving = 0;
  for (let f = 1; f < 600; f++) if (Math.abs(idle(f, 1).gazeX - idle(f - 1, 1).gazeX) > 1e-9 || Math.abs(idle(f, 1).legL - idle(f - 1, 1).legL) > 1e-9) moving++;
  assert.ok(moving < 600 * 0.25, `still most of the time (moving on ${moving} of 600 frames)`);
  assert.strictEqual(idle(300, 1).headY, 0, "no head bob in silence");
  assert.ok([100, 250, 400, 550].some((f) => idle(f, 1).gazeX !== idle(f, 9).gazeX), "different seeds, different glances");
  const think = (f) => M.pose("think", f, FPS, undefined, "lead", { seed: 2 });
  assert.ok(Math.abs(think(0).armR - -8) < 1e-9 && think(200).armR < -69, "the hand rises to the chin instead of starting there");
});

t("gesture weight: winds up the other way, goes a little too far, lands; the forearm lags; longer travel takes longer", () => {
  const w = (f, deg = 100, d = 0) => M.gestureRise(f, FPS, deg, d);
  const xs = Array.from({ length: 40 }, (_, f) => w(f));
  assert.ok(Math.min(...xs) < -0.01, "anticipation: below zero first");
  assert.ok(Math.max(...xs) > 1.01, "overshoot: above one");
  assert.ok(Math.abs(w(200) - 1) < 1e-9 && w(0) === 0);
  assert.ok(w(10, 100, M.FOREARM_LAG_SEC * FPS) < w(10), "the lagged curve is behind");
  assert.ok(w(15, 240) < w(15, 100), "a longer way is slower");
  const point = (f) => M.pose("point", f, FPS, undefined, "lead", { seed: 1 });
  assert.ok(point(3).gazeX > 0.2 && point(3).armR > -20, "the eyes go before the arm");
  assert.ok(Math.abs(point(120).armR - -105) < 1e-6 && Math.abs(point(120).elbowR) < 1e-6, "lands where the old point did");
  for (let f = 1; f < 60; f++) assert.ok(Math.abs(point(f).armR - point(f - 1).armR) < 25, `pose snap at ${f}`);
});

console.log(`\n${n} checks passed`);
