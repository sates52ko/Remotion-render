#!/usr/bin/env node
/**
 * P1.3 Audit Stills — renders 25 stratified still frames from a book
 * for blind semantic audit. Uses Remotion CLI `still` command.
 *
 * Usage: node scripts/audit-stills.js --slug=<slug> [--count=25]
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const slug = args.slug;
if (!slug) {
  console.error("Usage: node scripts/audit-stills.js --slug=<slug>");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "books", slug, "config.antidote.json"), "utf8"));
const scenes = config.scenes || [];
const count = parseInt(args.count || "25", 10);
const compositionId = config.meta?.compositionId || `Antidote-${slug}`;

const outDir = path.join(ROOT, "audit", `p1.3-stills-${slug}`);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Stratified sampling
const step = Math.floor(scenes.length / count);
const samples = [];
for (let i = 0; i < count; i++) {
  const idx = Math.min(i * step, scenes.length - 1);
  const sc = scenes[idx];
  const midFrame = sc.fromFrame + Math.floor((sc.durationFrames || 200) / 2);
  samples.push({
    idx,
    sceneId: sc.id,
    frame: midFrame,
    narration: (sc._narration || sc.narration || "").slice(0, 120),
    characters: (sc.characters || []).map(c => c.identity || c.role),
    motifs: (sc.props || []).map(p => p.type).filter(Boolean),
    location: sc.bg?.set || "unknown",
  });
}

console.log(`Rendering ${count} stills for ${slug} (${compositionId})...`);
console.log(`Output: ${path.relative(ROOT, outDir)}\n`);

// Write manifest
const manifest = { slug, compositionId, count, samples };
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

let rendered = 0;
for (const sample of samples) {
  const outFile = path.join(outDir, `frame-${String(sample.idx).padStart(3, "0")}-f${sample.frame}.png`);
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
    console.log(`  [SKIP] ${path.basename(outFile)} (already exists)`);
    rendered++;
    continue;
  }

  const cmd = `npx remotion still src/index.ts ${compositionId} ${outFile} --frame=${sample.frame} --props="${path.join(ROOT, "books", slug, "config.antidote.json").replace(/\\/g, "/")}"`;

  console.log(`  [${rendered + 1}/${count}] Frame ${sample.frame} (scene ${sample.idx}: ${sample.sceneId})`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "pipe", timeout: 300000 });
    rendered++;
    console.log(`    ✓ ${path.basename(outFile)}`);
  } catch (err) {
    console.log(`    ✗ FAILED: ${err.message?.slice(0, 100)}`);
  }
}

console.log(`\nDone: ${rendered}/${count} stills rendered → ${path.relative(ROOT, outDir)}`);
