#!/usr/bin/env node
/**
 * render-github-redispatch.js — check which segments of a split render are
 * actually running on GitHub Actions, and re-dispatch any that aren't.
 *
 * Uses the correct worker token for each account (from render-accounts.json),
 * so it works even when `gh auth` is logged into a different account.
 *
 * Re-dispatch alone is not enough: a dispatch fails with 422 "No ref found" when the
 * segment's ref was never created (e.g. its push was rejected). So this also PUSHES
 * the isolated bundle to any missing ref first — see scripts/lib/render-bundle.js.
 *
 * Usage:
 *   node scripts/render-github-redispatch.js --slug=<slug>
 *   node scripts/render-github-redispatch.js --slug=<slug> --seg=2,6   (only re-check specific segments)
 *   node scripts/render-github-redispatch.js --slug=<slug> --force      (re-dispatch ALL, even running ones)
 *   node scripts/render-github-redispatch.js --slug=<slug> --no-push    (dispatch only, never push)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const { loadAccounts, parseArgs } = require("./lib/render-pool");
const { buildBundle } = require("./lib/render-bundle");

const args = parseArgs(process.argv.slice(2));
const SLUG = args.slug;
if (!SLUG) { console.error("Kullanım: node scripts/render-github-redispatch.js --slug=<slug> [--book-root=<pinned book worktree>]"); process.exit(1); }
// --book-root (2026-10-30): a render dispatched by render.js --book-root lives in the book's pinned worktree (state +
// bundle); this checkout's tools rescue it without touching the pin
const BOOK = typeof args["book-root"] === "string" && args["book-root"].trim() ? path.resolve(args["book-root"].trim()) : ROOT;
if (BOOK !== ROOT) {
  const chk = require("./lib/book-root").checkBookRoot({ launcher: ROOT, bookRoot: BOOK, slug: SLUG });
  if (!chk.ok) { console.error(`❌ --book-root: ${chk.error}`); process.exit(2); }
}

const perSlug = path.join(BOOK, `.render-github-split.${SLUG}.json`);
const splitPath = fs.existsSync(perSlug) ? perSlug : path.join(BOOK, ".render-github-split.json");
if (!fs.existsSync(splitPath)) { console.error(`❌ Split state dosyası bulunamadı: .render-github-split.${SLUG}.json`); process.exit(1); }
const split = JSON.parse(fs.readFileSync(splitPath, "utf8"));
if (split.slug !== SLUG) { console.error(`❌ State slug'ı '${split.slug}', istenen '${SLUG}'.`); process.exit(1); }

const acc = loadAccounts();
const workers = (acc.workers || []).filter((w) => w.active !== false && w.token);
const onlySegs = args.seg ? String(args.seg).split(",").map(Number) : null;
const forceAll = !!args.force;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Build the bundle at most once, and only if a segment actually needs pushing.
let _bundleSha = null;
function bundleSha() {
  if (!_bundleSha) {
    // the render's OWN bundle first: its commit is still in the local object store after the dispatch, so a missing
    // ref gets exactly what the other segments rendered — no rebuild, no audit of a tree that may have moved on
    const have = (c) => { try { execFileSync("git", ["cat-file", "-e", `${c}^{commit}`], { cwd: ROOT, stdio: "ignore" }); return true; } catch { return false; } };
    if (split.bundleSha && !args["new-bundle"] && have(split.bundleSha)) { _bundleSha = split.bundleSha; return _bundleSha; }
    const sha = buildBundle({ slug: SLUG, root: BOOK }).sha;
    // segments of ONE render must come from ONE bundle (bundles are deterministic: same tree, same sha). A different
    // sha means the code or the book changed since the render was dispatched — mixing would splice two versions.
    // A render dispatched before bundles were deterministic has a time-stamped sha: same TREE = same inputs, so the
    // recorded commit is pushed (the refs then match what already ran).
    const treeOf = (c) => { try { return execFileSync("git", ["rev-parse", `${c}^{tree}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
    if (split.bundleSha && sha !== split.bundleSha && treeOf(sha) && treeOf(sha) === treeOf(split.bundleSha)) { _bundleSha = split.bundleSha; return _bundleSha; }
    if (split.bundleSha && sha !== split.bundleSha && !args["new-bundle"]) {
      throw new Error(`the working tree now builds bundle ${sha.slice(0, 8)}, but this render was dispatched with ${String(split.bundleSha).slice(0, 8)} — re-pushing would mix two versions in one film. Restore the render's inputs, or start a new render (render.js --new-render="<reason>"); --new-bundle overrides.`);
    }
    _bundleSha = sha;
  }
  return _bundleSha;
}

/**
 * Push the isolated bundle to this segment's ref so the dispatch can find it — only when the worker's ref does not
 * already hold it, and never past a permanent refusal (size limit / pre-receive / auth): see lib/render-dispatch.js.
 */
