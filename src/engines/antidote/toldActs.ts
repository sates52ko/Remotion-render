/**
 * toldActs.ts — PEOPLE PLAY THE VERB on a told stage (Film Flow 4 / told v3, 2026-11-17).
 *
 * dracula, the first told book: people stood; the verb was carried by a title and a drawing ("TYPING IN MANIFOLD"
 * over Mina standing BESIDE a typewriter). Its authors had written `action: "typing"`, `"read"`, `"write"` — none of
 * them an action of the rig, so the figure silently stood. Mute test: 4 of 30 frames read WRONG; nobody could say who
 * does what to whom.
 *
 * A told `act` (compiled by scripts/lib/told-compile.js) gives a figure `act: { verb, at }`: `at` is the stage frame of
 * the narrator's WORD. Every verb here is one gesture with a preparation (before `at`), a moment (ON `at`) and a rest
 * it stays in — a pure function of `f = frame − at`, so a figure carried over a cut (at = −9999) is simply at rest.
 * NOTHING LOOPS: a repeated action (typing, digging) is a counted number of strokes that ends.
 *
 * Pure: no React, no remotion, no import — the compiler, the renderer and the tests read the same numbers. The rig
 * faces the viewer; "toward the other" is screen-right here and the stage flips the figure when the other stands left.
 * Angles are the rig's (movements.ts Pose): armR < 0 lifts the right arm out to screen-right, elbowR > 0 brings that
 * hand in front of the body, elbowL < 0 does the same for the left hand, lean > 0 leans to screen-right.
 */

/** the rig's own actions (schema.ts charAction) — what `change` + `action` may name; anything else stood still, silently
 *  (dracula's authors wrote "typing", "read", "write"). test-told-acts.js holds this list to schema.ts. */
export const RIG_ACTIONS = ["idle", "talk", "point", "celebrate", "slump", "think", "walk", "sit", "hold", "reach", "offer", "leave", "flee", "drink", "lying", "collapsed", "falling", "fighting", "struggling", "grabbing", "place", "take", "embrace", "lift", "lifted", "run", "stop", "chop", "throw", "sign"] as const;

// (round 2: `look` and `meet` were verbs. A turned head on a rig that faces the viewer was read by nobody — 0 of 2 in
   // the blind "what is this person doing?" test — so they are no longer offered. The `look` POSE stays: the chaser
   // looks after the one who got away.)
export const TOLD_VERBS = ["hit", "chase", "hide", "bite", "dig", "type", "write", "read", "come", "fall", "point"] as const;
export type ToldVerb = (typeof TOLD_VERBS)[number];
/** what the OTHER person does when the verb is done to them (never authored: the compiler gives it) */
export const TOLD_REACTIONS = ["struck", "bitten"] as const;
/** the poses this module draws (the other verbs are the rig's own actions: run, walk, falling, collapsed, point) */
export const ACT_POSES = ["hit", "struck", "hide", "bite", "bitten", "dig", "type", "write", "read", "look"] as const;
export type ActPose = (typeof ACT_POSES)[number];
export type ToldAct = { verb: ActPose; at: number };

