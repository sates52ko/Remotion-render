import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Everyman } from "../characters/Everyman";
import { KineticText } from "./KineticText";
import { Backdrop } from "./Backdrop";
import { ChapterCard } from "./ChapterCard";
import { Diagram } from "./Diagram";
import { RelationshipStage } from "./RelationshipStage";
import { transitionRender } from "./Transition";
import { Motif } from "../motifs";
import { resolveBody, shotPreset, stageChar, stageText } from "../shots";
import { fitGroundedFigure, holdLift, liftHold } from "../groundFit";
import { embraceMotifSlot } from "../safeArea";
import { liftLayout, isLift } from "../liftLayout";
import { leaveLayout, pathOf } from "../leaveLayout";
import { DEFAULT_TRANSITION, DEFAULT_VARIANT } from "../schema";
import { enter, pose, ambient, arcOf, parallax, PLACE_OUT, PLACE_HOLD, THROW_FLY } from "../movements";
import { HeldProp } from "../handprops";
import { interpolate } from "remotion";
import { camera } from "../movements";
import { SpeechBalloon } from "./SpeechBalloon";
import { resolveChoreographedLookAt, resolveDynamicExpression, resolveVisualArcTransform } from "../choreography";
import type { SceneSpec, CharacterSpec, ShotName, VariantSpec, CastBible, BodyPlan, HandProp, CharEmotion } from "../schema";
import type { ScenePlan, RestCarry } from "../continuity";
import { actionCueFrame, facesEachOther, handOffFrame, sameObject, SETTLED_FRAME } from "../continuity";
import { composeRest } from "../endState";
import { SemanticStage, type SemanticCompiled } from "./SemanticStage";

// An arc the object already completed in the previous scene is drawn at its end state
// and composed with the arc it runs in this scene (continuity.ts heldArcs).
type ArcState = ReturnType<typeof arcOf>;
const composeArcs = (xs: ArcState[]): ArcState =>
  xs.reduce((a, b) => ({ ty: a.ty + b.ty, scale: a.scale * b.scale, rotate: a.rotate + b.rotate, opacity: a.opacity * b.opacity }), { ty: 0, scale: 1, rotate: 0, opacity: 1 });

/**
 * Scene — one beat of the film.
 *
 * Composition order: backdrop (parallax) → motifs → cast → kinetic copy, all
 * inside the scene camera, with the transition reveal wrapping the whole thing.
 * Staging comes from the SHOT preset unless the scene overrides it, which is
 * what turned "163 identical presenter frames" into an actual shot list.
 */

// rig px between the two centres when an embrace has closed the gap (chests meet, arms over the shoulders)
const EMBRACE_GAP = 340;
// rig px from a figure's centre to its outstretched hand (reach / take), and the frames a receiver takes to step in
const HAND_REACH = 280;
const HAND_STEP = 18;
const HAND_MEET = 6; // frames the hands stay together at the moment before the receiver steps back

// CONTACT. A grab or a punch is only that when the hand LANDS: at the two-shot's
// slot spacing the arm stopped a body-width short and read as pointing. The lead
// steps in until the hand meets the partner — closer only, and only when facing it.
function contactDx(shot: ShotName, bodies: CharacterSpec[], index: number): number {
  if (bodies.length !== 2 || bodies.some((b) => (b.crowd ?? 0) > 1)) return 0;
  // who reaches: the lead when it grabs/punches; the partner when it is the one
  // holding a struggling lead (plan-antidote pairs struggling with grabbing)
  const [a, b] = bodies;
  const hits = (x: CharacterSpec) => x.action === "grabbing" || x.action === "fighting" || x.action === "embrace";
  // a HAND-OVER (take + a reaching giver, continuity.ts handOffFrame): the receiver steps in until the hands meet
  const takes = (x: CharacterSpec, y: CharacterSpec) => x.action === "take" && !!x.holds && y.action === "reach";
  const mover = hits(a) ? 0 : a.action === "struggling" && b.action === "grabbing" ? 1 : takes(a, b) ? 0 : takes(b, a) ? 1 : -1;
  if (mover !== index) return 0;
  const me = stageChar(shot, bodies[mover], mover), you = stageChar(shot, bodies[1 - mover], 1 - mover);
  const act = bodies[mover].action;
  const dir = Math.sign(you.x - me.x);
  if (!dir || (dir > 0) === !!me.flip) return 0;
  // EMBRACE (2026-10-20): the lead's body closes on the partner's — chests meet, arms wrap; CharacterLayer
  // scales this full step by the pose's `contact` (0 before the approach, 1 from the authored cue on).
  if (act === "embrace") {
    const dx = you.x - dir * EMBRACE_GAP * you.scale - me.x;
    return dx * dir > 0 ? dx : 0;
  }
  // hand to hand: both arms are out at the same reach angles (movements.ts TAKE_REST_*)
  if (act === "take") {
    const dx = you.x - dir * HAND_REACH * you.scale - (me.x + dir * HAND_REACH * me.scale);
    return dx * dir > 0 ? dx : 0;
  }
  // hand reach from the figure's centre (rig px) → where on the partner it lands
  const reach = act === "fighting" ? 300 : 280;
  const lands = act === "fighting" ? 110 : 100; // fist at the cheek, hand on the shoulder
  const dx = you.x - dir * lands * you.scale - (me.x + dir * reach * me.scale);
  return dx * dir > 0 ? dx : 0;
}

