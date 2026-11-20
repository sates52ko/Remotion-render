"use strict";
/**
 * thumbnail-grammar.js — channel-aware, deterministic thumbnail variety.
 *
 * A thumbnail is a point in a small design space (layout × text side × type
 * voice × photo grade × accent key — see ThumbGrammar in
 * src/engines/thumbnail-shared.ts). This picks, for a new book, the point
 * FARTHEST from what the channel shipped most recently, so two neighbouring
 * videos in the browse feed never share a template. No LLM, no extra Flux
 * image: every axis is CSS. Ties break on the slug hash, so a re-run gives the
 * same answer.
 *
 * History order: PUBLISHED_BOOKS.md (by published date), then unpublished books
 * that already have a grammar (by meta mtime). A published book without a
 * grammar is read as what it actually shipped: cinematic-bleed / left / block /
 * colour / fixed yellow.
 */
const fs = require("fs");
const path = require("path");

// Keep in sync with AUTO_LAYOUTS / AUTO_TREATMENTS in thumbnail-shared.ts.
const AUTO_LAYOUTS = {
  vox: ["cinematic-bleed", "split-face", "full-bleed", "portrait-right"],
  antidote: ["scene-still", "text-poster"],
};
const TEXT_POSITIONS = ["left", "right", "bottom"];
const TYPE_STYLES = ["block", "editorial", "label"];
const TREATMENTS = { vox: ["color", "duotone", "mono"], antidote: ["color"] };
const ACCENT_KEYS = ["red", "gold"];

// Which axes a layout actually renders (others are inert → not compared).
const USES = {
  "cinematic-bleed": { textPos: true, type: true, treatment: true, accent: true },
  "scene-still": { textPos: true, type: true, treatment: false, accent: true },
};
const WEIGHT = { layout: 3, textPos: 2, type: 2, treatment: 1, accent: 1 };
// Text-only posters and hand-me-down layouts are weaker at browse size:
// allowed, but only when they buy real distance.
const LAYOUT_PENALTY = { "text-poster": 3, "portrait-right": 0.5 };
const RECENT = 8;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const effective = (g) => {
  const u = USES[g.layout] || {};
  return {
    layout: g.layout,
    textPos: u.textPos ? g.textPos : "-",
    type: u.type ? g.type : "-",
    treatment: u.treatment ? g.treatment : "-",
    accent: u.accent ? g.accent : "-",
  };
};

function distance(a, b) {
  const ea = effective(a);
  const eb = effective(b);
  let d = 0;
  for (const k of Object.keys(WEIGHT)) if (ea[k] !== eb[k]) d += WEIGHT[k];
  return d;
}

function publishedSlugs(root) {
  const file = path.join(root, "PUBLISHED_BOOKS.md");
  if (!fs.existsSync(file)) return [];
  const rows = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|[^|]*\|\s*(\d{4}-\d{2}-\d{2})/);
    if (m) rows.push({ slug: m[1], date: m[2] });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date)).map((r) => r.slug);
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
};

const SHIPPED_DEFAULT = { layout: "cinematic-bleed", textPos: "left", type: "block", treatment: "color", accent: "fixed" };

function grammarOf(root, slug) {
  const meta = readJson(path.join(root, "books", slug, "youtube-meta.json"));
  const cfg = readJson(path.join(root, "books", slug, "config.antidote.json"));
  const t = (meta && meta.thumbnail) || (cfg && cfg.meta && cfg.meta.thumbnail) || null;
  if (!t) return null;
  if (t.grammar && t.grammar.layout) return { ...SHIPPED_DEFAULT, ...t.grammar };
  return { ...SHIPPED_DEFAULT, layout: t.layout || SHIPPED_DEFAULT.layout };
}

