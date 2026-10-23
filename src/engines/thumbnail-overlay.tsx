/**
 * thumbnail-overlay.tsx — the grammar-driven hook typography + photo treatment
 * shared by the Vox and Antidote thumbnails.
 *
 * Axes (see ThumbGrammar in thumbnail-shared.ts):
 *   textPos   left | right | bottom   — where the hook sits (and which way the scrim runs)
 *   type      block | editorial | label — typographic voice
 *   treatment color | duotone | mono  — how a photo hero is graded
 * Colours always come from the book's palette via legibleAccent(), never a
 * fixed channel-wide yellow.
 */
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import {
  emphasisIndex,
  pickTextColor,
  HEADLINE,
  SERIF,
  type TextPos,
  type TypeStyle,
  type Treatment,
} from "./thumbnail-shared";

/** Font size that keeps a hook inside ~720px at browse size. */
export function hookFontSize(hook: string, type: TypeStyle, wide = false): number {
  const words = hook.trim().split(/\s+/);
  const longest = Math.max(...words.map((w) => w.length));
  let size = words.length <= 2 && longest <= 7 ? 136 : words.length <= 3 && longest <= 9 ? 118 : 100;
  if (longest >= 11) size = Math.min(size, 92);
  if (wide) size = Math.round(size * 1.08);
  if (type === "label") size = Math.round(size * 0.84);
  if (type === "editorial") size = Math.round(size * 1.04);
  return size;
}

export const GrammarHook: React.FC<{
  hook: string;
  type: TypeStyle;
  fontSize: number;
  /** body text colour */
  base: string;
  /** emphasis colour (already contrast-checked against the ground) */
  accent: string;
  /** ink for label boxes' text */
  ink: string;
  align: "left" | "right" | "center";
  /** true when the hook sits over a photo (adds a legibility shadow) */
  overPhoto?: boolean;
}> = ({ hook, type, fontSize, base, accent, ink, align, overPhoto = false }) => {
  const words = hook.trim().split(/\s+/);
  const ei = emphasisIndex(hook);
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const shadow = overPhoto ? "0 4px 24px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.9)" : "none";

  if (type === "label") {
    // Sticker boxes: every word on a solid block — reads at 168px on any image.
    return (
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: justify, gap: 12, transform: "rotate(-1.5deg)" }}>
        {words.map((w, i) => {
          const bg = i === ei ? accent : base;
          return (
            <span
              key={i}
              style={{
                fontFamily: HEADLINE,
                fontWeight: 900,
                fontSize,
                lineHeight: 1,
                textTransform: "uppercase",
                padding: "6px 18px 10px",
                background: bg,
                color: pickTextColor(bg, ink, "#FFFFFF"),
                boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    );
  }

  if (type === "editorial") {
    // Magazine cover: serif caps (case kept — lowercasing would eat proper nouns), key word in accent italic.
    return (
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: justify, columnGap: 18, fontFamily: SERIF, fontWeight: 900, fontSize, lineHeight: 1.0, letterSpacing: 1, textShadow: shadow, textAlign: align }}>
        {words.map((w, i) => (
          <span key={i} style={{ color: i === ei ? accent : base, fontStyle: i === ei ? "italic" : "normal" }}>
            {w}
          </span>
        ))}
      </div>
    );
  }

  // block — heavy caps, one emphasis word
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: justify, columnGap: 18, fontFamily: HEADLINE, fontWeight: 900, fontSize, lineHeight: 0.92, textTransform: "uppercase", textShadow: shadow, textAlign: align }}>
      {words.map((w, i) => (
        <span key={i} style={{ color: i === ei ? accent : base }}>
          {w}
        </span>
      ))}
    </div>
  );
};

/** The small rule under the hook — differs per type so it is not a constant. */
export const HookRule: React.FC<{ type: TypeStyle; accent: string; align: "left" | "right" | "center" }> = ({ type, accent, align }) => {
  if (type === "label") return null;
  const self = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  return type === "editorial" ? (
    <div style={{ alignSelf: self, width: 220, height: 2, background: accent, opacity: 0.9 }} />
  ) : (
    <div style={{ alignSelf: self, width: 140, height: 6, background: accent, borderRadius: 3 }} />
  );
};

