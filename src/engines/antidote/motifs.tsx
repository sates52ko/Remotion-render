import React from "react";
import { interpolate, random, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { enter } from "./movements";
import { ANTIDOTE_FONT } from "./components/KineticText";
import type { PropSpec } from "./schema";

/**
 * motifs.tsx — the visual-metaphor library of the Antidote engine.
 *
 * Before this file the prop system drew exactly two things (money rain and an
 * arrow); coin / book / shape returned null. A book-summary channel lives on
 * metaphor — growth, balance, time, doors, mazes, crowds — so every abstract
 * beat now has a concrete thing to show, and the `insert` shot has something
 * worth cutting to.
 *
 * Every motif is a pure function of the local frame, drawn in flat vector at a
 * nominal 520×520 box, centered on (spec.x, spec.y) and multiplied by spec.scale.
 */

const BOX = 520;

type MotifProps = { spec: PropSpec; accent: string; ink: string };

/** Shared positioning wrapper: centers the motif and applies its enter animation. */
const Frame: React.FC<{ spec: PropSpec; children: React.ReactNode; w?: number; h?: number }> = ({ spec, children, w = BOX, h = BOX }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = enter(spec.enter, frame, fps);
  if (t.opacity <= 0) return null;
  const isSec = !!spec.isSecondaryAnchor;
  return (
    <div
      style={{
        position: "absolute",
        left: spec.x,
        top: spec.y,
        width: w,
        height: h,
        marginLeft: -w / 2,
        marginTop: -h / 2,
        opacity: isSec ? t.opacity * 0.42 : t.opacity,
        transform: `translate(${t.tx}px, ${t.ty}px) scale(${(spec.scale || 1) * t.scale * (isSec ? 0.72 : 1)})`,
        transformOrigin: "center",
        filter: isSec ? "blur(0.5px)" : undefined,
        pointerEvents: "none",
      }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
        {children}
      </svg>
    </div>
  );
};

/** 0→1 progress over `frames`, eased — the standard "draw yourself in" ramp. */
const draw = (frame: number, frames = 34, delay = 0) =>
  interpolate(frame - delay, [0, frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

/** N-point star / impact-burst polygon points (shared by the star icon and the
 *  crash impact). rO = outer radius, rI = inner radius. */
function spikes(cx: number, cy: number, rO: number, rI: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rO : rI;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(" ");
}

// ── growth / data ───────────────────────────────────────────────────────────
const BarChart: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(3, Math.min(7, Math.round(spec.value ?? 5)));
  const gap = 26;
  const bw = (BOX - gap * (n - 1)) / n;
  return (
    <Frame spec={spec}>
      <line x1={0} y1={BOX} x2={BOX} y2={BOX} stroke={ink} strokeWidth={8} strokeLinecap="round" opacity={0.35} />
      {Array.from({ length: n }).map((_, i) => {
        const target = BOX * (0.24 + (i / (n - 1)) * 0.68);
        const s = spring({ frame, fps, delay: 6 + i * 5, config: { damping: 12, stiffness: 140, mass: 0.6 } });
        const h = target * s;
        return <rect key={i} x={i * (bw + gap)} y={BOX - h} width={bw} height={h} rx={10} fill={i === n - 1 ? accent : ink} opacity={i === n - 1 ? 1 : 0.72} />;
      })}
    </Frame>
  );
};

const LineGrowth: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 46, 4);
  const path = `M10,470 L120,392 L212,418 L318,258 L410,196 L508,54`;
  const LEN = 780;
  const head = { x: interpolate(p, [0, 1], [10, 508]), y: interpolate(p, [0, 1], [470, 54], { easing: Easing.in(Easing.quad) }) };
  return (
    <Frame spec={spec}>
      <g stroke={ink} strokeWidth={5} opacity={0.2}>
        {[130, 250, 370].map((y) => <line key={y} x1={0} y1={y} x2={BOX} y2={y} />)}
      </g>
      <path d={path} fill="none" stroke={accent} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={LEN} strokeDashoffset={LEN * (1 - p)} />
      {p > 0.96 ? <circle cx={508} cy={54} r={18} fill={accent} /> : <circle cx={head.x} cy={head.y} r={13} fill={accent} opacity={0.9} />}
    </Frame>
  );
};

const Counter: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const target = spec.value ?? 100;
  const p = draw(frame, 40, 3);
  const shown = Math.round(target * p);
  return (
    <Frame spec={spec}>
      <text x={BOX / 2} y={BOX / 2 + 10} textAnchor="middle" dominantBaseline="middle"
        fontFamily={ANTIDOTE_FONT} fontWeight={800} fontSize={188} fill={accent}>
        {shown.toLocaleString("en-US")}
      </text>
      {spec.label ? (
        <text x={BOX / 2} y={BOX / 2 + 148} textAnchor="middle" fontFamily={ANTIDOTE_FONT} fontWeight={700} fontSize={62} fill={ink} opacity={0.72}>
          {spec.label}
        </text>
      ) : null}
    </Frame>
  );
};

const Stack: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(3, Math.min(6, Math.round(spec.value ?? 5)));
  const bh = 62;
  return (
    <Frame spec={spec}>
      {Array.from({ length: n }).map((_, i) => {
        const s = spring({ frame, fps, delay: 4 + i * 7, config: { damping: 11, stiffness: 150 } });
        const y = BOX - (i + 1) * (bh + 10);
        const w = BOX - i * 34;
        return (
          <rect key={i} x={(BOX - w) / 2} y={interpolate(s, [0, 1], [y - 260, y])} width={w} height={bh} rx={12}
            fill={i === n - 1 ? accent : ink} opacity={i === n - 1 ? 1 : 0.78 - i * 0.06} />
        );
      })}
    </Frame>
  );
};

// ── choice / tension ────────────────────────────────────────────────────────
const Balance: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, delay: 10, config: { damping: 9, stiffness: 70, mass: 1.1 } });
  const tilt = interpolate(s, [0, 1], [0, 14]);
  const arm = (dx: number) => ({ x: BOX / 2 + dx, y: 200 + (dx > 0 ? 1 : -1) * Math.tan((tilt * Math.PI) / 180) * Math.abs(dx) });
  const L = arm(-180), R = arm(180);
  return (
    <Frame spec={spec}>
      <rect x={BOX / 2 - 12} y={190} width={24} height={280} rx={10} fill={ink} opacity={0.85} />
      <path d={`M${BOX / 2 - 110},490 L${BOX / 2 + 110},490 L${BOX / 2 + 78},452 L${BOX / 2 - 78},452 Z`} fill={ink} opacity={0.85} />
      <g transform={`rotate(${tilt} ${BOX / 2} 200)`}>
        <line x1={BOX / 2 - 190} y1={200} x2={BOX / 2 + 190} y2={200} stroke={ink} strokeWidth={16} strokeLinecap="round" />
      </g>
      <g>
        <line x1={L.x} y1={L.y} x2={L.x} y2={L.y + 64} stroke={ink} strokeWidth={6} />
        <path d={`M${L.x - 66},${L.y + 64} L${L.x + 66},${L.y + 64} L${L.x + 44},${L.y + 118} L${L.x - 44},${L.y + 118} Z`} fill={ink} opacity={0.7} />
        <line x1={R.x} y1={R.y} x2={R.x} y2={R.y + 64} stroke={ink} strokeWidth={6} />
        <path d={`M${R.x - 66},${R.y + 64} L${R.x + 66},${R.y + 64} L${R.x + 44},${R.y + 118} L${R.x - 44},${R.y + 118} Z`} fill={accent} />
      </g>
    </Frame>
  );
};

const Maze: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 58, 6);
  const path = "M60,60 L60,200 L200,200 L200,80 L340,80 L340,260 L120,260 L120,400 L300,400 L300,320 L460,320 L460,460";
  const LEN = 1560;
  return (
    <Frame spec={spec}>
      <g stroke={ink} strokeWidth={10} opacity={0.16} fill="none" strokeLinecap="square">
        <rect x={20} y={20} width={480} height={480} />
        <line x1={140} y1={20} x2={140} y2={150} /><line x1={260} y1={140} x2={400} y2={140} />
        <line x1={20} y1={330} x2={180} y2={330} /><line x1={380} y1={200} x2={380} y2={300} />
        <line x1={240} y1={380} x2={240} y2={500} />
      </g>
      <path d={path} fill="none" stroke={accent} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={LEN} strokeDashoffset={LEN * (1 - p)} />
      <circle cx={60} cy={60} r={16} fill={ink} opacity={0.6} />
      <circle cx={460} cy={460} r={18} fill={accent} opacity={p > 0.95 ? 1 : 0.25} />
    </Frame>
  );
};

const Crack: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 26, 2);
  const branches = [
    "M260,20 L248,150 L286,258 L262,392 L292,500",
    "M248,150 L140,214 L96,300",
    "M286,258 L406,300 L452,392",
    "M262,392 L156,442",
  ];
  return (
    <Frame spec={spec}>
      <rect x={40} y={20} width={440} height={480} rx={18} fill={ink} opacity={0.12} />
      {branches.map((d, i) => {
        const q = draw(frame, 20, 2 + i * 5);
        return <path key={i} d={d} fill="none" stroke={accent} strokeWidth={i === 0 ? 14 : 9} strokeLinecap="round"
          strokeDasharray={600} strokeDashoffset={600 * (1 - q)} />;
      })}
      <circle cx={260} cy={20} r={10 + p * 6} fill={accent} opacity={0.5} />
    </Frame>
  );
};

// ── time / opportunity ──────────────────────────────────────────────────────
const Clock: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 30);
  const minute = frame * 6;
  const hour = frame * 0.5;
  return (
    <Frame spec={spec}>
      <circle cx={260} cy={260} r={222} fill="none" stroke={ink} strokeWidth={16} opacity={0.85}
        strokeDasharray={1396} strokeDashoffset={1396 * (1 - p)} transform="rotate(-90 260 260)" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={260 + Math.cos(a) * 188} y1={260 + Math.sin(a) * 188}
          x2={260 + Math.cos(a) * 208} y2={260 + Math.sin(a) * 208} stroke={ink} strokeWidth={i % 3 === 0 ? 10 : 5} strokeLinecap="round" opacity={0.5} />;
      })}
      <line x1={260} y1={260} x2={260 + Math.cos(((hour - 90) * Math.PI) / 180) * 108} y2={260 + Math.sin(((hour - 90) * Math.PI) / 180) * 108}
        stroke={ink} strokeWidth={16} strokeLinecap="round" />
      <line x1={260} y1={260} x2={260 + Math.cos(((minute - 90) * Math.PI) / 180) * 168} y2={260 + Math.sin(((minute - 90) * Math.PI) / 180) * 168}
        stroke={accent} strokeWidth={11} strokeLinecap="round" />
      <circle cx={260} cy={260} r={16} fill={accent} />
    </Frame>
  );
};

const Door: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, delay: 8, config: { damping: 14, stiffness: 60 } });
  const openW = interpolate(s, [0, 1], [190, 34]);
  return (
    <Frame spec={spec}>
      <path d="M120,60 L400,60 L400,500 L120,500 Z" fill={accent} opacity={interpolate(s, [0, 1], [0, 0.9])} />
      <path d={`M120,60 L400,60 L400,500 L120,500 Z`} fill="none" stroke={ink} strokeWidth={12} />
      <g>
        <rect x={120} y={60} width={openW} height={440} fill={ink} opacity={0.9} />
        <circle cx={120 + openW - 22} cy={300} r={11} fill={accent} opacity={openW > 60 ? 1 : 0} />
      </g>
      <path d={`M${120 + openW},60 L400,60 L400,500 L${120 + openW},500 Z`} fill="none" stroke={ink} strokeWidth={6} opacity={0.25} />
    </Frame>
  );
};

const Spotlight: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 26);
  const sway = Math.sin(frame * 0.03) * 16;
  return (
    <Frame spec={spec}>
      <defs>
        <linearGradient id="antidote-spot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.85} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <g transform={`rotate(${sway} 260 40)`} opacity={p}>
        <path d="M228,40 L292,40 L432,470 L88,470 Z" fill="url(#antidote-spot)" />
        <rect x={214} y={4} width={92} height={44} rx={10} fill={ink} />
      </g>
      <ellipse cx={260} cy={478} rx={176 * p} ry={30 * p} fill={accent} opacity={0.4} />
    </Frame>
  );
};

const Summit: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 48, 6);
  const climber = { x: interpolate(p, [0, 1], [96, 262]), y: interpolate(p, [0, 1], [472, 132]) };
  return (
    <Frame spec={spec}>
      <path d="M20,490 L180,240 L262,330 L360,120 L500,490 Z" fill={ink} opacity={0.85} />
      <path d="M360,120 L418,290 L302,290 Z" fill={accent} opacity={0.9} />
      <g opacity={p > 0.92 ? 1 : 0.35}>
        <line x1={360} y1={120} x2={360} y2={44} stroke={ink} strokeWidth={9} strokeLinecap="round" />
        <path d="M360,44 L432,66 L360,90 Z" fill={accent} />
      </g>
      <circle cx={climber.x} cy={climber.y} r={15} fill={accent} />
    </Frame>
  );
};

const Ladder: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(4, Math.min(8, Math.round(spec.value ?? 6)));
  const top = 40, bottom = 490;
  const step = (bottom - top) / n;
  const railP = draw(frame, 24);
  return (
    <Frame spec={spec}>
      <line x1={150} y1={bottom} x2={150} y2={interpolate(railP, [0, 1], [bottom, top])} stroke={ink} strokeWidth={16} strokeLinecap="round" />
      <line x1={370} y1={bottom} x2={370} y2={interpolate(railP, [0, 1], [bottom, top])} stroke={ink} strokeWidth={16} strokeLinecap="round" />
      {Array.from({ length: n }).map((_, i) => {
        const y = bottom - (i + 0.5) * step;
        const s = spring({ frame, fps, delay: 14 + i * 6, config: { damping: 13, stiffness: 170 } });
        return <line key={i} x1={150} y1={y} x2={interpolate(s, [0, 1], [150, 370])} y2={y}
          stroke={i === n - 1 ? accent : ink} strokeWidth={13} strokeLinecap="round" opacity={i === n - 1 ? 1 : 0.8} />;
      })}
    </Frame>
  );
};

// ── ambient / abstract ──────────────────────────────────────────────────────
const Orbit: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 24);
  const rings = [
    { r: 120, speed: 0.035, n: 3 },
    { r: 182, speed: -0.022, n: 4 },
    { r: 240, speed: 0.014, n: 5 },
  ];
  return (
    <Frame spec={spec}>
      <circle cx={260} cy={260} r={44 * p} fill={accent} />
      {rings.map((ring, ri) => (
        <g key={ri}>
          <circle cx={260} cy={260} r={ring.r} fill="none" stroke={ink} strokeWidth={4} opacity={0.18 * p} />
          {Array.from({ length: ring.n }).map((_, i) => {
            const a = frame * ring.speed + (i / ring.n) * Math.PI * 2;
            return <circle key={i} cx={260 + Math.cos(a) * ring.r} cy={260 + Math.sin(a) * ring.r} r={13} fill={ink} opacity={0.7 * p} />;
          })}
        </g>
      ))}
    </Frame>
  );
};

const Ripple: React.FC<MotifProps> = ({ spec, accent }) => {
  const frame = useCurrentFrame();
  const rings = 4;
  const period = 46;
  return (
    <Frame spec={spec}>
      {Array.from({ length: rings }).map((_, i) => {
        const t = ((frame + i * (period / rings)) % period) / period;
        return <circle key={i} cx={260} cy={260} r={30 + t * 230} fill="none" stroke={accent}
          strokeWidth={interpolate(t, [0, 1], [16, 3])} opacity={interpolate(t, [0, 1], [0.85, 0])} />;
      })}
      <circle cx={260} cy={260} r={22} fill={accent} />
    </Frame>
  );
};

const Shape: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 22);
  return (
    <Frame spec={spec}>
      <g transform={`rotate(${frame * 0.28} 260 260)`}>
        <rect x={120} y={120} width={280} height={280} rx={40} fill="none" stroke={ink} strokeWidth={12} opacity={0.35 * p} />
      </g>
      <g transform={`rotate(${-frame * 0.42} 260 260)`}>
        <path d="M260,110 L410,370 L110,370 Z" fill="none" stroke={accent} strokeWidth={14} strokeLinejoin="round" opacity={p} />
      </g>
      <circle cx={260} cy={260} r={54 * p} fill={accent} opacity={0.9} />
    </Frame>
  );
};

