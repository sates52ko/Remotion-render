"use strict";
/**
 * cloud-thumbs.js — a book's A/B/C thumbnails rendered ON A RUNNER, inside the existing render pipeline (2026-11-06).
 *
 * NOT a second thumbnail system: the runner runs the same scripts/render-thumbnails.js (grammar, hook, hook-visibility
 * check, thumbnail-check.json) in the `thumbnails` job of .github/workflows/render-video.yml. This module only builds
 * the bundle that job checks out, dispatches / fetches it, verifies what came back and installs it.
 *
 *   production split render — render-github-cloud-assemble.js pushes thumbBundle as the assembler bundle and dispatches
 *                     assemble + thumbnails in ONE run (thumbnails `needs: assemble`, once per film, never per segment);
 *                     finish() installs them (finalizeThumbs). Missing / stale / failed → one thumbnail-only run.
 *   thumbnail-only  — node scripts/render-thumbnails.js --slug=<slug> --cloud [--book-root=<checkout>]
 *                     the same job alone (no manifest): no film is rendered, joined, verified, uploaded or published.
 *
 * Authority: a thumbnail run writes ONLY out/thumbnail-<slug>{,-b,-c}.png, books/<slug>/thumbnail-check.json, the
 * youtube.md Test & Compare block and its own record .render-github-thumbs.<slug>.json. It never touches the split /
 * cloud / render state, never runs post-render or verify-render-output, never records YouTube READY. The runner job has
 * `contents: read` only and the bundle carries no narration audio, so it cannot render the film.
 *
 * Staleness: thumbInputHash = what the Thumb composition reads (meta.thumbnail + title/author, the book config,
 * book.json, the hero image bytes). A pack rendered from other inputs is refused, never installed.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const PACK_SCHEMA = "thumbs/1";
const THUMBS_ARTIFACT = (slug) => `thumbs-${slug}`;
const thumbsRef = (slug) => `render/${slug}-thumbs`;
const thumbsStateFile = (root, slug) => path.join(root, `.render-github-thumbs.${slug}.json`);
const LETTERS = ["A", "B", "C"];
const thumbFile = (slug, i) => `thumbnail-${slug}${i ? "-" + LETTERS[i].toLowerCase() : ""}.png`;
// code the runner needs: install deps, rebuild the registry, bundle the Thumb composition, render, check the hook;
// scripts + the workflow also make it a complete ASSEMBLER bundle (the assemble job sparse-checks out scripts/ only)
const CODE_PATHS = ["src", "scripts", "data", ".github/workflows/render-video.yml", "package.json", "tsconfig.json", "remotion.config.ts", ".gitignore"];
const AUDIO_RE = /\.(m4a|mp3|wav|aac|flac|ogg|opus|aiff?)$/i;
const SECRET_RE = /(^|\/)(render-accounts[^/]*\.json|\.env(\.[^/]*)?|[^/]*\.pem|id_(rsa|ed25519)[^/]*|\.npmrc|\.netrc|credentials[^/]*\.json)$/i;
const FILE_LIMIT = 50 * 1024 * 1024;
const VOX_BG = "public/broll-ocean-tanker/mo-photoshop-background.png"; // src/engines/vox/backgrounds.ts BG
const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "")); } catch { return null; } };
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const sha256File = (f) => sha256(fs.readFileSync(f));
/** stable JSON: sorted keys, so the same content hashes the same on Windows and on the runner */
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object"
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v === undefined ? null : v));

function bookFiles(bookRoot, slug) {
  const b = path.join(bookRoot, "books", slug);
  const meta = readJson(path.join(b, "youtube-meta.json"));
  const cfgName = ["config.antidote.json", "config.vox.json"].find((f) => fs.existsSync(path.join(b, f))) || null;
  const cfg = cfgName ? readJson(path.join(b, cfgName)) : null;
  const book = readJson(path.join(b, "book.json"));
  const thumb = (meta && meta.thumbnail) || (cfg && cfg.meta && cfg.meta.thumbnail) || {};
  const engine = (book && book.engine) || (cfgName === "config.antidote.json" ? "antidote" : "vox");
  return { meta, cfg, cfgName, book, thumb, engine };
}

