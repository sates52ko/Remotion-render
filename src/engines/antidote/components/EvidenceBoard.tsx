import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";
import { RoughMarks } from "./RoughMarks";
import { FitText } from "./textFit";

export type EvidenceBoardSpec = {
  title?: string;
  subtitle?: string;
  caseBadge?: string;
  image?: string;
  subject: string;
  setup: string;
  finding: string;
  findingHighlight?: string;
  lessonHeadline: string;
  lessonDetail?: string;
  revealLessonAt?: number;
  tone?: "neutral" | "accent" | "danger" | "positive";
  at?: number;
};

/**
 * EvidenceBoard — Book Experiment / Case-File Breakdown.
 * Left: concrete book case/experiment + highlighted finding.
 * Right: the extracted principle/lesson revealed on cue.
 */
export const EvidenceBoard: React.FC<{
  spec: EvidenceBoardSpec;
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

  const col = toneColor(spec.tone ?? "accent", palette);
  const leftP = spring({ frame, fps, config: { damping: 16, stiffness: 150 } });
  const lessonAt = spec.revealLessonAt ?? 42;
  const rightP = frame >= lessonAt
    ? interpolate(frame - lessonAt, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.poly(4)) })
    : 0;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame} chapterLabel={chapterLabel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, width: "100%", maxWidth: 1220 }}>
        {/* Left: Case / Experiment Card */}
        <div
          style={{
            flex: 1.15,
            padding: "26px 28px",
            borderRadius: 16,
            background: palette.surface,
            border: `2.5px solid ${palette.surfaceBorder}`,
            borderTop: `7px solid ${col}`,
            opacity: leftP,
            transform: `translateX(${(1 - leftP) * -20}px)`,
            boxShadow: light ? "0 14px 32px rgba(0,0,0,0.08)" : "0 18px 40px rgba(0,0,0,0.45)",
          }}
        >
          <span style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 14, letterSpacing: "0.14em", color: col }}>
            {spec.caseBadge ?? "CASE EVIDENCE"}
          </span>
          <FitText text={spec.subject} maxWidth={560} maxLines={2} baseSize={30} minSize={20} fontFamily={fonts.display} fontWeight={900} color={palette.ink} style={{ marginTop: 6 }} />

          {spec.image && (
            <div style={{ marginTop: 14, height: 200, borderRadius: 10, overflow: "hidden", border: `2px solid ${palette.surfaceBorder}` }}>
              <Img src={staticFile(spec.image)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}

          <div style={{ fontFamily: fonts.body, fontSize: 19, fontWeight: 500, color: palette.muted, marginTop: 14, lineHeight: 1.4 }}>
            {spec.setup}
          </div>

          <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: `${col}18`, borderLeft: `5px solid ${col}` }}>
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 20, color: palette.ink }}>{spec.finding}</div>
            {spec.findingHighlight && (
              <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 17, color: col, marginTop: 4 }}>
                {spec.findingHighlight}
              </div>
            )}
          </div>
        </div>

        {/* Connector Arrow */}
        <svg width={56} height={56} viewBox="0 0 56 56" style={{ flexShrink: 0, opacity: rightP }}>
          <line x1={6} y1={28} x2={42} y2={28} stroke={palette.accent} strokeWidth={4} strokeLinecap="round" />
          <polygon points="38,18 52,28 38,38" fill={palette.accent} />
        </svg>

        {/* Right: Extracted Principle / Lesson */}
        <div
          style={{
            flex: 0.95,
            padding: "32px 28px",
            borderRadius: 16,
            background: `${palette.positive}16`,
            border: `3px solid ${palette.positive}`,
            opacity: rightP,
            transform: `translateX(${(1 - rightP) * 24}px)`,
            boxShadow: light ? "0 14px 32px rgba(0,0,0,0.08)" : "0 18px 40px rgba(0,0,0,0.45)",
          }}
        >
          <span style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 14, letterSpacing: "0.14em", color: palette.positive }}>
            THE PRINCIPLE
          </span>
          <div style={{ marginTop: 10 }}>
            <FitText text={spec.lessonHeadline} maxWidth={460} maxLines={3} baseSize={32} minSize={22} fontFamily={fonts.display} fontWeight={900} color={palette.ink} />
            <div style={{ marginTop: 6 }}>
              <RoughMarks kind="underline" width={300} height={14} color={palette.positive} progress={rightP} seed={spec.lessonHeadline} />
            </div>
          </div>
          {spec.lessonDetail && (
            <div style={{ fontFamily: fonts.body, fontSize: 20, fontWeight: 500, color: palette.muted, marginTop: 14, lineHeight: 1.4 }}>
              {spec.lessonDetail}
            </div>
          )}
        </div>
      </div>
    </GrammarStage>
  );
};
