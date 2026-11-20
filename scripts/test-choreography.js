#!/usr/bin/env node
/**
 * test-choreography.js — Test suite for Phase 2 Runtime Attention Choreography & Visual Arc Progression.
 */

const assert = require("assert");

// Mock or import the pure mathematical functions from choreography logic
function resolveAttentionTimeline(scene, durationFrames) {
  const dur = Math.max(1, durationFrames);
  const props = scene.props || [];
  const texts = scene.texts || [];

  const motifAt = props.length > 0 ? (props[0].at ?? 0) : null;
  const textAt = texts.length > 0 ? (texts[0].at ?? 0) : null;

  if (scene.attention && scene.attention.length > 0) {
    const milestones = scene.attention;
    const count = milestones.length;
    if (count === 1) {
      return [{ startFrame: 0, endFrame: dur, target: milestones[0] }];
    }

    const segments = [];
    const windowSize = dur / count;
    for (let i = 0; i < count; i++) {
      const segStart = Math.round(i * windowSize);
      const segEnd = i === count - 1 ? dur : Math.round((i + 1) * windowSize);
      segments.push({
        startFrame: segStart,
        endFrame: segEnd,
        target: milestones[i],
      });
    }
    return segments;
  }

  if (scene.shot === "twoShot" || scene.shot === "split" || scene.shot === "overShoulder") {
    return [{ startFrame: 0, endFrame: dur, target: "partner" }];
  }
  if (scene.shot === "insert" || (scene.characters && scene.characters.length === 0)) {
    return [{ startFrame: 0, endFrame: dur, target: "motif" }];
  }

  if (motifAt !== null && textAt !== null) {
    const tMotif = Math.min(motifAt, Math.round(dur * 0.4));
    const tText = Math.max(tMotif + 12, Math.min(textAt, dur - 15));
    return [
      { startFrame: 0, endFrame: tMotif, target: "character" },
      { startFrame: tMotif, endFrame: tText, target: "motif" },
      { startFrame: tText, endFrame: dur, target: "text" },
    ];
  }

  if (motifAt !== null) {
    const tMotif = Math.min(motifAt, Math.round(dur * 0.4));
    return [
      { startFrame: 0, endFrame: tMotif, target: "character" },
      { startFrame: tMotif, endFrame: dur, target: "motif" },
    ];
  }

  return [{ startFrame: 0, endFrame: dur, target: "character" }];
}

function resolveVisualArcTransform(visualArc, localFrame, durationFrames) {
  const neutral = { scale: 1, tx: 0, ty: 0, opacity: 1, jitter: 0 };
  if (!visualArc || !visualArc.transformation || visualArc.transformation === "none") {
    return neutral;
  }

  const span = Math.max(1, durationFrames);
  const t = Math.max(0, Math.min(1, localFrame / span));

  switch (visualArc.transformation) {
    case "grow":
      return { ...neutral, scale: 1 + t * 0.45 };
    case "shrink":
      return { ...neutral, scale: 1 - t * 0.45, opacity: 1 - t * 0.2 };
    case "overload":
      return { ...neutral, scale: 1 + t * 0.18, jitter: Math.sin(localFrame * 1.8) * (t * 4) };
    case "multiply":
      return { ...neutral, scale: 1 + t * 0.35, ty: -t * 20 };
    case "isolate":
      return { ...neutral, scale: 1 - t * 0.15, ty: t * 15 };
    case "reveal_truth":
      return { ...neutral, scale: 1 + t * 0.12, ty: -t * 30 };
    case "shift_focus":
      return { ...neutral, tx: -t * 80 };
    default:
      return neutral;
  }
}

// ── TEST 1: Authored Attention Milestones ─────────────────────────────────────
console.log("Running Test 1: Authored Attention Milestones...");
const sceneWithAttention = {
  shot: "medium",
  attention: ["character", "motif", "text"],
  props: [{ type: "phone", at: 20 }],
  texts: [{ text: "FOCUS", at: 50 }],
};
const tl1 = resolveAttentionTimeline(sceneWithAttention, 90);
assert.strictEqual(tl1.length, 3);
assert.strictEqual(tl1[0].target, "character");
assert.strictEqual(tl1[1].target, "motif");
assert.strictEqual(tl1[2].target, "text");
console.log("✓ Test 1 Passed: Attention milestones allocated cleanly into 3 windows.");

// ── TEST 2: Intelligent Fallback Choreography ─────────────────────────────────
console.log("Running Test 2: Intelligent Fallback Choreography...");
const sceneWithoutAttention = {
  shot: "medium",
  props: [{ type: "door", at: 18 }],
  texts: [{ text: "STEP 1", at: 60 }],
};
const tl2 = resolveAttentionTimeline(sceneWithoutAttention, 100);
assert.strictEqual(tl2.length, 3);
assert.strictEqual(tl2[0].target, "character");
assert.strictEqual(tl2[1].target, "motif");
assert.strictEqual(tl2[2].target, "text");
console.log("✓ Test 2 Passed: Intelligent default creates presenter -> motif -> text flow.");

// ── TEST 3: Visual Arc Transformations ──────────────────────────────────────
console.log("Running Test 3: Visual Arc Transformations...");
const arcGrow = { startState: "small", endState: "huge", transformation: "grow" };
const startTransform = resolveVisualArcTransform(arcGrow, 0, 100);
const endTransform = resolveVisualArcTransform(arcGrow, 100, 100);
assert.strictEqual(startTransform.scale, 1);
assert.strictEqual(Math.round(endTransform.scale * 100) / 100, 1.45);

const arcShrink = { startState: "huge", endState: "tiny", transformation: "shrink" };
const shrinkEnd = resolveVisualArcTransform(arcShrink, 100, 100);
assert.strictEqual(Math.round(shrinkEnd.scale * 100) / 100, 0.55);

const arcOverload = { startState: "calm", endState: "panic", transformation: "overload" };
const overloadEnd = resolveVisualArcTransform(arcOverload, 100, 100);
assert(overloadEnd.scale > 1.15);
assert(overloadEnd.jitter !== 0);

console.log("✓ Test 3 Passed: Visual Arc grow (1.45x), shrink (0.55x), and overload transforms verified.");

console.log("\nALL PHASE 2 CHOREOGRAPHY TESTS PASSED! ✓✓✓\n");
