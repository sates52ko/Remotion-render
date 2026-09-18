import React from "react";
import { useCurrentFrame } from "remotion";
import { ANTIDOTE_FONT } from "./KineticText";
import type { CaptionSpec } from "../schema";

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

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 64, // reserved bottom band
        transform: "translateX(-50%)",
        maxWidth: 1480,
        padding: "16px 34px",
        borderRadius: 18,
        background: "rgba(17,19,24,0.72)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        textAlign: "center",
        fontFamily: ANTIDOTE_FONT,
        fontWeight: 700,
        fontSize: 46,
        lineHeight: 1.18,
        color: "#F4F1EA",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 14px",
      }}
    >
      {words.map((w, i) => {
        const on = w.s >= 0 && frame >= w.s && frame <= w.e;
        return (
          <span key={i} style={{ color: on ? accent : "#F4F1EA", transition: "none" }}>
            {w.w}
          </span>
        );
      })}
    </div>
  );
};
