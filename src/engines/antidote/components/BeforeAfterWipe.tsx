import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { BeforeAfterWipeSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { StageGrammarOverlay } from "./layoutGrammar";
import { RoughMarks } from "./RoughMarks";

/**
 * BeforeAfterWipe — Full-Bleed Animated Curtain Contrast Between Two Worlds.
 *
 * When `image` is absent, renders a center-weighted, high-contrast split-poster
 * composition with animated RoughMarks strikethrough/underline so zero void remains.
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
  const markP = interpolate(frame - (wipeAt + 14), [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const diag = spec.direction === "diagonal";
  const pct = (wp * 100).toFixed(2);
  const pctTop = diag ? Math.min(100, wp * 100 + 6).toFixed(2) : pct;
  const pctBot = diag ? Math.max(0, wp * 100 - 6).toFixed(2) : pct;
  const clipAfter = `polygon(${pctTop}% 0%, 100% 0%, 100% 100%, ${pctBot}% 100%)`;

  const renderHalf = (side: BeforeAfterWipeSpec["before"], align: "left" | "right", isAfter: boolean) => {
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
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at ${isAfter ? "76%" : "24%"} 48%, ${col}24 0%, transparent 62%)` }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: col }} />
          </>
        )}
        <div
          style={{
            position: "absolute",
            top: hasImg ? 64 : "50%",
            transform: hasImg ? undefined : "translateY(-54%)",
            [align]: hasImg ? 64 : 110,
            width: hasImg ? 740 : 680,
            padding: hasImg ? 0 : "38px 42px",
            borderRadius: hasImg ? 0 : 18,
            background: hasImg ? "transparent" : `${palette.surface}EE`,
            border: hasImg ? "none" : `2.5px solid ${col}66`,
            boxShadow: hasImg ? "none" : "0 18px 44px rgba(0,0,0,0.28)",
            textAlign: align,
          }}
        >
          <span
            style={{
              display: "inline-block",
              fontFamily: fonts.display,
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: "0.14em",
              color: "#FFFFFF",
              background: col,
              padding: "7px 18px",
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            {side.label}
          </span>
          <div style={{ position: "relative", display: "inline-block" }}>
            <div
              style={{
                fontFamily: fonts.display,
                fontWeight: 900,
                fontSize: hasImg ? 44 : 52,
                color: hasImg ? "#FFFFFF" : palette.ink,
                lineHeight: 1.08,
                textShadow: hasImg ? "0 4px 18px rgba(0,0,0,0.55)" : "none",
              }}
            >
              {side.headline}
            </div>
            {!hasImg && (
              <div style={{ marginTop: 4 }}>
                <RoughMarks
                  kind={isAfter ? "underline" : "strike"}
                  width={380}
                  height={16}
                  color={col}
                  progress={markP}
                  seed={side.headline}
                />
              </div>
            )}
          </div>
          {(side.points ?? []).length > 0 && (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              {(side.points ?? []).map((pt, pi) => (
                <div
                  key={pi}
                  style={{
                    fontFamily: fonts.body,
                    fontWeight: 600,
                    fontSize: hasImg ? 22 : 25,
                    color: hasImg ? "#F4F4F5" : palette.ink,
                    padding: hasImg ? 0 : "10px 16px",
                    borderRadius: 10,
                    background: hasImg ? "transparent" : `${col}18`,
                    borderLeft: hasImg ? "none" : `4px solid ${col}`,
                    textShadow: hasImg ? "0 2px 10px rgba(0,0,0,0.65)" : "none",
                  }}
                >
                  {pt}
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
      {renderHalf(spec.before, "left", false)}
      <div style={{ position: "absolute", inset: 0, clipPath: clipAfter }}>
        {renderHalf(spec.after, "right", true)}
      </div>
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