/** Hero / cut-out images the meta names (repo paths under public/). */
function heroAssets(thumb) {
  return [thumb && thumb.image, thumb && thumb.cut].filter((x) => typeof x === "string" && x).map((x) => `public/${x.replace(/^public\//, "")}`);
}

/**
 * The hero images the Thumb composition will actually READ. Vox: always. Antidote: only when a rendered variant's
 * layout is cinematic-bleed (src/engines/antidote/Thumbnail.tsx; the layout = grammar.layout, else the legacy
 * thumbnail.layout — resolveGrammar), and then the default scenes/<slug>/thumbnail-hero.png when the meta names none.
 */
function neededHeroAssets(thumb, engine, slug) {
  if (engine !== "antidote") return heroAssets(thumb);
  const vs = Array.isArray(thumb.variants) && thumb.variants.length ? thumb.variants.slice(0, 3) : [thumb.grammar || null];
  if (!vs.some((g) => ((g && g.layout) || thumb.layout) === "cinematic-bleed")) return [];
  const named = heroAssets({ image: thumb.image });
  return named.length ? named : [`public/scenes/${slug}/thumbnail-hero.png`];
}

/** What the thumbnails are made from. Equal hash = the same thumbnails; any input change = stale. */
function thumbInputHash(bookRoot, slug) {
  const { meta, cfg, book, thumb } = bookFiles(bookRoot, slug);
  const heroes = {};
  for (const rel of heroAssets(thumb)) { const p = path.join(bookRoot, rel); heroes[rel] = fs.existsSync(p) ? sha256File(p) : null; }
  return sha256(canon({ thumbnail: thumb, title: (meta && meta.title) || null, author: (meta && meta.author) || null, cfg, book, heroes })).slice(0, 16);
}

/**
 * What finalization does about thumbnails (pure). → { action: "none" | "skip" | "install" | "dispatch", reason }
 *   none     — not this run's business (preview, frozen book, opted out)
 *   skip     — current thumbnails are installed already (same inputs, files on disk)
 *   install  — the assembly run made them: fetch + verify + install
 *   dispatch — one thumbnail-only run
 */
function planThumbs({ mode, published, noThumbnails, state, inputHash, filesOk, runHasThumbs }) {
  if (noThumbnails) return { action: "none", reason: "--no-thumbnails" };
  if (published) return { action: "none", reason: "published (PUBLISHED_BOOKS.md) — frozen, its thumbnail already shipped" };
  if (mode === "PREVIEW-ONLY") return { action: "none", reason: "preview render — thumbnails belong to production finalization (thumbnail-only: render-thumbnails.js --cloud)" };
  if (state && state.installed && state.inputHash === inputHash && filesOk) return { action: "skip", reason: `thumbnails already installed for these inputs (${inputHash}, run ${state.run && state.run.url})` };
  if (runHasThumbs) return { action: "install", reason: "the assembly run rendered them" };
  return { action: "dispatch", reason: state && state.inputHash && state.inputHash !== inputHash ? `inputs changed since the last thumbnails (${state.inputHash} → ${inputHash})` : "no current thumbnails" };
}

/** The installed files of a state record are still on disk, byte-identical. */
function installedFilesOk(bookRoot, state) {
  if (!state || !state.files) return false;
  return Object.entries(state.files).every(([rel, h]) => { const p = path.join(bookRoot, rel); return fs.existsSync(p) && sha256File(p) === h; });
}

/**
 * Check an unpacked thumbs artifact (dir with record.json). → { ok, problems, record }
 * Every file's sha256 must match the record, the record must be of THIS slug and of the CURRENT inputs, A must exist.
 */
function verifyPack({ dir, slug, inputHash }) {
  const problems = [];
  const record = readJson(path.join(dir, "record.json"));
  if (!record) return { ok: false, problems: ["no record.json in the thumbs artifact"], record: null };
  if (record.schema !== PACK_SCHEMA) problems.push(`record schema ${record.schema} != ${PACK_SCHEMA}`);
  if (record.slug !== slug) problems.push(`record is of ${record.slug}, not ${slug}`);
  if (record.inputHash !== inputHash) problems.push(`STALE: rendered from inputs ${record.inputHash}, the book is now ${inputHash} — run the thumbnails again`);
  for (const [f, h] of Object.entries(record.files || {})) {
    if (f.includes("/") || f.includes("\\") || f.startsWith(".")) { problems.push(`unsafe file name in record: ${f}`); continue; }
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) problems.push(`${f} missing from the artifact`);
    else if (sha256File(p) !== h) problems.push(`${f} sha256 does not match the record`);
  }
  if (!(record.files || {})[thumbFile(slug, 0)]) problems.push(`A (${thumbFile(slug, 0)}) was not rendered`);
  return { ok: !problems.length, problems, record };
}

