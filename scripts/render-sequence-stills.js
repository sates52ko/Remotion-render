#!/usr/bin/env node
/**
 * render-sequence-stills.js — P3.6 evidence stills: render an EXPLICIT list
 * of (scene, frame) pairs in ONE bundle, so an audit can cite the exact frame
 * a claim was verified at.
 *
 * render-lotf-stills.mjs hardcodes one book; this takes the book and the
 * frames as arguments (same arg style as audit-stills.js). render-still.js
 * re-bundles per call — this does not.
 *
 * Usage:
 *   node scripts/render-sequence-stills.js --slug=<slug> \
 *     --frames=scene-07:2311,scene-10:3080,scene-20:5599 [--out=audit/p3.6-stills]
 *
 * Out: <out>/<slug>/<scene>-f<frame>.png  (existing files >10KB are skipped)
 */
const { bundle } = require("@remotion/bundler");
const { renderStill, selectComposition, openBrowser } = require("@remotion/renderer");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a.slice(2), true];
  }),
);

const slug = args.slug;
const frames = String(args.frames || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => {
    const [id, f] = p.split(":");
    return { id: (id || "").trim(), frame: parseInt(f, 10) };
  });
if (!slug || !frames.length || frames.some((f) => !f.id || !Number.isInteger(f.frame))) {
  console.error("Usage: node scripts/render-sequence-stills.js --slug=<slug> --frames=<scene>:<frame>,... [--out=<dir>]");
  process.exit(1);
}

// Engine-aware: Antidote books register as Antidote-<slug>, Vox books as Vox-<slug>.
const antidotePath = path.join(ROOT, "books", slug, "config.antidote.json");
const voxPath = path.join(ROOT, "books", slug, "config.vox.json");
const isVox = !fs.existsSync(antidotePath) && fs.existsSync(voxPath);
const config = JSON.parse(fs.readFileSync(isVox ? voxPath : antidotePath, "utf8"));
const compositionId = (config.meta && config.meta.compositionId) || `${isVox ? "Vox" : "Antidote"}-${slug}`;
const outDir = path.join(ROOT, String(args.out || path.join("audit", "p3.6-stills")), slug);
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  console.log(`bundling ${compositionId} ...`);
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "src", "index.ts"),
    webpackOverride: (config) => config,
  });
  // One shared browser + a generous timeout: a fresh headless browser per still
  // (the default) intermittently timed out at 30s after a few frames.
  const puppeteerInstance = await openBrowser("chrome");
  const timeoutInMilliseconds = 180000;
  // --no-captions (mute-test v2, 2026-10-24): the same frame without the burned-in caption layer — no crop needed,
  // so icons placed low in the frame stay visible. Antidote reads its config from props: override captions only.
  if (args["no-captions"] && isVox) { console.error("❌ --no-captions is Antidote-only (Vox draws captions differently)"); process.exit(1); }
  const inputProps = args["no-captions"] ? { config: { ...config, captions: [] } } : undefined;
  const composition = await selectComposition({ serveUrl, id: compositionId, puppeteerInstance, timeoutInMilliseconds, ...(inputProps ? { inputProps } : {}) });
  console.log("composition loaded:", composition.id, inputProps ? "(captions off)" : "");
  for (const { id, frame } of frames) {
    const outFile = path.join(outDir, `${id}-f${frame}.png`);
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 10000) {
      console.log("[SKIP]", path.relative(ROOT, outFile));
      continue;
    }
    const t0 = Date.now();
    console.log("[RENDERING]", id, "frame", frame);
    const opts = { composition, serveUrl, output: outFile, frame, imageFormat: "png", puppeteerInstance, timeoutInMilliseconds, ...(inputProps ? { inputProps } : {}) };
    try {
      await renderStill(opts);
    } catch (err) {
      console.warn("[RETRY]", id, "frame", frame, "-", String(err && err.message || err).split("\n")[0]);
      await renderStill(opts);
    }
    console.log("[DONE]", path.relative(ROOT, outFile), ((Date.now() - t0) / 1000).toFixed(1) + "s");
  }
  await puppeteerInstance.close({ silent: true });
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
