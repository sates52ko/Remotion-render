import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { DecisionTreeSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";

/**
 * DecisionTree — Animated Left-to-Right Branching Choice & Pruning Tree.
 *
 * Shows a root premise splitting into 2–4 branches, then dynamically prunes/strikes out
 * rejected paths on `pruneAt` while elevating the winning strategic path.
 */
export const DecisionTree: React.FC<{ spec: DecisionTreeSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const light = isLightPalette(palette);
  const fonts = resolveArtFonts(ad);

  const branches = spec.branches.slice(0, 4);
  const n = branches.length;
  const rootX = 280;
  const rootY = 490;
  const branchX = 880;
  const outcomeX = 1480;
  const topY = n === 2 ? 360 : n === 3 ? 290 : 250;
  const stepY = n === 2 ? 260 : n === 3 ? 195 : 155;

  const titleP = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });
  const rootP = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Header */}
      {(spec.title || spec.subtitle) && (
        <div
          style={{
            position: "absolute",
            top: 46,
            left: 110,
            right: 110,
            opacity: titleP,
            transform: `translateY(${(1 - titleP) * 18}px)`,
          }}
        >
          {spec.title && (
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 48, color: palette.ink, lineHeight: 1.08 }}>
              {spec.title}
            </div>
          )}
          {spec.subtitle && (
            <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 24, color: palette.muted, marginTop: 6 }}>
              {spec.subtitle}
            </div>
          )}
        </div>
      )}

      {/* SVG Cubic Bezier Connectors */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {branches.map((br, i) => {
          const by = topY + i * stepY;
          const dt = frame - (br.at ?? 12 + i * 16);
          if (dt < 0) return null;
          const lp = interpolate(dt, [0, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.poly(3)),
          });
          const pruned = br.pruneAt != null && frame >= br.pruneAt;
          const col = pruned ? palette.danger : br.winner ? palette.positive : toneColor(br.tone ?? "accent", palette);
          const d = `M ${rootX + 150} ${rootY} C ${rootX + 340} ${rootY}, ${branchX - 240} ${by}, ${branchX - 170} ${by}`;
          return (
            <g key={`path-${i}`} opacity={pruned ? 0.38 : 1}>
              <path
                d={d}
                fill="none"
                stroke={col}
                strokeWidth={br.winner ? 5.5 : 3.5}
                strokeDasharray={900}
                strokeDashoffset={(1 - lp) * 900}
                strokeLinecap="round"
              />
              {br.outcome && (
                <line
                  x1={branchX + 170}
                  y1={by}
                  x2={branchX + 170 + (outcomeX - 150 - (branchX + 170)) * lp}
                  y2={by}
                  stroke={col}
                  strokeWidth={br.winner ? 4.5 : 3}
                  strokeDasharray={pruned ? "8 8" : undefined}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Root Node */}
      <div
        style={{
          position: "absolute",
          left: rootX,
          top: rootY,
          width: 300,
          transform: `translate(-50%, -50%) scale(${0.88 + rootP * 0.12})`,
          opacity: rootP,
          padding: "22px 24px",
          borderRadius: 10,
          background: palette.surface,
          border: `2.5px solid ${palette.accent}`,
          borderLeft: `8px solid ${palette.accent}`,
          boxShadow: light ? "0 14px 32px rgba(24,24,27,0.12)" : "0 18px 40px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 28, color: palette.ink, lineHeight: 1.15 }}>
          {spec.root.label}
        </div>
        {spec.root.sublabel && (
          <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 19, color: palette.muted, marginTop: 6 }}>
            {spec.root.sublabel}
          </div>
        )}
      </div>

      {/* Branches + Outcomes */}
      {branches.map((br, i) => {
        const by = topY + i * stepY;
        const dt = frame - (br.at ?? 12 + i * 16);
        if (dt < 0) return null;
        const bp = spring({ frame: dt, fps, config: { damping: 15, stiffness: 150 } });
        const pruned = br.pruneAt != null && frame >= br.pruneAt;
        const col = pruned ? palette.danger : br.winner ? palette.positive : toneColor(br.tone ?? "accent", palette);

        return (
          <React.Fragment key={`br-${i}`}>
            <div
              style={{
                position: "absolute",
                left: branchX,
                top: by,
                width: 340,
                transform: `translate(-50%, -50%) scale(${0.9 + bp * 0.1})`,
                opacity: bp * (pruned ? 0.42 : 1),
                padding: "16px 20px",
                borderRadius: 10,
                background: palette.surface,
                border: `2px solid ${col}`,
                borderLeft: `6px solid ${col}`,
                boxShadow: light ? "0 10px 26px rgba(24,24,27,0.10)" : "0 14px 30px rgba(0,0,0,0.42)",
              }}
            >
              <div
                style={{
                  fontFamily: fonts.display,
                  fontWeight: 800,
                  fontSize: 23,
                  color: palette.ink,
                  textDecoration: pruned ? "line-through" : "none",
                  lineHeight: 1.18,
                }}
              >
                {br.label}
              </div>
              {br.sublabel && (
                <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 17, color: palette.muted, marginTop: 4 }}>
                  {br.sublabel}
                </div>
              )}
            </div>

            {br.outcome && (
              <div
                style={{
                  position: "absolute",
                  left: outcomeX,
                  top: by,
                  width: 300,
                  transform: `translate(-50%, -50%) scale(${0.9 + bp * 0.1})`,
                  opacity: bp * (pruned ? 0.45 : 1),
                  padding: "14px 20px",
                  borderRadius: 8,
                  background: br.winner ? `${col}1E` : palette.surface,
                  border: `2px solid ${col}`,
                  boxShadow: light ? "0 10px 24px rgba(24,24,27,0.10)" : "0 14px 28px rgba(0,0,0,0.38)",
                }}
              >
                <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 21, color: col, lineHeight: 1.18 }}>
                  {br.outcome}
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Bottom-Safe Callout */}
      {spec.callout && frame >= (spec.calloutAt ?? 40) && (() => {
        const cp = interpolate(frame - (spec.calloutAt ?? 40), [0, 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.poly(4)),
        });
        return (
          <div
            style={{
              position: "absolute",
              bottom: 146,
              left: "50%",
              transform: `translateX(-50%) translateY(${(1 - cp) * 14}px)`,
              opacity: cp,
              padding: "12px 28px",
              borderRadius: 8,
              background: palette.surface,
              border: `2px solid ${palette.accent}`,
              fontFamily: fonts.body,
              fontWeight: 700,
              fontSize: 24,
              color: palette.ink,
              whiteSpace: "nowrap",
              boxShadow: light ? "0 10px 24px rgba(24,24,27,0.12)" : "0 14px 34px rgba(0,0,0,0.45)",
            }}
          >
            {spec.callout}
          </div>
        );
      })()}
    </div>
  );
};
