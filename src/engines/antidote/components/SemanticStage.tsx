/**
 * SemanticStage — Semantic Film Director 1.0 (cycle 11, experiment branch dev/c11). Draws one COMPILED director
 * contract (scripts/lib/semantic-director.js compiles the renderer-neutral contract into this, with frame timing) as ONE
 * locked wide frame in which the cause and its visible effect are both in view (Lemo-Opuscar DIRECTOR: the whole
 * incident in one wide shot):
 *   before state → the cause is marked (the accent ring — the ONLY accent on the stage) → a token travels cause → effect
 *   → a held pause → the effect CHANGES the state → the new state stays to the end of the beat.
 * Every change leaves a trace of the before state, so a single still reads before AND after without colour: a stock
 * keeps a dashed line at its old level, a removed figure / object stays as a dashed outline, a moved object leaves a
 * dashed ghost and a dotted path, the cause → effect link stays as a thin ink arc with an arrowhead.
 * Entities: person (the book's cast rig, bust; mood = face), stock (a tank whose level is the quantity), object (an
 * icon), group (a row of ten small figures whose count is the quantity). Two lanes = a comparison on ONE shared scale
 * (every value is a share of the same 0..1 scale, every tank / row the same size). Deterministic: (spec, frame) only.
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Everyman } from "../characters/Everyman";
import { pose } from "../movements";
import { Motif } from "../motifs";
import { HeldProp, HAND_PROPS } from "../handprops";
import type { CastBible, HandProp, VariantSpec } from "../schema";
import { DEFAULT_VARIANT } from "../schema";

export type SemEntity = { id: string; kind: "person" | "stock" | "object" | "group"; label?: string; glyph?: string; cast?: string; value?: number; mood?: string; present?: boolean; lane?: number };
export type SemEffect = { entity: string; value?: number; mood?: string; present?: boolean; moveTo?: string; broken?: boolean };
/** one occurrence of an event, in scene frames: the cause is marked at `cue`, the token lands at cue+token, the change
 *  starts after the pause and takes `change` frames */
export type SemOcc = { cause: string; cue: number; effects: SemEffect[] };
export type SemanticCompiled = {
  type: string; lanes: 1 | 2; laneLabels?: string[]; entities: SemEntity[]; occ: SemOcc[]; text?: string;
  /** quote card only: who says it, when it is not the narrator (single-relation capability) */
  speaker?: string;
  timing: { token: number; pause: number; change: number };
};

const W = 1920;
const NEUTRAL = "#8A8F98"; // what a non-cause icon gets instead of the accent
const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

type St = { value: number; value0: number; mood?: string; vis: number; vis0: number; moveTo?: string; moveK: number; broken: boolean };

export function semanticState(spec: SemanticCompiled, frame: number): Record<string, St> {
  const s: Record<string, St> = {};
  for (const e of spec.entities) {
    const v = clamp01(e.value ?? 1), vis = e.present === false ? 0 : 1;
    s[e.id] = { value: v, value0: v, mood: e.mood, vis, vis0: vis, moveK: 0, broken: false };
  }
  const { token, pause, change } = spec.timing;
  for (const o of spec.occ) {
    const t0 = o.cue + token + pause;
    if (frame < t0) continue;
    const k = ease((frame - t0) / change);
    for (const f of o.effects) {
      const st = s[f.entity]; if (!st) continue;
      if (f.value != null) { const from = st.value; st.value = from + (clamp01(f.value) - from) * k; }
      if (f.mood && k >= 0.5) st.mood = f.mood;
      if (f.present != null) { const from = st.vis; st.vis = from + ((f.present ? 1 : 0) - from) * k; }
      if (f.broken && k >= 0.5) st.broken = true;
      if (f.moveTo) { st.moveTo = f.moveTo; st.moveK = k; }
    }
  }
  return s;
}

export function semanticLayout(spec: SemanticCompiled) {
  const two = spec.lanes === 2;
  const pos: Record<string, { x: number; y: number; s: number }> = {};
  for (let l = 0; l < (two ? 2 : 1); l++) {
    const row = spec.entities.filter((e) => (two ? (e.lane ?? 0) === l : true));
    row.forEach((e, i) => { pos[e.id] = { x: Math.round(160 + (W - 320) * (i + 1) / (row.length + 1)), y: two ? (l === 0 ? 330 : 790) : 560, s: two ? 0.7 : 1 }; });
  }
  return pos;
}