// ── objects ─────────────────────────────────────────────────────────────────
const Coin: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const spin = Math.abs(Math.cos(frame * 0.09));
  const bobY = Math.sin(frame * 0.06) * 14;
  return (
    <Frame spec={spec}>
      <g transform={`translate(0 ${bobY})`}>
        <ellipse cx={260} cy={280} rx={168 * spin + 6} ry={168} fill={accent} />
        <ellipse cx={260} cy={280} rx={(168 * spin + 6) * 0.76} ry={128} fill="none" stroke={ink} strokeWidth={9} opacity={0.35} />
        {spin > 0.34 ? (
          <text x={260} y={280} textAnchor="middle" dominantBaseline="middle" fontFamily={ANTIDOTE_FONT}
            fontWeight={800} fontSize={150 * spin} fill={ink} opacity={0.75}>$</text>
        ) : null}
      </g>
      <ellipse cx={260} cy={480} rx={110} ry={20} fill={ink} opacity={0.16} />
    </Frame>
  );
};

const Book: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, delay: 6, config: { damping: 13, stiffness: 90 } });
  const open = interpolate(s, [0, 1], [0, 1]);
  const lift = interpolate(open, [0, 1], [0, -18]);
  return (
    <Frame spec={spec}>
      <g transform={`translate(0 ${lift})`}>
        <path d={`M260,180 Q${260 - 220 * open},${150 - 20 * open} ${260 - 230 * open},${330}`} fill={accent} opacity={0.95} />
        <path d={`M260,180 Q${260 + 220 * open},${150 - 20 * open} ${260 + 230 * open},${330}`} fill={accent} opacity={0.8} />
        <path d={`M${260 - 230 * open},330 Q260,${372} ${260 + 230 * open},330 L260,392 Z`} fill={ink} opacity={0.82} />
        <rect x={252} y={175} width={16} height={215} rx={6} fill={ink} opacity={0.7} />
        {open > 0.6 ? (
          <g stroke={ink} strokeWidth={7} strokeLinecap="round" opacity={0.3}>
            {[236, 268, 300].map((y, i) => (
              <React.Fragment key={y}>
                <line x1={80 + i * 6} y1={y} x2={228} y2={y} />
                <line x1={292} y1={y} x2={440 - i * 6} y2={y} />
              </React.Fragment>
            ))}
          </g>
        ) : null}
      </g>
    </Frame>
  );
};

const Arrow: React.FC<MotifProps> = ({ spec, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = enter(spec.enter === "none" ? "pop" : spec.enter, frame, fps);
  const dash = interpolate(t.scale, [0, 1], [400, 0]);
  return (
    <div style={{ position: "absolute", left: spec.x, top: spec.y, transform: "translate(-50%,-50%)", opacity: t.opacity }}>
      <svg width={360 * spec.scale} height={200 * spec.scale} viewBox="0 0 360 200" style={{ overflow: "visible" }}>
        <path d="M20,150 Q180,20 320,90" fill="none" stroke={accent} strokeWidth={18}
          strokeLinecap="round" strokeDasharray={400} strokeDashoffset={dash} />
        <path d="M300,60 L336,92 L292,116 Z" fill={accent} opacity={t.scale > 0.85 ? 1 : 0} />
      </svg>
    </div>
  );
};

const MoneyRain: React.FC<MotifProps> = ({ spec }) => {
  const frame = useCurrentFrame();
  const bills = 16;
  return (
    <div style={{ position: "absolute", left: spec.x, top: spec.y, transform: "translate(-50%,-50%)", width: 900, height: 700 }}>
      {Array.from({ length: bills }).map((_, i) => {
        const seedX = random(`x${i}`) * 900 - 450;
        const speed = 90 + random(`s${i}`) * 90;
        const y = ((frame * (speed / 60) + random(`o${i}`) * 700) % 780) - 390;
        const rot = (frame * (1 + random(`r${i}`))) % 360;
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: 450 + seedX, top: 390 + y,
              width: 74, height: 40, borderRadius: 7,
              background: spec.color || "#7FB77E", border: "2px solid #2f6b3a",
              transform: `rotate(${rot}deg)`, display: "flex", alignItems: "center", justifyContent: "center",
              color: "#215a2b", fontWeight: 900, fontFamily: "Arial Black, sans-serif", fontSize: 24,
            }}
          >
            $
          </div>
        );
      })}
    </div>
  );
};

// ── SCENE ICONS (concrete narrative nouns/events) ───────────────────────────
// Not metaphors — the literal SUBJECT of a beat. Recognizable flat pictograms so
// "she survived the crash" shows a crash, not two talking heads. Same pure-frame
// / flat-vector / accent+ink model as the motifs above. A warm highlight (#F7D774)
// is reused for "light" accents (window glow, flame core, spark).
const GLOW = "#F7D774";
const PAPER_ICON = "#F1EFE9";

const Home: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 30, 2);
  const roof = draw(frame, 22, 0);
  const lit = frame > 26 ? 1 : 0;
  return (
    <Frame spec={spec}>
      <rect x={130} y={250} width={260} height={210} rx={8} fill={ink} opacity={0.9 * p} />
      <path d="M104,262 L260,140 L416,262 Z" fill={accent} opacity={roof} transform={`translate(0 ${(1 - roof) * -30})`} />
      <rect x={236} y={352} width={64} height={108} rx={6} fill={accent} opacity={p} />
      <rect x={168} y={300} width={56} height={56} rx={6} fill={lit ? GLOW : ink} opacity={0.9} />
    </Frame>
  );
};

const Family: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const person = (cx: number, cy: number, s: number, fill: string, delay: number) => {
    const sp = spring({ frame, fps, delay, config: { damping: 12, stiffness: 150 } });
    return (
      <g key={cx} transform={`translate(${cx} ${cy + (1 - sp) * 40})`} opacity={sp}>
        <circle cx={0} cy={-70 * s} r={38 * s} fill={fill} />
        <path d={`M${-46 * s},${70 * s} Q0,${-14 * s} ${46 * s},${70 * s} Z`} fill={fill} />
      </g>
    );
  };
  return (
    <Frame spec={spec}>
      {person(150, 300, 1.15, ink, 2)}
      {person(376, 300, 1.15, ink, 8)}
      {person(266, 344, 0.82, accent, 14)}
    </Frame>
  );
};

const Star: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 9, stiffness: 170 } });
  const tw = 0.85 + Math.sin(frame * 0.15) * 0.15;
  return (
    <Frame spec={spec}>
      <g stroke={accent} strokeWidth={10} strokeLinecap="round" opacity={0.5 * sp}>
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          const r0 = 172, r1 = 172 + 48 * tw;
          return <line key={i} x1={260 + Math.cos(a) * r0} y1={250 + Math.sin(a) * r0} x2={260 + Math.cos(a) * r1} y2={250 + Math.sin(a) * r1} />;
        })}
      </g>
      <g transform={`translate(260 250) scale(${0.7 + sp * 0.3}) translate(-260 -250)`}>
        <polygon points={spikes(260, 250, 138, 56, 5)} fill={accent} opacity={sp} />
      </g>
    </Frame>
  );
};

const Heart: React.FC<MotifProps> = ({ spec, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 10, stiffness: 160 } });
  const beat = 1 + Math.max(0, Math.sin(frame * 0.35)) * 0.06;
  return (
    <Frame spec={spec}>
      <g transform={`translate(260 300) scale(${sp * beat}) translate(-260 -300)`}>
        <path d="M260,432 C118,330 118,198 210,180 C256,171 260,216 260,216 C260,216 264,171 310,180 C402,198 402,330 260,432 Z" fill={accent} />
      </g>
    </Frame>
  );
};

const Road: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 34, 2);
  const N = 5;
  return (
    <Frame spec={spec}>
      <path d="M150,470 L232,150 L288,150 L370,470 Z" fill={ink} opacity={0.9 * p} />
      {Array.from({ length: N }).map((_, i) => {
        const tt = i / N;
        const y = interpolate(tt, [0, 1], [452, 172]);
        const w = interpolate(tt, [0, 1], [26, 6]);
        const h = interpolate(tt, [0, 1], [40, 12]);
        return <rect key={i} x={260 - w / 2} y={y - h} width={w} height={h} rx={3} fill={accent} opacity={p > tt ? 1 : 0} />;
      })}
      <circle cx={260} cy={150} r={22 * p} fill={accent} opacity={0.85} />
    </Frame>
  );
};

const Storm: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 26, 2);
  return (
    <Frame spec={spec}>
      <g fill={ink} opacity={0.9 * p}>
        <circle cx={200} cy={212} r={64} /><circle cx={282} cy={188} r={84} /><circle cx={358} cy={214} r={62} />
        <rect x={196} y={214} width={166} height={64} rx={30} />
      </g>
      <g stroke={accent} strokeWidth={9} strokeLinecap="round">
        {Array.from({ length: 5 }).map((_, i) => {
          const x = 192 + i * 42;
          const y = 300 + ((frame * 8 + i * 30) % 130);
          return <line key={i} x1={x} y1={y} x2={x - 12} y2={y + 32} opacity={y < 468 ? 0.8 : 0} />;
        })}
      </g>
      <path d="M300,298 L266,372 L300,372 L260,452 L342,350 L306,350 L332,298 Z" fill={GLOW} opacity={Math.sin(frame * 0.4) > 0.5 ? 1 : 0.25} />
    </Frame>
  );
};

const School: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 150 } });
  const swing = Math.sin(frame * 0.12) * 8;
  return (
    <Frame spec={spec}>
      <g opacity={sp} transform={`translate(0 ${(1 - sp) * -24})`}>
        <polygon points="260,170 430,240 260,310 90,240" fill={ink} />
        <path d="M170,276 L170,340 Q260,392 350,340 L350,276" fill={accent} />
        <circle cx={260} cy={240} r={14} fill={accent} />
        <line x1={260} y1={240} x2={360 + swing} y2={240} stroke={accent} strokeWidth={6} />
        <line x1={360 + swing} y1={240} x2={360 + swing} y2={330} stroke={accent} strokeWidth={6} />
        <circle cx={360 + swing} cy={336} r={12} fill={accent} />
      </g>
    </Frame>
  );
};

const Phone: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const bub = spring({ frame, fps, delay: 16, config: { damping: 9, stiffness: 180 } });
  return (
    <Frame spec={spec}>
      <g opacity={sp}>
        <rect x={196} y={150} width={168} height={300} rx={28} fill={ink} />
        <rect x={214} y={186} width={132} height={210} rx={8} fill={PAPER_ICON} />
        <circle cx={280} cy={424} r={12} fill={PAPER_ICON} />
      </g>
      <g transform={`translate(300 210) scale(${bub})`} opacity={bub}>
        <rect x={0} y={-40} width={150} height={92} rx={20} fill={accent} />
        <path d="M20,52 L20,86 L54,52 Z" fill={accent} />
        <g fill={PAPER_ICON}><circle cx={44} cy={6} r={10} /><circle cx={78} cy={6} r={10} /><circle cx={112} cy={6} r={10} /></g>
      </g>
    </Frame>
  );
};

const Ledge: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 30, 2);
  const sway = Math.sin(frame * 0.08) * 4;
  return (
    <Frame spec={spec}>
      <rect x={70} y={150} width={210} height={340} fill={ink} opacity={0.92 * p} />
      <g stroke={ink} strokeWidth={5} opacity={0.22}>
        {Array.from({ length: 5 }).map((_, i) => <line key={i} x1={290} y1={190 + i * 60} x2={454} y2={210 + i * 60} />)}
      </g>
      <g transform={`translate(${250 + sway} 150)`} opacity={p}>
        <circle cx={0} cy={-40} r={20} fill={accent} />
        <rect x={-14} y={-24} width={28} height={54} rx={10} fill={accent} />
      </g>
      <g stroke={accent} strokeWidth={6} strokeLinecap="round" opacity={0.6}>
        <line x1={300} y1={118} x2={382} y2={118} /><line x1={322} y1={148} x2={422} y2={148} />
      </g>
    </Frame>
  );
};

const Medical: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 150 } });
  const pulse = draw(frame, 40, 10);
  const LEN = 560;
  return (
    <Frame spec={spec}>
      <g transform={`translate(260 206) scale(${sp})`}>
        <circle cx={0} cy={0} r={96} fill={accent} />
        <rect x={-22} y={-56} width={44} height={112} rx={8} fill={PAPER_ICON} />
        <rect x={-56} y={-22} width={112} height={44} rx={8} fill={PAPER_ICON} />
      </g>
      <path d="M60,390 L170,390 L200,330 L242,460 L282,390 L460,390" fill="none" stroke={ink}
        strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - pulse)} opacity={0.85} />
    </Frame>
  );
};

const Grave: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  return (
    <Frame spec={spec}>
      <path d="M70,440 Q260,388 450,440 L450,470 L70,470 Z" fill={ink} opacity={0.82} />
      <g opacity={sp} transform={`translate(0 ${(1 - sp) * 24})`}>
        <path d="M186,442 L186,250 Q260,168 334,250 L334,442 Z" fill={ink} />
        <rect x={250} y={276} width={20} height={96} rx={4} fill={accent} />
        <rect x={224} y={300} width={72} height={20} rx={4} fill={accent} />
      </g>
      <circle cx={150} cy={430} r={14} fill={accent} opacity={sp} />
      <line x1={150} y1={430} x2={150} y2={462} stroke={ink} strokeWidth={5} opacity={sp} />
    </Frame>
  );
};

const Notes: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cols = 4, rows = 3, s = 96, gap = 16;
  const w = cols * s + (cols - 1) * gap, h = rows * s + (rows - 1) * gap;
  const x0 = (BOX - w) / 2, y0 = (BOX - h) / 2;
  return (
    <Frame spec={spec}>
      {Array.from({ length: cols * rows }).map((_, i) => {
        const cx = i % cols, cy = Math.floor(i / cols);
        const sp = spring({ frame, fps, delay: 3 + i * 3, config: { damping: 11, stiffness: 180 } });
        const rot = (random(`n${i}`) - 0.5) * 10;
        const fill = i % 3 === 0 ? accent : ink;
        return (
          <g key={i} transform={`translate(${x0 + cx * (s + gap) + s / 2} ${y0 + cy * (s + gap) + s / 2}) scale(${sp}) rotate(${rot})`} opacity={sp}>
            <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={6} fill={fill} opacity={fill === ink ? 0.8 : 1} />
            <line x1={-s / 2 + 16} y1={-10} x2={s / 2 - 16} y2={-10} stroke={PAPER_ICON} strokeWidth={5} opacity={0.7} />
            <line x1={-s / 2 + 16} y1={12} x2={s / 2 - 28} y2={12} stroke={PAPER_ICON} strokeWidth={5} opacity={0.7} />
          </g>
        );
      })}
    </Frame>
  );
};

const Water: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const p = draw(frame, 30, 2);
  const wave = (y: number, amp: number, ph: number, col: string, op: number) => {
    let d = `M0,${y}`;
    for (let x = 0; x <= BOX; x += 40) d += ` Q${x + 20},${(y + Math.sin((x + frame * 4) * 0.02 + ph) * amp).toFixed(1)} ${x + 40},${y}`;
    d += ` L${BOX},${BOX} L0,${BOX} Z`;
    return <path d={d} fill={col} opacity={op * p} />;
  };
  return (
    <Frame spec={spec}>
      {wave(300, 18, 0, ink, 0.35)}
      {wave(342, 22, 1.4, accent, 0.5)}
      {wave(386, 16, 2.6, ink, 0.72)}
    </Frame>
  );
};

const Fire: React.FC<MotifProps> = ({ spec, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 150 } });
  const flick = 1 + Math.sin(frame * 0.5) * 0.05;
  return (
    <Frame spec={spec}>
      <g transform={`translate(260 300) scale(${sp * flick})`}>
        <path d="M0,-170 C70,-90 96,-30 96,30 C96,110 40,160 0,160 C-40,160 -96,110 -96,30 C-96,-20 -60,-40 -40,-90 C-30,-40 -8,-40 0,-80 C6,-120 0,-170 0,-170 Z" fill={accent} />
        <path d="M0,-40 C34,0 46,40 46,70 C46,120 22,150 0,150 C-22,150 -46,120 -46,70 C-46,36 -20,20 0,-40 Z" fill={GLOW} />
      </g>
    </Frame>
  );
};

const Crash: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 10, stiffness: 160 } });
  const burst = spring({ frame, fps, delay: 8, config: { damping: 8, stiffness: 200 } });
  return (
    <Frame spec={spec}>
      <g opacity={sp} transform={`translate(0 ${(1 - sp) * 20})`}>
        <path d="M120,360 L156,300 L300,300 L340,250 L420,300 L440,360 Z" fill={ink} />
        <rect x={120} y={356} width={320} height={24} rx={8} fill={ink} />
        <circle cx={186} cy={392} r={30} fill={ink} /><circle cx={186} cy={392} r={13} fill={PAPER_ICON} />
        <circle cx={378} cy={392} r={30} fill={ink} /><circle cx={378} cy={392} r={13} fill={PAPER_ICON} />
        <path d="M120,360 L156,300 L150,330 L170,320 L156,352 Z" fill={accent} />
      </g>
      <g transform={`translate(150 300) scale(${burst})`} opacity={burst > 0.05 ? 1 : 0}>
        <polygon points={spikes(0, 0, 96, 40, 10)} fill={accent} />
        <polygon points={spikes(0, 0, 56, 22, 10)} fill={GLOW} />
      </g>
    </Frame>
  );
};

