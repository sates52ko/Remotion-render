#!/usr/bin/env node
/**
 * chain-frozen-river.js — hands-free continuation set 2026-08-27.
 *
 * The user's auto-chain-render.js is ALREADY running and rendering its JOB B,
 * war-of-the-worlds (Vox, 191 chunks @400). This script chains AFTER it with
 * ZERO risk of double-rendering a live chunk:
 *
 *   1. GATE on war-of-the-worlds: wait until out/war-of-the-worlds.mp4 is a
 *      complete & verified mp4 (the running auto-chain produces it). While the
 *      live render keeps advancing (new chunks appear OR auto-chain.log stays
 *      fresh) we ONLY wait — we never touch its chunks. If it dies (chunk count
 *      stalls AND auto-chain.log goes stale) we TAKE OVER war-of-the-worlds
 *      (resume-render skips finished chunks → verify → concat) so it never hangs.
 *   2. Once war-of-the-worlds is verified AND no live render is advancing, render
 *      THIS book, the-frozen-river (Vox, 157 chunks @400):
 *      local_chunk_renderer (resumable, reads render.concurrency) → ffprobe+decode
 *      verify every chunk (a silently-corrupt chunk makes `concat -c copy` truncate
 *      at exit 0 — memory: local-render-chunk-verify) → repair bad chunks → concat
 *      → check final duration vs audio.
 *   3. Both end as verified out/<slug>.mp4, upload-ready (YouTube pack for
 *      the-frozen-river was Claude-hand-refined beforehand). No prompts.
 *
 * Self-heals: the whole thing loops; any chunk/step failure retries; resume skips
 * finished chunks. CHUNK_SIZE MUST stay 400 to match the in-progress war-of-the-
 * worlds chunk indexing (takeover alignment).
 *
 * LAUNCH (detached, survives the Claude session) — PowerShell:
 *   $env:RENDER_CONCURRENCY=5
 *   Start-Process node -ArgumentList 'scripts/chain-frozen-river.js' -WindowStyle Hidden `
 *     -RedirectStandardOutput chain-frozen-river.log -RedirectStandardError chain-frozen-river.err.log
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENTRY = "src/index.ts";
const CHUNK_SIZE = 400; // MUST match the in-progress war-of-the-worlds render

// Live concurrency override: render.concurrency file wins (local_chunk_renderer
// re-reads it per chunk), else env, else 5.
const CONC_FILE = path.join(ROOT, "render.concurrency");
const CONC =
  (fs.existsSync(CONC_FILE) && String(fs.readFileSync(CONC_FILE, "utf8")).trim()) ||
  process.env.RENDER_CONCURRENCY ||
  "5";

// ── helpers ────────────────────────────────────────────────────────────────
function log(msg) {
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${t}] ${msg}`);
}
function status(name, body) {
  try { fs.writeFileSync(path.join(ROOT, `chain-frozen-river.${name}`), body + "\n"); } catch {}
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
  const totalFrames = m.totalFrames || m.durationInFrames;
  return {
    slug, engine, cfg: cfgRel, comp, totalFrames,
    audio: `public/${m.audio}`,
    dir: `out_${comp}_chunks`,
    chunks: Math.ceil(totalFrames / CHUNK_SIZE),
    final: `out/${slug}.mp4`,
  };
}
function countChunks(job) {
  try { return fs.readdirSync(path.join(ROOT, job.dir)).filter((f) => /^chunk-\d+\.mp4$/.test(f)).length; }
  catch { return 0; }
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
  // Full decode — ffprobe duration alone misses silently-corrupt chunks that make
  // `concat -c copy` truncate at exit 0.
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
function renderJob(job) {
  log(`RENDER: ${job.slug} — ${job.chunks} chunks @ concurrency ${CONC} (resumable)`);
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

// Freshness of the live auto-chain render (the process producing war-of-the-worlds).
// If its log stops advancing AND chunk count stops growing, it's dead → take over.
function autoChainLogAgeMs() {
  const f = path.join(ROOT, "auto-chain.log");
  try { return Date.now() - fs.statSync(f).mtimeMs; } catch { return Infinity; }
}

// GATE: wait for the EXTERNAL (already-running) render of `job` to finish, taking
// over only if it is provably dead. staleMs: how long chunk-count AND log must be
// frozen before we declare the live render dead and resume it ourselves.
function gateOnExternal(job, { staleMs = 12 * 60 * 1000, pollMs = 45 * 1000 } = {}) {
  if (finalOk(job)) { log(`GATE: ${job.slug} already a verified mp4 → proceed`); return; }
  log(`GATE: waiting on live ${job.slug} render — ${countChunks(job)}/${job.chunks} chunks`);
  let last = -1, lastChange = Date.now();
  for (;;) {
    if (finalOk(job)) { log(`GATE: ${job.slug} final mp4 verified by live render → proceed`); return; }
    const c = countChunks(job);
    if (c !== last) { last = c; lastChange = Date.now(); log(`  ${job.slug} ${c}/${job.chunks} chunks`); }
    const frozen = Date.now() - lastChange;
    const logStale = autoChainLogAgeMs();
    // All chunks present but no final yet: give the live process a grace window to
    // concat; if it never does (dead), take over.
    if (c >= job.chunks) {
      if (frozen > 4 * 60 * 1000 && logStale > 4 * 60 * 1000) {
        log(`GATE: ${job.slug} all chunks present, live render idle ${Math.round(frozen/60000)}min → take over (verify+concat)`);
        verifyAndRepair(job); concat(job); return;
      }
    } else if (frozen > staleMs && logStale > staleMs) {
      log(`GATE: ${job.slug} stalled at ${c}/${job.chunks} for ${Math.round(frozen/60000)}min & log stale ${Math.round(logStale/60000)}min → live render dead, take over (resume)`);
      renderJob(job); verifyAndRepair(job); concat(job); return;
    }
    sleepSync(pollMs);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
(function main() {
  status("STATUS", "started");
  log("=== CHAIN FROZEN-RIVER START (concurrency " + CONC + ") ===");
  const GATE = mkJob("war-of-the-worlds"); // the currently-running JOB B
  const JOB = mkJob("the-frozen-river");   // render this after the gate clears
  log(`GATE ${GATE.slug}: ${GATE.chunks} chunks (${GATE.engine}) | JOB ${JOB.slug}: ${JOB.chunks} chunks (${JOB.engine})`);

  status("STATUS", `gating on ${GATE.slug}`);
  gateOnExternal(GATE);
  log(`=== ${GATE.slug} READY (${finalOk(GATE) ? "verified" : "see log"}) ===`);

  status("STATUS", `rendering ${JOB.slug}`);
  runJob(JOB);
  log(`=== ${JOB.slug} COMPLETE ===`);

  status("DONE", `frozen-river complete: ${JOB.final}`);
  log("=== ALL COMPLETE ===");
})();
