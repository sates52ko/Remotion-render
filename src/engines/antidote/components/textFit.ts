import React from "react";

/**
 * textFit.ts — Zero-dependency deterministic text auto-fit for 1920x1080 Antidote 10x.
 *
 * Uses Canvas 2D `measureText` in Chrome/Remotion and a deterministic per-stack
 * character-width model in Node/SSR, so unit tests and browser renders agree.
 */

let cachedCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (cachedCtx !== undefined) return cachedCtx;
  if (typeof document === "undefined") {
    cachedCtx = null;
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    cachedCtx = canvas.getContext("2d");
  } catch {
    cachedCtx = null;
  }
  return cachedCtx;
}

function charWidthFactor(fontFamily = "", fontWeight = 600): number {
  const f = fontFamily.toLowerCase();
  let base = 0.56;
  if (f.includes("oswald") || f.includes("narrow") || f.includes("condensed")) {
    base = 0.44;
  } else if (f.includes("playfair") || f.includes("georgia") || f.includes("serif")) {
    base = 0.54;
  } else if (f.includes("slab") || f.includes("rockwell")) {
    base = 0.58;
  }
  if (fontWeight >= 700) base *= 1.06;
  return base;
}

function measureWordWidth(
  word: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number
): number {
  const ctx = getMeasureCtx();
  if (ctx) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    return ctx.measureText(word).width;
  }
  const factor = charWidthFactor(fontFamily, fontWeight);
  let upperCount = 0;
  for (let i = 0; i < word.length; i++) {
    const c = word.charCodeAt(i);
    if (c >= 65 && c <= 90) upperCount++;
  }
  const upperRatio = word.length ? upperCount / word.length : 0;
  const eff = factor * (1 + upperRatio * 0.15);
  return word.length * fontSize * eff;
}

export function estimateWrappedLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  fontFamily = '"Inter", system-ui, sans-serif',
  fontWeight = 600
): number {
  const clean = String(text || "").trim();
  if (!clean) return 1;
  if (maxWidth <= 0) return 1;
  const paragraphs = clean.split(/\r?\n/);
  let totalLines = 0;
  const spaceW = measureWordWidth(" ", fontSize, fontFamily, fontWeight);

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      totalLines += 1;
      continue;
    }
    let lineW = 0;
    let linesInPara = 1;
    for (const w of words) {
      const ww = measureWordWidth(w, fontSize, fontFamily, fontWeight);
      if (lineW === 0) {
        if (ww > maxWidth) {
          linesInPara += Math.ceil(ww / maxWidth) - 1;
          lineW = ww % maxWidth || maxWidth;
        } else {
          lineW = ww;
        }
      } else if (lineW + spaceW + ww <= maxWidth) {
        lineW += spaceW + ww;
      } else {
        linesInPara += 1;
        if (ww > maxWidth) {
          linesInPara += Math.ceil(ww / maxWidth) - 1;
          lineW = ww % maxWidth || maxWidth;
        } else {
          lineW = ww;
        }
      }
    }
    totalLines += linesInPara;
  }
  return Math.max(1, totalLines);
}

export type FitFontOpts = {
  maxWidth: number;
  maxLines?: number;
  baseSize: number;
  minSize?: number;
  fontFamily?: string;
  fontWeight?: number;
};

export function fitFontSize(text: string, opts: FitFontOpts): number {
  const {
    maxWidth,
    maxLines = 2,
    baseSize,
    minSize = Math.max(16, Math.round(baseSize * 0.55)),
    fontFamily = '"Inter", system-ui, sans-serif',
    fontWeight = 600,
  } = opts;

  const clean = String(text || "").trim();
  if (!clean || maxWidth <= 0) return baseSize;

  const words = clean.split(/\s+/).filter(Boolean);
  let lo = minSize;
  let hi = baseSize;
  let best = minSize;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const lines = estimateWrappedLines(clean, mid, maxWidth, fontFamily, fontWeight);
    const longestFits = words.every(
      (w) => measureWordWidth(w, mid, fontFamily, fontWeight) <= maxWidth * 1.02
    );
    if (lines <= maxLines && longestFits) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export type FitTextProps = {
  text: string;
  maxWidth: number;
  maxLines?: number;
  baseSize: number;
  minSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  color?: string;
  style?: React.CSSProperties;
  as?: "div" | "span";
};

export const FitText: React.FC<FitTextProps> = ({
  text,
  maxWidth,
  maxLines = 2,
  baseSize,
  minSize,
  fontFamily = '"Inter", system-ui, sans-serif',
  fontWeight = 700,
  lineHeight = 1.12,
  color,
  style,
  as = "div",
}) => {
  const size = fitFontSize(text, {
    maxWidth,
    maxLines,
    baseSize,
    minSize,
    fontFamily,
    fontWeight,
  });
  return React.createElement(
    as,
    {
      style: {
        fontFamily,
        fontWeight,
        fontSize: size,
        lineHeight,
        color,
        maxWidth,
        overflowWrap: "break-word",
        wordBreak: "break-word",
        ...style,
      },
    },
    text
  );
};
