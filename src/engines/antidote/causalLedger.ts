/**
 * causalLedger.ts — MECHANISM 3.0: a FEEDBACK LOOP whose STATE CHANGES FROM LAP TO LAP (antidote-10x, 2026-10-28).
 *
 * Mechanism 2.0 (causal.ts) draws a chain and a loop arc, but a loop drawn once says nothing about what each lap
 * PRODUCES — and the commonest loop failures in the mute corpus (behavioural feedback loops: n33, WRONG 8, dead 18)
 * are exactly that: "presses the lever compulsively", "the spike flattens over time", "the most addictive loop"
 * read as a face with a word. This module adds a LEDGER to the causal chain (a design panel of 3 + judge, 2026-10-28):
 *
 *   LAPS     each `loop` cue fires a BURST of laps (the author's outcomes, in order: reward / empty). A lap runs the
 *            token lever -> food door (opens on a pellet or on nothing) -> brain (only with a reward, only once the
 *            brain is drawn) -> back along the arc. Laps run one after another; each rename of the token's tag
 *            (press -> compulsively -> mashing) makes the laps faster.
 *   LEDGER   every lap writes one PERMANENT column: a food tile (pellet, or a neutral dashed empty — never a cross, a
 *            red or a break: "taking away" read as damage in blind tests) and, once the METER is born, a bar on ONE
 *            shared qualitative scale (flat … max; never numbers). The bar rises while the token approaches the door
 *            (anticipation) and peaks when the door opens. The ledger is append-only: a still frame shows the history.
 *   CONTRAST the same loop under another schedule as a greyed second lane with its own ledger on the SAME scale
 *            ("100% predictable": a pellet every lap, bars stepping down to flat) and a check when "solved".
 * Pure: frames come only from the planner's anchored cue frames; earlier beats' laps (`before` counts) are settled.
 */
import type { Causal, CausalEl } from "./causal";

export type Outcome = "reward" | "empty";
export type BarLevel = "flat" | "stub" | "low" | "medium" | "high" | "max";
export const BAR_LEVELS: BarLevel[] = ["flat", "stub", "low", "medium", "high", "max"];
/** share of the meter's height per level (one scale for every lane) */
export const BAR_H: Record<BarLevel, number> = { flat: 0.04, stub: 0.12, low: 0.3, medium: 0.52, high: 0.78, max: 1 };
export type Lap = { o: Outcome; bar?: BarLevel };
export type Burst = { laps: Lap[] };
export type Ledger = {
  label?: string; // the main lane's name, as said ("VARIABLE RATIO")
  labelTo?: string; // its later name (on `lrelabel`): "UNPREDICTABLE"
  meter?: string; // what the bars measure, as said ("DOPAMINE"); bars exist only once it is born (`meter` cue)
  bursts: Burst[]; // one per `loop` cue firing, in firing order over the whole chain
};
export type ContrastLedger = { bursts: Burst[] }; // one per `clap` firing

/** frames per lap: calm, fast (after the 1st rename), frantic (after the 2nd) */
export const LAP_LEN = [36, 22, 14];
export const CLAP_LEN = 28;
const DOOR = 0.42, DOOR_OPEN = 0.12; // the door opens at 42% of a lap
const NEVER = Number.POSITIVE_INFINITY, SETTLED = -1e6;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const v = clamp01(x); return v * v * (3 - 2 * v); };

export type LapState = {
  o: Outcome;
  bar: BarLevel | null; // null: no bar (the meter was not born when this lap ran, or none authored)
  tile: number; // 0..1 the food tile has been written
  barP: number; // 0..1 of its level
  start: number; // frame the lap starts (SETTLED for an earlier beat's lap)
  dur: number;
};
export type LedgerState = {
  main: LapState[];
  contrast: LapState[];
  /** the token on its lap: phase 0..1 (null = resting at the loop's start), whether it carries the reward on to the brain */
  lap: null | { phase: number; o: Outcome; toBrain: boolean };
  speed: number; // 0 calm, 1 fast, 2 frantic (renames so far)
  tagIndex: number; // how many renames have happened (0 = the first tag)
  tagShift: number; // 0..1 of the latest rename
  meter: number; // 0..1
  labelShift: number; // 0..1 the lane's rename
  solved: number; // 0..1 the contrast check
  flare: number; // 0..1 a "max" bar just peaked
  lane: number; // 0..1 the lane is named (its `lane` cue, else the token's birth): label + empty ledger + "?" stations
};

type Before = Partial<Record<"loop" | "clap" | "relabel", number>>;
const firesOf = (c: Causal, e: CausalEl): number[] => {
  const a = (c.at || {})[e];
  return a == null ? [] : (Array.isArray(a) ? a : [a]).slice().sort((x, y) => x - y);
};
const startOf = (c: Causal, e: CausalEl): number => {
  if ((c.done || []).includes(e)) return SETTLED;
  const f = firesOf(c, e);
  return f.length ? f[0] : NEVER;
};

