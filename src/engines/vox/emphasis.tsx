import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * emphasis.tsx — P9-A V2: independent emphasis-token rendering.
 *
 * THE BUG THIS KILLS. Every archetype used to flatten the beat's authored
 * emphasis with `join(" ")` and hand one synthetic string to KineticWords:
 * three INDEPENDENT words ("BILLIE", "FIRST", "WIFE") became one noun phrase
 * ("BILLIE FIRST WIFE") — asserting a relation (that Billie is the first wife)
 * nobody wrote, the exact class behind 9/11 sampled WRONG frames on
 * into-the-wild. A treatment may restyle the tokens; it may never COMBINE
 * them into a phrase the author did not write.
 *
 * `EmphasisTokens` renders each token as its own line (or chip row), exactly
 * as StatementScene already drew multiple emphasis words. Tokens stay
 * independent: no join, no phrase, no cross-token semantics.
 *
 * `fitTokenSize` is the shared long-token fit rule (used by callers that need
 * a number before render): the widest token decides, 3-token layouts get the
 * same treatment — long tokens shrink instead of overflowing or wrapping
 * mid-token.
 */

/** The single source of the per-scene font size for emphasis tokens. */
export function fitTokenSize(widestChars: number, big: number, small: number): number {
  if (widestChars > 12) return small;
  if (widestChars > 9) return Math.round((big + small) / 2);
  return big;
}

export const EmphasisTokens: React.FC<{
  tokens: string[];
  startFrame: number;
  fontSize: number;
  align?: "left" | "center";
  maxWidth?: number;
  color?: string;
  accentColor?: string;
  fontFamily?: string;
  weight?: number | string;
  uppercase?: boolean;
  asChips?: boolean;
  step?: number; // frames between token reveals
}> = ({
  tokens,
  startFrame,
  fontSize,
  align = "center",
  maxWidth = 1500,
  color,
  accentColor,
  fontFamily,
  weight = 900,
  uppercase = true,
  asChips = false,
  step = 5,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clean = (tokens || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (!clean.length) return null;
  const justify = align === "center" ? "center" : "flex-start";
  return (
    <div
      style={{
        display: asChips ? "flex" : "flex",
        flexDirection: asChips ? "row" : "column",
        flexWrap: asChips ? "wrap" : undefined,
        gap: asChips ? fontSize * 0.28 : fontSize * 0.08,
        alignItems: asChips ? "center" : undefined,
        justifyContent: justify,
        maxWidth,
      }}
    >
      {clean.map((tok, i) => {
        const sf = startFrame + i * step;
        const s = spring({ frame: frame - sf, fps, config: { damping: 15, mass: 0.55, stiffness: 130 }, durationInFrames: 20 });
        const y = interpolate(s, [0, 1], [54, 0]);
        const rot = interpolate(s, [0, 1], [4, 0]);
        const op = interpolate(frame, [sf, sf + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const c = color ?? (i === 1 ? accentColor : undefined);
        return (
          <span
            key={`${tok}-${i}`}
            style={{
              display: "inline-block",
              transform: `translateY(${y}px) rotate(${rot}deg)`,
              opacity: op,
              fontFamily,
              fontWeight: weight,
              fontSize,
              color: c,
              textTransform: uppercase ? "uppercase" : "none",
              whiteSpace: "nowrap",
              ...(asChips
                ? { background: accentColor ?? "rgba(30,42,36,0.12)", padding: `${fontSize * 0.08}px ${fontSize * 0.22}px`, borderRadius: 6 }
                : {}),
            }}
          >
            {tok}
          </span>
        );
      })}
    </div>
  );
};
