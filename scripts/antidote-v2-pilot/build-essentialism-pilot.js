#!/usr/bin/env node
/**
 * build-essentialism-pilot.js — Book 3 ("Essentialism") Antidote 10x v2 Pilot
 * Upgrades all 5 Blind Mute Viewer findings + enforces editorialLeft + left captions.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseWords, buildCaptions } = require("../lib/vtt");
const { assertVariety } = require("../lib/v2-variety-lint");
const { assertNarrativeQuality } = require("../lib/v2-narrative-lint");
const { toArtDirection } = require("../lib/style-packs");

const ROOT = path.resolve(__dirname, "..", "..");
const MAIN_VTT = "C:/Users/savas/Cursor/Remotion/test/public/captions/essentialism-the-disciplined-pursuit-of-less.vtt";
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

const img = (id) => `scenes/essentialism-10x-pilot/${id}.png`;

const allWords = parseWords(fs.readFileSync(MAIN_VTT, "utf8"));
const fixWord = (w) => (w === "highle" ? "high-level" : w === "fourburner" ? "four-burner" : w);

const slices = [
  [120, 170, 0],
  [720, 770, 1500],
  [1380, 1430, 3000],
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
    slug: "essentialism-10x-pilot",
    title: "Essentialism: The Disciplined Pursuit of Less",
    author: "Greg McKeown",
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 4500,
    flow: 1,
    multiplane: true,
    artDirection: toArtDirection("kinfolkMinimal"),
    take: {
      note: "High-level execution is not an addition problem — it is the disciplined subtraction of everything non-essential.",
    },
  },
  captions,
  scenes: [
    // ── SLICE 1 (0..1500, 50s @ 120..170s) ──────────────────────────────────
    {
      id: "es1-b1-subtraction-manifesto",
      fromFrame: 0,
      durationFrames: 495,
      shot: "insert",
      transition: { type: "cut", frames: 0 },
      bg: { type: "flat", colors: ["#FAF7F0"], set: "none", texture: "none", stageMood: "ivoryBroadsheet" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "manifesto",
        subject: "addition vs subtraction problem",
        action: "kineticManifesto strikes through ADDITION on cue and reveals SUBTRACTION",
        payoff: "anchors the book's core mental-model flip with light-native ProducerNote",
        revealFrame: 440,
      },
      kineticManifesto: {
        kicker: "THE CORE REFRAME",
        lines: [
          { text: "PRODUCTIVITY BY ADDITION", strikeAt: 410, at: 30 },
          { text: "EXECUTION BY SUBTRACTION", emphasis: true, tone: "accent", at: 430 },
        ],
        divider: "line",
        footnote: "Doing more meetings, side hustles, and projects is the trap.",
        footnoteAt: 245,
      },
    },
    {
      id: "es1-b2-carving-away",
      fromFrame: 495,
      durationFrames: 405,
      shot: "insert",
      transition: { type: "slideCarryLeft", frames: 12 },
      bg: { type: "flat", colors: ["#EDF2EB"], set: "none", texture: "none", stageMood: "sageBotanical" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "document-quote",
        subject: "sculptor carving away the non-essential",
        action: "asymmetric editorialSpread pairs chisel art with highlighted oxygen quote",
        payoff: "makes subtraction feel tangible and deliberate",
        revealFrame: 130,
      },
      editorialSpread: {
        image: img("e1_marble_chisel"),
        mediaSide: "left",
        kicker: "THE DISCIPLINED PURSUIT",
        headline: "Carve Away Everything Else",
        quote: "Carving away the non-essential stuff just so the absolute essential thing actually has the oxygen to survive.",
        highlightPhrases: [
          { text: "non-essential stuff", at: 165 },
          { text: "oxygen to survive", at: 335 },
        ],
        attribution: "Essentialism · Greg McKeown",
      },
    },
    {
      id: "es1-b3-tetris-interface",
      fromFrame: 900,
      durationFrames: 600,
      shot: "insert",
      transition: { type: "zoomPush", frames: 12 },
      bg: { type: "flat", colors: ["#F5E9DC"], set: "none", texture: "none", stageMood: "terracottaStudio" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "live-interface",
        subject: "Slack/Teams lit up + Tetris calendar blocks falling",
        action: "liveInterface lights up unread channels and drops Tetris blocks into weekly calendar",
        payoff: "shows 10 AM digital overload literally instead of static coffee character",
        revealFrame: 420,
      },
      liveInterface: {
        variant: "calendarTetris",
        title: "10:00 A.M. · THE EVERYDAY REALITY",
        subtitle: "Your channels light up like a Christmas tree while your calendar fills like Tetris",
        channels: [
          { name: "#product-launch", preview: "Need your sign-off ASAP", count: 42, tone: "danger", at: 330 },
          { name: "#exec-sync", preview: "Added 3 urgent threads", count: 19, tone: "danger", at: 360 },
          { name: "Teams · Direct", preview: "Can you hop on a quick call?", count: 14, tone: "accent", at: 390 },
          { name: "#side-project", preview: "Updated deck attached", count: 27, tone: "danger", at: 415 },
        ],
        blocks: [
          { day: 0, label: "All-Hands", span: 1.2, tone: "accent", at: 120 },
          { day: 0, label: "Urgent Sync", span: 1.4, tone: "danger", at: 320 },
          { day: 1, label: "Committee", span: 1.5, tone: "accent", at: 180 },
          { day: 1, label: "1:1 Review", span: 1.2, tone: "danger", at: 380 },
          { day: 2, label: "Status Call", span: 1.3, tone: "neutral", at: 240 },
          { day: 2, label: "Fire Drill", span: 1.6, tone: "danger", at: 430 },
          { day: 3, label: "Deck Review", span: 1.4, tone: "accent", at: 350 },
          { day: 4, label: "Tetris Overload", span: 1.8, tone: "danger", at: 470 },
        ],
      },
    },

    // ── SLICE 2 (1500..3000, 50s @ 720..770s) ────────────────────────────────
    {
      id: "es2-b1-paradox-comic",
      fromFrame: 1500,
      durationFrames: 525,
      shot: "insert",
      transition: { type: "blurCut", frames: 12 },
      bg: { type: "flat", colors: ["#FAF7F0"], set: "none", texture: "none", stageMood: "ivoryBroadsheet" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "comic-strip",
        subject: "Paradox of Success 4 sequential phases",
        action: "4-panel ComicStrip reveals Phase 1->2->3->4 in sequence",
        payoff: "eliminates parallel-branch confusion and breaks centered layout",
        revealFrame: 340,
      },
      comicStrip: {
        layout: "quad2x2",
        title: "THE PARADOX OF SUCCESS",
        subtitle: "How winning creates the exact distractions that undermine clarity",
        panels: [
          { step: "PHASE 1", title: "Clear Focus", caption: "Clarity of purpose drives your initial breakthrough.", visual: "focusBeam", tone: "positive", at: 10 },
          { step: "PHASE 2", title: "Flood of Options", caption: "Success rewards you with committees & side projects.", visual: "floodArrows", tone: "accent", at: 45 },
          { step: "PHASE 3", title: "Diffused Efforts", caption: "Spread too thin — nothing is done well.", visual: "thinSpread", tone: "danger", at: 295 },
          { step: "PHASE 4", title: "Distracted from Core", caption: "Your own success undermines the clarity that created it.", visual: "buriedCore", tone: "danger", at: 380 },
        ],
      },
    },
    {
      id: "es2-b2-desk-brackets",
      fromFrame: 2025,
      durationFrames: 390,
      shot: "insert",
      transition: { type: "slideCarryUp", frames: 12 },
      bg: { type: "flat", colors: ["#EDF2EB"], set: "none", texture: "none", stageMood: "sageBotanical" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "annotate-place",
        subject: "cluttered desk of diffused commitments",
        action: "annotatedScene frames the blueprint pad with crisp architectural brackets",
        payoff: "matches Phase 4 label consistently and pinpoints core competency",
        revealFrame: 120,
      },
      annotatedScene: {
        image: img("e2_cluttered_desk"),
        framing: "editorialPrint",
        markerStyle: "bracket",
        kenBurns: "pushIn",
        dim: 0.04,
        banner: { text: "PHASE 4 · DISTRACTED FROM THE CORE", at: 20 },
        spotlights: [
          {
            cx: 1240,
            cy: 630,
            rx: 210,
            ry: 150,
            label: "CORE COMPETENCY",
            note: "Buried under new options",
            labelX: 1680,
            labelY: 360,
            tone: "danger",
            at: 110,
          },
        ],
        stickers: [
          {
            title: "CLARITY UNDERMINED",
            subtitle: "Your own success created the noise",
            icon: "eye",
            x: 225,
            y: 520,
            rot: 0,
            tone: "accent",
            at: 210,
          },
        ],
      },
    },
    {
      id: "es2-b3-mentor-drama",
      fromFrame: 2415,
      durationFrames: 585,
      shot: "insert",
      transition: { type: "zoomPull", frames: 12 },
      bg: { type: "flat", colors: ["#FAF7F0"], set: "none", texture: "none", stageMood: "ivoryBroadsheet" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "cutout-drama",
        subject: "go-to person pulled in 4 directions vs calm mentor",
        action: "multi-pose worker cutout switches from asking to stressed as 4 pressure connectors hit",
        payoff: "shows the go-to trap visually with face-safe tailed speech bubbles",
        revealFrame: 495,
      },
      cutoutStage: {
        backdrop: { image: img("e2_studio_lounge_stage"), dim: 0.06, kenBurns: "pullOut" },
        banner: { text: "THE GO-TO PERSON ILLUSION", at: 20 },
        connectors: [
          { from: { x: 240, y: 310 }, to: { x: 470, y: 450 }, label: "URGENT FAVOR", tone: "danger", at: 180 },
          { from: { x: 240, y: 560 }, to: { x: 470, y: 540 }, label: "EXTRA COMMITTEE", tone: "danger", at: 240 },
          { from: { x: 890, y: 320 }, to: { x: 670, y: 450 }, label: "SIDE PROJECT", tone: "accent", at: 300 },
          { from: { x: 890, y: 580 }, to: { x: 670, y: 540 }, label: "ALL-HANDS", tone: "danger", at: 360 },
        ],
        actors: [
          {
            id: "young_pro",
            image: img("e1_char_overwhelmed"),
            poses: [
              { at: 0, image: img("e1_char_overwhelmed") },
              { at: 360, image: img("e2_worker_calm") },
            ],
            x: 560,
            y: 590,
            width: 310,
            height: 490,
            enter: "left",
            at: 10,
            action: "leanIn",
            actionAt: 130,
            says: { text: "Ultimate job security?", at: 130, side: "right", tone: "accent" },
          },
          {
            id: "mentor",
            image: img("e2_char_mentor"),
            x: 1360,
            y: 590,
            width: 320,
            height: 510,
            flip: true,
            enter: "right",
            at: 30,
            action: "calm",
            actionAt: 495,
            says: { text: "Spread too thin = zero impact.", at: 495, side: "left", tone: "danger" },
          },
        ],
        callout: "Being indispensable for everything blocks what matters most.",
        calloutAt: 520,
      },
    },

    // ── SLICE 3 (3000..4500, 50s @ 1380..1430s) ──────────────────────────────
    {
      id: "es3-b1-tradeoff-scale",
      fromFrame: 3000,
      durationFrames: 645,
      shot: "insert",
      transition: { type: "slideCarryLeft", frames: 12 },
      bg: { type: "flat", colors: ["#F5E9DC"], set: "none", texture: "none", stageMood: "terracottaStudio" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "tradeoff-scale",
        subject: "terrifying trade-off: revenue loss vs customer trust",
        action: "balanceScale tips decisively toward unimpeachable integrity with clean pan clearance",
        payoff: "shows trade-offs are choosing which problem you want",
        revealFrame: 420,
      },
      balanceScale: {
        title: "CHOOSING YOUR PROBLEM",
        subtitle: "Every real trade-off forces a choice between two hard realities",
        leftLabel: "SHORT-TERM PAIN",
        rightLabel: "LONG-TERM INTEGRITY",
        leftWeights: [
          { label: "Massive Revenue Loss", sublabel: "Explaining to angry shareholders", weight: 1.2, tone: "danger", at: 440 },
        ],
        rightWeights: [
          { label: "Unimpeachable Integrity", sublabel: "Refused compromised safety", weight: 1.6, tone: "positive", at: 145 },
          { label: "Saved Brand Trust Forever", sublabel: "Decisive leadership under fire", weight: 1.4, tone: "positive", at: 240 },
        ],
        verdict: "They knew exactly which problem they wanted.",
        verdictAt: 335,
      },
    },
    {
      id: "es3-b2-boardroom-to-home",
      fromFrame: 3645,
      durationFrames: 255,
      shot: "insert",
      transition: { type: "blurCut", frames: 12 },
      bg: { type: "flat", colors: ["#FAF7F0"], set: "none", texture: "none", stageMood: "ivoryBroadsheet" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "before-after-wipe",
        subject: "boardroom vs living room trade-off",
        action: "diagonal wipe transitions from corporate boardroom to personal living room",
        payoff: "makes the boardroom-to-living-room bridge concrete and visual",
        revealFrame: 90,
      },
      beforeAfterWipe: {
        direction: "diagonal",
        wipeAt: 40,
        endSplit: 0.5,
        before: {
          image: img("e3_boardroom_table"),
          label: "THE BOARDROOM",
          headline: "Corporate Trade-Offs",
          points: ["Revenue vs. Brand Trust"],
          tone: "accent",
        },
        after: {
          image: img("e3_living_room_calm"),
          label: "THE LIVING ROOM",
          headline: "Personal Trade-Offs",
          points: ["Where we struggle most"],
          tone: "positive",
        },
      },
    },
    {
      id: "es3-b3-four-burners",
      fromFrame: 3900,
      durationFrames: 600,
      shot: "insert",
      transition: { type: "zoomPush", frames: 12 },
      bg: { type: "flat", colors: ["#EDF2EB"], set: "none", texture: "none", stageMood: "sageBotanical" },
      camera: { zoom: [1, 1.02], panX: [0, 0], panY: [0, 0] },
      characters: [],
      props: [],
      texts: [],
      shotIntent: {
        job: "burner-grid",
        subject: "Four-Burner Stove analogy",
        action: "stackReveal burners dial down Friends and Health on cue, then challenge the cliche",
        payoff: "visualizes the four-burner stove dynamically in 2x2 dials",
        revealFrame: 420,
      },
      stackReveal: {
        variant: "burners",
        title: "THE FOUR-BURNER STOVE ANALOGY",
        subtitle: "Your life has four burners — the cliché says you must shut them down",
        items: [
          { label: "WORK", detail: "Career & output", level: 0.9, tone: "accent" },
          { label: "FAMILY", detail: "Home & loved ones", level: 0.85, tone: "positive" },
          { label: "FRIENDS", detail: "Social circle", level: 0.75, targetLevel: 0.0, changeAt: 420, tone: "accent" },
          { label: "HEALTH", detail: "Sleep & vitality", level: 0.8, targetLevel: 0.0, changeAt: 490, tone: "danger" },
        ],
        callout: "Turn off 1 to succeed, 2 for a billionaire — I refuse to accept that.",
        calloutAt: 530,
      },
    },
  ],
};

const parsed = antidoteConfigSchema.parse(config);
const varietyStats = assertVariety(parsed);
const narrativeRes = assertNarrativeQuality(parsed);

const outDir = path.join(ROOT, "audit", "essentialism-10x-pilot");
fs.mkdirSync(outDir, { recursive: true });
const cfgPath = path.join(outDir, "config.essentialism.v2.json");
fs.writeFileSync(cfgPath, JSON.stringify(parsed, null, 2));

const extraPngs = fs
  .readdirSync(path.join(ROOT, "public", "scenes", "essentialism-10x-pilot"))
  .filter((f) => f.endsWith(".png") && !f.endsWith(".raw.png"))
  .sort()
  .map((f) => `public/scenes/essentialism-10x-pilot/${f}`);

const manifest = {
  schema: "stills/1",
  name: "Antidote 10x Book 3 v2 Pilot (Essentialism)",
  composition: "Antidote-lab",
  entry: "src/index.ts",
  silent: true,
  gl: "default",
  shards: 4,
  extra: extraPngs,
  jobs: [
    {
      id: "essentialism-stills",
      config: "config.essentialism.v2.json",
      frames: [450, 780, 1340, 1920, 2260, 2930, 3460, 3810, 4440],
    },
    { id: "clip-s1", config: "config.essentialism.v2.json", frames: [], clip: { from: 0, to: 1499 } },
    { id: "clip-s2", config: "config.essentialism.v2.json", frames: [], clip: { from: 1500, to: 2999 } },
    { id: "clip-s3", config: "config.essentialism.v2.json", frames: [], clip: { from: 3000, to: 4499 } },
  ],
};
const manifestPath = path.join(outDir, "manifest.essentialism.v2.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`✓ Wrote ${path.relative(ROOT, cfgPath)} (${parsed.scenes.length} scenes, ${parsed.captions.length} captions, ${parsed.meta.durationInFrames} frames)`);
console.log(`✓ Variety & Single-World stats:`, JSON.stringify(varietyStats));
console.log(`✓ Narrative lint: ok=${narrativeRes.ok}, warnings=${narrativeRes.warnings.length}`);
if (narrativeRes.warnings.length) console.log("  Warnings:", narrativeRes.warnings);
console.log(`✓ Wrote ${path.relative(ROOT, manifestPath)} (${extraPngs.length} extra PNGs)`);
