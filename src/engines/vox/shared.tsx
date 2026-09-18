import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Beat } from "./schema";
import { PAPER, INK, RED, HEADLINE, CAPTION_BAND, hash } from "./palette";
import { AccentBurst } from "./backgrounds";
import { SourceFootnote } from "./documents";

/**
 * beatAnchors — the sub-beat event clock for an archetype.
 *
 * Returns `count` start-frames for a scene's on-screen words. When the planner
 * supplied `props.anchors` (frames at which each word is actually SPOKEN) those
 * win, so the reveal lands on the word — Johnny-Harris style — instead of the
 * whole scene firing inside its first second and then holding dead for 7s.
 * Without anchors it falls back to the original fixed cadence, so pre-existing
 * configs render exactly as before.
 *
 * Anchors are clamped to leave `HOLD` frames of read time before the cut.
 */
const HOLD = 26; // a word must stay up this long or it just flashes
export function beatAnchors(beat: Beat, count: number, base: number, step: number): number[] {
  const a = beat.props.anchors;
  const latest = Math.max(base, beat.durationFrames - HOLD);
  return Array.from({ length: count }, (_, i) => {
    const fallback = base + i * step;
    const v = a && Number.isFinite(a[i]) ? (a[i] as number) : fallback;
    return Math.min(Math.max(0, Math.round(v)), latest);
  });
}

export const KineticWords: React.FC<{
  text: string; startFrame: number; perWord?: number; fontSize: number; color?: string; fontFamily?: string;
  weight?: number | string; letterSpacing?: number; align?: "left" | "center"; maxWidth?: number; italic?: boolean; uppercase?: boolean;
}> = ({ text, startFrame, perWord = 4, fontSize, color = INK, fontFamily = HEADLINE, weight = 900, letterSpacing = 0, align = "center", maxWidth = 1500, italic = false, uppercase = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: `${fontSize * 0.1}px ${fontSize * 0.28}px`, maxWidth, justifyContent: align === "center" ? "center" : "flex-start", lineHeight: 0.98 }}>
      {text.split(" ").map((w, i) => {
        const sf = startFrame + i * perWord;
        const s = spring({ frame: frame - sf, fps, config: { damping: 15, mass: 0.55, stiffness: 130 }, durationInFrames: 20 });
        const y = interpolate(s, [0, 1], [54, 0]);
        const rot = interpolate(s, [0, 1], [4, 0]);
        const op = interpolate(frame, [sf, sf + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <span key={i} style={{ display: "inline-block", transform: `translateY(${y}px) rotate(${rot}deg)`, opacity: op, fontFamily, fontWeight: weight, fontStyle: italic ? "italic" : "normal", fontSize, color, letterSpacing, textTransform: uppercase ? "uppercase" : "none" }}>{w}</span>
        );
      })}
    </div>
  );
};

export const MarkerUnderline: React.FC<{ startFrame: number; width: number; height?: number; color?: string; rotate?: number }> = ({ startFrame, width, height = 14, color = RED, rotate = -1.2 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [startFrame, startFrame + 13], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <div style={{ width: Math.max(0, width * p), height, backgroundColor: color, borderRadius: height, transform: `rotate(${rotate}deg)`, transformOrigin: "left center", opacity: 0.92 }} />;
};

export const KickerChip: React.FC<{ text: string; startFrame: number; align?: "left" | "center" }> = ({ text, startFrame, align = "left" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!text) return null;
  const s = spring({ frame: frame - startFrame, fps, config: { damping: 16, mass: 0.6, stiffness: 130 }, durationInFrames: 16 });
  const op = interpolate(frame, [startFrame, startFrame + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ alignSelf: align === "center" ? "center" : "flex-start", transform: `translateX(${interpolate(s, [0, 1], [-30, 0])}px)`, opacity: op, background: RED, color: PAPER, fontFamily: HEADLINE, fontWeight: 900, fontSize: 26, letterSpacing: 3, padding: "8px 16px", textTransform: "uppercase", boxShadow: `6px 6px 0 ${INK}` }}>{text}</div>
  );
};

