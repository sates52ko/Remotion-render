import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnalyticsFunnelSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * AnalyticsFunnel — Pure SVG multi-stage conversion / distillation funnel
 * with bottleneck callout highlight.
 */
export const AnalyticsFunnel: React.FC<{ spec: AnalyticsFunnelSpec; localFrame?: number; stageMood?: StageMoodName }> = ({
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

  const stages = spec.stages.slice(0, 6);
  const n = stages.length;
  const maxW = 780;
  const rowH = n <= 4 ? 108 : 80;
  const gap = 14;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>
      <div style={{ width: 1200, display: "flex", flexDirection: "column", alignItems: "center", gap }}>
        {stages.map((st, i) => {
          const ep = spring({ frame: Math.max(0, frame - (st.at ?? i * 9)), fps, config: { damping: 16, stiffness: 150 } });
          const fillP = interpolate(frame - (st.at ?? i * 9), [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.poly(4)),
          });
          const w = Math.max(220, Math.round(maxW * Math.max(0.22, st.share) * (0.4 + fillP * 0.6)));
          const isBottleneck = spec.bottleneckIndex === i;
          const col = toneColor(st.tone ?? (isBottleneck ? "danger" : "accent"), palette);

          return (
            <div
              key={i}
              style={{
                width: "100%",
                height: rowH,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 24,
                opacity: ep,
              }}
            >
              <div style={{ width: 250, textAlign: "right", fontFamily: fonts.display, fontWeight: 800, fontSize: 25, color: palette.ink }}>
                {st.label}
              </div>

              <div
                style={{
                  width: w,
                  height: rowH - 8,
                  borderRadius: 10,
                  background: isBottleneck ? `${col}28` : palette.surface,
                  border: `3px solid ${col}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: light ? "0 8px 18px rgba(0,0,0,0.06)" : "0 10px 24px rgba(0,0,0,0.42)",
                }}
              >
                <span style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 32, color: col }}>
                  {st.value}
                </span>
              </div>

              <div style={{ width: 250, textAlign: "left", fontFamily: fonts.body, fontWeight: 600, fontSize: 21, color: isBottleneck ? palette.danger : palette.muted }}>
                {st.dropNote ?? ""}
              </div>
            </div>
          );
        })}
      </div>

      {spec.callout && (
        <div
          style={{
            marginTop: 22,
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
