#!/usr/bin/env node
/**
 * test-antidote-p5.js — Antidote 10x Phase 5 (Paket A + B + C) regression tests:
 *  - Paket A: v2-narrative-lint local-action drought (camera/caption excluded) & geometry alignment
 *             + qa-stills-pixel compareFramePair (caption-band exclusion & real stage change)
 *  - Paket B: HookPoster (31st device) schema + compile10xCues + cold-open-preview slicer
 *  - Paket C: CC0-1.0 organic foley pack integrity + AudioEngine foley mapping + Event Relay rules
 */
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));

function loadTs(relPath) {
  const tmpOut = path.join(os.tmpdir(), `antidote-p5-${path.basename(relPath)}-${Date.now()}.cjs`);
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
const { toArtDirection } = require("./lib/style-packs");
const { compareFramePair } = require("./qa-stills-pixel");
const { encode } = require("./lib/png-lite");
const { buildColdOpenSlice } = require("./cold-open-preview");
const { eventRelayRulesBlock } = require("./lib/cold-open");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

console.log("Running Antidote 10x Phase 5 tests...");

test("Paket B: 31 devices registered and hookPoster parses in both image-backed & imageless modes", () => {
  assert.strictEqual(DEVICE_10X_KEYS.length, 31, `expected 31 devices, got ${DEVICE_10X_KEYS.length}`);
  assert.strictEqual(classifySceneMode({ hookPoster: {} }), "hook-poster");
  const cfg = schema.antidoteConfigSchema.parse({
    meta: { slug: "p5-hook-test", title: "Hook Test", durationInFrames: 360, sfx: true, sfxPack: "foley", artDirection: toArtDirection("kraftDossier") },
    scenes: [
      {
        id: "h1",
        fromFrame: 0,
        durationFrames: 180,
        hookPoster: {
          kicker: "COLD OPEN",
          setup: "Why do smart teams still miss obvious traps?",
          payoff: "They optimize the wrong metric.",
          payoffAt: 12,
          changeAt: 28,
          beforeLabel: "ASSUMPTION",
          beforeDetail: "More data means better decisions",
          afterLabel: "REALITY",
          afterDetail: "Noise drowns out the signal",
          anomalyBadge: "METRIC TRAP",
        },
      },
      {
        id: "h2",
        fromFrame: 180,
        durationFrames: 180,
        hookPoster: {
          setup: "What changed in 90 days?",
          payoff: "Everything.",
          beforeImage: "scenes/a.png",
          afterImage: "scenes/b.png",
          revealMode: "wipe",
        },
      },
    ],
    captions: [],
  });
  assert.strictEqual(cfg.meta.sfxPack, "foley");
  assert.strictEqual(cfg.scenes[0].hookPoster.payoffAt, 12);
  assert.strictEqual(cfg.scenes[1].hookPoster.revealMode, "wipe");
});

test("Paket A: v2-narrative-lint catches camera-only local-action drought & passes well-paced scenes", () => {
  const cameraOnly = {
    meta: { artDirection: toArtDirection("cobaltDrafting") },
    scenes: [
      {
        id: "co-drought",
        fromFrame: 0,
        durationFrames: 300,
        camera: { zoom: [1, 1.03], panX: [0, 0], panY: [0, 0], pulses: [90, 180] },
        statSlam: { value: "82%", label: "Drop-off" },
      },
    ],
    captions: [],
  };
  const r1 = analyzeNarrative(cameraOnly);
  assert(r1.warnings.some((w) => w.includes("local-action drought")), "expected local-action drought warning");
  assert(r1.checks.localMotion > 0 && r1.localMotion.cameraOnlyScenes === 1);

  const paced = {
    meta: { artDirection: toArtDirection("cobaltDrafting") },
    scenes: [
      {
        id: "co-paced",
        fromFrame: 0,
        durationFrames: 210,
        hookPoster: { setup: "Setup", payoff: "Payoff", payoffAt: 40, changeAt: 110 },
      },
    ],
    captions: [],
  };
  const r2 = analyzeNarrative(paced);
  assert.strictEqual(r2.warnings.filter((w) => w.includes("local-action drought")).length, 0);
});

test("Paket A: v2-narrative-lint catches dangling cutoutStage connector & degenerate trace", () => {
  const res = analyzeNarrative({
    meta: { artDirection: toArtDirection("cobaltDrafting") },
    scenes: [
      {
        id: "geo-bad",
        fromFrame: 0,
        durationFrames: 180,
        cutoutStage: {
          actors: [{ id: "hero", image: "a.png", x: 400, y: 500 }],
          connectors: [{ from: "hero", to: "ghost_id" }],
        },
        annotatedScene: {
          image: "b.png",
          traces: [{ points: [[100, 100], [102, 101]] }],
        },
      },
    ],
    captions: [],
  });
  assert(!res.ok, "expected error for unknown connector target");
  assert(res.errors.some((e) => e.includes("cutoutStage connector references unknown target")));
  assert(res.warnings.some((w) => w.includes("annotatedScene.traces[0]")));
});

test("Paket A: qa-stills-pixel compareFramePair ignores caption band and detects real stage motion", () => {
  const w = 120, h = 100;
  const makeBuf = (fillFn) => {
    const data = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = fillFn(x, y);
        const i = (y * w + x) * 3;
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
    }
    return encode(w, h, data);
  };
  const base = makeBuf(() => [20, 24, 30]);
  const captionOnly = makeBuf((_, y) => (y >= 85 ? [240, 240, 240] : [20, 24, 30]));
  const stageMoved = makeBuf((x, y) => (y < 60 && x < 60 ? [220, 80, 60] : [20, 24, 30]));

  const rCap = compareFramePair(base, captionOnly);
  assert.strictEqual(rCap.ok, false, "caption-only change must fail stage motion");
  assert.strictEqual(rCap.changedPixelRatio, 0);
  assert.strictEqual(rCap.meanAbsDiff, 0);

  const rStage = compareFramePair(base, stageMoved);
  assert.strictEqual(rStage.ok, true, "upper stage change must pass");
  assert(rStage.changedPixelRatio > 0.2);
  assert(Number.isFinite(rStage.meanAbsDiff) && rStage.meanAbsDiff > 10);
});

