#!/usr/bin/env node
/**
 * suggest-engine.js — reads a book's VTT and RECOMMENDS which engine fits:
 *   Antidote  → character/story-driven narration (people, scenes, dialogue)
 *   Vox       → abstract/data-driven narration (numbers, stats, concepts)
 *
 * Now also wired into make-prompt.js automatically (VTT signal overrides genre
 * heuristic when strong/moderate). This CLI is still useful for quick checks.
 *
 * Usage: node scripts/suggest-engine.js --slug=<slug> [--vtt=path]
 */
const fs = require("fs");
const { abs } = require("./lib/paths");
const { analyzeEngineFromVtt } = require("./lib/vtt");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
if (!SLUG) { console.error("Usage: node scripts/suggest-engine.js --slug=<slug> [--vtt=path]"); process.exit(1); }
const VTT = args.vtt && fs.existsSync(args.vtt) ? args.vtt : abs.vtt(SLUG);
if (!fs.existsSync(VTT)) { console.error(`VTT not found: ${VTT}`); process.exit(1); }

const r = analyzeEngineFromVtt(fs.readFileSync(VTT, "utf8"));

console.log(`\n══ ENGINE SUGGESTION — ${SLUG} ══`);
console.log(`   words: ${r.words}`);
console.log(`   Antidote score: ${r.antidoteScore}   Vox score: ${r.voxScore}`);
console.log(`\n   ➜ RECOMMENDATION: ${r.pick.toUpperCase()}  (${r.confidence})`);
console.log(`\n   Bu sinyal make-prompt.js tarafından OTOMATIK kullanılır.`);
console.log(`   Manuel override: make-prompt.js --engine=${r.pick === "vox" ? "antidote" : "vox"} --engine-why="..."\n`);