const Tree: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const leafY = (frame * 3) % 220;
  const sway = Math.sin(frame * 0.06) * 6;
  return (
    <Frame spec={spec}>
      <path d="M244,460 L236,300 Q260,286 284,300 L276,460 Z" fill={ink} opacity={sp} />
      <g opacity={sp} transform={`translate(${sway} ${(1 - sp) * -20})`}>
        <circle cx={260} cy={220} r={110} fill={accent} />
        <circle cx={186} cy={250} r={72} fill={accent} opacity={0.9} />
        <circle cx={336} cy={250} r={72} fill={accent} opacity={0.9} />
      </g>
      <circle cx={330 + Math.sin(leafY * 0.05) * 20} cy={250 + leafY} r={9} fill={accent} opacity={leafY < 200 ? 0.8 : 0} />
    </Frame>
  );
};

// ── SCENE ICONS · Phase 2 (next frequency tier) ─────────────────────────────
const Work: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  return (
    <Frame spec={spec}>
      <g opacity={sp} transform={`translate(0 ${(1 - sp) * 24})`}>
        <path d="M214,232 Q260,192 306,232" fill="none" stroke={ink} strokeWidth={16} strokeLinecap="round" />
        <rect x={150} y={244} width={220} height={190} rx={16} fill={ink} />
        <rect x={150} y={318} width={220} height={26} fill={accent} />
        <rect x={244} y={300} width={32} height={62} rx={6} fill={accent} />
      </g>
    </Frame>
  );
};

const Game: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 10, stiffness: 160 } });
  const shine = 0.5 + Math.sin(frame * 0.2) * 0.5;
  return (
    <Frame spec={spec}>
      <g opacity={sp} transform={`translate(260 270) scale(${0.7 + sp * 0.3}) translate(-260 -270)`}>
        <path d="M186,180 L334,180 L320,300 Q260,352 200,300 Z" fill={accent} />
        <path d="M186,196 Q120,196 140,270 Q160,300 200,286" fill="none" stroke={accent} strokeWidth={16} />
        <path d="M334,196 Q400,196 380,270 Q360,300 320,286" fill="none" stroke={accent} strokeWidth={16} />
        <rect x={248} y={330} width={24} height={44} fill={ink} />
        <rect x={196} y={372} width={128} height={26} rx={6} fill={ink} />
        <polygon points={spikes(260, 236, 40, 16, 5)} fill={PAPER_ICON} opacity={0.4 + shine * 0.6} />
      </g>
    </Frame>
  );
};

const War: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const sword = (rot: number) => (
    <g transform={`translate(260 270) rotate(${rot})`}>
      <rect x={-8} y={-150} width={16} height={220} rx={4} fill={ink} />
      <polygon points="-8,-150 8,-150 0,-178" fill={ink} />
      <rect x={-30} y={70} width={60} height={14} rx={4} fill={ink} />
      <rect x={-8} y={84} width={16} height={40} rx={4} fill={ink} />
    </g>
  );
  return (
    <Frame spec={spec}>
      <g opacity={sp}>
        {sword(38)}
        {sword(-38)}
        <path d="M260,200 L340,228 Q340,340 260,384 Q180,340 180,228 Z" fill={accent} />
        <path d="M260,200 L340,228 Q340,340 260,384 Z" fill={ink} opacity={0.18} />
      </g>
    </Frame>
  );
};

const Food: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  return (
    <Frame spec={spec}>
      <g opacity={sp}>
        <circle cx={260} cy={280} r={120} fill={ink} />
        <circle cx={260} cy={280} r={78} fill={PAPER_ICON} />
        <circle cx={260} cy={280} r={44} fill={accent} />
        <g stroke={ink} strokeWidth={10} strokeLinecap="round">
          <line x1={120} y1={172} x2={120} y2={400} />
          <line x1={104} y1={172} x2={104} y2={222} /><line x1={136} y1={172} x2={136} y2={222} />
        </g>
        <rect x={396} y={172} width={16} height={228} rx={6} fill={ink} />
      </g>
    </Frame>
  );
};

const City: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const buildings = [
    { x: 96, w: 74, h: 200 }, { x: 178, w: 62, h: 300 }, { x: 248, w: 84, h: 250 },
    { x: 340, w: 58, h: 340 }, { x: 406, w: 70, h: 220 },
  ];
  return (
    <Frame spec={spec}>
      {buildings.map((b, i) => {
        const sp = spring({ frame, fps, delay: 3 + i * 4, config: { damping: 13, stiffness: 150 } });
        const h = b.h * sp;
        return (
          <g key={i}>
            <rect x={b.x} y={470 - h} width={b.w} height={h} rx={4} fill={i === 3 ? accent : ink} opacity={i === 3 ? 1 : 0.9} />
            {sp > 0.85
              ? Array.from({ length: Math.floor(h / 46) }).map((_, r) =>
                  [0, 1].map((c) => (
                    <rect key={`${r}-${c}`} x={b.x + 12 + c * (b.w - 34)} y={470 - h + 16 + r * 46} width={16} height={22} fill={GLOW} opacity={0.8} />
                  )),
                )
              : null}
          </g>
        );
      })}
    </Frame>
  );
};

const Photo: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
  const rot = (1 - sp) * -8;
  return (
    <Frame spec={spec}>
      <g opacity={sp} transform={`translate(260 280) rotate(${rot}) translate(-260 -280)`}>
        <rect x={140} y={150} width={240} height={260} rx={10} fill={ink} />
        <rect x={162} y={172} width={196} height={166} rx={4} fill={PAPER_ICON} />
        <circle cx={312} cy={210} r={22} fill={accent} />
        <path d="M162,338 L226,270 L280,320 L330,278 L358,306 L358,338 Z" fill={accent} opacity={0.85} />
        <rect x={162} y={356} width={196} height={40} rx={4} fill={PAPER_ICON} opacity={0.5} />
      </g>
    </Frame>
  );
};

const Law: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 150 } });
  const strike = Math.max(0, Math.sin(frame * 0.25)) * 10;
  return (
    <Frame spec={spec}>
      <g opacity={sp} transform={`translate(260 250) rotate(${-18 - strike}) translate(-260 -250)`}>
        <rect x={196} y={150} width={128} height={72} rx={12} fill={ink} />
        <rect x={186} y={150} width={16} height={72} rx={4} fill={accent} />
        <rect x={318} y={150} width={16} height={72} rx={4} fill={accent} />
        <rect x={250} y={218} width={20} height={150} rx={8} fill={ink} />
      </g>
      <rect x={170} y={392} width={180} height={26} rx={8} fill={accent} opacity={sp} />
    </Frame>
  );
};

const Mask: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  return (
    <Frame spec={spec}>
      <g opacity={sp}>
        <path d="M260,150 Q380,160 372,290 Q360,410 260,410 Q160,410 148,290 Q140,160 260,150 Z" fill={ink} />
        <path d="M196,262 Q222,238 250,262 Q222,278 196,262 Z" fill={PAPER_ICON} />
        <path d="M270,262 Q296,238 324,262 Q296,278 270,262 Z" fill={PAPER_ICON} />
        <path d="M206,330 Q260,388 314,330" fill="none" stroke={accent} strokeWidth={14} strokeLinecap="round" />
        <line x1={148} y1={280} x2={96} y2={264} stroke={accent} strokeWidth={8} strokeLinecap="round" />
        <line x1={372} y1={280} x2={424} y2={264} stroke={accent} strokeWidth={8} strokeLinecap="round" />
      </g>
    </Frame>
  );
};

const Key: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 150 } });
  const turn = Math.sin(frame * 0.1) * 6;
  return (
    <Frame spec={spec}>
      <g opacity={sp} transform={`translate(260 270) rotate(${-40 + turn}) translate(-260 -270)`}>
        <circle cx={188} cy={270} r={68} fill={accent} />
        <circle cx={188} cy={270} r={30} fill={PAPER_ICON} />
        <rect x={252} y={252} width={190} height={36} rx={8} fill={ink} />
        <rect x={392} y={288} width={22} height={40} fill={ink} />
        <rect x={352} y={288} width={22} height={30} fill={ink} />
      </g>
    </Frame>
  );
};

const Mirror: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 150 } });
  const sheen = interpolate(Math.sin(frame * 0.1), [-1, 1], [-40, 40]);
  return (
    <Frame spec={spec}>
      <g opacity={sp}>
        <ellipse cx={260} cy={236} rx={116} ry={132} fill={ink} />
        <ellipse cx={260} cy={236} rx={90} ry={106} fill={accent} opacity={0.35} />
        <rect x={220 + sheen} y={150} width={26} height={172} rx={12} fill={PAPER_ICON} opacity={0.5} transform="rotate(18 260 236)" />
        <rect x={244} y={358} width={32} height={110} rx={14} fill={ink} />
        <circle cx={260} cy={478} r={22} fill={ink} />
      </g>
    </Frame>
  );
};

// ── Archetypal / Philosophical Metaphors (Anthem, Psychology, Strategy) ─────
const Lightbulb: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 140 } });
  const glowPulse = 0.85 + Math.sin(frame * 0.2) * 0.15;
  return (
    <Frame spec={spec}>
      <g stroke={accent} strokeWidth={8} strokeLinecap="round" opacity={0.6 * sp * glowPulse}>
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const r0 = 175, r1 = 175 + 40 * glowPulse;
          return <line key={i} x1={260 + Math.cos(a) * r0} y1={210 + Math.sin(a) * r0} x2={260 + Math.cos(a) * r1} y2={210 + Math.sin(a) * r1} />;
        })}
      </g>
      <path
        d="M180,210 C180,145 220,110 260,110 C300,110 340,145 340,210 C340,250 315,275 305,305 L215,305 C205,275 180,250 180,210 Z"
        fill={accent}
        opacity={0.18 * sp}
      />
      <path
        d="M180,210 C180,145 220,110 260,110 C300,110 340,145 340,210 C340,250 315,275 305,305 L215,305 C205,275 180,250 180,210 Z"
        fill="none"
        stroke={ink}
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={sp}
      />
      <path
        d="M235,305 L240,200 L250,225 L260,185 L270,225 L280,200 L285,305"
        fill="none"
        stroke={GLOW}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={sp * glowPulse}
      />
      <rect x={220} y={315} width={80} height={16} rx={6} fill={ink} opacity={sp} />
      <rect x={224} y={337} width={72} height={16} rx={6} fill={ink} opacity={sp} />
      <rect x={232} y={359} width={56} height={16} rx={6} fill={ink} opacity={sp} />
      <ellipse cx={260} cy={382} rx={16} ry={8} fill={accent} opacity={sp} />
    </Frame>
  );
};

const ShadowSelf: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const drift = Math.sin(frame * 0.08) * 12;
  return (
    <Frame spec={spec}>
      <line x1={40} y1={440} x2={480} y2={440} stroke={ink} strokeWidth={8} opacity={0.3} strokeLinecap="round" />
      <g transform="translate(180, 240) scale(0.72)" opacity={sp}>
        <circle cx={0} cy={-60} r={32} fill={ink} />
        <path d="M-36,50 L-24,-15 C-24,-25 24,-25 24,-15 L36,50 Z" fill={ink} />
        <rect x={-32} y={50} width={22} height={150} rx={10} fill={ink} />
        <rect x={10} y={50} width={22} height={150} rx={10} fill={ink} />
      </g>
      <g transform={`translate(${330 + drift}, 250) scale(0.75, 0.65) skewX(-24)`} opacity={sp * 0.85}>
        <circle cx={0} cy={-60} r={34} fill={accent} />
        <circle cx={-10} cy={-62} r={5} fill={PAPER_ICON} />
        <circle cx={10} cy={-62} r={5} fill={PAPER_ICON} />
        <path d="M-40,60 L-26,-15 C-26,-25 26,-25 26,-15 L40,60 Z" fill={accent} />
        <rect x={-36} y={60} width={24} height={130} rx={10} fill={accent} />
        <rect x={12} y={60} width={24} height={130} rx={10} fill={accent} />
      </g>
    </Frame>
  );
};

const Puppeteer: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 140 } });
  const tilt = Math.sin(frame * 0.06) * 9;
  return (
    <Frame spec={spec}>
      <g transform={`translate(260, 100) rotate(${tilt}) translate(-260, -100)`} opacity={sp}>
        <rect x={160} y={88} width={200} height={24} rx={6} fill={ink} />
        <rect x={248} y={30} width={24} height={140} rx={6} fill={ink} />
        <circle cx={260} cy={100} r={10} fill={accent} />
      </g>
      <g stroke={ink} strokeWidth={4} opacity={0.35 * sp} strokeDasharray="6,4">
        <line x1={175} y1={100} x2={210} y2={310} />
        <line x1={225} y1={100} x2={242} y2={230} />
        <line x1={295} y1={100} x2={278} y2={230} />
        <line x1={345} y1={100} x2={310} y2={310} />
      </g>
      <g transform={`translate(260, 310) rotate(${-tilt * 0.7}) translate(-260, -310)`} opacity={sp}>
        <circle cx={260} cy={220} r={28} fill={accent} />
        <rect x={236} y={252} width={48} height={90} rx={12} fill={ink} />
        <rect x={194} y={262} width={38} height={14} rx={6} fill={ink} transform="rotate(25 232 268)" />
        <rect x={288} y={262} width={38} height={14} rx={6} fill={ink} transform="rotate(-25 288 268)" />
        <rect x={238} y={345} width={18} height={80} rx={8} fill={ink} />
        <rect x={264} y={345} width={18} height={80} rx={8} fill={ink} />
      </g>
    </Frame>
  );
};

const Iceberg: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 13, stiffness: 110 } });
  const bob = Math.sin(frame * 0.05) * 6;
  return (
    <Frame spec={spec}>
      <line x1={30} y1={210} x2={490} y2={210} stroke={accent} strokeWidth={10} strokeLinecap="round" opacity={0.8} />
      <g transform={`translate(0, ${bob})`} opacity={sp}>
        <polygon points="260,110 305,206 215,206" fill={PAPER_ICON} stroke={ink} strokeWidth={6} strokeLinejoin="round" />
        <polygon
          points="215,214 305,214 390,320 340,460 260,490 180,450 140,310"
          fill={accent}
          opacity={0.35}
        />
        <polygon
          points="215,214 305,214 390,320 340,460 260,490 180,450 140,310"
          fill="none"
          stroke={ink}
          strokeWidth={8}
          strokeLinejoin="round"
          opacity={0.7}
        />
      </g>
    </Frame>
  );
};

const Chains: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 10, stiffness: 160 } });
  const breakShift = interpolate(frame, [15, 30], [0, 40], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const broken = frame > 18;
  return (
    <Frame spec={spec}>
      <g transform={`translate(${-breakShift}, 0)`} opacity={sp}>
        <rect x={40} y={232} width={100} height={56} rx={28} fill="none" stroke={ink} strokeWidth={18} />
        <rect x={110} y={232} width={100} height={56} rx={28} fill="none" stroke={ink} strokeWidth={18} />
      </g>
      <g transform="translate(260, 260)" opacity={sp}>
        {broken ? (
          <>
            <polygon points={spikes(0, 0, 56, 20, 8)} fill={accent} />
            <path d="M-28,-24 L-12,-8" stroke={ink} strokeWidth={16} strokeLinecap="round" />
            <path d="M28,24 L12,8" stroke={ink} strokeWidth={16} strokeLinecap="round" />
          </>
        ) : (
          <rect x={-50} y={-28} width={100} height={56} rx={28} fill="none" stroke={accent} strokeWidth={18} />
        )}
      </g>
      <g transform={`translate(${breakShift}, 0)`} opacity={sp}>
        <rect x={310} y={232} width={100} height={56} rx={28} fill="none" stroke={ink} strokeWidth={18} />
        <rect x={380} y={232} width={100} height={56} rx={28} fill="none" stroke={ink} strokeWidth={18} />
      </g>
    </Frame>
  );
};