test("Paket B: cold-open-preview slices <= 30s and emits stills/1 manifest with paired t05/t75 jobs", () => {
  const { slicedConfig, manifest } = buildColdOpenSlice({
    meta: { slug: "slice-test", fps: 30, durationInFrames: 3600, artDirection: toArtDirection("kraftDossier") },
    scenes: [
      { id: "s1", fromFrame: 0, durationFrames: 300, hookPoster: { setup: "A", payoff: "B", payoffAt: 15, changeAt: 60 } },
      { id: "s2", fromFrame: 300, durationFrames: 300, statSlam: { value: "42%", label: "Growth" } },
      { id: "s3", fromFrame: 600, durationFrames: 600, statSlam: { value: "99%", label: "Late" } },
    ],
    captions: [{ text: "Hi", startFrame: 0, endFrame: 90 }],
  }, { seconds: 20 });
  assert.strictEqual(slicedConfig.scenes.length, 2);
  assert.strictEqual(manifest.schema, "stills/1");
  assert.strictEqual(manifest.previewFrames, 600);
  assert.strictEqual(manifest.jobs.length, 4);
  assert.strictEqual(manifest.jobs[0].id, "s1__t05");
  assert.strictEqual(manifest.jobs[1].id, "s1__t75");
  assert(Array.isArray(manifest.jobs[0].frames) && manifest.jobs[0].frames.length === 1);
});

test("Paket C: CC0-1.0 foley pack exists with valid SHA-256 & Event Relay rules are wired", () => {
  const creditsPath = path.join(ROOT, "public", "sfx", "foley", "CREDITS.json");
  assert(fs.existsSync(creditsPath), "missing public/sfx/foley/CREDITS.json");
  const credits = JSON.parse(fs.readFileSync(creditsPath, "utf8"));
  assert(credits.count >= 15, `expected >= 15 foley items, got ${credits.count}`);
  for (const item of credits.items) {
    assert.strictEqual(item.license, "CC0-1.0");
    assert.strictEqual(item.attribution_required, false);
    const fp = path.join(ROOT, "public", "sfx", "foley", item.file);
    assert(fs.existsSync(fp), `missing foley file ${item.file}`);
    const actualSha = crypto.createHash("sha256").update(fs.readFileSync(fp)).digest("hex");
    assert.strictEqual(actualSha, item.local_sha256, `sha mismatch for ${item.file}`);
  }
  const ae = fs.readFileSync(path.join(ROOT, "src/engines/antidote/components/AudioEngine.tsx"), "utf8");
  assert(ae.includes("sfx/foley/book_flip_") && ae.includes("sfx/foley/paper_shift_"));
  assert(eventRelayRulesBlock().includes("before_state -> visible_change -> result_hold"));
  const skill = fs.readFileSync(path.join(ROOT, ".claude/skills/antidote-visual-authoring/SKILL.md"), "utf8");
  assert(skill.includes("Event Relay"));
});

test("Paket B: src/engines/antidote/index.tsx bundles cleanly with esbuild", () => {
  const tmpOut = path.join(os.tmpdir(), `antidote-p5-bundle-${Date.now()}.cjs`);
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, "src/engines/antidote/index.tsx")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: tmpOut,
    external: ["react", "remotion"],
    jsx: "automatic",
  });
  try { fs.unlinkSync(tmpOut); } catch {}
});

console.log(`\nAll ${passed} Antidote 10x Phase 5 tests passed.`);
