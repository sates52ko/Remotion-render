import type { BodyPlan, CharacterSpec, ShotName, TextSpec } from "./schema";

/**
 * shots.ts — the SHOT GRAMMAR of the Antidote engine.
 *
 * A shot is a framing preset: where the cast stands, how large it reads, whether
 * it is a silhouette, and which zone the kinetic copy owns. Scenes name a shot
 * and leave staging out; the renderer resolves it here. Explicit x/y/scale in a
 * scene always wins, so hand art-direction (and every pre-shot-grammar config)
 * keeps working untouched.
 */

export type CharStage = { x: number; y: number; scale: number; flip: boolean; silhouette: boolean };
export type TextStage = { x: number; y: number; size: number };

export type ShotPreset = {
  /** Baseline framing applied to the whole stage before the scene camera. */
  stage: { scale: number; x: number; y: number };
  /** Slots the cast fills, in order. Extra characters reuse the last slot, nudged. */
  chars: CharStage[];
  /**
   * FULL-BODY slots (Antidote 3.0). A shot that claims to show a person inside a
   * world — wide, crowd, diorama, illustration, lowAngle, silhouette — draws the
   * `full` rig (hips + legs + feet) instead of a torso hovering over the set.
   *
   * These are a SEPARATE slot table on purpose. The full rig's box is 900 tall
   * against the bust's 600, so its anchor and scale are different numbers; by
   * keeping the bust table byte-identical, every config written before 3.0 —
   * and every character that carries explicit staging — frames exactly as it
   * did before. See resolveBody().
   */
  charsFull?: CharStage[];
  /** Crowd rows are re-spaced for the taller rig. */
  fullCrowd?: boolean;
  /** Copy zone; stacked entries step down by `textStep`. */
  text: TextStage;
  textStep: number;
  /** Where a motif sits when the scene doesn't place one explicitly. */
  motif: { x: number; y: number; scale: number };
  /** insert drops the cast entirely — the motif carries the beat. */
  dropsCast?: boolean;
  /** split paints two color fields and divides the frame. */
  splitField?: boolean;
};

const C = (x: number, y: number, scale: number, flip = false, silhouette = false): CharStage => ({ x, y, scale, flip, silhouette });

export const SHOTS: Record<ShotName, ShotPreset> = {
  // Environment reads; the figure is a person inside a world, not a presenter.
  wide: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(700, 742, 0.95), C(1268, 742, 0.95, true)],
    // full: both figures stand on the ground plane, feet at ~y 925 — clear of the
    // reserved caption band (CaptionLayer sits at bottom:64) and on the floor
    // line the `near` backdrop layer draws
    charsFull: [C(700, 644, 0.66), C(1268, 644, 0.66, true)],
    text: { x: 960, y: 196, size: 92 },
    textStep: 132,
    motif: { x: 1420, y: 560, scale: 0.9 },
  },
  // The legacy look, kept as the workhorse so the language still has a home base.
  medium: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(660, 650, 1.32), C(1290, 650, 1.32, true)],
    text: { x: 1360, y: 300, size: 104 },
    textStep: 150,
    motif: { x: 1380, y: 690, scale: 1 },
  },
  // Face fills the right; copy owns the left. The intimacy shot.
  closeUp: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(1300, 900, 3.1), C(1300, 900, 3.1, true)],
    text: { x: 500, y: 470, size: 96 },
    textStep: 148,
    motif: { x: 470, y: 820, scale: 0.7 },
  },
  // Two people, angled at each other — every dialogue / contrast beat.
  twoShot: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(566, 668, 1.24), C(1354, 668, 1.24, true)],
    text: { x: 960, y: 186, size: 90 },
    textStep: 128,
    motif: { x: 960, y: 596, scale: 0.62 },
  },
  // Dark foreground shoulder, subject beyond — instant depth for two hard cuts in a row.
  overShoulder: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(360, 852, 2.55, false, true), C(1230, 646, 1.2, true)],
    text: { x: 1240, y: 208, size: 86 },
    textStep: 124,
    motif: { x: 1600, y: 640, scale: 0.6 },
  },
  // No cast at all. The pattern interrupt that breaks a presenter run.
  insert: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [],
    text: { x: 960, y: 806, size: 108 },
    textStep: 130,
    motif: { x: 960, y: 452, scale: 1.5 },
    dropsCast: true,
  },
  // Before/after, this-vs-that, the fork in the road.
  split: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(482, 700, 1.2), C(1438, 700, 1.2, true)],
    text: { x: 960, y: 158, size: 82 },
    textStep: 116,
    motif: { x: 960, y: 620, scale: 0.55 },
    splitField: true,
  },
  // Flat dark figure on a bright accent field; the copy gets to be enormous.
  silhouette: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(960, 726, 1.9, false, true), C(1360, 726, 1.7, true, true)],
    // a whole body against the accent field reads as a person; a floating torso
    // reads as a logo
    charsFull: [C(960, 628, 0.71, false, true), C(1330, 640, 0.64, true, true)],
    text: { x: 960, y: 244, size: 128 },
    textStep: 158,
    motif: { x: 300, y: 560, scale: 0.8 },
  },
  // Heroic: figure low and large, copy towering overhead.
  lowAngle: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(960, 986, 2.15), C(1300, 986, 1.9, true)],
    // heroic: tall figure, feet just past the bottom edge
    charsFull: [C(960, 720, 0.87), C(1320, 720, 0.80, true)],
    text: { x: 960, y: 200, size: 116 },
    textStep: 162,
    motif: { x: 300, y: 400, scale: 0.7 },
  },
  // The everyman multiplied — "most people", "everyone around you", the norm.
  crowd: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(960, 760, 1.05)],
    charsFull: [C(960, 627, 0.62)],
    fullCrowd: true,
    text: { x: 960, y: 182, size: 96 },
    textStep: 128,
    // off to the side: a centered motif lands straight on the crowd's heads
    motif: { x: 322, y: 388, scale: 0.62 },
  },
  // A concrete SCENE ICON is the hero — a crash, a home, a lake, a wall of notes.
  // One silhouetted subject stands to the left looking toward it, so the beat has
  // a person AND its literal subject; the copy owns the lower-left.
  illustration: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(356, 984, 2.02, false, true)],
    // a whole person looking at the thing, not a cropped shoulder
    charsFull: [C(330, 640, 0.67, false, true)],
    text: { x: 566, y: 232, size: 90 },
    textStep: 126,
    motif: { x: 1262, y: 446, scale: 1.66 },
  },
  // The subject stands INSIDE the scene: the icon is a large environmental piece,
  // a silhouette figure in front of it (defaults; the director tunes per icon).
  diorama: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [C(560, 988, 1.78, false, true)],
    // standing INSIDE the set, on its ground plane
    charsFull: [C(520, 631, 0.69, false, true)],
    text: { x: 520, y: 196, size: 90 },
    textStep: 126,
    motif: { x: 1150, y: 590, scale: 2.5 },
  },
  // Two icons + an arrow between — director places both via explicit x/y and adds
  // the connecting arrow; no cast.
  beforeAfter: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [],
    text: { x: 960, y: 176, size: 84 },
    textStep: 120,
    motif: { x: 548, y: 560, scale: 1.32 },
    dropsCast: true,
  },
  // Monumental Chapter / Law / Part title card — pattern interrupt
  chapterCard: {
    stage: { scale: 1, x: 0, y: 0 },
    chars: [],
    text: { x: 960, y: 540, size: 84 },
    textStep: 120,
    motif: { x: 960, y: 540, scale: 1 },
    dropsCast: true,
  },
};

