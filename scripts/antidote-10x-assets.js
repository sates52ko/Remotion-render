#!/usr/bin/env node
/**
 * antidote-10x-assets.js — Full-book Flux + 2x2 cutout asset generator within budget.
 *
 * Usage:
 *   node scripts/antidote-10x-assets.js --slug=<slug> [--max-calls=45] [--dry-run]
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const SLUG = args.slug;
if (!SLUG) {
  console.error("Usage: node scripts/antidote-10x-assets.js --slug=<slug> [--max-calls=45] [--dry-run]");
  process.exit(1);
}

const maxCalls = Number(args["max-calls"] || 45);
const promptsFile = path.join(ROOT, "books", SLUG, "prompts.10x.json");
if (!fs.existsSync(promptsFile)) {
  console.error(`✗ Missing ${path.relative(ROOT, promptsFile)}`);
  process.exit(1);
}

const P = JSON.parse(fs.readFileSync(promptsFile, "utf8"));
const scenes = Array.isArray(P.scenes) ? P.scenes : [];
console.log(`Book ${SLUG}: ${scenes.length} asset(s) declared (budget max-calls=${maxCalls})`);
if (scenes.length > maxCalls) {
  console.error(`✗ Asset count ${scenes.length} exceeds --max-calls=${maxCalls}`);
  process.exit(1);
}
if (args["dry-run"]) {
  for (const s of scenes) console.log(`  - ${s.id} (${s.mode || "scene"}${s.cutout ? ", cutout" : ""})`);
  process.exit(0);
}

const sheetOut = path.join(ROOT, "books", SLUG, "assets-10x-sheet.png");
const res = spawnSync(
  "python",
  [path.join(ROOT, "scripts", "antidote-v2-pilot", "generate-assets.py"), `--prompts=${promptsFile}`, `--sheet=${sheetOut}`],
  { cwd: ROOT, stdio: "inherit" }
);
process.exit(res.status || 0);
