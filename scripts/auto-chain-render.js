#!/usr/bin/env node
/**
 * auto-chain-render.js — hands-free overnight render chain (concurrency 5).
 *
 * Current run (set 2026-08-24):
 *   GATE  = east-of-eden    (external local_chunk_renderer is producing its chunks
 *                            right now; wait until done/stall, then verify+concat)
 *   JOB A = clear-thinking  (Antidote — render Antidote-clear-thinking from scratch;
 *                            prep + art-direction done. Starts the instant east-of-eden's
 *                            final mp4 verifies — NO prompt, user pre-authorized.)
 *
 * Flow per job: render (resumable, RENDER_CONCURRENCY from env) → verify every
 * chunk with ffprobe (memory: a silently-corrupt chunk makes concat -c copy
 * truncate at exit 0) → concat → check final duration vs audio. Job B starts the
 * instant Job A's final mp4 is verified — NO prompt (user pre-authorized).
 *
 * Concurrency: pass via env RENDER_CONCURRENCY (local_chunk_renderer reads it).
 * Launch detached so it survives the Claude session:
 *   $env:RENDER_CONCURRENCY=5
 *   Start-Process node -ArgumentList 'scripts/auto-chain-render.js' -WindowStyle Hidden \
 *     -RedirectStandardOutput auto-chain.log -RedirectStandardError auto-chain.err.log
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENTRY = "src/index.ts";
const CHUNK_SIZE = 400; // MUST match the in-progress render's chunk size (index alignment)
// render.concurrency file (repo root) is the LIVE human override and wins over
// env — the SoftLanding keep-alive relaunches this script without env, so the
// file is the only reliable way to control concurrency across auto-restarts.
// local_chunk_renderer re-reads the same file per chunk, so this is just the
// value logged / passed through as a fallback env.
const CONC_FILE = path.join(ROOT, "render.concurrency");
const CONC =
  (fs.existsSync(CONC_FILE) && String(fs.readFileSync(CONC_FILE, "utf8")).trim()) ||
  process.env.RENDER_CONCURRENCY ||
  "5";

function engineOf(slug) {
  try { return (JSON.parse(fs.readFileSync(path.join(ROOT, `books/${slug}/book.json`), "utf8")).engine || "vox").toLowerCase() === "antidote" ? "antidote" : "vox"; }
  catch { return "vox"; }
}
function mkJob(slug) {
  const engine = engineOf(slug);
  const cfgRel = engine === "antidote" ? `books/${slug}/config.antidote.json` : `books/${slug}/config.vox.json`;
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, cfgRel), "utf8"));
  const m = cfg.meta;
  const comp = `${engine === "antidote" ? "Antidote" : "Vox"}-${slug}`;
  const totalFrames = m.totalFrames || m.durationInFrames; // Vox=totalFrames, Antidote=durationInFrames
  return {
    slug,
    engine,
    cfg: cfgRel,
    comp,
    totalFrames,
    audio: `public/${m.audio}`, // m.audio is e.g. "audio/<slug>.m4a"
    dir: `out_${comp}_chunks`,
    chunks: Math.ceil(totalFrames / CHUNK_SIZE),
    final: `out/${slug}.mp4`,
  };
}
// Count the mp4 chunks already on disk for a job.
function countChunks(job) {
  try { return fs.readdirSync(path.join(ROOT, job.dir)).filter((f) => /^chunk-\d+\.mp4$/.test(f)).length; }
  catch { return 0; }
}
// Gate before taking over a job that an EXTERNAL renderer is producing (this-is-me):
// wait until all chunks exist (external finished & exited — local_chunk_renderer
// exits after chunks) OR the chunk count stalls for stallMs (external died). Only
// then do we run local_chunk_renderer ourselves, so we never double-render a chunk
// that a live process is still writing.
function waitForExternalOrStall(job, stallMs = 8 * 60 * 1000, pollMs = 30 * 1000) {
  if (finalOk(job)) return;
  log(`GATE: waiting on external ${job.slug} render — ${countChunks(job)}/${job.chunks} chunks`);
  let last = -1, lastChange = Date.now();
  for (;;) {
    const c = countChunks(job);
    if (c >= job.chunks) { log(`GATE: ${job.slug} all ${job.chunks} chunks present → take over (concat)`); return; }
    if (c !== last) { last = c; lastChange = Date.now(); log(`  ${job.slug} ${c}/${job.chunks}`); }
    else if (Date.now() - lastChange > stallMs) { log(`GATE: ${job.slug} stalled at ${c}/${job.chunks} for ${Math.round(stallMs / 60000)}min → take over (resume)`); return; }
    sleepSync(pollMs);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────
function log(msg) {
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${t}] ${msg}`);
}
function status(name, body) {
  try { fs.writeFileSync(path.join(ROOT, `auto-chain.${name}`), body + "\n"); } catch {}
}
function sh(cmd, { fatal = false, retries = 0, env = {} } = {}) {
  for (let a = 0; a <= retries; a++) {
    log(`$ ${cmd}${a ? ` (retry ${a}/${retries})` : ""}`);
    const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    if (r.status === 0) return true;
    log(`  ! exit ${r.status}`);
    if (a < retries) sleepSync(15000);
  }
  if (fatal) { status("FAILED", `command failed: ${cmd}`); process.exit(1); }
  return false;
}
function sleepSync(ms) {
  spawnSync(process.execPath, ["-e", `setTimeout(()=>{}, ${ms})`], { stdio: "ignore" });
}
function chunkPath(job, i) {
  return path.join(ROOT, job.dir, `chunk-${String(i).padStart(4, "0")}.mp4`);
}
function frameRange(job, i) {
  const start = (i - 1) * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE - 1, job.totalFrames - 1);
  return [start, end];
}
function probeDuration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const d = parseFloat((r.stdout || "").trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}
function verifyChunk(job, i) {
  const p = chunkPath(job, i);
  if (!fs.existsSync(p) || fs.statSync(p).size < 2000) return false;
  const d = probeDuration(p);
  if (d == null || d <= 0.2) return false;
  // ffprobe duration alone is NOT enough: local_chunk_renderer can emit a
  // silently-corrupt chunk (bad h264 MB / broken AAC element) that still reports
  // a valid duration but makes `ffmpeg concat -c copy` TRUNCATE at that chunk and
  // exit 0 — producing a short final with no error. A full decode is the only
  // reliable catch, so re-render on any decode stderr/non-zero exit.
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", p, "-f", "null", "-"], { encoding: "utf8" });
  if (r.status !== 0 || (r.stderr && r.stderr.trim().length > 0)) return false;
  return true;
}
function renderChunk(job, i) {
  const [s, e] = frameRange(job, i);
  const out = chunkPath(job, i);
  try { fs.rmSync(out, { force: true }); } catch {}
  const cmd = `npx remotion render ${ENTRY} ${job.comp} "${out}" --frames=${s}-${e} --concurrency=1 --puppeteer-timeout=90000 --timeout=180000`;
  return sh(cmd, { retries: 2 });
}

// ── render (resumable) → verify+repair → concat ──────────────────────────────
function renderJob(job) {
  log(`RENDER: ${job.slug} — ${job.chunks} chunks @ concurrency ${CONC} (resumable)`);
  // local_chunk_renderer skips existing chunks (resume) and reads RENDER_CONCURRENCY.
  sh(`node local_chunk_renderer.js ${job.cfg} ${CHUNK_SIZE}`, { retries: 4, env: { RENDER_CONCURRENCY: CONC } });
}
function verifyAndRepair(job) {
  log(`VERIFY: ${job.slug} — probing ${job.chunks} chunks`);
  let repaired = 0;
  for (let i = 1; i <= job.chunks; i++) {
    if (!verifyChunk(job, i)) {
      log(`  chunk ${i} bad/missing → re-render`);
      if (renderChunk(job, i) && verifyChunk(job, i)) repaired++;
      else log(`  chunk ${i} STILL bad after re-render`);
    }
  }
  log(`VERIFY done: ${job.slug}, repaired ${repaired}`);
}
function concat(job) {
  const dir = path.join(ROOT, job.dir);
  const lines = [];
  for (let i = 1; i <= job.chunks; i++) lines.push(`file '${chunkPath(job, i).replace(/\\/g, "/")}'`);
  const parts = path.join(dir, "parts.txt");
  fs.writeFileSync(parts, lines.join("\n"));
  fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
  const out = path.join(ROOT, job.final);
  log(`CONCAT: ${job.slug} → ${job.final}`);
  if (!sh(`ffmpeg -y -f concat -safe 0 -i "${parts}" -c copy "${out}"`, { retries: 1 })) {
    status("FAILED", `concat failed: ${job.slug}`);
    return false;
  }
  const finalDur = probeDuration(out);
  const audioDur = probeDuration(path.join(ROOT, job.audio));
  log(`  final=${finalDur ? finalDur.toFixed(1) : "?"}s  audio=${audioDur ? audioDur.toFixed(1) : "?"}s`);
  if (finalDur && audioDur && finalDur < audioDur * 0.98) {
    log(`  ⚠ final short vs audio — re-verify chunks then re-concat once`);
    verifyAndRepair(job);
    fs.writeFileSync(parts, lines.join("\n"));
    sh(`ffmpeg -y -f concat -safe 0 -i "${parts}" -c copy "${out}"`, { retries: 1 });
    log(`  re-concat final=${(probeDuration(out) || 0).toFixed(1)}s`);
  }
  log(`CONCAT done: ${job.final}`);
  return true;
}
function finalOk(job) {
  const f = path.join(ROOT, job.final);
  const a = path.join(ROOT, job.audio);
  return fs.existsSync(f) && (probeDuration(f) || 0) > (probeDuration(a) || 0) * 0.98;
}
function runJob(job) {
  if (finalOk(job)) { log(`SKIP ${job.slug} — ${job.final} already complete`); return; }
  renderJob(job);
  verifyAndRepair(job);
  concat(job);
}

// ── main ────────────────────────────────────────────────────────────────────
// Overnight chain (set 2026-08-31):
//   GATE  = project-hail-mary (Vox) — an EXTERNAL local_chunk_renderer is
//           producing its chunks RIGHT NOW at conc 2-3 (was at ~51/105 when
//           this chain launched). Wait until all chunks exist (external finished
//           & exited) OR the count stalls (external died), THEN take over:
//           renderJob resumes any gaps (skips existing) → verify → concat.
//   JOB A = fruit-fly         (Antidote — 161 chunks, render-ready)
//   JOB B = little-fires-everywhere (Vox — 124 chunks, render-ready)
// Each job self-heals: local_chunk_renderer retries + ffprobe/full-decode verify
// re-renders any bad/missing chunk before concat, and concat re-checks final vs
// audio duration. Each job starts the instant the previous final mp4 verifies —
// NO prompt (user pre-authorized overnight). Detached so it survives the session.
(function main() {
  status("STATUS", "started");
  log("=== AUTO-CHAIN RENDER START (concurrency " + CONC + ") ===");
  const G = mkJob("project-hail-mary");
  const A = mkJob("fruit-fly");
  const B = mkJob("little-fires-everywhere");
  log(`GATE ${G.slug}: ${G.chunks} chunks (${G.engine}) | A ${A.slug}: ${A.chunks} (${A.engine}) | B ${B.slug}: ${B.chunks} (${B.engine})`);

  status("STATUS", `gating ${G.slug}`);
  waitForExternalOrStall(G, 20 * 60 * 1000); // 20-min stall tolerance (external at conc 2-3)
  runJob(G);
  log(`=== ${G.slug} COMPLETE ===`);

  status("STATUS", `rendering ${A.slug}`);
  runJob(A);
  log(`=== ${A.slug} COMPLETE ===`);

  status("STATUS", `rendering ${B.slug}`);
  runJob(B);
  log(`=== ${B.slug} COMPLETE ===`);

  status("DONE", `all complete: ${G.final} + ${A.final} + ${B.final}`);
  log("=== ALL COMPLETE ===");
})();