/**
 * Look a shot up defensively. Configs written before the shot grammar carry no
 * `shot` field, and Remotion hands `defaultProps` to the renderer WITHOUT running
 * them through the zod schema — so the field really can be undefined at runtime.
 * Those videos are the legacy presenter look, which is exactly `medium`.
 */
export const shotPreset = (shot: ShotName | undefined): ShotPreset => SHOTS[shot as ShotName] ?? SHOTS.medium;

/**
 * Which body plan this character renders as.
 *
 * Rules, in order:
 *  1. An explicit `body` on the character always wins (hand art-direction).
 *  2. A character carrying EXPLICIT STAGING (x / y / scale) is legacy
 *     hand-staging: those numbers were chosen against the 600-tall bust box, so
 *     growing the rig to 900 would silently re-frame a book somebody tuned by
 *     hand. Those stay `bust`, exactly as they render today.
 *  3. Otherwise the shot decides — and a shot decides "full" by having a
 *     `charsFull` slot table.
 */
export function resolveBody(shot: ShotName, spec: CharacterSpec): BodyPlan {
  if (spec.body) return spec.body;
  const staged = spec.x !== undefined || spec.y !== undefined || spec.scale !== undefined;
  if (staged) return "bust";
  return shotPreset(shot).charsFull ? "full" : "bust";
}

/** Resolve a character's staging: explicit values win, otherwise the shot slot. */
export function stageChar(shot: ShotName, spec: CharacterSpec, index: number): CharStage {
  const preset = shotPreset(shot);
  // Full-body characters stand on the full-body slot table; everything else
  // keeps the original one, byte for byte.
  const slots = resolveBody(shot, spec) === "full" && preset.charsFull ? preset.charsFull : preset.chars;
  const slot = slots.length ? slots[Math.min(index, slots.length - 1)] : SHOTS.medium.chars[0];
  // Characters beyond the last slot fan out so they never stack exactly.
  const overflow = slots.length ? Math.max(0, index - (slots.length - 1)) : 0;
  return {
    x: spec.x ?? slot.x + overflow * 190,
    y: spec.y ?? slot.y,
    scale: spec.scale ?? slot.scale,
    flip: spec.flip ?? slot.flip,
    silhouette: spec.silhouette ?? slot.silhouette,
  };
}

/** Resolve a text block's staging; stacked blocks step down the copy zone. */
export function stageText(shot: ShotName, spec: TextSpec, index: number): TextStage {
  const preset = shotPreset(shot);
  // Face safe-zone: in lowAngle (center-cast hero shot), stepping straight down by textStep
  // places index >= 1 directly onto the character's face (y: 330-520).
  // Sequential texts in lowAngle share the hero upper sky; only step down in side-cast shots.
  const step = shot === "lowAngle" ? 0 : preset.textStep;
  return {
    x: spec.x ?? preset.text.x,
    y: spec.y ?? (preset.text.y + index * step),
    size: spec.size ?? (index === 0 ? preset.text.size : Math.round(preset.text.size * 0.78)),
  };
}

/**
 * Anti-repeat shot picker, shared by the planner and available to hand
 * art-direction. Given the shots already used and a ranked list of candidates,
 * returns the first candidate that hasn't appeared in the last `window` scenes;
 * falls back to the least-recently-used candidate.
 */
export function pickShot(recent: ShotName[], candidates: ShotName[], window = 4): ShotName {
  const tail = recent.slice(-window);
  const fresh = candidates.find((c) => !tail.includes(c));
  if (fresh) return fresh;
  let best = candidates[0];
  let bestAge = -1;
  for (const c of candidates) {
    const idx = recent.lastIndexOf(c);
    const age = idx === -1 ? Number.MAX_SAFE_INTEGER : recent.length - idx;
    if (age > bestAge) { bestAge = age; best = c; }
  }
  return best;
}
