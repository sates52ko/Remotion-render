/**
 * antidote-10x-keys.js — Shared registry of Antidote 10x Single-World device keys.
 *
 * Used by `scripts/storyboard.js` (merge validation + art.json passthrough) and
 * `scripts/plan-antidote.js` (pre-lock 10x passthrough + fullStage clear).
 */

const DEVICE_10X_KEYS = [
  "annotatedScene",
  "cohortGrid",
  "timelineScrub",
  "statSlam",
  "cutoutStage",
  "editorialSpread",
  "kineticManifesto",
  "decisionTree",
  "balanceScale",
  "stackReveal",
  "liveInterface",
  "comicStrip",
  "beforeAfterWipe",
  "spatialJourney",
  "chapterInterstitial",
  "visualEquation",
  "comparisonGrid",
  "dataMatrix",
  "realAnchor",
  "vennMerge",
  "explodedView",
  "gravityPile",
  "crumpleToss",
  "analyticsFunnel",
  "barRace",
  "upClose",
];

const EXTRA_10X_KEYS = ["shotIntent", "depthCarry", "stageMood", "bgImage", "transitionOverride", "assetRequests"];

const ALL_10X_KEYS = [...DEVICE_10X_KEYS, ...EXTRA_10X_KEYS];

const PASSTHROUGH_10X_KEYS = [...DEVICE_10X_KEYS, "shotIntent", "depthCarry"];

const ALWAYS_FULL_STAGE_10X_KEYS = [
  "annotatedScene",
  "cohortGrid",
  "timelineScrub",
  "statSlam",
  "cutoutStage",
  "editorialSpread",
  "kineticManifesto",
  "decisionTree",
  "balanceScale",
  "stackReveal",
  "liveInterface",
  "comicStrip",
  "beforeAfterWipe",
  "spatialJourney",
  "chapterInterstitial",
  "comparisonGrid",
  "vennMerge",
  "explodedView",
  "gravityPile",
  "crumpleToss",
  "analyticsFunnel",
  "barRace",
  "upClose",
];

function hasAny10xDevice(obj) {
  return !!obj && DEVICE_10X_KEYS.some((k) => obj[k] != null);
}

function active10xDevice(obj) {
  if (!obj) return null;
  for (const k of DEVICE_10X_KEYS) {
    if (obj[k] != null) return k;
  }
  return null;
}

function isFullStage10x(obj) {
  if (!obj) return false;
  if (ALWAYS_FULL_STAGE_10X_KEYS.some((k) => obj[k] != null)) return true;
  if ((obj.visualEquation || obj.dataMatrix || obj.realAnchor) && !(Array.isArray(obj.cast) && obj.cast.length > 0)) {
    return true;
  }
  return false;
}

module.exports = {
  DEVICE_10X_KEYS,
  EXTRA_10X_KEYS,
  ALL_10X_KEYS,
  PASSTHROUGH_10X_KEYS,
  ALWAYS_FULL_STAGE_10X_KEYS,
  hasAny10xDevice,
  active10xDevice,
  isFullStage10x,
};
