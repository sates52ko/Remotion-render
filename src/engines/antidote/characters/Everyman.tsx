import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { BodyPlan, CharEmotion, HandProp, VariantSpec } from "../schema";
import type { Pose } from "../movements";
import { TAKE_REST_ARM, TAKE_REST_ELBOW } from "../movements";
import { HeldProp } from "../handprops";
import { Accessory, BackHair, Beard, darken, FrontHair, Headwear, HeadwearBack, Torso } from "../wardrobe";
import { EmotionOverlay } from "./Emotions";

/**
 * Everyman — a flat-vector, rigged, PARAMETRIC character in the Antidote style.
 *
 * One rig → a whole cast. `variant` drives colors, face, body proportions and a
 * wardrobe: hair · headwear · beard · garment · accessory · build · height ·
 * head-to-body ratio. All motion is transform-driven (limbs rotate at their
 * joints, mouth flaps, eyes blink) so animating is free and the character stays
 * perfectly consistent scene-to-scene.
 *
 * TWO BODY PLANS:
 *   bust — viewBox 400×600, waist-up. The original rig; correct for close-ups
 *          and the presenter shots, and what every pre-3.0 config renders as.
 *   full — viewBox 400×900, hips + legs + feet. What a `wide`, a `crowd` or a
 *          `diorama` actually needs: a torso hovering over a street was the
 *          single clearest "this is a template" tell in the old engine. Legs
 *          unlock walking (see gait() in movements.ts) and sitting.
 *
 * THE FOUNDRY (3.1). Silhouette, not draughtsmanship, is what makes a character
 * read as belonging to a particular book — so `height`, `build` and `headScale`
 * reshape the body, `headwear` and `outfit` reshape its outline, and `overlay`
 * takes hand-authored paths for the one or two signature characters a
 * combination can't reach. The parts themselves live in `../wardrobe`.
 *
 * A character can also HOLD something: `holds` drops a glyph into the right
 * hand, inside the arm group, so the arm's rotation carries it and a
 * counter-rotation keeps the object upright.
 */

export type Variant = VariantSpec;

// Lower-body geometry (full plan). The torso above the hip line is identical in
// both plans, so a bust and a full rig at the same scale have the same head.
const HIP_Y = 596;
const THIGH = 140;
const SHIN = 120;

