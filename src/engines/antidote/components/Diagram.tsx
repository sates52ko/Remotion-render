import React from "react";
import { interpolate, spring, Easing } from "remotion";
import type { DiagramSpec } from "../schema";

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
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// viewBox the archetypes draw into; the parent scales it to the stage.
const VW = 1200;
const VH = 620;

type ArchProps = {
  spec: DiagramSpec;
  accent: string;
  ink: string;
  paper: string;
  frame: number; // local frames since the diagram appeared
  fps: number;
  durationFrames: number;
};

const Title: React.FC<{ text?: string; ink: string; show: number }> = ({ text, ink, show }) =>
  text ? (
    <text x={VW / 2} y={54} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800}
      fontSize={46} fill={ink} opacity={show} letterSpacing={1}>
      {text.toUpperCase()}
    </text>
  ) : null;

// ── sorter — items route into N labelled buckets (a taxonomy / classification) ─
const Sorter: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps }) => {
  const labels = spec.labels.length ? spec.labels.slice(0, 4) : ["ONE", "TWO", "THREE"];
  const n = labels.length;
  const gap = 44;
  const totalW = VW - 120;
  const bw = (totalW - gap * (n - 1)) / n;
  const top = 210;
  const bh = 300;
  const show = spring({ frame, fps, config: { damping: 16 } });
  return (
    <g>
      <Title text={spec.title} ink={ink} show={show} />
      {labels.map((lab, i) => {
        const x = 60 + i * (bw + gap);
        const enter = spring({ frame: frame - i * 6, fps, config: { damping: 15, stiffness: 120 } });
        const dots = Math.max(1, Math.min(6, spec.values?.[i] ?? 3));
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
              const start = 14 + i * 8 + d * 9;
              const fall = clamp01((frame - start) / 20);
              const cy = interpolate(Easing.out(Easing.quad)(fall), [0, 1], [top - 70, top + bh - 40 - d * 34]);
              const cx = x + bw / 2 + (d % 2 === 0 ? -1 : 1) * (18 + (d % 3) * 14);
              return <circle key={d} cx={cx} cy={cy} r={16} fill={accent} opacity={fall > 0 ? 1 : 0} />;
            })}
            <text x={x + bw / 2} y={top + bh + 66} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif"
              fontWeight={800} fontSize={34} fill={ink}>{lab.toUpperCase()}</text>
          </g>
        );
      })}
    </g>
  );
};

// ── matchWave — two rhythms drift out of phase, then LOCK into sync ───────────
const MatchWave: React.FC<ArchProps> = ({ spec, accent, ink, frame, fps, durationFrames }) => {
  const t = clamp01((frame / Math.max(1, durationFrames) - 0.15) / 0.6);
  const mism = 1 - Easing.inOut(Easing.ease)(t); // 1 mismatched → 0 locked
  const midY = VH / 2 + 10;
  const amp = 92;
  const scroll = frame * 0.06;
  const path = (offset: number, freqMul: number, phase: number, yOff: number) => {
    let d = "";
    for (let px = 60; px <= VW - 60; px += 12) {
      const k = (px / (VW - 120)) * Math.PI * 2 * 2.2 * freqMul;
      const y = midY + yOff + Math.sin(k + phase + scroll) * amp;
      d += `${px === 60 ? "M" : "L"}${px.toFixed(1)},${y.toFixed(1)} `;
    }
    return d;
  };
  const show = spring({ frame, fps, config: { damping: 16 } });
  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={show} />
      {/* wave A (steady reference) */}
      <path d={path(0, 1, 0, -34)} fill="none" stroke={ink} strokeWidth={8} strokeLinecap="round" opacity={0.85} />
      {/* wave B converges to A's frequency + phase as mism → 0 */}
      <path d={path(0, 1 + 0.55 * mism, mism * Math.PI, 34 - 34 * (1 - mism))} fill="none" stroke={accent} strokeWidth={8} strokeLinecap="round" />
      <text x={VW / 2} y={VH - 26} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800}
        fontSize={40} fill={accent} opacity={interpolate(mism, [0.05, 0.2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}>
        {(spec.labels[0] || "IN SYNC").toUpperCase()}
      </text>
    </g>
  );
};

