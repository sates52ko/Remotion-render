import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnnotatedSceneSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";

const HAND_FONT = "Georgia, 'Brush Script MT', cursive";

const StickerIcon: React.FC<{ kind?: string; color: string }> = ({ kind, color }) => {
  const s = { fill: "none", stroke: color, strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "envelope":
      return (
        <svg width={34} height={34} viewBox="0 0 32 32">
          <rect x={3} y={6} width={26} height={20} rx={3} {...s} />
          <polyline points="3,8 16,18 29,8" {...s} />
        </svg>
      );
    case "eye":
      return (
        <svg width={34} height={34} viewBox="0 0 32 32">
          <path d="M2 16 Q16 4 30 16 Q16 28 2 16 Z" {...s} />
          <circle cx={16} cy={16} r={4} fill={color} />
        </svg>
      );
    case "check":
      return (
        <svg width={34} height={34} viewBox="0 0 32 32">
          <circle cx={16} cy={16} r={12} {...s} />
          <polyline points="10,16 14,20 22,12" {...s} />
        </svg>
      );
    case "clock":
      return (
        <svg width={34} height={34} viewBox="0 0 32 32">
          <circle cx={16} cy={16} r={12} {...s} />
          <polyline points="16,9 16,16 21,19" {...s} />
        </svg>
      );
    case "quote":
      return (
        <svg width={34} height={34} viewBox="0 0 32 32">
          <path d="M7 18h5v6H7zM20 18h5v6h-5z" fill={color} />
          <path d="M7 18c0-5 3-8 6-9M20 18c0-5 3-8 6-9" {...s} />
        </svg>
      );
    default:
      return (
        <svg width={34} height={34} viewBox="0 0 32 32">
          <polygon points="16,3 19,12 29,12 21,18 24,28 16,22 8,28 11,18 3,12 13,12" fill={color} />
        </svg>
      );
  }
};

/**
 * AnnotatedScene — Realm A (Single-World Illustrated Storytelling).
 *
 * Full-bleed or editorial-print bespoke illustration with ZERO flat-vector puppets on top.
 * Word-synced spotlights, rising/routed trace beams, and tactile paper-collage stickers
 * guide the viewer's eye in lockstep with the narration.
 */
