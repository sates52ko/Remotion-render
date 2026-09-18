#!/usr/bin/env node
/**
 * plan-meta.js — YouTube metadata + thumbnail brief generator (CTR + SEO optimized).
 *
 * Reads a books/<slug>/config.vox.json and produces:
 *   books/<slug>/youtube-meta.json — structured metadata
 *   books/<slug>/youtube.md        — copy-paste-ready (title options, description, tags, chapters)
 * plus a thumbnail brief the thumbnail step consumes.
 *
 * Uses NVIDIA llama-3.3-70b (same NVIDIA_API_KEY) for the creative copy; chapters
 * are derived deterministically from the beat timeline.
 *
 * Usage: node scripts/plan-meta.js books/single-dad-dilemma/config.vox.json
 */
const fs = require("fs");
const { rel, ensureBookDir } = require("./lib/paths");
const { MODEL, ENDPOINT, USE_NVIDIA, stripThink } = require("./lib/llm");

const cfgPath = process.argv[2] || rel.voxConfig("single-dad-dilemma");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const { title, author, genre, slug, fps } = cfg.meta;
// Claude-first: default produces the deterministic scaffold + needsClaudeRefine,
// so Claude hand-writes the pack from the VTT. NVIDIA/llama runs only with USE_NVIDIA=1.
const USE_LLM = USE_NVIDIA;

const fmtTime = (frame) => {
  const s = Math.round(frame / fps);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const h = Math.floor(m / 60);
  const mm = h > 0 ? m % 60 : m;
  return (h > 0 ? h + ":" + String(mm).padStart(2, "0") : mm) + ":" + String(sec).padStart(2, "0");
};

// Title-case that only capitalizes the first letter of each space-separated word
// (so "they're" → "They're", NOT "They'Re").
const titleCase = (s) => String(s).toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
// Leading discourse/filler markers to skip when cutting a chapter label from raw narration.
const FILLER = new Set(
  "the a an and but so or on to of in for that this these those it its is are was were be been am you your we our i he she they them his her their well now right like um uh okay ok actually exactly basically really just if then as at by with about into over than yeah yes no not do does did have has had will would can could".split(" "),
);
const shortTitle = String(title).split(/[:—-]/)[0].trim();
const mins = Math.round(cfg.meta.totalFrames / fps / 60);

// Narration snippet starting at a given frame (used for the description hook and
// as a fallback chapter label). Joins caption text until ~maxChars, trims to a
// clean phrase (whole words, no trailing partial/filler).
function narrationAt(frame, maxChars = 60) {
  const caps = cfg.captions.filter((c) => c.endFrame >= frame).sort((a, b) => a.startFrame - b.startFrame);
  let out = "";
  for (const c of caps) {
    out += (out ? " " : "") + c.text;
    if (out.length >= maxChars) break;
  }
  return out.replace(/\s+/g, " ").trim();
}
function openingNarration(maxChars = 240) {
  return narrationAt(0, maxChars).replace(/[,;:]\s*$/, "").trim();
}
// A concise, human chapter label. Deterministic (no LLM) → aim for coherent &
// topical: take a narration phrase at the chapter point, drop leading filler/
// discourse markers, keep ~5 content words. Fall back to emphasis words. Dedupe.
// (For truly punchy titles, the LLM path overlays chapterTitles when a key exists.)
function chapterLabel(b, used) {
  let words = narrationAt(b.fromFrame, 90).replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
  while (words.length > 5 && FILLER.has(words[0].toLowerCase())) words.shift();
  let label = titleCase(words.slice(0, 5).join(" ")).trim();
  if (!label || used.has(label.toLowerCase())) {
    const emph = (b.props.emphasis || []).filter((w) => /^[\p{L}]{3,}$/u.test(w)).slice(0, 2).map(titleCase).join(" ").trim();
    if (emph && !used.has(emph.toLowerCase())) label = emph;
  }
  used.add(label.toLowerCase());
  return label || shortTitle;
}

// ── chapters: pick section beats ~every 150s, meaningful labels ──
function buildChapters() {
  const chapters = [{ t: 0, label: `The Setup: How "${shortTitle}" Works` }];
  const used = new Set();
  let lastT = 0;
  for (const b of cfg.beats) {
    const t = b.fromFrame / fps;
    if (t - lastT < 150) continue;
    const label = chapterLabel(b, used);
    if (!label) continue;
    chapters.push({ t: Math.round(t), label });
    lastT = t;
  }
  return chapters;
}