/**
 * Install a verified pack into the book checkout. Writes ONLY: out/thumbnail-<slug>*.png,
 * books/<slug>/thumbnail-check.json, the youtube.md Test & Compare block, the thumbs state record. Returns the state.
 */
function installPack({ dir, record, bookRoot, slug, run = null }) {
  const out = path.join(bookRoot, "out");
  fs.mkdirSync(out, { recursive: true });
  const files = {};
  for (const v of record.variants || []) {
    if (!(record.files || {})[v.file]) continue;
    fs.copyFileSync(path.join(dir, v.file), path.join(out, v.file));
    files[`out/${v.file}`] = record.files[v.file];
  }
  if ((record.files || {})["thumbnail-check.json"]) {
    const rel = `books/${slug}/thumbnail-check.json`;
    fs.copyFileSync(path.join(dir, "thumbnail-check.json"), path.join(bookRoot, rel));
    files[rel] = record.files["thumbnail-check.json"];
  }
  const done = (record.variants || []).filter((v) => files[`out/${v.file}`]);
  require("./thumb-render").writeTestCompareBlock(bookRoot, slug, done.map((v) => ({ letter: v.letter, rel: `out/${v.file}`, grammar: v.grammar })));
  const state = {
    slug, at: new Date().toISOString(), installed: true, inputHash: record.inputHash, hook: record.hook,
    hookVisible: record.hookVisible, variants: done.map((v) => v.letter), files, run, renderedAt: record.at,
  };
  fs.writeFileSync(thumbsStateFile(bookRoot, slug), JSON.stringify(state, null, 2) + "\n");
  return state;
}

// ── runner side: render-thumbnails.js --pack=<dir> ──────────────────────────
/** Collect what render-thumbnails produced into <dir> with record.json (sha256 per file). */
function writePack({ dir, root, slug, jobs, checks, hook, exitCode }) {
  fs.mkdirSync(dir, { recursive: true });
  const files = {};
  const variants = [];
  jobs.forEach((j) => {
    const i = LETTERS.indexOf(j.letter);
    if (i < 0 || !fs.existsSync(j.file)) return;
    const name = thumbFile(slug, i); // by letter: a failed A never turns B into "A"
    fs.copyFileSync(j.file, path.join(dir, name));
    files[name] = sha256File(path.join(dir, name));
    variants.push({ letter: j.letter, file: name, grammar: j.grammar || null });
  });
  const check = path.join(root, "books", slug, "thumbnail-check.json");
  if (fs.existsSync(check)) { fs.copyFileSync(check, path.join(dir, "thumbnail-check.json")); files["thumbnail-check.json"] = sha256File(check); }
  const record = {
    schema: PACK_SCHEMA, slug, at: new Date().toISOString(), inputHash: thumbInputHash(root, slug), hook,
    hookVisible: checks.length ? checks.every((c) => c.hookVisible !== false) : null, checks, variants, files, exitCode,
    runner: process.env.GITHUB_REPOSITORY || null, runId: process.env.GITHUB_RUN_ID || null,
  };
  fs.writeFileSync(path.join(dir, "record.json"), JSON.stringify(record, null, 2) + "\n");
  return record;
}

// ── the bundle ──────────────────────────────────────────────────────────────
/**
 * The files of the thumbnail bundle: CODE_PATHS from `root` (tracked + untracked-not-ignored: the working tree, as
 * stills-cloud does) + books/<slug>/ from `bookRoot` + the public/ assets the Thumb composition reads (Antidote: the
 * config's non-audio assets + engine sfx; Vox: the hero / cut-out + the shared background). No narration audio.
 * → { entries: [{ path, abs }], problems }
 */
