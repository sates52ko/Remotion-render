/**
 * told.ts — the data and the maths of a TOLD stage (Film Flow 2: the picture shows what the narration names).
 *
 * Pure: no React, no remotion, no import — the renderer (components/ToldStage.tsx), the compiler that turns an
 * author's told beat into a stage (scripts/lib/told-compile.js) and the tests all read the SAME functions, so where a
 * thing is on a frame is decided in one place. A stage is a list of items; every item is a pure function of the frame:
 * a start state, an `enter`, `keys` that LAND on a frame (the frame of the narrator's word), an `exit`.
 */

/**
 * 1 — emblems, people, an object's / animal's own drawing (2026-11-14).
 * 2 — THE BOOK'S OWN DRAWINGS (Film Flow 3, 2026-11-16): a thing of any kind as its drawing, a drawing's states, a
 *     drawing in a person's hand, the place behind the stage (`backdrops`). What v2 adds is carried by fields a v1
 *     stage does not have, and the renderer reads them only when `v >= 2`: a v1 stage is drawn exactly as it was.
 * 3 — PEOPLE PLAY THE VERB (Film Flow 4, 2026-11-17): a figure carries `act` { verb, at } and is drawn in that verb's
 *     pose (toldActs.ts) — read only when `v >= 3`. A v1 / v2 stage has no `act` and is drawn exactly as it was.
 * 4 — THE BOOK'S OWN CAST (Film Flow 5, 2026-11-17): a figure's variant carries `drawn` — a head and a garment drawn
 *     for this book on the rig (schema.ts drawnCast) — read only when `v >= 4`. A v1 – v3 stage is drawn as it was.
 * 5 — THE PLACE IS A SCENE (Film Flow 7, 2026-11-21): a backdrop drawn as a scene carries `sky` and `ground` (a light
 *     sky the titles and name plates are read over; a ground the cast stands on). On a v5 stage such a backdrop is
 *     drawn at full presence — the sky behind, the ground band from its bottom edge to the bottom of the frame, a
 *     contact shadow under a figure that stands on it. A backdrop WITHOUT `sky` is the pale wash of v2, on any
 *     stage; a v1 – v4 stage is drawn exactly as it was (it never carries `sky`).
 */
export const TOLD_VERSION = 5;

export type ToldKey = { at: number; x?: number; y?: number; s?: number; o?: number; r?: number; dur?: number; ease?: "out" | "back" | "inout" };
export type ToldItem = {
  id: string;
  kind: "emblem" | "tile" | "word" | "planet" | "house" | "coin" | "burst" | "dash" | "cross" | "crown" | "panel" | "bar" | "arrow" | "figure" | "icon" | "cutout";
  image?: string;
  /** figure: the person — look (wardrobe.tsx: age, outfit, headwear, hair …), what they do, and what is in their hand */
  /** figure (v3): the verb this person plays and the stage frame of the narrator's word (toldActs.ts actPose) */
  act?: { verb: string; at: number };
  /** figure (v3): the name plate moved by this much (px of the figure, + = down): down with the head of a seated
   *  person, up for one of two people in contact so that the two names do not lie on each other */
  labelDy?: number;
  variant?: Record<string, unknown>; action?: string; cue?: number; body?: "bust" | "full"; flip?: boolean; holds?: string;
  /** figure (v5, slice 2): this person was already on stage in an earlier beat — their name plate RECEDES (smaller,
   *  lighter); the full plate stands only where a person first appears. Written by the compiler on carried figures. */
  known?: boolean;
  /** icon: an animal or an object DRAWN FOR THIS BOOK, as paths in its own viewBox (the same data as motifs.json) */
  paths?: ToldPath[]; viewBox?: string;
  /** icon (v2): which of the drawing's states this is (the ship "wrecked") — told to the gates that read a stage */
  state?: string;
  label?: string; sub?: string; glyph?: string;
  color?: string; ink?: string; size?: number; w?: number; h?: number; box?: string;
  x: number; y: number; s?: number; o?: number; r?: number;
  /** drawn on the screen, outside the camera (a title): it does not move or scale when the camera does */
  screen?: boolean;
  /** dash: where the line ends; it draws itself from `drawFrom` to `drawTo` */
  x2?: number; y2?: number; drawFrom?: number; drawTo?: number;
  enter?: { at: number; from?: "left" | "right" | "top" | "bottom" | "pop" | "fade"; dur?: number };
  keys?: ToldKey[];
  exit?: { at: number; dur?: number };
  shake?: { at: number; dur?: number; amp?: number };
};
export type ToldPath = { d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number };
/** v2 — the PLACE the stage is at: that place's drawing, pale, behind everything. `wide` = drawn for the whole width
 *  (a "backdrop" drawing); otherwise the place's own icon, large and centred. It fades in / out, nothing else. */
