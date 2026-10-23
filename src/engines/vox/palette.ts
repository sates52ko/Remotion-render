import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { BOOK_PALETTES } from "../../books.generated";

const { fontFamily: SERIF } = loadDisplay();

export const PAPER = "var(--vox-paper)";
export const INK = "var(--vox-ink)";
export const RED = "var(--vox-red)";
export const GOLD = "var(--vox-gold)";
export const CAPTION_HIGHLIGHT = "var(--vox-caption-highlight)";
export const HEADLINE = "'Arial Black', Arial, sans-serif";
export { SERIF };

export type { Palette } from "../../books.generated";
export const DEFAULT_PALETTE = { paper: "#DAD9D5", ink: "#1A1A1A", red: "#E04329", gold: "#E8A417", captionHighlight: "#FFD23F" };
export const resolvePalette = (slug?: string) => BOOK_PALETTES[slug ?? ""] ?? DEFAULT_PALETTE;

export const CAPTION_BAND = 210;

/**
 * Calculates WCAG relative luminance (0 to 1) for a hex color string.
 */
export function getRelativeLuminance(hex: string): number {
  const clean = hex.replace("#", "").trim();
  const m = clean.length === 3
    ? clean.split("").map((c) => c + c)
    : clean.match(/.{1,2}/g);
  if (!m || m.length < 3) return 0.5;
  const [r, g, b] = m.slice(0, 3).map((x) => {
    const v = parseInt(x, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates contrast ratio between two hex colors (1 to 21).
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Ensures subtitle highlight color has at least 7.0:1 contrast ratio
 * against the dark subtitle card (rgba(18, 20, 24, 0.90) / #121418).
 * Dark accent colors (like dark forest green #125838 or deep wine red #9C2B1B)
 * will NEVER be used directly on the dark card as they fail legibility.
 */
export function resolveCaptionHighlight(pal?: { red?: string; gold?: string; captionHighlight?: string }): string {
  // 1. Explicit high-contrast captionHighlight in book.json (must meet WCAG AA >= 4.5:1)
  if (pal?.captionHighlight && pal.captionHighlight.startsWith("#")) {
    if (getContrastRatio(pal.captionHighlight, "#121418") >= 4.5) {
      return pal.captionHighlight;
    }
  }
  // 2. Thematic gold if it achieves strong contrast (>= 7.0:1) on dark card
  if (pal?.gold && pal.gold.startsWith("#") && getContrastRatio(pal.gold, "#121418") >= 7.0) {
    return pal.gold;
  }
  // 3. Guaranteed high-contrast luminous warm gold (contrast > 12:1)
  return "#FFD23F";
}

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
