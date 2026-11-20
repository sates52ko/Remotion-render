/**
 * p4-render-truth-audit.mjs — Vision-free render truth over rendered PNGs
 * (Tier-1 automated pixel/structure tests from the 2026-10-03 plan).
 *
 * Measures, with pure CPU (no LLM/Vision, no image deps):
 *   frame exists · blank frame · near-identical / duplicate frames (aHash)
 *   content coverage (empty-wallpaper heuristic) · colorfulness (grayscale
 *   fallback) · edge density (structure proxy)
 *
 * Motion-between-frames runs only on an explicit `--motion` corpus the caller
 * asserts carries >=2 REAL frames per scene (e.g. rendered frame sequences of
 * one scene); filename heuristics cannot distinguish those from numbered
 * single-still beats, so the default reports motion as N/A instead of
 * inventing a number.
 *
 * Usage:
 *   node scripts/p4-render-truth-audit.mjs --dir=audit/faz1-full [--out=audit/visionless-10x/p4-render-truth.json]
 *   --dir accepts comma-separated directories (scanned recursively for *.png).
 */
import fs from "fs";
import path from "path";
import { analyzePngFile, flagFrame, nearDuplicateGroups, THRESHOLDS } from "./lib/render-truth.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const root = process.cwd();
const dirs = String(args.dir || "audit/faz1-full").split(",").map((d) => d.trim());
const outPath = path.resolve(root, args.out || "audit/visionless-10x/p4-render-truth.json");

// ── collect PNGs per directory ───────────────────────────────────────────────
function walk(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(png)$/i.test(e.name)) acc.push(p);
  }
}
const analyses = [];
const perDir = {};
for (const dir of dirs) {
  const abs = path.resolve(root, dir);
  const files = [];
  walk(abs, files);
  files.sort();
  for (const file of files) {
    const a = analyzePngFile(file);
    a.dir = dir;
    a.flags = flagFrame(a);
    analyses.push(a);
  }
  perDir[dir] = files.length;
  console.log(`[p4] ${dir}: ${files.length} PNG(s)`);
}
if (!analyses.length) {
  console.error("No PNGs found under: " + dirs.join(", "));
  process.exit(1);
}

// ── frame-exists + structural flags ──────────────────────────────────────────
const unreadable = analyses.filter((a) => !a.ok);
const flagged = analyses.filter((a) => a.ok && Object.keys(a.flags).length > 0);
const blank = analyses.filter((a) => a.flags.BLANK_FRAME);
const lowStructure = analyses.filter((a) => a.flags.LOW_STRUCTURE);
const grayscale = analyses.filter((a) => a.flags.GRAYSCALE_FALLBACK);

// ── duplicates / near-identical (whole set, and across directories) ──────────
const dupGroups = nearDuplicateGroups(analyses);
const crossDir = dupGroups.filter((g) => path.dirname(g.a) !== path.dirname(g.b));

// ── motion between frames (opt-in: caller asserts >=2 real frames/scene) ────
const motionEnabled = !!args.motion;
const byScene = new Map();
if (motionEnabled) {
  for (const a of analyses) {
    if (!a.ok) continue;
    const stem = path.basename(a.path).replace(/\.png$/i, "");
    const sceneKey = stem.replace(/[-_]f?\d+$/, "");
    if (!sceneKey || sceneKey === stem) continue;
    const key = a.dir + "::" + sceneKey;
    if (!byScene.has(key)) byScene.set(key, []);
    byScene.get(key).push(a);
  }
}
const sequences = motionEnabled
  ? [...byScene.entries()].filter(([, frames]) => frames.length >= 2)
  : [];
const motion = sequences.map(([sceneKey, frames]) => {
  frames.sort((x, y) => x.path.localeCompare(y.path, undefined, { numeric: true }));
  const deltas = [];
  for (let i = 1; i < frames.length; i++) {
    deltas.push(nearDuplicateGroups([frames[i - 1], frames[i]], THRESHOLDS.nearDuplicateBits).length ? 0 : 1);
  }
  const changed = deltas.filter(Boolean).length;
  return { scene: sceneKey.replace(/^[^:]*::/, ""), dir: sceneKey.split("::")[0], frames: frames.length, changedFrames: changed, staticScene: changed === 0 };
});
const motionMeasured = motion.length > 0;

