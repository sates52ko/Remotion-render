import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ComparisonGridSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { StageGrammarOverlay } from "./layoutGrammar";

/**
 * ComparisonGrid — Side-by-side framed mental-model contrast cards
 * (e.g. Anchoring $10,000 vs $3,000; Local Coffee Shop vs Starbucks; System 1 vs System 2).
 * Pairs bespoke Flux editorial illustrations with concise scannable takeaways.
 */
export const ComparisonGrid: React.FC<{ spec: ComparisonGridSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const displayFont = fonts.display;
  const bodyFont = fonts.body;

  const cols = spec.columns.slice(0, 3);
  const n = cols.length;
  const layout = spec.layout ?? "cards";
  const captionPad = ad?.captions === "minimal" ? 148 : 88;
  const titleP = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  if (layout === "fullBleedSplit" && cols.length >= 2) {
    const left = cols[0];
    const right = cols[1];
    const wipeP = interpolate(frame, [10, 26], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.poly(4)),
    });
    const kbLeft = interpolate(frame, [0, 420], [1.02, 1.07], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const kbRight = interpolate(frame, [10, 420], [1.03, 1.08], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

    const renderHalf = (col: typeof left, align: "left" | "right", kb: number) => {
      const accent = toneColor(col.tone, palette);
      const hasTone = col.tone && col.tone !== "neutral";
      const hasImg = Boolean(col.image);
      const colAccent = hasTone ? accent : palette.accent;
      return (
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: hasImg ? palette.bg : (align === "left" ? palette.bg : palette.bgAlt) }}>
          {hasImg ? (
            <>
              <Img
                src={staticFile(col.image!)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: `scale(${kb})`,
                  transformOrigin: "center",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, rgba(8,10,15,0.68) 0%, rgba(8,10,15,0.12) 38%, rgba(8,10,15,0.18) 58%, rgba(8,10,15,0.90) 100%)",
                }}
              />
            </>
          ) : (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, background: colAccent }} />
          )}
          <div
            style={{
              position: "absolute",
              left: 64,
              right: 64,
              ...(hasImg ? { bottom: captionPad + 20 } : { top: 136, bottom: captionPad + 56, justifyContent: "center" }),
              textAlign: align,
              display: "flex",
              flexDirection: "column",
              alignItems: align === "left" ? "flex-start" : "flex-end",
              gap: 12,
            }}
          >
            {col.tag && (
              <span
                style={{
                  fontFamily: displayFont,
                  fontWeight: 900,
                  fontSize: 18,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "6px 16px",
                  borderRadius: 6,
                  background: colAccent,
                  color: "#FFFFFF",
                }}
              >
                {col.tag}
              </span>
            )}
            <div
              style={{
                fontFamily: displayFont,
                fontWeight: 900,
                fontSize: hasImg ? 48 : 52,
                lineHeight: 1.08,
                color: hasImg ? "#F8F5EE" : palette.ink,
                textShadow: hasImg ? "0 4px 18px rgba(0,0,0,0.72)" : "none",
              }}
            >
              {col.heading}
            </div>
            {col.bullets.slice(0, hasImg ? 2 : 3).map((b, bi) => (
              <div
                key={bi}
                style={{
                  fontFamily: bodyFont,
                  fontWeight: 600,
                  fontSize: hasImg ? 25 : 27,
                  lineHeight: 1.28,
                  color: hasImg ? "rgba(248,245,238,0.88)" : palette.muted,
                  textShadow: hasImg ? "0 2px 10px rgba(0,0,0,0.8)" : "none",
                }}
              >
                {hasImg ? b : `• ${b}`}
              </div>
            ))}
            {!hasImg && col.highlight && (
              <div
                style={{
                  marginTop: 6,
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: `${colAccent}18`,
                  border: `1.5px solid ${colAccent}`,
                  fontFamily: displayFont,
                  fontWeight: 800,
                  fontSize: 20,
                  color: colAccent,
                }}
              >
                {col.highlight}
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: "50%", height: "100%" }}>
          {renderHalf(left, "left", kbLeft)}
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: "50%",
            height: "100%",
            clipPath: `inset(0 ${(1 - wipeP) * 100}% 0 0)`,
          }}
        >
          {renderHalf(right, "right", kbRight)}
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 4,
            marginLeft: -2,
            background: palette.accent,
            boxShadow: `0 0 22px ${palette.accent}`,
            transform: `scaleY(${wipeP})`,
            transformOrigin: "top center",
          }}
        />
        {spec.title && (
          <div
            style={{
              position: "absolute",
              top: 36,
              left: "50%",
              transform: `translateX(-50%) translateY(${(1 - titleP) * -16}px)`,
              opacity: titleP,
              padding: "10px 28px",
              borderRadius: 999,
              background: "rgba(8,10,15,0.72)",
              border: `1px solid ${palette.surfaceBorder}`,
              fontFamily: displayFont,
              fontWeight: 900,
              fontSize: 30,
              letterSpacing: "0.04em",
              color: palette.accent,
              whiteSpace: "nowrap",
              textShadow: "0 2px 12px rgba(0,0,0,0.7)",
            }}
          >
            {spec.title}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: `70px 96px ${ad?.captions === "minimal" ? 148 : 104}px`,
        boxSizing: "border-box",
      }}
    >
      {(spec.title || spec.subtitle) && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 40,
            opacity: titleP,
            transform: `translateY(${(1 - titleP) * 20}px)`,
          }}
        >
          {spec.title && (
            <div
              style={{
                fontFamily: displayFont,
                fontWeight: 900,
                fontSize: 58,
                lineHeight: 1.06,
                color: palette.accent,
                letterSpacing: "0.02em",
                textShadow: "0 6px 24px rgba(0,0,0,0.4)",
              }}
            >
              {spec.title}
            </div>
          )}
          {spec.subtitle && (
            <div
              style={{
                fontFamily: bodyFont,
                fontWeight: 500,
                fontSize: 26,
                color: palette.muted,
                marginTop: 10,
              }}
            >
              {spec.subtitle}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(1, n)}, minmax(0, 1fr))`,
          gap: 36,
          width: "100%",
          maxWidth: 1680,
          alignItems: "stretch",
        }}
      >
        {cols.map((col, i) => {
          const colP = spring({
            frame: Math.max(0, frame - (4 + i * 8)),
            fps,
            config: { damping: 16, stiffness: 135 },
          });
          const accent = toneColor(col.tone, palette);
          const hasTone = col.tone && col.tone !== "neutral";

          const isBorderless = layout === "borderless";
          return (
            <div
              key={i}
              style={{
                background: isBorderless ? "transparent" : palette.surface,
                border: isBorderless ? "none" : `3px solid ${hasTone ? accent : palette.surfaceBorder}`,
                borderLeft: isBorderless && i > 0 ? `1px solid ${palette.surfaceBorder}` : undefined,
                borderRadius: isBorderless ? 0 : 28,
                padding: isBorderless ? "12px 36px" : "30px 32px 32px",
                boxShadow: isBorderless ? "none" : "0 24px 54px rgba(0,0,0,0.38)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                opacity: colP,
                transform: `translateY(${(1 - colP) * 30}px)`,
              }}
            >
              <div>
                {/* Top tag + Heading */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div
                    style={{
                      fontFamily: displayFont,
                      fontWeight: 800,
                      fontSize: n <= 2 ? 38 : 30,
                      lineHeight: 1.12,
                      color: hasTone ? accent : palette.ink,
                    }}
                  >
                    {col.heading}
                  </div>
                  {col.tag && (
                    <span
                      style={{
                        fontFamily: displayFont,
                        fontWeight: 800,
                        fontSize: 18,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "6px 14px",
                        borderRadius: 10,
                        background: `${accent}24`,
                        color: accent,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col.tag}
                    </span>
                  )}
                </div>

                {/* Optional Flux visual */}
                {col.image && (
                  <div
                    style={{
                      width: "100%",
                      height: n <= 2 ? 260 : 210,
                      marginTop: 22,
                      borderRadius: 18,
                      overflow: "hidden",
                      border: `1.5px solid ${palette.surfaceBorder}`,
                      background: "rgba(0,0,0,0.25)",
                    }}
                  >
                    <Img
                      src={staticFile(col.image)}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}

                {/* Staggered bullet takeaways */}
                <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                  {col.bullets.slice(0, 5).map((b, bi) => {
                    const bp = interpolate(frame, [14 + i * 8 + bi * 5, 22 + i * 8 + bi * 5], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.out(Easing.cubic),
                    });
                    return (
                      <div
                        key={bi}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 14,
                          opacity: bp,
                          transform: `translateX(${(1 - bp) * 16}px)`,
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            minWidth: 28,
                            borderRadius: "50%",
                            marginTop: 3,
                            background: `${accent}28`,
                            border: `2px solid ${accent}`,
                            color: accent,
                            fontFamily: displayFont,
                            fontWeight: 900,
                            fontSize: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {col.tone === "danger" ? "×" : col.tone === "positive" ? "✓" : "•"}
                        </span>
                        <span
                          style={{
                            fontFamily: bodyFont,
                            fontWeight: 600,
                            fontSize: n <= 2 ? 26 : 22,
                            lineHeight: 1.32,
                            color: palette.ink,
                          }}
                        >
                          {b}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom highlight bar */}
              {col.highlight && (
                <div
                  style={{
                    marginTop: 26,
                    padding: "14px 20px",
                    borderRadius: 14,
                    background: `${accent}22`,
                    borderLeft: `6px solid ${accent}`,
                    fontFamily: displayFont,
                    fontWeight: 800,
                    fontSize: n <= 2 ? 26 : 22,
                    color: hasTone ? accent : palette.ink,
                  }}
                >
                  {col.highlight}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
