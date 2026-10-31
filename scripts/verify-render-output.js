#!/usr/bin/env node
/**
 * Technical fact for a finished render: out/<slug>.mp4 (or .preview.mp4 with --preview) exists, its frame count
 * matches the book's config within tolerance, and the whole video decodes. The result is appended to
 * books/<slug>/render-facts.json. It says nothing about quality — that is the firewall's fact.
 *
 * Usage: node scripts/verify-render-output.js --slug=<slug> [--preview] [--file=<path>]
 * Exit 1 when the file is missing, frames are off, or decode fails.
 */
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.slice(2), true]; }));
if (!args.slug) { console.error("Usage: node scripts/verify-render-output.js --slug=<slug> [--preview] [--file=<path>]"); process.exit(1); }
const pre = require("./lib/render-preflight");
const file = args.file ? path.resolve(ROOT, args.file) : path.join(ROOT, "out", `${args.slug}${args.preview ? ".preview" : ""}.mp4`);
const expectedFrames = pre.expectedFramesFor(ROOT, args.slug);
const result = pre.verifyRenderOutput({ file, expectedFrames });
pre.appendFacts(ROOT, args.slug, { kind: "technical", technical: result.status, file: path.relative(ROOT, file), frames: result.frames, expectedFrames, decodes: result.decodes, problems: result.problems });
console.log(`technical ${result.status}: ${path.relative(ROOT, file)} frames=${result.frames} expected=${expectedFrames} decodes=${result.decodes}`);
for (const p of result.problems) console.log(`  - ${p}`);
process.exit(result.status === "VERIFIED" ? 0 : 1);
