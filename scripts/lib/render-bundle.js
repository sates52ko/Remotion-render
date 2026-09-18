/**
 * render-bundle.js — build an ISOLATED, HISTORY-FREE commit for ONE book's render.
 *
 * WHY THIS EXISTS (the multi-agent problem it solves)
 * ---------------------------------------------------
 * The old dispatch force-pushed the SHARED `god-mode` branch to each worker repo.
 * That coupled every concurrent agent to every other one:
 *
 *   1. PUSH PROTECTION DEADLOCK — the push carried the WHOLE history, so one old
 *      commit with a secret in it (AWS_SESSION_REGISTRY.md @ e0a7d39) blocked every
 *      render on every repo that has secret scanning on, forever, for all agents.
 *      A history rewrite was the only fix — on a branch several agents commit to.
 *   2. CROSS-BOOK BLOAT — pushing god-mode shipped EVERY book's audio + scenes to
 *      render ONE book (march's push also carried fences.m4a, 58 MB).
 *   3. FORCED SHARED COMMITS — an agent had to commit its book to `god-mode` before
 *      it could render, so agents raced on the same branch (and on `.git/index.lock`).
 *
 * A render doesn't need history, and it doesn't need other books. So we build a
 * single PARENTLESS commit containing exactly the files THIS book's render reads,
 * straight from the working tree, and push that commit object.
 *
 *   • No parent  → no old commits → secret scanning has nothing to find, ever.
 *   • One book   → smallest possible push; no other agent's assets ride along.
 *   • Working tree, not HEAD → an agent renders WITHOUT committing to god-mode.
 *   • Isolated GIT_INDEX_FILE → never touches the main index, so it cannot collide
 *     with another agent's `git add` (no more `.git/index.lock` failures).
 *   • HEAD, branches and the working tree are left completely untouched.
 *
 * The runner regenerates `src/books.generated.ts` (workflow step "Generate Books
 * Registry") BEFORE rendering, so shipping one book/ directory is correct: the
 * registry rebuilds to just that book.
 *
 * Usage (module):  const { buildBundle } = require("./lib/render-bundle");
 *                  const { sha } = buildBundle({ slug: "march" });
 * Usage (CLI):     node scripts/lib/render-bundle.js --slug=march [--dry]
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

// Code + config the runner needs to install deps, rebuild the registry, master the
// audio and render. Directories are added recursively (.gitignore still applies, so
// render-accounts.json and *.mastered.m4a can never ride along).
const CODE_PATHS = [
  "src",
  "scripts",
  ".github/workflows/render-video.yml",
  "package.json",
  "tsconfig.json",
  "remotion.config.ts",
  ".gitignore",
];

// Assets shared by every Vox book (referenced by literal string in the engine, so
// they don't appear in any book's config and must be listed here).
const SHARED_ASSETS = [
  "public/broll-ocean-tanker/mo-photoshop-background.png",
  "public/sfx/whoosh.wav",
  "public/sfx/tick.wav",
  "public/sfx/ding.wav",
  "public/sfx/thud.wav",
  "public/sfx/pop.wav",
];

const ASSET_RE = /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|m4a|mp3|wav)$/i;

function git(argv, opts = {}) {
  try {
    return execFileSync("git", argv, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // Capture stderr rather than inherit it: `git add` on this repo emits a
      // CRLF warning per file (~140 lines) that buries the actual dispatch log.
      stdio: ["pipe", "pipe", "pipe"],
      ...opts,
    });
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || "").toString().trim();
    throw new Error(`git ${argv[0]} başarısız: ${msg.slice(0, 400)}`);
  }
}

const onDisk = (p) => {
  try {
    return fs.statSync(path.join(ROOT, p)).size > 0;
  } catch {
    return false;
  }
};

/**
 * Deep-scan a book config for asset paths. Engine-agnostic on purpose: Vox keeps them
 * in beats[].images[], Antidote elsewhere, and both shapes keep changing — anything
 * that LOOKS like an asset path and EXISTS under public/ gets bundled.
 */
function assetsFromConfig(cfg) {
  const found = new Set();
  (function walk(v) {
    if (typeof v === "string") {
      if (ASSET_RE.test(v)) found.add(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  })(cfg);
  return found;
}

/**
 * Resolve every repo-relative path this book's render needs.
 * Returns { files, missing } — both repo-relative, forward-slashed.
 */
function resolveFiles(slug) {
  const files = new Set(CODE_PATHS);
  const missing = [];

  // ── the book directory (config, manifest, meta) ────────────────────────────
  const bookDir = `books/${slug}`;
  if (!fs.existsSync(path.join(ROOT, bookDir))) throw new Error(`books/${slug}/ yok.`);
  files.add(bookDir);

  // ── the config that drives the render ──────────────────────────────────────
  const cfgRel = ["config.vox.json", "config.antidote.json"]
    .map((f) => `${bookDir}/${f}`)
    .find((p) => fs.existsSync(path.join(ROOT, p)));
  if (!cfgRel) throw new Error(`${bookDir}/config.{vox,antidote}.json yok — önce plan adımını çalıştır.`);
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, cfgRel), "utf8"));

  // ── assets referenced by the config (paths are relative to public/) ────────
  for (const a of assetsFromConfig(cfg)) {
    // The runner re-masters audio from the raw file, and *.mastered.m4a is gitignored,
    // so a mastered reference must resolve back to its raw source.
    const cands = a.endsWith(".mastered.m4a") ? [a.replace(/\.mastered\.m4a$/, ".m4a"), a] : [a];
    const hit = cands.map((c) => `public/${c}`).find(onDisk);
    if (hit) files.add(hit);
    else missing.push(`public/${cands[0]}`);
  }

  // ── raw narration audio (belt-and-braces: config may name only the mastered one) ──
  const audioExts = [".m4a", ".mp3", ".wav"];
  if (![...files].some((f) => f.startsWith("public/audio/"))) {
    const raw = audioExts.map((e) => `public/audio/${slug}${e}`).find(onDisk);
    if (raw) files.add(raw);
    else missing.push(`public/audio/${slug}.m4a`);
  }

  // ── shared engine assets ───────────────────────────────────────────────────
  for (const s of SHARED_ASSETS) {
    if (onDisk(s)) files.add(s);
    else missing.push(s);
  }

  // The bundle ships the RAW audio (above), so a config naming the mastered file
  // would point at something that is not in the bundle. Report it, and let
  // buildBundle() write a bundle-local config with the raw path.
  const audioNeedsRaw =
    !!cfg && !!cfg.meta && typeof cfg.meta.audio === "string" && /\.mastered\.m4a$/.test(cfg.meta.audio);
  return { files: [...files].sort(), missing, configRel: cfgRel, audioNeedsRaw };
}

