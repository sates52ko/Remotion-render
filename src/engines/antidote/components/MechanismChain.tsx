import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";
import { FitText } from "./textFit";

export type MechanismChainSpec = {
  title?: string;
  subtitle?: string;
  variant?: "linearChain" | "feedbackLoop" | "dominoBreak";
  steps: Array<{
    label: string;
    detail?: string;
    badge?: string;
    tone?: "neutral" | "accent" | "danger" | "positive";
    at?: number;
  }>;
  breakAt?: number;
  breakLabel?: string;
  escapeOutcome?: string;
  callout?: string;
  calloutAt?: number;
  at?: number;
};

/**
 * MechanismChain — Animated Causal Flow, Feedback Loop & Loop-Break.
 * Renders cause -> effect steps with travelling SVG signal pulses and an
 * optional loop-break fracture that unveils the escape outcome.
 */
export const MechanismChain: React.FC<{
  spec: MechanismChainSpec;
  localFrame?: number;
  stageMood?: StageMoodName;
  chapterLabel?: string;
}> = ({ spec, localFrame, stageMood, chapterLabel }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const light = isLightPalette(palette);
  const fonts = resolveArtFonts(ad);

  const steps = spec.steps.slice(0, 5);
  const isBreakMode = spec.variant === "dominoBreak" || spec.variant === "feedbackLoop";
  const breakAt = spec.breakAt ?? 75;
  const broken = isBreakMode && frame >= breakAt;
  const breakP = broken ? interpolate(frame - breakAt, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.poly(4)) }) : 0;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame} chapterLabel={chapterLabel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, width: "100%", maxWidth: 1260 }}>
        {steps.map((st, i) => {
          const ep = spring({ frame: Math.max(0, frame - (st.at ?? i * 10)), fps, config: { damping: 16, stiffness: 150 } });
          const col = toneColor(st.tone ?? (i === steps.length - 1 ? "danger" : "accent"), palette);
          const isBreakConnector = isBreakMode && i === steps.length - 2;

          return (
            <React.Fragment key={i}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "22px 18px",
                  borderRadius: 14,
                  background: palette.surface,
                  border: `3px solid ${col}`,
                  opacity: ep,
                  transform: `translateY(${(1 - ep) * 16}px)`,
                  boxShadow: light ? "0 10px 24px rgba(0,0,0,0.08)" : "0 12px 28px rgba(0,0,0,0.42)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 13, letterSpacing: "0.12em", color: col, marginBottom: 6 }}>
                  {st.badge ?? `STEP 0${i + 1}`}
                </div>
                <FitText text={st.label} maxWidth={260} maxLines={2} baseSize={24} minSize={17} fontFamily={fonts.display} fontWeight={900} color={palette.ink} />
                {st.detail && (
                  <div style={{ fontFamily: fonts.body, fontSize: 17, fontWeight: 500, color: palette.muted, marginTop: 6, lineHeight: 1.3 }}>
                    {st.detail}
                  </div>
                )}
              </div>

              {i < steps.length - 1 && (
                <div style={{ position: "relative", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width={48} height={48} viewBox="0 0 48 48">
                    <line x1={4} y1={24} x2={38} y2={24} stroke={isBreakConnector && broken ? palette.danger : palette.accent} strokeWidth={4} strokeLinecap="round" opacity={isBreakConnector && broken ? 0.35 : 0.9} />
                    <polygon points="34,16 46,24 34,32" fill={isBreakConnector && broken ? palette.danger : palette.accent} opacity={isBreakConnector && broken ? 0.35 : 0.9} />
                    {isBreakConnector && broken && (
                      <line x1={14} y1={10} x2={34} y2={38} stroke={palette.danger} strokeWidth={5} strokeLinecap="round" opacity={breakP} />
                    )}
                  </svg>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {broken && spec.escapeOutcome && (
        <div
          style={{
            marginTop: 26,
            padding: "14px 32px",
            borderRadius: 12,
            background: `${palette.positive}22`,
            border: `2.5px solid ${palette.positive}`,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: 23,
            color: palette.ink,
            opacity: breakP,
            transform: `translateY(${(1 - breakP) * 12}px)`,
          }}
        >
          {spec.breakLabel ? `${spec.breakLabel}: ` : "BREAK THE LOOP: "}
          <span style={{ color: palette.positive }}>{spec.escapeOutcome}</span>
        </div>
      )}

      {spec.callout && frame >= (spec.calloutAt ?? 45) && !broken && (
        <div
          style={{
            marginTop: 24,
            padding: "10px 26px",
            borderRadius: 999,
            background: palette.surface,
            border: `2px solid ${palette.accent}`,
            fontFamily: fonts.body,
            fontWeight: 700,
            fontSize: 22,
            color: palette.ink,
          }}
        >
          {spec.callout}
        </div>
      )}
    </GrammarStage>
  );
};
