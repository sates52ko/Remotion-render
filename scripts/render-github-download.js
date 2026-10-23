#!/usr/bin/env node
/**
 * render-github-download.js — pull a finished render from the worker pool.
 *
 * After `render.js --method=github` triggers a render on a pool worker, this fetches the
 * resulting mp4 from that worker's Actions artifact, drops it at out/<slug>.mp4, and
 * VERIFIES it (ffprobe duration + head/tail decode — the concat-truncation failure mode
 * exits 0 with a short/broken tail, so we always decode-check). It then records
 * .render-github-state.json so the cleanup step knows exactly what to delete once you approve.
 *
 * Usage:
 *   node scripts/render-github-download.js --slug=<slug> [--worker=<id|username|auto>] [--run=<id>]
 *   (worker defaults to the one render.js last dispatched to)
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { ROOT, loadAccounts, resolveWorker, repoOf, gh, walk, parseArgs } = require("./lib/render-pool");

const args = parseArgs(process.argv.slice(2));
const SLUG = args.slug;
if (!SLUG) {
  console.error("Kullanım: node scripts/render-github-download.js --slug=<slug> [--worker=<id>] [--run=<id>]");
  process.exit(1);
}

// ── refuse to masquerade one segment as the whole film ──────────────────────
// This script pulls ONE worker's artifact. On a SPLIT render that is a single
// segment, and it used to save it as out/<slug>.mp4 and print "DOĞRULANDI" —
// a 5.3 min piece of a 41.9 min film, verified, under the final name. The
// duration check only asks whether the file decodes at its head and tail; it
// never compares against the render's expected length, so nothing caught it.
const splitState = [
  path.join(ROOT, `.render-github-split.${SLUG}.json`),
  path.join(ROOT, ".render-github-split.json"),
].find((p) => {
  if (!fs.existsSync(p)) return false;
  try { return JSON.parse(fs.readFileSync(p, "utf8")).slug === SLUG; } catch { return false; }
});
if (splitState && !args.segment) {
  const st = JSON.parse(fs.readFileSync(splitState, "utf8"));
  console.error(`❌ ${SLUG} BÖLÜNMÜŞ bir render (${(st.segments || []).length} segment, ${path.basename(splitState)}).`);
  console.error("   Bu script tek worker'dan tek artifact indirir — yani filmin sadece bir parçasını.");
  console.error("   Tümünü indirip kare sırasına göre birleştirmek için:");
  console.error(`     node scripts/render-github-assemble.js --slug=${SLUG}`);
  console.error("   (Tek bir segmenti bilerek incelemek istiyorsan: --segment ekle.)");
  process.exit(1);
}

const acc = loadAccounts();
const worker = resolveWorker(acc, args.worker);
const repo = repoOf(worker);
console.log(`⬇  İndirme — worker: ${worker.name || worker.id} (@${worker.username}) · repo ${repo}`);

// ── locate the run ──────────────────────────────────────────────────────────
let runId = args.run;
if (!runId) {
  const runs = gh(worker, ["run", "list", "--repo", repo, "--workflow", "render-video.yml", "-L", "15",
    "--json", "databaseId,status,conclusion,displayTitle,createdAt"], { json: true }) || [];
  if (!runs.length) { console.error("❌ Bu repoda render-video.yml çalışması yok."); process.exit(1); }
  const completed = runs.filter((r) => r.status === "completed");
  const pick = completed.find((r) => r.conclusion === "success") || completed[0];
  if (!pick) {
    const newest = runs[0];
    console.error(`⏳ Henüz tamamlanmış çalışma yok (en yeni: ${newest.status}). Render bitince tekrar dene:`);
    console.error(`   https://github.com/${repo}/actions`);
    process.exit(2);
  }
  if (pick.conclusion !== "success") console.warn(`⚠ En yeni tamamlanan çalışmanın sonucu: ${pick.conclusion} (yine de indiriliyor).`);
  runId = pick.databaseId;
}
console.log(`   run: ${runId} · artifact indiriliyor…`);

// ── download + extract ──────────────────────────────────────────────────────
const tmp = path.join(ROOT, "out", `gh-dl-${SLUG}`);
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
gh(worker, ["run", "download", String(runId), "--repo", repo, "--dir", tmp]);

const mp4s = walk(tmp).filter((f) => f.toLowerCase().endsWith(".mp4"));
if (!mp4s.length) { console.error("❌ Artifact içinde .mp4 yok."); process.exit(1); }
const chosen = mp4s.find((f) => path.basename(f) === `${SLUG}.mp4`)
  || mp4s.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];

const dest = path.join(ROOT, "out", `${SLUG}.mp4`);
fs.copyFileSync(chosen, dest);
fs.rmSync(tmp, { recursive: true, force: true });
const sizeMB = (fs.statSync(dest).size / 1e6).toFixed(0);
console.log(`✓ out/${SLUG}.mp4  (${sizeMB} MB)`);

// ── verify (never ship an unverified render) ────────────────────────────────
let ok = true, durMin = "?";
try {
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${dest}"`, { encoding: "utf8" }).trim();
  durMin = (Number(dur) / 60).toFixed(1);
  execSync(`ffmpeg -v error -t 6 -i "${dest}" -f null -`, { stdio: "ignore" });
  execSync(`ffmpeg -v error -sseof -6 -i "${dest}" -f null -`, { stdio: "ignore" });
  console.log(`✓ DOĞRULANDI — süre ${durMin} dk · baş/son decode temiz (kesik değil).`);
} catch (e) {
  ok = false;
  console.warn(`⚠ DOĞRULAMA BAŞARISIZ: ${String(e.message).slice(0, 200)} — dosya bozuk/eksik olabilir, TEMİZLEME.`);
}

// ── record for the cleanup step ─────────────────────────────────────────────
fs.writeFileSync(path.join(ROOT, ".render-github-state.json"), JSON.stringify({
  slug: SLUG, workerId: worker.id, username: worker.username, repo, runId, verified: ok, durationMin: durMin,
}, null, 2) + "\n");

if (ok) {
  const postScript = path.join(ROOT, "scripts", "post-render.js");
  if (fs.existsSync(postScript)) {
    const { spawnSync } = require("child_process");
    spawnSync("node", [postScript, `--slug=${SLUG}`], { cwd: ROOT, stdio: process.stdout.isTTY ? "inherit" : "pipe" });
  }
  console.log(`✅ Sorunsuzsa ONAYLA ve o repoyu temizle (kota boşalt, sıradaki render'a hazırla):`);
  console.log(`   node scripts/render-github-cleanup.js --slug=${SLUG}`);
} else {
  console.log(`⛔ Doğrulama geçmedi — TEMİZLEME. Render'ı ${repo} üzerinde yeniden çalıştır.`);
}