const rd = require("./lib/render-dispatch");
async function ensureRef(w, sg) {
  if (args["no-push"]) return true;
  const remote = sg.remoteName || w.remoteName || `render-worker-${sg.seg}`;
  const ref = sg.ref.replace("refs/heads/", "");
  const seg = { ...sg, ref, remoteName: remote };
  // ask the worker first: a ref that already holds the render's bundle needs nothing (and no bundle is built)
  if (split.bundleSha && !args["new-bundle"] && (await rd.gitIO({ root: BOOK, sha: split.bundleSha }).remoteSha(seg)) === split.bundleSha) {
    console.log(`    ref already holds ${String(split.bundleSha).slice(0, 8)} — not pushed again`);
    return true;
  }
  let sha;
  try { sha = bundleSha(); } catch (e) { console.error(`    ❌ bundle refused before any push:\n${e.message}`); return false; }
  const io = rd.gitIO({ root: BOOK, sha });
  if ((await io.remoteSha(seg)) === sha) { console.log(`    ref already holds ${sha.slice(0, 8)} — not pushed again`); return true; }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await io.push(seg);
    if (r.ok) { Object.assign(sg, { pushed: sha, pushedAt: new Date().toISOString(), pushError: null, pushErrorKind: null }); saveSplit(); return true; }
    const kind = rd.classifyPushError(r.output);
    Object.assign(sg, { pushError: rd.redact(r.output).slice(-600), pushErrorKind: kind });
    saveSplit();
    console.error(`    ❌ push failed (${kind}): ${rd.redact(r.output).trim().split("\n").slice(-2).join(" | ")}`);
    if (kind === "permanent" || attempt === 3) return false;
    await sleep(5000 * 2 ** (attempt - 1));
  }
  return false;
}
function saveSplit() { try { fs.writeFileSync(splitPath, JSON.stringify(split, null, 2) + "\n"); } catch {} }

async function dispatch(w, sg) {
  const inputs = {
    slug: SLUG, composition: split.composition,
    chunk_size: String(split.chunkSize || "400"), concurrency: String(split.concurrency || "2"),
    frames: `${sg.start}-${sg.end}`, seg: String(sg.seg),
  };
  // a preview render stays a preview render
  if (split.mode === "PREVIEW-ONLY") inputs.preview_only = "true";
  if (args["skip-narrative-firewall"]) inputs.skip_narrative_firewall = "1";
  // workflow_dispatch wants the branch name, not "refs/heads/…": with the full ref GitHub
  // answers 204 but creates no run (2026-10-20 burn redispatch incident).
  const payload = JSON.stringify({ ref: sg.ref.replace("refs/heads/", ""), inputs });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await new Promise((resolve) => {
      const rq = https.request({
        hostname: "api.github.com",
        path: `/repos/${w.username}/${w.repo}/actions/workflows/render-video.yml/dispatches`,
        method: "POST",
        timeout: 30000,
        headers: { "User-Agent": "Remotion-Render-Orchestrator", Authorization: `Bearer ${w.token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      }, (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => resolve({ code: res.statusCode, b })); });
      rq.on("timeout", () => { rq.destroy(); });
      rq.on("error", (e) => resolve({ code: 0, b: e.message }));
      rq.write(payload); rq.end();
    });
    if (r.code === 204) { return true; }
    if (attempt < 3) { console.warn(`    retry ${attempt}/3 (HTTP ${r.code})`); await sleep(attempt * 5000); }
    else { console.error(`    ❌ 3 deneme sonrası başarısız (HTTP ${r.code} ${r.b})`); return false; }
  }
}

(async () => {
  console.log(`\n🔍 ${SLUG} — ${split.segments.length} segment kontrol ediliyor...\n`);
  let ok = 0, redispatched = 0, failed = 0;

  for (const sg of split.segments) {
    if (onlySegs && !onlySegs.includes(sg.seg)) continue;
    const w = workers.find((x) => x.username === sg.username) || workers.find((x) => x.id === sg.workerId);
    if (!w) { console.log(`  seg${sg.seg}: worker ${sg.username} bulunamadı`); failed++; continue; }

    const ref = sg.ref.replace("refs/heads/", "");
    let found = null;
    let unreadable = false;
    try {
      const runs = JSON.parse(execFileSync("gh", [
        "run", "list", "--repo", `${w.username}/${w.repo}`,
        "--workflow", "render-video.yml", "-L", "30",
        "--json", "status,conclusion,headBranch,createdAt",
      ], { encoding: "utf8", env: { ...process.env, GH_TOKEN: w.token, GITHUB_TOKEN: w.token, NO_COLOR: "1" } }) || "[]");
      // only a run of THIS render counts: created after this segment (or the render) was dispatched
      const since = Date.parse(sg.dispatchedAt || sg.pushedAt || split.dispatchedAt || 0) - 60000;
      found = runs.find((r) => (r.headBranch === ref || r.headBranch === sg.ref) && (r.status !== "completed" || !(Date.parse(r.createdAt) < since)));
    } catch { unreadable = true; }

    if (unreadable && !forceAll) {
      // "could not read" is not "absent": re-dispatching blind can start a second run of the same frames
      console.log(`  seg${sg.seg} @${w.username}: run list unreadable — not re-dispatched (retry later, or --force)`);
      failed++;
      continue;
    }

    if (found && !forceAll) {
      const st = found.status === "completed"
        ? (found.conclusion === "success" ? "✅" : `❌ ${found.conclusion}`)
        : `⏳ ${found.status}`;
      console.log(`  seg${sg.seg} @${w.username}: ${st}`);
      ok++;
    } else {
      const reason = forceAll ? "(--force)" : "workflow bulunamadı";
      console.log(`  seg${sg.seg} @${w.username}: ${reason} → bundle push + yeniden tetikleniyor...`);
      if (!(await ensureRef(w, sg))) { failed++; continue; }
      const success = await dispatch(w, sg);
      if (success) { console.log(`    ✓ tetiklendi`); redispatched++; Object.assign(sg, { dispatchedAt: new Date().toISOString(), dispatchCode: 204 }); saveSplit(); }
      else { failed++; }
    }
  }

  console.log(`\n${ok} çalışıyor/bitti · ${redispatched} yeniden tetiklendi · ${failed} başarısız`);
  if (failed > 0) process.exit(1);
})();
