import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CohortGridSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

const PersonGlyph: React.FC<{ color: string; opacity?: number }> = ({ color, opacity = 1 }) => (
  <svg width={52} height={74} viewBox="0 0 52 74" style={{ opacity }}>
    <circle cx={26} cy={16} r={11} fill={color} />
    <path d="M8 66 C8 38, 44 38, 44 66 Z" fill={color} />
  </svg>
);

/**
 * CohortGrid — Realm C (Cinecode-inspired Human Dot/Silhouette Split).
 *
 * Shows a 20-person cohort that splits cleanly into two labeled groups at `splitAt`
 * (e.g. 50% Secret Task vs 50% Control Group) with an optional circular inset medallion.
 */
export const CohortGrid: React.FC<{ spec: CohortGridSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const displayFont = fonts.display;
  const bodyFont = fonts.body;

  const total = Math.max(6, Math.min(40, spec.total ?? 20));
  const leftCount = Math.round(total * (spec.leftGroup.share ?? 0.5));
  const rightCount = Math.max(1, total - leftCount);

  const splitP = interpolate(frame, [spec.splitAt ?? 45, (spec.splitAt ?? 45) + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  const leftCol = toneColor(spec.leftGroup.tone ?? "accent", palette);
  const rightCol = toneColor(spec.rightGroup.tone ?? "neutral", palette);
  const insetAt = spec.insetImage?.at ?? 90;
  const insetP = spec.insetImage && frame >= insetAt
    ? spring({ frame: frame - insetAt, fps, config: { damping: 14, stiffness: 150 } })
    : 0;
  const calloutAt = spec.calloutAt ?? (spec.splitAt ?? 45) + 30;
  const calloutP = spec.callout && frame >= calloutAt
    ? interpolate(frame - calloutAt, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 48 + splitP * 64, width: "100%" }}>
        {/* Left Cohort */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateX(${-splitP * 24}px)` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 58px)", gap: "18px 18px" }}>
            {Array.from({ length: leftCount }).map((_, i) => (
              <PersonGlyph key={i} color={splitP > 0.2 ? leftCol : palette.muted} opacity={0.75 + splitP * 0.25} />
            ))}
          </div>
          <div style={{ marginTop: 26, textAlign: "center", opacity: splitP, transform: `translateY(${(1 - splitP) * 14}px)` }}>
            {spec.leftGroup.badge && (
              <span style={{ display: "inline-block", fontFamily: displayFont, fontWeight: 900, fontSize: 18, letterSpacing: "0.08em", padding: "5px 14px", borderRadius: 999, background: `${leftCol}24`, color: leftCol, marginBottom: 8 }}>
                {spec.leftGroup.badge}
              </span>
            )}
            <div style={{ fontFamily: displayFont, fontWeight: 900, fontSize: 32, color: leftCol }}>{spec.leftGroup.label}</div>
            {spec.leftGroup.sublabel && (
              <div style={{ fontFamily: bodyFont, fontWeight: 500, fontSize: 21, color: palette.ink, marginTop: 4 }}>{spec.leftGroup.sublabel}</div>
            )}
          </div>
        </div>

        {/* Center Divider + Optional Inset Medallion */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: spec.insetImage ? 220 : 8 }}>
          <div style={{ width: 2, height: 220 * splitP, background: palette.surfaceBorder, opacity: splitP }} />
          {spec.insetImage && insetP > 0.01 && (
            <div
              style={{
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                transform: `scale(${0.75 + insetP * 0.25})`,
                opacity: insetP,
              }}
            >
              <div
                style={{
                  width: 210,
                  height: 210,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: `4px solid ${palette.accent}`,
                  boxShadow: "0 22px 54px rgba(0,0,0,0.62)",
                  background: "#0C0F14",
                }}
              >
                <Img src={staticFile(spec.insetImage.path)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              {spec.insetImage.caption && (
                <div style={{ marginTop: 12, padding: "5px 14px", borderRadius: 999, background: "rgba(10,13,20,0.88)", border: `1px solid ${palette.accent}`, fontFamily: displayFont, fontWeight: 800, fontSize: 17, letterSpacing: "0.06em", color: palette.accent, whiteSpace: "nowrap" }}>
                  {spec.insetImage.caption}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Cohort */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateX(${splitP * 24}px)` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 58px)", gap: "18px 18px" }}>
            {Array.from({ length: rightCount }).map((_, i) => (
              <PersonGlyph key={i} color={palette.muted} opacity={1 - splitP * 0.42} />
            ))}
          </div>
          <div style={{ marginTop: 26, textAlign: "center", opacity: splitP, transform: `translateY(${(1 - splitP) * 14}px)` }}>
            {spec.rightGroup.badge && (
              <span style={{ display: "inline-block", fontFamily: displayFont, fontWeight: 900, fontSize: 18, letterSpacing: "0.08em", padding: "5px 14px", borderRadius: 999, background: "rgba(255,255,255,0.08)", color: palette.muted, marginBottom: 8 }}>
                {spec.rightGroup.badge}
              </span>
            )}
            <div style={{ fontFamily: displayFont, fontWeight: 900, fontSize: 32, color: rightCol }}>{spec.rightGroup.label}</div>
            {spec.rightGroup.sublabel && (
              <div style={{ fontFamily: bodyFont, fontWeight: 500, fontSize: 21, color: palette.muted, marginTop: 4 }}>{spec.rightGroup.sublabel}</div>
            )}
          </div>
        </div>
      </div>

      {spec.callout && calloutP > 0 && (
        <div
          style={{
            marginTop: 34,
            padding: "12px 26px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            border: `1.5px solid ${palette.accent}66`,
            fontFamily: bodyFont,
            fontWeight: 700,
            fontSize: 24,
            color: palette.ink,
            opacity: calloutP,
          }}
        >
          {spec.callout}
        </div>
      )}
    </GrammarStage>
  );
};