export const Cutout: React.FC<{ asset: string; startFrame: number; height: number; strokeX?: number; strokeY?: number; tint?: string }> = ({ asset, startFrame, height, strokeX = -24, strokeY = 12, tint = RED }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - startFrame, fps, config: { damping: 18, mass: 0.8, stiffness: 110 }, durationInFrames: 28 });
  const rise = interpolate(s, [0, 1], [120, 0]);
  const op = interpolate(frame, [startFrame, startFrame + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const url = staticFile(asset);
  const box = { position: "absolute" as const, bottom: 0, left: "50%", height, width: "auto", objectFit: "contain" as const };
  return (
    <div style={{ position: "relative", height, width: height, transform: `translateY(${rise}px)`, opacity: op, zIndex: 12 }}>
      <div aria-hidden style={{ ...box, aspectRatio: "1", width: height, height, backgroundColor: tint, WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center bottom", maskPosition: "center bottom", transform: `translate(calc(-50% + ${strokeX}px), ${strokeY}px)`, opacity: 0.92 }} />
      <Img src={url} alt="" style={{ ...box, width: height, transform: "translateX(-50%)", filter: "drop-shadow(0 26px 24px rgba(40,30,20,0.32))" }} />
    </div>
  );
};

export const HalftoneCard: React.FC<{ asset?: string; keyword?: string; startFrame: number; width: number; height: number; tint?: string }> = ({ asset, keyword, startFrame, width, height, tint = RED }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - startFrame, fps, config: { damping: 18, mass: 0.8, stiffness: 110 }, durationInFrames: 26 });
  const rise = interpolate(s, [0, 1], [90, 0]);
  const rot = interpolate(s, [0, 1], [-3, -1.2]);
  const op = interpolate(frame, [startFrame, startFrame + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "relative", width, height, transform: `translateY(${rise}px) rotate(${rot}deg)`, opacity: op, zIndex: 12 }}>
      <div style={{ position: "absolute", inset: 0, transform: "translate(18px,18px)", backgroundColor: tint }} />
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", border: `5px solid ${INK}`, background: "#c9c8c3", boxShadow: "0 18px 30px rgba(40,30,20,0.28)" }}>
        {asset ? (
          <>
            <Img src={staticFile(asset)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.35) brightness(1.03)", transform: "scale(1.06)" }} />
            <div style={{ position: "absolute", inset: 0, background: tint, mixBlendMode: "multiply", opacity: 0.2 }} />
            <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${INK} 1px, transparent 1.4px)`, backgroundSize: "5px 5px", mixBlendMode: "overlay", opacity: 0.35 }} />
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 40, color: INK, textAlign: "center", textTransform: "uppercase", opacity: 0.6 }}>{keyword}</span>
          </div>
        )}
      </div>
      <div style={{ position: "absolute", top: -14, left: "50%", width: 120, height: 34, transform: "translateX(-50%) rotate(-4deg)", background: "rgba(232,164,23,0.55)", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }} />
    </div>
  );
};

export const BackdropImg: React.FC<{ asset: string }> = ({ asset }) => {
  const frame = useCurrentFrame();
  const scale = 1.08 + frame * 0.0004;
  const tx = Math.sin(frame / 130) * 14;
  return <Img src={staticFile(asset)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(0.4) contrast(1.15) brightness(0.9)", transform: `scale(${scale}) translateX(${tx}px)` }} />;
};

export const Scene: React.FC<{ beat: Beat; children: React.ReactNode; accent?: boolean; bleed?: React.ReactNode }> = ({ beat, children, accent = true, bleed }) => {
  const frame = useCurrentFrame();
  const seed = hash(beat.id);
  const inOp = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outOp = interpolate(frame, [beat.durationFrames - 8, beat.durationFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const inY = interpolate(frame, [0, 10], [26, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ opacity: Math.min(inOp, outOp), transform: `translateY(${inY}px)`, transformOrigin: "center" }}>
      {bleed}
      {accent ? <AccentBurst seed={seed} x={35 + seed * 30} y={44} /> : null}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: CAPTION_BAND, paddingInline: 130, zIndex: 10 }}>{children}</AbsoluteFill>
      {beat.props.sourceRef ? (
        <SourceFootnote sourceText={beat.props.sourceRef} startFrame={14} />
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * UNGROUNDED FALLBACK — what a data archetype draws when nobody gave it data.
 *
 * The journalism/infographic scenes used to ship invented defaults: a
 * `STANDARD BENCHMARK 35%` bar next to `firstNumberInText % 100`, a conspiracy
 * board asserting LINKED TO / INFLUENCED / DRIVES between three emphasis words,
 * a trendline plotting a hardcoded 24 / 58 / 42 / 89, a growth curve plotting
 * 1,2,4,8,16,32,65,120. None of those numbers or relations were ever spoken in
 * the narration. In a video that presents itself as factual that is fabricated
 * evidence, and it is worse than a plain frame.
 *
 * So a data component with no data now refuses, and falls back to the neutral
 * treatment of the same words — the beat's emphasis, exactly as StatementScene
 * would draw it. The planner (scripts/plan-vox.js `NEEDS_REAL_DATA` /
 * `groundedPayload`) already declines to SELECT these archetypes without a
 * payload, so this only fires for configs planned before that gate existed.
 */
export const UngroundedFallback: React.FC<{ beat: Beat; kicker?: string }> = ({ beat, kicker }) => {
  const at = beatAnchors(beat, 2, 6, 16);
  const phrase = (beat.props.emphasis || []).join(" ") || (beat.props.keywords || []).slice(0, 3).join(" ");
  const size = phrase.length > 22 ? 128 : 168;
  return (
    <Scene beat={beat}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, zIndex: 12 }}>
        {kicker ? <KickerChip text={kicker} startFrame={2} align="center" /> : null}
        <KineticWords text={phrase} startFrame={at[0]} fontSize={size} align="center" maxWidth={1420} />
        <MarkerUnderline startFrame={at[1]} width={Math.min(1200, phrase.length * size * 0.42)} />
      </div>
    </Scene>
  );
};
