#!/usr/bin/env node
/**
 * master-audio.js — two-pass EBU R128 loudness normalization for the narration.
 *
 * WHY: raw NotebookLM audio measures ~-25 LUFS. YouTube normalizes to ~-14 LUFS
 * but only ATTENUATES loud content — it never boosts quiet content. So an
 * un-mastered upload plays back ~11 dB quieter than every other video on the
 * platform: viewers raise the volume, the next video blasts them, and on a phone
 * speaker the narration is genuinely hard to make out. This is an intelligibility
 * problem that exists BEFORE any music is added.
 *
 * Two passes, because loudnorm's single-pass "dynamic" mode is an estimate:
 *   pass 1  measure (print_format=json)
 *   pass 2  apply with measured_* + linear=true (constant gain, no pumping)
 *
 * Duration is preserved, so an existing books/<slug>/config.vox.json stays valid —
 * only meta.audio needs re-pointing (--update-config does that).
 *
 * Usage:
 *   node scripts/master-audio.js --slug=the-frozen-river
 *   node scripts/master-audio.js --slug=the-frozen-river --update-config
 *   node scripts/master-audio.js --audio=public/audio/x.m4a --out=public/audio/x.mastered.m4a
 *
 * Options: --target=-14  --tp=-1.5  --lra=11  --force  --update-config  --quiet
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { ROOT, rel, abs, findAudio } = require("./lib/paths");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);

const SLUG = args.slug || null;
const TARGET_I = Number(args.target ?? -14);
const TARGET_TP = Number(args.tp ?? -1.5);
const TARGET_LRA = Number(args.lra ?? 11);
const QUIET = !!args.quiet;

const log = (...a) => { if (!QUIET) console.log(...a); };

// ── resolve input ───────────────────────────────────────────────────────────
let INPUT = args.audio || (SLUG ? findAudio(SLUG) : null);
if (!INPUT) {
  console.error("❌ Ses bulunamadı. --slug=<slug> ver (public/audio/<slug>.m4a) veya --audio=<yol>.");
  process.exit(1);
}
INPUT = INPUT.replace(/^\.\//, "");
const inAbs = path.isAbsolute(INPUT) ? INPUT : path.join(ROOT, INPUT);
if (!fs.existsSync(inAbs)) {
  console.error(`❌ Ses dosyası yok: ${INPUT}`);
  process.exit(1);
}
if (/\.mastered\.[a-z0-9]+$/i.test(INPUT)) {
  log(`ℹ  Zaten mastered bir dosya verildi (${INPUT}) — atlanıyor.`);
  process.exit(0);
}

const OUTPUT = args.out || INPUT.replace(/\.[a-z0-9]+$/i, ".mastered.m4a");
const outAbs = path.isAbsolute(OUTPUT) ? OUTPUT : path.join(ROOT, OUTPUT);

// ── ffmpeg helpers ──────────────────────────────────────────────────────────
function ff(argv, { capture = true } = {}) {
  return spawnSync("ffmpeg", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
}
function haveTool(name) {
  const r = spawnSync(name, ["-version"], { encoding: "utf8" });
  return r.status === 0;
}
function durationOf(p) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], { encoding: "utf8" });
  const v = parseFloat((r.stdout || "").trim());
  return Number.isFinite(v) ? v : null;
}

if (!haveTool("ffmpeg")) {
  console.error("❌ ffmpeg PATH'te yok — mastering atlanıyor.");
  process.exit(1);
}

// ── idempotence: skip when the master is newer than the source ──────────────
if (!args.force && fs.existsSync(outAbs) && fs.statSync(outAbs).mtimeMs >= fs.statSync(inAbs).mtimeMs) {
  log(`✓ Zaten mastered (güncel): ${OUTPUT}   (yeniden üretmek için --force)`);
  if (args["update-config"] && SLUG) updateConfig();
  process.exit(0);
}

// ── pass 1: measure ─────────────────────────────────────────────────────────
log(`\n🎚  MASTERING — ${INPUT}`);
log(`   hedef: ${TARGET_I} LUFS · TP ${TARGET_TP} dBTP · LRA ${TARGET_LRA}`);
log(`\n── [1/2] Ölçüm (loudnorm analiz)…`);

const measureFilter = `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`;
const p1 = ff(["-hide_banner", "-nostats", "-i", inAbs, "-af", measureFilter, "-f", "null", "-"]);
const stderr1 = (p1.stderr || "") + (p1.stdout || "");
if (p1.status !== 0) {
  console.error("❌ Ölçüm başarısız:\n" + stderr1.slice(-2000));
  process.exit(1);
}
const jsonMatch = stderr1.match(/\{[\s\S]*?"target_offset"[\s\S]*?\}/);
if (!jsonMatch) {
  console.error("❌ loudnorm JSON çıktısı okunamadı:\n" + stderr1.slice(-2000));
  process.exit(1);
}
let m;
try { m = JSON.parse(jsonMatch[0]); } catch (e) {
  console.error("❌ loudnorm JSON parse edilemedi: " + e.message);
  process.exit(1);
}
const inI = parseFloat(m.input_i), inTP = parseFloat(m.input_tp), inLRA = parseFloat(m.input_lra);
log(`   ölçülen : ${inI.toFixed(1)} LUFS · TP ${inTP.toFixed(1)} dBTP · LRA ${inLRA.toFixed(1)} LU`);
const gain = TARGET_I - inI;
log(`   kazanç  : ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB${gain > 6 ? "  (YouTube kısık videoyu YÜKSELTMEZ — bu kayıp geri gelmezdi)" : ""}`);
if (Math.abs(gain) < 0.7) log(`   ℹ  Zaten hedefe çok yakın; mastering yine de TP/LRA'yı düzeltir.`);

// ── pass 2: apply ───────────────────────────────────────────────────────────
log(`\n── [2/2] Uygulama (linear normalization + AAC 192k)…`);
const applyFilter =
  `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}` +
  `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
  `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;

fs.mkdirSync(path.dirname(outAbs), { recursive: true });
const tmp = outAbs + ".tmp.m4a";
const p2 = ff(["-hide_banner", "-nostats", "-y", "-i", inAbs, "-af", applyFilter, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp]);
if (p2.status !== 0) {
  try { fs.unlinkSync(tmp); } catch {}
  console.error("❌ Mastering başarısız:\n" + ((p2.stderr || "") + (p2.stdout || "")).slice(-2000));
  process.exit(1);
}
fs.renameSync(tmp, outAbs);

// ── verify: duration must not drift (beat/caption frames depend on it) ──────
const dIn = durationOf(inAbs), dOut = durationOf(outAbs);
if (dIn && dOut) {
  const drift = Math.abs(dOut - dIn);
  log(`   süre    : ${dIn.toFixed(2)}s → ${dOut.toFixed(2)}s  (sapma ${(drift * 1000).toFixed(0)} ms)`);
  if (drift > 0.1) {
    console.warn(`   ⚠ SÜRE SAPMASI ${(drift * 1000).toFixed(0)} ms > 100 ms — altyazı senkronu kayabilir, kontrol et.`);
  }
}
const outSummary = ((p2.stderr || "") + (p2.stdout || "")).match(/Output Integrated:\s*(-?[\d.]+)/);
if (outSummary) log(`   sonuç   : ${outSummary[1]} LUFS`);
log(`\n✓ ${OUTPUT}`);

// ── optionally re-point an already-planned config at the mastered file ──────
// Engine-aware: a book is planned into EITHER config.vox.json or
// config.antidote.json, and both carry meta.audio. Updating only the Vox one is
// how an Antidote book silently shipped 11 dB quiet.
function updateConfig() {
  if (!SLUG) return;
  const candidates = [
    [abs.voxConfig(SLUG), rel.voxConfig(SLUG)],
    [abs.antidoteConfig(SLUG), rel.antidoteConfig(SLUG)],
  ].filter(([a]) => fs.existsSync(a));
  if (!candidates.length) {
    log(`   ℹ  ${rel.voxConfig(SLUG)} / ${rel.antidoteConfig(SLUG)} yok — meta.audio güncellenmedi.`);
    return;
  }
  const newAudio = OUTPUT.replace(/^public\//, "");
  for (const [cfgAbs, cfgRel] of candidates) {
    const cfg = JSON.parse(fs.readFileSync(cfgAbs, "utf8"));
    if (cfg.meta.audio === newAudio) { log(`   ✓ ${cfgRel} → meta.audio zaten mastered dosyayı gösteriyor.`); continue; }
    const old = cfg.meta.audio;
    cfg.meta.audio = newAudio;
    fs.writeFileSync(cfgAbs, JSON.stringify(cfg, null, 2));
    log(`   ✓ ${cfgRel} → meta.audio: ${old} → ${newAudio}`);
  }
}
if (args["update-config"]) updateConfig();
