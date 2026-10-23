import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Chapter } from "./schema";
import { INK, RED, PAPER, HEADLINE, SERIF } from "./palette";
import { InkUnderline } from "../../components/remocn";

const CHAPTER_HOLD = 2.6;

export const ChapterOverlay: React.FC<{ chapters?: Chapter[] }> = ({ chapters }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!chapters || !chapters.length) return null;
  const hold = Math.round(CHAPTER_HOLD * fps);
  const active = chapters.find((c) => c.index > 0 && frame >= c.fromFrame && frame < c.fromFrame + hold);
  if (!active) return null;
  const local = frame - active.fromFrame;
  const inX = interpolate(local, [0, 12], [-620, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const op = Math.min(
    interpolate(local, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(local, [hold - 12, hold], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const num = String(active.index).padStart(2, "0");
  return (
    <AbsoluteFill style={{ zIndex: 56, pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "rgba(15,12,9,0.28)", opacity: op }} />
      <div style={{ position: "absolute", left: 0, top: 150, transform: `translateX(${inX}px)`, opacity: op, maxWidth: 1040 }}>
        <div style={{ background: "rgba(17,13,9,0.88)", borderLeft: `10px solid ${RED}`, padding: "26px 40px 30px 34px", borderRadius: "0 14px 14px 0", boxShadow: "0 18px 40px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 44, color: PAPER, background: RED, padding: "2px 18px", borderRadius: 2 }}>{num}</span>
            <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 32, letterSpacing: 7, color: PAPER, opacity: 0.75 }}>CHAPTER</span>
          </div>
          <div style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 62, lineHeight: 0.98, color: PAPER, textTransform: "uppercase" }}>{active.label}</div>
          <div style={{ marginTop: -2 }}>
            <InkUnderline width={Math.min(780, Math.max(300, active.label.length * 24))} thickness={8} color={RED} delay={8} />
          </div>
          {active.teaser ? <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 38, color: PAPER, opacity: 0.82 }}>{active.teaser}</div> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const ProgressRail: React.FC<{ chapters?: Chapter[]; total: number }> = ({ chapters, total }) => {
  const frame = useCurrentFrame();
  if (total <= 0) return null;
  const pct = Math.max(0, Math.min(1, frame / total));
  return (
    <AbsoluteFill style={{ zIndex: 57, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 6, background: "color-mix(in srgb, var(--vox-ink) 16%, transparent)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, background: RED }} />
        {(chapters || []).map((c) => (
          <div key={c.index} style={{ position: "absolute", top: -2, left: `${(c.fromFrame / total) * 100}%`, width: 2, height: 10, background: INK, opacity: 0.4 }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