const Compass: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 11, stiffness: 130 } });
  const needleAngle = interpolate(Math.sin(frame * 0.08), [-1, 1], [-14, 14]);
  return (
    <Frame spec={spec}>
      <g opacity={sp}>
        <circle cx={260} cy={260} r={180} fill="none" stroke={ink} strokeWidth={14} />
        <circle cx={260} cy={260} r={155} fill="none" stroke={accent} strokeWidth={3} strokeDasharray="6,8" opacity={0.6} />
        <text x={260} y={130} fill={accent} fontSize={32} fontWeight="bold" textAnchor="middle" fontFamily={ANTIDOTE_FONT}>N</text>
        <text x={260} y={420} fill={ink} fontSize={24} textAnchor="middle" fontFamily={ANTIDOTE_FONT} opacity={0.6}>S</text>
        <text x={400} y={268} fill={ink} fontSize={24} textAnchor="middle" fontFamily={ANTIDOTE_FONT} opacity={0.6}>E</text>
        <text x={120} y={268} fill={ink} fontSize={24} textAnchor="middle" fontFamily={ANTIDOTE_FONT} opacity={0.6}>W</text>
        <g transform={`translate(260, 260) rotate(${needleAngle}) translate(-260, -260)`}>
          <polygon points="260,140 280,260 260,250 240,260" fill={accent} />
          <polygon points="260,380 280,260 260,270 240,260" fill={ink} opacity={0.8} />
          <circle cx={260} cy={260} r={14} fill={PAPER_ICON} stroke={ink} strokeWidth={5} />
        </g>
      </g>
    </Frame>
  );
};

// ── Hypnotic Vector Metaphors (Compounding, Depth, Ruthless Focus) ────────
const DominoCascade: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });

  const baseY = 430;
  const dominoes = [
    { x: 60, w: 14, h: 44, delay: 10 },
    { x: 110, w: 18, h: 68, delay: 17 },
    { x: 170, w: 24, h: 105, delay: 24 },
    { x: 245, w: 32, h: 160, delay: 31 },
    { x: 335, w: 42, h: 235, delay: 38 },
    { x: 440, w: 54, h: 340, delay: 46 },
  ];

  const finalHit = frame > 53;
  const finalImpactScale = spring({
    frame: Math.max(0, frame - 53),
    fps,
    config: { damping: 10, stiffness: 180 },
  });

  return (
    <Frame spec={spec}>
      <line x1={30} y1={baseY} x2={500} y2={baseY} stroke={ink} strokeWidth={8} strokeLinecap="round" opacity={0.35 * sp} />
      <line
        x1={60}
        y1={baseY + 12}
        x2={interpolate(frame, [10, 54], [60, 480], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        y2={baseY + 12}
        stroke={accent}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.8 * sp}
      />

      {dominoes.map((d, i) => {
        const rot = interpolate(frame, [d.delay, d.delay + 9], [0, 68], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.35, 0, 0.15, 1),
        });

        const isFallen = frame >= d.delay + 7;
        const isTriggered = frame >= d.delay;

        const hitFrame = d.delay + 7;
        const hitAge = frame - hitFrame;
        const showHit = hitAge >= 0 && hitAge < 12;
        const hitRingR = interpolate(hitAge, [0, 12], [4, d.w * 1.8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const hitRingOp = interpolate(hitAge, [0, 12], [0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

        const isLast = i === dominoes.length - 1;
        const fillColor = isLast && isFallen ? accent : isTriggered ? accent : ink;
        const fillOpacity = isLast ? (isFallen ? 1 : 0.85) : isTriggered ? 0.95 : 0.8;

        return (
          <g key={i} opacity={sp}>
            <g transform={`translate(${d.x + d.w}, ${baseY}) rotate(${rot}) translate(${-(d.x + d.w)}, ${-baseY})`}>
              <rect x={d.x + 4} y={baseY - d.h + 4} width={d.w} height={d.h} rx={6} fill="black" opacity={0.12} />
              <rect x={d.x} y={baseY - d.h} width={d.w} height={d.h} rx={6} fill={fillColor} opacity={fillOpacity} />
              <line
                x1={d.x + 3}
                y1={baseY - d.h * 0.5}
                x2={d.x + d.w - 3}
                y2={baseY - d.h * 0.5}
                stroke={isTriggered ? "#FFFFFF" : accent}
                strokeWidth={Math.max(2, d.w * 0.08)}
                strokeLinecap="round"
                opacity={0.65}
              />
              <circle
                cx={d.x + d.w / 2}
                cy={baseY - d.h * 0.75}
                r={Math.max(2, d.w * 0.12)}
                fill={isTriggered ? "#FFFFFF" : accent}
                opacity={0.8}
              />
              <circle
                cx={d.x + d.w / 2}
                cy={baseY - d.h * 0.25}
                r={Math.max(2, d.w * 0.12)}
                fill={isTriggered ? "#FFFFFF" : accent}
                opacity={0.8}
              />
            </g>

            {showHit && (
              <circle
                cx={d.x + d.w + 6}
                cy={baseY - d.h * 0.4}
                r={hitRingR}
                fill="none"
                stroke={accent}
                strokeWidth={3}
                opacity={hitRingOp}
              />
            )}
          </g>
        );
      })}

      {finalHit && (
        <g transform="translate(480, 410)" opacity={Math.min(1, finalImpactScale)}>
          <polygon
            points={spikes(0, 0, 52 * finalImpactScale, 22 * finalImpactScale, 10)}
            fill={accent}
            opacity={0.9}
          />
          <circle cx={0} cy={0} r={16 * finalImpactScale} fill="#FFFFFF" />
        </g>
      )}

      <path
        d="M 68, 380 Q 240, 360 460, 90"
        fill="none"
        stroke={accent}
        strokeWidth={3}
        strokeDasharray="6,6"
        opacity={0.45 * sp}
      />

      <g transform="translate(60, 465)" opacity={sp}>
        <rect x={0} y={0} width={185} height={26} rx={13} fill={ink} opacity={0.85} />
        <circle cx={13} cy={13} r={4} fill={accent} />
        <text
          x={24}
          y={17}
          fill="#FFFFFF"
          fontSize={11}
          fontWeight="bold"
          fontFamily={ANTIDOTE_FONT}
          letterSpacing="1px"
        >
          COMPOUND EFFECT
        </text>
      </g>
    </Frame>
  );
};

const IcebergDepth: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 13, stiffness: 120 } });
  
  const waterY = 190;
  const bob = Math.sin(frame * 0.06) * 5;

  const scanY = interpolate(frame, [15, 60], [waterY, 460], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });

  const showL1 = frame > 24;
  const showL2 = frame > 38;
  const showL3 = frame > 50;

  return (
    <Frame spec={spec}>
      <rect
        x={20}
        y={waterY}
        width={480}
        height={310}
        rx={8}
        fill={accent}
        opacity={0.12 * sp}
      />

      <g opacity={0.35 * sp} stroke={ink} strokeWidth={2}>
        <line x1={40} y1={250} x2={55} y2={250} />
        <line x1={40} y1={330} x2={55} y2={330} />
        <line x1={40} y1={410} x2={55} y2={410} />
        <text x={38} y={254} fill={ink} fontSize={10} fontFamily={ANTIDOTE_FONT} textAnchor="end" opacity={0.6}>-100m</text>
        <text x={38} y={334} fill={ink} fontSize={10} fontFamily={ANTIDOTE_FONT} textAnchor="end" opacity={0.6}>-500m</text>
        <text x={38} y={414} fill={ink} fontSize={10} fontFamily={ANTIDOTE_FONT} textAnchor="end" opacity={0.6}>-1000m</text>
      </g>

      <g transform={`translate(0, ${bob})`} opacity={sp}>
        <polygon
          points={`260,${waterY + 2} 190,${waterY + 2} 80,280 120,380 230,470 260,${waterY + 2}`}
          fill={accent}
          opacity={0.38}
        />
        <polygon
          points={`260,${waterY + 2} 230,470 290,470 330,360 260,${waterY + 2}`}
          fill={accent}
          opacity={0.55}
        />
        <polygon
          points={`260,${waterY + 2} 330,${waterY + 2} 440,270 410,380 290,470 260,${waterY + 2}`}
          fill={ink}
          opacity={0.25}
        />
        <polygon
          points={`190,${waterY + 2} 80,280 190,320 260,${waterY + 2}`}
          fill={ink}
          opacity={0.18}
        />
        <polygon
          points={`190,${waterY + 2} 80,280 120,380 230,470 290,470 410,380 440,270 330,${waterY + 2}`}
          fill="none"
          stroke={ink}
          strokeWidth={6}
          strokeLinejoin="round"
          opacity={0.7}
        />

        <polygon
          points={`260,78 205,${waterY - 2} 260,${waterY - 2}`}
          fill="#FFFFFF"
          stroke={ink}
          strokeWidth={5}
          strokeLinejoin="round"
        />
        <polygon
          points={`260,78 260,${waterY - 2} 315,${waterY - 2}`}
          fill={PAPER_ICON}
          stroke={ink}
          strokeWidth={5}
          strokeLinejoin="round"
        />

        <g transform="translate(325, 115)">
          <line x1={-10} y1={8} x2={16} y2={8} stroke={accent} strokeWidth={2} strokeDasharray="3,3" />
          <rect x={18} y={-4} width={135} height={24} rx={12} fill={accent} />
          <text
            x={85}
            y={12}
            fill="#FFFFFF"
            fontSize={10}
            fontWeight="bold"
            fontFamily={ANTIDOTE_FONT}
            textAnchor="middle"
            letterSpacing="1px"
          >
            10% VISIBLE RESULT
          </text>
        </g>
      </g>

      {frame >= 15 && scanY <= 460 && (
        <g opacity={sp}>
          <line
            x1={50}
            y1={scanY}
            x2={470}
            y2={scanY}
            stroke={accent}
            strokeWidth={3}
            opacity={0.85}
          />
          <circle cx={260} cy={scanY} r={4} fill="#FFFFFF" />
        </g>
      )}

      {showL1 && (
        <g transform="translate(260, 255)" opacity={sp}>
          <rect x={-95} y={-12} width={190} height={24} rx={12} fill={ink} opacity={0.88} />
          <text x={0} y={4} fill="#FFFFFF" fontSize={11} fontWeight="bold" fontFamily={ANTIDOTE_FONT} textAnchor="middle" letterSpacing="0.8px">
            HABITS & DISCIPLINE
          </text>
        </g>
      )}

      {showL2 && (
        <g transform="translate(260, 335)" opacity={sp}>
          <rect x={-105} y={-12} width={210} height={24} rx={12} fill={ink} opacity={0.88} />
          <text x={0} y={4} fill="#FFFFFF" fontSize={11} fontWeight="bold" fontFamily={ANTIDOTE_FONT} textAnchor="middle" letterSpacing="0.8px">
            FAILURES & REJECTIONS
          </text>
        </g>
      )}

      {showL3 && (
        <g transform="translate(260, 415)" opacity={sp}>
          <rect x={-115} y={-14} width={230} height={28} rx={14} fill={accent} opacity={0.95} />
          <text x={0} y={5} fill="#FFFFFF" fontSize={12} fontWeight="bold" fontFamily={ANTIDOTE_FONT} textAnchor="middle" letterSpacing="1px">
            90% UNSEEN SACRIFICE
          </text>
        </g>
      )}

      <path
        d={`M 20,${waterY} Q 80,${waterY - 6} 140,${waterY} T 260,${waterY} T 380,${waterY} T 500,${waterY}`}
        fill="none"
        stroke={accent}
        strokeWidth={7}
        strokeLinecap="round"
        opacity={0.95 * sp}
      />
    </Frame>
  );
};

const FunnelTrap: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 130 } });

  const particles = [
    { seedX: 140, delay: 6, size: 10, color: ink },
    { seedX: 180, delay: 12, size: 8, color: accent },
    { seedX: 220, delay: 4, size: 12, color: ink },
    { seedX: 260, delay: 16, size: 9, color: ink },
    { seedX: 300, delay: 8, size: 11, color: accent },
    { seedX: 340, delay: 14, size: 8, color: ink },
    { seedX: 380, delay: 10, size: 10, color: ink },
    { seedX: 200, delay: 20, size: 9, color: ink },
    { seedX: 320, delay: 22, size: 10, color: accent },
  ];

  const throatPulse = 0.7 + Math.sin(frame * 0.25) * 0.3;

  const dropFrame = Math.max(0, frame - 28);
  const diamondDrop = spring({
    frame: dropFrame,
    fps,
    config: { damping: 11, stiffness: 120, mass: 0.8 },
  });
  const diamondY = interpolate(diamondDrop, [0, 1], [315, 435]);
  const diamondOp = frame >= 26 ? 1 : 0;
  const landed = frame >= 38;

  return (
    <Frame spec={spec}>
      <polygon
        points="90,110 430,110 300,260 300,325 220,325 220,260"
        fill={accent}
        opacity={0.14 * sp}
      />

      <ellipse
        cx={260}
        cy={110}
        rx={170}
        ry={22}
        fill="none"
        stroke={ink}
        strokeWidth={8}
        opacity={0.75 * sp}
      />

      <path
        d="M 90,110 L 220,260 L 220,325 M 430,110 L 300,260 L 300,325"
        fill="none"
        stroke={ink}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={sp}
      />

      <g opacity={sp * throatPulse}>
        <line x1={220} y1={270} x2={300} y2={270} stroke={accent} strokeWidth={4} />
        <line x1={220} y1={290} x2={300} y2={290} stroke={accent} strokeWidth={4} />
        <line x1={220} y1={310} x2={300} y2={310} stroke={accent} strokeWidth={4} />
      </g>

      {particles.map((p, i) => {
        const pFrame = frame - p.delay;
        if (pFrame < 0) return null;
        const prog = interpolate(pFrame, [0, 24], [0, 1], { extrapolateRight: "clamp" });
        const currX = interpolate(prog, [0, 1], [p.seedX, 260]);
        const currY = interpolate(prog, [0, 1], [40, 280]);
        const pOpacity = interpolate(prog, [0, 0.7, 1], [0, 0.85, 0]);

        return (
          <circle
            key={i}
            cx={currX}
            cy={currY}
            r={p.size * (1 - prog * 0.4)}
            fill={p.color}
            opacity={pOpacity * sp}
          />
        );
      })}

      <g transform="translate(260, 65)" opacity={sp}>
        <text
          x={0}
          y={0}
          fill={ink}
          fontSize={12}
          fontWeight="bold"
          fontFamily={ANTIDOTE_FONT}
          textAnchor="middle"
          letterSpacing="1.5px"
          opacity={0.65}
        >
          100+ DISTRACTIONS & NOISE
        </text>
      </g>

      <g transform="translate(260, 435)" opacity={sp}>
        <circle cx={0} cy={0} r={34} fill="none" stroke={ink} strokeWidth={3} strokeDasharray="5,5" opacity={0.35} />
        <circle cx={0} cy={0} r={24} fill="none" stroke={accent} strokeWidth={2} opacity={0.5} />
      </g>

      {diamondOp > 0 && (
        <g transform={`translate(260, ${diamondY})`} opacity={sp}>
          <circle cx={0} cy={0} r={28} fill={accent} opacity={0.25} />
          <polygon
            points="0,-22 22,0 0,22 -22,0"
            fill={accent}
            stroke="#FFFFFF"
            strokeWidth={4}
          />
          <line x1={0} y1={-22} x2={0} y2={22} stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
          <line x1={-22} y1={0} x2={22} y2={0} stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />

          {landed && (
            <g opacity={Math.sin(frame * 0.2) * 0.3 + 0.7}>
              <polygon points={spikes(0, 0, 36, 16, 6)} fill={accent} opacity={0.4} />
            </g>
          )}
        </g>
      )}

      {landed && (
        <g transform="translate(260, 485)" opacity={sp}>
          <rect x={-100} y={-13} width={200} height={26} rx={13} fill={ink} opacity={0.92} />
          <circle cx={-85} cy={0} r={4} fill={accent} />
          <text
            x={-74}
            y={4}
            fill="#FFFFFF"
            fontSize={11}
            fontWeight="bold"
            fontFamily={ANTIDOTE_FONT}
            letterSpacing="1px"
          >
            THE ESSENTIAL 1%
          </text>
        </g>
      )}
    </Frame>
  );
};

