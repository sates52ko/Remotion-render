#!/usr/bin/env node
/**
 * render-github-assemble.js — download all segments of a split GitHub render and
 * concat them into the final out/<slug>.mp4, verified.
 *
 * render.js --method=github auto-splits a long video into worker-sized frame
 * segments (each under the 6h Actions cap) and records .render-github-split.json.
 * This pulls each segment's artifact (video-<slug>-seg<k>) from its worker, verifies
 * each piece, concatenates them in frame order, and decode-verifies the result.
 *
 * Usage: node scripts/render-github-assemble.js --slug=<slug>
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const { ROOT, loadAccounts, gh, walk, parseArgs } = require("./lib/render-pool");

const args = parseArgs(process.argv.slice(2));
const SLUG = args.slug;
if (!SLUG) { console.error("Kullanım: node scripts/render-github-assemble.js --slug=<slug>"); process.exit(1); }

// Prefer the per-slug state file (multi-agent safe); fall back to the shared one.
const perSlug = path.join(ROOT, `.render-github-split.${SLUG}.json`);
const splitPath = fs.existsSync(perSlug) ? perSlug : path.join(ROOT, ".render-github-split.json");
if (!fs.existsSync(splitPath)) { console.error(`❌ .render-github-split.${SLUG}.json yok — bu slug bölünmüş bir render değil. Tek-parça için render-github-download.js kullan.`); process.exit(1); }
const split = JSON.parse(fs.readFileSync(splitPath, "utf8"));
if (split.slug !== SLUG) { console.error(`❌ split state slug'ı '${split.slug}', istenen '${SLUG}'. (Başka bir agent .render-github-split.json'u ezmiş olabilir — .render-github-split.${SLUG}.json bekleniyordu.)`); process.exit(1); }

const acc = loadAccounts();
const segsSorted = [...split.segments].sort((a, b) => a.seg - b.seg);
const tmpRoot = path.join(ROOT, "out", `gh-asm-${SLUG}`);
fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });

const verifyMp4 = (f) => {
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  const dur = parseFloat((probe.stdout || "").trim());
  if (!Number.isFinite(dur) || dur <= 0.1) return { ok: false, dur: 0 };
  const dec = spawnSync("ffmpeg", ["-v", "error", "-t", "5", "-i", f, "-f", "null", "-"], { encoding: "utf8" });
  return { ok: dec.status === 0, dur };
};

const segFiles = [];
for (const sg of segsSorted) {
  const worker = (acc.workers || []).find((w) => w.id === sg.workerId || w.username === sg.username);
  if (!worker) { console.error(`❌ worker bulunamadı: ${sg.username} (seg ${sg.seg})`); process.exit(1); }
  const repo = `${worker.username}/${worker.repo}`;
  const artifact = `video-${SLUG}-seg${sg.seg}`;
  console.log(`\n⬇  seg${sg.seg} [${sg.start}-${sg.end}] ← ${repo} (artifact ${artifact})`);

  const runs = gh(worker, ["run", "list", "--repo", repo, "--workflow", "render-video.yml", "-L", "25",
    "--json", "databaseId,status,conclusion,createdAt"], { json: true }) || [];
  const done = runs.filter((r) => r.status === "completed" && r.conclusion === "success");
  if (!done.length) { console.error(`❌ ${repo}: tamamlanmış başarılı run yok — seg${sg.seg} henüz bitmemiş olabilir.\n   Actions: https://github.com/${repo}/actions`); process.exit(2); }

  const segDir = path.join(tmpRoot, `seg${sg.seg}`);
  fs.mkdirSync(segDir, { recursive: true });
  let got = null;
  for (const r of done) {
    try {
      // Clean segDir before each attempt — a prior partial extraction leaves files that
      // make gh's zip extractor fail with "file exists" on retry.
      fs.rmSync(segDir, { recursive: true, force: true });
      fs.mkdirSync(segDir, { recursive: true });
      gh(worker, ["run", "download", String(r.databaseId), "--repo", repo, "--name", artifact, "--dir", segDir]);
      const mp4 = walk(segDir).find((f) => f.toLowerCase().endsWith(".mp4"));
      if (mp4) { got = mp4; break; }
    } catch { /* this run doesn't have that artifact — try older */ }
  }
  if (!got) { console.error(`❌ ${repo} son run'larında '${artifact}' artifact'i bulunamadı.`); process.exit(2); }

  const v = verifyMp4(got);
  if (!v.ok) { console.error(`❌ seg${sg.seg} bozuk/kesik (decode başarısız).`); process.exit(1); }
  console.log(`   ✓ seg${sg.seg} indirildi ve doğrulandı (${(v.dur / 60).toFixed(1)} dk)`);
  segFiles.push(got);
}

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
const dest = path.join(ROOT, "out", `${SLUG}.mp4`);
console.log(`\n🔗 ${segFiles.length} segment birleştiriliyor → out/${SLUG}.mp4`);
execSync(`ffmpeg -y -f concat -safe 0 -i "${partsFile}" -c copy "${dest}"`, { cwd: ROOT, stdio: process.stdout.isTTY ? "inherit" : "pipe" });

// ── verify final (concat can silently truncate) ───────────────────────────────
let ok = true, durMin = "?";
try {
  durMin = (Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${dest}"`, { encoding: "utf8" }).trim()) / 60).toFixed(1);
  execSync(`ffmpeg -v error -t 6 -i "${dest}" -f null -`, { stdio: "ignore" });
  execSync(`ffmpeg -v error -sseof -6 -i "${dest}" -f null -`, { stdio: "ignore" });
  console.log(`\n✅ DOĞRULANDI — out/${SLUG}.mp4 · ${durMin} dk · baş/son decode temiz.`);
} catch (e) {
  ok = false;
  console.warn(`\n⚠ Final doğrulama BAŞARISIZ: ${String(e.message).slice(0, 160)}`);
}
fs.rmSync(tmpRoot, { recursive: true, force: true });

fs.writeFileSync(path.join(ROOT, ".render-github-state.json"), JSON.stringify({
  slug: SLUG, split: true, segments: segsSorted.length, verified: ok, durationMin: durMin,
  repos: [...new Set(segsSorted.map((s) => `${s.username}/${s.repo}`))],
}, null, 2) + "\n");

if (ok) {
  const postScript = path.join(ROOT, "scripts", "post-render.js");
  if (fs.existsSync(postScript)) {
    spawnSync("node", [postScript, `--slug=${SLUG}`], { cwd: ROOT, stdio: process.stdout.isTTY ? "inherit" : "pipe" });
  }
  console.log(`\nSorunsuzsa temizle (her worker reposunun artifact/log'ları):`);
  segsSorted.forEach((s) => console.log(`   node scripts/render-github-cleanup.js --slug=${SLUG} --worker=${s.username}`));
} else {
  process.exit(1);
}
