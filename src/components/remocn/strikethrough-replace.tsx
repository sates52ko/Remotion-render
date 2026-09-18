import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export interface StrikethroughReplaceProps {
  from: string;
  to: string;
  lineColor?: string;
  fontSize?: number;
  color?: string;
  toColor?: string;
  fontWeight?: number | string;
  speed?: number;
  className?: string;
  containerStyle?: React.CSSProperties;
}

export function StrikethroughReplace({
  from,
  to,
  lineColor = "#ef4444",
  fontSize = 64,
  color = "#171717",
  toColor = "#10b981",
  fontWeight = 700,
  speed = 1,
  className,
  containerStyle,
}: StrikethroughReplaceProps) {
  const frame = useCurrentFrame() * speed;
  const { durationInFrames } = useVideoConfig();

  // Phases:
  // 0 .. 35% -> draw strikethrough across `from`
  // 35% .. 55% -> fade out `from`, fade in `to`
  // 55% .. 100% -> hold
  const strikeEnd = durationInFrames * 0.35;
  const fadeStart = durationInFrames * 0.35;
  const fadeEnd = durationInFrames * 0.55;

  const linePct = interpolate(frame, [0, strikeEnd], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fromOpacity = interpolate(frame, [fadeStart, fadeEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const toOpacity = interpolate(frame, [fadeStart, fadeEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const toY = interpolate(frame, [fadeStart, fadeEnd], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textStyle: React.CSSProperties = {
    fontSize,
    fontWeight,
    letterSpacing: "-0.03em",
    fontFamily:
      "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif",
    whiteSpace: "nowrap",
    willChange: "transform",
  };

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
      <div
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* from text with strikethrough line */}
        <span
          className={className}
          style={{
            ...textStyle,
            color,
            position: "absolute",
            opacity: fromOpacity,
            pointerEvents: fromOpacity <= 0 ? "none" : "auto",
          }}
        >
          {from}
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              height: Math.max(3, Math.round(fontSize * 0.09)),
              width: `${linePct}%`,
              background: lineColor,
              transform: "translateY(-50%)",
              borderRadius: 2,
            }}
          />
        </span>

        {/* to text */}
        <span
          className={className}
          style={{
            ...textStyle,
            color: toColor,
            opacity: toOpacity,
            transform: `translateY(${toY}px)`,
          }}
        >
          {to}
        </span>
      </div>
    </div>
  );
}
