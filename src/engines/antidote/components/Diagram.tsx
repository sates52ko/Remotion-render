import React from "react";
import { interpolate, spring, Easing } from "remotion";
import type { DiagramSpec } from "../schema";
import { fitLabel, DIAGRAM_VW as VW, DIAGRAM_VH as VH, type FittedLabel } from "../labelFit";
import { builtFrame, shellFrame, SETTLED_FRAME, type DiagramCarry } from "../continuity";

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
  const xs = nodes.map((_, i) => interpolate(i, [0, n - 1], [60 + r, VW - 60 - r]));
  const show = spring({ frame: shellFrame(carry, frame), fps, config: { damping: 16 } });
  // token travels the whole chain, looping over the beat
  const loop = ((loopClock % Math.max(30, durationFrames)) / Math.max(30, durationFrames));
  const seg = Math.min(n - 2, Math.floor(loop * (n - 1)));
  const segT = clamp01(loop * (n - 1) - seg);
  // travel EDGE to EDGE along the connector, never through a node (which would
  // drag the token across the node's label).
  const tokenX = interpolate(segT, [0, 1], [xs[seg] + r, (xs[seg + 1] ?? xs[seg]) - r]);
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
      <circle cx={tokenX} cy={y} r={20} fill={accent} opacity={loopClock > 20 ? 1 : 0} />
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

const ARCH: Record<DiagramSpec["type"], React.FC<ArchProps>> = {
  sorter: Sorter,
  matchWave: MatchWave,
  flow: Flow,
  spectrum: Spectrum,
  matrix: Matrix,
  tree: Tree,
  funnel: Funnel,
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