const SIZE = { person: 300, stockW: 180, stockH: 340, icon: 0.6 };
const halfH = (k: SemEntity["kind"], s: number) => s * (k === "person" ? 225 : k === "stock" ? SIZE.stockH / 2 : k === "group" ? 50 : 156);

const Label: React.FC<{ x: number; y: number; text?: string; ink: string; s: number; anchor?: "middle" | "start" }> = ({ x, y, text, ink, s, anchor = "middle" }) =>
  text ? <text x={x} y={y} textAnchor={anchor} fontFamily="Inter, Arial, sans-serif" fontWeight={800} fontSize={42 * Math.max(0.8, s)} fill={ink} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke">{text.toUpperCase()}</text> : null;

const Figure: React.FC<{ x: number; y: number; s: number; ink: string; mode: "on" | "ghost" | "off" }> = ({ x, y, s, ink, mode }) => {
  const head = <circle cx={x} cy={y - 24 * s} r={13 * s} />, body = <rect x={x - 12 * s} y={y - 8 * s} width={24 * s} height={50 * s} rx={10 * s} />;
  if (mode === "on") return <g fill={ink}>{head}{body}</g>;
  if (mode === "ghost") return <g fill="none" stroke={ink} strokeWidth={3} strokeDasharray="5 5">{head}{body}</g>;
  return <g fill={ink} opacity={0.12}>{head}{body}</g>;
};

/** relative luminance of a #rgb / #rrggbb colour (WCAG) */
export function luminance(hex: string): number {
  const h = hex.replace("#", ""); const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return Number.isFinite(r + g + b) ? 0.2126 * r + 0.7152 * g + 0.0722 * b : 0.2;
}
/** the stage's light card needs a dark-enough accent (≥ 3:1 against white ⇔ luminance ≤ 0.30): a light accent (yellow,
 *  orange, pale gold) falls back to the stage red
 *  (cycle 15: C04-B's yellow ring on a yellow card was the one ring-and-arrow version the operator did not pick) */
export const readableAccent = (accent: string) => (luminance(accent) > 0.3 ? "#E23B57" : accent);

