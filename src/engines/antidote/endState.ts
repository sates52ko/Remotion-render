/**
 * endState.ts — what a DEED leaves behind, and what may happen on top of it (10x P1, 2026-10-27). Pure, so node,
 * merge (scripts/storyboard.js requires this file) and the renderer read ONE table.
 *
 * A lift sets her down IN the tub; a sit leaves him seated; a fall leaves her down. On an authored `continue` beat
 * (plan-antidote stamps `carryState`) that end state is the starting state of the next beat (continuity.ts): she is
 * still in the tub, he is still seated — a new action composes ON TOP of it (an upper-body action on a seated body,
 * only the face on a body that is down). Nothing here moves anyone by itself: the state comes from the authored deed.
 */
import type { Pose } from "./movements";

export type Posture = "standing" | "seated" | "seatedIn" | "lying" | "down" | "gone";
/** where the body stands: on its shot slot, IN the deed's destination, or BESIDE it */
export type Anchor = "slot" | "inPlace" | "besidePlace";

export type EndState = { posture: Posture; anchor: Anchor; restAction: string };

/** the end state of each deed that leaves one (any other action leaves nothing to carry) */
export const END_STATES: Record<string, EndState> = {
  lifted: { posture: "seatedIn", anchor: "inPlace", restAction: "lifted" },
  lift: { posture: "standing", anchor: "besidePlace", restAction: "idle" },
  sit: { posture: "seated", anchor: "slot", restAction: "sit" },
  lying: { posture: "lying", anchor: "slot", restAction: "lying" },
  collapsed: { posture: "down", anchor: "slot", restAction: "collapsed" },
  falling: { posture: "down", anchor: "slot", restAction: "collapsed" },
  // Action 2.0: whoever walked out / ran away is GONE — a continued beat that still lists them does not draw them
  // (no teleport back to the slot); an authored new action (not idle) means they came back
  leave: { posture: "gone", anchor: "slot", restAction: "idle" },
  flee: { posture: "gone", anchor: "slot", restAction: "idle" },
};

/** actions a seated body can do with its upper body (arms, head, face) — it stays seated */
export const UPPER_BODY = new Set(["idle", "talk", "think", "point", "hold", "reach", "offer", "drink", "take", "slump", "sit", "lifted"]);
/** a body that is lying / down keeps its body: only its face (mouth, eyes) follows the new action */
export const FACE_ONLY = new Set(["idle", "talk", "think"]);
/** shots that can show a person IN a destination with the destination (full body or a framed group) */
export const STATE_SHOTS = new Set(["wide", "lowAngle", "twoShot", "medium"]);

/** does the new action keep the carried rest? (an action that needs the legs ends a seated / lying rest) */
export function keepsRest(posture: Posture, action: string | undefined): boolean {
  const a = action || "idle";
  if (posture === "standing") return true;
  if (posture === "gone") return a === "idle" || a === "leave" || a === "flee";
  if (posture === "seated" || posture === "seatedIn") return UPPER_BODY.has(a);
  return FACE_ONLY.has(a) || a === "lying" || a === "collapsed";
}

/** the end state a figure's action leaves, or null. `lift` / `lifted` only as a pair (the lift's two bodies) */
export function endStateOf(action: string | undefined, pairedLift: boolean): EndState | null {
  if (!action) return null;
  if ((action === "lift" || action === "lifted") && !pairedLift) return null;
  return END_STATES[action] || null;
}

const LOWER = ["sit", "hipY", "legL", "legR", "kneeL", "kneeR", "noStool", "tip", "rise", "bed"] as const;

/**
 * One pose from a carried REST and the beat's own ACTION: a seated body keeps its lower body (seat, hips, legs) and
 * takes arms, head and face from the action; a body that is down keeps everything but its face. Standing: the action.
 */
export function composeRest(rest: Pose, act: Pose, posture: Posture, action: string | undefined): Pose {
  if (posture === "standing") return act;
  if (posture === "lying" || posture === "down") return { ...rest, mouth: act.mouth, blink: act.blink, gazeX: act.gazeX, gazeY: act.gazeY };
  const a = action || "idle";
  if (a === "idle" || a === "lifted" || a === "sit") return rest; // nothing new to do with the arms
  const out = { ...act } as Record<string, unknown>;
  for (const k of LOWER) { const v = (rest as Record<string, unknown>)[k]; if (v === undefined) delete out[k]; else out[k] = v; }
  return out as Pose;
}

/** one line saying what a continued beat carries in (readcheck / rules): "mother: seated IN bathtub · demi: beside it" */
export function stateLine(rests: { who: string; posture: Posture; anchor: Anchor; place?: string }[]): string {
  return rests.map((r) => `${r.who}: ${r.posture === "gone" ? "gone (left)" : r.anchor === "inPlace" ? `seated IN ${r.place || "it"}` : r.anchor === "besidePlace" ? `beside ${r.place || "it"}` : r.posture}`).join(" · ");
}
