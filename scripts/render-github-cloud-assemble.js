#!/usr/bin/env node
/**
 * render-github-cloud-assemble.js — join a finished split GitHub render IN THE CLOUD (lib/cloud-assemble.js).
 * Local work is API calls only: no segment download, no ffmpeg. THE standard assembly (2026-10-28, canonical procedure
 * .claude/skills/render-deliver/SKILL.md); render-github-assemble.js is LEGACY / operator-only (--operator-approved).
 *
 *   node scripts/render-github-cloud-assemble.js --slug=<slug> [--worker=<id>] [--download] [--no-wait] [--book-root=<checkout>]
 *   node scripts/render-github-cloud-assemble.js --slug=<slug> --fetch   (download an already cloud-verified film only)
 *
 * 1. reads .render-github-split.<slug>.json (render.js wrote it at dispatch)
 * 2. per segment, picks THE run (its ref, success, this render's bundle commit, live artifact; newest duplicate)
 * 3. pushes a small assembler bundle (scripts + workflow of THIS checkout) to render/<slug>-assemble on the first
 *    segment's worker and dispatches render-video.yml (assemble job) there — works for renders made from any
 *    bundle, old or new; a legacy push without a bundle commit → exit 3 (operator decides, render-status.js)
 * 4. waits, reads the small verify report artifact, writes .render-github-cloud.<slug>.json
 * 5. --download: fetches only the verified final film into out/ (unzip, no ffmpeg) and checks its sha256
 *
 * IDEMPOTENT (2026-10-28): one run per book (lib/run-lock.js, .cloud-assemble-lock.<slug>.json); a render already
 * cloud-verified for the same bundle is NOT assembled again (straight to fetch / post-render); an assemble run already
 * queued or in progress on render/<slug>-assemble is ATTACHED to, never dispatched a second time; before any dispatch
 * the manifest must cover exactly split.totalFrames == the book config's frames (render-preflight.expectedFramesFor).
 *
 * --book-root=<checkout> (default: this checkout): the split state, the cloud state, books/<slug> and out/ are read and
 * written THERE, while the scripts, the assembler bundle and render-accounts.json come from THIS (current) code — so a
 * render dispatched from an older pinned checkout (e.g. a main checkout 76 commits behind, 2026-10-28 Margery Kempe) is
 * joined by the current, tested assembly code without re-rendering anything.
 * Exit 0 = cloud-verified; 1 = assembled film failed verification or the run failed; 2 = usage/state; 3 = unsupported
 * bundle or another assembly of this book is running (lock).
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync, spawnSync } = require("child_process");
const CA = require("./lib/cloud-assemble");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const SLUG = args.slug;
const BOOK = typeof args["book-root"] === "string" && args["book-root"] ? path.resolve(args["book-root"]) : ROOT;
const BR = path.resolve(BOOK) === path.resolve(ROOT) ? "" : ` --book-root=${BOOK}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (code, msg) => { console.error(msg); process.exit(code); };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

function req(w, method, p, { body = null, toFile = null } = {}) {
  return new Promise((resolve, reject) => {
    const go = (url, auth, hops) => {
      const u = new URL(url);
      const headers = { "User-Agent": "render-github-cloud-assemble", Accept: "application/vnd.github+json" };
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

function unzipTo(zip, dir) {
  const r = process.platform === "win32"
    ? spawnSync(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-xf", zip, "-C", dir], { encoding: "utf8" })
    : spawnSync("unzip", ["-o", "-q", zip, "-d", dir], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`unzip failed: ${r.stderr || r.error}`);
}

async function fetchFilm(host, state) {
  const f = state.report.final, fArt = state.finalArtifact;
  const entries = CA.parseManifest(state.manifest);
  const outDir = path.join(BOOK, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const film = path.join(outDir, f.file);
  const stFile = path.join(BOOK, ".render-github-state.json");
  // a rerun after a finished download: the film on disk is the one the cloud verified (recorded sha + size) → no 2nd download
  const prev = readJson(stFile);
  if (prev && prev.slug === SLUG && prev.source === "cloud" && prev.verified && prev.sha256 === f.sha256 && fs.existsSync(film) && fs.statSync(film).size === f.bytes) {
    console.log(`⬇  ${path.relative(BOOK, film)} already downloaded (sha256 recorded = cloud report, same size) — not downloaded again`);
    return;
  }
  const zip = path.join(outDir, `.cloud-${SLUG}.zip`);
  await req(host, "GET", `/repos/${host.username}/${host.repo}/actions/artifacts/${fArt.id}/zip`, { toFile: zip });
  unzipTo(zip, outDir);
  fs.rmSync(zip, { force: true });
  const sha = await CA.sha256File(film);
  if (sha !== f.sha256) die(1, `❌ downloaded ${f.file} sha256 ${sha.slice(0, 12)} != cloud ${f.sha256.slice(0, 12)}`);
  fs.writeFileSync(stFile, JSON.stringify({
    slug: SLUG, mode: state.mode, output: film, split: true, segments: entries.length, verified: true, source: "cloud", cloudRun: state.run.url,
    frames: f.frames, sha256: f.sha256, repos: [...new Set(entries.map((e) => e.repo))],
  }, null, 2) + "\n");
  console.log(`⬇  ${path.relative(BOOK, film)} (sha256 matches the cloud report; no local ffmpeg)`);
}

/** Verified → optional download → the same post-render finalization as before (production only). */
async function finish(host, state) {
  const f = state.report.final;
  console.log(`✅ CLOUD-VERIFIED ${f.file}: ${f.frames}/${f.expected} frames, full decode clean, audio present, ${(f.bytes / 1e6).toFixed(1)} MB — artifact ${state.finalArtifact.name} on ${state.run.url}`);
  if (args.download) await fetchFilm(host, state);
  else console.log(`   download it from the run page, or: node scripts/render-github-cloud-assemble.js --slug=${SLUG} --fetch${BR} (download only, no new run)`);
  // post-render of the checkout that owns the film (its own out/, its own YouTube pack); --book-root = that checkout's script
  const post = path.join(BOOK, "scripts", "post-render.js");
  if (state.mode !== "PREVIEW-ONLY" && fs.existsSync(post) && !args["no-post-render"]) {
    spawnSync(process.execPath, [post, `--slug=${SLUG}`], { cwd: BOOK, stdio: "inherit" });
  }
  console.log(`   final technical check: node scripts/verify-render-output.js --slug=${SLUG}${state.mode === "PREVIEW-ONLY" ? " --preview" : ""}${BR}   ·   state: node scripts/render-status.js --slug=${SLUG}${BR}`);
}

