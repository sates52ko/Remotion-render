#!/usr/bin/env node
/**
 * qa-stills-pixel.js — Post-render Pixel QA on cloud-rendered PNG stills.
 *
 * Usage:
 *   node scripts/qa-stills-pixel.js --dir=<stills-dir> [--polarity=dark|light] [--json]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { decode } = require("./lib/png-lite");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

if (!args.dir) {
  console.error("usage: node scripts/qa-stills-pixel.js --dir=<stills-dir> [--polarity=dark|light] [--json]");
  process.exit(2);
}

const baseDir = path.resolve(String(args.dir));
const rawDir = fs.existsSync(path.join(baseDir, "raw")) ? path.join(baseDir, "raw") : baseDir;
if (!fs.existsSync(rawDir)) {
  console.error(`Directory not found: ${rawDir}`);
  process.exit(2);
}

const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".png")).sort();
const errors = [];
const warnings = [];
const stats = [];

for (const f of files) {
  const buf = fs.readFileSync(path.join(rawDir, f));
  const { width, height, data: rgba } = decode(buf);
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  // Sample every 4th pixel for fast CPU-light QA
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const idx = (y * width + x) * 4;
      const luma = 0.2126 * rgba[idx] + 0.7152 * rgba[idx + 1] + 0.0722 * rgba[idx + 2];
      sum += luma;
      sumSq += luma * luma;
      count++;
    }
  }
  const mean = sum / Math.max(1, count);
  const variance = sumSq / Math.max(1, count) - mean * mean;
  const std = Math.sqrt(Math.max(0, variance));

  if (std < 6) {
    errors.push(`${f}: blank/solid frame detected (luma std=${std.toFixed(2)})`);
  }
  if (args.polarity === "dark" && mean > 170) {
    warnings.push(`${f}: expected dark polarity but mean luma=${mean.toFixed(1)}`);
  }
  if (args.polarity === "light" && mean < 85) {
    warnings.push(`${f}: expected light polarity but mean luma=${mean.toFixed(1)}`);
  }
  stats.push({ file: f, width, height, meanLuma: Number(mean.toFixed(1)), lumaStd: Number(std.toFixed(1)) });
}

const ok = errors.length === 0 && files.length > 0;
if (args.json) {
  console.log(JSON.stringify({ ok, checked: files.length, errors, warnings, stats }, null, 2));
} else {
  console.log(`Pixel QA: ${files.length} PNG(s) in ${rawDir} — ${ok ? "PASS" : "FAIL"}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
process.exit(ok ? 0 : 1);
