/**
 * compile-10x-cues.js — Compiles spoken `*Cue` / `cue` phrases on 10x devices
 * into relative frame numbers, strips helper cue keys, and auto-staggers long scenes.
 */
const { DEVICE_10X_KEYS } = require("./antidote-10x-keys");

function normPhrase(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCueFrame(phrase, { words = [], beatStartSec = 0, durationFrames = 180, fps = 30 } = {}) {
  const target = normPhrase(phrase);
  if (!target || !Array.isArray(words) || !words.length) return null;
  const tWords = target.split(" ").filter(Boolean);
  if (!tWords.length) return null;

  const wNorm = words.map((w) => ({
    txt: normPhrase(w.w ?? w.word ?? ""),
    startSec: w.start != null ? Number(w.start) : Number(w.s ?? 0) / fps,
  }));

  for (let i = 0; i <= wNorm.length - tWords.length; i++) {
    let ok = true;
    for (let j = 0; j < tWords.length; j++) {
      if (wNorm[i + j].txt !== tWords[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const rel = Math.round((wNorm[i].startSec - beatStartSec) * fps);
      return Math.max(6, Math.min(Math.max(12, durationFrames - 18), rel));
    }
  }
  return null;
}

const TOP_CUE_MAP = [
  ["tossCue", "tossAt"],
  ["splitCue", "splitAt"],
  ["wipeCue", "wipeAt"],
  ["zoomCue", "zoomAt"],
  ["expandCue", "expandAt"],
  ["calloutCue", "calloutAt"],
  ["loopCue", "loopAt"],
];

const ARRAY_KEYS = [
  "events", "lines", "panels", "circles", "layers", "items", "stages",
  "epochs", "stations", "actors", "props", "connectors", "blocks", "channels",
  "branches", "leftWeights", "rightWeights", "spotlights", "stickers", "traces",
];

function compile10xCues(scene, ctx = {}) {
  if (!scene || typeof scene !== "object") return scene;
  const dur = Math.max(30, ctx.durationFrames || scene.durationFrames || 180);
  const maxReveal = Math.max(24, Math.round(dur * 0.72));
  const maxAction = Math.max(30, dur - 24);

  for (const dk of DEVICE_10X_KEYS) {
    const dev = scene[dk];
    if (!dev || typeof dev !== "object") continue;

    if (typeof dev.at === "number" && dev.at > 18) dev.at = 12;

    for (const [cueKey, atKey] of TOP_CUE_MAP) {
      if (dev[cueKey] != null) {
        const f = findCueFrame(dev[cueKey], { ...ctx, durationFrames: dur });
        if (f != null && dev[atKey] == null) dev[atKey] = f;
        delete dev[cueKey];
      }
      if (typeof dev[atKey] === "number") {
        dev[atKey] = Math.max(12, Math.min(Math.max(24, dur - 30), dev[atKey]));
      }
    }

    for (const arrKey of ARRAY_KEYS) {
      const arr = dev[arrKey];
      if (!Array.isArray(arr) || !arr.length) continue;
      let anyExplicitAt = false;
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        if (item.cue != null) {
          const f = findCueFrame(item.cue, { ...ctx, durationFrames: dur });
          if (f != null && item.at == null) item.at = f;
          delete item.cue;
        }
        for (const [ck, ak] of [["strikeCue", "strikeAt"], ["pruneCue", "pruneAt"], ["changeCue", "changeAt"]]) {
          if (item[ck] != null) {
            const f = findCueFrame(item[ck], { ...ctx, durationFrames: dur });
            if (f != null && item[ak] == null) item[ak] = f;
            delete item[ck];
          }
        }
        if (typeof item.at === "number") anyExplicitAt = true;
      }
      if (dur > 240 && !anyExplicitAt && arr.length >= 2) {
        const span = Math.max(36, dur - 60);
        arr.forEach((item, idx) => {
          if (item && typeof item === "object" && item.at == null) {
            item.at = Math.round(12 + (idx * span) / Math.max(1, arr.length - 1));
          }
        });
      }
      // Clamp/rescale out-of-bounds authored `at` & `*At` timestamps so scenes never stay blank at 70% frame
      const atVals = arr.map((it) => (it && typeof it.at === "number" ? it.at : null)).filter((v) => v !== null);
      if (atVals.length) {
        const minAt = Math.min(...atVals);
        const maxAt = Math.max(...atVals);
        if (minAt > 36 || maxAt > maxReveal) {
          const targetMax = Math.min(maxAt, maxReveal);
          for (const item of arr) {
            if (item && typeof item.at === "number") {
              item.at = maxAt === minAt
                ? 12
                : Math.round(10 + ((item.at - minAt) / (maxAt - minAt)) * Math.max(12, targetMax - 10));
            }
          }
        }
      }
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const baseAt = typeof item.at === "number" ? item.at : 10;
        for (const ak of ["strikeAt", "pruneAt", "changeAt"]) {
          if (typeof item[ak] === "number") {
            item[ak] = Math.max(Math.min(maxAction, baseAt + 12), Math.min(maxAction, item[ak]));
          }
        }
      }
    }
  }
  return scene;
}

module.exports = { compile10xCues, findCueFrame };
