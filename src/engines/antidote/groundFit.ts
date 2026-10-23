/**
 * groundFit.ts — keep a body lying on the floor inside the frame (2026-10-17).
 *
 * MEASURED BUG (the-art-of-saying-no scene-198, authored action "collapsed",
 * shot medium): the shot slots are tuned for a STANDING figure — the bust's floor
 * line is the bottom edge of its box, which a waist-up presenter is meant to be
 * cut by. A body tipped flat onto that floor line lands in the bottom band: in
 * `medium` it lay under the subtitles with its legs past the frame edge (the
 * blind viewer saw "a tiny arm"), and in `closeUp` (slot y 900, scale 3.1) it was
 * entirely below the frame.
 *
 * The rule (collapsed only — no other action is touched): compute the lying
 * body's real outline from the rig's own joint geometry (Everyman.tsx: head,
 * torso, shoulder/elbow/hand, hip/knee/foot, contact shadow, the same lean →
 * tip → height → bust-fit transform chain), map it through the shot's staging,
 * and move it — shrinking only when it cannot fit — so the whole outline sits in
 * FIGURE_SAFE (on frame) / FIGURE_SAFE_BUST (on frame and above the subtitle band). A body that already fits is
 * left exactly where the shot put it.
 *
 * Pure (no Remotion), so scripts/test-authored-fidelity.js checks it in node.
 */
import type { Pose } from "./movements";

/**
 * Where the whole outline must sit. A FULL-body shot (wide, illustration, diorama…)
 * stands its figure on the set's drawn floor line (~y 925), so its lying body stays
 * on that floor and only has to be on frame. A BUST shot has no floor of its own —
 * its floor line is the frame's bottom edge — so a body lying there is lifted clear
 * of the subtitle band (CaptionLayer: bottom 64, ≤2 lines ≈ 150px tall).
 */
export const FIGURE_SAFE = { x0: 40, x1: 1880, y0: 60, y1: 1024 } as const;
export const FIGURE_SAFE_BUST = { ...FIGURE_SAFE, y1: 866 } as const;

