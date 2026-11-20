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
 * PUSH-SET AUDIT (2026-10-27, thinking-fast-and-slow: 9 of 10 worker pushes refused by GitHub's 100 MB pre-receive
 * hook, nothing dispatched, hours lost). The bundle commit is parentless, so the objects a worker receives are
 * EXACTLY the blobs of its tree. buildBundle() therefore audits the written tree itself (`git ls-tree -r -l`), not
 * the working-tree paths it was built from: a directory added with -f can carry ignored files a path list never
 * names. Before any ref is pushed it STOPS on a blob GitHub would refuse, drops audio the render does not read (only
 * the narration the config resolves to and the engine's sfx ship), and checks the narration itself: the file the
 * bundled config names is in the tree, decodes, and lasts as long as the config and the captions (auditBundle).
 *
 * Usage (module):  const { buildBundle } = require("./lib/render-bundle");
 *                  const { sha } = buildBundle({ slug: "march" });
 * Usage (CLI):     node scripts/lib/render-bundle.js --slug=march [--dry]
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { rawAudioFor, isMastered, validate, vttEnd, durationVsVtt, rawCandidates, GITHUB_FILE_LIMIT } = require("./audio-source");

const ROOT = path.join(__dirname, "..", "..");
// GitHub warns above 50 MB and refuses above 100 MB per file (pre-receive hook, GH001).
const GITHUB_WARN = 50 * 1024 * 1024;

// Code + config the runner needs to install deps, rebuild the registry, master the
// audio and render. Directories are added recursively WITH -f, so ignored files inside
// them ride along too — which is why the written tree is audited (auditBundle), not this list.
const CODE_PATHS = [
  "src",
  "scripts",
  "data",
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
const AUDIO_RE = /\.(m4a|mp3|wav|aac|flac|ogg|opus|aiff?)$/i;
const SECRET_RE = /(^|\/)(render-accounts[^/]*\.json|\.env(\.[^/]*)?|[^/]*\.pem|id_(rsa|ed25519)[^/]*|\.npmrc|\.netrc|credentials[^/]*\.json)$/i;

function git(argv, opts = {}) {
  const { root = ROOT, ...rest } = opts;
  try {
    return execFileSync("git", argv, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // Capture stderr rather than inherit it: `git add` on this repo emits a
      // CRLF warning per file (~140 lines) that buries the actual dispatch log.
      stdio: ["pipe", "pipe", "pipe"],
      ...rest,
    });
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || "").toString().trim();
    throw new Error(`git ${argv[0]} başarısız: ${msg.slice(0, 400)}`);
  }
}

const onDiskIn = (root) => (p) => {
  try {
    return fs.statSync(path.join(root, p)).size > 0;
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
function resolveFiles(slug, { root = ROOT } = {}) {
  const onDisk = onDiskIn(root);
  const files = new Set(CODE_PATHS.filter((p) => fs.existsSync(path.join(root, p))));
  const missing = [];

  // ── the book directory (config, manifest, meta) ────────────────────────────
  const bookDir = `books/${slug}`;
  if (!fs.existsSync(path.join(root, bookDir))) throw new Error(`books/${slug}/ yok.`);
  files.add(bookDir);

  // ── the config that drives the render ──────────────────────────────────────
  const cfgRel = ["config.vox.json", "config.antidote.json"]
    .map((f) => `${bookDir}/${f}`)
    .find((p) => fs.existsSync(path.join(root, p)));
  if (!cfgRel) throw new Error(`${bookDir}/config.{vox,antidote}.json yok — önce plan adımını çalıştır.`);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, cfgRel), "utf8"));

  // ── assets referenced by the config (paths are relative to public/) ────────
  for (const a of assetsFromConfig(cfg)) {
    // The runner re-masters audio from the raw file, and *.mastered.m4a is gitignored,
    // so a mastered reference must resolve back to its raw source — .m4a or .mp3 (audio-source.js).
    const cands = isMastered(a) ? [rawAudioFor(root, a, slug), a] : [a];
    const hit = cands.map((c) => `public/${c}`).find(onDisk);
    if (hit) files.add(hit);
    else missing.push(`public/${cands[0]}`);
  }

  // ── raw narration audio (belt-and-braces: config may name only the mastered one) ──
  if (![...files].some((f) => f.startsWith("public/audio/"))) {
    const raw = `public/${rawAudioFor(root, `audio/${slug}.mastered.m4a`, slug)}`;
    if (onDisk(raw)) files.add(raw);
    else missing.push(`public/audio/${slug}.m4a (or .mp3)`);
  }

  // ── shared engine assets ───────────────────────────────────────────────────
  for (const s of SHARED_ASSETS) {
    if (onDisk(s)) files.add(s);
    else missing.push(s);
  }

  // The bundle ships the RAW audio (above), so a config naming the mastered file
  // would point at something that is not in the bundle. Report it, and let
  // buildBundle() write a bundle-local config with the raw path.
  const audioNeedsRaw = !!cfg && !!cfg.meta && typeof cfg.meta.audio === "string" && isMastered(cfg.meta.audio);
  const rawAudio = audioNeedsRaw ? rawAudioFor(root, cfg.meta.audio, slug) : null;
  // the narration the bundled config will name (relative to public/)
  const narration = cfg && cfg.meta && typeof cfg.meta.audio === "string" ? (audioNeedsRaw ? rawAudio : String(cfg.meta.audio).replace(/^public\//, "")) : null;
  return { files: [...files].sort(), missing, configRel: cfgRel, audioNeedsRaw, rawAudio, narration, cfg };
}

/** Total on-disk size of a path (file or directory), in bytes. */
function sizeOf(rel, root = ROOT) {
  const abs = path.join(root, rel);
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return 0;
  }
  if (st.isFile()) return st.size;
  let total = 0;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    total += sizeOf(path.posix.join(rel, e.name), root);
  }
  return total;
}

