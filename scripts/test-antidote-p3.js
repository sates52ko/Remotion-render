#!/usr/bin/env node
/**
 * test-antidote-p3.js — Antidote 10x Phase 3 unit & regression tests:
 *  - 25 stage moods + WCAG 2.1 contrast (>= 4.5:1) on all 6 chromaticMid moods
 *  - 3-polarity pickStylePack rotation (dark / light / chromaticMid) + minorHarm lock
 *  - ColdOpenDirector (coldOpenRulesBlock + applyColdOpenDirection)
 *  - ensureMotionPacing eliminating >8s motion gaps + v2-narrative-lint 0 warnings
 *  - title-lint.js hybrid Search + Anchor + CTR & audiobook warning
 */
const assert = require("assert");
const path = require("path");
const os = require("os");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));

function loadTs(relPath) {
  const tmpOut = path.join(os.tmpdir(), `antidote-p3-${path.basename(relPath)}-${Date.now()}.cjs`);
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
const artDir = loadTs("src/engines/antidote/components/artDirection.tsx");
const { STYLE_PACKS, pickStylePack, toArtDirection } = require("./lib/style-packs");
const { coldOpenRulesBlock, applyColdOpenDirection } = require("./lib/cold-open");
const { compile10xCues } = require("./lib/compile-10x-cues");
const { analyzeNarrative } = require("./lib/v2-narrative-lint");
const { lintTitleSet } = require("./lib/title-lint");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

function hexToRgb(hex) {
  const m = hex.replace("#", "");
  const n = parseInt(m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLum([r, g, b]) {
  return [r, g, b].reduce((acc, v, i) => {
    const s = v / 255;
    const c = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    return acc + c * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}
function contrast(a, b) {
  const la = relLum(hexToRgb(a)), lb = relLum(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

console.log("Running Antidote 10x Phase 3 tests...");

test("25 stage moods exist and all 6 chromaticMid moods pass WCAG 2.1 (>= 7:1 ink, >= 4.5:1 muted)", () => {
  const moods = Object.keys(artDir.STAGE_MOODS);
  assert.strictEqual(moods.length, 25, `expected 25 moods, got ${moods.length}`);
  for (const m of ["cobaltBlueprint", "forestBotanical", "terracottaEarth", "ochreKraft", "slateDenim", "plumVelvet"]) {
    const pal = artDir.STAGE_MOODS[m].palette;
    const inkCr = contrast(pal.bg, pal.ink);
    const mutedCr = contrast(pal.bg, pal.muted);
    assert(inkCr >= 7.0, `${m} ink contrast ${inkCr.toFixed(2)} < 7.0`);
    assert(mutedCr >= 4.5, `${m} muted contrast ${mutedCr.toFixed(2)} < 4.5`);
  }
});

test("ambientCanvas + tintOpacity + chromaticMid polarity parse cleanly in schema", () => {
  const cfg = schema.antidoteConfigSchema.parse({
    meta: {
      slug: "p3-schema-test",
      title: "Schema Test",
      durationInFrames: 300,
      artDirection: toArtDirection("cobaltDrafting"),
    },
    scenes: [
      {
        id: "s1",
        fromFrame: 0,
        durationFrames: 300,
        bg: {
          stageMood: "cobaltBlueprint",
          image: { path: "scenes/test/a.png", ambientCanvas: true, emptyStage: true, opacity: 0.22, blur: 7, tintOpacity: 0.72 },
        },
        vennMerge: {
          title: "TEST",
          circles: [{ label: "A" }, { label: "B" }],
          intersection: { label: "AB" },
        },
      },
    ],
    captions: [],
  });
  assert.strictEqual(cfg.meta.artDirection.polarity, "chromaticMid");
  assert.strictEqual(cfg.scenes[0].bg.image.ambientCanvas, true);
  assert.strictEqual(cfg.scenes[0].bg.image.tintOpacity, 0.72);
});

test("pickStylePack rotates across 3 polarities (dark / light / chromaticMid) over 30 books", () => {
  const recent = [];
  const seenPols = new Set();
  for (let i = 0; i < 30; i++) {
    const p = pickStylePack({ slug: `book-${i}`, genre: i % 2 === 0 ? "psychology" : "strategy", recent });
    if (recent[0]) {
      assert.notStrictEqual(p.polarity, recent[0].polarity, `book-${i} repeated polarity ${p.polarity}`);
      assert.notStrictEqual(p.layoutGrammar, recent[0].layoutGrammar, `book-${i} repeated layoutGrammar`);
    }
    seenPols.add(p.polarity);
    recent.unshift(p);
  }
  assert.deepStrictEqual([...seenPols].sort(), ["chromaticMid", "dark", "light"]);
  const safe = pickStylePack({ slug: "minor-book", minorHarm: true, recent });
  assert.strictEqual(safe.id, "storybookVector");
});

test("ColdOpenDirector generates rules block and applies camera/transition in <50s", () => {
  const block = coldOpenRulesBlock({ hook: "belief", naming: "after", promise: "bet" });
  assert(block.includes("Cold-Open Visual Choreography"));
  assert(block.includes("crumpleToss"));

  const early = applyColdOpenDirection(
    { id: "s1", fromFrame: 120, durationFrames: 240, camera: { zoom: [1, 1], panX: [0, 0], panY: [0, 0] }, transition: { type: "dissolve", frames: 10 } },
    { index: 1, fromSec: 4, opening: { hook: "belief" }, pack: STYLE_PACKS.cobaltDrafting }
  );
  assert(early.camera.zoom[1] > 1.03, "expected energetic cold-open zoom");
  assert.strictEqual(early.transition.type, "whipPan");

  const late = applyColdOpenDirection(
    { id: "s5", fromFrame: 2400, durationFrames: 240, camera: { zoom: [1, 1], panX: [0, 0], panY: [0, 0] }, transition: { type: "dissolve", frames: 10 } },
    { index: 5, fromSec: 80, opening: { hook: "belief" }, pack: STYLE_PACKS.cobaltDrafting }
  );
  assert.strictEqual(late.transition.type, "dissolve");
});

test("ensureMotionPacing eliminates >8s motion gaps and v2-narrative-lint reports 0 gap warnings", () => {
  const scene = {
    id: "long-s1",
    fromFrame: 0,
    durationFrames: 900,
    camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
    spatialJourney: {
      variant: "topoExpedition",
      title: "TEST",
      stations: [
        { label: "A", at: 20 },
        { label: "B", at: 850 },
      ],
    },
  };
  compile10xCues(scene, { durationFrames: 900 });
  assert(Array.isArray(scene.camera.pulses) && scene.camera.pulses.length >= 2, "expected auto-injected pulses");
  const res = analyzeNarrative({ meta: { artDirection: toArtDirection("cobaltDrafting") }, scenes: [scene], captions: [] });
  const gapWarns = res.warnings.filter((w) => w.includes("motion gap"));
  assert.strictEqual(gapWarns.length, 0, `unexpected motion gap warnings: ${gapWarns.join("; ")}`);
});

test("title-lint allows Summary, flags bare titles[0] advisory, and warns on audiobook", () => {
  const narr = "Kahneman explains System 1 intuition and System 2 slow deliberation in Zillow anchoring.";
  const bare = lintTitleSet({
    titles: [
      "Thinking Fast and Slow Summary — Daniel Kahneman",
      "Thinking Fast and Slow Explained: Why System 1 Intuition Misleads",
      "Thinking Fast and Slow Analysis: How Zillow Anchoring Traps Buyers",
      "Thinking Fast and Slow Review — Daniel Kahneman",
      "Thinking Fast and Slow Key Ideas: Why Slow Deliberation Fails",
    ],
    shortTitle: "Thinking Fast and Slow",
    author: "Daniel Kahneman",
    titleAngles: [
      { kind: "insight", myth: "System 1 is reliable", claim: "System 1 intuition misleads", book: "anchoring deliberation", quote: "Kahneman explains System 1 intuition and System 2" },
      { kind: "insight", myth: "Zestimate is objective", claim: "Zillow anchoring traps buyers", book: "anchoring", quote: "System 2 slow deliberation in Zillow anchoring" },
    ],
    narration: narr,
    corpus: [],
  });
  assert.strictEqual(bare.status, "PASS", `bare failed: ${bare.errors.join("; ")}`);
  assert(bare.warnings.some((w) => w.startsWith("PRIMARY_LACKS_CTR_ANCHOR")), "expected PRIMARY_LACKS_CTR_ANCHOR warning");

  const hybrid = lintTitleSet({
    titles: [
      "Thinking Fast and Slow Summary: Why System 1 Intuition Misleads",
      "Thinking Fast and Slow Explained: How Zillow Anchoring Traps Buyers",
      "Thinking Fast and Slow Audiobook — Daniel Kahneman",
      "Thinking Fast and Slow Review — Daniel Kahneman",
      "Thinking Fast and Slow Key Ideas: Why Slow Deliberation Fails",
    ],
    shortTitle: "Thinking Fast and Slow",
    author: "Daniel Kahneman",
    titleAngles: [
      { kind: "insight", myth: "System 1 is reliable", claim: "System 1 intuition misleads", book: "anchoring deliberation", quote: "Kahneman explains System 1 intuition and System 2" },
      { kind: "insight", myth: "Zestimate is objective", claim: "Zillow anchoring traps buyers", book: "anchoring", quote: "System 2 slow deliberation in Zillow anchoring" },
    ],
    narration: narr,
    corpus: [],
  });
  assert.strictEqual(hybrid.status, "PASS", `hybrid failed: ${hybrid.errors.join("; ")}`);
  assert(!hybrid.warnings.some((w) => w.startsWith("PRIMARY_LACKS_CTR_ANCHOR")));
  assert(hybrid.warnings.some((w) => w.startsWith("AUDIOBOOK_IN_TITLE")));
});

console.log(`\nAll ${passed} Antidote 10x Phase 3 tests passed.`);
