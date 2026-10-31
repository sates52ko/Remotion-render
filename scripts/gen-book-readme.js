#!/usr/bin/env node
/**
 * gen-book-readme.js — writes the per-book hub index books/<slug>/README.md.
 *
 * The hub folder books/<slug>/ is the ONE place that holds everything about a
 * book: the machine JSONs (config.vox.json, youtube-meta.json), the NotebookLM
 * prompt, and the human-facing upload pack (youtube.md). Rendered assets stay
 * under public/ and out/. The index links to each with a folder-relative path.
 *
 * Usage: node scripts/gen-book-readme.js <slug>
 * (title/author pulled from youtube-meta.json when present.)
 */
const fs = require("fs");
const path = require("path");
const { ROOT, abs, rel } = require("./lib/paths");

const slug = process.argv[2];
if (!slug) { console.error("Usage: node scripts/gen-book-readme.js <slug>"); process.exit(1); }

const exists = (repoRel) => fs.existsSync(path.join(ROOT, repoRel));
let title = slug, author = "", genre = "", refinedBy = "";
try {
  const m = JSON.parse(fs.readFileSync(abs.youtubeMeta(slug), "utf8"));
  title = m.title || slug; author = m.author || ""; genre = m.genre || ""; refinedBy = m.refinedBy || "";
} catch {}

// [label, repo-relative path, note] — link is resolved relative to books/<slug>/.
const rows = [
  ["🎬 Final video", rel.outMp4(slug), "render çıktısı"],
  ["🖼️ Thumbnail", rel.outThumb(slug), "YouTube kapak"],
  ["📝 YouTube pack", rel.youtubeMd(slug), "başlık/açıklama/tag/bölümler"],
  ["💬 Captions (CC)", rel.cleanVtt(slug), 'YouTube\'a "With timing" yükle'],
  ["💬 Captions (ham)", rel.vtt(slug), "kelime-zamanlı (karaoke kaynağı)"],
  ["🎙️ Audio", rel.audio(slug), "NotebookLM sesi"],
  ["🖼️ Scene images", rel.scenesDir(slug) + "/", "Flux görselleri"],
  ["✍️ NotebookLM prompt", rel.prompt(slug), "orijinal analiz açısı"],
  ["📖 Manifest", rel.manifest(slug), "book.json (slug/başlık/engine)"],
  ["⚙️ Vox config", rel.voxConfig(slug), "render config (beats/captions)"],
  ["⚙️ YouTube meta", rel.youtubeMeta(slug), "SEO/meta + thumbnail brief"],
  ["🎞️ Render chunks", rel.outChunks(slug) + "/", "ara mp4 parçaları + parts.txt"],
];

// README lives in books/<slug>/ → link is the path relative to that folder.
const bookDir = rel.bookDir(slug);
const link = (repoRel) => path.relative(bookDir, repoRel).split(path.sep).join("/");
const line = ([label, p, note]) =>
  `| ${label} | ${exists(p) ? `[\`${p}\`](${link(p)})` : `\`${p}\` _(yok)_`} | ${note} |`;

const md = `# ${title}${author ? ` — ${author}` : ""}${genre ? `  ·  _${genre}_` : ""}

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları \`public/\` ve \`out/\` altında, aşağıda linkli.
${refinedBy ? `> Meta durumu: **${refinedBy}** ✓\n` : ""}
## Dosyalar

| | Konum | Not |
|---|---|---|
${rows.map(line).join("\n")}

## Yükleme sırası
1. \`${rel.outMp4(slug)}\` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → \`${rel.outThumb(slug)}\`
4. CC → \`${slug}.clean.vtt\` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
\`\`\`bash
node scripts/make-book.js --slug=${slug} --title="${title}"${author ? ` --author="${author}"` : ""}${genre ? ` --genre=${genre}` : ""}
\`\`\`
`;

fs.mkdirSync(path.join(ROOT, bookDir), { recursive: true });
fs.writeFileSync(path.join(ROOT, rel.readme(slug)), md);
console.log(`✓ ${rel.readme(slug)} (${rows.filter((r) => exists(r[1])).length}/${rows.length} dosya mevcut)`);