export const AnnotatedScene: React.FC<{ spec: AnnotatedSceneSpec; localFrame?: number; stageMood?: StageMoodName }> = ({ spec, localFrame, stageMood }) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const light = isLightPalette(palette);
  const fonts = resolveArtFonts(ad);
  const displayFont = fonts.display;
  const bodyFont = fonts.body;
  const markerStyle = spec.markerStyle ?? ad?.annotationStyle ?? "circle";

  const framing = spec.framing ?? "fullBleed";
  const kb = spec.kenBurns ?? "pushIn";
  const p = interpolate(frame, [0, 480], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const imgScale = kb === "dollyZoom" ? 1.0 + p * 0.14 : kb === "pushIn" ? 1.01 + p * 0.045 : kb === "pullOut" ? 1.055 - p * 0.045 : kb === "none" ? 1 : 1.03;
  const imgTx = kb === "panLeft" ? (0.5 - p) * 32 : kb === "panRight" ? (p - 0.5) * 32 : 0;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* 1. Artwork Layer */}
      {framing === "fullBleed" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${imgTx.toFixed(1)}px, 0) scale(${imgScale.toFixed(4)})`,
            transformOrigin: "center",
          }}
        >
          <Img src={staticFile(spec.image)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {(spec.dim ?? 0.10) > 0 && (
            <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(8,10,15,${spec.dim ?? 0.10})` }} />
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(8,10,15,0.28) 0%, rgba(8,10,15,0) 22%, rgba(8,10,15,0) 68%, rgba(8,10,15,0.72) 100%)",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            left: 370,
            top: 105,
            width: 1180,
            height: 740,
            borderRadius: light ? 8 : 16,
            overflow: "hidden",
            border: `2px solid ${palette.surfaceBorder}`,
            boxShadow: light ? "0 20px 56px rgba(24,24,27,0.16)" : "0 28px 80px rgba(0,0,0,0.58)",
            background: light ? palette.surface : "#0B0D12",
          }}
        >
          <Img
            src={staticFile(spec.image)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${imgScale.toFixed(4)})`,
              transformOrigin: "center",
            }}
          />
          {(spec.dim ?? 0.05) > 0 && (
            <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(8,10,15,${spec.dim ?? 0.05})` }} />
          )}
        </div>
      )}

      {/* 2. Top Editorial Banner */}
      {spec.banner && frame >= (spec.banner.at ?? 0) && (() => {
        const bp = interpolate(frame - (spec.banner.at ?? 0), [0, 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.poly(4)),
        });
        return (
          <div
            style={{
              position: "absolute",
              top: 30,
              left: "50%",
              transform: `translateX(-50%) translateY(${(1 - bp) * -14}px)`,
              opacity: bp,
              padding: "9px 26px",
              borderRadius: light ? 4 : 999,
              background: light ? palette.surface : "rgba(10,13,20,0.82)",
              border: `1.5px solid ${palette.accent}`,
              fontFamily: displayFont,
              fontWeight: 900,
              fontSize: 24,
              letterSpacing: "0.08em",
              color: palette.accent,
              whiteSpace: "nowrap",
              boxShadow: light ? "0 8px 24px rgba(24,24,27,0.12)" : "0 10px 28px rgba(0,0,0,0.45)",
            }}
          >
            {spec.banner.text}
          </div>
        );
      })()}

      {/* 3. Word-Synced Traces & Spotlight Rings (1920x1080 SVG overlay) */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {(spec.traces ?? []).map((tr, ti) => {
          const dt = frame - (tr.at ?? 0);
          if (dt < 0) return null;
          const tp = interpolate(dt, [0, Math.max(1, tr.dur ?? 24)], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.poly(3)),
          });
          const col = toneColor(tr.tone ?? "accent", palette);
          const dx = tr.to.x - tr.from.x;
          const dy = tr.to.y - tr.from.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const cx = tr.from.x + dx * tp;
          const cy = tr.from.y + dy * tp;
          const ang = Math.atan2(dy, dx);
          const headSize = 16;
          const p1x = cx - headSize * Math.cos(ang - 0.5);
          const p1y = cy - headSize * Math.sin(ang - 0.5);
          const p2x = cx - headSize * Math.cos(ang + 0.5);
          const p2y = cy - headSize * Math.sin(ang + 0.5);
          return (
            <g key={`tr-${ti}`}>
              <circle cx={tr.from.x} cy={tr.from.y} r={10} fill={col} opacity={0.9} />
              <line
                x1={tr.from.x}
                y1={tr.from.y}
                x2={tr.to.x}
                y2={tr.to.y}
                stroke={col}
                strokeWidth={7}
                strokeLinecap="round"
                strokeDasharray={len}
                strokeDashoffset={(1 - tp) * len}
              />
              {tp > 0.15 && (
                <polygon points={`${cx},${cy} ${p1x},${p1y} ${p2x},${p2y}`} fill={col} />
              )}
              {tp > 0.85 && (
                <circle cx={tr.to.x} cy={tr.to.y} r={12} fill="none" stroke={col} strokeWidth={4} opacity={0.95} />
              )}
            </g>
          );
        })}

        {(spec.spotlights ?? []).map((sp, si) => {
          const dt = frame - (sp.at ?? 0);
          if (dt < 0) return null;
          const rp = interpolate(dt, [0, 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.poly(3)),
          });
          const col = toneColor(sp.tone ?? "accent", palette);
          const rx = sp.rx ?? 140;
          const ry = sp.ry ?? rx;
          const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
          const lx = sp.labelX ?? (sp.labelPos === "left" ? sp.cx - rx - 180 : sp.labelPos === "top" ? sp.cx : sp.labelPos === "bottom" ? sp.cx : sp.cx + rx + 180);
          const ly = sp.labelY ?? (sp.labelPos === "top" ? sp.cy - ry - 90 : sp.labelPos === "bottom" ? sp.cy + ry + 90 : sp.cy - 20);
          const sx = lx < sp.cx ? sp.cx - rx * 0.78 : lx > sp.cx ? sp.cx + rx * 0.78 : sp.cx;
          const sy = ly < sp.cy ? sp.cy - ry * 0.55 : sp.cy + ry * 0.35;
          const midX = (sx + lx) / 2;
          const midY = Math.min(sy, ly) - 24;
          const bx0 = sp.cx - rx;
          const bx1 = sp.cx + rx;
          const by0 = sp.cy - ry;
          const by1 = sp.cy + ry;
          const arm = Math.min(42, rx * 0.35, ry * 0.35);
          const inset = (1 - rp) * 26;
          return (
            <g key={`sp-${si}`}>
              {markerStyle === "bracket" ? (
                <g stroke={col} strokeWidth={5} fill="none" strokeLinecap="square" opacity={rp}>
                  <polyline points={`${bx0 - inset},${by0 + arm - inset} ${bx0 - inset},${by0 - inset} ${bx0 + arm - inset},${by0 - inset}`} />
                  <polyline points={`${bx1 - arm + inset},${by0 - inset} ${bx1 + inset},${by0 - inset} ${bx1 + inset},${by0 + arm - inset}`} />
                  <polyline points={`${bx0 - inset},${by1 - arm + inset} ${bx0 - inset},${by1 + inset} ${bx0 + arm - inset},${by1 + inset}`} />
                  <polyline points={`${bx1 - arm + inset},${by1 + inset} ${bx1 + inset},${by1 + inset} ${bx1 + inset},${by1 - arm + inset}`} />
                </g>
              ) : markerStyle === "underline" ? (
                <line
                  x1={bx0}
                  y1={sp.cy + ry * 0.65}
                  x2={bx0 + (bx1 - bx0) * rp}
                  y2={sp.cy + ry * 0.65}
                  stroke={col}
                  strokeWidth={8}
                  strokeLinecap="round"
                />
              ) : markerStyle === "spotlightMask" ? (
                <g opacity={rp}>
                  <rect x={bx0} y={by0} width={rx * 2} height={ry * 2} rx={4} fill={`${col}14`} stroke={col} strokeWidth={3} />
                  <line x1={sp.cx - 12} y1={sp.cy} x2={sp.cx + 12} y2={sp.cy} stroke={col} strokeWidth={2} />
                  <line x1={sp.cx} y1={sp.cy - 12} x2={sp.cx} y2={sp.cy + 12} stroke={col} strokeWidth={2} />
                </g>
              ) : markerStyle === "pin" ? (
                <g opacity={rp}>
                  <circle cx={sp.cx} cy={sp.cy} r={14} fill={col} />
                  <circle cx={sp.cx} cy={sp.cy} r={6} fill="#FFFFFF" />
                  <line x1={sp.cx} y1={sp.cy} x2={sp.cx} y2={sp.cy - ry * 0.7} stroke={col} strokeWidth={3} />
                </g>
              ) : (
                <>
                  <ellipse
                    cx={sp.cx}
                    cy={sp.cy}
                    rx={rx + 6}
                    ry={ry + 6}
                    fill="none"
                    stroke={col}
                    strokeWidth={2}
                    opacity={0.35 * rp}
                  />
                  <ellipse
                    cx={sp.cx}
                    cy={sp.cy}
                    rx={rx}
                    ry={ry}
                    fill="none"
                    stroke={col}
                    strokeWidth={5.5}
                    strokeLinecap="round"
                    strokeDasharray={perim}
                    strokeDashoffset={(1 - rp) * perim}
                  />
                </>
              )}
              {(sp.label || sp.note) && (
                <path
                  d={markerStyle === "bracket" || markerStyle === "pin" ? `M ${sx} ${sy} L ${lx} ${sy} L ${lx} ${ly}` : `M ${sx} ${sy} Q ${midX} ${midY} ${lx} ${ly}`}
                  fill="none"
                  stroke={col}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeDasharray={600}
                  strokeDashoffset={(1 - rp) * 600}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* 4. Spotlight Label Chips + Handwritten Notes */}
      {(spec.spotlights ?? []).map((sp, si) => {
        const dt = frame - (sp.at ?? 0);
        if (dt < 0 || (!sp.label && !sp.note)) return null;
        const lp = spring({ frame: Math.max(0, dt - 4), fps, config: { damping: 15, stiffness: 150 } });
        const col = toneColor(sp.tone ?? "accent", palette);
        const rx = sp.rx ?? 140;
        const ry = sp.ry ?? rx;
        const lx = sp.labelX ?? (sp.labelPos === "left" ? sp.cx - rx - 180 : sp.labelPos === "top" ? sp.cx : sp.labelPos === "bottom" ? sp.cx : sp.cx + rx + 180);
        const ly = Math.min(860, sp.labelY ?? (sp.labelPos === "top" ? sp.cy - ry - 90 : sp.labelPos === "bottom" ? sp.cy + ry + 90 : sp.cy - 20));
        return (
          <div
            key={`lbl-${si}`}
            style={{
              position: "absolute",
              left: lx,
              top: ly,
              transform: `translate(-50%, -50%) rotate(-1.2deg) scale(${0.86 + lp * 0.14})`,
              opacity: lp,
              background: "#FFF9EE",
              color: "#1E1914",
              border: `2.5px solid ${col}`,
              borderLeft: `7px solid ${col}`,
              borderRadius: 10,
              padding: "10px 18px",
              boxShadow: "0 14px 32px rgba(0,0,0,0.45)",
              maxWidth: 320,
              pointerEvents: "none",
            }}
          >
            {sp.label && (
              <div style={{ fontFamily: displayFont, fontWeight: 900, fontSize: 20, letterSpacing: "0.06em", color: "#1E1914", lineHeight: 1.15 }}>
                {sp.label}
              </div>
            )}
            {sp.note && (
              <div style={{ fontFamily: HAND_FONT, fontStyle: "italic", fontWeight: 700, fontSize: 22, color: "#4A3C2C", marginTop: 3, lineHeight: 1.2 }}>
                {sp.note}
              </div>
            )}
          </div>
        );
      })}

      {/* 5. Tactile Paper-Collage Stickers */}
      {(spec.stickers ?? []).map((st, ki) => {
        const dt = frame - (st.at ?? 0);
        if (dt < 0) return null;
        const sp = spring({ frame: dt, fps, config: { damping: 13, stiffness: 170 } });
        const col = toneColor(st.tone ?? "positive", palette);
        const safeY = Math.min(860, st.y);
        return (
          <div
            key={`st-${ki}`}
            style={{
              position: "absolute",
              left: st.x,
              top: safeY,
              transform: `translate(-50%, -50%) rotate(${st.rot ?? -2.2}deg) scale(${1.18 - sp * 0.18})`,
              opacity: Math.min(1, sp * 1.4),
              background: "#FFF9EE",
              color: "#1E1914",
              border: "2.5px solid #1E1914",
              borderTop: `8px solid ${col}`,
              borderRadius: 12,
              padding: "16px 22px",
              boxShadow: "0 18px 42px rgba(0,0,0,0.52)",
              display: "flex",
              alignItems: "center",
              gap: 14,
              maxWidth: 340,
              pointerEvents: "none",
            }}
          >
            <div style={{ flexShrink: 0 }}>
              <StickerIcon kind={st.icon} color={col} />
            </div>
            <div>
              <div style={{ fontFamily: displayFont, fontWeight: 900, fontSize: 21, letterSpacing: "0.05em", color: "#1E1914", lineHeight: 1.15 }}>
                {st.title}
              </div>
              {st.subtitle && (
                <div style={{ fontFamily: bodyFont, fontWeight: 600, fontSize: 17, color: "#4A3C2C", marginTop: 4, lineHeight: 1.25 }}>
                  {st.subtitle}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