function thumbBundleFiles({ slug, root = ROOT, bookRoot = root }) {
  const problems = [];
  const git = (a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const listed = [...git(["ls-files", "-z", "--", ...CODE_PATHS]).split("\0"), ...git(["ls-files", "-z", "--others", "--exclude-standard", "--", ...CODE_PATHS]).split("\0")];
  const map = new Map();
  for (const rel of listed.filter(Boolean)) { const abs = path.join(root, rel); if (fs.existsSync(abs) && fs.statSync(abs).isFile()) map.set(rel, abs); }
  if (map.size < 100) problems.push(`only ${map.size} code files under ${root} — refusing an incomplete bundle`);
  // the book: books/<slug>/ of the book checkout, no audio
  const bookDir = path.join(bookRoot, "books", slug);
  if (!fs.existsSync(bookDir)) problems.push(`books/${slug}/ not found under ${bookRoot}`);
  else (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && !AUDIO_RE.test(e.name)) map.set(path.relative(bookRoot, abs).split(path.sep).join("/"), abs);
    }
  })(bookDir);
  const { thumb, engine } = bookFiles(bookRoot, slug);
  const assets = new Set(neededHeroAssets(thumb, engine, slug));
  if (engine === "antidote") {
    const { resolveFiles } = require("./render-bundle");
    for (const f of resolveFiles(slug, { root: bookRoot }).files) if (f.startsWith("public/") && (!AUDIO_RE.test(f) || f.startsWith("public/sfx/"))) assets.add(f);
  } else assets.add(VOX_BG);
  for (const rel of assets) {
    const abs = [path.join(bookRoot, rel), path.join(root, rel)].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
    if (abs) map.set(rel, abs);
    else problems.push(`${rel} (read by the Thumb composition) is not on disk`);
  }
  for (const [rel, abs] of map) {
    if (SECRET_RE.test(rel)) { map.delete(rel); continue; }
    if (fs.statSync(abs).size > FILE_LIMIT) problems.push(`${rel} is over ${FILE_LIMIT / 1048576} MB`);
  }
  return { entries: [...map].map(([p, abs]) => ({ path: p, abs })).sort((a, b) => a.path.localeCompare(b.path)), problems };
}

