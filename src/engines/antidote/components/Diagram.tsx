import React from "react";
import { interpolate, spring, Easing } from "remotion";
import type { DiagramSpec } from "../schema";
import { fitLabel, DIAGRAM_VW as VW, DIAGRAM_VH as VH, type FittedLabel } from "../labelFit";
import { builtFrame, shellFrame, SETTLED_FRAME, type DiagramCarry } from "../continuity";
import { flowNodeXs, flowHasToken } from "../flowLayout";
import { scorecardState, type Scorecard } from "../scorecard";
import { refuteState, type Refute } from "../refute";
import { mechanismState, stackOf, averageTotal, factorEl, type Mechanism } from "../mechanism";
import { CausalChain } from "./CausalChain";
import { CausalLoop } from "./CausalLoop";

/**
 * Diagram.tsx — Antidote 4.0 EXPLANATORY GRAPHICS.
 *
 * Motifs (motifs.tsx) NAME a beat's subject with an icon; a diagram EXPLAINS it —
 * the self-drawing conceptual graphic that is the signature of the reference
 * channels (a taxonomy sorting into buckets, two rhythms locking into sync, a
 * cause flowing to an effect, a marker on a spectrum). Every archetype is pure
 * SVG + interpolate/spring, deterministic (a function of the local frame), so it
 * is CPU-cheap and frame-identical across chunked renders.
 *
 * A diagram is data-driven: the director/planner hands it `labels` (bucket /
 * node / pole names) and optional `values`, and it draws itself. It renders on
 * the focal plane as the hero of the beat (usually with the cast dropped).
 *
 * P3.2: every label renders through FitText/labelFit — each archetype owns a
 * CELL and each label shrinks/wraps to fit its cell, so neither two labels nor
 * a label and the graphic can ever draw over each other ("NIGHTMARE FUEL"
 * running into "ABSOLUTELY EVERYTHING THOUGHT TRUE" — screenshot class).
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

type ArchProps = {
  spec: DiagramSpec;
  accent: string;
  ink: string;
  paper: string;
  frame: number; // local frames since the diagram appeared
  fps: number;
  durationFrames: number;
  /** AUTHORED CONTINUATION (continuity.ts): what this diagram already showed last
   *  scene — those parts are drawn built; null/undefined = build everything (as before). */
  carry?: DiagramCarry | null;
  /** clock of the endless loops (flow token, wave scroll, funnel drop); = frame unless carried */
  loop: number;
};

// A part that is NEW on a carried diagram fades in; everything else is drawn as before.
const Op: React.FC<{ o: number; children: React.ReactNode }> = ({ o, children }) => (o >= 1 ? <>{children}</> : <g opacity={o}>{children}</g>);
// the title row: built when carried with the same title, fading in when it changed
const titleShowOf = (carry: DiagramCarry | null | undefined, frame: number, fps: number, show: number) =>
  carry && carry.shell && !carry.title ? spring({ frame, fps, config: { damping: 16 } }) : show;
// a part new on a carried diagram fades in on the diagram's own clock (1 when not carried)
const newPartOf = (carry: DiagramCarry | null | undefined, kept: boolean, frame: number, fps: number) =>
  carry && !kept ? spring({ frame, fps, config: { damping: 16 } }) : 1;

/**
 * FitText — every label in this file renders through here. It draws the
 * cell-fitted lines from labelFit as one <text> (tspans for wraps),
 * block-centered on `y`, so a wrapped label sits where the single-line one
 * used to. scripts/audit-coherence.mjs fits the SAME data with the SAME
 * fitLabel — what passes the audit is what you see.
 */
const FitText: React.FC<{
  fit: FittedLabel;
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  fill: string;
  fontWeight?: number;
  letterSpacing?: number;
}> = ({ fit, x, y, anchor = "middle", fill, fontWeight = 800, letterSpacing }) => {
  if (!fit.lines.length) return null;
  const lh = fit.size * 1.18;
  const top = y - ((fit.lines.length - 1) * lh) / 2;
  return (
    <text x={x} y={top} textAnchor={anchor} fontFamily="Poppins, Arial, sans-serif" fontWeight={fontWeight}
      fontSize={fit.size} fill={fill} letterSpacing={letterSpacing}>
      {fit.lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>{line}</tspan>
      ))}
    </text>
  );
};

const Title: React.FC<{ text?: string; ink: string; show: number }> = ({ text, ink, show }) => {
  if (!text) return null;
  // Fixed baseline (y=54): shrink-only for normal titles, two lines only when enormous.
  const fit = fitLabel(text, { maxW: VW - 120, baseSize: 46, minSize: 26, maxLines: 2 });
  return (
    <g opacity={show}>
      <FitText fit={fit} x={VW / 2} y={54} fill={ink} letterSpacing={1} />
    </g>
  );
};

// ── sorter — items route into N labelled buckets (a taxonomy / classification) ─
const Sorter: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps, carry }) => {
  const labels = spec.labels.length ? spec.labels.slice(0, 4) : ["ONE", "TWO", "THREE"];
  const n = labels.length;
  const gap = 44;
  const totalW = VW - 120;
  const bw = (totalW - gap * (n - 1)) / n;
  const top = 210;
  const bh = 300;
  const show = spring({ frame: shellFrame(carry, frame), fps, config: { damping: 16 } });
  return (
    <g>
      <Title text={spec.title} ink={ink} show={titleShowOf(carry, frame, fps, show)} />
      {labels.map((lab, i) => {
        const x = 60 + i * (bw + gap);
        const enter = spring({ frame: builtFrame(carry, i, frame) - i * 6, fps, config: { damping: 15, stiffness: 120 } });
        const dots = Math.max(1, Math.min(6, spec.values?.[i] ?? 3));
        // carried bucket: the tokens it already held stay; only the extra ones drop in
        const had = carry && carry.labels[i] ? Math.max(1, Math.min(6, carry.prevValues[i] ?? 3)) : 0;
        return (
          <g key={i} opacity={enter} transform={`translate(0 ${(1 - enter) * 24})`}>
            {/* open-top container */}
            <path
              d={`M${x},${top} L${x},${top + bh} Q${x},${top + bh + 22} ${x + 22},${top + bh + 22} L${x + bw - 22},${top + bh + 22} Q${x + bw},${top + bh + 22} ${x + bw},${top + bh} L${x + bw},${top}`}
              fill="none" stroke={ink} strokeWidth={7} strokeLinecap="round" opacity={0.85}
            />
            <rect x={x} y={top + bh - 4} width={bw} height={26} fill={accent} opacity={0.16} />
            {/* tokens dropping in on a stagger */}
            {Array.from({ length: dots }).map((_, d) => {
              const start = 14 + i * 8 + (d - had) * 9;
              const fall = d < had ? 1 : clamp01((frame - start) / 20);
              const cy = interpolate(Easing.out(Easing.quad)(fall), [0, 1], [top - 70, top + bh - 40 - d * 34]);
              const cx = x + bw / 2 + (d % 2 === 0 ? -1 : 1) * (18 + (d % 3) * 14);
              return <circle key={d} cx={cx} cy={cy} r={16} fill={accent} opacity={fall > 0 ? 1 : 0} />;
            })}
            <FitText fit={fitLabel(lab, { maxW: bw, baseSize: 34, minSize: 17, maxLines: 2 })}
              x={x + bw / 2} y={top + bh + 66} fill={ink} />
          </g>
        );
      })}
    </g>
  );
};

