#!/usr/bin/env node
/**
 * build-strategy-pilot.js — Book 2 ("The Art of Strategy") Antidote 10x pilot
 * using `tacticalBlueprint` Style Pack + 9 Single-World word-synced scenes.
 *
 * Slices (from public/captions/the-art-of-strategy.vtt @ 30fps):
 *   Slice 1: 180.0s – 235.0s (55s = 1650 frames, 0..1649)
 *   Slice 2: 840.0s – 895.0s (55s = 1650 frames, 1650..3299)
 *   Slice 3: 1500.0s – 1555.0s (55s = 1650 frames, 3300..4949)
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseWords, buildCaptions } = require("../lib/vtt");
const { assertVariety } = require("../lib/v2-variety-lint");
const { toArtDirection } = require("../lib/style-packs");

const ROOT = path.resolve(__dirname, "..", "..");
const MAIN_VTT = "C:/Users/savas/Cursor/Remotion/test/public/captions/the-art-of-strategy.vtt";
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));

const tmpOut = path.join(os.tmpdir(), `antidote-v2-schema-${Date.now()}.cjs`);
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "src/engines/antidote/schema.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: tmpOut,
  external: ["react", "remotion"],
});
const { antidoteConfigSchema } = require(tmpOut);
try { fs.unlinkSync(tmpOut); } catch {}

const img = (id) => `scenes/strategy-10x-pilot/${id}.png`;

const allWords = parseWords(fs.readFileSync(MAIN_VTT, "utf8"));
const fixWord = (w) => (w === "chamber" ? "chambray" : w);

const slices = [
  [180, 235, 0],
  [840, 895, 1650],
  [1500, 1555, 3300],
];

const captions = [];
for (const [s0, s1, baseFrame] of slices) {
  const sliceWords = allWords
    .filter((w) => w.t >= s0 && w.t < s1)
    .map((w) => ({
      w: fixWord(w.w),
      t: w.t - s0,
      end: Math.min(w.end, s1) - s0,
    }));
  for (const c of buildCaptions(sliceWords, 30)) {
    captions.push({
      text: c.text,
      startFrame: baseFrame + c.startFrame,
      endFrame: baseFrame + c.endFrame,
      words: c.words.map((wd) => ({
        w: wd.w,
        s: baseFrame + wd.s,
        e: baseFrame + wd.e,
      })),
    });
  }
}

const config = {
  meta: {
    slug: "the-art-of-strategy-10x-pilot",
    title: "The Art of Strategy",
    author: "Avinash Dixit & Barry Nalebuff",
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 4950,
    flow: 1,
    multiplane: true,
    artDirection: toArtDirection("tacticalBlueprint"),
    take: {
      note: "Strategy is not about being stronger — it is about controlling what your rival expects you to do next.",
    },
  },
  captions,
  scenes: [
    // ── SLICE 1 (0..1650, 55s @ ~03:00) ──────────────────────────────────────
    {
      id: "st1-b1-expectation-law",
      fromFrame: 0,
      durationFrames: 480,
      shot: "insert",
      transition: { type: "cut", frames: 0 },
      bg: { type: "flat", colors: ["#0B1626"], set: "none", texture: "none", stageMood: "blueprintNavy" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "data-proof",
        subject: "bedrock law of game theory",
        action: "statSlam slams core law and fills comparison bars",
        payoff: "anchors the thesis: controlling expectations beats raw strength",
        revealFrame: 20,
      },
      statSlam: {
        kicker: "THE BEDROCK LAW OF GAME THEORY",
        value: "CONTROL EXPECTATIONS",
        label: "It is not about being stronger — it is about shaping what your rival expects you to do next.",
        note: "Every strategic move is a reaction to anticipated reactions.",
        framing: "blueprint",
        tone: "accent",
        bars: [
          { label: "Raw Strength Alone", value: 0.35, text: "35% · Predictable", tone: "neutral", at: 180 },
          { label: "Expectation Control", value: 0.92, text: "92% · Decisive Leverage", tone: "positive", at: 260 },
        ],
      },
    },
    {
      id: "st1-b2-chess-reframe",
      fromFrame: 480,
      durationFrames: 540,
      shot: "insert",
      transition: { type: "slideCarryLeft", frames: 12 },
      bg: { type: "flat", colors: ["#0B1626"], set: "none", texture: "none", stageMood: "blueprintNavy" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "annotate-place",
        subject: "hand hovering over brass chess knight",
        action: "spotlights reframe from strongest move to manipulating expectation",
        payoff: "shows the mental shift from brute force to strategic anticipation",
        revealFrame: 30,
      },
      annotatedScene: {
        image: img("s1_chess_expectation"),
        framing: "fullBleed",
        kenBurns: "pushIn",
        dim: 0.14,
        spotlights: [
          {
            cx: 960,
            cy: 500,
            rx: 200,
            ry: 180,
            label: "NEW QUESTION",
            note: "How do I shape their expectation?",
            labelX: 1520,
            labelY: 260,
            tone: "accent",
            at: 100,
          },
        ],
        stickers: [
          {
            title: "BUSINESS WARFARE",
            subtitle: "Executives in boardrooms",
            icon: "spark",
            x: 320,
            y: 740,
            rot: -2.0,
            tone: "positive",
            at: 360,
          },
        ],
      },
    },
    {
      id: "st1-b3-rival-merchants",
      fromFrame: 1020,
      durationFrames: 630,
      shot: "insert",
      transition: { type: "zoomPush", frames: 12 },
      bg: { type: "flat", colors: ["#0B1626"], set: "none", texture: "none", stageMood: "blueprintNavy" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "contrast",
        subject: "BB Lean vs Rainbow's",
        action: "full-bleed split contrasts the two rival catalog merchants",
        payoff: "sets up the classic chambray shirt pricing rivalry",
        revealFrame: 20,
      },
      comparisonGrid: {
        layout: "fullBleedSplit",
        title: "TWO RIVAL CATALOG MERCHANTS",
        columns: [
          {
            heading: "BB Lean",
            tag: "CATALOG STAPLE",
            tone: "accent",
            image: img("s1_bb_lean"),
            bullets: ["High-margin deluxe chambray shirt", "Locked in a years-long rivalry"],
          },
          {
            heading: "Rainbow's",
            tag: "RIVAL MERCHANT",
            tone: "positive",
            image: img("s1_rainbows"),
            bullets: ["Matching shirt, identical demand", "Every price cut shapes expectations"],
          },
        ],
      },
    },

    // ── SLICE 2 (1650..3300, 55s @ ~14:00) ───────────────────────────────────
    {
      id: "st2-b1-phone-tag-timeline",
      fromFrame: 1650,
      durationFrames: 630,
      shot: "insert",
      transition: { type: "blurCut", frames: 12 },
      bg: { type: "flat", colors: ["#0B1626"], set: "none", texture: "none", stageMood: "blueprintNavy" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "mechanism-flow",
        subject: "simultaneous phone tag loop",
        action: "timelineScrub advances through 5 beats and closes feedback loop",
        payoff: "makes the chaotic phone-tag loop immediately visible",
        revealFrame: 30,
      },
      timelineScrub: {
        title: "THE PHONE-TAG COORDINATION TRAP",
        subtitle: "Why simultaneous logic leads to endless collision",
        events: [
          { time: "0s", title: "Call Drops", detail: "Both try to reconnect", tone: "accent", at: 10 },
          { time: "2s", title: "Voicemail", detail: "Both dial at once", tone: "danger", at: 75 },
          { time: "7s", title: "Hang Up", detail: "Realize what happened", tone: "neutral", at: 195 },
          { time: "10s", title: "Wait 10s", detail: "Both pause together", tone: "neutral", at: 295 },
          { time: "13s", title: "Collision!", detail: "Dial again together", tone: "danger", at: 405 },
        ],
        loopLabel: "TOTAL CHAOS · REPEAT",
        loopAt: 455,
        callout: "Talking over each other digitally — neither knows who should call.",
        calloutAt: 500,
      },
    },
    {
      id: "st2-b2-multiple-equilibria",
      fromFrame: 2280,
      durationFrames: 570,
      shot: "insert",
      transition: { type: "slideCarryUp", frames: 12 },
      bg: { type: "flat", colors: ["#0B1914"], set: "none", texture: "none", stageMood: "emeraldNoir" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "framework-map",
        subject: "2x2 multiple equilibria matrix",
        action: "quadrants reveal two stable states vs two failure states",
        payoff: "shows why pure math cannot pick between two symmetric equilibria",
        revealFrame: 60,
      },
      dataMatrix: {
        variant: "quadrant2x2",
        borderless: true,
        quadrantRevealStep: 42,
        title: "THE TRAGEDY OF MULTIPLE EQUILIBRIA",
        subtitle: "Two stable outcomes — but pure logic cannot tell you which one they picked",
        xLabel: "THEIR ACTION",
        yLabel: "YOUR ACTION",
        quadrants: [
          { label: "You Call + They Wait", sublabel: "STABLE ✓ Connection succeeds", tone: "positive", active: true },
          { label: "Both Call", sublabel: "COLLISION × Straight to voicemail", tone: "danger" },
          { label: "Both Wait", sublabel: "DEADLOCK × Silence forever", tone: "danger" },
          { label: "You Wait + They Call", sublabel: "STABLE ✓ Connection succeeds", tone: "positive", active: true },
        ],
        callout: "Math won't tell you who should press the call button.",
      },
    },
    {
      id: "st2-b3-focal-point",
      fromFrame: 2850,
      durationFrames: 450,
      shot: "insert",
      transition: { type: "zoomPull", frames: 12 },
      bg: { type: "flat", colors: ["#F3ECE0"], set: "none", texture: "none", stageMood: "inkScroll" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "annotate-place",
        subject: "converging clock tower focal point",
        action: "highlights central focal point where paths meet",
        payoff: "explains Schelling's focal point visually",
        revealFrame: 120,
      },
      annotatedScene: {
        image: img("s2_focal_clock"),
        framing: "editorialPrint",
        kenBurns: "pushIn",
        dim: 0.04,
        banner: { text: "THE SOLUTION: A FOCAL POINT", at: 30 },
        spotlights: [
          {
            cx: 960,
            cy: 430,
            rx: 185,
            ry: 185,
            label: "THE FOCAL POINT",
            note: "A shared social convention",
            labelX: 1690,
            labelY: 360,
            tone: "accent",
            at: 130,
          },
        ],
        stickers: [
          {
            title: "COORDINATION SOLVED",
            subtitle: "When pure logic fails, convention wins",
            icon: "clock",
            x: 210,
            y: 520,
            rot: -2.0,
            tone: "positive",
            at: 210,
          },
        ],
      },
    },

    // ── SLICE 3 (3300..4950, 55s @ ~25:00) ───────────────────────────────────
    {
      id: "st3-b1-commitment-device",
      fromFrame: 3300,
      durationFrames: 570,
      shot: "insert",
      transition: { type: "slideCarryLeft", frames: 12 },
      bg: { type: "flat", colors: ["#0B1914"], set: "none", texture: "none", stageMood: "emeraldNoir" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "mechanism-flow",
        subject: "Dean's commitment device",
        action: "borderless equation links penalty contract to future willpower",
        payoff: "shows how binding yourself changes expectations",
        revealFrame: 40,
      },
      visualEquation: {
        layout: "borderless",
        title: "BUYING FUTURE WILLPOWER",
        subtitle: "How Dean locked in his diet by making failure financially devastating",
        operator: "arrow",
        nodes: [
          { badge: "COMMITMENT", image: img("s3_commitment_lock"), label: "Binding Penalty", sublabel: "Massive financial cost if he fails", tone: "danger" },
          { badge: "EXPECTATION", glyph: "⚡", label: "Credible Rule", sublabel: "His friend knows he cannot quit", tone: "accent" },
          { badge: "RESULT", glyph: "★", label: "Future Willpower", sublabel: "Changed what both sides expect", tone: "positive" },
        ],
        footnote: "He built a mechanical response rule that couldn't be ignored.",
      },
    },
    {
      id: "st3-b2-expectation-echo",
      fromFrame: 3870,
      durationFrames: 450,
      shot: "insert",
      transition: { type: "blurCut", frames: 12 },
      bg: { type: "flat", colors: ["#F3ECE0"], set: "none", texture: "none", stageMood: "inkScroll" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "document-quote",
        subject: "core strategy bookend quote",
        action: "vermilion highlighter sweeps key words on inkScroll paper",
        payoff: "echoes the opening law with crisp dark-on-light contrast",
        revealFrame: 120,
      },
      realAnchor: {
        badge: "CORE PRINCIPLE",
        title: "THE STRATEGIC BOOKEND",
        subtitle: "Why credibility beats raw willpower",
        quote: "It's not about being stronger. It's about controlling what they expect.",
        attribution: "The Art of Strategy",
        highlightPhrases: [
          { text: "not about being stronger", at: 180 },
          { text: "controlling what they expect", at: 240 },
        ],
        marginNote: { text: "Pay the price to prove the rule is real!", at: 290 },
        annotations: [
          { text: "Mechanical Rule", side: "left" },
          { text: "Credible Threat", side: "right" },
        ],
      },
    },
    {
      id: "st3-b3-hunting-grounds-map",
      fromFrame: 4320,
      durationFrames: 630,
      shot: "insert",
      transition: { type: "zoomPush", frames: 12 },
      bg: { type: "flat", colors: ["#0B1626"], set: "none", texture: "none", stageMood: "blueprintNavy" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "annotate-place",
        subject: "north vs south hunting grounds map",
        action: "spotlights north (2 units) vs south (1 unit) with converging traces",
        payoff: "visualizes the Stone Age hunters showdown over the richer valley",
        revealFrame: 220,
      },
      annotatedScene: {
        image: img("s3_hunting_map"),
        framing: "editorialPrint",
        kenBurns: "pushIn",
        dim: 0.06,
        banner: { text: "THE ULTIMATE SHOWDOWN · BRETT VS. BARNEY", at: 20 },
        spotlights: [
          {
            cx: 960,
            cy: 290,
            rx: 230,
            ry: 95,
            label: "NORTH VALLEY · 2 UNITS",
            note: "Lush & plentiful meat",
            labelX: 1690,
            labelY: 280,
            tone: "positive",
            at: 260,
          },
          {
            cx: 960,
            cy: 640,
            rx: 230,
            ry: 95,
            label: "SOUTH PLATEAU · 1 UNIT",
            note: "Sparse fallback ground",
            labelX: 1690,
            labelY: 640,
            tone: "neutral",
            at: 390,
          },
        ],
        traces: [
          {
            from: { x: 520, y: 470, label: "BRETT" },
            to: { x: 840, y: 310, label: "NORTH" },
            tone: "accent",
            at: 210,
            dur: 40,
          },
          {
            from: { x: 1400, y: 470, label: "BARNEY" },
            to: { x: 1080, y: 310, label: "NORTH" },
            tone: "danger",
            at: 210,
            dur: 40,
          },
        ],
      },
    },
  ],
};

const parsed = antidoteConfigSchema.parse(config);
const varietyStats = assertVariety(parsed);

const outDir = path.join(ROOT, "audit", "strategy-10x-pilot");
fs.mkdirSync(outDir, { recursive: true });
const cfgPath = path.join(outDir, "config.strategy.json");
fs.writeFileSync(cfgPath, JSON.stringify(parsed, null, 2));

const extraPngs = fs
  .readdirSync(path.join(ROOT, "public", "scenes", "strategy-10x-pilot"))
  .filter((f) => f.endsWith(".png"))
  .sort()
  .map((f) => `public/scenes/strategy-10x-pilot/${f}`);

const manifest = {
  schema: "stills/1",
  name: "Antidote 10x Book 2 Pilot (The Art of Strategy)",
  composition: "Antidote-lab",
  entry: "src/index.ts",
  silent: true,
  gl: "default",
  shards: 4,
  extra: extraPngs,
  jobs: [
    {
      id: "strategy-stills",
      config: "config.strategy.json",
      frames: [320, 780, 1340, 2180, 2660, 3140, 3620, 4180, 4780],
    },
    { id: "clip-s1", config: "config.strategy.json", frames: [], clip: { from: 0, to: 1649 } },
    { id: "clip-s2", config: "config.strategy.json", frames: [], clip: { from: 1650, to: 3299 } },
    { id: "clip-s3", config: "config.strategy.json", frames: [], clip: { from: 3300, to: 4949 } },
  ],
};
const manifestPath = path.join(outDir, "manifest.strategy.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`✓ Wrote ${path.relative(ROOT, cfgPath)} (${parsed.scenes.length} scenes, ${parsed.captions.length} captions, ${parsed.meta.durationInFrames} frames)`);
console.log(`✓ Variety & Single-World stats:`, JSON.stringify(varietyStats));
console.log(`✓ Wrote ${path.relative(ROOT, manifestPath)} (${extraPngs.length} extra PNGs)`);
