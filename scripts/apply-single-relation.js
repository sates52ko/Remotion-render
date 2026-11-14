#!/usr/bin/env node
/**
 * apply-single-relation.js — put authored single-relation contracts (capability, cycle 13, default OFF) into a book's
 * Antidote config. Nothing else in the pipeline writes `singleRelation`, so a book without this step is unchanged.
 *
 *   node scripts/apply-single-relation.js --config=books/<slug>/config.antidote.json --contracts=<dir> [--write]
 *
 * <dir>/<sceneIndex>.json = one "single-relation/1" contract per chosen beat (the file name is the scene index).
 * Every contract is validated against ITS scene's narration (the captions inside that scene's frames); one invalid
 * contract refuses the whole apply (nothing written). With --write the compiled scenes replace those scenes and
 * meta.singleRelation is set true; without it, a dry run that prints what would change.
 * Refused for a published (frozen) book: PUBLISHED_BOOKS.md is checked by slug.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const R = require("./lib/single-relation");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));

/** the words spoken during a scene: every caption that overlaps the scene's frames */
function narrationOf(config, scene) {
  const a = scene.fromFrame, b = scene.fromFrame + scene.durationFrames;
  return (config.captions || []).filter((c) => (c.endFrame ?? c.toFrame ?? c.end ?? 0) > a && (c.startFrame ?? c.fromFrame ?? c.start ?? 0) < b).map((c) => c.text).join(" ");
}

/** the narrator's words inside a scene, in SCENE frames (the anchors of word-timed events, cycle 18) */
function wordsOf(config, scene) {
  const a = scene.fromFrame, b = scene.fromFrame + scene.durationFrames;
  return (config.captions || []).flatMap((c) => c.words || []).filter((w) => w && w.s >= a && w.s < b).map((w) => ({ w: w.w, s: w.s - a }));
}

function apply(config, contracts, { published = false } = {}) {
  if (published) return { ok: false, errors: [`${config.meta.slug} is a published (frozen) book — no change`] };
  const cast = (config.meta && config.meta.cast) || {};
  const ctx0 = { cast: Object.keys(cast), castNames: Object.entries(cast).flatMap(([k, v]) => [k, (v && v.name) || ""]).filter(Boolean), castLabels: Object.fromEntries(Object.entries(cast).map(([k, v]) => [k, (v && v.name) || k])) };
  const errors = [], scenes = config.scenes.slice();
  for (const [idx, c] of Object.entries(contracts)) {
    const i = Number(idx), sc = config.scenes[i];
    if (!Number.isInteger(i) || !sc) { errors.push(`scene ${idx}: no such scene`); continue; }
    const narration = narrationOf(config, sc);
    const e = R.validate(c, { ...ctx0, narration });
    if (e.length) { errors.push(...e.map((m) => `scene ${i}: ${m}`)); continue; }
    scenes[i] = R.compile(c, sc, { words: wordsOf(config, sc) });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: R.enable({ ...config, scenes }), changed: Object.keys(contracts).map(Number) };
}

if (require.main === module) {
  if (!args.config || !args.contracts) { console.error("usage: apply-single-relation.js --config=<config.antidote.json> --contracts=<dir> [--write]"); process.exit(2); }
  const cfgPath = path.resolve(args.config);
  const config = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const dir = path.resolve(args.contracts);
  const contracts = Object.fromEntries(fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => [f.replace(".json", ""), JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))]));
  let published = false;
  try { published = new RegExp(`\\b${(config.meta.slug || "").replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`).test(fs.readFileSync(path.join(ROOT, "PUBLISHED_BOOKS.md"), "utf8")); } catch { /* no register */ }
  const r = apply(config, contracts, { published });
  if (!r.ok) { console.error(`✗ refused (nothing written):\n  ${r.errors.join("\n  ")}`); process.exit(1); }
  console.log(`${args.write ? "✓ applied" : "dry run"}: ${r.changed.length} scene(s) ${r.changed.join(", ")} → single-relation; meta.singleRelation = true`);
  if (args.write) fs.writeFileSync(cfgPath, JSON.stringify(r.config, null, 2));
}

module.exports = { apply, narrationOf, wordsOf };
