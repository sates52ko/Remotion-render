import React from "react";
import type { DiagramSpec } from "../schema";
import { fitLabel, type FittedLabel } from "../labelFit";
import { causalState, type Causal } from "../causal";
import { ledgerState, lapLeg, BAR_H, type Ledger, type LapState } from "../causalLedger";
import { CausalGlyphArt } from "./CausalChain";

/**
 * CausalLoop.tsx — MECHANISM 3.0 (causalLedger.ts): a feedback loop whose state changes lap by lap. The chain's stations
 * in a row; the loop arc above it; the token running laps (lever -> door -> brain -> back) faster after each rename of its
 * tag; under it the LEDGER: one permanent column per lap (food tile + bar on ONE shared scale), and the greyed CONTRAST
 * lane with its own ledger. Every element is a pure function of the local frame.
 */
const FONT = "Poppins, Arial, sans-serif";
const GREY = "#8A8A8A";
const Fit: React.FC<{ fit: FittedLabel; x: number; y: number; fill: string; anchor?: "start" | "middle" | "end"; weight?: number; opacity?: number }> = ({ fit, x, y, fill, anchor = "middle", weight = 800, opacity }) => {
  if (!fit.lines.length) return null;
  const lh = fit.size * 1.15;
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={FONT} fontWeight={weight} fontSize={fit.size} fill={fill} opacity={opacity}>
      {fit.lines.map((l, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>{l}</tspan>)}
    </text>
  );
};
const label = (t: string, maxW: number, base = 28, min = 16, lines = 2) => fitLabel(t.toUpperCase(), { maxW, baseSize: base, minSize: min, maxLines: lines });

const ARC_H = 70, ROW = 104, R = 62, BASE = 398, BAR_MAX = 150, TILE_Y = 428, C_BASE = 548, C_TILE_Y = 580, X0 = 250, X1 = 1180;

