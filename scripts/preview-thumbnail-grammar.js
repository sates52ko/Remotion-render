#!/usr/bin/env node
"use strict";
/**
 * preview-thumbnail-grammar.js — channel-feed preview of the thumbnail grammar.
 *
 *   node scripts/preview-thumbnail-grammar.js --slugs=we-were-liars,dust,the-stranger
 *
 * Simulates publishing the given books IN THAT ORDER after the current channel
 * (each pick sees the ones before it), renders every Thumb-<slug> with its
 * picked grammar, and writes out/thumbnail-grammar-preview/{<slug>.png,
 * index.html, sheet-168.png}. Read-only for books/ — the grammar is passed as
 * inputProps, nothing is written into any config (use thumbnail-grammar.js
 * --write for that).
 *
 * Fast: ONE bundle, and books.generated.ts is swapped for a registry holding
 * only the previewed books (the full one imports every config).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { pickVariants, loadGrammarHistory } = require("./lib/thumbnail-grammar");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const SLUGS = String(args.slugs || "").split(",").filter(Boolean);
if (!SLUGS.length) {
  console.error("Usage: node scripts/preview-thumbnail-grammar.js --slugs=a,b,c");
  process.exit(1);
}
const OUT = path.join(ROOT, "out", "thumbnail-grammar-preview");
fs.mkdirSync(OUT, { recursive: true });

// 1) grammar picks, in simulated publishing order
const engineOf = (slug) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "books", slug, "book.json"), "utf8").replace(/^﻿/, "")).engine === "antidote" ? "antidote" : "vox";
  } catch {
    return "vox";
  }
};
const history = loadGrammarHistory(ROOT, "__none__").filter((h) => !SLUGS.includes(h.slug));
const picks = [];
// --variants: also render each book's Test & Compare B/C next to its A.
const N = args.variants ? 3 : 1;
for (const slug of SLUGS) {
  const engine = engineOf(slug);
  const vs = pickVariants({ slug, engine, history, n: N });
  vs.forEach((grammar, i) => {
    const id = i ? `${slug}-${"abc"[i]}` : slug;
    picks.push({ slug, id, engine, grammar, letter: "ABC"[i] });
    console.log(`  ${id.padEnd(32)} ${engine.padEnd(9)} ${grammar.layout} / ${grammar.textPos} / ${grammar.type} / ${grammar.treatment} / ${grammar.accent}${grammar.sceneRank ? " / scene#" + grammar.sceneRank : ""}`);
  });
  history.push({ slug, published: false, grammar: vs[0] });
}

(async () => {
  const { bundleFor, renderThumb } = require("./lib/thumb-render");
  console.log("Bundling (slim registry)…");
  const serveUrl = await bundleFor(SLUGS);
  // --only=a,b re-renders a subset while the picks still see the whole feed.
  const ONLY = args.only ? new Set(String(args.only).split(",")) : null;
  for (const p of picks) {
    const output = path.join(OUT, `${p.id}.png`);
    if (ONLY && !ONLY.has(p.slug)) {
      if (fs.existsSync(output)) p.file = output;
      continue;
    }
    try {
      await renderThumb(serveUrl, p.slug, output, { grammar: p.grammar, layout: p.grammar.layout });
      p.file = output;
      console.log(`  ✓ ${path.relative(ROOT, output)}`);
    } catch (e) {
      console.warn(`  ✗ ${p.id}: ${String(e.message).split("\n")[0]}`);
    }
  }
  const rendered = picks.filter((p) => p.file);
  if (!rendered.length) throw new Error("no thumbnail rendered");

  // 3) contact sheet: full + browse size, in feed order
  const cards = rendered
    .map((p) => {
      const g = p.grammar;
      return `<figure><img class="big" src="${p.id}.png"><img class="small" src="${p.id}.png">
<figcaption><b>${p.slug}</b> ${N > 1 ? p.letter + ' · ' : ''}· ${p.engine}<br><code>${g.layout} · ${g.textPos} · ${g.type} · ${g.treatment} · ${g.accent}</code></figcaption></figure>`;
    })
    .join("\n");
  const feed = rendered.filter((p) => p.letter === "A").map((p) => `<img src="${p.id}.png">`).join("");
  fs.writeFileSync(
    path.join(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Thumbnail grammar preview</title>
<style>body{background:#0f0f0f;color:#eee;font:14px system-ui;margin:24px}h2{font-weight:600}
.feed{display:flex;gap:8px;flex-wrap:wrap}.feed img{width:168px;height:94px;border-radius:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(460px,1fr));gap:20px}
figure{margin:0;display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:end}
.big{width:320px;border-radius:8px}.small{width:168px;border-radius:6px}figcaption{grid-column:1/3;color:#aaa}code{color:#9cf}</style>
<h2>Browse feed @168px (simulated publishing order)</h2><div class="feed">${feed}</div>
<h2>Each thumbnail</h2><div class="grid">${cards}</div>`,
  );

  // 4) one PNG of the 168px feed (for sharing / chat)
  try {
    const inputs = rendered.map((p) => `-i "${p.file}"`).join(" ");
    const scale = rendered.map((_, i) => `[${i}:v]scale=336:188[s${i}]`).join(";");
    const cols = N > 1 ? 3 : Math.min(4, rendered.length); // variants: one book per row (A B C)
    const layout = rendered.map((_, i) => `${(i % cols) * 344}_${Math.floor(i / cols) * 196}`).join("|");
    const tags = rendered.map((_, i) => `[s${i}]`).join("");
    execSync(
      `ffmpeg -y -loglevel error ${inputs} -filter_complex "${scale};${tags}xstack=inputs=${rendered.length}:layout=${layout}:fill=0x0f0f0f" "${path.join(OUT, "sheet-168.png")}"`,
      { stdio: "inherit" },
    );
  } catch (e) {
    console.warn(`  ⚠ sheet-168.png skipped (${e.message.split("\n")[0]})`);
  }
  console.log(`\nOpen: ${path.join(OUT, "index.html")}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
