import { interpolate, spring, Easing } from "remotion";
import type { EnterAnim, CharAction } from "./schema";

/**
 * movements.ts — the reusable motion vocabulary of the Antidote engine.
 *
 * Everything is a pure function of the LOCAL frame (frames since the element
 * appeared) so it composes cleanly inside Sequences. Built on Remotion's
 * useCurrentFrame → interpolate/spring model. No per-video code lives here.
 */

export type Transform = { opacity: number; tx: number; ty: number; scale: number; rotate: number };
export const IDENTITY: Transform = { opacity: 1, tx: 0, ty: 0, scale: 1, rotate: 0 };

const sp = (frame: number, fps: number, cfg?: Parameters<typeof spring>[0]["config"], delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.7, stiffness: 120, ...cfg } });

// ── ENTER animations (fadeIn / slideIn / pop / …) ───────────────────────────
export function enter(anim: EnterAnim, frame: number, fps: number, delay = 0): Transform {
  const p = sp(frame, fps, undefined, delay); // 0→1 settle
  const f = Math.max(0, frame - delay);
  switch (anim) {
    case "fade":
      return { ...IDENTITY, opacity: interpolate(f, [0, 12], [0, 1], { extrapolateRight: "clamp" }) };
    case "left":
      return { ...IDENTITY, opacity: Math.min(1, p * 1.4), tx: interpolate(p, [0, 1], [-420, 0]) };
    case "right":
      return { ...IDENTITY, opacity: Math.min(1, p * 1.4), tx: interpolate(p, [0, 1], [420, 0]) };
    case "up":
      return { ...IDENTITY, opacity: Math.min(1, p * 1.4), ty: interpolate(p, [0, 1], [320, 0]) };
    case "down":
      return { ...IDENTITY, opacity: Math.min(1, p * 1.4), ty: interpolate(p, [0, 1], [-320, 0]) };
    case "pop": {
      const s = sp(frame, fps, { damping: 9, mass: 0.6, stiffness: 200 }, delay);
      return { ...IDENTITY, opacity: interpolate(f, [0, 6], [0, 1], { extrapolateRight: "clamp" }), scale: interpolate(s, [0, 1], [0.3, 1]) };
    }
    case "none":
    default:
      return IDENTITY;
  }
}

// gentle idle bob — every character breathes so nothing looks frozen
export const bob = (frame: number, amp = 6, period = 90) => Math.sin((frame / period) * Math.PI * 2) * amp;

// ── AMBIENT — the "nothing on screen is ever frozen" rule ───────────────────
/**
 * ambient(seed, frame) — a slow, endless, deterministic float applied to props
 * and backdrop layers.
 *
 * The rigs already breathe (bob/blink/gaze), but every MOTIF sat perfectly
 * still once its draw-in finished, which is what made a 7-15s scene read as a
 * slide with a person pasted on it. Kurzgesagt's real trick is not fast cuts —
 * it is that no element is ever static. This is that, for ~0 CPU: two sines
 * and a cosine per element, desynced by `seed` so nothing pulses in lockstep.
 *
 * Periods are mutually prime-ish (211/173/307 frames ≈ 7/5.8/10s at 30fps) so
 * the combined motion never visibly loops inside a scene.
 */
export function ambient(seed: number, frame: number, amp = 1): { ty: number; tx: number; rotate: number; scale: number } {
  const p = seed * Math.PI * 2; // phase offset — element `seed` is its index/id hash
  return {
    ty: Math.sin((frame / 211) * Math.PI * 2 + p) * 9 * amp,
    tx: Math.cos((frame / 307) * Math.PI * 2 + p * 1.7) * 5 * amp,
    rotate: Math.sin((frame / 173) * Math.PI * 2 + p * 0.6) * 0.9 * amp,
    scale: 1 + Math.sin((frame / 251) * Math.PI * 2 + p * 1.3) * 0.012 * amp,
  };
}

/**
 * arcOf — the metaphor's one-shot movement across a scene.
 *
 * `ambient()` keeps a motif alive; this makes it MEAN something. The curve runs
 * once over the scene's own length (eased, so it is a movement rather than a
 * slide) and composes multiplicatively with the ambient float.
 *
 * `local` is frames since the motif appeared; `span` is how long it has.
 */