// ── TECH & SILICON VALLEY MOTIFS (Antidote 5.0) ─────────────────────────────
const CodeWindow: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const cursorBlink = Math.floor(frame / 12) % 2 === 0;
  const p = draw(frame, 38, 4);
  return (
    <Frame spec={spec}>
      {/* Window chassis with shadow */}
      <rect x={30} y={50} width={460} height={420} rx={16} fill={ink} opacity={0.92} />
      <rect x={32} y={52} width={456} height={416} rx={14} fill="#0F172A" />
      {/* Title bar */}
      <rect x={32} y={52} width={456} height={44} rx={14} fill="#1E293B" />
      {/* Window control buttons */}
      <circle cx={62} cy={74} r={7} fill="#EF4444" />
      <circle cx={84} cy={74} r={7} fill="#F59E0B" />
      <circle cx={106} cy={74} r={7} fill="#10B981" />
      {/* Active Tab */}
      <rect x={140} y={60} width={130} height={28} rx={6} fill="#0F172A" />
      <text x={158} y={79} fill="#94A3B8" fontSize={12} fontFamily={ANTIDOTE_FONT} fontWeight="700">
        launch.ts
      </text>

      {/* Editor Body */}
      {/* Line numbers column */}
      <g fill="#475569" fontSize={13} fontFamily="monospace" fontWeight="600">
        <text x={54} y={135}>01</text>
        <text x={54} y={175}>02</text>
        <text x={54} y={215}>03</text>
        <text x={54} y={255}>04</text>
        <text x={54} y={295}>05</text>
        <text x={54} y={335}>06</text>
        <text x={54} y={375}>07</text>
        <text x={54} y={415}>08</text>
      </g>
      <line x1={84} y1={110} x2={84} y2={440} stroke="#334155" strokeWidth={1.5} />

      {/* Code syntax lines (drawing in sequentially) */}
      <g transform="translate(100 0)">
        {/* line 1: const idea = "48h_launch"; */}
        <rect x={0} y={122} width={Math.min(180, 200 * p)} height={14} rx={4} fill="#38BDF8" />
        <rect x={190} y={122} width={Math.min(110, Math.max(0, (p - 0.2) * 250))} height={14} rx={4} fill={accent} />
        {/* line 2: async function validate() { */}
        <rect x={0} y={162} width={Math.min(240, Math.max(0, (p - 0.3) * 350))} height={14} rx={4} fill="#F472B6" />
        {/* line 3:   const customers = await ask(); */}
        <rect x={30} y={202} width={Math.min(260, Math.max(0, (p - 0.4) * 350))} height={14} rx={4} fill="#A7F3D0" />
        {/* line 4:   if (customers >= 3) { */}
        <rect x={30} y={242} width={Math.min(190, Math.max(0, (p - 0.5) * 300))} height={14} rx={4} fill="#FDE047" />
        {/* line 5:     return buildProduct(); */}
        <rect x={60} y={282} width={Math.min(210, Math.max(0, (p - 0.6) * 300))} height={14} rx={4} fill={accent} />
        {/* line 6:   } */}
        <rect x={30} y={322} width={20} height={14} rx={4} fill="#94A3B8" />
        {/* line 7: } */}
        <rect x={0} y={362} width={20} height={14} rx={4} fill="#94A3B8" />
        {/* Blinking cursor */}
        {cursorBlink && <rect x={280} y={280} width={10} height={18} rx={2} fill="#38BDF8" />}
      </g>
    </Frame>
  );
};

const LaptopMockup: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lift = spring({ frame, fps, delay: 4, config: { damping: 14, stiffness: 120 } });
  return (
    <Frame spec={spec}>
      {/* Laptop Screen (Lifting up) */}
      <g transform={`translate(260 360) scale(1 ${lift}) translate(-260 -360)`}>
        {/* Screen Bezel */}
        <rect x={70} y={80} width={380} height={260} rx={16} fill={ink} />
        <rect x={86} y={96} width={348} height={228} rx={8} fill="#0F172A" />
        {/* Webcam dot */}
        <circle cx={260} cy={88} r={3} fill="#475569" />
        {/* Screen Content / SaaS Dashboard */}
        <rect x={106} y={116} width={90} height={22} rx={6} fill={accent} />
        <rect x={210} y={116} width={70} height={22} rx={6} fill="#38BDF8" opacity={0.4} />
        {/* Chart Card */}
        <rect x={106} y={154} width={308} height={110} rx={8} fill="#1E293B" />
        <path d="M126,236 Q190,220 240,190 T380,166" fill="none" stroke={accent} strokeWidth={8} strokeLinecap="round" />
        <circle cx={380} cy={166} r={8} fill="#FFFFFF" stroke={accent} strokeWidth={4} />
        <rect x={126} y={170} width={100} height={14} rx={4} fill="#F8FAFC" opacity={0.9} />
        {/* Bottom Cards */}
        <rect x={106} y={276} width={146} height={32} rx={6} fill="#1E293B" />
        <rect x={268} y={276} width={146} height={32} rx={6} fill="#1E293B" />
      </g>

      {/* Laptop Base & Keyboard Well */}
      <polygon points="30,370 490,370 460,396 60,396" fill={ink} opacity={0.85} />
      <rect x={40} y={368} width={440} height={14} rx={6} fill="#334155" />
      {/* Trackpad notch */}
      <rect x={220} y={370} width={80} height={8} rx={3} fill="#64748B" />
    </Frame>
  );
};

const FunnelMetrics: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame, fps, delay: 6, config: { damping: 12, stiffness: 160 } });
  const s2 = spring({ frame, fps, delay: 16, config: { damping: 12, stiffness: 160 } });
  const s3 = spring({ frame, fps, delay: 26, config: { damping: 12, stiffness: 160 } });

  return (
    <Frame spec={spec}>
      {/* Funnel Tier 1: 100 LEADS / OUTREACH */}
      <g transform={`translate(260 110) scale(${s1}) translate(-260 -110)`}>
        <polygon points="50,70 470,70 410,150 110,150" fill={ink} opacity={0.85} />
        <text x={260} y={120} fill="#FFFFFF" fontSize={18} fontWeight="800" fontFamily={ANTIDOTE_FONT} textAnchor="middle">
          48H VALIDATION: 100 OUTREACH
        </text>
      </g>

      {/* Funnel Tier 2: 10 CONVERSATIONS */}
      <g transform={`translate(260 210) scale(${s2}) translate(-260 -210)`}>
        <polygon points="120,165 400,165 350,245 170,245" fill="#334155" />
        <text x={260} y={214} fill="#F8FAFC" fontSize={17} fontWeight="800" fontFamily={ANTIDOTE_FONT} textAnchor="middle">
          10 CONVERSATIONS
        </text>
      </g>

      {/* Funnel Tier 3: 3 PAYING CUSTOMERS ($) */}
      <g transform={`translate(260 310) scale(${s3}) translate(-260 -310)`}>
        <polygon points="180,260 340,260 300,340 220,340" fill={accent} />
        <text x={260} y={310} fill="#FFFFFF" fontSize={18} fontWeight="900" fontFamily={ANTIDOTE_FONT} textAnchor="middle">
          3 PAYING
        </text>
      </g>

      {/* Dropping Result Badge: "BUSINESS PROVEN" */}
      {s3 > 0.8 && (
        <g transform="translate(260 410)">
          <rect x={-140} y={-24} width={280} height={48} rx={24} fill="#16A34A" />
          <text x={0} y={6} fill="#FFFFFF" fontSize={16} fontWeight="900" fontFamily={ANTIDOTE_FONT} textAnchor="middle" letterSpacing="1px">
            ✓ FIRST $ REVENUE
          </text>
        </g>
      )}
    </Frame>
  );
};

const RocketLaunch: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lift = spring({ frame, fps, delay: 6, config: { damping: 10, stiffness: 90, mass: 0.8 } });
  const yShift = (1 - lift) * 200;
  const flamePulse = 1 + Math.sin(frame * 0.4) * 0.18;

  return (
    <Frame spec={spec}>
      {/* Exhaust Smoke Clouds */}
      <g fill="#CBD5E1" opacity={0.6}>
        <circle cx={200} cy={440 + Math.sin(frame * 0.1) * 6} r={34} />
        <circle cx={260} cy={456 + Math.cos(frame * 0.12) * 8} r={46} />
        <circle cx={320} cy={440 + Math.sin(frame * 0.14) * 6} r={36} />
      </g>

      {/* Speed lines */}
      <g stroke={ink} strokeWidth={6} strokeLinecap="round" opacity={0.3}>
        <line x1={140} y1={220} x2={140} y2={360} />
        <line x1={380} y1={180} x2={380} y2={340} />
      </g>

      {/* Rocket Body */}
      <g transform={`translate(0 ${yShift})`}>
        {/* Thrust Flame */}
        <g transform={`translate(260 350) scale(1 ${flamePulse}) translate(-260 -350)`}>
          <polygon points="240,350 280,350 260,450" fill="#F97316" />
          <polygon points="248,350 272,350 260,410" fill="#FDE047" />
        </g>

        {/* Fins */}
        <polygon points="210,310 180,360 226,345" fill={accent} />
        <polygon points="310,310 340,360 294,345" fill={accent} />

        {/* Fuselage */}
        <path d="M226,350 L226,220 Q226,110 260,80 Q294,110 294,220 L294,350 Z" fill="#F8FAFC" stroke={ink} strokeWidth={8} />

        {/* Porthole Window */}
        <circle cx={260} cy={190} r={24} fill="#0F172A" stroke={accent} strokeWidth={7} />
        <circle cx={256} cy={186} r={6} fill="#FFFFFF" opacity={0.8} />

        {/* Booster Base */}
        <rect x={236} y={346} width={48} height={16} rx={4} fill={ink} />
      </g>
    </Frame>
  );
};

const DollarExchange: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, delay: 6, config: { damping: 11, stiffness: 140 } });
  const pulse = 1 + Math.sin(frame * 0.15) * 0.04;

  return (
    <Frame spec={spec}>
      {/* Radiating Sparkles */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const r1 = 180;
        const r2 = 215;
        return (
          <line
            key={i}
            x1={260 + Math.cos(a) * r1}
            y1={260 + Math.sin(a) * r1}
            x2={260 + Math.cos(a) * r2}
            y2={260 + Math.sin(a) * r2}
            stroke={accent}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.6}
          />
        );
      })}

      {/* Floating Center Credit Card / Dollar Bill */}
      <g transform={`translate(260 260) scale(${s * pulse}) translate(-260 -260)`}>
        {/* Main Bank Card */}
        <rect x={110} y={160} width={300} height={190} rx={18} fill={accent} stroke={ink} strokeWidth={8} />
        {/* Chip */}
        <rect x={150} y={205} width={44} height={34} rx={6} fill="#FDE047" stroke={ink} strokeWidth={4} />
        {/* Magnetic stripe / accent bar */}
        <rect x={110} y={260} width={300} height={20} fill="#0F172A" opacity={0.6} />
        {/* Card numbers dot pattern */}
        <g fill="#FFFFFF" opacity={0.9}>
          <circle cx={160} cy={308} r={5} /><circle cx={178} cy={308} r={5} /><circle cx={196} cy={308} r={5} />
          <circle cx={228} cy={308} r={5} /><circle cx={246} cy={308} r={5} /><circle cx={264} cy={308} r={5} />
          <text x={310} y={314} fill="#FFFFFF" fontSize={18} fontWeight="bold" fontFamily={ANTIDOTE_FONT}>
            $1,000
          </text>
        </g>
      </g>
    </Frame>
  );
};

/**
 * CustomSvgMotif — Dynamic Vector SVG Renderer (Antidote Extensible Fabric)
 *
 * Enables the AI Art Director to inject bespoke vector motifs (DNA helix,
 * Stoic marble bust, quantum entanglement, neural synapse, medieval crown, etc.)
 * straight from JSON into Remotion without needing to recompile code.
 */
const CustomSvgMotif: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const cSvg = spec.customSvg;
  const paths = cSvg?.paths || [];
  const viewBox = cSvg?.viewBox || "0 0 520 520";
  const drawProg = draw(frame, 28);

  return (
    <Frame spec={spec}>
      <svg viewBox={viewBox} width={BOX} height={BOX} style={{ overflow: "visible" }}>
        {paths.map((p, idx) => {
          const fill = p.fill === "accent" ? accent : p.fill === "ink" ? ink : p.fill || "none";
          const stroke = p.stroke === "accent" ? accent : p.stroke === "ink" ? ink : p.stroke || ink;
          const strokeWidth = p.strokeWidth ?? (fill === "none" ? 7 : 0);
          const opacity = (p.opacity ?? 1) * Math.min(1, drawProg * 1.5);
          return (
            <path
              key={idx}
              d={p.d}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={opacity}
            />
          );
        })}
        {cSvg?.title ? (
          <text
            x={BOX / 2}
            y={BOX - 24}
            textAnchor="middle"
            fill={ink}
            fontSize={22}
            fontWeight={800}
            fontFamily={ANTIDOTE_FONT}
            letterSpacing={3}
            opacity={draw(frame, 20, 10) * 0.75}
          >
            {cSvg.title.toUpperCase()}
          </text>
        ) : null}
      </svg>
    </Frame>
  );
};

// ── High-Retention Narrative & Metaphor Motifs (Antidote 5.1) ───────────────

const AlarmClock: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const ring = Math.sin(frame * 1.8) * 16;
  const vib = Math.sin(frame * 2.2) * 4;

  return (
    <Frame spec={spec}>
      <g transform={`translate(${vib}, 0)`}>
        {/* Ringing Soundwave Arcs */}
        {[-1, 1].map((dir, idx) => (
          <g key={idx} opacity={0.6 + Math.sin(frame * 0.4 + idx) * 0.3}>
            <path
              d={`M${260 + dir * 180},160 A210,210 0 0,${dir > 0 ? 1 : 0} ${260 + dir * 180},80`}
              fill="none"
              stroke={accent}
              strokeWidth={8}
              strokeLinecap="round"
            />
            <path
              d={`M${260 + dir * 210},180 A250,250 0 0,${dir > 0 ? 1 : 0} ${260 + dir * 210},60`}
              fill="none"
              stroke={accent}
              strokeWidth={6}
              strokeLinecap="round"
              opacity={0.6}
            />
          </g>
        ))}

        {/* Angled Peg Legs */}
        <line x1={180} y1={390} x2={130} y2={464} stroke={ink} strokeWidth={18} strokeLinecap="round" />
        <line x1={340} y1={390} x2={390} y2={464} stroke={ink} strokeWidth={18} strokeLinecap="round" />

        {/* Twin Bells */}
        <g transform="rotate(-30 160 140)">
          <path d="M110,140 C110,90 210,90 210,140 Z" fill={ink} opacity={0.9} />
          <line x1={160} y1={90} x2={160} y2={74} stroke={ink} strokeWidth={10} strokeLinecap="round" />
        </g>
        <g transform="rotate(30 360 140)">
          <path d="M310,140 C310,90 410,90 410,140 Z" fill={ink} opacity={0.9} />
          <line x1={360} y1={90} x2={360} y2={74} stroke={ink} strokeWidth={10} strokeLinecap="round" />
        </g>

        {/* Vibrating Clapper Hammer */}
        <g transform={`rotate(${ring} 260 140)`}>
          <line x1={260} y1={140} x2={260} y2={90} stroke={ink} strokeWidth={12} strokeLinecap="round" />
          <circle cx={260} cy={82} r={16} fill={accent} />
        </g>

        {/* Top Handle Loop */}
        <path d="M210,150 C210,96 310,96 310,150" fill="none" stroke={ink} strokeWidth={12} strokeLinecap="round" />

        {/* Main Clock Body */}
        <circle cx={260} cy={290} r={154} fill="#FFFFFF" stroke={ink} strokeWidth={16} />
        <circle cx={260} cy={290} r={136} fill="none" stroke={accent} strokeWidth={6} opacity={0.35} />

        {/* Dial Ticks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={260 + Math.cos(a) * 110}
              y1={290 + Math.sin(a) * 110}
              x2={260 + Math.cos(a) * 128}
              y2={290 + Math.sin(a) * 128}
              stroke={ink}
              strokeWidth={i % 3 === 0 ? 8 : 4}
              strokeLinecap="round"
              opacity={0.7}
            />
          );
        })}

        {/* Clock Hands Set to 07:00 (Morning Wake-up) */}
        <line
          x1={260}
          y1={290}
          x2={260 + Math.cos(((120) * Math.PI) / 180) * 65}
          y2={290 + Math.sin(((120) * Math.PI) / 180) * 65}
          stroke={ink}
          strokeWidth={14}
          strokeLinecap="round"
        />
        <line
          x1={260}
          y1={290}
          x2={260}
          y2={190}
          stroke={accent}
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Center Cap */}
        <circle cx={260} cy={290} r={14} fill={accent} stroke={ink} strokeWidth={4} />

        {/* "SNOOZE" button on top */}
        <rect x={220} y={124} width={80} height={18} rx={6} fill={accent} stroke={ink} strokeWidth={4} />
      </g>
    </Frame>
  );
};

