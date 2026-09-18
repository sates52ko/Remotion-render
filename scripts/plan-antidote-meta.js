#!/usr/bin/env node
/**
 * plan-antidote-meta.js — YouTube metadata pack for ANTIDOTE books.
 *
 * The Vox pack (plan-meta.js) reads a vox-config (beats/props); the Antidote engine
 * has a different shape (scenes with `_narration`/`_act`, word-timed `captions`,
 * a code-rendered thumbnail whose hook lives in meta.thumbnail.hook). This is the
 * Antidote-native equivalent, so `make-book --engine=antidote` produces the same
 * upload deliverables Vox does:
 *   books/<slug>/youtube-meta.json — structured metadata
 *   books/<slug>/youtube.md        — copy-paste-ready pack (titles, description, tags, chapters)
 *
 * Claude-first: this emits the DETERMINISTIC scaffold + `needsClaudeRefine:true`
 * (chapters ~every 150s / at act boundaries with narration-snippet labels, generic
 * copy). Claude MUST hand-refine chapters/titles/description from the VTT before
 * upload — make-book surfaces that as a mandatory step, exactly like Vox.
 *
 * Usage:
 *   node scripts/plan-antidote-meta.js --slug=all-the-bright-places
 *   node scripts/plan-antidote-meta.js books/<slug>/config.antidote.json
 */
const fs = require("fs");
const { rel, ensureBookDir, readManifest } = require("./lib/paths");

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const positional = process.argv.slice(2).find((a) => !a.startsWith("--"));
const SLUG = args.slug || (positional ? positional.replace(/.*books[\/\\]([^\/\\]+).*/, "$1") : null);
if (!SLUG) { console.error("Kullanım: node scripts/plan-antidote-meta.js --slug=<slug>"); process.exit(1); }
const cfgPath = positional || rel.antidoteConfig(SLUG);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const scenes = cfg.scenes || [];
const captions = cfg.captions || [];
const fps = cfg.meta.fps || 30;
const title = cfg.meta.title;
const manifest = readManifest(SLUG) || {};
const author = cfg.meta.author || manifest.author || "";
const genre = (manifest.genre || "drama").toLowerCase();

const fmtTime = (frame) => {
  const s = Math.round(frame / fps);
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  const mm = h > 0 ? m % 60 : m;
  return (h > 0 ? h + ":" + String(mm).padStart(2, "0") : mm) + ":" + String(s % 60).padStart(2, "0");
};
const titleCase = (s) => String(s).toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
const FILLER = new Set(
  "the a an and but so or on to of in for that this these those it its is are was were be been am you your we our i he she they them his her their well now right like um uh okay ok actually exactly basically really just if then as at by with about into over than yeah yes no not do does did have has had will would can could".split(" "),
);
const shortTitle = String(title).split(/[:—-]/)[0].trim();
const mins = Math.round(cfg.meta.durationInFrames / fps / 60);

// Narration at a frame — from the word-timed captions (fall back to a scene's
// `_narration` hint if captions are sparse).
function narrationAt(frame, maxChars = 90) {
  const caps = captions.filter((c) => c.endFrame >= frame).sort((a, b) => a.startFrame - b.startFrame);
  let out = "";
  for (const c of caps) { out += (out ? " " : "") + c.text; if (out.length >= maxChars) break; }
  if (!out) {
    const sc = scenes.find((s) => s.fromFrame >= frame) || scenes[scenes.length - 1];
    out = sc ? String(sc._narration || "") : "";
  }
  return out.replace(/\s+/g, " ").trim();
}
const openingNarration = (n = 240) => narrationAt(0, n).replace(/[,;:]\s*$/, "").trim();

function chapterLabel(scene, used) {
  let words = narrationAt(scene.fromFrame, 90).replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
  while (words.length > 5 && FILLER.has(words[0].toLowerCase())) words.shift();
  let label = titleCase(words.slice(0, 5).join(" ")).trim();
  if (!label || used.has(label.toLowerCase())) return null;
  used.add(label.toLowerCase());
  return label;
}

