import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { BalanceScaleSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";

/**
 * BalanceScale — Animated Physical Fulcrum & Trade-Off Seesaw.
 *
 * Weights drop onto left/right pans at exact word frames, physically tilting the beam
 * toward the heavier strategic reality.
 */
export const BalanceScale: React.FC<{ spec: BalanceScaleSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
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

  // Compute dynamic spring-smoothed tilt from arrived weights
  let leftMass = 0;
  let rightMass = 0;
  for (const w of spec.leftWeights) {
    const p = spring({ frame: Math.max(0, frame - (w.at ?? 0)), fps, config: { damping: 14, stiffness: 120 } });
    if (frame >= (w.at ?? 0)) leftMass += w.weight * p;
  }
  for (const w of spec.rightWeights) {
    const p = spring({ frame: Math.max(0, frame - (w.at ?? 0)), fps, config: { damping: 14, stiffness: 120 } });
    if (frame >= (w.at ?? 0)) rightMass += w.weight * p;
  }
  const total = Math.max(1, leftMass + rightMass);
  const tiltDeg = Math.max(-13, Math.min(13, ((rightMass - leftMass) / total) * 15));
  const rad = (tiltDeg * Math.PI) / 180;

  const cx = 960;
  const cy = 480;
  const panDrop = 170;
  const halfBeam = 420;
  const lx = cx - halfBeam * Math.cos(rad);
  const ly = cy - halfBeam * Math.sin(rad);
  const rx = cx + halfBeam * Math.cos(rad);
  const ry = cy + halfBeam * Math.sin(rad);

  const renderPan = (
    px: number,
    py: number,
    label: string,
    weights: BalanceScaleSpec["leftWeights"],
    defaultTone: "danger" | "positive"
  ) => (
    <div
      style={{
        position: "absolute",
        left: px,
        top: py + panDrop,
        width: 380,
        transform: "translate(-50%, -100%)",
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "center",
        gap: 10,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      {/* Pan tray */}
      <div
        style={{
          width: 340,
          height: 14,
          borderRadius: 6,
          background: palette.ink,
          boxShadow: light ? "0 8px 18px rgba(24,24,27,0.18)" : "0 10px 24px rgba(0,0,0,0.5)",
        }}
      />
      {/* Pan label */}
      <div
        style={{
          position: "absolute",
          bottom: -44,
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: palette.muted,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      {/* Stacked weight blocks */}
      {weights.map((w, wi) => {
        const dt = frame - (w.at ?? 0);
        if (dt < 0) return null;
        const wp = spring({ frame: dt, fps, config: { damping: 15, stiffness: 150 } });
        const col = toneColor(w.tone ?? defaultTone, palette);
        return (
          <div
            key={wi}
            style={{
              width: 310,
              padding: "14px 18px",
              borderRadius: 8,
              background: palette.surface,
              border: `2.5px solid ${col}`,
              borderLeft: `8px solid ${col}`,
              transform: `translateY(${(1 - wp) * -90}px)`,
              opacity: Math.min(1, wp * 1.5),
              boxShadow: light ? "0 10px 24px rgba(24,24,27,0.12)" : "0 12px 28px rgba(0,0,0,0.42)",
            }}
          >
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 22, color: palette.ink, lineHeight: 1.15 }}>
              {w.label}
            </div>
            {w.sublabel && (
              <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 16, color: palette.muted, marginTop: 4 }}>
                {w.sublabel}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

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
            textAlign: "center",
            opacity: titleP,
            transform: `translateY(${(1 - titleP) * 18}px)`,
          }}
        >
          {spec.title && (
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 50, color: palette.ink, lineHeight: 1.08 }}>
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

      {/* Fulcrum & Beam SVG */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
        {/* Base & Pillar */}
        <polygon points={`${cx - 56},740 ${cx + 56},740 ${cx},495`} fill={palette.ink} opacity={0.85} />
        <rect x={cx - 140} y={740} width={280} height={14} rx={4} fill={palette.ink} />
        {/* Beam */}
        <line x1={lx} y1={ly} x2={rx} y2={ry} stroke={palette.ink} strokeWidth={10} strokeLinecap="round" />
        {/* Pivot */}
        <circle cx={cx} cy={cy} r={16} fill={palette.accent} stroke={palette.ink} strokeWidth={4} />
        {/* Pan Hangers */}
        <line x1={lx} y1={ly} x2={lx} y2={ly + panDrop} stroke={palette.muted} strokeWidth={3} />
        <line x1={rx} y1={ry} x2={rx} y2={ry + panDrop} stroke={palette.muted} strokeWidth={3} />
      </svg>

      {renderPan(lx, ly, spec.leftLabel, spec.leftWeights, "danger")}
      {renderPan(rx, ry, spec.rightLabel, spec.rightWeights, "positive")}

      {/* Verdict */}
      {spec.verdict && frame >= (spec.verdictAt ?? 60) && (() => {
        const vp = interpolate(frame - (spec.verdictAt ?? 60), [0, 14], [0, 1], {
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
              transform: `translateX(-50%) translateY(${(1 - vp) * 14}px)`,
              opacity: vp,
              padding: "12px 30px",
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
            {spec.verdict}
          </div>
        );
      })()}
    </div>
  );
};