// ── scorecard — a weighted decision that builds over continued beats (10x pilot A) ─
// criteria + who weighs them (weight bars) → options → each option's score per criterion (bars) → weight × score
// (each bar visibly shrinks to its product) summed into one total bar per option. scorecard.ts holds the state.
const Scorecard: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps, carry }) => {
  const sc = spec.scorecard;
  if (!sc || !sc.criteria || !sc.criteria.length) return <Title text={spec.title ?? "SCORECARD"} ink={ink} show={1} />;
  const prev = carry && carry.prev && carry.prev.type === "scorecard" ? (carry.prev.scorecard as Scorecard) : null;
  const st = scorecardState(sc as Scorecard, prev);
  const show = spring({ frame: shellFrame(carry, frame), fps, config: { damping: 16 } });
  const nC = st.criteria.length, nO = st.options.length;
  const headerY = 150;
  const step = nC <= 2 ? 170 : 124;
  const rowY = (i: number) => 262 + i * step;
  const totalY = rowY(nC - 1) + (nC <= 2 ? 130 : 108);
  const colX0 = 500, colX1 = VW - 10;
  const colW = nO ? (colX1 - colX0) / nO : 0;
  const colX = (j: number) => colX0 + colW * j + colW / 2;
  const trackW = Math.max(60, colW - 70);
  const WMAX = 330;
  const grow = (built: boolean, start: number, len = 22) => (built ? 1 : Easing.out(Easing.cubic)(clamp01((frame - start) / len)));
  const shrink = st.showTotals ? grow(st.totalsBuilt, 12, 28) : 0; // score → weight × score
  const totalGrow = st.showTotals ? grow(st.totalsBuilt, 42, 26) : 0;
  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={titleShowOf(carry, frame, fps, show)} />
      {/* criteria: who weighs what, and how much (bar length = weight) */}
      {st.criteria.map((c, i) => {
        const e = grow(c.built, 6 + i * 8, 20);
        const y = rowY(i);
        const lab = fitLabel(c.label, { maxW: 440, baseSize: 40, minSize: 22, maxLines: 2 });
        return (
          <g key={`c${i}`} opacity={e} transform={`translate(${(1 - e) * -30} 0)`}>
            {c.owner ? <FitText fit={fitLabel(c.owner.toUpperCase(), { maxW: 400, baseSize: 30, minSize: 18, maxLines: 1 })} x={36} y={y - 78} anchor="start" fill={accent} letterSpacing={2} /> : null}
            <FitText fit={lab} x={36} y={y - 34} anchor="start" fill={ink} />
            <rect x={36} y={y} width={Math.max(8, WMAX * c.weight * e)} height={44} rx={10} fill={ink} />
            {c.weightText ? <text x={36 + WMAX * c.weight * e + 14} y={y + 34} fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={36} fill={ink}>{c.weightText}</text> : null}
          </g>
        );
      })}
      {/* options: one column each */}
      {st.showOptions && st.options.map((o, j) => {
        const e = grow(o.built, 6 + j * 8, 18);
        const dim = st.winner != null && st.winner !== j ? 1 - 0.55 * totalGrow : 1;
        return (
          <g key={`o${j}`} opacity={e * dim}>
            <FitText fit={fitLabel(o.label.toUpperCase(), { maxW: colW - 20, baseSize: 44, minSize: 22, maxLines: 2 })} x={colX(j)} y={headerY} fill={ink} />
            {o.cells.map((cell, i) => {
              const y = rowY(i);
              const fill = st.showScores && cell.score != null ? (cell.score / 10) * grow(cell.built, 16 + j * 10 + i * 6, 24) : 0;
              // totals: the score bar shrinks to weight × score — the multiplication, seen
              const w = trackW * fill * (1 - shrink * (1 - st.criteria[i].weight));
              const x0 = colX(j) - trackW / 2;
              return (
                <g key={`s${i}`}>
                  {/* not graded yet: a dashed track with "?" — an empty solid track would read as a zero */}
                  <rect x={x0} y={y} width={trackW} height={44} rx={11} fill="none" stroke={ink} strokeWidth={4} opacity={0.5} strokeDasharray={cell.unknown ? "10 9" : undefined} />
                  {cell.unknown ? <text x={x0 + trackW / 2} y={y + 34} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={34} fill={ink} opacity={0.55}>?</text> : null}
                  {w > 0.5 ? <rect x={x0} y={y} width={w} height={44} rx={11} fill={accent} /> : null}
                  {st.showScores && cell.text ? (
                    <text x={x0 + trackW + 12} y={y + 36} fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={40} fill={accent}>{cell.text}</text>
                  ) : null}
                </g>
              );
            })}
            {st.showTotals && !o.totalKnown ? (
              // a total that depends on an ungraded criterion is not known yet: no bar, no comparison
              <g opacity={totalGrow}>
                <rect x={colX(j) - trackW / 2} y={totalY} width={trackW} height={56} rx={14} fill="none" stroke={ink} strokeWidth={4} strokeDasharray="12 10" opacity={0.55} />
                <text x={colX(j)} y={totalY + 42} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={40} fill={ink} opacity={0.6}>?</text>
              </g>
            ) : null}
            {st.showTotals && o.totalKnown ? (
              <g>
                {/* the scale: the best possible total — a total is read against it, never against the other bar alone */}
                <rect x={colX(j) - trackW / 2} y={totalY} width={trackW} height={56} rx={14} fill="none" stroke={ink} strokeWidth={4} opacity={0.35 * totalGrow} />
                <rect x={colX(j) - trackW / 2} y={totalY} width={trackW * (o.total / st.maxTotal) * totalGrow} height={56} rx={14} fill={st.winner === j ? accent : ink} />
                {st.winner === j && totalGrow > 0.95 ? (
                  <path d={`M${colX(j) + trackW / 2 + 16},${totalY + 24} l14,14 l26,-30`} fill="none" stroke={accent} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
                ) : null}
              </g>
            ) : null}
          </g>
        );
      })}
      {st.showTotals ? (
        <g opacity={totalGrow}>
          <line x1={colX0 + 10} y1={totalY - 22} x2={colX1 - 10} y2={totalY - 22} stroke={ink} strokeWidth={3} opacity={0.4} />
          <FitText fit={fitLabel("TOTAL", { maxW: 300, baseSize: 38, minSize: 20, maxLines: 1 })} x={36} y={totalY + 30} anchor="start" fill={ink} letterSpacing={2} />
        </g>
      ) : null}
    </g>
  );
};