(async () => {
  if (!SLUG) die(2, "usage: node scripts/render-github-cloud-assemble.js --slug=<slug> [--worker=<id>] [--download] [--no-wait] [--book-root=<checkout>] | --fetch");
  if (!fs.existsSync(BOOK)) die(2, `❌ --book-root ${BOOK} does not exist`);
  const stateFile = path.join(BOOK, `.render-github-split.${SLUG}.json`);
  if (!fs.existsSync(stateFile)) die(2, `❌ ${path.basename(stateFile)} missing under ${BOOK} — not a split render (single-job renders use render-github-download.js).`);
  const split = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (split.slug !== SLUG || !Array.isArray(split.segments) || !split.segments.length) die(2, "❌ split state does not describe this slug");
  // ONE assembly per book at a time (any checkout, any harness): a second invocation stops with exit 3 while this lives
  require("./lib/run-lock").takeRunLock(path.join(BOOK, `.cloud-assemble-lock.${SLUG}.json`), `cloud assembly ${SLUG}`);
  const { loadAccounts } = require("./lib/render-pool");
  const acc = loadAccounts();
  const cloudFile = CA.cloudStateFile(BOOK, SLUG);
  const cloudState = readJson(cloudFile);
  const hostOfState = (st) => {
    const [owner, repo] = String(st.run && st.run.repo || "").split("/");
    return (acc.workers || []).find((w) => w.username === owner && w.repo === repo) || null;
  };
  if (args.fetch) {
    if (!cloudState || !cloudState.verified) die(2, `❌ no cloud-verified assembly recorded for ${SLUG} (${path.basename(cloudFile)})`);
    if (split.bundleSha && !CA.verifiedFor(cloudState, split)) die(2, `❌ the verified film in ${path.basename(cloudFile)} is of bundle ${String(cloudState.bundleSha).slice(0, 8)}, this render is ${String(split.bundleSha).slice(0, 8)} — run: node scripts/render-status.js --slug=${SLUG}${BR}`);
    const h = hostOfState(cloudState);
    if (!h) die(2, `❌ worker ${cloudState.run.repo} not in render-accounts.json`);
    return fetchFilm(h, cloudState);
  }
  const workerOf = (sg) => (acc.workers || []).find((w) => w.id === sg.workerId || (w.username === sg.username && w.repo === sg.repo));

  // the bundle commit tells this render's runs from stale duplicates on the same ref; a legacy push has none
  if (!split.bundleSha) die(3, `❌ no bundleSha in the split state (legacy push) — the cloud cannot tell this render's runs from stale ones. The operator decides (node scripts/render-status.js --slug=${SLUG}${BR}); a local join only with an explicit reason: node scripts/render-github-assemble.js --slug=${SLUG}${BR} --operator-approved="<reason>"`);

  // ── 0. already verified for THIS bundle → no second assembly ──
  const early = CA.planCloudAssemble({ slug: SLUG, split, cloudState, assembleRuns: [] });
  if (early.action === "skip") {
    const h = hostOfState(cloudState);
    if (!h) die(2, `❌ worker ${cloudState.run.repo} not in render-accounts.json`);
    console.log(`↺ ${early.reason} — not dispatched again`);
    return finish(h, cloudState);
  }

  // ── 1. the one run per segment ──
  const segs = [...split.segments].sort((a, b) => a.seg - b.seg);
  const entries = [];
  for (const sg of segs) {
    const w = workerOf(sg);
    if (!w || !w.token) die(2, `❌ seg${sg.seg}: worker ${sg.username} not in render-accounts.json`);
    const ref = String(sg.ref || `render/${SLUG}-seg${sg.seg}`).replace(/^refs\/heads\//, "");
    const runs = ((await req(w, "GET", `/repos/${w.username}/${w.repo}/actions/runs?branch=${encodeURIComponent(ref)}&per_page=30`)).workflow_runs || []);
    const artifacts = {};
    for (const r of runs.filter((x) => x.conclusion === "success" && x.head_sha === split.bundleSha)) {
      artifacts[r.id] = ((await req(w, "GET", `/repos/${w.username}/${w.repo}/actions/runs/${r.id}/artifacts`)).artifacts || []).map((a) => ({ name: a.name, expired: a.expired }));
    }
    const pick = CA.pickSegmentRun({ runs, artifacts, ref, bundleSha: split.bundleSha, slug: SLUG, seg: sg.seg });
    if (!pick.run) die(1, `❌ seg${sg.seg} (${w.username}/${w.repo}): ${pick.reason}\n   next: node scripts/render-status.js --slug=${SLUG}${BR}`);
    console.log(`   seg${sg.seg} ${w.username}/${w.repo} run ${pick.run.id} — ${pick.reason}`);
    entries.push({ seg: sg.seg, repo: `${w.username}/${w.repo}`, runId: pick.run.id, start: sg.start, end: sg.end });
  }
  const manifest = CA.buildManifest(entries);
  CA.parseManifest(manifest); // same strict check the runner applies (contiguous frames, segs 1..n)
  // the manifest must cover the WHOLE film: split.totalFrames == the book's config frames == last end + 1
  const total = CA.checkManifestTotal({ manifest, splitTotal: split.totalFrames, expected: require("./lib/render-preflight").expectedFramesFor(BOOK, SLUG) });
  if (!total.ok) die(2, `❌ manifest frame check failed — nothing dispatched:\n   - ${total.problems.join("\n   - ")}`);

  // ── 2. dispatch on one worker (default: the first segment's) — or attach to the assembly already running ──
  // The assembly runs from its OWN small bundle (scripts + workflow of this checkout, render-bundle.js
  // buildAssemblerBundle) on `render/<slug>-assemble` — independent of the render's bundle, so a render made
  // from an older pinned version is joined by the current, tested assembly code. purge-render-branches.js
  // removes it with the segment refs (render/<slug>-*).
  const host = args.worker ? (acc.workers || []).find((w) => w.id === args.worker) : workerOf(segs[0]);
  if (!host) die(2, `❌ worker ${args.worker} not found`);
  const ref = CA.assembleRef(SLUG);
  const asmRuns = ((await req(host, "GET", `/repos/${host.username}/${host.repo}/actions/runs?branch=${encodeURIComponent(ref)}&per_page=10`)).workflow_runs || []);
  const plan = CA.planCloudAssemble({ slug: SLUG, split, cloudState, assembleRuns: asmRuns });
  let run = null;
  const since = Date.now();
  if (plan.action === "attach") {
    run = plan.run;
    console.log(`↪ ${plan.reason} (${run.html_url || `${host.username}/${host.repo}`})`);
  } else {
    const remote = host.remoteName || `render-worker-${(acc.workers || []).indexOf(host) + 1}`;
    const { buildAssemblerBundle } = require("./lib/render-bundle");
    const asm = buildAssemblerBundle({ slug: SLUG });
    try {
      execFileSync("git", ["push", remote, `${asm.sha}:refs/heads/${ref}`, "--force"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } });
    } catch (e) { die(1, `❌ push of the assembler bundle to ${remote} ${ref} failed: ${String((e.stderr || e.message || "")).replace(/(https?:\/\/)[^@/ ]+@/g, "$1***@").slice(0, 300)}`); }
    console.log(`↑ assembler bundle ${asm.sha.slice(0, 8)} → ${host.username}/${host.repo} ${ref}`);
    await sleep(5000); // let GitHub index the new ref before the dispatch names it
    const inputs = { slug: SLUG, assemble_manifest: manifest, ...(split.mode === "PREVIEW-ONLY" ? { preview_only: "true" } : {}) };
    await req(host, "POST", `/repos/${host.username}/${host.repo}/actions/workflows/render-video.yml/dispatches`, { body: JSON.stringify({ ref, inputs }) });
    console.log(`🚀 cloud assembly dispatched on ${host.username}/${host.repo} @ ${ref} (${entries.length} segments, ${total.total} frames)`);
  }
  if (args["no-wait"]) { console.log(`   [--no-wait] follow it with: node scripts/render-status.js --slug=${SLUG}${BR}`); return; }

  // ── 3. wait for that run ──
  for (let t = 0; t < 360; t++) { // ≤ 2 h at 20 s
    await sleep(20000);
    if (plan.action === "attach") {
      run = await req(host, "GET", `/repos/${host.username}/${host.repo}/actions/runs/${plan.run.id}`);
    } else {
      const runs = ((await req(host, "GET", `/repos/${host.username}/${host.repo}/actions/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=10`)).workflow_runs || []);
      run = runs.filter((r) => new Date(r.created_at).getTime() >= since - 60000).sort((a, b) => b.id - a.id)[0] || null;
    }
    if (run && run.status === "completed") break;
    process.stdout.write(`\r⏳ ${run ? run.status : "queued"} … ${Math.round((Date.now() - since) / 1000)}s   `);
  }
  console.log("");
  if (!run || run.status !== "completed") die(1, `❌ the cloud assembly run did not complete in time — it may still be running: node scripts/render-status.js --slug=${SLUG}${BR} (a rerun attaches to it, never dispatches a second one)`);
  const arts = ((await req(host, "GET", `/repos/${host.username}/${host.repo}/actions/runs/${run.id}/artifacts`)).artifacts || []);
  const vArt = arts.find((a) => a.name === CA.VERIFY_ARTIFACT(SLUG));
  const fArt = arts.find((a) => a.name === CA.FINAL_ARTIFACT(SLUG));
  let report = null;
  if (vArt) {
    const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "cloud-verify-"));
    await req(host, "GET", `/repos/${host.username}/${host.repo}/actions/artifacts/${vArt.id}/zip`, { toFile: path.join(tmp, "v.zip") });
    unzipTo(path.join(tmp, "v.zip"), tmp);
    try { report = JSON.parse(fs.readFileSync(path.join(tmp, `${SLUG}.verify.json`), "utf8")); } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const state = {
    slug: SLUG, at: new Date().toISOString(), bundleSha: split.bundleSha, mode: split.mode || "PRODUCTION",
    run: { repo: `${host.username}/${host.repo}`, id: run.id, url: run.html_url, conclusion: run.conclusion },
    manifest, finalArtifact: fArt ? { id: fArt.id, name: fArt.name, bytes: fArt.size_in_bytes } : null,
    verified: !!(report && report.ok && run.conclusion === "success" && fArt), report,
  };
  fs.writeFileSync(cloudFile, JSON.stringify(state, null, 2) + "\n");
  if (!state.verified) die(1, `❌ cloud assembly NOT verified (${run.conclusion}): ${(report && (report.error || (report.final && report.final.problems || []).join("; "))) || "no report"} — ${run.html_url}\n   next: node scripts/render-status.js --slug=${SLUG}${BR} (retry the cloud; a local join is operator-only: --operator-approved="<reason>")`);
  await finish(host, state);
})().catch((e) => die(1, `❌ ${e.message}`));
