#!/usr/bin/env node
/**
 * build-channel-staples.js — which shared icons carry the channel? (2026-11-18, YPP "generic or repetitive content")
 *
 *   node scripts/build-channel-staples.js [--root=<checkout>] [--write]
 *
 * Reads every books/<slug>/config.antidote.json of the checkout and counts the shared-library icons standing beside
 * the cast (the same count as own-drawings.js iconShare: props of scenes that are not told, the book's own drawings
 * left out). An icon in at least HALF of the films is a CHANNEL STAPLE: a viewer of two films has seen it twice.
 * → data/channel-staples.json, read by the storyboard rules (authors are told to ask for THIS book's version), the
 * merge warning and originality-report.js. Reports; nothing refuses on it. Re-run after a batch of new films.
 */
const fs = require("fs");
const path = require("path");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = args.root ? path.resolve(String(args.root)) : path.join(__dirname, "..");

function census(configs) {
  const use = new Map();
  for (const c of configs) {
    const seen = new Map();
    for (const s of (c && c.scenes) || []) { if (s.told) continue; for (const p of s.props || []) if (p && typeof p.type === "string" && p.type !== "customSvg") seen.set(p.type, (seen.get(p.type) || 0) + 1); }
    for (const [k, n] of seen) { const u = use.get(k) || { books: 0, uses: 0 }; u.books++; u.uses += n; use.set(k, u); }
  }
  const all = [...use.entries()].map(([icon, u]) => ({ icon, ...u })).sort((a, b) => b.books - a.books || b.uses - a.uses || a.icon.localeCompare(b.icon));
  const total = all.reduce((s, u) => s + u.uses, 0), staples = all.filter((u) => u.books >= configs.length / 2);
  return { books: configs.length, icons: all.length, staples, share: total ? staples.reduce((s, u) => s + u.uses, 0) / total : 0 };
}

if (require.main === module) {
  const dir = path.join(ROOT, "books"), configs = [];
  for (const d of fs.readdirSync(dir).sort()) { try { configs.push(JSON.parse(fs.readFileSync(path.join(dir, d, "config.antidote.json"), "utf8"))); } catch {} }
  const r = census(configs);
  console.log(`${r.books} Antidote films · ${r.icons} shared icons in use · ${r.staples.length} in at least half of the films, carrying ${Math.round(r.share * 100)}% of all uses`);
  for (const s of r.staples) console.log(`  ${String(s.books).padStart(3)} films  ${String(s.uses).padStart(5)} uses  ${s.icon}`);
  if (r.books < 10) { console.error("✗ fewer than 10 films: not a channel — nothing written"); process.exit(1); }
  if (args.write) {
    const out = path.join(__dirname, "..", "data", "channel-staples.json");
    fs.writeFileSync(out, JSON.stringify({ _doc: "Shared icons in at least half of the channel's Antidote films (scripts/build-channel-staples.js). A book that needs one draws its own version.", books: r.books, share: Math.round(r.share * 100) / 100, staples: r.staples }, null, 1) + "\n");
    console.log(`→ ${out}`);
  }
}
module.exports = { census };