/** Every blob of a tree, with its size: [{ path, oid, bytes }] — exactly what a push of a parentless commit sends. */
function treeBlobs(tree, opts = {}) {
  return git(["ls-tree", "-r", "-l", "-z", tree], opts)
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      const [mode, type, oid, size] = line.slice(0, tab).trim().split(/\s+/);
      return { path: line.slice(tab + 1), mode, type, oid, bytes: size === "-" ? 0 : Number(size) };
    })
    .filter((b) => b.type === "blob");
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

/** seconds the config renders (frames / fps), or null */
function configSeconds(cfg) {
  const meta = (cfg && cfg.meta) || {};
  const n = Number((cfg && cfg.totalFrames) || meta.totalFrames || meta.durationInFrames);
  const fps = Number(meta.fps) || 30;
  return n > 0 ? n / fps : null;
}

/**
 * Audit a bundle BEFORE anything is pushed. Pure over its inputs (testable without git):
 *   blobs     — treeBlobs() of the written tree (the real push set)
 *   narration — the audio the bundled config names, relative to public/ (or null)
 *   allowed   — repo paths of audio the render reads (config assets + shared sfx)
 *   probeAudio(rel) → validate() result for a narration file (decode + length)
 *   cfgSeconds, vttSeconds — what the narration must match
 *   others    — other raw narrations of this slug on disk ({ rel, bytes }) for the pinned-book advice
 * Returns { problems[], warnings[], drop[] } — drop = stray audio blobs to remove from the tree.
 */
function auditBundle({ blobs, narration, allowed, probeAudio, cfgSeconds = null, vttSeconds = null, others = [], limit = GITHUB_FILE_LIMIT }) {
  const problems = [], warnings = [];
  const allowedSet = new Set(allowed || []);
  const drop = blobs.filter((b) => AUDIO_RE.test(b.path) && !allowedSet.has(b.path));
  const kept = blobs.filter((b) => !drop.includes(b));
  // git add -f on a directory also adds IGNORED files: a credentials file inside a bundled dir would go to ten repos
  for (const b of kept) if (SECRET_RE.test(b.path)) problems.push(`${b.path} looks like a credentials file — it must never be pushed to a worker (move it out of the bundled directory)`);
  for (const b of kept) {
    if (b.bytes > limit) {
      let fix = "";
      if (narration && b.path === `public/${narration}`) {
        const alt = others.find((o) => o.rel !== b.path && o.bytes <= limit);
        fix = alt
          ? ` — a smaller narration exists (${alt.rel}, ${mb(alt.bytes)}): if it is the same recording, switch explicitly: node scripts/lib/audio-source.js --slug=<slug> --use=${path.extname(alt.rel).slice(1)} (checks it is the same length; the render input does not change)`
          : " — export a smaller MP3 of the same recording as public/audio/<slug>.mp3";
      }
      problems.push(`${b.path} is ${mb(b.bytes)} — over GitHub's 100 MB file limit; every worker would refuse the push${fix}`);
    } else if (b.bytes > GITHUB_WARN) warnings.push(`${b.path} is ${mb(b.bytes)} — GitHub warns above 50 MB; ten workers each receive it`);
  }
  if (narration) {
    const inTree = kept.find((b) => b.path === `public/${narration}`);
    if (!inTree) problems.push(`the bundled config names audio "${narration}" but the bundle has no public/${narration} — the runner could not master it`);
    else if (probeAudio) {
      const v = probeAudio(narration);
      if (!v.ok) problems.push(...v.problems.map((p) => `narration: ${p}`));
      warnings.push(...(v.warnings || []).map((w) => `narration: ${w}`));
      const sec = v.info && Number.isFinite(v.info.duration) ? v.info.duration : null;
      // A render that runs PAST its narration is broken (silence, or another recording): stop. Narration running well past
      // the plan (an outro, a trimmed plan) renders exactly as before this check existed: warn, never refuse a book
      // that rendered fine.
      if (sec != null && cfgSeconds != null) {
        if (cfgSeconds > sec + 2) problems.push(`the config renders ${cfgSeconds.toFixed(1)} s but ${narration} lasts ${sec.toFixed(1)} s — this is not the narration the config was planned on`);
        else if (sec - cfgSeconds > Math.max(30, 0.05 * sec)) warnings.push(`${narration} lasts ${sec.toFixed(1)} s but the config renders only ${cfgSeconds.toFixed(1)} s — is this the narration the config was planned on?`);
      }
      const dv = durationVsVtt(sec, vttSeconds);
      // captions of the SAME recording end up to ~2 s past the audio (measured on this repo's books): only a large
      // overshoot means another recording; anything smaller renders exactly as it did before this check existed
      const far = sec != null && vttSeconds != null && vttSeconds > sec + Math.max(10, 0.01 * sec);
      for (const p of dv.problems) (far && /belongs to another recording/.test(p) ? problems : warnings).push(`narration vs captions: ${p}`);
      warnings.push(...dv.warnings.map((w) => `narration vs captions: ${w}`));
    }
  }
  return { problems, warnings, drop };
}

