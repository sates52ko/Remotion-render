import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ANTIDOTE_FONT } from "./KineticText";

/**
 * SpeechBalloon (CSD 1.1, cycle 8, 2026-11-02) — the words a person SAYS, tied to that person.
 *
 * Why: in the cycle-7 holdouts the narration often reports a line someone says ("she says: I have a problem", a phone
 * call, mirroring the other person's words). A free callout prints the words but nobody says them — blind readers read
 * "a man holds a phone, no exchange" or an accusation. A balloon anchored above the speaker's head, its tail pointing
 * at them, makes WHO says WHAT readable; two balloons make an exchange.
 *
 * Drawn INSIDE the character's layer (it moves and scales with the figure); `scale` is that layer's scale, so the
 * font stays the same size on screen whatever the shot. A mirrored figure (`flip`) mirrors its layer: the balloon
 * mirrors back so the text reads left to right. It pops in at `at` (scene frame: the word where it is said) and
 * stays for the rest of the beat. The text is the narration's own words (merge refuses anything else).
 */
export const SpeechBalloon: React.FC<{ text: string; at?: number; scale: number; flip?: boolean; side?: "left" | "right" }> = ({ text, at = 0, scale, flip = false, side = "right" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at) return null;
  const pop = spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 160, mass: 0.6 } });
  const s = Math.max(0.2, scale);
  const font = 40 / s;            // ~40 px on screen
  const maxW = 620 / s;           // ~620 px on screen
  const tail = 34 / s;
  // the balloon leans to the side away from the partner so two balloons do not overlap the faces
  const lean = side === "left" ? -0.35 : 0.35;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "100%",
        transform: `translateX(${(-50 + lean * 40)}%) translateY(${-8 / s}px) scale(${interpolate(pop, [0, 1], [0.6, 1])}) ${flip ? "scaleX(-1)" : ""}`,
        transformOrigin: "50% 100%",
        opacity: Math.min(1, pop * 1.4),
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          background: "#FFFFFF",
          border: `${5 / s}px solid #26241F`,
          borderRadius: 34 / s,
          padding: `${16 / s}px ${26 / s}px`,
          maxWidth: maxW,
          width: "max-content",
          fontFamily: ANTIDOTE_FONT,
          fontWeight: 800,
          fontSize: font,
          lineHeight: 1.15,
          color: "#26241F",
          textAlign: "center",
          boxShadow: `0 ${6 / s}px ${16 / s}px rgba(0,0,0,0.16)`,
        }}
      >
        {`“${text}”`}
        {/* the tail points down at the speaker's head */}
        <svg width={tail * 1.6} height={tail} viewBox="0 0 32 20" style={{ position: "absolute", left: "50%", top: "100%", transform: `translateX(${-50 - lean * 60}%) translateY(${-5 / s}px)`, overflow: "visible" }}>
          <path d="M2 0 L16 20 L30 0" fill="#FFFFFF" stroke="#26241F" strokeWidth={3} strokeLinejoin="round" />
          <rect x={3} y={-4} width={26} height={6} fill="#FFFFFF" />
        </svg>
      </div>
    </div>
  );
};
