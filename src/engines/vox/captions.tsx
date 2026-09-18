import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { Caption } from "./schema";
import { CAPTION_HIGHLIGHT, HEADLINE } from "./palette";

export const CaptionLayer: React.FC<{ captions: Caption[]; highlightColor?: string }> = ({
  captions,
  highlightColor,
}) => {
  const frame = useCurrentFrame();
  const active = captions.find((c) => frame >= c.startFrame && frame < c.endFrame);
  if (!active) return null;

  const activeColor = highlightColor || CAPTION_HIGHLIGHT;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 58,
        zIndex: 55,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 1480,
          textAlign: "center",
          background: "rgba(18, 20, 24, 0.90)",
          backdropFilter: "blur(12px)",
          borderRadius: 16,
          padding: "16px 32px",
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 14px",
          justifyContent: "center",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.45)",
        }}
      >
        {active.words.map((w, i) => {
          const spoken = frame >= w.s;
          const current = frame >= w.s && frame < w.e;
          return (
            <span
              key={i}
              style={{
                fontFamily: HEADLINE,
                fontWeight: 800,
                fontSize: 40,
                letterSpacing: 0.5,
                color: current
                  ? activeColor
                  : spoken
                  ? "#FFFFFF"
                  : "rgba(255, 255, 255, 0.42)",
                textTransform: "uppercase",
                textShadow: current
                  ? `0 0 16px ${activeColor}`
                  : spoken
                  ? "0 2px 4px rgba(0,0,0,0.3)"
                  : "none",
                transform: current ? "scale(1.04)" : "scale(1)",
                display: "inline-block",
                transition: "transform 0.08s ease-out",
              }}
            >
              {w.w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