const Hourglass: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const sandProgress = (frame * 0.008) % 1;

  return (
    <Frame spec={spec}>
      {/* Top & Bottom Wooden Plinths */}
      <rect x={120} y={54} width={280} height={28} rx={10} fill={ink} />
      <rect x={140} y={44} width={240} height={14} rx={6} fill={accent} />
      <rect x={120} y={438} width={280} height={28} rx={10} fill={ink} />
      <rect x={140} y={462} width={240} height={14} rx={6} fill={accent} />

      {/* Side Support Pillars */}
      <line x1={148} y1={82} x2={148} y2={438} stroke={ink} strokeWidth={16} strokeLinecap="round" />
      <line x1={372} y1={82} x2={372} y2={438} stroke={ink} strokeWidth={16} strokeLinecap="round" />

      {/* Glass Contour (Curved Double Bulbs) */}
      <path
        d="M170,82 C170,180 238,240 254,260 C238,280 170,340 170,438 L350,438 C350,340 282,280 266,260 C282,240 350,180 350,82 Z"
        fill="rgba(255, 255, 255, 0.15)"
        stroke={ink}
        strokeWidth={10}
        strokeLinejoin="round"
      />

      {/* Upper Sand Draining */}
      <path
        d={`M${190 + sandProgress * 40},${130 + sandProgress * 110} C${220},${220} ${250},${255} 255,258 C260,258 ${290},${220} ${330 - sandProgress * 40},${130 + sandProgress * 110} Z`}
        fill={accent}
        opacity={0.9}
      />

      {/* Center Falling Sand Stream */}
      <line
        x1={260}
        y1={258}
        x2={260}
        y2={410}
        stroke={accent}
        strokeWidth={6}
        strokeDasharray="8 8"
        strokeDashoffset={-frame * 14}
        strokeLinecap="round"
      />

      {/* Lower Accumulating Sand Mound */}
      <path
        d={`M${180},434 Q260,${370 - sandProgress * 40} 340,434 Z`}
        fill={accent}
      />

      {/* Glass Highlight Sheen */}
      <path
        d="M188,100 C188,160 216,210 230,230"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.65}
      />
    </Frame>
  );
};

const Zap: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame * 0.4) * 0.15 + 1;

  return (
    <Frame spec={spec}>
      <g transform={`scale(${pulse}) translate(${260 * (1 - pulse)}, ${260 * (1 - pulse)})`}>
        {/* Outer Electric Aura / Glow */}
        <polygon
          points="290,40 120,270 240,270 170,480 390,210 270,210"
          fill={accent}
          opacity={0.3}
          stroke={accent}
          strokeWidth={32}
          strokeLinejoin="round"
        />

        {/* Main Sharp Bolt */}
        <polygon
          points="290,40 120,270 240,270 170,480 390,210 270,210"
          fill={accent}
          stroke={ink}
          strokeWidth={14}
          strokeLinejoin="round"
        />

        {/* Inner Bright Core */}
        <polygon
          points="286,60 146,260 250,260 190,440 366,220 276,220"
          fill="#FFFFFF"
          opacity={0.6}
        />

        {/* Sparks branching off */}
        {[-1, 1].map((side, i) => (
          <path
            key={i}
            d={`M${260 + side * 90},${220 + i * 80} L${260 + side * 140},${200 + i * 80} L${260 + side * 170},${230 + i * 80}`}
            fill="none"
            stroke={accent}
            strokeWidth={7}
            strokeLinecap="round"
            opacity={0.75}
          />
        ))}
      </g>
    </Frame>
  );
};

const Shield: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const sheen = (frame * 6) % 600 - 100;

  return (
    <Frame spec={spec}>
      <defs>
        <clipPath id="shieldClip">
          <path d="M120,90 L400,90 Q400,320 260,450 Q120,320 120,90 Z" />
        </clipPath>
      </defs>

      {/* Main Outer Shield */}
      <path
        d="M120,90 L400,90 Q400,320 260,450 Q120,320 120,90 Z"
        fill={accent}
        stroke={ink}
        strokeWidth={16}
        strokeLinejoin="round"
      />

      {/* Inner Trim */}
      <path
        d="M144,114 L376,114 Q376,306 260,420 Q144,306 144,114 Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={8}
        opacity={0.4}
      />

      {/* Center Heraldic Emblem / Star */}
      <polygon
        points={spikes(260, 240, 68, 30, 4)}
        fill="#FFFFFF"
        stroke={ink}
        strokeWidth={8}
      />

      {/* Moving Sheen Stripe */}
      <g clipPath="url(#shieldClip)">
        <rect
          x={sheen}
          y={40}
          width={60}
          height={440}
          fill="#FFFFFF"
          opacity={0.28}
          transform={`rotate(25 ${sheen + 30} 260)`}
        />
      </g>
    </Frame>
  );
};

const Target: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const hitWiggle = Math.sin(frame * 1.5) * Math.max(0, 1 - frame * 0.05) * 8;

  return (
    <Frame spec={spec}>
      {/* Concentric Bullseye Rings */}
      <circle cx={260} cy={260} r={210} fill="#FFFFFF" stroke={ink} strokeWidth={16} />
      <circle cx={260} cy={260} r={165} fill={ink} opacity={0.12} stroke={ink} strokeWidth={10} />
      <circle cx={260} cy={260} r={120} fill={accent} stroke={ink} strokeWidth={12} />
      <circle cx={260} cy={260} r={75} fill="#FFFFFF" stroke={ink} strokeWidth={10} />
      <circle cx={260} cy={260} r={35} fill={accent} stroke={ink} strokeWidth={8} />

      {/* Arrow Struck at the Center */}
      <g transform={`rotate(${hitWiggle} 260 260)`}>
        <line x1={120} y1={120} x2={260} y2={260} stroke={ink} strokeWidth={14} strokeLinecap="round" />
        <polygon points="260,260 240,240 250,225" fill={ink} />
        <polygon points="120,120 144,112 136,136" fill={accent} />
        <polygon points="104,104 128,96 120,120" fill={accent} />
      </g>
    </Frame>
  );
};

const Trophy: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  return (
    <Frame spec={spec}>
      {/* Marble Pedestal */}
      <rect x={140} y={420} width={240} height={42} rx={8} fill={ink} />
      <rect x={170} y={370} width={180} height={50} rx={6} fill={ink} opacity={0.8} />

      {/* Pedestal Stem */}
      <path d="M220,370 L240,300 L280,300 L300,370 Z" fill={accent} stroke={ink} strokeWidth={10} />

      {/* Chalice Cup */}
      <path
        d="M170,120 L350,120 L330,270 Q320,310 260,310 Q200,310 190,270 Z"
        fill={accent}
        stroke={ink}
        strokeWidth={14}
      />

      {/* Twin Sweeping Handles */}
      <path
        d="M170,140 C100,150 100,240 190,250"
        fill="none"
        stroke={ink}
        strokeWidth={16}
        strokeLinecap="round"
      />
      <path
        d="M350,140 C420,150 420,240 330,250"
        fill="none"
        stroke={ink}
        strokeWidth={16}
        strokeLinecap="round"
      />

      {/* Embossed Champion Star */}
      <polygon
        points={spikes(260, 200, 44, 18, 5)}
        fill="#FFFFFF"
        stroke={ink}
        strokeWidth={6}
      />

      {/* Rim Highlight */}
      <ellipse cx={260} cy={120} rx={90} ry={16} fill="none" stroke="#FFFFFF" strokeWidth={8} opacity={0.6} />
    </Frame>
  );
};

const Subway: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  return (
    <Frame spec={spec}>
      {/* Converging Railway Tracks */}
      <line x1={60} y1={490} x2={220} y2={390} stroke={ink} strokeWidth={10} opacity={0.4} />
      <line x1={460} y1={490} x2={300} y2={390} stroke={ink} strokeWidth={10} opacity={0.4} />
      {[460, 430, 405].map((y, i) => (
        <line
          key={i}
          x1={140 + i * 35}
          y1={y}
          x2={380 - i * 35}
          y2={y}
          stroke={ink}
          strokeWidth={8}
          opacity={0.35}
        />
      ))}

      {/* Train Body Chassis */}
      <rect x={130} y={110} width={260} height={300} rx={36} fill={ink} />
      <rect x={144} y={124} width={232} height={272} rx={28} fill="#FFFFFF" />

      {/* Front Windshield Glass */}
      <rect x={160} y={150} width={200} height={110} rx={16} fill={ink} opacity={0.85} />
      <path d="M174,164 L230,164 L200,246 L174,246 Z" fill="#FFFFFF" opacity={0.25} />

      {/* Destination Board ("EXPRESS") */}
      <rect x={190} y={124} width={140} height={20} rx={4} fill={accent} />

      {/* Bold Accent Stripe */}
      <rect x={144} y={280} width={232} height={32} fill={accent} />

      {/* Dual Glowing Headlights */}
      <circle cx={180} cy={345} r={24} fill="#FEF08A" stroke={ink} strokeWidth={8} />
      <circle cx={340} cy={345} r={24} fill="#FEF08A" stroke={ink} strokeWidth={8} />

      {/* Beaming Light Cones on Tracks */}
      <polygon points="180,360 80,480 230,480" fill="#FEF08A" opacity={0.2} />
      <polygon points="340,360 290,480 440,480" fill="#FEF08A" opacity={0.2} />

      {/* Coupler */}
      <rect x={235} y={400} width={50} height={24} rx={6} fill={ink} />
    </Frame>
  );
};

const Butterfly: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const flap = Math.abs(Math.cos(frame * 0.35));
  const scaleX = 0.45 + flap * 0.55;

  return (
    <Frame spec={spec}>
      {/* Chaotic Ripple Trail (Fluke / Butterfly Effect) */}
      {[0, 1, 2].map((i) => {
        const ringScale = ((frame * 0.03 + i * 0.33) % 1);
        return (
          <ellipse
            key={i}
            cx={260}
            cy={260}
            rx={200 * ringScale}
            ry={140 * ringScale}
            fill="none"
            stroke={accent}
            strokeWidth={4}
            strokeDasharray="6 8"
            opacity={(1 - ringScale) * 0.45}
          />
        );
      })}

      <g transform={`translate(${260 * (1 - scaleX)}, 0) scale(${scaleX}, 1)`}>
        {/* Upper Left Wing */}
        <path
          d="M256,230 C220,110 110,90 90,170 C70,240 180,280 256,260 Z"
          fill={accent}
          stroke={ink}
          strokeWidth={10}
        />
        {/* Upper Right Wing */}
        <path
          d="M264,230 C300,110 410,90 430,170 C450,240 340,280 264,260 Z"
          fill={accent}
          stroke={ink}
          strokeWidth={10}
        />

        {/* Lower Left Wing */}
        <path
          d="M256,260 C200,280 120,330 140,400 C160,450 230,410 256,310 Z"
          fill={accent}
          opacity={0.88}
          stroke={ink}
          strokeWidth={10}
        />
        {/* Lower Right Wing */}
        <path
          d="M264,260 C320,280 400,330 380,400 C360,450 290,410 264,310 Z"
          fill={accent}
          opacity={0.88}
          stroke={ink}
          strokeWidth={10}
        />

        {/* Wing Pattern Details */}
        <circle cx={160} cy={180} r={18} fill="#FFFFFF" opacity={0.6} />
        <circle cx={360} cy={180} r={18} fill="#FFFFFF" opacity={0.6} />
        <circle cx={190} cy={360} r={14} fill="#FFFFFF" opacity={0.6} />
        <circle cx={330} cy={360} r={14} fill="#FFFFFF" opacity={0.6} />

        {/* Body */}
        <ellipse cx={260} cy={270} rx={14} ry={60} fill={ink} />
        <circle cx={260} cy={195} r={16} fill={ink} />

        {/* Antennæ */}
        <path d="M256,185 Q220,130 190,140" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" />
        <path d="M264,185 Q300,130 330,140" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" />
        <circle cx={190} cy={140} r={6} fill={accent} />
        <circle cx={330} cy={140} r={6} fill={accent} />
      </g>
    </Frame>
  );
};

const Car: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const wheelRot = (frame * 12) % 360;

  return (
    <Frame spec={spec}>
      {/* Ground Line */}
      <line x1={40} y1={410} x2={480} y2={410} stroke={ink} strokeWidth={8} opacity={0.3} />

      {/* Car Body (Vintage 1914 Touring Sedan) */}
      <path
        d="M60,340 L160,340 L180,240 L340,240 L390,300 L450,320 L450,370 L60,370 Z"
        fill={accent}
        stroke={ink}
        strokeWidth={12}
        strokeLinejoin="round"
      />

      {/* Cabin Windows */}
      <path
        d="M196,254 L326,254 L366,306 L196,306 Z"
        fill="#FFFFFF"
        stroke={ink}
        strokeWidth={8}
        opacity={0.8}
      />
      <line x1={260} y1={254} x2={260} y2={306} stroke={ink} strokeWidth={8} />

      {/* Radiator & Lantern Headlight */}
      <rect x={440} y={320} width={20} height={44} rx={6} fill={ink} />
      <circle cx={456} cy={308} r={16} fill="#FEF08A" stroke={ink} strokeWidth={6} />
      <polygon points="466,308 510,290 510,340" fill="#FEF08A" opacity={0.3} />

      {/* Running Board */}
      <rect x={180} y={376} width={160} height={12} rx={4} fill={ink} />

      {/* Wheels */}
      <g transform={`translate(140, 390) rotate(${wheelRot})`}>
        <circle cx={0} cy={0} r={46} fill={ink} />
        <circle cx={0} cy={0} r={28} fill="#FFFFFF" />
        <circle cx={0} cy={0} r={10} fill={accent} />
        <line x1={-28} y1={0} x2={28} y2={0} stroke={ink} strokeWidth={4} />
        <line x1={0} y1={-28} x2={0} y2={28} stroke={ink} strokeWidth={4} />
      </g>
      <g transform={`translate(380, 390) rotate(${wheelRot})`}>
        <circle cx={0} cy={0} r={46} fill={ink} />
        <circle cx={0} cy={0} r={28} fill="#FFFFFF" />
        <circle cx={0} cy={0} r={10} fill={accent} />
        <line x1={-28} y1={0} x2={28} y2={0} stroke={ink} strokeWidth={4} />
        <line x1={0} y1={-28} x2={0} y2={28} stroke={ink} strokeWidth={4} />
      </g>
    </Frame>
  );
};

const Coffee: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();

  return (
    <Frame spec={spec}>
      {/* Animated Rising Steam Tendrils */}
      {[0, 1, 2].map((i) => {
        const offset = i * 40;
        const wave = Math.sin(frame * 0.15 + i * 2) * 14;
        return (
          <path
            key={i}
            d={`M${220 + offset},180 Q${240 + offset + wave},130 ${220 + offset},80 T${240 + offset - wave},30`}
            fill="none"
            stroke={accent}
            strokeWidth={8}
            strokeLinecap="round"
            opacity={0.55}
          />
        );
      })}

      {/* Saucer */}
      <ellipse cx={260} cy={430} rx={180} ry={24} fill={ink} opacity={0.18} />
      <ellipse cx={260} cy={422} rx={160} ry={18} fill="#FFFFFF" stroke={ink} strokeWidth={12} />

      {/* Handle */}
      <path
        d="M340,240 C430,240 430,360 340,360"
        fill="none"
        stroke={ink}
        strokeWidth={22}
        strokeLinecap="round"
      />
      <path
        d="M340,250 C410,250 410,350 340,350"
        fill="none"
        stroke={accent}
        strokeWidth={10}
        strokeLinecap="round"
      />

      {/* Cup Body */}
      <rect x={160} y={200} width={180} height={200} rx={28} fill={accent} stroke={ink} strokeWidth={14} />

      {/* Liquid */}
      <ellipse cx={250} cy={204} rx={90} ry={22} fill={ink} stroke={ink} strokeWidth={6} />
      <ellipse cx={250} cy={206} rx={76} ry={16} fill="#451A03" />

      {/* Highlight Streak */}
      <line x1={186} y1={230} x2={186} y2={370} stroke="#FFFFFF" strokeWidth={12} strokeLinecap="round" opacity={0.5} />
    </Frame>
  );
};

const Wallet: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  return (
    <Frame spec={spec}>
      {/* Green Cash Banknotes */}
      <g transform="rotate(-15 260 220)">
        <rect x={180} y={120} width={180} height={90} rx={8} fill="#10B981" stroke={ink} strokeWidth={10} />
        <circle cx={270} cy={165} r={22} fill="none" stroke="#FFFFFF" strokeWidth={6} />
      </g>
      <g transform="rotate(8 260 220)">
        <rect x={190} y={140} width={180} height={90} rx={8} fill="#34D399" stroke={ink} strokeWidth={10} />
        <circle cx={280} cy={185} r={22} fill="none" stroke="#FFFFFF" strokeWidth={6} />
      </g>

      {/* Wallet Body */}
      <rect x={120} y={210} width={280} height={200} rx={24} fill={accent} stroke={ink} strokeWidth={16} />
      <path d="M120,280 L400,280" stroke={ink} strokeWidth={10} strokeDasharray="12 12" />

      {/* Clasp */}
      <path d="M360,280 L420,280 Q436,280 436,310 Q436,340 420,340 L360,340 Z" fill={ink} />
      <circle cx={414} cy={310} r={10} fill="#F59E0B" />
    </Frame>
  );
};