// ── flow — cause → effect, a token travelling A → B (→ C) ─────────────────────
const Flow: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps, durationFrames }) => {
  const nodes = spec.labels.length ? spec.labels.slice(0, 3) : ["CAUSE", "EFFECT"];
  const n = nodes.length;
  const y = VH / 2;
  const r = 92;
  const xs = nodes.map((_, i) => interpolate(i, [0, n - 1], [60 + r, VW - 60 - r]));
  const show = spring({ frame, fps, config: { damping: 16 } });
  // token travels the whole chain, looping over the beat
  const loop = ((frame % Math.max(30, durationFrames)) / Math.max(30, durationFrames));
  const seg = Math.min(n - 2, Math.floor(loop * (n - 1)));
  const segT = clamp01(loop * (n - 1) - seg);
  // travel EDGE to EDGE along the connector, never through a node (which would
  // drag the token across the node's label).
  const tokenX = interpolate(segT, [0, 1], [xs[seg] + r, (xs[seg + 1] ?? xs[seg]) - r]);
  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={show} />
      {nodes.slice(0, n - 1).map((_, i) => {
        const drawn = clamp01((frame - 12 - i * 8) / 14);
        return (
          <g key={`a${i}`}>
            <line x1={xs[i] + r} y1={y} x2={xs[i] + r + (xs[i + 1] - xs[i] - 2 * r) * drawn} y2={y}
              stroke={ink} strokeWidth={7} strokeLinecap="round" opacity={0.6} />
            {drawn > 0.9 && <path d={`M${xs[i + 1] - r - 4},${y - 12} L${xs[i + 1] - r + 10},${y} L${xs[i + 1] - r - 4},${y + 12}`} fill={ink} opacity={0.6} />}
          </g>
        );
      })}
      {nodes.map((lab, i) => {
        const enter = spring({ frame: frame - i * 10, fps, config: { damping: 14, stiffness: 130 } });
        return (
          <g key={i} opacity={enter} transform={`translate(${xs[i]} ${y}) scale(${enter})`}>
            <circle r={r} fill={paper} stroke={i === 0 ? ink : accent} strokeWidth={8} />
            <text y={12} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800}
              fontSize={lab.length > 8 ? 30 : 38} fill={ink}>{lab.toUpperCase()}</text>
          </g>
        );
      })}
      <circle cx={tokenX} cy={y} r={20} fill={accent} opacity={frame > 20 ? 1 : 0} />
    </g>
  );
};

// ── spectrum — a marker on a continuum between two poles ──────────────────────
const Spectrum: React.FC<ArchProps> = ({ spec, accent, ink, frame, fps }) => {
  const y = VH / 2;
  const x0 = 120, x1 = VW - 120;
  const target = clamp01(spec.values?.[0] ?? 0.5);
  const p = spring({ frame: frame - 12, fps, config: { damping: 13, stiffness: 90 } });
  const mx = interpolate(p, [0, 1], [(x0 + x1) / 2, interpolate(target, [0, 1], [x0, x1])]);
  const show = spring({ frame, fps, config: { damping: 16 } });
  const poles = spec.labels.length >= 2 ? spec.labels : ["LESS", "MORE"];
  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={show} />
      <line x1={x0} y1={y} x2={x1} y2={y} stroke={ink} strokeWidth={8} strokeLinecap="round" opacity={0.4} />
      <line x1={x0} y1={y} x2={mx} y2={y} stroke={accent} strokeWidth={8} strokeLinecap="round" />
      {[x0, x1].map((x, i) => <circle key={i} cx={x} cy={y} r={12} fill={ink} opacity={0.5} />)}
      <g transform={`translate(${mx} ${y})`}>
        <circle r={26} fill={accent} />
        <circle r={26} fill="none" stroke={ink} strokeWidth={4} opacity={0.25} />
      </g>
      <text x={x0} y={y + 70} textAnchor="start" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={34} fill={ink}>{poles[0].toUpperCase()}</text>
      <text x={x1} y={y + 70} textAnchor="end" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={34} fill={ink}>{poles[1].toUpperCase()}</text>
    </g>
  );
};