// A book-anchored fallback thumbnail hook. NEVER a fixed constant reused across
// books (a generic "THE TWIST" on every video reads as inauthentic/duplicate to
// YouTube). Derive 1-2 of the book's most-emphasized content words; Claude replaces
// this with a sharper book-specific hook during the mandatory refine.
function deriveHook() {
  const freq = {};
  for (const b of cfg.beats) for (const w of b.props.emphasis || []) {
    const k = String(w).toLowerCase().replace(/[^a-z']/g, "");
    if (k.length < 4 || FILLER.has(k)) continue;
    freq[k] = (freq[k] || 0) + 1;
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w.toUpperCase());
  return top.length ? top.join(" ") : shortTitle.toUpperCase().split(/\s+/).slice(0, 3).join(" ");
}

// condensed synopsis for the LLM (concept spine + sampled narration)
function synopsis() {
  const spine = cfg.beats.map((b) => b.props.kicker || (b.props.emphasis || []).join(" ")).filter(Boolean).slice(0, 60).join(" · ");
  const head = cfg.beats.slice(0, 6).map((b) => b.props.text).join(" ");
  return `KEY BEATS: ${spine}\n\nOPENING: ${head}`.slice(0, 4000);
}

async function llmMeta(chapters) {
  const chapExcerpts = chapters
    .map((c, i) => `${i}. [${fmtTime(c.t * fps)}] ${narrationAt(c.t * fps, 90).slice(0, 90)}`)
    .join("\n");
  const sys = `You are a YouTube growth strategist for a faceless book-summary channel. Maximize CTR and search ranking for a video about the ${genre} book "${title}"${author ? " by " + author : ""}.
Return STRICT JSON with keys:
- "titles": 5 title options, each <= 70 chars (hard YouTube max is 100 — stay punchy). Front-load a curiosity gap, number, or emotional hook in the FIRST ~45 chars; keep the book title present for search; vary style (question, bold claim, number/bracket). Truthful, not misleading.
- "primaryKeyword": the main search phrase people would type (e.g. "<book> summary").
- "hook": 2 punchy opening lines for the description (contains the primary keyword naturally, no spoilers).
- "summary": 2 short paragraphs of keyword-rich, genuinely informative description body (no fluff, no ending spoilers).
- "hashtags": 5 relevant hashtags (with #).
- "tags": 18 SEO tags — mix broad ("book summary","${genre} books"), specific (title, author, key themes), and long-tail search phrases. No # prefix.
- "thumbnailHook": 2-3 word ALL-CAPS punchy curiosity text for the YouTube thumbnail. Rules: (1) NEVER the title or author name, (2) must create an INTENSE curiosity gap, dramatic stake, or shocking truth ("THEY LIED", "SHE KNEW", "DON'T TRUST HIM", "TOTAL ILLUSION", "THE FATAL LIE", "NEVER CRIED"), (3) maximum 3 words so it is readable in 0.5s on mobile feeds, (4) must provoke an immediate click when paired with the title.
- "thumbnailSubject": a concrete, dramatic cinematic image subject for a 16:9 widescreen shot. The subject (protagonist with intense micro-expression or iconic symbolic object) MUST be described as positioned on the right side of the canvas with intense rim-lighting/side-lighting, leaving dark atmospheric negative space on the left side for typography.
- "thumbnailLayout": "cinematic-bleed" (default 16:9 full-bleed high-CTR).
- "chapterTitles": an array with EXACTLY ${chapters.length} entries, one curiosity-driven chapter title (<= 45 chars) for each numbered excerpt below, IN ORDER. Base each strictly on that excerpt's actual content; never invent facts. Entry 0 is the intro.
- "chapterTeasers": an array with EXACTLY ${chapters.length} entries, an OPEN-LOOP teaser (a curiosity question or provocative half-statement, lowercase, <= 48 chars) for each chapter IN ORDER. It appears ON the chapter card in the video to pull the viewer INTO that chapter, so it must preview the payoff WITHOUT resolving it, and stay strictly grounded in that excerpt content. Entry 0 (the cold open) is never shown, use "".`;
  const user = `Book: "${title}"${author ? " by " + author : ""} (${genre}).\n\n${synopsis()}\n\nCHAPTER EXCERPTS (write chapterTitles for these, in order):\n${chapExcerpts}\n\nReturn ONLY the JSON object.`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature: 0.7, max_tokens: 3000 }),
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status + " " + (await resp.text()).slice(0, 120));
      const j = await resp.json();
      const txt = stripThink(j.choices?.[0]?.message?.content);
      const start = txt.indexOf("{");
      const end = txt.lastIndexOf("}") + 1;
      if (start < 0 || end <= start) throw new Error("no JSON object in response (len " + txt.length + ")");
      return JSON.parse(txt.slice(start, end));
    } catch (e) {
      lastErr = e;
      console.warn(`  meta attempt ${attempt} failed: ${e.message}`);
    }
  }
  throw lastErr;
}

