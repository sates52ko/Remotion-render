import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { EditorialSpreadSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { StageGrammarOverlay } from "./layoutGrammar";

/**
 * EditorialSpread — Full-Bleed Asymmetric 2-Column Magazine Spread.
 *
 * Replaces repetitive rounded white quote boxes with an edge-to-edge vertical artwork
 * panel beside open editorial typography directly on the stage mood canvas.
 */
export const EditorialSpread: React.FC<{ spec: EditorialSpreadSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const light = isLightPalette(palette);
  const fonts = resolveArtFonts(ad);

  const mediaLeft = spec.mediaSide ? spec.mediaSide === "left" : ad?.layoutGrammar !== "editorialRight";
  const kb = interpolate(frame, [0, 480], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const imgScale = 1.01 + kb * 0.045;

  const headP = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  const renderQuote = (quote: string) => {
    const phrases = spec.highlightPhrases ?? [];
    if (!phrases.length) return quote;
    const segments: Array<{ text: string; activeP: number }> = [];
    let cursor = 0;
    const matches = phrases
      .map((ph) => ({ ...ph, idx: quote.toLowerCase().indexOf(ph.text.toLowerCase()) }))
      .filter((m) => m.idx >= 0)
      .sort((a, b) => a.idx - b.idx);
    for (const m of matches) {
      if (m.idx < cursor) continue;
      if (m.idx > cursor) segments.push({ text: quote.slice(cursor, m.idx), activeP: 0 });
      const hp = interpolate(frame - m.at, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      segments.push({ text: quote.slice(m.idx, m.idx + m.text.length), activeP: hp });
      cursor = m.idx + m.text.length;
    }
    if (cursor < quote.length) segments.push({ text: quote.slice(cursor), activeP: 0 });

    return segments.map((seg, i) =>
      seg.activeP > 0 ? (
        <span
          key={i}
          style={{
            background: `linear-gradient(90deg, ${palette.accent}33 ${(seg.activeP * 100).toFixed(0)}%, transparent ${(seg.activeP * 100).toFixed(0)}%)`,
            borderBottom: `3px solid ${palette.accent}`,
            padding: "0 4px",
          }}
        >
          {seg.text}
        </span>
      ) : (
        <React.Fragment key={i}>{seg.text}</React.Fragment>
      )
    );
  };

  const mediaPanel = (
    <div style={{ width: "44%", height: "100%", position: "relative", overflow: "hidden" }}>
      <Img
        src={staticFile(spec.image)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${imgScale.toFixed(4)})`,
          transformOrigin: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: mediaLeft
            ? `linear-gradient(90deg, transparent 78%, ${palette.bg} 100%)`
            : `linear-gradient(270deg, transparent 78%, ${palette.bg} 100%)`,
          opacity: 0.45,
        }}
      />
    </div>
  );

  const textPanel = (
    <div
      style={{
        width: "56%",
        height: "100%",
        boxSizing: "border-box",
        padding: "76px 86px 150px 86px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        borderLeft: mediaLeft ? `1.5px solid ${palette.surfaceBorder}` : undefined,
        borderRight: !mediaLeft ? `1.5px solid ${palette.surfaceBorder}` : undefined,
      }}
    >
      {spec.kicker && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 18,
            opacity: headP,
          }}
        >
          <div style={{ width: 38, height: 3, background: palette.accent }} />
          <div
            style={{
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: 19,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: palette.accent,
            }}
          >
            {spec.kicker}
          </div>
        </div>
      )}

      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 54,
          lineHeight: 1.08,
          color: palette.ink,
          opacity: headP,
          transform: `translateY(${(1 - headP) * 20}px)`,
        }}
      >
        {spec.headline}
      </div>

      {spec.quote && (
        <div
          style={{
            marginTop: 28,
            paddingLeft: 24,
            borderLeft: `4px solid ${palette.accent}`,
            fontFamily: fonts.body,
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 31,
            lineHeight: 1.42,
            color: light ? palette.ink : palette.muted,
            opacity: interpolate(frame, [10, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          “{renderQuote(spec.quote)}”
        </div>
      )}

      {(spec.points ?? []).length > 0 && (
        <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 18 }}>
          {(spec.points ?? []).map((pt, pi) => {
            const pp = interpolate(frame - (pt.at ?? 16 + pi * 12), [0, 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.poly(3)),
            });
            const col = toneColor(pt.tone ?? "accent", palette);
            return (
              <div
                key={pi}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  opacity: pp,
                  transform: `translateX(${(1 - pp) * 18}px)`,
                }}
              >
                <div style={{ width: 6, height: 34, marginTop: 4, background: col, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 27, color: palette.ink, lineHeight: 1.2 }}>
                    {pt.label}
                  </div>
                  {pt.detail && (
                    <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 21, color: palette.muted, marginTop: 4, lineHeight: 1.3 }}>
                      {pt.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {spec.attribution && (
        <div
          style={{
            marginTop: 30,
            fontFamily: fonts.display,
            fontWeight: 700,
            fontSize: 19,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: palette.muted,
            opacity: interpolate(frame, [18, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          — {spec.attribution}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "row" }}>
      {mediaLeft ? (
        <>
          {mediaPanel}
          {textPanel}
        </>
      ) : (
        <>
          {textPanel}
          {mediaPanel}
        </>
      )}
      <StageGrammarOverlay stageMood={stageMood} />
    </div>
  );
};
