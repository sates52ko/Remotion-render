/**
 * v2-variety-lint.js — YPP anti-template & Single-World collision validator for Antidote 10x.
 *
 * Ensures:
 *  1. No single visual mode dominates (>35%, or >65% for live-story) & boxed-card <= 20%.
 *  2. No mode runs > 2 consecutive scenes without `continueFromPrev: true`.
 *  3. Minimal captions are populated when `artDirection.captions === "minimal"`.
 *  4. Single-World rule: flat-vector `characters` NEVER collide with `annotatedScene`, `cohortGrid`,
 *     `comparisonGrid`, or a `bg.image` that lacks `emptyStage: true`.
 */

const { ALWAYS_FULL_STAGE_10X_KEYS } = require("./antidote-10x-keys");

function classifySceneMode(scene) {
  if (!scene || typeof scene !== "object") return "unknown";
  if (scene.annotatedScene) return "annotated-scene";
  if (scene.cohortGrid) return "cohort-grid";
  if (scene.timelineScrub) return "timeline-scrub";
  if (scene.statSlam) return "stat-slam";
  if (scene.cutoutStage) return "cutout-stage";
  if (scene.editorialSpread) return "editorial-spread";
  if (scene.kineticManifesto) return "kinetic-manifesto";
  if (scene.decisionTree) return "decision-tree";
  if (scene.balanceScale) return "balance-scale";
  if (scene.stackReveal) return "stack-reveal";
  if (scene.liveInterface) return "live-interface";
  if (scene.comicStrip) return "comic-strip";
  if (scene.beforeAfterWipe) return "before-after-wipe";
  if (scene.spatialJourney) return "spatial-journey";
  if (scene.chapterInterstitial) return "chapter-interstitial";
  if (scene.vennMerge) return "venn-merge";
  if (scene.explodedView) return "exploded-view";
  if (scene.gravityPile) return "gravity-pile";
  if (scene.crumpleToss) return "crumple-toss";
  if (scene.analyticsFunnel) return "analytics-funnel";
  if (scene.barRace) return "bar-race";
  if (scene.upClose) return "up-close";
  if (scene.bookBlueprint) return "book-blueprint";
  if (scene.mechanismChain) return "mechanism-chain";
  if (scene.evidenceBoard) return "evidence-board";
  if (scene.quoteDialogue) return "quote-dialogue";
  if (scene.hookPoster) return "hook-poster";
  if (scene.comparisonGrid) {
    return scene.comparisonGrid.layout === "fullBleedSplit"
      ? "full-bleed-split"
      : scene.comparisonGrid.layout === "borderless"
        ? "borderless-comparison"
        : "boxed-card";
  }
  if (scene.visualEquation) {
    return scene.visualEquation.layout === "borderless" ? "borderless-equation" : "boxed-card";
  }
  if (scene.dataMatrix) return "data-matrix";
  if (scene.realAnchor) return "real-anchor";
  if (scene.told || (Array.isArray(scene.characters) && scene.characters.length > 0) || (Array.isArray(scene.props) && scene.props.length > 0)) {
    return "live-story";
  }
  if (scene.bg && scene.bg.image) return "full-bleed-hero";
  return "live-story";
}

function analyzeVariety(config) {
  const scenes = Array.isArray(config?.scenes) ? config.scenes : [];
  const total = scenes.length;
  const counts = {};
  let maxConsecutive = 0;
  let curMode = null;
  let curRun = 0;
  let coStagedCount = 0;
  let continuityCount = 0;
  let intentCount = 0;
  let singleWorldViolations = 0;

  for (const s of scenes) {
    const mode = classifySceneMode(s);
    counts[mode] = (counts[mode] || 0) + 1;
    if (s.continueFromPrev) continuityCount++;
    if (s.shotIntent) intentCount++;
    const hasChars = Array.isArray(s.characters) && s.characters.length > 0;
    if ((s.visualEquation || s.dataMatrix || s.realAnchor) && hasChars) {
      coStagedCount++;
    }
    if (hasChars && s.bg?.image && s.bg.image.emptyStage !== true) {
      singleWorldViolations++;
    }
    if (hasChars && ALWAYS_FULL_STAGE_10X_KEYS.some((k) => s[k] != null)) {
      singleWorldViolations++;
    }
    if (mode === curMode && !s.continueFromPrev) {
      curRun++;
    } else {
      curMode = mode;
      curRun = 1;
    }
    if (curRun > maxConsecutive) maxConsecutive = curRun;
  }

  const shares = {};
  for (const [k, v] of Object.entries(counts)) {
    shares[k] = total ? v / total : 0;
  }

  const castCount = config?.meta?.cast ? Object.keys(config.meta.cast).length : 0;
  return {
    total,
    counts,
    shares,
    maxConsecutive,
    coStagedCount,
    continuityCount,
    intentCount,
    singleWorldClean: singleWorldViolations === 0,
    singleWorldViolations,
    castCount,
  };
}

function assertVariety(config) {
  const scenes = Array.isArray(config?.scenes) ? config.scenes : [];
  const stats = analyzeVariety(config);
  const errors = [];
  if (stats.total === 0) errors.push("config has 0 scenes");
  for (const s of scenes) {
    const hasChars = Array.isArray(s.characters) && s.characters.length > 0;
    if (hasChars && s.bg?.image && s.bg.image.emptyStage !== true) {
      errors.push(`Single-World violation in ${s.id}: characters cannot be placed over bg.image without emptyStage: true`);
    }
    if (hasChars && ALWAYS_FULL_STAGE_10X_KEYS.some((k) => s[k] != null)) {
      errors.push(`Single-World violation in ${s.id}: full-stage 10x device cannot mix flat-vector characters`);
    }
    if (hasChars && config?.meta?.artDirection?.castMode === "illustrated") {
      errors.push(`Single-World violation in ${s.id}: castMode "illustrated" cannot mix flat-vector Everyman characters`);
    }
  }
  if ((stats.shares["boxed-card"] || 0) > 0.20) {
    errors.push(`boxed-card share ${(stats.shares["boxed-card"] * 100).toFixed(1)}% exceeds 20% YPP limit`);
  }
  for (const [mode, share] of Object.entries(stats.shares)) {
    const limit = mode === "live-story" ? 0.65 : 0.35;
    if (share > limit) {
      errors.push(`mode "${mode}" share ${(share * 100).toFixed(1)}% exceeds ${(limit * 100).toFixed(0)}% limit`);
    }
  }
  if (stats.maxConsecutive > 2) {
    errors.push(`maxConsecutive=${stats.maxConsecutive} exceeds 2 without continueFromPrev`);
  }
  if (config?.meta?.artDirection?.captions === "minimal" && (!Array.isArray(config.captions) || config.captions.length === 0)) {
    errors.push(`artDirection.captions === "minimal" but config.captions is empty`);
  }
  if (errors.length) {
    const err = new Error(`Variety/Single-World check failed:\n  - ${errors.join("\n  - ")}`);
    err.stats = stats;
    throw err;
  }
  return stats;
}

module.exports = { classifySceneMode, analyzeVariety, assertVariety };