// ── report ───────────────────────────────────────────────────────────────────
const flaggedFrames = flagged.map((a) => ({ path: path.relative(root, a.path), flags: Object.keys(a.flags), stdLuma: a.stdLuma, coverage: a.coverage, colorfulness: a.colorfulness }));
const ok = analyses.filter((a) => a.ok);
const pct = (n) => Math.round((n / (ok.length || 1)) * 1000) / 10;
const report = {
  audit: "P4 Render-Truth Pixel/Structure Audit (zero LLM/Vision)",
  generatedAt: new Date().toISOString(),
  thresholds: THRESHOLDS,
  dirs: perDir,
  totals: {
    pngs: analyses.length,
    readable: ok.length,
    unreadable: unreadable.length,
    blankFrames: blank.length,
    blankRate: pct(blank.length),
    lowStructure: lowStructure.length,
    lowStructureRate: pct(lowStructure.length),
    grayscaleFallback: grayscale.length,
    grayscaleRate: pct(grayscale.length),
    nearDuplicatePairs: dupGroups.length,
    crossDirectoryDuplicatePairs: crossDir.length,
    motionScenes: motion.length,
    staticScenes: motion.filter((m) => m.staticScene).length,
    motionMeasured,
  },
  unreadableFiles: unreadable.map((a) => ({ path: a.path, error: a.error })),
  flaggedFrames,
  nearDuplicates: dupGroups.map((g) => ({ a: path.relative(root, g.a), b: path.relative(root, g.b), distance: g.distance, duplicate: g.duplicate })),
  motion,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

const md = [];
md.push(`# P4 Render-Truth Audit — ${analyses.length} PNG(s), 0 LLM/Vision calls`);
md.push("");
md.push(`**Dirs:** ${dirs.join(", ")} · **Generated:** ${report.generatedAt}`);
md.push("");
md.push("| Check | Count | Rate |");
md.push("|---|---:|---:|");
md.push(`| unreadable frames | ${unreadable.length} | — |`);
md.push(`| BLANK_FRAME | ${blank.length} | ${pct(blank.length)}% |`);
md.push(`| LOW_STRUCTURE | ${lowStructure.length} | ${pct(lowStructure.length)}% |`);
md.push(`| GRAYSCALE_FALLBACK | ${grayscale.length} | ${pct(grayscale.length)}% |`);
md.push(`| near-duplicate pairs (≤${THRESHOLDS.nearDuplicateBits}/256 bits) | ${dupGroups.length} | — |`);
md.push(`| cross-directory duplicate pairs | ${crossDir.length} | — |`);
md.push(`| motion (≥2 frames/scene) | ${motionMeasured ? `${motion.filter((m) => m.staticScene).length}/${motion.length} static scenes` : "N/A — single-still corpus"} | — |`);
md.push("");
const interesting = flaggedFrames.slice(0, 25);
if (interesting.length) {
  md.push("### Flagged frames");
  md.push("");
  md.push("| Frame | Flags | stdLuma | coverage |");
  md.push("|---|---|---:|---:|");
  for (const f of interesting) md.push(`| ${f.path} | ${f.flags.join(", ")} | ${f.stdLuma} | ${f.coverage} |`);
} else {
  md.push("No frame flagged: none blank, none near-flat, none grayscale.");
}
if (dupGroups.length) {
  md.push("");
  md.push("### Near-duplicate pairs");
  md.push("");
  md.push("| A | B | Hamming |");
  md.push("|---|---|---:|");
  for (const g of dupGroups.slice(0, 25)) md.push(`| ${path.relative(root, g.a)} | ${path.relative(root, g.b)} | ${g.distance} |`);
}
md.push("");
fs.writeFileSync(outPath.replace(/\.json$/, ".md"), md.join("\n") + "\n");

console.log(`P4 render-truth: ${ok.length} readable / ${analyses.length} PNGs`);
console.log(`  blank ${blank.length} · low-structure ${lowStructure.length} · grayscale ${grayscale.length} · near-dup pairs ${dupGroups.length} (cross-dir ${crossDir.length})`);
console.log(`  motion: ${motionMeasured ? `${motion.length} scene sequences, ${motion.filter((m) => m.staticScene).length} static` : "N/A (single-still corpus)"}`);
console.log(`→ ${path.relative(root, outPath)}`);
process.exit(0);
