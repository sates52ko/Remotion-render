#!/usr/bin/env node
"use strict";
/**
 * render-thumbnails.js — render a book's thumbnail + its Test & Compare variants.
 *
 *   node scripts/render-thumbnails.js --slug=<slug>
 *   node scripts/render-thumbnails.js --slug=<slug> --cloud [--book-root=<checkout>] [--worker=<id>] [--no-wait]
 *   node scripts/render-thumbnails.js --slug=<slug> --cloud --fetch [--book-root=<checkout>]
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
 * --cloud (2026-11-06) = THUMBNAIL-ONLY mode of the cloud render pipeline (lib/cloud-thumbs.js): this same script runs
 * in the `thumbnails` job of render-video.yml on a render-pool runner; the PNGs + thumbnail-check.json come back
 * sha256-checked and bound to the book's current thumbnail inputs. No film is rendered, joined, verified, uploaded or
 * published, and no render state is written. A production cloud render does this by itself at finalization
 * (render-github-cloud-assemble.js); --cloud is for a film that is already done, or after the hook / grammar changed.
 * --fetch: install the last dispatched thumbnail-only run's result (after --no-wait).
 * --pack=<dir> (runner): also collect the outputs + record.json (sha256 per file) for the artifact.
 *
 * Locally (no --cloud) the still budget of lib/local-load-guard.js applies (one machine-wide still lock).
 * Published books are refused (frozen). No variants in meta → renders A only.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { bundleFor, renderThumb, describeGrammar: describe, writeTestCompareBlock } = require("./lib/thumb-render");
const { publishedSlugs } = require("./lib/thumbnail-grammar");

const sha256File = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const grammarSigOf = (t) =>
  crypto.createHash("sha256")
    .update(JSON.stringify({ grammar: (t && t.grammar) || null, variants: (t && t.variants) || null }))
    .digest("hex")
    .slice(0, 16);

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const SLUG = args.slug;
if (!SLUG) {
  console.error("Usage: node scripts/render-thumbnails.js --slug=<slug> [--cloud [--book-root=<checkout>] [--worker=<id>] [--no-wait] [--fetch]]");
  process.exit(1);
}
const BOOK = typeof args["book-root"] === "string" && args["book-root"] ? path.resolve(args["book-root"]) : ROOT;
if ([...new Set([ROOT, BOOK])].some((r) => publishedSlugs(r).includes(SLUG)) && !args.force) {
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

if (args.cloud) {
  // THUMBNAIL-ONLY: dispatch / fetch on the render pool; nothing heavy runs here.
  const CT = require("./lib/cloud-thumbs");
  (async () => {
    if (!fs.existsSync(path.join(BOOK, "books", SLUG))) { console.error(`✗ books/${SLUG} not found under ${BOOK}`); process.exit(2); }
    require("./lib/run-lock").takeRunLock(path.join(BOOK, `.cloud-thumbs-lock.${SLUG}.json`), `cloud thumbnails ${SLUG}`);
    const acc = require("./lib/render-pool").loadAccounts();
    let got;
    if (args.fetch) {
      const d = (readJson(CT.thumbsStateFile(BOOK, SLUG)) || {}).dispatched;
      if (!d || !d.runId) { console.error(`✗ no dispatched thumbnail run recorded in ${path.basename(CT.thumbsStateFile(BOOK, SLUG))}`); process.exit(2); }
      const [o, r] = String(d.repo).split("/");
      const host = (acc.workers || []).find((w) => w.username === o && w.repo === r);
      if (!host) { console.error(`✗ worker ${d.repo} not in render-accounts.json`); process.exit(2); }
      got = await CT.fetchAndInstall({ host, runId: d.runId, runUrl: d.url, slug: SLUG, bookRoot: BOOK });
    } else {
      const g = CT.ensureGrammar({ slug: SLUG, root: ROOT, bookRoot: BOOK });
      if (g) { console.error(`✗ ${g}`); process.exit(2); }
      const host = CT.hostFor({ acc, bookRoot: BOOK, slug: SLUG, workerId: typeof args.worker === "string" ? args.worker : null });
      if (!host) { console.error("✗ no active render-pool worker with a token in render-accounts.json"); process.exit(2); }
      got = await CT.runThumbnailsOnly({ slug: SLUG, bookRoot: BOOK, root: ROOT, host, acc, wait: !args["no-wait"] });
    }
    if (got.pending) return;
    if (!got.ok) { console.error(`✗ thumbnails NOT installed:\n   - ${got.problems.join("\n   - ")}`); process.exit(1); }
    const vis = got.state.hookVisible;
    console.log(`✓ thumbnails ${got.state.variants.join("/")} installed (inputs ${got.state.inputHash}) — hook ${vis ? "visible in every variant" : vis === false ? "NOT VISIBLE (YouTube NOT READY)" : "unchecked"}`);
    console.log(`   next: node scripts/lint-titles.js --slug=${SLUG} --pack${BOOK !== ROOT ? ` (in ${BOOK})` : ""}`);
    if (vis === false) process.exit(1);
  })().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
} else {
  renderHere();
}

function renderHere() {
if (BOOK !== ROOT) { console.error("✗ --book-root is for --cloud only (a local render reads this checkout's books/)"); process.exit(2); }
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
// machine load (lib/local-load-guard.js): free on a runner; locally within the still budget, one still render at a time
require("./lib/local-load-guard").guardStills({ what: `render-thumbnails ${SLUG}`, stills: jobs.length * (args["no-hook-check"] ? 1 : 2), operatorLocal: args["operator-local"] });

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
  const hasPublicFile = (rel) => typeof rel === "string" && rel.trim() && fs.existsSync(path.join(ROOT, "public", rel.replace(/^public\//, "")));
  const resolvedHeroImg = hasPublicFile(thumb.image) ? String(thumb.image).replace(/^public\//, "") : "";
  const resolvedCutoutImg = hasPublicFile(thumb.cut) ? String(thumb.cut).replace(/^public\//, "") : "";
  console.log(`Bundling Thumb-${SLUG} (slim registry)…`);
  const serveUrl = await bundleFor([SLUG]);
  const done = [];
  const { grayOf, hookVisibility } = require("./lib/thumb-hook-check");
  const checks = [];
  const grammarSig = grammarSigOf(thumb);
  let renderFailed = false;
  for (const j of jobs) {
    const prevMtime = fs.existsSync(j.file) ? fs.statSync(j.file).mtimeMs : null;
    const relFile = path.relative(ROOT, j.file).replace(/\\/g, "/");
    try {
      const props = {
        ...(j.grammar ? { grammar: j.grammar, layout: j.grammar.layout } : {}),
        heroImg: resolvedHeroImg,
        ...(resolvedCutoutImg ? { cutoutImg: resolvedCutoutImg } : {}),
        ...(hook ? { hook } : {}),
      };
      await renderThumb(serveUrl, SLUG, j.file, props);
      console.log(`  ✓ ${j.letter}  ${path.relative(ROOT, j.file)}  (${describe(j.grammar)})`);
      done.push(j);
      const fileSha = sha256File(j.file);
      if (hook && !args["no-hook-check"]) {
        // the same still without the hook: what the hook adds is what a viewer can read
        const bare = path.join(ROOT, "out", "_thumbpreview", `${SLUG}-${j.letter}-nohook.png`);
        fs.mkdirSync(path.dirname(bare), { recursive: true });
        await renderThumb(serveUrl, SLUG, bare, { ...props, hook: "" });
        const v = hookVisibility(grayOf(j.file), grayOf(bare));
        fs.rmSync(bare, { force: true });
        checks.push({ letter: j.letter, file: relFile, sha256: fileSha, ...v });
        console.log(`    ${v.hookVisible ? "✓" : v.hookVisible === false ? "✗" : "?"} hook ${v.hookVisible ? "visible" : v.hookVisible === false ? "NOT VISIBLE" : "unchecked"} — ${v.detail}`);
      } else {
        checks.push({ letter: j.letter, file: relFile, sha256: fileSha, hookVisible: hook ? null : true, detail: hook ? "no-hook-check" : "empty-hook" });
      }
    } catch (e) {
      renderFailed = true;
      process.exitCode = 1;
      if (fs.existsSync(j.file) && fs.statSync(j.file).mtimeMs !== prevMtime) {
        try { fs.rmSync(j.file, { force: true }); } catch {}
      }
      const errMsg = String(e.message).split("\n")[0];
      console.error(`  ✗ ${j.letter} failed: ${errMsg}`);
      checks.push({ letter: j.letter, file: relFile, hookVisible: false, renderError: errMsg });
    }
  }
  // Always write thumbnail-check.json (fail-closed: a failed render must never leave an older passing check behind).
  fs.writeFileSync(
    path.join(ROOT, "books", SLUG, "thumbnail-check.json"),
    JSON.stringify({
      slug: SLUG,
      hook,
      grammarSig,
      ok: !renderFailed && !checks.some((c) => c.hookVisible === false),
      at: new Date().toISOString(),
      variants: checks,
    }, null, 2) + "\n",
  );
  if (checks.some((c) => c.hookVisible === false)) {
    console.error(`  ✗ the hook is not visible or render failed in ${checks.filter((c) => c.hookVisible === false).map((c) => c.letter).join(", ")} — YouTube NOT READY`);
    process.exitCode = 1;
  }

  if (writeTestCompareBlock(ROOT, SLUG, done.map((j) => ({ letter: j.letter, rel: path.relative(ROOT, j.file).replace(/\\/g, "/"), grammar: j.grammar })))) {
    console.log(`  ✓ Test & Compare block → ${path.relative(ROOT, path.join(ROOT, "books", SLUG, "youtube.md"))}`);
  }
  if (typeof args.pack === "string" && args.pack) {
    // runner (render-video.yml `thumbnails` job): the artifact = these files + record.json (sha256, inputs, hook check)
    const rec = require("./lib/cloud-thumbs").writePack({ dir: path.resolve(ROOT, args.pack), root: ROOT, slug: SLUG, jobs: done, checks, hook, exitCode: process.exitCode || 0 });
    console.log(`  ✓ pack → ${args.pack} (${Object.keys(rec.files).length} files, inputs ${rec.inputHash})`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
}
