import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { VennMergeSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";
import { FitText } from "./textFit";

/**
 * VennMerge — Pure SVG + CSS overlapping Venn synthesis (ZERO WebGL).
 * Circles slide together to illuminate their shared intersection lens.
 */
export const VennMerge: React.FC<{ spec: VennMergeSpec; localFrame?: number; stageMood?: StageMoodName }> = ({
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

  const circles = spec.circles.slice(0, 3);
  const mergeP = interpolate(frame, [16, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });
  const interAt = spec.intersection.at ?? 40;
  const interP = frame >= interAt
    ? spring({ frame: frame - interAt, fps, config: { damping: 14, stiffness: 150 } })
    : 0;

  const w = 1040;
  const h = 560;
  const r = circles.length === 3 ? 175 : 205;
  const spread = 1 - mergeP * 0.42;
  const centers =
    circles.length === 2
      ? [
          { x: w * 0.5 - 190 * spread, y: h * 0.5 },
          { x: w * 0.5 + 190 * spread, y: h * 0.5 },
        ]
      : [
          { x: w * 0.5 - 175 * spread, y: h * 0.56 },
          { x: w * 0.5 + 175 * spread, y: h * 0.56 },
          { x: w * 0.5, y: h * 0.5 - 165 * spread },
        ];

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>
      <div style={{ position: "relative", width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
          <defs>
            <clipPath id="venn-c0">
              <circle cx={centers[0].x} cy={centers[0].y} r={r} />
            </clipPath>
          </defs>

          {circles.map((c, i) => {
            const col = toneColor(c.tone ?? (i === 0 ? "accent" : i === 1 ? "positive" : "danger"), palette);
            const enterP = spring({ frame: Math.max(0, frame - (c.at ?? i * 8)), fps, config: { damping: 16, stiffness: 140 } });
            return (
              <g key={i} opacity={enterP}>
                <circle
                  cx={centers[i].x}
                  cy={centers[i].y}
                  r={r * (0.88 + enterP * 0.12)}
                  fill={col}
                  fillOpacity={light ? 0.16 : 0.22}
                  stroke={col}
                  strokeWidth={4}
                />
              </g>
            );
          })}

          {circles.length >= 2 && interP > 0.02 && (
            <circle
              cx={centers[1].x}
              cy={centers[1].y}
              r={r}
              fill={palette.accent}
              fillOpacity={0.28 * interP}
              clipPath="url(#venn-c0)"
            />
          )}
        </svg>

        {circles.map((c, i) => {
          const col = toneColor(c.tone ?? (i === 0 ? "accent" : i === 1 ? "positive" : "danger"), palette);
          const pos = centers[i];
          const offsetX = circles.length === 2 ? (i === 0 ? -72 : 72) : i === 0 ? -70 : i === 1 ? 70 : 0;
          const offsetY = circles.length === 3 && i === 2 ? -64 : 0;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: pos.x + offsetX,
                top: pos.y + offsetY,
                transform: "translate(-50%, -50%)",
                width: 220,
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              <FitText
                text={c.label}
                maxWidth={210}
                maxLines={2}
                baseSize={28}
                minSize={18}
                fontFamily={fonts.display}
                fontWeight={800}
                color={palette.ink}
              />
              {c.sublabel && (
                <div style={{ fontFamily: fonts.body, fontSize: 18, fontWeight: 500, color: col, marginTop: 4 }}>
                  {c.sublabel}
                </div>
              )}
            </div>
          );
        })}

        {interP > 0.02 && (
          <div
            style={{
              position: "absolute",
              left: w * 0.5,
              top: circles.length === 3 ? h * 0.5 + 12 : h * 0.5,
              transform: `translate(-50%, -50%) scale(${0.82 + interP * 0.18})`,
              opacity: interP,
              padding: "14px 24px",
              borderRadius: 12,
              background: palette.surface,
              border: `3px solid ${palette.accent}`,
              boxShadow: light ? "0 12px 28px rgba(0,0,0,0.12)" : "0 16px 36px rgba(0,0,0,0.55)",
              textAlign: "center",
              maxWidth: 270,
            }}
          >
            <FitText
              text={spec.intersection.label}
              maxWidth={240}
              maxLines={2}
              baseSize={26}
              minSize={18}
              fontFamily={fonts.display}
              fontWeight={900}
              color={palette.accent}
            />
            {spec.intersection.detail && (
              <div style={{ fontFamily: fonts.body, fontSize: 17, fontWeight: 600, color: palette.ink, marginTop: 4 }}>
                {spec.intersection.detail}
              </div>
            )}
          </div>
        )}
      </div>

      {spec.callout && interP > 0.5 && (
        <div
          style={{
            marginTop: 14,
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
