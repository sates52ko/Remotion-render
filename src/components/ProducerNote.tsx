import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * ProducerNote — the producer's own view of the book, on screen once near the start (2026-11-20).
 *
 * The operator asks NotebookLM in text, picks or rewrites one of the alternatives (in Turkish), and that sentence - his
 * decision - is recorded in book.json (`take`: his words + the English the film uses, scripts/producer-note.js). It goes
 * two ways: the first line of the description, and here: a card for a few seconds in the first half-minute, so the film
 * says in its opening that a person stands behind this reading. It is never in the NotebookLM audio (operator, 2026-11-20).
 * A film without a note draws nothing. One fade in, one fade out; nothing moves. Engine-agnostic (Antidote and Vox).
 *
 * `variant` (2026-11-23, YPP "inauthentic content"): the card stood at the same place and second in every film — one
 * more fixed piece a frame embedding reads across the channel. The book's skin picks one of four placements and
 * entrances (callers pass `variantOf(skin)`); 0 is the first look, so a film without a skin draws as before.
 */
const FADE = 10;
const VARIANTS: { start: number; hold: number; box: React.CSSProperties; label: string }[] = [
  { start: 14, hold: 6.5, box: { left: 56, top: 122, maxWidth: 1300 }, label: "top-left" },
  { start: 20, hold: 6.5, box: { right: 56, top: 122, maxWidth: 1180, textAlign: "right" }, label: "top-right" },
  { start: 17, hold: 7, box: { left: 56, top: 560, maxWidth: 1240 }, label: "lower-left (above the subtitles)" },
  { start: 24, hold: 6.5, box: { left: "50%", top: 150, transform: "translateX(-50%)", maxWidth: 1240, textAlign: "center" }, label: "centred" },
];
/** the skin's subtitle axis (box / paper / bar / tape) → a placement; anything else (no skin) → the first look */
export function variantOf(skin?: { caption?: string } | null): number {
  const i = ["box", "paper", "bar", "tape"].indexOf(String((skin && skin.caption) || ""));
  return i < 0 ? 0 : i;
}

export const ProducerNote: React.FC<{ note?: string | null; accent?: string; font?: string; variant?: number; surface?: string; ink?: string; border?: string }> = ({ note, accent = "#E04329", font = "'Arial Black', Arial, sans-serif", variant = 0, surface, ink, border }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = String(note || "").trim();
  if (!text) return null;
  const V = VARIANTS[((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
  const start = Math.round(V.start * fps), hold = Math.round(V.hold * fps), local = frame - start;
  if (local < 0 || local >= hold) return null;
  const op = Math.min(
    interpolate(local, [0, FADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(local, [hold - FADE, hold], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const right = V.box.textAlign === "right";
  const bg = surface ?? "rgba(17,19,24,0.92)";
  const fg = ink ?? "#F4F1EA";
  return (
    <AbsoluteFill style={{ zIndex: 80, pointerEvents: "none" }}>
      {/* wide and low: two lines at most (the note is ≤ 180 characters), so it ends above the name plates of a told
          stage and the tag of a Vox card (first stills, 2026-11-20: three lines at 860 px sat on both) */}
      <div style={{ position: "absolute", ...V.box, opacity: op, background: bg, border: border ? `1.5px solid ${border}` : undefined, [right ? "borderRight" : "borderLeft"]: `10px solid ${accent}`, padding: right ? "11px 22px 13px 26px" : "11px 26px 13px 22px", boxShadow: "0 12px 28px rgba(0,0,0,0.22)" }}>
        <div style={{ fontFamily: '"JetBrains Mono", "SF Mono", Monaco, Consolas, monospace', fontWeight: 800, fontSize: 17, letterSpacing: 3, color: accent, marginBottom: 5 }}>PRODUCER'S NOTE</div>
        <div style={{ fontFamily: font, fontWeight: 700, fontSize: 26, lineHeight: 1.2, color: fg }}>{`“${text.slice(0, 180)}”`}</div>
      </div>
    </AbsoluteFill>
  );
};
