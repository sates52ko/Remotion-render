/**
 * leaveLayout.ts — where a LEAVE / FLEE goes (Character Action 2.0, 2026-10-28). Pure, so node can test it.
 *
 * The commonest failed physical action in the mute corpus (run / escape / walk out: 18 beats, WRONG 6, dead 9) was a
 * `walk` drawn in place: a figure standing beside its partner while the narration says "he walks right past him and goes
 * upstairs", "they step out of the elevator", "she retreats to the library". Nothing went anywhere, nothing was left.
 * A leave has a START (the slot), a MOMENT (the author's cue word: the turn and the first step), a PATH and a RESULT
 * (the person is gone — through the beat's icon, a door, or off the frame — and stays gone on the next beat):
 *   leave  walks to an exit on the FAR side of the partner: past them, leaving them behind (ignoring, walking out on)
 *   flee   runs AWAY from the partner (escaping someone): faster gait, forward lean, motion streaks
 * Without a partner the exit is the farther frame edge. With the beat's icon (a door, a staircase …) the exit IS the
 * icon, drawn on the floor where the path ends; the person goes into it.
 */
export const LEAVE_PAST = 400; // rig px beyond the partner's centre to the exit (clear of the partner's body)
export const RIG_FLOOR = 876, RIG_MID = 450, ICON_BOX = 520;
const FRAME_W = 1920, EDGE_IN = 230, OFF = 300;

type Stage = { x: number; y: number; scale: number; flip?: boolean };

export function leaveLayout(lead: Stage, partner: Stage | null, action: "leave" | "flee", withIcon: boolean, iconX?: number) {
  let dir: number;
  // FLEE with no partner: the beat's icon is the THREAT ("Montag running away" from the Hound), never the exit — the
  // person runs AWAY from it and off the frame (an icon as exit sent him running toward the Hound, f451 235 v0)
  const threat = action === "flee" && !partner && withIcon && typeof iconX === "number";
  if (partner) dir = action === "flee" ? Math.sign(lead.x - partner.x) || -1 : Math.sign(partner.x - lead.x) || 1;
  else if (threat) dir = Math.sign(lead.x - (iconX as number)) || -1;
  else dir = lead.x < FRAME_W / 2 ? 1 : -1;
  if (threat) withIcon = false;
  const floorY = lead.y + (RIG_FLOOR - RIG_MID) * lead.scale;
  let destX: number;
  if (withIcon) {
    // the exit on stage: past the partner (leave) or on the open side (flee / alone), always inside the frame
    const want = partner && action === "leave" ? partner.x + dir * LEAVE_PAST * partner.scale : lead.x + dir * 2 * LEAVE_PAST * lead.scale;
    destX = Math.max(EDGE_IN, Math.min(FRAME_W - EDGE_IN, want));
    if (Math.sign(destX - lead.x) !== dir || Math.abs(destX - lead.x) < 200) destX = dir > 0 ? FRAME_W - EDGE_IN : EDGE_IN;
  } else destX = dir > 0 ? FRAME_W + OFF : -OFF; // off the frame: the body is fully out before the beat ends
  const destScale = 1.9 * lead.scale; // a door a person fits through (at 1.05 it read as a cabinet, the-second-mountain v1)
  return { dir, exitDx: destX - lead.x, dest: { x: destX, y: floorY - 0.36 * ICON_BOX * destScale, scale: destScale }, floorY };
}

/** easing of the path: a step to start, then a steady walk/run (never a slide that starts at full speed) */
export const pathEase = (k: number) => { const t = Math.max(0, Math.min(1, k)); return t < 0.15 ? (t * t) / 0.3 : t - 0.075; };
export const pathOf = (k: number) => pathEase(k) / pathEase(1);
