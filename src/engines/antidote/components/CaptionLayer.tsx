import React from "react";
import { useCurrentFrame } from "remotion";
import { ANTIDOTE_FONT } from "./KineticText";
import type { CaptionSpec } from "../schema";
import { useSkin, SKIN_FONT, isLight } from "./skin";

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
  const cap = captions.find((c) => frame >= c.startFrame && frame <= c.endFrame);
  if (!cap) return null;

  const words = cap.words && cap.words.length ? cap.words : cap.text.split(/\s+/).map((w) => ({ w, s: -1, e: -1 }));
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
