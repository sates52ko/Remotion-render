import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ComicStripSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

const PanelGlyph: React.FC<{ kind: string; color: string; muted: string }> = ({ kind, color, muted }) => {
  if (kind === "focusBeam") {
    return (
      <svg width={180} height={96} viewBox="0 0 180 96">
        <line x1={18} y1={48} x2={156} y2={48} stroke={color} strokeWidth={8} strokeLinecap="round" />
        <polygon points="146,34 170,48 146,62" fill={color} />
      </svg>
    );
  }
  if (kind === "floodArrows") {
    return (
      <svg width={180} height={96} viewBox="0 0 180 96">
        {[18, 38, 58, 78].map((y, i) => (
          <line key={i} x1={20} y1={48} x2={152} y2={y} stroke={i === 1 ? color : muted} strokeWidth={4.5} strokeLinecap="round" />
        ))}
      </svg>
    );
  }
  if (kind === "thinSpread") {
    return (
      <svg width={180} height={96} viewBox="0 0 180 96">
        {[14, 34, 54, 74].map((y, i) => (
          <rect key={i} x={20} y={y} width={140} height={10} rx={4} fill={color} opacity={0.35 + i * 0.12} />
        ))}
      </svg>
    );
  }
  return (
    <svg width={180} height={96} viewBox="0 0 180 96">
      <rect x={68} y={28} width={44} height={44} rx={6} fill={color} />
      <line x1={24} y1={20} x2={156} y2={76} stroke={muted} strokeWidth={5} strokeLinecap="round" />
      <line x1={156} y1={20} x2={24} y2={76} stroke={muted} strokeWidth={5} strokeLinecap="round" />
    </svg>
  );
};

/**
 * ComicStrip — Multi-Panel Sequential Storyboard Grid (2–4 panels).
 *
 * Breaks single-center pHash geometry by laying out sequential phases/events
 * in progressive graphic-novel panels synced to narration words.
 */
export const ComicStrip: React.FC<{ spec: ComicStripSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const light = isLightPalette(palette);
  const fonts = resolveArtFonts(ad);

  const headP = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  const panels = spec.panels.slice(0, 4);
  const cols = spec.layout === "triptych" ? "repeat(3, 1fr)" : "repeat(2, 1fr)";

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 14, paddingBottom: 170, boxSizing: "border-box" }}>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: cols,
          gap: 16,
          minHeight: 0,
        }}
      >
        {panels.map((pn, i) => {
          const dt = frame - (pn.at ?? i * 16);
          if (dt < 0) return <div key={i} />;
          const pop = spring({ frame: dt, fps, config: { damping: 15, stiffness: 150 } });
          const col = toneColor(pn.tone ?? "accent", palette);
          const struck = pn.strikeAt != null && frame >= pn.strikeAt;
          return (
            <div
              key={i}
              style={{
                borderRadius: 10,
                background: palette.surface,
                border: `2.5px solid ${col}`,
                borderTop: `8px solid ${col}`,
                padding: "14px 20px",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                opacity: Math.min(1, pop * 1.4) * (struck ? 0.65 : 1),
                transform: `translateY(${(1 - pop) * 24}px)`,
                boxShadow: light ? "0 12px 28px rgba(24,24,27,0.08)" : "0 16px 36px rgba(0,0,0,0.42)",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {pn.step && (
                  <span
                    style={{
                      fontFamily: fonts.display,
                      fontWeight: 800,
                      fontSize: 16,
                      letterSpacing: "0.1em",
                      color: col,
                      background: `${col}1A`,
                      padding: "4px 12px",
                      borderRadius: 4,
                    }}
                  >
                    {pn.step}
                  </span>
                )}
              </div>

              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", margin: "10px 0" }}>
                {pn.image ? (
                  <Img src={staticFile(pn.image)} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }} />
                ) : (
                  <PanelGlyph kind={pn.visual ?? "focusBeam"} color={col} muted={palette.muted} />
                )}
              </div>

              <div>
                <div
                  style={{
                    fontFamily: fonts.display,
                    fontWeight: 800,
                    fontSize: 28,
                    color: palette.ink,
                    textDecoration: struck ? "line-through" : "none",
                    lineHeight: 1.15,
                  }}
                >
                  {pn.title}
                </div>
                {pn.caption && (
                  <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 20, color: palette.muted, marginTop: 6, lineHeight: 1.3 }}>
                    {pn.caption}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </GrammarStage>
  );
};
