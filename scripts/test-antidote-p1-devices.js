#!/usr/bin/env node
/**
 * Unit tests for Antidote 10x Phase 2 (P1):
 *  - 7 new device schemas + SpatialJourney v2 + 6 layoutGrammars + 6 transitions
 *  - transitionRender() settles cleanly at localFrame >= frames
 *  - textFit.ts fitFontSize shrinks long text cleanly
 *  - style-packs.js rotation never repeats polarity, mood, or layoutGrammar
 */
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
process.env.NODE_PATH = path.join(ROOT, "node_modules");
require("module").Module._initPaths();
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));

function loadTs(relPath) {
  const tmpOut = path.join(os.tmpdir(), `antidote-p1-test-${path.basename(relPath)}-${Date.now()}.cjs`);
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
const trans = loadTs("src/engines/antidote/components/Transition.tsx");
const textFit = loadTs("src/engines/antidote/components/textFit.ts");
const sp = require("./lib/style-packs");
const { classifySceneMode } = require("./lib/v2-variety-lint");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

console.log("Running Antidote 10x Phase 2 (P1) tests...");

test("all 7 new devices + SpatialJourney v2 + 6 transitions parse cleanly", () => {
  const cfg = schema.antidoteConfigSchema.parse({
    meta: {
      slug: "p1-test",
      title: "P1 Test",
      durationInFrames: 800,
      artDirection: { stylePack: "swissModernist", layoutGrammar: "swissPoster", mood: "swissBauhaus", transitionFamily: "print", captions: "minimal" },
    },
    captions: [{ text: "Test", startFrame: 0, endFrame: 20, words: [{ w: "Test", s: 0, e: 20 }] }],
    scenes: [
      { id: "v1", fromFrame: 0, durationFrames: 100, transition: { type: "pageTurn", frames: 12 }, vennMerge: { circles: [{ label: "A" }, { label: "B" }], intersection: { label: "C" } } },
      { id: "e1", fromFrame: 100, durationFrames: 100, transition: { type: "paperTear", frames: 12 }, explodedView: { layers: [{ label: "L1" }, { label: "L2" }] } },
      { id: "g1", fromFrame: 200, durationFrames: 100, transition: { type: "pushThrough", frames: 12 }, gravityPile: { items: [{ label: "1" }, { label: "2" }, { label: "3" }] } },
      { id: "c1", fromFrame: 300, durationFrames: 100, transition: { type: "focusPull", frames: 12 }, crumpleToss: { myth: { headline: "Myth" }, truth: { headline: "Truth" } } },
      { id: "f1", fromFrame: 400, durationFrames: 100, transition: { type: "halftoneCut", frames: 12 }, analyticsFunnel: { stages: [{ label: "Top", value: "100%", share: 1 }, { label: "Bot", value: "20%", share: 0.2 }] } },
      { id: "b1", fromFrame: 500, durationFrames: 100, transition: { type: "whipPan", frames: 12 }, barRace: { epochs: [{ label: "2020", bars: [{ id: "a", label: "A", value: 10 }, { id: "b", label: "B", value: 5 }] }, { label: "2024", bars: [{ id: "a", label: "A", value: 8 }, { id: "b", label: "B", value: 20 }] }] } },
      { id: "u1", fromFrame: 600, durationFrames: 100, upClose: { image: "scenes/a.png", zoomTarget: { x: 0.5, y: 0.5, scale: 2.0 } } },
      { id: "s1", fromFrame: 700, durationFrames: 100, spatialJourney: { variant: "topoExpedition", stations: [{ label: "Start" }, { label: "Peak" }] } },
    ],
  });
  assert.strictEqual(cfg.scenes.length, 8);
  assert.strictEqual(classifySceneMode(cfg.scenes[0]), "venn-merge");
  assert.strictEqual(classifySceneMode(cfg.scenes[6]), "up-close");
});

test("all 6 new transitions settle cleanly at localFrame >= frames", () => {
  for (const type of ["pageTurn", "paperTear", "pushThrough", "focusPull", "halftoneCut", "whipPan"]) {
    const mid = trans.transitionRender({ type, frames: 12, color: "#F7C948" }, 6);
    assert.ok(mid.style && typeof mid.style === "object", `${type} mid should return style`);
    const end = trans.transitionRender({ type, frames: 12, color: "#F7C948" }, 12);
    assert.deepStrictEqual(end, { style: {}, overlay: null }, `${type} must settle cleanly`);
  }
});

test("textFit.ts fitFontSize shrinks long text and respects minSize", () => {
  const shortSize = textFit.fitFontSize("Short", { maxWidth: 400, maxLines: 1, baseSize: 48, minSize: 20 });
  const longSize = textFit.fitFontSize("This is an extraordinarily long headline that must shrink to fit", { maxWidth: 400, maxLines: 2, baseSize: 48, minSize: 20 });
  assert.strictEqual(shortSize, 48);
  assert.ok(longSize < 48 && longSize >= 20, `expected shrunk size in [20, 48), got ${longSize}`);
});

test("style-packs.js rotation alternates polarity, mood, and layoutGrammar", () => {
  const recent = [];
  for (let i = 0; i < 6; i++) {
    const p = sp.pickStylePack({ slug: `book-${i}`, genre: "strategy", recent });
    if (recent[0]) {
      assert.notStrictEqual(p.polarity, recent[0].polarity);
      assert.notStrictEqual(p.mood, recent[0].mood);
      assert.notStrictEqual(p.layoutGrammar, recent[0].layoutGrammar);
    }
    recent.unshift(p);
  }
  assert.strictEqual(sp.pickStylePack({ slug: "trauma-book", minorHarm: true }).id, "storybookVector");
});

console.log(`\nAll ${passed} Antidote 10x Phase 2 (P1) tests passed.`);