// ── matchWave — two rhythms drift out of phase, then LOCK into sync ───────────
const MatchWave: React.FC<ArchProps> = ({ spec, accent, ink, frame, fps, durationFrames, carry, loop }) => {
  // carried: the two rhythms already locked last scene — they stay locked
  const t = carry ? 1 : clamp01((frame / Math.max(1, durationFrames) - 0.15) / 0.6);
  const mism = 1 - Easing.inOut(Easing.ease)(t); // 1 mismatched → 0 locked
  const midY = VH / 2 + 10;
  const amp = 92;
  const scroll = loop * 0.06;
  const path = (offset: number, freqMul: number, phase: number, yOff: number) => {
    let d = "";
    for (let px = 60; px <= VW - 60; px += 12) {
      const k = (px / (VW - 120)) * Math.PI * 2 * 2.2 * freqMul;
      const y = midY + yOff + Math.sin(k + phase + scroll) * amp;
      d += `${px === 60 ? "M" : "L"}${px.toFixed(1)},${y.toFixed(1)} `;
    }
    return d;
  };
  const show = spring({ frame: shellFrame(carry, frame), fps, config: { damping: 16 } });
  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={titleShowOf(carry, frame, fps, show)} />
      {/* wave A (steady reference) */}
      <path d={path(0, 1, 0, -34)} fill="none" stroke={ink} strokeWidth={8} strokeLinecap="round" opacity={0.85} />
      {/* wave B converges to A's frequency + phase as mism → 0 */}
      <path d={path(0, 1 + 0.55 * mism, mism * Math.PI, 34 - 34 * (1 - mism))} fill="none" stroke={accent} strokeWidth={8} strokeLinecap="round" />
      <g opacity={interpolate(mism, [0.05, 0.2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * newPartOf(carry, !carry || carry.labels[0], frame, fps)}>
        <FitText fit={fitLabel(spec.labels[0] || "IN SYNC", { maxW: VW - 160, baseSize: 40, minSize: 24, maxLines: 1 })}
          x={VW / 2} y={VH - 26} fill={accent} />
      </g>
    </g>
  );
};

// ── flow — cause → effect, a token travelling A → B (→ C) ─────────────────────
const Flow: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps, durationFrames, carry, loop: loopClock }) => {
  const nodes = spec.labels.length ? spec.labels.slice(0, 3) : ["CAUSE", "EFFECT"];
  const n = nodes.length;
  const y = VH / 2;
  const r = 92;
  // one node: centred, no arrow, no token (flowLayout.ts — a single-label flow crashed the render, 2026-10-26)
  const xs = flowNodeXs(n, r, VW);
  const show = spring({ frame: shellFrame(carry, frame), fps, config: { damping: 16 } });
  // token travels the whole chain, looping over the beat
  const loop = ((loopClock % Math.max(30, durationFrames)) / Math.max(30, durationFrames));
  const seg = Math.min(n - 2, Math.floor(loop * (n - 1)));
  const segT = clamp01(loop * (n - 1) - seg);
  // travel EDGE to EDGE along the connector, never through a node (which would
  // drag the token across the node's label).
  const tokenX = flowHasToken(n) ? interpolate(segT, [0, 1], [xs[seg] + r, (xs[seg + 1] ?? xs[seg]) - r]) : xs[0];
  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={titleShowOf(carry, frame, fps, show)} />
      {nodes.slice(0, n - 1).map((_, i) => {
        // an arrow between two carried nodes was already drawn
        const drawn = clamp01(((carry && carry.labels[i] && carry.labels[i + 1] ? SETTLED_FRAME : frame) - 12 - i * 8) / 14);
        return (
          <g key={`a${i}`}>
            <line x1={xs[i] + r} y1={y} x2={xs[i] + r + (xs[i + 1] - xs[i] - 2 * r) * drawn} y2={y}
              stroke={ink} strokeWidth={7} strokeLinecap="round" opacity={0.6} />
            {drawn > 0.9 && <path d={`M${xs[i + 1] - r - 4},${y - 12} L${xs[i + 1] - r + 10},${y} L${xs[i + 1] - r - 4},${y + 12}`} fill={ink} opacity={0.6} />}
          </g>
        );
      })}
      {nodes.map((lab, i) => {
        const enter = spring({ frame: builtFrame(carry, i, frame) - i * 10, fps, config: { damping: 14, stiffness: 130 } });
        // P3.2: each node owns the cell halfway to its neighbours, so two
        // labels can never meet. A short label stays inside the circle exactly
        // as before; anything that doesn't fit drops BELOW its node, wrapped
        // and clamped to the cell (was: one unwrapped line bursting a 184px
        // circle — "WILDLY INCONVENIENT MORAL PERMISSION" at 35 chars).
        const cellL = i === 0 ? 0 : (xs[i - 1] + xs[i]) / 2;
        const cellR = i === n - 1 ? VW : (xs[i] + xs[i + 1]) / 2;
        const inside = fitLabel(lab, { maxW: 2 * r - 24, baseSize: lab.length > 8 ? 30 : 38, minSize: 16, maxLines: 1 });
        const fitsInside = inside.lines.length === 1 && inside.width <= 2 * r - 24;
        const fit = fitsInside
          ? inside
          : fitLabel(lab, { maxW: cellR - cellL - 24, baseSize: 28, minSize: 15, maxLines: 2 });
        const lx = fitsInside
          ? xs[i]
          : Math.min(Math.max(xs[i], cellL + fit.width / 2 + 14), cellR - fit.width / 2 - 14);
        const ly = fitsInside ? y + 12 : y + r + 54;
        return (
          <g key={i}>
            <g opacity={enter} transform={`translate(${xs[i]} ${y}) scale(${enter})`}>
              <circle r={r} fill={paper} stroke={i === 0 ? ink : accent} strokeWidth={8} />
            </g>
            <g opacity={enter} transform={`translate(${lx} ${ly}) scale(${enter})`}>
              <FitText fit={fit} x={0} y={0} fill={ink} />
            </g>
          </g>
        );
      })}
      <circle cx={tokenX} cy={y} r={20} fill={accent} opacity={flowHasToken(n) && loopClock > 20 ? 1 : 0} />
    </g>
  );
};

// ── spectrum — a marker on a continuum between two poles ──────────────────────
const Spectrum: React.FC<ArchProps> = ({ spec, accent, ink, frame, fps, carry }) => {
  const y = VH / 2;
  const x0 = 120, x1 = VW - 120;
  const target = clamp01(spec.values?.[0] ?? 0.5);
  // carried: the marker starts where it stood last scene and only moves if its value changed
  const p = carry && carry.values[0] ? 1 : spring({ frame: frame - 12, fps, config: { damping: 13, stiffness: 90 } });
  const from = carry ? interpolate(clamp01(carry.prevValues[0] ?? 0.5), [0, 1], [x0, x1]) : (x0 + x1) / 2;
  const mx = interpolate(p, [0, 1], [from, interpolate(target, [0, 1], [x0, x1])]);
  const show = spring({ frame: shellFrame(carry, frame), fps, config: { damping: 16 } });
  const poles = spec.labels.length >= 2 ? spec.labels : ["LESS", "MORE"];
  // P3.2: each pole owns its half of the bar (outer-anchored, half-width
  // capped) — a 34-char pole can no longer run into its twin at the center
  // ("NIGHTMARE FUEL" | "ABSOLUTELY EVERYTHING THOUGHT TRUE" — screenshot 1).
  const halfW = VW / 2 - x0 - 20;
  const fitA = fitLabel(poles[0], { maxW: halfW, baseSize: 34, minSize: 17, maxLines: 2 });
  const fitB = fitLabel(poles[1], { maxW: halfW, baseSize: 34, minSize: 17, maxLines: 2 });
  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={titleShowOf(carry, frame, fps, show)} />
      <line x1={x0} y1={y} x2={x1} y2={y} stroke={ink} strokeWidth={8} strokeLinecap="round" opacity={0.4} />
      <line x1={x0} y1={y} x2={mx} y2={y} stroke={accent} strokeWidth={8} strokeLinecap="round" />
      {[x0, x1].map((x, i) => <circle key={i} cx={x} cy={y} r={12} fill={ink} opacity={0.5} />)}
      <g transform={`translate(${mx} ${y})`}>
        <circle r={26} fill={accent} />
        <circle r={26} fill="none" stroke={ink} strokeWidth={4} opacity={0.25} />
      </g>
      <Op o={newPartOf(carry, !carry || carry.labels[0], frame, fps)}><FitText fit={fitA} x={x0} y={y + 78} anchor="start" fill={ink} /></Op>
      <Op o={newPartOf(carry, !carry || carry.labels[1], frame, fps)}><FitText fit={fitB} x={x1} y={y + 78} anchor="end" fill={ink} /></Op>
    </g>
  );
};

