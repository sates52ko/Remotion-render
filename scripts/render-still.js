const { bundle } = require("@remotion/bundler");
const { renderStill, selectComposition } = require("@remotion/renderer");
const path = require("path");
const fs = require("fs");

async function main() {
  const compId = process.argv[2] || "Antidote-fluke";
  const frame = parseInt(process.argv[3] || "2977", 10);
  const outPath = process.argv[4] || path.resolve("out", `test-${compId}-${frame}.png`);
  const entryPoint = process.argv[5] || (compId.includes("fluke") ? path.resolve("src/preview-fluke.tsx") : path.resolve("src/index.ts"));

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`Bundling ${compId} from ${entryPoint}...`);
  const bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  console.log(`Selecting composition ${compId}...`);
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compId,
  });

  console.log(`Rendering frame ${frame} to ${outPath}...`);
  await renderStill({
    composition,
    serveUrl: bundleLocation,
    output: outPath,
    frame,
    imageFormat: "png",
  });
  console.log(`Successfully rendered still to ${outPath}!`);
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
