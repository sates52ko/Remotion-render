/**
 * refute.ts — a CLAIM the narration puts forward, questions, rejects, explains and replaces (10x P2, 2026-10-27).
 * Pure, so node can prove frame by frame that nothing rejects early; components/Diagram.tsx Refute draws it.
 *
 * One diagram built over the authored `continue` beats of the passage (like the scorecard):
 *   claim     a dashed bubble owned by whoever claims it ("THE DEFENSE SAYS"): inputs -> hub -> output, in colour
 *   links     the inputs all flow into the hub at once        result  the output bar rises ("more inputs = more output")
 *   doubt     a "?" on the hub — only when the narration turns ("But…")
 *   rejected  ON the rejecting word (strict anchor + lag): the claim drains to grey, its output empties, the verdict
 *             stamps (no strike-through: blind viewers read struck words both ways) — the claim stays READABLE
 *   corner    a moment later the grey claim moves to the corner, still labelled: every later frame shows WHAT was rejected
 *   illusion  the grey output gets its label ("only feels productive")
 *   reason    WHY: a one-slot gate closes on the hub; the reason text fills the slot under the verdict
 *   bounce    inputs race in, one passes, the others bounce off the gate
 *   truth     the correct model, named, in the SAME parts and colour; a single spotlight instead of parallel wires
 *   run       the spotlight hops input to input (one at a time) ... lock / ring / off: it holds one ~2 s, then disengages
 * Every element has its own frame (`at`, written by the planner from the words of the beat that speaks it). Elements
 * an earlier beat of the chain reached (`done`) are drawn settled. An element with no frame is NOT drawn — never guessed.
 */
export type RefuteEl = "links" | "result" | "doubt" | "rejected" | "illusion" | "reason" | "bounce" | "truth" | "run" | "lock" | "ring" | "off";
export const REFUTE_ELS: RefuteEl[] = ["links", "result", "doubt", "rejected", "illusion", "reason", "bounce", "truth", "run", "lock", "ring", "off"];
/** elements whose frame must come from a strict word anchor (never early): the stance and everything after it */
export const STANCE_ELS: RefuteEl[] = ["doubt", "rejected", "illusion", "reason", "bounce", "truth", "run", "lock", "ring", "off"];

export type Refute = {
  owner: string; claim: string; inputs: string[]; hub: string; output?: string;
  verdict: string; reason: string; truth: string; illusion?: string;
  /** phrases spoken in THIS beat, per element (run: several hops); rejected may name an occurrence */
  cues?: Partial<Record<RefuteEl, string | { phrase: string; occurrence?: number }>> & { run?: (string | { phrase: string; occurrence?: number })[] };
  /** planner: scene-local frame per element of this beat (run: one per hop) */
  at?: Partial<Record<Exclude<RefuteEl, "run">, number>> & { run?: number[] };
  /** planner: elements earlier beats of the chain already reached */
  done?: RefuteEl[];
};

export const REJECT_DRAIN = 10, CORNER_AFTER = 60, CORNER_LEN = 24, BUILD = 18;
const ramp = (x: number, len: number) => Math.max(0, Math.min(1, x / Math.max(1, len)));

export type RefuteState = {
  /** 0..1 per element (1 = settled) */
  p: Record<RefuteEl, number>;
  /** grey mix of the claim (0 colour .. 1 grey) — 0 on every frame before the rejecting word */
  grey: number;
  /** claim panel moving to the corner 0..1 (only after the rejection) */
  corner: number;
  /** which input the spotlight is on (index) or -1; its glow 0..1 */
  spot: number; spotOn: number;
  /** label of the claim's status chip */
  chip: "CLAIM" | "?" | "REJECTED";
};

export function refuteState(r: Refute, local: number): RefuteState {
  const done = new Set(r.done || []);
  const at = r.at || {};
  const prog = (e: RefuteEl, len = BUILD): number => {
    if (done.has(e)) return 1;
    const f = e === "run" ? (at.run && at.run.length ? at.run[0] : undefined) : (at as Record<string, number | undefined>)[e];
    return f == null ? 0 : local >= f ? ramp(local - f + 1, len) : 0;
  };
  const p = {} as Record<RefuteEl, number>;
  for (const e of REFUTE_ELS) p[e] = prog(e, e === "rejected" ? REJECT_DRAIN : BUILD);
  const grey = p.rejected;
  // the rejected claim stays centre stage (grey, stamped) until the correct model arrives, then makes room for it in the
  // corner (still labelled) — never before the rejection, never an empty stage between the two (v1: 59 went blank)
  const corner = p.rejected > 0 ? (done.has("truth") ? 1 : at.truth != null ? ramp(local - at.truth + 1, CORNER_LEN) : 0) : 0;
  // the spotlight: on the truth it rests on the hub (-1 = hub); each run hop moves it to the next input
  let spot = -1, spotOn = p.truth;
  const hops = (at.run || []).filter((f) => local >= f).length + (done.has("run") ? (r.inputs || []).length : 0);
  if (p.run > 0 || done.has("run")) { spot = (hops - 1 + (r.inputs || []).length) % Math.max(1, (r.inputs || []).length); spotOn = 1; }
  if (p.lock > 0) spot = 0; // it locks on the first input ("the code")
  if (p.off > 0) spotOn = 1 - p.off;
  const chip = grey > 0 ? "REJECTED" : p.doubt > 0 ? "?" : "CLAIM";
  return { p, grey, corner, spot, spotOn, chip };
}

/** every word a refute diagram can print (screen-text / readcheck / gates read them like any label) */
export const refuteLabels = (r: Refute): string[] =>
  [r.owner, r.claim, ...(r.inputs || []), r.hub, r.output, r.verdict, r.reason, r.truth, r.illusion].filter((x): x is string => typeof x === "string" && !!x);