// Actions the diagram side-step keeps instead of turning the figure into a pointer.
const KEEPS_ACTION = new Set(["walk", "sit", "lying", "collapsed", "falling", "fighting", "struggling", "grabbing"]);

const mute = (hex: string, amt = 0.55) => {
  const m = String(hex).replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  const g = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  const r = Math.round(((n >> 16) & 255) + (g - ((n >> 16) & 255)) * amt);
  const gg = Math.round(((n >> 8) & 255) + (g - ((n >> 8) & 255)) * amt);
  const b = Math.round((n & 255) + (g - (n & 255)) * amt);
  return `rgb(${r},${gg},${b})`;
};

const Rig: React.FC<{
  variant: VariantSpec; poseValue: ReturnType<typeof pose>; silhouette?: boolean;
  body?: BodyPlan; holds?: HandProp; accent?: string;
  emotion?: CharEmotion; emotionAt?: number; holdScale?: number; holdHalo?: boolean;
}> = ({ variant, poseValue, silhouette, body, holds, accent, emotion, emotionAt, holdScale, holdHalo }) => {
  if (!silhouette) return <Everyman variant={variant} pose={poseValue} body={body} holds={holds} accent={accent} emotion={emotion} emotionAt={emotionAt} holdScale={holdScale} holdHalo={holdHalo} />;
  // Flat dark cut-out: the overShoulder foreground and the silhouette shot.
  // Fully opaque on purpose — any transparency lets the backdrop bleed through
  // the shoulder and turns the rig's overlapping parts into visible seams.
  return (
    <div style={{ filter: "brightness(0)" }}>
      <Everyman variant={variant} pose={poseValue} body={body} holds={holds} accent={accent} emotion={emotion} emotionAt={emotionAt} />
    </div>
  );
};

/**
 * Who this body looks like. A scene names a ROLE and the look comes from the
 * book's cast bible, so the same protagonist recurs across the film; `variant`
 * is a per-scene override, and `expression` layers the scene's face on top.
 * Configs written before the bible carry a full `variant` and are unaffected.
 */
function resolveVariant(spec: CharacterSpec, cast?: CastBible): VariantSpec {
  const fromRole = spec.role && cast ? cast[spec.role]?.variant : undefined;
  const base = { ...DEFAULT_VARIANT, ...(fromRole ?? {}), ...(spec.variant ?? {}) };
  return spec.expression ? { ...base, expression: spec.expression } : base;
}