/** Dark scrim that runs from the text side into the image. */
export const Scrim: React.FC<{ pos: TextPos; zIndex?: number }> = ({ pos, zIndex = 2 }) => {
  const bg =
    pos === "bottom"
      ? "linear-gradient(0deg, rgba(5,7,10,0.95) 0%, rgba(5,7,10,0.78) 34%, rgba(5,7,10,0.2) 62%, rgba(5,7,10,0) 80%)"
      : `linear-gradient(${pos === "left" ? 90 : 270}deg, rgba(5,7,10,0.94) 0%, rgba(5,7,10,0.8) 40%, rgba(5,7,10,0.3) 66%, rgba(5,7,10,0.02) 100%)`;
  return <div style={{ position: "absolute", inset: 0, background: bg, zIndex }} />;
};

/** Where the hook block sits for a given textPos. */
export function hookBoxStyle(pos: TextPos): React.CSSProperties {
  const common: React.CSSProperties = { position: "absolute", display: "flex", flexDirection: "column", gap: 18, zIndex: 6 };
  if (pos === "bottom") return { ...common, left: 72, right: 200, bottom: 70, justifyContent: "flex-end" };
  if (pos === "right") return { ...common, right: 72, top: 0, bottom: 0, width: 720, justifyContent: "center", alignItems: "flex-end" };
  return { ...common, left: 72, top: 0, bottom: 0, width: 720, justifyContent: "center" };
}
export const alignFor = (pos: TextPos): "left" | "right" => (pos === "right" ? "right" : "left");

/**
 * A graded full-bleed photo. Mirrored when the text sits on the right, so a
 * Flux hero composed "subject right, space left" still leaves the text a clear side.
 */
export const TreatedPhoto: React.FC<{
  src: string;
  treatment: Treatment;
  tint: string;
  mirror?: boolean;
  objectPosition?: string;
  dim?: number;
}> = ({ src, treatment, tint, mirror = false, objectPosition = "center 20%", dim = 1 }) => {
  const filter =
    treatment === "mono"
      ? `grayscale(1) contrast(1.3) brightness(${0.95 * dim})`
      : treatment === "duotone"
        ? `grayscale(1) contrast(1.25) brightness(${1.02 * dim})`
        : `contrast(1.15) saturate(1.2) brightness(${0.95 * dim})`;
  return (
    <AbsoluteFill style={{ isolation: "isolate", zIndex: 0, transform: mirror ? "scaleX(-1)" : undefined }}>
      <Img src={staticFile(src)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition, filter }} />
      {treatment === "duotone" ? <AbsoluteFill style={{ background: tint, mixBlendMode: "color", opacity: 0.9 }} /> : null}
      {treatment === "mono" ? <AbsoluteFill style={{ background: tint, mixBlendMode: "soft-light", opacity: 0.25 }} /> : null}
    </AbsoluteFill>
  );
};

/**
 * BookAnchor — "which book is this" chip: short title (subtitle dropped) +
 * author, top corner on the hook's side (the bottom-right belongs to YouTube's
 * timestamp). It is what makes a searcher recognise THEIR book and keeps a
 * non-reader from clicking by mistake: relevance, not just curiosity.
 */
export const BookAnchor: React.FC<{
  title: string;
  author?: string;
  side: "left" | "right";
  accent: string;
  /** "pill" draws its own dark ground (over a photo / light scene); "bare" sits on a dark panel */
  ground?: "pill" | "bare";
  top?: number;
  inset?: number;
}> = ({ title, author, side, accent, ground = "pill", top = 30, inset = 34 }) => {
  const short = title.split(/[:—–]| - /)[0].trim();
  const full = (author ?? "").replace(/^by\s+/i, "").trim();
  // a long title + full name would ellipsis mid-name: keep the surname
  const who = short.length + full.length > 30 ? full.split(/\s+/).pop() ?? full : full;
  if (!short) return null;
  const size = Math.max(18, Math.min(28, Math.floor(430 / (short.length * 0.66))));
  return (
    <div
      style={{
        position: "absolute",
        top,
        [side]: inset,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 600,
        padding: ground === "pill" ? "8px 16px 8px 12px" : 0,
        background: ground === "pill" ? "rgba(6,8,11,0.72)" : "transparent",
        borderRadius: 6,
        flexDirection: side === "right" ? "row-reverse" : "row",
      }}
    >
      <div style={{ width: 5, alignSelf: "stretch", minHeight: 26, background: accent, borderRadius: 2 }} />
      {/* reading order stays "TITLE Author" on both sides; only the accent bar mirrors */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: size, letterSpacing: 1.5, textTransform: "uppercase", color: "#FFFFFF" }}>{short}</span>
        {who ? <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: Math.round(size * 0.82), color: "rgba(255,255,255,0.82)" }}>{who}</span> : null}
      </div>
    </div>
  );
};