/** Channel history, oldest → newest, excluding `excludeSlug`. */
function loadGrammarHistory(root, excludeSlug) {
  const published = publishedSlugs(root).filter((s) => s !== excludeSlug);
  // A published book whose folder was cleaned up still occupies a slot in the feed.
  const out = published.map((slug) => ({ slug, published: true, grammar: grammarOf(root, slug) || { ...SHIPPED_DEFAULT } }));
  const booksDir = path.join(root, "books");
  const pending = fs.existsSync(booksDir)
    ? fs.readdirSync(booksDir).filter((s) => s !== excludeSlug && !published.includes(s))
    : [];
  const withGrammar = pending
    .map((slug) => {
      const metaFile = path.join(booksDir, slug, "youtube-meta.json");
      const meta = readJson(metaFile);
      const g = meta && meta.thumbnail && meta.thumbnail.grammar;
      return g && g.layout ? { slug, published: false, grammar: grammarOf(root, slug), mtime: fs.statSync(metaFile).mtimeMs } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.mtime - b.mtime);
  return [...out, ...withGrammar];
}

function candidates(engine) {
  const out = [];
  for (const layout of AUTO_LAYOUTS[engine])
    for (const textPos of TEXT_POSITIONS)
      for (const type of TYPE_STYLES)
        for (const treatment of TREATMENTS[engine])
          for (const accent of ACCENT_KEYS) out.push({ layout, textPos, type, treatment, accent });
  return out;
}

/**
 * Pick the grammar for `slug`. Score = recency-weighted distance to the last
 * RECENT thumbnails + a strong bonus for differing from the very latest three
 * (the ones that sit next to it in "latest videos"), minus layout penalties.
 */
function channelScore(c, recent) {
  const last3 = recent.slice(-3);
  let score = 0;
  recent.forEach((h, i) => {
    const age = recent.length - i; // 1 = newest
    score += distance(c, h) / age;
  });
  if (last3.length) score += 1.5 * Math.min(...last3.map((h) => distance(c, h)));
  return score - (LAYOUT_PENALTY[c.layout] || 0);
}

const tieOf = (slug, c) => hashStr(`${slug}:${c.layout}:${c.textPos}:${c.type}:${c.treatment}:${c.accent}`);

function best(cands, slug, scoreFn) {
  let top = null;
  for (const c of cands) {
    const score = scoreFn(c);
    const tie = tieOf(slug, c);
    if (!top || score > top.score + 1e-9 || (Math.abs(score - top.score) < 1e-9 && tie > top.tie)) top = { g: c, score, tie };
  }
  return top;
}

// The MAIN thumbnail always carries a picture; a text-only poster is a fine
// Test & Compare challenger but a weak default at browse size.
const mainOk = (c) => c.layout !== "text-poster";

function pickGrammar({ slug, engine, history }) {
  const recent = history.slice(-RECENT).map((h) => h.grammar);
  const top = best(candidates(engine).filter(mainOk), slug, (c) => channelScore(c, recent));
  return { ...top.g, _score: Math.round(top.score * 100) / 100 };
}

// A Test & Compare variant must be a genuinely different card, not a recolour:
// at least this far (WEIGHT units) from every variant already chosen.
const MIN_VARIANT_GAP = 5;

/**
 * Up to `n` grammars for YouTube "Test & Compare": [0] is the channel-optimal
 * pick (same as pickGrammar); each next one still scores against the channel
 * but must sit ≥ MIN_VARIANT_GAP from the ones already chosen, and is rewarded
 * for distance from them — so the A/B test compares real design choices.
 * Antidote variants also move to the next distinct hero scene (sceneRank).
 */
function pickVariants({ slug, engine, history, n = 3 }) {
  const recent = history.slice(-RECENT).map((h) => h.grammar);
  const chosen = [];
  // Variant k of a scene-still shows the k-th distinct hero scene — a different
  // MOMENT is itself a strong difference (it beats falling back to a text poster).
  const vdist = (c, v) => distance(c, v) + (engine === "antidote" && c.layout === "scene-still" && v.layout === "scene-still" ? 3 : 0);
  for (let k = 0; k < n; k++) {
    // The gap is measured on DESIGN only; a different scene is a bonus, not a
    // licence to ship the same card twice.
    const pool = candidates(engine).filter((c) => (k > 0 || mainOk(c)) && chosen.every((v) => distance(c, v) >= MIN_VARIANT_GAP));
    if (!pool.length) break;
    const top = best(pool, slug, (c) => channelScore(c, recent) + (chosen.length ? 2 * Math.min(...chosen.map((v) => vdist(c, v))) : 0));
    // next DISTINCT moment for each scene-still (a text poster uses no scene)
    const sceneRank = chosen.filter((v) => v.layout === "scene-still").length;
    chosen.push({ ...top.g, ...(top.g.layout === "scene-still" ? { sceneRank } : {}) });
  }
  return chosen;
}

module.exports = { pickGrammar, pickVariants, loadGrammarHistory, publishedSlugs, distance, grammarOf, candidates };
