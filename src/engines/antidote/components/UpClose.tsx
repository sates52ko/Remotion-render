import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { UpCloseSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, useArtDirection, type StageMoodName } from "./artDirection";
import { StageGrammarOverlay } from "./layoutGrammar";
import { FitText } from "./textFit";

/**
 * UpClose — Pure CSS/SVG optical macro-zoom lens over an editorial image.
 */
export const UpClose: React.FC<{ spec: UpCloseSpec; localFrame?: number; stageMood?: StageMoodName }> = ({
  spec,
  localFrame,
  stageMood,
}) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const light = isLightPalette(palette);

  const zoomAt = spec.zoomAt ?? 24;
  const zp = interpolate(frame - zoomAt, [0, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const targetScale = spec.zoomTarget.scale ?? 2.2;
  const sc = 1 + (targetScale - 1) * zp;
  const ox = (spec.zoomTarget.x * 100).toFixed(1);
  const oy = (spec.zoomTarget.y * 100).toFixed(1);

  const cardP = spec.annotation && frame >= zoomAt + 14
    ? spring({ frame: frame - (zoomAt + 14), fps, config: { damping: 16, stiffness: 145 } })
    : 0;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: palette.bg }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: `${ox}% ${oy}%`,
          transform: `scale(${sc.toFixed(4)})`,
        }}
      >
        <Img src={staticFile(spec.image)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,10,15,0.45) 0%, rgba(8,10,15,0.12) 45%, rgba(8,10,15,0.58) 100%)" }} />

      {/* Optical Reticle */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <circle
          cx={spec.zoomTarget.x * 1920}
          cy={spec.zoomTarget.y * 1080}
          r={130 - zp * 24}
          fill="none"
          stroke={palette.accent}
          strokeWidth={4}
          strokeDasharray="14 10"
          opacity={0.85}
        />
      </svg>

      {spec.lensLabel && (
        <div
          style={{
            position: "absolute",
            left: 84,
            top: 56,
            padding: "8px 20px",
            borderRadius: 999,
            background: palette.accent,
            color: light ? "#FFFFFF" : palette.bg,
            fontFamily: fonts.display,
            fontWeight: 900,
            fontSize: 18,
            letterSpacing: "0.1em",
          }}
        >
          {spec.lensLabel}
        </div>
      )}

      {spec.annotation && cardP > 0.02 && (
        <div
          style={{
            position: "absolute",
            [spec.annotation.side === "left" ? "left" : "right"]: 84,
            bottom: ad?.captions === "minimal" ? 168 : 96,
            width: 560,
            padding: "26px 32px",
            borderRadius: 14,
            background: palette.surface,
            border: `3px solid ${palette.accent}`,
            boxShadow: "0 20px 48px rgba(0,0,0,0.45)",
            opacity: cardP,
            transform: `translateY(${(1 - cardP) * 20}px)`,
          }}
        >
          <FitText
            text={spec.annotation.headline}
            maxWidth={496}
            maxLines={2}
            baseSize={34}
            minSize={22}
            fontFamily={fonts.display}
            fontWeight={900}
            color={palette.ink}
          />
          {spec.annotation.detail && (
            <div style={{ fontFamily: fonts.body, fontSize: 21, fontWeight: 500, color: palette.muted, marginTop: 8 }}>
              {spec.annotation.detail}
            </div>
          )}
        </div>
      )}

      <StageGrammarOverlay stageMood={stageMood} />
    </div>
  );
};
