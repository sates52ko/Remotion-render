import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { BarRaceSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * BarRace — Pure SVG/CSS animated overtaking horizontal bar chart across epochs.
 */
export const BarRace: React.FC<{ spec: BarRaceSpec; localFrame?: number; stageMood?: StageMoodName }> = ({
  spec,
  localFrame,
  stageMood,
}) => {
  const ctxFrame = useCurrentFrame();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const light = isLightPalette(palette);

  const epochs = spec.epochs.slice(0, 6);
  const epTimes = epochs.map((e, i) => e.at ?? i * 42);
  let idx = 0;
  for (let i = 0; i < epTimes.length - 1; i++) {
    if (frame >= epTimes[i]) idx = i;
  }
  const nextIdx = Math.min(epochs.length - 1, idx + 1);
  const t0 = epTimes[idx];
  const t1 = Math.max(t0 + 1, epTimes[nextIdx]);
  const segP = idx === nextIdx ? 1 : interpolate(frame, [t0, t1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const curEp = epochs[idx];
  const nextEp = epochs[nextIdx];
  const nextMap = new Map(nextEp.bars.map((b) => [b.id, b]));

  const blended = curEp.bars.map((b) => {
    const nb = nextMap.get(b.id) ?? b;
    return {
      id: b.id,
      label: b.label,
      tone: b.tone,
      value: b.value + (nb.value - b.value) * segP,
      displayValue: segP > 0.5 && nb.displayValue ? nb.displayValue : b.displayValue,
    };
  });

  const sorted = [...blended].sort((a, b) => b.value - a.value);
  const maxVal = Math.max(1, ...sorted.map((b) => b.value));
  const rowH = 66;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} kicker={segP > 0.5 ? nextEp.label : curEp.label} stageMood={stageMood} localFrame={frame}>
      <div style={{ position: "relative", width: 1080, height: sorted.length * (rowH + 14) }}>
        {sorted.map((b, rank) => {
          const col = toneColor(b.tone ?? (rank === 0 ? "accent" : "neutral"), palette);
          const barW = Math.max(64, (b.value / maxVal) * 680);
          return (
            <div
              key={b.id}
              style={{
                position: "absolute",
                left: 0,
                top: rank * (rowH + 14),
                width: "100%",
                height: rowH,
                display: "flex",
                alignItems: "center",
                gap: 20,
              }}
            >
              <div style={{ width: 220, textAlign: "right", fontFamily: fonts.display, fontWeight: 800, fontSize: 22, color: palette.ink }}>
                {b.label}
              </div>
              <div
                style={{
                  width: barW,
                  height: 46,
                  borderRadius: 8,
                  background: col,
                  boxShadow: light ? "0 6px 14px rgba(0,0,0,0.08)" : "0 8px 20px rgba(0,0,0,0.42)",
                }}
              />
              <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 24, color: col }}>
                {b.displayValue ?? `${Math.round(b.value)}${spec.unit ?? ""}`}
              </div>
            </div>
          );
        })}
      </div>

      {spec.callout && (
        <div
          style={{
            marginTop: 20,
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