export function arcOf(
  arc: "none" | "grow" | "shrink" | "rise" | "fall" | "closein" | "tilt" | undefined,
  local: number,
  span: number,
): { ty: number; scale: number; rotate: number; opacity: number } {
  const rest = { ty: 0, scale: 1, rotate: 0, opacity: 1 };
  if (!arc || arc === "none" || span <= 1) return rest;
  const t = interpolate(local, [0, span], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  switch (arc) {
    // the thing the beat is about becomes bigger than the person
    case "grow": return { ...rest, scale: 1 + t * 0.34 };
    // ...or drains away to nothing
    case "shrink": return { ...rest, scale: 1 - t * 0.3, opacity: 1 - t * 0.25 };
    case "rise": return { ...rest, ty: -t * 130, opacity: 0.75 + t * 0.25 };
    case "fall": return { ...rest, ty: t * 130, opacity: 1 - t * 0.2 };
    // the walls come in: bigger AND lower, so it crowds the frame
    case "closein": return { ...rest, scale: 1 + t * 0.42, ty: t * 46 };
    case "tilt": return { ...rest, rotate: t * 9 };
    default: return rest;
  }
}

// ── CHARACTER RIG poses — return part transforms the rig applies ─────────────
export type Pose = {
  lean: number; // torso rotate deg
  armL: number; // left arm rotate deg (0 = down at side)
  armR: number;
  mouth: number; // 0 closed → 1 open
  browY: number; // eyebrow offset px (expression accent)
  headY: number; // head bob px
  blink: number; // 0 open → 1 shut (quick close-open every ~3s)
  gazeX: number; // -1 far left → 0 center → +1 far right (pupil offset)
  gazeY?: number; // -1 looking up → 0 center → +1 looking down (pupil vertical offset)
  // ── LOOK-AT (4.0) — head orientation toward a target. Both optional and
  //    no-op by default (headX 0, headYaw 1), so every existing pose is
  //    unchanged; Scene sets them when a character has a `lookAt`. ──────────
  headX?: number; // head horizontal shift px (turn toward the look target)
  headYaw?: number; // head horizontal scale (¾-turn illusion); 1 = dead front
  // ── lower body (Antidote 3.0) — only read by the `full` rig, so every pose
  //    literal written for the waist-up rig still type-checks. ──────────────
  elbowL?: number; // left forearm rotate deg, relative to the upper arm
  elbowR?: number; // right forearm rotate deg (+ swings the hand toward center)
  legL?: number; // left thigh rotate deg, + swings toward screen-left
  legR?: number; // right thigh rotate deg, + swings toward screen-right
  kneeL?: number; // left shin rotate deg relative to the thigh (+ = heel back)
  kneeR?: number;
  hipY?: number; // whole-body vertical offset px (walk bounce, sitting drop)
  sit?: number; // 0 standing → 1 seated (thighs forward, shins down)
  // ── whole-body situations (2026-09-28) — all optional, all no-ops at 0 ──────
  tip?: number; // whole figure rotated about its feet, deg; -90 = lying flat, head screen-left
  rise?: number; // px the tipped body sits above the floor (a mattress, or airborne mid-fall)
  bed?: number; // 0..1 — the rig draws its own low bed + pillow under a lying body
  streaks?: number; // 0..1 — motion streaks above a falling body
  strain?: number; // 0..1 — effort marks beside the head (struggling)
  impact?: number; // 0..1 — burst at the right fist (a punch landing)
  // ── authored actions with a moment (2026-10-20) — undefined for every other action ──
  take?: number; // `take`: 0 = the held object still rests where the hand reaches, 1 = it is in the hand
  bring?: number; // `take` after the cue: 0..1 progress of bringing the object in (the caption lift follows it)
  front?: number; // `drink` (10x P2): 1 = the hand is at the mouth — the rig draws the arm + object IN FRONT of the face
  propTilt?: number; // `drink`: the held object tipped toward the lips (deg, on top of the upright counter-rotation)
  released?: number; // C19 `throw`: 0 = in the hand, 1 = it has left the hand (the rig stops drawing it; Scene flies it)
  carried?: number; // C19 `chop`: 1 = the held object turns WITH the forearm (an axe), not kept upright like a cup
  contact?: number; // `embrace`: 0..1 — how far the lead has closed the gap (1 = bodies touch)
  // `lift` / `lifted` (2026-10-26): 0..1 progress of carrying the lifted person to the destination (Scene moves both
  // bodies by it), and 0..1 progress of setting her down in it (the destination's front edge covers her from then on)
  carry?: number;
  placed?: number;
  /** `place` 2.0 (cycle 6): 1 = the rig draws a table beside the reaching hand; the object rests ON it once let go */
  table?: number;
  /** C19 `sign` (2026-11-10): a paper lies on the table (1) and the signature on it is written out 0 → 1 from the cue */
  paper?: number;
  signed?: number;
  /** `lift` release (10x P1): 0..1 the lifter steps back from her grip to stand BESIDE the destination */
  back?: number;
  /** seated but HELD (in someone's arms, then in the destination): the rig draws no stool under her */
  noStool?: boolean;
  /** `leave` / `flee` (Action 2.0, leaveLayout.ts): 0..1 progress along the path to the exit (Scene moves the body) */
  exit?: number;
  /** `leave` / `flee`: 0..1 the body goes into the exit (fades as it passes through the door / off the frame) */
  gone?: number;
  /** `leave` / `flee`: 1 from the turn on — the body faces the way it goes */
  turned?: number;
};
/** LIFT phases on the pose clock, relative to the author's cue (the lifting word): the lifter closes the gap and bends
 *  BEFORE the cue; on the cue the body rises; then the carry; then the setting-down; then the lifter straightens. */
export const LIFT_APPROACH = 18;
export const LIFT_RISE = 20;
export const LIFT_CARRY = 42;
export const LIFT_LOWER = 26; // "gently": she is set down over ~0.9 s, not dropped
export const LIFT_RELEASE = 14;
/** frames from the cue until the lifted person sits in the destination (Scene / continuity read it) */
export const LIFT_DONE = LIFT_RISE + LIFT_CARRY + LIFT_LOWER;

/** The settled `reach` arm: where an authored `take` object rests until the hand closes on it (Everyman). */
export const TAKE_REST_ARM = -118;
export const TAKE_REST_ELBOW = -12;
/** Earliest scene frame for an action cue (the reach / approach needs time). Same value as continuity.ts ACTION_CUE_MIN
 *  (kept import-free so node can load this file; test-authored-actions checks they are equal). */
export const ACTION_CUE_MIN = 24;
/** LEAVE / FLEE (Action 2.0): frames from the cue to the exit — a walk out takes ~2.7 s, a run ~1.4 s */
export const LEAVE_LEN = 80, FLEE_LEN = 42, TURN_LEN = 6;
/** Frames from an authored `take` cue to the object being held at the chest. */
export const TAKE_BRING = 24;
/** C19 sequence actions, in frames around the cue: the axe rises for CHOP_UP before the cue and lands in CHOP_DOWN;
 *  a throw winds up for THROW_WIND before the cue, the object flies THROW_FLY after it; a stop slows in STOP_SLOW */
export const CHOP_UP = 18, CHOP_DOWN = 4, THROW_WIND = 14, THROW_FLY = 22, STOP_SLOW = 14, SIGN_DUR = 24;
/** the forearm angle (armR + elbowR) at the strike: the axe edge is level with the hips, in front of the body */
export const CHOP_STRIKE_ARM = -70;
/** PLACE (Action 3.0): the held object goes out to the rest position (PLACE_OUT), is let go, the empty hand stays a
 *  moment (PLACE_HOLD) and comes back (PLACE_BACK) — the object stays where it was set down */
export const PLACE_OUT = 22, PLACE_HOLD = 10, PLACE_BACK = 20;
/** PLACE 2.0 (cycle 6): the straight arm angled down-out puts the hand-object anchor (140 px down the arm from the
 *  shoulder at 304,322) at PLACE_REST — the object's base lands on the table top (PLACE_TABLE_TOP) beside the body */
export const PLACE_ARM = -41, PLACE_REST = { x: 397, y: 427 }, PLACE_TABLE_TOP = 470;
/** the table under the placed object (rig units): narrow enough to stay in frame when the placer stands near the edge
 *  (cycle 6 WON: 336-550 ran off the right edge), wide enough to read as a table under the object (centred on PLACE_REST.x) */
export const PLACE_TABLE = { x: 332, w: 130 };
/** a place on a FULL-body figure draws the object this much larger (cycle 6 LTT: the set-down cup read small) */
export const PLACE_FULL_SCALE = 1.3;
// `drink` (10x P2): up to the lips, the sip held, back down to the chest
export const DRINK_UP = 18, DRINK_SIP = 42, DRINK_DOWN = 20;
/** Frames before an `embrace` cue in which the lead closes the gap (contact lands ON the cue). */
export const EMBRACE_APPROACH = 18;
const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - t, 3); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeInOut = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const BASE: Pose = { lean: 0, armL: 8, armR: -8, mouth: 0, browY: 0, headY: 0, blink: 0, gazeX: 0, gazeY: 0, elbowL: 0, elbowR: 0, legL: 0, legR: 0, kneeL: 0, kneeR: 0, hipY: 0, sit: 0 };

