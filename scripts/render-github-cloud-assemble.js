#!/usr/bin/env node
/**
 * render-github-cloud-assemble.js — join a finished split GitHub render IN THE CLOUD (lib/cloud-assemble.js).
 * Local work is API calls only: no segment download, no ffmpeg. render-github-assemble.js stays the local fallback.
 *
 *   node scripts/render-github-cloud-assemble.js --slug=<slug> [--worker=<id>] [--download] [--no-wait]
 *   node scripts/render-github-cloud-assemble.js --slug=<slug> --fetch   (download an already cloud-verified film only)
 *
 * 1. reads .render-github-split.<slug>.json (render.js wrote it at dispatch)
 * 2. per segment, picks THE run (its ref, success, this render's bundle commit, live artifact; newest duplicate)
 * 3. pushes a small assembler bundle (scripts + workflow of THIS checkout) to render/<slug>-assemble on the first
 *    segment's worker and dispatches render-video.yml (assemble job) there — works for renders made from any
 *    bundle, old or new; a legacy push without a bundle commit → exit 3, use the local fallback
 * 4. waits, reads the small verify report artifact, writes .render-github-cloud.<slug>.json
 * 5. --download: fetches only the verified final film into out/ (unzip, no ffmpeg) and checks its sha256
 * Exit 0 = cloud-verified; 1 = assembled film failed verification or the run failed; 2 = usage/state; 3 = unsupported bundle.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync, spawnSync } = require("child_process");
const CA = require("./lib/cloud-assemble");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const SLUG = args.slug;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (code, msg) => { console.error(msg); process.exit(code); };

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
  const outDir = path.join(ROOT, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const zip = path.join(outDir, `.cloud-${SLUG}.zip`);
  await req(host, "GET", `/repos/${host.username}/${host.repo}/actions/artifacts/${fArt.id}/zip`, { toFile: zip });
  unzipTo(zip, outDir);
  fs.rmSync(zip, { force: true });
  const film = path.join(outDir, f.file);
  const sha = await CA.sha256File(film);
  if (sha !== f.sha256) die(1, `❌ downloaded ${f.file} sha256 ${sha.slice(0, 12)} != cloud ${f.sha256.slice(0, 12)}`);
  fs.writeFileSync(path.join(ROOT, ".render-github-state.json"), JSON.stringify({
    slug: SLUG, mode: state.mode, output: film, split: true, segments: entries.length, verified: true, source: "cloud", cloudRun: state.run.url,
    frames: f.frames, sha256: f.sha256, repos: [...new Set(entries.map((e) => e.repo))],
  }, null, 2) + "\n");
  console.log(`⬇  out/${f.file} (sha256 matches the cloud report; no local ffmpeg)`);
}

(async () => {
  if (!SLUG) die(2, "usage: node scripts/render-github-cloud-assemble.js --slug=<slug> [--worker=<id>] [--download] [--no-wait] | --fetch");
  const stateFile = path.join(ROOT, `.render-github-split.${SLUG}.json`);
  if (!fs.existsSync(stateFile)) die(2, `❌ ${path.basename(stateFile)} missing — not a split render (single-job renders use render-github-download.js).`);
  const split = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (split.slug !== SLUG || !Array.isArray(split.segments) || !split.segments.length) die(2, "❌ split state does not describe this slug");
  const { loadAccounts } = require("./lib/render-pool");
  const acc = loadAccounts();
  if (args.fetch) {
    const cf = path.join(ROOT, `.render-github-cloud.${SLUG}.json`);
    const st = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, "utf8")) : null;
    if (!st || !st.verified) die(2, `❌ no cloud-verified assembly recorded for ${SLUG} (.render-github-cloud.${SLUG}.json)`);
    const [owner, repo] = st.run.repo.split("/");
    const h = (acc.workers || []).find((w) => w.username === owner && w.repo === repo);
    if (!h) die(2, `❌ worker ${st.run.repo} not in render-accounts.json`);
    return fetchFilm(h, st);
  }
  const workerOf = (sg) => (acc.workers || []).find((w) => w.id === sg.workerId || (w.username === sg.username && w.repo === sg.repo));

  // the bundle commit tells this render's runs from stale duplicates on the same ref; a legacy push has none
  if (!split.bundleSha) die(3, "❌ no bundleSha in the split state (legacy push) — use the local fallback: node scripts/render-github-assemble.js --slug=" + SLUG);

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
    if (!pick.run) die(1, `❌ seg${sg.seg} (${w.username}/${w.repo}): ${pick.reason}`);
    console.log(`   seg${sg.seg} ${w.username}/${w.repo} run ${pick.run.id} — ${pick.reason}`);
    entries.push({ seg: sg.seg, repo: `${w.username}/${w.repo}`, runId: pick.run.id, start: sg.start, end: sg.end });
  }
  const manifest = CA.buildManifest(entries);
  CA.parseManifest(manifest); // same strict check the runner applies (contiguous frames, segs 1..n)

  // ── 2. dispatch on one worker (default: the first segment's) ──
  // The assembly runs from its OWN small bundle (scripts + workflow of this checkout, render-bundle.js
  // buildAssemblerBundle) on `render/<slug>-assemble` — independent of the render's bundle, so a render made
  // from an older pinned version is joined by the current, tested assembly code. purge-render-branches.js
  // removes it with the segment refs (render/<slug>-*).
  const host = args.worker ? (acc.workers || []).find((w) => w.id === args.worker) : workerOf(segs[0]);
  if (!host) die(2, `❌ worker ${args.worker} not found`);
  const remote = host.remoteName || `render-worker-${(acc.workers || []).indexOf(host) + 1}`;
  const ref = `render/${SLUG}-assemble`;
  const { buildAssemblerBundle } = require("./lib/render-bundle");
  const asm = buildAssemblerBundle({ slug: SLUG });
  try {
    execFileSync("git", ["push", remote, `${asm.sha}:refs/heads/${ref}`, "--force"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } });
  } catch (e) { die(1, `❌ push of the assembler bundle to ${remote} ${ref} failed: ${String((e.stderr || e.message || "")).replace(/(https?:\/\/)[^@/ ]+@/g, "$1***@").slice(0, 300)}`); }
  console.log(`↑ assembler bundle ${asm.sha.slice(0, 8)} → ${host.username}/${host.repo} ${ref}`);
  await sleep(5000); // let GitHub index the new ref before the dispatch names it
  const since = Date.now();
  const inputs = { slug: SLUG, assemble_manifest: manifest, ...(split.mode === "PREVIEW-ONLY" ? { preview_only: "true" } : {}) };
  await req(host, "POST", `/repos/${host.username}/${host.repo}/actions/workflows/render-video.yml/dispatches`, { body: JSON.stringify({ ref, inputs }) });
  console.log(`🚀 cloud assembly dispatched on ${host.username}/${host.repo} @ ${ref} (${entries.length} segments)`);
  if (args["no-wait"]) return;

  // ── 3. wait for that run ──
  let run = null;
  for (let t = 0; t < 360; t++) { // ≤ 2 h at 20 s
    await sleep(20000);
    const runs = ((await req(host, "GET", `/repos/${host.username}/${host.repo}/actions/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=10`)).workflow_runs || []);
    run = runs.filter((r) => new Date(r.created_at).getTime() >= since - 60000).sort((a, b) => b.id - a.id)[0] || null;
    if (run && run.status === "completed") break;
    process.stdout.write(`\r⏳ ${run ? run.status : "queued"} … ${Math.round((Date.now() - since) / 1000)}s   `);
  }
  console.log("");
  if (!run || run.status !== "completed") die(1, "❌ the cloud assembly run did not complete in time");
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
  fs.writeFileSync(path.join(ROOT, `.render-github-cloud.${SLUG}.json`), JSON.stringify(state, null, 2) + "\n");
  if (!state.verified) die(1, `❌ cloud assembly NOT verified (${run.conclusion}): ${(report && (report.error || (report.final && report.final.problems || []).join("; "))) || "no report"} — ${run.html_url}\n   local fallback: node scripts/render-github-assemble.js --slug=${SLUG}`);
  const f = report.final;
  console.log(`✅ CLOUD-VERIFIED ${f.file}: ${f.frames}/${f.expected} frames, full decode clean, audio present, ${(f.bytes / 1e6).toFixed(1)} MB — artifact ${fArt.name} on ${run.html_url}`);

  // ── 4. optional: fetch only the verified film ──
  if (args.download) await fetchFilm(host, state);
  else {
    console.log(`   download it from the run page, or: node scripts/render-github-cloud-assemble.js --slug=${SLUG} --fetch (download only, no new run)`);
  }
  // ── 5. the same post-render finalization as the local path (production only); its MP4 step reads the cloud report
  if (state.mode !== "PREVIEW-ONLY" && fs.existsSync(path.join(ROOT, "scripts", "post-render.js")) && !args["no-post-render"]) {
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "post-render.js"), `--slug=${SLUG}`], { cwd: ROOT, stdio: "inherit" });
  }
})().catch((e) => die(1, `❌ ${e.message}`));
