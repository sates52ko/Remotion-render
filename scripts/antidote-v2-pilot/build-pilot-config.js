#!/usr/bin/env node
/**
 * build-pilot-config.js — Build & Zod/Single-World/Variety-validate the 3-slice Antidote 10x pilot
 * for "How to Talk to Anyone" (Leil Lowndes) + GitHub Actions stills/clips manifest.
 *
 * Slices (from public/captions/how-to-talk-to-anyone.vtt @ 30fps):
 *   Slice 1: 297.0s – 355.0s (58s = 1740 frames, 0..1739)
 *   Slice 2: 1078.0s – 1136.0s (58s = 1740 frames, 1740..3479)
 *   Slice 3: 2073.0s – 2126.0s (53s = 1590 frames, 3480..5069)
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseWords, buildCaptions } = require("../lib/vtt");
const { assertVariety } = require("../lib/v2-variety-lint");

const ROOT = path.resolve(__dirname, "..", "..");
const MAIN_VTT = "C:/Users/savas/Cursor/Remotion/test/public/captions/how-to-talk-to-anyone.vtt";
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

const img = (id) => `scenes/antidote-v2-pilot/${id}.png`;

// Build real word-timed captions for the 3 slices
const allWords = parseWords(fs.readFileSync(MAIN_VTT, "utf8"));
const fixWord = (w) =>
  w === "customtailored" ? "custom-tailored"
    : w === "fodness" ? "fondness"
      : w === "Loun" ? "Lowndes"
        : w;

const slices = [
  [297, 355, 0],
  [1078, 1136, 1740],
  [2073, 2126, 3480],
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
    slug: "how-to-talk-to-anyone-10x-pilot",
    title: "How to Talk to Anyone",
    author: "Leil Lowndes",
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 5070,
    flow: 1,
    multiplane: true,
    cast: {
      host: {
        name: "Elena",
        role: "narrator",
        variant: {
          skin: "#F0C39B",
          hair: "#4A2E1E",
          suit: "#D97736",
          shirt: "#F7F1E5",
          gender: "f",
          age: "adult",
          outfit: "coat",
          hairStyle: "curly",
          accessory: "necklace",
          expression: "happy",
        },
      },
      partner: {
        name: "Marcus",
        role: "protagonist",
        variant: {
          skin: "#E5B48B",
          hair: "#2B2623",
          suit: "#365675",
          shirt: "#F5F5F2",
          gender: "m",
          age: "adult",
          outfit: "suit",
          hairStyle: "short",
          glasses: true,
          accessory: "tie",
          expression: "neutral",
        },
      },
      researcher: {
        name: "Dr. Cole",
        role: "mentor",
        variant: {
          skin: "#EBC2A0",
          hair: "#C5CBD3",
          suit: "#424854",
          shirt: "#ECEAE4",
          gender: "m",
          age: "old",
          outfit: "vest",
          hairStyle: "receding",
          glasses: true,
          beard: "mustache",
          expression: "neutral",
        },
      },
    },
    artDirection: {
      style: "mid-century modern New Yorker editorial gouache, torn paper collage, and crisp ink illustration",
      mood: "obsidianGrid",
      captions: "minimal",
      hud: "off",
      motionDoctrine: true,
      palette: {
        accent: "#F5B73B",
        accent2: "#2DD4BF",
        danger: "#F05D5E",
        positive: "#34D399",
      },
    },
    take: {
      note: "Charisma is not memorizing 92 tricks — it is lowering the other person's threat response before you ask for anything.",
    },
  },
  captions,
  scenes: [
    // ── SLICE 1 (0..1740, 58s @ ~05:00) ──────────────────────────────────────
    {
      id: "s1-b1-flooding-smile",
      fromFrame: 0,
      durationFrames: 420,
      shot: "insert",
      transition: { type: "cut", frames: 0 },
      bg: { type: "flat", colors: ["#101319"], set: "none", texture: "none", stageMood: "obsidianGrid" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "contrast",
        subject: "fast nervous grin vs flooding smile",
        action: "full-bleed split wipe reveals custom-tailored smile",
        payoff: "instant visual contrast between robotic reflex and genuine warmth",
        revealFrame: 20,
      },
      comparisonGrid: {
        layout: "fullBleedSplit",
        title: "MASS-PRODUCED VS. CUSTOM-TAILORED",
        columns: [
          {
            heading: "Fast Nervous Grin",
            tag: "ROBOTIC",
            tone: "danger",
            image: img("s1_fast_grin"),
            bullets: ["Flashed automatically at everyone", "Reads as an anxious reflex"],
          },
          {
            heading: "The Flooding Smile",
            tag: "CUSTOM-TAILORED",
            tone: "positive",
            image: img("s1_warm_smile"),
            bullets: ["Pause one beat, soak in their face", "Signals genuine delight in them"],
          },
        ],
      },
    },
    {
      id: "s1-b2-yale-lab-annotated",
      fromFrame: 420,
      durationFrames: 390,
      shot: "insert",
      transition: { type: "slideCarryLeft", frames: 12 },
      bg: { type: "flat", colors: ["#121A26"], set: "none", texture: "none", stageMood: "slateEditorial" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "annotate-place",
        subject: "Boston & Yale psychology lab",
        action: "word-synced spotlights highlight researcher and opposite-sex pairs",
        payoff: "viewer sees the real study setup without puppet clutter",
        revealFrame: 210,
      },
      annotatedScene: {
        image: img("s1_yale_lab"),
        framing: "fullBleed",
        kenBurns: "pushIn",
        dim: 0.12,
        banner: { text: "BOSTON & YALE PSYCHOLOGY STUDY", at: 180 },
        spotlights: [
          {
            cx: 730,
            cy: 360,
            rx: 145,
            ry: 170,
            label: "YALE RESEARCHER",
            note: "Assigns the secret task",
            labelX: 290,
            labelY: 220,
            tone: "accent",
            at: 210,
          },
          {
            cx: 1410,
            cy: 540,
            rx: 170,
            ry: 140,
            label: "OPPOSITE-SEX PAIRS",
            note: "Casual conversation",
            labelX: 1580,
            labelY: 240,
            tone: "positive",
            at: 325,
          },
        ],
      },
    },
    {
      id: "s1-b3-blink-cohort-split",
      fromFrame: 810,
      durationFrames: 480,
      shot: "insert",
      transition: { type: "zoomPush", frames: 12 },
      bg: { type: "flat", colors: ["#19102E"], set: "none", texture: "none", stageMood: "deepViolet" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "cohort-split",
        subject: "20 study participants",
        action: "cohort splits 50/50 into secret blink-counting task vs control",
        payoff: "immediately visualizes the experimental split and unbroken gaze",
        revealFrame: 140,
      },
      cohortGrid: {
        title: "THE SECRET BLINK-COUNTING EXPERIMENT",
        subtitle: "Half the participants were given one hidden instruction",
        total: 20,
        splitAt: 140,
        leftGroup: {
          badge: "50% · SECRET TASK",
          label: "Count Every Blink",
          sublabel: "Forced relentless eye focus",
          share: 0.5,
          tone: "accent",
        },
        rightGroup: {
          badge: "50% · CONTROL GROUP",
          label: "Normal Conversation",
          sublabel: "No special gaze instruction",
          share: 0.5,
          tone: "neutral",
        },
        insetImage: {
          path: img("s1_eye_contact"),
          caption: "UNBROKEN EYE CONTACT",
          at: 360,
        },
        callout: "They didn't know it — the task was designed to lock their gaze.",
        calloutAt: 310,
      },
    },
    {
      id: "s1-b4-study-results",
      fromFrame: 1290,
      durationFrames: 450,
      shot: "medium",
      transition: { type: "blurCut", frames: 12 },
      bg: { type: "flat", colors: ["#101319"], set: "none", texture: "none", stageMood: "obsidianGrid" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [
        {
          id: "cole-1",
          role: "researcher",
          action: "point",
          expression: "happy",
          holds: "notes",
        },
      ],
      props: [],
      texts: [],
      shotIntent: {
        job: "data-proof",
        subject: "Dr. Cole + fondness curve",
        action: "researcher points as curve climbs on 'significantly higher feelings'",
        payoff: "proves unbroken eye contact drives deep respect and fondness",
        revealFrame: 95,
      },
      dataMatrix: {
        variant: "dualCurve",
        borderless: true,
        drawAt: 95,
        title: "RESPECT & FONDNESS: BLINK-TASK VS. CONTROL",
        subtitle: "Subjects stared at reported dramatically higher connection",
        xLabel: "CONVERSATION TIME",
        yLabel: "REPORTED FONDNESS",
        curves: [
          { label: "Unbroken Eye Contact", points: [0.15, 0.34, 0.56, 0.78, 0.91], color: "#34D399" },
          { label: "Control Group", points: [0.15, 0.22, 0.28, 0.31, 0.35], color: "#9FB2C9" },
        ],
        callout: "The secret was never counting blinks — it was never breaking gaze.",
      },
    },

    // ── SLICE 2 (1740..3480, 58s @ ~18:00) ───────────────────────────────────
    {
      id: "s2-b1-melting-tension-annotated",
      fromFrame: 1740,
      durationFrames: 480,
      shot: "insert",
      transition: { type: "zoomPull", frames: 12 },
      bg: { type: "flat", colors: ["#170B0E"], set: "none", texture: "none", stageMood: "crimsonNight" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "annotate-place",
        subject: "warm snowy window conversation",
        action: "spotlights cold window & melting tension, then stamps dinner invitation",
        payoff: "single illustrated world with zero puppet clash",
        revealFrame: 35,
      },
      annotatedScene: {
        image: img("s2_warm_chat"),
        framing: "fullBleed",
        kenBurns: "panRight",
        dim: 0.10,
        spotlights: [
          {
            cx: 1700,
            cy: 440,
            rx: 145,
            ry: 190,
            label: "AGREEABLE SMALL TALK",
            note: "Brutally cold outside!",
            labelX: 1580,
            labelY: 160,
            tone: "positive",
            at: 35,
          },
          {
            cx: 960,
            cy: 360,
            rx: 320,
            ry: 160,
            label: "THICK TENSION MELTS",
            note: "Warmth beats credentials",
            labelX: 960,
            labelY: 115,
            tone: "accent",
            at: 235,
          },
        ],
        stickers: [
          {
            title: "DINNER INVITATION",
            subtitle: "Won through warmth, not status",
            icon: "envelope",
            x: 320,
            y: 745,
            rot: -2.4,
            tone: "positive",
            at: 330,
          },
        ],
      },
    },
    {
      id: "s2-b2-naked-city-anchor",
      fromFrame: 2220,
      durationFrames: 450,
      shot: "medium",
      transition: { type: "slideCarryLeft", frames: 12 },
      bg: { type: "flat", colors: ["#EFE7D6"], set: "none", texture: "none", stageMood: "warmParchment" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [
        {
          id: "elena-1",
          role: "host",
          action: "think",
          expression: "worried",
        },
      ],
      props: [],
      texts: [],
      shotIntent: {
        job: "document-quote",
        subject: "Leil Lowndes quote + Elena",
        action: "highlighter sweeps key phrases in sync with narration",
        payoff: "anchors the 'Never the Naked City' rule visually",
        revealFrame: 280,
      },
      realAnchor: {
        badge: "CORE TECHNIQUE",
        title: "NEVER THE NAKED CITY",
        subtitle: "Eliminate the dead-end one-word answer",
        quote: "When you just say 'Columbus', you dump a massive cognitive burden onto the other person.",
        attribution: "Leil Lowndes",
        highlightPhrases: [
          { text: "just say 'Columbus'", at: 280 },
          { text: "massive cognitive burden", at: 360 },
        ],
        marginNote: { text: "Never leave the listener stranded!", at: 320 },
        annotations: [
          { text: "One-Word Answer", side: "left" },
          { text: "Forces Mental Search", side: "right" },
        ],
      },
    },
    {
      id: "s2-b3-columbus-burden-stage",
      fromFrame: 2670,
      durationFrames: 420,
      shot: "twoShot",
      transition: { type: "zoomPush", frames: 12 },
      bg: { type: "flat", colors: ["#EFE7D6"], set: "none", texture: "none", stageMood: "warmParchment" },
      camera: { zoom: [1, 1.03], panX: [0, 0], panY: [0, 0] },
      characters: [
        {
          id: "marcus-1",
          role: "partner",
          action: "idle",
          expression: "blank",
          lookAt: "partner",
          says: { text: "Columbus.", at: 15 },
        },
        {
          id: "elena-2",
          role: "host",
          action: "think",
          expression: "worried",
          emotion: "sweat",
          emotionAt: 95,
          lookAt: "partner",
          says: { text: "Uh... what do I say?", at: 145 },
        },
      ],
      props: [
        { type: "boulder", x: 960, y: 540, scale: 0.65, arc: "grow", at: 55 },
      ],
      texts: [],
      shotIntent: {
        job: "character-drama",
        subject: "Marcus + Elena + growing boulder",
        action: "bare 'Columbus.' drops a growing boulder between them",
        payoff: "clean pure-vector stage makes cognitive burden unmistakable",
        revealFrame: 55,
      },
    },
    {
      id: "s2-b4-trampoline-equation",
      fromFrame: 3090,
      durationFrames: 390,
      shot: "insert",
      depthCarry: true,
      transition: { type: "slideCarryLeft", frames: 12 },
      bg: { type: "flat", colors: ["#121A26"], set: "none", texture: "none", stageMood: "slateEditorial" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "mechanism-flow",
        subject: "Naked City -> Trampoline -> Payoff",
        action: "borderless circular medallions show the hook transformation",
        payoff: "shows how one vivid hook sparks effortless follow-ups",
        revealFrame: 30,
      },
      visualEquation: {
        layout: "borderless",
        title: "STATIC RESUME → CONVERSATIONAL TRAMPOLINE",
        subtitle: "Give them a hook they can actually bounce off",
        operator: "arrow",
        nodes: [
          { badge: "NAKED CITY", image: img("s2_static_wall"), label: "“Columbus, Ohio.”", sublabel: "Dead end — forces mental scrambling", tone: "danger" },
          { badge: "TRAMPOLINE", image: img("s2_trampoline"), label: "“Secret Product Testing Hub”", sublabel: "Gives them an effortless bounce", tone: "accent" },
          { badge: "PAYOFF", glyph: "★", label: "Instant Curiosity", sublabel: "Sparks natural follow-up questions", tone: "positive" },
        ],
        footnote: "Always attach one vivid hook to where you live or work.",
      },
    },

    // ── SLICE 3 (3480..5070, 53s @ ~34:30) ───────────────────────────────────
    {
      id: "s3-b1-lobby-to-boardroom-trace",
      fromFrame: 3480,
      durationFrames: 540,
      shot: "insert",
      transition: { type: "blurCut", frames: 12 },
      bg: { type: "flat", colors: ["#101319"], set: "none", texture: "none", stageMood: "obsidianGrid" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "annotate-place",
        subject: "2-story building cutaway",
        action: "golden trace rises from Lobby to Boardroom as narrator says it",
        payoff: "fixes giant-puppet clash and visualizes organizational safety",
        revealFrame: 280,
      },
      annotatedScene: {
        image: img("s3_lobby_boardroom"),
        framing: "editorialPrint",
        kenBurns: "pushIn",
        dim: 0.05,
        banner: { text: "CHOREOGRAPHING SAFETY · CHAIN OF COMMAND", at: 18 },
        spotlights: [
          {
            cx: 1045,
            cy: 660,
            rx: 145,
            ry: 78,
            label: "01 · THE LOBBY",
            note: "Respect starts at the desk",
            labelX: 1690,
            labelY: 650,
            tone: "accent",
            at: 280,
          },
          {
            cx: 1020,
            cy: 405,
            rx: 150,
            ry: 82,
            label: "02 · THE BOARDROOM",
            note: "Zero threat at the top",
            labelX: 1690,
            labelY: 365,
            tone: "positive",
            at: 350,
          },
        ],
        traces: [
          {
            from: { x: 1045, y: 635, label: "LOBBY" },
            to: { x: 1020, y: 425, label: "BOARDROOM" },
            tone: "accent",
            at: 300,
            dur: 45,
          },
        ],
        stickers: [
          {
            title: "PSYCHOLOGICAL SAFETY",
            subtitle: "No one feels managed or manipulated",
            icon: "check",
            x: 205,
            y: 540,
            rot: -1.8,
            tone: "accent",
            at: 430,
          },
        ],
      },
    },
    {
      id: "s3-b2-sociopath-quadrant",
      fromFrame: 4020,
      durationFrames: 510,
      shot: "insert",
      depthCarry: true,
      transition: { type: "slideCarryUp", frames: 12 },
      bg: { type: "flat", colors: ["#19102E"], set: "none", texture: "none", stageMood: "deepViolet" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "framework-map",
        subject: "4 mechanics of charisma",
        action: "quadrants reveal in sync with spoken enumeration",
        payoff: "maps technique vs authenticity and highlights boundary setting",
        revealFrame: 60,
      },
      dataMatrix: {
        variant: "quadrant2x2",
        borderless: true,
        quadrantRevealStep: 52,
        title: "THE COUNTERPOINT: THE SOCIOPATH PROBLEM",
        subtitle: "4 mechanics of charisma — and the trap of faking all 92 at once",
        xLabel: "AUTHENTICITY",
        yLabel: "TECHNIQUE",
        quadrants: [
          { label: "1. Eye Contact", sublabel: "Warm presence vs. mechanical staring" },
          { label: "2. Posture & Palms", sublabel: "Openness vs. rehearsed wrist angles" },
          { label: "3. Conversational Pacing", sublabel: "Listening vs. scripted timing" },
          { label: "4. Boundary Setting", sublabel: "True charisma respects human safety", tone: "accent", active: true },
        ],
        callout: "Never make anyone feel managed or manipulated.",
      },
    },
    {
      id: "s3-b3-overload-vs-natural",
      fromFrame: 4530,
      durationFrames: 540,
      shot: "insert",
      transition: { type: "zoomPull", frames: 12 },
      bg: { type: "flat", colors: ["#101319"], set: "none", texture: "none", stageMood: "obsidianGrid" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "contrast",
        subject: "mechanical overload vs natural integration",
        action: "full-bleed split contrasts robotic anxiety with effortless ease",
        payoff: "closes with memorable contrast: practice one habit at a time",
        revealFrame: 20,
      },
      comparisonGrid: {
        layout: "fullBleedSplit",
        title: "PLEASE DON'T DEPLOY ALL 92 TRICKS AT ONCE",
        columns: [
          {
            heading: "Mechanical Overload",
            tag: "MANIPULATIVE",
            tone: "danger",
            image: img("s3_robotic_overload"),
            bullets: ["Counting seconds before you smile", "Monitoring wrist angles & palm exposure"],
          },
          {
            heading: "Natural Integration",
            tag: "TRUE CHARISMA",
            tone: "positive",
            image: img("s3_natural_ease"),
            bullets: ["Practice one small habit at a time", "Let warmth become automatic"],
          },
        ],
      },
    },
  ],
};

const parsed = antidoteConfigSchema.parse(config);
const varietyStats = assertVariety(parsed);

const outDir = path.join(ROOT, "audit", "antidote-v2-pilot");
fs.mkdirSync(outDir, { recursive: true });
const cfgPath = path.join(outDir, "config.v10x.json");
fs.writeFileSync(cfgPath, JSON.stringify(parsed, null, 2));

const extraPngs = fs
  .readdirSync(path.join(ROOT, "public", "scenes", "antidote-v2-pilot"))
  .filter((f) => f.endsWith(".png"))
  .sort()
  .map((f) => `public/scenes/antidote-v2-pilot/${f}`);

const manifest = {
  schema: "stills/1",
  name: "Antidote 10x Single-World Pilot (How to Talk to Anyone)",
  composition: "Antidote-lab",
  entry: "src/index.ts",
  silent: true,
  gl: "default",
  shards: 4,
  extra: extraPngs,
  jobs: [
    {
      id: "pilot-stills",
      config: "config.v10x.json",
      frames: [260, 770, 1210, 1620, 2120, 2600, 2940, 3360, 3950, 4420, 4920],
    },
    { id: "clip-s1", config: "config.v10x.json", frames: [], clip: { from: 0, to: 1739 } },
    { id: "clip-s2", config: "config.v10x.json", frames: [], clip: { from: 1740, to: 3479 } },
    { id: "clip-s3", config: "config.v10x.json", frames: [], clip: { from: 3480, to: 5069 } },
  ],
};
const manifestPath = path.join(outDir, "manifest.v10x.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`✓ Wrote ${path.relative(ROOT, cfgPath)} (${parsed.scenes.length} scenes, ${parsed.captions.length} captions, ${parsed.meta.durationInFrames} frames)`);
console.log(`✓ Variety & Single-World stats:`, JSON.stringify(varietyStats));
console.log(`✓ Wrote ${path.relative(ROOT, manifestPath)} (${extraPngs.length} extra PNGs)`);
