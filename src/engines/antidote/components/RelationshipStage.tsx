import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

/**
 * RelationshipStage — EXPERIMENT. One reusable mechanism: CONTROL THROUGH A MESSAGE.
 *
 *   controlling side (upper left) issues a message (panel); the message travels down and is
 *   handed out as copies to the controlled side (lower right). Each side is a group (several
 *   figures) or a single actor (count 1). Optional parts, each only when the spec carries it:
 *   - LIE mark on the message (only when the narration marks it false);
 *   - lowering of the controlled side (only for "keep down"; spec.effect "none" disables it);
 *   - a rejected method (gun, crossed out, pointing at nobody) or a negated reading
 *     (crossed-out word), apart from the message path;
 *   - a counter-action by the controlled side (a steering wheel taken up; the copies fall away).
 *   No punishment, work or inner state (belief, guilt, stress) is drawn.
 *
 * Book-independent: colours, labels, counts and cue frames all come from the spec.
 * Cue frames (scene-local) come from the narration's word timings.
 */
type Group = { key: string; label: string; body: string; accent: string; count: number };
type Cue = { local: number; seconds: number; phrase: string; keyword: string };
export type RelationshipStagingSpec = {
  mechanism: "control-by-narrative" | "control-by-message";
  rulingGroup: Group;
  ruledGroup: Group;
  means: { label: string; marker?: string };
  rejected?: { kind: "gun"; label: string };
  negation?: { kind: "text"; word: string; label: string };
  counterAction?: { kind: "wheel"; label: string };
  effect?: "none";
  cues?: { means: Cue; lie?: Cue; rejected?: Cue; negation?: Cue; counter?: Cue };
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const FONT = "Inter, Arial, sans-serif";
const fitSize = (text: string, width: number, max: number, k = 0.72) => Math.max(14, Math.min(max, Math.floor(width / (k * Math.max(1, text.length)))));

const Figure: React.FC<{ x: number; y: number; s: number; body: string; accent: string }> = ({ x, y, s, body, accent }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M -34 0 Q -36 -92 0 -100 Q 36 -92 34 0 Z" fill={body} stroke={accent} strokeWidth={5} />
    <circle cx={0} cy={-128} r={26} fill="#E7C7A5" stroke={accent} strokeWidth={5} />
  </g>
);

const Gun: React.FC = () => (
  // generic pistol silhouette, barrel pointing straight up (at nobody)
  <g>
    <rect x={-16} y={-120} width={32} height={110} rx={6} fill="#3A3A3E" />
    <rect x={-22} y={-20} width={44} height={36} rx={6} fill="#3A3A3E" />
    <path d="M -22 16 L -50 70 L -20 78 L 4 16 Z" fill="#2A2A2E" />
    <path d="M 4 16 Q 22 34 6 48" fill="none" stroke="#2A2A2E" strokeWidth={8} />
  </g>
);

const Wheel: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s }) => (
  // generic steering wheel, held in front of the actor
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle cx={0} cy={0} r={62} fill="none" stroke="#2A2A2E" strokeWidth={14} />
    <circle cx={0} cy={0} r={14} fill="#2A2A2E" />
    <line x1={-56} y1={0} x2={56} y2={0} stroke="#2A2A2E" strokeWidth={10} />
    <line x1={0} y1={0} x2={0} y2={58} stroke="#2A2A2E" strokeWidth={10} />
  </g>
);

// a small copy of the message: same panel shape, text lines only (no invented words)
const MiniPanel: React.FC<{ x: number; y: number; o: number; lie: number; marker: string }> = ({ x, y, o, lie, marker }) => (
  <g transform={`translate(${x} ${y})`} opacity={o}>
    <rect x={-46} y={-34} width={92} height={56} rx={9} fill="#FFFFFF" stroke="#1E1E22" strokeWidth={4} />
    <line x1={-30} y1={-16} x2={30} y2={-16} stroke="#1E1E22" strokeWidth={5} />
    <line x1={-30} y1={0} x2={18} y2={0} stroke="#1E1E22" strokeWidth={5} />
    <path d="M -6 22 L 0 36 L 6 22 Z" fill="#FFFFFF" stroke="#1E1E22" strokeWidth={4} />
    <text x={0} y={-40} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={22} fill="#D0312D" opacity={lie}>{marker}</text>
  </g>
);

// single controlled actor: where the figure stands and where its copies arrive
const SINGLE_X = 1430;
const SINGLE_COPIES = [{ dx: -120, dy: 0 }, { dx: 0, dy: -40 }, { dx: 120, dy: 0 }];

/**
 * RelationshipHold — EXPERIMENT. After a staged scene ends (hard cut), its final state stays on
 * screen for HOLD_FRAMES over the start of the next scene, then fades: the message panel and LIE
 * mark, or, when the spec carries a counter-action, the actor with the steering wheel and its caption.
 */
