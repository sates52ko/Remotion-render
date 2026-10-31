#!/usr/bin/env node
/**
 * verify-render-assets.js — GIT-AWARE pre-flight for a remote (GitHub/Lambda) render.
 *
 * verify-assets.js checks the LOCAL disk. That is not enough for a runner render:
 * the runner does a fresh `git checkout`, so an asset that exists on your disk but
 * is NOT committed 404s on the runner (this is exactly what broke the first martyr
 * render — the shared background PNG was on disk but untracked). This checks that
 * every asset the composition needs is **tracked by git** (will exist after checkout),
 * plus the pipeline scripts the workflow calls.
 *
 * Audio is special-cased: the runner MASTERS from raw (master-audio.js) and the
 * mastered file is gitignored, so we require the RAW audio to be tracked, not the
 * mastered one.
 *
 * Usage: node scripts/verify-render-assets.js --slug=martyr
 * Exits non-zero (with a ready-to-paste `git add`) if anything is untracked/missing.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { rel } = require("./lib/paths");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const SLUG = args.slug;
if (!SLUG) { console.error("Kullanım: node scripts/verify-render-assets.js --slug=<slug>"); process.exit(2); }

const BG = "broll-ocean-tanker/mo-photoshop-background.png";
const isTracked = (p) => spawnSync("git", ["ls-files", "--error-unmatch", p], { cwd: ROOT }).status === 0;
const onDisk = (p) => { try { return fs.statSync(path.join(ROOT, p)).size > 100; } catch { return false; } };

const cfgRel = rel.voxConfig(SLUG);
if (!fs.existsSync(path.join(ROOT, cfgRel))) { console.error(`❌ ${cfgRel} yok.`); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, cfgRel), "utf8"));

// ── collect everything the runner needs, as repo-relative paths ──────────────
const need = new Set();
// public assets (staticFile roots)
need.add(`public/${BG}`);
for (const b of cfg.beats) for (const im of b.images || []) { if (im.path) need.add(`public/${im.path}`); if (im.cut) need.add(`public/${im.cut}`); }
// raw audio (runner masters it) — derive from meta.audio, then confirm a raw exists
const rawFromMeta = String(cfg.meta.audio || "").replace(/\.mastered\.m4a$/, ".m4a");
let rawAudio = null;
for (const cand of [rawFromMeta, `audio/${SLUG}.m4a`, `audio/${SLUG}.mp3`, `audio/${SLUG}.wav`]) {
  if (cand && onDisk(`public/${cand}`)) { rawAudio = `public/${cand}`; break; }
}
if (rawAudio) need.add(rawAudio); else console.warn("⚠ ham ses bulunamadı (runner mastering için gerekli).");
// per-book config files the registry imports
for (const f of ["config.vox.json", "book.json", "youtube-meta.json"]) need.add(`books/${SLUG}/${f}`);
// pipeline scripts + engine the workflow/runner calls
for (const f of ["scripts/gen-books-registry.js", "scripts/master-audio.js", "scripts/render.js", "scripts/lib/paths.js", "src/engines/vox/index.tsx", "src/index.ts"]) need.add(f);

// ── classify ─────────────────────────────────────────────────────────────────
const untracked = [], missing = [], modified = [];
for (const p of need) {
  const disk = onDisk(p);
  const tracked = isTracked(p);
  if (!disk && !tracked) { missing.push(p); continue; }
  if (!tracked) { untracked.push(p); continue; }
  // tracked but has uncommitted local changes → runner gets the OLD version
  const st = spawnSync("git", ["status", "--porcelain", p], { cwd: ROOT, encoding: "utf8" }).stdout || "";
  if (st.trim()) modified.push(p);
}

console.log(`\n══ RENDER ÖN-KONTROL (git-aware) → ${SLUG}`);
console.log(`   kontrol edilen: ${need.size} · scene görsel: ${[...need].filter((p) => p.includes("/scenes/")).length}`);
if (missing.length) { console.log(`\n❌ DİSKTE YOK (${missing.length}):`); missing.forEach((p) => console.log("   " + p)); }
if (untracked.length) { console.log(`\n❌ COMMIT'LENMEMİŞ — runner'da 404 olur (${untracked.length}):`); untracked.forEach((p) => console.log("   " + p)); }
if (modified.length) { console.log(`\n⚠ COMMIT'LENMEMİŞ DEĞİŞİKLİK — runner eski sürümü çeker (${modified.length}):`); modified.forEach((p) => console.log("   " + p)); }

if (untracked.length || missing.length || modified.length) {
  const fix = [...untracked, ...modified].filter((p) => onDisk(p));
  if (fix.length) {
    console.log(`\n🔧 Düzelt:\n   git add ${fix.map((p) => `"${p}"`).join(" ")}\n   git commit -m "assets: <slug> render için eksik dosyalar"`);
  }
  process.exit(1);
}
console.log(`\n✓ tüm render asset'leri + scriptler commit'li ve güncel — runner çekişte eksiksiz.`);
