#!/usr/bin/env node
/**
 * build-antidote-p2-samples.js — Generates 6 small US-English sample configs
 * (5 contrasting mini-books across 5 layoutGrammars & varied device mixes + 1 new-devices showcase)
 * and a `stills/1` manifest under `audit/antidote-p2-samples/` for GitHub Actions cloud rendering.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { STYLE_PACKS, toArtDirection } = require("./lib/style-packs");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "audit", "antidote-p2-samples");
const CFG_DIR = path.join(OUT_DIR, "configs");
fs.mkdirSync(CFG_DIR, { recursive: true });

const EXTRA_IMAGES = [
  "public/scenes/essentialism-10x-pilot/e1_sunlit_desk_stage.png",
  "public/scenes/essentialism-10x-pilot/e1_marble_chisel.png",
  "public/scenes/essentialism-10x-pilot/e2_studio_lounge_stage.png",
  "public/scenes/essentialism-10x-pilot/e2_worker_calm.png",
  "public/scenes/essentialism-10x-pilot/e3_boardroom_table.png",
  "public/scenes/essentialism-10x-pilot/e3_living_room_calm.png",
  "public/scenes/antidote-v2-pilot/s1_yale_lab.png",
  "public/scenes/antidote-v2-pilot/s3_lobby_boardroom.png",
];

function makeSwissLight() {
  const pack = STYLE_PACKS.swissModernist;
  return {
    meta: { slug: "sample-swiss-light", title: "Swiss Light", fps: 30, width: 1920, height: 1080, durationInFrames: 540, artDirection: toArtDirection(pack) },
    captions: [
      { text: "Eighty-two percent or 82% of noise disappears when you focus.", startFrame: 0, endFrame: 89 },
      { text: "Leverage lives where skill meets need.", startFrame: 90, endFrame: 179 },
      { text: "Zooming in reveals the hidden mechanism.", startFrame: 180, endFrame: 269 },
      { text: "From 100% inputs to 42% filtered and 14% executed.", startFrame: 270, endFrame: 359 },
      { text: "Sequence one lever instead of doing everything.", startFrame: 360, endFrame: 449 },
      { text: "Design beats willpower every single day.", startFrame: 450, endFrame: 539 },
    ],
    scenes: [
      { id: "sl-1", fromFrame: 0, durationFrames: 90, transition: { type: "cut", frames: 10 }, bg: { stageMood: pack.mood }, statSlam: { kicker: "CORE THESIS", value: "82%", label: "Noise Eliminated", tone: "accent", bars: [{ label: "Signal", value: 0.82, tone: "positive" }, { label: "Noise", value: 0.18, tone: "danger" }] } },
      { id: "sl-2", fromFrame: 90, durationFrames: 90, transition: { type: "halftoneCut", frames: 12 }, bg: { stageMood: pack.mood }, vennMerge: { title: "Strategic Overlap", circles: [{ label: "Deep Skill", tone: "accent" }, { label: "Market Need", tone: "positive" }], intersection: { label: "Leverage", detail: "Where value compounds" } } },
      { id: "sl-3", fromFrame: 180, durationFrames: 90, transition: { type: "paperTear", frames: 12 }, bg: { stageMood: pack.mood }, upClose: { image: "scenes/essentialism-10x-pilot/e1_sunlit_desk_stage.png", zoomTarget: { x: 0.52, y: 0.45, scale: 2.1 }, lensLabel: "DETAIL", annotation: { headline: "Focus Under Pressure", detail: "Zooming in reveals the hidden mechanism.", side: "right" } } },
      { id: "sl-4", fromFrame: 270, durationFrames: 90, transition: { type: "halftoneCut", frames: 12 }, bg: { stageMood: pack.mood }, analyticsFunnel: { title: "Attention Funnel", stages: [{ label: "Inputs", value: "100%", share: 1.0, tone: "neutral" }, { label: "Filtered", value: "42%", share: 0.55, tone: "accent" }, { label: "Executed", value: "14%", share: 0.30, tone: "positive", dropNote: "86% noise cut" }], bottleneckIndex: 1 } },
      { id: "sl-5", fromFrame: 360, durationFrames: 90, transition: { type: "paperTear", frames: 12 }, bg: { stageMood: pack.mood }, crumpleToss: { title: "Old Habit vs New Rule", myth: { badge: "MYTH", headline: "Do everything at once", bullets: ["Fragmented focus", "Zero compounding"] }, tossAt: 36, truth: { badge: "RULE", headline: "Sequence one lever", detail: "Clarity precedes speed." } } },
      { id: "sl-6", fromFrame: 450, durationFrames: 90, transition: { type: "halftoneCut", frames: 12 }, bg: { stageMood: pack.mood }, editorialSpread: { image: "scenes/essentialism-10x-pilot/e1_marble_chisel.png", mediaSide: "left", kicker: "TAKEAWAY", headline: "Design beats willpower", body: "Structure your environment so the right choice is effortless." } },
    ],
  };
}

function makeNocturneLeft() {
  const pack = STYLE_PACKS.bauhausMidnight;
  return {
    meta: { slug: "sample-nocturne-left", title: "Nocturne Left", fps: 30, width: 1920, height: 1080, durationInFrames: 540, artDirection: toArtDirection(pack) },
    captions: [
      { text: "Subtraction beats addition.", startFrame: 0, endFrame: 89 },
      { text: "Every system has three hidden layers.", startFrame: 90, endFrame: 179 },
      { text: "Compounding systems overtake raw hustle from 30% to 92%.", startFrame: 180, endFrame: 269 },
      { text: "Calm execution inside a noisy world.", startFrame: 270, endFrame: 359 },
      { text: "The timeline separates signal from panic.", startFrame: 360, endFrame: 449 },
      { text: "Compare the old reactive mode with deliberate design.", startFrame: 450, endFrame: 539 },
    ],
    scenes: [
      { id: "nl-1", fromFrame: 0, durationFrames: 90, transition: { type: "cut", frames: 10 }, bg: { stageMood: pack.mood }, kineticManifesto: { kicker: "MANIFESTO", lines: [{ text: "ADDITION", strikeAt: 24 }, { text: "SUBTRACTION", emphasis: true }] } },
      { id: "nl-2", fromFrame: 90, durationFrames: 90, transition: { type: "pageTurn", frames: 12 }, bg: { stageMood: pack.mood }, explodedView: { title: "System Architecture", layers: [{ label: "Surface Habit", detail: "Visible action", tone: "accent" }, { label: "Trigger Cue", detail: "Prompt", tone: "positive" }, { label: "Identity", detail: "Core belief" }], expandAt: 20 } },
      { id: "nl-3", fromFrame: 180, durationFrames: 90, transition: { type: "pushThrough", frames: 12 }, bg: { stageMood: pack.mood }, barRace: { title: "Compounding Edge", epochs: [{ label: "YEAR 1", at: 0, bars: [{ id: "a", label: "Hustle", value: 60, displayValue: "60%" }, { id: "b", label: "Systems", value: 30, displayValue: "30%", tone: "positive" }] }, { label: "YEAR 5", at: 40, bars: [{ id: "a", label: "Hustle", value: 40, displayValue: "40%" }, { id: "b", label: "Systems", value: 92, displayValue: "92%", tone: "positive" }] }] } },
      { id: "nl-4", fromFrame: 270, durationFrames: 90, transition: { type: "pageTurn", frames: 12 }, bg: { stageMood: pack.mood }, cutoutStage: { backdrop: { image: "scenes/essentialism-10x-pilot/e1_sunlit_desk_stage.png", dim: 0.25, kenBurns: "dollyZoom" }, actors: [{ id: "w", image: "scenes/essentialism-10x-pilot/e2_worker_calm.png", x: 960, y: 620, height: 540 }], callout: "Calm Execution" } },
      { id: "nl-5", fromFrame: 360, durationFrames: 90, transition: { type: "pushThrough", frames: 12 }, bg: { stageMood: pack.mood }, timelineScrub: { title: "Decision Horizon", events: [{ time: "DAY 1", title: "Audit", at: 0 }, { time: "DAY 7", title: "Prune", at: 30 }, { time: "DAY 30", title: "Compound", at: 60, tone: "positive" }] } },
      { id: "nl-6", fromFrame: 450, durationFrames: 90, transition: { type: "pageTurn", frames: 12 }, bg: { stageMood: pack.mood }, comparisonGrid: { layout: "fullBleedSplit", columns: [{ heading: "Reactive", image: "scenes/antidote-v2-pilot/s3_lobby_boardroom.png", bullets: ["Constant urgency"], tone: "danger" }, { heading: "Deliberate", image: "scenes/antidote-v2-pilot/s1_yale_lab.png", bullets: ["Deep leverage"], tone: "positive" }] } },
    ],
  };
}

function makeMonocleRight() {
  const pack = STYLE_PACKS.monocleEditorial;
  return {
    meta: { slug: "sample-monocle-right", title: "Monocle Right", fps: 30, width: 1920, height: 1080, durationInFrames: 540, artDirection: toArtDirection(pack) },
    captions: [
      { text: "Part one: the architecture of attention.", startFrame: 0, endFrame: 89 },
      { text: "Unfiltered obligations pile up until they crush clarity.", startFrame: 90, endFrame: 179 },
      { text: "Half the group protected deep work.", startFrame: 180, endFrame: 269 },
      { text: "The route spans from audit to execution.", startFrame: 270, endFrame: 359 },
      { text: "True leverage outweighs busywork.", startFrame: 360, endFrame: 449 },
      { text: "Prune the trivial many to protect the vital few.", startFrame: 450, endFrame: 539 },
    ],
    scenes: [
      { id: "mr-1", fromFrame: 0, durationFrames: 90, transition: { type: "cut", frames: 10 }, bg: { stageMood: pack.mood }, chapterInterstitial: { variant: "broadsheetRule", kicker: "PART I", title: "THE ARCHITECTURE OF ATTENTION", subtitle: "Why less creates more" } },
      { id: "mr-2", fromFrame: 90, durationFrames: 90, transition: { type: "paperTear", frames: 12 }, bg: { stageMood: pack.mood }, gravityPile: { title: "Obligation Overload", items: [{ label: "Urgent Ping", tag: "NOISE" }, { label: "Status Call", tag: "SYNC" }, { label: "Ad-hoc Deck", tag: "RUSH" }, { label: "Deep Work", tag: "CORE", tone: "positive" }, { label: "Inbox Zero", tag: "TRAP" }, { label: "Review", tag: "CHECK" }], dropZoneLabel: "BANDWIDTH" } },
      { id: "mr-3", fromFrame: 180, durationFrames: 90, transition: { type: "pageTurn", frames: 12 }, bg: { stageMood: pack.mood }, cohortGrid: { title: "Controlled Split", total: 20, splitAt: 24, leftGroup: { label: "Protected", share: 0.5, tone: "positive" }, rightGroup: { label: "Fragmented", share: 0.5 } } },
      { id: "mr-4", fromFrame: 270, durationFrames: 90, transition: { type: "paperTear", frames: 12 }, bg: { stageMood: pack.mood }, spatialJourney: { variant: "worldArc", title: "Global Rollout", stations: [{ label: "Audit", detail: "Week 1" }, { label: "Filter", detail: "Week 2" }, { label: "Scale", detail: "Week 4", tone: "positive" }] } },
      { id: "mr-5", fromFrame: 360, durationFrames: 90, transition: { type: "pageTurn", frames: 12 }, bg: { stageMood: pack.mood }, balanceScale: { title: "The Trade-Off", leftLabel: "Busywork", rightLabel: "Leverage", leftWeights: [{ label: "Meetings", weight: 1 }], rightWeights: [{ label: "Deep Craft", weight: 3, tone: "positive" }] } },
      { id: "mr-6", fromFrame: 450, durationFrames: 90, transition: { type: "paperTear", frames: 12 }, bg: { stageMood: pack.mood }, decisionTree: { title: "Strategic Pruning", root: { label: "Opportunity" }, branches: [{ label: "Trivial Many", pruneAt: 32 }, { label: "Vital Few", winner: true }] } },
    ],
  };
}

function makeCinemaXray() {
  const pack = STYLE_PACKS.xrayDiagnostics;
  return {
    meta: { slug: "sample-cinema-xray", title: "Cinema XRay", fps: 30, width: 1920, height: 1080, durationInFrames: 540, artDirection: toArtDirection(pack) },
    captions: [
      { text: "Inside the boardroom, tension hides behind polite nods.", startFrame: 0, endFrame: 89 },
      { text: "Anger spikes fast while lasting damage stays flat.", startFrame: 90, endFrame: 179 },
      { text: "Calendar Tetris fills every open hour.", startFrame: 180, endFrame: 269 },
      { text: "Precision lies at the intersection of data and judgment.", startFrame: 270, endFrame: 359 },
      { text: "Turn off the secondary burners to fuel the core.", startFrame: 360, endFrame: 449 },
      { text: "Compare the noisy room with the calm studio.", startFrame: 450, endFrame: 539 },
    ],
    scenes: [
      { id: "cx-1", fromFrame: 0, durationFrames: 90, transition: { type: "cut", frames: 10 }, bg: { stageMood: pack.mood }, annotatedScene: { image: "scenes/essentialism-10x-pilot/e3_boardroom_table.png", spotlights: [{ cx: 960, cy: 480, rx: 180, label: "BOTTLENECK", at: 18 }], stickers: [{ title: "HIGH STAKES", icon: "alert", x: 320, y: 340, at: 28 }] } },
      { id: "cx-2", fromFrame: 90, durationFrames: 90, transition: { type: "focusPull", frames: 12 }, bg: { stageMood: pack.mood }, dataMatrix: { variant: "dualCurve", title: "Spike vs Decay", xLabel: "TIME", yLabel: "IMPACT", curves: [{ label: "Impulse", points: [0, 0.95, 0.7, 0.2, 0.1] }, { label: "Consequence", points: [0, 0.55, 0.62, 0.6, 0.58] }] } },
      { id: "cx-3", fromFrame: 180, durationFrames: 90, transition: { type: "whipPan", frames: 12 }, bg: { stageMood: pack.mood }, liveInterface: { variant: "calendarTetris", title: "Calendar Tetris", channels: [{ name: "#alerts", count: 14, at: 10 }], blocks: [{ day: 0, label: "Sync", at: 12 }, { day: 2, label: "Review", at: 24 }] } },
      { id: "cx-4", fromFrame: 270, durationFrames: 90, transition: { type: "focusPull", frames: 12 }, bg: { stageMood: pack.mood }, vennMerge: { title: "Diagnostic Lens", circles: [{ label: "Data", tone: "accent" }, { label: "Judgment", tone: "positive" }], intersection: { label: "Precision" } } },
      { id: "cx-5", fromFrame: 360, durationFrames: 90, transition: { type: "whipPan", frames: 12 }, bg: { stageMood: pack.mood }, stackReveal: { variant: "burners", title: "Four Burners", items: [{ label: "Core Craft", level: 0.95, tone: "positive" }, { label: "Side Quests", level: 0.7, targetLevel: 0.05, changeAt: 30 }] } },
      { id: "cx-6", fromFrame: 450, durationFrames: 90, transition: { type: "focusPull", frames: 12 }, bg: { stageMood: pack.mood }, beforeAfterWipe: { direction: "diagonal", wipeAt: 30, before: { label: "BEFORE", headline: "Noisy Room", image: "scenes/essentialism-10x-pilot/e3_boardroom_table.png" }, after: { label: "AFTER", headline: "Calm Studio", image: "scenes/essentialism-10x-pilot/e3_living_room_calm.png", tone: "positive" } } },
    ],
  };
}

function makeBroadsheetSpine() {
  const pack = STYLE_PACKS.broadsheetArchive;
  return {
    meta: { slug: "sample-broadsheet-spine", title: "Broadsheet Spine", fps: 30, width: 1920, height: 1080, durationInFrames: 540, artDirection: toArtDirection(pack) },
    captions: [
      { text: "Four sequential steps turn chaos into order.", startFrame: 0, endFrame: 89 },
      { text: "Systems overtake hustle from 30% to 92%.", startFrame: 90, endFrame: 179 },
      { text: "Discard the myth of constant availability.", startFrame: 180, endFrame: 269 },
      { text: "Research anchors the argument in evidence.", startFrame: 270, endFrame: 359 },
      { text: "Filter plus focus equals compounding output.", startFrame: 360, endFrame: 449 },
      { text: "The route maps every milestone clearly.", startFrame: 450, endFrame: 539 },
    ],
    scenes: [
      { id: "bs-1", fromFrame: 0, durationFrames: 90, transition: { type: "cut", frames: 10 }, bg: { stageMood: pack.mood }, comicStrip: { layout: "quad2x2", title: "Four-Step Sequence", panels: [{ step: "01", title: "Notice" }, { step: "02", title: "Filter" }, { step: "03", title: "Commit" }, { step: "04", title: "Compound", tone: "positive" }] } },
      { id: "bs-2", fromFrame: 90, durationFrames: 90, transition: { type: "halftoneCut", frames: 12 }, bg: { stageMood: pack.mood }, barRace: { title: "Output Shift", epochs: [{ label: "Q1", at: 0, bars: [{ id: "a", label: "Hustle", value: 60, displayValue: "60%" }, { id: "b", label: "Systems", value: 30, displayValue: "30%", tone: "positive" }] }, { label: "Q4", at: 40, bars: [{ id: "a", label: "Hustle", value: 35, displayValue: "35%" }, { id: "b", label: "Systems", value: 92, displayValue: "92%", tone: "positive" }] }] } },
      { id: "bs-3", fromFrame: 180, durationFrames: 90, transition: { type: "whipPan", frames: 12 }, bg: { stageMood: pack.mood }, crumpleToss: { title: "Availability Myth", myth: { badge: "MYTH", headline: "Always-on responsiveness" }, tossAt: 34, truth: { badge: "RULE", headline: "Protected deep blocks", detail: "Batch communication twice daily." } } },
      { id: "bs-4", fromFrame: 270, durationFrames: 90, transition: { type: "halftoneCut", frames: 12 }, bg: { stageMood: pack.mood }, realAnchor: { title: "Field Evidence", subtitle: "Longitudinal Study", badge: "ANCHOR", annotations: [{ text: "2x retention", side: "left" }, { text: "Zero burnout", side: "right" }] } },
      { id: "bs-5", fromFrame: 360, durationFrames: 90, transition: { type: "whipPan", frames: 12 }, bg: { stageMood: pack.mood }, visualEquation: { title: "The Formula", layout: "borderless", operator: "plus", nodes: [{ label: "Filter" }, { label: "Focus", tone: "accent" }, { label: "Output", tone: "positive" }] } },
      { id: "bs-6", fromFrame: 450, durationFrames: 90, transition: { type: "halftoneCut", frames: 12 }, bg: { stageMood: pack.mood }, spatialJourney: { variant: "routeMap", title: "Execution Route", stations: [{ label: "Start" }, { label: "Milestone" }, { label: "Finish", tone: "positive" }] } },
    ],
  };
}

function makeDevicesShowcase() {
  const pack = STYLE_PACKS.swissModernist;
  const ad = toArtDirection(pack);
  return {
    meta: { slug: "sample-p1-devices", title: "Antidote 10x P1 Devices", fps: 30, width: 1920, height: 1080, durationInFrames: 800, artDirection: ad },
    captions: [
      { text: "VennMerge synthesizes two ideas.", startFrame: 0, endFrame: 99 },
      { text: "ExplodedView separates the stack.", startFrame: 100, endFrame: 199 },
      { text: "GravityPile shows daily overload.", startFrame: 200, endFrame: 299 },
      { text: "CrumpleToss discards the myth.", startFrame: 300, endFrame: 399 },
      { text: "From 100% ideas to 35% tested and 12% shipped.", startFrame: 400, endFrame: 499 },
      { text: "Systems overtake hustle from 30% to 92%.", startFrame: 500, endFrame: 599 },
      { text: "UpClose zooms into the focal detail.", startFrame: 600, endFrame: 699 },
      { text: "SpatialJourney v2 maps the expedition.", startFrame: 700, endFrame: 799 },
    ],
    scenes: [
      { id: "dev-venn", fromFrame: 0, durationFrames: 100, transition: { type: "cut", frames: 10 }, bg: { stageMood: pack.mood }, vennMerge: { title: "VennMerge", subtitle: "Pure SVG Synthesis", circles: [{ label: "Clarity", tone: "accent" }, { label: "Discipline", tone: "positive" }], intersection: { label: "Mastery", detail: "Compounding edge" } } },
      { id: "dev-exploded", fromFrame: 100, durationFrames: 100, transition: { type: "pageTurn", frames: 12 }, bg: { stageMood: pack.mood }, explodedView: { title: "ExplodedView", subtitle: "Isometric Stack Expansion", layers: [{ label: "Surface Habit", detail: "Visible action", tone: "accent" }, { label: "Trigger Cue", detail: "Environmental prompt", tone: "positive" }, { label: "Core Identity", detail: "Underlying belief", tone: "neutral" }], expandAt: 20 } },
      { id: "dev-gravity", fromFrame: 200, durationFrames: 100, transition: { type: "paperTear", frames: 12 }, bg: { stageMood: pack.mood }, gravityPile: { title: "GravityPile", subtitle: "Deterministic Rigid Drop", items: [{ label: "Urgent Email", tag: "NOISE" }, { label: "Status Sync", tag: "MEETING" }, { label: "Slack Ping", tag: "ALERT", tone: "danger" }, { label: "Ad-hoc Deck", tag: "RUSH" }, { label: "Deep Work", tag: "CORE", tone: "positive" }, { label: "Review", tag: "CHECK" }], dropZoneLabel: "DAILY INBOX" } },
      { id: "dev-crumple", fromFrame: 300, durationFrames: 100, transition: { type: "pushThrough", frames: 12 }, bg: { stageMood: pack.mood }, crumpleToss: { title: "CrumpleToss", myth: { badge: "MYTH", headline: "Multitasking saves time" }, tossAt: 36, truth: { badge: "TRUTH", headline: "Single-threading wins", detail: "Zero context-switch tax." } } },
      { id: "dev-funnel", fromFrame: 400, durationFrames: 100, transition: { type: "focusPull", frames: 12 }, bg: { stageMood: pack.mood }, analyticsFunnel: { title: "AnalyticsFunnel", stages: [{ label: "Ideas", value: "100%", share: 1.0, tone: "neutral" }, { label: "Tested", value: "35%", share: 0.5, tone: "accent", dropNote: "65% filtered" }, { label: "Shipped", value: "12%", share: 0.28, tone: "positive" }], bottleneckIndex: 1 } },
      { id: "dev-barrace", fromFrame: 500, durationFrames: 100, transition: { type: "halftoneCut", frames: 12 }, bg: { stageMood: pack.mood }, barRace: { title: "BarRace", epochs: [{ label: "YEAR 1", at: 0, bars: [{ id: "a", label: "Hustle", value: 60, displayValue: "60%" }, { id: "b", label: "Systems", value: 30, displayValue: "30%", tone: "positive" }] }, { label: "YEAR 5", at: 45, bars: [{ id: "a", label: "Hustle", value: 40, displayValue: "40%" }, { id: "b", label: "Systems", value: 92, displayValue: "92%", tone: "positive" }] }] } },
      { id: "dev-upclose", fromFrame: 600, durationFrames: 100, transition: { type: "whipPan", frames: 12 }, bg: { stageMood: pack.mood }, upClose: { image: "scenes/essentialism-10x-pilot/e1_marble_chisel.png", zoomTarget: { x: 0.5, y: 0.45, scale: 2.2 }, lensLabel: "UP CLOSE", annotation: { headline: "Carve Away Excess", detail: "Pure CSS optical macro-zoom.", side: "right" } } },
      { id: "dev-topo", fromFrame: 700, durationFrames: 100, transition: { type: "pageTurn", frames: 12 }, bg: { stageMood: pack.mood }, spatialJourney: { variant: "topoExpedition", title: "SpatialJourney v2", stations: [{ label: "Basecamp", detail: "Audit" }, { label: "Ridge", detail: "Eliminate" }, { label: "Summit", detail: "Execute", tone: "positive" }] } },
    ],
  };
}

const specs = [makeSwissLight(), makeNocturneLeft(), makeMonocleRight(), makeCinemaXray(), makeBroadsheetSpine(), makeDevicesShowcase()];

const jobs = [];
for (const cfg of specs) {
  const slug = cfg.meta.slug;
  const relCfg = `configs/${slug}.json`;
  fs.writeFileSync(path.join(CFG_DIR, `${slug}.json`), JSON.stringify(cfg, null, 2));

  const total = cfg.meta.durationInFrames;
  const nFrames = slug === "sample-p1-devices" ? 16 : 12;
  const frames = Array.from({ length: nFrames }, (_, i) => Math.round(total * (0.04 + (0.92 * (i + 0.5)) / nFrames)));
  jobs.push({ id: slug, config: relCfg, frames, grid: { cols: 4, width: 480 } });
  jobs.push({ id: `${slug}-clip`, config: relCfg, frames: [], clip: { from: 0, to: total - 1, scale: 0.5, crf: 23 } });
}

const manifest = {
  schema: "stills/1",
  name: "Antidote 10x Phase 2 Samples",
  composition: "Antidote-lab",
  entry: "src/index.ts",
  silent: true,
  gl: "default",
  shards: 6,
  extra: EXTRA_IMAGES,
  jobs,
};

fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Built ${specs.length} sample configs + manifest at ${path.relative(ROOT, OUT_DIR)}`);