export const HOLD_FRAMES = 18;
export const RelationshipHold: React.FC<{ spec: RelationshipStagingSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [HOLD_FRAMES - 6, HOLD_FRAMES], [1, 0], clamp);
  if (spec.counterAction) {
    const D = spec.ruledGroup;
    const cl = spec.counterAction.label;
    const cfs = fitSize(cl, 900, 32);
    return (
      <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: o }}>
        <Figure x={SINGLE_X} y={900} s={1.1} body={D.body} accent={D.accent} />
        <Wheel x={SINGLE_X} y={820} s={1} />
        <text x={SINGLE_X - 170} y={1048} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={cfs} fill="#1E1E22">{cl}</text>
      </svg>
    );
  }
  const label = spec.means.label;
  const inner = 560;
  const fs = Math.max(18, Math.min(44, Math.floor(inner / (0.72 * Math.max(1, label.length)))));
  const estW = 0.72 * fs * label.length;
  return (
    <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: o }}>
      <rect x={700} y={140} width={620} height={190} rx={22} fill="#FFFFFF" stroke="#1E1E22" strokeWidth={6} />
      <text x={1010} y={248} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={fs} fill="#1E1E22"
        {...(estW > inner ? { textLength: inner, lengthAdjust: "spacingAndGlyphs" } : {})}>{label}</text>
      {spec.means.marker ? (
        <g transform="translate(1250 372) rotate(-10)">
          <rect x={-92} y={-38} width={184} height={76} rx={8} fill="#FFFFFF" stroke="#D0312D" strokeWidth={8} />
          <text x={0} y={22} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={58} fill="#D0312D">{spec.means.marker}</text>
        </g>
      ) : null}
    </svg>
  );
};

