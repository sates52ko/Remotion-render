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
};
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

export function pose(action: CharAction, frame: number, fps: number): Pose {
  const t = frame / fps;
  const blink = blinkAt(frame);
  switch (action) {
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
        armR: interpolate(p, [0, 1], [-8, -118]),
        elbowR: interpolate(p, [0, 1], [0, -12]),
        lean: interpolate(p, [0, 1], [0, 9]),
        legL: interpolate(p, [0, 1], [0, -7]),
        legR: interpolate(p, [0, 1], [0, 9]),
        headY: 2,
        blink,
        gazeX: 0.75,
        gazeY: -0.15,
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
