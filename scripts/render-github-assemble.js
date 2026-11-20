#!/usr/bin/env node
/**
 * render-github-assemble.js — LEGACY / OPERATOR-ONLY local join: download all segments of a split GitHub render to
 * this PC and concat them into the final out/<slug>.mp4, verified.
 *
 * The standard is the CLOUD join (render-github-cloud-assemble.js; canonical procedure
 * .claude/skills/render-deliver/SKILL.md). This script downloads every segment (GBs) and runs ffmpeg here, so since
 * 2026-10-28 it REFUSES (exit 2):
 *   - without --operator-approved="<reason>" (the operator's explicit reason; recorded in books/<slug>/render-facts.json
 *     as a {kind:'local-assemble', reason} fact);
 *   - when .render-github-cloud.<slug>.json already says this render (same bundle) is cloud-verified — fetch it instead
 *     (render-github-cloud-assemble.js --fetch);
 *   - while a cloud assembly of this book is running (its run lock is alive).
 * An approved run takes a run lock (.local-assemble-lock.<slug>.json, lib/run-lock.js) so it cannot run twice.
 *
 * Usage: node scripts/render-github-assemble.js --slug=<slug> --operator-approved="<reason>" [--book-root=<checkout>]
 *   --book-root: the checkout that holds the split state / books/<slug> / out/ (default: this one)
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const { loadAccounts, walk, parseArgs } = require("./lib/render-pool");
const CA = require("./lib/cloud-assemble");
const { takeRunLock, pidAlive } = require("./lib/run-lock");

const args = parseArgs(process.argv.slice(2));
const SLUG = args.slug;
const ROOT = typeof args["book-root"] === "string" && args["book-root"] ? path.resolve(args["book-root"]) : path.join(__dirname, "..");
const BR = path.resolve(ROOT) === path.resolve(__dirname, "..") ? "" : ` --book-root=${ROOT}`;
if (!SLUG) { console.error("Kullanım: node scripts/render-github-assemble.js --slug=<slug> --operator-approved=\"<reason>\" (LEGACY / operator-only)"); process.exit(2); }

// Prefer the per-slug state file (multi-agent safe); fall back to the shared one.
const perSlug = path.join(ROOT, `.render-github-split.${SLUG}.json`);
const splitPath = fs.existsSync(perSlug) ? perSlug : path.join(ROOT, ".render-github-split.json");
if (!fs.existsSync(splitPath)) { console.error(`❌ .render-github-split.${SLUG}.json yok — bu slug bölünmüş bir render değil. Tek-parça için render-github-download.js kullan.`); process.exit(1); }
const split = JSON.parse(fs.readFileSync(splitPath, "utf8"));
if (split.slug !== SLUG) { console.error(`❌ split state slug'ı '${split.slug}', istenen '${SLUG}'. (Başka bir agent .render-github-split.json'u ezmiş olabilir — .render-github-split.${SLUG}.json bekleniyordu.)`); process.exit(1); }

// ── guards (2026-10-28): the cloud is the standard; this local join is the operator's explicit, recorded exception ──
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const cloud = readJson(CA.cloudStateFile(ROOT, SLUG));
if (CA.verifiedFor(cloud, split) || (cloud && cloud.verified && !split.bundleSha)) {
  console.error(`❌ ${SLUG}: this render is already CLOUD-VERIFIED (${cloud.run && cloud.run.url}) — nothing to join locally.`);
  console.error(`   download the verified film: node scripts/render-github-cloud-assemble.js --slug=${SLUG} --fetch${BR}`);
  process.exit(2);
}
const cloudLock = readJson(path.join(ROOT, `.cloud-assemble-lock.${SLUG}.json`));
if (cloudLock && pidAlive(cloudLock.pid)) {
  console.error(`❌ ${SLUG}: a cloud assembly is running (pid ${cloudLock.pid}, since ${cloudLock.at}) — not joining locally at the same time. Status: node scripts/render-status.js --slug=${SLUG}${BR}`);
  process.exit(2);
}
const reason = typeof args["operator-approved"] === "string" ? args["operator-approved"].trim() : "";
if (!reason) {
  console.error(`❌ ${SLUG}: the local join is LEGACY / operator-only — it downloads every segment (GBs) and runs ffmpeg on this PC.`);
  console.error(`   standard (cloud): node scripts/render-github-cloud-assemble.js --slug=${SLUG} --download${BR}`);
  console.error(`   where it stands : node scripts/render-status.js --slug=${SLUG}${BR}`);
  console.error(`   only with the operator's explicit reason: --operator-approved="<reason>"`);
  process.exit(2);
}
takeRunLock(path.join(ROOT, `.local-assemble-lock.${SLUG}.json`), `local assembly ${SLUG}`);
require("./lib/render-preflight").appendFacts(ROOT, SLUG, { kind: "local-assemble", reason, bundleSha: split.bundleSha || null, segments: (split.segments || []).length });
console.log(`⚠ LOCAL join (operator-approved: ${reason}) — recorded in books/${SLUG}/render-facts.json`);

const acc = loadAccounts();
const segsSorted = [...split.segments].sort((a, b) => a.seg - b.seg);
const tmpRoot = path.join(ROOT, "out", `gh-asm-${SLUG}`);
fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });

const { ghAsync } = require("./lib/render-pool");

const verifyMp4 = (f) => {
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  const dur = parseFloat((probe.stdout || "").trim());
  if (!Number.isFinite(dur) || dur <= 0.1) return { ok: false, dur: 0 };
  const dec = spawnSync("ffmpeg", ["-v", "error", "-t", "5", "-i", f, "-f", "null", "-"], { encoding: "utf8" });
  return { ok: dec.status === 0, dur };
};

console.log(`\n⬇  ${segsSorted.length} segment paralel olarak indiriliyor...`);

async function downloadSegment(sg) {
  const worker = (acc.workers || []).find((w) => w.id === sg.workerId || w.username === sg.username);
  if (!worker) throw new Error(`worker bulunamadı: ${sg.username} (seg ${sg.seg})`);
  const repo = `${worker.username}/${worker.repo}`;
  const artifact = `video-${SLUG}-seg${sg.seg}`;

  const runs = await ghAsync(worker, ["run", "list", "--repo", repo, "--workflow", "render-video.yml", "-L", "25",
    "--json", "databaseId,status,conclusion,createdAt"], { json: true }) || [];
  const done = runs.filter((r) => r.status === "completed" && r.conclusion === "success");
  if (!done.length) {
    throw new Error(`${repo}: tamamlanmış başarılı run yok — seg${sg.seg} henüz bitmemiş olabilir.\n   Actions: https://github.com/${repo}/actions`);
  }

  const segDir = path.join(tmpRoot, `seg${sg.seg}`);
  fs.mkdirSync(segDir, { recursive: true });
  let got = null;
  for (const r of done) {
    try {
      fs.rmSync(segDir, { recursive: true, force: true });
      fs.mkdirSync(segDir, { recursive: true });
      await ghAsync(worker, ["run", "download", String(r.databaseId), "--repo", repo, "--name", artifact, "--dir", segDir]);
      const mp4 = walk(segDir).find((f) => f.toLowerCase().endsWith(".mp4"));
      if (mp4) { got = mp4; break; }
    } catch { /* this run doesn't have that artifact — try older */ }
  }
  if (!got) throw new Error(`${repo} son run'larında '${artifact}' artifact'i bulunamadı.`);

  const v = verifyMp4(got);
  if (!v.ok) throw new Error(`seg${sg.seg} bozuk/kesik (decode başarısız).`);
  console.log(`   ✓ seg${sg.seg} indirildi ve doğrulandı (${(v.dur / 60).toFixed(1)} dk)`);
  return { seg: sg.seg, file: got };
}