/** how long before its word a verb starts (the compiler does not let a verb start before the stage does) */
export const ACT_LEAD: Record<ActPose, number> = { hit: 14, struck: 0, hide: 12, bite: 16, bitten: 0, dig: 12, type: 16, write: 16, read: 12, look: 10 };
/** counted strokes — a verb that repeats, repeats this often and stops */
export const TYPE_TAPS = 10, TAP_LEN = 5, DIG_STROKES = 3, DIG_LEN = 16, WRITE_STROKES = 4, WRITE_LEN = 9;
/** frames after the word by which every verb has come to rest (tests: the pose does not change after it) */
export const ACT_REST: Record<ActPose, number> = { hit: 34, struck: 34, hide: 4, bite: 40, bitten: 36, dig: DIG_STROKES * DIG_LEN + 14, type: TYPE_TAPS * TAP_LEN + 8, write: WRITE_STROKES * WRITE_LEN + 8, read: 4, look: 4 };

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const io = (x: number) => { const t = clamp(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
/** 0 before a, 1 after b, eased between */
const ramp = (f: number, a: number, b: number) => io((f - a) / Math.max(1, b - a));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** one stroke: 0 → 1 → 0 over `len` frames starting at `start`; outside it 0 */
const stroke = (f: number, start: number, len: number) => { const k = (f - start) / len; return k <= 0 || k >= 1 ? 0 : Math.sin(k * Math.PI); };
/** `n` strokes one after another from frame 0; 0 before and after — it ENDS */
const strokes = (f: number, n: number, len: number) => { if (f < 0 || f >= n * len) return 0; return stroke(f, Math.floor(f / len) * len, len); };

/** the rig sits `SEAT` px lower when seated (movements.ts "sit": hipY 109) */
const SEAT = 109;

type P = Record<string, number | boolean>;

/**
 * actPose(act, frame) → the pose fields that differ from a standing figure. The renderer lays them over the rig's
 * calm standing pose (blink, weight). `frame` is the stage frame.
 */
export function actPose(act: ToldAct, frame: number): P {
  const f = frame - act.at;
  switch (act.verb) {
    case "hit": {
      // guard — the fist cocks back — it lands ON the word (a burst at the fist) — the arm stays out a moment — guard
      const cock = ramp(f, -14, -5), go = ramp(f, -4, 0), back = ramp(f, 14, 32);
      const out = go * (1 - back);
      return {
        armR: mix(mix(-24, -44, cock), -106, out) + back * 0, elbowR: mix(mix(-40, -84, cock), 0, out),
        armL: 40, elbowL: 158, lean: mix(mix(3, -5, cock), 10, out), legL: -13, legR: 15, kneeL: 8, kneeR: 6, hipY: 10,
        impact: f >= 0 && f < 10 ? 1 - f / 10 : 0, browY: 4, gazeX: 0.8, mouth: 0.15 * out,
      };
    }
    case "struck": {
      // knocked away from the blow ON the word, then left leaning, an arm up to the face
      const hit = ramp(f, 0, 5), settle = ramp(f, 8, 32);
      return {
        lean: mix(0, mix(-20, -9, settle), hit), headX: mix(0, mix(-12, -5, settle), hit), headYaw: mix(1, 0.9, hit),
        armL: mix(8, mix(96, 62, settle), hit), elbowL: mix(0, mix(60, 96, settle), hit), armR: mix(-8, mix(-58, -14, settle), hit),
        legL: 16 * hit, legR: 8 * hit, hipY: 8 * hit, mouth: 0.5 * hit * (1 - settle), blink: hit * (1 - settle) > 0.4 ? 1 : 0, browY: -4 * hit, gazeX: 0.5 * hit,
      };
    }
    case "hide": {
      // down behind the thing: knees bent, shoulders in, eyes over the edge toward what is hidden from
      const d = ramp(f, -12, 0);
      // (the compiler puts the body behind the thing: only head and shoulders rise over its edge — no seated legs)
      return { hipY: 26 * d, lean: 4 * d, armL: mix(8, 24, d), elbowL: -60 * d, armR: mix(-8, -24, d), elbowR: 60 * d, headY: 6 * d, gazeX: 0.9 * d, gazeY: -0.2 * d, browY: -3 * d };
    }
    case "bite": {
      // the lean in, the arm that takes hold, the head down to the neck ON the word — held — then it stays close
      const reach = ramp(f, -16, -6), bend = ramp(f, -8, 0), ease = ramp(f, 22, 40);
      return {
        armR: mix(-8, -80, reach), elbowR: mix(0, 26, reach), armL: mix(8, 22, reach),
        lean: mix(mix(0, 12, reach), mix(24, 16, ease), bend), headY: mix(0, mix(16, 9, ease), bend), headX: mix(0, mix(14, 8, ease), bend), headYaw: mix(1, 0.86, bend),
        legL: -14 * reach, legR: 10 * reach, kneeL: 8 * reach, hipY: 8 * reach,
        mouth: mix(0, 0.85, ramp(f, -6, -1)) * (1 - ramp(f, 4, 12)), gazeX: 0.85 * reach, gazeY: 0.5 * bend, browY: 3 * reach,
      };
    }
    case "bitten": {
      // the head turns away, the eyes shut, the body gives — and stays slumped
      const hit = ramp(f, 0, 6), sink = ramp(f, 8, 36);
      return {
        lean: mix(0, mix(-6, -12, sink), hit), headX: mix(0, -10, hit), headYaw: mix(1, 0.88, hit), headY: mix(0, mix(2, 12, sink), hit),
        armL: mix(8, 3, hit), armR: mix(-8, -3, hit), hipY: 10 * sink * hit, legL: 6 * sink * hit, legR: -4 * sink * hit,
        blink: hit > 0.5 ? 1 : 0, mouth: 0.4 * hit * (1 - sink), browY: -5 * hit,
      };
    }
    case "dig": {
      // bent over the ground; DIG_STROKES thrusts — both arms up, then driven down — the first lands ON the word
      const bend = ramp(f, -12, -2), k = strokes(f + DIG_LEN / 2, DIG_STROKES, DIG_LEN), done = ramp(f, DIG_STROKES * DIG_LEN - DIG_LEN / 2, DIG_STROKES * DIG_LEN + 12);
      const up = k; // 1 = arms raised (the spade lifted), 0 = driven into the ground
      return {
        lean: mix(0, mix(15, 9, done), bend) - 5 * up * bend, hipY: mix(0, 16, bend) + 8 * (1 - up) * bend * (1 - done),
        armR: mix(-8, mix(-26, -70, up), bend), elbowR: mix(0, mix(34, 70, up), bend), armL: mix(8, mix(20, 46, up), bend), elbowL: mix(0, mix(-30, -66, up), bend),
        legL: -5 * bend, legR: 5 * bend, kneeL: 6 * bend, kneeR: 6 * bend, headY: 8 * bend, gazeY: 0.8 * bend, gazeX: 0.3 * bend, mouth: 0.2 * (1 - up) * bend * (1 - done),
      };
    }
    case "type": {
      // seated; both hands come forward over the keys; TYPE_TAPS key strokes, hands alternating, the first ON the word;
      // then the hands rest on the keys
      const sit = ramp(f, -16, -4), n = f < 0 ? -1 : Math.floor(f / TAP_LEN), tap = strokes(f, TYPE_TAPS, TAP_LEN);
      const right = n % 2 === 0 ? tap : 0, left = n % 2 === 1 ? tap : 0;
      return {
        sit, hipY: SEAT * sit, lean: 5 * sit, armR: mix(-8, -4, sit), elbowR: mix(0, 66 + 12 * right, sit), armL: mix(8, 4, sit), elbowL: mix(0, -66 - 12 * left, sit),
        headY: 5 * sit + 1.5 * tap, gazeY: 0.75 * sit, gazeX: 0.12 * (right - left),
      };
    }
    case "write": {
      // seated; the left hand holds the page, the right hand writes WRITE_STROKES short strokes from the word on
      const sit = ramp(f, -16, -4), w = strokes(f, WRITE_STROKES, WRITE_LEN), along = clamp(f / (WRITE_STROKES * WRITE_LEN));
      return {
        sit, hipY: SEAT * sit, lean: 7 * sit, armR: mix(-8, -6 - 5 * along, sit), elbowR: mix(0, 74 - 10 * w, sit), armL: mix(8, 5, sit), elbowL: mix(0, -58, sit),
        headY: 7 * sit, gazeY: 0.85 * sit, gazeX: 0.25 * sit,
      };
    }
    case "read": {
      // the thing in both hands in front of the chest, the head down to it, the eyes on it
      const d = ramp(f, -12, 0);
      return { armR: mix(-8, -6, d), elbowR: 82 * d, armL: mix(8, 6, d), elbowL: -74 * d, lean: 2 * d, headY: 7 * d, gazeY: 0.9 * d, gazeX: 0.15 * d, browY: 1 * d };
    }
    case "look":
    default: {
      // the head turns to the other, the eyes go there, the body follows a little — and it keeps looking
      const d = ramp(f, -10, 0);
      return { headX: 10 * d, headYaw: mix(1, 0.86, d), gazeX: 0.95 * d, lean: 4 * d, browY: 2 * d };
    }
  }
}

/**
 * WHERE THINGS GO (rig units, the figure's own 400 × 900 box, feet at y 876): the top of the desk a seated person
 * works at, and the middle of the thing that stands on it. The compiler puts the typewriter THERE — in front of the
 * typist, under the hands — instead of beside a standing person.
 */
// (round 2: at 640 / 0.78 the typewriter covered the typist from the neck down — the desk is at lap height and the
   // thing smaller, so the head, the shoulders and both arms are seen ABOVE it)
export const DESK = { topY: 692, thingY: 566, feetY: 876, thingW: 0.6, deskW: 1.2, deskH: 20 };
/** how far the head of a seated person is below where it is when they stand (rig units; movements.ts "sit") */
export const SEAT_DROP = 109;
