#!/usr/bin/env node
/**
 * make-book.js — ONE COMMAND that turns (audio + word-level VTT + book meta)
 * into a preview-ready Vox video + YouTube upload pack.
 *
 * Runs, in order:
 *   0. check-vtt.js         pre-flight: right book + full-length + not a copy
 *   0.5 master-audio.js     two-pass loudnorm -> -14 LUFS (YouTube playback target)
 *   1. plan-vox.js          VTT -> beats/archetypes/word-anchored sync/captions
 *   2. gen-vox-images.py    Flux images for every beat that needs one
 *   3. cutout.py            rembg transparency for subject cut-outs
 *   4. plan-meta.js         CTR/SEO titles, description, tags, chapters, thumb brief
 *   4.1 clean-vtt.js        YouTube-safe CC (public/captions/<slug>.clean.vtt)
 *   5. thumbnail art director → five governed visual concepts
 *   5.1 gen-thumbnail.py    generate concept candidates + select/cut winner
 *   6. verify-assets.js     every referenced asset exists (fail fast)
 *   7. gen-books-registry   registers the book as a Remotion composition
 *   8. remotion still       composited out/thumbnail-<slug>.png (NO --gl=angle)
 *
 * Produces the full YouTube publish pack (youtube-<slug>.md, clean.vtt, thumbnail png)
 * automatically — all render-independent, ready before the video renders.
 *
 * Usage:
 *   node scripts/make-book.js --slug=my-book --title="My Book" --author="Author" --genre=romance
 *   (audio auto-detected at public/audio/<slug>.(m4a|mp3), VTT at public/captions/<slug>.vtt)
 *
 *   --render  also dispatches the render across the whole worker pool and waits for
 *             out/<slug>.mp4 — i.e. audio+VTT in, finished video out, one command.
 *
 * Options: --audio=..  --vtt=..  --until=<sec>  --skip-images  --skip-master  --no-llm
 *          --render [--segments=pool|N]
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { rel, readManifest } = require("./lib/paths");
const { analyzeEngineFromVtt } = require("./lib/vtt");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);

const TITLE = args.title;
const AUTHOR = args.author || "";
const GENRE = (args.genre || "drama").toLowerCase();
if (!TITLE) {
  console.error('Kullanım: node scripts/make-book.js --slug=<slug> --title="Kitap" --author="Yazar" --genre=romance');
  process.exit(1);
}
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SLUG = args.slug || slugify(TITLE);

// ── locate inputs ─────────────────────────────────────────────────────────
function findAudio() {
  if (args.audio) return args.audio.replace(/^public\//, "");
  for (const ext of ["m4a", "mp3", "wav"]) {
    const rel = `audio/${SLUG}.${ext}`;
    if (fs.existsSync(path.join(ROOT, "public", rel))) return rel;
  }
  return null;
}
function findVtt() {
  const cands = args.vtt ? [args.vtt] : [`public/captions/${SLUG}.vtt`, `public/captions/captions.vtt`];
  return cands.find((c) => fs.existsSync(path.join(ROOT, c))) || null;
}

const AUDIO = findAudio();
const VTT = findVtt();

// Engine is decided at Step 0 (make-prompt) and recorded in books/<slug>/book.json.
// make-book READS it as the source of truth — it does not re-decide. --engine overrides.
const MANIFEST = readManifest(SLUG);
const ENGINE = (args.engine || MANIFEST?.engine || "vox").toLowerCase();
if (!["vox", "antidote"].includes(ENGINE)) {
  console.error(`❌ Bilinmeyen engine "${ENGINE}" (book.json). Sadece: vox | antidote`);
  process.exit(1);
}

// VTT-based engine cross-check: warn if book.json engine contradicts actual content
const vttForCheck = VTT && fs.existsSync(path.join(ROOT, VTT)) ? path.join(ROOT, VTT) : null;
const vttSignal = vttForCheck ? analyzeEngineFromVtt(fs.readFileSync(vttForCheck, "utf8")) : null;

console.log(`\n══ MAKE BOOK: ${TITLE}${AUTHOR ? " — " + AUTHOR : ""} (${GENRE}) ══`);
console.log(`   slug   : ${SLUG}`);
console.log(`   engine : ${ENGINE.toUpperCase()}${MANIFEST?.engine ? "" : "  (book.json'da engine yok → vox varsayıldı; make-prompt ile karar yaz)"}`);
if (MANIFEST?.engineRationale) console.log(`            ${MANIFEST.engineRationale}`);
if (vttSignal && vttSignal.confidence === "strong" && vttSignal.pick !== ENGINE) {
  console.warn(`\n   ⚠  VTT ANALİZİ UYARISI: İçerik ${vttSignal.pick.toUpperCase()} diyor (${vttSignal.antidoteScore} vs ${vttSignal.voxScore}, güçlü)`);
  console.warn(`      ama book.json engine=${ENGINE}. Yanlış motor olabilir — kontrol et!`);
  console.warn(`      Değiştirmek: book.json'da "engine": "${vttSignal.pick}" yap veya --engine=${vttSignal.pick}\n`);
}
console.log(`   audio  : ${AUDIO || "❌ BULUNAMADI"}`);
console.log(`   vtt    : ${VTT || "❌ BULUNAMADI"}\n`);

const problems = [];
if (!AUDIO) problems.push(`Ses dosyası yok. Koy: public/audio/${SLUG}.m4a  (veya --audio=... ver)`);
if (!VTT) problems.push(`VTT yok. Koy: public/captions/${SLUG}.vtt  (veya --vtt=... ver)`);
if (problems.length) {
  problems.forEach((p) => console.error("  ⚠ " + p));
  process.exit(1);
}

const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

// ── ANTIDOTE branch ─────────────────────────────────────────────────────────
// Flat-vector rigged characters + kinetic text (no Flux/rembg). plan-antidote
// emits a render-ready books/<slug>/config.antidote.json scaffold that Claude
// then art-directs. The Vox-only steps (Flux images, cut-outs, Flux thumbnail)
// don't apply, so we run: plan → register → hub index, then hand off to Claude.
if (ENGINE === "antidote") {
  const ACFG = rel.antidoteConfig(SLUG);
  const t0a = Date.now();
  step(0, "VTT ön-kontrol", `node scripts/check-vtt.js --slug=${SLUG} --vtt=${VTT} --audio=${AUDIO} --title=${q(TITLE)} --author=${q(AUTHOR)}`);
  step(0.8, "Art Director (Ön Yapım, Dünya & Varlık Analizi)",
    `node scripts/preproduce.js --slug=${SLUG} --title=${q(TITLE)} --author=${q(AUTHOR)} --genre=${GENRE} --vtt=${VTT}`);
  // 0.9) READ THE BOOK. One pass over the whole narration -> books/<slug>/story-bible.json
  // (era + anachronism forbid list, cast with a reusable `look`, real places, the book's own
  // recurring objects). Everything downstream that knows what a beat is ABOUT is grounded in
  // this file. Heuristic here; the authored version is `plan-bible.js --emit` -> Claude ->
  // `--bible`, and an existing story-bible.json is never overwritten.
  if (!args["skip-plan"] && !fs.existsSync(path.join(ROOT, "books", SLUG, "story-bible.json"))) {
    step(0.9, "Kitabı oku (story bible: dönem, kadro, mekânlar, nesneler)",
      `node scripts/plan-bible.js --slug=${SLUG} --vtt=${VTT}`, { optional: true });
  }
  if (!args["skip-plan"]) {
    const APLAN = `node scripts/plan-antidote.js --vtt=${VTT} --slug=${SLUG} --title=${q(TITLE)} --author=${q(AUTHOR)} --genre=${GENRE}${args.until ? ` --until=${args.until}` : ""}`;
    step(1, "Plan (VTT → sahneler, kinetik metin, altyazı) [Antidote]", APLAN);
    // 1.2-1.3) Briefs are derived FROM a planned config (they need the final scene
    // segmentation to fingerprint against), so the plan runs twice: once to segment, once
    // knowing what each scene is about. Planning is seconds; the second pass is what turns
    // "an icon picked by rnd(seed + i*7)" into "the icon this sentence is about".
    step(1.2, "Beat brief'leri (her sahnenin KONUSU)", `node scripts/plan-briefs.js --slug=${SLUG}`, { optional: true });
    if (fs.existsSync(path.join(ROOT, "books", SLUG, "beat-briefs.json"))) {
      step(1.3, "Yeniden plan (brief'lerle)", `${APLAN} --briefs=books/${SLUG}/beat-briefs.json`);
    }
    // 1.35-1.4) Macro Sequence Arcs & Semantic Visual Alignment (Antidote 6.0)
    step(1.35, "Makro Merak Döngüleri (Sequence Arcs)", `node scripts/plan-sequence-arcs.js --slug=${SLUG}`, { optional: true });
    step(1.4, "Semantik Görsel Düzenleme & Üç Katman Kuralı", `node scripts/apply-semantic-arcs.js --slug=${SLUG}`, { optional: true });
  } else if (!fs.existsSync(path.join(ROOT, ACFG))) {
    console.error(`❌ --skip-plan ama ${ACFG} yok.`); process.exit(1);
  }
  // VISUAL EVENT BUDGET — the plan is measured, not eyeballed. A generated film
  // has no one watching the cut, so "nothing has happened for twelve seconds"
  // is invisible until the render is done and 35 minutes long. Advisory here
  // (optional: true) so it reports without stopping an unattended run; the
  // numbers go in the log and Claude art-directs against them.
  step(1.5, "Görsel olay denetimi (dead-air bütçesi)",
    `node scripts/audit-antidote.js --slug=${SLUG} --soft`, { optional: true });
  // ...and its sibling: audit-antidote asks whether the picture CHANGES often
  // enough, never whether it is about the right thing. A film in which every
  // icon is wrong passes it cleanly. Advisory for now (49/49 books are over
  // budget on the 2026-09-12 baseline, so a hard gate would stop every run);
  // Phase 5 of VISUAL_RELEVANCE_PLAN.md turns it into a real gate.
  step(1.6, "Anlam denetimi (anlatım ↔ görsel uyumu)",
    `node scripts/audit-relevance.js --slug=${SLUG} --soft`, { optional: true });
  // 1.7) COGNITIVE REDUNDANCY & ILLUSTRATED RADIO AUDIT
  // Checks VO-text echo rate (parrot quotes), triple redundancy, and static scenes.
  step(1.7, "Bilişsel Yük & Semantik Redundancy Denetimi",
    `node scripts/audit-semantic-redundancy.js --slug=${SLUG} --soft`, { optional: true });
  // 1.75) NARRATIVE DIRECTOR CORE (Phase 1)
  step(1.75, "Anlatı Yönetmeni & 6 Altın Kural Denetimi (God Mode Phase 1)",
    `node scripts/audit-narrative.js --slug=${SLUG} --soft`, { optional: true });
  // 1.8) STAGNATION ENGINE (Phase 2)
  step(1.8, "Görsel Durgunluk & Durum Parmak İzi Denetimi (God Mode Phase 2)",
    `node scripts/audit-stagnation.js --slug=${SLUG} --soft`, { optional: true });
  // 1.85) PROMISE / PAYOFF ENGINE (Phase 3)
  step(1.85, "Vaat & Karşılık Yaşam Döngüsü Denetimi (God Mode Phase 3)",
    `node scripts/audit-promises.js --slug=${SLUG} --soft`, { optional: true });
  // 1.86) NOVELTY BUDGET ENGINE (Phase 4)
  step(1.86, "Görsel Yenilik Bütçesi Denetimi (God Mode Phase 4)",
    `node scripts/audit-novelty.js --slug=${SLUG} --soft`, { optional: true });
  // 1.87) CHAPTER-LEVEL NARRATIVE ARCS (Phase 6)
  step(1.87, "Bölüm Düzeyi Merak Döngüsü Denetimi (God Mode Phase 6)",
    `node scripts/audit-chapters.js --slug=${SLUG} --soft`, { optional: true });
  // 1.88) AUDIO DIRECTOR SOUND DESIGN (Phase 7)
  step(1.88, "Ses Yönetmeni & Dokunsal SFX Denetimi (God Mode Phase 7)",
    `node scripts/audit-audio.js --slug=${SLUG} --soft`, { optional: true });
  // 1.89) GOD MODE PRE-RENDER HARD GATES (Phase 10)
  step(1.89, "God Mode 8 Altın Kural Kapısı (Pre-Render Hard Gate)",
    `node scripts/hard-gate.js --slug=${SLUG} --auto-fix`);
  // Mastering is NOT Vox-specific: raw NotebookLM audio sits ~-25 LUFS and
  // YouTube never boosts quiet uploads, so an un-mastered Antidote book plays
  // ~11 dB below every other video too. Runs AFTER the plan so --update-config
  // re-points the freshly written meta.audio at the mastered file.
  if (!args["skip-master"]) {
    step(0.5, "Ses mastering (loudnorm → -14 LUFS)",
      `node scripts/master-audio.js --slug=${SLUG} --update-config`, { optional: true });
  } else {
    console.log(`\n── [0.5] Ses mastering atlandı (--skip-master)`);
  }
  // YouTube pack — now Antidote-native (plan-antidote-meta). Deterministic scaffold
  // + needsClaudeRefine, exactly like Vox: titles/description/tags + chapters from
  // the scene/act timeline, then Claude hand-refines from the VTT before upload.
  const A_META = rel.youtubeMeta(SLUG);
  const A_CLEAN_VTT = `public/captions/${SLUG}.clean.vtt`;
  step(4, "YouTube metadata (CTR + SEO) [Antidote]", `node scripts/plan-antidote-meta.js --slug=${SLUG}`, { optional: true });
  step(4.1, "Temiz altyazı (YouTube CC)", `node scripts/clean-vtt.js ${VTT} ${A_CLEAN_VTT}`, { optional: true });
  // 5) Governed multi-concept thumbnail pipeline. The critic sees the entire
  // channel history so a visually strong but repetitive template cannot win.
  const A_CONCEPTS = `books/${SLUG}/thumbnail-concepts.json`;
  step(5, "Thumbnail art director (5 özgün konsept)", `node scripts/thumbnail-art-director.js --slug=${SLUG}`, { optional: true });
  step(5.1, "Thumbnail aday görselleri (Flux)", `python scripts/gen-thumbnail.py ${A_META} --concepts=${A_CONCEPTS}`, { optional: true });
  step(5.2, "Thumbnail critic (CTR + özgünlük + vaat güvenliği)", `node scripts/thumbnail-critic.js --slug=${SLUG}`, { optional: true });
  step(5.3, "Kazanan thumbnail cut-out", `python scripts/gen-thumbnail.py ${A_META} --concepts=${A_CONCEPTS} --winner-only`, { optional: true });
  step(7, "Kompozisyon kaydı", `node scripts/gen-books-registry.js`);
  // Thumbnail PNG (code-rendered Thumb-<slug>; no --gl=angle on this GPU-less box).
  const A_THUMB = `out/thumbnail-${SLUG}.png`;
  step(8, "Thumbnail PNG (Remotion still)", `npx remotion still Thumb-${SLUG} ${A_THUMB} --frame=0 --puppeteer-timeout=120000`, { optional: true, retries: 2 });
  step(9, "Kitap hub index", `node scripts/gen-book-readme.js ${SLUG}`, { optional: true });
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`✅ HAZIR (Antidote scaffold) — ${TITLE}  (${((Date.now() - t0a) / 1000).toFixed(0)}s)`);
  console.log(`\n📺 ÖNİZLE (Studio):  npm run dev → http://localhost:3000/Antidote-${SLUG}`);
  console.log(`\n✍  CLAUDE ŞİMDİ ART-DIRECT ETMELİ: ${ACFG}`);
  console.log(`   her sahne için karakter/ifade/aksiyon + kinetik metni elle düzenle (scaffold yalnızca zamanlama+yer tutucu).`);
  console.log(`\n📤 YÜKLEME PAKETİ: ${rel.youtubeMd(SLUG)} · ${A_THUMB} · ${A_CLEAN_VTT}`);
  // Surface the mandatory Claude refine of the YouTube pack (same rule as Vox).
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, A_META), "utf8"));
    if (meta.needsClaudeRefine) {
      console.log(`\n⚠  META ELDE GEÇİRME (ZORUNLU — scaffold): ${A_CLEAN_VTT} anlatımını oku, sonra ${rel.youtubeMd(SLUG)} + ${A_META} içinde:`);
      console.log(`     • chapters → GERÇEK konu geçişleri (mekanik 150sn DEĞİL) · başlıklar kancalı, anahtar-kelime önde`);
      console.log(`     • açıklama kancası = videonun cold-open cümlesi · thumbnail.hook kitaba özgü & özgün`);
      console.log(`   sonra meta'da "refinedBy":"claude-hand-refined" işaretle.`);
    }
  } catch {}
  console.log(`═══════════════════════════════════════════\n`);
  process.exit(0);
}

// ── VOX branch (default) ─────────────────────────────────────────────────────
const CFG = rel.voxConfig(SLUG);
const META = rel.youtubeMeta(SLUG);

function step(n, label, cmd, { optional = false, retries = 0 } = {}) {
  console.log(`\n── [${n}] ${label}`);
  console.log(`   $ ${cmd}`);
  for (let attempt = 1; ; attempt++) {
    try {
      execSync(cmd, { cwd: ROOT, stdio: "inherit" });
      return true;
    } catch (e) {
      // `retries` is for steps that fail for TRANSIENT reasons, not wrong input —
      // chiefly the Remotion browser launch, which times out when the machine is
      // busy (this box is GPU-less and often has a Studio/dev server up). Retrying
      // is the difference between an unattended run producing the thumbnail and
      // silently skipping it.
      if (attempt <= retries) {
        console.warn(`   ⚠ başarısız — ${attempt}/${retries} yeniden deneniyor (10s)...`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
        continue;
      }
      if (optional) {
        console.warn(`   ⚠ atlandı (hata): ${label}`);
        return false;
      }
      console.error(`\n❌ ADIM BAŞARISIZ: ${label}`);
      process.exit(1);
    }
  }
}

const t0 = Date.now();

// 0) pre-flight: VTT is the RIGHT book, full-length, not a copy of another book
step(
  0,
  "VTT ön-kontrol (doğru kitap + tam uzunluk + kopya değil)",
  `node scripts/check-vtt.js --slug=${SLUG} --vtt=${VTT} --audio=${AUDIO} --title=${q(TITLE)} --author=${q(AUTHOR)}`,
);

// 0.5) master the narration (two-pass EBU R128 → -14 LUFS).
//   Raw NotebookLM audio sits ~-25 LUFS. YouTube only ATTENUATES loud uploads —
//   it never boosts quiet ones — so an un-mastered upload plays ~11 dB below every
//   other video on the platform (hard to hear on a phone, reads as amateur).
//   Duration is preserved, so VTT/beat timings are unaffected; the plan below is
//   simply pointed at the mastered file.
let PLAN_AUDIO = AUDIO;
if (!args["skip-master"]) {
  // With --skip-plan the config is NOT rewritten below, so master-audio has to
  // re-point meta.audio itself; otherwise plan-vox writes PLAN_AUDIO into it.
  step(
    0.5,
    "Ses mastering (loudnorm → -14 LUFS)",
    `node scripts/master-audio.js --slug=${SLUG}${args["skip-plan"] ? " --update-config" : ""}`,
    { optional: true },
  );
  const mastered = `audio/${SLUG}.mastered.m4a`;
  if (fs.existsSync(path.join(ROOT, "public", mastered))) {
    PLAN_AUDIO = mastered;
    console.log(`   → plan bu sesi kullanacak: public/${mastered}`);
  } else {
    console.warn(`   ⚠ mastering üretilemedi — ham ses kullanılıyor (${AUDIO}).`);
  }
} else {
  console.log(`
── [0.5] Ses mastering atlandı (--skip-master)`);
}

step(0.8, "Art Director (Ön Yapım, Dünya & Varlık Analizi)",
  `node scripts/preproduce.js --slug=${SLUG} --title=${q(TITLE)} --author=${q(AUTHOR)} --genre=${GENRE} --vtt=${VTT}`);

// 1) plan  (--skip-plan keeps an existing hand-directed books/<slug>/config.vox.json;
//    Claude-first flow: pre-run plan-vox with --emit-beats/--designs, then make-book --skip-plan)
// 0.9) READ THE BOOK first — see the note on the Antidote branch above.
if (!args["skip-plan"] && !fs.existsSync(path.join(ROOT, "books", SLUG, "story-bible.json"))) {
  step(0.9, "Kitabı oku (story bible: dönem, kadro, mekânlar, nesneler)",
    `node scripts/plan-bible.js --slug=${SLUG} --vtt=${VTT}`, { optional: true });
}
if (!args["skip-plan"]) {
  const VPLAN = `node scripts/plan-vox.js --vtt=${VTT} --audio=${PLAN_AUDIO} --title=${q(TITLE)} --author=${q(AUTHOR)} --genre=${GENRE} --slug=${SLUG}${args.until ? ` --until=${args.until}` : ""}${args["no-llm"] ? " --no-llm" : ""}${args["use-llm"] ? " --use-llm" : ""}`;
  step(1, "Plan (VTT → beats, arketipler, kelime-senkron, altyazı)", VPLAN);
  // 1.2-1.3) see the Antidote branch: briefs need the plan's own segmentation to
  // fingerprint against, so the plan runs twice. On the Vox side the payoff is the Flux
  // prompt — the second pass replaces `keywords(text,3).join(", ")` with a described shot
  // that reuses the bible's `look`, so a character is the same person in every frame.
  // It runs BEFORE step 2, so images are generated once, from the good prompts.
  step(1.2, "Beat brief'leri (her beat'in KONUSU)", `node scripts/plan-briefs.js --slug=${SLUG}`, { optional: true });
  if (fs.existsSync(path.join(ROOT, "books", SLUG, "beat-briefs.json"))) {
    step(1.3, "Yeniden plan (brief'lerle)", `${VPLAN} --briefs=books/${SLUG}/beat-briefs.json`);
  }
} else {
  if (!fs.existsSync(path.join(ROOT, CFG))) { console.error(`❌ --skip-plan ama ${CFG} yok. Önce plan üret.`); process.exit(1); }
  console.log(`\n── [1] Plan atlandı (--skip-plan) — mevcut ${CFG} kullanılıyor`);
}

// 1.6) does the picture mean what the narration says? Advisory (see the note on
// the Antidote branch above); Vox had no pre-render art-direction audit at all.
step(1.6, "Anlam denetimi (anlatım ↔ görsel uyumu)",
  `node scripts/audit-relevance.js --slug=${SLUG} --soft`, { optional: true });

// 2) images + 3) cutouts
if (!args["skip-images"]) {
  step(2, "Görseller (NVIDIA Flux)", `python scripts/gen-vox-images.py ${CFG}`);
  step(3, "Cut-out'lar (rembg)", `python scripts/cutout.py ${CFG}`);
} else {
  console.log("\n── [2-3] Görseller/cut-out atlandı (--skip-images)");
}

// 4) youtube metadata (max-conversion titles/description/tags/chapters)
step(4, "YouTube metadata (CTR + SEO)", `node scripts/plan-meta.js ${CFG}`);

// 4b) clean CC for YouTube upload (raw VTT keeps inline <c> word-timing for the
//     burned-in karaoke; YouTube's uploader rejects that → emit a clean sibling)
const CLEAN_VTT = `public/captions/${SLUG}.clean.vtt`;
step(4.1, "Temiz altyazı (YouTube CC)", `node scripts/clean-vtt.js ${VTT} ${CLEAN_VTT}`, { optional: true });

// 5) Governed five-concept thumbnail system. Art direction is deliberately
// separated from image generation, scoring and cut-out so agents can inspect
// the promise at each hand-off instead of shipping one repeated template.
const CONCEPTS = `books/${SLUG}/thumbnail-concepts.json`;
step(5, "Thumbnail art director (5 özgün konsept)", `node scripts/thumbnail-art-director.js --slug=${SLUG}`, { optional: true });
step(5.1, "Thumbnail aday görselleri (Flux)", `python scripts/gen-thumbnail.py ${META} --concepts=${CONCEPTS}`, { optional: true });
step(5.2, "Thumbnail critic (CTR + özgünlük + vaat güvenliği)", `node scripts/thumbnail-critic.js --slug=${SLUG}`, { optional: true });
step(5.3, "Kazanan thumbnail cut-out", `python scripts/gen-thumbnail.py ${META} --concepts=${CONCEPTS} --winner-only`, { optional: true });

// 6) verify
step(6, "Asset doğrulama", `node scripts/verify-assets.js ${CFG}`);

// 7) register composition
step(7, "Kompozisyon kaydı", `node scripts/gen-books-registry.js`);

// 8) composite thumbnail PNG (local still; NO --gl=angle — that flag times out the
//    browser launch on this GPU-less machine). Needs Thumb-<slug> from step 7.
//    --puppeteer-timeout: the default 25s browser launch times out on this GPU-less
//    machine whenever it is under load (a Studio/dev server up, or a render finishing),
//    which silently skipped the thumbnail. 120s + 2 retries makes it survive that.
const THUMB_PNG = `out/thumbnail-${SLUG}.png`;
step(8, "Thumbnail PNG (Remotion still)", `npx remotion still Thumb-${SLUG} ${THUMB_PNG} --frame=0 --puppeteer-timeout=120000`, { optional: true, retries: 2 });

// 9) per-book hub index (books/<slug>/README.md linking every deliverable)
step(9, "Kitap hub index (books/<slug>/README.md)", `node scripts/gen-book-readme.js ${SLUG}`, { optional: true });

// ── summary ───────────────────────────────────────────────────────────────
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, CFG), "utf8"));
const mins = (cfg.meta.totalFrames / cfg.meta.fps / 60).toFixed(1);
const imgs = cfg.beats.reduce((a, b) => a + b.images.length, 0);
const types = cfg.beats.reduce((a, b) => ((a[b.type] = (a[b.type] || 0) + 1), a), {});
const secs = ((Date.now() - t0) / 1000).toFixed(0);

console.log(`\n═══════════════════════════════════════════`);
console.log(`✅ HAZIR — ${TITLE}  (${secs}s)`);
console.log(`   süre     : ${mins} dk · ${cfg.beats.length} sahne · ${cfg.captions.length} altyazı`);
console.log(`   görsel   : ${imgs}`);
console.log(`   arketip  : ${JSON.stringify(types)}`);
console.log(`\n📺 ÖNİZLE (Studio):`);
console.log(`   npm run dev   →   http://localhost:3000/Vox-${SLUG}`);
console.log(`\n🖼️  THUMBNAIL: out/thumbnail-${SLUG}.png ${fs.existsSync(path.join(ROOT, THUMB_PNG)) ? "✓" : "(adım 8 atlandıysa: npx remotion still Thumb-" + SLUG + " out/thumbnail-" + SLUG + ".png --frame=0)"}`);
console.log(`\n🎬 RENDER:`);
console.log(`   • Yerel (varsayılan): node scripts/render.js --slug=${SLUG}  (veya: npm run render -- --slug=${SLUG})`);
console.log(`   • AWS Lambda        : node scripts/render.js --slug=${SLUG} --method=lambda`);
console.log(`   • GitHub Actions    : node scripts/render.js --slug=${SLUG} --method=github`);
console.log(`\n📤 YÜKLEME PAKETİ (hazır):`);
console.log(`   out/${SLUG}.mp4            (render sonrası)`);
console.log(`   out/thumbnail-${SLUG}.png  (+ overlay hook: books/${SLUG}/youtube.md)`);
console.log(`   books/${SLUG}/youtube.md   (başlık/açıklama/tag/bölümler)  ← per-book hub`);
console.log(`   books/${SLUG}/README.md    (kitabın tüm dosyalarına index)`);
console.log(`   ${CLEAN_VTT}   ← YouTube'a "Zamanlama ile" CC olarak yükle (ham ${VTT} DEĞİL)`);

// ── MANDATORY orchestration step: Claude hand-refines the YouTube pack ───────
// The deterministic (no-LLM) meta fallback cannot find real topic boundaries or
// write a curiosity hook — it emits ~150s-spaced chapters with narration-snippet
// labels. Whenever that path ran, Claude MUST rewrite the pack from the VTT before
// upload. Surfaced here so the step is never silently skipped.
try {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, META), "utf8"));
  if (meta.needsClaudeRefine) {
    console.log(`\n⚠  META ELDE GEÇİRME (ZORUNLU — copy fallback ile üretildi):`);
    console.log(`   Claude, ${CLEAN_VTT} anlatımını oku ve YENİDEN yaz:`);
    console.log(`     • chapters → GERÇEK konu geçişlerine göre (mekanik 150sn DEĞİL), içeriğe dayalı etiketler`);
    console.log(`     • chapters[].teaser → her bölüm için open-loop (merak sorusu, küçük harf, ≤48 char, cevabı VERME) — ekranda bölüm kartında çıkar; sonra: node scripts/apply-chapters.js --slug=${SLUG}`);
    console.log(`     • başlıklar → kancalı, anahtar-kelime önde (≤100 char)`);
    console.log(`     • açıklama → kanca = videonun gerçek cold-open cümlesi`);
    console.log(`     • thumbnail.hook → KİTABA ÖZGÜ + özgün (≤4 kelime, başlık DEĞİL, yanıltıcı DEĞİL,`);
    console.log(`       başka kitapta kullanılan jenerik ibare DEĞİL — YPP "inauthentic" riski)`);
    console.log(`   Güncelle: ${rel.youtubeMd(SLUG)} + ${META} (chapters/titles/description/tags/thumbnail.hook),`);
    console.log(`   sonra meta'da "refinedBy":"claude-hand-refined" işaretle.`);
    console.log(`   ⚠ thumbnail.hook değiştiyse PNG'yi YENİDEN render et (json'dan okur):`);
    console.log(`     npx remotion still Thumb-${SLUG} out/thumbnail-${SLUG}.png --frame=0`);
  } else if (meta.metaSource === "llm") {
    console.log(`\nℹ  Meta LLM ile üretildi; yine de chapters'ı VTT'ye karşı bir gözden geçir.`);
  }
} catch {}
console.log(`═══════════════════════════════════════════\n`);

// ── 10) OPTIONAL: render it, right now, unattended ──────────────────────────
// `--render` makes this the single end-to-end command: audio + VTT in, finished
// out/<slug>.mp4 out. No commit needed — the dispatcher pushes an isolated per-book
// bundle (scripts/lib/render-bundle.js), splits across the whole worker pool, heals
// any segment whose workflow never started, then assembles + verifies.
if (args.render) {
  const segs = args.segments || "pool";
  console.log(`🎬 RENDER BAŞLIYOR (havuza ${segs === "pool" ? "tam paralel" : segs + " segment"}) — commit gerekmez.\n`);
  try {
    execSync(`node scripts/render.js --slug=${SLUG} --method=github --segments=${segs}`, { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    console.error(`\n❌ Render başarısız. Segment durumunu görmek / kurtarmak için:`);
    console.error(`   node scripts/render-github-redispatch.js --slug=${SLUG}`);
    process.exit(1);
  }
}