(async () => {
  let results;
  try {
    results = await Promise.all(segsSorted.map((sg) => downloadSegment(sg)));
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  const segFiles = results.sort((a, b) => a.seg - b.seg).map((r) => r.file);

  // ── pre-concat sanity: every segment file must still exist ───────────────────
  for (const f of segFiles) {
    if (!fs.existsSync(f)) {
      console.error(`❌ Segment dosyası kayıp (download sonrası silindi?): ${f}`);
      process.exit(1);
    }
  }

// ── concat in frame order ─────────────────────────────────────────────────────
const partsFile = path.join(tmpRoot, "parts.txt");
fs.writeFileSync(partsFile, segFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
const preview = split.mode === "PREVIEW-ONLY";
const outputName = `${SLUG}${preview ? ".preview" : ""}.mp4`;
const dest = path.join(ROOT, "out", outputName);
console.log(`\n🔗 ${segFiles.length} segment birleştiriliyor → out/${outputName}`);
execSync(`ffmpeg -y -f concat -safe 0 -i "${partsFile}" -c copy "${dest}"`, { cwd: ROOT, stdio: process.stdout.isTTY ? "inherit" : "pipe" });

// ── verify final (concat can silently truncate) ───────────────────────────────
let ok = true, durMin = "?";
try {
  durMin = (Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${dest}"`, { encoding: "utf8" }).trim()) / 60).toFixed(1);
  execSync(`ffmpeg -v error -t 6 -i "${dest}" -f null -`, { stdio: "ignore" });
  execSync(`ffmpeg -v error -sseof -6 -i "${dest}" -f null -`, { stdio: "ignore" });
  console.log(`\n✅ DOĞRULANDI — out/${outputName} · ${durMin} dk · baş/son decode temiz.`);
} catch (e) {
  ok = false;
  console.warn(`\n⚠ Final doğrulama BAŞARISIZ: ${String(e.message).slice(0, 160)}`);
}
if (!preview) fs.rmSync(tmpRoot, { recursive: true, force: true });

fs.writeFileSync(path.join(ROOT, ".render-github-state.json"), JSON.stringify({
  slug: SLUG, mode: preview ? "PREVIEW-ONLY" : "PRODUCTION", output: dest, split: true, segments: segsSorted.length, verified: ok, durationMin: durMin,
  repos: [...new Set(segsSorted.map((s) => `${s.username}/${s.repo}`))],
}, null, 2) + "\n");

if (ok && preview) console.log("PREVIEW-ONLY: " + dest + " — frame review required; not approved for production delivery.");
if (ok && !preview) {
  const postScript = path.join(ROOT, "scripts", "post-render.js");
  if (fs.existsSync(postScript)) {
    spawnSync("node", [postScript, `--slug=${SLUG}`], { cwd: ROOT, stdio: process.stdout.isTTY ? "inherit" : "pipe" });
  }
  console.log(`\nSorunsuzsa temizle (her worker reposunun artifact/log'ları):`);
  segsSorted.forEach((s) => console.log(`   node scripts/render-github-cleanup.js --slug=${SLUG} --worker=${s.username}`));
} else if (!ok) {
  process.exit(1);
}
})();