export const SemanticStage: React.FC<{ spec: SemanticCompiled; accent: string; ink: string; cast?: CastBible }> = ({ spec, accent: accentIn, ink, cast }) => {
  const frame = useCurrentFrame();
  const accent = readableAccent(accentIn);
  const firstCue: Record<string, number> = {};
  for (const o of spec.occ || []) if (firstCue[o.cause] == null || o.cue < firstCue[o.cause]) firstCue[o.cause] = o.cue;
  if (spec.type === "H" || !spec.entities.length) {
    const op = interpolate(frame, [6, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: op }}>
        <div style={{ maxWidth: 1400, padding: "48px 64px", borderRadius: 32, background: "rgba(255,255,255,0.86)", textAlign: "center", fontFamily: "Inter, Arial, sans-serif", fontWeight: 900, fontSize: 76, lineHeight: 1.12, color: ink }}>
          {spec.text || ""}
          {spec.speaker ? <div style={{ marginTop: 22, fontSize: 40, fontWeight: 800, letterSpacing: 2 }}>— {spec.speaker.toUpperCase()}</div> : null}
        </div>
      </AbsoluteFill>
    );
  }
  const pos = semanticLayout(spec);
  const st = semanticState(spec, frame);
  const { token, pause, change } = spec.timing;
  const causes = new Set(spec.occ.filter((o) => frame >= o.cue - 8).map((o) => o.cause));
  const ent = (id: string) => spec.entities.find((e) => e.id === id)!;
  const at = (id: string) => {
    const p = pos[id], s = st[id];
    if (!p || !s || !s.moveTo || !pos[s.moveTo]) return p;
    const q = pos[s.moveTo], dest = { x: q.x + 200 * q.s, y: q.y + 70 * q.s }; // beside the receiver, not on them
    return { x: p.x + (dest.x - p.x) * s.moveK, y: p.y + (dest.y - p.y) * s.moveK, s: p.s };
  };
  return (
    <AbsoluteFill>
      {/* a soft scrim so the stage reads over any set */}
      <div style={{ position: "absolute", left: 90, right: 90, top: spec.lanes === 2 ? 60 : 130, bottom: spec.lanes === 2 ? 30 : 110, borderRadius: 48, background: "rgba(255,255,255,0.62)" }} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <marker id="semArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={ink} /></marker>
        </defs>
        {spec.lanes === 2 ? <line x1={130} x2={W - 130} y1={565} y2={565} stroke={ink} strokeOpacity={0.3} strokeWidth={4} strokeDasharray="14 14" /> : null}
        {spec.lanes === 2 && spec.laneLabels ? spec.laneLabels.map((t, l) => <Label key={l} x={130} y={l === 0 ? 125 : 610} text={t} ink={ink} s={0.8} anchor="start" />) : null}
        {/* cause → effect: the ring on the cause, the token in flight, then the arc that stays */}
        {spec.occ.map((o, i) => {
          const a = pos[o.cause]; if (!a || frame < o.cue - 8) return null;
          const ring = interpolate(frame, [o.cue - 8, o.cue, o.cue + token + pause + change], [0, 1, 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const tk = ease((frame - o.cue) / token);
          const ha = halfH(ent(o.cause).kind, a.s);
          return (
            <g key={i}>
              <circle cx={a.x} cy={a.y} r={ha + 30} fill="none" stroke={accent} strokeWidth={12} opacity={ring} />
              {o.effects.map((f, j) => {
                const b = pos[f.entity]; if (!b || f.entity === o.cause || frame < o.cue) return null;
                const hb = halfH(ent(f.entity).kind, b.s);
                const same = Math.abs(a.y - b.y) < 2;
                const ax = a.x, ay = same ? a.y - ha - 10 : a.y + (b.y > a.y ? ha : -ha);
                const bx = b.x, by = same ? b.y - hb - 10 : b.y + (b.y > a.y ? -hb : hb);
                const qx = (ax + bx) / 2, qy = same ? Math.min(ay, by) - 90 : (ay + by) / 2;
                const x = (1 - tk) * (1 - tk) * ax + 2 * (1 - tk) * tk * qx + tk * tk * bx;
                const y = (1 - tk) * (1 - tk) * ay + 2 * (1 - tk) * tk * qy + tk * tk * by;
                return (
                  <g key={j}>
                    <path d={`M ${ax} ${ay} Q ${qx} ${qy} ${bx} ${by}`} fill="none" stroke={ink} strokeOpacity={0.55 * Math.min(1, tk * 1.5)} strokeWidth={6} markerEnd={tk >= 1 ? "url(#semArrow)" : undefined} />
                    {tk < 1 ? <circle cx={x} cy={y} r={22} fill={accent} /> : null}
                  </g>
                );
              })}
            </g>
          );
        })}
        {spec.entities.map((e) => {
          const p = pos[e.id], s = st[e.id]; if (!p || !s) return null;
          if (e.kind === "stock") {
            const h = SIZE.stockH * p.s, w = SIZE.stockW * p.s, inner = h - 20;
            const top = p.y - h / 2, floor = top + h - 10;
            const changed = Math.abs(s.value - s.value0) > 0.02;
            return (
              <g key={e.id}>
                <rect x={p.x - w / 2} y={top} width={w} height={h} rx={22 * p.s} fill="#FFFFFF" stroke={ink} strokeWidth={8} />
                <rect x={p.x - w / 2 + 10} y={floor - inner * s.value} width={w - 20} height={inner * s.value} rx={12 * p.s} fill={ink} fillOpacity={0.82} />
                {changed ? <line x1={p.x - w / 2 - 18} x2={p.x + w / 2 + 18} y1={floor - inner * s.value0} y2={floor - inner * s.value0} stroke={ink} strokeWidth={5} strokeDasharray="12 10" /> : null}
                <Label x={p.x} y={top + h + 52 * p.s} text={e.label} ink={ink} s={p.s} />
              </g>
            );
          }
          if (e.kind === "group") {
            const n = Math.round(s.value * 10), n0 = Math.round(s.value0 * 10), gap = 40 * p.s;
            return (
              <g key={e.id}>
                {Array.from({ length: 10 }, (_, k) => <Figure key={k} x={p.x - 4.5 * gap + k * gap} y={p.y} s={p.s} ink={ink} mode={k < n ? "on" : k < n0 ? "ghost" : "off"} />)}
                <Label x={p.x} y={p.y + 100 * p.s} text={e.label} ink={ink} s={p.s} />
              </g>
            );
          }
          if (e.kind === "object") {
            const q = at(e.id)!;
            const moved = !!s.moveTo && s.moveK > 0.02;
            const gone = s.vis0 > 0.5 && s.vis < 0.98, r = 150 * p.s;
            return (
              <g key={e.id}>
                {moved || gone ? <rect x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} rx={30} fill="none" stroke={ink} strokeWidth={5} strokeDasharray="14 12" opacity={0.75} /> : null}
                {moved ? <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={ink} strokeWidth={5} strokeDasharray="2 14" strokeLinecap="round" opacity={0.7} /> : null}
                <Label x={p.x} y={p.y + r + 50 * p.s} text={e.label} ink={ink} s={p.s} />
              </g>
            );
          }
          if (e.kind === "person") return <Label key={e.id} x={p.x} y={p.y + halfH("person", p.s) + 52 * p.s} text={e.label} ink={ink} s={p.s} />;
          return null;
        })}
      </svg>
      {/* icons and people are components of their own, placed over the stage (opacity = presence) */}
      {spec.entities.map((e) => {
        const p = pos[e.id], s = st[e.id]; if (!p || !s) return null;
        // the cause lights up WHEN it is marked (grey before its first cue), so the colour change is part of the event
        // (cycle 15, operator preferences: the liked versions switched the accent on with the cause)
        const acc = causes.has(e.id) && frame >= (firstCue[e.id] ?? 0) ? accent : NEUTRAL;
        if (e.kind === "object" && e.glyph) {
          const q = at(e.id)!;
          const crack = s.broken ? (
            <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
              <path d={`M ${q.x - 110 * p.s} ${q.y - 120 * p.s} L ${q.x - 10 * p.s} ${q.y - 20 * p.s} L ${q.x - 50 * p.s} ${q.y + 20 * p.s} L ${q.x + 100 * p.s} ${q.y + 120 * p.s}`} stroke="#FFFFFF" strokeWidth={22} fill="none" strokeLinecap="round" />
              <path d={`M ${q.x - 110 * p.s} ${q.y - 120 * p.s} L ${q.x - 10 * p.s} ${q.y - 20 * p.s} L ${q.x - 50 * p.s} ${q.y + 20 * p.s} L ${q.x + 100 * p.s} ${q.y + 120 * p.s}`} stroke={ink} strokeWidth={8} fill="none" strokeLinecap="round" />
            </svg>
          ) : null;
          if ((HAND_PROPS as Record<string, unknown>)[e.glyph]) {
            return (
              <AbsoluteFill key={e.id}>
                <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, opacity: s.vis }}>
                  <g transform={`translate(${q.x} ${q.y}) scale(${3.2 * p.s * (1 - 0.3 * (s.moveTo ? s.moveK : 0))})`}><HeldProp prop={e.glyph as HandProp} ink={ink} accent={acc} /></g>
                </svg>
                {crack}
              </AbsoluteFill>
            );
          }
          return (
            <AbsoluteFill key={e.id}>
              <AbsoluteFill style={{ opacity: s.vis }}>
                <Motif spec={{ type: e.glyph, x: q.x, y: q.y, scale: SIZE.icon * p.s * (1 - 0.3 * (s.moveTo ? s.moveK : 0)), at: 0, enter: "none", arc: "none" } as any} accent={acc} ink={ink} />
              </AbsoluteFill>
              {crack}
            </AbsoluteFill>
          );
        }
        if (e.kind === "person") {
          const cv = (e.cast && cast && cast[e.cast] && cast[e.cast]!.variant) || {};
          const v = { ...DEFAULT_VARIANT, ...cv, ...(s.mood ? { expression: s.mood } : {}) } as VariantSpec;
          const w = SIZE.person * p.s;
          return (
            <div key={e.id} style={{ position: "absolute", left: p.x - w / 2, top: p.y - w * 0.75, opacity: 0.15 + 0.85 * s.vis }}>
              <Everyman variant={v} pose={pose("idle", frame, 30)} width={w} body="bust" />
            </div>
          );
        }
        return null;
      })}
    </AbsoluteFill>
  );
};
