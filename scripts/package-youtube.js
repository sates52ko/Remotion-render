#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const slug = args.slug;
if (!slug) {
  console.error('Usage: node scripts/package-youtube.js --slug=<slug>');
  process.exit(1);
}

const outDir = path.join(ROOT, 'out', slug);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log(`\n📦 PACKAGING YOUTUBE BUNDLE: ${slug} -> out/${slug}/\n`);

// 1. Video
const srcMp4 = path.join(ROOT, 'out', `${slug}.mp4`);
const dstMp4 = path.join(outDir, `${slug}.mp4`);
const dstVideoMp4 = path.join(outDir, 'video.mp4');

if (fs.existsSync(srcMp4)) {
  try {
    if (!fs.existsSync(dstMp4)) fs.linkSync(srcMp4, dstMp4);
  } catch {
    fs.copyFileSync(srcMp4, dstMp4);
  }
  try {
    if (!fs.existsSync(dstVideoMp4)) fs.linkSync(srcMp4, dstVideoMp4);
  } catch {
    fs.copyFileSync(srcMp4, dstVideoMp4);
  }
  console.log(`  ✅ Video: ${path.relative(ROOT, dstMp4)}`);
} else {
  console.warn(`  ⚠️ MP4 not found at ${srcMp4}`);
}

// 2. Thumbnail
const srcThumb = path.join(ROOT, 'out', `thumbnail-${slug}.png`);
const dstThumbPng = path.join(outDir, 'thumbnail.png');
const dstThumbNamedPng = path.join(outDir, `thumbnail-${slug}.png`);
const dstThumbJpg = path.join(outDir, 'thumbnail.jpg');

if (fs.existsSync(srcThumb)) {
  fs.copyFileSync(srcThumb, dstThumbPng);
  fs.copyFileSync(srcThumb, dstThumbNamedPng);
  spawnSync('ffmpeg', ['-y', '-i', srcThumb, '-q:v', '2', dstThumbJpg], { stdio: 'ignore' });
  console.log(`  ✅ Thumbnail: thumbnail.png & thumbnail.jpg`);
} else {
  console.warn(`  ⚠️ Thumbnail not found at ${srcThumb}`);
}

// 3. Captions — the clean VTT is the ONE caption file (uploaded to YouTube "with timing"). No SRT, no second
// copy, and never the raw word-timed VTT under the clean name: make-book writes public/captions/<slug>.clean.vtt.
const srcVtt = path.join(ROOT, 'public', 'captions', `${slug}.clean.vtt`);

if (fs.existsSync(srcVtt)) {
  fs.copyFileSync(srcVtt, path.join(outDir, `${slug}.clean.vtt`));
  console.log(`  ✅ Captions: ${slug}.clean.vtt (the only caption file — upload this one)`);
} else {
  console.warn(`  ⚠️ public/captions/${slug}.clean.vtt not found — no caption file packaged (the raw word-timed VTT is not an upload file; make-book writes the clean one)`);
}

// 4. Metadata docs
const metaPath = path.join(ROOT, 'books', slug, 'youtube-meta.json');
const guidePath = path.join(ROOT, 'books', slug, 'youtube.md');

if (fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  fs.copyFileSync(metaPath, path.join(outDir, 'youtube-meta.json'));

  const primaryTitle = (meta.titles && meta.titles[0]) || meta.title || slug;
  fs.writeFileSync(path.join(outDir, 'title.txt'), primaryTitle.trim() + '\n', 'utf8');
  fs.writeFileSync(path.join(outDir, 'description.txt'), (meta.description || '').trim() + '\n', 'utf8');
  fs.writeFileSync(path.join(outDir, 'tags.txt'), (meta.tags || []).join(', ') + '\n', 'utf8');

  if (meta.chapters && meta.chapters.length) {
    const chText = meta.chapters.map((c) => {
      const m = Math.floor(c.t / 60);
      const s = String(c.t % 60).padStart(2, '0');
      return `${m}:${s} ${c.label}`;
    }).join('\n');
    fs.writeFileSync(path.join(outDir, 'chapters.txt'), chText + '\n', 'utf8');
  }
  console.log(`  ✅ YouTube Metadata: title.txt, description.txt, tags.txt, chapters.txt, youtube-meta.json`);
}

if (fs.existsSync(guidePath)) {
  fs.copyFileSync(guidePath, path.join(outDir, 'youtube.md'));
  console.log(`  ✅ Guide: youtube.md`);
}

console.log(`\n🎉 BUNDLE READY IN: ${path.relative(ROOT, outDir)}/\n`);
fs.readdirSync(outDir).forEach((f) => {
  const stat = fs.statSync(path.join(outDir, f));
  const sz = stat.size > 1e6 ? `${(stat.size / 1e6).toFixed(1)} MB` : `${(stat.size / 1e3).toFixed(1)} KB`;
  console.log(`   📄 ${f.padEnd(35)} ${sz}`);
});
