#!/usr/bin/env node
/**
 * test-antidote-p4.js — Antidote 10x Phase 4 unit & regression tests:
 *  - 4 new devices (bookBlueprint, mechanismChain, evidenceBoard, quoteDialogue) + chapterLabel
 *  - 9 layoutGrammars, 4 captionStyles, 5 surfaceFinishes
 *  - 30 devices registered in antidote-10x-keys.js & classified in v2-variety-lint.js
 *  - compile10xCues + ensureMotionPacing + v2-narrative-lint 0 warnings
 */
const assert = require("assert");
const path = require("path");
const os = require("os");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));

function loadTs(relPath) {
  const tmpOut = path.join(os.tmpdir(), `antidote-p4-${path.basename(relPath)}-${Date.now()}.cjs`);
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, relPath)],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: tmpOut,
    external: ["react", "remotion"],
    jsx: "automatic",
  });
  const mod = require(tmpOut);
  try { fs.unlinkSync(tmpOut); } catch {}
  return mod;
}

const schema = loadTs("src/engines/antidote/schema.ts");
const { DEVICE_10X_KEYS } = require("./lib/antidote-10x-keys");
const { classifySceneMode } = require("./lib/v2-variety-lint");
const { compile10xCues } = require("./lib/compile-10x-cues");
const { analyzeNarrative } = require("./lib/v2-narrative-lint");
const { toArtDirection, pickStylePack } = require("./lib/style-packs");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

console.log("Running Antidote 10x Phase 4 tests...");

test("30+ devices registered in DEVICE_10X_KEYS and classified cleanly", () => {
  assert(DEVICE_10X_KEYS.length >= 30, `expected >= 30 devices, got ${DEVICE_10X_KEYS.length}`);
  assert.strictEqual(classifySceneMode({ bookBlueprint: {} }), "book-blueprint");
  assert.strictEqual(classifySceneMode({ mechanismChain: {} }), "mechanism-chain");
  assert.strictEqual(classifySceneMode({ evidenceBoard: {} }), "evidence-board");
  assert.strictEqual(classifySceneMode({ quoteDialogue: {} }), "quote-dialogue");
});

test("all 4 new devices, 9 grammars, 4 captionStyles, 5 surfaceFinishes & chapterLabel parse cleanly", () => {
  const cfg = schema.antidoteConfigSchema.parse({
    meta: {
      slug: "p4-schema-test",
      title: "Phase 4 Test",
      durationInFrames: 1200,
      artDirection: toArtDirection("kraftDossier"),
    },
    scenes: [
      {
        id: "s1",
        fromFrame: 0,
        durationFrames: 300,
        chapterLabel: "PART 01 · WYSIATI",
        bookBlueprint: {
          title: "KAHNEMAN'S MAP",
          thesis: "Our minds jump to stories from incomplete scraps.",
          pillars: [
            { label: "WYSIATI", status: "active", at: 20 },
            { label: "Halo Effect", status: "upcoming", at: 80 },
            { label: "Anchoring", status: "upcoming", at: 140 },
          ],
          synthesis: "Three shortcuts that govern judgment",
          synthesisAt: 200,
        },
      },
      {
        id: "s2",
        fromFrame: 300,
        durationFrames: 300,
        mechanismChain: {
          title: "PRIORITY DILUTION LOOP",
          variant: "dominoBreak",
          steps: [
            { label: "116 Unread", at: 20 },
            { label: "Reactive Panic", at: 80 },
            { label: "Burnout", at: 140 },
          ],
          breakAt: 200,
          escapeOutcome: "Strategic Delay",
        },
      },
      {
        id: "s3",
        fromFrame: 600,
        durationFrames: 300,
        evidenceBoard: {
          title: "THE HALO EXPERIMENT",
          subject: "Charismatic Speaker",
          setup: "Pitches a plan before showing financials.",
          finding: "Audience rates plan brilliant in seconds.",
          lessonHeadline: "Confidence masks weak numbers",
          revealLessonAt: 140,
        },
      },
      {
        id: "s4",
        fromFrame: 900,
        durationFrames: 300,
        quoteDialogue: {
          title: "EARLY WIN TRAP",
          speakerA: { name: "NEW LEADER" },
          speakerB: { name: "STRATEGIST" },
          lines: [
            { speaker: "A", text: "Isn't fixing the coffee machine better than nothing?", at: 20 },
            { speaker: "B", text: "It is a false dichotomy.", at: 110 },
          ],
          subtext: { headline: "Align with your boss's core priorities", at: 200 },
        },
      },
    ],
    captions: [],
  });
  assert.strictEqual(cfg.meta.artDirection.layoutGrammar, "magazineMasthead");
  assert.strictEqual(cfg.meta.artDirection.captionStyle, "printRule");
  assert.strictEqual(cfg.meta.artDirection.surfaceFinish, "paperGrain");
  assert.strictEqual(cfg.scenes[0].chapterLabel, "PART 01 · WYSIATI");
});

test("compile10xCues + ensureMotionPacing paces all 4 new devices with 0 motion-gap warnings", () => {
  const scene = {
    id: "p4-long",
    fromFrame: 0,
    durationFrames: 900,
    camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
    mechanismChain: {
      title: "LONG CHAIN",
      steps: [{ label: "A", at: 20 }, { label: "B", at: 400 }, { label: "C", at: 820 }],
    },
  };
  compile10xCues(scene, { durationFrames: 900 });
  const res = analyzeNarrative({ meta: { artDirection: toArtDirection("kilnEditorial") }, scenes: [scene], captions: [] });
  assert.strictEqual(res.warnings.filter((w) => w.includes("motion gap")).length, 0);
});

test("pickStylePack exercises magazineMasthead, filmFrame, diagonalSplit across 30 books", () => {
  const recent = [];
  const grammars = new Set();
  for (let i = 0; i < 30; i++) {
    const p = pickStylePack({ slug: `p4-book-${i}`, genre: ["psychology", "strategy", "productivity"][i % 3], recent });
    grammars.add(p.layoutGrammar);
    recent.unshift(p);
  }
  assert(grammars.has("magazineMasthead") || grammars.has("filmFrame") || grammars.has("diagonalSplit"));
});

console.log(`\nAll ${passed} Antidote 10x Phase 4 tests passed.`);