// Chapters at 00:00, at each narrative ACT boundary, and otherwise ~every 150s.
function buildChapters() {
  const chapters = [{ t: 0, label: `The Setup: How "${shortTitle}" Works` }];
  const used = new Set();
  let lastT = 0, lastAct = scenes[0] ? scenes[0]._act : "";
  for (const s of scenes) {
    const t = s.fromFrame / fps;
    if (t < 20) { lastAct = s._act || lastAct; continue; }
    const actChanged = s._act && s._act !== lastAct;
    if (t - lastT < 150 && !actChanged) continue;
    const label = chapterLabel(s, used);
    lastAct = s._act || lastAct;
    if (!label) continue;
    chapters.push({ t: Math.round(t), label });
    lastT = t;
  }
  return chapters;
}

// Book-anchored fallback thumbnail hook: prefer the one Claude already authored in
// the config (meta.thumbnail.hook); else the most-emphasized on-screen words.
function deriveHook() {
  if (cfg.meta.thumbnail && cfg.meta.thumbnail.hook) return String(cfg.meta.thumbnail.hook).toUpperCase();
  const freq = {};
  for (const s of scenes) for (const tx of s.texts || []) {
    for (const w of String(tx.text || "").toLowerCase().split(/\s+/)) {
      const k = w.replace(/[^a-z']/g, "");
      if (k.length < 4 || FILLER.has(k)) continue;
      freq[k] = (freq[k] || 0) + 1;
    }
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w.toUpperCase());
  return top.length ? top.join(" ") : shortTitle.toUpperCase().split(/\s+/).slice(0, 3).join(" ");
}

function fallbackMeta() {
  const g = titleCase(genre);
  const open = openingNarration(240);
  const firstSentence = (open.split(/(?<=[.!?])\s/)[0] || open).slice(0, 150);
  const t = shortTitle;
  const hook = deriveHook();
  return {
    // SEO/CTR titles: exact book title front-loaded + a search modifier, spread
    // across query intents (Summary / Explained / Analysis / meaning), plus one
    // curiosity hook. The AUTHOR name is woven into most options — people search
    // "<book> <author>" and it's a strong SEO signal. (See the SEO title strategy.)
    titles: [
      `${t}, Explained: The Ending Everyone Gets Wrong`,
      `${t} Summary${author ? " (" + author + ")" : ""} — Key Ideas & Themes`,
      author ? `${t} by ${author}: Full Analysis` : `${t}: Full Analysis`,
      author ? `What ${t} Is Really About — ${author} Explained` : `What ${t} Is Really About — Full Breakdown`,
      hook ? `${t}: ${titleCase(hook)}` : `${t} — Every Key Idea in ${mins} Minutes`,
    ].map((x) => x.slice(0, 100)),
    primaryKeyword: `${t}${author ? " " + author : ""} summary`,
    hook: open
      ? `${firstSentence}\n\nThat's the heart of ${t}${author ? " by " + author : ""} — and it's not the story you remember.`
      : `A full, spoiler-full breakdown of ${title}${author ? " by " + author : ""}.`,
    summary: `A deep analysis of "${title}"${author ? " by " + author : ""} — the characters, the turning points, the themes, and the one argument the book quietly proves. We cover what happens, what it means, and the reading most people miss, and we take on the book's hardest criticism head-on.\n\nBest for readers studying ${t} for class or a book club, and anyone who wants the real takeaway — spoilers included.`,
    hashtags: [`#${t.replace(/[^a-z0-9]/gi, "")}`, "#BookSummary", `#${titleCase(genre.replace(/[^a-z]/gi, "")) || "Books"}`, "#Books", "#BookTube"],
    tags: [
      `${t} summary`, `${t} explained`, `${t} analysis`, `${t} ending explained`,
      `${t} book`, `${t} themes`, `${t} characters`,
      // author-forward (people search "<book> <author>" and "<author> books")
      author, `${t} ${author}`.trim(), author ? `${author} ${t}` : "", author ? `${author} books` : "",
      "book summary", "book analysis", "book review", "booktube",
      `${genre} books`, `best ${genre} books`, "book club", title,
    ].filter(Boolean),
    thumbnailHook: hook,
    thumbnailSubject: `dramatic cinematic scene representing "${shortTitle}", intense emotional character framed on right side with dark atmospheric lighting`,
    thumbnailLayout: "cinematic-bleed",
  };
}

(function main() {
  const chapters = buildChapters();
  const m = fallbackMeta();
  const needsClaudeRefine = true; // deterministic scaffold — Claude refines from the VTT

  const chapterBlock = chapters.map((c) => `${fmtTime(c.t * fps)} ${c.label}`).join("\n");
  const hashtags = (m.hashtags || []).join(" ");
  const description = [
    m.hook, "", m.summary, "",
    "⏱️ Chapters:", chapterBlock, "",
    "🔔 Subscribe for more book breakdowns.", "",
    hashtags,
  ].join("\n");

  const meta = {
    slug: SLUG, title, author, genre, engine: "antidote",
    primaryKeyword: m.primaryKeyword,
    titles: m.titles,
    description,
    tags: m.tags,
    hashtags: m.hashtags,
    chapters,
    thumbnail: {
      hook: m.thumbnailHook,
      subject: m.thumbnailSubject,
      layout: m.thumbnailLayout || "cinematic-bleed",
      image: `scenes/${SLUG}/thumbnail-hero.png`,
    },
    metaSource: "fallback",
    needsClaudeRefine,
    generatedAt: null,
  };
  ensureBookDir(SLUG);
  fs.writeFileSync(rel.youtubeMeta(SLUG), JSON.stringify(meta, null, 2));

  const md = `# YouTube pack — ${title}${author ? " (" + author + ")" : ""}

> Engine: antidote · ${mins} min · Title limit **100 chars** (front-load the hook in the first ~45). Description first ~157 chars show above the fold. Tags cap 500 chars. First 3 hashtags render above the title.
> ⚠ SCAFFOLD (deterministic) — Claude MUST hand-refine chapters/titles/description/hook from the VTT before upload.

## TITLE — paste one (recommended first)

\`\`\`
${(m.titles || [])[0] || title}
\`\`\`
Alternatives (A/B):
${(m.titles || []).slice(1).map((t) => `- ${t}`).join("\n")}

**Primary keyword:** ${m.primaryKeyword}

## DESCRIPTION — paste this whole block into the Description field

\`\`\`
${description}
\`\`\`

## Tags (≤500 chars — paste comma-separated)

\`\`\`
${(m.tags || []).join(", ")}
\`\`\`

## Thumbnail
- File: \`out/thumbnail-${SLUG}.png\` (1280×720, code-rendered \`Thumb-${SLUG}\`)
- Overlay hook (already in the render): **${m.thumbnailHook}**

## Upload checklist
- [ ] Upload \`out/${SLUG}.mp4\`
- [ ] Title: paste option 1 (or A/B option 2)
- [ ] Description: paste block (chapters auto-become clickable)
- [ ] Tags: paste block
- [ ] Thumbnail: \`out/thumbnail-${SLUG}.png\`
- [ ] Captions: upload \`public/captions/${SLUG}.clean.vtt\` as English CC → **"With timing"** (NOT the raw ${SLUG}.vtt)
- [ ] Category: Education · add to a "Book Breakdowns" playlist
`;
  fs.writeFileSync(rel.youtubeMd(SLUG), md);

  console.log(`✓ ${rel.youtubeMeta(SLUG)} + ${rel.youtubeMd(SLUG)}`);
  console.log(`  titles: ${m.titles.length}  tags: ${m.tags.length}  chapters: ${chapters.length}  source: fallback`);
  console.log(`  thumbnail hook: "${m.thumbnailHook}"`);
  console.log(`  ⚠ FALLBACK COPY — Claude must hand-refine (real chapters from the VTT, hook, titles). See make-book summary.`);
})();