// ── a placed, entering, acting character ────────────────────────────────────
const CharacterLayer: React.FC<{
  spec: CharacterSpec; shot: ShotName; index: number; cast?: CastBible;
  durationFrames: number; accent?: string; lookAtPoint?: { x: number; y: number } | null;
  /** px the figure steps toward its partner so a grab/punch actually lands (contactDx). */
  approach?: number;
  /** AUTHORED CONTINUATION (continuity.ts): the same person was on screen last scene —
   *  no entrance, and the pose clock carries on from where it was. */
  carry?: { poseClock: number; cue?: number };
  /** embrace: who does it ("lead", cast[0]) vs to whom ("partner") — different arms, the lead drawn in front */
  embraceRole?: "lead" | "partner";
  /** LIFT (liftLayout.ts): px this body moves by the pose's contact (the lifter stepping in) and carry progress */
  liftDx?: { approach: number; carry: number; back?: number };
  /** CARRIED STATE (10x P1, continuity.ts): the end state of an earlier deed — the body keeps it (seated in the tub,
   *  seated, down) under this beat's action, at the place the deed left it (rest.stage) */
  rest?: RestCarry;
  /** LEAVE / FLEE (Action 2.0, leaveLayout.ts): px from the slot to the exit (the icon, or off the frame) */
  exitDx?: number;
}> = ({ spec, shot, index, cast, durationFrames, accent, lookAtPoint, approach = 0, carry, embraceRole = "lead", liftDx, rest, exitDx }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // whoever walked out / ran away on an earlier beat is GONE (endState.ts): never drawn back on their slot
  if (rest && rest.posture === "gone") return null;
  const variant = resolveVariant(spec, cast);
  const body = rest && rest.body ? rest.body : resolveBody(shot, spec);
  // a COLLAPSED body lies on the slot's floor line — re-staged so the whole body is
  // on frame and clear of the subtitles (groundFit.ts); every other action: unchanged.
  // A body anchored by a carried state stands exactly where the deed left it (reframed for this shot).
  const restAction = (rest ? rest.restAction : spec.action) as CharacterSpec["action"];
  const st = rest && rest.stage
    ? { x: rest.stage.x, y: rest.stage.y, scale: rest.stage.scale, flip: rest.stage.flip ?? false, silhouette: false }
    : fitGroundedFigure(stageChar(shot, spec, index), restAction, [pose(restAction, 0, fps), pose(restAction, 100000, fps)], body, variant);
  const e = enter(carry || rest ? "none" : spec.enter, frame, fps);
  if (rest && rest.stage) approach = 0; // already where the deed left it: no step toward the partner
  // the authored action moment on the POSE clock: a carried figure doing the same action keeps the cue it
  // already passed (continuity.ts) — the embrace / the taken object is the starting state, never replayed
  const clockOff = carry ? carry.poseClock : (spec.poseAt ?? 0);
  const cue = carry && carry.cue != null ? carry.cue : actionCueFrame(spec, durationFrames) + clockOff;
  let p = pose(spec.action, frame + clockOff, fps, cue, embraceRole);
  if (spec.action === "take" && spec.takeFrom === "body") p = { ...p, noRest: 1 } as typeof p;
  // the carried rest (settled: the deed is over) under this beat's own action — seated keeps its seat, down keeps its body
  if (rest) p = composeRest(pose(rest.restAction as CharacterSpec["action"], SETTLED_FRAME, fps), p, rest.posture, spec.action);
  if (spec.action === "embrace") approach *= p.contact ?? 1;
  // LEAVE / FLEE: the body moves along its path to the exit, faces the way it goes from the turn on, and is gone at
  // the end (through the door / off the frame) — the deed is the movement, never a walk cycle on the spot
  const leaving = (spec.action === "leave" || spec.action === "flee") && exitDx != null;
  const exitShift = leaving ? exitDx! * pathOf(p.exit ?? 0) : 0;
  const goneOpacity = leaving ? 1 - (p.gone ?? 0) : 1;
  // PLACE 2.0 (cycle 6): the placing arm (the rig's right) goes AWAY from the partner, onto the table on that side —
  // v1 reached straight at the partner and read as "hands it to him"
  const placeFlip = spec.action === "place" && lookAtPoint ? lookAtPoint.x > st.x : null;
  const faceFlip = leaving && (p.turned ?? 0) >= 0.5 ? exitDx! < 0 : placeFlip ?? st.flip;
  // while the hand sets it down, the eyes follow the object (the rig's own gaze), not the partner
  const placing = spec.action === "place" && p.table === 1 && (p.bring ?? 1) < 1 && frame + clockOff - cue < PLACE_OUT + PLACE_HOLD;
  const liftShift = liftDx ? liftDx.approach * (p.contact ?? 0) + liftDx.carry * (p.carry ?? 0) + (liftDx.back ?? 0) * (p.back ?? 0) : 0;
  // a receiver steps in over the first frames, takes it, and steps back to its slot as it brings the object in — so it
  // stands on its slot at both cuts (a carried figure never jumps; a take carried past its moment is already back)
  if (spec.action === "take" && approach) {
    const ramp = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
    approach *= ramp(frame / HAND_STEP) * (1 - ramp((frame + clockOff - cue - HAND_MEET) / HAND_STEP));
  }
  // LOOK-AT (4.0 + 4.1): turn gaze (2D) + head toward the resolved target. The whole rig is
  // drawn then flipped by the wrapper's scaleX, so a screen-space direction must
  // be negated back into rig space when the figure is flipped.
  if (lookAtPoint && !(leaving && (p.turned ?? 0) > 0) && !placing) {
    const eyeY = st.y - 120 * st.scale;
    const screenGx = Math.max(-1, Math.min(1, (lookAtPoint.x - st.x) / 520));
    const screenGy = Math.max(-1, Math.min(1, (lookAtPoint.y - eyeY) / 420));
    const gx = faceFlip ? -screenGx : screenGx;
    const gy = screenGy;

    // Living micro-saccade: eyes never stay 100% frozen on a static coordinate
    const saccadeX = Math.sin(frame * 0.14) * 0.035;
    const saccadeY = Math.cos(frame * 0.18) * 0.025;

    p = {
      ...p,
      gazeX: Math.max(-1, Math.min(1, gx + saccadeX)),
      gazeY: Math.max(-1, Math.min(1, gy + saccadeY)),
      headX: (p.headX ?? 0) + gx * 10,
      headY: (p.headY ?? 0) + gy * 6,
      headYaw: 1 - Math.abs(gx) * 0.12,
    };
  }
  // A HELD OBJECT clears the burned-in captions (groundFit.ts holdLift): one lift per scene from the settled hold
  // on this staging; a take lifts with its bring-in, so the take's end and a continued hold meet in the same pose.
  if (spec.holds && (spec.action === "hold" || ((spec.action === "take" || spec.action === "place") && p.take === 1))) {
    const lift = holdLift(st, pose("hold", 100000, fps), body, variant);
    if (lift > 0) p = liftHold(p, spec.action === "take" || spec.action === "place" ? lift * (p.bring ?? 1) : lift);
  }
  const scale = st.scale * e.scale;
  // TRAVEL — the figure actually crosses the set over the beat. Without it a
  // `walk` is a gait cycle on a treadmill: the legs move and the person never
  // goes anywhere, which reads worse than not animating the legs at all.
  const travel = spec.travel
    ? interpolate(frame, [0, Math.max(1, durationFrames)], spec.travel, { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const isNervous = spec.emotion === "sweat";
  const jitterX = isNervous && frame >= (spec.emotionAt ?? 8) ? Math.sin(frame * 1.6) * 1.5 : 0;

  // C19 THROW: once the object has left the hand (pose.released) it is drawn HERE, in stage px, flying on an arc from
  // the hand to `throwTo` (it lands and stays) — or out of the frame on the side the figure faces. A pure function of
  // the frame: a still at any frame shows the same flight as the clip.
  const flying = spec.action === "throw" && spec.holds && (p.released ?? 0) >= 1 ? (() => {
    const cx = st.x + e.tx + travel + approach, cy = st.y + e.ty;
    const dir = faceFlip ? -1 : 1;
    const sx = cx + dir * 150 * scale, sy = cy - 120 * scale;
    const to = spec.throwTo ?? { x: cx + dir * 1400, y: sy - 80 };
    const k = Math.max(0, Math.min(1, (frame - cue - 2) / THROW_FLY));
    const x = sx + (to.x - sx) * k, y = sy + (to.y - sy) * k - 260 * Math.sin(Math.PI * k);
    if (!spec.throwTo && k >= 1) return null;
    return (
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        {k < 1 ? <path d={`M ${sx} ${sy} Q ${(sx + x) / 2} ${Math.min(sy, y) - 120} ${x} ${y}`} fill="none" stroke="#1E1E22" strokeWidth={4} strokeDasharray="3 12" strokeLinecap="round" opacity={0.45} /> : null}
        <g transform={`translate(${x} ${y}) scale(${1.2 * scale})`}><HeldProp prop={spec.holds as HandProp} ink="#1E1E22" accent={accent} /></g>
      </svg>
    );
  })() : null;
  return (
    <>
    {flying}
    <div
      style={{
        position: "absolute",
        left: st.x,
        top: st.y,
        opacity: e.opacity * goneOpacity,
        filter: "drop-shadow(0 16px 28px rgba(0,0,0,0.14))",
        transform: `translate(-50%, -50%) translate(${e.tx + travel + jitterX + approach + liftShift + exitShift}px, ${e.ty}px) scale(${scale}) scaleX(${faceFlip ? -1 : 1})`,
        transformOrigin: "center",
      }}
    >
      <Rig
        variant={variant}
        poseValue={p}
        silhouette={st.silhouette}
        body={body}
        holds={spec.holds}
        accent={accent}
        emotion={spec.emotion}
        emotionAt={spec.emotionAt}
        holdScale={(spec as { holdScale?: number }).holdScale}
        holdHalo={(spec as { holdHalo?: boolean }).holdHalo}
      />
      {/* SPEECH (CSD 1.1): the balloon leans away from the partner (screen side), converted into this mirrored layer */}
      {spec.says && spec.says.text ? (() => {
        const partnerRight = lookAtPoint ? lookAtPoint.x > st.x : index === 0;
        const screenSide: "left" | "right" = partnerRight ? "left" : "right";
        const side: "left" | "right" = faceFlip ? (screenSide === "left" ? "right" : "left") : screenSide;
        return <SpeechBalloon text={spec.says.text} at={spec.says.at ?? 0} scale={scale} flip={faceFlip} side={side} />;
      })() : null}
    </div>
    </>
  );
};

// ── the everyman, multiplied — "most people…", "everyone around you…" ───────
const CrowdLayer: React.FC<{ spec: CharacterSpec; shot: ShotName; cast?: CastBible; accent?: string; carry?: { poseClock: number } }> = ({ spec, shot, cast, accent, carry }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hero = resolveVariant(spec, cast);
  const st = stageChar(shot, spec, 0);
  const body = resolveBody(shot, spec);
  const full = body === "full";
  const e = enter(carry ? "none" : spec.enter, frame, fps);
  const total = Math.max(3, Math.min(12, Math.round(spec.crowd ?? 9)));
  // Three depth rows: back row smallest and most muted, hero stands in front.
  // Full-body figures are ~1.6x taller and ~40% narrower on the same anchor, so
  // the rows step further apart vertically and pack tighter horizontally —
  // otherwise a crowd of whole people is a pile of overlapping heads.
  const nBack = Math.min(6, Math.ceil(total * 0.45));
  const nMid = Math.min(5, Math.ceil(total * 0.33));
  const nFront = Math.max(1, total - nBack - nMid);
  const rows = full
    ? [
        // Gaps must clear the figure's own width (~248px at this scale) or the
        // rows overlap; the half-gap stagger stops back-row heads landing
        // directly above front-row heads, which read as one stacked column.
        { n: nBack, z: 0.6, dy: -196, gap: 258, opacity: 0.5, mutedBy: 0.75, stagger: 0.5 },
        { n: nMid, z: 0.8, dy: -92, gap: 296, opacity: 0.72, mutedBy: 0.5, stagger: 0 },
        { n: nFront, z: 1, dy: 34, gap: 330, opacity: 1, mutedBy: 0, stagger: 0.5 },
      ]
    : [
        { n: nBack, z: 0.6, dy: -132, gap: 250, opacity: 0.5, mutedBy: 0.75 },
        { n: nMid, z: 0.8, dy: -58, gap: 300, opacity: 0.72, mutedBy: 0.5 },
        { n: nFront, z: 1, dy: 30, gap: 360, opacity: 1, mutedBy: 0 },
      ];
  return (
    <>
      {rows.map((row, ri) =>
        Array.from({ length: row.n }).map((_, i) => {
          const isHero = ri === 2 && i === Math.floor(row.n / 2);
          const offset = (i - (row.n - 1) / 2 + ((row as { stagger?: number }).stagger ?? 0)) * row.gap;
          const phase = ri * 37 + i * 53; // deterministic desync so nobody breathes in lockstep
          const variant = isHero
            ? hero
            : { ...hero, suit: mute(hero.suit, 0.55 + row.mutedBy * 0.4), shirt: mute(hero.shirt, 0.5), hair: mute(hero.hair, 0.35), expression: "neutral" as const };
          const p = pose(isHero ? spec.action : "idle", frame + phase + (carry ? carry.poseClock : 0), fps);
          return (
            <div
              key={`${ri}-${i}`}
              style={{
                position: "absolute",
                left: st.x + offset,
                top: st.y + row.dy,
                opacity: e.opacity * (isHero ? 1 : row.opacity),
                filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.12))",
                transform: `translate(-50%, -50%) translate(${e.tx}px, ${e.ty}px) scale(${st.scale * row.z * e.scale}) scaleX(${i % 2 === 1 && !isHero ? -1 : 1})`,
                transformOrigin: "center",
                zIndex: ri,
              }}
            >
              <Rig
                variant={variant}
                poseValue={p}
                silhouette={st.silhouette}
                body={body}
                holds={isHero ? spec.holds : undefined}
                accent={accent}
                emotion={isHero ? spec.emotion : undefined}
                emotionAt={spec.emotionAt}
              />
            </div>
          );
        }),
      )}
    </>
  );
};

