import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { AntidoteConfig } from "../schema";
import { ANTIDOTE_FONT } from "./KineticText";
import { useSkin, SKIN_FONT } from "./skin";

/**
 * FormBoard — WHEN A PART BEGINS, THE FILM SHOWS WHERE IT STANDS IN ITS OWN FORM (2026-11-18, narrative-form.js).
 *
 * The moment the hosts announce a part ("Exhibit three: the Demeter's log") a board comes up for about three seconds,
 * between the top band and the subtitles: a cork board where the new exhibit is pinned beside the earlier ones and
 * tied to them, a map where the marker travels to the next station, a gallery wall where one more frame is filled, a
 * notebook where the next rule is written, a blackboard where the last answer is struck out … One board per form;
 * everything on it is the book's own (its part names, in order). A film in another form shows another object.
 *
 * It replaces nothing an author staged: it stands over the scene only while the part is being announced (the
 * narration is its caption), then the scene is there again. One SVG, no perpetual motion — things arrive once.
 * Drawn only when meta.form has at least three announced parts; hidden where the top band is hidden.
 */
type Shape = { d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number };
type Art = { kind: "thing" | "person"; viewBox?: string; paths?: Shape[]; variant?: Record<string, unknown> };
type Part = { n: number; from: number; title?: string; art?: Art };

const shapes = (list: Shape[] | undefined, pre: string) => (list || []).map((p, i) => <path key={pre + i} d={p.d} fill={p.fill ?? "none"} stroke={p.stroke ?? (p.fill ? "none" : "#1E1E22")} strokeWidth={p.strokeWidth ?? (p.fill ? 0 : 7)} strokeLinecap="round" strokeLinejoin="round" opacity={p.opacity ?? 1} />);

/**
 * The book's own drawing of what a part is about, fitted into a w × h box centred on 0,0: a thing's paths as drawn in
 * entities.json, or a person's HEAD as the rig wears it (their own drawn layers — back, face, hair, top — with the
 * rig's eyes and mouth where it puts them; rig units: the face is the ellipse at 200,150).
 */
const PartArt: React.FC<{ art: Art; w: number; h: number }> = ({ art, w, h }) => {
  if (art.kind === "thing") {
    const [vx, vy, vw, vh] = (art.viewBox || "0 0 520 520").split(/[\s,]+/).map(Number);
    const k = Math.min(w / vw, h / vh);
    return <g transform={`translate(${-(vx + vw / 2) * k} ${-(vy + vh / 2) * k}) scale(${k})`}>{shapes(art.paths, "t")}</g>;
  }
  const v = (art.variant || {}) as { skin?: string; hair?: string; drawn?: Record<string, Shape[]> };
  const d = v.drawn || {}, skin = v.skin || "#F2C79B", hair = v.hair || "#3A2A22";
  const own = ["back", "face", "hair", "top"].some((key) => (d[key] || []).length);
  const k = Math.min(w / 300, h / 330); // the head with its hair and a hat: about 300 × 330 rig units round 200,130
  return (
    <g transform={`scale(${k}) translate(-200 -130)`}>
      {own ? shapes(d.back, "b") : <path d="M108 150 Q104 58 200 50 Q296 58 292 150 Q282 94 200 94 Q118 94 108 150 Z" fill={hair} />}
      {own && (d.face || []).length ? shapes(d.face, "f") : <g><ellipse cx={112} cy={158} rx={14} ry={20} fill={skin} /><ellipse cx={288} cy={158} rx={14} ry={20} fill={skin} /><ellipse cx={200} cy={150} rx={92} ry={104} fill={skin} /></g>}
      {own ? shapes(d.hair, "h") : <path d="M110 138 Q106 40 200 38 Q294 40 290 138 Q270 86 200 100 Q130 86 110 138 Z" fill={hair} />}
      <circle cx={168} cy={132} r={15} fill="#FFFFFF" /><circle cx={232} cy={132} r={15} fill="#FFFFFF" />
      <circle cx={170} cy={134} r={7} fill="#1E1E22" /><circle cx={234} cy={134} r={7} fill="#1E1E22" />
      <path d="M176 216 H224" stroke="#7A5A48" strokeWidth={7} strokeLinecap="round" />
      {own ? shapes(d.top, "p") : null}
    </g>
  );
};
const HOLD = 84, IN = 9, OUT = 11; // frames on screen, fade in, fade out
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const INK = "#1A1412", PAPER = "#F4EFE6";
const MONO = '"JetBrains Mono", "SF Mono", Monaco, Consolas, monospace';
// the panel: under the top band, above the subtitle band
const PX = 150, PY = 118, PW = 1620, PH = 720;

