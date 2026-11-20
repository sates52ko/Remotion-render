#!/usr/bin/env node
/**
 * validate-risk-selector.js — P1.3 retro-validation (measured-only).
 *
 * Question: would the deterministic selector have SPENT the vision budget on
 * the frames that actually went WRONG? Runs the scorer over every judged run's
 * 30 frames (config + narration only, zero LLM/vision calls) and reports, for
 * each book, where the known wrong-majority frames rank in the top-K cut.
 *
 *   node scripts/validate-risk-selector.js [--k=5]     → printed table only
 *
 * This is a DIAGNOSTIC of the selector, not a gate and not a verdict.
 */
const fs = require("fs");
const path = require("path");
const { makeScorer, selectFrames } = require("./lib/risk-selector");

const ROOT = path.join(__dirname, "..");
const MUTE = path.join(ROOT, "audit", "mute");
const K = Math.max(1, parseInt((process.argv.find((a) => a.startsWith("--k=")) || "--k=5").split("=")[1], 10));
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const cmap = readJSON(path.join(ROOT, "data", "visual-capability.json"));
if (!cmap) { console.error("❌ data/visual-capability.json missing — run scripts/build-capability-map.js first"); process.exit(1); }
const scoreScene = makeScorer(cmap);

const narrationAt = (cfg, f) => ((cfg.captions || []).filter((k) => k.endFrame >= f - 150 && k.startFrame <= f + 150).map((k) => k.text).join(" "));
const sceneOf = (cfg, f) => ((cfg.scenes || []).find((s) => f >= s.fromFrame && f < s.fromFrame + s.durationFrames)) || null;

console.log(`── risk-selector retro-validation · top-${K} of 30 (deterministic, zero vision calls)\n`);
let totHits = 0, totWrong = 0, totBooks = 0;
for (const slug of fs.readdirSync(MUTE)) {
  const cfgP1 = path.join(ROOT, "books", slug, "config.antidote.json");
  const cfg = readJSON(cfgP1) || readJSON(path.join(ROOT, "books", slug, "config.vox.json"));
  for (const label of fs.readdirSync(path.join(MUTE, slug))) {
    const run = path.join(MUTE, slug, label);
    const key = readJSON(path.join(run, "key.json"));
    const rel = readJSON(path.join(run, "reliability", "reliability.json"), null);
    if (!key || !rel) continue;
    const wrongImgs = (rel.frames || []).filter((r) => r.majority.correctness === "WRONG").map((r) => r.img);
    const frames = Object.entries(key).map(([img, render]) => {
      const frame = +(String(render).match(/-f(\d+)\.png/) || [])[1];
      return { img, frame, scene: sceneOf(cfg, frame), narration: narrationAt(cfg, frame) };
    }).filter((f) => f.scene);
    if (!frames.length) continue;
    const { selected } = selectFrames(frames, K, scoreScene);
    const topSet = new Set(selected.map((s) => s.img));
    const hits = wrongImgs.filter((i) => topSet.has(i)).length;
    const rank = {};
    for (const w of wrongImgs) rank[w] = 1 + selected.findIndex((s) => s.img === w) || selected.length + (frames.map((f) => f.img).indexOf(w) >= 0 ? 0 : 0) || null;
    // full-rank position (1-based over all 30)
    const { ranked } = selectFrames(frames, frames.length, scoreScene);
    const fullRank = Object.fromEntries(wrongImgs.map((w) => [w, 1 + ranked.findIndex((r) => r.img === w)]));
    console.log(`${slug}/${label}: wrong-majority ${wrongImgs.length ? wrongImgs.join(", ") : "none"} → top-${K} hit ${hits}/${wrongImgs.length}${wrongImgs.length ? `  (full ranks: ${wrongImgs.map((w) => `${w}#${fullRank[w]}`).join(", ")})` : ""}`);
    totHits += hits; totWrong += wrongImgs.length; totBooks++;
  }
}
console.log(`\n  total: top-${K} captured ${totHits}/${totWrong} wrong-majority frames across ${totBooks} run(s) (${totWrong ? Math.round((totHits / totWrong) * 100) : 0}%)`);
console.log(`  baseline (random ${K}/30): ${Math.round((K / 30) * 100)}% — measured-only diagnostic, never a gate`);
