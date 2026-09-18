#!/usr/bin/env node
/**
 * overnight-render.js — hands-free continuation for the night of 2026-08-21.
 *
 * The user's existing auto-chain-render.js (already running) renders JOB A
 * (unreasonable-hospitality, done) + JOB B (discipline-is-destiny). This script
 * chains AFTER it, with ZERO risk of double-rendering:
 *
 *   1. Wait until out/discipline-is-destiny.mp4 is complete & verified (the
 *      running auto-chain produces it). If that auto-chain dies before finishing,
 *      TAKE OVER discipline (resume-render + verify + concat) so it never stalls.
 *   2. Once discipline is a verified mp4 (upload-ready) AND no auto-chain process
 *      is left running, render THIS book (this-is-me) at concurrency 5:
 *      local_chunk_renderer (resumable, reads render.concurrency) → ffprobe-verify
 *      every chunk (a silently-corrupt chunk makes `concat -c copy` truncate at
 *      exit 0 — memory: local-render-chunk-verify) → repair bad chunks → concat →
 *      check final duration vs audio.
 *   3. Both books end as verified out/<slug>.mp4, upload-ready (YouTube packs were
 *      Claude-hand-refined beforehand). No prompts — user pre-authorized.
 *
 * Resilience: the whole thing runs in a loop; any chunk/step failure retries, and
 * the process self-heals (resume skips finished chunks). Launch detached so it
 * survives the Claude session (see LAUNCH note at bottom).
 *
 * Concurrency: render.concurrency file at repo root (currently 5); local_chunk_renderer
 * re-reads it every chunk.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENTRY = "src/index.ts";
const CHUNK_SIZE = 400; // MUST match auto-chain / in-progress renders (index alignment)
const SELF_PID = process.pid;

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
// Is the user's original auto-chain-render.js still running? (exclude self)
function isAutoChainRunning() {
  const r = spawnSync("wmic", ["process", "where", "name='node.exe'", "get", "ProcessId,CommandLine"], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return false;
  return r.stdout.split(/\r?\n/).some((ln) => /auto-chain-render\.js/.test(ln) && !ln.includes(` ${SELF_PID} `) && !ln.trim().endsWith(` ${SELF_PID}`));
}
// Ensure a job reaches a verified final mp4. If `waitForAutoChain`, defer to the
// running auto-chain (don't double-render); only take over if it's gone.
function ensureDone(job, { waitForExternal }) {
  let guard = 0;
  while (!finalOk(job)) {
    if (waitForExternal && isAutoChainRunning()) {
      if (guard++ % 10 === 0) log(`waiting for auto-chain to finish ${job.slug} …`);
      sleepSync(60000);
      continue;
    }
    log(`taking over ${job.slug} (no external chain, not yet complete)`);
    renderJob(job);
    verifyAndRepair(job);
    concat(job);
    if (!finalOk(job)) { log(`  ${job.slug} still not complete — retrying in 30s`); sleepSync(30000); }
  }
  log(`✓ ${job.slug} COMPLETE & verified → ${job.final}`);
}

(function main() {
  status("STATUS", "started");
  log("=== OVERNIGHT RENDER START (concurrency file: " + (fs.existsSync(path.join(ROOT, "render.concurrency")) ? String(fs.readFileSync(path.join(ROOT, "render.concurrency"), "utf8")).trim() : "?") + ") ===");
  const B = mkJob("discipline-is-destiny"); // finished by the running auto-chain (or taken over)
  const C = mkJob("this-is-me");            // our target — render after B

  status("STATUS", "ensuring discipline-is-destiny (deferring to running auto-chain)");
  ensureDone(B, { waitForExternal: true });
  // discipline pack (titles/desc/chapters/tags/thumbnail/clean.vtt) was Claude-refined
  // earlier → the verified mp4 makes it fully upload-ready.
  log("discipline-is-destiny is upload-ready (mp4 verified; YouTube pack already refined).");

  status("STATUS", "ensuring no auto-chain running before this-is-me");
  while (isAutoChainRunning()) { log("auto-chain still alive — waiting before starting this-is-me"); sleepSync(60000); }

  status("STATUS", "rendering this-is-me");
  ensureDone(C, { waitForExternal: false });
  log("this-is-me is upload-ready (mp4 verified; YouTube pack already refined).");

  status("DONE", `all complete: ${B.final} + ${C.final}`);
  log("=== ALL COMPLETE — both books upload-ready ===");
})();