// ── matrix — 2x2 grid (decision / prioritization / trade-off) ───────────────
const Matrix: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps, carry, loop }) => {
  const show = spring({ frame: shellFrame(carry, frame), fps, config: { damping: 16 } });
  const x0 = 180, x1 = VW - 180;
  const y0 = 120, y1 = VH - 60;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;

  const xAxis = spec.labels[0] || "EFFORT";
  const yAxis = spec.labels[1] || "IMPACT";
  const qLabels = [
    spec.labels[2] || "DO FIRST",
    spec.labels[3] || "SCHEDULE",
    spec.labels[4] || "DELEGATE",
    spec.labels[5] || "ELIMINATE",
  ];

  const qWidth = (x1 - x0) / 2 - 20;
  const qHeight = (y1 - y0) / 2 - 20;

  const quads = [
    { x: x0 + 10, y: y0 + 10, label: qLabels[0], hero: true },
    { x: midX + 10, y: y0 + 10, label: qLabels[1], hero: false },
    { x: x0 + 10, y: midY + 10, label: qLabels[2], hero: false },
    { x: midX + 10, y: midY + 10, label: qLabels[3], hero: false },
  ];

  const heroPulse = 1 + Math.sin(loop * 0.12) * 0.02;

  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={titleShowOf(carry, frame, fps, show)} />

      {/* Quadrant Boxes */}
      {quads.map((q, i) => {
        const enter = spring({ frame: builtFrame(carry, i + 2, frame) - 6 - i * 5, fps, config: { damping: 14, stiffness: 120 } });
        return (
          <g key={i} opacity={enter} transform={`translate(0 ${(1 - enter) * 16})`}>
            <rect
              x={q.x}
              y={q.y}
              width={qWidth}
              height={qHeight}
              rx={16}
              fill={q.hero ? accent : paper}
              fillOpacity={q.hero ? 0.22 : 0.6}
              stroke={q.hero ? accent : ink}
              strokeWidth={q.hero ? 6 : 3}
              strokeDasharray={q.hero ? "none" : "6,6"}
              opacity={q.hero ? 1 : 0.6}
              transform={q.hero ? `scale(${heroPulse})` : undefined}
              style={q.hero ? { transformOrigin: `${q.x + qWidth / 2}px ${q.y + qHeight / 2}px` } : undefined}
            />
            {q.hero && (
              <circle cx={q.x + 32} cy={q.y + 32} r={10} fill={accent} />
            )}
            <FitText
              fit={fitLabel(q.label, { maxW: qWidth - 24, baseSize: q.label.length > 12 ? 26 : 32, minSize: 15, maxLines: 2 })}
              x={q.x + qWidth / 2}
              y={q.y + qHeight / 2 + 10}
              fill={q.hero ? accent : ink}
            />
          </g>
        );
      })}

      {/* Central Axis Lines */}
      <line x1={x0} y1={midY} x2={x1} y2={midY} stroke={ink} strokeWidth={6} strokeLinecap="round" opacity={0.7} />
      <line x1={midX} y1={y1} x2={midX} y2={y0} stroke={ink} strokeWidth={6} strokeLinecap="round" opacity={0.7} />

      {/* Axis Arrows */}
      <path d={`M${x1 - 12},${midY - 8} L${x1 + 6},${midY} L${x1 - 12},${midY + 8}`} fill={ink} opacity={0.7} />
      <path d={`M${midX - 8},${y0 + 12} L${midX},${y0 - 6} L${midX + 8},${y0 + 12}`} fill={ink} opacity={0.7} />

      {/* Axis Labels */}
      <text x={x1 + 18} y={midY + 8} textAnchor="start" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={22} fill={ink} opacity={0.8}>
        {xAxis.toUpperCase()} →
      </text>
      <text x={midX} y={y0 - 18} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={22} fill={ink} opacity={0.8}>
        ↑ {yAxis.toUpperCase()}
      </text>
    </g>
  );
};

// ── tree — hierarchical branching tree / decomposition ───────────────────────
const Tree: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps, carry }) => {
  const show = spring({ frame: shellFrame(carry, frame), fps, config: { damping: 16 } });
  const labels = spec.labels.length >= 3 ? spec.labels : ["ROOT PRINCIPLE", "COMPONENT A", "COMPONENT B", "LEAF 1", "LEAF 2", "LEAF 3", "LEAF 4"];

  const root = { x: VW / 2, y: 130, label: labels[0] };
  const branches = [
    { x: VW / 2 - 260, y: 290, label: labels[1] || "PART A" },
    { x: VW / 2 + 260, y: 290, label: labels[2] || "PART B" },
  ];
  const leaves = [
    { x: VW / 2 - 380, y: 470, parent: 0, label: labels[3] || "ACTION 1" },
    { x: VW / 2 - 140, y: 470, parent: 0, label: labels[4] || "ACTION 2" },
    { x: VW / 2 + 140, y: 470, parent: 1, label: labels[5] || "ACTION 3" },
    { x: VW / 2 + 380, y: 470, parent: 1, label: labels[6] || "ACTION 4" },
  ];

  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={titleShowOf(carry, frame, fps, show)} />

      {/* Root to Branches Connectors */}
      {branches.map((b, i) => {
        const lineDraw = clamp01((builtFrame(carry, 1 + i, frame) - 10 - i * 6) / 16);
        const curX = root.x + (b.x - root.x) * lineDraw;
        const curY = root.y + (b.y - root.y) * lineDraw;
        return (
          <line
            key={`rb-${i}`}
            x1={root.x}
            y1={root.y + 40}
            x2={curX}
            y2={curY - 36}
            stroke={accent}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={lineDraw > 0 ? 0.75 : 0}
          />
        );
      })}

      {/* Branches to Leaves Connectors */}
      {leaves.map((l, i) => {
        const p = branches[l.parent];
        const lineDraw = clamp01((builtFrame(carry, 3 + i, frame) - 22 - i * 4) / 16);
        const curX = p.x + (l.x - p.x) * lineDraw;
        const curY = p.y + (l.y - p.y) * lineDraw;
        return (
          <line
            key={`bl-${i}`}
            x1={p.x}
            y1={p.y + 36}
            x2={curX}
            y2={curY - 28}
            stroke={ink}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={lineDraw > 0 ? 0.45 : 0}
          />
        );
      })}

      {/* Root Node */}
      {(() => {
        const enter = spring({ frame: builtFrame(carry, 0, frame) - 4, fps, config: { damping: 14, stiffness: 120 } });
        return (
          <g opacity={enter} transform={`translate(${root.x} ${root.y}) scale(${enter})`}>
            <rect x={-150} y={-40} width={300} height={80} rx={22} fill={accent} />
            {/* P3.2: labels wrap and shrink inside their box — a long root
                label no longer bursts the 300px rect */}
            <FitText fit={fitLabel(root.label, { maxW: 276, baseSize: 28, minSize: 14, maxLines: 2 })}
              x={0} y={10} fill="#FFFFFF" />
          </g>
        );
      })()}

      {/* Branch Nodes */}
      {branches.map((b, i) => {
        const enter = spring({ frame: builtFrame(carry, 1 + i, frame) - 16 - i * 6, fps, config: { damping: 14, stiffness: 120 } });
        return (
          <g key={`b-${i}`} opacity={enter} transform={`translate(${b.x} ${b.y}) scale(${enter})`}>
            <rect x={-130} y={-36} width={260} height={72} rx={18} fill={paper} stroke={accent} strokeWidth={6} />
            <FitText fit={fitLabel(b.label, { maxW: 236, baseSize: 24, minSize: 12, maxLines: 2 })}
              x={0} y={9} fill={ink} />
          </g>
        );
      })}

      {/* Leaf Nodes */}
      {leaves.map((l, i) => {
        const enter = spring({ frame: builtFrame(carry, 3 + i, frame) - 28 - i * 4, fps, config: { damping: 14, stiffness: 120 } });
        return (
          <g key={`l-${i}`} opacity={enter} transform={`translate(${l.x} ${l.y}) scale(${enter})`}>
            <rect x={-100} y={-28} width={200} height={56} rx={14} fill={paper} stroke={ink} strokeWidth={4} opacity={0.9} />
            <FitText fit={fitLabel(l.label, { maxW: 176, baseSize: 20, minSize: 11, maxLines: 2 })}
              x={0} y={8} fill={ink} />
          </g>
        );
      })}
    </g>
  );
};

