#!/usr/bin/env node
/**
 * overnight-render-the-unknown.js — hands-free chain for the night of 2026-08-25.
 *
 * State at launch: a standalone `local_chunk_renderer.js books/glass-castle/...`
 * is ALREADY rendering glass-castle (JOB B, ~18/158 chunks). The user raised
 * render.concurrency to 5 (live-read per chunk) and asked to also render
 * the-unknown (JOB C) so BOTH finish overnight — pre-authorized, no prompts.
 *
 * Why sequential (not both at once): the box is 8-core/34GB; one Vox render at
 * concurrency 5 already saturates it (~1.8 fps, memory: render-concurrency-override).
 * Two renderers at 5 = 10 threads → oversubscription + OOM risk with NO aggregate
 * throughput gain. So this script DEFERS to the running glass-castle render, then
 * renders the-unknown after it — one renderer-at-5 on the box at any time.
 *
 * Flow:
 *   1. Ensure glass-castle → verified out/glass-castle.mp4:
 *      - while it's still being rendered externally (process alive OR chunks still
 *        growing) → wait, don't double-render.
 *      - once external is gone → take over (local_chunk_renderer resumes/skips done
 *        chunks) → ffprobe-verify every chunk (a silently-corrupt chunk makes
 *        `concat -c copy` truncate at exit 0 — memory: local-render-chunk-verify)
 *        → repair bad chunks → concat → check final duration vs audio.
 *   2. Render the-unknown the same way (render → verify → repair → concat → check).
 *   Both end as verified out/<slug>.mp4, upload-ready (YouTube packs already
 *   Claude-hand-refined).
 *
 * Resilience: whole thing loops; any step failure retries; resume skips finished
 * chunks. Launch detached so it survives the Claude session.
 *
 * Concurrency: render.concurrency file at repo root (5); local_chunk_renderer
 * re-reads it every chunk. Single-chunk repairs use --concurrency=1 (safe).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENTRY = "src/index.ts";
const CHUNK_SIZE = 400; // MUST match the in-progress glass-castle render (index alignment)
const SELF_PID = process.pid;
const STALL_MS = 15 * 60 * 1000; // no chunk growth for 15 min + no process ⇒ external dead

function mkJob(slug) {
  const cfgRel = `books/${slug}/config.vox.json`;
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, cfgRel), "utf8"));
  const m = cfg.meta;
  const comp = `Vox-${slug}`;
  return {
    slug, cfg: cfgRel, comp,
    totalFrames: m.totalFrames,
    audio: `public/${m.audio}`,
    dir: `out_${comp}_chunks`,
    chunks: Math.ceil(m.totalFrames / CHUNK_SIZE),
    final: `out/${slug}.mp4`,
  };
}

function log(msg) {
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${t}] ${msg}`);
}
function status(name, body) {
  try { fs.writeFileSync(path.join(ROOT, `overnight.${name}`), body + "\n"); } catch {}
}
function sh(cmd, { retries = 0, env = {} } = {}) {
  for (let a = 0; a <= retries; a++) {
    log(`$ ${cmd}${a ? ` (retry ${a}/${retries})` : ""}`);
    const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    if (r.status === 0) return true;
    log(`  ! exit ${r.status}`);
    if (a < retries) sleepSync(15000);
  }
  return false;
}
function sleepSync(ms) {
  spawnSync(process.execPath, ["-e", `setTimeout(()=>{}, ${ms})`], { stdio: "ignore" });
}
function chunkPath(job, i) { return path.join(ROOT, job.dir, `chunk-${String(i).padStart(4, "0")}.mp4`); }
function countChunks(job) {
  try { return fs.readdirSync(path.join(ROOT, job.dir)).filter((f) => /^chunk-\d+\.mp4$/.test(f)).length; }
  catch { return 0; }
}
function frameRange(job, i) {
  const start = (i - 1) * CHUNK_SIZE;
  return [start, Math.min(start + CHUNK_SIZE - 1, job.totalFrames - 1)];
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
  return d != null && d > 0.2;
}
function renderChunk(job, i) {
  const [s, e] = frameRange(job, i);
  const out = chunkPath(job, i);
  try { fs.rmSync(out, { force: true }); } catch {}
  return sh(`npx remotion render ${ENTRY} ${job.comp} "${out}" --frames=${s}-${e} --concurrency=1 --puppeteer-timeout=90000`, { retries: 2 });
}
function renderJob(job) {
  log(`RENDER: ${job.slug} — ${job.chunks} chunks (resumable, concurrency from render.concurrency)`);
  sh(`node local_chunk_renderer.js ${job.cfg} ${CHUNK_SIZE}`, { retries: 4 });
}
function verifyAndRepair(job) {
  log(`VERIFY: ${job.slug} — probing ${job.chunks} chunks`);
  let repaired = 0, stillBad = 0;
  for (let i = 1; i <= job.chunks; i++) {
    if (!verifyChunk(job, i)) {
      log(`  chunk ${i} bad/missing → re-render`);
      if (renderChunk(job, i) && verifyChunk(job, i)) repaired++;
      else { stillBad++; log(`  chunk ${i} STILL bad after re-render`); }
    }
  }
  log(`VERIFY done: ${job.slug}, repaired ${repaired}, stillBad ${stillBad}`);
  return stillBad === 0;
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
  if (!sh(`ffmpeg -y -f concat -safe 0 -i "${parts}" -c copy "${out}"`, { retries: 1 })) return false;
  const finalDur = probeDuration(out), audioDur = probeDuration(path.join(ROOT, job.audio));
  log(`  final=${finalDur ? finalDur.toFixed(1) : "?"}s  audio=${audioDur ? audioDur.toFixed(1) : "?"}s`);
  if (finalDur && audioDur && finalDur < audioDur * 0.98) {
    log(`  ⚠ final short vs audio — re-verify then re-concat once`);
    verifyAndRepair(job);
    sh(`ffmpeg -y -f concat -safe 0 -i "${parts}" -c copy "${out}"`, { retries: 1 });
    log(`  re-concat final=${(probeDuration(out) || 0).toFixed(1)}s`);
  }
  return true;
}
function finalOk(job) {
  const f = path.join(ROOT, job.final), a = path.join(ROOT, job.audio);
  return fs.existsSync(f) && (probeDuration(f) || 0) > (probeDuration(a) || 0) * 0.98;
}
// Is some OTHER process (not us / not our children) actively rendering `slug`?
// Primary: CIM process scan. Excludes SELF_PID. Matches the local_chunk_renderer
// parent and its `remotion render ... Vox-<slug>` children by slug in the cmdline.
function externalProcessRunning(slug) {
  const ps =
    `Get-CimInstance Win32_Process -Filter "name='node.exe'" | ` +
    `Where-Object { $_.ProcessId -ne ${SELF_PID} -and $_.CommandLine -like '*${slug}*' -and ` +
    `($_.CommandLine -like '*local_chunk_renderer*' -or $_.CommandLine -like '*remotion*render*') } | ` +
    `Measure-Object | Select-Object -ExpandProperty Count`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  if (r.status !== 0) return null; // unknown
  const n = parseInt((r.stdout || "").trim(), 10);
  return Number.isFinite(n) ? n > 0 : null;
}
// Combined "external render still alive" signal: process detected, OR chunks still
// growing within STALL_MS. Only when BOTH say dead do we take over (avoids the
// two-renderers-on-the-same-chunk collision).
function externalAlive(job, state) {
  const proc = externalProcessRunning(job.slug); // true / false / null(unknown)
  const count = countChunks(job);
  if (count > state.lastCount) { state.lastCount = count; state.lastGrowth = Date.now(); }
  const growing = Date.now() - state.lastGrowth < STALL_MS;
  if (proc === true) return true;
  if (proc === false) return growing; // process gone but chunks just grew → give a grace window
  return growing; // unknown → trust progress watchdog
}

function ensureDone(job, { deferToExternal }) {
  const state = { lastCount: countChunks(job), lastGrowth: Date.now() };
  let tick = 0;
  while (!finalOk(job)) {
    const complete = countChunks(job) >= job.chunks;
    if (deferToExternal && !complete && externalAlive(job, state)) {
      if (tick++ % 5 === 0) log(`deferring: glass-castle still rendering externally (${countChunks(job)}/${job.chunks}) …`);
      sleepSync(60000);
      continue;
    }
    // Take over (external gone, or it's our own target, or all chunks already present).
    log(`driving ${job.slug}: render → verify → concat (${countChunks(job)}/${job.chunks})`);
    renderJob(job);       // resumes; skips finished chunks
    verifyAndRepair(job);
    concat(job);
    if (!finalOk(job)) { log(`  ${job.slug} not complete yet — loop again in 30s`); sleepSync(30000); }
  }
  log(`✓ ${job.slug} COMPLETE & verified → ${job.final}`);
}

(function main() {
  status("STATUS", "started");
  const conc = fs.existsSync(path.join(ROOT, "render.concurrency"))
    ? String(fs.readFileSync(path.join(ROOT, "render.concurrency"), "utf8")).trim() : "?";
  log(`=== OVERNIGHT RENDER START (render.concurrency=${conc}) ===`);

  const B = mkJob("glass-castle"); // already rendering externally — defer, then finalize
  const C = mkJob("the-unknown");  // our target — render after B

  status("STATUS", "ensuring glass-castle (deferring to its running render)");
  log(`JOB B glass-castle: ${B.chunks} chunks, ${countChunks(B)} present`);
  ensureDone(B, { deferToExternal: true });
  log("glass-castle upload-ready (mp4 verified; YouTube pack refined separately).");

  status("STATUS", "rendering the-unknown at concurrency 5");
  log(`JOB C the-unknown: ${C.chunks} chunks, ${countChunks(C)} present`);
  ensureDone(C, { deferToExternal: false });
  log("the-unknown upload-ready (mp4 verified; YouTube pack Claude-hand-refined).");

  status("DONE", `all complete: ${B.final} + ${C.final}`);
  log("=== ALL COMPLETE — both books upload-ready ===");
})();
