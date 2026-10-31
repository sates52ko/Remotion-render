#!/usr/bin/env node
/**
 * post-render.js — verify a finished render + check YouTube-readiness.
 *
 * Called automatically by render.js after any method (local/lambda/github) produces
 * out/<slug>.mp4, or run standalone:
 *   node scripts/post-render.js --slug=<slug>
 *
 * Steps:
 *   1. Verify MP4: ffprobe duration + head/tail decode check
 *   2. Check YouTube pack: thumbnail, clean.vtt, youtube-meta.json, youtube.md
 *   3. Print clear status summary
 *
 * Exit 0 = verified + YouTube-ready.  Exit 1 = MP4 bad.  Exit 2 = MP4 ok but pack incomplete.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const args = {};
process.argv.slice(2).forEach((arg) => {
  if (arg.startsWith("--")) {
    const [k, ...v] = arg.replace(/^--/, "").split("=");
    args[k] = v.length > 0 ? v.join("=") : true;
  }
});

const slug = args.slug;
if (!slug) {
  console.error("Kullanım: node scripts/post-render.js --slug=<slug>");
  process.exit(1);
}

const mp4 = path.join(ROOT, "out", `${slug}.mp4`);

console.log(`\n📋 POST-RENDER FİNALİZASYON — ${slug}`);
console.log("─".repeat(60));

// ── 1. MP4 Verify ───────────────────────────────────────────────────────────
let mp4Ok = false;
let durMin = "?";
let sizeMB = "?";

// Cloud assembly (render-github-cloud-assemble.js): the film was joined and verified on a runner — duration, frame
// count, FULL decode (a superset of the head/tail check below) and audio. Accept that report when the local film is
// absent (it lives in the run's artifact) or is byte-identical to it (sha256), so no local ffmpeg is needed.
const cloudFile = path.join(ROOT, `.render-github-cloud.${slug}.json`);
const cloud = fs.existsSync(cloudFile) ? (() => { try { return JSON.parse(fs.readFileSync(cloudFile, "utf8")); } catch { return null; } })() : null;
const cf = cloud && cloud.verified && cloud.report && cloud.report.final;
const sha256Of = (f) => { const h = require("crypto").createHash("sha256"); const fd = fs.openSync(f, "r"); const b = Buffer.alloc(8 << 20); let n; while ((n = fs.readSync(fd, b, 0, b.length, null)) > 0) h.update(b.subarray(0, n)); fs.closeSync(fd); return h.digest("hex"); };
if (cf && cf.file === `${slug}.mp4` && (!fs.existsSync(mp4) || sha256Of(mp4) === cf.sha256)) {
  mp4Ok = true;
  durMin = cf.durationSec ? (cf.durationSec / 60).toFixed(1) : "?";
  sizeMB = (cf.bytes / 1e6).toFixed(0);
  console.log(`✅ MP4 DOĞRULANDI (bulutta) — ${durMin} dk · ${sizeMB} MB · ${cf.frames}/${cf.expected} kare · tam decode temiz · ses var`);
  console.log(`   ${fs.existsSync(mp4) ? `out/${slug}.mp4 sha256 bulut raporuyla aynı` : `film artifact'te: ${cloud.finalArtifact.name} — ${cloud.run.url}`}`);
} else {
if (!fs.existsSync(mp4)) {
  console.error(`❌ MP4 bulunamadı: out/${slug}.mp4`);
  process.exit(1);
}

sizeMB = (fs.statSync(mp4).size / 1e6).toFixed(0);

const probe = spawnSync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4,
], { encoding: "utf8" });
const dur = parseFloat((probe.stdout || "").trim());
if (!Number.isFinite(dur) || dur <= 1) {
  console.error(`❌ ffprobe: geçersiz süre (${probe.stdout?.trim() || "boş"})`);
  process.exit(1);
}
durMin = (dur / 60).toFixed(1);

// Head decode (first 6 seconds)
const head = spawnSync("ffmpeg", ["-v", "error", "-t", "6", "-i", mp4, "-f", "null", "-"], { encoding: "utf8" });
if (head.status !== 0) {
  console.error(`❌ Head decode başarısız — dosya başı bozuk.`);
  process.exit(1);
}

// Tail decode (last 6 seconds)
const tail = spawnSync("ffmpeg", ["-v", "error", "-sseof", "-6", "-i", mp4, "-f", "null", "-"], { encoding: "utf8" });
if (tail.status !== 0) {
  console.error(`❌ Tail decode başarısız — dosya sonu kesik (concat truncation?).`);
  process.exit(1);
}

mp4Ok = true;
console.log(`✅ MP4 DOĞRULANDI — ${durMin} dk · ${sizeMB} MB · baş/son decode temiz`);
}

// ── 2. YouTube Pack Check ───────────────────────────────────────────────────
console.log(`\n📦 YouTube Pack kontrolü:`);

// Captions = the clean upload file ONLY (2026-10-28: TFS was accepted here with the raw rolling VTT, and YouTube
// rejected it). No clean file but a raw one → build it now (deterministic); then it must pass the upload validator.
const cleanVttPath = path.join(ROOT, "public", "captions", `${slug}.clean.vtt`);
const rawVttPath = path.join(ROOT, "public", "captions", `${slug}.vtt`);
if (!fs.existsSync(cleanVttPath) && fs.existsSync(rawVttPath)) {
  spawnSync(process.execPath, [path.join(ROOT, "scripts", "clean-vtt.js"), rawVttPath, cleanVttPath], { cwd: ROOT, stdio: "inherit" });
}
const vttCheck = require("./lib/vtt-validate").validateUploadVttFile(cleanVttPath);

const checks = [
  {
    label: "Thumbnail",
    paths: [
      path.join(ROOT, "out", `thumbnail-${slug}.png`),
      path.join(ROOT, "out", `thumbnail-${slug}.jpg`),
    ],
  },
  {
    label: "Captions (clean.vtt)",
    paths: vttCheck.ok ? [cleanVttPath] : [],
    why: vttCheck.ok ? "" : vttCheck.errors.join(" · "),
  },
  {
    label: "YouTube meta",
    paths: [
      path.join(ROOT, "books", slug, "youtube-meta.json"),
    ],
  },
  {
    label: "YouTube upload guide",
    paths: [
      path.join(ROOT, "books", slug, "youtube.md"),
    ],
  },
];

let allReady = true;
const missing = [];

for (const c of checks) {
  const found = c.paths.find((p) => fs.existsSync(p));
  if (found) {
    const rel = path.relative(ROOT, found);
    const extra = c.label === "Thumbnail"
      ? ` (${(fs.statSync(found).size / 1e3).toFixed(0)} KB)`
      : "";
    console.log(`   ✅ ${c.label}: ${rel}${extra}`);
  } else {
    allReady = false;
    missing.push(c.label);
    console.log(`   ❌ ${c.label}: ${c.why || "YOK"}`);
  }
}

// YouTube READY (titles, description, chapters, tags, hook, youtube.md, captions) — reported, never blocks the film.
const pack = require("./lib/title-lint").lintPack(slug, ROOT);
if (pack.status === "READY") console.log(`   ✅ YouTube READY (lint-titles.js --pack)`);
else {
  allReady = false;
  missing.push("YouTube READY");
  console.log(`   ❌ YouTube NOT READY — ${pack.errors.length} problem(s): ${pack.errors.slice(0, 4).map((e) => e.split(":")[0]).join(", ")}${pack.errors.length > 4 ? " …" : ""}`);
  console.log(`      details: node scripts/lint-titles.js --slug=${slug} --pack`);
}

// ── 3. Local cleanup ────────────────────────────────────────────────────────
const cleanVtt = cleanVttPath;
const rawVtt = rawVttPath;
// the raw VTT is the only source to rebuild the upload file from — removed only once the clean file is valid
if (vttCheck.ok && fs.existsSync(cleanVtt) && fs.existsSync(rawVtt)) {
  fs.unlinkSync(rawVtt);
  console.log(`\n🧹 Temizlik: ${slug}.vtt silindi (clean.vtt mevcut)`);
}
const splitState = path.join(ROOT, `.render-github-split.${slug}.json`);
if (fs.existsSync(splitState)) {
  fs.unlinkSync(splitState);
  console.log(`🧹 Temizlik: .render-github-split.${slug}.json silindi`);
}
const asmDir = path.join(ROOT, "out", `gh-asm-${slug}`);
if (fs.existsSync(asmDir)) {
  fs.rmSync(asmDir, { recursive: true, force: true });
  console.log(`🧹 Temizlik: out/gh-asm-${slug}/ silindi`);
}

// ── 4. Summary ──────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
if (allReady) {
  console.log(`🎉 YOUTUBE-READY — ${slug}`);
  console.log(`   📹 out/${slug}.mp4 (${durMin} dk, ${sizeMB} MB)`);
  console.log(`   Yükle: books/${slug}/youtube.md içindeki adımları takip et.`);
} else {
  console.log(`⚠  MP4 hazır ama YouTube paketi eksik: ${missing.join(", ")}`);
  console.log(`   Eksikleri tamamla, sonra tekrar çalıştır:`);
  console.log(`   node scripts/post-render.js --slug=${slug}`);
}
console.log("─".repeat(60) + "\n");

process.exit(allReady ? 0 : 2);
