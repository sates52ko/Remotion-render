/**
 * mechanism.ts — WHY a result happens, drawn as its causes (10x P1 "cause → mechanism → effect", 2026-10-27).
 * Pure, so node proves frame by frame that nothing appears before the narration says it; components/Diagram.tsx
 * Mechanism draws it.
 *
 * The model: an OUTCOME is a stack of FACTORS. Some factors PERSIST from one trial to the next (skill); some are DRAWN
 * AGAIN every trial (luck: the wind, the timing). Two trials side by side make the mechanism visible: the persisting
 * block slides across UNCHANGED, the drawn-again blocks land at a new level, so the total moves — and the viewer sees
 * why. The reference line is not invented either: it is the total the same factors give at their NORMAL level.
 * One diagram is built over the authored `continue` beats of the passage (like the scorecard / refute):
 *   trial1     the first trial's column and its name ("A PHENOMENAL JUMP")
 *   f0..f3     each factor's block stacks onto trial 1, on the word that names it ("skill", "wind", "timing")
 *   group      the bracket naming the drawn-again factors ("LUCK")
 *   trial2     the next trial's column ("THE NEXT JUMP")
 *   carry      the persisting blocks slide across UNCHANGED and are marked "SAME"
 *   redraw     the drawn-again blocks of trial 2 land at their new level (a die rolls)
 *   average    the dashed reference line (the total at normal levels) and its name ("HIS AVERAGE")
 *   settle     the arrow from trial 1's top to trial 2's top, and the result ("BACK TOWARD HIS AVERAGE")
 * Every element has its own frame (`at`, written by the planner from a STRICT word anchor: the spoken word, never
 * before). Elements an earlier beat of the chain reached (`done`) are drawn settled. No frame = not drawn.
 * No numbers: levels are qualitative ("peak", "normal", "minus" for bad luck); nothing is printed that is not said.
 */
export type MechEl = "trial1" | "f0" | "f1" | "f2" | "f3" | "group" | "trial2" | "carry" | "redraw" | "average" | "settle";
export const MECH_ELS: MechEl[] = ["trial1", "f0", "f1", "f2", "f3", "group", "trial2", "carry", "redraw", "average", "settle"];
export type Level = "minus" | "none" | "low" | "normal" | "high" | "peak";
export const LEVELS: Level[] = ["minus", "none", "low", "normal", "high", "peak"];
/** schematic height per level (diagram units before fitting); "minus" takes away from the stack (bad luck) */
export const LEVEL_H: Record<Level, number> = { minus: -90, none: 0, low: 50, normal: 100, high: 160, peak: 220 };

export type MechCue = string | { phrase: string; occurrence?: number };
export type Mechanism = {
  outcome: string; // what the stack measures: "JUMP"
  factors: { label: string; persists: boolean }[]; // 2..4; the persisting ones sit at the bottom
  group?: string; // name of the drawn-again factors together: "LUCK"
  trials: { label: string; levels: Level[] }[]; // 1..2 trials, one level per factor
  average?: string; // name of the reference line: "HIS AVERAGE"
  result?: string; // the effect, as the narration says it: "BACK TOWARD HIS AVERAGE"
  cues?: Partial<Record<MechEl, MechCue>>;
  /** planner: scene-local frame per element of this beat */
  at?: Partial<Record<MechEl, number>>;
  /** planner: elements earlier beats of the chain already reached */
  done?: MechEl[];
};

export const BUILD = 18, CARRY_LEN = 26, REDRAW_LEN = 22;
const ramp = (x: number, len: number) => Math.max(0, Math.min(1, x / Math.max(1, len)));
export const factorEl = (k: number) => (`f${k}` as MechEl);

export type MechState = {
  /** 0..1 per element (1 = settled) */
  p: Record<MechEl, number>;
};

export function mechanismState(m: Mechanism, local: number): MechState {
  const done = new Set(m.done || []);
  const at = m.at || {};
  const len = (e: MechEl) => (e === "carry" ? CARRY_LEN : e === "redraw" ? REDRAW_LEN : BUILD);
  const p = {} as Record<MechEl, number>;
  for (const e of MECH_ELS) {
    const f = at[e];
    p[e] = done.has(e) ? 1 : f == null ? 0 : local >= f ? ramp(local - f + 1, len(e)) : 0;
  }
  return { p };
}

/** heights (diagram units, before fitting) of each factor block in a trial; the persisting factors first (bottom) */
export function stackOf(m: Mechanism, t: number): { k: number; h: number; persists: boolean }[] {
  const order = m.factors.map((f, k) => ({ k, persists: f.persists })).sort((a, b) => Number(b.persists) - Number(a.persists) || a.k - b.k);
  const lv = (m.trials[t] && m.trials[t].levels) || [];
  return order.map(({ k, persists }) => ({ k, persists, h: LEVEL_H[(lv[k] as Level) || "none"] ?? 0 }));
}
/** the reference line: every factor at "normal" (persisting factors keep their own level — they do not vary) */
export function averageTotal(m: Mechanism): number {
  const lv = (m.trials[0] && m.trials[0].levels) || [];
  return m.factors.reduce((s, f, k) => s + (f.persists ? LEVEL_H[(lv[k] as Level) || "none"] ?? 0 : LEVEL_H.normal), 0);
}
export const totalOf = (m: Mechanism, t: number) => stackOf(m, t).reduce((s, b) => s + b.h, 0);

/** every word a mechanism diagram can print (screen-text / readcheck / gates read them like any label) */
export const mechanismLabels = (m: Mechanism): string[] =>
  [m.outcome, ...(m.factors || []).map((f) => f.label), m.group, ...(m.trials || []).map((t) => t.label), m.average, m.result].filter((x): x is string => typeof x === "string" && !!x);

/** what a viewer can see at this stage, in words (readcheck) — only elements that are drawn */
export function mechanismSeen(m: Mechanism, reached: Set<MechEl>): string {
  const has = (e: MechEl) => reached.has(e);
  const lvName = (l: Level) => (l === "minus" ? "taking away (bad luck)" : l);
  const parts: string[] = [`a cause model of ${m.outcome}`];
  if (has("trial1")) {
    const shown = m.factors.map((f, k) => (has(factorEl(k)) ? `${f.label} ${lvName(m.trials[0].levels[k])}${f.persists ? " (stays)" : " (drawn again)"}` : null)).filter(Boolean);
    parts.push(`column "${m.trials[0].label}"${shown.length ? ` stacked from ${shown.join(" + ")}` : ": empty dashed outline with a big \"?\""}${has("group") && m.group ? `, bracket "${m.group}" over the drawn-again blocks` : ""}`);
  }
  if (has("trial2") && m.trials[1]) {
    let s = `next column "${m.trials[1].label}"${!has("carry") && !has("redraw") ? ': empty dashed outline with a big "?"' : ""}`;
    if (has("carry")) s += `: ${m.factors.filter((f) => f.persists).map((f) => f.label).join(" + ")} slid across unchanged, marked SAME`;
    if (has("redraw")) s += `; ${m.factors.map((f, k) => (f.persists ? null : `${f.label} now ${lvName(m.trials[1].levels[k])}`)).filter(Boolean).join(", ")} (a die rolled)`;
    parts.push(s);
  }
  if (has("average")) parts.push(`dashed line "${m.average || "AVERAGE"}" at the total with normal luck`);
  if (has("settle")) parts.push(`arrow from the first total to the second${m.result ? `: "${m.result}"` : ""}`);
  return parts.join("; ");
}
