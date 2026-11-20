"use strict";
/**
 * thumb-hook-check.js — is the thumbnail's hook text actually IN the image? (2026-10-28)
 *
 * A thumbnail shipped without its hook visible (a stale registry rendered another hook / the text sat on a same-colour
 * ground). Check: render the same still twice — with the hook and with an empty hook — and measure how many pixels the
 * hook changes, in grayscale at 320×180. A hook that changes almost nothing is not visible. The threshold is a first,
 * uncalibrated setting (a 3-word hook at 88 px changes several % of the frame); it is reported, never silently loosened.
 */
const { spawnSync } = require("child_process");

const W = 320, H = 180;
const DELTA = 48;            // gray-level change that counts as "the hook drew here" (contrast, not anti-alias noise)
const MIN_CHANGED = 0.008;   // ≥ 0.8 % of the frame must change for the hook to count as visible

/** Grayscale W×H bytes of an image file (ffmpeg), or null. */
function grayOf(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
  return r.status === 0 && r.stdout && r.stdout.length === W * H ? r.stdout : null;
}

/** Share of pixels the hook changed (with vs without). */
function hookDiff(withHook, withoutHook) {
  if (!withHook || !withoutHook || withHook.length !== withoutHook.length) return null;
  let n = 0;
  for (let i = 0; i < withHook.length; i++) if (Math.abs(withHook[i] - withoutHook[i]) > DELTA) n++;
  return n / withHook.length;
}

/** Verdict for one variant. */
function hookVisibility(withHook, withoutHook) {
  const changed = hookDiff(withHook, withoutHook);
  if (changed == null) return { hookVisible: null, changedPct: null, detail: "could not read one of the two renders" };
  const hookVisible = changed >= MIN_CHANGED;
  return { hookVisible, changedPct: +(changed * 100).toFixed(2), detail: `${(changed * 100).toFixed(2)}% of pixels change with the hook (visible ≥ ${MIN_CHANGED * 100}%)` };
}

module.exports = { grayOf, hookDiff, hookVisibility, W, H, DELTA, MIN_CHANGED };