export type ToldBackdrop = { id: string; paths: ToldPath[]; viewBox?: string; wide?: boolean; image?: string; dim?: number; groundTop?: number; enter?: { at: number; dur?: number }; exit?: { at: number; dur?: number };
  /** v5 — a SCENE backdrop: the colour of the sky behind the place (light) and of the ground the cast stands on. Both
   *  hex, resolved by the compiler. Without `sky` the backdrop is the pale wash. */
  sky?: string; ground?: string;
  /** v5 (slice 2) — where a person can STAND in this place (the gate, the door, the pier): points in the drawing's
   *  own viewBox units, with a depth scale. The compiler puts the figures of an arrangement there. */
  spots?: ToldSpot[] };
export type ToldSpot = { x: number; y: number; s?: number };
export type ToldSpec = { v?: number; bg?: string; grid?: boolean; items: ToldItem[]; cam?: ToldKey[]; backdrops?: ToldBackdrop[];
  /** v2: "fit" = a name plate is as wide as its name (plateW); absent = the v1 plate */
  plate?: "fit" };
export type ToldState = { x: number; y: number; s: number; o: number; r: number };

const clamp = (x: number) => Math.max(0, Math.min(1, x));

/**
 * v2 — how wide a NAME PLATE must be for its name (the film's heavy caps). The v1 plate counted 0.62 em for every
 * letter: wide letters ran out of it and — white on a light stage — vanished ("WAX PHONOGRAPH" read "AX PHONOGRAP").
 * Per-letter widths, a little generous; the compiler uses the same number to keep a plate inside the frame.
 */
export function plateW(label: string, size: number): number {
  let em = 0;
  for (const ch of String(label)) em += ch === " " ? 0.32 : "IJ1.,:;'!-".includes(ch) ? 0.4 : "MW".includes(ch) ? 1.02 : "ACDGHKNOQUVXY&04689".includes(ch) ? 0.78 : 0.7;
  return em * size + String(label).length * 1 + 44;
}

/** How much of a backdrop is there on `frame` (0 … 1): a plain fade in that ENDS on `enter.at`, a fade out that ends on `exit.at`. */
export function backdropOpacity(b: { enter?: { at: number; dur?: number }; exit?: { at: number; dur?: number } }, frame: number): number {
  let o = 1;
  if (b.enter) { const dur = Math.max(1, b.enter.dur ?? 12); o *= clamp((frame - (b.enter.at - dur)) / dur); }
  if (b.exit) { const dur = Math.max(1, b.exit.dur ?? 12); o *= 1 - clamp((frame - (b.exit.at - dur)) / dur); }
  return o;
}

/** Where a backdrop is drawn in the 1920 × 1080 frame: under the title band, above the subtitle band. → translate + scale */
export function backdropFit(b: { viewBox?: string; wide?: boolean }): { x: number; y: number; k: number } {
  const [vx, vy, vw, vh] = (b.viewBox ?? (b.wide ? "0 0 1920 760" : "0 0 520 520")).split(/[\s,]+/).map(Number);
  const top = 110, bottom = 870, k = b.wide ? Math.min(1920 / vw, (bottom - top) / vh) : (bottom - top - 40) / Math.max(vw, vh);
  // centred across the frame, standing on the bottom of the band (a skyline has its ground there)
  return { x: 960 - (vw * k) / 2 - vx * k, y: bottom - vh * k - vy * k, k };
}

/**
 * v5 — THE SCENE of a backdrop, or null when it is the pale wash: where its ground begins in the frame (its bottom
 * edge, backdropFit — the drawn ground strip continues from there to the bottom of the frame in `ground`) and the
 * sky behind it. `ground` without a colour takes the drawing's ink. A figure STANDS on that ground when its feet are
 * on or just above the edge (`GROUND_REACH` px): one walking at mid-stage is in the place's middle ground and throws
 * no contact shadow (the first trial drew a ground line under a figure in the air).
 */
