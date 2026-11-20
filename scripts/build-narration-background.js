#!/usr/bin/env node
/**
 * build-narration-background.js — what EVERY book of the channel says (data/narration-background.json).
 *
 *   node scripts/build-narration-background.js [--write]
 *
 * A book's own TERMS — "feedback loop", "one minute goals", "red behaviour" — are what its narration says again and
 * again and other books do not (lib/told-entities.js termsOf). "Other books" is this file: for every one-, two- and
 * three-word phrase of content words, in how many of the films kept in the repo it is said in three or more scenes.
 * Deterministic, no model; rebuilt by hand when the shelf has grown a lot (the terms of a book are judged against it).
 */
const fs = require("fs");
const path = require("path");
const { phrasesIn } = require("./lib/told-entities");

const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "data", "narration-background.json");
const df = new Map(); let books = 0;
for (const slug of fs.readdirSync(path.join(ROOT, "books")).sort()) {
  let config = null;
  for (const f of ["config.antidote.json", "config.vox.json"]) { try { config = JSON.parse(fs.readFileSync(path.join(ROOT, "books", slug, f), "utf8")); break; } catch {} }
  const scenes = ((config && config.scenes) || []).map((s) => s._narration || s.narration || "").filter(Boolean);
  if (scenes.length < 40) continue;
  books++;
  const count = new Map();
  for (const text of scenes) for (const p of new Set(phrasesIn(text))) count.set(p, (count.get(p) || 0) + 1);
  for (const [p, n] of count) if (n >= 3) df.set(p, (df.get(p) || 0) + 1);
}
const phrases = Object.fromEntries([...df].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
const data = { note: "phrase → in how many films it is said in 3+ scenes (built by scripts/build-narration-background.js; only phrases shared by 2+ films are kept)", books, phrases };
console.log(`${books} films · ${Object.keys(phrases).length} phrases shared by 2+ of them · most shared: ${Object.entries(phrases).slice(0, 12).map(([p, n]) => `${p} (${n})`).join(", ")}`);
if (process.argv.includes("--write")) { fs.writeFileSync(OUT, JSON.stringify(data) + "\n"); console.log(`✓ ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`); }
else console.log("(report only — add --write)");
