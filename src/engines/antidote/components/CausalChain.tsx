import React from "react";
import type { DiagramSpec } from "../schema";
import { fitLabel, DIAGRAM_VW as VW, type FittedLabel } from "../labelFit";
import { causalState, type Causal, type CausalGlyph } from "../causal";

/**
 * CausalChain.tsx — MECHANISM 2.0 (causal.ts): the causal chain drawn. Stations (pictogram + the narration's label) in
 * causal order; arrows between drawn stations; a dashed "?" slot for a station said later; the carried TOKEN on a lane
 * above the row, travelling arrow by arrow (the arrows it crossed stay coloured — the path is a persistent state); the
 * token's tag struck through and renamed (RELABEL); an optional greyed CONTRAST row (no trigger → nothing travels);
 * an optional LOOP arc back. Every element is a pure function of the local frame (causalState).
 */
const REJ = "#C8372D";
const FONT = "Poppins, Arial, sans-serif";

const Fit: React.FC<{ fit: FittedLabel; x: number; y: number; fill: string; anchor?: "start" | "middle" | "end"; weight?: number }> = ({ fit, x, y, fill, anchor = "middle", weight = 800 }) => {
  if (!fit.lines.length) return null;
  const lh = fit.size * 1.15;
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={FONT} fontWeight={weight} fontSize={fit.size} fill={fill}>
      {fit.lines.map((l, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>{l}</tspan>)}
    </text>
  );
};

