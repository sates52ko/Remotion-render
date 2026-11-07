#!/usr/bin/env node
/**
 * normalize-entities.js — P3.3 APPLY: rewrite ASR-mangled entity names in the
 * audio spine and cast registry. Measure first: scripts/audit-coherence.mjs.
 *
 * SHARED DECISIONS: entity-core (canonicals from book.json + story-bible cast
 * names, seeded one-hop graph, per-occurrence case gates). The context
 * construction below MUST stay byte-identical to buildEntityContext() in
 * scripts/audit-coherence.mjs — same inputs → same association → what the
 * audit counted is exactly what gets fixed (zero drift).
 *
 * Targets (inside books/<slug>/ + public/captions/):
 *   config.antidote.json — scenes._narration, texts[].text, diagram.title,
 *     diagram.labels, narrativeAtom.{text,subject,object,relationship}, and
 *     the cast registry: meta.cast phantom keys merged to their canonical
 *     key, characters[].identity/role rewritten (exact-value walk — prose is
 *     never exactly equal to a key, so prose is never touched by the walk).
 *   public/captions/<slug>.clean.vtt and .vtt — word-level transform; cue
 *     numbers/timestamps contain no [A-Za-z] runs and survive untouched.
 *
 * Generic — never `if (slug === …)`. Idempotent (2nd run = 0 changes).
 * Backs up each file before its first write: *.bak-p33-<ISO>.
 *
 * Usage: node scripts/normalize-entities.js --slug=verity [--dry]
 *        node scripts/normalize-entities.js --all [--dry]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { canonicalTokens, transformWords, buildAssociation, decideReplacement, applyStyle } = require("./lib/entity-core.js");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const slugArg = (args.find((a) => a.startsWith("--slug=")) || "").slice(7);
const ALL = args.includes("--all");
const DRY = args.includes("--dry");

if (!slugArg && !ALL) {
  console.error("usage: node scripts/normalize-entities.js --slug=<slug>|--all [--dry]");
  process.exit(2);
}

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};

function parseVtt(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n\r?\n/)
    .map((b) => b.split(/\r?\n/).filter((l) => l.trim()))
    .filter((lines) => lines.length >= 2 && lines[1].includes("-->"))
    .map((lines) => lines.slice(2).join(" "));
}

/** MUST match buildEntityContext() in scripts/audit-coherence.mjs. */
function buildContext(cfg, slug) {
  const book = readJson(path.join(ROOT, "books", slug, "book.json")) || {};
  const bible = readJson(path.join(ROOT, "books", slug, "story-bible.json")) || {};
  const castNames = Object.values(bible.cast || {}).map((c) => String((c || {}).name || ""));
  const canonicals = canonicalTokens({
    title: book.title || (cfg.meta && cfg.meta.title) || slug,
    author: book.author || (cfg.meta && cfg.meta.author) || "",
    castNames,
  });
  const narration = (cfg.scenes || []).map((s) => s._narration || "").join("\n");
  const texts = (cfg.scenes || [])
    .flatMap((s) => (s.texts || []).map((t) => String(t.text || "")))
    .join("\n");
  const diagramLabels = (cfg.scenes || [])
    .flatMap((s) => (s.diagram ? [String(s.diagram.title || ""), ...(s.diagram.labels || []).map(String)] : []))
    .join("\n");
  // Every string leaf that contains whitespace is prose under the SAME rule
  // audit counts (deep walk) — per-field lists drift silently the next time
  // anyone adds a prose field (observed: _subject and narrativeRelation kept
  // 500+ variants after a field-targeted pass).
  const prose = [];
  (function collectProse(node) {
    if (typeof node === "string") {
      // whitespace OR apostrophe: no-space possessives like "Varity's" are
      // name slots only the tokenizer can split (14 residual hits)
      if (/[\s'’]/.test(node)) prose.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const v of node) collectProse(v);
      return;
    }
    if (node && typeof node === "object") for (const v of Object.values(node)) collectProse(v);
  })(cfg);
  const configBlob = prose.join("\n");
  const cleanVtt = path.join(ROOT, "public", "captions", `${slug}.clean.vtt`);
  const rawVtt = path.join(ROOT, "public", "captions", `${slug}.vtt`);
  const primaryVtt = fs.existsSync(cleanVtt) ? cleanVtt : rawVtt;
  const captionText = parseVtt(primaryVtt).join("\n");
  const extraNodes = [
    ...Object.keys((cfg.meta && cfg.meta.cast) || {}),
    ...Object.keys(bible.cast || {}),
  ];
  const assoc = buildAssociation({ texts: [configBlob, captionText], extraNodes, canonicals });
  return { canonicals, assoc, cleanVtt, rawVtt };
}

function makeApplier(assoc, tally) {
  return (raw, initial) => {
    const hit = decideReplacement(raw, initial, assoc);
    if (!hit) return null;
    const key = `${raw.toLowerCase()} -> ${hit.canonical}`;
    tally[key] = (tally[key] || 0) + 1;
    return applyStyle(hit.canonical, hit.style);
  };
}

function backup(file) {
  const bak = `${file}.bak-p33-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(file, bak);
  return bak;
}

/**
 * Whole-value/key walk: rename phantom cast keys and any string field whose
 * WHOLE value equals a phantom key — case-INSENSITIVELY (identity:"varity",
 * name:"Varity", allowedCharacters:["VARITY"]). A whole string field is never
 * prose (prose lives inside longer strings), so leaf equality is unambiguous;
 * replacement preserves the original case style.
 */
function ciRemap(value, remap) {
  if (typeof value !== "string" || !value) return null;
  if (remap.has(value)) return remap.get(value);
  const low = value.toLowerCase();
  return remap.has(low) ? remap.get(low) : null;
}

function restyle(value, to) {
  if (value.length > 1 && value === value.toUpperCase()) return to.toUpperCase();
  if (/^[A-Z]/.test(value)) return to.charAt(0).toUpperCase() + to.slice(1).toLowerCase();
  return to;
}

function remapExact(node, remap, tally) {
  let hits = 0;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === "string" && ciRemap(node[i], remap)) {
        // string-array element (allowedCharacters[], visualEvidence.subjects[])
        // — the same remap as an object property, or these lists keep pointing
        // at a cast key that no longer exists after the merge
        const to = restyle(node[i], ciRemap(node[i], remap));
        const label = `value ${node[i]} -> ${to}`;
        tally[label] = (tally[label] || 0) + 1;
        node[i] = to;
        hits++;
      } else {
        hits += remapExact(node[i], remap, tally);
      }
    }
    return hits;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (remap.has(k)) {
        const to = remap.get(k);
        if (!(to in node)) {
          node[to] = node[k];
          delete node[k];
        } else {
          delete node[k]; // both exist — keep the target's definition
        }
        const label = `cast-key ${k} -> ${to}`;
        tally[label] = (tally[label] || 0) + 1;
        hits++;
        hits += remapExact(node[to], remap, tally);
      } else if (typeof node[k] === "string" && ciRemap(node[k], remap)) {
        const to = restyle(node[k], ciRemap(node[k], remap));
        const label = `value ${node[k]} -> ${to}`;
        tally[label] = (tally[label] || 0) + 1;
        node[k] = to;
        hits++;
      } else {
        hits += remapExact(node[k], remap, tally);
      }
    }
    return hits;
  }
  return hits;
}

function normalizeBook(slug) {
  const configPath = path.join(ROOT, "books", slug, "config.antidote.json");
  if (!fs.existsSync(configPath)) {
    console.log(`${slug}: no config — skipped`);
    return 0;
  }
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const ctx = buildContext(cfg, slug);
  const tally = {};
  const apply = makeApplier(ctx.assoc, tally);
  let changed = 0;

  const wordPass = (str) => {
    const r = transformWords(str, apply);
    changed += r.changes.length;
    return r.text;
  };

  // Deep prose pass: every string leaf containing whitespace goes through the
  // same wordPass — narration, texts, diagram labels/titles, _subject phrases,
  // narrativeRelation sentences, director.composition/blocking directives,
  // promise questions, caption text… Field-by-field lists silently miss the
  // next prose field anyone adds (observed: _subject/narrativeRelation kept
  // 500+ variants after a field-targeted pass).
  (function proseWalk(node) {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (typeof node[i] === "string") {
          if (/[\s'’]/.test(node[i])) node[i] = wordPass(node[i]);
        } else proseWalk(node[i]);
      }
      return;
    }
    if (node && typeof node === "object") {
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === "string") {
          if (/[\s'’]/.test(v)) node[k] = wordPass(v);
        } else proseWalk(v);
      }
    }
  })(cfg);

  // karaoke caption words: single tokens (no whitespace) — the deep pass above
  // skips them, and CaptionLayer renders .w directly (CaptionLayer.tsx:22).
  // Sentence-start rule mirrors the text walk: first entry or previous ends [.!?].
  for (const cap of cfg.captions || []) {
    if (Array.isArray(cap.words)) {
      cap.words.forEach((entry, i) => {
        const raw = String(entry.w ?? "");
        if (!raw) return;
        const prev = String((cap.words[i - 1] || {}).w ?? "");
        const initial = i === 0 || /[.!?]\s*$/.test(prev);
        // first alpha run: "Varity's" must decide on "Varity" — the
        // apostrophe made a whole-entry lookup miss every possessive (25 of
        // the70 residual hits). "isn't"→"isn" misses the graph harmlessly.
        const clean = raw.split(/[^A-Za-z]+/).filter(Boolean)[0] || "";
        if (!clean) return;
        const hit = decideReplacement(clean, initial, ctx.assoc);
        if (!hit) return;
        entry.w = raw.replace(clean, applyStyle(hit.canonical, hit.style));
        const label = `word ${clean.toLowerCase()} -> ${hit.canonical}`;
        tally[label] = (tally[label] || 0) + 1;
        changed++;
      });
    }
  }

  // cast registry: phantom keys → canonical (meta.cast + identity/role values)
  const remap = new Map();
  for (const k of Object.keys((cfg.meta && cfg.meta.cast) || {})) {
    const lower = k.toLowerCase();
    if (ctx.canonicals.includes(lower)) continue;
    const t = ctx.assoc.get(lower);
    if (t && t.canonical !== lower) remap.set(k, t.canonical);
  }
  if (remap.size) changed += remapExact(cfg, remap, tally);

  // captions (clean + raw): whole-file word transform
  let vttFiles = 0;
  for (const f of [ctx.cleanVtt, ctx.rawVtt]) {
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    const out = transformWords(src, apply);
    if (out.text !== src) {
      vttFiles++;
      if (!DRY) {
        backup(f);
        fs.writeFileSync(f, out.text, "utf8");
      }
    }
  }

  if (changed === 0) {
    console.log(`${slug}: already normalized (0 changes)`);
    return 0;
  }
  if (DRY) {
    console.log(`${slug}: DRY — ${changed} change(s):`);
    for (const [k, v] of Object.entries(tally)) console.log(`   ${k} x${v}`);
    return changed;
  }
  // formatting guard: only rewrite when a pretty-print round-trip is
  // byte-identical, otherwise a4 MB config would show a full-file diff
  const original = fs.readFileSync(configPath, "utf8");
  const roundTrip = JSON.stringify(cfg, null, 2) + "\n";
  if (JSON.stringify(JSON.parse(original), null, 2) + "\n" !== original) {
    console.error(`${slug}: config formatting is NOT pretty-round-trip safe — aborting config write (caption edits above still apply).`);
    return changed;
  }
  backup(configPath);
  fs.writeFileSync(configPath, roundTrip, "utf8");
  console.log(`${slug}: ${changed} change(s) -> config + ${vttFiles} vtt file(s)`);
  for (const [k, v] of Object.entries(tally)) console.log(`   ${k} x${v}`);
  return changed;
}

const booksDir = path.join(ROOT, "books");
const slugs = fs
  .readdirSync(booksDir)
  .filter((d) => ALL || d === slugArg)
  .filter((d) => fs.existsSync(path.join(booksDir, d, "config.antidote.json")));

let total = 0;
for (const slug of slugs) total += normalizeBook(slug);
console.log(`\ntotal: ${total} change(s) across ${slugs.length} book(s)${DRY ? " [DRY]" : ""}`);
