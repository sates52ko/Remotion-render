#!/usr/bin/env node
/**
 * Unit tests for P2 Automated Visual & Narrative QA (`v2-narrative-lint.js` & `qa-stills-pixel.js`).
 */
const assert = require("assert");
const { analyzeNarrative } = require("./lib/v2-narrative-lint");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

console.log("Running Antidote 10x P2 QA tests...");

test("v2-narrative-lint catches safe-zone violation, low contrast, and TODO hygiene", () => {
  const res = analyzeNarrative({
    meta: { artDirection: { captions: "minimal", palette: { bg: "#111111", ink: "#1A1A1A" } } },
    captions: [{ text: "Normal narration", startFrame: 0, endFrame: 60 }],
    scenes: [
      {
        id: "s1",
        fromFrame: 0,
        durationFrames: 120,
        annotatedScene: { image: "a.png", stickers: [{ title: "TODO fix", x: 500, y: 980 }] },
      },
    ],
  });
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("WCAG contrast")));
  assert.ok(res.errors.some((e) => e.includes("outside safe zone")));
  assert.ok(res.errors.some((e) => e.includes("placeholder token")));
});

test("v2-narrative-lint catches ungrounded numeric claim and passes clean config", () => {
  const ungrounded = analyzeNarrative({
    meta: { artDirection: { captions: "minimal" } },
    captions: [{ text: "People work hard every day.", startFrame: 0, endFrame: 90 }],
    scenes: [{ id: "s1", fromFrame: 0, durationFrames: 90, statSlam: { value: "87%", label: "Burnout" } }],
  });
  assert.ok(ungrounded.warnings.some((w) => w.includes("not found in adjacent narration")));

  const clean = analyzeNarrative({
    meta: { artDirection: { captions: "minimal" } },
    captions: [{ text: "Eighty-seven percent or 87% report burnout.", startFrame: 0, endFrame: 90 }],
    scenes: [{ id: "s1", fromFrame: 0, durationFrames: 90, statSlam: { value: "87%", label: "Burnout" } }],
  });
  assert.strictEqual(clean.ok, true);
  assert.strictEqual(clean.warnings.length, 0);
});

console.log(`\nAll ${passed} Antidote 10x P2 QA tests passed.`);