/** Total on-disk size of a path (file or directory), in bytes. */
function sizeOf(rel) {
  const abs = path.join(ROOT, rel);
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return 0;
  }
  if (st.isFile()) return st.size;
  let total = 0;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    total += sizeOf(path.posix.join(rel, e.name));
  }
  return total;
}

/**
 * Build the orphan commit. Returns { sha, files, bytes }.
 *
 * Uses an isolated index file so a concurrent agent's `git add` in the main index
 * cannot collide with this one. Writes objects only — no ref, no HEAD move.
 */
function buildBundle({ slug, quiet = false } = {}) {
  if (!slug) throw new Error("buildBundle: slug gerekli.");
  const { files, missing, configRel, audioNeedsRaw } = resolveFiles(slug);

  if (missing.length) {
    const err = new Error(
      `${missing.length} render asset'i DİSKTE YOK — bundle kurulamaz:\n` +
        missing.map((m) => "   " + m).join("\n"),
    );
    err.missing = missing;
    throw err;
  }

  const indexFile = path.join(ROOT, ".git", `render-bundle-${slug}.index`);
  try {
    fs.rmSync(indexFile, { force: true });
  } catch {}
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };

  try {
    git(["read-tree", "--empty"], { env });
    // pathspec-from-file avoids the Windows argv length limit (a book is ~120 paths).
    // -f is required because public/audio, public/scenes, etc. are listed in .gitignore.
    git(["add", "-f", "--pathspec-from-file=-"], { env, input: files.join("\n") });
    // ── meta.audio must name the RAW file INSIDE the bundle ─────────────────
    // *.mastered.m4a is gitignored, so it is never in the bundle; the runner
    // re-masters from the raw file and repoints meta.audio itself (the
    // "Master audio" step in render-video.yml). A config still naming the
    // mastered file therefore pointed at nothing that shipped — and if
    // mastering ever failed, the render produced a SILENT video that the
    // post-render ffprobe check passed happily (it verifies duration and
    // decode, not loudness).
    //
    // Doing it here rather than on disk means no agent has to remember it per
    // book: the local config keeps the mastered path (what you want for Studio
    // preview) and only the bundled copy is re-pointed.
    if (audioNeedsRaw) {
      const localCfg = JSON.parse(fs.readFileSync(path.join(ROOT, configRel), "utf8"));
      localCfg.meta.audio = localCfg.meta.audio.replace(/\.mastered\.m4a$/, ".m4a");
      const blob = git(["hash-object", "-w", "--stdin"], {
        env,
        input: JSON.stringify(localCfg, null, 2),
      }).trim();
      git(["update-index", "--add", "--cacheinfo", "100644," + blob + "," + configRel], { env });
      if (!quiet) console.log("   meta.audio → " + localCfg.meta.audio + "  (bundle only; runner re-masters)");
    }
    const tree = git(["write-tree"], { env }).trim();
    // No -p → PARENTLESS. This is what makes the push history-free.
    const sha = git(["commit-tree", tree, "-m", `render bundle: ${slug}`], { env }).trim();

    const bytes = files.reduce((n, f) => n + sizeOf(f), 0);
    if (!quiet) {
      console.log(`📦 Bundle: ${slug} → ${sha.slice(0, 8)} (tarihsiz, tek commit)`);
      console.log(`   config: ${configRel} · ${files.length} yol · ~${(bytes / 1048576).toFixed(1)} MB`);
    }
    return { sha, files, bytes, configRel };
  } finally {
    try {
      fs.rmSync(indexFile, { force: true });
    } catch {}
  }
}

module.exports = { buildBundle, resolveFiles, ROOT };

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)=(.*)$/);
      return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
    }),
  );
  if (!args.slug) {
    console.error("Kullanım: node scripts/lib/render-bundle.js --slug=<slug> [--dry]");
    process.exit(2);
  }
  try {
    if (args.dry) {
      const { files, missing } = resolveFiles(args.slug);
      const bytes = files.reduce((n, f) => n + sizeOf(f), 0);
      console.log(`\n📦 BUNDLE ÖNİZLEME → ${args.slug}`);
      console.log(`   ${files.length} yol · ~${(bytes / 1048576).toFixed(1)} MB\n`);
      for (const f of files) console.log(`   ${f}  (${(sizeOf(f) / 1048576).toFixed(2)} MB)`);
      if (missing.length) {
        console.log(`\n❌ DİSKTE YOK (${missing.length}):`);
        missing.forEach((m) => console.log("   " + m));
        process.exit(1);
      }
      console.log(`\n✓ tüm asset'ler diskte — bundle kurulabilir (commit GEREKMEZ).`);
    } else {
      buildBundle({ slug: args.slug });
    }
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}
