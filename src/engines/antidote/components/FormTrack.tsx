import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { AntidoteConfig } from "../schema";
import { ANTIDOTE_FONT } from "./KineticText";
import { useSkin } from "./skin";

/**
 * FormTrack — THE FRAME OF THE FILM IS ITS BOOK'S FORM (2026-11-18, scripts/lib/narrative-form.js).
 *
 * Every film used to carry the same top band: a progress line, an "INSIGHT n / N" pill and the title — the first thing
 * that made two films look like one template. A book told in a narrative form draws its PARTS here instead, in the
 * shape of that form: a case file pins numbered evidence tags on a string, a journey moves a marker along its
 * stations, a gallery fills its frames, a practice run ticks its rules … Same information in every form (which part,
 * of how many, what it is called); a different picture for every form.
 *
 * The parts are the ones the hosts ANNOUNCED (meta.form.parts[].from = the frame they said it on); nothing is computed
 * from the film's length. One SVG, the top 90 px (the old band's footprint), no perpetual motion: a part arrives once.
 * Drawn only when meta.form has at least three parts — otherwise the film keeps the band it had (RetentionHUD).
 */
type Part = { n: number; from: number; title?: string };
const MONO = '"JetBrains Mono", "SF Mono", Monaco, Consolas, monospace';
const PLATE = "rgba(15, 23, 42, 0.94)", PAPER = "#F4EFE6", DIM = "rgba(255,255,255,0.34)";
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

export const hasFormTrack = (config?: AntidoteConfig): boolean => !!config && !!config.meta.form && (config.meta.form.parts || []).length >= 3;

