import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { TimelineScrubSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * TimelineScrub — Cinecode-inspired "When, in what order" horizontal scrubbing timeline.
 *
 * A glowing playhead advances across chronological events on each event's exact `at` frame,
 * optionally closing an animated feedback loop arc when narration describes a cycle.
 */
export const TimelineScrub: React.FC<{ spec: TimelineScrubSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const displayFont = fonts.display;
  const bodyFont = fonts.body;

  const events = spec.events.slice(0, 6);
  const n = Math.max(2, events.length);
  const firstAt = events[0]?.at ?? 0;
  const lastAt = events[n - 1]?.at ?? 120;
  const span = Math.max(1, lastAt - firstAt);
  const railP = interpolate(frame, [firstAt, lastAt], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const loopAt = spec.loopAt ?? lastAt + 24;
  const loopP = spec.loopLabel && frame >= loopAt
    ? interpolate(frame - loopAt, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.poly(3)) })
    : 0;
  const calloutAt = spec.calloutAt ?? lastAt + 36;
  const calloutP = spec.callout && frame >= calloutAt
    ? interpolate(frame - calloutAt, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>

      {/* Horizontal Scrubbing Rail + Events */}
      <div style={{ position: "relative", width: "100%", maxWidth: 1560, height: 340, display: "flex", alignItems: "center" }}>
        {/* Base Rail */}
        <div style={{ position: "absolute", left: 70, right: 70, top: "50%", height: 6, marginTop: -3, borderRadius: 999, background: palette.surfaceBorder }} />
        {/* Active Progress Rail */}
        <div
          style={{
            position: "absolute",
            left: 70,
            top: "50%",
            height: 6,
            marginTop: -3,
            width: `calc((100% - 140px) * ${railP})`,
            borderRadius: 999,
            background: palette.accent,
            boxShadow: `0 0 18px ${palette.accent}88`,
          }}
        />
        {/* Playhead Dot */}
        <div
          style={{
            position: "absolute",
            left: `calc(70px + (100% - 140px) * ${railP})`,
            top: "50%",
            width: 22,
            height: 22,
            marginLeft: -11,
            marginTop: -11,
            borderRadius: "50%",
            background: palette.accent,
            border: "4px solid #FFF9EE",
            boxShadow: `0 0 24px ${palette.accent}`,
            zIndex: 4,
          }}
        />

        {/* Event Nodes */}
        {events.map((ev, i) => {
          const pct = (i / (n - 1)) * 100;
          const dt = frame - (ev.at ?? 0);
          const ep = dt >= 0 ? spring({ frame: dt, fps, config: { damping: 14, stiffness: 150 } }) : 0;
          const col = toneColor(ev.tone ?? "accent", palette);
          const above = i % 2 === 0;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `calc(70px + (100% - 140px) * ${pct / 100})`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 3,
              }}
            >
              {/* Node Dot */}
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: ep > 0.1 ? col : palette.bgAlt,
                  border: `3px solid ${ep > 0.1 ? "#FFF9EE" : palette.surfaceBorder}`,
                }}
              />
              {/* Card Above or Below */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  ...(above ? { bottom: 32 } : { top: 32 }),
                  transform: `translateX(-50%) translateY(${(1 - ep) * (above ? 14 : -14)}px)`,
                  opacity: ep,
                  width: 240,
                  textAlign: "center",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    fontFamily: displayFont,
                    fontWeight: 900,
                    fontSize: 16,
                    letterSpacing: "0.08em",
                    padding: "4px 12px",
                    borderRadius: 999,
                    background: `${col}26`,
                    color: col,
                    marginBottom: 6,
                  }}
                >
                  {ev.time}
                </span>
                <div style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 23, lineHeight: 1.15, color: palette.ink }}>
                  {ev.title}
                </div>
                {ev.detail && (
                  <div style={{ fontFamily: bodyFont, fontWeight: 500, fontSize: 17, lineHeight: 1.25, color: palette.muted, marginTop: 4 }}>
                    {ev.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Optional Feedback Loop Arc */}
        {spec.loopLabel && loopP > 0 && (
          <svg width={1560} height={110} viewBox="0 0 1560 110" style={{ position: "absolute", left: 0, bottom: -54, pointerEvents: "none", overflow: "visible" }}>
            <path
              d="M 1460 10 Q 780 118 100 10"
              fill="none"
              stroke={palette.danger}
              strokeWidth={4}
              strokeDasharray="10 8"
              opacity={loopP}
            />
            <polygon points="100,10 118,2 114,22" fill={palette.danger} opacity={loopP} />
            <rect x={600} y={48} width={360} height={34} rx={17} fill={palette.bg} stroke={palette.danger} strokeWidth={2} opacity={loopP} />
            <text x={780} y={71} textAnchor="middle" fill={palette.danger} fontFamily={displayFont} fontWeight={900} fontSize={18} letterSpacing={2} opacity={loopP}>
              {spec.loopLabel}
            </text>
          </svg>
        )}
      </div>

      {spec.callout && calloutP > 0 && (
        <div
          style={{
            marginTop: spec.loopLabel ? 56 : 24,
            padding: "11px 24px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            border: `1.5px solid ${palette.accent}66`,
            fontFamily: bodyFont,
            fontWeight: 700,
            fontSize: 23,
            color: palette.ink,
            opacity: calloutP,
          }}
        >
          {spec.callout}
        </div>
      )}
    </GrammarStage>
  );
};
