import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { RealAnchorSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, useArtDirection, type StageMoodName } from "./artDirection";
import { StageGrammarOverlay } from "./layoutGrammar";

/**
 * RealAnchorCard — Real-world book cover / author portrait / research document / quote
 * with animated curved editorial pointer arrows and callout notes.
 * Strong YPP educational-commentary signal (direct parallel to Real Antidote's Deep Work & Art of War anchors).
 */
export const RealAnchorCard: React.FC<{ spec: RealAnchorSpec; localFrame?: number; stageMood?: StageMoodName; sideInsetLeft?: number }> = ({ spec, localFrame, stageMood, sideInsetLeft = 0 }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const displayFont = fonts.display;
  const bodyFont = fonts.body;
  const captionPad = ad?.captions === "minimal" ? 148 : 104;
  const noteColW = sideInsetLeft ? 340 : 420;
  const plateW = sideInsetLeft ? 560 : 620;

  const cardP = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.95 },
  });

  const leftNotes = spec.annotations.filter((a) => a.side === "left").slice(0, 3);
  const rightNotes = spec.annotations.filter((a) => a.side !== "left").slice(0, 3);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: sideInsetLeft ? 32 : 44,
        padding: `70px 72px ${captionPad}px ${sideInsetLeft + 72}px`,
        boxSizing: "border-box",
      }}
    >
      {/* Left-hand editorial annotations */}
      {leftNotes.length > 0 && (
        <div style={{ width: noteColW, display: "flex", flexDirection: "column", gap: 36, alignItems: "flex-end" }}>
          {leftNotes.map((note, i) => {
            const np = interpolate(frame, [10 + i * 9, 22 + i * 9], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.poly(3)),
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  opacity: np,
                  transform: `translateX(${(1 - np) * -22}px)`,
                }}
              >
                <div
                  style={{
                    textAlign: "right",
                    fontFamily: displayFont,
                    fontWeight: 800,
                    fontSize: 30,
                    lineHeight: 1.2,
                    color: palette.accent,
                    textShadow: "0 4px 18px rgba(0,0,0,0.45)",
                  }}
                >
                  {note.text}
                </div>
                <svg width={76} height={36} viewBox="0 0 76 36" style={{ flexShrink: 0 }}>
                  <path
                    d="M 4 22 Q 36 8, 66 18"
                    fill="none"
                    stroke={palette.accent}
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    strokeDasharray={100}
                    strokeDashoffset={(1 - np) * 100}
                  />
                  <polygon points="58,10 72,19 57,26" fill={palette.accent} opacity={np > 0.65 ? 1 : 0} />
                </svg>
              </div>
            );
          })}
        </div>
      )}

      {/* Center Anchor Plate (Book Cover / Study Document / Author Quote) */}
      <div
        style={{
          width: spec.image ? plateW : (sideInsetLeft ? 680 : 780),
          maxWidth: 840,
          borderRadius: 28,
          background: palette.surface,
          border: `3px solid ${palette.accent}`,
          boxShadow: "0 30px 76px rgba(0,0,0,0.52)",
          padding: "36px 42px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          opacity: cardP,
          transform: `translateY(${(1 - cardP) * 32}px) scale(${0.94 + cardP * 0.06})`,
        }}
      >
        {spec.badge && (
          <div
            style={{
              fontFamily: displayFont,
              fontWeight: 800,
              fontSize: 18,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: palette.bg,
              background: palette.accent,
              padding: "6px 18px",
              borderRadius: 999,
              marginBottom: 20,
            }}
          >
            {spec.badge}
          </div>
        )}

        {spec.image && (
          <div
            style={{
              width: "100%",
              height: 360,
              borderRadius: 18,
              overflow: "hidden",
              marginBottom: 24,
              border: `1.5px solid ${palette.surfaceBorder}`,
              background: "rgba(0,0,0,0.28)",
            }}
          >
            <Img src={staticFile(spec.image)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}

        <div
          style={{
            fontFamily: displayFont,
            fontWeight: 900,
            fontSize: 44,
            lineHeight: 1.12,
            color: palette.ink,
          }}
        >
          {spec.title}
        </div>

        {spec.subtitle && (
          <div
            style={{
              fontFamily: bodyFont,
              fontWeight: 600,
              fontSize: 24,
              color: palette.muted,
              marginTop: 10,
            }}
          >
            {spec.subtitle}
          </div>
        )}

        {spec.quote && (
          <div
            style={{
              marginTop: 24,
              padding: "22px 28px",
              borderRadius: 18,
              background: "rgba(255,255,255,0.05)",
              borderLeft: `6px solid ${palette.accent}`,
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: "italic",
              fontSize: 30,
              lineHeight: 1.38,
              color: palette.ink,
              textAlign: "left",
            }}
          >
            “{(() => {
              const phrases = spec.highlightPhrases ?? [];
              if (!phrases.length) return spec.quote;
              const segments: Array<{ text: string; at?: number }> = [{ text: spec.quote }];
              for (const ph of phrases) {
                for (let si = 0; si < segments.length; si++) {
                  const seg = segments[si];
                  if (seg.at != null) continue;
                  const idx = seg.text.indexOf(ph.text);
                  if (idx >= 0) {
                    const before = seg.text.slice(0, idx);
                    const match = seg.text.slice(idx, idx + ph.text.length);
                    const after = seg.text.slice(idx + ph.text.length);
                    const rep: Array<{ text: string; at?: number }> = [];
                    if (before) rep.push({ text: before });
                    rep.push({ text: match, at: ph.at });
                    if (after) rep.push({ text: after });
                    segments.splice(si, 1, ...rep);
                    break;
                  }
                }
              }
              return segments.map((seg, si) => {
                if (seg.at == null) return <React.Fragment key={si}>{seg.text}</React.Fragment>;
                const hp = interpolate(frame, [seg.at, seg.at + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                return (
                  <span
                    key={si}
                    style={{
                      background: `linear-gradient(90deg, ${palette.accent}55 0%, ${palette.accent}55 100%)`,
                      backgroundRepeat: "no-repeat",
                      backgroundSize: `${hp * 100}% 100%`,
                      borderRadius: 4,
                      padding: "0 4px",
                    }}
                  >
                    {seg.text}
                  </span>
                );
              });
            })()}”
            {spec.attribution && (
              <div
                style={{
                  fontFamily: displayFont,
                  fontStyle: "normal",
                  fontWeight: 700,
                  fontSize: 20,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: palette.accent,
                  marginTop: 12,
                }}
              >
                — {spec.attribution}
              </div>
            )}
          </div>
        )}

        {spec.marginNote && (() => {
          const mp = interpolate(frame, [spec.marginNote.at ?? 24, (spec.marginNote.at ?? 24) + 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              style={{
                marginTop: 18,
                fontFamily: "Georgia, 'Brush Script MT', cursive",
                fontStyle: "italic",
                fontWeight: 700,
                fontSize: 32,
                color: palette.accent,
                transform: "rotate(-1.5deg)",
                opacity: mp,
              }}
            >
              {spec.marginNote.text}
            </div>
          );
        })()}
      </div>

      {/* Right-hand editorial annotations */}
      {rightNotes.length > 0 && (
        <div style={{ width: noteColW, display: "flex", flexDirection: "column", gap: 36, alignItems: "flex-start" }}>
          {rightNotes.map((note, i) => {
            const np = interpolate(frame, [14 + i * 9, 26 + i * 9], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.poly(3)),
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  opacity: np,
                  transform: `translateX(${(1 - np) * 22}px)`,
                }}
              >
                <svg width={76} height={36} viewBox="0 0 76 36" style={{ flexShrink: 0 }}>
                  <path
                    d="M 72 22 Q 40 8, 10 18"
                    fill="none"
                    stroke={palette.accent}
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    strokeDasharray={100}
                    strokeDashoffset={(1 - np) * 100}
                  />
                  <polygon points="18,10 4,19 19,26" fill={palette.accent} opacity={np > 0.65 ? 1 : 0} />
                </svg>
                <div
                  style={{
                    textAlign: "left",
                    fontFamily: displayFont,
                    fontWeight: 800,
                    fontSize: 30,
                    lineHeight: 1.2,
                    color: palette.accent,
                    textShadow: "0 4px 18px rgba(0,0,0,0.45)",
                  }}
                >
                  {note.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
