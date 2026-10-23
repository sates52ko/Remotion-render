/**
 * labelFit.ts — the ONE place that decides whether a diagram label fits its
 * cell on the canvas.
 *
 * Diagram.tsx uses it to render (shrink → wrap, never overlap a neighbour);
 * scripts/audit-coherence.mjs imports the SAME functions under Node's type
 * stripping to verify the data before a frame is ever drawn. Keep it
 * dependency-free and strip-safe: plain functions + types only (no enums,
 * no namespaces, no value imports).
 *
 * P3.2 (audio↔screen coherence): unbounded SVG labels were the root cause of
 * screenshot-class overlaps — "NIGHTMARE FUEL" running into "ABSOLUTELY
 * EVERYTHING THOUGHT TRUE",35-character flow labels bursting their184px
 * circles. Every archetype now owns a cell and fits inside it.
 */

/** Diagram viewBox the archetypes draw into (parent scales it to the stage). */
export const DIAGRAM_VW = 1200;
export const DIAGRAM_VH = 620;

/**
 * Average advance width of one character of Poppins-800 UPPERCASE, in em.
 * Measured across the alphabet: narrow (I,J,L≈0.30) to wide (M,W≈0.90);
 *0.62 is the conservative mean for mixed caps — deliberate over-estimate so
 * fitting errs toward slightly-smaller, never toward overflow.
 */
export const CHAR_W_EM = 0.62;

/** Estimated rendered width of `text` at `size` px (uppercase semantics). */
export function estWidth(text: string, size: number): number {
  return String(text || "").toUpperCase().length * size * CHAR_W_EM;
}

export type FitOpts = {
  /** Cell width in viewBox units — the label may never exceed this. */
  maxW: number;
  baseSize: number;
  minSize?: number;
  /** Hard cap on lines;1 = shrink-only (fixed baselines like titles). */
  maxLines?: number;
};

export type FittedLabel = {
  lines: string[];
  size: number;
  width: number;
};

/** Split `words` into exactly `n` lines, minimising the widest line (n=2: exhaustive; n>2: greedy). */
function balanceLines(words: string[], n: number, size: number, maxW: number): string[] {
  if (n <= 1 || words.length <= 1) return [words.join(" ")];
  if (n === 2) {
    let best: string[] = [words.join(" ")];
    let bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ");
      const b = words.slice(i).join(" ");
      const w = Math.max(estWidth(a, size), estWidth(b, size));
      if (w < bestW) {
        bestW = w;
        best = [a, b];
      }
    }
    return best;
  }
  // greedy fill for3+ lines (rare; keeps every line ≤ maxW when achievable)
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const probe = current ? `${current} ${word}` : word;
    if (current && estWidth(probe, size) > maxW) {
      lines.push(current);
      current = word;
    } else {
      current = probe;
    }
  }
  if (current) lines.push(current);
  while (lines.length < n) lines.push("");
  return lines.slice(0, Math.max(n, lines.length));
}

/**
 * Fit `text` into a cell: shrink2px steps first (keeps short labels at their
 * authored size), then wrap to ≤ maxLines balanced lines at minSize, then
 * grow back up to baseSize while the widest line still fits.
 * Returns the lines + final size; `width` is the widest line — callers that
 * receive width> maxW are looking at a single unbreakable word (audit flags
 * it; renderer lets it bleed rather than eating a character).
 */
export function fitLabel(text: string, opts: FitOpts): FittedLabel {
  const raw = String(text || "").trim().toUpperCase();
  const minSize = opts.minSize ?? 16;
  const maxLines = Math.max(1, opts.maxLines ?? 1);
  if (!raw) return { lines: [], size: opts.baseSize, width: 0 };
  const { maxW } = opts;

  //1) shrink-only single line (common case: short label, generous cell)
  let size = Math.max(opts.baseSize, minSize);
  while (size > minSize && estWidth(raw, size) > maxW) size -= 2;
  if (estWidth(raw, size) <= maxW) return { lines: [raw], size, width: estWidth(raw, size) };
  if (maxLines === 1) return { lines: [raw], size: minSize, width: estWidth(raw, minSize) };

  //2) wrap: how many lines does minSize need?
  const words = raw.split(/\s+/).filter(Boolean);
  let lineCount = Math.min(maxLines, Math.max(2, Math.ceil(estWidth(raw, minSize) / maxW)));
  let lines = balanceLines(words, lineCount, minSize, maxW);

  //3) grow back toward baseSize while the widest line still fits the cell
  let fsize = minSize;
  while (fsize + 2 <= opts.baseSize) {
    const probe = fsize + 2;
    if (Math.max(...lines.map((l) => estWidth(l, probe))) > maxW) break;
    fsize = probe;
  }
  const width = Math.max(...lines.map((l) => estWidth(l, fsize)));
  return { lines, size: fsize, width };
}
