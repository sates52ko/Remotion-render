#!/usr/bin/env node
/**
 * cross-book-similarity.js — how much of each film is drawn from what EVERY film shares, and which films are built
 * from the same pieces (2026-11-18, YPP "generic or repetitive content"). Report only: it never refuses a book.
 *
 *   node scripts/cross-book-similarity.js [--book-root=<checkout>] [--slug=<slug>] [--top=12] [--out=<file.md>]
 *
 * For every books/<slug>/config.antidote.json:
 *   - SHARED share of screen time: the time spent in scenes that stand in a shared set (not the book's own place and
 *     not a told stage) — the part of the film that could be any book;
 *   - what it is built from: shared sets, shared-library icons, shots (by screen time), its narrative form and the
 *     label it prints in the corner.
 * Two films are compared on the SHARED pieces only (cosine of their time-weighted use of shared sets, library icons
 * and shots): the book's own places, things and told stages are in no shared dimension, so drawing them lowers the
 * number. An intro, a brand colour or a caption style is not counted — the same series look is not the problem; the
 * same picture under a different title is. With --slug: that book against all the others.
 */
const fs = require("fs");
const path = require("path");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : path.join(__dirname, ".."));
const TOP = Number(args.top) > 0 ? Number(args.top) : 12;
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return null; } };

/** One film → { minutes, shared (share of time in shared sets), vec (time-weighted shared pieces), … }. Pure. */
function profile(config, book = {}) {
  const scenes = (config && config.scenes) || [];
  const total = scenes.reduce((n, s) => n + (s.durationFrames || 0), 0) || 1;
  const vec = {}, add = (k, w) => { vec[k] = (vec[k] || 0) + w / total; };
  let told = 0, ownPlace = 0, shared = 0, ownIcons = 0, libIcons = 0; const badges = new Set();
  for (const s of scenes) {
    const w = s.durationFrames || 0;
    if (s.hud && s.hud.badge) badges.add(String(s.hud.badge).replace(/\d+/g, "N"));
    if (s.told) { told += w; continue; }
    if (s.bg && s.bg.own) ownPlace += w;
    else { shared += w; add(`set:${(s.bg && s.bg.set) || "none"}`, w); }
    add(`shot:${s.shot || "?"}`, w * 0.5);
    for (const p of s.props || []) { if (p.type === "customSvg") ownIcons++; else { libIcons++; add(`icon:${p.type}`, w); } }
  }
  return { minutes: total / ((config.meta && config.meta.fps) || 30) / 60, shared: shared / total, told: told / total, ownPlace: ownPlace / total, ownIcons, libIcons, badge: [...badges][0] || "none", form: (book.form && book.form.key) || null, vec };
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const x = a[k] || 0, y = b[k] || 0; dot += x * y; na += x * x; nb += y * y; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
/** how alike two films are in what they share: the cosine, scaled by how much of each film IS shared material */
const alike = (p, q) => cosine(p.vec, q.vec) * Math.sqrt(p.shared * q.shared);

if (require.main === module) {
  const dir = path.join(ROOT, "books"), books = [];
  for (const s of fs.readdirSync(dir)) { const c = read(path.join(dir, s, "config.antidote.json")); if (c && (c.scenes || []).length >= 20) books.push({ slug: s, ...profile(c, read(path.join(dir, s, "book.json")) || {}) }); }
  if (!books.length) { console.error(`no Antidote film configs under ${dir}`); process.exit(1); }
  const pct = (x) => `${Math.round(x * 100)} %`, med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const out = [];
  out.push(`# Cross-book similarity — ${books.length} Antidote films (${path.relative(process.cwd(), dir) || dir})`, "");
  out.push(`Median share of a film's time in SHARED sets (could be any book): **${pct(med(books.map((b) => b.shared)))}** · told stages: ${pct(med(books.map((b) => b.told)))} · at a place the book drew (figure scenes): ${pct(med(books.map((b) => b.ownPlace)))}`);
  const badgeCount = {}; for (const b of books) badgeCount[b.badge] = (badgeCount[b.badge] || 0) + 1;
  out.push(`Corner label: ${Object.entries(badgeCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `"${k}" ×${n}`).join(", ")} · narrative form recorded: ${books.filter((b) => b.form).length} of ${books.length}`, "");
  out.push("| film | min | shared sets | told | own place | icons own / library | form |", "|---|---|---|---|---|---|---|");
  for (const b of books.slice().sort((x, y) => y.shared - x.shared)) out.push(`| ${b.slug} | ${b.minutes.toFixed(0)} | ${pct(b.shared)} | ${pct(b.told)} | ${pct(b.ownPlace)} | ${b.ownIcons} / ${b.libIcons} | ${b.form || "—"} |`);
  const pairs = [];
  for (let i = 0; i < books.length; i++) for (let j = i + 1; j < books.length; j++) pairs.push({ a: books[i], b: books[j], s: alike(books[i], books[j]) });
  const mine = typeof args.slug === "string" ? pairs.filter((p) => p.a.slug === args.slug || p.b.slug === args.slug) : pairs;
  mine.sort((x, y) => y.s - x.s);
  out.push("", `## The ${Math.min(TOP, mine.length)} most alike pairs${typeof args.slug === "string" ? ` of ${args.slug}` : ""} (shared sets, library icons and shots, by screen time; 1 = the same pieces for the same time)`, "", "| alike | film | film | what both stand in |", "|---|---|---|---|");
  for (const p of mine.slice(0, TOP)) { const both = Object.keys(p.a.vec).filter((k) => /^set:|^icon:/.test(k) && p.b.vec[k]).map((k) => [k, Math.min(p.a.vec[k], p.b.vec[k])]).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k.replace(/^(set|icon):/, "")} ${pct(v)}`); out.push(`| ${p.s.toFixed(2)} | ${p.a.slug} | ${p.b.slug} | ${both.join(", ")} |`); }
  out.push("", `Median alikeness over all ${pairs.length} pairs: ${med(pairs.map((p) => p.s)).toFixed(2)}`);
  const textOut = out.join("\n");
  if (typeof args.out === "string") { fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); fs.writeFileSync(path.resolve(args.out), textOut + "\n"); console.log(`✓ ${args.out}`); }
  else console.log(textOut);
}

module.exports = { profile, cosine, alike };