/**
 * Build the orphan commit. Returns { sha, files, bytes, blobs, dropped, warnings }.
 *
 * Uses an isolated index file so a concurrent agent's `git add` in the main index
 * cannot collide with this one. Writes objects only — no ref, no HEAD move.
 * Throws (err.oversize / err.audit) BEFORE anything is pushed when the audit finds a problem.
 * checkNarration:false skips the decode (tests on synthetic audio do their own).
 */
function buildBundle({ slug, quiet = false, root = ROOT, checkNarration = true } = {}) {
  if (!slug) throw new Error("buildBundle: slug gerekli.");
  const { files, missing, configRel, audioNeedsRaw, rawAudio, narration, cfg } = resolveFiles(slug, { root });

  if (missing.length) {
    const err = new Error(
      `${missing.length} render asset'i DİSKTE YOK — bundle kurulamaz:\n` +
        missing.map((m) => "   " + m).join("\n"),
    );
    err.missing = missing;
    throw err;
  }

  // --git-path: in a linked worktree `.git` is a FILE, so `<root>/.git/<x>` cannot be created there
  // ("Unable to create … index.lock", 2026-10-23); git names the right per-worktree admin path itself.
  const indexFile = path.resolve(root, git(["rev-parse", "--git-path", `render-bundle-${slug}.index`], { root }).trim());
  try {
    fs.rmSync(indexFile, { force: true });
  } catch {}
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };

  try {
    git(["read-tree", "--empty"], { env, root });
    // pathspec-from-file avoids the Windows argv length limit (a book is ~120 paths).
    // -f is required because public/audio, public/scenes, etc. are listed in .gitignore.
    git(["add", "-f", "--pathspec-from-file=-"], { env, root, input: files.join("\n") });
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
      const localCfg = JSON.parse(fs.readFileSync(path.join(root, configRel), "utf8"));
      localCfg.meta.audio = rawAudio; // the raw that shipped — .m4a or .mp3
      const blob = git(["hash-object", "-w", "--stdin"], {
        env,
        root,
        input: JSON.stringify(localCfg, null, 2),
      }).trim();
      git(["update-index", "--add", "--cacheinfo", "100644," + blob + "," + configRel], { env, root });
      if (!quiet) console.log("   meta.audio → " + localCfg.meta.audio + "  (bundle only; runner re-masters)");
    }
    let tree = git(["write-tree"], { env, root }).trim();

    // ── PUSH-SET AUDIT: the real blobs, before any ref is pushed ───────────────
    const allowed = files.filter((f) => AUDIO_RE.test(f) && !fs.statSync(path.join(root, f)).isDirectory());
    const others = rawCandidates(root, slug).map((rel) => ({ rel, bytes: fs.statSync(path.join(root, rel)).size }));
    const vtt = path.join(root, "public", "captions", `${slug}.vtt`);
    const audit = auditBundle({
      blobs: treeBlobs(tree, { env, root }),
      narration,
      allowed,
      others,
      cfgSeconds: configSeconds(cfg),
      vttSeconds: vttEnd(vtt),
      probeAudio: checkNarration ? (rel) => validate(path.join(root, "public", rel)) : null,
    });
    if (audit.drop.length) {
      // audio the render never reads (e.g. an ignored copy inside books/<slug>/): not shipped
      git(["rm", "--cached", "-q", "--pathspec-from-file=-"], { env, root, input: audit.drop.map((b) => b.path).join("\n") });
      tree = git(["write-tree"], { env, root }).trim();
      if (!quiet) for (const b of audit.drop) console.log(`   dropped ${b.path} (${mb(b.bytes)}) — audio the render does not read`);
    }
    if (audit.problems.length) {
      const big = audit.problems.filter((p) => /100 MB file limit/.test(p));
      const err = new Error(
        `bundle refused before any push (${audit.problems.length}):\n` + audit.problems.map((p) => "   " + p).join("\n"),
      );
      err.audit = audit;
      if (big.length) err.oversize = big;
      throw err;
    }
    if (!quiet) for (const w of audit.warnings) console.warn(`   ⚠ ${w}`);
    const blobs = treeBlobs(tree, { env, root });
    // No -p → PARENTLESS. This is what makes the push history-free.
    // DETERMINISTIC: fixed author/committer + date, so the same tree is the same commit. A rerun after a failed push
    // then finds the refs that already hold it (render-dispatch.js) instead of uploading a "new" identical bundle.
    const id = { GIT_AUTHOR_NAME: "render-bundle", GIT_AUTHOR_EMAIL: "render-bundle@localhost", GIT_COMMITTER_NAME: "render-bundle", GIT_COMMITTER_EMAIL: "render-bundle@localhost", GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" };
    const sha = git(["commit-tree", tree, "-m", `render bundle: ${slug}`], { env: { ...env, ...id }, root }).trim();

    const bytes = blobs.reduce((n, b) => n + b.bytes, 0);
    const largest = blobs.slice().sort((a, b) => b.bytes - a.bytes)[0];
    if (!quiet) {
      console.log(`📦 Bundle: ${slug} → ${sha.slice(0, 8)} (tarihsiz, tek commit)`);
      console.log(`   config: ${configRel} · ${blobs.length} blob · ${mb(bytes)} · largest ${largest ? `${largest.path} ${mb(largest.bytes)}` : "-"}${narration ? ` · narration ${narration}` : ""}`);
    }
    return { sha, files, bytes, blobs, configRel, narration, dropped: audit.drop.map((b) => b.path), warnings: audit.warnings };
  } finally {
    try {
      fs.rmSync(indexFile, { force: true });
    } catch {}
  }
}