/**
 * gait — a front-facing walk cycle.
 *
 * The rig faces the viewer, so a walk cannot be read from a side-on leg swing;
 * it reads from the legs SCISSORING in the picture plane, counter-swinging arms
 * and a two-per-cycle body bounce. Combined with `travel` (the character
 * actually crossing the stage) that is enough to sell walking in flat vector —
 * which is how the reference channel does it too.
 *
 * `speed` is cycles per second; 1.15 is an unhurried walk at 30fps.
 */
export function gait(frame: number, fps: number, speed = 1.15) {
  const ph = (frame / fps) * speed * Math.PI * 2;
  const swing = Math.sin(ph);
  const lift = (x: number) => Math.max(0, x); // knee only bends on the recovery half
  return {
    legL: swing * 21,
    legR: -swing * 21,
    kneeL: lift(-swing) * 30,
    kneeR: lift(swing) * 30,
    armL: 8 - swing * 17,
    armR: -8 - swing * 17,
    // bounce peaks twice per cycle, at each mid-stride
    hipY: -Math.abs(Math.sin(ph)) * 6,
    lean: swing * 1.4,
  };
}

/**
 * Deterministic blink cycle — a quick shut (4 frames) every ~97 frames (~3.2s
 * at 30fps). Uses a prime period so the pattern never aligns obviously with
 * other periodic motions (bob, sway). Double-blink every 3rd cycle for
 * naturalism.
 */