export const RelationshipStage: React.FC<{ spec: RelationshipStagingSpec; local: number; durationFrames: number }> = ({ spec, local, durationFrames }) => {
  const d = Math.max(60, durationFrames);
  const cue = {
    means: spec.cues?.means.local ?? Math.round(d * 0.5),
    lie: spec.cues?.lie?.local ?? Math.round(d * 0.85),
    rejected: spec.cues?.rejected?.local ?? spec.cues?.negation?.local ?? Math.round(d * 0.2),
    counter: spec.cues?.counter?.local ?? Math.round(d * 0.9),
  };
  const tGun = interpolate(local, [cue.rejected - 4, cue.rejected + 6], [0, 1], clamp);
  const tCross = interpolate(local, [cue.rejected + 8, cue.rejected + 16], [0, 1], clamp);
  const tPanel = interpolate(local, [cue.means - 8, cue.means + 4], [0, 1], clamp);
  const tFlow = interpolate(local, [cue.means + 4, cue.means + 34], [0, 1], clamp);
  const tCopies = interpolate(local, [cue.means + 30, cue.means + 46], [0, 1], clamp);
  const tDown = interpolate(local, [cue.means + 40, cue.means + 64], [0, 1], clamp);
  const tLie = interpolate(local, [cue.lie - 2, cue.lie + 6], [0, 1], clamp);
  const tCounter = spec.counterAction ? interpolate(local, [cue.counter - 2, cue.counter + 10], [0, 1], clamp) : 0;

  const R = spec.rulingGroup;
  const D = spec.ruledGroup;
  const marker = spec.means.marker ?? "";
  const lowered = spec.effect !== "none";
  const single = D.count === 1;
  const label = spec.means.label;
  // fit the label inside the panel's inner width (560 px) — never overflow
  const inner = 560;
  const fs = Math.max(18, Math.min(44, Math.floor(inner / (0.72 * Math.max(1, label.length)))));
  const estW = 0.72 * fs * label.length;
  const path = "M 1010 330 C 1060 450, 1260 520, 1420 620";
  const flowLen = 560;
  const sink = lowered ? 70 * tDown : 0; // lowered a level only for "keep down"
  const away = 1 - 0.9 * tCounter; // after the counter-action the copies fall away

  return (
    <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
      {/* controlling side, upper left (on a raised platform only for "keep down") */}
      {lowered ? <rect x={240} y={420} width={460} height={34} rx={8} fill={R.accent} opacity={0.9} /> : null}
      {Array.from({ length: R.count }).map((_, i) => (
        <Figure key={`r${i}`} x={330 + i * 140} y={420} s={1.05} body={R.body} accent={R.accent} />
      ))}
      <text x={470} y={500} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={34} fill={R.accent}>{R.label.toUpperCase()}</text>

      {/* message panel from the controlling side; text fits inside; stamp sits below the text */}
      <g opacity={tPanel} transform={`translate(0 ${(1 - tPanel) * 20})`}>
        <path d="M 640 300 L 700 250 L 700 290 Z" fill="#FFFFFF" stroke="#1E1E22" strokeWidth={5} />
        <rect x={700} y={140} width={620} height={190} rx={22} fill="#FFFFFF" stroke="#1E1E22" strokeWidth={6} />
        <text x={1010} y={248} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={fs} fill="#1E1E22"
          {...(estW > inner ? { textLength: inner, lengthAdjust: "spacingAndGlyphs" } : {})}>{label}</text>
      </g>
      {spec.means.marker ? (
        <g opacity={tLie} transform={`translate(1250 372) rotate(-10) scale(${0.7 + 0.3 * tLie})`}>
          <rect x={-92} y={-38} width={184} height={76} rx={8} fill="#FFFFFF" stroke="#D0312D" strokeWidth={8} />
          <text x={0} y={22} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={58} fill="#D0312D">{spec.means.marker}</text>
        </g>
      ) : null}

      {/* the message travels down to the controlled side */}
      <g opacity={away}>
        <path d={path} fill="none" stroke="#1E1E22" strokeWidth={8} strokeDasharray={flowLen} strokeDashoffset={flowLen * (1 - tFlow)} strokeLinecap="round" />
        <path d="M 1420 620 L 1384 604 L 1402 584 Z" fill="#1E1E22" opacity={tFlow > 0.98 ? 1 : 0} />
      </g>

      {single ? (
        <g>
          {/* a single controlled actor receives the copies; with a counter-action they fall away */}
          <Figure x={SINGLE_X} y={900} s={1.1} body={D.body} accent={D.accent} />
          {SINGLE_COPIES.map((c, i) => (
            <MiniPanel key={`s${i}`} x={SINGLE_X + c.dx * (1 + 0.6 * tCounter)} y={700 + c.dy - (1 - tCopies) * 60 + 160 * tCounter} o={tCopies * away} lie={tLie} marker={marker} />
          ))}
          {spec.counterAction ? (
            <g opacity={tCounter}>
              <Wheel x={SINGLE_X} y={820} s={0.6 + 0.4 * tCounter} />
            </g>
          ) : null}
          <text x={SINGLE_X} y={1000} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={34} fill={D.accent}>{D.label.toUpperCase()}</text>
          {spec.counterAction ? (
            <text x={SINGLE_X - 170} y={1048} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={fitSize(spec.counterAction.label, 900, 32)} fill="#1E1E22" opacity={tCounter}>{spec.counterAction.label}</text>
          ) : null}
        </g>
      ) : (
        <g>
          {/* controlled group, lower right: each receives a copy (and is lowered a level for "keep down") */}
          <rect x={1150} y={900} width={560} height={26} rx={6} fill={D.accent} opacity={0.35} />
          {lowered ? <rect x={1150} y={900 + sink} width={560} height={26} rx={6} fill={D.accent} opacity={0.9 * tDown} /> : null}
          {Array.from({ length: D.count }).map((_, i) => {
            const x = 1210 + i * 110;
            return (
              <g key={`d${i}`}>
                <Figure x={x} y={900 + sink} s={0.8} body={D.body} accent={D.accent} />
                <MiniPanel x={x} y={700 + sink - (1 - tCopies) * 60} o={tCopies} lie={tLie} marker={marker} />
              </g>
            );
          })}
          <text x={1430} y={1010 + sink * 0.4} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={34} fill={D.accent}>{D.label.toUpperCase()}</text>
        </g>
      )}

      {/* rejected method (gun, pointing up at nobody) or negated reading (word), crossed out, apart from the flow */}
      {spec.rejected ? (
        <g opacity={tGun} transform="translate(250 820)">
          <rect x={-150} y={-190} width={300} height={290} rx={20} fill="#F4F1EA" stroke="#9A9A9A" strokeWidth={4} strokeDasharray="14 10" />
          <Gun />
          <g opacity={tCross}>
            <line x1={-110} y1={-160} x2={110} y2={70} stroke="#D0312D" strokeWidth={16} strokeLinecap="round" />
            <line x1={110} y1={-160} x2={-110} y2={70} stroke="#D0312D" strokeWidth={16} strokeLinecap="round" />
          </g>
          <text x={0} y={140} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={30} fill="#1E1E22">{spec.rejected.label}</text>
        </g>
      ) : null}
      {spec.negation ? (
        <g opacity={tGun} transform="translate(300 820)">
          <rect x={-220} y={-110} width={440} height={150} rx={20} fill="#F4F1EA" stroke="#9A9A9A" strokeWidth={4} strokeDasharray="14 10" />
          <text x={0} y={-18} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={fitSize(spec.negation.word, 380, 46)} fill="#3A3A3E">{spec.negation.word}</text>
          <g opacity={tCross}>
            <line x1={-190} y1={-34} x2={190} y2={-34} stroke="#D0312D" strokeWidth={12} strokeLinecap="round" />
          </g>
          <text x={0} y={100} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={fitSize(spec.negation.label, 520, 28)} fill="#1E1E22">{spec.negation.label}</text>
        </g>
      ) : null}
    </svg>
  );
};
