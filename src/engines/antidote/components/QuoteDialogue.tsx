import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";
import { FitText } from "./textFit";

export type QuoteDialogueSpec = {
  title?: string;
  subtitle?: string;
  speakerA: { name: string; role?: string; tone?: "neutral" | "accent" | "danger" | "positive" };
  speakerB: { name: string; role?: string; tone?: "neutral" | "accent" | "danger" | "positive" };
  lines: Array<{ speaker: "A" | "B"; text: string; at?: number }>;
  subtext?: { badge?: string; headline: string; detail?: string; at?: number };
  at?: number;
};

/**
 * QuoteDialogue — Dramatic Dialogue + Hidden Subtext Reveal.
 * Stages realistic exchanges between two roles/characters on cue, followed
 * by a high-contrast SUBTEXT card explaining what the exchange really means.
 */
export const QuoteDialogue: React.FC<{
  spec: QuoteDialogueSpec;
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

  const lines = spec.lines.slice(0, 4);
  const subAt = spec.subtext?.at ?? 75;
  const subP = spec.subtext && frame >= subAt
    ? interpolate(frame - subAt, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.poly(4)) })
    : 0;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame} chapterLabel={chapterLabel}>
      <div style={{ width: "100%", maxWidth: 1080, display: "flex", flexDirection: "column", gap: 16 }}>
        {lines.map((ln, i) => {
          const isA = ln.speaker === "A";
          const spk = isA ? spec.speakerA : spec.speakerB;
          const col = toneColor(spk.tone ?? (isA ? "accent" : "positive"), palette);
          const ep = spring({ frame: Math.max(0, frame - (ln.at ?? i * 14)), fps, config: { damping: 16, stiffness: 150 } });
          if (frame < (ln.at ?? i * 14)) return null;

          return (
            <div
              key={i}
              style={{
                alignSelf: isA ? "flex-start" : "flex-end",
                maxWidth: "78%",
                padding: "18px 24px",
                borderRadius: 16,
                background: palette.surface,
                border: `2.5px solid ${col}`,
                borderLeft: isA ? `8px solid ${col}` : `2.5px solid ${col}`,
                borderRight: !isA ? `8px solid ${col}` : `2.5px solid ${col}`,
                opacity: ep,
                transform: `translateX(${(1 - ep) * (isA ? -22 : 22)}px)`,
                boxShadow: light ? "0 10px 24px rgba(0,0,0,0.07)" : "0 12px 28px rgba(0,0,0,0.4)",
              }}
            >
              <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 14, letterSpacing: "0.12em", color: col, marginBottom: 6 }}>
                {spk.name}{spk.role ? ` · ${spk.role}` : ""}
              </div>
              <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 24, color: palette.ink, lineHeight: 1.32 }}>
                “{ln.text}”
              </div>
            </div>
          );
        })}

        {spec.subtext && frame >= subAt && (
          <div
            style={{
              marginTop: 8,
              padding: "18px 28px",
              borderRadius: 14,
              background: `${palette.accent}20`,
              border: `2.5px solid ${palette.accent}`,
              opacity: subP,
              transform: `translateY(${(1 - subP) * 14}px)`,
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 13, letterSpacing: "0.14em", color: palette.accent, marginBottom: 4 }}>
              {spec.subtext.badge ?? "SUBTEXT — WHAT IT REALLY MEANS"}
            </div>
            <FitText text={spec.subtext.headline} maxWidth={960} maxLines={2} baseSize={26} minSize={18} fontFamily={fonts.display} fontWeight={900} color={palette.ink} />
            {spec.subtext.detail && (
              <div style={{ fontFamily: fonts.body, fontSize: 18, color: palette.muted, marginTop: 4 }}>{spec.subtext.detail}</div>
            )}
          </div>
        )}
      </div>
    </GrammarStage>
  );
};
