import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";
import { enter } from "../movements";
import type { TextSpec } from "../schema";

// Load only the weights we actually use (was pulling every weight → 54 requests).
const { fontFamily } = loadFont("normal", { weights: ["700", "800"], subsets: ["latin"] });
export const ANTIDOTE_FONT = `${fontFamily}, 'Arial Black', Arial, sans-serif`;

/**
 * KineticText — the bold, punchy on-screen copy of the Antidote language.
 *
 * `box` / `outline` / `plain` are the original one-word stamps. Callouts are now
 * PHRASES ("NOT YOUR FAULT", "TOO LATE"), and a phrase that lands as one block
 * wastes the beat — so `reveal` / `stack` bring it in word by word, `highlight`
 * wipes an accent bar in behind the operative word, and `strike` crosses it out.
 */

/** Staging is resolved by the shot before it reaches here (see shots.ts). */
export type ResolvedTextSpec = Omit<TextSpec, "x" | "y" | "size"> & { x: number; y: number; size: number };

/**
 * The bottom band belongs to the subtitles (CaptionLayer sits at bottom:64 and
 * can run to three lines). Kinetic copy is centered on its `y`, so a callout
 * that wrapped to two lines grew straight down into that band and ended up
 * reading through the subtitle box ("SHE LEAVES HER / MARK").
 *
 * Text cannot be measured in Remotion, so rather than guess the block height we
 * change which edge is pinned: a callout staged LOW is anchored by its BOTTOM
 * and grows UPWARD. A one-line callout lands where it always did; extra lines
 * can only ever move away from the band, whatever the wrap turns out to be.
 * Callouts staged high keep the original centered behaviour.
 */
const LOW_ZONE = 640;      // below this y the callout is bottom-anchored
const CAPTION_SAFE_TOP = 800; // conservative: the scene camera can zoom ~1.05 about center

/** Phrases need to breathe: shrink very long copy so a callout never wraps to three lines. */
const fitSize = (text: string, size: number) => {
  const len = text.replace(/\s+/g, " ").trim().length;
  if (len <= 16) return size;
  // Dynamic scaling: smoother decay down to 0.40x so rogue long titles or sentences don't overflow
  return Math.max(size * 0.4, size * (16 / len) ** 0.5);
};

