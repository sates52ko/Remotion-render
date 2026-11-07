#!/usr/bin/env node
/**
 * finish-wedding-chain.js — RECOVERY runner set 2026-08-29.
 *
 * The previous two chains (chain-frozen-river.js + chain-wedding-people.js) both
 * died mid-VERIFY overnight: chain-wedding-people's takeover heuristic mistook
 * chain-frozen-river's (log-silent) VERIFY phase for a dead process and started a
 * SECOND verify+repair on the same chunk files — the two fought over the files and
 * crashed. All 157 the-frozen-river chunks survived on disk.
 *
 * This runner is a SINGLE process, NO gate, NO takeover → no race is possible:
 *   1. the-frozen-river: verify+repair its 157 existing chunks → concat → out/the-frozen-river.mp4
 *   2. the-wedding-people: render (Antidote, 133 chunks @400, resumable) → verify+repair → concat
 * Each ends as a duration-checked mp4. Self-heals per chunk; safe to re-run.
 *
 * LAUNCH (detached) — PowerShell:
 *   $env:RENDER_CONCURRENCY=5
 *   Start-Process node -ArgumentList 'scripts/finish-wedding-chain.js' -WindowStyle Hidden `
 *     -RedirectStandardOutput finish-wedding-chain.log -RedirectStandardError finish-wedding-chain.err.log
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENTRY = "src/index.ts";
const CHUNK_SIZE = 400;

const CONC_FILE = path.join(ROOT, "render.concurrency");
const CONC =
  (fs.existsSync(CONC_FILE) && String(fs.readFileSync(CONC_FILE, "utf8")).trim()) ||
  process.env.RENDER_CONCURRENCY ||
  "5";

function log(msg) {
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${t}] ${msg}`);
}
function status(name, body) {
  try { fs.writeFileSync(path.join(ROOT, `finish-wedding-chain.${name}`), body + "\n"); } catch {}
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
function sleepSync(ms) { spawnSync(process.execPath, ["-e", `setTimeout(()=>{}, ${ms})`], { stdio: "ignore" }); }
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
  return { slug, engine, cfg: cfgRel, comp, totalFrames, audio: `public/${m.audio}`,
    dir: `out_${comp}_chunks`, chunks: Math.ceil(totalFrames / CHUNK_SIZE), final: `out/${slug}.mp4` };
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
  try {
    if (!fs.existsSync(p) || fs.statSync(p).size < 2000) return false;
  } catch { return false; }
  const d = probeDuration(p);
  if (d == null || d <= 0.2) return false;
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
  let repaired = 0, bad = 0;
  for (let i = 1; i <= job.chunks; i++) {
    if (!verifyChunk(job, i)) {
      bad++;
      log(`  chunk ${i} bad/missing → re-render`);
      if (renderChunk(job, i) && verifyChunk(job, i)) repaired++;
      else log(`  chunk ${i} STILL bad after re-render`);
    }
    if (i % 25 === 0) log(`  ...verified ${i}/${job.chunks}`);
  }
  log(`VERIFY done: ${job.slug} — ${bad} bad, ${repaired} repaired`);
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
    status("FAILED", `concat failed: ${job.slug}`); return false;
  }
  const finalDur = probeDuration(out), audioDur = probeDuration(path.join(ROOT, job.audio));
  log(`  final=${finalDur ? finalDur.toFixed(1) : "?"}s  audio=${audioDur ? audioDur.toFixed(1) : "?"}s`);
  if (finalDur && audioDur && finalDur < audioDur * 0.98) {
    log(`  ⚠ final short vs audio — re-verify + re-concat once`);
    verifyAndRepair(job);
    fs.writeFileSync(parts, lines.join("\n"));
    sh(`ffmpeg -y -f concat -safe 0 -i "${parts}" -c copy "${out}"`, { retries: 1 });
    log(`  re-concat final=${(probeDuration(out) || 0).toFixed(1)}s`);
  }
  log(`CONCAT done: ${job.final}`);
  return true;
}
function finalOk(job) {
  const f = path.join(ROOT, job.final), a = path.join(ROOT, job.audio);
  return fs.existsSync(f) && (probeDuration(f) || 0) > (probeDuration(a) || 0) * 0.98;
}

(function main() {
  status("STATUS", "started");
  log(`=== FINISH WEDDING CHAIN (recovery, concurrency ${CONC}) ===`);

  const FR = mkJob("the-frozen-river");
  if (finalOk(FR)) { log(`SKIP ${FR.slug} — already a verified mp4`); }
  else {
    status("STATUS", `finishing ${FR.slug} (verify+concat, chunks exist)`);
    log(`${FR.slug}: ${FR.chunks} chunks on disk → verify+repair→concat (no re-render of good chunks)`);
    verifyAndRepair(FR);
    concat(FR);
    log(`=== ${FR.slug} ${finalOk(FR) ? "COMPLETE" : "see log"} ===`);
  }

  const WP = mkJob("the-wedding-people");
  if (finalOk(WP)) { log(`SKIP ${WP.slug} — already a verified mp4`); }
  else {
    status("STATUS", `rendering ${WP.slug}`);
    renderJob(WP);
    verifyAndRepair(WP);
    concat(WP);
    log(`=== ${WP.slug} ${finalOk(WP) ? "COMPLETE" : "see log"} ===`);
  }

  status("DONE", `frozen-river: ${finalOk(FR) ? "ok" : "FAIL"} | wedding-people: ${finalOk(WP) ? "ok" : "FAIL"}`);
  log("=== ALL DONE ===");
})();