// ── matrix — 2x2 grid (decision / prioritization / trade-off) ───────────────
const Matrix: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps }) => {
  const show = spring({ frame, fps, config: { damping: 16 } });
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

  const heroPulse = 1 + Math.sin(frame * 0.12) * 0.02;

  return (
    <g opacity={show}>
      <Title text={spec.title} ink={ink} show={show} />

      {/* Quadrant Boxes */}
      {quads.map((q, i) => {
        const enter = spring({ frame: frame - 6 - i * 5, fps, config: { damping: 14, stiffness: 120 } });
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
            <text
              x={q.x + qWidth / 2}
              y={q.y + qHeight / 2 + 10}
              textAnchor="middle"
              fontFamily="Poppins, Arial, sans-serif"
              fontWeight={800}
              fontSize={q.label.length > 12 ? 26 : 32}
              fill={q.hero ? accent : ink}
            >
              {q.label.toUpperCase()}
            </text>
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
const Tree: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps }) => {
  const show = spring({ frame, fps, config: { damping: 16 } });
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
      <Title text={spec.title} ink={ink} show={show} />

      {/* Root to Branches Connectors */}
      {branches.map((b, i) => {
        const lineDraw = clamp01((frame - 10 - i * 6) / 16);
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
        const lineDraw = clamp01((frame - 22 - i * 4) / 16);
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
        const enter = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 120 } });
        return (
          <g opacity={enter} transform={`translate(${root.x} ${root.y}) scale(${enter})`}>
            <rect x={-150} y={-40} width={300} height={80} rx={22} fill={accent} />
            <text y={10} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={28} fill="#FFFFFF">
              {root.label.toUpperCase()}
            </text>
          </g>
        );
      })()}

      {/* Branch Nodes */}
      {branches.map((b, i) => {
        const enter = spring({ frame: frame - 16 - i * 6, fps, config: { damping: 14, stiffness: 120 } });
        return (
          <g key={`b-${i}`} opacity={enter} transform={`translate(${b.x} ${b.y}) scale(${enter})`}>
            <rect x={-130} y={-36} width={260} height={72} rx={18} fill={paper} stroke={accent} strokeWidth={6} />
            <text y={9} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={800} fontSize={24} fill={ink}>
              {b.label.toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* Leaf Nodes */}
      {leaves.map((l, i) => {
        const enter = spring({ frame: frame - 28 - i * 4, fps, config: { damping: 14, stiffness: 120 } });
        return (
          <g key={`l-${i}`} opacity={enter} transform={`translate(${l.x} ${l.y}) scale(${enter})`}>
            <rect x={-100} y={-28} width={200} height={56} rx={14} fill={paper} stroke={ink} strokeWidth={4} opacity={0.9} />
            <text y={8} textAnchor="middle" fontFamily="Poppins, Arial, sans-serif" fontWeight={700} fontSize={20} fill={ink}>
              {l.label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </g>
  );
};

// ── funnel — multi-stage distillation / conversion funnel ────────────────────
const Funnel: React.FC<ArchProps> = ({ spec, accent, ink, paper, frame, fps }) => {
  const show = spring({ frame, fps, config: { damping: 16 } });
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
      <Title text={spec.title} ink={ink} show={show} />

      {labels.slice(0, stages).map((lab, i) => {
        const enter = spring({ frame: frame - 6 - i * 7, fps, config: { damping: 14, stiffness: 120 } });
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
            <text
              x={cx}
              y={y + stageH / 2 + 8}
              textAnchor="middle"
              fontFamily="Poppins, Arial, sans-serif"
              fontWeight={800}
              fontSize={lab.length > 14 ? 24 : 30}
              fill={isLast ? "#FFFFFF" : ink}
            >
              {lab.toUpperCase()}
            </text>
            {val !== undefined && (
              <g transform={`translate(${cx + w.top / 2 + 30} ${y + stageH / 2})`}>
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
        const loop = (frame % 45) / 45;
        const py = interpolate(loop, [0, 1], [startY, startY + stages * (stageH + stageGap) + 30]);
        return <circle cx={cx} cy={py} r={10} fill={accent} opacity={frame > 20 ? 0.85 : 0} />;
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
}> = ({ spec, accent, ink, paper, frame, fps, durationFrames }) => {
  const Arch = ARCH[spec.type] ?? Sorter;
  const scale = spec.scale ?? 1;
  const cx = spec.x ?? 960;
  const cy = spec.y ?? 486; // biased up, clear of the caption band
  const w = VW * scale;
  const h = VH * scale;
  return (
    <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%, -50%)", filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.12))" }}>
      <svg width={w} height={h} viewBox={`0 0 ${VW} ${VH}`} style={{ overflow: "visible" }}>
        <Arch spec={spec} accent={accent} ink={ink} paper={paper} frame={frame} fps={fps} durationFrames={durationFrames} />
      </svg>
    </div>
  );
};