function blinkAt(frame: number): number {
  const PERIOD = 97;
  const cycle = Math.floor(frame / PERIOD);
  const inCycle = frame % PERIOD;
  // primary blink: frames 0-4
  if (inCycle <= 4) {
    return interpolate(inCycle, [0, 1.5, 2.5, 4], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  }
  // double-blink on every 3rd cycle: a second blink 10 frames after the first
  if (cycle % 3 === 0 && inCycle >= 10 && inCycle <= 13) {
    return interpolate(inCycle, [10, 11, 12, 13], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  }
  return 0;
}

/**
 * pose(action, frame, fps, cue) — `cue` is the authored action moment on the SAME clock as `frame` (only `take`
 * and `embrace` read it). Every value is a pure function of (frame, cue): a frame rendered on its own, on any
 * worker, draws the same body as inside the clip.
 */
export function pose(action: CharAction, frame: number, fps: number, cue = ACTION_CUE_MIN, role: "lead" | "partner" = "lead"): Pose {
  const t = frame / fps;
  const blink = blinkAt(frame);
  switch (action) {
    case "leave":
    case "flee": {
      // Action 2.0 (2026-10-28): GOING AWAY. Before the cue: standing. On the cue: the turn (the body faces its exit),
      // then the path — a walk (leave) or a run (flee: double cadence, wider stride, forward lean, arms pumping, motion
      // streaks) — and the body goes INTO the exit (door / frame edge) and is gone: endState "gone" keeps it gone on a
      // continued beat. Scene moves the body along leaveLayout's path by `exit`. Blind: a `walk` in place next to the
      // partner read as "standing beside him" (the-second-mountain 185, long-way-down 190, unhinged 95).
      const run = action === "flee";
      if (frame < cue) return { ...BASE, blink, gazeX: 0, gazeY: 0, exit: 0, gone: 0, turned: 0 };
      const LEN = run ? FLEE_LEN : LEAVE_LEN;
      const k = (frame - cue) / LEN;
      const g = gait(frame - cue, fps, run ? 2.4 : 1.3);
      const amp = run ? 1.45 : 1.05;
      const ph = ((frame - cue) / fps) * (run ? 2.4 : 1.3) * Math.PI * 2;
      return {
        ...BASE,
        legL: g.legL * amp, legR: g.legR * amp, kneeL: g.kneeL * (run ? 1.7 : 1), kneeR: g.kneeR * (run ? 1.7 : 1),
        armL: run ? 10 - Math.sin(ph) * 38 : g.armL, armR: run ? -10 - Math.sin(ph) * 38 : g.armR,
        elbowL: run ? 55 : 0, elbowR: run ? -55 : 0,
        hipY: g.hipY * (run ? 1.8 : 1),
        lean: (run ? 9 : 2) + g.lean,
        headY: g.hipY * 0.35,
        mouth: run ? 0.35 : 0,
        blink, gazeX: 0.85, gazeY: 0,
        streaks: run ? 0.55 : 0,
        exit: Math.max(0, Math.min(1, k)),
        gone: Math.max(0, Math.min(1, (k - 0.84) / 0.16)),
        turned: Math.max(0, Math.min(1, (frame - cue) / TURN_LEN)),
      };
    }
    case "take": {
      // START: reach for the object resting at arm's length. MOMENT (cue): the hand closes on it.
      // RESULT: forearm brings it to the chest — the `hold` pose, object in hand, kept.
      const reach = pose("reach", frame, fps);
      if (frame < cue) return { ...reach, take: 0 };
      const at = pose("reach", cue, fps);
      const k = easeInOut((frame - cue) / TAKE_BRING); // the hand closes, then the arm brings it in
      return {
        ...BASE,
        armR: lerp(at.armR, -6, k), elbowR: lerp(at.elbowR ?? 0, 82, k),
        armL: lerp(at.armL, 12, k), lean: lerp(at.lean, -2, k),
        legL: lerp(at.legL ?? 0, 0, k), legR: lerp(at.legR ?? 0, 0, k),
        headY: lerp(at.headY, bob(frame, 2, 140), k), blink,
        gazeX: lerp(at.gazeX, 0.3, k), gazeY: lerp(at.gazeY ?? 0, 0.35, k),
        take: 1, bring: k,
      };
    }
    case "place": {
      // Action 3.0 (2026-10-28): SETTING SOMETHING DOWN — take in reverse. START: the object in hand at the chest
      // (take's end pose). MOMENT (cue): the arm carries it out to the rest position and lets go (take -> 0: the rig
      // draws it resting there). RESULT: the empty hand comes back; the object STAYS (a continued beat repeating the
      // place keeps it settled). Blind: "sets it down", "put the tool down", "crumpled on the floor" read as a person
      // holding / standing next to it (lightning-thief 71 WRONG, don't-believe 79 NONE, wonder 220 WRONG).
      // PLACE 2.0 (cycle 6): v1 reused the take rest (arm raised toward the partner, object on a thin stand at arm
      // height) — blind: "holds a cup out to him", the object floated. Now: a TABLE stands beside the placer from the
      // first frame (pose.table), the straight arm goes DOWN-OUT onto it, the object is let go ON the table and stays;
      // Scene turns the placer so this arm points away from the partner.
      const at = { armR: PLACE_ARM, elbowR: 0, armL: 8, lean: 0, headY: 4, gazeX: 0.7, gazeY: 0.7 };
      const held = { ...BASE, armR: -6, elbowR: 82, armL: 12, lean: -2, headY: bob(frame, 2, 140), blink, gazeX: 0.3, gazeY: 0.35 };
      if (frame < cue) return { ...held, take: 1, bring: 1, table: 1 };
      const out = easeInOut((frame - cue) / PLACE_OUT);
      const back = easeInOut((frame - cue - PLACE_OUT - PLACE_HOLD) / PLACE_BACK);
      const ext = out * (1 - back); // 0 at the chest / back at the side, 1 at full reach
      const armTo = (from: number, reachTo: number, side: number) => (back > 0 ? lerp(reachTo, side, back) : lerp(from, reachTo, out));
      return {
        ...BASE,
        armR: armTo(-6, at.armR, -8), elbowR: armTo(82, at.elbowR, 0),
        armL: armTo(12, at.armL, 8), lean: armTo(-2, at.lean, 0),
        headY: lerp(held.headY, at.headY, ext), blink,
        gazeX: lerp(0.3, at.gazeX, out), gazeY: lerp(0.35, at.gazeY, out),
        take: out < 1 ? 1 : 0, bring: 1 - out, table: 1,
      };
    }
    case "sign": {
      // C19 (2026-11-10, Unwind: "as you press down and sign your name"): SIGNING A FORM. The table and a paper on it
      // are there from the first frame, the pen already in the hand over the paper (place's reach, held). ON the cue the
      // hand scribbles (a small quick shake of the forearm) and the signature is written out on the paper; it STAYS.
      const reach = { ...BASE, armR: PLACE_ARM + 6, elbowR: -10, armL: 10, lean: 4, headY: 6, blink, gazeX: 0.7, gazeY: 0.85 };
      const w = Math.max(0, Math.min(1, (frame - cue) / SIGN_DUR));
      const shake = w > 0 && w < 1 ? Math.sin((frame - cue) * 1.6) * 4 : 0;
      return { ...reach, elbowR: reach.elbowR + shake, take: 1, table: 1, paper: 1, signed: w };
    }
    case "lift": {
      // THE LIFTER (cast[0]). Before the cue: steps in (Scene: approach x contact) and bends, arms reaching low and
      // forward under the other body. Cue: straightens with the weight, arms locked under it. Carry: walks (gait legs)
      // while Scene moves both bodies to the destination. Lower: bends to set her down. Release: stands, arms down.
      const a = ease((frame - (cue - LIFT_APPROACH)) / LIFT_APPROACH);
      const r = easeInOut((frame - cue) / LIFT_RISE); // in-out: no jump off the floor (test-authored-lift: < 30 px/frame)
      const c = easeInOut((frame - cue - LIFT_RISE) / LIFT_CARRY);
      const l = easeInOut((frame - cue - LIFT_RISE - LIFT_CARRY) / LIFT_LOWER);
      const rel = ease((frame - cue - LIFT_DONE) / LIFT_RELEASE);
      const walking = c > 0 && c < 1;
      const g = walking ? gait(frame, fps, 1.4) : null;
      const bend = Math.max(a * (1 - r), l * (1 - rel)); // bent to pick up, and again to set down
      const holding = Math.min(a, 1 - rel);              // arms under the body from the approach until the release
      return {
        ...BASE,
        ...(g ? { legL: g.legL, legR: g.legR, kneeL: g.kneeL, kneeR: g.kneeR } : {}),
        lean: lerp(lerp(0, 20, bend), -5, r * (1 - l) * (1 - rel)),
        hipY: lerp(0, 46, bend) + (g ? g.hipY : 0),
        sit: lerp(0, 0.3, bend),
        armR: lerp(-8, lerp(-74, -98, r), holding), elbowR: lerp(0, lerp(14, 52, r), holding),
        armL: lerp(8, lerp(-62, -92, r), holding), elbowL: lerp(0, lerp(-8, 46, r), holding),
        headY: lerp(0, 8, bend), mouth: 0, blink,
        gazeX: 0.7, gazeY: lerp(0.1, 0.35, bend),
        contact: a, carry: c, placed: l, back: rel,
      };
    }
    case "lifted": {
      // THE LIFTED PERSON (cast[1]). Before the cue: stands, turned to the lifter. Cue: rises off the floor into a
      // seated cradle, leaning back, an arm around the lifter. Carry: held. Lower: settles DOWN into the destination,
      // seated, arms in the lap — and stays there (the destination's front edge is drawn over her: Scene).
      const r = easeInOut((frame - cue) / LIFT_RISE); // in-out: no jump off the floor (test-authored-lift: < 30 px/frame)
      const c = easeInOut((frame - cue - LIFT_RISE) / LIFT_CARRY);
      const l = easeInOut((frame - cue - LIFT_RISE - LIFT_CARRY) / LIFT_LOWER);
      const up = r * (1 - l);
      return {
        ...BASE,
        sit: r, noStool: true, // held in the arms, then in the tub — never on a stool (v1: the stool read as a ladder)
        // seated-in-the-air while held; set down into the destination (feet stay above its base: v1 at 175 showed them below)
        hipY: lerp(lerp(0, -150, r), 95, l),
        lean: lerp(0, -16, up),
        armR: lerp(-8, -112, up), elbowR: lerp(0, 58, up),
        armL: lerp(8, 24, r), elbowL: lerp(0, 30, l),
        headY: lerp(0, -4, up), mouth: 0, blink,
        gazeX: 0.65 * (1 - l), gazeY: lerp(0, 0.25, l),
        carry: c, placed: l,
      };
    }
    case "embrace": {
      // START: the LEAD (who does it) reaches out and closes the gap; the PARTNER (to whom) stands and receives.
      // MOMENT (cue): contact. RESULT: held, kept. Actor and target must read apart (2026-10-20, blind check: the
      // reader credited whoever's arm was in front): the lead's arms rise early and wrap HIGH over the partner's
      // shoulders and the lead is drawn in front (Scene); the partner's arms stay low, open only to receive, and
      // close LOW at the waist, behind the lead.
      const contact = ease((frame - (cue - EMBRACE_APPROACH)) / EMBRACE_APPROACH);
      const wrap = ease((frame - cue) / 10);
      if (role === "partner") {
        const ready = ease((frame - (cue - EMBRACE_APPROACH)) / EMBRACE_APPROACH); // arms open as she arrives, not before
        return {
          ...BASE,
          armR: lerp(lerp(-8, -30, ready), -72, wrap), elbowR: lerp(lerp(0, 12, ready), 70, wrap),
          armL: lerp(8, 14, ready), elbowL: 0,
          lean: lerp(0, -3, wrap), headY: lerp(0, 4, wrap), headX: lerp(0, 6, wrap),
          mouth: 0, blink, gazeX: 0.7, gazeY: lerp(0, 0.15, wrap),
          contact,
        };
      }
      const reachOut = ease(frame / 14);
      return {
        ...BASE,
        armR: lerp(lerp(-8, -92, reachOut), -128, wrap), elbowR: lerp(lerp(0, -6, reachOut), 96, wrap),
        armL: lerp(lerp(8, -36, reachOut), -58, wrap), elbowL: lerp(0, -40, wrap),
        lean: lerp(lerp(0, 8, reachOut), 13, wrap),
        headY: lerp(0, 6, wrap), headX: lerp(0, 12, wrap),
        legL: lerp(0, -10, contact), legR: lerp(0, 12, contact),
        mouth: 0, blink, gazeX: lerp(0.8, 0.45, wrap), gazeY: lerp(0, 0.2, wrap),
        contact,
      };
    }
    case "talk": {
      // mouth flaps on a fast noisy cadence; tiny head bob
      const m = (Math.sin(frame * 0.8) * 0.5 + 0.5) * (Math.sin(frame * 0.37) * 0.4 + 0.6);
      // talkers look slightly off-center, drifting naturally
      const gazeX = Math.sin(frame * 0.03) * 0.35;
      // hands gesture while talking — rigid arms are what made every presenter
      // beat read as a cardboard cut-out with a flapping mouth
      const g = Math.sin(frame * 0.11);
      return { ...BASE, mouth: m, headY: Math.sin(frame * 0.2) * 2, blink, gazeX, armR: -12 + g * 5, elbowR: 26 + g * 16, elbowL: -14 - g * 9 };
    }
    case "offer": {
      // 10x P1 (2026-10-27): the hand — with whatever it `holds` — held OUT to someone's face, a little below the
      // shoulder (a person seated / in bed): "holds the cigarette to her lips", "gives him a sip". Leans in, looks down
      // at them. Gentle settle (no overshoot): an offering, not a jab.
      const p = spring({ frame, fps, config: { damping: 18, stiffness: 110 } });
      return { ...BASE, armR: interpolate(p, [0, 1], [-8, -94]), elbowR: interpolate(p, [0, 1], [0, 12]), lean: interpolate(p, [0, 1], [0, 10]), headY: 3, blink, gazeX: 0.7, gazeY: 0.35 };
    }
    case "point": {
      const p = spring({ frame, fps, config: { damping: 10, stiffness: 160 } });
      // gaze follows the pointing arm (right arm → look right)
      const gazeX = interpolate(p, [0, 1], [0, 0.7]);
      return { ...BASE, armR: interpolate(p, [0, 1], [-8, -105]), lean: interpolate(p, [0, 1], [0, 6]), blink, gazeX };
    }
    case "celebrate": {
      const up = spring({ frame, fps, config: { damping: 8, stiffness: 180 } });
      const j = Math.abs(Math.sin(t * 6)) * 10;
      return { ...BASE, armL: interpolate(up, [0, 1], [8, 150]), armR: interpolate(up, [0, 1], [-8, -150]), headY: -j, mouth: 0.5, blink, gazeX: 0 };
    }
    case "slump": {
      const d = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
      // slumped characters look down-left (withdrawn)
      return { ...BASE, lean: interpolate(d, [0, 1], [0, 10]), headY: interpolate(d, [0, 1], [0, 12]), armL: 4, armR: -4, browY: 3, blink, gazeX: -0.4, gazeY: 0.5 };
    }
    case "think": {
      // thinkers look up and to the left slowly
      const gazeX = -0.3 + Math.sin(frame * 0.02) * 0.2;
      return { ...BASE, armR: -70, lean: 3, headY: Math.sin(frame * 0.05) * 2, blink, gazeX, gazeY: -0.45 };
    }
    // ── C19 sequence actions (2026-11-07) ─────────────────────────────────────────────────────────────────────
    case "run": {
      // the flee gait (double cadence, wide stride, forward lean, pumping arms) WITHOUT the exit: `travel` moves it
      const g = gait(frame, fps, 2.4), ph = (frame / fps) * 2.4 * Math.PI * 2;
      return {
        ...BASE, legL: g.legL * 1.45, legR: g.legR * 1.45, kneeL: g.kneeL * 1.7, kneeR: g.kneeR * 1.7,
        armL: 10 - Math.sin(ph) * 38, armR: -10 - Math.sin(ph) * 38, elbowL: 55, elbowR: -55,
        hipY: g.hipY * 1.8, lean: 9 + g.lean, headY: g.hipY * 0.35, mouth: 0.25, blink, gazeX: 0.85, gazeY: 0, streaks: 0.3,
      };
    }
    case "stop": {
      // running until the cue word; on it the stride shortens and the body comes upright and stands (kept)
      const r = pose("run", frame, fps);
      if (frame < cue) return r;
      const k = easeInOut((frame - cue) / STOP_SLOW), i = pose("idle", frame, fps);
      const out: Pose = { ...i };
      for (const key of Object.keys(r) as (keyof Pose)[]) { const a = r[key], b = i[key]; if (typeof a === "number") (out as Record<string, number>)[key] = lerp(a, typeof b === "number" ? b : 0, k); }
      return { ...out, blink, streaks: 0 };
    }
    case "chop": {
      // START: the axe at the side. Before the cue it RISES overhead (CHOP_UP); ON the cue it comes down (CHOP_DOWN) and
      // the edge stops on the impact point, in front of the hips (CHOP_STRIKE_ARM); it stays there — the strike is kept.
      // The axe turns with the forearm (`carried`), so the edge travels the arc instead of standing upright.
      const up = easeInOut((frame - (cue - CHOP_UP)) / CHOP_UP), down = Math.max(0, Math.min(1, (frame - cue) / CHOP_DOWN));
      const raised = -175, rest = -20;
      const arm = frame < cue ? lerp(rest, raised, up) : lerp(raised, CHOP_STRIKE_ARM, down);
      return {
        ...BASE, armR: arm, elbowR: 0, armL: frame < cue ? lerp(10, -150, up) : lerp(-150, CHOP_STRIKE_ARM + 20, down), elbowL: 0,
        lean: frame < cue ? lerp(0, -6, up) : lerp(-6, 12, down), legL: -8, legR: 10, kneeL: 6, kneeR: 4,
        hipY: frame < cue ? 0 : 8 * down, browY: 4, blink, gazeX: 0.7, gazeY: 0.5, carried: 1,
        impact: frame >= cue + CHOP_DOWN ? Math.max(0, 1 - (frame - cue - CHOP_DOWN) / 10) : 0,
      };
    }
    case "throw": {
      // START: the object in hand. Wind-up (THROW_WIND before the cue): the arm swings back. ON the cue the arm whips
      // forward and the object LEAVES the hand (released → Scene flies it to `throwTo`); the arm follows through.
      const back = easeInOut((frame - (cue - THROW_WIND)) / THROW_WIND), fwd = easeInOut((frame - cue) / 8);
      const arm = frame < cue ? lerp(-6, 45, back) : lerp(45, -125, fwd);
      return {
        ...BASE, armR: arm, elbowR: frame < cue ? lerp(82, 40, back) : lerp(40, 0, fwd), armL: frame < cue ? -20 : lerp(-20, 15, fwd),
        lean: frame < cue ? lerp(-2, -7, back) : lerp(-7, 10, fwd), legL: -9, legR: 12, blink, gazeX: 0.85, gazeY: -0.1,
        take: 1, bring: 1, released: frame >= cue + 2 ? 1 : 0,
      };
    }
    case "walk": {
      const g = gait(frame, fps);
      return { ...BASE, ...g, mouth: 0, headY: g.hipY * 0.35, blink, gazeX: Math.sin(frame * 0.02) * 0.2, gazeY: 0 };
    }
    case "sit": {
      // settle into the chair rather than snapping into it
      const d = spring({ frame, fps, config: { damping: 15, stiffness: 110 } });
      return {
        ...BASE,
        sit: d,
        // Seat height. Standing hip 596 / floor 876; a chair seat sits ~127
        // above the floor, and this drop is what puts the hips ON it. Tuned
        // together with the thigh foreshortening in Everyman so the feet still
        // land on the same floor line as when standing.
        hipY: d * 109,
        lean: interpolate(d, [0, 1], [0, 4]),
        armL: 26, armR: -26,
        headY: bob(frame, 2, 130),
        blink,
        gazeX: Math.sin(frame * 0.018) * 0.2,
        gazeY: 0,
      };
    }
    case "drink": {
      // 10x P2 (2026-10-28): "he takes a drink" — the object in the hand goes TO THE MOUTH. Before the cue: `hold`
      // (cup at the chest). On the cue the shoulder swings the forearm (its 82° bend kept) up across the chest until
      // the hand is at the lips (rig IK: armR −6 → 104, elbow 82 → 68; the cup drawn AT the hand while there), the cup tips toward the mouth, the head tips back a little,
      // the eyes half close — a sip held ~1.4 s — then the cup comes back down to the chest. Blind: `take`+`hold`
      // read only as "holding a mug" (under-the-dome 52); `offer` holds it out to SOMEONE ELSE's face.
      const held = pose("hold", frame, fps);
      if (frame < cue) return held;
      const t = frame - cue;
      const up = easeInOut(t / DRINK_UP);
      const down = easeInOut((t - DRINK_UP - DRINK_SIP) / DRINK_DOWN);
      const k = t < DRINK_UP + DRINK_SIP ? up : 1 - down;
      const sip = t >= DRINK_UP && t < DRINK_UP + DRINK_SIP + DRINK_DOWN / 2 ? Math.min(1, (t - DRINK_UP) / 6) * k : 0;
      return {
        ...held,
        armR: lerp(-6, 104, k), elbowR: lerp(82, 68, k),
        headY: lerp(held.headY, -6, k), gazeY: lerp(0.35, -0.25, k), gazeX: lerp(0.3, -0.1, k),
        blink: Math.max(blink, 0.7 * sip), mouth: 0,
        front: k > 0.45 ? 1 : 0, propTilt: -38 * sip,
      };
    }
    case "hold": {
      // forearm comes up in front so whatever `holds` names is presented, not
      // dangled at the hip. The hand position is what handprops anchors to.
      const p = spring({ frame, fps, config: { damping: 13, stiffness: 130 } });
      return {
        ...BASE,
        // upper arm stays down, the FOREARM comes across the body: the hand
        // lands in front of the chest (~x 228, y 431 in rig units) instead of
        // swinging out to arm's length, which is where a rigid arm put it.
        armR: interpolate(p, [0, 1], [-8, -6]),
        elbowR: interpolate(p, [0, 1], [0, 82]),
        armL: 12,
        lean: interpolate(p, [0, 1], [0, -2]),
        headY: bob(frame, 2, 140),
        blink,
        gazeX: 0.3,
        gazeY: 0.35,
      };
    }
    case "reach": {
      // the figure extends toward its subject — the beat's motif, usually
      const p = spring({ frame, fps, config: { damping: 11, stiffness: 120 } });
      return {
        ...BASE,
        armR: interpolate(p, [0, 1], [-8, TAKE_REST_ARM]),
        elbowR: interpolate(p, [0, 1], [0, TAKE_REST_ELBOW]),
        lean: interpolate(p, [0, 1], [0, 9]),
        legL: interpolate(p, [0, 1], [0, -7]),
        legR: interpolate(p, [0, 1], [0, 9]),
        headY: 2,
        blink,
        gazeX: 0.75,
        gazeY: -0.15,
      };
    }
    // ── physical situations (2026-09-28). The ground states are STATES, not
    // entrances: a beat about someone lying in bed must read as that from its
    // first frame (and on a sustained take), so they settle only a few degrees.
    // Rig space after tip -90: rig-right (+x) is screen-UP, rig-up is screen-LEFT.
    case "lying": {
      const d = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
      return {
        ...BASE,
        tip: interpolate(d, [0, 1], [-84, -88]), // head raised a touch by the pillow
        rise: 64, bed: 1,
        armL: 6, armR: -6, elbowR: 14,
        blink,
        gazeX: 0.55, // looking at the ceiling (screen-up)
        gazeY: 0,
      };
    }
    case "collapsed": {
      const d = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
      return {
        ...BASE,
        tip: interpolate(d, [0, 1], [-80, -90]),
        rise: 0,
        // one arm flung past the head, one knee bent: a body that FELL, not one laid out
        armR: -176, elbowR: 34, armL: 10,
        legR: 26, kneeR: 58, legL: -4,
        lean: 6,
        headX: -12, // head lolled onto the floor (rig-left = screen-down)
        headY: 4,
        blink: 1, // eyes shut
        mouth: 0.12,
        gazeX: 0,
        gazeY: 0,
      };
    }
    case "falling": {
      const d = spring({ frame, fps, config: { damping: 12, stiffness: 70 } });
      return {
        ...BASE,
        tip: interpolate(d, [0, 1], [-18, -48]),
        rise: interpolate(d, [0, 1], [12, 70]),
        streaks: d,
        // asymmetric flail — both arms straight up is `celebrate`
        armL: 118, elbowL: -36, armR: -168, elbowR: 28,
        legR: 30, kneeR: 44, legL: -10, kneeL: 12,
        mouth: 0.6,
        blink,
        gazeX: -0.3,
        gazeY: -0.6,
      };
    }
    case "fighting": {
      const p = spring({ frame, fps, config: { damping: 11, stiffness: 170 } });
      return {
        ...BASE,
        // right fist punches toward screen-right (the partner); left fist stays up in guard
        // aimed at the face: a fist at shoulder height met the partner's fist (a fist bump)
        armR: interpolate(p, [0, 1], [-40, -106]),
        elbowR: interpolate(p, [0, 1], [-80, 0]),
        armL: 40, elbowL: 158,
        lean: 7,
        legL: -13, legR: 15, kneeL: 8, kneeR: 6,
        hipY: 10,
        impact: interpolate(p, [0.75, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        browY: 4,
        blink,
        gazeX: 0.8,
        gazeY: 0,
      };
    }
    case "struggling": {
      const p = spring({ frame, fps, config: { damping: 13, stiffness: 120 } });
      return {
        ...BASE,
        // pulling AWAY from screen-right: the arm stretched back is the one being held
        lean: interpolate(p, [0, 1], [0, -14]),
        armR: -78, elbowR: -6,
        // the free arm shields the face instead of flaring out (a T-pose read as "startled")
        armL: 150, elbowL: -78,
        legL: 20, legR: 12, kneeL: 6,
        hipY: 12,
        strain: p,
        mouth: 0.35,
        blink,
        gazeX: 0.6,
        gazeY: 0,
      };
    }
    case "grabbing": {
      const p = spring({ frame, fps, config: { damping: 11, stiffness: 150 } });
      return {
        ...BASE,
        // lunge in: arm straight out at shoulder height, weight on the front foot
        armR: interpolate(p, [0, 1], [-8, -84]),
        elbowR: interpolate(p, [0, 1], [0, -6]),
        armL: 22,
        lean: interpolate(p, [0, 1], [0, 12]),
        legL: -16, legR: 12, kneeL: 10,
        hipY: 8,
        mouth: 0.1,
        blink,
        gazeX: 0.85,
        gazeY: 0,
      };
    }
    case "idle":
    default: {
      // idle: slow gentle drift, eyes wander
      const gazeX = Math.sin(frame * 0.015) * 0.25;
      // a standing figure shifts its weight; perfectly symmetrical legs read as a mannequin
      const shift = Math.sin(frame * 0.012);
      return { ...BASE, headY: bob(frame, 3, 120), lean: Math.sin(frame * 0.02) * 1.2, blink, gazeX, legL: shift * 2.2, legR: shift * 1.1, hipY: Math.abs(shift) * 1.4 };
    }
  }
}

// ── CAMERA — viewBox-style zoom/pan over the whole stage ────────────────────
export type CameraSpec = {
  zoom: [number, number];
  panX: [number, number];
  panY: [number, number];
  /** A quick push-in on a beat — usually the frame the kinetic callout lands. */
  punch?: { at: number; amount: number };
  /**
   * Late pulses — frames (relative to the scene start) of extra beats-of-attention
   * on words spoken later in the scene, so a long scene does not hold a frozen
   * frame after its callout has landed. Antidote's equivalent of the Vox `anchors`
   * tail. Optional, so every pre-existing config renders exactly as before.
   */
  pulses?: number[];
};

// A late pulse is a secondary event, so it pushes in less far than the callout
// punch (default 0.06) — enough to register as a change, not enough to compete.
const PULSE_AMOUNT = 0.035;

export function camera(spec: CameraSpec, frame: number, durationFrames: number) {
  const e = interpolate(frame, [0, Math.max(1, durationFrames)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  // The drift: a slow, continuous move across the whole beat.
  let scale = interpolate(e, [0, 1], spec.zoom);
  // The punch: a sharp snap in that settles over ~14 frames. A slow zoom alone
  // is what made every scene feel like the same slide; the punch gives the
  // callout an impact frame.
  if (spec.punch) {
    const d = frame - spec.punch.at;
    if (d >= 0 && d <= 20) {
      const bump = interpolate(d, [0, 3, 20], [0, spec.punch.amount, 0], {
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.quad),
      });
      scale += bump;
    }
  }
  // The late pulses: the same bump shape, smaller, on words spoken later in the
  // scene. `ambient()` keeps the set breathing but never CHANGES anything, so a
  // long scene still read as a frozen frame once its callout had landed. These
  // are deliberately weaker than the callout punch — a pulse says "still moving",
  // the punch says "this is the word".
  for (const at of spec.pulses ?? []) {
    const d = frame - at;
    if (d < 0 || d > 20) continue;
    scale += interpolate(d, [0, 3, 20], [0, PULSE_AMOUNT, 0], {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    });
  }
  return {
    scale,
    x: interpolate(e, [0, 1], spec.panX),
    y: interpolate(e, [0, 1], spec.panY),
  };
}

// ── MULTIPLANE (4.0) — parallax a stage layer against the camera by its depth ─
/**
 * parallax(cam, depth) — how a layer at `depth` should move under the camera.
 *
 * The backdrop already parallaxes its three internal layers (Backdrop.tsx); this
 * extends the same idea to the CAST, MOTIFS and COPY, which until 4.0 all shared
 * one flat plane (Scene.tsx). A near layer (depth > 1) slides and zooms MORE than
 * a far one (depth < 1), so a simple camera pan reveals real 2.5D depth.
 *
 * depth === 1 returns the camera unchanged, so a book without multiplane (every
 * element at depth 1) renders byte-for-byte as it did before.
 */
export function parallax(cam: { x: number; y: number; scale: number }, depth = 1) {
  return {
    tx: cam.x * depth,
    ty: cam.y * depth,
    scale: 1 + (cam.scale - 1) * depth,
  };
}