// ── funnel — multi-stage distillation / conversion funnel ────────────────────
const Funnel: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps, carry, loop: loopClock }) => {
  const show = spring({ frame: shellFrame(carry, frame), fps, config: { damping: 16 } });
  const labels = spec.labels.length >= 2 ? spec.labels : ["1000 ATTEMPTS", "100 EXPERIMENTS", "10 WINNERS", "1 SCALE"];
  const stages = Math.min(4, labels.length);
  const cx = VW / 2;
  const startY = 130;
  const stageH = 80;
  const stageGap = 16;

  const widths = [
    { top: 880, btm: 700 },
    { top: 680, btm: 500 },
    { top: 480, btm: 300 },
    { top: 280, btm: 140 },
  ];

  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={titleShowOf(carry, frame, fps, show)} />

      {labels.slice(0, stages).map((lab, i) => {
        const enter = spring({ frame: builtFrame(carry, i, frame) - 6 - i * 7, fps, config: { damping: 14, stiffness: 120 } });
        const y = startY + i * (stageH + stageGap);
        const w = widths[i] || { top: 300, btm: 150 };
        const isLast = (i === stages - 1);

        const p1 = `${cx - w.top / 2},${y}`;
        const p2 = `${cx + w.top / 2},${y}`;
        const p3 = `${cx + w.btm / 2},${y + stageH}`;
        const p4 = `${cx - w.btm / 2},${y + stageH}`;
        const points = `${p1} ${p2} ${p3} ${p4}`;

        const val = spec.values?.[i];

        return (
          <g key={i} opacity={enter} transform={`translate(0 ${(1 - enter) * 20})`}>
            <polygon
              points={points}
              fill={isLast ? accent : paper}
              fillOpacity={isLast ? 0.95 : 0.75}
              stroke={isLast ? accent : ink}
              strokeWidth={5}
              strokeLinejoin="round"
            />
            {/* P3.2: the label is fitted to the trapezoid's NARROW edge (its
                worst-case width), wrapped and centered in the stage */}
            <FitText
              fit={fitLabel(lab, { maxW: Math.max(120, w.btm - 40), baseSize: lab.length > 14 ? 24 : 30, minSize: 14, maxLines: 2 })}
              x={cx}
              y={y + stageH / 2 + 8}
              fill={isLast ? "#FFFFFF" : ink}
            />
            {val !== undefined && (
              <g transform={`translate(${cx + w.top / 2 + 30} ${y + stageH / 2})`} opacity={carry && carry.labels[i] && !carry.values[i] ? spring({ frame, fps, config: { damping: 16 } }) : undefined}>
                <rect x={-36} y={-18} width={72} height={36} rx={18} fill={accent} opacity={0.9} />
                <text y={7} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={18} fill="#FFFFFF">
                  {val}%
                </text>
              </g>
            )}
          </g>
        );
      })}

      {(() => {
        const loop = (loopClock % 45) / 45;
        const py = interpolate(loop, [0, 1], [startY, startY + stages * (stageH + stageGap) + 30]);
        return <circle cx={cx} cy={py} r={10} fill={accent} opacity={loopClock > 20 ? 0.85 : 0} />;
      })()}
    </g>
  );
};

