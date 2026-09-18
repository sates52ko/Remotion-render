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
if (!SLUG) { console.error("Kullanım: node scripts/render-github-redispatch.js --slug=<slug>"); process.exit(1); }

const perSlug = path.join(ROOT, `.render-github-split.${SLUG}.json`);
const splitPath = fs.existsSync(perSlug) ? perSlug : path.join(ROOT, ".render-github-split.json");
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
  if (!_bundleSha) _bundleSha = buildBundle({ slug: SLUG }).sha;
  return _bundleSha;
}

/** Push the isolated bundle to this segment's ref so the dispatch can find it. */
function ensureRef(w, sg) {
  if (args["no-push"]) return true;
  const remote = w.remoteName || `render-worker-${sg.seg}`;
  const ref = sg.ref.replace("refs/heads/", "");
  try {
    const rpOut = execSync(`git push ${remote} ${bundleSha()}:refs/heads/${ref} --force 2>&1`, {
      cwd: ROOT, encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    });
    if (rpOut.trim()) console.log(`    ${rpOut.trim()}`);
    return true;
  } catch (e) {
    console.error(`    ❌ push başarısız: ${String(e.message).slice(0, 200)}`);
    return false;
  }
}

async function dispatch(w, sg) {
  const payload = JSON.stringify({ ref: sg.ref, inputs: {
    slug: SLUG, composition: split.composition,
    chunk_size: "400", concurrency: "2",
    frames: `${sg.start}-${sg.end}`, seg: String(sg.seg),
  } });
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
    try {
      const runs = JSON.parse(execFileSync("gh", [
        "run", "list", "--repo", `${w.username}/${w.repo}`,
        "--workflow", "render-video.yml", "-L", "10",
        "--json", "status,conclusion,headBranch",
      ], { encoding: "utf8", env: { ...process.env, GH_TOKEN: w.token, GITHUB_TOKEN: w.token, NO_COLOR: "1" } }) || "[]");
      found = runs.find((r) => r.headBranch === ref || r.headBranch === sg.ref);
    } catch {}

    if (found && !forceAll) {
      const st = found.status === "completed"
        ? (found.conclusion === "success" ? "✅" : `❌ ${found.conclusion}`)
        : `⏳ ${found.status}`;
      console.log(`  seg${sg.seg} @${w.username}: ${st}`);
      ok++;
    } else {
      const reason = forceAll ? "(--force)" : "workflow bulunamadı";
      console.log(`  seg${sg.seg} @${w.username}: ${reason} → bundle push + yeniden tetikleniyor...`);
      if (!ensureRef(w, sg)) { failed++; continue; }
      const success = await dispatch(w, sg);
      if (success) { console.log(`    ✓ tetiklendi`); redispatched++; }
      else { failed++; }
    }
  }

  console.log(`\n${ok} çalışıyor/bitti · ${redispatched} yeniden tetiklendi · ${failed} başarısız`);
  if (failed > 0) process.exit(1);
})();
