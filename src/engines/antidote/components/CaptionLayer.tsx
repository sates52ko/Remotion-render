import React from "react";
import { useCurrentFrame } from "remotion";
import { ANTIDOTE_FONT } from "./KineticText";
import type { CaptionSpec } from "../schema";
import { useSkin, SKIN_FONT, isLight } from "./skin";
import { isLightPalette, resolveArtFonts, resolveArtPalette, useArtDirection } from "./artDirection";

/**
 * CaptionLayer — non-intrusive word-timed subtitles.
 *
 * Lives in a RESERVED bottom safe-zone (≈ lower 12%) so it never competes with
 * the character stage or the kinetic callouts (those stay in the upper/mid
 * zones). Clean semi-transparent band; the currently-spoken word gets a SUBTLE
 * highlight (color, not a box) — readable, not karaoke-loud.
 *
 * Rendered at the composition's top level → uses the ABSOLUTE frame, so caption
 * frames (startFrame/endFrame/words) are global, independent of scene Sequences.
 */
export const CaptionLayer: React.FC<{ captions: CaptionSpec[]; accent?: string }> = ({ captions, accent = "#F5C544" }) => {
  const frame = useCurrentFrame();
  const ad = useArtDirection();
  if (ad?.captions === "off") return null;
  const cap = captions.find((c) => frame >= c.startFrame && frame <= c.endFrame);
  if (!cap) return null;

  const words = cap.words && cap.words.length ? cap.words : cap.text.split(/\s+/).map((w) => ({ w, s: -1, e: -1 }));
  if (ad?.captions === "minimal") {
    const pal = resolveArtPalette(ad);
    const light = isLightPalette(pal);
    const fonts = resolveArtFonts(ad);
    const g = ad?.layoutGrammar || "centered";
    const cStyle = ad?.captionStyle || "editorialBar";
    const leftAlign = cStyle !== "kineticPill" && cStyle !== "cinemaLower" && (ad?.captionAlign === "left" || g === "editorialLeft" || g === "editorialRight" || g === "splitSpine" || g === "magazineMasthead");
    const padLeft = g === "editorialLeft" ? 560 : g === "magazineMasthead" ? 196 : leftAlign ? 88 : 180;
    const padRight = g === "editorialRight" ? 560 : leftAlign ? 180 : 180;
    const padBottom = g === "cinemaWide" ? 24 : 28;
    const bgGrad =
      g === "cinemaWide" || cStyle === "kineticPill" || cStyle === "cinemaLower"
        ? "transparent"
        : light
          ? `linear-gradient(180deg, rgba(250,247,240,0) 0%, ${pal.bg}E0 42%, ${pal.bg}FA 100%)`
          : "linear-gradient(180deg, rgba(8,10,15,0) 0%, rgba(8,10,15,0.68) 48%, rgba(8,10,15,0.92) 100%)";
    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: `36px ${padRight}px ${padBottom}px ${padLeft}px`,
          background: bgGrad,
          textAlign: leftAlign ? "left" : "center",
          fontFamily: fonts.body,
          fontWeight: 600,
          fontSize: g === "cinemaWide" ? 32 : 36,
          lineHeight: 1.26,
          color: g === "cinemaWide" ? "#F8F5EE" : light ? pal.ink : "#F8F5EE",
          textShadow: cStyle === "kineticPill" ? "none" : g === "cinemaWide" || cStyle === "cinemaLower" ? "0 2px 10px rgba(0,0,0,0.9)" : light ? "0 1px 10px rgba(255,255,255,0.92)" : "0 2px 12px rgba(0,0,0,0.88)",
          display: "flex",
          justifyContent: leftAlign ? "flex-start" : "center",
          pointerEvents: "none",
          zIndex: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: leftAlign ? "flex-start" : "center",
            gap: "0 11px",
            borderLeft: cStyle === "editorialBar" && leftAlign ? `5px solid ${pal.accent}` : undefined,
            borderTop: cStyle === "printRule" ? `2px solid ${pal.accent}88` : undefined,
            paddingLeft: cStyle === "editorialBar" && leftAlign ? 18 : cStyle === "kineticPill" ? 24 : 0,
            paddingRight: cStyle === "kineticPill" ? 24 : 0,
            paddingTop: cStyle === "printRule" ? 10 : cStyle === "kineticPill" ? 10 : 0,
            paddingBottom: cStyle === "kineticPill" ? 10 : 0,
            borderRadius: cStyle === "kineticPill" ? 999 : undefined,
            background: cStyle === "kineticPill" ? pal.surface : undefined,
            border: cStyle === "kineticPill" ? `2px solid ${pal.surfaceBorder}` : undefined,
            boxShadow: cStyle === "kineticPill" ? "0 10px 26px rgba(0,0,0,0.28)" : undefined,
          }}
        >
          {words.map((w, i) => {
            const on = w.s >= 0 && frame >= w.s && frame <= w.e;
            return (
              <span
                key={i}
                style={{
                  color: on ? pal.accent : g === "cinemaWide" ? "#F8F5EE" : light ? pal.ink : "#F8F5EE",
                  fontWeight: on ? 800 : 600,
                  borderBottom: light && g !== "cinemaWide" && on ? `3px solid ${pal.accent}` : undefined,
                }}
              >
                {w.w}
              </span>
            );
          })}
        </div>
      </div>
    );
  }
  // THE BOOK'S SKIN (skin.tsx): how the subtitles are SET. Same band, same size, same words — another hand.
  const { skin, accent: bookAccent } = useSkin();
  const def = skin.caption === "box" && skin.font === "poppins"; // the channel's look: exactly as before
  const look = skin.caption === "paper" ? { background: "#F4EFE6", color: "#1A1412", borderRadius: 6, boxShadow: "0 6px 0 rgba(26,20,18,0.85)", on: isLight(bookAccent) ? "#8A2A0C" : bookAccent }
    : skin.caption === "tape" ? { background: "#1A1412", color: "#F4F1EA", borderRadius: 0, boxShadow: `-14px 0 0 ${bookAccent}`, on: bookAccent }
    : skin.caption === "bar" ? { background: "rgba(17,19,24,0.82)", color: "#FFFFFF", borderRadius: 0, boxShadow: `0 8px 0 ${bookAccent}`, on: isLight(bookAccent) ? bookAccent : "#FFD9A0" }
    : { background: "rgba(17,19,24,0.72)", color: "#F4F1EA", borderRadius: 18, boxShadow: "0 8px 24px rgba(0,0,0,0.28)", on: def ? accent : bookAccent };

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 64, // reserved bottom band
        transform: "translateX(-50%)",
        maxWidth: 1480,
        padding: "16px 34px",
        borderRadius: look.borderRadius,
        background: look.background,
        boxShadow: look.boxShadow,
        textAlign: "center",
        fontFamily: def ? ANTIDOTE_FONT : SKIN_FONT[skin.font],
        fontWeight: 700,
        fontSize: 46,
        lineHeight: 1.18,
        color: look.color,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 14px",
      }}
    >
      {words.map((w, i) => {
        const on = w.s >= 0 && frame >= w.s && frame <= w.e;
        return (
          <span key={i} style={{ color: on ? look.on : look.color, transition: "none" }}>
            {w.w}
          </span>
        );
      })}
    </div>
  );
};
