import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { KineticManifestoSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * KineticManifesto — Full-Screen Typographic Pattern Interrupt.
 *
 * Zero image, zero card box, zero circle: pure editorial typography with staggered
 * waterfall entrances and word-synced strike-throughs.
 */
export const KineticManifesto: React.FC<{ spec: KineticManifestoSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);

  const kickerP = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  const lineCount = spec.lines.length;
  const fontSize = lineCount <= 2 ? 102 : lineCount === 3 ? 86 : 74;

  return (
    <GrammarStage kicker={spec.kicker} stageMood={stageMood} localFrame={frame}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
        {spec.lines.map((ln, i) => {
          const at = ln.at ?? i * 10;
          const lp = interpolate(frame - at, [0, 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.poly(4)),
          });
          const strikeP = ln.strikeAt != null
            ? interpolate(frame - ln.strikeAt, [0, 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.poly(3)),
              })
            : 0;
          const col = ln.emphasis ? toneColor(ln.tone ?? "accent", palette) : palette.ink;
          return (
            <div
              key={i}
              style={{
                position: "relative",
                display: "inline-block",
                opacity: lp * (strikeP > 0.5 ? 0.55 : 1),
                transform: `translateY(${(1 - lp) * 28}px)`,
                fontFamily: fonts.display,
                fontWeight: 800,
                fontSize,
                lineHeight: 1.06,
                letterSpacing: "-0.01em",
                color: col,
              }}
            >
              {ln.text}
              {strikeP > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: "-4%",
                    top: "52%",
                    width: `${strikeP * 108}%`,
                    height: 8,
                    background: palette.danger,
                    transform: "translateY(-50%) rotate(-1.6deg)",
                    borderRadius: 4,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {spec.divider === "line" && (
        <div
          style={{
            marginTop: 38,
            width: `${interpolate(frame, [18, 34], [0, 260], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
            height: 3,
            background: palette.accent,
          }}
        />
      )}

      {spec.footnote && (
        <div
          style={{
            marginTop: 32,
            maxWidth: 1020,
            fontFamily: fonts.body,
            fontWeight: 500,
            fontSize: 30,
            lineHeight: 1.38,
            color: palette.muted,
            opacity: interpolate(frame - (spec.footnoteAt ?? 24), [0, 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {spec.footnote}
        </div>
      )}
    </GrammarStage>
  );
};