/** the causal pictograms: a 100-unit box centred on (0,0), stroke = ink, fill accents; static (motion comes from the chain) */
export const CausalGlyphArt: React.FC<{ g: CausalGlyph; ink: string; accent: string; light?: boolean }> = ({ g, ink, accent, light }) => {
  const s = { fill: "none", stroke: light ? "#FFFFFF" : ink, strokeWidth: 6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const f = light ? "#FFFFFF" : accent;
  switch (g) {
    case "bridge": // a suspension bridge, deck tilted and sagging (it sways)
      return (<g transform="rotate(-6)">
        <path d="M-34,-40 V30 M34,-40 V30" {...s} strokeWidth={8} />
        <path d="M-50,-30 Q-34,-44 -34,-40 Q0,8 34,-40 Q34,-44 50,-30" {...s} />
        <path d="M-50,14 Q0,30 50,14" {...s} strokeWidth={9} stroke={f} />
        {[-18, 0, 18].map((x) => <path key={x} d={`M${x},${-6 + Math.abs(x) * -0.9} V${20 - Math.abs(x) * 0.12}`} {...s} strokeWidth={3} />)}
        <path d="M-58,40 q8,-6 16,0 t16,0 M18,40 q8,-6 16,0 t16,0" {...s} strokeWidth={3} opacity={0.6} />
      </g>);
    case "heart": // a heart with a racing pulse line through it
      return (<g>
        <path d="M0,38 C-46,8 -46,-30 -20,-34 C-6,-36 0,-22 0,-22 C0,-22 6,-36 20,-34 C46,-30 46,8 0,38 Z" fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={4} />
        <path d="M-46,0 H-22 L-14,-16 L-4,18 L6,-24 L14,6 L20,0 H46" {...s} stroke={light ? accent : "#FFFFFF"} strokeWidth={5} />
      </g>);
    case "brain":
      return (<g>
        <path d="M-4,-36 C-26,-44 -46,-28 -40,-10 C-52,0 -46,24 -26,26 C-22,40 -4,40 -4,30 Z" {...s} />
        <path d="M4,-36 C26,-44 46,-28 40,-10 C52,0 46,24 26,26 C22,40 4,40 4,30 Z" {...s} />
        <path d="M-30,-14 q10,6 18,-2 M-28,10 q10,-6 18,4 M30,-14 q-10,6 -18,-2 M28,10 q-10,-6 -18,4" {...s} strokeWidth={4} />
      </g>);
    case "eye":
      return (<g>
        <path d="M-46,0 Q0,-40 46,0 Q0,40 -46,0 Z" {...s} />
        <circle r={15} fill={f} /><circle r={6} fill={light ? accent : ink} />
      </g>);
    case "phone": // a handset ringing
      return (<g>
        <rect x={-20} y={-38} width={40} height={74} rx={9} {...s} />
        <rect x={-13} y={-28} width={26} height={46} rx={3} fill={f} opacity={0.85} />
        <path d="M28,-24 q10,10 0,20 M36,-32 q18,18 0,36" {...s} strokeWidth={4} />
      </g>);
    case "bolt":
      return <path d="M8,-44 L-26,6 H-2 L-10,44 L26,-8 H2 Z" fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={4} strokeLinejoin="round" />;
    case "drop":
      return <path d="M0,-44 C18,-16 32,2 32,16 A32,32 0 0 1 -32,16 C-32,2 -18,-16 0,-44 Z" fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={4} />;
    case "danger":
      return (<g>
        <path d="M0,-42 L44,36 H-44 Z" fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={5} strokeLinejoin="round" />
        <path d="M0,-14 V12" {...s} stroke={light ? accent : ink} strokeWidth={8} /><circle cy={25} r={5} fill={light ? accent : ink} />
      </g>);
    case "person":
      return (<g><circle cy={-20} r={16} {...s} /><path d="M-30,40 C-30,8 30,8 30,40" {...s} /></g>);
    case "people":
      return (<g>
        <circle cx={-18} cy={-18} r={13} {...s} /><path d="M-42,38 C-42,8 6,8 6,38" {...s} />
        <circle cx={20} cy={-14} r={13} {...s} stroke={f} /><path d="M-2,40 C-2,12 42,12 42,40" {...s} stroke={f} />
      </g>);
    case "coin":
      return (<g><circle r={38} fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={5} /><text y={16} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={46} fill={light ? accent : "#FFFFFF"}>$</text></g>);
    case "clock":
      return (<g><circle r={38} {...s} /><path d="M0,0 V-24 M0,0 L16,10" {...s} /></g>);
    case "speech":
      return <path d="M-40,-30 H40 V16 H-6 L-24,36 V16 H-40 Z" {...s} />;
    case "check":
      return <path d="M-32,2 L-8,26 L36,-26" {...s} strokeWidth={10} stroke={light ? "#FFFFFF" : accent} />;
    case "cross":
      return <path d="M-28,-28 L28,28 M28,-28 L-28,28" {...s} strokeWidth={10} stroke={light ? "#FFFFFF" : REJ} />;
    case "spark":
      return <path d="M0,-44 L10,-10 L44,0 L10,10 L0,44 L-10,10 L-44,0 L-10,-10 Z" fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={4} strokeLinejoin="round" />;
    case "lock":
      return (<g><path d="M-20,-6 V-22 A20,20 0 0 1 20,-22 V-6" {...s} /><rect x={-30} y={-6} width={60} height={46} rx={8} fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={5} /></g>);
    case "door":
      return (<g><rect x={-28} y={-42} width={56} height={84} rx={4} {...s} /><path d="M-28,-42 L8,-30 V50 L-28,42 Z" fill={f} opacity={0.9} /><circle cx={0} cy={6} r={4} fill={light ? "#FFFFFF" : ink} /></g>);
    case "fire":
      return <path d="M0,44 C-30,44 -38,18 -26,-2 C-20,10 -12,10 -12,10 C-16,-14 -4,-34 10,-44 C8,-24 34,-12 30,16 C28,34 16,44 0,44 Z" fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={4} />;
    case "ice":
      return (<g><path d="M-30,-14 L0,-32 L30,-14 V20 L0,38 L-30,20 Z M-30,-14 L0,4 L30,-14 M0,4 V38" fill="none" stroke={light ? "#FFFFFF" : ink} strokeWidth={5} strokeLinejoin="round" /><path d="M-30,-14 L0,-32 L30,-14 L0,4 Z" fill="#BFE3F2" opacity={light ? 0.5 : 1} /></g>);
    case "water":
      return <path d="M-44,-14 q11,-12 22,0 t22,0 t22,0 t22,0 M-44,6 q11,-12 22,0 t22,0 t22,0 t22,0 M-44,26 q11,-12 22,0 t22,0 t22,0 t22,0" {...s} stroke={light ? "#FFFFFF" : "#2C7FB8"} />;
    case "plant":
      return (<g><path d="M0,40 V-14" {...s} /><path d="M0,0 C-30,-2 -34,-26 -34,-30 C-14,-30 0,-18 0,0 M0,-14 C24,-16 32,-38 32,-42 C12,-42 0,-30 0,-14" fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={4} /><path d="M-24,40 H24" {...s} /></g>);
    case "gift":
      return (<g><rect x={-34} y={-12} width={68} height={50} rx={4} fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={5} /><rect x={-38} y={-26} width={76} height={16} rx={3} {...s} /><path d="M0,-26 V38 M0,-26 C-18,-48 -32,-30 0,-26 C18,-48 32,-30 0,-26" {...s} /></g>);
    case "lever": // a lever on its base, the handle tipped (pressed)
      return (<g><rect x={-40} y={22} width={80} height={18} rx={5} fill={f} stroke={light ? "#FFFFFF" : ink} strokeWidth={4} />
        <path d="M-6,24 L22,-34" {...s} strokeWidth={9} /><circle cx={24} cy={-38} r={11} fill={light ? "#FFFFFF" : ink} /></g>);
    case "pellet": // a food pellet (small brown rounded nugget with a highlight)
      return (<g><ellipse rx={30} ry={24} fill={light ? "#FFFFFF" : "#B8763A"} stroke={light ? "#FFFFFF" : ink} strokeWidth={5} />
        <ellipse cx={-9} cy={-8} rx={9} ry={6} fill="#FFFFFF" opacity={0.55} /></g>);
    case "rat": // a lab rat in profile facing right
      return (<g><path d="M-38,18 C-40,-12 -10,-26 14,-16 C30,-10 40,0 44,10 C40,18 26,22 14,22 Z" fill={light ? "#FFFFFF" : "#D9D9DE"} stroke={light ? "#FFFFFF" : ink} strokeWidth={5} strokeLinejoin="round" />
        <circle cx={-2} cy={-20} r={9} fill={light ? "#FFFFFF" : "#D9D9DE"} stroke={light ? "#FFFFFF" : ink} strokeWidth={4} />
        <circle cx={30} cy={2} r={4} fill={light ? accent : ink} /><path d="M-38,14 C-56,14 -60,30 -48,36" {...s} strokeWidth={4} /></g>);
    default:
      return <circle r={30} {...s} />;
  }
};

const ROW = 318, R = 66, LANE = 168, CONTRAST = 560;

export const CausalChain: React.FC<{ spec: DiagramSpec; accent: string; ink: string; frame: number }> = ({ spec, accent, ink, frame }) => {
  const c = (spec as DiagramSpec & { causal?: Causal }).causal;
  if (!c || !c.stations || c.stations.length < 2) return null;
  const S = causalState(c, frame);
  const n = c.stations.length;
  const M = n <= 3 ? 200 : 120;
  const X = (k: number) => M + ((VW - 2 * M) * k) / (n - 1);
  const gap = (VW - 2 * M) / (n - 1);
  const lab = (t: string) => fitLabel(t.toUpperCase(), { maxW: Math.min(260, gap - 16), baseSize: 30, minSize: 22, maxLines: 2 });
  const tok = S.token;
  // how far the token has travelled along arrow k (the path it took stays coloured)
  const crossed = (k: number) => (tok ? Math.max(0, Math.min(1, tok.pos - k)) : 0) * (tok && tok.back > 0 ? 0 : 1);
  const lastReached = tok && Math.abs(tok.pos - (n - 1)) < 1e-6 && tok.back === 0;
  const arrows = c.stations.slice(0, -1).map((_, k) => {
    const x1 = X(k) + R + 8, x2 = X(k + 1) - R - 14;
    const solid = S.arrow[k];
    const dashed = !solid && ((S.station[k] > 0 || S.slot[k]) && (S.station[k + 1] > 0 || S.slot[k + 1]));
    if (!solid && !dashed) return null;
    const p = crossed(k);
    return (
      <g key={`a${k}`} opacity={solid ? Math.max(0.35, solid) : 0.55}>
        <line x1={x1} y1={ROW} x2={x2} y2={ROW} stroke={ink} strokeWidth={7} strokeLinecap="round" strokeDasharray={dashed ? "14 12" : undefined} />
        {p > 0 ? <line x1={x1} y1={ROW} x2={x1 + (x2 - x1) * p} y2={ROW} stroke={accent} strokeWidth={11} strokeLinecap="round" /> : null}
        <path d={`M${x2 + 12},${ROW} l-22,-15 v30 z`} fill={p >= 1 ? accent : ink} />
      </g>
    );
  });
  const stations = c.stations.map((st, k) => {
    if (S.slot[k]) return (
      <g key={`s${k}`}>
        <circle cx={X(k)} cy={ROW} r={R} fill="none" stroke={ink} strokeWidth={5} strokeDasharray="16 12" opacity={0.6} />
        <text x={X(k)} y={ROW + 30} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={84} fill={ink} opacity={0.7}>?</text>
      </g>
    );
    const a = S.station[k];
    if (a <= 0) return null;
    const hit = tok && tok.back === 0 && tok.pos >= k - 1e-6; // the token has reached (or passed) this station
    const isEnd = k === n - 1;
    return (
      <g key={`s${k}`} opacity={Math.min(1, a * 1.4)}>
        <g transform={`translate(${X(k)} ${ROW}) scale(${0.6 + 0.4 * a})`}>
          <circle r={R} fill={isEnd && lastReached ? accent : "#FFFFFF"} stroke={hit ? accent : ink} strokeWidth={hit ? 9 : 6} />
          <g transform="scale(0.92)"><CausalGlyphArt g={st.glyph} ink={ink} accent={accent} light={!!(isEnd && lastReached)} /></g>
        </g>
        <Fit fit={lab(st.label)} x={X(k)} y={ROW + R + 44} fill={ink} />
      </g>
    );
  });
  // the carried token on the lane above the row; a thin stem shows which station it is at
  let token: React.ReactNode = null;
  if (tok && c.token) {
    const loopTo = c.loop ? c.loop.to : 0;
    let tx = M + gap * tok.pos, ty = LANE;
    if (tok.back > 0) { // riding the loop arc back (below the row)
      const xa = X(n - 1), xb = X(loopTo), u = tok.back;
      tx = xa + (xb - xa) * u; ty = ROW + R + 140 * Math.sin(Math.PI * u) + (LANE - ROW) * 0;
    }
    const tagFit = (t: string, big: boolean) => fitLabel(t.toUpperCase(), { maxW: 300, baseSize: big ? 40 : 30, minSize: 18, maxLines: 1 });
    const sh = tok.tagShift;
    const tagTo1 = Array.isArray(c.token.tagTo) ? c.token.tagTo[0] : c.token.tagTo;
    token = (
      <g>
        {tok.back === 0 ? <line x1={tx} y1={LANE + 44} x2={tx} y2={ROW - R - 6} stroke={accent} strokeWidth={4} strokeDasharray="6 8" opacity={0.8 * tok.born} /> : null}
        <g transform={`translate(${tx} ${ty}) scale(${0.4 + 0.6 * tok.born})`}>
          <circle r={44} fill={accent} stroke={ink} strokeWidth={5} />
          <g transform="scale(0.72)"><CausalGlyphArt g={c.token.glyph} ink={ink} accent={accent} light /></g>
        </g>
        {c.token.tag && tok.back === 0 ? (
          sh > 0 && tagTo1 ? (
            <g>
              <g opacity={1 - 0.45 * sh}>
                <Fit fit={tagFit(c.token.tag, false)} x={tx} y={LANE - 92} fill={ink} />
                <line x1={tx - tagFit(c.token.tag, false).width / 2 - 6} y1={LANE - 100} x2={tx - tagFit(c.token.tag, false).width / 2 - 6 + (tagFit(c.token.tag, false).width + 12) * Math.min(1, sh * 1.6)} y2={LANE - 100} stroke={REJ} strokeWidth={6} strokeLinecap="round" />
              </g>
              <g opacity={Math.max(0, sh * 2 - 1)}><Fit fit={tagFit(tagTo1, true)} x={tx} y={LANE - 56} fill={accent} weight={900} /></g>
            </g>
          ) : <Fit fit={tagFit(c.token.tag, true)} x={tx} y={LANE - 60} fill={ink} weight={900} />
        ) : null}
      </g>
    );
  }
  // the control condition: greyed start, flat line, nothing travels
  const contrast = c.contrast && S.contrast > 0 ? (
    <g opacity={0.75 * S.contrast}>
      <g transform={`translate(${X(0)} ${CONTRAST}) scale(0.62)`}>
        <circle r={R} fill="#F2F2F2" stroke="#8A8A8A" strokeWidth={6} />
        <g transform="scale(0.92)"><CausalGlyphArt g={c.contrast.glyph} ink="#8A8A8A" accent="#B5B5B5" /></g>
      </g>
      <Fit fit={fitLabel(c.contrast.label.toUpperCase(), { maxW: 300, baseSize: 26, minSize: 16, maxLines: 1 })} x={X(0) + 56} y={CONTRAST - 44} fill="#6E6E6E" anchor="start" />
      <line x1={X(0) + 52} y1={CONTRAST} x2={X(n - 1) - 40} y2={CONTRAST} stroke="#8A8A8A" strokeWidth={5} strokeDasharray="4 14" strokeLinecap="round" />
      <path d={`M${X(n - 1) - 30},${CONTRAST - 16} l32,32 m0,-32 l-32,32`} stroke="#8A8A8A" strokeWidth={7} strokeLinecap="round" />
      {c.contrast.result ? <Fit fit={fitLabel(c.contrast.result.toUpperCase(), { maxW: 260, baseSize: 26, minSize: 16, maxLines: 1 })} x={X(n - 1) + 16} y={CONTRAST + 10} fill="#6E6E6E" anchor="start" /> : null}
    </g>
  ) : null;
  const loop = c.loop && S.loop > 0 ? (() => {
    const xa = X(n - 1), xb = X(c.loop.to), yb = ROW + R + 6;
    return (
      <g opacity={S.loop}>
        <path d={`M${xa},${yb} C${xa},${yb + 190} ${xb},${yb + 190} ${xb},${yb + 14}`} fill="none" stroke={accent} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={`${S.loop} 1`} />
        {S.loop >= 1 ? <path d={`M${xb},${yb + 4} l-15,24 h30 z`} fill={accent} /> : null}
        {c.loop.label ? <Fit fit={fitLabel(c.loop.label.toUpperCase(), { maxW: 360, baseSize: 28, minSize: 16, maxLines: 1 })} x={(xa + xb) / 2} y={yb + 176} fill={accent} /> : null}
      </g>
    );
  })() : null;
  return (
    <g>
      {contrast}
      {loop}
      {arrows}
      {stations}
      {token}
    </g>
  );
};
