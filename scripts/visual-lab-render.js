// Visual Lab — still renderer. ONE bundle, then one renderStill per selected scene.
// Report-only: never a full-video render, never touches a book folder.
//
//   VISUAL_LAB_ROOT=<tree with books/ and src/> node scripts/visual-lab-render.js \
//       --manifest=<sample.json> --out=<dir>
//
// The manifest (from `visual-lab.js sample`) fixes the scene ids. Frames are read from the
// composition's own timeline: a scene's frame is fromFrame + floor(durationFrames / 2),
// taken from the book config, and verified against the composition's durationInFrames.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

// CODE_ROOT supplies src/ and node_modules; BOOK_ROOT supplies books/<slug>/config.antidote.json.
// Both default to the same root (VISUAL_LAB_ROOT, else this repo), so existing runs are unchanged.
const DEFAULT_ROOT = process.env.VISUAL_LAB_ROOT || path.join(__dirname, "..");
const CODE_ROOT = process.env.VISUAL_LAB_CODE_ROOT || DEFAULT_ROOT;
const BOOK_ROOT = process.env.VISUAL_LAB_BOOK_ROOT || DEFAULT_ROOT;
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const gitSha = (cwd) => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
const gitDirty = (cwd) => { try { return execFileSync("git", ["status", "--porcelain", "--", "src"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").filter(Boolean).length; } catch { return null; } };

async function main() {
  if (!args.manifest || !args.out) {
    console.error("usage: node scripts/visual-lab-render.js --manifest=<sample.json> --out=<dir>");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(args.manifest, "utf8"));
  const slug = manifest.slug;
  const cfgPath = path.join(BOOK_ROOT, "books", slug, "config.antidote.json");
  const cfgRaw = fs.readFileSync(cfgPath, "utf8");
  const config = JSON.parse(cfgRaw);
  const compositionId = config.meta?.compositionId || `Antidote-${slug}`;

  // Select only scenes with authoritative narration. Missing-narration scenes are reported, not rendered for semantics.
  const wanted = manifest.sampled.filter((x) => !x.narrationMissing);
  const byId = new Map((config.scenes || []).map((s) => [s.id, s]));
  const plan = wanted.map((x) => {
    const s = byId.get(x.id);
    if (!s) throw new Error(`scene ${x.id} not in config`);
    const from = s.fromFrame, dur = s.durationFrames;
    if (typeof from !== "number" || typeof dur !== "number") throw new Error(`scene ${x.id} has no fromFrame/durationFrames`);
    return { id: x.id, frame: from + Math.floor(dur / 2), fromFrame: from, durationFrames: dur, narrationSha256: x.narrationSha256 };
  });

  fs.mkdirSync(args.out, { recursive: true });
  const { bundle } = require(path.join(CODE_ROOT, "node_modules", "@remotion", "bundler"));
  const { renderStill, selectComposition } = require(path.join(CODE_ROOT, "node_modules", "@remotion", "renderer"));

  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: path.join(CODE_ROOT, "src", "index.ts") });
  const bundleMs = Date.now() - t0;
  const bundleDir = path.resolve(serveUrl.replace(/^file:\/\//, ""));

  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps: { config }, timeoutInMilliseconds: 180000 });
  if (composition.durationInFrames < Math.max(...plan.map((p) => p.frame)) + 1) throw new Error("composition shorter than planned frames");

  // Two variants from the same bundle: subtitles visible (what viewers see) and subtitles
  // removed (config.captions = []), so the image's own contribution can be judged alone.
  const ALL_VARIANTS = [
    { name: "subtitled", config: config },
    { name: "subtitle-free", config: { ...config, captions: [] } },
  ];
  // --subtitle-free-only renders just the subtitle-free variant (default: both, unchanged).
  const VARIANTS = args["subtitle-free-only"] ? ALL_VARIANTS.filter((v) => v.name === "subtitle-free") : ALL_VARIANTS;
  const frames = [];
  for (const v of VARIANTS) {
    const dir = path.join(args.out, v.name);
    fs.mkdirSync(dir, { recursive: true });
    // renderStill ignores inputProps for a composition chosen earlier (verified: identical
    // hashes), so each variant selects its own composition with its props.
    const variantComposition = await selectComposition({ serveUrl, id: compositionId, inputProps: { config: v.config }, timeoutInMilliseconds: 180000 });
    for (const p of plan) {
      const output = path.join(dir, `${p.id}-f${p.frame}.png`);
      const t1 = Date.now();
      await renderStill({ composition: variantComposition, serveUrl, output, inputProps: { config: v.config }, frame: p.frame, imageFormat: "png", timeoutInMilliseconds: 180000 });
      frames.push({ ...p, variant: v.name, output, renderMs: Date.now() - t1, pngSha256: sha(fs.readFileSync(output)) });
    }
  }

  const record = {
    slug, compositionId,
    manifestSha256: sha(fs.readFileSync(args.manifest)),
    configSha256: sha(Buffer.from(cfgRaw)),
    codeRoot: CODE_ROOT, bookRoot: BOOK_ROOT,
    codeSha: gitSha(CODE_ROOT),
    srcUncommittedFiles: gitDirty(CODE_ROOT),
    bundleMs, totalRenderMs: frames.reduce((a, f) => a + f.renderMs, 0),
    compositionDurationInFrames: composition.durationInFrames,
    skippedNarrationMissing: manifest.sampled.filter((x) => x.narrationMissing).map((x) => x.id),
    frames,
    recordedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(args.out, "render-record.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(`✓ ${frames.length} frames → ${args.out} (bundle ${(bundleMs / 1000).toFixed(0)}s, renders ${(record.totalRenderMs / 1000).toFixed(0)}s)`);
}

main().catch((e) => { console.error("visual-lab-render failed:", e && e.stack ? e.stack : e); process.exit(1); });
