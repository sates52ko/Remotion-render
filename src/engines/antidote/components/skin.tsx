import React from "react";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadSlab } from "@remotion/google-fonts/RobotoSlab";

/**
 * skin — THE BOOK'S OWN GRAPHIC HAND (2026-11-18, scripts/lib/book-skin.js; YPP "generic or repetitive content").
 *
 * The cast, the places and the things of a film are its book's own; the frame around them was still one design for
 * the whole channel: the same rounded dark subtitle box, the same dark name plate, the same typeface, in every film,
 * on screen for every second of it. A book now has a SKIN — how its subtitles are set, how a name plate is cut, which
 * typeface speaks — chosen once at Step 0 (farthest from the last eight books), recorded in book.json and carried in
 * config.meta.skin. A config without one is drawn exactly as before (DEFAULT_SKIN is that look).
 *
 * It changes how the words are DRESSED, never where they stand or what they say: the subtitle band, the plate sizes
 * and every layout number stay what they are (a name plate keeps the channel typeface — its width is measured in it).
 */
export type Skin = { caption: "box" | "paper" | "bar" | "tape"; plate: "dark" | "paper" | "sharp" | "accent"; font: "poppins" | "serif" | "condensed" | "slab" };
export const DEFAULT_SKIN: Skin = { caption: "box", plate: "dark", font: "poppins" };

const poppins = loadPoppins("normal", { weights: ["700", "800"], subsets: ["latin"] }).fontFamily;
const playfair = loadPlayfair("normal", { weights: ["700", "800"], subsets: ["latin"] }).fontFamily;
const oswald = loadOswald("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily;
const slab = loadSlab("normal", { weights: ["700", "800"], subsets: ["latin"] }).fontFamily;

/** the typeface the subtitles and the form's headings speak in */
export const SKIN_FONT: Record<Skin["font"], string> = {
  poppins: `${poppins}, 'Arial Black', Arial, sans-serif`,
  serif: `${playfair}, Georgia, 'Times New Roman', serif`,
  condensed: `${oswald}, 'Arial Narrow', Arial, sans-serif`,
  slab: `${slab}, Rockwell, Georgia, serif`,
};

const has = <T extends string>(set: readonly T[], v: unknown): v is T => typeof v === "string" && (set as readonly string[]).includes(v);
/** config.meta.skin → a complete skin (an unknown value falls back to the channel look for that part) */
export function skinOf(meta: { skin?: Partial<Record<keyof Skin, string>> } | undefined | null): Skin {
  const s = (meta && meta.skin) || {};
  return {
    caption: has(["box", "paper", "bar", "tape"] as const, s.caption) ? s.caption : DEFAULT_SKIN.caption,
    plate: has(["dark", "paper", "sharp", "accent"] as const, s.plate) ? s.plate : DEFAULT_SKIN.plate,
    font: has(["poppins", "serif", "condensed", "slab"] as const, s.font) ? s.font : DEFAULT_SKIN.font,
  };
}

/** is this colour light? (a light book colour never carries white words, and never highlights a word on paper) */
export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return false;
  const v = parseInt(m[1], 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

/** how a name plate is cut: fill, the colour of its words, its corner, its border */
export function plateStyle(skin: Skin, accent: string): { fill: string; ink: string; rx: number; stroke?: string } {
  if (skin.plate === "paper") return { fill: "#F4EFE6", ink: "#1A1412", rx: 6, stroke: "#1A1412" };
  if (skin.plate === "sharp") return { fill: "#1E1E22", ink: "#FFFFFF", rx: 0 };
  if (skin.plate === "accent") return { fill: accent, ink: isLight(accent) ? "#1A1412" : "#FFFFFF", rx: 10 };
  return { fill: "#1E1E22", ink: "#FFFFFF", rx: 10 };
}

export const SkinContext = React.createContext<{ skin: Skin; accent: string }>({ skin: DEFAULT_SKIN, accent: "#F5C544" });
export const useSkin = () => React.useContext(SkinContext);
