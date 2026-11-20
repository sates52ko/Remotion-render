#!/usr/bin/env node
/**
 * migrate-to-books.js — one-off migration that consolidates the scattered
 * root-level per-book files into a self-contained books/<slug>/ folder.
 *
 *   vox-config.<slug>.json              -> books/<slug>/config.vox.json
 *   youtube-meta.<slug>.json            -> books/<slug>/youtube-meta.json
 *   .vox-cache.<slug>.json              -> books/<slug>/cache.json
 *   prompts/notebooklm-prompt.<slug>.md -> books/<slug>/prompt.notebooklm.md
 *   (+ generates books/<slug>/book.json manifest from the config/meta)
 *
 * Legacy/superseded files are archived under books/<slug>/_legacy/ (not deleted):
 *   youtube-<slug>.md        (predates books/<slug>/youtube.md)
 *   production-<slug>.json   (old cinematic format)
 *
 * Existing books/<slug>/youtube.md and README.md are never touched.
 * Never overwrites a destination that already exists (skips + warns).
 *
 * Usage:
 *   node scripts/migrate-to-books.js            # DRY RUN — prints the plan, changes nothing
 *   node scripts/migrate-to-books.js --apply    # actually move the files
 */
const fs = require("fs");
const path = require("path");
const { ROOT, rel, abs, ensureBookDir } = require("./lib/paths");

const APPLY = process.argv.includes("--apply");
const rootFile = (f) => path.join(ROOT, f);
const exists = (f) => fs.existsSync(rootFile(f));

// ── discover every slug that has any per-book file at root ──────────────────
const rootFiles = fs.readdirSync(ROOT);
const slugs = new Set();
const grab = (re) => rootFiles.forEach((f) => { const m = f.match(re); if (m) slugs.add(m[1]); });
grab(/^vox-config\.(.+)\.json$/);
grab(/^youtube-meta\.(.+)\.json$/);
grab(/^\.vox-cache\.(.+)\.json$/);
grab(/^youtube-(.+)\.md$/);
grab(/^production-(.+)\.json$/);
const promptsDir = path.join(ROOT, "prompts");
if (fs.existsSync(promptsDir)) {
  for (const f of fs.readdirSync(promptsDir)) {
    const m = f.match(/^notebooklm-prompt\.(.+)\.md$/);
    if (m) slugs.add(m[1]);
  }
}

// ── per-slug move plan ──────────────────────────────────────────────────────
// { from (repo-rel), to (repo-rel), kind }
function planFor(slug) {
  const moves = [];
  const add = (from, to, kind) => { if (exists(from)) moves.push({ from, to, kind }); };
  add(`vox-config.${slug}.json`, rel.voxConfig(slug), "config");
  add(`youtube-meta.${slug}.json`, rel.youtubeMeta(slug), "meta");
  add(`.vox-cache.${slug}.json`, rel.cache(slug), "cache");
  add(`prompts/notebooklm-prompt.${slug}.md`, rel.prompt(slug), "prompt");
  // legacy → archive under _legacy/
  add(`youtube-${slug}.md`, `${rel.bookDir(slug)}/_legacy/youtube-${slug}.md`, "legacy");
  add(`production-${slug}.json`, `${rel.bookDir(slug)}/_legacy/production-${slug}.json`, "legacy");
  return moves;
}

// ── build a book.json manifest from the (moved-to) config, falling back to meta ─
function manifestFor(slug) {
  const readMaybe = (relPath) => { try { return JSON.parse(fs.readFileSync(rootFile(relPath), "utf8")); } catch { return null; } };
  const cfg = readMaybe(`vox-config.${slug}.json`);
  const meta = readMaybe(`youtube-meta.${slug}.json`);
  const src = (cfg && cfg.meta) || meta || {};
  return {
    slug,
    title: src.title || slug,
    author: src.author || "",
    genre: src.genre || "",
    engine: cfg ? "vox" : "none", // config-less slugs (prompt only) aren't renderable yet
  };
}

// ── execute / report ────────────────────────────────────────────────────────
console.log(`\n══ MIGRATE TO books/<slug>/  ${APPLY ? "(APPLY)" : "(DRY RUN — no changes)"} ══\n`);

let moved = 0, skipped = 0, manifests = 0;
const legacyNotes = [];

for (const slug of [...slugs].sort()) {
  const moves = planFor(slug);
  if (!moves.length) continue;
  console.log(`📁 ${slug}`);
  for (const mv of moves) {
    const destAbs = path.join(ROOT, mv.to);
    if (fs.existsSync(destAbs)) {
      console.log(`   ⏭  skip (dest exists): ${mv.from}  →  ${mv.to}`);
      skipped++;
      continue;
    }
    console.log(`   ${mv.kind === "legacy" ? "🗄 " : "→ "} ${mv.from}  →  ${mv.to}`);
    if (mv.kind === "legacy") legacyNotes.push(`${slug}: ${mv.from}`);
    if (APPLY) {
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.renameSync(rootFile(mv.from), destAbs);
    }
    moved++;
  }
  // manifest
  const manRel = rel.manifest(slug);
  if (fs.existsSync(path.join(ROOT, manRel))) {
    console.log(`   ⏭  manifest exists: ${manRel}`);
  } else {
    const man = manifestFor(slug);
    console.log(`   📝 book.json  { engine: "${man.engine}", title: "${man.title}"${man.author ? `, author: "${man.author}"` : ""} }`);
    if (APPLY) {
      ensureBookDir(slug);
      fs.writeFileSync(path.join(ROOT, manRel), JSON.stringify(man, null, 2) + "\n");
    }
    manifests++;
  }
  console.log("");
}

console.log(`── ${APPLY ? "DONE" : "PLAN"} ──`);
console.log(`   moves: ${moved}   skipped(dest exists): ${skipped}   manifests: ${manifests}`);
if (legacyNotes.length) {
  console.log(`   🗄  archived to _legacy/ (kept, not deleted):`);
  legacyNotes.forEach((n) => console.log(`        ${n}`));
}
if (!APPLY) console.log(`\n   Re-run with --apply to perform the moves.`);
console.log(`\n   Next: node scripts/gen-books-registry.js  (regenerate src/books.generated.ts)\n`);