// Torso mass. Applied as a horizontal scale about the body's centre line, so it
// widens the garment, the shoulders and the hips together and never touches the
// face — a wide body with a wide head reads as a distortion, not as a build.
const BUILD_W: Record<string, number> = { slight: 0.9, average: 1, heavy: 1.15 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Neutral mouth. v1 (the shipped curve) sags 3 units BELOW its corners, which is a U
// shape = a faint smile: a neutral face read as grinning (Beloved scene-208, WRONG).
// v2 is flat and is the default since the face-fidelity pack (2026-10-17): configured-neutral
// faces read "smiling" 19% of the time (49% with stubble). v1 is kept only as a reference.
export const NEUTRAL_MOUTH_PATHS = {
  v1: "M176,214 Q200,220 224,214",
  v2: "M176,214 Q200,214 224,214",
} as const;
export type NeutralMouthVersion = keyof typeof NEUTRAL_MOUTH_PATHS;
export const NEUTRAL_MOUTH_VERSION: NeutralMouthVersion = "v2";

// Expression → eyebrow shape (inner/outer y) + mouth curve. Smaller y = higher.
function face(expr: VariantSpec["expression"], mouth: number) {
  let browOuter = 102, browInner = 100;
  let mouthPath: string = NEUTRAL_MOUTH_PATHS[NEUTRAL_MOUTH_VERSION];
  let lid = 0, openMin = 0; // lid: resting eyelid drop 0..1; openMin: mouth held open
  switch (expr) {
    case "happy": browOuter = 98; browInner = 96; mouthPath = "M166,208 Q200,246 234,208"; break;
    case "sad": browOuter = 104; browInner = 92; mouthPath = "M176,226 Q200,206 224,226"; break;
    case "surprised": browOuter = 84; browInner = 82; mouthPath = "M188,214 Q200,214 212,214"; break;
    case "worried": browOuter = 103; browInner = 90; mouthPath = "M176,222 Q188,215 200,221 Q212,227 224,220"; break;
    // inner brows pulled DOWN into a V, tight downturned mouth, slightly narrowed eyes
    case "angry": browOuter = 90; browInner = 112; mouthPath = "M178,224 Q200,210 222,224"; lid = 0.25; break;
    // one-sided smile + heavy lids: charm with an edge (the villain's face)
    case "smirk": browOuter = 97; browInner = 104; mouthPath = "M180,219 Q208,224 232,203"; lid = 0.4; break;
    // flat brows, flat mouth, half-closed eyes: apathy, numbness
    case "blank": browOuter = 104; browInner = 104; mouthPath = "M186,218 L214,218"; lid = 0.55; break;
    // inner brows raised, wide eyes, mouth open: fear (not surprise — the brows slant)
    case "afraid": browOuter = 98; browInner = 82; mouthPath = "M184,224 Q200,214 216,224"; openMin = 0.55; break;
    default: break;
  }
  return { browOuter, browInner, mouthPath, open: Math.max(openMin, Math.min(1, mouth)), wide: expr === "surprised" || expr === "afraid", lid };
}

const Hand: React.FC<{ cx: number; cy: number; skin: string; thumb?: 1 | -1 }> = ({ cx, cy, skin, thumb = 1 }) => (
  <g>
    <ellipse cx={cx} cy={cy} rx={18} ry={21} fill={skin} />
    <ellipse cx={cx + 15 * thumb} cy={cy - 8} rx={7} ry={10} fill={skin} transform={`rotate(${25 * thumb} ${cx + 15 * thumb} ${cy - 8})`} />
  </g>
);

/**
 * Arm — upper arm + forearm, hinged at the elbow.
 *
 * The rig used to be a single rigid rect from shoulder to hand, so "hold this"
 * could only swing the whole limb out to arm's length. With an elbow the hand
 * can come across the body, which is where a person actually holds a book.
 */
const Arm: React.FC<{
  side: -1 | 1; shoulderX: number; shoulder: number; elbow: number; suit: string; skin: string;
  /** 0..1 — an impact burst just past the fist (a punch landing). */
  burst?: number;
}> = ({ side, shoulderX, shoulder, elbow, suit, skin, burst = 0 }) => (
  <g transform={`rotate(${shoulder} ${shoulderX} 322)`}>
    <rect x={shoulderX - 18} y={318} width={36} height={96} rx={18} fill={suit} />
    <g transform={`rotate(${elbow} ${shoulderX} 410)`}>
      <rect x={shoulderX - 18} y={402} width={36} height={96} rx={18} fill={suit} />
      <Hand cx={shoulderX} cy={498} skin={skin} thumb={side} />
      {burst > 0.02 && (
        <polygon
          points={Array.from({ length: 16 }, (_, k) => {
            const r = (k % 2 ? 22 : 50) * burst;
            const a = (k / 16) * Math.PI * 2;
            return `${shoulderX + Math.sin(a) * r},${552 + Math.cos(a) * r}`;
          }).join(" ")}
          fill="#FFD23F" stroke="#26241F" strokeWidth={4} strokeLinejoin="round"
        />
      )}
    </g>
  </g>
);

/**
 * Leg — thigh + shin + foot, hinged at hip and knee.
 *
 * `sit` shortens the thigh (foreshortening: seated thighs point at the viewer)
 * and splays it outward, while the shin swings back to vertical — the standard
 * flat-vector cheat for a front-facing seated figure.
 */
const Leg: React.FC<{
  side: -1 | 1; hipX: number; thigh: number; knee: number; sit: number; suit: string; shoe: string;
}> = ({ side, hipX, thigh, knee, sit, suit, shoe }) => {
  // SVG rotate() is clockwise, so a limb hanging BELOW its pivot swings toward
  // screen-left on a positive angle. Seated thighs must open AWAY from the
  // midline, so the splay is negated per side.
  // 66° of splay read as a sumo squat, not as sitting. A seated front-facing
  // figure has its knees roughly under its shoulders and its thighs pointing at
  // the viewer — which in flat vector means a SHORT thigh (foreshortened) and
  // only a few degrees of opening.
  const splay = -sit * 18 * side;
  // A seated thigh points AT the viewer, so in flat vector it is almost gone:
  // the knee sits just below the hip and the shin does all the visible work.
  // At 0.52 the legs still read as standing-with-a-stool behind them.
  const thighLen = THIGH * (1 - sit * 0.78);
  const kneeY = HIP_Y + thighLen;
  // Seated: the shin cancels the thigh's splay so the lower leg hangs vertical
  // and the feet land back on the same floor line as when standing.
  const shin = knee - splay;
  const footY = kneeY + SHIN;
  const heel = hipX - 19 * side;
  const toe = hipX + 42 * side;
  return (
    <g transform={`rotate(${-thigh + splay} ${hipX} ${HIP_Y})`}>
      <rect x={hipX - 21} y={HIP_Y - 14} width={42} height={thighLen + 18} rx={20} fill={suit} />
      <g transform={`rotate(${shin} ${hipX} ${kneeY})`}>
        <rect x={hipX - 17} y={kneeY - 10} width={34} height={SHIN + 14} rx={16} fill={suit} />
        {/* foot points away from the body's midline, heel behind the ankle */}
        <path
          d={`M${heel},${footY} L${toe},${footY} Q${toe + 8 * side},${footY + 6} ${toe + 4 * side},${footY + 20} L${heel},${footY + 20} Z`}
          fill={shoe}
        />
      </g>
    </g>
  );
};

export const Everyman: React.FC<{
  variant: Variant;
  pose: Pose;
  width?: number;
  /** bust (waist-up, default — every pre-3.0 config) or full (hips + legs). */
  body?: BodyPlan;
  /** A glyph placed in the right hand, carried by the arm's own rotation. */
  holds?: HandProp;
  /** Accent for the held glyph; defaults to the character's shirt color. */
  accent?: string;
  /** Micro-reaction emotion overlay above the head */
  emotion?: CharEmotion;
  /** Frame when the emotion appears (defaults to 8) */
  emotionAt?: number;
}> = ({ variant, pose, width = 400, body = "bust", holds, accent, emotion, emotionAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { skin, hair, suit, shirt, expression, hairStyle, glasses, beard, gender, age, outfit } = variant;
  const full = body === "full";
  const boxH = full ? 900 : 600;
  const hipY = pose.hipY ?? 0;
  const sit = pose.sit ?? 0;
  const shoe = darken(suit, 0.55);
  const holdInk = "#26241F";
  const holdAccent = accent || (shirt && shirt.toUpperCase() !== "#FFFFFF" ? shirt : darken(suit, 0.72));
  const armRot = pose.armR;
  const elbowRot = pose.elbowR ?? 0;

  // ── foundry proportions ───────────────────────────────────────────────────
  // `height` scales the whole figure about the GROUND, so a child and an adult
  // in the same shot stand on the same floor line instead of floating at
  // different heights. `build` widens the body only. `headScale` grows the head
  // from the neck up — a child is not a shrunken adult, it is a big head on a
  // short body, and that ratio is most of what reads as "child" in silhouette.
  const buildW = BUILD_W[variant.build ?? "average"] ?? 1;
  const height = clamp(variant.height ?? 1, 0.6, 1.3);
  const headScale = clamp(variant.headScale ?? 1, 0.8, 1.4);
  // A tipped figure always has legs: a bust lying on its side is a torso that
  // stops at the waist (rendered, it read as nothing). In a bust framing the whole
  // body is drawn, then fitted back into the bust's own footprint (see `fit`).
  const tip = pose.tip ?? 0;
  const tipped = Math.abs(tip) > 0.01;
  const legs = full || tipped;
  const ground = legs ? 896 : 600; // rig floor line
  const boxGround = full ? 896 : 600; // floor line of the box the shot staged
  const fit = legs && !full ? (600 - 46) / (896 - 46) : 1;
  const trim = variant.trim || darken(suit, 0.7);
  const overlay = variant.overlay ?? [];
  const behind = overlay.filter((o) => o.layer === "behind");
  const front = overlay.filter((o) => o.layer !== "behind");

  const f = face(expression, pose.mouth);
  const eyeRy = f.wide ? 20 : 14;
  const lipColor = gender === "f" ? "#B5615A" : darken(skin, 0.5);
  const browCol = darken(hair === "#FFFFFF" || hair.toLowerCase() === "#fff" ? "#9a9a9a" : hair, 0.75);
  const beardCol = darken(hair, 0.85);

  // ── TIP (2026-09-28): the whole figure rotated about its feet. Lying and
  // collapsed are -90 (head screen-left), falling is part-way. Limb angles alone
  // cannot make a body lie down — a standing rig with bent limbs still reads as
  // standing. The tipped body is re-centred over its own anchor (so a lying
  // figure stays where the shot placed it) and its lowest edge rests on the
  // floor line, plus `rise` (the mattress, or airborne mid-fall).
  const rad =(tip * Math.PI) / 180;
  const LEN = ground - 46; // crown of the head → floor
  const HALF_W = 122; // shoulders + hanging arms, half width
  const rise = pose.rise ?? 0;
  const tipDx = -(LEN / 2) * Math.sin(rad);
  const tipDy = -HALF_W * Math.abs(Math.sin(rad)) - rise;
  const toScreen = (rx: number, ry: number) => {
    const a = rx - 200, b = ry - ground;
    return { x: 200 + a * Math.cos(rad) - b * Math.sin(rad) + tipDx, y: ground + a * Math.sin(rad) + b * Math.cos(rad) + tipDy };
  };
  const corners = tipped ? [toScreen(200 - HALF_W, 46), toScreen(200 + HALF_W, 46), toScreen(200 - HALF_W, ground), toScreen(200 + HALF_W, ground)] : [];
  const topY = corners.length ? Math.min(...corners.map((c) => c.y)) : 0;
  const mid = toScreen(200, ground - LEN / 2);
  const headAt = toScreen(200, 150);
  const bed = tipped ? clamp(pose.bed ?? 0, 0, 1) : 0;
  const streaks = tipped ? clamp(pose.streaks ?? 0, 0, 1) : 0;
  const strain = clamp(pose.strain ?? 0, 0, 1);
  const flat = Math.abs(Math.sin(rad));

  return (
    <svg width={width} height={(width * boxH) / 400} viewBox={`0 0 400 ${boxH}`} style={{ overflow: "visible" }}>
      <g transform={fit !== 1 ? `translate(200 ${boxGround}) scale(${fit}) translate(-200 ${-ground})` : undefined}>
      <g transform={`translate(200 ${ground}) scale(${height}) translate(-200 ${-ground})`}>
        {/* contact shadow — a tipped body without one floats in the set */}
        {tipped && (
          <ellipse cx={mid.x} cy={ground + 6} rx={(LEN / 2) * flat + 70} ry={18} fill="#000" opacity={0.18 * flat * (rise > 40 && !bed ? 0.55 : 1)} />
        )}
        {/* A BED. Like the stool under `sit`: a horizontal body in empty space
            reads as a floating plank, so the rig brings the furniture that makes
            the read. Mattress top = the body's lowest edge (ground - rise). */}
        {bed > 0 && (
          <g opacity={bed}>
            <rect x={200 - LEN / 2 - 44} y={ground - rise} width={LEN + 88} height={rise - 10} rx={14} fill="#E9E4DA" stroke="#6E6A62" strokeWidth={5} />
            <rect x={200 - LEN / 2 - 44} y={ground - 16} width={26} height={16} rx={4} fill="#6E6A62" />
            <rect x={200 + LEN / 2 + 18} y={ground - 16} width={26} height={16} rx={4} fill="#6E6A62" />
            <rect x={200 - LEN / 2 - 60} y={ground - rise - 150} width={22} height={150} rx={8} fill="#6E6A62" />
            <rect x={headAt.x - 120} y={ground - rise - 46} width={240} height={52} rx={24} fill="#FFFFFF" stroke="#6E6A62" strokeWidth={4} />
          </g>
        )}
        {/* motion streaks trail ABOVE a falling body: it is moving down */}
        {streaks > 0.02 && (
          <g stroke="#26241F" strokeWidth={8} strokeLinecap="round" opacity={0.55 * streaks}>
            {[-150, 0, 150].map((dx, k) => (
              <line key={k} x1={mid.x + dx} y1={topY - 24 - k * 10} x2={mid.x + dx} y2={topY - 24 - k * 10 - 130 * streaks} />
            ))}
          </g>
        )}
        <g transform={tipped ? `translate(${tipDx} ${tipDy}) rotate(${tip} 200 ${ground})` : undefined}>
        {/* hipY carries the walk bounce and the drop into a chair; the whole
            figure moves together so the legs never detach from the torso. */}
        <g transform={`translate(0 ${hipY}) rotate(${pose.lean} 200 ${legs ? HIP_Y : 560})`}>
          {behind.map((o, i) => <path key={`ob${i}`} d={o.d} fill={o.fill} opacity={o.opacity ?? 1} />)}

          {/* BODY — build widens everything below the neck and nothing above it */}
          <g transform={`translate(200 0) scale(${buildW} 1) translate(-200 0)`}>
            {/* legs first: they sit BEHIND the garment, which closes at the hips */}
            {/* A SEAT. No pose reads as "sitting" in empty space — without
                something under them a seated figure reads as a crouch. The rig
                brings its own stool so the read never depends on whether the
                backdrop happened to place furniture at the right x. */}
            {legs && sit > 0.35 && (() => {
              // The plank must be WIDER than the garment or it hides behind the
              // coat, and it must meet the HEM (y 610) rather than sit below it.
              // Placed lower, the body never visibly touches the seat and the
              // figure reads as standing behind a bench; at the hem the garment
              // drapes over the front edge and the thighs come forward across
              // it, which is what "sitting" looks like from the front.
              const seatTop = HIP_Y + 6;
              const legH = Math.max(20, 876 - hipY - (seatTop + 22));
              return (
                <g fill="#6E6A62" opacity={0.95}>
                  <rect x={46} y={seatTop} width={308} height={22} rx={8} />
                  <rect x={64} y={seatTop + 22} width={18} height={legH} rx={6} />
                  <rect x={318} y={seatTop + 22} width={18} height={legH} rx={6} />
                  <rect x={82} y={seatTop + 22 + legH * 0.55} width={236} height={12} rx={5} opacity={0.75} />
                </g>
              );
            })()}

            {legs && (
              <>
                <Leg side={-1} hipX={158} thigh={pose.legL ?? 0} knee={pose.kneeL ?? 0} sit={sit} suit={darken(suit, 0.86)} shoe={shoe} />
                <Leg side={1} hipX={242} thigh={pose.legR ?? 0} knee={pose.kneeR ?? 0} sit={sit} suit={suit} shoe={shoe} />
              </>
            )}

            {/* arms behind torso */}
            <Arm side={-1} shoulderX={96} shoulder={pose.armL} elbow={pose.elbowL ?? 0} suit={suit} skin={skin} />
            <Arm side={1} shoulderX={304} shoulder={armRot} elbow={elbowRot} suit={suit} skin={skin} burst={pose.impact ?? 0} />

            {/* Organic breathing chest expansion */}
            <g transform={`translate(200 360) scale(1 ${1 + Math.sin((frame / 48) * Math.PI * 2) * 0.008}) translate(-200 -360)`}>
              <Torso outfit={outfit} suit={suit} shirt={shirt} full={legs} />
              <Accessory style={variant.accessory ?? "none"} color={trim} skin={skin} />
            </g>

            {/* Held prop — drawn AFTER the torso so it reads as being in front of
                the body, but transformed by the same shoulder+elbow chain as the
                hand it sits in, then counter-rotated so the object stays upright.
                The extra scaleX undoes `build`, or a heavy character would carry
                a stretched book. */}
            {/* AUTHORED `take` before its cue (pose.take === 0): the object RESTS where the reaching hand will
                close on it — the settled reach angles of the same shoulder/elbow chain — on a small stand, upright.
                The hand is empty. From the cue (pose.take === 1) the branch below draws it in the hand. */}
            {holds && pose.take === 0 ? (
              <g transform={`rotate(${TAKE_REST_ARM} 304 322)`}>
                <g transform={`rotate(${TAKE_REST_ELBOW} 304 410)`}>
                  <g transform={`translate(304 462) rotate(${-(TAKE_REST_ARM + TAKE_REST_ELBOW) - pose.lean}) scale(${0.82 / buildW} 0.82)`}>
                    <rect x={-70} y={52} width={140} height={14} rx={5} fill={darken(suit, 0.55)} opacity={0.9} />
                    <rect x={-8} y={64} width={16} height={150} rx={5} fill={darken(suit, 0.55)} opacity={0.75} />
                    <HeldProp prop={holds} ink={holdInk} accent={holdAccent} />
                  </g>
                </g>
              </g>
            ) : null}
            {holds && pose.take !== 0 ? (
              <g transform={`rotate(${armRot} 304 322)`}>
                <g transform={`rotate(${elbowRot} 304 410)`}>
                  {/* The forearm and hand are redrawn HERE, in front of the
                      garment. The arm proper is behind the torso — which is
                      right for a figure standing at rest and wrong the moment
                      it holds something: the object floated with no hand on it.
                      Same transform chain, so it lands exactly on the arm. */}
                  <rect x={304 - 18} y={402} width={36} height={96} rx={18} fill={suit} />
                  {/* hand first, object raised above it: the fingers show under
                      the lower edge, which is how a hand HOLDS a thing. Drawn
                      the other way round the hand lands as a skin blob in the
                      middle of the page. */}
                  <Hand cx={304} cy={498} skin={skin} thumb={1} />
                  <g transform={`translate(304 462) rotate(${-(armRot + elbowRot)}) scale(${0.82 / buildW} 0.82)`}>
                    <HeldProp prop={holds} ink={holdInk} accent={holdAccent} />
                  </g>
                </g>
              </g>
            ) : null}

            {/* neck */}
            <rect x={178} y={244} width={44} height={54} rx={16} fill={darken(skin, 0.92)} />
          </g>

          {/* HEAD — its own group so build never distorts the face, and
              headScale grows it from the neck up. `headX` shifts it toward a
              look-at target; `headYaw` (default 1) scales it horizontally for a
              ¾-turn illusion, wrapped around the head centre so it never moves
              the neck. Both are no-ops at their defaults (4.0 look-at). */}
          <g transform={`translate(${pose.headX ?? 0} ${pose.headY}) translate(200 262) scale(${headScale}) translate(-200 -262)`}>
           <g transform={`translate(200 150) scale(${pose.headYaw ?? 1} 1) translate(-200 -150)`}>
            {/* a hood's drape belongs BEHIND the head — in front it is a mask */}
            <HeadwearBack style={variant.headwear ?? "none"} color={trim} accent={shirt} />
            <BackHair style={hairStyle} color={hair} />
            <ellipse cx={112} cy={158} rx={14} ry={20} fill={skin} />
            <ellipse cx={288} cy={158} rx={14} ry={20} fill={skin} />
            <ellipse cx={200} cy={150} rx={92} ry={104} fill={skin} />
            <FrontHair style={hairStyle} color={hair} />
            <Beard style={beard} color={beardCol} />

            {/* eyebrows */}
            <g transform={`translate(0 ${pose.browY})`} stroke={browCol} strokeWidth={6} strokeLinecap="round">
              <line x1={150} y1={f.browOuter} x2={186} y2={f.browInner} />
              <line x1={250} y1={f.browOuter} x2={214} y2={f.browInner} />
            </g>

            {/* eyes — blink squashes the whites; 2D gaze offsets pupils + living catchlights */}
            {(() => {
              const blinkRy = eyeRy * (1 - pose.blink * 0.92); // nearly shut at blink=1
              const rawDx = (pose.gazeX ?? 0) * 6.5; // ±6.5px max offset
              const rawDy = (pose.gazeY ?? 0) * 4.5 + Math.abs(pose.gazeX ?? 0) * 0.8;
              const pupilDx = clamp(rawDx, -7.5, 7.5);
              const pupilDy = clamp(rawDy, -5.5, 5.5);
              // Eyelid: a skin-colored arc that covers the top of the eye during blinks
              const lidDrop = Math.max(pose.blink, f.lid) * (eyeRy * 0.85);
              return (
                <>
                  <ellipse cx={168} cy={132} rx={15} ry={blinkRy} fill="#FFFFFF" />
                  <ellipse cx={232} cy={132} rx={15} ry={blinkRy} fill="#FFFFFF" />
                  {pose.blink < 0.85 && (
                    <>
                      <circle cx={170 + pupilDx} cy={134 + pupilDy} r={7} fill="#26241F" />
                      <circle cx={234 + pupilDx} cy={134 + pupilDy} r={7} fill="#26241F" />
                      {/* Living eye catchlight reflections */}
                      <circle cx={170 + pupilDx + 2} cy={134 + pupilDy - 2} r={1.8} fill="#FFFFFF" opacity={0.88} />
                      <circle cx={234 + pupilDx + 2} cy={134 + pupilDy - 2} r={1.8} fill="#FFFFFF" opacity={0.88} />
                    </>
                  )}
                  {(pose.blink > 0.05 || f.lid > 0) && (
                    <>
                      <ellipse cx={168} cy={132 - eyeRy + lidDrop} rx={17} ry={lidDrop * 0.7 + 2} fill={skin} />
                      <ellipse cx={232} cy={132 - eyeRy + lidDrop} rx={17} ry={lidDrop * 0.7 + 2} fill={skin} />
                    </>
                  )}
                  {/* Lid line: a shut or heavy-lidded eye is a skin patch with no edge, which
                      blind viewers read as "eyes missing". Past half-closed, draw the lid's
                      edge as a dark arc on the eye (at the lid's lower rim, never below the
                      eye's own squashed centre line). */}
                  {Math.max(pose.blink, f.lid) > 0.5 && (() => {
                    const lidLine = Math.min(132 - eyeRy + lidDrop * 1.7 + 2, 132 + blinkRy);
                    return (
                      <g fill="none" stroke="#26241F" strokeWidth={4} strokeLinecap="round">
                        <path d={`M153,${lidLine - 3} Q168,${lidLine + 3} 183,${lidLine - 3}`} />
                        <path d={`M217,${lidLine - 3} Q232,${lidLine + 3} 247,${lidLine - 3}`} />
                      </g>
                    );
                  })()}
                </>
              );
            })()}
            {gender === "f" && (
              <g stroke="#26241F" strokeWidth={3} strokeLinecap="round">
                <line x1={154} y1={124} x2={148} y2={120} />
                <line x1={246} y1={124} x2={252} y2={120} />
              </g>
            )}

            {/* glasses */}
            {glasses && (
              <g stroke="#2b2b2b" strokeWidth={5} fill="rgba(255,255,255,0.12)">
                <rect x={146} y={116} width={44} height={34} rx={12} />
                <rect x={210} y={116} width={44} height={34} rx={12} />
                <line x1={190} y1={132} x2={210} y2={132} />
              </g>
            )}

            {/* nose */}
            <path d="M198,150 Q192,178 202,180" fill="none" stroke={darken(skin, 0.8)} strokeWidth={5} strokeLinecap="round" />

            {/* age lines */}
            {age === "old" && (
              <g fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth={3} strokeLinecap="round">
                <path d="M150,102 Q200,96 250,102" />
                <path d="M168,188 Q160,206 168,222" />
                <path d="M232,188 Q240,206 232,222" />
              </g>
            )}

            {/* mouth */}
            {f.open > 0.05 && <ellipse cx={200} cy={216} rx={20} ry={2 + f.open * 15} fill="#7A3B3B" />}
            <path d={f.mouthPath} fill="none" stroke={lipColor} strokeWidth={gender === "f" ? 7 : 6} strokeLinecap="round" />

            {/* headwear sits over hair and face alike — it IS the outline */}
            <Headwear style={variant.headwear ?? "none"} color={trim} accent={shirt} />

            {/* Over-the-head reactive emotion micro-animation */}
            <EmotionOverlay emotion={emotion} at={emotionAt} frame={frame} fps={fps} />
           </g>
          </g>

          {front.map((o, i) => <path key={`of${i}`} d={o.d} fill={o.fill} opacity={o.opacity ?? 1} />)}

          {/* effort marks beside the head — straining, not merely leaning */}
          {strain > 0.02 && (
            <g stroke="#26241F" strokeWidth={7} strokeLinecap="round" opacity={0.7 * strain} transform={`translate(${pose.headX ?? 0} ${pose.headY})`}>
              <line x1={76} y1={96} x2={42} y2={74} /><line x1={70} y1={150} x2={30} y2={150} /><line x1={76} y1={204} x2={42} y2={226} />
              <line x1={324} y1={96} x2={358} y2={74} /><line x1={330} y1={150} x2={370} y2={150} /><line x1={324} y1={204} x2={358} y2={226} />
            </g>
          )}
        </g>
        </g>
      </g>
      </g>
    </svg>
  );
};
