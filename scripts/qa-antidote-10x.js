#!/usr/bin/env node
/**
 * qa-antidote-10x.js — Pre-render P2 Automated QA CLI for Antidote 10x configs.
 *
 * Usage:
 *   node scripts/qa-antidote-10x.js --slug=<slug> [--asset-root=<dir>] [--json]
 *   node scripts/qa-antidote-10x.js --config=<path> [--asset-root=<dir>] [--json]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { analyzeVariety, assertVariety } = require("./lib/v2-variety-lint");
const { analyzeNarrative } = require("./lib/v2-narrative-lint");

const ROOT = path.resolve(__dirname, "..");
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
  console.error("usage: node scripts/qa-antidote-10x.js (--slug=<slug> | --config=<path>) [--asset-root=<dir>] [--json]");
  process.exit(2);
}

const config = JSON.parse(fs.readFileSync(cfgPath, "utf8").replace(/^\uFEFF/, ""));
const assetRoot = args["asset-root"] ? path.resolve(String(args["asset-root"])) : path.join(ROOT, "public");

let varietyOk = true;
let varietyError = null;
const variety = analyzeVariety(config);
try {
  assertVariety(config);
} catch (e) {
  varietyOk = false;
  varietyError = e.message;
}

const narrative = analyzeNarrative(config, { assetRoot: fs.existsSync(assetRoot) ? assetRoot : null });
const ok = varietyOk && narrative.ok;

const report = {
  ok,
  config: path.relative(ROOT, cfgPath).replace(/\\/g, "/"),
  scenes: variety.total,
  modes: variety.counts,
  varietyOk,
  varietyError,
  narrative,
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`QA Antidote 10x: ${report.config} (${variety.total} scenes)`);
  console.log(`  Variety:   ${varietyOk ? "PASS" : "FAIL"} (${Object.keys(variety.counts).length} distinct modes, maxConsecutive=${variety.maxConsecutive})`);
  if (!varietyOk) console.log(`    ✗ ${varietyError}`);
  console.log(`  Narrative: ${narrative.ok ? "PASS" : "FAIL"} (${narrative.errors.length} errors, ${narrative.warnings.length} warnings)`);
  for (const e of narrative.errors) console.log(`    ✗ ${e}`);
  for (const w of narrative.warnings.slice(0, 10)) console.log(`    ! ${w}`);
}

process.exit(ok ? 0 : 1);
