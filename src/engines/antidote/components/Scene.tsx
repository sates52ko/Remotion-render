import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Everyman } from "../characters/Everyman";
import { KineticText } from "./KineticText";
import { Backdrop } from "./Backdrop";
import { ChapterCard } from "./ChapterCard";
import { Diagram } from "./Diagram";
import { transitionRender } from "./Transition";
import { Motif } from "../motifs";
import { resolveBody, shotPreset, stageChar, stageText } from "../shots";
import { DEFAULT_TRANSITION, DEFAULT_VARIANT } from "../schema";
import { enter, pose, ambient, arcOf, parallax } from "../movements";
import { interpolate } from "remotion";
import { camera } from "../movements";
import { resolveChoreographedLookAt, resolveDynamicExpression, resolveVisualArcTransform } from "../choreography";
import type { SceneSpec, CharacterSpec, ShotName, VariantSpec, CastBible, BodyPlan, HandProp, CharEmotion } from "../schema";

/**
 * Scene — one beat of the film.
 *
 * Composition order: backdrop (parallax) → motifs → cast → kinetic copy, all
 * inside the scene camera, with the transition reveal wrapping the whole thing.
 * Staging comes from the SHOT preset unless the scene overrides it, which is
 * what turned "163 identical presenter frames" into an actual shot list.
 */

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
  emotion?: CharEmotion; emotionAt?: number;
}> = ({ variant, poseValue, silhouette, body, holds, accent, emotion, emotionAt }) => {
  if (!silhouette) return <Everyman variant={variant} pose={poseValue} body={body} holds={holds} accent={accent} emotion={emotion} emotionAt={emotionAt} />;
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
}> = ({ spec, shot, index, cast, durationFrames, accent, lookAtPoint }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const variant = resolveVariant(spec, cast);
  const st = stageChar(shot, spec, index);
  const body = resolveBody(shot, spec);
  const e = enter(spec.enter, frame, fps);
  let p = pose(spec.action, frame + (spec.poseAt ?? 0), fps);
  // LOOK-AT (4.0 + 4.1): turn gaze (2D) + head toward the resolved target. The whole rig is
  // drawn then flipped by the wrapper's scaleX, so a screen-space direction must
  // be negated back into rig space when the figure is flipped.
  if (lookAtPoint) {
    const eyeY = st.y - 120 * st.scale;
    const screenGx = Math.max(-1, Math.min(1, (lookAtPoint.x - st.x) / 520));
    const screenGy = Math.max(-1, Math.min(1, (lookAtPoint.y - eyeY) / 420));
    const gx = st.flip ? -screenGx : screenGx;
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
  const scale = st.scale * e.scale;
  // TRAVEL — the figure actually crosses the set over the beat. Without it a
  // `walk` is a gait cycle on a treadmill: the legs move and the person never
  // goes anywhere, which reads worse than not animating the legs at all.
  const travel = spec.travel
    ? interpolate(frame, [0, Math.max(1, durationFrames)], spec.travel, { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const isNervous = spec.emotion === "sweat";
  const jitterX = isNervous && frame >= (spec.emotionAt ?? 8) ? Math.sin(frame * 1.6) * 1.5 : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: st.x,
        top: st.y,
        opacity: e.opacity,
        filter: "drop-shadow(0 16px 28px rgba(0,0,0,0.14))",
        transform: `translate(-50%, -50%) translate(${e.tx + travel + jitterX}px, ${e.ty}px) scale(${scale}) scaleX(${st.flip ? -1 : 1})`,
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
      />
    </div>
  );
};

// ── the everyman, multiplied — "most people…", "everyone around you…" ───────
const CrowdLayer: React.FC<{ spec: CharacterSpec; shot: ShotName; cast?: CastBible; accent?: string }> = ({ spec, shot, cast, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hero = resolveVariant(spec, cast);
  const st = stageChar(shot, spec, 0);
  const body = resolveBody(shot, spec);
  const full = body === "full";
  const e = enter(spec.enter, frame, fps);
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
          const p = pose(isHero ? spec.action : "idle", frame + phase, fps);
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

// ── the scene: backdrop + camera-transformed stage + transition reveal ──────
export const Scene: React.FC<{ scene: SceneSpec; transIn?: number; cast?: CastBible; multiplane?: boolean }> = ({ scene, transIn = 0, cast, multiplane = false }) => {
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

  return (
    <AbsoluteFill style={t.style}>
      <Backdrop bg={bg} cam={cam} />
      {props.map((p, i) => {
        // A motif left at scale 1 means "however big this shot wants it";
        // an authored scale is taken literally.
        const s = p.scale ?? 1;
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
                  spec={{ ...p, x: p.x ?? preset.motif.x, y: p.y ?? preset.motif.y, scale: s * (s === 1 ? preset.motif.scale : 1) }}
                  accent={accent}
                  ink={ink}
                />
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
      {scene.diagram ? (
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
      {bodies.map((c, i) => {
        const stg = stageChar(scene.shot, c, i);
        const depth = c.depth ?? (stg.silhouette ? 1.35 : 1);
        const lookPoint = resolveChoreographedLookAt(scene, c, i, bodies, local, scene.durationFrames);
        const dyn = resolveDynamicExpression(scene, c, local, scene.durationFrames);
        const charSpecWithDyn: CharacterSpec = {
          ...c,
          expression: dyn.expression,
          emotion: dyn.emotion,
          emotionAt: dyn.emotionAt,
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
            action: (c.action === "walk" || c.action === "sit") ? c.action : "point",
          };
          activeLookPoint = { x: diagX, y: diagY };
        }

        return (
          <AbsoluteFill key={c.id} style={camPlane(depth)}>
            {c.crowd && c.crowd > 1 ? (
              <CrowdLayer spec={activeCharSpec} shot={scene.shot} cast={cast} accent={accent} />
            ) : (
              <CharacterLayer
                spec={activeCharSpec}
                shot={scene.shot}
                index={i}
                cast={cast}
                durationFrames={scene.durationFrames}
                accent={accent}
                lookAtPoint={activeLookPoint}
              />
            )}
          </AbsoluteFill>
        );
      })}
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
      {t.overlay}
    </AbsoluteFill>
  );
};
