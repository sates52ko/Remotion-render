#!/usr/bin/env node
/**
 * measure-sameness.js — Triple visual-sameness benchmark for Antidote 2.0 pilot:
 * Compares `antidote-v2-pilot` rendered PNGs against:
 *   1. `real-antidote-channel` (16 frames from the 3 downloaded Antidote MP4s)
 *   2. `old-antidote` (cached rendered PNGs from wt-cinematic-pilot/audit/visual-sameness/vs-202611241000)
 *   3. `old-vox` (cached rendered PNGs from wt-cinematic-pilot/audit/visual-sameness/vs-202611241000)
 */
const fs = require("fs");
const path = require("path");
const VS = require("../lib/visual-sameness");

const ROOT = path.resolve(__dirname, "..", "..");
const PILOT_RAW = path.join(ROOT, "audit", "antidote-v2-pilot", "cloud-out", "raw");
const REAL_REF = path.join(ROOT, "audit", "antidote-v2-pilot", "ref-real-antidote");
const OLD_CACHE = path.resolve(ROOT, "..", "wt-cinematic-pilot", "audit", "visual-sameness", "vs-202611241000");

function loadDir(dir, prefixFilter = null) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".png") && (!prefixFilter || f.startsWith(prefixFilter)))
    .sort()
    .map((f) => VS.frameOf(fs.readFileSync(path.join(dir, f))));
}

const films = {
  "antidote-v2-pilot": loadDir(PILOT_RAW),
  "real-antidote-channel": loadDir(REAL_REF),
  "old-antidote-farsighted": loadDir(path.join(OLD_CACHE, "antidote", "stills", "raw"), "farsighted-"),
  "old-antidote-thinking": loadDir(path.join(OLD_CACHE, "antidote", "stills", "raw"), "thinking-in-systems-"),
  "old-vox-jane-eyre": loadDir(path.join(OLD_CACHE, "vox", "stills", "raw"), "old-jane-eyre-"),
  "old-vox-civil-action": loadDir(path.join(OLD_CACHE, "vox", "stills", "raw"), "old-a-civil-action-"),
};

for (const [k, v] of Object.entries(films)) {
  if (!v.length) delete films[k];
}

const res = VS.compareAll(films);
const outPath = path.join(ROOT, "audit", "antidote-v2-pilot", "visual-sameness.json");
fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(films).map(([k, v]) => [k, v.length])), ...res }, null, 2));

console.log("=== TRIPLE VISUAL-SAMENESS RESULTS (bar < 0.65) ===");
for (const p of res.pairs) {
  if (p.a === "antidote-v2-pilot" || p.b === "antidote-v2-pilot") {
    const other = p.a === "antidote-v2-pilot" ? p.b : p.a;
    console.log(`  antidote-v2-pilot  vs  ${other.padEnd(26)}  alike=${(p.alike * 100).toFixed(1)}%  (layout=${(p.layout * 100).toFixed(1)}%, palette=${(p.palette * 100).toFixed(1)}%)`);
  }
}
