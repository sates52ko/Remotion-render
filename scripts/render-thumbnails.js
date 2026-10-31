#!/usr/bin/env node
"use strict";
/**
 * render-thumbnails.js — render a book's thumbnail + its Test & Compare variants.
 *
 *   node scripts/render-thumbnails.js --slug=<slug>
 *
 * Reads youtube-meta.json → thumbnail.grammar / thumbnail.variants (written by
 * thumbnail-grammar.js --write) and renders, from ONE slim bundle:
 *   out/thumbnail-<slug>.png     A — the main thumbnail (thumbnail.grammar)
 *   out/thumbnail-<slug>-b.png   B — variant 2
 *   out/thumbnail-<slug>-c.png   C — variant 3
 * then writes a "Test & Compare" block into books/<slug>/youtube.md so the
 * operator uploads all three in YouTube Studio (Test & Compare picks the winner
 * on watch-time share — the only honest CTR measurement there is).
 *
 * Published books are refused (frozen). No variants in meta → renders A only.
 */
const fs = require("fs");
const path = require("path");
const { bundleFor, renderThumb } = require("./lib/thumb-render");
const { publishedSlugs } = require("./lib/thumbnail-grammar");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const SLUG = args.slug;
if (!SLUG) {
  console.error("Usage: node scripts/render-thumbnails.js --slug=<slug>");
  process.exit(1);
}
if (publishedSlugs(ROOT).includes(SLUG) && !args.force) {
  console.error(`✗ ${SLUG} is in PUBLISHED_BOOKS.md — frozen, its thumbnail already shipped.`);
  process.exit(1);
}

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
};
const meta = readJson(path.join(ROOT, "books", SLUG, "youtube-meta.json"));
const cfg = readJson(path.join(ROOT, "books", SLUG, "config.antidote.json"));
const thumb = (meta && meta.thumbnail) || (cfg && cfg.meta && cfg.meta.thumbnail) || {};
const variants = Array.isArray(thumb.variants) && thumb.variants.length ? thumb.variants : [thumb.grammar || null];
const LETTERS = ["A", "B", "C"];
const jobs = variants.slice(0, 3).map((g, i) => ({
  letter: LETTERS[i],
  grammar: g,
  file: path.join(ROOT, "out", `thumbnail-${SLUG}${i ? "-" + LETTERS[i].toLowerCase() : ""}.png`),
}));

const describe = (g) =>
  g ? `${g.layout} · ${g.textPos} · ${g.type} · ${g.treatment} · ${g.accent}${g.sceneRank ? ` · scene #${g.sceneRank + 1}` : ""}` : "default";

(async () => {
  fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
  // The Thumb composition reads the hook from the registry's youtube-meta import and falls back to the config's
  // thumbnail when the registry has no meta for the book — a stale registry rendered another hook (2026-10-28).
  // Regenerate it when this book or its meta is missing, and pass the CURRENT hook explicitly on every render.
  const reg = (() => { try { return fs.readFileSync(path.join(ROOT, "src", "books.generated.ts"), "utf8"); } catch { return ""; } })();
  const hasMeta = fs.existsSync(path.join(ROOT, "books", SLUG, "youtube-meta.json"));
  if (!reg.includes(`slug: '${SLUG}'`) || (hasMeta && !reg.includes(`books/${SLUG}/youtube-meta.json`))) {
    console.log(`Registry has no current entry for ${SLUG} — node scripts/gen-books-registry.js`);
    require("child_process").execFileSync(process.execPath, [path.join(ROOT, "scripts", "gen-books-registry.js")], { cwd: ROOT, stdio: "inherit" });
  }
  const hook = String(thumb.hook || "").trim();
  if (!hook) console.warn("  ⚠ youtube-meta.thumbnail.hook is empty — the thumbnails carry no hook");
  console.log(`Bundling Thumb-${SLUG} (slim registry)…`);
  const serveUrl = await bundleFor([SLUG]);
  const done = [];
  const { grayOf, hookVisibility } = require("./lib/thumb-hook-check");
  const checks = [];
  for (const j of jobs) {
    try {
      // A renders with its stored grammar (no override) so it is what `npx remotion still Thumb-<slug>` gives
      // with a current registry; B/C override it. The hook is always the meta's current one.
      const props = { ...(j.letter === "A" || !j.grammar ? {} : { grammar: j.grammar, layout: j.grammar.layout }), ...(hook ? { hook } : {}) };
      await renderThumb(serveUrl, SLUG, j.file, props);
      console.log(`  ✓ ${j.letter}  ${path.relative(ROOT, j.file)}  (${describe(j.grammar)})`);
      done.push(j);
      if (hook && !args["no-hook-check"]) {
        // the same still without the hook: what the hook adds is what a viewer can read
        const bare = path.join(ROOT, "out", "_thumbpreview", `${SLUG}-${j.letter}-nohook.png`);
        fs.mkdirSync(path.dirname(bare), { recursive: true });
        await renderThumb(serveUrl, SLUG, bare, { ...props, hook: "" });
        const v = hookVisibility(grayOf(j.file), grayOf(bare));
        fs.rmSync(bare, { force: true });
        checks.push({ letter: j.letter, file: path.relative(ROOT, j.file).replace(/\\/g, "/"), ...v });
        console.log(`    ${v.hookVisible ? "✓" : v.hookVisible === false ? "✗" : "?"} hook ${v.hookVisible ? "visible" : v.hookVisible === false ? "NOT VISIBLE" : "unchecked"} — ${v.detail}`);
      }
    } catch (e) {
      console.error(`  ✗ ${j.letter} failed: ${String(e.message).split("\n")[0]}`);
      if (j.letter === "A") process.exitCode = 1;
    }
  }
  if (checks.length) {
    // read by lint-titles.js --pack (YouTube READY): HOOK_NOT_VISIBLE / HOOK_STALE_THUMBNAIL
    fs.writeFileSync(path.join(ROOT, "books", SLUG, "thumbnail-check.json"), JSON.stringify({ slug: SLUG, hook, at: new Date().toISOString(), variants: checks }, null, 2) + "\n");
    if (checks.some((c) => c.hookVisible === false)) { console.error(`  ✗ the hook is not visible in ${checks.filter((c) => c.hookVisible === false).map((c) => c.letter).join(", ")} — YouTube NOT READY`); process.exitCode = 1; }
  }

  // youtube.md: replace (or append) the Test & Compare block.
  const md = path.join(ROOT, "books", SLUG, "youtube.md");
  if (fs.existsSync(md) && done.length > 1) {
    const START = "<!-- test-compare:start -->";
    const END = "<!-- test-compare:end -->";
    const block = [
      START,
      "### Thumbnail Test & Compare (YouTube Studio)",
      "Upload all three under **Thumbnail → Test & compare**; YouTube serves them evenly and keeps the one with the highest watch-time share. Same hook, different design — the test measures the design, not the promise.",
      ...done.map((j) => `- **${j.letter}**: \`${path.relative(ROOT, j.file).replace(/\\/g, "/")}\` — ${describe(j.grammar)}`),
      END,
    ].join("\n");
    let text = fs.readFileSync(md, "utf8");
    const re = new RegExp(`${START}[\\s\\S]*?${END}`);
    if (re.test(text)) text = text.replace(re, block);
    else if (/\n## Upload checklist/.test(text)) text = text.replace(/\n## Upload checklist/, `\n${block}\n\n## Upload checklist`);
    else text = `${text.trimEnd()}\n\n${block}\n`;
    fs.writeFileSync(md, text);
    console.log(`  ✓ Test & Compare block → ${path.relative(ROOT, md)}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