export const GROUND_REACH = 60;
export function backdropScene(b: { viewBox?: string; wide?: boolean; sky?: string; ground?: string }): { sky: string; ground: string; groundTop: number } | null {
  if (!b.sky) return null;
  const [, vy, , vh] = (b.viewBox ?? (b.wide ? "0 0 1920 760" : "0 0 520 520")).split(/[\s,]+/).map(Number);
  const fit = backdropFit(b);
  return { sky: b.sky, ground: b.ground ?? "#1E1E22", groundTop: fit.y + (vy + vh) * fit.k };
}
export const standsOn = (feetY: number, groundTop: number): boolean => feetY >= groundTop - GROUND_REACH;
/** v5 (slice 2) — a scene's standing spots in FRAME coordinates (the compiler places figures there; the renderer draws a
 *  contact shadow under a figure whose feet are on one). Empty for a backdrop without spots. */
export function spotsOf(b: { viewBox?: string; wide?: boolean; spots?: ToldSpot[] }): { x: number; y: number; s: number }[] {
  if (!Array.isArray(b.spots) || !b.spots.length) return [];
  const fit = backdropFit(b);
  return b.spots.map((p) => ({ x: fit.x + p.x * fit.k, y: fit.y + p.y * fit.k, s: p.s ?? 1 }));
}
/** feet on a spot: within this many px of its level */
export const SPOT_REACH = 14;
export const EASE = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inout: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // a small overshoot (≈ 3 %): enough to land, not enough to wobble when ten things arrive one after another
  back: (t: number) => { const c = 0.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

/** The state of something on `frame`: its start, then each key in order — a key LANDS on its `at`. */
export function toldState(base: ToldState, keys: ToldKey[] | undefined, frame: number): ToldState {
  let cur = { ...base };
  for (const k of [...(keys || [])].sort((a, b) => a.at - b.at)) {
    const dur = Math.max(1, k.dur ?? 14), start = k.at - dur;
    if (frame <= start) break;
    const e = EASE[k.ease ?? "out"](clamp((frame - start) / dur));
    const to = { x: k.x ?? cur.x, y: k.y ?? cur.y, s: k.s ?? cur.s, o: k.o ?? cur.o, r: k.r ?? cur.r };
    cur = { x: cur.x + (to.x - cur.x) * e, y: cur.y + (to.y - cur.y) * e, s: cur.s + (to.s - cur.s) * e, o: cur.o + (to.o - cur.o) * e, r: cur.r + (to.r - cur.r) * e };
    if (frame < k.at) break;
  }
  return cur;
}

/** Where an item is on `frame`, or null when it is not on stage (not entered yet, or gone). */
export function itemState(it: ToldItem, frame: number): ToldState | null {
  let st = toldState({ x: it.x, y: it.y, s: it.s ?? 1, o: it.o ?? 1, r: it.r ?? 0 }, it.keys, frame);
  if (it.enter) {
    const dur = it.enter.dur ?? 12, k = (frame - (it.enter.at - dur)) / dur;
    if (k <= 0) return null;
    const e = EASE.back(clamp(k)), from = it.enter.from ?? "pop", far = 1 - e;
    if (from === "left") st = { ...st, x: st.x - 700 * far };
    else if (from === "right") st = { ...st, x: st.x + 700 * far };
    else if (from === "top") st = { ...st, y: st.y - 500 * far };
    else if (from === "bottom") st = { ...st, y: st.y + 500 * far };
    else if (from === "pop") st = { ...st, s: st.s * Math.max(0, e) };
    st = { ...st, o: st.o * clamp(k * 2.5) };
  }
  if (it.exit) {
    const dur = it.exit.dur ?? 10, k = clamp((frame - (it.exit.at - dur)) / dur);
    if (k >= 1) return null;
    st = { ...st, o: st.o * (1 - k) };
  }
  if (it.shake) {
    const dur = it.shake.dur ?? 16, d = frame - it.shake.at;
    // ONE knock and a settle (a swing and a half, dying away) — not a vibration: at 9 swings a second it read as the
    // picture trembling (operator, 2026-11-13)
    if (d >= 0 && d < dur) { const k = d / dur; st = { ...st, x: st.x + Math.sin(k * Math.PI * 3) * (it.shake.amp ?? 12) * (1 - k) * (1 - k) }; }
  }
  return st;
}
