#!/usr/bin/env node
/**
 * cold-open-preview.js — Slices the first ~20s (max 30s) of a book's Antidote 10x
 * config for fast audio-synced Cold-Open cloud preview & paired pixel-delta QA.
 *
 * Usage:
 *   node scripts/cold-open-preview.js (--slug=<slug> | --config=<path>) [--seconds=20] [--out=<dir>] [--with-clip] [--dry-run]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { analyzeNarrative } = require("./lib/v2-narrative-lint");
const { analyzeVariety } = require("./lib/v2-variety-lint");

const ROOT = path.resolve(__dirname, "..");

function collectExtraAssets(scenes) {
  const rels = new Set();
  const add = (p) => {
    if (typeof p !== "string" || !p.trim()) return;
    const clean = p.replace(/\\/g, "/").replace(/^\/+/, "");
    const repoRel = clean.startsWith("public/") ? clean : `public/${clean}`;
    if (fs.existsSync(path.join(ROOT, repoRel))) rels.add(repoRel);
  };
  for (const s of scenes) {
    add(s.bg?.image?.path);
    add(s.hookPoster?.beforeImage);
    add(s.hookPoster?.afterImage);
    add(s.annotatedScene?.image);
    add(s.editorialSpread?.image);
    add(s.upClose?.image);
    add(s.evidenceBoard?.image);
    add(s.cutoutStage?.backdrop?.image);
    for (const a of s.cutoutStage?.actors ?? []) add(a.image);
  }
  return [...rels].sort();
}

function buildColdOpenSlice(config, { seconds = 20, fps = 30, includeClip = false } = {}) {
  const clampedSec = Math.max(5, Math.min(30, Number(seconds) || 20));
  const targetFrames = Math.round(clampedSec * fps);
  const scenes = Array.isArray(config?.scenes) ? config.scenes : [];
  if (!scenes.length) throw new Error("Config has no scenes");

  const slicedScenes = [];
  for (const s of scenes) {
    if ((s.fromFrame ?? 0) >= targetFrames && slicedScenes.length > 0) break;
    slicedScenes.push(s);
    if ((s.fromFrame ?? 0) + (s.durationFrames ?? 0) >= targetFrames) break;
  }

  const last = slicedScenes[slicedScenes.length - 1];
  const previewFrames = Math.min(900, Math.max(150, (last.fromFrame ?? 0) + (last.durationFrames ?? 0)));

  const slicedCaptions = (config.captions ?? [])
    .filter((c) => c.startFrame < previewFrames)
    .map((c) => ({ ...c, endFrame: Math.min(previewFrames, c.endFrame) }));

  const slicedAudioEvents = (config.audioEvents ?? [])
    .filter((e) => e.frame < previewFrames);

  const slicedConfig = {
    ...config,
    meta: {
      ...(config.meta || {}),
      durationInFrames: previewFrames,
    },
    scenes: slicedScenes,
    captions: slicedCaptions,
    ...(config.audioEvents ? { audioEvents: slicedAudioEvents } : {}),
  };

  const slug = config?.meta?.slug || "cold-open-preview";
  const jobs = [];
  for (const s of slicedScenes) {
    const start = s.fromFrame ?? 0;
    const dur = s.durationFrames ?? 180;
    const t05 = Math.min(previewFrames - 1, start + Math.min(8, Math.max(2, Math.round(dur * 0.04))));
    const t75 = Math.min(previewFrames - 1, start + Math.max(16, Math.round(dur * 0.75)));
    jobs.push({ id: `${s.id}__t05`, config: "config.cold-open.json", frames: [t05] });
    jobs.push({ id: `${s.id}__t75`, config: "config.cold-open.json", frames: [t75] });
  }
  if (includeClip) {
    jobs.push({ id: "cold-open-20s", config: "config.cold-open.json", frames: [], clip: { from: 0, to: previewFrames - 1 } });
  }

  const extra = collectExtraAssets(slicedScenes);
  const manifest = {
    schema: "stills/1",
    name: `cold-open-${slug}`,
    composition: "Antidote-lab",
    silent: true,
    slug,
    previewFrames,
    seconds: Number((previewFrames / fps).toFixed(2)),
    ...(extra.length ? { extra } : {}),
    jobs,
  };

  const narrative = analyzeNarrative(slicedConfig);
  const variety = analyzeVariety(slicedConfig);

  return { slicedConfig, manifest, narrative, variety };
}

if (require.main === module) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)=(.*)$/);
      return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
    })
  );

  const cfgPath = args.config
    ? path.resolve(String(args.config))
    : args.slug
      ? path.join(ROOT, "books", String(args.slug), "config.antidote.json")
      : null;

  if (!cfgPath || !fs.existsSync(cfgPath)) {
    console.error("usage: node scripts/cold-open-preview.js (--slug=<slug> | --config=<path>) [--seconds=20] [--out=<dir>] [--with-clip] [--dry-run]");
    process.exit(2);
  }

  const config = JSON.parse(fs.readFileSync(cfgPath, "utf8").replace(/^\uFEFF/, ""));
  const slug = config?.meta?.slug || String(args.slug || "preview");
  const outDir = args.out ? path.resolve(String(args.out)) : path.join(ROOT, "audit", "cold-open-preview", slug);
  const { slicedConfig, manifest, narrative, variety } = buildColdOpenSlice(config, {
    seconds: args.seconds ? Number(args.seconds) : 20,
    fps: config?.meta?.fps || 30,
    includeClip: Boolean(args["with-clip"]),
  });

  if (!args["dry-run"]) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "config.cold-open.json"), JSON.stringify(slicedConfig, null, 2) + "\n");
    fs.writeFileSync(path.join(outDir, "stills-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  }

  const relMan = path.relative(ROOT, path.join(outDir, "stills-manifest.json")).replace(/\\/g, "/");
  console.log(`Cold-Open Preview: ${slug} (${manifest.seconds}s / ${manifest.previewFrames}f, ${slicedConfig.scenes.length} scenes, ${manifest.jobs.length} jobs)`);
  console.log(`  Narrative: ${narrative.ok ? "PASS" : "FAIL"} (${narrative.errors.length} errors, ${narrative.warnings.length} warnings)`);
  console.log(`  Variety:   ${Object.keys(variety.counts).length} mode(s)`);
  console.log(`  Next (cloud): node scripts/stills-cloud.js push --tag=cold-open-${slug} --manifest=${relMan}`);
}

module.exports = { buildColdOpenSlice };