// ── assembler bundle (cloud assembly, 2026-10-24) ─────────────────────────────
// The cloud assembly job needs only the scripts + the workflow — no book, no assets. Building it from the CURRENT
// working tree (not from the render's bundle) means any split render can be joined in the cloud, including one
// whose bundle was built before the assemble job existed (agents render on pinned versions).
const ASSEMBLER_PATHS = ["scripts", ".github/workflows/render-video.yml", "package.json", ".gitignore"];
function buildAssemblerBundle({ slug, quiet = false } = {}) {
  if (!slug) throw new Error("buildAssemblerBundle: slug gerekli.");
  const indexFile = path.resolve(ROOT, git(["rev-parse", "--git-path", `render-assembler-${slug}.index`]).trim());
  try { fs.rmSync(indexFile, { force: true }); } catch {}
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  try {
    git(["read-tree", "--empty"], { env });
    git(["add", "--pathspec-from-file=-"], { env, input: ASSEMBLER_PATHS.filter((p) => fs.existsSync(path.join(ROOT, p))).join("\n") }); // a dir's size is 0 on Windows
    const tree = git(["write-tree"], { env }).trim();
    const sha = git(["commit-tree", tree, "-m", `assembler bundle: ${slug}`], { env }).trim();
    if (!quiet) console.log(`📦 Assembler bundle: ${slug} → ${sha.slice(0, 8)} (scripts + workflow only)`);
    return { sha };
  } finally {
    try { fs.rmSync(indexFile, { force: true }); } catch {}
  }
}

module.exports = { buildBundle, buildAssemblerBundle, resolveFiles, auditBundle, treeBlobs, configSeconds, AUDIO_RE, GITHUB_WARN, ROOT };

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
      console.log(`\n✓ tüm asset'ler diskte — bundle kurulabilir (commit GEREKMEZ). Gerçek blob denetimi: --audit`);
    } else {
      // --audit: build the commit object (no ref, nothing pushed) and print the audit — the same check render.js runs
      buildBundle({ slug: args.slug });
    }
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}
