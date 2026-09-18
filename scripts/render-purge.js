#!/usr/bin/env node
/**
 * render-purge.js — reclaim local disk after a book is DONE (rendered + uploaded).
 *
 * The final step of the pipeline. By default it deletes only the big GENERATED /
 * gitignored files for one book (the ~7 GB master, chunk dirs, mastered audio, temp
 * download dirs, state files) — a pure disk win with zero git impact.
 *
 * With --source it ALSO removes the book's COMMITTED source (raw audio, scene images,
 * captions, books/<slug>/) via `git rm` and regenerates the registry — use this only
 * when fully retiring a book (it can no longer be re-rendered without regenerating).
 *
 * Usage:
 *   node scripts/render-purge.js --slug=<slug>            # generated/local files only
 *   node scripts/render-purge.js --slug=<slug> --source   # + committed source (git rm), then commit
 *   node scripts/render-purge.js --slug=<slug> --dry       # preview, delete nothing
 *
 * Safety: pass --force to skip the "is out/<slug>.mp4 present?" done-check.
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const SLUG = args.slug;
if (!SLUG) { console.error("Kullanım: node scripts/render-purge.js --slug=<slug> [--source] [--dry] [--force]"); process.exit(1); }

const DRY = !!args.dry;
const abs = (p) => path.join(ROOT, p);
const exists = (p) => { try { fs.statSync(abs(p)); return true; } catch { return false; } };
const sizeOf = (p) => {
  let total = 0;
  const st = fs.statSync(abs(p));
  if (st.isDirectory()) for (const e of fs.readdirSync(abs(p))) total += sizeOf(path.join(p, e));
  else total += st.size;
  return total;
};
const isTracked = (p) => spawnSync("git", ["ls-files", "--error-unmatch", p], { cwd: ROOT }).status === 0;
const MB = (b) => (b / 1e6).toFixed(0);

// ── done-check: don't nuke a render that isn't finished ──────────────────────
if (!args.force && !exists(`out/${SLUG}.mp4`)) {
  console.error(`⚠ out/${SLUG}.mp4 yok — bu kitap render edilmemiş/indirilmemiş olabilir.`);
  console.error(`  Yanlış slug'ı silmemek için durduruldu. Yine de sil: --force`);
  process.exit(1);
}

// ── generated / gitignored (safe, big disk win) ──────────────────────────────
const generated = [
  `out/${SLUG}.mp4`,
  `out/thumbnail-${SLUG}.png`,
  `out/${SLUG}`,
  `out_Vox-${SLUG}_chunks`,
  `out_Antidote-${SLUG}_chunks`,
  `public/audio/${SLUG}.mastered.m4a`,
  `out/${SLUG}-segments`,
  `out/gh-dl-${SLUG}`,
  `out/gh-asm-${SLUG}`,
  `.render-github-split.${SLUG}.json`,
];
// state file only if it belongs to this slug
try { const s = JSON.parse(fs.readFileSync(abs(".render-github-state.json"), "utf8")); if (s.slug === SLUG) generated.push(".render-github-state.json"); } catch {}

// ── committed source (only with --source) ────────────────────────────────────
const source = [
  `public/audio/${SLUG}.m4a`, `public/audio/${SLUG}.mp3`, `public/audio/${SLUG}.wav`,
  `public/scenes/${SLUG}`,
  `public/captions/${SLUG}.vtt`, `public/captions/${SLUG}.clean.vtt`,
  `books/${SLUG}`,
];

let freed = 0;
const del = (p, viaGit) => {
  if (!exists(p)) return;
  const bytes = sizeOf(p);
  const tracked = viaGit && isTracked(p);
  console.log(`  🗑 ${p}  (${MB(bytes)} MB)${tracked ? " [git rm]" : ""}`);
  if (!DRY) {
    if (tracked) execSync(`git rm -rf --quiet -- "${p}"`, { cwd: ROOT });
    else fs.rmSync(abs(p), { recursive: true, force: true });
  }
  freed += bytes;
};

console.log(`\n══ PURGE → ${SLUG}${DRY ? "  (--dry: hiçbir şey silinmez)" : ""}`);
console.log(`\n[generated / local-only]`);
let any = false;
for (const p of generated) if (exists(p)) { del(p, false); any = true; }
if (!any) console.log("  (yok)");

if (args.source) {
  console.log(`\n[committed source — git rm]`);
  let anyS = false;
  for (const p of source) if (exists(p)) { del(p, true); anyS = true; }
  if (!anyS) console.log("  (yok)");
  if (!DRY && anyS) {
    // registry no longer imports this book's config → regenerate so the local build stays valid
    try { execSync("node scripts/gen-books-registry.js", { cwd: ROOT, stdio: "ignore" }); console.log("\n  ↻ registry yeniden üretildi (books.generated.ts)"); } catch {}
  }
}

console.log(`\n✓ ${DRY ? "silinecek" : "boşaldı"}: ~${MB(freed)} MB (${(freed / 1e9).toFixed(2)} GB)`);
if (args.source && !DRY) {
  console.log(`\n⚠ Kaynak git'ten çıkarıldı — commit et:`);
  console.log(`   git add -A && git commit -m "chore(${SLUG}): purge assets after upload"`);
  console.log(`   (Not: geçmiş .git'te kalır; çalışma ağacı yeri boşaldı. Kitap artık yeniden render için yeniden üretilmeli.)`);
}
if (!args.source && !DRY) {
  console.log(`\nℹ Commit'li kaynaklar (ham ses/sahneler/caption/config, ~100MB) duruyor. Onları da sil: --source`);
}