/** N things in one or two rows inside the panel → centre points */
function grid(n: number, top = PY + 190, bottom = PY + PH - 150): Array<{ x: number; y: number }> {
  const rows = n > 6 ? 2 : 1, cols = Math.ceil(n / rows), out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols, inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
    const x = PX + PW / 2 + (c - (inRow - 1) / 2) * Math.min(390, (PW - 330) / Math.max(1, cols - 1));
    const y = rows === 1 ? (top + bottom) / 2 : top + (r * (bottom - top)) / (rows - 1);
    out.push({ x, y });
  }
  return out;
}
const lines = (s: string, max = 15): string[] => {
  const words = s.split(" "), out: string[] = [];
  for (const w of words) { if (out.length && (out[out.length - 1] + " " + w).length <= max) out[out.length - 1] += " " + w; else out.push(w); }
  return out.slice(0, 3);
};

export const FormBoard: React.FC<{ config: AntidoteConfig }> = ({ config }) => {
  const frame = useCurrentFrame();
  // THE BOOK'S SKIN (skin.tsx): the board's headings speak in the book's typeface (the channel's when it has none)
  const { skin: bookSkin } = useSkin();
  const HEAD = bookSkin.font === "poppins" ? ANTIDOTE_FONT : SKIN_FONT[bookSkin.font];
  const form = config.meta.form;
  if (!form || (form.parts || []).length < 3) return null;
  const parts: Part[] = form.parts, N = parts.length;
  let cur = -1;
  for (let i = 0; i < N; i++) if (frame >= parts[i].from) cur = i;
  if (cur < 0) return null;
  const t = frame - parts[cur].from;
  if (t >= HOLD) return null;
  const active = config.scenes.find((s) => frame >= s.fromFrame && frame < s.fromFrame + s.durationFrames);
  if (!active || active.hud?.hidden || active.shot === "chapterCard" || !!active.chapterCard) return null;

  const o = Math.min(ease(t / IN), 1 - ease((t - (HOLD - OUT)) / OUT));
  const a = ease((t - 6) / 16); // the new part arriving, once
  const accent = config.meta.hud?.accent ?? "#C2410C";
  const key = form.key;
  const P = key === "portraits" ? grid(N, PY + 240, PY + PH - 150) : key === "case" ? grid(N, PY + 230, PY + PH - 130) : key === "journey" ? grid(N, PY + 270, PY + PH - 120) : grid(N);
  const name = (i: number) => (parts[i].title || `${form.part} ${parts[i].n}`).toUpperCase();
  const head = `${form.part} ${parts[cur].n}`;
  const title = (parts[cur].title || "").toUpperCase();

  const skin: Record<string, { bg: string; frame: string; ink: string }> = {
    case: { bg: "#B58A5C", frame: "#5C3D22", ink: INK },
    journey: { bg: "#EFE6D2", frame: "#8A7B5E", ink: INK },
    portraits: { bg: "#3B3440", frame: "#1F1B22", ink: PAPER },
    practice: { bg: "#FBF8EE", frame: "#C9BFA6", ink: INK },
    trial: { bg: "#2A2F3A", frame: "#11141A", ink: PAPER },
    duel: { bg: "#F1ECE2", frame: "#1A1412", ink: INK },
    question: { bg: "#22332C", frame: "#5C3D22", ink: PAPER },
    anatomy: { bg: "#1E3A5F", frame: "#12263F", ink: PAPER },
  };
  const S = skin[key] || skin.practice;
  let body: React.ReactNode = null;

  if (key === "case") {
    // a cork board: every exhibit so far is a pinned card; a string runs from pin to pin; the new one is laid on last
    const cw = N > 6 ? 250 : 270, ch = 170;
    body = (
      <g>
        {cur >= 1 ? <polyline points={P.slice(0, cur + 1).map((p, i) => (i === cur ? `${P[cur - 1].x + (p.x - P[cur - 1].x) * a},${P[cur - 1].y - ch / 2 + (p.y - P[cur - 1].y) * a}` : `${p.x},${p.y - ch / 2}`)).join(" ")} fill="none" stroke={accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {P.map((p, i) => {
          if (i > cur) return <rect key={i} x={p.x - cw / 2} y={p.y - ch / 2} width={cw} height={ch} rx={6} fill="none" stroke="rgba(26,20,18,0.28)" strokeWidth={3} strokeDasharray="10 10" />;
          const isNew = i === cur, k = isNew ? 1.5 - 0.5 * a : 1, tilt = (i % 2 ? 3 : -3) * (isNew ? a : 1);
          return (
            <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${tilt}) scale(${k})`} opacity={isNew ? a : 1}>
              <rect x={-cw / 2 + 5} y={-ch / 2 + 7} width={cw} height={ch} rx={6} fill="rgba(0,0,0,0.22)" />
              <rect x={-cw / 2} y={-ch / 2} width={cw} height={ch} rx={6} fill={PAPER} />
              <text x={-cw / 2 + 16} y={-ch / 2 + 38} fontFamily={MONO} fontWeight={800} fontSize={20} fill="#8A2A0C">{`${form.part} ${parts[i].n}`}</text>
              {lines(name(i)).map((l, j) => <text key={j} x={-cw / 2 + 16} y={-ch / 2 + 76 + j * 30} fontFamily={HEAD} fontWeight={900} fontSize={25} fill={INK}>{l}</text>)}
              {parts[i].art ? <g transform={`translate(${cw / 2 - 52} ${ch / 2 - 50})`}><PartArt art={parts[i].art!} w={84} h={84} /></g> : null}
              <circle cx={0} cy={-ch / 2} r={10} fill={accent} stroke="#5C1A0A" strokeWidth={2} />
            </g>
          );
        })}
      </g>
    );
  } else if (key === "journey") {
    // a route on a map: the marker travels from the last station to this one
    const mx = cur === 0 ? P[0].x : P[cur - 1].x + (P[cur].x - P[cur - 1].x) * a, my = cur === 0 ? P[0].y : P[cur - 1].y + (P[cur].y - P[cur - 1].y) * a;
    const d = P.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
    body = (
      <g>
        <path d={d} fill="none" stroke="rgba(26,20,18,0.25)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 20" />
        <path d={P.slice(0, cur).map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") + (cur ? ` L${mx} ${my}` : "")} fill="none" stroke={accent} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        {P.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={i <= cur ? 17 : 12} fill={i <= cur ? INK : S.bg} stroke={INK} strokeWidth={4} opacity={i <= cur ? 1 : 0.45} />
            {i <= cur && parts[i].art ? <g transform={`translate(${p.x} ${p.y - 76})`} opacity={i === cur ? a : 0.9}><PartArt art={parts[i].art!} w={150} h={96} /></g> : null}
            {i <= cur ? lines(name(i), 14).map((l, j) => <text key={j} x={p.x} y={p.y + 54 + j * 25} textAnchor="middle" fontFamily={HEAD} fontWeight={900} fontSize={i === cur ? 24 : 19} fill={INK} opacity={i === cur ? a : 0.7}>{l}</text>) : null}
          </g>
        ))}
        <path d={`M${mx} ${my - 20} l-20 -40 a20 20 0 1 1 40 0 Z`} fill={accent} stroke={INK} strokeWidth={3} />
      </g>
    );
  } else if (key === "portraits") {
    // a gallery wall: one more frame gets its person
    body = (
      <g>
        {P.map((p, i) => {
          const isNew = i === cur, k = isNew ? 1 + 0.12 * a : 1;
          return (
            <g key={i} transform={`translate(${p.x} ${p.y - 16}) scale(${k * (N > 6 ? 0.8 : 1)})`}>
              <rect x={-84} y={-104} width={168} height={208} fill="#C9A24B" stroke="#7A5E22" strokeWidth={5} />
              <rect x={-66} y={-86} width={132} height={172} fill={i <= cur ? PAPER : "#2A2530"} />
              {i <= cur ? (parts[i].art ? <g opacity={isNew ? a : 1} transform="translate(0 4)"><PartArt art={parts[i].art!} w={124} h={150} /></g> : <g opacity={isNew ? a : 1}><circle cx={0} cy={-22} r={30} fill={INK} /><path d="M-52 86 Q0 -6 52 86 Z" fill={INK} /></g>) : null}
              {i <= cur ? <g><rect x={-92} y={116} width={184} height={34} rx={4} fill={isNew ? accent : "#1F1B22"} /><text x={0} y={140} textAnchor="middle" fontFamily={HEAD} fontWeight={900} fontSize={18} fill={PAPER}>{name(i).slice(0, 15)}</text></g> : null}
            </g>
          );
        })}
      </g>
    );
  } else if (key === "practice") {
    // a notebook page: the rules tried are ticked, the next one is written in
    const rowH = Math.min(74, (PH - 190) / N);
    body = (
      <g>
        {parts.map((_, i) => {
          const y = PY + 150 + i * rowH, x = PX + 150;
          return (
            <g key={i}>
              <path d={`M${PX + 90} ${y + 22} H${PX + PW - 90}`} stroke="rgba(26,20,18,0.14)" strokeWidth={3} />
              <rect x={x} y={y - 24} width={40} height={40} rx={5} fill={i === cur ? accent : "none"} stroke={INK} strokeWidth={4} opacity={i <= cur ? 1 : 0.35} />
              {i < cur ? <path d={`M${x + 8} ${y - 4} l9 11 l17 -22`} fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" /> : null}
              {i <= cur ? <text x={x + 70} y={y + 8} fontFamily={HEAD} fontWeight={900} fontSize={Math.min(34, rowH * 0.5)} fill={INK} opacity={i === cur ? a : 0.6}>{name(i)}</text> : null}
            </g>
          );
        })}
        <path d={`M${PX + 118} ${PY + 90} V${PY + PH - 30}`} stroke={accent} strokeWidth={4} opacity={0.6} />
      </g>
    );
  } else if (key === "trial") {
    // the court's board: the round called, the rounds fought as tally bars
    body = (
      <g>
        <text x={PX + PW / 2} y={PY + 330} textAnchor="middle" fontFamily={HEAD} fontWeight={900} fontSize={150} fill={PAPER} opacity={a}>{head}</text>
        <rect x={PX + PW / 2 - 560 * a} y={PY + 370} width={1120 * a} height={8} fill={accent} />
        {lines(title, 34).slice(0, 2).map((l, j) => <text key={j} x={PX + PW / 2} y={PY + 450 + j * 60} textAnchor="middle" fontFamily={HEAD} fontWeight={900} fontSize={52} fill={PAPER} opacity={a}>{l}</text>)}
        {parts.map((_, i) => <rect key={i} x={PX + PW / 2 + (i - (N - 1) / 2) * 70 - 9} y={PY + PH - 130} width={18} height={62} rx={9} fill={i === cur ? accent : i < cur ? PAPER : "none"} stroke={PAPER} strokeWidth={3} opacity={i <= cur ? 1 : 0.35} />)}
      </g>
    );
  } else if (key === "duel") {
    // the ground split in two; the blades meet on the thing both readings claim
    body = (
      <g>
        <path d={`M${PX + PW / 2 + 90} ${PY} H${PX + PW} V${PY + PH} H${PX + PW / 2 - 90} Z`} fill={accent} opacity={0.9} />
        <path d={`M${PX + PW / 2 - 150 * a} ${PY + 190} L${PX + PW / 2 + 150 * a} ${PY + 470} M${PX + PW / 2 + 150 * a} ${PY + 190} L${PX + PW / 2 - 150 * a} ${PY + 470}`} stroke={INK} strokeWidth={16} strokeLinecap="round" />
        <rect x={PX + PW / 2 - 470} y={PY + 500} width={940} height={150} rx={10} fill={INK} />
        <text x={PX + PW / 2} y={PY + 556} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={30} fill={accent}>{head}</text>
        <text x={PX + PW / 2} y={PY + 620} textAnchor="middle" fontFamily={HEAD} fontWeight={900} fontSize={50} fill={PAPER} opacity={a}>{title.slice(0, 30)}</text>
        {parts.map((_, i) => <rect key={i} x={PX + PW / 2 + (i - (N - 1) / 2) * 56 - 14} y={PY + 110} width={28} height={28} transform={`rotate(45 ${PX + PW / 2 + (i - (N - 1) / 2) * 56} ${PY + 124})`} fill={i <= cur ? INK : "none"} stroke={INK} strokeWidth={4} />)}
      </g>
    );
  } else if (key === "question") {
    // a blackboard: the answers tried are struck out, the next one is written under them
    const rowH = Math.min(72, (PH - 200) / N);
    body = (
      <g>
        <text x={PX + 190} y={PY + 470} textAnchor="middle" fontFamily={HEAD} fontWeight={900} fontSize={420} fill={accent}>?</text>
        {parts.map((_, i) => {
          if (i > cur) return null;
          const y = PY + 160 + i * rowH, x = PX + 420, w = Math.min(1050, name(i).length * 21 + 60);
          return (
            <g key={i} opacity={i === cur ? a : 0.75}>
              <text x={x} y={y} fontFamily={HEAD} fontWeight={900} fontSize={Math.min(36, rowH * 0.5)} fill={PAPER}>{`${parts[i].n}.  ${name(i)}`}</text>
              {i < cur ? <path d={`M${x - 10} ${y - 12} H${x + w}`} stroke={accent} strokeWidth={6} strokeLinecap="round" /> : null}
            </g>
          );
        })}
      </g>
    );
  } else {
    // anatomy — a blueprint: the parts explained are joined into the machine, the next one slides in
    const bw = Math.min(210, (PW - 200) / N), y = PY + PH / 2 - 10, x0 = PX + PW / 2 - (bw * N) / 2;
    body = (
      <g>
        {Array.from({ length: 13 }, (_, i) => <path key={`g${i}`} d={`M${PX + 30 + i * 130} ${PY + 20} V${PY + PH - 20}`} stroke="rgba(255,255,255,0.09)" strokeWidth={2} />)}
        {Array.from({ length: 6 }, (_, i) => <path key={`h${i}`} d={`M${PX + 20} ${PY + 40 + i * 130} H${PX + PW - 20}`} stroke="rgba(255,255,255,0.09)" strokeWidth={2} />)}
        {parts.map((_, i) => {
          const isNew = i === cur, dy = isNew ? -140 * (1 - a) : 0;
          return (
            <g key={i} transform={`translate(${x0 + bw * i} ${y + dy})`} opacity={i <= cur ? (isNew ? a : 1) : 0.35}>
              <rect x={4} y={-70} width={bw - 8} height={140} rx={8} fill={i < cur ? PAPER : isNew ? accent : "none"} stroke={PAPER} strokeWidth={4} strokeDasharray={i > cur ? "10 10" : undefined} />
              <text x={bw / 2} y={-90} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={22} fill={PAPER}>{parts[i].n}</text>
              {i <= cur && parts[i].art ? <g transform={`translate(${bw / 2} -160)`}><PartArt art={parts[i].art!} w={bw - 40} h={100} /></g> : null}
              {i <= cur ? lines(name(i), 11).map((l, j) => <text key={j} x={bw / 2} y={-14 + j * 26} textAnchor="middle" fontFamily={HEAD} fontWeight={900} fontSize={19} fill={i < cur ? INK : PAPER}>{l}</text>) : null}
            </g>
          );
        })}
      </g>
    );
  }

  const showHead = key !== "trial" && key !== "duel";
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 80, opacity: o }}>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%">
        <rect x={0} y={0} width={1920} height={1080} fill="rgba(10,10,14,0.42)" />
        <rect x={PX - 14} y={PY - 14} width={PW + 28} height={PH + 28} rx={22} fill={S.frame} />
        <rect x={PX} y={PY} width={PW} height={PH} rx={12} fill={S.bg} />
        {showHead ? (
          <g>
            <rect x={PX + 44} y={PY + 38} width={head.length * 23 + 34} height={54} rx={8} fill={INK} />
            <text x={PX + 60} y={PY + 76} fontFamily={MONO} fontWeight={800} fontSize={34} letterSpacing={2} fill={PAPER}>{head}</text>
            <text x={PX + 60 + head.length * 23 + 44} y={PY + 78} fontFamily={HEAD} fontWeight={900} fontSize={40} fill={S.ink} opacity={a}>{title.slice(0, 40)}</text>
          </g>
        ) : null}
        {body}
      </svg>
    </AbsoluteFill>
  );
};