/** laps of a lane: earlier beats' bursts settled, this beat's scheduled one after another from their cue frames */
function schedule(bursts: Burst[], before: number, fires: number[], lenAt: (t: number) => number, meterAt: number) {
  const laps: LapState[] = [];
  for (let b = 0; b < Math.min(before, bursts.length); b++)
    for (const l of bursts[b].laps) laps.push({ o: l.o, bar: l.bar && meterAt < NEVER ? l.bar : null, tile: 1, barP: 1, start: SETTLED, dur: 1 });
  let cursor = -Infinity;
  fires.forEach((f, i) => {
    const burst = bursts[before + i];
    if (!burst) return;
    for (const l of burst.laps) {
      const start = Math.max(f, cursor);
      const dur = lenAt(start);
      cursor = start + dur;
      laps.push({ o: l.o, bar: l.bar && meterAt <= start ? l.bar : null, tile: 0, barP: 0, start, dur });
    }
  });
  return laps;
}

export function ledgerState(c: Causal & { ledger?: Ledger; before?: Before }, local: number): LedgerState | null {
  const L = c.ledger;
  if (!L) return null;
  const before = c.before || {};
  const relabels = firesOf(c, "relabel");
  const renamesAt = (t: number) => (before.relabel || 0) + relabels.filter((f) => f <= t).length;
  const meterAt = startOf(c, "meter" as CausalEl);
  const main = schedule(L.bursts || [], before.loop || 0, firesOf(c, "loop"), (t) => LAP_LEN[Math.min(2, renamesAt(t))], meterAt);
  const cl = (c.contrast as { bursts?: Burst[] } | undefined)?.bursts || [];
  const contrast = schedule(cl, before.clap || 0, firesOf(c, "clap" as CausalEl), () => CLAP_LEN, -1e9);
  let lap: LedgerState["lap"] = null;
  let flare = 0;
  for (const s of [...main, ...contrast]) {
    if (s.start === SETTLED) continue;
    const p = (local - s.start) / s.dur;
    s.tile = smooth((p - DOOR) / DOOR_OPEN);
    // anticipation: the bar climbs while the token approaches the door; a reward tops out after it opens
    s.barP = s.bar ? (s.o === "reward" ? smooth((p - 0.08) / 0.62) : smooth((p - 0.08) / (DOOR - 0.04))) : 0;
    if (s.bar === "max" && p >= 0.7) flare = Math.max(flare, 1 - clamp01((local - (s.start + 0.7 * s.dur)) / 30));
  }
  const brainDrawn = (t: number) => { const n = c.stations.length - 1; const s = startOf(c, `n${n}` as CausalEl); return s !== NEVER && s <= t; };
  for (const s of main) if (s.start !== SETTLED && local >= s.start && local < s.start + s.dur) lap = { phase: (local - s.start) / s.dur, o: s.o, toBrain: s.o === "reward" && brainDrawn(s.start) };
  const tagIndex = renamesAt(local);
  const lastRename = relabels.filter((f) => f <= local).pop();
  const ramp = (f: number, len: number) => (f === NEVER ? 0 : f === SETTLED ? 1 : local >= f ? clamp01((local - f + 1) / len) : 0);
  return {
    main, contrast, lap,
    speed: Math.min(2, tagIndex),
    tagIndex,
    tagShift: lastRename == null ? (tagIndex > 0 ? 1 : 0) : clamp01((local - lastRename + 1) / 18),
    meter: ramp(meterAt, 16),
    labelShift: ramp(startOf(c, "lrelabel" as CausalEl), 18),
    solved: ramp(startOf(c, "csolved" as CausalEl), 16),
    flare,
    lane: Math.max(ramp(startOf(c, "lane" as CausalEl), 16), ramp(startOf(c, "token"), 16)),
  };
}

/** the token's position on a lap, as fractions along the drawn path (renderer): leg 0 lever->food, 1 at the door,
 *  2 food->brain (reward, brain drawn), 3 back along the arc to the lever */
export function lapLeg(phase: number, toBrain: boolean): { leg: 0 | 1 | 2 | 3; t: number } {
  if (phase < DOOR) return { leg: 0, t: smooth(phase / DOOR) };
  if (phase < DOOR + DOOR_OPEN) return { leg: 1, t: (phase - DOOR) / DOOR_OPEN };
  const after = DOOR + DOOR_OPEN;
  if (toBrain) {
    if (phase < 0.74) return { leg: 2, t: smooth((phase - after) / (0.74 - after)) };
    return { leg: 3, t: smooth((phase - 0.74) / 0.26) };
  }
  return { leg: 3, t: smooth((phase - after) / (1 - after)) };
}

/** the laps a reader can see, in words (readcheck) */
export function ledgerSeen(c: Causal & { ledger?: Ledger }, laps: { main: Lap[]; contrast: Lap[] }, meterOn: boolean, labelRenamed: boolean, solved: boolean): string {
  const L = c.ledger;
  if (!L) return "";
  const tile = (l: Lap) => (l.o === "reward" ? "pellet" : "empty");
  const parts = [`below the loop, a row of tiles that grows by one each lap (${laps.main.map(tile).join(", ") || "none yet"})`];
  if (L.label) parts.push(`row name "${labelRenamed && L.labelTo ? `${L.label}" crossed out, now "${L.labelTo}` : L.label}"`);
  if (meterOn) parts.push(`above each tile since "${L.meter || "the meter"}" appeared, a bar (${laps.main.filter((l) => l.bar).map((l) => l.bar).join(", ")})`);
  if (laps.contrast.length) parts.push(`a greyed second row: ${laps.contrast.map(tile).join(", ")} with bars ${laps.contrast.map((l) => l.bar || "-").join(", ")}${solved ? ", a check mark beside it" : ""}`);
  return parts.join("; ");
}
