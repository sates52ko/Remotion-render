#!/usr/bin/env node
/**
 * render-cloud-assemble.js — RUNS ON A GITHUB ACTIONS RUNNER (render-video.yml, job `assemble`).
 * Downloads every segment named in the manifest (lib/cloud-assemble.js) with this run's own GITHUB_TOKEN, verifies
 * each one (frame count for its range, full decode, audio), concatenates them in frame order, verifies the film as a
 * whole, and writes out/<slug>[.preview].mp4 + out/<slug>.verify.json for the workflow to upload.
 * Exit 1 on any problem (the verify report is written either way, so the failure is readable).
 *
 *   GITHUB_TOKEN=… node scripts/render-cloud-assemble.js --slug=<slug> --manifest="1:o/r:run:0-99;…" [--preview]
 * Locally there is nothing to run: scripts/render-github-cloud-assemble.js dispatches this.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawnSync } = require("child_process");
const CA = require("./lib/cloud-assemble");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const SLUG = args.slug;
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "out");
const WORK = path.join(OUT, `cloud-asm-${SLUG}`);

/** GET api.github.com<p>. JSON by default; with `toFile` the (redirected) body is streamed to that file. */
function api(p, { toFile = null } = {}) {
  return new Promise((resolve, reject) => {
    const go = (url, auth, hops) => {
      const u = new URL(url);
      const headers = { "User-Agent": "render-cloud-assemble", Accept: "application/vnd.github+json" };
      if (auth) headers.Authorization = `Bearer ${TOKEN}`; // only to api.github.com; the signed redirect needs none
      https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
        if ([301, 302, 307].includes(res.statusCode) && res.headers.location && hops < 3) { res.resume(); return go(res.headers.location, false, hops + 1); }
        if (res.statusCode >= 400) {
          let b = ""; res.on("data", (d) => (b += d));
          return res.on("end", () => reject(Object.assign(new Error(`HTTP ${res.statusCode} ${u.pathname}: ${b.slice(0, 200)}`), { status: res.statusCode })));
        }
        if (toFile) {
          const w = fs.createWriteStream(toFile);
          res.pipe(w);
          w.on("finish", () => resolve(toFile)).on("error", reject);
          return;
        }
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")));
      }).on("error", reject);
    };
    go(`https://api.github.com${p}`, true, 0);
  });
}

async function fetchSegment(e) {
  const name = CA.segArtifact(SLUG, e.seg);
  let list;
  try { list = await api(`/repos/${e.repo}/actions/runs/${e.runId}/artifacts?name=${encodeURIComponent(name)}`); }
  catch (err) { throw Object.assign(new Error(`ARTIFACT_ACCESS_DENIED? seg${e.seg} ${e.repo} run ${e.runId}: ${err.message}`), { access: err.status === 401 || err.status === 403 }); }
  const art = (list.artifacts || []).find((a) => a.name === name && !a.expired);
  if (!art) throw new Error(`seg${e.seg}: artifact ${name} not on ${e.repo} run ${e.runId} (expired or never uploaded)`);
  const dir = path.join(WORK, `seg${e.seg}`);
  fs.mkdirSync(dir, { recursive: true });
  const zf = path.join(dir, "a.zip");
  try { await api(`/repos/${e.repo}/actions/artifacts/${art.id}/zip`, { toFile: zf }); }
  catch (err) { throw Object.assign(new Error(`ARTIFACT_ACCESS_DENIED? seg${e.seg} download ${e.repo}#${art.id}: ${err.message}`), { access: err.status === 401 || err.status === 403 }); }
  const u = spawnSync("unzip", ["-o", "-q", zf, "-d", dir], { encoding: "utf8" });
  fs.rmSync(zf, { force: true });
  if (u.status !== 0) throw new Error(`seg${e.seg}: unzip failed: ${u.stderr}`);
  const mp4 = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".mp4"));
  if (!mp4) throw new Error(`seg${e.seg}: no .mp4 in artifact ${name}`);
  return { ...e, file: path.join(dir, mp4), artifactId: art.id, artifactBytes: art.size_in_bytes };
}

(async () => {
  if (!SLUG || !args.manifest) { console.error("usage: --slug=<slug> --manifest=<seg:owner/repo:runId:start-end;…> [--preview]"); process.exit(2); }
  if (!TOKEN) { console.error("❌ GITHUB_TOKEN missing (the workflow passes this run's own token)"); process.exit(2); }
  const report = { slug: SLUG, at: new Date().toISOString(), mode: args.preview ? "PREVIEW-ONLY" : "PRODUCTION", runner: process.env.GITHUB_REPOSITORY || null, runId: process.env.GITHUB_RUN_ID || null, segments: [], final: null, ok: false };
  const writeReport = () => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `${SLUG}.verify.json`), JSON.stringify(report, null, 2) + "\n"); };
  try {
    const entries = CA.parseManifest(args.manifest);
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(WORK, { recursive: true });
    console.log(`⬇  ${entries.length} segment(s) from ${new Set(entries.map((e) => e.repo)).size} repo(s) — this run's own token`);
    const got = [];
    for (const e of entries) { // sequential: one segment on disk at a time is plenty; runner disk is ~14 GB free
      const g = await fetchSegment(e);
      const v = CA.verifySegment(g.file, e);
      report.segments.push({ seg: e.seg, repo: e.repo, runId: e.runId, artifactId: g.artifactId, range: `${e.start}-${e.end}`, ...v });
      console.log(`   ${v.ok ? "✓" : "✗"} seg${e.seg} ${e.repo}#${e.runId}: frames ${v.frames}/${v.expected}, decode ${v.decodes ? "clean" : "ERRORS"}${v.problems.length ? " — " + v.problems.join("; ") : ""}`);
      got.push(g);
    }
    if (report.segments.some((s) => !s.ok)) throw new Error("one or more segments failed verification");
    const name = `${SLUG}${args.preview ? ".preview" : ""}.mp4`;
    const out = path.join(OUT, name);
    const expected = entries[entries.length - 1].end + 1;
    console.log(`🔗 concat ${got.length} → out/${name} (expect ${expected} frames)`);
    const fin = CA.concatAndVerify(got.map((g) => g.file), out, expected);
    if (fin.bytes) fin.sha256 = await CA.sha256File(out);
    report.final = { file: name, ...fin };
    fs.rmSync(WORK, { recursive: true, force: true }); // free the runner disk before the upload step
    if (!fin.ok) throw new Error(`final film failed verification: ${fin.problems.join("; ")}`);
    report.ok = true;
    writeReport();
    console.log(`✅ VERIFIED out/${name}: ${fin.frames}/${expected} frames, full decode clean, audio present, ${(fin.bytes / 1e6).toFixed(1)} MB, sha256 ${fin.sha256.slice(0, 12)}`);
  } catch (err) {
    report.error = err.message;
    if (err.access) report.error += " — the run's GITHUB_TOKEN could not read that public repo's artifact; a read-only credential is needed (operator decision).";
    writeReport();
    console.error(`❌ ${report.error}`);
    process.exit(1);
  }
})();