// Strong, deterministic fallback (no LLM). Uses the actual cold-open narration as
// the description hook — our NotebookLM prompt is engineered to open mid-thought on
// the most provocative idea, so the opening lines already ARE a scroll-stopper.
function fallbackMeta() {
  const g = titleCase(genre);
  const gWord = genre.replace(/s$/, "");
  const open = openingNarration(240);
  const firstSentence = (open.split(/(?<=[.!?])\s/)[0] || open).slice(0, 150);
  return {
    titles: [
      `${shortTitle}: Why Smart People Get It So Wrong`,
      author ? `The Big Idea Behind ${shortTitle} by ${author}, Explained` : `The Big Idea Behind ${shortTitle}, Explained`,
      `${shortTitle} — Every Key Idea in ${mins} Minutes`,
      `${shortTitle}${author ? " by " + author : ""}: Full Summary & Analysis`,
      `What ${author || "the author"} Really Wants You to Know — ${shortTitle}`,
    ].map((t) => t.slice(0, 100)),
    primaryKeyword: `${shortTitle}${author ? " " + author : ""} summary`,
    hook: open ? `${firstSentence}\n\nThat's the core of ${shortTitle}${author ? " by " + author : ""} — and it's not what you'd expect.` : `A full breakdown of ${title}${author ? " by " + author : ""}.`,
    summary: `In this deep dive into "${title}"${author ? " by " + author : ""}, we break down every key idea in plain language — the arguments, the turning points, and what they mean for the way you think and decide.\n\nBy the end you'll walk away with the book's biggest takeaways and one reframing you can actually use. No fluff, no ending spoilers.`,
    hashtags: [`#${shortTitle.replace(/[^a-z0-9]/gi, "")}`, "#BookSummary", `#${titleCase(gWord)}`, "#Books", "#SelfImprovement"],
    tags: [
      `${shortTitle} summary`, `${shortTitle} ${author || ""}`.trim(), author, `${shortTitle} explained`,
      `${shortTitle} analysis`, `${shortTitle} book review`, "book summary", `${genre} books`,
      `${genre} audiobook`, "book breakdown", "books explained", "self improvement",
      "personal development", `best ${genre} books`, "book club", "nonfiction summary",
      title, `${shortTitle} key ideas`,
    ].filter(Boolean),
    thumbnailHook: deriveHook(),
    thumbnailSubject: `dramatic cinematic scene representing "${shortTitle}", intense emotional character framed on right side with dark atmospheric lighting`,
    thumbnailLayout: "cinematic-bleed",
  };
}