/** Parentless, deterministic commit of thumbBundleFiles (isolated index; no branch, HEAD or working tree touched). */
function buildThumbBundle({ slug, root = ROOT, bookRoot = root, quiet = false }) {
  const { entries, problems } = thumbBundleFiles({ slug, root, bookRoot });
  if (problems.length) throw new Error(`thumbnail bundle refused:\n   - ${problems.join("\n   - ")}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thumbs-bundle-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, "index") };
  const git = (a, input) => execFileSync("git", a, { cwd: root, env, input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  try {
    git(["read-tree", "--empty"]);
    const shas = git(["hash-object", "-w", "--no-filters", "--stdin-paths"], entries.map((e) => e.abs).join("\n") + "\n").trim().split(/\r?\n/);
    if (shas.length !== entries.length) throw new Error(`hash-object returned ${shas.length} ids for ${entries.length} files`);
    git(["update-index", "--add", "--index-info"], entries.map((e, i) => `100644 ${shas[i]}\t${e.path}`).join("\n") + "\n");
    const tree = git(["write-tree"]).trim();
    const id = { GIT_AUTHOR_NAME: "render-bundle", GIT_AUTHOR_EMAIL: "render-bundle@localhost", GIT_COMMITTER_NAME: "render-bundle", GIT_COMMITTER_EMAIL: "render-bundle@localhost", GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" };
    const sha = execFileSync("git", ["commit-tree", tree, "-m", `thumbnail bundle: ${slug}`], { cwd: root, env: { ...env, ...id }, encoding: "utf8" }).trim();
    const bytes = entries.reduce((n, e) => n + fs.statSync(e.abs).size, 0);
    if (!quiet) console.log(`📦 Thumbnail bundle: ${slug} → ${sha.slice(0, 8)} (${entries.length} files, ${(bytes / 1048576).toFixed(1)} MB, no audio; also a complete assembler bundle)`);
    return { sha, files: entries.length, bytes, inputHash: thumbInputHash(bookRoot, slug) };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/**
 * Before a bundle: the grammar must exist (thumbnail-grammar.js picks it against the CHANNEL history, which only the
 * book checkout has — never on a runner). Missing → run the standard deterministic step (make-book 5.4) when the book
 * lives in this checkout; with --book-root, refuse with the command. Returns null when ready, else the reason.
 */
function ensureGrammar({ slug, root = ROOT, bookRoot = root, log = console.log }) {
  const { thumb } = bookFiles(bookRoot, slug);
  if (thumb.grammar && thumb.grammar.layout) return null;
  const cmd = `node scripts/thumbnail-grammar.js --slug=${slug} --write`;
  if (path.resolve(bookRoot) !== path.resolve(root)) return `no youtube-meta.thumbnail.grammar — run in ${bookRoot}: ${cmd}`;
  log(`   thumbnail.grammar missing → ${cmd} (deterministic, channel-aware; the standard make-book step 5.4)`);
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "thumbnail-grammar.js"), `--slug=${slug}`, "--write"], { cwd: root, stdio: "inherit" });
  return r.status === 0 && bookFiles(bookRoot, slug).thumb.grammar ? null : `thumbnail-grammar.js --write failed (exit ${r.status})`;
}

function isPublished(slug, roots) {
  const { publishedSlugs } = require("./thumbnail-grammar");
  return [...new Set(roots.map((r) => path.resolve(r)))].some((r) => publishedSlugs(r).includes(slug));
}

// ── GitHub I/O ──────────────────────────────────────────────────────────────
function ghReq(w, method, p, { body = null, toFile = null } = {}) {
  return new Promise((resolve, reject) => {
    const go = (url, auth, hops) => {
      const u = new URL(url);
      const headers = { "User-Agent": "cloud-thumbs", Accept: "application/vnd.github+json" };
      if (auth) headers.Authorization = `Bearer ${w.token}`;
      if (body) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = Buffer.byteLength(body); }
      const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: hops ? "GET" : method, headers }, (res) => {
        if ([301, 302, 307].includes(res.statusCode) && res.headers.location && hops < 3) { res.resume(); return go(res.headers.location, false, hops + 1); }
        if (toFile && res.statusCode < 300) { const ws = fs.createWriteStream(toFile); res.pipe(ws); ws.on("finish", () => resolve(toFile)).on("error", reject); return; }
        let b = ""; res.on("data", (d) => (b += d));
        res.on("end", () => {
          if (res.statusCode >= 400) return reject(Object.assign(new Error(`HTTP ${res.statusCode} ${method} ${u.pathname}: ${b.slice(0, 200)}`), { status: res.statusCode }));
          try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({ raw: b }); }
        });
      });
      r.on("error", reject);
      if (body && !hops) r.write(body);
      r.end();
    };
    go(`https://api.github.com${p}`, true, 0);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function unzipTo(zip, dir) {
  const r = process.platform === "win32"
    ? spawnSync(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-xf", zip, "-C", dir], { encoding: "utf8" })
    : spawnSync("unzip", ["-o", "-q", zip, "-d", dir], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`unzip failed: ${r.stderr || r.error}`);
}
const remoteOf = (acc, w) => w.remoteName || `render-worker-${(acc.workers || []).indexOf(w) + 1}`;

/** The thumbs artifact of a run, or null. */
async function thumbsArtifactOf(host, runId, slug) {
  const arts = ((await ghReq(host, "GET", `/repos/${host.username}/${host.repo}/actions/runs/${runId}/artifacts`)).artifacts || []);
  return arts.find((a) => a.name === THUMBS_ARTIFACT(slug) && !a.expired) || null;
}

/** Download + verify + install the thumbs artifact of a run. → { ok, state?, problems, record? } */
async function fetchAndInstall({ host, runId, runUrl, slug, bookRoot, log = console.log }) {
  const art = await thumbsArtifactOf(host, runId, slug);
  if (!art) return { ok: false, problems: [`run ${runId} has no ${THUMBS_ARTIFACT(slug)} artifact (thumbnails job failed or skipped — see ${runUrl || "the run"})`] };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thumbs-fetch-"));
  try {
    const zip = path.join(tmp, "t.zip");
    await ghReq(host, "GET", `/repos/${host.username}/${host.repo}/actions/artifacts/${art.id}/zip`, { toFile: zip });
    const dir = path.join(tmp, "x");
    fs.mkdirSync(dir);
    unzipTo(zip, dir);
    const v = verifyPack({ dir, slug, inputHash: thumbInputHash(bookRoot, slug) });
    if (!v.ok) return { ok: false, problems: v.problems, record: v.record };
    const state = installPack({ dir, record: v.record, bookRoot, slug, run: { repo: `${host.username}/${host.repo}`, id: runId, url: runUrl || null, artifact: art.name } });
    for (const [rel] of Object.entries(state.files)) log(`   ✓ ${rel}`);
    const checks = v.record.checks || [];
    for (const c of checks) log(`   ${c.hookVisible ? "✓" : c.hookVisible === false ? "✗" : "?"} ${c.letter} hook ${c.hookVisible ? "visible" : c.hookVisible === false ? "NOT VISIBLE" : "unchecked"} — ${c.detail}`);
    return { ok: true, state, problems: [], record: v.record };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** Wait for a run to complete (≤ waitMin). → the run (completed or not). */
async function waitRun(host, runId, { waitMin = 45, log = (s) => process.stdout.write(s) } = {}) {
  const since = Date.now();
  let run = null;
  for (;;) {
    run = await ghReq(host, "GET", `/repos/${host.username}/${host.repo}/actions/runs/${runId}`);
    if (run.status === "completed" || Date.now() - since > waitMin * 60000) break;
    log(`\r⏳ thumbnails run ${run.status} … ${Math.round((Date.now() - since) / 1000)}s   `);
    await sleep(20000);
  }
  log("\n");
  return run;
}

/**
 * Thumbnail-only cloud run: bundle → push render/<slug>-thumbs → dispatch the `thumbnails` job alone → wait → install.
 * Attaches to a run already active on that ref instead of dispatching a second one. → { ok, state?, problems, run? }
 */
async function runThumbnailsOnly({ slug, bookRoot, root = ROOT, host, acc, wait = true, log = console.log }) {
  const ref = thumbsRef(slug);
  const repo = `/repos/${host.username}/${host.repo}`;
  const listRuns = async () => ((await ghReq(host, "GET", `${repo}/actions/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=10`)).workflow_runs || []);
  const inputHash = thumbInputHash(bookRoot, slug);
  const prev = readJson(thumbsStateFile(bookRoot, slug));
  let run = (await listRuns()).filter((r) => ACTIVE.has(r.status)).sort((a, b) => b.id - a.id)[0] || null;
  if (run && prev && prev.dispatched && prev.dispatched.inputHash === inputHash && prev.dispatched.runId === run.id) {
    log(`↪ thumbnails run ${run.id} is already ${run.status} for these inputs — attaching, not dispatching a second one`);
  } else {
    if (run) log(`   (a thumbnails run ${run.id} is ${run.status} for other inputs — dispatching a new one for ${inputHash})`);
    const b = buildThumbBundle({ slug, root, bookRoot });
    const remote = remoteOf(acc, host);
    try {
      execFileSync("git", ["push", remote, `${b.sha}:refs/heads/${ref}`, "--force"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } });
    } catch (e) { return { ok: false, problems: [`push of the thumbnail bundle to ${remote} ${ref} failed: ${String(e.stderr || e.message || "").replace(/(https?:\/\/)[^@/ ]+@/g, "$1***@").slice(0, 300)}`] }; }
    log(`↑ thumbnail bundle ${b.sha.slice(0, 8)} → ${host.username}/${host.repo} ${ref}`);
    await sleep(5000);
    const since = Date.now();
    await ghReq(host, "POST", `${repo}/actions/workflows/render-video.yml/dispatches`, { body: JSON.stringify({ ref, inputs: { slug, thumbnails: "true" } }) });
    log(`🚀 thumbnail-only run dispatched on ${host.username}/${host.repo} @ ${ref} (no film is rendered, joined or published)`);
    run = null;
    for (let i = 0; i < 24 && !run; i++) { await sleep(5000); run = (await listRuns()).filter((r) => Date.parse(r.created_at) >= since - 60000).sort((a, b) => b.id - a.id)[0] || null; }
    if (!run) return { ok: false, problems: [`the dispatched thumbnails run did not appear on ${host.username}/${host.repo} ${ref}`] };
    fs.writeFileSync(thumbsStateFile(bookRoot, slug), JSON.stringify({ ...(prev || {}), slug, dispatched: { at: new Date().toISOString(), inputHash, bundleSha: b.sha, runId: run.id, url: run.html_url, repo: `${host.username}/${host.repo}` } }, null, 2) + "\n");
  }
  if (!wait) { log(`   [--no-wait] ${run.html_url} — then: node scripts/render-thumbnails.js --slug=${slug} --cloud --fetch`); return { ok: true, pending: true, run, problems: [] }; }
  run = await waitRun(host, run.id);
  if (run.status !== "completed") return { ok: false, run, problems: [`thumbnails run ${run.id} did not complete in time (${run.html_url}) — fetch later: node scripts/render-thumbnails.js --slug=${slug} --cloud --fetch`] };
  const got = await fetchAndInstall({ host, runId: run.id, runUrl: run.html_url, slug, bookRoot, log });
  return { ...got, run };
}

/** The worker a book's cloud thumbnails run on: its split render's first worker, else its cloud assembly's, else the first active one. */
function hostFor({ acc, bookRoot, slug, workerId = null }) {
  const ws = (acc.workers || []).filter((w) => w.active !== false && w.token);
  if (workerId) return ws.find((w) => w.id === workerId) || null;
  const split = readJson(path.join(bookRoot, `.render-github-split.${slug}.json`));
  const sg = split && split.slug === slug && (split.segments || []).slice().sort((a, b) => a.seg - b.seg)[0];
  const bySeg = sg && ws.find((w) => w.id === sg.workerId || (w.username === sg.username && w.repo === sg.repo));
  if (bySeg) return bySeg;
  const cloud = readJson(path.join(bookRoot, `.render-github-cloud.${slug}.json`));
  const [o, r] = String((cloud && cloud.run && cloud.run.repo) || "").split("/");
  return ws.find((w) => w.username === o && w.repo === r) || ws[0] || null;
}

/**
 * Production finalization (render-github-cloud-assemble.js finish()): install the thumbnails the assembly run made,
 * or run them once (thumbnail-only). Never throws for a thumbnail problem — the film is never affected.
 * → { ok, action, problems, state? }
 */
async function finalizeThumbs({ slug, bookRoot, root = ROOT, acc, host, mode, assembleRun = null, noThumbnails = false, log = console.log }) {
  try {
    const inputHash = thumbInputHash(bookRoot, slug);
    const state = readJson(thumbsStateFile(bookRoot, slug));
    let runHasThumbs = false;
    if (assembleRun && assembleRun.id && !noThumbnails && mode !== "PREVIEW-ONLY") {
      try { runHasThumbs = !!(await thumbsArtifactOf(host, assembleRun.id, slug)); } catch { runHasThumbs = false; }
    }
    const plan = planThumbs({ mode, published: isPublished(slug, [root, bookRoot]), noThumbnails, state, inputHash, filesOk: installedFilesOk(bookRoot, state), runHasThumbs });
    log(`\n🖼️  Thumbnails A/B/C: ${plan.action} — ${plan.reason}`);
    if (plan.action === "none" || plan.action === "skip") return { ok: true, action: plan.action, problems: [] };
    if (plan.action === "install") {
      const got = await fetchAndInstall({ host, runId: assembleRun.id, runUrl: assembleRun.url, slug, bookRoot, log });
      if (got.ok) return { ok: true, action: "install", state: got.state, problems: [] };
      log(`   ⚠ the assembly run's thumbnails were not installed: ${got.problems.join("; ")} — one thumbnail-only run instead`);
    }
    const g = ensureGrammar({ slug, root, bookRoot, log });
    if (g) return { ok: false, action: "dispatch", problems: [g] };
    const th = hostFor({ acc, bookRoot, slug }) || host;
    const got = await runThumbnailsOnly({ slug, bookRoot, root, host: th, acc, log });
    return { ok: got.ok, action: "dispatch", state: got.state, problems: got.problems };
  } catch (e) {
    return { ok: false, action: "error", problems: [e.message] };
  }
}

module.exports = {
  PACK_SCHEMA, THUMBS_ARTIFACT, thumbsRef, thumbsStateFile, thumbFile, CODE_PATHS, canon,
  thumbInputHash, heroAssets, neededHeroAssets, planThumbs, installedFilesOk, verifyPack, installPack, writePack,
  thumbBundleFiles, buildThumbBundle, ensureGrammar, isPublished, hostFor,
  ghReq, thumbsArtifactOf, fetchAndInstall, runThumbnailsOnly, finalizeThumbs,
};