export const CausalLoop: React.FC<{ spec: DiagramSpec; accent: string; ink: string; frame: number }> = ({ spec, accent, ink, frame }) => {
  const c = (spec as DiagramSpec & { causal?: Causal & { ledger?: Ledger } }).causal;
  if (!c || !c.ledger || !c.stations || c.stations.length < 2) return null;
  const S = causalState(c, frame);
  const LG = ledgerState(c, frame)!;
  const n = c.stations.length;
  const X = (k: number) => 330 + ((900 - 330) * k) / (n - 1);
  const drawn = S.station.map((x) => x > 0);
  const lastDrawn = drawn.lastIndexOf(true);
  const loopTo = c.loop ? c.loop.to : 0;
  const food = Math.min(1, n - 1), brain = n - 1;
  // ── the token's place on its lap ──
  const arcPt = (xa: number, xb: number, t: number) => {
    const y0 = ROW - R - 4, y1 = ROW - R - ARC_H;
    const u = 1 - t;
    return { x: u * u * u * xa + 3 * u * u * t * xa + 3 * u * t * t * xb + t * t * t * xb, y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y1 + t * t * t * y0 };
  };
  let tok: { x: number; y: number } | null = null;
  const born = S.token ? S.token.born : 0;
  if (born > 0) {
    if (!LG.lap) tok = { x: X(loopTo), y: ROW };
    else {
      const { leg, t } = lapLeg(LG.lap.phase, LG.lap.toBrain);
      if (leg === 0) tok = { x: X(loopTo) + (X(food) - X(loopTo)) * t, y: ROW };
      else if (leg === 1) tok = { x: X(food), y: ROW };
      else if (leg === 2) tok = { x: X(food) + (X(brain) - X(food)) * t, y: ROW };
      else tok = arcPt(LG.lap.toBrain ? X(brain) : X(food), X(loopTo), t);
    }
  }
  const atDoor = LG.lap ? lapLeg(LG.lap.phase, LG.lap.toBrain) : null;
  // ── stations, arrows, loop arc ──
  const arrows = c.stations.slice(0, -1).map((_, k) => {
    if (!drawn[k] || !drawn[k + 1]) return null;
    const x1 = X(k) + R + 8, x2 = X(k + 1) - R - 14;
    return (
      <g key={`a${k}`} opacity={Math.min(S.station[k], S.station[k + 1])}>
        <line x1={x1} y1={ROW} x2={x2} y2={ROW} stroke={ink} strokeWidth={6} strokeLinecap="round" />
        <path d={`M${x2 + 12},${ROW} l-20,-13 v26 z`} fill={ink} />
      </g>
    );
  });
  const arc = c.loop && S.loop > 0 && lastDrawn > loopTo ? (() => {
    const xa = X(lastDrawn), xb = X(loopTo), y0 = ROW - R - 4, y1 = ROW - R - ARC_H;
    return (
      <g opacity={S.loop}>
        <path d={`M${xa},${y0} C${xa},${y1} ${xb},${y1} ${xb},${y0}`} fill="none" stroke={accent} strokeWidth={6} strokeLinecap="round" strokeDasharray="2 12" />
        <path d={`M${xb},${y0 + 2} l-13,-22 h26 z`} fill={accent} />
      </g>
    );
  })() : null;
  const stations = c.stations.map((st, k) => {
    const a = S.station[k];
    if (a <= 0) {
      if (S.slot[k] || LG.lane > 0) return (
        <g key={`s${k}`} opacity={S.slot[k] ? 1 : LG.lane}><circle cx={X(k)} cy={ROW} r={R} fill="none" stroke={ink} strokeWidth={5} strokeDasharray="14 10" opacity={0.55} />
          <text x={X(k)} y={ROW + 26} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={72} fill={ink} opacity={0.6}>?</text></g>
      );
      return null;
    }
    const fl = k === brain ? LG.flare : 0;
    return (
      <g key={`s${k}`} opacity={Math.min(1, a * 1.4)}>
        {fl > 0 ? <g transform={`translate(${X(k)} ${ROW}) scale(${1.2 + fl * 0.8})`} opacity={fl}><CausalGlyphArt g="spark" ink={ink} accent={accent} /></g> : null}
        <g transform={`translate(${X(k)} ${ROW}) scale(${0.6 + 0.4 * a})`}>
          <circle r={R} fill="#FFFFFF" stroke={ink} strokeWidth={6} />
          <g transform="scale(0.82)"><CausalGlyphArt g={st.glyph} ink={ink} accent={accent} /></g>
        </g>
        {st.mark === "?" ? (
          <g transform={`translate(${X(k) + R * 0.72} ${ROW - R * 0.72})`}>
            <circle r={19} fill={accent} stroke="#FFFFFF" strokeWidth={4} />
            <text y={10} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={28} fill="#FFFFFF">?</text>
          </g>
        ) : null}
        {st.figure ? <g transform={`translate(${X(k) - R - 62} ${ROW + 14}) scale(0.74)`}><CausalGlyphArt g={st.figure} ink={ink} accent={accent} /></g> : null}
        <Fit fit={label(st.label, 260, 32, 20, 2)} x={X(k)} y={ROW + R + 38} fill={ink} />
      </g>
    );
  });
  // the door: what the lap finds there (a pellet, or a neutral empty — never a cross)
  const door = LG.lap && atDoor && atDoor.leg >= 1 && LG.lap.phase < 0.9 ? (() => {
    const p = atDoor.leg === 1 ? atDoor.t : 1;
    return (
      <g transform={`translate(${X(food)} ${ROW - R - 34}) scale(${0.3 + 0.35 * p})`} opacity={Math.min(1, p * 2)}>
        {LG.lap.o === "reward" ? <CausalGlyphArt g="pellet" ink={ink} accent={accent} /> : <rect x={-34} y={-34} width={68} height={68} rx={14} fill="none" stroke={GREY} strokeWidth={6} strokeDasharray="12 9" />}
      </g>
    );
  })() : null;
  // the token's tag series (press -> compulsively -> mashing): the old ones struck through, the speed in the streaks
  const tags = c.token ? [c.token.tag, ...([] as (string | undefined)[]).concat(c.token.tagTo as string | string[] | undefined)].filter((x): x is string => !!x) : [];
  const ti = Math.min(LG.tagIndex, tags.length - 1);
  const tagRow = born > 0 && tags.length ? (
    <g>
      {tags.slice(Math.max(0, ti - 1), ti + 1).map((t, n, arr) => {
        const k = ti - (arr.length - 1 - n);
        const cur = k === ti;
        const f = label(t, 320, cur ? 36 : 22, 16, 1);
        const y = cur ? ROW + R + 102 : ROW + R + 70;
        const x = X(loopTo);
        return (
          <g key={`t${k}`} opacity={cur ? (k === 0 ? born : Math.max(0.2, LG.tagShift)) : 0.55}>
            <Fit fit={f} x={x} y={y} fill={cur ? accent : ink} anchor="middle" weight={cur ? 900 : 700} />
            {!cur ? <line x1={x - f.width / 2 - 4} y1={y - f.size * 0.35} x2={x + f.width / 2 + 4} y2={y - f.size * 0.35} stroke="#C8372D" strokeWidth={4} /> : null}
          </g>
        );
      })}
    </g>
  ) : null;
  const token = tok ? (
    <g transform={`translate(${tok.x} ${tok.y})`}>
      {LG.speed > 0 && LG.lap ? [1, 2, 3].slice(0, LG.speed + 1).map((k) => <line key={k} x1={-30 - k * 12} y1={-10 + k * 8} x2={-14 - k * 12} y2={-10 + k * 8} stroke={accent} strokeWidth={4} strokeLinecap="round" opacity={0.7} />) : null}
      <circle r={24} fill={accent} stroke={ink} strokeWidth={4} />
      <g transform="scale(0.42)">{c.token ? <CausalGlyphArt g={c.token.glyph} ink={ink} accent={accent} light /> : null}</g>
    </g>
  ) : null;
  // ── the ledgers ──
  const total = Math.max(14, LG.main.length, LG.contrast.length);
  const colW = Math.min(52, (X1 - X0) / total);
  const cx = (i: number) => X0 + (i + 0.5) * colW;
  const bar = (s: LapState, i: number, base: number, color: string, key: string) => {
    if (!s.bar) return null;
    const h = Math.max(3, BAR_H[s.bar] * BAR_MAX * s.barP);
    return <rect key={key} x={cx(i) - colW * 0.3} y={base - h} width={colW * 0.6} height={h} rx={4} fill={color} opacity={s.barP > 0 ? 1 : 0} />;
  };
  const tile = (s: LapState, i: number, y: number, grey: boolean, key: string) => {
    if (s.tile <= 0) return null;
    const sc = (0.3 + 0.25 * s.tile);
    return (
      <g key={key} transform={`translate(${cx(i)} ${y}) scale(${Math.min(sc, colW / 76)})`} opacity={s.tile}>
        {s.o === "reward" ? <CausalGlyphArt g="pellet" ink={grey ? GREY : ink} accent={grey ? "#B5B5B5" : accent} /> : <rect x={-40} y={-40} width={80} height={80} rx={16} fill="none" stroke={GREY} strokeWidth={8} strokeDasharray="14 10" />}
      </g>
    );
  };
  const L = c.ledger;
  const laneLabel = L.label ? (() => {
    const a = label(L.label, X0 - 30, 30, 18, 2), b = L.labelTo ? label(L.labelTo, X0 - 30, 30, 18, 2) : null;
    const sh = LG.labelShift;
    return (
      <g opacity={LG.lane}>
        <g opacity={b && sh > 0 ? 1 - 0.5 * sh : 1}>
          <Fit fit={a} x={X0 - 22} y={BASE - 70} fill={ink} anchor="end" />
          {b && sh > 0 ? <line x1={X0 - 22 - a.width} y1={BASE - 78} x2={X0 - 22 - a.width + a.width * Math.min(1, sh * 1.6)} y2={BASE - 78} stroke="#C8372D" strokeWidth={4} /> : null}
        </g>
        {b && sh > 0 ? <g opacity={Math.max(0, sh * 2 - 1)}><Fit fit={b} x={X0 - 22} y={BASE - 30} fill={accent} anchor="end" weight={900} /></g> : null}
      </g>
    );
  })() : null;
  const meter = LG.meter > 0 ? (
    <g opacity={LG.meter}>
      <g transform={`translate(${X0 - 44} ${BASE + 2}) scale(0.36)`}><CausalGlyphArt g="drop" ink={ink} accent={accent} /></g>
      {L.meter ? <Fit fit={label(L.meter, X0 - 80, 24, 14, 1)} x={X0 - 66} y={BASE + 10} fill={ink} anchor="end" /> : null}
      <line x1={X0} y1={BASE - BAR_H.high * BAR_MAX} x2={X1} y2={BASE - BAR_H.high * BAR_MAX} stroke={ink} strokeWidth={2} strokeDasharray="6 8" opacity={0.35} />
    </g>
  ) : null;
  const ledgerBase = LG.lane > 0 ? <line x1={X0} y1={BASE} x2={X1} y2={BASE} stroke={ink} strokeWidth={3} opacity={0.5} /> : null;
  const showContrast = c.contrast && S.contrast > 0;
  const contrastLane = showContrast ? (
    <g opacity={0.85 * S.contrast}>
      <Fit fit={label(c.contrast!.label, X0 - 30, 28, 16, 2)} x={X0 - 22} y={C_BASE - 40} fill="#5F5F5F" anchor="end" />
      <line x1={X0} y1={C_BASE} x2={X1} y2={C_BASE} stroke={GREY} strokeWidth={3} opacity={0.6} />
      {LG.contrast.map((s, i) => bar(s, i, C_BASE, "#A9A9A9", `cb${i}`))}
      {LG.contrast.map((s, i) => tile(s, i, C_TILE_Y, true, `ct${i}`))}
      {LG.solved > 0 ? <g transform={`translate(${cx(Math.max(0, LG.contrast.length - 1)) + colW + 34} ${C_BASE - 30}) scale(${0.45 * LG.solved})`}><CausalGlyphArt g="check" ink={ink} accent={accent} /></g> : null}
    </g>
  ) : null;
  return (
    <g>
      {arc}
      {arrows}
      {stations}
      {door}
      {tagRow}
      {token}
      {ledgerBase}
      {laneLabel}
      {meter}
      {LG.main.map((s, i) => bar(s, i, BASE, accent, `mb${i}`))}
      {LG.main.map((s, i) => tile(s, i, TILE_Y, false, `mt${i}`))}
      {contrastLane}
    </g>
  );
};
