#!/usr/bin/env node
/**
 * build-thumbs-manifest.js — Renders 3 Book-Native Antidote 10x Thumbnails
 * via `Thumb-lab` on GitHub Actions.
 */
const fs = require("fs");
const path = require("path");
const { toArtDirection } = require("../lib/style-packs");

const ROOT = path.resolve(__dirname, "..", "..");
const outDir = path.join(ROOT, "audit", "essentialism-10x-pilot");
fs.mkdirSync(outDir, { recursive: true });

const defaultVariant = {
  skin: "#F2C79B", hair: "#3A2A22", suit: "#4E6E8E", shirt: "#FFFFFF",
  expression: "neutral", hairStyle: "short", glasses: false, beard: "none",
  gender: "m", age: "adult", outfit: "suit", headwear: "none", accessory: "none",
  build: "average", height: 1, headScale: 1, overlay: [],
};

const jobs = [
  {
    id: "thumb-book1-talk",
    cfgFile: "thumb.book1.json",
    config: {
      title: "How to Talk to Anyone",
      author: "Leil Lowndes",
      hook: "FIRST 3 SECONDS",
      kicker: "COMMUNICATION",
      paper: "#101319",
      ink: "#F7F4EC",
      accent: "#F7C948",
      gold: "#56CFE1",
      variant: defaultVariant,
      layout: "editorial-cover-10x",
      heroImg: "scenes/antidote-v2-pilot/s1_fast_grin.png",
      artDirection: toArtDirection("midCenturyEditorial"),
    },
  },
  {
    id: "thumb-book2-strategy",
    cfgFile: "thumb.book2.json",
    config: {
      title: "The Art of Strategy",
      author: "Dixit & Nalebuff",
      hook: "SHAPE EXPECTATIONS",
      kicker: "GAME THEORY",
      paper: "#0B1626",
      ink: "#F4F7FB",
      accent: "#F06449",
      gold: "#38BDF8",
      variant: defaultVariant,
      layout: "split-poster-10x",
      heroImg: "scenes/strategy-10x-pilot/s1_chess_expectation.png",
      artDirection: toArtDirection("tacticalBlueprint"),
    },
  },
  {
    id: "thumb-book3-essentialism",
    cfgFile: "thumb.book3.json",
    config: {
      title: "Essentialism",
      author: "Greg McKeown",
      hook: "LESS BUT BETTER",
      kicker: "ESSENTIALISM",
      paper: "#FAF7F0",
      ink: "#18181B",
      accent: "#C2410C",
      gold: "#166534",
      variant: defaultVariant,
      layout: "cutout-hero-10x",
      heroImg: "scenes/essentialism-10x-pilot/e2_studio_lounge_stage.png",
      cutoutImg: "scenes/essentialism-10x-pilot/e1_char_overwhelmed.png",
      artDirection: toArtDirection("kinfolkMinimal"),
    },
  },
];

for (const j of jobs) {
  fs.writeFileSync(path.join(outDir, j.cfgFile), JSON.stringify(j.config, null, 2));
}

const manifest = {
  schema: "stills/1",
  name: "Antidote 10x 3-Book Book-Native Thumbnails",
  composition: "Thumb-lab",
  entry: "src/index.ts",
  silent: true,
  gl: "default",
  shards: 1,
  extra: [
    "public/scenes/antidote-v2-pilot/s1_fast_grin.png",
    "public/scenes/strategy-10x-pilot/s1_chess_expectation.png",
    "public/scenes/essentialism-10x-pilot/e2_studio_lounge_stage.png",
    "public/scenes/essentialism-10x-pilot/e1_char_overwhelmed.png",
  ],
  jobs: jobs.map((j) => ({ id: j.id, config: j.cfgFile, frames: [1] })),
};

const manifestPath = path.join(outDir, "manifest.thumbs.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("✓ Wrote", path.relative(ROOT, manifestPath));
