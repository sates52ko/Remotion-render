import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { BodyPlan, CharEmotion, HandProp, VariantSpec } from "../schema";
import type { Pose } from "../movements";
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

// Expression → eyebrow shape (inner/outer y) + mouth curve. Smaller y = higher.
function face(expr: VariantSpec["expression"], mouth: number) {
  let browOuter = 102, browInner = 100;
  let mouthPath = "M176,214 Q200,220 224,214";
  switch (expr) {
    case "happy": browOuter = 98; browInner = 96; mouthPath = "M166,208 Q200,246 234,208"; break;
    case "sad": browOuter = 104; browInner = 92; mouthPath = "M176,226 Q200,206 224,226"; break;
    case "surprised": browOuter = 84; browInner = 82; mouthPath = "M188,214 Q200,214 212,214"; break;
    case "worried": browOuter = 103; browInner = 90; mouthPath = "M176,222 Q188,215 200,221 Q212,227 224,220"; break;
    default: break;
  }
  return { browOuter, browInner, mouthPath, open: Math.max(0, Math.min(1, mouth)), wide: expr === "surprised" };
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
}> = ({ side, shoulderX, shoulder, elbow, suit, skin }) => (
  <g transform={`rotate(${shoulder} ${shoulderX} 322)`}>
    <rect x={shoulderX - 18} y={318} width={36} height={96} rx={18} fill={suit} />
    <g transform={`rotate(${elbow} ${shoulderX} 410)`}>
      <rect x={shoulderX - 18} y={402} width={36} height={96} rx={18} fill={suit} />
      <Hand cx={shoulderX} cy={498} skin={skin} thumb={side} />
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
  const ground = full ? 896 : 600;
  const trim = variant.trim || darken(suit, 0.7);
  const overlay = variant.overlay ?? [];
  const behind = overlay.filter((o) => o.layer === "behind");
  const front = overlay.filter((o) => o.layer !== "behind");

  const f = face(expression, pose.mouth);
  const eyeRy = f.wide ? 20 : 14;
  const lipColor = gender === "f" ? "#B5615A" : darken(skin, 0.5);
  const browCol = darken(hair === "#FFFFFF" || hair.toLowerCase() === "#fff" ? "#9a9a9a" : hair, 0.75);
  const beardCol = darken(hair, 0.85);

  return (
    <svg width={width} height={(width * boxH) / 400} viewBox={`0 0 400 ${boxH}`} style={{ overflow: "visible" }}>
      <g transform={`translate(200 ${ground}) scale(${height}) translate(-200 ${-ground})`}>
        {/* hipY carries the walk bounce and the drop into a chair; the whole
            figure moves together so the legs never detach from the torso. */}
        <g transform={`translate(0 ${hipY}) rotate(${pose.lean} 200 ${full ? HIP_Y : 560})`}>
          {behind.map((o, i) => <path key={`ob${i}`} d={o.d} fill={o.fill} opacity={o.opacity ?? 1} />)}

          {/* BODY — build widens everything below the neck and nothing above it */}
          <g transform={`translate(200 0) scale(${buildW} 1) translate(-200 0)`}>
            {/* legs first: they sit BEHIND the garment, which closes at the hips */}
            {/* A SEAT. No pose reads as "sitting" in empty space — without
                something under them a seated figure reads as a crouch. The rig
                brings its own stool so the read never depends on whether the
                backdrop happened to place furniture at the right x. */}
            {full && sit > 0.35 && (() => {
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

            {full && (
              <>
                <Leg side={-1} hipX={158} thigh={pose.legL ?? 0} knee={pose.kneeL ?? 0} sit={sit} suit={darken(suit, 0.86)} shoe={shoe} />
                <Leg side={1} hipX={242} thigh={pose.legR ?? 0} knee={pose.kneeR ?? 0} sit={sit} suit={suit} shoe={shoe} />
              </>
            )}

            {/* arms behind torso */}
            <Arm side={-1} shoulderX={96} shoulder={pose.armL} elbow={pose.elbowL ?? 0} suit={suit} skin={skin} />
            <Arm side={1} shoulderX={304} shoulder={armRot} elbow={elbowRot} suit={suit} skin={skin} />

            {/* Organic breathing chest expansion */}
            <g transform={`translate(200 360) scale(1 ${1 + Math.sin((frame / 48) * Math.PI * 2) * 0.008}) translate(-200 -360)`}>
              <Torso outfit={outfit} suit={suit} shirt={shirt} full={full} />
              <Accessory style={variant.accessory ?? "none"} color={trim} skin={skin} />
            </g>

            {/* Held prop — drawn AFTER the torso so it reads as being in front of
                the body, but transformed by the same shoulder+elbow chain as the
                hand it sits in, then counter-rotated so the object stays upright.
                The extra scaleX undoes `build`, or a heavy character would carry
                a stretched book. */}
            {holds ? (
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
              const lidDrop = pose.blink * (eyeRy * 0.85);
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
                  {pose.blink > 0.05 && (
                    <>
                      <ellipse cx={168} cy={132 - eyeRy + lidDrop} rx={17} ry={lidDrop * 0.7 + 2} fill={skin} />
                      <ellipse cx={232} cy={132 - eyeRy + lidDrop} rx={17} ry={lidDrop * 0.7 + 2} fill={skin} />
                    </>
                  )}
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
        </g>
      </g>
    </svg>
  );
};
