/**
 * scorecard.ts — the state of a SCORECARD diagram (Diagram.tsx Scorecard), pure so node can test it.
 *
 * A weighted decision builds over continued beats (10x pilot A, farsighted 306-310):
 *   weights  — each criterion appears with WHO weighs it and a weight bar (0.4 visibly shorter than 0.9);
 *   options  — the option columns appear;
 *   scores   — each option's score per criterion fills its bar (a stated zero stays an empty bar marked "0");
 *   totals   — every score bar shrinks to weight × score (the multiplication is SEEN), the products stack into one
 *              total bar per option; the longer total reads without a number. A winner is marked only if authored.
 * On an authored continuation (continuity.ts carry.prev) everything the previous beat already showed is drawn built;
 * only what is new animates. Nothing here invents a number: scores are bar lengths unless `scoreText` states one.
 */
export type ScoreCriterion = { label: string; weight: number; owner?: string; weightText?: string };
export type ScoreOption = { label: string; scores?: (number | null)[]; scoreText?: (string | null)[] };
export type Scorecard = { criteria: ScoreCriterion[]; options?: ScoreOption[]; show?: "weights" | "options" | "scores" | "totals"; winner?: number };

export const STAGES = ["weights", "options", "scores", "totals"] as const;
export const stageOf = (sc: Scorecard | undefined | null): number => Math.max(0, STAGES.indexOf((sc && sc.show) || "weights"));
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const score = (o: ScoreOption | undefined, i: number): number | null => {
  const v = o && o.scores ? o.scores[i] : null;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : null;
};

export type ScorecardState = {
  stage: number;
  criteria: { label: string; weight: number; owner?: string; weightText: string | null; built: boolean }[];
  /** `unknown`: not graded yet at a stage that shows grades — drawn as "?" (never as an empty bar, which reads as 0).
   *  `totalKnown`: every grade of EVERY option is known; an option with an unknown grade has no total ("?"), so no
   *  comparison or winner is implied before the narration grades it (pilot A: "Brooklyn wins" read from a total that
   *  used grades only stated 10 beats later). */
  options: { label: string; built: boolean; total: number; totalKnown: boolean; cells: { score: number | null; unknown: boolean; text: string | null; built: boolean; product: number }[] }[];
  /** options + scores visible on this beat (stage), totals drawn (stage 3), and whether they were already drawn */
  showOptions: boolean; showScores: boolean; showTotals: boolean; totalsBuilt: boolean;
  maxTotal: number;
  winner: number | null;
};

export function scorecardState(cur: Scorecard, prev?: Scorecard | null): ScorecardState {
  const stage = stageOf(cur);
  const pStage = prev ? stageOf(prev) : -1;
  const crit = (cur.criteria || []).slice(0, 3).map((c, i) => {
    const pc = prev && prev.criteria ? prev.criteria[i] : undefined;
    return { label: c.label, weight: Math.max(0, Math.min(1, c.weight)), owner: c.owner, weightText: typeof c.weightText === "string" && c.weightText ? c.weightText : null, built: !!pc && norm(pc.label) === norm(c.label) && pc.weight === c.weight };
  });
  const opts = (cur.options || []).slice(0, 3).map((o, j) => {
    const po = prev && prev.options ? prev.options[j] : undefined;
    const optBuilt = pStage >= 1 && !!po && norm(po.label) === norm(o.label);
    const cells = crit.map((c, i) => {
      const s = score(o, i);
      const text = o.scoreText && typeof o.scoreText[i] === "string" ? (o.scoreText[i] as string) : null;
      const built = optBuilt && pStage >= 2 && score(po, i) === s;
      return { score: s, unknown: stage >= 2 && s == null, text, built, product: s == null ? 0 : s * c.weight };
    });
    return { label: o.label, built: optBuilt, cells, total: cells.reduce((a, c) => a + c.product, 0), totalKnown: cells.every((c) => c.score != null) };
  });
  const showTotals = stage >= 3 && opts.length > 0;
  // a total is drawn only when EVERY option is fully graded: one visible total next to a "?" is still a result
  // (pilot A re-test: 3/3 blind readers read California's lone total as "California comes out low" — never stated)
  const allKnown = opts.every((o) => o.totalKnown);
  for (const o of opts) o.totalKnown = o.totalKnown && allKnown;
  const known = opts.filter((o) => o.totalKnown);
  return {
    stage,
    criteria: crit,
    options: opts,
    showOptions: stage >= 1 && opts.length > 0,
    showScores: stage >= 2 && opts.length > 0,
    showTotals,
    totalsBuilt: showTotals && pStage >= 3,
    // a fixed scale — the best possible total (every grade 10) — so one known total never reads as "high" by filling the row
    maxTotal: Math.max(1e-9, crit.reduce((a, c) => a + c.weight * 10, 0)),
    // a winner only when authored AND every option's total is known (a winner over an unknown total is a guess)
    winner: showTotals && known.length === opts.length && Number.isInteger(cur.winner) && (cur.winner as number) >= 0 && (cur.winner as number) < opts.length ? (cur.winner as number) : null,
  };
}

/** the words a scorecard puts on screen (merge checks them like any label): criteria, owners, options, stated scores */
export const scorecardLabels = (sc: Scorecard): string[] => [
  ...(sc.criteria || []).map((c) => c.label), ...(sc.criteria || []).map((c) => c.owner).filter(Boolean) as string[], ...(sc.criteria || []).map((c) => c.weightText).filter(Boolean) as string[],
  ...(sc.options || []).map((o) => o.label), ...(sc.options || []).flatMap((o) => (o.scoreText || []).filter((x): x is string => typeof x === "string")),
];
