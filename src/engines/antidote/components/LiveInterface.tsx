import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { LiveInterfaceSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * LiveInterface — Animated Digital Workspace, Calendar Tetris & Notification Flood.
 *
 * Replaces static metaphors on digital/productivity/systems beats with real
 * animated Slack/Teams channels and falling Tetris-like calendar blocks.
 */
export const LiveInterface: React.FC<{ spec: LiveInterfaceSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const light = isLightPalette(palette);
  const fonts = resolveArtFonts(ad);

  const headP = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  const days = ["MON", "TUE", "WED", "THU", "FRI"];

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Main Interface Body */}
      {spec.variant === "calendarTetris" ? (
        <div style={{ flex: 1, display: "flex", gap: 28, minHeight: 0 }}>
          {/* Left 36%: Live Notification Channels */}
          <div
            style={{
              width: "36%",
              borderRadius: 12,
              background: palette.surface,
              border: `2px solid ${palette.surfaceBorder}`,
              padding: "22px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: light ? "0 14px 32px rgba(24,24,27,0.08)" : "0 18px 40px rgba(0,0,0,0.42)",
            }}
          >
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 18, letterSpacing: "0.1em", color: palette.muted }}>
              CHANNELS & ALERTS
            </div>
            {(spec.channels ?? []).map((ch, ci) => {
              const dt = frame - (ch.at ?? 0);
              const lit = dt >= 0;
              const pop = lit ? spring({ frame: dt, fps, config: { damping: 14, stiffness: 170 } }) : 0.4;
              const col = lit ? toneColor(ch.tone ?? "danger", palette) : palette.muted;
              return (
                <div
                  key={ci}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 8,
                    background: lit ? `${col}14` : palette.bgAlt,
                    border: `2px solid ${lit ? col : palette.surfaceBorder}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    transform: `scale(${0.96 + pop * 0.04})`,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 21, color: palette.ink }}>
                      {ch.name}
                    </div>
                    {ch.preview && (
                      <div style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 16, color: palette.muted, marginTop: 2 }}>
                        {ch.preview}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      minWidth: 44,
                      height: 34,
                      borderRadius: 999,
                      background: lit ? col : palette.surfaceBorder,
                      color: "#FFFFFF",
                      fontFamily: fonts.display,
                      fontWeight: 800,
                      fontSize: 17,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 10px",
                    }}
                  >
                    {lit ? ch.count ?? "!" : "0"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 64%: 5-Day Weekly Calendar Tetris Grid */}
          <div
            style={{
              flex: 1,
              borderRadius: 12,
              background: palette.surface,
              border: `2px solid ${palette.surfaceBorder}`,
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              boxShadow: light ? "0 14px 32px rgba(24,24,27,0.08)" : "0 18px 40px rgba(0,0,0,0.42)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 12 }}>
              {days.map((d) => (
                <div key={d} style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 18, color: palette.muted, textAlign: "center", letterSpacing: "0.08em" }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, position: "relative", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {days.map((_, colIdx) => (
                <div
                  key={colIdx}
                  style={{
                    background: palette.bgAlt,
                    borderRadius: 8,
                    border: `1px dashed ${palette.surfaceBorder}`,
                    position: "relative",
                    overflow: "hidden",
                    padding: 8,
                    display: "flex",
                    flexDirection: "column-reverse",
                    gap: 8,
                  }}
                >
                  {(spec.blocks ?? [])
                    .filter((b) => b.day === colIdx)
                    .map((b, bi) => {
                      const dt = frame - (b.at ?? 0);
                      if (dt < 0) return null;
                      const drop = spring({ frame: dt, fps, config: { damping: 14, stiffness: 155 } });
                      const col = toneColor(b.tone ?? "accent", palette);
                      return (
                        <div
                          key={bi}
                          style={{
                            height: (b.span ?? 1) * 66,
                            borderRadius: 6,
                            background: `${col}22`,
                            border: `2px solid ${col}`,
                            borderLeft: `6px solid ${col}`,
                            padding: "8px 10px",
                            boxSizing: "border-box",
                            transform: `translateY(${(1 - drop) * -280}px)`,
                            opacity: Math.min(1, drop * 1.5),
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                          }}
                        >
                          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 16, color: palette.ink, lineHeight: 1.15 }}>
                            {b.label}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {(spec.channels ?? []).map((ch, ci) => {
            const dt = frame - (ch.at ?? ci * 14);
            if (dt < 0) return null;
            const pop = spring({ frame: dt, fps, config: { damping: 15, stiffness: 150 } });
            const col = toneColor(ch.tone ?? "accent", palette);
            return (
              <div
                key={ci}
                style={{
                  padding: "22px 26px",
                  borderRadius: 10,
                  background: palette.surface,
                  border: `2px solid ${col}`,
                  borderLeft: `8px solid ${col}`,
                  opacity: Math.min(1, pop * 1.5),
                  transform: `translateY(${(1 - pop) * 20}px)`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 26, color: palette.ink }}>{ch.name}</div>
                  {ch.preview && <div style={{ fontFamily: fonts.body, fontSize: 19, color: palette.muted, marginTop: 4 }}>{ch.preview}</div>}
                </div>
                {ch.count != null && (
                  <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 28, color: col }}>{ch.count}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </GrammarStage>
  );
};
