import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { Caption } from "./schema";
import { CAPTION_HIGHLIGHT, HEADLINE, RED } from "./palette";
import { skinOf, SKIN_FONT } from "../antidote/components/skin";

/**
 * THE BOOK'S SKIN (2026-11-20; Antidote has had it since 11-18): how the subtitles are SET - on screen for every second
 * of every film, and until now one design for every Vox film. Same band, same size, same words; a config without
 * meta.skin is drawn exactly as before (box + the engine's headline face).
 */
export function captionLook(skin?: { caption?: string; plate?: string; font?: string }) {
  const s = skinOf({ skin: skin || {} });
  const face = s.font === "poppins" ? HEADLINE : SKIN_FONT[s.font];
  if (!skin || s.caption === "box") return { face, def: !skin || s.font === "poppins", box: null as null | React.CSSProperties, spoken: "#FFFFFF", unspoken: "rgba(255, 255, 255, 0.42)", light: false };
  if (s.caption === "paper") return { face, def: false, box: { background: "#F4EFE6", borderRadius: 6, border: "2px solid #1A1412", boxShadow: "0 7px 0 rgba(26,20,18,0.85)", backdropFilter: "none" }, spoken: "#1A1412", unspoken: "rgba(26, 20, 18, 0.45)", light: true };
  if (s.caption === "bar") return { face, def: false, box: { background: "rgba(18, 20, 24, 0.92)", borderRadius: 0, border: "none", borderBottom: `8px solid ${RED}`, boxShadow: "none" }, spoken: "#FFFFFF", unspoken: "rgba(255, 255, 255, 0.42)", light: false };
  return { face, def: false, box: { background: "#121418", borderRadius: 0, border: "none", borderLeft: `14px solid ${RED}`, boxShadow: "0 10px 28px rgba(0,0,0,0.4)" }, spoken: "#FFFFFF", unspoken: "rgba(255, 255, 255, 0.42)", light: false };
}

export const CaptionLayer: React.FC<{ captions: Caption[]; highlightColor?: string; skin?: { caption?: string; plate?: string; font?: string } }> = ({
  captions,
  highlightColor,
  skin,
}) => {
  const frame = useCurrentFrame();
  const active = captions.find((c) => frame >= c.startFrame && frame < c.endFrame);
  if (!active) return null;

  const look = captionLook(skin);
  // on a paper card the luminous highlight is unreadable: the book's red marks the word that is being said
  const activeColor = look.light ? RED : highlightColor || CAPTION_HIGHLIGHT;

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
          ...(look.box || {}),
        }}
      >
        {active.words.map((w, i) => {
          const spoken = frame >= w.s;
          const current = frame >= w.s && frame < w.e;
          return (
            <span
              key={i}
              style={{
                fontFamily: look.face,
                fontWeight: 800,
                fontSize: 40,
                letterSpacing: 0.5,
                color: current
                  ? activeColor
                  : spoken
                  ? look.spoken
                  : look.unspoken,
                textTransform: "uppercase",
                textShadow: look.light
                  ? "none"
                  : current
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