const Gift: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  return (
    <Frame spec={spec}>
      {/* Box */}
      <rect x={130} y={210} width={260} height={230} rx={16} fill={accent} stroke={ink} strokeWidth={16} />
      <rect x={110} y={170} width={300} height={54} rx={12} fill={accent} stroke={ink} strokeWidth={16} />
      <rect x={236} y={170} width={48} height={270} fill="#FFFFFF" stroke={ink} strokeWidth={10} />
      <rect x={110} y={186} width={300} height={22} fill="#FFFFFF" opacity={0.6} />

      {/* Bow */}
      <path d="M260,170 C220,90 150,110 180,160 C200,180 240,170 260,170 Z" fill="#FFFFFF" stroke={ink} strokeWidth={10} />
      <path d="M260,170 C300,90 370,110 340,160 C320,180 280,170 260,170 Z" fill="#FFFFFF" stroke={ink} strokeWidth={10} />
      <circle cx={260} cy={170} r={18} fill={ink} />
    </Frame>
  );
};

const Magnifier: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  return (
    <Frame spec={spec}>
      <g transform="rotate(-25 260 260)">
        <rect x={242} y={350} width={36} height={140} rx={16} fill={ink} stroke={ink} strokeWidth={6} />
        <rect x={248} y={330} width={24} height={24} fill={accent} />
        <circle cx={260} cy={210} r={130} fill="rgba(255, 255, 255, 0.4)" stroke={accent} strokeWidth={24} />
        <circle cx={260} cy={210} r={130} fill="none" stroke={ink} strokeWidth={10} />
        <path d="M180,140 A100,100 0 0,1 330,140" fill="none" stroke="#FFFFFF" strokeWidth={14} strokeLinecap="round" opacity={0.7} />
        <circle cx={260} cy={210} r={32} fill={accent} opacity={0.8} />
        <text x={260} y={222} textAnchor="middle" fontSize={42} fontWeight={800} fill="#FFFFFF">?</text>
      </g>
    </Frame>
  );
};

const Sword: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  return (
    <Frame spec={spec}>
      <g transform="rotate(35 260 260)">
        <path d="M246,360 L248,80 L260,30 L272,80 L274,360 Z" fill="#E2E8F0" stroke={ink} strokeWidth={12} strokeLinejoin="round" />
        <line x1={260} y1={60} x2={260} y2={340} stroke={ink} strokeWidth={6} opacity={0.4} />
        <rect x={170} y={360} width={180} height={26} rx={8} fill={accent} stroke={ink} strokeWidth={10} />
        <rect x={248} y={386} width={24} height={68} rx={6} fill={ink} />
        <circle cx={260} cy={470} r={22} fill={accent} stroke={ink} strokeWidth={10} />
      </g>
    </Frame>
  );
};

// ── CLASSICAL PHILOSOPHY & CONCEPTUAL THOUGHT EXPERIMENTS (Antidote 6.1) ────

const Kallipolis: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const sunPulse = 1 + Math.sin(frame * 0.08) * 0.05;
  return (
    <Frame spec={spec}>
      {/* Radiating Sun of the Good / Truth above the Ideal City */}
      <g transform={`translate(260, 90) scale(${sunPulse}) translate(-260, -90)`}>
        <circle cx={260} cy={90} r={46} fill="#F59E0B" opacity={0.3} />
        <circle cx={260} cy={90} r={32} fill="#FDE047" stroke={ink} strokeWidth={6} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((ang) => (
          <line
            key={ang}
            x1={260 + Math.cos((ang * Math.PI) / 180) * 38}
            y1={90 + Math.sin((ang * Math.PI) / 180) * 38}
            x2={260 + Math.cos((ang * Math.PI) / 180) * 54}
            y2={90 + Math.sin((ang * Math.PI) / 180) * 54}
            stroke="#F59E0B"
            strokeWidth={5}
            strokeLinecap="round"
          />
        ))}
      </g>

      {/* Tier 1: Gold / Rulers & Philosopher Kings Citadel */}
      <polygon points="260,140 210,195 310,195" fill={accent} stroke={ink} strokeWidth={10} strokeLinejoin="round" />
      <circle cx={260} cy={172} r={12} fill="#FFFFFF" />

      {/* Tier 2: Silver / Guardians & Protectors Ramparts */}
      <path d="M160,205 L360,205 L380,310 L140,310 Z" fill="#E2E8F0" stroke={ink} strokeWidth={12} strokeLinejoin="round" />
      {/* Battlements */}
      <rect x={175} y={192} width={26} height={20} fill={ink} />
      <rect x={225} y={192} width={26} height={20} fill={ink} />
      <rect x={270} y={192} width={26} height={20} fill={ink} />
      <rect x={320} y={192} width={26} height={20} fill={ink} />
      {/* Guardian Shields */}
      <circle cx={215} cy={260} r={22} fill={accent} stroke={ink} strokeWidth={6} />
      <circle cx={305} cy={260} r={22} fill={accent} stroke={ink} strokeWidth={6} />

      {/* Tier 3: Bronze / Producers & Artisans Foundation Walls */}
      <path d="M90,320 L430,320 L460,450 L60,450 Z" fill="#D97706" stroke={ink} strokeWidth={14} strokeLinejoin="round" />
      {/* Classical Arches / Workshops */}
      <path d="M120,450 L120,380 A40,40 0 0,1 200,380 L200,450" fill={ink} />
      <path d="M220,450 L220,370 A40,40 0 0,1 300,370 L300,450" fill={ink} />
      <path d="M320,450 L320,380 A40,40 0 0,1 400,380 L400,450" fill={ink} />

      {/* Foundation plinth */}
      <rect x={40} y={450} width={440} height={24} rx={6} fill={ink} />
    </Frame>
  );
};

const CaveAllegory: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const flicker = Math.sin(frame * 0.25) * 6;
  const state = typeof spec.stateIndex === "number" ? spec.stateIndex : 0;
  const isAscent = state >= 2;
  const isPuppetFocus = state === 1;
  return (
    <Frame spec={spec}>
      {/* Cavern Rock Vault */}
      <path
        d="M40,470 L40,140 Q150,40 320,40 Q440,40 480,180 L480,470 Z"
        fill="#1E293B"
        stroke={ink}
        strokeWidth={14}
        strokeLinejoin="round"
      />

      {/* Upper Daylight Exit (Right) - Expands dramatically on ascent / knowledge */}
      <polygon points="410,40 480,40 480,220 370,160" fill="#FEF08A" opacity={isAscent ? 0.95 : 0.4} />
      <line
        x1={370}
        y1={160}
        x2={isAscent ? 180 : 220}
        y2={isAscent ? 360 : 290}
        stroke="#FEF08A"
        strokeWidth={isAscent ? 22 : 10}
        strokeDasharray={isAscent ? "none" : "16 16"}
        opacity={isAscent ? 0.85 : 0.4}
      />

      {/* The Fire on Pedestal (Center-Left) */}
      <rect x={160} y={260} width={36} height={80} rx={4} fill={ink} opacity={isPuppetFocus ? 1 : 0.7} />
      <path
        d={`M178,${260 + flicker} Q150,220 178,180 Q210,220 178,${260 + flicker} Z`}
        fill="#EF4444"
        stroke="#F59E0B"
        strokeWidth={isPuppetFocus ? 8 : 6}
      />
      <circle cx={178} cy={220} r={isPuppetFocus ? 18 : 14} fill="#FEF08A" />

      {/* Low Puppet Screen / Parapet */}
      <rect x={230} y={290} width={80} height={140} rx={6} fill={accent} stroke={ink} strokeWidth={10} />
      {/* Puppet held over screen */}
      <line x1={270} y1={290} x2={270} y2={230} stroke={ink} strokeWidth={6} />
      <polygon points="250,230 290,230 270,195" fill={ink} />

      {/* Projected False Shadow on Cave Wall (Far Left) - Dimmed if prisoner turns away */}
      <g opacity={isAscent ? 0.15 : 0.45 + Math.sin(frame * 0.2) * 0.15}>
        <polygon points="70,300 110,300 90,265" fill={ink} />
        <ellipse cx={90} cy={340} rx={24} ry={40} fill={ink} />
      </g>

      {/* Chained Prisoner / Ascending Seeker (Bottom-Right) */}
      <g transform={isAscent ? "translate(30, -30) scale(1.05)" : undefined}>
        <circle cx={360} cy={350} r={18} fill={isAscent ? "#FEF08A" : accent} stroke={ink} strokeWidth={6} />
        <path d="M360,370 L360,430 L340,460" stroke={ink} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d={isAscent ? "M360,390 L390,360" : "M360,390 L340,410"} stroke={ink} strokeWidth={8} strokeLinecap="round" />
        {/* Neck / Leg Chains - Broken if ascending */}
        {!isAscent && (
          <>
            <circle cx={360} cy={372} r={8} fill="none" stroke="#DC2626" strokeWidth={5} />
            <ellipse cx={345} cy={440} rx={12} ry={6} fill="none" stroke="#DC2626" strokeWidth={5} />
            <line x1={355} y1={440} x2={430} y2={455} stroke="#DC2626" strokeWidth={5} strokeDasharray="6 6" />
          </>
        )}
      </g>

      {/* Cave Floor */}
      <line x1={30} y1={470} x2={490} y2={470} stroke={ink} strokeWidth={14} strokeLinecap="round" />
    </Frame>
  );
};

const ShipOfState: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const pitch = Math.sin(frame * 0.08) * 8;
  return (
    <Frame spec={spec}>
      {/* Night Sky with Guiding Constellation / True Pilot's Star */}
      <g opacity={0.9}>
        <circle cx={390} cy={90} r={14} fill="#FDE047" stroke={ink} strokeWidth={4} />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <line
            key={deg}
            x1={390 + Math.cos((deg * Math.PI) / 180) * 16}
            y1={90 + Math.sin((deg * Math.PI) / 180) * 16}
            x2={390 + Math.cos((deg * Math.PI) / 180) * 26}
            y2={90 + Math.sin((deg * Math.PI) / 180) * 26}
            stroke="#FDE047"
            strokeWidth={4}
            strokeLinecap="round"
          />
        ))}
        {/* Constellation lines */}
        <circle cx={320} cy={120} r={4} fill="#FFFFFF" />
        <circle cx={440} cy={130} r={4} fill="#FFFFFF" />
        <circle cx={350} cy={60} r={4} fill="#FFFFFF" />
        <line x1={320} y1={120} x2={350} y2={60} stroke="#FFFFFF" strokeWidth={2} opacity={0.5} />
        <line x1={350} y1={60} x2={390} y2={90} stroke="#FFFFFF" strokeWidth={2} opacity={0.5} />
        <line x1={390} y1={90} x2={440} y2={130} stroke="#FFFFFF" strokeWidth={2} opacity={0.5} />
      </g>

      {/* Greek Galley / Trireme Ship tossing on waves */}
      <g transform={`rotate(${pitch} 260 320)`}>
        {/* Mast and Rigging */}
        <line x1={260} y1={120} x2={260} y2={340} stroke={ink} strokeWidth={14} strokeLinecap="round" />
        <line x1={260} y1={140} x2={110} y2={320} stroke={ink} strokeWidth={5} />
        <line x1={260} y1={140} x2={410} y2={320} stroke={ink} strokeWidth={5} />
        {/* Main Yard & Billowing Sail */}
        <line x1={150} y1={160} x2={370} y2={160} stroke={ink} strokeWidth={10} strokeLinecap="round" />
        <path d="M160,160 Q260,200 360,160 Q280,270 170,260 Z" fill="#FFFBEB" stroke={ink} strokeWidth={10} />

        {/* The True Pilot at Stern (Stern on Right) */}
        <circle cx={380} cy={270} r={12} fill="#F59E0B" stroke={ink} strokeWidth={5} />
        <path d="M380,282 L380,315 M380,295 L405,275" stroke={ink} strokeWidth={7} strokeLinecap="round" />
        {/* Steering Oar (Rudder) */}
        <line x1={390} y1={310} x2={440} y2={410} stroke={accent} strokeWidth={10} strokeLinecap="round" />

        {/* Quarreling Mutinous Sailors at Prow (Left) */}
        <circle cx={150} cy={290} r={10} fill="#EF4444" stroke={ink} strokeWidth={4} />
        <line x1={150} y1={300} x2={150} y2={325} stroke={ink} strokeWidth={6} />
        <circle cx={185} cy={285} r={10} fill="#EF4444" stroke={ink} strokeWidth={4} />
        <line x1={185} y1={295} x2={195} y2={325} stroke={ink} strokeWidth={6} />
        {/* Clashing daggers/fists */}
        <line x1={155} y1={295} x2={180} y2={295} stroke="#DC2626" strokeWidth={5} />

        {/* Galley Hull with Classical Battering Ram */}
        <path
          d="M60,330 L90,320 L420,320 Q440,320 450,290 L460,340 Q390,390 120,380 L50,350 Z"
          fill={accent}
          stroke={ink}
          strokeWidth={14}
          strokeLinejoin="round"
        />
        {/* Row of Oars */}
        {[130, 170, 210, 250, 290, 330].map((ox) => (
          <line key={ox} x1={ox} y1={350} x2={ox - 35} y2={430} stroke={ink} strokeWidth={6} strokeLinecap="round" />
        ))}
      </g>

      {/* Churning Ocean Storm Waves */}
      <g>
        <path
          d="M20,420 Q90,380 160,420 Q230,460 300,420 Q370,380 440,420 Q490,450 510,420 L510,490 L20,490 Z"
          fill="#0284C7"
          stroke={ink}
          strokeWidth={10}
          opacity={0.7}
        />
        <path
          d="M-20,440 Q60,400 140,440 Q220,480 300,440 Q380,400 460,440 L460,500 L-20,500 Z"
          fill="#0369A1"
          stroke={ink}
          strokeWidth={8}
          opacity={0.85}
        />
      </g>
    </Frame>
  );
};

const TripartiteSoul: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const state = typeof spec.stateIndex === "number" ? spec.stateIndex : 0;
  const isAppetiteMutiny = state === 1;
  const isHarmony = state >= 2;
  const spiritLeap = Math.sin(frame * 0.12) * (isAppetiteMutiny ? 4 : 8);
  const appetiteStruggle = Math.sin(frame * (isAppetiteMutiny ? 0.35 : 0.18)) * (isAppetiteMutiny ? 22 : 10);
  return (
    <Frame spec={spec}>
      {/* Triangular Balance Structure */}
      <polygon
        points="260,70 80,400 440,400"
        fill={isHarmony ? "rgba(253, 224, 71, 0.08)" : "none"}
        stroke={isHarmony ? "#F59E0B" : ink}
        strokeWidth={isHarmony ? 10 : 8}
        strokeDasharray={isHarmony ? "none" : "12 8"}
        opacity={isHarmony ? 0.8 : 0.3}
      />

      {/* TOP: REASON (Logistikon / Golden Charioteer / Wisdom) */}
      <g>
        <circle cx={260} cy={95} r={46} fill={isHarmony ? "#FDE047" : "#FEF08A"} stroke={ink} strokeWidth={10} />
        {/* Golden Laurel Crown */}
        <path d="M230,85 Q260,60 290,85" fill="none" stroke="#D97706" strokeWidth={8} strokeLinecap="round" />
        <circle cx={260} cy={95} r={16} fill={accent} />
        {/* Reins running down to horses - Strained red under appetite mutiny */}
        <path d="M240,125 Q170,200 130,280" fill="none" stroke={isAppetiteMutiny ? "#DC2626" : "#D97706"} strokeWidth={isAppetiteMutiny ? 9 : 7} strokeDasharray="8 6" />
        <path d="M280,125 Q350,200 390,280" fill="none" stroke={isAppetiteMutiny ? "#DC2626" : "#D97706"} strokeWidth={isAppetiteMutiny ? 9 : 7} strokeDasharray="8 6" />
      </g>

      {/* LEFT: SPIRIT (Thumos / White Noble Steed / Courage & Honor) */}
      <g transform={`translate(0, ${spiritLeap})`}>
        <rect x={70} y={260} width={130} height={140} rx={24} fill="#F8FAFC" stroke={ink} strokeWidth={10} />
        {/* Noble horse head silhouette / crest */}
        <path d="M90,360 L90,290 Q120,250 160,270 L175,300 L150,320 L165,360 Z" fill={accent} stroke={ink} strokeWidth={6} />
        <circle cx={145} cy={285} r={8} fill="#FDE047" />
        {/* Silver Shield */}
        <circle cx={135} cy={380} r={28} fill="#94A3B8" stroke={ink} strokeWidth={6} />
        <text x={135} y={387} textAnchor="middle" fontSize={18} fontWeight={900} fill="#FFFFFF">HONOR</text>
      </g>

      {/* RIGHT: APPETITE (Epithumia / Dark Wild Beast / Desire & Greed) */}
      <g transform={`translate(0, ${appetiteStruggle}) scale(${isAppetiteMutiny ? 1.12 : 1}) translate(${isAppetiteMutiny ? -20 : 0}, 0)`}>
        <rect x={320} y={260} width={130} height={140} rx={24} fill={isAppetiteMutiny ? "#7F1D1D" : "#1E293B"} stroke={ink} strokeWidth={10} />
        {/* Beast horns / snarling maw */}
        <path d="M430,360 L430,300 Q400,250 360,280 L345,310 L370,330 L355,360 Z" fill="#DC2626" stroke={ink} strokeWidth={6} />
        <circle cx={375} cy={295} r={7} fill="#FEF08A" />
        {/* Restraining collar */}
        <ellipse cx={385} cy={335} rx={26} ry={12} fill="none" stroke={isAppetiteMutiny ? "#DC2626" : "#F59E0B"} strokeWidth={isAppetiteMutiny ? 8 : 6} />
        <text x={385} y={387} textAnchor="middle" fontSize={16} fontWeight={900} fill="#DC2626">DESIRE</text>
      </g>

      {/* Balance Fulcrum Plinth */}
      <polygon points="260,370 230,440 290,440" fill={ink} />
      <line x1={110} y1={440} x2={410} y2={440} stroke={ink} strokeWidth={12} strokeLinecap="round" />
    </Frame>
  );
};

