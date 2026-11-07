#!/usr/bin/env node
/**
 * preview-thumbnail.js — render a thumbnail at BOTH 1280×720 AND 168×94 (browse size)
 * side by side, so CTR readability is instantly visible.
 *
 * Usage:
 *   node scripts/preview-thumbnail.js --slug=educated
 *   node scripts/preview-thumbnail.js --slug=educated --layout=split-face
 *   node scripts/preview-thumbnail.js --slug=educated --all-layouts
 *
 * --all-layouts renders all 6 variants into a contact sheet (out/thumbnail-preview-<slug>.html).
 *
 * Requires the Remotion CLI: npx remotion still ...
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const slug = (args.find((a) => a.startsWith("--slug=")) || "").split("=")[1];
const layoutOverride = (args.find((a) => a.startsWith("--layout=")) || "").split("=")[1];
const allLayouts = args.includes("--all-layouts");

if (!slug) {
  console.log("Usage: node scripts/preview-thumbnail.js --slug=<slug> [--layout=<layout>] [--all-layouts]");
  process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "out");
fs.mkdirSync(OUT, { recursive: true });

const LAYOUTS = [
  "cinematic-bleed",
  "portrait-right",
  "split-face",
  "full-bleed",
  "object-hero",
  "two-subject-vs",
  "text-poster",
];

function renderThumb(slug, layout) {
  const outFile = path.join(OUT, `thumbnail-${slug}${layout ? `-${layout}` : ""}.png`);
  // Override props with layout
  const propsOverride = layout ? `--props='${JSON.stringify({ layout })}'` : "";
  const cmd = `npx remotion still Thumb-${slug} "${outFile}" --width=1280 --height=720 ${propsOverride}`;
  console.log(`  → ${cmd}`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit", timeout: 60_000 });
    return outFile;
  } catch (e) {
    console.warn(`  ⚠ render failed for ${layout || "default"}: ${e.message}`);
    return null;
  }
}

function buildContactSheet(slug, files) {
  const htmlPath = path.join(OUT, `thumbnail-preview-${slug}.html`);
  const cards = files
    .filter((f) => f.path)
    .map(
      (f) => `
    <div style="margin:12px;text-align:center">
      <div style="font-weight:bold;margin-bottom:6px;font-size:14px;font-family:monospace">${f.layout}</div>
      <div style="display:flex;gap:16px;align-items:end">
        <div>
          <img src="file:///${f.path.replace(/\\/g, "/")}" width="640" height="360" style="border:1px solid #333;border-radius:4px">
          <div style="font-size:11px;color:#888;margin-top:2px">1280×720 (full)</div>
        </div>
        <div>
          <img src="file:///${f.path.replace(/\\/g, "/")}" width="168" height="94" style="border:1px solid #333;border-radius:4px">
          <div style="font-size:11px;color:#888;margin-top:2px">168×94 (browse)</div>
        </div>
      </div>
    </div>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html><head><title>Thumbnail Preview: ${slug}</title>
<style>body{background:#111;color:#eee;font-family:system-ui;padding:20px}h1{font-size:20px;margin-bottom:8px}</style>
</head><body>
<h1>Thumbnail variants — ${slug}</h1>
<p style="color:#999;font-size:13px">Compare at browse size (168×94) — if you can't read the hook at that size, it won't work.</p>
${cards}
</body></html>`;

  fs.writeFileSync(htmlPath, html);
  console.log(`\n✓ Contact sheet: ${htmlPath}`);
  console.log("  Open in browser to compare all layouts at browse size.");
  return htmlPath;
}

(async () => {
  if (allLayouts) {
    console.log(`Rendering all 6 layouts for "${slug}"...\n`);
    const files = [];
    for (const layout of LAYOUTS) {
      const p = renderThumb(slug, layout);
      files.push({ layout, path: p });
    }
    buildContactSheet(slug, files);
  } else {
    const layout = layoutOverride || undefined;
    console.log(`Rendering thumbnail for "${slug}"${layout ? ` (layout: ${layout})` : " (auto layout)"}...\n`);
    const p = renderThumb(slug, layout);
    if (p) {
      console.log(`\n✓ Full: ${p}`);
      console.log(`  Browse-size preview: open the PNG and zoom to 168×94 to check readability.`);
    }
  }
})();
