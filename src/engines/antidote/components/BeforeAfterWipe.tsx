import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { BeforeAfterWipeSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { StageGrammarOverlay } from "./layoutGrammar";

/**
 * BeforeAfterWipe — Full-Bleed Animated Curtain Contrast Between Two Worlds.
 *
 * Visually transitions from `before` (e.g., Boardroom) to `after` (e.g., Living Room)
 * with a crisp diagonal or vertical wipe divider.
 */
export const BeforeAfterWipe: React.FC<{ spec: BeforeAfterWipeSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);

  const wipeAt = spec.wipeAt ?? 36;
  const endSplit = spec.endSplit ?? 0.5;
  const wp = interpolate(frame - wipeAt, [0, 26], [0, endSplit], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  const diag = spec.direction === "diagonal";
  const pct = (wp * 100).toFixed(2);
  const pctTop = diag ? Math.min(100, wp * 100 + 6).toFixed(2) : pct;
  const pctBot = diag ? Math.max(0, wp * 100 - 6).toFixed(2) : pct;
  const clipAfter = `polygon(${pctTop}% 0%, 100% 0%, 100% 100%, ${pctBot}% 100%)`;

  const renderHalf = (side: BeforeAfterWipeSpec["before"], align: "left" | "right") => {
    const col = toneColor(side.tone ?? "accent", palette);
    const hasImg = Boolean(side.image);
    return (
      <div style={{ position: "absolute", inset: 0, background: hasImg ? undefined : (align === "left" ? palette.bg : palette.bgAlt) }}>
        {hasImg ? (
          <>
            <Img src={staticFile(side.image!)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(16,18,22,0.58) 0%, rgba(16,18,22,0.18) 45%, rgba(16,18,22,0.72) 100%)",
              }}
            />
          </>
        ) : (
          <>
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${col}18 0%, transparent 65%)` }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: col }} />
          </>
        )}
        <div
          style={{
            position: "absolute",
            top: hasImg ? 64 : 160,
            [align]: hasImg ? 64 : 84,
            maxWidth: hasImg ? 740 : 760,
            textAlign: align,
          }}
        >
          <span
            style={{
              display: "inline-block",
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: 18,
              letterSpacing: "0.12em",
              color: "#FFFFFF",
              background: col,
              padding: "6px 16px",
              borderRadius: 4,
              marginBottom: 14,
            }}
          >
            {side.label}
          </span>
          <div
            style={{
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: hasImg ? 44 : 50,
              color: hasImg ? "#FFFFFF" : palette.ink,
              lineHeight: 1.1,
              textShadow: hasImg ? "0 4px 18px rgba(0,0,0,0.55)" : "none",
            }}
          >
            {side.headline}
          </div>
          {(side.points ?? []).length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {(side.points ?? []).map((pt, pi) => (
                <div key={pi} style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: hasImg ? 22 : 26, color: hasImg ? "#F4F4F5" : palette.muted, textShadow: hasImg ? "0 2px 10px rgba(0,0,0,0.65)" : "none" }}>
                  • {pt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {renderHalf(spec.before, "left")}
      <div style={{ position: "absolute", inset: 0, clipPath: clipAfter }}>
        {renderHalf(spec.after, "right")}
      </div>
      {/* Wipe Divider Line */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <line
          x1={(Number(pctTop) / 100) * 1920}
          y1={0}
          x2={(Number(pctBot) / 100) * 1920}
          y2={1080}
          stroke={palette.accent}
          strokeWidth={6}
        />
      </svg>
      <StageGrammarOverlay stageMood={stageMood} />
    </div>
  );
};
