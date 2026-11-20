#!/usr/bin/env node
"use strict";
/**
 * thumbnail-grammar.js — pick (and optionally write) a book's thumbnail grammar.
 *
 *   node scripts/thumbnail-grammar.js --slug=<slug>            # dry: print pick + channel history
 *   node scripts/thumbnail-grammar.js --slug=<slug> --write    # store in youtube-meta.json → thumbnail.grammar
 *                                                              #   + thumbnail.variants (A/B/C for YouTube Test & Compare)
 *   node scripts/thumbnail-grammar.js --slug=<slug> --write --force   # also re-pick an existing grammar
 *
 * Deterministic, no LLM. Published books (PUBLISHED_BOOKS.md) are frozen and
 * refused. An authored grammar is kept unless --force. See lib/thumbnail-grammar.js.
 */
const fs = require("fs");
const path = require("path");
const { pickVariants, loadGrammarHistory, publishedSlugs } = require("./lib/thumbnail-grammar");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const SLUG = args.slug;
if (!SLUG) {
  console.error("Usage: node scripts/thumbnail-grammar.js --slug=<slug> [--write] [--force]");
  process.exit(1);
}
if (publishedSlugs(ROOT).includes(SLUG)) {
  console.error(`✗ ${SLUG} is in PUBLISHED_BOOKS.md — frozen, its thumbnail already shipped.`);
  process.exit(args.write ? 1 : 0);
}

const bookJson = path.join(ROOT, "books", SLUG, "book.json");
const engine = fs.existsSync(bookJson) && JSON.parse(fs.readFileSync(bookJson, "utf8").replace(/^﻿/, "")).engine === "antidote" ? "antidote" : "vox";
const history = loadGrammarHistory(ROOT, SLUG);
const variants = pickVariants({ slug: SLUG, engine, history, n: Number(args.variants || 3) });
const pick = variants[0];

console.log(`Thumbnail grammar — ${SLUG} (${engine})`);
console.log("  recent channel:");
for (const h of history.slice(-8)) {
  const g = h.grammar;
  console.log(`   ${h.published ? "●" : "○"} ${h.slug.padEnd(34)} ${g.layout.padEnd(15)} ${String(g.textPos).padEnd(6)} ${String(g.type).padEnd(9)} ${String(g.treatment).padEnd(7)} ${g.accent}`);
}
const fmt = (g) => `${g.layout} / ${g.textPos} / ${g.type} / ${g.treatment} / ${g.accent}${g.sceneRank != null ? ` / scene#${g.sceneRank}` : ""}`;
variants.forEach((g, i) => console.log(`  ${i ? "  variant " + "ABC"[i] : "→ pick (A)"}: ${fmt(g)}`));

if (!args.write) process.exit(0);

const metaFile = path.join(ROOT, "books", SLUG, "youtube-meta.json");
const cfgFile = path.join(ROOT, "books", SLUG, "config.antidote.json");
const target = fs.existsSync(metaFile) ? metaFile : engine === "antidote" && fs.existsSync(cfgFile) ? cfgFile : null;
if (!target) {
  console.error("✗ no youtube-meta.json (or Antidote config) to write into — run the meta step first.");
  process.exit(1);
}
const raw = fs.readFileSync(target, "utf8").replace(/^﻿/, "");
const doc = JSON.parse(raw);
const thumb = target === metaFile ? (doc.thumbnail = doc.thumbnail || {}) : ((doc.meta.thumbnail = doc.meta.thumbnail || {}));
if (thumb.grammar && thumb.grammar.layout && !args.force) {
  console.log(`  = kept authored grammar (${thumb.grammar.layout}); --force to re-pick.`);
  process.exit(0);
}
const sceneId = thumb.grammar && thumb.grammar.sceneId;
thumb.grammar = { ...pick, ...(sceneId ? { sceneId } : {}) };
// Variants B/C for YouTube Studio "Test & Compare" (rendered by render-thumbnails.js).
thumb.variants = variants.map((g, i) => (i === 0 ? thumb.grammar : g));
fs.writeFileSync(target, JSON.stringify(doc, null, 2) + "\n");
console.log(`  ✓ wrote thumbnail.grammar → ${path.relative(ROOT, target)}`);