// ── refute — a claim put forward, rejected ON the narration's word, explained, replaced (10x P2, refute.ts) ──
// Everything drawn comes from refuteState(spec, frame): the claim bubble (in colour until the rejecting word, then grey,
// stamped and moved to the corner — still labelled), the WHY (a one-slot gate on the hub) and the correct model in the
// same parts (a single spotlight hopping input to input). No strike-through anywhere.
const mixHex = (a: string, b: string, t: number) => {
  const h = (c: string) => { const m = c.replace("#", ""); const f = m.length === 3 ? m.split("").map((x) => x + x).join("") : m; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
  const x = h(a), y = h(b);
  if ([...x, ...y].some((v) => Number.isNaN(v))) return a;
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
};
const REJ = "#C62D3F";
const Refute: React.FC<ArchProps> = ({ spec, accent, ink, frame }) => {
  const r = spec.refute as Refute | undefined;
  if (!r || !r.inputs || !r.inputs.length) return <Title text={spec.title ?? "CLAIM"} ink={ink} show={1} />;
  const st = refuteState(r, frame);
  const P = st.p;
  const GREY = "#9C988F";
  const cAccent = mixHex(accent.startsWith("#") ? accent : "#E8572A", GREY, st.grey);
  const cInk = mixHex(ink.startsWith("#") ? ink : "#1E1E22", "#77746D", st.grey);
  const n = r.inputs.length;
  // ── the claim panel (bubble 140..1060 x 70..470); after the rejection it shrinks into the top-left corner ──
  const k = 1 - 0.5 * st.corner;
  const ox = 140 - 120 * st.corner, oy = 70 - 40 * st.corner; // where the bubble's top-left lands
  const inY = (i: number) => 160 + (i * 260) / Math.max(1, n - 1);
  const outH = 230 * P.result * (1 - st.grey);
  const claim = (
    <g transform={`translate(${ox} ${oy}) scale(${k}) translate(-140 -70)`}>
      <rect x={140} y={70} width={920} height={400} rx={36} fill="#FFFFFF" fillOpacity={0.55} stroke={cInk} strokeWidth={5} strokeDasharray="22 14" />
      <path d="M210,470 L180,530 L270,470 Z" fill="#FFFFFF" fillOpacity={0.55} stroke={cInk} strokeWidth={5} />
      <FitText fit={fitLabel(r.owner.toUpperCase(), { maxW: 560, baseSize: 34, minSize: 20, maxLines: 1 })} x={170} y={44} anchor="start" fill={cAccent} letterSpacing={2} />
      <rect x={860} y={18} width={190} height={50} rx={25} fill={st.chip === "REJECTED" ? REJ : st.chip === "?" ? "#E0A33A" : cInk} />
      <text x={955} y={53} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={st.chip === "REJECTED" ? 26 : 30} fill="#FFFFFF">{st.chip}</text>
      {r.inputs.map((lab, i) => (
        <g key={`ci${i}`}>
          <rect x={180} y={inY(i) - 34} width={200} height={68} rx={16} fill={cAccent} opacity={0.92} />
          <FitText fit={fitLabel(lab.toUpperCase(), { maxW: 180, baseSize: 30, minSize: 16, maxLines: 1 })} x={280} y={inY(i)} fill="#FFFFFF" />
          {/* all inputs flow into the hub AT ONCE: the claim's own model */}
          <line x1={380} y1={inY(i)} x2={380 + (530 - 380) * P.links} y2={inY(i) + (290 - inY(i)) * P.links} stroke={cInk} strokeWidth={8} strokeLinecap="round" opacity={P.links > 0 ? 1 : 0} />
        </g>
      ))}
      <circle cx={600} cy={290} r={78} fill={cInk} />
      <FitText fit={fitLabel(r.hub.toUpperCase(), { maxW: 130, baseSize: 30, minSize: 16, maxLines: 1 })} x={600} y={290} fill="#FFFFFF" />
      {P.doubt > 0 && st.grey === 0 ? <text x={600} y={190} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={900} fontSize={84 * P.doubt} fill="#E0A33A">?</text> : null}
      <line x1={678} y1={290} x2={840} y2={290} stroke={cInk} strokeWidth={8} opacity={P.links} />
      {/* the claimed output: a bar that rises; after the rejection it empties to a dashed outline */}
      <rect x={850} y={180} width={150} height={230} rx={14} fill="none" stroke={cInk} strokeWidth={5} strokeDasharray={st.grey > 0 ? "14 10" : undefined} opacity={P.result} />
      <rect x={850} y={410 - outH} width={150} height={outH} rx={14} fill={cAccent} />
      <FitText fit={fitLabel((r.output || "OUTPUT").toUpperCase(), { maxW: 190, baseSize: 26, minSize: 16, maxLines: 1 })} x={925} y={440} fill={cInk} />
      {P.result > 0 ? <FitText fit={fitLabel(r.claim.toUpperCase(), { maxW: 860, baseSize: 40, minSize: 22, maxLines: 1 })} x={600} y={520} fill={cInk} /> : null}
      {P.illusion > 0 && r.illusion ? <FitText fit={fitLabel(r.illusion.toUpperCase(), { maxW: 240, baseSize: 24, minSize: 14, maxLines: 2 })} x={925} y={150} fill={REJ} /> : null}
      {/* the verdict: a stamp ON the claim — readable words, no strike-through */}
      {st.grey > 0 ? (
        <g transform={`translate(600 270) rotate(-8) scale(${0.6 + 0.4 * st.grey})`} opacity={st.grey}>
          <rect x={-330} y={-58} width={660} height={116} rx={18} fill="#FFFFFF" fillOpacity={0.9} stroke={REJ} strokeWidth={10} />
          <FitText fit={fitLabel(r.verdict.toUpperCase(), { maxW: 600, baseSize: 56, minSize: 26, maxLines: 1 })} x={0} y={0} fill={REJ} />
        </g>
      ) : null}
      {P.reason > 0 && st.grey > 0 ? <FitText fit={fitLabel(`WHY: ${r.reason}`.toUpperCase(), { maxW: 880, baseSize: 40, minSize: 22, maxLines: 1 })} x={600} y={575} fill={REJ} /> : null}
    </g>
  );
  // ── the correct model (right side, after the rejection): the same parts, ONE input at a time ──
  const tIn = (i: number) => 200 + (i * 300) / Math.max(1, n - 1);
  const hubX = 1000, hubY = 350;
  const shown = Math.max(P.truth, P.reason);
  const truth = shown > 0 ? (
    <g opacity={shown}>
      {P.truth > 0 ? <FitText fit={fitLabel(r.truth.toUpperCase(), { maxW: 700, baseSize: 40, minSize: 22, maxLines: 2 })} x={840} y={110} fill={ink} /> : null}
      {r.inputs.map((lab, i) => {
        const lit = st.spot === i ? st.spotOn : 0;
        return (
          <g key={`ti${i}`} opacity={P.off > 0 && i === 0 ? 1 - 0.65 * P.off : 1}>
            <rect x={560} y={tIn(i) - 34} width={210} height={68} rx={16} fill={lit > 0 ? accent : "#FFFFFF"} stroke={ink} strokeWidth={5} />
            <FitText fit={fitLabel(lab.toUpperCase(), { maxW: 190, baseSize: 30, minSize: 16, maxLines: 1 })} x={665} y={tIn(i)} fill={lit > 0 ? "#FFFFFF" : ink} />
          </g>
        );
      })}
      <circle cx={hubX} cy={hubY} r={78} fill={ink} />
      <FitText fit={fitLabel(r.hub.toUpperCase(), { maxW: 130, baseSize: 30, minSize: 16, maxLines: 1 })} x={hubX} y={hubY} fill="#FFFFFF" />
      {/* ONE beam from the hub to the input it is on (it rests on the hub until the run starts) */}
      {st.spot >= 0 ? <path d={`M${hubX - 70},${hubY - 22} L770,${tIn(st.spot) - 34} L770,${tIn(st.spot) + 34} L${hubX - 70},${hubY + 22} Z`} fill="#FFD75E" opacity={0.55 * st.spotOn} /> : P.truth > 0 ? <circle cx={hubX} cy={hubY} r={104} fill="none" stroke="#FFD75E" strokeWidth={14} opacity={0.8 * P.truth} /> : null}
      {/* WHY: a one-slot gate on the hub — one input passes, the others bounce off */}
      {P.reason > 0 ? (
        <g opacity={P.reason}>
          <rect x={hubX - 120} y={hubY - 120} width={22} height={240} rx={8} fill={REJ} />
          <rect x={hubX - 124} y={hubY - 18} width={30} height={36} rx={6} fill="#FFFFFF" />
          <FitText fit={fitLabel(r.reason.toUpperCase(), { maxW: 360, baseSize: 30, minSize: 18, maxLines: 2 })} x={hubX - 10} y={hubY + 150} fill={REJ} />
        </g>
      ) : null}
      {P.bounce > 0 && P.run === 0 ? r.inputs.map((_, i) => {
        const pass = i === 0, t = Math.min(1, P.bounce * 1.4);
        const x2 = 770 + (hubX - 130 - 770) * (pass ? t : Math.min(t, 0.85));
        const back = pass ? 0 : Math.max(0, P.bounce * 1.4 - 0.85) * 120;
        return <line key={`b${i}`} x1={770} y1={tIn(i)} x2={x2 - back} y2={tIn(i) + (hubY - tIn(i)) * t * 0.9} stroke={pass ? accent : GREY} strokeWidth={7} strokeLinecap="round" />;
      }) : null}
      {P.ring > 0 ? (
        <g>
          <circle cx={665} cy={tIn(0)} r={74} fill="none" stroke={accent} strokeWidth={8} strokeDasharray={`${465 * P.ring} 465`} transform={`rotate(-90 665 ${tIn(0)})`} />
          <text x={790} y={tIn(0) - 44} fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={26} fill={accent}>2 SEC</text>
        </g>
      ) : null}
      {P.off > 0 ? <text x={665} y={tIn(0) + 70} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={26} fill="#77746D" opacity={P.off}>DISENGAGE</text> : null}
    </g>
  ) : null;
  return <g>{claim}{truth}</g>;
};

// ── MECHANISM (10x P1, mechanism.ts): cause -> mechanism -> effect. Two columns = two trials of the same outcome,
// each a stack of its factors. The persisting factor slides across UNCHANGED ("SAME"), the drawn-again factors land at
// a new level (a die rolls), the dashed line is the total at normal levels, the arrow shows where the total went.
const MECH_TINTS = ["#6FA3D8", "#E8B04A", "#9C7FD0", "#5DB88F"];
const smooth = (t: number) => t * t * (3 - 2 * t);
const Mechanism: React.FC<ArchProps> = ({ spec, accent, ink, frame }) => {
  const m = spec.mechanism as Mechanism | undefined;
  if (!m || !m.factors || !m.trials || !m.trials.length) return <Title text={spec.title ?? "WHY"} ink={ink} show={1} />;
  const P = mechanismState(m, frame).p;
  const G = 548, W = 200, C1 = 360, C2 = 830; // ground line, column width, column centres
  const two = m.trials.length > 1;
  const pos = (t: number) => stackOf(m, t).reduce((s, b) => s + Math.max(0, b.h), 0);
  const maxPos = Math.max(pos(0), two ? pos(1) : 0, averageTotal(m), 1);
  const S = Math.min(1.5, 420 / maxPos);
  const drawnAgain = (k: number) => !m.factors[k].persists;
  const tint = (k: number) => (m.factors[k].persists ? accent : MECH_TINTS[k % MECH_TINTS.length]);
  type Blk = { k: number; persists: boolean; h: number; y: number; minus: boolean; top: number };
  // blocks of a trial with their pixel extents (bottom-up; a "minus" block hangs down from the top: luck taking away)
  const layout = (t: number): Blk[] => {
    let top = G;
    return stackOf(m, t).map((b) => {
      const h = Math.abs(b.h) * S;
      const y = b.h >= 0 ? top - h : top;
      top = b.h >= 0 ? top - h : top + h;
      return { k: b.k, persists: b.persists, h, y, minus: b.h < 0, top };
    });
  };
  const L1 = layout(0), L2 = two ? layout(1) : [];
  const topOf = (L: Blk[]) => (L.length ? L[L.length - 1].top : G);
  const avgY = G - averageTotal(m) * S;
  const block = (b: Blk, cx: number, grow: number, key: string, labelSide: "left" | "right" | "in") => {
    if (grow <= 0 || b.h <= 0) return null;
    const hh = b.h * grow;
    const y = b.minus ? b.y : b.y + b.h - hh;
    const f = m.factors[b.k];
    const lab = fitLabel(f.label.toUpperCase(), { maxW: labelSide === "in" ? W - 20 : 220, baseSize: 30, minSize: 16, maxLines: 1 });
    const inside = labelSide === "in" || hh >= 46;
    if (b.minus) {
      // bad luck TAKES AWAY from the RESULT, never from the skill: the skill block stays whole; a red "−" bar BESIDE the
      // column pulls the jump's total line down below the skill's top (blind v2: a cut-out ON the skill block read as
      // "the crosswind damaged his skill")
      const bx = cx + W / 2 + 14;
      return (
        <g key={key}>
          <rect x={bx} y={y} width={44} height={hh} rx={8} fill="url(#mechHatchRed)" stroke={REJ} strokeWidth={4} strokeDasharray="12 8" />
          <path d={`M${bx + 22},${y + 10} V${y + hh - 16} m-12,-4 l12,16 l12,-16`} fill="none" stroke={REJ} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          <line x1={cx - W / 2 - 16} y1={y + hh} x2={bx + 44} y2={y + hh} stroke={REJ} strokeWidth={7} strokeLinecap="round" />
          {/* the label sits LEFT of the column: the right side is the next trial's lane (v3: it ran under the next column) */}
          <FitText fit={fitLabel(`− ${f.label.toUpperCase()}`, { maxW: 230, baseSize: 30, minSize: 16, maxLines: 1 })} x={cx - W / 2 - 20} y={y + hh / 2 + 10} anchor="end" fill={REJ} />
        </g>
      );
    }
    return (
      <g key={key}>
        <rect x={cx - W / 2} y={y} width={W} height={hh} rx={10} fill={tint(b.k)} fillOpacity={0.95} stroke={ink} strokeWidth={4} />
        {drawnAgain(b.k) ? <rect x={cx - W / 2} y={y} width={W} height={hh} rx={10} fill="url(#mechHatch)" opacity={0.5} /> : null}
        {inside && hh >= 30
          ? <FitText fit={lab} x={cx} y={y + hh / 2 + lab.size * 0.35} fill={f.persists ? "#FFFFFF" : ink} />
          : <FitText fit={lab} x={labelSide === "left" ? cx - W / 2 - 14 : cx + W / 2 + 14} y={y + hh / 2 + lab.size * 0.35} anchor={labelSide === "left" ? "end" : "start"} fill={ink} />}
      </g>
    );
  };
  // a trial whose causes are not named yet is a QUESTION ("think about what a phenomenal jump actually is"): a dashed
  // empty column with "?" — never an empty stage, never a guessed stack
  const col = (cx: number, show: number, label: string, key: string, empty: boolean) => (show > 0 ? (
    <g key={key} opacity={show}>
      {empty ? (
        <g>
          <rect x={cx - W / 2} y={G - 300} width={W} height={300} rx={14} fill="none" stroke={ink} strokeWidth={4} strokeDasharray="16 12" opacity={0.6} />
          <text x={cx} y={G - 120} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={900} fontSize={110} fill={ink} opacity={0.75}>?</text>
        </g>
      ) : null}
      <line x1={cx - W / 2 - 24} y1={G} x2={cx + W / 2 + 24} y2={G} stroke={ink} strokeWidth={6} strokeLinecap="round" />
      <FitText fit={fitLabel(label.toUpperCase(), { maxW: 360, baseSize: 32, minSize: 18, maxLines: 1 })} x={cx} y={G + 46} fill={ink} />
    </g>
  ) : null);
  // trial 1: each factor on its own word
  const t1 = L1.map((b) => block(b, C1, smooth(P[factorEl(b.k)]), `a${b.k}`, "left"));
  // the bracket naming the drawn-again blocks of trial 1
  const again1 = L1.filter((b) => drawnAgain(b.k) && !b.minus && P[factorEl(b.k)] > 0);
  const gTop = again1.length ? Math.min(...again1.map((b) => b.y)) : 0, gBot = again1.length ? Math.max(...again1.map((b) => b.y + b.h)) : 0;
  const bracket = P.group > 0 && m.group && again1.length ? (
    <g opacity={P.group}>
      <path d={`M${C1 + W / 2 + 14},${gTop + 4} h18 V${gBot - 4} h-18`} fill="none" stroke={ink} strokeWidth={5} strokeLinejoin="round" />
      <FitText fit={fitLabel(m.group.toUpperCase(), { maxW: 200, baseSize: 34, minSize: 18, maxLines: 1 })} x={C1 + W / 2 + 44} y={(gTop + gBot) / 2 + 12} anchor="start" fill={ink} />
    </g>
  ) : null;
  // trial 2: the persisting blocks arrive by sliding across (carry), the others by the redraw
  const q = smooth(P.carry);
  const carried = two && q > 0 ? L1.filter((b) => b.persists).map((b) => {
    const b2 = L2.find((x) => x.k === b.k);
    if (!b2) return null;
    const x = C1 + (C2 - C1) * q, y = b.y + (b2.y - b.y) * q - 70 * Math.sin(Math.PI * q);
    return (
      <g key={`c${b.k}`}>
        {block({ ...b2, y }, x, 1, `cb${b.k}`, q >= 1 ? "in" : "in")}
        {q >= 1 ? <text x={C2 + W / 2 + 16} y={b2.y + b2.h / 2 + 12} fontFamily="Poppins, Arial, sans-serif" fontWeight={900} fontSize={30} fill={ink}>SAME</text> : null}
        {q >= 1 ? <text x={(C1 + C2) / 2} y={b2.y + b2.h / 2 + 22} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={900} fontSize={64} fill={ink}>=</text> : null}
      </g>
    );
  }) : null;
  // the stack is a SUM: a "+" on every boundary between two settled blocks (blind v2: a bare stack read as "skill
  // supports wind supports timing" — a dependency the narration never states)
  const plus = (L: Blk[], cx: number, settled: (b: Blk) => boolean, key: string) => L.map((b, i) => {
    if (i === 0 || b.minus || L[i - 1].minus || !settled(b) || !settled(L[i - 1])) return null;
    const y = b.y + b.h;
    return (
      <g key={`${key}${i}`}>
        <circle cx={cx - W / 2} cy={y} r={17} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
        <text x={cx - W / 2} y={y + 11} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={900} fontSize={32} fill={ink}>+</text>
      </g>
    );
  });
  const r = P.redraw;
  const t2 = two ? L2.filter((b) => !b.persists).map((b) => block(b, C2, smooth(r), `b${b.k}`, "right")) : null;
  const die = two && r > 0 && r < 1 ? (
    <g transform={`translate(${C2} ${topOf(L2) - 80}) rotate(${r * 540})`} opacity={1 - Math.max(0, r - 0.8) * 5}>
      <rect x={-34} y={-34} width={68} height={68} rx={14} fill="#FFFFFF" stroke={ink} strokeWidth={5} />
      {[[-14, -14], [14, 14], [0, 0], [14, -14], [-14, 14]].map(([dx, dy], i) => <circle key={i} cx={dx} cy={dy} r={6} fill={ink} />)}
    </g>
  ) : null;
  const x0 = C1 - W / 2 - 40, x1 = C2 + W / 2 + 40;
  const avg = P.average > 0 ? (
    <g opacity={P.average}>
      <line x1={x0} y1={avgY} x2={x0 + (x1 - x0) * smooth(P.average)} y2={avgY} stroke={ink} strokeWidth={5} strokeDasharray="18 12" />
      {m.average ? <FitText fit={fitLabel(m.average.toUpperCase(), { maxW: 230, baseSize: 28, minSize: 16, maxLines: 1 })} x={x1 + 8} y={avgY + 10} anchor="start" fill={ink} /> : null}
    </g>
  ) : null;
  const top1 = topOf(L1), top2 = topOf(L2);
  const s = smooth(P.settle);
  const settle = two && P.settle > 0 ? (
    <g>
      <path d={`M${C1 + W / 2 - 10},${top1 - 14} C${C1 + W / 2 + 120},${top1 - 60} ${C2 - W / 2 - 120},${top2 - 60} ${C2 - W / 2 + 10},${top2 - 14}`} fill="none" stroke={accent} strokeWidth={8} strokeLinecap="round"
        pathLength={1} strokeDasharray={`${s} 1`} />
      {s >= 1 ? <path d={`M${C2 - W / 2 + 10},${top2 - 14} l-26,-16 l6,26 z`} fill={accent} /> : null}
      <line x1={C2 - W / 2 - 10} y1={top2} x2={C2 + W / 2 + 10} y2={top2} stroke={accent} strokeWidth={8} opacity={s} />
      {m.result && s > 0.5 ? <FitText fit={fitLabel(m.result.toUpperCase(), { maxW: 560, baseSize: 36, minSize: 20, maxLines: 2 })} x={(C1 + C2) / 2} y={Math.max(96, Math.min(top1, top2) - 96)} fill={accent} /> : null}
    </g>
  ) : null;
  return (
    <g>
      <defs>
        <pattern id="mechHatch" width={18} height={18} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={18} stroke={ink} strokeWidth={4} opacity={0.45} />
        </pattern>
        <pattern id="mechHatchRed" width={18} height={18} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={18} stroke={REJ} strokeWidth={4} opacity={0.5} />
        </pattern>
      </defs>
      {/* the outcome's name lives in the column labels ("A PHENOMENAL JUMP"); a corner title sat under the HUD at scale 1.3 */}
      {col(C1, P.trial1, m.trials[0].label, "k1", m.factors.every((_, k) => P[factorEl(k)] === 0))}
      {two ? col(C2, P.trial2, m.trials[1].label, "k2", P.carry === 0 && P.redraw === 0) : null}
      {avg}
      {t1}
      {bracket}
      {carried}
      {t2}
      {plus(L1, C1, (b) => P[factorEl(b.k)] >= 1, "p1")}
      {two ? plus(L2, C2, (b) => (b.persists ? P.carry >= 1 : P.redraw >= 1), "p2") : null}
      {die}
      {settle}
    </g>
  );
};

const ARCH: Record<DiagramSpec["type"], React.FC<ArchProps>> = {
  sorter: Sorter,
  matchWave: MatchWave,
  flow: Flow,
  spectrum: Spectrum,
  matrix: Matrix,
  tree: Tree,
  funnel: Funnel,
  scorecard: Scorecard,
  refute: Refute,
  mechanism: Mechanism,
  // MECHANISM 2.0 (causal.ts): the causal chain — stations, the carried token, its relabel, contrast, loop
  causal: ({ spec, accent, ink, frame }) => ((spec as { causal?: { ledger?: unknown } }).causal?.ledger
    ? <CausalLoop spec={spec} accent={accent} ink={ink} frame={frame} />   // MECHANISM 3.0: a loop with a lap ledger
    : <CausalChain spec={spec} accent={accent} ink={ink} frame={frame} />),
};

/**
 * Diagram — places one archetype at its stage anchor. `frame` is local (frames
 * since the diagram appeared); the parent (Scene) handles the depth plane.
 */
export const Diagram: React.FC<{
  spec: DiagramSpec; accent: string; ink: string; paper: string; frame: number; fps: number; durationFrames: number;
  /** AUTHORED CONTINUATION (continuity.ts): the parts already built last scene */
  carry?: DiagramCarry | null;
  /** clock of the endless loops when carried (defaults to `frame`) */
  loopFrame?: number;
}> = ({ spec, accent, ink, paper, frame, fps, durationFrames, carry, loopFrame }) => {
  const Arch = ARCH[spec.type] ?? Sorter;
  const scale = spec.scale ?? 1;
  const cx = spec.x ?? 960;
  const cy = spec.y ?? 486; // biased up, clear of the caption band
  const w = VW * scale;
  const h = VH * scale;
  return (
    <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%, -50%)", filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.12))" }}>
      <svg width={w} height={h} viewBox={`0 0 ${VW} ${VH}`} style={{ overflow: "visible" }}>
        <Arch spec={spec} accent={accent} ink={ink} paper={paper} frame={frame} fps={fps} durationFrames={durationFrames} carry={carry} loop={loopFrame ?? frame} />
      </svg>
    </div>
  );
};
