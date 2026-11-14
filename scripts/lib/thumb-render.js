"use strict";
/**
 * thumb-render.js — render Thumb-<slug> stills fast.
 *
 * `npx remotion still` bundles the whole registry (every book's config) on each
 * call — tens of minutes on this box. Here ONE bundle is made with
 * books.generated.ts swapped for a slim registry holding only the requested
 * books, then any number of stills render against it with per-call inputProps
 * (e.g. a Test & Compare variant's grammar).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

function writeSlimRegistry(slugs) {
  const full = fs.readFileSync(path.join(ROOT, "src", "books.generated.ts"), "utf8").replace(/\r\n/g, "\n");
  const keep = new Set(slugs);
  const slim = full
    .split("\n")
    .filter((line) => {
      const m = line.match(/^import .* from '\.\.\/books\/([^/]+)\//);
      return !m || keep.has(m[1]);
    })
    .join("\n")
    .replace(/\n  \{\n    slug: '([^']+)',[\s\S]*?\n  \},/g, (block, slug) => (keep.has(slug) ? block : ""))
    .replace(/from '\.\.\/books\//g, "from '../../books/");
  const dir = path.join(ROOT, "out", "_thumbpreview");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `books.generated.${slugs.length === 1 ? slugs[0] : "multi"}.ts`);
  fs.writeFileSync(file, slim);
  return file;
}

async function bundleFor(slugs) {
  const { bundle } = require("@remotion/bundler");
  const webpack = require("webpack");
  const slim = writeSlimRegistry(slugs);
  return bundle({
    entryPoint: path.join(ROOT, "src", "index.ts"),
    webpackOverride: (config) => ({
      ...config,
      plugins: [...(config.plugins || []), new webpack.NormalModuleReplacementPlugin(/books\.generated$/, slim)],
    }),
  });
}

// Google-font loading can stall the headless browser past Remotion's 30s
// default on this box: long timeout + retries.
async function renderThumb(serveUrl, slug, output, inputProps = {}, { timeout = 180000, attempts = 3 } = {}) {
  const { renderStill, selectComposition } = require("@remotion/renderer");
  const id = `Thumb-${slug}`;
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const composition = await selectComposition({ serveUrl, id, inputProps, timeoutInMilliseconds: timeout });
      await renderStill({ composition, serveUrl, output, inputProps, frame: 0, imageFormat: "png", timeoutInMilliseconds: timeout });
      return output;
    } catch (e) {
      last = e;
      console.warn(`  ⚠ ${id} attempt ${attempt}: ${String(e.message).split("\n")[0]}`);
    }
  }
  throw last;
}

const describeGrammar = (g) =>
  g ? `${g.layout} · ${g.textPos} · ${g.type} · ${g.treatment} · ${g.accent}${g.sceneRank ? ` · scene #${g.sceneRank + 1}` : ""}` : "default";

/**
 * youtube.md: replace (or append) the Test & Compare block. `done` = [{ letter, rel, grammar }] (rel = repo path of
 * the PNG). One writer for the local render and the cloud install (cloud-thumbs.js). No-op below two variants.
 */
function writeTestCompareBlock(root, slug, done) {
  const md = path.join(root, "books", slug, "youtube.md");
  if (!fs.existsSync(md) || done.length <= 1) return false;
  const START = "<!-- test-compare:start -->";
  const END = "<!-- test-compare:end -->";
  const block = [
    START,
    "### Thumbnail Test & Compare (YouTube Studio)",
    "Upload all three under **Thumbnail → Test & compare**; YouTube serves them evenly and keeps the one with the highest watch-time share. Same hook, different design — the test measures the design, not the promise.",
    ...done.map((j) => `- **${j.letter}**: \`${j.rel}\` — ${describeGrammar(j.grammar)}`),
    END,
  ].join("\n");
  let text = fs.readFileSync(md, "utf8");
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (re.test(text)) text = text.replace(re, block);
  else if (/\n## Upload checklist/.test(text)) text = text.replace(/\n## Upload checklist/, `\n${block}\n\n## Upload checklist`);
  else text = `${text.trimEnd()}\n\n${block}\n`;
  fs.writeFileSync(md, text);
  return true;
}

module.exports = { writeSlimRegistry, bundleFor, renderThumb, describeGrammar, writeTestCompareBlock };
