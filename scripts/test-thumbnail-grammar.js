#!/usr/bin/env node
"use strict";
/**
 * test-thumbnail-grammar.js — guard against the thumbnail system collapsing
 * back into one template (the 2026-09-24 bug: every book cinematic-bleed,
 * white/yellow, text left).
 *
 *   node scripts/test-thumbnail-grammar.js
 *
 * Pure checks, no render, no file writes:
 *  1. Simulated feed over every unpublished book: consecutive A thumbnails
 *     never share the same effective design, and >1 layout is used.
 *  2. Variants: A is never a text-only poster; B/C differ from A and each other
 *     by >= MIN_VARIANT_GAP design units.
 *  3. The TS slug-hash default (thumbnail-shared.ts) is not a constant.
 *  4. No fixed channel colour: CinematicBleed must not reference CTR_YELLOW.
 *  5. thumbnail-grammar.js refuses a published book.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pickVariants, loadGrammarHistory, publishedSlugs, distance } = require("./lib/thumbnail-grammar");

const ROOT = path.join(__dirname, "..");
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
  if (!ok) failed++;
};

const published = new Set(publishedSlugs(ROOT));
const engineOf = (slug) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "books", slug, "book.json"), "utf8").replace(/^﻿/, "")).engine === "antidote" ? "antidote" : "vox";
  } catch {
    return null;
  }
};
const books = fs.readdirSync(path.join(ROOT, "books")).filter((s) => !published.has(s) && engineOf(s)).sort();

// 1) + 2)
const history = loadGrammarHistory(ROOT, "__none__").filter((h) => h.published);
const layouts = new Set();
let prev = null;
let sameNeighbour = 0;
let variantProblems = [];
for (const slug of books) {
  const engine = engineOf(slug);
  const vs = pickVariants({ slug, engine, history, n: 3 });
  const a = vs[0];
  layouts.add(a.layout);
  if (prev && distance(a, prev) === 0) sameNeighbour++;
  if (a.layout === "text-poster") variantProblems.push(`${slug}: A is a text-only poster`);
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++)
      if (distance(vs[i], vs[j]) < 5) variantProblems.push(`${slug}: variants ${"ABC"[i]}/${"ABC"[j]} too close`);
  history.push({ slug, published: false, grammar: a });
  prev = a;
}
check(sameNeighbour === 0, `simulated feed of ${books.length} books: no two neighbours share a design (${sameNeighbour} repeats)`);
check(layouts.size > 1, `feed uses ${layouts.size} layouts (${[...layouts].join(", ")})`);
check(!variantProblems.length, `variants: A has a picture, B/C are distinct${variantProblems.length ? " — " + variantProblems.slice(0, 3).join("; ") : ""}`);

// 3) TS default is not a constant (read the source: pickLayout must use defaultGrammar)
const shared = fs.readFileSync(path.join(ROOT, "src", "engines", "thumbnail-shared.ts"), "utf8");
const pickLayoutBody = (shared.match(/export function pickLayout[\s\S]*?\n}/) || [""])[0];
check(/defaultGrammar\(/.test(pickLayoutBody) && !/return "cinematic-bleed"/.test(pickLayoutBody), "pickLayout() rotates via defaultGrammar (not a hard-coded layout)");

// 4) no fixed channel colour in the bleed
const vox = fs.readFileSync(path.join(ROOT, "src", "engines", "vox", "thumbnail.tsx"), "utf8");
const bleed = (vox.match(/export const CinematicBleed[\s\S]*?\n};/) || [""])[0];
check(bleed && !/CTR_YELLOW/.test(bleed), "CinematicBleed takes its accent from the book palette (no CTR_YELLOW)");

// 5) published books are refused
const pub = [...published][0];
if (pub) {
  let refused = false;
  try {
    execFileSync(process.execPath, [path.join(__dirname, "thumbnail-grammar.js"), `--slug=${pub}`, "--write"], { cwd: ROOT, stdio: "pipe" });
  } catch {
    refused = true;
  }
  check(refused, `thumbnail-grammar.js --write refuses published book (${pub})`);
}

console.log(failed ? `\n✗ ${failed} check(s) failed` : "\n✓ thumbnail grammar OK");
process.exit(failed ? 1 : 0);
