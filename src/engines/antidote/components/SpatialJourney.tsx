import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SpatialJourneySpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { resolveStageLayout, StageGrammarOverlay } from "./layoutGrammar";

/**
 * SpatialJourney — Animated 3–5 Station Story Route Map.
 */
export const SpatialJourney: React.FC<{ spec: SpatialJourneySpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);

  const stations = spec.stations.slice(0, 5);
  const n = stations.length;
  const layout = resolveStageLayout(ad);
  const leftEdge = layout.contentBox.left + 120;
  const rightEdge = layout.contentBox.left + layout.contentBox.width - 120;
  const xs = stations.map((_, i) => leftEdge + (i * ((rightEdge - leftEdge) / Math.max(1, n - 1))));
  const ys = stations.map((_, i) => (i % 2 === 0 ? 440 : 620));

  const pathD = xs.map((x, i) => (i === 0 ? `M ${x} ${ys[i]}` : `Q ${(xs[i - 1] + x) / 2} ${(ys[i - 1] + ys[i]) / 2 - 40} ${x} ${ys[i]}`)).join(" ");
  const drawP = interpolate(frame, [0, Math.max(24, n * 18)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(3)),
  });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {spec.title && (
        <div style={{ position: "absolute", top: 48, left: 88, borderLeft: `6px solid ${palette.accent}`, paddingLeft: 20 }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 46, color: palette.ink }}>{spec.title}</div>
          {spec.subtitle && <div style={{ fontFamily: fonts.body, fontSize: 22, color: palette.muted, marginTop: 4 }}>{spec.subtitle}</div>}
        </div>
      )}

      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {spec.variant === "topoExpedition" && (
          <g fill="none" stroke={palette.surfaceBorder} strokeWidth={2} opacity={0.55}>
            {[0, 1, 2, 3, 4].map((r) => (
              <ellipse key={r} cx={960} cy={540} rx={260 + r * 170} ry={120 + r * 85} />
            ))}
          </g>
        )}
        {spec.variant === "worldArc" && (
          <g fill="none" stroke={palette.surfaceBorder} strokeWidth={1.5} opacity={0.45}>
            {[320, 640, 960, 1280, 1600].map((gx) => (
              <line key={gx} x1={gx} y1={140} x2={gx} y2={920} />
            ))}
            {[280, 480, 680].map((gy) => (
              <line key={gy} x1={120} y1={gy} x2={1800} y2={gy} />
            ))}
          </g>
        )}
        {spec.variant === "routeMap" && (
          <g fill="none" stroke={palette.accent} strokeWidth={2} opacity={0.35}>
            <circle cx={1760} cy={140} r={44} />
            <line x1={1760} y1={84} x2={1760} y2={196} />
            <line x1={1704} y1={140} x2={1816} y2={140} />
          </g>
        )}
        <path d={pathD} fill="none" stroke={palette.surfaceBorder} strokeWidth={6} strokeDasharray="10 10" />
        <path d={pathD} fill="none" stroke={palette.accent} strokeWidth={6} strokeDasharray={2400} strokeDashoffset={(1 - drawP) * 2400} strokeLinecap="round" />
      </svg>

      {stations.map((st, i) => {
        const dt = frame - (st.at ?? i * 16);
        if (dt < 0) return null;
        const pop = spring({ frame: dt, fps, config: { damping: 14, stiffness: 155 } });
        const col = toneColor(st.tone ?? "accent", palette);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: xs[i],
              top: ys[i],
              transform: `translate(-50%, -50%) scale(${0.86 + pop * 0.14})`,
              opacity: pop,
              width: 260,
              padding: "16px 18px",
              borderRadius: 10,
              background: palette.surface,
              border: `2.5px solid ${col}`,
              borderTop: `6px solid ${col}`,
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 22, color: palette.ink }}>{st.label}</div>
            {st.detail && <div style={{ fontFamily: fonts.body, fontSize: 16, color: palette.muted, marginTop: 4 }}>{st.detail}</div>}
          </div>
        );
      })}
      <StageGrammarOverlay stageMood={stageMood} />
    </div>
  );
};
