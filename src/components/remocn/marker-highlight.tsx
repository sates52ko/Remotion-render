import React from "react";
import {
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface MarkerHighlightProps {
  before?: string;
  highlight: string;
  after?: string;
  markerColor?: string;
  baseColor?: string;
  highlightedTextColor?: string;
  fontSize?: number;
  fontWeight?: number | string;
  speed?: number;
  className?: string;
  containerStyle?: React.CSSProperties;
}

export function MarkerHighlight({
  before = "",
  highlight,
  after = "",
  markerColor = "#facc15",
  baseColor = "#171717",
  highlightedTextColor = "#171717",
  fontSize = 72,
  fontWeight = 700,
  speed = 1,
  className,
  containerStyle,
}: MarkerHighlightProps) {
  const frame = useCurrentFrame() * speed;
  const { fps } = useVideoConfig();

  const markerScale = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14 },
  });

  const progress = interpolate(markerScale, [0.5, 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isCssVar = (c?: string) => !c || c.includes("var(") || c.includes("color-mix");
  let textColor: string | undefined;

  if (!isCssVar(baseColor) && !isCssVar(highlightedTextColor)) {
    try {
      textColor = interpolateColors(
        progress,
        [0, 1],
        [baseColor, highlightedTextColor],
      );
    } catch {
      textColor = undefined;
    }
  }

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...containerStyle,
      }}
    >
      <span
        className={className}
        style={{
          fontSize,
          fontWeight,
          color: baseColor,
          letterSpacing: "-0.03em",
          fontFamily:
            "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif",
          willChange: "transform",
          textAlign: "center",
        }}
      >
        {before && <span>{before} </span>}
        <span style={{ position: "relative", display: "inline-block" }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: "0 -0.15em",
              background: markerColor,
              transformOrigin: "left center",
              transform: `scaleX(${markerScale})`,
              zIndex: 0,
              borderRadius: "0.15em",
            }}
          />
          {textColor !== undefined ? (
            <span style={{ position: "relative", zIndex: 1, color: textColor }}>
              {highlight}
            </span>
          ) : (
            <span style={{ position: "relative", zIndex: 1, display: "inline-block" }}>
              <span style={{ color: baseColor, opacity: 1 - progress }}>
                {highlight}
              </span>
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  color: highlightedTextColor,
                  opacity: progress,
                  pointerEvents: "none",
                }}
              >
                {highlight}
              </span>
            </span>
          )}
        </span>
        {after && <span> {after}</span>}
      </span>
    </div>
  );
}
