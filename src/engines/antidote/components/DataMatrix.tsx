import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { DataMatrixSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";

/**
 * DataMatrix — Antidote 2.0 analytical graphics (2×2 Quadrant Matrix, Dual-Curve Intensity Chart,
 * and Weekly/Daily Schedule Grid). Pure CPU-cheap animated SVG/DOM.
 */
export const DataMatrix: React.FC<{ spec: DataMatrixSpec; localFrame?: number; stageMood?: StageMoodName; sideInsetLeft?: number }> = ({ spec, localFrame, stageMood, sideInsetLeft = 0 }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const displayFont = fonts.display;
  const bodyFont = fonts.body;
  const borderless = !!spec.borderless;
  const captionPad = ad?.captions === "minimal" ? 148 : 104;

  const titleP = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>

      {/* ── VARIANT 1: 2x2 QUADRANT MATRIX ───────────────────────────────── */}
      {spec.variant === "quadrant2x2" && (
        <div style={{ position: "relative", width: sideInsetLeft ? 1040 : 1220, height: 540 }}>
          {/* Axis labels */}
          {spec.yLabel && (
            <div
              style={{
                position: "absolute",
                left: -130,
                top: "50%",
                transform: "translateY(-50%) rotate(-90deg)",
                fontFamily: displayFont,
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: palette.muted,
                whiteSpace: "nowrap",
              }}
            >
              {spec.yLabel}
            </div>
          )}
          {spec.xLabel && (
            <div
              style={{
                position: "absolute",
                bottom: -44,
                left: "50%",
                transform: "translateX(-50%)",
                fontFamily: displayFont,
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: palette.muted,
                whiteSpace: "nowrap",
              }}
            >
              {spec.xLabel}
            </div>
          )}
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridTemplateRows: "1fr 1fr",
              gap: borderless ? 0 : 20,
              width: "100%",
              height: "100%",
            }}
          >
            {borderless && (
              <>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, marginLeft: -1, background: palette.surfaceBorder, pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, marginTop: -1, background: palette.surfaceBorder, pointerEvents: "none" }} />
              </>
            )}
            {(spec.quadrants ?? []).slice(0, 4).map((q, i) => {
              const qStep = spec.quadrantRevealStep ?? 10;
              const qp = spring({
                frame: Math.max(0, frame - (8 + i * qStep)),
                fps,
                config: { damping: 16, stiffness: 140 },
              });
              const accent = toneColor(q.tone, palette);
              const isActive = !!q.active;
              return (
                <div
                  key={i}
                  style={{
                    borderRadius: borderless ? 0 : 24,
                    background: borderless
                      ? (isActive ? `${accent}1E` : "rgba(255,255,255,0.03)")
                      : (isActive ? `${accent}24` : palette.surface),
                    border: borderless
                      ? (isActive ? `2px solid ${accent}` : "1px solid transparent")
                      : `${isActive ? 4 : 2}px solid ${isActive ? accent : palette.surfaceBorder}`,
                    boxShadow: borderless
                      ? "none"
                      : isActive
                      ? `0 18px 46px rgba(0,0,0,0.44), 0 0 28px ${accent}33`
                      : "0 14px 36px rgba(0,0,0,0.3)",
                    padding: "28px 36px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    textAlign: "center",
                    opacity: qp,
                    transform: `scale(${0.92 + qp * 0.08})`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: displayFont,
                      fontWeight: 900,
                      fontSize: 38,
                      lineHeight: 1.12,
                      color: isActive ? accent : palette.ink,
                    }}
                  >
                    {q.label}
                  </div>
                  {q.sublabel && (
                    <div
                      style={{
                        fontFamily: bodyFont,
                        fontWeight: 500,
                        fontSize: 23,
                        lineHeight: 1.32,
                        color: isActive ? palette.ink : palette.muted,
                        marginTop: 12,
                        maxWidth: 460,
                      }}
                    >
                      {q.sublabel}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── VARIANT 2: DUAL-CURVE INTENSITY VS TIME ──────────────────────── */}
      {spec.variant === "dualCurve" && (() => {
        const W = sideInsetLeft ? 1240 : 1420;
        const H = 500;
        const padL = 150;
        const padR = 340;
        const padT = 44;
        const padB = 78;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;
        const drawStart = spec.drawAt ?? 6;
        const drawP = interpolate(frame, [drawStart, drawStart + 42], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
        const curves = (spec.curves ?? []).slice(0, 3);
        const buildPath = (pts: number[]) => {
          if (pts.length < 2) return "";
          const coords = pts.map((v, idx) => ({
            x: padL + (idx / (pts.length - 1)) * plotW,
            y: padT + (1 - Math.max(0, Math.min(1, v))) * plotH,
          }));
          let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
          for (let k = 0; k < coords.length - 1; k++) {
            const p0 = coords[k];
            const p1 = coords[k + 1];
            const cx = (p0.x + p1.x) / 2;
            d += ` C ${cx.toFixed(1)} ${p0.y.toFixed(1)}, ${cx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
          }
          return d;
        };

        return (
          <div
            style={{
              background: borderless ? "transparent" : palette.surface,
              border: borderless ? "none" : `2px solid ${palette.surfaceBorder}`,
              borderRadius: borderless ? 0 : 28,
              padding: borderless ? "8px 12px" : "24px 30px",
              boxShadow: borderless ? "none" : "0 24px 60px rgba(0,0,0,0.42)",
            }}
          >
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              {/* Subtle horizontal reference lines */}
              {[0.25, 0.5, 0.75, 1].map((g) => {
                const y = padT + (1 - g) * plotH;
                return (
                  <line
                    key={g}
                    x1={padL}
                    y1={y}
                    x2={padL + plotW}
                    y2={y}
                    stroke={palette.surfaceBorder}
                    strokeWidth={1.5}
                    strokeDasharray="6 8"
                  />
                );
              })}

              {/* Axes */}
              <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={palette.muted} strokeWidth={4} strokeLinecap="round" />
              <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={palette.muted} strokeWidth={4} strokeLinecap="round" />

              {/* Axis labels */}
              <text
                x={padL}
                y={padT - 12}
                textAnchor="start"
                fill={palette.muted}
                fontFamily={displayFont}
                fontWeight={800}
                fontSize={22}
                letterSpacing={2}
              >
                {spec.yLabel ?? "INTENSITY"}
              </text>
              <text
                x={padL + plotW / 2}
                y={H - 18}
                textAnchor="middle"
                fill={palette.muted}
                fontFamily={displayFont}
                fontWeight={800}
                fontSize={24}
                letterSpacing={3}
              >
                {spec.xLabel ?? "TIME"}
              </text>

              {/* Animated Curves */}
              {curves.map((c, ci) => {
                const col = c.color ?? (ci === 0 ? palette.danger : ci === 1 ? palette.accent2 : palette.accent);
                const pathD = buildPath(c.points);
                const lastY = padT + (1 - Math.max(0, Math.min(1, c.points[c.points.length - 1] ?? 0.5))) * plotH;
                const dashLen = 2400;
                const labelP = interpolate(frame, [drawStart + 24 + ci * 6, drawStart + 38 + ci * 6], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                return (
                  <g key={ci}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={col}
                      strokeWidth={7}
                      strokeLinecap="round"
                      strokeDasharray={dashLen}
                      strokeDashoffset={(1 - drawP) * dashLen}
                    />
                    <circle
                      cx={padL + plotW}
                      cy={lastY}
                      r={8}
                      fill={col}
                      opacity={labelP}
                    />
                    <text
                      x={padL + plotW + 18}
                      y={lastY + 8}
                      fill={col}
                      fontFamily={displayFont}
                      fontWeight={800}
                      fontSize={25}
                      opacity={labelP}
                    >
                      {c.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })()}

      {/* ── VARIANT 3: WEEKLY / DAILY SCHEDULE BLOCKS ────────────────────── */}
      {spec.variant === "schedule" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.max(1, (spec.schedule ?? []).length)}, minmax(0, 1fr))`,
            gap: 24,
            width: "100%",
            maxWidth: 1540,
          }}
        >
          {(spec.schedule ?? []).slice(0, 7).map((day, di) => {
            const dp = spring({
              frame: Math.max(0, frame - (4 + di * 5)),
              fps,
              config: { damping: 16, stiffness: 140 },
            });
            return (
              <div
                key={di}
                style={{
                  background: palette.surface,
                  border: `2px solid ${palette.surfaceBorder}`,
                  borderRadius: 22,
                  padding: "22px 18px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  opacity: dp,
                  transform: `translateY(${(1 - dp) * 26}px)`,
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    fontFamily: displayFont,
                    fontWeight: 900,
                    fontSize: 28,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: palette.accent,
                    paddingBottom: 10,
                    borderBottom: `2px dashed ${palette.surfaceBorder}`,
                  }}
                >
                  {day.day}
                </div>
                {day.blocks.slice(0, 6).map((blk, bi) => {
                  const bp = interpolate(frame, [10 + di * 4 + bi * 3, 18 + di * 4 + bi * 3], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  });
                  const col = toneColor(blk.tone, palette);
                  const active = !!blk.active;
                  return (
                    <div
                      key={bi}
                      style={{
                        height: 62,
                        borderRadius: 14,
                        background: active ? `${col}30` : "rgba(255,255,255,0.06)",
                        border: `2px solid ${active ? col : "rgba(255,255,255,0.1)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 10px",
                        textAlign: "center",
                        fontFamily: bodyFont,
                        fontWeight: 700,
                        fontSize: 19,
                        color: active ? palette.ink : palette.muted,
                        opacity: bp,
                        transform: `scale(${0.92 + bp * 0.08})`,
                      }}
                    >
                      {blk.label ?? ""}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Optional synthesis callout pill */}
      {spec.callout && (
        <div
          style={{
            marginTop: spec.variant === "quadrant2x2" && spec.xLabel ? 68 : 34,
            padding: "14px 34px",
            borderRadius: 999,
            background: `${palette.accent}22`,
            border: `2px solid ${palette.accent}`,
            fontFamily: displayFont,
            fontWeight: 800,
            fontSize: 26,
            color: palette.ink,
            opacity: interpolate(frame, [24, 38], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {spec.callout}
        </div>
      )}
      </div>
    </GrammarStage>
  );
};
