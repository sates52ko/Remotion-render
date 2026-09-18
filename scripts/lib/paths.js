/**
 * paths.js — single source of truth for every book/asset path in the pipeline.
 *
 * After the books/<slug>/ migration, each book owns a self-contained folder:
 *
 *   books/<slug>/
 *     ├── book.json              manifest { slug, title, author, genre, engine }
 *     ├── config.vox.json        Vox render config (meta, captions[], beats[])
 *     ├── youtube-meta.json      YouTube SEO/meta + thumbnail brief
 *     ├── cache.json             plan-vox LLM art-direction cache (resume-safe)
 *     ├── prompt.notebooklm.md   NotebookLM "Audio Overview" prompt
 *     ├── youtube.md             copy-paste upload pack (human-facing)
 *     └── README.md              per-book hub index
 *
 * Rendered assets stay under public/ and out/ (unchanged):
 *   public/audio/<slug>.(m4a|mp3|wav) · public/captions/<slug>.vtt · public/scenes/<slug>/
 *   out/<slug>.mp4 · out/thumbnail-<slug>.png
 *
 * Two flavours of every helper:
 *   rel.*(slug)  → repo-relative POSIX string (for import paths, CLI args, logs)
 *   abs.*(slug)  → absolute OS path        (for fs.readFileSync / existsSync)
 *
 * Scripts run with cwd = repo root, so rel.* strings resolve directly too.
 */
const path = require("path");
const fs = require("fs");

// scripts/lib/paths.js  →  repo root is two levels up.
const ROOT = path.join(__dirname, "..", "..");

const AUDIO_EXTS = ["m4a", "mp3", "wav"];

// ── repo-relative (POSIX) path builders ─────────────────────────────────────
const rel = {
  booksDir: () => "books",
  bookDir: (slug) => `books/${slug}`,
  manifest: (slug) => `books/${slug}/book.json`,
  voxConfig: (slug) => `books/${slug}/config.vox.json`,
  antidoteConfig: (slug) => `books/${slug}/config.antidote.json`,
  youtubeMeta: (slug) => `books/${slug}/youtube-meta.json`,
  cache: (slug) => `books/${slug}/cache.json`,
  prompt: (slug) => `books/${slug}/prompt.notebooklm.md`,
  youtubeMd: (slug) => `books/${slug}/youtube.md`,
  readme: (slug) => `books/${slug}/README.md`,

  audio: (slug, ext = "m4a") => `public/audio/${slug}.${ext}`,
  vtt: (slug) => `public/captions/${slug}.vtt`,
  cleanVtt: (slug) => `public/captions/${slug}.clean.vtt`,
  scenesDir: (slug) => `public/scenes/${slug}`,

  outMp4: (slug) => `out/${slug}.mp4`,
  outThumb: (slug) => `out/thumbnail-${slug}.png`,
  outChunks: (slug) => `out_Vox-${slug}_chunks`,
};

// ── absolute path builders (rel + ROOT) ─────────────────────────────────────
const abs = {};
for (const [k, fn] of Object.entries(rel)) {
  abs[k] = (...args) => path.join(ROOT, fn(...args));
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Ensure books/<slug>/ exists; returns its repo-relative path. */
function ensureBookDir(slug) {
  fs.mkdirSync(abs.bookDir(slug), { recursive: true });
  return rel.bookDir(slug);
}

/** Every book slug (directory under books/), sorted. */
function listBookSlugs() {
  const dir = abs.booksDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Slugs that have a books/<slug>/config.vox.json (renderable Vox books). */
function listVoxSlugs() {
  return listBookSlugs().filter((slug) => fs.existsSync(abs.voxConfig(slug)));
}

/** Slugs that have a books/<slug>/config.antidote.json (renderable Antidote books). */
function listAntidoteSlugs() {
  return listBookSlugs().filter((slug) => fs.existsSync(abs.antidoteConfig(slug)));
}

/** Read a book's manifest (book.json), or null. `engine` field is the pipeline's source of truth. */
function readManifest(slug) {
  try { return JSON.parse(fs.readFileSync(abs.manifest(slug), "utf8")); } catch { return null; }
}

/** Resolve the audio file for a slug (first existing extension), or null. */
function findAudio(slug) {
  for (const ext of AUDIO_EXTS) {
    if (fs.existsSync(abs.audio(slug, ext))) return rel.audio(slug, ext);
  }
  return null;
}

/** Read + parse a JSON file (absolute or repo-relative path). */
function readJSON(p) {
  const full = path.isAbsolute(p) ? p : path.join(ROOT, p);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

module.exports = { ROOT, AUDIO_EXTS, rel, abs, ensureBookDir, listBookSlugs, listVoxSlugs, listAntidoteSlugs, readManifest, findAudio, readJSON };