export const FormTrack: React.FC<{ config: AntidoteConfig }> = ({ config }) => {
  const frame = useCurrentFrame();
  // THE BOOK'S SKIN (skin.tsx): the pills are cut like the book's name plates (round, as before, without a skin)
  const { skin: bookSkin } = useSkin();
  const form = config.meta.form!;
  const parts: Part[] = form.parts;
  const N = parts.length;
  const accent = config.meta.hud?.accent ?? "#F59E0B";
  const bookTitle = (config.meta.hud?.title ?? config.meta.title ?? "").toUpperCase();
  const scenes = config.scenes;
  const active = scenes.find((s) => frame >= s.fromFrame && frame < s.fromFrame + s.durationFrames) ?? scenes[0];
  if (!active || active.hud?.hidden || active.shot === "chapterCard" || !!active.chapterCard) return null;

  let cur = -1;
  for (let i = 0; i < N; i++) if (frame >= parts[i].from) cur = i;
  const arrive = (i: number) => ease((frame - parts[i].from) / 12); // 0 → 1 once, when part i is announced
  const end = config.meta.durationInFrames;
  const within = cur < 0 ? 0 : clamp((frame - parts[cur].from) / Math.max(1, (cur + 1 < N ? parts[cur + 1].from : end) - parts[cur].from));

  // the track plate and its N slots
  const key = form.key;
  // the question's "?" stands before its attempts; an anatomy's blocks fill the plate edge to edge
  const X0 = 620, W = 880, Y = 45, PAD = key === "question" ? 96 : 44;
  const BW = (W - 2 * 34) / N; // anatomy: one block
  const sx = (i: number) => (key === "anatomy" ? X0 + 34 + BW * (i + 0.5) : X0 + PAD + (N === 1 ? 0 : (i * (W - PAD - 44)) / (N - 1)));
  const done = (i: number) => i < cur, on = (i: number) => i === cur;
  const label = cur < 0 ? form.name : `${form.part} ${String(parts[cur].n).padStart(2, "0")}`;
  const title = cur >= 0 && parts[cur].title ? parts[cur].title!.toUpperCase().slice(0, 34) : "";

  const slots = parts.map((_, i) => {
    const x = sx(i), a = i <= cur ? arrive(i) : 0, k = on(i) ? 1 + 0.22 * a : 1;
    if (key === "case") {
      // an evidence tag, tilted, pinned when its exhibit is called
      const tilt = i % 2 ? 7 : -6;
      return (
        <g key={i} transform={`translate(${x} ${Y + 2}) rotate(${tilt}) scale(${k})`} opacity={i <= cur ? 0.25 + 0.75 * a : 1}>
          <rect x={-15} y={-17} width={30} height={34} rx={3} fill={i <= cur ? PAPER : "none"} stroke={i <= cur ? "none" : DIM} strokeWidth={2} />
          {i <= cur ? <text x={0} y={7} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={17} fill="#1A1412">{parts[i].n}</text> : null}
          {i <= cur ? <circle cx={0} cy={-17} r={5} fill={accent} /> : null}
        </g>
      );
    }
    if (key === "journey") {
      return (
        <g key={i}>
          <circle cx={x} cy={Y} r={on(i) ? 9 : 7} fill={i <= cur ? PAPER : PLATE} stroke={i <= cur ? PAPER : DIM} strokeWidth={2.5} />
        </g>
      );
    }
    if (key === "portraits") {
      // a row of frames; a person appears in a frame when their portrait is told
      return (
        <g key={i} transform={`translate(${x} ${Y}) scale(${k})`}>
          <rect x={-15} y={-19} width={30} height={38} rx={15} fill={i <= cur ? PAPER : "none"} stroke={on(i) ? accent : i <= cur ? PAPER : DIM} strokeWidth={on(i) ? 4 : 2} />
          {i <= cur ? <g opacity={a}><circle cx={0} cy={-5} r={6} fill="#1A1412" /><path d="M-10 15 Q0 2 10 15 Z" fill="#1A1412" /></g> : null}
        </g>
      );
    }
    if (key === "practice") {
      // a checklist: the rule being tried is boxed, the ones tried are ticked
      return (
        <g key={i} transform={`translate(${x} ${Y}) scale(${k})`}>
          <rect x={-13} y={-13} width={26} height={26} rx={4} fill={on(i) ? accent : "none"} stroke={i <= cur ? PAPER : DIM} strokeWidth={2.5} />
          {done(i) ? <path d="M-7 0 L-2 6 L8 -7" fill="none" stroke={PAPER} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
        </g>
      );
    }
    if (key === "trial") {
      // rounds between two rails: the round being fought is lit
      return (
        <g key={i} transform={`translate(${x} ${Y}) scale(${k})`}>
          <rect x={-5} y={-16} width={10} height={32} rx={5} fill={on(i) ? accent : done(i) ? PAPER : "none"} stroke={i <= cur ? "none" : DIM} strokeWidth={2} />
        </g>
      );
    }
    if (key === "duel") {
      // two blades cross at the clash being fought; the fought ones are split in two colours
      return (
        <g key={i} transform={`translate(${x} ${Y}) scale(${k})`}>
          {on(i) ? (
            <g opacity={a}><path d="M-13 -15 L13 15 M13 -15 L-13 15" stroke={accent} strokeWidth={4.5} strokeLinecap="round" /></g>
          ) : (
            <g transform="rotate(45)">
              <rect x={-9} y={-9} width={18} height={18} fill={done(i) ? PAPER : "none"} stroke={done(i) ? "none" : DIM} strokeWidth={2} />
              {done(i) ? <rect x={-9} y={-9} width={9} height={18} fill={accent} /> : null}
            </g>
          )}
        </g>
      );
    }
    if (key === "question") {
      // attempts at an answer: the tried ones are crossed out, the one being tried is underlined
      return (
        <g key={i} transform={`translate(${x} ${Y})`}>
          <text x={0} y={8} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={22} fill={i <= cur ? PAPER : DIM}>{parts[i].n}</text>
          {done(i) ? <path d="M-12 10 L12 -10" stroke={accent} strokeWidth={3.5} strokeLinecap="round" /> : null}
          {on(i) ? <path d={`M-12 17 H${-12 + 24 * a}`} stroke={accent} strokeWidth={4} strokeLinecap="round" /> : null}
        </g>
      );
    }
    // anatomy: blocks of one machine — the ones explained have joined into one bar, the rest wait apart
    const bw = BW;
    const joined = i <= cur;
    return (
      <g key={i} transform={`translate(${x} ${Y})`}>
        <rect x={joined ? -bw / 2 : -bw / 2 + 5} y={-13} width={joined ? bw : bw - 10} height={26} rx={joined ? 0 : 5} fill={on(i) ? accent : joined ? PAPER : "none"} stroke={joined ? "none" : DIM} strokeWidth={2} />
      </g>
    );
  });

  // what joins the slots, per form
  let link: React.ReactNode = null;
  if (key === "case" && cur >= 1) {
    // the string from pin to pin, drawn as far as the newest pinned tag
    const pts = parts.slice(0, cur + 1).map((_, i) => `${sx(i)},${Y - 15}`);
    const last = arrive(cur), lx = sx(cur - 1) + (sx(cur) - sx(cur - 1)) * last;
    link = <polyline points={[...pts.slice(0, cur), `${lx},${Y - 15}`].join(" ")} fill="none" stroke={accent} strokeWidth={2.5} strokeLinecap="round" />;
  } else if (key === "journey") {
    const mx = cur < 0 ? sx(0) : cur + 1 < N ? sx(cur) + (sx(cur + 1) - sx(cur)) * within : sx(cur);
    link = (
      <g>
        <path d={`M${sx(0)} ${Y} H${sx(N - 1)}`} stroke={DIM} strokeWidth={4} strokeLinecap="round" strokeDasharray="2 12" />
        {cur >= 0 ? <path d={`M${sx(0)} ${Y} H${mx}`} stroke={accent} strokeWidth={5} strokeLinecap="round" /> : null}
        {cur >= 0 ? <path d={`M${mx} ${Y - 9} l-9 -17 a9 9 0 1 1 18 0 Z`} fill={accent} stroke={PLATE} strokeWidth={2} /> : null}
      </g>
    );
  } else if (key === "trial") {
    link = <path d={`M${sx(0) - 20} ${Y - 21} H${sx(N - 1) + 20} M${sx(0) - 20} ${Y + 21} H${sx(N - 1) + 20}`} stroke={DIM} strokeWidth={2.5} strokeLinecap="round" />;
  } else if (key === "question") {
    link = <text x={X0 + 44} y={Y + 13} textAnchor="middle" fontFamily={ANTIDOTE_FONT} fontWeight={900} fontSize={38} fill={accent}>?</text>;
  }
  const cut = (r: number) => (bookSkin.plate === "sharp" ? 3 : bookSkin.plate === "paper" ? 9 : r);
  const leftW = Math.max(250, Math.min(540, 60 + (label.length + (title ? title.length + 3 : 0)) * 14.5));

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 90 }}>
      <svg viewBox="0 0 1920 90" width="100%" style={{ position: "absolute", top: 0, left: 0 }}>
        {/* the part being told: its number in the form's own word, and the name the book gave it */}
        <rect x={40} y={18} width={leftW} height={54} rx={cut(27)} fill={PLATE} stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} />
        <circle cx={68} cy={45} r={6} fill={accent} />
        <text x={86} y={52} fontFamily={MONO} fontWeight={800} fontSize={20} letterSpacing={1.5} fill="#FFFFFF">
          {label}
          {title ? <tspan fill="rgba(255,255,255,0.62)">{`  ·  ${title}`}</tspan> : null}
        </text>
        {/* the track of parts, in the shape of this book's form */}
        <rect x={X0} y={14} width={W} height={62} rx={cut(31)} fill={PLATE} stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} />
        {link}
        {slots}
        {/* the book */}
        {bookTitle ? (
          <g>
            <rect x={1880 - Math.min(330, 40 + bookTitle.length * 12.5)} y={22} width={Math.min(330, 40 + bookTitle.length * 12.5)} height={46} rx={cut(23)} fill={PLATE} stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} />
            <text x={1880 - Math.min(330, 40 + bookTitle.length * 12.5) / 2} y={52} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={17} letterSpacing={1.5} fill="#FFFFFF">{bookTitle.slice(0, 22)}</text>
          </g>
        ) : null}
      </svg>
    </AbsoluteFill>
  );
};