// the cast in SLOT order (continuity.ts assigns each figure a slot, a permutation)
const slotOrdered = (bodies: CharacterSpec[], plan: ScenePlan): CharacterSpec[] => {
  const arr = bodies.slice();
  bodies.forEach((b, k) => { if (plan.chars[k]) arr[plan.chars[k].slot] = b; });
  return arr;
};

// ── the scene: backdrop + camera-transformed stage + transition reveal ──────
export const Scene: React.FC<{ scene: SceneSpec; transIn?: number; cast?: CastBible; multiplane?: boolean; continuity?: ScenePlan; singleRelation?: boolean }> = ({ scene, transIn = 0, cast, multiplane = false, continuity, singleRelation = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - transIn); // frames since the narration for this scene starts
  // Runtime defaults, not schema defaults: Remotion passes `defaultProps` to the
  // renderer without parsing them, so a config written before the shot grammar
  // has `shot` / `transition` / `bg.accent` genuinely undefined here.
  const preset = shotPreset(scene.shot);
  const transition = scene.transition ?? DEFAULT_TRANSITION;
  const cam = camera(scene.camera ?? { zoom: [1, 1], panX: [0, 0], panY: [0, 0] }, local, scene.durationFrames);
  const t = transitionRender(transition, frame);
  const bg = scene.bg ?? { type: "flat" as const, colors: ["#8FC0E8"], set: "none" as const, texture: "none" as const };
  const accent = transition.color || bg.accent || "#E23B57";
  const ink = bg.accent || "#1E1E22";
  const bodies = preset.dropsCast ? [] : scene.characters ?? [];

  if (scene.shot === "chapterCard" || scene.chapterCard) {
    const cardSpec = scene.chapterCard ?? {
      title: scene.texts[0]?.text || "CHAPTER",
      subtitle: scene.texts[1]?.text,
    };
    return (
      <AbsoluteFill style={t.style}>
        <ChapterCard spec={cardSpec} accent={accent} durationFrames={scene.durationFrames} />
        {t.overlay}
      </AbsoluteFill>
    );
  }

  // SINGLE-RELATION CAUSE → VISIBLE EFFECT (capability, default OFF): drawn only when the book opts in
  // (meta.singleRelation) AND the scene carries a compiled contract (scripts/lib/single-relation.js). Otherwise the
  // field is ignored and the scene draws exactly as before.
  const rel = singleRelation ? (scene as { singleRelation?: SemanticCompiled }).singleRelation : undefined;
  if (rel) {
    return (
      <AbsoluteFill style={t.style}>
        <Backdrop bg={bg} cam={camera({ zoom: [1, 1], panX: [0, 0], panY: [0, 0] }, local, scene.durationFrames)} />
        <Sequence from={transIn} layout="none" name="single-relation">
          <SemanticStage spec={rel} accent={accent.toLowerCase() !== ink.toLowerCase() ? accent : "#E23B57"} ink={ink} cast={cast} />
        </Sequence>
        {t.overlay}
      </AbsoluteFill>
    );
  }

  // ── MULTIPLANE (4.0) ──────────────────────────────────────────────────────
  // Pre-4.0 the whole stage shared ONE camera transform (a flat plane in front of
  // a parallaxing backdrop). Now each element rides its own depth: `camPlane`
  // returns that element's camera transform via parallax(). With multiplane off
  // every depth collapses to 1, i.e. parallax(cam, 1) === the old single plane —
  // so existing books render byte-for-byte the same.
  const iconShot = ["insert", "illustration", "diorama", "beforeAfter"].includes(scene.shot);
  const camPlane = (depth: number): React.CSSProperties => {
    const pr = parallax(cam, multiplane ? depth : 1);
    return { transform: `translate(${pr.tx}px, ${pr.ty}px) scale(${pr.scale})`, transformOrigin: "center" };
  };

  // LOOK-AT (4.0): resolve a character's `lookAt` to a stage point so the rig can
  // turn toward it. Uses the same staging the elements themselves resolve to.
  const props = scene.props ?? [];
  const texts = scene.texts ?? [];
  const visualArcTransform = resolveVisualArcTransform(scene.visualArc, local, scene.durationFrames);
  // AUTHORED CONTINUATION (art.json `continue`, continuity.ts). Absent / inactive =
  // every element draws exactly as before.
  const plan = continuity && continuity.active ? continuity : null;
  // an icon the author did not place: the shot's slot, or clear of an embracing pair (safeArea.ts embraceMotifSlot)
  // LIFT (liftLayout.ts, 2026-10-26): cast[0] lifts cast[1], carries her to the beat's icon and sets her down in it.
  const lift = !scene.diagram && isLift(bodies) ? (() => { const st = (k: number) => stageChar(scene.shot, bodies[k], plan && plan.chars[k] ? plan.chars[k].slot : k); return liftLayout(st(0), st(1)); })() : null;
  const liftDest = lift && props.length ? 0 : -1; // the destination is drawn IN FRONT of the cast (she sits inside it)
  // CARRIED STATE (10x P1): the destination someone was set down in stays on stage, in front of the cast, where the
  // deed left it — this scene's own icon of the same object IS that place (drawn once, never twice)
  const place = plan && plan.place ? plan.place : null;
  const placeIdx = place ? props.findIndex((p) => sameObject(p as Parameters<typeof sameObject>[0], place.prop)) : -1;
  // LEAVE / FLEE (Action 2.0): the leaver's path — past the partner (leave) or away from them (flee) — to the beat's icon
  // (drawn where the path ends: the door they go through) or off the frame
  const leaveOf = (k: number) => {
    const c = bodies[k];
    if (scene.diagram || !c || (c.action !== "leave" && c.action !== "flee")) return null;
    const st = (j: number) => stageChar(scene.shot, bodies[j], plan && plan.chars[j] ? plan.chars[j].slot : j);
    const iconSlot = embraceMotifSlot(scene.shot, bodies, preset.motif);
    return leaveLayout(st(k), bodies.length > 1 ? st(k === 0 ? 1 : 0) : null, c.action, props.length > 0, props.length ? (props[0].x ?? iconSlot.x) : undefined);
  };
  const leave0 = lift ? null : leaveOf(0);
  // the icon is the EXIT of a leave (drawn where the path ends) — but the THREAT of a lone flee (it stays where it is)
  const fleeFromIcon = !!(leave0 && bodies[0] && bodies[0].action === "flee" && bodies.length === 1);
  const motifSlot = lift ? lift.dest : leave0 && props.length && !fleeFromIcon ? leave0.dest : embraceMotifSlot(scene.shot, bodies, preset.motif);
  // A HAND-OVER (continuity.ts handOffFrame): before its moment the object is in the giver's outstretched hand and the
  // receiver reaches with an empty hand; from it, in the receiver's. Any other beat: null, drawn as before.
  // Only when the two FACE each other (the planner's twoShot): on an authored shot that turns them apart the object
  // would jump between hands that never meet — that beat keeps the old drawing (object in front of the receiver).
  const handAt = (() => {
    const at = scene.diagram ? null : handOffFrame(bodies, plan, scene.durationFrames);
    if (at == null) return null;
    const st = (k: number) => stageChar(scene.shot, bodies[k], plan && plan.chars[k] ? plan.chars[k].slot : k);
    return facesEachOther(st(0), st(1)) ? at : null;
  })();

  // one prop, drawn where the shot (or the author) puts it — behind the cast, or in front of it for a lift's
  // destination (the lifted person is set down INTO it: its front edge covers her)
  const renderProp = (p: (typeof props)[number], i: number) => {
        // A motif left at scale 1 means "however big this shot wants it";
        // an authored scale is taken literally.
        const s = p.scale ?? 1;
        const pc = plan && plan.props[i] && plan.props[i].carried ? plan.props[i] : null;
        if (pc) {
          // CARRIED: the same object stays on stage — mounted from frame 0, its own clock
          // (draw-in, sway, spin) carries on, no pop, and the arc it already ran is held.
          const amb = ambient(pc.seed, local + pc.ambClock);
          const arc = composeArcs([
            ...pc.heldArcs.map((a) => arcOf(a as Parameters<typeof arcOf>[0], 2, 2)),
            arcOf(pc.arc as Parameters<typeof arcOf>[0], local, Math.max(1, scene.durationFrames)),
          ]);
          const depth = p.depth ?? (iconShot ? 1 : 0.72);
          return (
            <Sequence key={`p${i}`} from={transIn - pc.clock} layout="none" name={`motif-${p.type}`}>
              <AbsoluteFill style={camPlane(depth)}>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: arc.opacity * visualArcTransform.opacity,
                    filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.14))",
                    transform: `translate(${amb.tx + visualArcTransform.tx + visualArcTransform.jitter}px, ${amb.ty + arc.ty + visualArcTransform.ty}px) rotate(${amb.rotate + arc.rotate}deg) scale(${amb.scale * arc.scale * visualArcTransform.scale})`,
                    transformOrigin: "center",
                  }}
                >
                  <Motif
                    spec={{ ...p, at: 0, enter: "none", motion: pc.cue != null ? p.motion : undefined, motionAt: pc.cue, x: p.x ?? motifSlot.x, y: p.y ?? motifSlot.y, scale: s * (s === 1 ? motifSlot.scale : 1) }}
                    accent={accent}
                    ink={ink}
                  />
                </div>
              </AbsoluteFill>
            </Sequence>
          );
        }
        // Ambient float: a prop that stops moving after its draw-in is what
        // makes a long scene read as a still. Seeded by index so no two
        // props on the same stage drift in phase.
        const amb = ambient((i * 0.37 + 0.11) % 1, local);
        // The metaphor's arc: what this object DOES over the beat.
        const from = (p.at ?? 0);
        const arc = arcOf(p.arc, local - from, Math.max(1, scene.durationFrames - from));
        // Decorative motifs sit back in the set; icon-shot motifs are the hero,
        // so they stay on the focal plane.
        const depth = p.depth ?? (iconShot ? 1 : 0.72);
        return (
          // A Sequence (layout="none") shifts the motif's own clock so `at`
          // actually delays the draw-in. It rides its depth plane.
          <Sequence key={`p${i}`} from={from + transIn} layout="none" name={`motif-${p.type}`}>
            <AbsoluteFill style={camPlane(depth)}>
              {/* inset:0 — a transformed wrapper is the containing block for the
                  motif's absolute left/top, so it must cover the full stage. */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: arc.opacity * visualArcTransform.opacity,
                  filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.14))",
                  transform: `translate(${amb.tx + visualArcTransform.tx + visualArcTransform.jitter}px, ${amb.ty + arc.ty + visualArcTransform.ty}px) rotate(${amb.rotate + arc.rotate}deg) scale(${amb.scale * arc.scale * visualArcTransform.scale})`,
                  transformOrigin: "center",
                }}
              >
                <Motif
                  spec={{ ...p, x: p.x ?? motifSlot.x, y: p.y ?? motifSlot.y, scale: s * (s === 1 ? motifSlot.scale : 1) }}
                  accent={accent}
                  ink={ink}
                />
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      };
  return (
    <AbsoluteFill style={t.style}>
      <Backdrop bg={bg} cam={cam} />
      {props.map((p, i) => (i === liftDest || i === placeIdx ? null : renderProp(p, i)))}
      {scene.diagram && plan && plan.diagram ? (
        // CARRIED: the same graphic, already built — only its new labels/values build in
        <Sequence from={transIn} layout="none" name={`diagram-${scene.diagram.type}`}>
          <AbsoluteFill style={camPlane(1)}>
            <Diagram
              spec={scene.diagram}
              accent={accent}
              ink={ink}
              paper={typeof bg.colors?.[0] === "string" ? bg.colors[0] : "rgb(246,241,232)"}
              frame={Math.max(0, local - (scene.diagram.at ?? 0))}
              fps={fps}
              durationFrames={scene.durationFrames}
              carry={plan.diagram}
              loopFrame={local + plan.diagram.clock}
            />
          </AbsoluteFill>
        </Sequence>
      ) : scene.diagram ? (
        <Sequence from={(scene.diagram.at ?? 0) + transIn} layout="none" name={`diagram-${scene.diagram.type}`}>
          <AbsoluteFill style={camPlane(1)}>
            <Diagram
              spec={scene.diagram}
              accent={accent}
              ink={ink}
              paper={typeof bg.colors?.[0] === "string" ? bg.colors[0] : "rgb(246,241,232)"}
              frame={Math.max(0, local - (scene.diagram.at ?? 0))}
              fps={fps}
              durationFrames={scene.durationFrames}
            />
          </AbsoluteFill>
        </Sequence>
      ) : null}
      {/* an EMBRACE draws its lead (who does it) last, in front: the lead's arms over the partner's shoulders read as the deed;
          a HAND-OVER draws its receiver in front, so the giver's empty hand never covers the object just passed */}
      {(bodies.length === 2 && (bodies[0].action === "embrace" || handAt != null) ? [1, 0]
        // a body kept BESIDE a place (10x P1) acts on the one in it — drawn in front, so its hand and what it holds show
        : plan && plan.place ? bodies.map((_, k) => k).sort((a, b) => Number(!!(plan.chars[a] && plan.chars[a].rest && plan.chars[a].rest!.anchor === "besidePlace")) - Number(!!(plan.chars[b] && plan.chars[b].rest && plan.chars[b].rest!.anchor === "besidePlace")))
        : bodies.map((_, k) => k)).map((ci) => {
        const c = bodies[ci];
        // CARRIED figures keep their slot (continuity.ts: a permutation of 0..n-1), so
        // staging, look-at and contact all index the slot-ordered cast.
        const cc = plan && plan.chars[ci] ? plan.chars[ci] : null;
        const i = cc ? cc.slot : ci;
        const staged = plan ? slotOrdered(bodies, plan) : bodies;
        const carry = cc && cc.carried ? { poseClock: cc.poseClock, ...(cc.cue != null ? { cue: cc.cue } : {}) } : undefined;
        const stg = stageChar(scene.shot, c, i);
        const depth = c.depth ?? (stg.silhouette ? 1.35 : 1);
        const lookPoint = resolveChoreographedLookAt(scene, c, i, staged, local, scene.durationFrames);
        const dyn = resolveDynamicExpression(scene, c, local, scene.durationFrames);
        const charSpecWithDyn: CharacterSpec = {
          ...c,
          expression: dyn.expression,
          emotion: dyn.emotion,
          emotionAt: dyn.emotionAt,
          ...(handAt == null ? {} : { holds: (ci === 1) === (frame < handAt) ? bodies[0].holds : undefined }),
        };
        // Cognitive Compression (God Mode Phase 5):
        // In abstract beats with an explanatory diagram, the diagram is the HERO.
        // The character steps to the side, scales down, and turns to gaze at the diagram!
        let activeCharSpec = charSpecWithDyn;
        let activeLookPoint = lookPoint;
        if (scene.diagram) {
          const diagX = scene.diagram.x ?? 960;
          const diagY = scene.diagram.y ?? 486;
          activeCharSpec = {
            ...activeCharSpec,
            x: 230,
            y: 840,
            scale: (c.scale ?? 1) * 0.58,
            body: "bust",
            // a physical situation is the beat's content, never swapped for a point
            action: KEEPS_ACTION.has(c.action) ? c.action : "point",
          };
          activeLookPoint = { x: diagX, y: diagY };
        }

        return (
          <AbsoluteFill key={c.id} style={camPlane(depth)}>
            {c.crowd && c.crowd > 1 ? (
              <CrowdLayer spec={activeCharSpec} shot={scene.shot} cast={cast} accent={accent} carry={carry} />
            ) : (
              <CharacterLayer
                spec={activeCharSpec}
                shot={scene.shot}
                index={i}
                cast={cast}
                durationFrames={scene.durationFrames}
                accent={accent}
                lookAtPoint={activeLookPoint}
                approach={scene.diagram ? 0 : contactDx(scene.shot, staged, i)}
                carry={carry}
                embraceRole={c.action === "embrace" && bodies.length === 2 && ci === 1 ? "partner" : "lead"}
                liftDx={lift ? { approach: ci === 0 ? lift.approach : 0, carry: lift.carry, back: ci === 0 ? lift.stepBack : 0 } : undefined}
                rest={cc && cc.rest ? cc.rest : undefined}
                exitDx={(() => { const L = leaveOf(ci); return L ? L.exitDx : undefined; })()}
              />
            )}
          </AbsoluteFill>
        );
      })}
      {/* a lift's destination in FRONT of the cast: set down into it, the lifted person is covered by its front */}
      {liftDest >= 0 ? renderProp(props[liftDest], liftDest) : null}
      {place ? (
        // already there: no draw-in, no pop — the kept destination at the deed's end position (reframed for this shot)
        <AbsoluteFill style={camPlane((place.prop as (typeof props)[number]).depth ?? 0.72)}>
          <Motif spec={{ ...(place.prop as (typeof props)[number]), at: 0, enter: "none", arc: "none", motion: undefined, x: place.dest.x, y: place.dest.y, scale: place.dest.scale }} accent={accent} ink={ink} />
        </AbsoluteFill>
      ) : null}
      {texts.map((tx, i) => {
        const st = stageText(scene.shot, tx, i);
        // `at` is authored against the narration, so it shifts with the pre-roll.
        // Copy usually stays on the focal plane (depth 1) so it reads crisp.
        return (
          <AbsoluteFill key={`t${i}`} style={camPlane(tx.depth ?? 1)}>
            <KineticText spec={{ ...tx, x: st.x, y: st.y, size: st.size, at: (tx.at ?? 0) + transIn }} />
          </AbsoluteFill>
        );
      })}
      {scene.relationshipStaging ? (
        <AbsoluteFill style={camPlane(1)}>
          <RelationshipStage spec={scene.relationshipStaging} local={local} durationFrames={scene.durationFrames} />
        </AbsoluteFill>
      ) : null}
      {t.overlay}
    </AbsoluteFill>
  );
};
