import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { StatSlamSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * StatSlam — Blog-to-video inspired monumental law / stat / payoff ratio card.
 *
 * Slams the core thesis or stat onto the stage with word-synced comparison bars.
 */
export const StatSlam: React.FC<{ spec: StatSlamSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const displayFont = fonts.display;
  const bodyFont = fonts.body;

  const slamP = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const accent = toneColor(spec.tone ?? "accent", palette);
  const framing = spec.framing ?? "blueprint";

  return (
    <GrammarStage kicker={spec.kicker} stageMood={stageMood} localFrame={frame}>
      <div
        style={{
          width: "100%",
          maxWidth: 1320,
          padding: framing === "minimal" ? "16px 24px" : "44px 56px",
          borderRadius: framing === "paperBlock" ? 12 : framing === "blueprint" ? 6 : 0,
          background: framing === "minimal" ? "transparent" : palette.surface,
          border: framing === "minimal" ? "none" : `2.5px solid ${accent}`,
          boxShadow: framing === "minimal" ? "none" : "0 28px 72px rgba(0,0,0,0.48)",
          textAlign: "center",
          transform: `scale(${1.12 - slamP * 0.12})`,
          opacity: Math.min(1, slamP * 1.4),
        }}
      >
        <div
          style={{
            fontFamily: displayFont,
            fontWeight: 900,
            fontSize: spec.value.length > 14 ? 68 : 88,
            lineHeight: 1.04,
            letterSpacing: "0.02em",
            color: accent,
            textShadow: "0 8px 28px rgba(0,0,0,0.42)",
          }}
        >
          {spec.value}
        </div>

        <div
          style={{
            fontFamily: bodyFont,
            fontWeight: 600,
            fontSize: 31,
            lineHeight: 1.32,
            color: palette.ink,
            marginTop: 18,
            maxWidth: 1040,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {spec.label}
        </div>

        {spec.note && (
          <div
            style={{
              fontFamily: "Georgia, 'Brush Script MT', cursive",
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: 28,
              color: palette.muted,
              marginTop: 14,
            }}
          >
            {spec.note}
          </div>
        )}

        {spec.bars && spec.bars.length > 0 && (
          <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 16, maxWidth: 920, marginLeft: "auto", marginRight: "auto", textAlign: "left" }}>
            {spec.bars.slice(0, 4).map((b, bi) => {
              const barAt = b.at ?? 18 + bi * 14;
              const bp = interpolate(frame, [barAt, barAt + 20], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.poly(3)),
              });
              const bCol = toneColor(b.tone ?? "accent", palette);
              return (
                <div key={bi}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: displayFont, fontWeight: 800, fontSize: 21, color: palette.ink, marginBottom: 6 }}>
                    <span>{b.label}</span>
                    <span style={{ color: bCol }}>{b.text ?? `${Math.round(b.value * 100)}%`}</span>
                  </div>
                  <div style={{ width: "100%", height: 16, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(4, b.value * 100 * bp)}%`, height: "100%", borderRadius: 999, background: bCol }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GrammarStage>
  );
};