const RingOfGyges: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const shimmer = Math.sin(frame * 0.1) * 0.3 + 0.7;
  const state = typeof spec.stateIndex === "number" ? spec.stateIndex : 0;
  const isInvisible = state === 1;
  const isMoralFork = state >= 2;
  return (
    <Frame spec={spec}>
      {/* Shimmering Invisibility Aura */}
      <circle cx={260} cy={240} r={170} fill="none" stroke="#FDE047" strokeWidth={isInvisible ? 8 : 4} strokeDasharray="14 14" opacity={shimmer * (isInvisible ? 0.9 : 0.6)} />

      {/* Massive Golden Ring Band */}
      <ellipse cx={260} cy={260} rx={140} ry={110} fill="none" stroke="#D97706" strokeWidth={32} />
      <ellipse cx={260} cy={260} rx={140} ry={110} fill="none" stroke="#FDE047" strokeWidth={18} />
      <ellipse cx={260} cy={260} rx={140} ry={110} fill="none" stroke={ink} strokeWidth={8} />

      {/* Inward-turned Collet & Gem (The device of invisibility) */}
      <g transform={`rotate(${isInvisible ? -55 : -20} 260 160)`}>
        <polygon points="220,170 300,170 320,120 200,120" fill={accent} stroke={ink} strokeWidth={10} strokeLinejoin="round" />
        <polygon points="230,120 290,120 310,75 210,75" fill="#7C3AED" stroke={ink} strokeWidth={10} strokeLinejoin="round" />
        {/* Mystic Eye of Gyges in Gem */}
        <ellipse cx={260} cy={98} rx={26} ry={14} fill="#FFFFFF" stroke={ink} strokeWidth={5} />
        <circle cx={260} cy={98} r={9} fill="#4C1D95" />
      </g>

      {/* The Disappearing / Invisible Human Figure */}
      <g transform="translate(230, 200)">
        {/* Left half: Solid visible man (almost gone if invisible) */}
        <path d="M30,0 A20,20 0 0,0 10,20 L10,70 L25,70 L25,120 L30,120 Z" fill={ink} opacity={isInvisible ? 0.15 : 1} />
        {/* Right half: Vanishing dotted ghost silhouette */}
        <path
          d="M30,0 A20,20 0 0,1 50,20 L50,70 L35,70 L35,120 L30,120 Z"
          fill="none"
          stroke={accent}
          strokeWidth={5}
          strokeDasharray="6 6"
          opacity={isInvisible ? 0.35 : shimmer}
        />
      </g>

      {/* Moral Fork: Broken Scales of Justice beneath */}
      <line x1={150} y1={440} x2={370} y2={440} stroke={ink} strokeWidth={8} strokeLinecap="round" />
      <path d="M190,440 L160,400 M210,440 L240,400" stroke={ink} strokeWidth={4} />
      <path d="M160,400 Q200,420 240,400 Z" fill="#EF4444" stroke={ink} strokeWidth={6} />
      <path d="M310,440 L340,455 M330,440 L360,455" stroke={ink} strokeWidth={4} />
      <path d="M320,460 Q340,480 360,460 Z" fill={isMoralFork ? "#FDE047" : "#94A3B8"} stroke={ink} strokeWidth={5} />
    </Frame>
  );
};

const ThirtyTyrants: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame * 0.15) * 4;
  return (
    <Frame spec={spec}>
      {/* Ring of Inward-Pointing Spartan Spearheads */}
      <circle cx={260} cy={260} r={180} fill="#7F1D1D" opacity={0.15} />

      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 260 + Math.cos(rad) * (200 + pulse);
        const y1 = 260 + Math.sin(rad) * (200 + pulse);
        const x2 = 260 + Math.cos(rad) * 115;
        const y2 = 260 + Math.sin(rad) * 115;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth={10} strokeLinecap="round" />
            <polygon
              points={`${x2},${y2} ${x2 + Math.cos(rad + 0.3) * 26},${y2 + Math.sin(rad + 0.3) * 26} ${x2 + Math.cos(rad - 0.3) * 26},${y2 + Math.sin(rad - 0.3) * 26}`}
              fill="#DC2626"
              stroke={ink}
              strokeWidth={4}
            />
          </g>
        );
      })}

      {/* Center: Crushed Athenian Democracy */}
      <g>
        <ellipse cx={260} cy={275} rx={85} ry={45} fill="#DC2626" opacity={0.4} />
        <g transform="rotate(65 260 260)">
          <ellipse cx={260} cy={260} rx={34} ry={54} fill={accent} stroke={ink} strokeWidth={9} />
          <rect x={245} y={200} width={30} height={20} rx={4} fill={ink} />
          <circle cx={220} cy={260} r={8} fill="#FFFFFF" stroke={ink} strokeWidth={3} />
          <circle cx={205} cy={275} r={8} fill="#FFFFFF" stroke={ink} strokeWidth={3} />
          <circle cx={190} cy={255} r={8} fill="#FFFFFF" stroke={ink} strokeWidth={3} />
        </g>
        <path d="M220,300 Q260,285 300,310" stroke="#15803D" strokeWidth={6} fill="none" strokeLinecap="round" />
        <ellipse cx={245} cy={290} rx={9} ry={5} fill="#22C55E" />
        <ellipse cx={285} cy={300} rx={9} ry={5} fill="#22C55E" />
      </g>

      {/* Spartan Lambda (Λ) Crest */}
      <g transform="translate(260, 110)">
        <polygon points="-40,40 40,40 0,-30" fill="#DC2626" stroke={ink} strokeWidth={7} strokeLinejoin="round" />
        <path d="M-18,28 L0,-12 L18,28" stroke="#FDE047" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </Frame>
  );
};

const FiveRegimes: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const state = typeof spec.stateIndex === "number" ? Math.min(4, Math.max(0, spec.stateIndex)) : Math.floor((frame / 20) % 5);
  const stepActive = state;
  return (
    <Frame spec={spec}>
      {/* Stepped Downward Descent: Aristocracy -> Timocracy -> Oligarchy -> Democracy -> Tyranny */}
      <path d="M60,110 L140,110 L140,180 L220,180 L220,250 L300,250 L300,320 L380,320 L380,390 L460,390" fill="none" stroke={ink} strokeWidth={10} strokeLinejoin="round" />

      {/* Cascading Downward Fall Arrow */}
      <path d="M100,80 Q260,120 440,360" fill="none" stroke="#DC2626" strokeWidth={6} strokeDasharray="10 8" />
      <polygon points="440,360 445,340 425,350" fill="#DC2626" />

      {/* Step 1: Aristocracy (Crown / Wisdom) */}
      <g transform="translate(100, 75)">
        <circle cx={0} cy={0} r={24} fill={stepActive === 0 ? "#FDE047" : "#CBD5E1"} stroke={ink} strokeWidth={6} />
        <polygon points="-12,6 12,6 12,-6 6,0 0,-10 -6,0 -12,-6" fill={ink} />
      </g>

      {/* Step 2: Timocracy (Spear / Honor) */}
      <g transform="translate(180, 145)">
        <circle cx={0} cy={0} r={24} fill={stepActive === 1 ? "#94A3B8" : "#E2E8F0"} stroke={ink} strokeWidth={6} />
        <line x1={-10} y1={10} x2={10} y2={-10} stroke={ink} strokeWidth={5} />
        <polygon points="8,-8 14,-14 6,-14" fill="#DC2626" />
      </g>

      {/* Step 3: Oligarchy (Gold Coin / Wealth) */}
      <g transform="translate(260, 215)">
        <circle cx={0} cy={0} r={24} fill={stepActive === 2 ? "#F59E0B" : "#FDE68A"} stroke={ink} strokeWidth={6} />
        <text x={0} y={7} textAnchor="middle" fontSize={22} fontWeight={900} fill={ink}>$</text>
      </g>

      {/* Step 4: Democracy (Ballot Urn / Equality-License) */}
      <g transform="translate(340, 285)">
        <circle cx={0} cy={0} r={24} fill={stepActive === 3 ? accent : "#BAE6FD"} stroke={ink} strokeWidth={6} />
        <rect x={-8} y={-8} width={16} height={16} rx={3} fill={ink} />
        <line x1={-4} y1={-8} x2={4} y2={-8} stroke="#FFFFFF" strokeWidth={3} />
      </g>

      {/* Step 5: Tyranny (Iron Shackle & Dagger / Pure Appetite) */}
      <g transform="translate(420, 355)">
        <circle cx={0} cy={0} r={26} fill={stepActive === 4 ? "#EF4444" : "#FCA5A5"} stroke={ink} strokeWidth={7} />
        <line x1={-8} y1={-8} x2={8} y2={8} stroke="#1E293B" strokeWidth={6} strokeLinecap="round" />
        <circle cx={-8} cy={-8} r={5} fill="none" stroke="#1E293B" strokeWidth={3} />
      </g>

      {/* Stage Floor */}
      <line x1={40} y1={440} x2={480} y2={440} stroke={ink} strokeWidth={12} strokeLinecap="round" />
    </Frame>
  );
};

const MythOfEr: React.FC<MotifProps> = ({ spec, accent, ink }) => {
  const frame = useCurrentFrame();
  const rot1 = (frame * 0.4) % 360;
  const rot2 = (-frame * 0.6) % 360;
  return (
    <Frame spec={spec}>
      {/* The Central Pillar of Light */}
      <line x1={260} y1={40} x2={260} y2={480} stroke="#FEF08A" strokeWidth={24} opacity={0.4} />
      <line x1={260} y1={40} x2={260} y2={480} stroke="#FFFFFF" strokeWidth={8} opacity={0.8} />

      {/* The Cosmic Spindle of Necessity */}
      <g transform={`translate(260, 240) rotate(${rot1})`}>
        <ellipse cx={0} cy={0} rx={180} ry={70} fill="none" stroke={ink} strokeWidth={7} strokeDasharray="14 10" />
        <circle cx={180} cy={0} r={12} fill="#38BDF8" stroke={ink} strokeWidth={4} />
      </g>

      <g transform={`translate(260, 240) rotate(${rot2})`}>
        <ellipse cx={0} cy={0} rx={130} ry={50} fill="none" stroke={accent} strokeWidth={8} />
        <circle cx={-130} cy={0} r={10} fill="#F59E0B" stroke={ink} strokeWidth={4} />
      </g>

      {/* Central Spindle Shaft */}
      <rect x={248} y={150} width={24} height={180} rx={12} fill="#D97706" stroke={ink} strokeWidth={8} />
      <circle cx={260} cy={240} r={32} fill="#FDE047" stroke={ink} strokeWidth={8} />
      <circle cx={260} cy={240} r={12} fill={ink} />

      {/* The Three Fates' Threads */}
      <path d="M120,440 Q180,340 250,250" fill="none" stroke="#EC4899" strokeWidth={6} strokeLinecap="round" />
      <path d="M260,250 Q320,350 400,440" fill="none" stroke="#8B5CF6" strokeWidth={6} strokeLinecap="round" />
      <path d="M260,260 L260,450" fill="none" stroke="#10B981" strokeWidth={6} strokeLinecap="round" />

      {/* Soul Lots Cast on Ground */}
      <ellipse cx={180} cy={445} rx={16} ry={7} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
      <ellipse cx={260} cy={455} rx={16} ry={7} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
      <ellipse cx={340} cy={445} rx={16} ry={7} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
    </Frame>
  );
};

const REGISTRY: Record<PropSpec["type"], React.FC<MotifProps>> = {
  moneyRain: MoneyRain, coin: Coin, book: Book, arrow: Arrow, shape: Shape,
  barChart: BarChart, lineGrowth: LineGrowth, balance: Balance, ladder: Ladder,
  door: Door, clock: Clock, maze: Maze, spotlight: Spotlight, counter: Counter,
  orbit: Orbit, stack: Stack, crack: Crack, ripple: Ripple, summit: Summit,
  // scene icons — Phase 1
  home: Home, family: Family, star: Star, heart: Heart, road: Road, storm: Storm,
  school: School, phone: Phone, ledge: Ledge, medical: Medical, grave: Grave,
  notes: Notes, water: Water, fire: Fire, crash: Crash, tree: Tree,
  // scene icons — Phase 2
  work: Work, game: Game, war: War, food: Food, city: City, photo: Photo,
  law: Law, mask: Mask, key: Key, mirror: Mirror,
  // Archetypal / Philosophical Metaphors
  lightbulb: Lightbulb, shadowSelf: ShadowSelf, puppeteer: Puppeteer,
  iceberg: Iceberg, chains: Chains, compass: Compass,
  // Hypnotic Vector Metaphors
  dominoCascade: DominoCascade,
  icebergDepth: IcebergDepth,
  funnelTrap: FunnelTrap,
  // Tech & Silicon Valley Business Motifs
  codeWindow: CodeWindow,
  laptopMockup: LaptopMockup,
  funnelMetrics: FunnelMetrics,
  rocketLaunch: RocketLaunch,
  dollarExchange: DollarExchange,
  // High-Retention Narrative & Metaphor Motifs (Antidote 5.1)
  alarmClock: AlarmClock,
  hourglass: Hourglass,
  zap: Zap,
  shield: Shield,
  target: Target,
  trophy: Trophy,
  sword: Sword,
  magnifier: Magnifier,
  wallet: Wallet,
  gift: Gift,
  subway: Subway,
  butterfly: Butterfly,
  coffee: Coffee,
  car: Car,
  // Classical Philosophy & Conceptual Thought Experiments (Antidote 6.1)
  kallipolis: Kallipolis,
  caveAllegory: CaveAllegory,
  shipOfState: ShipOfState,
  tripartiteSoul: TripartiteSoul,
  ringOfGyges: RingOfGyges,
  thirtyTyrants: ThirtyTyrants,
  fiveRegimes: FiveRegimes,
  mythOfEr: MythOfEr,
  // Dynamic Extensible SVG Motifs (AI Art Director)
  customSvg: CustomSvgMotif,
};

/** The concrete narrative icons — the vocabulary the `illustration` shot draws from. */
export const SCENE_ICONS: PropSpec["type"][] = [
  "home", "family", "star", "heart", "road", "storm", "school", "phone",
  "ledge", "medical", "grave", "notes", "water", "fire", "crash", "tree",
  "work", "game", "war", "food", "city", "photo", "law", "mask", "key", "mirror",
  "lightbulb", "shadowSelf", "puppeteer", "iceberg", "chains", "compass",
  "dominoCascade", "icebergDepth", "funnelTrap",
  "codeWindow", "laptopMockup", "funnelMetrics", "rocketLaunch", "dollarExchange",
  "alarmClock", "hourglass", "zap", "shield", "target", "trophy", "sword",
  "magnifier", "wallet", "gift", "subway", "butterfly", "coffee", "car",
  "kallipolis", "caveAllegory", "shipOfState", "tripartiteSoul", "ringOfGyges", "thirtyTyrants", "fiveRegimes", "mythOfEr",
  "customSvg",
];

/** Motifs that read as the sole subject of an `insert` shot. */
export const INSERT_MOTIFS: PropSpec["type"][] = [
  "barChart", "lineGrowth", "balance", "clock", "maze", "counter",
  "orbit", "stack", "crack", "ripple", "summit", "ladder", "door", "spotlight",
  "alarmClock", "hourglass", "zap", "shield", "target", "trophy", "sword",
  "magnifier", "wallet", "gift", "subway", "butterfly", "coffee", "car",
  ...SCENE_ICONS,
];

export const Motif: React.FC<{ spec: PropSpec; accent: string; ink: string }> = ({ spec, accent, ink }) => {
  const Component = REGISTRY[spec.type];
  if (!Component) return null;
  return <Component spec={spec} accent={spec.color || accent} ink={spec.color2 || ink} />;
};
