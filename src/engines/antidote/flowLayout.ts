/**
 * flowLayout.ts — where a flow diagram's nodes sit (Diagram.tsx Flow). Pure, no JSX, so node can test it.
 * ONE node (an authored single-label flow, e.g. the first beat of a flow that grows on continued beats — farsighted
 * 146/155/190/303): centred, and the flow draws no arrow and no travelling token. interpolate over [0, n-1] = [0, 0]
 * threw "inputRange must be strictly monotonically increasing" and killed the render (2026-10-26). Two or three
 * nodes: exactly the previous positions.
 */
import { interpolate } from "remotion";

export function flowNodeXs(n: number, r: number, width: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [width / 2];
  return Array.from({ length: n }, (_, i) => interpolate(i, [0, n - 1], [60 + r, width - 60 - r]));
}

/** a travelling token needs a connector: only with two or more nodes */
export const flowHasToken = (n: number): boolean => n > 1;
