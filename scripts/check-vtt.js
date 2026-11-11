#!/usr/bin/env node
/**
 * check-vtt.js — PRE-FLIGHT GUARD for the book pipeline (make-book Step 0).
 *
 * Catches the "wrong / truncated caption file" class of bug BEFORE we spend
 * minutes planning + generating 60 images against the wrong book.
 *
 * Three checks (any hard failure aborts the pipeline with a clear message):
 *   1) DUPLICATE  — VTT is byte-identical to another book's VTT → almost always
 *                   a copy/rename mistake (this is exactly what bit us on
 *                   psychology-of-money = let-them-theory).
 *   2) COVERAGE   — VTT's last cue must reach ~the audio's real duration, else
 *                   the video gets silently truncated to the captions' length.
 *   3) BOOK MATCH — the VTT's opening narration must fingerprint-match the
 *                   COLD OPEN we authored in books/<slug>/prompt.notebooklm.md.
 *                   A totally different book scores ~0 overlap and fails.
 *
 * Usage:
 *   node scripts/check-vtt.js --slug=<slug> --vtt=<path> --audio=<relpath> --title="..." [--author="..."]
 * Exit 0 = OK (may print warnings), Exit 1 = hard fail (do not proceed).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { abs, rel } = require("./lib/paths");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
const TITLE = args.title || "";
const AUTHOR = args.author || "";
const VTT = args.vtt;
const AUDIO_REL = (args.audio || "").replace(/^public\//, "");

const fail = (msg) => { console.error(`\n❌ VTT KONTROL BAŞARISIZ: ${msg}`); process.exit(1); };
const warn = (msg) => console.warn(`   ⚠ ${msg}`);

if (!VTT || !fs.existsSync(path.join(ROOT, VTT))) fail(`VTT bulunamadı: ${VTT}`);
const vttPath = path.join(ROOT, VTT);
const raw = fs.readFileSync(vttPath, "utf8");

// ── helpers ────────────────────────────────────────────────────────────────
const tc = (t) => {
  const m = t.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0;
};
// Plain narration text from word-timestamped cues (dedup-free, no <tags>).
function plainText(vtt) {
  const inlineRe = /<\d+:\d+:\d+\.\d+><c>\s*([^<]+?)\s*<\/c>/g;
  const words = [];
  let m;
  while ((m = inlineRe.exec(vtt))) words.push(m[1]);
  let text = words.join(" ");
  if (!text) {
    // fallback: strip tags + dedup consecutive identical lines
    const seen = [];
    for (const ln of vtt.split(/\r?\n/)) {
      const s = ln.replace(/<[^>]+>/g, "").trim();
      if (s && !/-->/.test(s) && s !== "WEBVTT" && !/^(Kind|Language):/.test(s) && s !== seen[seen.length - 1]) seen.push(s);
    }
    text = seen.join(" ");
  }
  return text.replace(/\s+/g, " ").trim();
}
const STOP = new Set("a an the of to in on at is are was were be been it its this that and or but so for with as you your we our they them their he she his her at by from into about not no all one two".split(" "));
const contentWords = (s) =>
  new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)),
  );

const vttText = plainText(raw);
const lastCue = (raw.match(/(\d+:\d+:\d+\.\d+)\s+-->/g) || []).map((x) => tc(x)).reduce((a, b) => Math.max(a, b), 0);

console.log(`\n── [0] VTT ön-kontrol (${SLUG})`);
console.log(`   son cue: ${(lastCue / 60).toFixed(1)} dk · metin: ${vttText.length} karakter`);

// ── 1) DUPLICATE against other books' VTTs ──────────────────────────────────
const myHash = crypto.createHash("md5").update(raw).digest("hex");
const capDir = path.join(ROOT, "public", "captions");
if (fs.existsSync(capDir)) {
  for (const f of fs.readdirSync(capDir)) {
    if (!f.endsWith(".vtt")) continue;
    const p = path.join(capDir, f);
    if (path.resolve(p) === path.resolve(vttPath)) continue;
    const h = crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
    if (h === myHash) {
      fail(`Bu VTT, başka bir kitabın altyazısıyla BİREBİR AYNI: public/captions/${f}\n   → Yanlışlıkla kopyalanmış. Bu kitabın gerçek VTT'sini koy.`);
    }
  }
}

// ── 2) COVERAGE vs real audio duration ──────────────────────────────────────
let audioDur = 0;
if (AUDIO_REL) {
  const audioAbs = path.join(ROOT, "public", AUDIO_REL);
  if (fs.existsSync(audioAbs)) {
    try {
      audioDur = parseFloat(
        execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioAbs}"`, { encoding: "utf8" }).trim(),
      );
    } catch { warn("ffprobe yok/çalışmadı — süre kapsamı kontrol edilemedi."); }
  } else warn(`ses dosyası bulunamadı (${AUDIO_REL}) — süre kapsamı atlandı.`);
}
if (audioDur > 0) {
  const cov = lastCue / audioDur;
  console.log(`   ses: ${(audioDur / 60).toFixed(1)} dk · kapsam: %${(cov * 100).toFixed(0)}`);
  if (cov < 0.9) {
    fail(`VTT sesin sadece %${(cov * 100).toFixed(0)}'ini kaplıyor (son cue ${(lastCue / 60).toFixed(1)} dk, ses ${(audioDur / 60).toFixed(1)} dk).\n   → Video ${(lastCue / 60).toFixed(1)} dk'ya kırpılır. Tam uzunlukta / doğru VTT'yi indir.`);
  }
  if (lastCue > audioDur * 1.15) warn(`VTT sesten belirgin uzun — yanlış eşleşme olabilir.`);
}

// ── 3) BOOK MATCH via authored cold-open fingerprint ────────────────────────
const promptPath = abs.prompt(SLUG);
const head = contentWords(vttText.slice(0, 500)); // opening narration
if (fs.existsSync(promptPath)) {
  const pm = fs.readFileSync(promptPath, "utf8");
  const coMatch = pm.match(/COLD OPEN[\s\S]*?:\s*"([^"]{10,})"/i);
  if (coMatch) {
    const co = contentWords(coMatch[1]);
    let hit = 0;
    for (const w of co) if (head.has(w)) hit++;
    const ratio = co.size ? hit / co.size : 0;
    console.log(`   cold-open eşleşmesi: %${(ratio * 100).toFixed(0)} (${hit}/${co.size} anahtar kelime)`);
    if (ratio < 0.34) {
      // second chance: distinctive title words present anywhere?
      const titleWords = [...contentWords(TITLE), ...contentWords(AUTHOR)];
      const titleHit = titleWords.some((w) => vttText.toLowerCase().includes(w));
      if (!titleHit) {
        fail(`VTT'nin açılışı, bu kitap için yazdığımız COLD OPEN ile eşleşmiyor (%${(ratio * 100).toFixed(0)}).\n   → Muhtemelen başka kitabın VTT'si. Doğru kitabın altyazısını koy.`);
      }
      warn(`cold-open zayıf eşleşti ama kitap/yazar adı metinde geçiyor — devam ediliyor.`);
    }
  } else {
    warn(`prompt dosyasında COLD OPEN bulunamadı — kitap-eşleşme kontrolü atlandı.`);
  }
} else {
  warn(`prompt yok (${path.relative(ROOT, promptPath)}) — kitap-eşleşme kontrolü atlandı.`);
}

console.log(`   ✓ VTT ön-kontrol geçti\n`);