export const KineticText: React.FC<{ spec: ResolvedTextSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = spec.text.trim().split(/\s+/).filter(Boolean);
  const multi = words.length > 1;
  const size = fitSize(spec.text, spec.size);

  // Word-staggered styles run their own entrance; the others use the shared one.
  const staggered = spec.style === "reveal" || spec.style === "stack";
  const t = enter(staggered ? "none" : spec.enter, frame, fps, spec.at);
  if (frame < spec.at) return null;

  // Lifecycle: smooth exit fade when duration is specified
  const exitDuration = 10;
  let exitOpacity = 1;
  if (spec.duration != null) {
    const endFrame = spec.at + spec.duration;
    if (frame >= endFrame + exitDuration) return null;
    if (frame >= endFrame) {
      exitOpacity = interpolate(frame, [endFrame, endFrame + exitDuration], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }

  const effectiveOpacity = (staggered ? 1 : t.opacity) * exitOpacity;
  if (effectiveOpacity <= 0) return null;

  // Keep the callout clear of the subtitle band however many lines it wraps to.
  const low = spec.y > LOW_ZONE;
  // bottom-anchored: `top` becomes the block's BOTTOM edge. Adding half a line
  // keeps a single-line callout exactly where centering used to put it.
  const y = low ? Math.min(spec.y + size * 0.5, CAPTION_SAFE_TOP) : spec.y;
  const anchorY = low ? "-100%" : "-50%";

  const common: React.CSSProperties = {
    position: "absolute",
    left: spec.x,
    top: y,
    transform: `translate(-50%, ${anchorY}) translate(${t.tx}px, ${t.ty}px) scale(${t.scale}) rotate(${t.rotate}deg)`,
    opacity: effectiveOpacity,
    fontFamily: ANTIDOTE_FONT,
    fontWeight: 800,
    fontSize: size,
    lineHeight: 1.02,
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    // phrases wrap; single words stay on one line exactly as before
    // plain headlines get extra width (1120px) so clean titles don't awkwardly wrap
    whiteSpace: multi ? "pre-wrap" : "pre",
    maxWidth: multi ? (spec.style === "plain" ? 1120 : 860) : undefined,
    textAlign: "center",
  };

  // ── word-by-word entrances ────────────────────────────────────────────────
  if (staggered) {
    const column = spec.style === "stack";
    return (
      <div
        style={{
          ...common,
          opacity: effectiveOpacity,
          transform: `translate(-50%, ${anchorY})`,
          display: "flex",
          flexDirection: column ? "column" : "row",
          flexWrap: column ? "nowrap" : "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: column ? size * 0.1 : size * 0.22,
          color: spec.color,
          textShadow: "0 6px 16px rgba(0,0,0,0.3)",
        }}
      >
        {words.map((w, i) => {
          const s = spring({ frame, fps, delay: spec.at + i * 4, config: { damping: 12, stiffness: 190, mass: 0.5 } });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                opacity: s,
                transform: `translateY(${(1 - s) * (column ? -size * 0.5 : size * 0.35)}px) scale(${0.7 + s * 0.3})`,
                background: spec.style === "stack" && i === words.length - 1 ? spec.boxColor : undefined,
                padding: spec.style === "stack" && i === words.length - 1 ? `${size * 0.06}px ${size * 0.18}px` : undefined,
                borderRadius: spec.style === "stack" && i === words.length - 1 ? size * 0.16 : undefined,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    );
  }

  // ── accent bar wiping in behind the operative (last) word ─────────────────
  if (spec.style === "highlight") {
    const wipe = interpolate(frame, [spec.at + 5, spec.at + 17], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    return (
      <div style={{ ...common, color: spec.color, textShadow: "0 6px 16px rgba(0,0,0,0.3)" }}>
        {words.map((w, i) => {
          const last = i === words.length - 1;
          return (
            <span key={i} style={{ position: "relative", display: "inline-block", marginRight: i < words.length - 1 ? size * 0.22 : 0 }}>
              {last ? (
                <span
                  style={{
                    position: "absolute",
                    left: -size * 0.12,
                    right: -size * 0.12,
                    top: size * 0.06,
                    bottom: -size * 0.02,
                    background: spec.boxColor,
                    // A marker-pen tint rather than a solid slab: dark type stays
                    // legible over ANY book palette's accent, which a fully
                    // saturated bar does not guarantee.
                    opacity: 0.42,
                    borderRadius: size * 0.08,
                    transform: `scaleX(${wipe})`,
                    transformOrigin: "left center",
                    zIndex: -1,
                  }}
                />
              ) : null}
              {w}
            </span>
          );
        })}
      </div>
    );
  }

  // ── crossed out: "not this" ───────────────────────────────────────────────
  if (spec.style === "strike") {
    const cut = interpolate(frame, [spec.at + 8, spec.at + 20], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    return (
      <div style={{ ...common, color: spec.color, textShadow: "0 6px 16px rgba(0,0,0,0.3)" }}>
        <span style={{ position: "relative", display: "inline-block" }}>
          {spec.text}
          <span
            style={{
              position: "absolute",
              left: -size * 0.08,
              right: -size * 0.08,
              top: "50%",
              height: Math.max(6, size * 0.09),
              marginTop: -Math.max(3, size * 0.045),
              background: spec.boxColor,
              borderRadius: size,
              transform: `scaleX(${cut})`,
              transformOrigin: "left center",
            }}
          />
        </span>
      </div>
    );
  }

  // ── hand-drawn marker highlight ───────────────────────────────────────────
  // An organic, wobbly highlighter stroke animated behind the text. The SVG
  // path wiggles ±4px vertically (Bézier curves) so it reads as hand-drawn
  // rather than machine-perfect. Semi-transparent so text stays legible.
  if (spec.style === "marker") {
    const wipe = interpolate(frame, [spec.at + 2, spec.at + 18], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    // Estimated text width — rough but consistent across phrases
    const charW = size * 0.58;
    const textW = Math.min(spec.text.length * charW, 840);
    const strokeH = size * 0.52; // highlight band height
    const svgW = textW + size * 0.4; // padding on both sides
    const PAD = size * 0.2;
    // Wavy path: three Bézier segments with slight vertical wobble
    const y0 = strokeH / 2;
    const wobble = 4;
    const markerPath = `M${PAD},${y0 + wobble} C${PAD + svgW * 0.2},${y0 - wobble} ${PAD + svgW * 0.35},${y0 + wobble * 1.2} ${PAD + svgW * 0.5},${y0} S${PAD + svgW * 0.75},${y0 - wobble * 0.8} ${svgW - PAD},${y0 + wobble * 0.6}`;
    const pathLen = svgW * 1.15; // approximate arc length
    return (
      <div style={{ ...common, color: spec.color, textShadow: "0 6px 16px rgba(0,0,0,0.3)" }}>
        <span style={{ position: "relative", display: "inline-block" }}>
          {/* The marker stroke SVG sits behind the text */}
          <svg
            width={svgW}
            height={strokeH}
            viewBox={`0 0 ${svgW} ${strokeH}`}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)", // centered INSIDE the span, not stage-anchored
              overflow: "visible",
              zIndex: -1,
            }}
          >
            <path
              d={markerPath}
              fill="none"
              stroke={spec.boxColor}
              strokeWidth={strokeH * 0.82}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.45}
              strokeDasharray={pathLen}
              strokeDashoffset={pathLen * (1 - wipe)}
            />
          </svg>
          {spec.text}
        </span>
      </div>
    );
  }

  if (spec.style === "box") {
    return (
      <div
        style={{
          ...common,
          color: spec.color,
          background: spec.boxColor,
          padding: `${size * 0.16}px ${size * 0.28}px`,
          borderRadius: size * 0.18,
          boxShadow: "0 10px 0 rgba(0,0,0,0.18), 0 14px 30px rgba(0,0,0,0.28)",
          border: "4px solid rgba(255,255,255,0.9)",
        }}
      >
        {spec.text}
      </div>
    );
  }
  if (spec.style === "outline") {
    return (
      <div
        style={{
          ...common,
          color: spec.color,
          WebkitTextStroke: `${Math.max(6, size * 0.06)}px ${spec.boxColor}`,
          paintOrder: "stroke fill",
          textShadow: "0 8px 18px rgba(0,0,0,0.35)",
        }}
      >
        {spec.text}
      </div>
    );
  }
  return <div style={{ ...common, color: spec.color, textShadow: "0 6px 16px rgba(0,0,0,0.3)" }}>{spec.text}</div>;
};
