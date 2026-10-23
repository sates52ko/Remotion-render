import React from "react";
import { interpolate, spring } from "remotion";
import type { CharEmotion } from "../schema";

export interface EmotionOverlayProps {
  emotion?: CharEmotion;
  at?: number;
  frame: number;
  fps: number;
}

/**
 * Emotions.tsx — Head-anchored micro-reaction overlays for Everyman.
 *
 * Designed to sit inside the HEAD group (<g transform="translate(pose.headX, pose.headY)...">)
 * so every emotion naturally tracks head turns, yaw, and headScale.
 *
 * All effects are pure SVG paths, 100% GPU-safe, zero WebGL, with spring physics.
 */
export const EmotionOverlay: React.FC<EmotionOverlayProps> = ({
  emotion,
  at = 8,
  frame,
  fps,
}) => {
  if (!emotion || emotion === "none") return null;

  const rel = frame - at;
  if (rel < 0) return null;

  switch (emotion) {
    case "lightbulb": {
      // 💡 Insight / Realization / "Aha!" moment
      const s = spring({
        frame: rel,
        fps,
        config: { damping: 11, stiffness: 170, mass: 0.7 },
      });
      const bob = Math.sin(rel * 0.18) * 3;
      const rayLen = interpolate(rel, [0, 8, 24], [0, 18, 14], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const rayAlpha = interpolate(rel, [0, 6, 40], [0, 1, 0.85], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      // 7 radiant ray angles around the bulb
      const angles = [-90, -55, -25, 0, 25, 55, 90];

      return (
        <g
          transform={`translate(200 ${-20 + bob}) scale(${s})`}
          style={{ overflow: "visible" }}
        >
          {/* Subtle warm glow aura */}
          <circle cx={0} cy={0} r={34} fill="#F59E0B" opacity={0.18 * rayAlpha} />

          {/* Radiating spark rays */}
          {rayAlpha > 0.1 && (
            <g stroke="#F59E0B" strokeWidth={3.5} strokeLinecap="round" opacity={rayAlpha}>
              {angles.map((deg) => {
                const rad = ((deg - 90) * Math.PI) / 180;
                const rInner = 28;
                const rOuter = rInner + rayLen;
                const x1 = Math.cos(rad) * rInner;
                const y1 = Math.sin(rad) * rInner;
                const x2 = Math.cos(rad) * rOuter;
                const y2 = Math.sin(rad) * rOuter;
                return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
              })}
            </g>
          )}

          {/* Glass dome of bulb */}
          <path
            d="M -13,6 C -18,-4 -16,-22 0,-24 C 16,-22 18,-4 13,6 L 10,13 L -10,13 Z"
            fill="#FBBF24"
            stroke="#D97706"
            strokeWidth={3}
            strokeLinejoin="round"
          />

          {/* Filament inside bulb */}
          <path
            d="M -6,4 L -3,-8 L 0,-2 L 3,-8 L 6,4"
            fill="none"
            stroke="#B45309"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Specular glass gleam */}
          <path
            d="M -10,-12 C -10,-18 -4,-21 0,-21"
            fill="none"
            stroke="#FEF3C7"
            strokeWidth={2.5}
            strokeLinecap="round"
          />

          {/* Metallic screw base */}
          <rect
            x={-9}
            y={14}
            width={18}
            height={5}
            rx={2}
            fill="#78716C"
            stroke="#44403C"
            strokeWidth={1.5}
          />
          <rect
            x={-7}
            y={20}
            width={14}
            height={4}
            rx={1.5}
            fill="#78716C"
            stroke="#44403C"
            strokeWidth={1.5}
          />
          <ellipse cx={0} cy={25} rx={4} ry={2} fill="#44403C" />
        </g>
      );
    }

    case "sweat": {
      // 💧 Anxiety / Cognitive trap / Awkwardness (placed on temple)
      const appear = interpolate(rel, [0, 5], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const dripY = interpolate(rel, [6, 32], [0, 38], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const fade = interpolate(rel, [24, 34], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const scale = appear * fade;

      if (scale <= 0.01) return null;

      return (
        <g
          transform={`translate(276 ${114 + dripY}) scale(${scale})`}
          style={{ overflow: "visible" }}
        >
          {/* Main teardrop */}
          <path
            d="M 0,-14 C -6,-5 -8,2 -8,6 C -8,11 -4,15 0,15 C 4,15 8,11 8,6 C 8,2 6,-5 0,-14 Z"
            fill="#38BDF8"
            stroke="#0284C7"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {/* Specular highlight */}
          <path
            d="M -3,3 C -4,5 -4,8 -2,10"
            fill="none"
            stroke="#BAE6FD"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </g>
      );
    }

    case "question": {
      // ❓ Mystery / Confusion / Paradigm questioning (3 staggered question marks)
      const qConfig = [
        { delay: 0, x: 135, y: -8, size: 30, rot: -16, color: "#6366F1" },
        { delay: 5, x: 200, y: -32, size: 40, rot: 4, color: "#818CF8" },
        { delay: 9, x: 265, y: -12, size: 32, rot: 18, color: "#A5B4FC" },
      ];

      return (
        <g style={{ overflow: "visible" }}>
          {qConfig.map((q, idx) => {
            const qRel = rel - q.delay;
            if (qRel < 0) return null;
            const qSpring = spring({
              frame: qRel,
              fps,
              config: { damping: 10, stiffness: 180 },
            });
            const qFloat = Math.sin((qRel + idx * 4) * 0.15) * 4;

            return (
              <g
                key={idx}
                transform={`translate(${q.x} ${q.y + qFloat}) scale(${qSpring}) rotate(${q.rot})`}
              >
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={q.color}
                  stroke="#FFFFFF"
                  strokeWidth={4}
                  paintOrder="stroke fill"
                  style={{
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 800,
                    fontSize: q.size,
                  }}
                >
                  ?
                </text>
              </g>
            );
          })}
        </g>
      );
    }

    case "shock": {
      // ⚡ Shocking realization / sudden paradigm shift
      if (rel > 36) return null;
      const burstScale = spring({
        frame: rel,
        fps,
        config: { damping: 9, stiffness: 220 },
      });
      const alpha = interpolate(rel, [0, 4, 30, 36], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      return (
        <g
          transform={`translate(200 140) scale(${burstScale})`}
          opacity={alpha}
          style={{ overflow: "visible" }}
        >
          {/* Radial comic shock lines */}
          <g stroke="#F59E0B" strokeWidth={4} strokeLinecap="round">
            <line x1={-110} y1={-70} x2={-145} y2={-95} />
            <line x1={110} y1={-70} x2={145} y2={-95} />
            <line x1={-125} y1={0} x2={-165} y2={0} />
            <line x1={125} y1={0} x2={165} y2={0} />
            <line x1={-110} y1={70} x2={-145} y2={95} />
            <line x1={110} y1={70} x2={145} y2={95} />
            <line x1={0} y1={-130} x2={0} y2={-170} />
          </g>
          {/* Inner accent sparks */}
          <g stroke="#EF4444" strokeWidth={3} strokeLinecap="round">
            <line x1={-70} y1={-100} x2={-95} y2={-135} />
            <line x1={70} y1={-100} x2={95} y2={-135} />
          </g>
        </g>
      );
    }

    case "fire": {
      // 🔥 Unstoppable drive / burning discipline / intense focus
      const s = spring({
        frame: rel,
        fps,
        config: { damping: 12, stiffness: 150 },
      });
      const wave1 = Math.sin(rel * 0.3) * 4;
      const wave2 = Math.cos(rel * 0.28) * 3;

      return (
        <g
          transform={`translate(200 36) scale(${s})`}
          style={{ overflow: "visible" }}
        >
          {/* Outer orange/red flame */}
          <path
            d={`M -32,10 C -42,-12 -28,-48 -12,-62 C -8,-48 4,-40 6,-54 C 18,-38 36,-20 32,10 C 26,20 -24,20 -32,10 Z`}
            fill="#EA580C"
            opacity={0.92}
            transform={`translate(${wave1} 0)`}
          />
          {/* Mid flame */}
          <path
            d={`M -22,10 C -30,-4 -18,-34 -8,-44 C -2,-32 6,-26 8,-38 C 16,-24 26,-10 22,10 Z`}
            fill="#F59E0B"
            transform={`translate(${wave2} 0)`}
          />
          {/* Inner core flame */}
          <path
            d="M -12,10 C -18,0 -8,-18 -2,-26 C 0,-18 6,-14 8,-22 C 14,-10 16,0 12,10 Z"
            fill="#FEF08A"
          />
        </g>
      );
    }

    default:
      return null;
  }
};
