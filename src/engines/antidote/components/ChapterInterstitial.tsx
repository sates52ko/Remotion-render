import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ChapterInterstitialSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * ChapterInterstitial — Style-Pack-Native Part / Chapter Divider.
 */
export const ChapterInterstitial: React.FC<{ spec: ChapterInterstitialSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);

  const p = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  const leftAligned = spec.variant === "broadsheetRule" || spec.variant === "verticalSpine";

  return (
    <GrammarStage stageMood={stageMood} localFrame={frame}>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: leftAligned ? "flex-start" : "center",
          textAlign: leftAligned ? "left" : "center",
        }}
      >
      <div
        style={{
          borderLeft: leftAligned ? `8px solid ${palette.accent}` : undefined,
          paddingLeft: leftAligned ? 32 : 0,
          opacity: p,
          transform: `translateY(${(1 - p) * 24}px)`,
        }}
      >
        {spec.kicker && (
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 22, letterSpacing: "0.16em", color: palette.accent, marginBottom: 14 }}>
            {spec.kicker}
          </div>
        )}
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 78, lineHeight: 1.05, color: palette.ink }}>
          {spec.title}
        </div>
        {spec.subtitle && (
          <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 30, color: palette.muted, marginTop: 16 }}>
            {spec.subtitle}
          </div>
        )}
      </div>
      </div>
    </GrammarStage>
  );
};
