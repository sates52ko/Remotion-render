import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { GravityPileSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * GravityPile — Deterministic seeded rigid-drop heap (ZERO Math.random()).
 * Items drop with quadratic gravity + single damped bounce into a stage tray.
 */
export const GravityPile: React.FC<{ spec: GravityPileSpec; localFrame?: number; stageMood?: StageMoodName }> = ({
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

  const items = spec.items.slice(0, 14);
  const trayW = 920;
  const trayH = 440;
  const cols = 3;
  const cellW = 280;
  const cellH = 66;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>
      <div
        style={{
          position: "relative",
          width: trayW,
          height: trayH,
          borderLeft: `4px solid ${palette.surfaceBorder}`,
          borderRight: `4px solid ${palette.surfaceBorder}`,
          borderBottom: `6px solid ${palette.accent}`,
          borderRadius: "0 0 16px 16px",
          background: `${palette.surface}66`,
          overflow: "hidden",
        }}
      >
        {items.map((item, i) => {
          const dropAt = item.at ?? i * 5;
          const dt = Math.max(0, frame - dropAt);
          if (frame < dropAt) return null;

          const colIdx = i % cols;
          const rowIdx = Math.floor(i / cols);
          const targetX = 36 + colIdx * (cellW + 14) + ((i * 17) % 18) - 9;
          const targetY = trayH - 22 - (rowIdx + 1) * (cellH + 10);
          const rot = (((i * 37) % 9) - 4) * 1.1;

          const fallDur = 14;
          let y = targetY;
          if (dt < fallDur) {
            const t = dt / fallDur;
            y = -80 + (targetY + 80) * (t * t);
          } else if (dt < fallDur + 6) {
            const bt = (dt - fallDur) / 6;
            y = targetY - Math.sin(bt * Math.PI) * 14;
          }

          const col = toneColor(item.tone ?? (i % 3 === 0 ? "accent" : "neutral"), palette);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: targetX,
                top: y,
                width: cellW,
                height: cellH,
                borderRadius: 10,
                background: palette.surface,
                border: `2.5px solid ${col}`,
                transform: `rotate(${rot.toFixed(1)}deg)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 16px",
                boxSizing: "border-box",
                boxShadow: light ? "0 6px 14px rgba(0,0,0,0.08)" : "0 8px 18px rgba(0,0,0,0.45)",
              }}
            >
              <span
                style={{
                  fontFamily: fonts.display,
                  fontWeight: 800,
                  fontSize: 20,
                  color: palette.ink,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.label}
              </span>
              {item.tag && (
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontWeight: 800,
                    fontSize: 13,
                    color: col,
                    marginLeft: 8,
                  }}
                >
                  {item.tag}
                </span>
              )}
            </div>
          );
        })}

        {spec.dropZoneLabel && (
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 20,
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: "0.1em",
              color: palette.muted,
              textTransform: "uppercase",
            }}
          >
            {spec.dropZoneLabel}
          </div>
        )}
      </div>

      {spec.callout && frame >= (spec.calloutAt ?? 55) && (
        <div
          style={{
            marginTop: 18,
            padding: "10px 26px",
            borderRadius: 999,
            background: palette.surface,
            border: `2px solid ${palette.accent}`,
            fontFamily: fonts.body,
            fontWeight: 700,
            fontSize: 22,
            color: palette.ink,
            opacity: interpolate(frame - (spec.calloutAt ?? 55), [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {spec.callout}
        </div>
      )}
    </GrammarStage>
  );
};