type Pt = { x: number; y: number };
type M = [number, number, number, number, number, number]; // a b c d e f (SVG matrix)
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const S = (sx: number, sy: number = sx): M => [sx, 0, 0, sy, 0, 0];
const R = (deg: number, cx = 0, cy = 0): M => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return mul(T(cx, cy), mul([c, s, -s, c, 0, 0], T(-cx, -cy)));
};
const about = (m: M, cx: number, cy: number): M => mul(T(cx, cy), mul(m, T(-cx, -cy)));
const ap = (m: M, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const ring = (cx: number, cy: number, rx: number, ry: number, n = 16): Pt[] =>
  Array.from({ length: n }, (_, k) => ({ x: cx + rx * Math.cos((k / n) * Math.PI * 2), y: cy + ry * Math.sin((k / n) * Math.PI * 2) }));

const HIP_Y = 596, THIGH = 140, SHIN = 120; // = Everyman.tsx
const BUILD_W: Record<string, number> = { slight: 0.9, average: 1, heavy: 1.15 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The outline of a TIPPED figure (pose.tip ≠ 0) in its own box coordinates
 * (400 × 600 bust / 400 × 900 full), as Everyman draws it. Null for an upright pose.
 */
export function tippedOutline(pose: Pose, body: "bust" | "full", variant: { height?: number; headScale?: number; build?: string } = {}): Pt[] | null {
  const tip = pose.tip ?? 0;
  if (Math.abs(tip) <= 0.01) return null;
  const full = body === "full";
  const ground = 896, boxGround = full ? 896 : 600;
  const fit = full ? 1 : (600 - 46) / (896 - 46);
  const height = clamp(variant.height ?? 1, 0.6, 1.3);
  const headScale = clamp(variant.headScale ?? 1, 0.8, 1.4);
  const buildW = BUILD_W[variant.build ?? "average"] ?? 1;
  const rad = (tip * Math.PI) / 180, LEN = ground - 46, HALF_W = 122, rise = pose.rise ?? 0;
  const tipDx = -(LEN / 2) * Math.sin(rad), tipDy = -HALF_W * Math.abs(Math.sin(rad)) - rise;
  const flat = Math.abs(Math.sin(rad));

  // Everyman: <g translate(200 boxGround) scale(fit) translate(-200 -ground)> → <g height about the floor>
  const fitM: M = full ? I : mul(T(200, boxGround), mul(S(fit), T(-200, -ground)));
  const outer = mul(fitM, about(S(height), 200, ground));
  const tipM = mul(T(tipDx, tipDy), R(tip, 200, ground));
  const leanM = mul(T(0, pose.hipY ?? 0), R(pose.lean ?? 0, 200, HIP_Y));
  const bodyM = mul(outer, mul(tipM, mul(leanM, about(S(buildW, 1), 200, 0))));
  const headM = mul(outer, mul(tipM, mul(leanM, mul(T(pose.headX ?? 0, pose.headY ?? 0), about(S(headScale), 200, 262)))));

  const pts: Pt[] = [];
  const add = (m: M, list: Pt[]) => list.forEach((p) => pts.push(ap(m, p)));
  // head + ears + hair volume (hair/bun reach ~18 past the skin ellipse)
  add(headM, ring(200, 150, 110, 122));
  // torso garment
  add(bodyM, [{ x: 60, y: 600 }, { x: 92, y: 320 }, { x: 308, y: 320 }, { x: 340, y: 610 }, { x: 78, y: 610 }]);
  // arms: shoulder → elbow → hand (rounded rect width 36, hand r 21)
  for (const [sx, sh, el] of [[96, pose.armL ?? 0, pose.elbowL ?? 0], [304, pose.armR ?? 0, pose.elbowR ?? 0]] as const) {
    const up = mul(bodyM, R(sh, sx, 322));
    add(up, ring(sx, 322, 18, 18, 8));
    add(up, ring(sx, 410, 18, 18, 8));
    add(mul(up, R(el, sx, 410)), ring(sx, 498, 26, 26, 10));
  }
  // legs: hip → knee → foot (thigh width 42, shin 34, foot to toe +42 and 20 deep)
  for (const [side, hx, th, kn] of [[-1, 158, pose.legL ?? 0, pose.kneeL ?? 0], [1, 242, pose.legR ?? 0, pose.kneeR ?? 0]] as const) {
    const thighM = mul(bodyM, R(-th, hx, HIP_Y));
    const kneeY = HIP_Y + THIGH, footY = kneeY + SHIN;
    add(thighM, ring(hx, HIP_Y, 21, 21, 8));
    add(thighM, ring(hx, kneeY, 21, 21, 8));
    add(mul(thighM, R(kn, hx, kneeY)), [{ x: hx - 19 * side, y: footY }, { x: hx + 50 * side, y: footY + 6 }, { x: hx - 19 * side, y: footY + 20 }, { x: hx + 46 * side, y: footY + 20 }]);
  }
  // contact shadow (drawn in the height group, not tipped)
  const mid = ap(tipM, { x: 200, y: ground - LEN / 2 });
  add(outer, ring(mid.x, ground + 6, (LEN / 2) * flat + 70, 18, 12));
  return pts;
}

export type Staging = { x: number; y: number; scale: number; flip: boolean; silhouette: boolean };

/** Screen bbox of box-space points staged at (x, y, scale, flip) — the CharacterLayer transform. */
export function stagedBox(pts: Pt[], st: { x: number; y: number; scale: number; flip?: boolean }, body: "bust" | "full") {
  const cy = body === "full" ? 450 : 300;
  const xs = pts.map((p) => st.x + (st.flip ? -1 : 1) * (p.x - 200) * st.scale);
  const ys = pts.map((p) => st.y + (p.y - cy) * st.scale);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * Re-stage a COLLAPSED figure so its whole outline is inside the safe area for its body plan.
 * Any other action is returned unchanged (same object).
 */
export function fitGroundedFigure<St extends Staging>(st: St, action: string | undefined, poses: Pose | Pose[], body: "bust" | "full", variant: { height?: number; headScale?: number; build?: string } = {}): St {
  if (action !== "collapsed") return st;
  // one staging for the whole beat (no drift while it plays): the union of the
  // outlines it passes through — pass the first and the settled pose
  const pts = (Array.isArray(poses) ? poses : [poses]).flatMap((p) => tippedOutline(p, body, variant) || []);
  if (!pts.length) return st;
  const A = body === "full" ? FIGURE_SAFE : FIGURE_SAFE_BUST;
  let b = stagedBox(pts, st, body);
  let scale = st.scale;
  const k = Math.min(1, (A.x1 - A.x0) / (b.x1 - b.x0), (A.y1 - A.y0) / (b.y1 - b.y0));
  if (k < 1) {
    scale = st.scale * k;
    b = stagedBox(pts, { ...st, scale }, body);
  }
  let dx = 0, dy = 0;
  if (b.x0 < A.x0) dx = A.x0 - b.x0; else if (b.x1 > A.x1) dx = A.x1 - b.x1;
  if (b.y0 < A.y0) dy = A.y0 - b.y0; else if (b.y1 > A.y1) dy = A.y1 - b.y1;
  if (!dx && !dy && scale === st.scale) return st;
  return { ...st, x: st.x + dx, y: st.y + dy, scale };
}

// ── A HELD OBJECT stays clear of the burned-in captions (2026-10-20) ────────────────────────────────────────
// MEASURED (15-secrets 75, sandbox): a phone held at the chest by a centre-frame bust figure sat inside the caption
// box — the reader saw "a worried woman", not "a woman holding her phone". CaptionLayer: bottom 64, max width 1480
// centred (x 220..1700), two lines ≈ 150px → the band below y 866 (= FIGURE_SAFE_BUST.y1). The fix keeps the
// staging and lifts the HAND: the hold pose is blended toward RAISED_HOLD (forearm folded up, the object held up in
// front at shoulder height — looking at it) by the smallest amount that clears the band. Same geometry as Everyman.
export const CAPTION_BAND = { x0: 220, x1: 1700, y0: FIGURE_SAFE_BUST.y1 } as const;
export const RAISED_HOLD = { armR: -112, elbowR: 165 } as const;
const PROP_HALF = 62 * 0.82; // HeldProp glyph ±62, drawn at 0.82 (Everyman)

/** The held object's box (box coordinates) for an UPRIGHT figure in `pose` — Everyman's hand chain. */
export function heldPropBox(pose: Pose, body: "bust" | "full", variant: { height?: number; build?: string } = {}): Pt[] {
  const full = body === "full";
  const ground = full ? 896 : 600;
  const height = clamp(variant.height ?? 1, 0.6, 1.3);
  const buildW = BUILD_W[variant.build ?? "average"] ?? 1;
  const outer = about(S(height), 200, ground);
  const leanM = mul(T(0, pose.hipY ?? 0), R(pose.lean ?? 0, 200, full ? HIP_Y : 560));
  const bodyM = mul(outer, mul(leanM, about(S(buildW, 1), 200, 0)));
  const hand = ap(mul(bodyM, mul(R(pose.armR ?? 0, 304, 322), R(pose.elbowR ?? 0, 304, 410))), { x: 304, y: 462 });
  const h = PROP_HALF * height;
  return [{ x: hand.x - h, y: hand.y - h }, { x: hand.x + h, y: hand.y + h }];
}

/** Blend a hold pose toward RAISED_HOLD by k (0 = unchanged). The eyes follow the object up. */
export function liftHold(pose: Pose, k: number): Pose {
  if (!(k > 0)) return pose;
  const l = (a: number, b: number) => a + (b - a) * k;
  return { ...pose, armR: l(pose.armR, RAISED_HOLD.armR), elbowR: l(pose.elbowR ?? 0, RAISED_HOLD.elbowR), gazeY: l(pose.gazeY ?? 0, -0.05), gazeX: l(pose.gazeX ?? 0, 0.45) };
}

// clear by a margin, not by a pixel: the object must READ above the box (sandbox 15-secrets 75: 3px of clearance
// still looked tucked into the captions)
export const CAPTION_MARGIN = 30;
const overlapsBand = (b: { x0: number; x1: number; y1: number }) => b.y1 > CAPTION_BAND.y0 - CAPTION_MARGIN && b.x1 > CAPTION_BAND.x0 && b.x0 < CAPTION_BAND.x1;

/**
 * How far (0..1) a staged figure must lift its SETTLED hold so the held object's box is clear of the caption band.
 * 0 = already clear (the old drawing, unchanged). The smallest k in 0.05 steps that clears; 1 when even the fully
 * raised hold cannot (best effort — reported by the test). Pure; one value per scene (no drift while it plays).
 */
export function holdLift(st: { x: number; y: number; scale: number; flip?: boolean }, settledHold: Pose, body: "bust" | "full", variant: { height?: number; build?: string } = {}): number {
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const b = stagedBox(heldPropBox(liftHold(settledHold, k), body, variant), st, body);
    if (!overlapsBand(b)) return Math.round(k * 100) / 100;
  }
  return 1;
}
