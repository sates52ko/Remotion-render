import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ExplodedViewSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";
import { FitText } from "./textFit";

/**
 * ExplodedView — Pure SVG/CSS 2.5D isometric stacked layers that expand along
 * a vertical axis with dashed leader lines to numbered callouts.
 */
export const ExplodedView: React.FC<{ spec: ExplodedViewSpec; localFrame?: number; stageMood?: StageMoodName }> = ({
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

  const layers = spec.layers.slice(0, 6);
  const n = layers.length;
  const expandAt = spec.expandAt ?? 24;
  const expandP = interpolate(frame - expandAt, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  const baseGap = 24;
  const expandedGap = n <= 3 ? 115 : n === 4 ? 90 : 72;
  const gap = baseGap + (expandedGap - baseGap) * expandP;
  const totalH = (n - 1) * gap;
  const startY = 300 - totalH / 2;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>
      <div style={{ position: "relative", width: 1200, height: 640 }}>
        <svg width={1200} height={640} viewBox="0 0 1200 640" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <line x1={320} y1={startY - 30} x2={320} y2={startY + totalH + 40} stroke={palette.surfaceBorder} strokeWidth={2.5} strokeDasharray="8 8" />

          {layers.map((layer, i) => {
            const cy = startY + i * gap;
            const col = toneColor(layer.tone ?? (i === 0 ? "accent" : "neutral"), palette);
            const ep = spring({ frame: Math.max(0, frame - (layer.at ?? i * 6)), fps, config: { damping: 16, stiffness: 150 } });
            const isoPts = `${320},${cy - 42} ${520},${cy} ${320},${cy + 42} ${120},${cy}`;
            return (
              <g key={i} opacity={ep}>
                <polygon
                  points={isoPts}
                  fill={palette.surface}
                  stroke={col}
                  strokeWidth={3.5}
                  style={{ filter: light ? "drop-shadow(0 6px 12px rgba(0,0,0,0.08))" : "drop-shadow(0 8px 18px rgba(0,0,0,0.45))" }}
                />
                {expandP > 0.15 && (
                  <line
                    x1={520}
                    y1={cy}
                    x2={615}
                    y2={cy}
                    stroke={col}
                    strokeWidth={2.5}
                    strokeDasharray="6 6"
                    opacity={expandP}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {layers.map((layer, i) => {
          const cy = startY + i * gap;
          const col = toneColor(layer.tone ?? (i === 0 ? "accent" : "neutral"), palette);
          const ep = spring({ frame: Math.max(0, frame - (layer.at ?? i * 6)), fps, config: { damping: 16, stiffness: 150 } });
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 625,
                top: cy,
                transform: `translateY(-50%) translateX(${(1 - expandP) * -18}px)`,
                opacity: ep * (0.35 + expandP * 0.65),
                display: "flex",
                alignItems: "center",
                gap: 16,
                width: 550,
              }}
            >
              <div
                style={{
                  minWidth: 44,
                  height: 44,
                  borderRadius: 999,
                  background: col,
                  color: light ? "#FFFFFF" : palette.bg,
                  fontFamily: fonts.display,
                  fontWeight: 900,
                  fontSize: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {layer.badge ?? i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <FitText
                  text={layer.label}
                  maxWidth={490}
                  maxLines={1}
                  baseSize={30}
                  minSize={20}
                  fontFamily={fonts.display}
                  fontWeight={800}
                  color={palette.ink}
                />
                {layer.detail && (
                  <div style={{ fontFamily: fonts.body, fontSize: 20, fontWeight: 500, color: palette.muted, marginTop: 2 }}>
                    {layer.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {spec.callout && expandP > 0.5 && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 26px",
            borderRadius: 999,
            background: palette.surface,
            border: `2px solid ${palette.accent}`,
            fontFamily: fonts.body,
            fontWeight: 700,
            fontSize: 22,
            color: palette.ink,
          }}
        >
          {spec.callout}
        </div>
      )}
    </GrammarStage>
  );
};
