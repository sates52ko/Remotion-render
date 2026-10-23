/**
 * safeArea.ts — P9-A A2: the one safe-area rule for Antidote motifs.
 *
 * MEASURED BUG (the-second-mountain s24–26, "treadmill disguised as stairs"):
 * an authored own-icon on the illustration preset's motif slot
 * (x 1262, y 446, scale 1.66 → 863px box) sits 14px under the frame top, and
 * the ambient float (ty ±9, scale ±1.2%, rotate ±0.9°) plus any enter/arc
 * motion pushes its top corner OFF-FRAME — the icon's console gets cropped.
 *
 * The rule: a motif whose scaled box CAN fit inside the frame's safe area is
 * nudged (translate-only, never scaled, never cropped by us) so its nominal
 * box clears the safe bounds. A box that CANNOT fit (diorama's 2.5×
 * environmental pieces bleed off-frame BY DESIGN) is left untouched — the
 * clamp must never flatten the shot grammar's intentional bleed.
 *
 * Safe bounds are the 1920×1080 stage minus margins that absorb the motion
 * budget (ambient ±9px ty / ±5px tx, ±1.2% scale, ±0.9° corner rise ≈ 7px on
 * an 863px box) so a clamped icon stays fully on-frame at every frame.
 */

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export const MOTIF_SAFE_AREA = { x0: 28, x1: 1892, y0: 56, y1: 1024 } as const;

export function motifSafeClamp(
  x: number,
  y: number,
  scale: number,
  w = 520,
  h = 520
): { x: number; y: number; clamped: boolean } {
  const s = scale || 1;
  const bw = w * s;
  const bh = h * s;
  let nx = x;
  let ny = y;
  if (bw <= MOTIF_SAFE_AREA.x1 - MOTIF_SAFE_AREA.x0) {
    const left = x - bw / 2;
    const right = x + bw / 2;
    if (left < MOTIF_SAFE_AREA.x0) nx = MOTIF_SAFE_AREA.x0 + bw / 2;
    else if (right > MOTIF_SAFE_AREA.x1) nx = MOTIF_SAFE_AREA.x1 - bw / 2;
  }
  if (bh <= MOTIF_SAFE_AREA.y1 - MOTIF_SAFE_AREA.y0) {
    const top = y - bh / 2;
    const bottom = y + bh / 2;
    if (top < MOTIF_SAFE_AREA.y0) ny = MOTIF_SAFE_AREA.y0 + bh / 2;
    else if (bottom > MOTIF_SAFE_AREA.y1) ny = MOTIF_SAFE_AREA.y1 - bh / 2;
  }
  return { x: nx, y: ny, clamped: nx !== x || ny !== y };
}
