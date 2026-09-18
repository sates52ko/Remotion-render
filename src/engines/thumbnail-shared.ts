/**
 * thumbnail-shared.ts — shared thumbnail layout system for Vox + Antidote.
 *
 * 6 layout variants × 2 engine styles = visual diversity without manual work.
 * The layout is picked deterministically from slug hash + book.json override.
 *
 * Brand lock (the 15% that never changes):
 *   - Grain + vignette texture
 *   - Typography pair (Arial Black + Playfair)
 *   - Channel spine (bottom-left monogram bar)
 *   - 4px ink stroke around cutout subjects
 */

import { z } from "zod";

// ── LAYOUT ENUM ──────────────────────────────────────────────────────────────
export const THUMB_LAYOUTS = [
  "cinematic-bleed",  // HIGH-CTR 16:9 full-bleed cinematic image + left scrim + giant bold typography
  "portrait-right",   // cutout right, text left (current default, improved)
  "split-face",       // subject fills left half hard-crop, hook on solid right
  "full-bleed",       // image full-frame darkened, centered 2-word hook
  "object-hero",      // NO face — iconic object on saturated ground
  "two-subject-vs",   // two cutouts facing each other + divider
  "text-poster",      // NO image — giant hook on torn-paper texture
] as const;

export type ThumbLayout = typeof THUMB_LAYOUTS[number];

export const thumbLayoutSchema = z.enum(THUMB_LAYOUTS as unknown as [string, ...string[]]);

// ── HIGH-CTR COLOR CONSTANTS ────────────────────────────────────────────────
export const CTR_YELLOW = "#FFE500"; // Electric Yellow — highest eye-tracking priority on YouTube dark feeds
export const CTR_RED = "#FF2E2E";    // Vibrant Fire Red
export const CTR_CYAN = "#00E5FF";   // High-voltage Cyan
export const CTR_WHITE = "#FFFFFF";  // Crisp Pure White

// ── DETERMINISTIC LAYOUT FROM SLUG ──────────────────────────────────────────
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * Pick a layout for a book. Explicit override wins.
 * Default for all new videos is "cinematic-bleed" for maximum CTR.
 */
export function pickLayout(slug: string, override?: string): ThumbLayout {
  if (override && THUMB_LAYOUTS.includes(override as ThumbLayout)) {
    return override as ThumbLayout;
  }
  // High-CTR default: cinematic-bleed gives the strongest YouTube conversion
  return "cinematic-bleed";
}

// ── CONTRAST UTILITIES ──────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const n = parseInt(
    m.length === 3 ? m.split("").map((c) => c + c).join("") : m,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sRGBLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const la = sRGBLuminance(hexToRgb(a));
  const lb = sRGBLuminance(hexToRgb(b));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Is this hex color perceptually "dark"? */
export function isDark(hex: string): boolean {
  return sRGBLuminance(hexToRgb(hex)) < 0.18;
}

/**
 * For thumbnail use: given a background color, return the best text color
 * from [ink, paper] that gives ≥7:1 contrast. If neither hits 7:1, pick
 * the better one and boost it (pure white or pure black).
 */
export function pickTextColor(bg: string, ink: string, paper: string): string {
  const crInk = contrastRatio(bg, ink);
  const crPaper = contrastRatio(bg, paper);
  if (crInk >= 7) return ink;
  if (crPaper >= 7) return paper;
  // neither is great — go extreme
  return isDark(bg) ? "#FFFFFF" : "#0A0A0A";
}

/**
 * Pick the strongest accent for the thumbnail ground.
 * Thumbnails need saturated backgrounds, not the muted paper.
 * Returns either the red/accent or a darkened/saturated variant.
 */
export function thumbGround(
  paper: string,
  ink: string,
  red: string,
): { bg: string; text: string } {
  // if paper is light/muted (the usual case), use ink as bg + paper as text
  const paperLum = sRGBLuminance(hexToRgb(paper));
  if (paperLum > 0.3) {
    // light paper → dark ground (ink)
    return { bg: ink, text: paper };
  }
  // dark paper (rare, e.g. project-hail-mary) → use red on paper
  return { bg: paper, text: red };
}

// ── EMPHASIS ────────────────────────────────────────────────────────────────
/**
 * Smart emphasis: highlight ONE meaningful word per hook, not every other word.
 * Priority: longest word → first noun-shaped word → last word.
 */
const STOP_WORDS = new Set([
  "the","a","an","is","was","are","were","it","its","in","on","to","of","for",
  "and","but","or","not","no","so","up","by","at","if","he","she","we","they",
  "his","her","our","my","me","him","us","you","your","do","did","has","had",
  "how","what","who","why","when","this","that","with","from","into","just",
  "than","then","will","can","i","be","been","am","all","each","every",
]);

export function emphasisIndex(hook: string): number {
  const words = hook.split(/\s+/);
  if (words.length <= 1) return 0;

  // find longest non-stop word
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/[^a-z]/g, "");
    if (!STOP_WORDS.has(w) && w.length > bestLen) {
      best = i;
      bestLen = w.length;
    }
  }
  if (best >= 0) return best;
  // fallback: last word
  return words.length - 1;
}

// ── BRAND SPINE ─────────────────────────────────────────────────────────────
export const CHANNEL_MONOGRAM = "BS"; // Book Summary — change once
export const SPINE_HEIGHT = 36;
export const SPINE_FONT = "'Arial Black', Arial, sans-serif";

// ── HEADLINE FONTS ──────────────────────────────────────────────────────────
export const HEADLINE = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
export const SERIF = "'Playfair Display', Georgia, serif";

// ── FLUX PROMPT STYLES (for gen-thumbnail.py) ───────────────────────────────
// Rotated per book so two adjacent videos never share the same photographic feel.
export const FLUX_STYLES = [
  "cinematic studio portrait, professional lighting, medium close-up, vivid colors, sharp focus",
  "vintage 70mm film still, warm grain, golden hour, Kodak Portra, shallow DOF",
  "stark editorial photograph, high contrast, desaturated, single strong shadow",
  "dramatic chiaroscuro, Rembrandt lighting, deep blacks, painterly quality",
  "bright commercial portrait, clean background, pop of color, lifestyle feel",
  "cold blue moonlit scene, moody atmosphere, muted tones, cinematic anamorphic",
] as const;
