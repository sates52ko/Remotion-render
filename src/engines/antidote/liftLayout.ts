/**
 * liftLayout.ts — where a LIFT happens (10x pilot B, 2026-10-26). Pure, so node can test it.
 *
 * cast[0] `lift` lifts cast[1] `lifted` on the author's cue, carries her to the beat's icon (the destination: a
 * bathtub, a bed, a chair…) and sets her down IN it. The lifter first steps up to her (approach), both then move by
 * `carry` (her slot → the destination); the destination stands on the floor beyond her, in the lifter's facing
 * direction (the carry reads as forward, never a backwards shuffle). Full-body rig: 400×900 box centred on the slot,
 * feet at rig y 876.
 */
export const LIFT_GAP = 230;   // rig px between the two centres when the lifter's arms are under her
export const LIFT_DEST = 520;  // rig px from her slot to the destination's centre
export const RIG_FLOOR = 876, RIG_MID = 450, ICON_BOX = 520;
/** rig px between the centres once she is set down and released: the lifter stands BESIDE her, her arm's length away
 *  (at LIFT_GAP the two bodies overlap — a carried beat could not show her hand reaching her face, 10x P1 v2) */
export const LIFT_BESIDE = 360;

type Stage = { x: number; y: number; scale: number; flip?: boolean };

export function liftLayout(lead: Stage, partner: Stage) {
  const dir = Math.sign(partner.x - lead.x) || 1;
  const approach = partner.x - dir * LIFT_GAP * partner.scale - lead.x;
  const destX = partner.x + dir * LIFT_DEST * partner.scale;
  const floorY = partner.y + (RIG_FLOOR - RIG_MID) * partner.scale;
  const destScale = 1.15 * partner.scale; // big enough to hold a seated adult (v1 at 0.95 read as a toy tub)
  // the icon's own drawing sits low in its 520 box; its base on the floor line
  const destY = floorY - 0.36 * ICON_BOX * destScale;
  // the release: the lifter steps back from the grip (LIFT_GAP) to stand beside her (LIFT_BESIDE) — Scene x pose.back
  const stepBack = -dir * (LIFT_BESIDE - LIFT_GAP) * partner.scale;
  return { dir, approach, carry: destX - partner.x, stepBack, dest: { x: destX, y: destY, scale: destScale }, floorY };
}

/** where the lift LEAVES them (10x P1): the lifter beside the destination, her IN it — the last frame of the deed
 *  (Scene moves the bodies by approach·contact + carry·carry; at the end contact = carry = 1) */
export function liftEnd(lead: Stage, partner: Stage) {
  const L = liftLayout(lead, partner);
  return { lead: { ...lead, x: lead.x + L.approach + L.carry + L.stepBack }, occ: { ...partner, x: partner.x + L.carry }, dest: L.dest, dir: L.dir };
}

export type Group = { lead: Stage; occ: Stage; dest: { x: number; y: number; scale: number } };

/** how much closer each shot frames a kept group than `wide` (a camera move, never a re-staging) */
export const FRAME_K: Record<string, number> = { wide: 1, lowAngle: 1.2, twoShot: 1.45, medium: 1.6 };
export const FLOOR_Y = 925; // the full-body floor line, clear of the caption band (shots.ts charsFull)
export const TOP_SAFE = 260; // below the callout zone
export const SIDE_SAFE = 80;

/** the screen box of a group: full-rig boxes (400 x 900, centred on the stage point) and the destination icon box */
export function groupBox(g: Group) {
  const fig = (s: Stage) => ({ l: s.x - 200 * s.scale, r: s.x + 200 * s.scale, t: s.y - RIG_MID * s.scale });
  const d = { l: g.dest.x - (ICON_BOX / 2) * g.dest.scale, r: g.dest.x + (ICON_BOX / 2) * g.dest.scale, t: g.dest.y - (ICON_BOX / 2) * g.dest.scale };
  const all = [fig(g.lead), fig(g.occ), d];
  return { l: Math.min(...all.map((b) => b.l)), r: Math.max(...all.map((b) => b.r)), t: Math.min(...all.map((b) => b.t)) };
}

/**
 * The kept group framed by another shot: ONE uniform scale about the group's floor centre — who stands where, the gap
 * between them and the size of the destination keep their proportions, flips are untouched: the camera comes closer,
 * nobody moves. k = FRAME_K(new) / FRAME_K(old), reduced until the whole group fits the safe frame.
 */
export function reframeGroup(g: Group, srcShot: string, dstShot: string): Group {
  if (srcShot === dstShot) return g;
  const box = groupBox(g);
  const cx = (box.l + box.r) / 2;
  const floor = g.occ.y + (RIG_FLOOR - RIG_MID) * g.occ.scale; // the floor line the group stands on
  const want = (FRAME_K[dstShot] ?? 1) / (FRAME_K[srcShot] ?? 1);
  const halfW = Math.max(cx - box.l, box.r - cx), up = floor - box.t;
  const k = Math.max(0.5, Math.min(want, (960 - SIDE_SAFE) / Math.max(1, halfW), (FLOOR_Y - TOP_SAFE) / Math.max(1, up)));
  const map = <T extends { x: number; y: number; scale: number }>(s: T): T => ({ ...s, x: 960 + (s.x - cx) * k, y: FLOOR_Y + (s.y - floor) * k, scale: s.scale * k });
  return { lead: map(g.lead), occ: map(g.occ), dest: map(g.dest) };
}

/**
 * One body kept in a full-body state (seated, down) framed by a shot whose own slots are waist-up (medium, twoShot):
 * the same camera move as reframeGroup — the full figure where it was, scaled about its own floor point and centred —
 * so the seat / the floor it lies on stays in frame instead of being cropped to a bust that cannot show it.
 */
export function reframeOne(s: Stage, srcShot: string, dstShot: string): Stage {
  if (srcShot === dstShot) return s;
  const floor = s.y + (RIG_FLOOR - RIG_MID) * s.scale;
  const want = (FRAME_K[dstShot] ?? 1.45) / (FRAME_K[srcShot] ?? 1);
  const k = Math.max(0.5, Math.min(want, (FLOOR_Y - TOP_SAFE) / Math.max(1, floor - (s.y - RIG_MID * s.scale)), (960 - SIDE_SAFE) / Math.max(1, 200 * s.scale)));
  const scale = s.scale * k, half = 200 * scale;
  const x = Math.max(SIDE_SAFE + half, Math.min(1920 - SIDE_SAFE - half, 960 + (s.x - 960) * k));
  return { ...s, x, y: FLOOR_Y + (s.y - floor) * k, scale };
}

/** cast[0] lifts cast[1] (the planner pairs `lift` with `lifted`) */
export const isLift = (bodies: { action?: string }[]): boolean => bodies.length === 2 && bodies[0].action === "lift" && bodies[1].action === "lifted";
