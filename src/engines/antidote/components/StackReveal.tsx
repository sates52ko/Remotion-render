import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { StackRevealSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * StackReveal — Two Variants:
 *   1. "burners": Tactile 2x2 Four-Burner Stove / Control-Dial Grid (dynamically dials burners up/down on cue).
 *   2. "strata": Layered cutaway depth reveal.
 */
export const StackReveal: React.FC<{ spec: StackRevealSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const light = isLightPalette(palette);
  const fonts = resolveArtFonts(ad);

  const titleP = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>

      {spec.variant === "burners" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 460px)",
            gap: 26,
          }}
        >
          {spec.items.slice(0, 4).map((item, i) => {
            const ep = spring({ frame: Math.max(0, frame - i * 6), fps, config: { damping: 16, stiffness: 145 } });
            const startLvl = item.level ?? 0.85;
            const endLvl = item.targetLevel ?? startLvl;
            const changeP = item.changeAt != null
              ? interpolate(frame - item.changeAt, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.poly(3)) })
              : 0;
            const lvl = startLvl + (endLvl - startLvl) * changeP;
            const isOff = lvl <= 0.12;
            const col = isOff ? palette.muted : toneColor(item.tone ?? "accent", palette);
            const dialDeg = -120 + lvl * 240;

            return (
              <div
                key={i}
                style={{
                  height: 230,
                  padding: "22px 26px",
                  boxSizing: "border-box",
                  borderRadius: 12,
                  background: palette.surface,
                  border: `2.5px solid ${isOff ? palette.surfaceBorder : col}`,
                  boxShadow: light ? "0 12px 28px rgba(24,24,27,0.10)" : "0 16px 36px rgba(0,0,0,0.42)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  opacity: ep * (isOff ? 0.56 : 1),
                  transform: `translateY(${(1 - ep) * 20}px)`,
                }}
              >
                {/* Concentric Burner Rings */}
                <div style={{ position: "relative", width: 150, height: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={150} height={150} viewBox="0 0 150 150">
                    <circle cx={75} cy={75} r={66} fill="none" stroke={palette.surfaceBorder} strokeWidth={6} />
                    <circle cx={75} cy={75} r={46} fill="none" stroke={col} strokeWidth={7} opacity={0.25 + lvl * 0.75} />
                    <circle cx={75} cy={75} r={26} fill={col} opacity={0.15 + lvl * 0.75} />
                  </svg>
                </div>

                {/* Label + Status + Rotary Dial */}
                <div style={{ flex: 1, paddingLeft: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                  <div>
                    <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 30, color: palette.ink, lineHeight: 1.1 }}>
                      {item.label}
                    </div>
                    {item.detail && (
                      <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 18, color: palette.muted, marginTop: 4 }}>
                        {item.detail}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span
                      style={{
                        fontFamily: fonts.display,
                        fontWeight: 800,
                        fontSize: 16,
                        letterSpacing: "0.08em",
                        padding: "5px 12px",
                        borderRadius: 4,
                        background: isOff ? `${palette.muted}22` : `${col}22`,
                        color: col,
                      }}
                    >
                      {isOff ? "OFF" : lvl > 0.7 ? "HIGH" : "LOW"}
                    </span>
                    {/* Rotary Knob */}
                    <svg width={46} height={46} viewBox="0 0 46 46">
                      <circle cx={23} cy={23} r={20} fill={palette.bgAlt} stroke={palette.ink} strokeWidth={2.5} />
                      <g transform={`rotate(${dialDeg.toFixed(1)} 23 23)`}>
                        <line x1={23} y1={23} x2={23} y2={7} stroke={col} strokeWidth={4} strokeLinecap="round" />
                      </g>
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ width: 920, display: "flex", flexDirection: "column", gap: 14 }}>
          {spec.items.slice(0, 5).map((item, i) => {
            const ep = spring({ frame: Math.max(0, frame - i * 8), fps, config: { damping: 16, stiffness: 145 } });
            const col = toneColor(item.tone ?? "accent", palette);
            return (
              <div
                key={i}
                style={{
                  padding: "18px 28px",
                  borderRadius: 8,
                  background: palette.surface,
                  border: `2px solid ${item.active ? col : palette.surfaceBorder}`,
                  borderLeft: `8px solid ${col}`,
                  opacity: ep * (item.active === false ? 0.52 : 1),
                  transform: `translateY(${(1 - ep) * 18}px)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 28, color: palette.ink }}>
                  {item.label}
                </div>
                {item.detail && (
                  <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 20, color: palette.muted }}>
                    {item.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {spec.callout && frame >= (spec.calloutAt ?? 40) && (
        <div
          style={{
            marginTop: 24,
            padding: "12px 28px",
            borderRadius: 8,
            background: palette.surface,
            border: `2px solid ${palette.accent}`,
            fontFamily: fonts.body,
            fontWeight: 700,
            fontSize: 23,
            color: palette.ink,
            opacity: interpolate(frame - (spec.calloutAt ?? 40), [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {spec.callout}
        </div>
      )}
    </GrammarStage>
  );
};
