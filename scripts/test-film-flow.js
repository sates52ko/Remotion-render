#!/usr/bin/env node
/** test-film-flow.js — the flow yardstick reads what the config will render. No render, no network. */
const assert = require("assert");
const { antidoteFlow, voxFlow, filmFlow, flowTable, camClass, carried } = require("./lib/film-flow");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

const sc = (i, o = {}) => ({ id: `s${i}`, fromFrame: i * 300, durationFrames: 300, shot: "medium", bg: { set: "office" }, characters: [{ identity: "host-a", action: "talk" }], props: [], camera: { zoom: [1, 1.08], panX: [0, 0], panY: [0, 0], punch: { at: 100, amount: 0.05 }, pulses: [50, 200] }, transition: { type: "cut" }, ...o });

t("a film of one talking figure and a text is measured as exactly that", () => {
  const f = antidoteFlow({ meta: { fps: 30 }, scenes: [0, 1, 2, 3].map((i) => sc(i)) });
  assert.strictEqual(f.scenes, 4);
  near(f.picture.figureAndTextOnly, 1);
  near(f.picture.nobodyActs, 1);
  near(f.picture.castOnlyTalksOrIdles, 1);
  near(f.repetition.allThree, 1);
  assert.strictEqual(f.repetition.longestSameShotAndSet, 4);
  near(f.length.cv, 0);
  assert.strictEqual(f.length.alikeRun, 4);
  near(f.camera.topTwoShare, 1);
  near(f.camera.sameMoveAsPrevious, 1);
  near(f.camera.purposeful, 0);
  near(f.cuts.hard, 1);
  near(f.cuts.carried, 0);
});

t("objects, deeds, variety and carried cuts each move their own number", () => {
  const scenes = [
    sc(0, { durationFrames: 120 }),
    sc(1, { fromFrame: 120, durationFrames: 420, shot: "wide", bg: { set: "street" }, characters: [{ identity: "host-a", action: "throw", holds: "ball" }], camera: { zoom: [1.2, 1], panX: [0, 0], panY: [0, 0], target: "ball" }, transition: { type: "wipeLeft" } }),
    sc(2, { fromFrame: 540, durationFrames: 180, shot: "insert", bg: { set: "street" }, characters: [], props: [{ type: "ball" }], camera: { zoom: [1, 1], panX: [0, 40], panY: [0, 0] }, transition: { type: "wipeLeft" } }),
    sc(3, { fromFrame: 720, durationFrames: 300, shot: "twoShot", characters: [{ identity: "host-a", action: "talk", travel: [100, -100] }, { identity: "host-b", action: "idle" }], diagram: { type: "flow" }, continueFromPrev: true, transition: { type: "iris" } }),
  ];
  const f = antidoteFlow({ meta: { fps: 30 }, scenes });
  near(f.picture.figureAndTextOnly, 1 / 4);       // only scene 0
  near(f.picture.nobodyActs, 2 / 4);              // scenes 0 and 2 (an object alone does nothing)
  near(f.picture.castOnlyTalksOrIdles, 1 / 4);
  assert.strictEqual(f.picture.travels, 1);
  assert.deepStrictEqual(f.picture.diagrams, { flow: 1 });
  near(f.repetition.allThree, 0);
  near(f.camera.purposeful, 1 / 4);
  assert.ok(f.length.cv > 0.3);
  near(f.cuts.hard, 0);
  near(f.cuts.carried, 2 / 3);                    // the held ball becomes the prop; scene 3 continues the stage
  near(f.cuts.sameDesignedTwice, 1 / 3);          // wipeLeft twice in a row
});

t("camera classes and what a cut carries", () => {
  assert.strictEqual(camClass({ zoom: [1, 1.08], panX: [0, 0], punch: { at: 1 } }), "in+punch");
  assert.strictEqual(camClass({ zoom: [1.08, 1], panX: [0, 30] }), "out+pan");
  assert.strictEqual(camClass({ zoom: [1, 1], follow: "coin" }), "still+target");
  assert.strictEqual(camClass(undefined), "none");
  assert.ok(carried({ props: [{ type: "coin" }] }, { props: [{ type: "coin" }] }));
  assert.ok(carried({ diagram: { type: "causal" } }, { diagram: { type: "causal" } }));
  assert.ok(!carried({ props: [{ type: "coin" }] }, { props: [{ type: "door" }] }));
});

t("a passage of the film is selected by seconds", () => {
  const scenes = Array.from({ length: 20 }, (_, i) => sc(i));   // 10 s each
  assert.strictEqual(antidoteFlow({ meta: { fps: 30 }, scenes }, { window: [0, 90] }).scenes, 9);
  assert.strictEqual(antidoteFlow({ meta: { fps: 30 }, scenes }, { window: [90, 200] }).scenes, 11);
});

t("vox: one beat type everywhere is measured as that", () => {
  const beats = Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, type: i === 9 ? "quote" : "imagefocus", fromFrame: i * 240, durationFrames: 240, images: i === 9 ? [] : [{ path: "x" }] }));
  const f = voxFlow({ meta: { fps: 24 }, beats });
  near(f.picture.topTypeShare, 0.9);
  near(f.repetition.sameTypeAsPrevious, 8 / 9);
  assert.strictEqual(f.repetition.longestSameType, 9);
  near(f.picture.imagesPerMin, 9 / (100 / 60));
  near(f.cuts.hard, 1);
  assert.strictEqual(filmFlow({ meta: { fps: 24 }, beats }).engine, "vox");
});

t("the table names every film and survives an empty passage", () => {
  const a = antidoteFlow({ meta: { fps: 30 }, scenes: [0, 1].map((i) => sc(i)) });
  const empty = antidoteFlow({ meta: { fps: 30 }, scenes: [] });
  const md = flowTable([["before", a], ["after", empty]]);
  assert.ok(/\| measure \| before \| after \|/.test(md) && /figure \+ text only \| 100% \| –/.test(md));
});

console.log(`\n${n} checks passed`);
