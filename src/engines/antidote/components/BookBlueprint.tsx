import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";
import { FitText } from "./textFit";

export type BookBlueprintSpec = {
  title?: string;
  subtitle?: string;
  thesis: string;
  variant?: "pillarColumns" | "radialMindMap" | "chapterPath";
  pillars: Array<{
    number?: string;
    label: string;
    detail?: string;
    status?: "done" | "active" | "upcoming";
    tone?: "neutral" | "accent" | "danger" | "positive";
    at?: number;
  }>;
  activeIndex?: number;
  synthesis?: string;
  synthesisAt?: number;
  at?: number;
};

/**
 * BookBlueprint — Living Book Architecture & Summary Map.
 * Keeps viewers oriented in 30–60 min book summaries by showing the thesis,
 * completed/active/upcoming pillars, and unifying synthesis.
 */
export const BookBlueprint: React.FC<{
  spec: BookBlueprintSpec;
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

  const pillars = spec.pillars.slice(0, 5);
  const synthAt = spec.synthesisAt ?? 90;
  const synthP = spec.synthesis
    ? interpolate(frame - synthAt, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.poly(4)) })
    : 0;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame} chapterLabel={chapterLabel}>
      {/* Central Thesis Banner */}
      <div
        style={{
          marginBottom: 22,
          padding: "12px 28px",
          borderRadius: 12,
          background: palette.surface,
          border: `2px solid ${palette.accent}`,
          maxWidth: 1120,
          textAlign: "center",
          boxShadow: light ? "0 8px 20px rgba(0,0,0,0.06)" : "0 10px 24px rgba(0,0,0,0.35)",
        }}
      >
        <FitText text={spec.thesis} maxWidth={1040} maxLines={2} baseSize={26} minSize={18} fontFamily={fonts.display} fontWeight={800} color={palette.ink} />
      </div>

      {/* Pillars Row */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          gap: 18,
          width: "100%",
          maxWidth: 1240,
        }}
      >
        {pillars.map((p, i) => {
          const ep = spring({ frame: Math.max(0, frame - (p.at ?? i * 10)), fps, config: { damping: 16, stiffness: 150 } });
          const isActive = p.status === "active" || spec.activeIndex === i;
          const isDone = p.status === "done";
          const col = toneColor(p.tone ?? (isActive ? "accent" : isDone ? "positive" : "neutral"), palette);

          return (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "24px 20px",
                borderRadius: 14,
                background: isActive ? `${col}1C` : palette.surface,
                border: `${isActive ? 3.5 : 2}px solid ${isActive ? col : palette.surfaceBorder}`,
                borderTop: `8px solid ${col}`,
                opacity: p.status === "upcoming" ? ep * 0.72 : ep,
                transform: `translateY(${(1 - ep) * 18}px) scale(${isActive ? 1.03 : 1})`,
                boxShadow: isActive ? `0 16px 36px rgba(0,0,0,${light ? 0.14 : 0.45})` : "0 8px 20px rgba(0,0,0,0.12)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 15, letterSpacing: "0.14em", color: col }}>
                  {p.number ?? `0${i + 1}`}
                </span>
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontWeight: 900,
                    fontSize: 13,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: `${col}24`,
                    color: col,
                  }}
                >
                  {isDone ? "COVERED" : isActive ? "NOW" : "NEXT"}
                </span>
              </div>
              <FitText text={p.label} maxWidth={340} maxLines={2} baseSize={26} minSize={18} fontFamily={fonts.display} fontWeight={900} color={palette.ink} />
              {p.detail && (
                <div style={{ fontFamily: fonts.body, fontSize: 18, fontWeight: 500, color: palette.muted, lineHeight: 1.35 }}>
                  {p.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unifying Synthesis */}
      {spec.synthesis && frame >= synthAt && (
        <div
          style={{
            marginTop: 22,
            padding: "10px 28px",
            borderRadius: 999,
            background: palette.accent,
            color: light ? "#FFFFFF" : palette.bg,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: 21,
            opacity: synthP,
            transform: `translateY(${(1 - synthP) * 10}px)`,
          }}
        >
          {spec.synthesis}
        </div>
      )}
    </GrammarStage>
  );
};
