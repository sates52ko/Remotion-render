#!/usr/bin/env node
/**
 * Unit & regression tests for Antidote 2.0 opt-in visual-thinking engine upgrades:
 *  - schema.ts: artDirection, bg.stageMood, bg.image, depthCarry, visualEquation,
 *    comparisonGrid, dataMatrix (quadrant2x2 / dualCurve / schedule), realAnchor,
 *    motion-doctrine / cut-the-curve transitions
 *  - backward compatibility: legacy configs parse identically without opt-in fields
 *  - Transition.tsx: motion-doctrine transitions settle cleanly at localFrame >= frames
 *  - artDirection.tsx: all 5 stage moods resolve complete palettes
 */
const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

// Use tsx / ts-node via npx or esbuild-register if available; fallback to Remotion's bundled esbuild
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));
const fs = require("fs");
const os = require("os");

function loadTs(relPath) {
  const tmpOut = path.join(os.tmpdir(), `antidote-v2-test-${path.basename(relPath)}-${Date.now()}.cjs`);
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

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

console.log("Running Antidote 2.0 tests...");

test("legacy config without artDirection parses byte-compatibly", () => {
  const legacy = {
    meta: { slug: "legacy-book", title: "Legacy", durationInFrames: 300 },
    scenes: [
      { id: "s1", fromFrame: 0, durationFrames: 150, shot: "medium" },
      { id: "s2", fromFrame: 150, durationFrames: 150, transition: { type: "dissolve", frames: 10 } },
    ],
    captions: [],
  };
  const parsed = schema.antidoteConfigSchema.parse(legacy);
  assert.strictEqual(parsed.meta.artDirection, undefined);
  assert.strictEqual(parsed.meta.sfx, undefined);
  assert.strictEqual(parsed.scenes[0].depthCarry, undefined);
  assert.strictEqual(parsed.scenes[0].visualEquation, undefined);
  assert.strictEqual(parsed.scenes[0].bg.stageMood, undefined);
  assert.strictEqual(parsed.scenes[0].bg.image, undefined);
});

test("Antidote 2.0 meta.artDirection + cut-the-curve transitions parse cleanly", () => {
  const v2 = {
    meta: {
      slug: "antidote-v2-pilot",
      title: "Antidote 2.0 Pilot",
      durationInFrames: 900,
      artDirection: {
        style: "editorial ink and moody charcoal wash",
        mood: "obsidianGrid",
        captions: "off",
        hud: "off",
        motionDoctrine: true,
        palette: { accent: "#F7C948" },
      },
      take: { note: "Original operator commentary preserved for YPP." },
    },
    scenes: [
      {
        id: "anchor-1",
        fromFrame: 0,
        durationFrames: 180,
        transition: { type: "zoomPush", frames: 12 },
        bg: { stageMood: "obsidianGrid", image: { path: "scenes/pilot/bg1.png", dim: 0.45, kenBurns: "pushIn" } },
        realAnchor: {
          title: "Deep Work",
          subtitle: "Cal Newport",
          badge: "BOOK ANCHOR",
          annotations: [
            { text: "Computer Science Professor", side: "left" },
            { text: "PhD from MIT", side: "right" },
          ],
        },
      },
      {
        id: "eq-2",
        fromFrame: 180,
        durationFrames: 180,
        depthCarry: true,
        transition: { type: "slideCarryLeft", frames: 10 },
        bg: { stageMood: "deepViolet" },
        visualEquation: {
          title: "Mental Shortcuts",
          operator: "arrow",
          nodes: [
            { label: "Objective Reality", badge: "INPUT" },
            { label: "Cognitive Filter", badge: "MECHANISM", tone: "accent" },
            { label: "Perceived Choice", badge: "OUTCOME", tone: "positive" },
          ],
          footnote: "Framing beats raw numbers.",
        },
      },
      {
        id: "cmp-3",
        fromFrame: 360,
        durationFrames: 180,
        transition: { type: "blurCut", frames: 10 },
        bg: { stageMood: "crimsonNight" },
        comparisonGrid: {
          title: "ANCHORING EFFECT",
          columns: [
            { heading: "High Anchor", tag: "$10,000", bullets: ["Offer: $7,000", "Feels like a $3,000 win"], tone: "positive", highlight: "Accepted" },
            { heading: "Low Anchor", tag: "$3,000", bullets: ["Offer: $7,000", "Feels like a $4,000 loss"], tone: "danger", highlight: "Rejected" },
          ],
        },
      },
      {
        id: "mat-4",
        fromFrame: 540,
        durationFrames: 180,
        transition: { type: "zoomPull", frames: 10 },
        bg: { stageMood: "slateEditorial" },
        dataMatrix: {
          variant: "dualCurve",
          title: "Anger vs Damage",
          xLabel: "TIME",
          yLabel: "INTENSITY",
          curves: [
            { label: "anger", points: [0, 0.95, 0.8, 0.15, 0.08] },
            { label: "damage", points: [0, 0.55, 0.62, 0.6, 0.58] },
          ],
          callout: "Emotion fades; consequences stay.",
        },
      },
      {
        id: "sched-5",
        fromFrame: 720,
        durationFrames: 180,
        transition: { type: "slideCarryUp", frames: 10 },
        bg: { stageMood: "warmParchment" },
        dataMatrix: {
          variant: "schedule",
          title: "Weekly Cadence",
          schedule: [
            { day: "Mon", blocks: [{ label: "Deep 9-12", active: true, tone: "accent" }, { label: "Email" }] },
            { day: "Tue", blocks: [{ label: "Shallow" }, { label: "Deep 2-5", active: true, tone: "positive" }] },
          ],
        },
      },
    ],
    captions: [],
  };
  const parsed = schema.antidoteConfigSchema.parse(v2);
  assert.strictEqual(parsed.meta.artDirection.captions, "off");
  assert.strictEqual(parsed.meta.artDirection.hud, "off");
  assert.strictEqual(parsed.scenes.length, 5);
  assert.strictEqual(parsed.scenes[1].depthCarry, true);
  assert.strictEqual(parsed.scenes[1].visualEquation.nodes.length, 3);
  assert.strictEqual(parsed.scenes[2].comparisonGrid.columns.length, 2);
  assert.strictEqual(parsed.scenes[3].dataMatrix.variant, "dualCurve");
  assert.strictEqual(parsed.scenes[4].dataMatrix.variant, "schedule");
});

test("quadrant2x2 dataMatrix variant parses cleanly", () => {
  const q = schema.dataMatrixSchema.parse({
    variant: "quadrant2x2",
    title: "Black Swans",
    xLabel: "KNOWLEDGE",
    yLabel: "AWARENESS",
    quadrants: [
      { label: "Known Knowns" },
      { label: "Known Unknowns" },
      { label: "Unknown Knowns" },
      { label: "Unknown Unknowns", sublabel: "Leave room to be wrong", tone: "accent", active: true },
    ],
  });
  assert.strictEqual(q.quadrants.length, 4);
  assert.strictEqual(q.quadrants[3].active, true);
});

test("all 19 stage moods resolve complete art palettes + WCAG light-mood contrast guard + isLightPalette", () => {
  const moods = [
    "obsidianGrid", "deepViolet", "warmParchment", "crimsonNight", "slateEditorial", "blueprintNavy",
    "inkScroll", "emeraldNoir", "ivoryBroadsheet", "sageBotanical", "terracottaStudio",
    "swissBauhaus", "monoclePrint", "archivalBroadsheet", "sunlitRiso",
    "cyberXRay", "bauhausNocturne", "flutedGallery", "chalkboardLecture",
  ];
  for (const m of moods) {
    const pal = artDir.resolveArtPalette({ mood: m });
    for (const k of ["bg", "surface", "ink", "muted", "accent", "accent2", "danger", "positive"]) {
      assert.ok(typeof pal[k] === "string" && pal[k].length > 0, `mood ${m} missing ${k}`);
    }
  }
  assert.strictEqual(artDir.isLightPalette(artDir.resolveArtPalette({ mood: "ivoryBroadsheet" })), true);
  assert.strictEqual(artDir.isLightPalette(artDir.resolveArtPalette({ mood: "obsidianGrid" })), false);
  assert.ok(artDir.resolveArtFonts({ typography: "serif" }).display.includes("Playfair"));
  const overridden = artDir.resolveArtPalette({ mood: "obsidianGrid", palette: { accent: "#123456" } });
  assert.strictEqual(overridden.accent, "#123456");
  const lightSafe = artDir.resolveArtPalette({ mood: "obsidianGrid", palette: { accent: "#F5B73B" } }, "warmParchment");
  assert.strictEqual(lightSafe.accent, "#C2410C");
});

test("6 new Antidote 10x devices + style-packs polarity alternation + v2-variety-lint", () => {
  const s = schema.antidoteConfigSchema.parse({
    meta: { slug: "ess", title: "Essentialism", durationInFrames: 600, artDirection: { stylePack: "kinfolkMinimal", polarity: "light", typography: "serif", annotationStyle: "bracket", nodeShape: "tornPaper", mood: "ivoryBroadsheet", captions: "minimal" } },
    captions: [{ text: "Less", startFrame: 0, endFrame: 20, words: [{ w: "Less", s: 0, e: 20 }] }],
    scenes: [
      { id: "k1", fromFrame: 0, durationFrames: 100, kineticManifesto: { lines: [{ text: "ADDITION", strikeAt: 20 }, { text: "SUBTRACTION", emphasis: true }] } },
      { id: "e1", fromFrame: 100, durationFrames: 100, editorialSpread: { image: "scenes/a.png", mediaSide: "left", headline: "Carve Away" } },
      { id: "c1", fromFrame: 200, durationFrames: 100, cutoutStage: { backdrop: { image: "scenes/bg.png" }, actors: [{ id: "a", image: "scenes/c.png", x: 500, y: 550 }] } },
      { id: "d1", fromFrame: 300, durationFrames: 100, decisionTree: { root: { label: "Success" }, branches: [{ label: "Trap", pruneAt: 30 }, { label: "Focus", winner: true }] } },
      { id: "b1", fromFrame: 400, durationFrames: 100, balanceScale: { leftLabel: "Cost", rightLabel: "Safety", leftWeights: [{ label: "Revenue", weight: 1 }], rightWeights: [{ label: "Lives", weight: 3 }] } },
      { id: "s1", fromFrame: 500, durationFrames: 100, stackReveal: { variant: "burners", items: [{ label: "Work", level: 0.9 }, { label: "Health", level: 0.8, targetLevel: 0, changeAt: 30 }] } },
    ],
  });
  assert.strictEqual(s.scenes.length, 6);

  const sp = require("./lib/style-packs");
  assert.strictEqual(Object.keys(sp.STYLE_PACKS).length, 19);
  const pDark = sp.STYLE_PACKS.tacticalBlueprint;
  const pNext = sp.pickStylePack({ slug: "essentialism", genre: "productivity", recent: [pDark] });
  assert.strictEqual(pNext.polarity, "light");

  const { assertVariety } = require("./lib/v2-variety-lint");
  assert.throws(() => assertVariety({
    meta: { artDirection: { captions: "off" } },
    captions: [],
    scenes: [{ id: "bad-cutout", cutoutStage: { backdrop: { image: "x.png" }, actors: [{ id: "a", image: "y.png", x: 100, y: 100 }] }, characters: [{ id: "c1" }] }],
  }), /Single-World violation/);
});

test("5 new Next-Level schemas + v2-narrative-lint + 10x thumbnail layouts", () => {
  const cfg = schema.antidoteConfigSchema.parse({
    meta: {
      slug: "nl-test",
      title: "Next Level",
      durationInFrames: 500,
      artDirection: { stylePack: "kinfolkMinimal", layoutGrammar: "editorialLeft", captionAlign: "left", captions: "minimal" },
    },
    captions: [{ text: "Test", startFrame: 0, endFrame: 20, words: [{ w: "Test", s: 0, e: 20 }] }],
    scenes: [
      { id: "li", fromFrame: 0, durationFrames: 100, liveInterface: { variant: "calendarTetris", channels: [{ name: "#eng", count: 9 }], blocks: [{ day: 0, label: "Sync", at: 10 }] } },
      { id: "cs", fromFrame: 100, durationFrames: 100, comicStrip: { layout: "quad2x2", panels: [{ step: "PHASE 1", title: "Focus" }, { step: "PHASE 2", title: "Options" }] } },
      { id: "bw", fromFrame: 200, durationFrames: 100, beforeAfterWipe: { direction: "diagonal", wipeAt: 30, before: { label: "A", headline: "Old" }, after: { label: "B", headline: "New" } } },
      { id: "sj", fromFrame: 300, durationFrames: 100, spatialJourney: { stations: [{ label: "Start" }, { label: "End" }] } },
      { id: "ci", fromFrame: 400, durationFrames: 100, chapterInterstitial: { variant: "broadsheetRule", kicker: "PART 01", title: "Begin" } },
    ],
  });
  assert.strictEqual(cfg.scenes.length, 5);

  const { analyzeNarrative } = require("./lib/v2-narrative-lint");
  assert.strictEqual(analyzeNarrative(cfg).ok, true);

  const conflict = analyzeNarrative({
    captions: [],
    scenes: [
      { id: "p1", fromFrame: 0, durationFrames: 100, comicStrip: { panels: [{ step: "PHASE 4", title: "Core Clarity" }] } },
      { id: "p2", fromFrame: 100, durationFrames: 100, annotatedScene: { banner: { text: "PHASE 4 · DISTRACTED FROM CORE" } } },
    ],
  });
  assert.ok(conflict.warnings.some((w) => w.includes("conflicts")));

  const ts = loadTs("src/engines/thumbnail-shared.ts");
  assert.ok(ts.THUMB_LAYOUTS.includes("editorial-cover-10x") && ts.THUMB_LAYOUTS.includes("cutout-hero-10x"));
});

test("timelineScrub and statSlam schemas + style-packs.js + castMode illustrated lint", () => {
  const s = schema.antidoteConfigSchema.parse({
    meta: { slug: "p", title: "P", durationInFrames: 200, artDirection: { stylePack: "tacticalBlueprint", castMode: "illustrated", mood: "blueprintNavy", captions: "minimal" } },
    captions: [{ text: "Test", startFrame: 0, endFrame: 20, words: [{ w: "Test", s: 0, e: 20 }] }],
    scenes: [
      { id: "t1", fromFrame: 0, durationFrames: 100, timelineScrub: { events: [{ time: "0s", title: "A", at: 0 }, { time: "5s", title: "B", at: 50 }], loopLabel: "LOOP" } },
      { id: "s1", fromFrame: 100, durationFrames: 100, statSlam: { value: "92%", label: "Test", bars: [{ label: "X", value: 0.9 }] } },
    ],
  });
  assert.strictEqual(s.scenes[0].timelineScrub.events.length, 2);
  assert.strictEqual(s.scenes[1].statSlam.value, "92%");

  const sp = require("./lib/style-packs");
  assert.strictEqual(sp.pickStylePack({ slug: "x", minorHarm: true }).id, "storybookVector");
  const p1 = sp.pickStylePack({ slug: "book-a", genre: "strategy", recent: [] });
  const p2 = sp.pickStylePack({ slug: "book-b", genre: "strategy", recent: [p1] });
  assert.notStrictEqual(p1.id, p2.id);
  assert.notStrictEqual(p1.mood, p2.mood);

  const { assertVariety } = require("./lib/v2-variety-lint");
  assert.throws(() => assertVariety({
    meta: { artDirection: { castMode: "illustrated", captions: "off" } },
    captions: [],
    scenes: [{ id: "bad", characters: [{ id: "c1" }] }],
  }), /castMode "illustrated"/);
});

test("Hybrid Antidote 2.1 fields (fullBleedSplit, borderless, groundFog) parse cleanly", () => {
  const hybrid = schema.antidoteConfigSchema.parse({
    meta: { slug: "hybrid-test", title: "Hybrid", durationInFrames: 300, artDirection: { captions: "minimal" } },
    captions: [{ text: "Hello world", startFrame: 0, endFrame: 30, words: [{ w: "Hello", s: 0, e: 15 }] }],
    scenes: [
      {
        id: "s1", fromFrame: 0, durationFrames: 100,
        bg: { image: { path: "scenes/a.png", dim: 0.25, groundFog: 0.5, kenBurns: "pushIn" } },
        comparisonGrid: { layout: "fullBleedSplit", columns: [{ heading: "A", bullets: ["x"] }, { heading: "B", bullets: ["y"] }] },
      },
      {
        id: "s2", fromFrame: 100, durationFrames: 100,
        visualEquation: { layout: "borderless", nodes: [{ label: "One" }, { label: "Two" }] },
      },
      {
        id: "s3", fromFrame: 200, durationFrames: 100,
        dataMatrix: { variant: "quadrant2x2", borderless: true, quadrants: [{ label: "Q1" }, { label: "Q2" }, { label: "Q3" }, { label: "Q4", active: true }] },
      },
    ],
  });
  assert.strictEqual(hybrid.scenes[0].bg.image.groundFog, 0.5);
  assert.strictEqual(hybrid.scenes[0].comparisonGrid.layout, "fullBleedSplit");
  assert.strictEqual(hybrid.scenes[1].visualEquation.layout, "borderless");
  assert.strictEqual(hybrid.scenes[2].dataMatrix.borderless, true);
});

test("v2-variety-lint passes balanced hybrid and rejects 40% boxed-card config", () => {
  const { assertVariety } = require("./lib/v2-variety-lint");
  const balanced = {
    meta: { artDirection: { captions: "minimal" } },
    captions: [{ text: "Hi", startFrame: 0, endFrame: 10 }],
    scenes: [
      { id: "1", comparisonGrid: { layout: "fullBleedSplit" } },
      { id: "2", characters: [{ id: "a" }] },
      { id: "3", characters: [{ id: "a" }], continueFromPrev: true },
      { id: "4", dataMatrix: { variant: "dualCurve", borderless: true } },
      { id: "5", realAnchor: { title: "Book" } },
      { id: "6", visualEquation: { layout: "borderless" } },
    ],
  };
  const stats = assertVariety(balanced);
  assert.strictEqual(stats.total, 6);
  assert.strictEqual(stats.continuityCount, 1);

  const repetitive = {
    meta: { artDirection: { captions: "off" } },
    captions: [],
    scenes: [
      { id: "1", comparisonGrid: { columns: [] } },
      { id: "2", comparisonGrid: { columns: [] } },
      { id: "3", characters: [{ id: "a" }] },
      { id: "4", characters: [{ id: "a" }] },
      { id: "5", characters: [{ id: "a" }] },
    ],
  };
  assert.throws(() => assertVariety(repetitive), /boxed-card share/);
});

test("Antidote 10x Single-World schemas (annotatedScene, cohortGrid, shotIntent, highlightPhrases) parse cleanly", () => {
  const s = schema.antidoteConfigSchema.parse({
    meta: { slug: "v10x-test", title: "10x", durationInFrames: 300, artDirection: { captions: "minimal" } },
    captions: [{ text: "Hi", startFrame: 0, endFrame: 15, words: [{ w: "Hi", s: 0, e: 15 }] }],
    scenes: [
      {
        id: "a1", fromFrame: 0, durationFrames: 150,
        shotIntent: { job: "annotate-place", subject: "lobby", action: "trace", payoff: "shows hierarchy" },
        annotatedScene: {
          image: "scenes/a.png",
          framing: "editorialPrint",
          spotlights: [{ cx: 500, cy: 400, rx: 120, label: "LOBBY", at: 30 }],
          traces: [{ from: { x: 500, y: 400 }, to: { x: 500, y: 200 }, at: 40 }],
          stickers: [{ title: "SAFETY", icon: "check", x: 200, y: 500, at: 60 }],
        },
      },
      {
        id: "c1", fromFrame: 150, durationFrames: 150,
        shotIntent: { job: "cohort-split", subject: "pairs", action: "split", payoff: "50/50 split" },
        cohortGrid: {
          total: 20, splitAt: 30,
          leftGroup: { label: "Task", share: 0.5, tone: "accent" },
          rightGroup: { label: "Control", share: 0.5 },
        },
      },
    ],
  });
  assert.strictEqual(s.scenes[0].annotatedScene.framing, "editorialPrint");
  assert.strictEqual(s.scenes[1].cohortGrid.total, 20);
});

test("v2-variety-lint rejects Single-World collision (characters over bg.image without emptyStage)", () => {
  const { assertVariety } = require("./lib/v2-variety-lint");
  const clash = {
    meta: { artDirection: { captions: "off" } },
    captions: [],
    scenes: [
      { id: "bad", bg: { image: { path: "scenes/people.png" } }, characters: [{ id: "p1" }] },
    ],
  };
  assert.throws(() => assertVariety(clash), /Single-World violation/);
});

test("antidote-10x-keys covers all 26 devices and isFullStage10x rules", () => {
  const keys = require("./lib/antidote-10x-keys");
  assert.strictEqual(keys.DEVICE_10X_KEYS.length, 26);
  assert.strictEqual(keys.hasAny10xDevice({ timelineScrub: { title: "X" } }), true);
  assert.strictEqual(keys.isFullStage10x({ timelineScrub: { title: "X" } }), true);
  assert.strictEqual(keys.isFullStage10x({ visualEquation: { layout: "borderless" }, cast: [] }), true);
  assert.strictEqual(keys.isFullStage10x({ visualEquation: { layout: "borderless" }, cast: ["laurel"] }), false);
});

test("storyboard.js merge passes valid 10x devices to art.json and rejects invalid/colliding 10x beats", () => {
  const fs = require("fs");
  const path = require("path");
  const { execFileSync } = require("child_process");
  const root = path.resolve(__dirname, "..");
  const slug = "__test-10x-merge-tmp";
  const dir = path.join(root, "books", slug);
  const sbDir = path.join(dir, "storyboard");
  const vttPath = path.join(root, "public", "captions", `${slug}.vtt`);
  try {
    fs.mkdirSync(sbDir, { recursive: true });
    fs.mkdirSync(path.dirname(vttPath), { recursive: true });
    fs.writeFileSync(vttPath, "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nTen<00:00:00.500><c> years</c><00:00:01.000><c> passed</c><00:00:01.500><c> without</c><00:00:02.000><c> a</c><00:00:02.500><c> single</c><00:00:03.000><c> clue.</c>\n");
    fs.writeFileSync(path.join(dir, "book.json"), JSON.stringify({
      slug,
      title: "Test",
      engine: "antidote",
      stylePack: "storybookVector",
      engineProfile: { kind: "fiction", world: "contemporary", era: 2015, realPeople: false, format: "story", violence: "none", minorHarm: false, mustSee: ["Timeline", "Clues", "Room"] },
    }, null, 2));
    fs.writeFileSync(path.join(dir, "story-bible.json"), JSON.stringify({
      cast: { laurel: { name: "Laurel", look: "dark coat", variant: { gender: "female", age: "adult", outfit: "coat", suit: "#222222", hair: "#4a3222", hairStyle: "short" } } },
      ownIcons: [],
      signatureObjects: [],
    }, null, 2));
    fs.writeFileSync(path.join(sbDir, "beats.json"), JSON.stringify({
      beats: [{ i: 0, narration: "Ten years passed between 2005 and 2015 without a single clue." }],
    }, null, 2));

    // 1. Valid 10x beat
    fs.writeFileSync(path.join(sbDir, "authored-0.json"), JSON.stringify([{
      i: 0,
      concept: null,
      diagram: null,
      callout: null,
      cast: [],
      stageMood: "warmParchment",
      shotIntent: { job: "mechanism-flow", subject: "10 years", action: "scrub", payoff: "gap" },
      timelineScrub: {
        title: "TEN YEARS",
        events: [
          { time: "2005", title: "Ellie vanishes" },
          { time: "2015", title: "Poppy appears", at: 40 },
        ],
      },
      storyboard: {
        claim: "Ten years passed",
        concreteVisual: "Timeline 2005 to 2015",
        onScreenText: "TEN YEARS",
        relationToPrevious: "Opens mystery",
        addedInformation: "Exact decade gap",
      },
    }], null, 2));
    try {
      execFileSync("node", [path.join(root, "scripts", "storyboard.js"), "prep", `--slug=${slug}`], { cwd: root, stdio: "pipe" });
      execFileSync("node", [path.join(root, "scripts", "storyboard.js"), "merge", `--slug=${slug}`, "--write"], { cwd: root, stdio: "pipe" });
    } catch (err) {
      throw new Error(`merge failed:\n${err.stdout?.toString() || ""}\n${err.stderr?.toString() || ""}`);
    }
    const art = JSON.parse(fs.readFileSync(path.join(dir, "art.json"), "utf8"));
    assert.strictEqual(art.beats[0].timelineScrub.title, "TEN YEARS");
    assert.strictEqual(art.beats[0].stageMood, "warmParchment");
    assert.strictEqual(art.beats[0].shotIntent.job, "mechanism-flow");

    // 2. Invalid Zod payload (events.length < 2)
    fs.writeFileSync(path.join(sbDir, "authored-0.json"), JSON.stringify([{
      i: 0,
      concept: null,
      cast: [],
      timelineScrub: { title: "BAD", events: [] },
      storyboard: { claim: "a", concreteVisual: "b", onScreenText: "c", relationToPrevious: "d", addedInformation: "e" },
    }], null, 2));
    assert.throws(() => execFileSync("node", [path.join(root, "scripts", "storyboard.js"), "merge", `--slug=${slug}`, "--write"], { cwd: root, stdio: "pipe" }));

    // 3. Single-World violation (fullStage10x + cast)
    fs.writeFileSync(path.join(sbDir, "authored-0.json"), JSON.stringify([{
      i: 0,
      concept: null,
      cast: ["laurel"],
      timelineScrub: { title: "BAD", events: [{ time: "2005", title: "A" }, { time: "2015", title: "B" }] },
      storyboard: { claim: "a", concreteVisual: "b", onScreenText: "c", relationToPrevious: "d", addedInformation: "e" },
    }], null, 2));
    assert.throws(() => execFileSync("node", [path.join(root, "scripts", "storyboard.js"), "merge", `--slug=${slug}`, "--write"], { cwd: root, stdio: "pipe" }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(vttPath, { force: true });
  }
});

test("authorship fullStage10x lock catches post-plan pollution and restores cleanly", () => {
  const { stagingDrift, restoreAuthoredStaging, evaluateAuthorship } = require("./lib/authorship");
  const cfg = {
    meta: { slug: "test-10x" },
    scenes: [{
      id: "s0",
      shot: "medium",
      timelineScrub: { title: "TEN YEARS", events: [{ time: "2005", title: "A" }, { time: "2015", title: "B" }] },
      characters: [{ id: "c0", identity: "everyman", role: "everyman" }],
      props: [{ type: "lightbulb" }],
      texts: [{ text: "POLLUTED" }],
      chapterCard: { title: "X" },
      _authorship: {
        src: "art",
        propTypes: [],
        lock: {
          planShot: "medium",
          shot: "medium",
          cast: [],
          concept: null,
          props: [],
          propTypes: [],
          fullStage10x: true,
        },
      },
    }],
  };
  const drift = stagingDrift(cfg.scenes[0]);
  assert.ok(drift.length >= 3, "should detect polluted cast, props, texts, chapterCard");
  const repaired = restoreAuthoredStaging(cfg);
  assert.strictEqual(repaired, 1);
  assert.deepStrictEqual(cfg.scenes[0].characters, []);
  assert.deepStrictEqual(cfg.scenes[0].props, []);
  assert.deepStrictEqual(cfg.scenes[0].texts, []);
  assert.strictEqual(cfg.scenes[0].chapterCard, undefined);
  assert.strictEqual(cfg.scenes[0].timelineScrub.title, "TEN YEARS");
  const ev = evaluateAuthorship(cfg, { engine: "antidote", slug: "test-10x" });
  assert.strictEqual(ev.status, "PASS");
});

test("thumbnail-grammar 10x mode picks 3 distinct 10x layouts and never falls back to scene-still/text-poster", () => {
  const { pickVariants, distance, TENX_LAYOUTS } = require("./lib/thumbnail-grammar");
  const vs = pickVariants({ slug: "then-she-was-gone", engine: "antidote", history: [], n: 3, is10x: true, hasCutout: false });
  assert.strictEqual(vs.length, 3);
  for (const v of vs) {
    assert.ok(TENX_LAYOUTS.has(v.layout), `expected 10x layout, got ${v.layout}`);
  }
  assert.strictEqual(new Set(vs.map((v) => v.layout)).size, 3, "A/B/C should use 3 distinct 10x layouts");
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      assert.ok(distance(vs[i], vs[j]) >= 5, `variants ${i}/${j} too close`);
    }
  }
});

test("thumbHero.pickHeroScenes prioritizes 10x devices over legacy Everyman scenes", () => {
  const { pickHeroScenes } = require("../src/engines/antidote/thumbHero.ts");
  const scenes = [
    { id: "s0", durationFrames: 180, shot: "twoShot", bg: { set: "kitchen" }, characters: [{ id: "c1", role: "laurel", expression: "worried" }, { id: "c2", role: "floyd", expression: "happy" }] },
    { id: "s1", durationFrames: 180, shot: "medium", chapterInterstitial: { title: "PART 1" } },
    { id: "s2", durationFrames: 180, shot: "medium", timelineScrub: { title: "10 YEARS", events: [{ time: "2005", title: "A" }, { time: "2015", title: "B" }] } },
    { id: "s3", durationFrames: 180, shot: "medium", spatialJourney: { title: "MAP", stations: [{ label: "A" }, { label: "B" }] } },
    { id: "s4", durationFrames: 180, shot: "medium", beforeAfterWipe: { before: { label: "2005", headline: "A" }, after: { label: "2015", headline: "B" } } },
  ];
  const picked = pickHeroScenes(scenes, "NOBODY LOOKED", undefined, 3);
  assert.strictEqual(picked.length, 3);
  assert.deepStrictEqual(picked.map((s) => s.id).sort(), ["s2", "s3", "s4"]);
});

test("compile10xCues clamps out-of-bounds authored at and strikeAt timestamps", () => {
  const { compile10xCues } = require("./lib/compile-10x-cues");
  const scene = {
    id: "scene-45",
    durationFrames: 213,
    kineticManifesto: {
      kicker: "2005 -> 2015",
      lines: [
        { text: "TEN YEARS OF WAITING", at: 165 },
        { text: "ELLIE COMES HOME", at: 205, strikeAt: 245 },
      ],
    },
  };
  compile10xCues(scene, { durationFrames: 213, fps: 30 });
  assert.ok(scene.kineticManifesto.lines[0].at <= 154, `expected line 0 at <= 154, got ${scene.kineticManifesto.lines[0].at}`);
  assert.ok(scene.kineticManifesto.lines[1].at <= 154, `expected line 1 at <= 154, got ${scene.kineticManifesto.lines[1].at}`);
  assert.ok(scene.kineticManifesto.lines[1].strikeAt <= 189, `expected strikeAt <= 189, got ${scene.kineticManifesto.lines[1].strikeAt}`);
});

test("ArtDirectionProvider is exported and Thumbnail.tsx bundles cleanly", () => {
  assert.ok(artDir.ArtDirectionProvider, "ArtDirectionProvider must be exported from artDirection.tsx");
  assert.strictEqual(artDir.ArtDirectionProvider, artDir.ArtDirectionContext.Provider);
  const thumbSrc = fs.readFileSync(path.join(ROOT, "src/engines/antidote/Thumbnail.tsx"), "utf8");
  const m = thumbSrc.match(/import\s*\{([^}]+)\}\s*from\s*["']\.\/components\/artDirection["']/);
  assert.ok(m, "Thumbnail.tsx should import from ./components/artDirection");
  const runtimeImports = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("type "));
  for (const sym of runtimeImports) {
    assert.ok(artDir[sym] !== undefined, `artDirection.tsx missing runtime export: ${sym}`);
  }
  const tmpOut = path.join(os.tmpdir(), `antidote-thumb-bundle-${Date.now()}.cjs`);
  try {
    esbuild.buildSync({
      entryPoints: [path.join(ROOT, "src/engines/antidote/Thumbnail.tsx")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: tmpOut,
      external: ["react", "remotion"],
      jsx: "automatic",
    });
    assert.ok(fs.existsSync(tmpOut));
  } finally {
    try { fs.unlinkSync(tmpOut); } catch {}
  }
});

test("lintPack fails closed on failed/stale thumbnail-check.json", () => {
  const crypto = require("crypto");
  const { lintPack } = require("./lib/title-lint");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lintpack-thumb-"));
  const slug = "zz-thumb-check";
  const bDir = path.join(tmp, "books", slug);
  const outDir = path.join(tmp, "out");
  const capDir = path.join(tmp, "public", "captions");
  fs.mkdirSync(bDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(capDir, { recursive: true });
  try {
    const grammar = { layout: "editorial-cover-10x", textPos: "left", type: "editorial", treatment: "color", accent: "gold", sceneRank: 0 };
    const variants = [grammar];
    const grammarSig = crypto.createHash("sha256").update(JSON.stringify({ grammar, variants })).digest("hex").slice(0, 16);
    const pngRel = `out/thumbnail-${slug}.png`;
    fs.writeFileSync(path.join(tmp, pngRel), "PNG_BYTES_V1");
    const pngSha = crypto.createHash("sha256").update("PNG_BYTES_V1").digest("hex");
    const hook = "NOBODY LOOKED";
    const meta = {
      bookTitle: "Test Book",
      author: "Jane Doe",
      needsClaudeRefine: false,
      alteredContent: true,
      titles: [
        "Test Book Summary — Jane Doe",
        "Test Book Explained: Why Laurel Waits",
        "Test Book Ending Explained: The Bus Isn't Healing",
        "Test Book Analysis: Floyd's Lie by Jane Doe",
        "Test Book Review: Ten Years",
      ],
      titleAngles: [
        { kind: "myth", myth: "Laurel heals", book: "Laurel repeats the substitution", quote: "Laurel waits on the bus every morning" },
        { kind: "myth", myth: "Floyd is kind", book: "Floyd lies daily", quote: "Floyd lies daily to everyone around him" },
      ],
      description: "Producer's note: \"A sharp thriller.\"\n\nTest Book by Jane Doe. Laurel waits on the bus every morning while Floyd lies daily to everyone around him.\n\n0:00 Intro\n0:30 Middle\n1:00 End",
      chapters: [{ t: 0, label: "Intro" }, { t: 30, label: "Middle" }, { t: 60, label: "End" }],
      tags: ["Test Book", "Jane Doe", "Laurel", "Floyd"],
      hashtags: ["#TestBook", "#JaneDoe"],
      thumbnail: { hook, grammar, variants },
    };
    fs.writeFileSync(path.join(bDir, "book.json"), JSON.stringify({ slug, title: "Test Book", author: "Jane Doe", take: { by: "operator", note: "A sharp thriller." } }));
    fs.writeFileSync(path.join(bDir, "youtube-meta.json"), JSON.stringify(meta));
    fs.writeFileSync(path.join(bDir, "youtube.md"), `${meta.titles.join("\n")}\n${meta.description}\nAltered content: Yes\n`);
    fs.writeFileSync(path.join(capDir, `${slug}.clean.vtt`), "WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\nLaurel waits on the bus every morning while Floyd lies daily to everyone around him.\n");

    // 1. Passing check
    fs.writeFileSync(path.join(bDir, "thumbnail-check.json"), JSON.stringify({ slug, hook, grammarSig, ok: true, variants: [{ letter: "A", file: pngRel, sha256: pngSha, hookVisible: true }] }));
    const okRes = lintPack(slug, tmp);
    assert.ok(!okRes.errors.some((e) => /THUMBNAIL|HOOK_/.test(e)), `unexpected thumb error: ${okRes.errors.join("; ")}`);

    // 2. Failed render (ok: false)
    fs.writeFileSync(path.join(bDir, "thumbnail-check.json"), JSON.stringify({ slug, hook, grammarSig, ok: false, variants: [{ letter: "A", file: pngRel, hookVisible: false, renderError: "React #130" }] }));
    assert.ok(lintPack(slug, tmp).errors.some((e) => e.includes("THUMBNAIL_RENDER_FAILED")));

    // 3. Stale PNG bytes
    fs.writeFileSync(path.join(bDir, "thumbnail-check.json"), JSON.stringify({ slug, hook, grammarSig, ok: true, variants: [{ letter: "A", file: pngRel, sha256: pngSha, hookVisible: true }] }));
    fs.writeFileSync(path.join(tmp, pngRel), "PNG_BYTES_V2_BROKEN");
    assert.ok(lintPack(slug, tmp).errors.some((e) => e.includes("THUMBNAIL_STALE_FILE")));

    // 4. Stale grammar
    fs.writeFileSync(path.join(tmp, pngRel), "PNG_BYTES_V1");
    fs.writeFileSync(path.join(bDir, "thumbnail-check.json"), JSON.stringify({ slug, hook, grammarSig: "old0000000000000", ok: true, variants: [{ letter: "A", file: pngRel, sha256: pngSha, hookVisible: true }] }));
    assert.ok(lintPack(slug, tmp).errors.some((e) => e.includes("THUMBNAIL_STALE_GRAMMAR")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("planChapterArcs skips chapterCard on told and fullStage10x beats", () => {
  const { planChapterArcs } = require("./lib/antidote-chapter-arcs");
  const scenes = [
    { id: "s0", fromFrame: 0, durationFrames: 90 },
    { id: "s1", fromFrame: 90, durationFrames: 90 },
    { id: "s2", fromFrame: 180, durationFrames: 90, told: { events: [] } },
    { id: "s3", fromFrame: 270, durationFrames: 90 },
    { id: "s4", fromFrame: 360, durationFrames: 90, timelineScrub: { title: "10Y", events: [{ time: "2005", title: "A" }, { time: "2015", title: "B" }] } },
    { id: "s5", fromFrame: 450, durationFrames: 90 },
  ];
  const res = planChapterArcs(scenes, [{ t: 0, label: "Intro" }, { t: 6, label: "Told Chap" }, { t: 12, label: "10x Chap" }], 30);
  assert.strictEqual(res.scenes[2].chapterCard, undefined);
  assert.strictEqual(res.scenes[4].chapterCard, undefined);
  assert.strictEqual(res.skippedCards.length, 2);
});

test("readcheck.js shows 10x device text without leaking narration and increments recheck-N by max", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rc-10x-"));
  const slug = "zz-rc-10x";
  const bDir = path.join(tmp, "books", slug);
  fs.mkdirSync(path.join(bDir, "storyboard", "readcheck", "recheck-2"), { recursive: true });
  try {
    fs.writeFileSync(path.join(bDir, "story-bible.json"), JSON.stringify({ cast: {} }));
    fs.writeFileSync(path.join(bDir, "art.json"), JSON.stringify({
      beats: [{
        i: 0,
        narration: "SECRET_NARRATION_TEXT",
        storyboard: { claim: "SECRET_CLAIM", concreteVisual: "v", onScreenText: "t", relationToPrevious: "r", addedInformation: "a" },
        timelineScrub: { title: "TEN YEARS", events: [{ time: "2005", title: "Vanished" }, { time: "2015", title: "Return" }] },
      }],
    }));
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "readcheck.js"), "prep", `--slug=${slug}`, `--root=${tmp}`], { stdio: "pipe" });
    const visRaw = fs.readFileSync(path.join(bDir, "storyboard", "readcheck", "visible-1.json"), "utf8");
    const vis = JSON.parse(visRaw);
    assert.strictEqual(vis[0].device.type, "timelineScrub");
    assert.ok(vis[0].device.shown.includes("TEN YEARS"));
    assert.ok(vis[0].device.shown.includes("Vanished"));
    assert.ok(!/SECRET_NARRATION_TEXT|SECRET_CLAIM/.test(visRaw));

    fs.mkdirSync(path.join(bDir, "storyboard", "readcheck", "recheck-2"), { recursive: true });
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "readcheck.js"), "prep", `--slug=${slug}`, `--root=${tmp}`, "--beats=0"], { stdio: "pipe" });
    assert.ok(fs.existsSync(path.join(bDir, "storyboard", "readcheck", "recheck-3", "visible-1.json")), "expected recheck-3");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log(`\nAll ${passed} Antidote 2.0 tests passed.`);