(async () => {
  const chapters = buildChapters();
  let m, metaSource = USE_LLM ? "llm" : "fallback";
  try { m = USE_LLM ? await llmMeta(chapters) : fallbackMeta(); }
  catch (e) { console.warn("LLM meta failed (" + e.message + "); using fallback."); m = fallbackMeta(); metaSource = "fallback"; }
  // The deterministic fallback can only guess chapters (~every 150s, narration snippet
  // labels) and generic copy — it CANNOT find real topic boundaries or write a curiosity
  // hook. Per the project standing rule, Claude MUST hand-refine the pack from the actual
  // VTT afterwards. Flag it loudly so the orchestrator/Claude never ships fallback copy.
  const needsClaudeRefine = metaSource === "fallback";

  // Overlay LLM chapter titles onto the deterministic timestamps (if returned & sized right).
  if (Array.isArray(m.chapterTitles) && m.chapterTitles.length === chapters.length) {
    chapters.forEach((c, i) => { if (m.chapterTitles[i]) c.label = String(m.chapterTitles[i]).trim(); });
  }

  const chapterBlock = chapters.map((c) => `${fmtTime(c.t * fps)} ${c.label}`).join("\n");
  const hashtags = (m.hashtags || []).join(" ");
  const clean = (s) => String(s || "").replace(/\s*\.\s*,\s*/g, ".\n\n").replace(/\s{2,}/g, " ").trim();
  const description = [
    clean(m.hook),
    "",
    clean(m.summary),
    "",
    "⏱️ Chapters:",
    chapterBlock,
    "",
    "🔔 Subscribe for more book breakdowns.",
    "",
    hashtags,
  ].join("\n");

  const meta = {
    slug, title, author, genre,
    primaryKeyword: m.primaryKeyword,
    titles: m.titles,
    description,
    tags: m.tags,
    hashtags: m.hashtags,
    chapters,
    thumbnail: { hook: m.thumbnailHook, subject: m.thumbnailSubject, layout: m.thumbnailLayout || undefined, image: `scenes/${slug}/thumbnail-hero.png`, cut: `scenes/${slug}/thumbnail-hero-cut.png` },
    metaSource,
    needsClaudeRefine,
    generatedAt: new Date().toISOString(),
  };
  ensureBookDir(slug);
  fs.writeFileSync(rel.youtubeMeta(slug), JSON.stringify(meta, null, 2));

  // Chapter marks also belong IN the video (chapter card + progress ticks), and
  // config.vox.json is the only file the Remotion composition reads. Write them
  // back with the best labels available at this point (LLM/Claude-refined when
  // that path ran). Re-read from disk first — meta.audio may have been re-pointed
  // by master-audio since this process started.
  try {
    const live = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    live.chapters = chapters.map((c, i) => ({
      index: i,
      fromFrame: Math.round(c.t * fps),
      label: c.label,
      teaser: c.teaser || "",
    }));
    fs.writeFileSync(cfgPath, JSON.stringify(live, null, 2));
    console.log(`  ✓ ${cfgPath} → ${live.chapters.length} bölüm (kart + ilerleme çubuğu)`);
  } catch (e) {
    console.warn(`  ⚠ bölümler config.vox.json'a yazılamadı: ${e.message}`);
  }

  const md = `# YouTube pack — ${title}${author ? " (" + author + ")" : ""}

> Title limit = **100 chars** (front-load the hook in the first ~45). Description first ~157 chars show above the fold. Tags cap = 500 chars. First 3 hashtags render above the title.

## Title options (pick 1, A/B test top two)
${(m.titles || []).map((t, i) => `${i + 1}. ${t}  _(${t.length} chars)_`).join("\n")}

**Primary keyword:** ${m.primaryKeyword}

## Description

\`\`\`
${description}
\`\`\`

## Tags (≤500 chars — paste comma-separated)

\`\`\`
${(m.tags || []).join(", ")}
\`\`\`

## Thumbnail
- File: \`out/thumbnail-${slug}.png\` (1280×720)
- Overlay hook (3–4 words, huge/bold/high-contrast, don't repeat the title): **${m.thumbnailHook}**
- Subject: ${m.thumbnailSubject}

## Upload checklist
- [ ] Upload \`out/${slug}.mp4\`
- [ ] Title: paste option 1 (or A/B option 2)
- [ ] Description: paste block (chapters auto-become clickable)
- [ ] Tags: paste block
- [ ] Thumbnail: \`out/thumbnail-${slug}.png\` + overlay text
- [ ] Captions: upload \`public/captions/${slug}.clean.vtt\` as English CC → choose **"With timing"** (NOT the raw ${slug}.vtt — YouTube rejects its inline word-timing markup)
- [ ] Category: Education · add to a "Book Breakdowns" playlist
- [ ] Pin a comment with the single sharpest line from the video
`;
  // Everything for a book — machine JSONs (config.vox.json, youtube-meta.json) and
  // the human-facing upload pack (youtube.md) — lives in the self-contained hub
  // folder books/<slug>/. The registry imports the JSONs from there.
  const mdPath = rel.youtubeMd(slug);
  fs.writeFileSync(mdPath, md);

  console.log(`✓ ${rel.youtubeMeta(slug)} + ${mdPath}`);
  console.log(`  titles: ${(m.titles || []).length}  tags: ${(m.tags || []).length}  chapters: ${chapters.length}  source: ${metaSource}`);
  console.log(`  thumbnail hook: "${m.thumbnailHook}"  subject: ${m.thumbnailSubject?.slice(0, 60)}`);
  if (needsClaudeRefine) {
    console.log(`  ⚠ FALLBACK COPY — needs Claude refinement (real chapters from the VTT, hook, titles). See make-book summary.`);
  }
})();
