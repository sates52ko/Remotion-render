import React from "react";

/**
 * RoughMarks.tsx — Deterministic seeded SVG hand-drawn annotation primitives.
 *
 * Zero external dependencies, zero Math.random(), 100% reproducible across
 * parallel GitHub Actions render shards.
 */

export type RoughMarkKind = "underline" | "box" | "circle" | "highlight" | "strike" | "bracket";

export type RoughMarksProps = {
  kind: RoughMarkKind;
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
  /** 0..1 reveal progress */
  progress?: number;
  seed?: string | number;
  style?: React.CSSProperties;
};

function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededOffset(h: number, idx: number, amp: number): number {
  const x = Math.sin(h * 0.001 + idx * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x);
  return (frac * 2 - 1) * amp;
}

export const RoughMarks: React.FC<RoughMarksProps> = ({
  kind,
  width,
  height,
  color,
  strokeWidth = 4,
  progress = 1,
  seed = "rough",
  style,
}) => {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0.01) return null;

  const h = hashSeed(seed);
  const w = Math.max(20, width);
  const ht = Math.max(14, height);
  const j = (idx: number, amp = 3) => seededOffset(h, idx, amp);

  if (kind === "highlight") {
    const clipW = (w * p).toFixed(1);
    return (
      <svg
        width={w}
        height={ht}
        viewBox={`0 0 ${w} ${ht}`}
        style={{ position: "relative", overflow: "visible", pointerEvents: "none", ...style }}
      >
        <defs>
          <clipPath id={`hl-${h}`}>
            <rect x={0} y={0} width={clipW} height={ht} />
          </clipPath>
        </defs>
        <path
          d={`M 2 ${ht * 0.28 + j(1, 2)} Q ${w * 0.5} ${ht * 0.22 + j(2, 3)} ${w - 2} ${ht * 0.3 + j(3, 2)} L ${w - 4} ${ht * 0.86 + j(4, 2)} Q ${w * 0.5} ${ht * 0.9 + j(5, 3)} 4 ${ht * 0.84 + j(6, 2)} Z`}
          fill={color}
          opacity={0.28}
          clipPath={`url(#hl-${h})`}
        />
      </svg>
    );
  }

  let d1 = "";
  let d2 = "";
  let approxLen = w * 2 + ht * 2;

  if (kind === "underline") {
    const y = ht - strokeWidth;
    d1 = `M 2 ${y + j(1, 2)} Q ${w * 0.5} ${y + j(2, 4)} ${w - 2} ${y + j(3, 2)}`;
    d2 = `M 6 ${y + 2 + j(4, 2)} Q ${w * 0.5} ${y + 2 + j(5, 3)} ${w - 6} ${y + 1 + j(6, 2)}`;
    approxLen = w * 1.15;
  } else if (kind === "strike") {
    const y = ht * 0.52;
    d1 = `M 0 ${y + j(1, 3)} Q ${w * 0.5} ${y + j(2, 5)} ${w} ${y + j(3, 3)}`;
    d2 = `M 4 ${y + 3 + j(4, 2)} Q ${w * 0.5} ${y + 2 + j(5, 4)} ${w - 4} ${y + 2 + j(6, 2)}`;
    approxLen = w * 1.15;
  } else if (kind === "box") {
    d1 = `M ${4 + j(1, 2)} ${4 + j(2, 2)} L ${w - 4 + j(3, 2)} ${3 + j(4, 2)} L ${w - 3 + j(5, 2)} ${ht - 4 + j(6, 2)} L ${4 + j(7, 2)} ${ht - 3 + j(8, 2)} Z`;
    d2 = `M ${6 + j(9, 2)} ${6 + j(10, 2)} L ${w - 6 + j(11, 2)} ${5 + j(12, 2)} L ${w - 5 + j(13, 2)} ${ht - 6 + j(14, 2)} L ${6 + j(15, 2)} ${ht - 5 + j(16, 2)} Z`;
    approxLen = (w + ht) * 2.15;
  } else if (kind === "circle") {
    const cx = w / 2;
    const cy = ht / 2;
    const rx = w * 0.48;
    const ry = ht * 0.46;
    d1 = `M ${cx - rx} ${cy + j(1, 3)} C ${cx - rx} ${cy - ry * 1.35}, ${cx + rx} ${cy - ry * 1.25}, ${cx + rx + j(2, 3)} ${cy} C ${cx + rx} ${cy + ry * 1.3}, ${cx - rx} ${cy + ry * 1.25}, ${cx - rx + 3} ${cy + 4}`;
    approxLen = Math.PI * (rx + ry) * 1.2;
  } else {
    // bracket
    const b = Math.min(18, w * 0.12);
    d1 = `M ${b} 3 L 4 ${3 + j(1, 2)} L 4 ${ht - 3 + j(2, 2)} L ${b} ${ht - 3}`;
    d2 = `M ${w - b} 3 L ${w - 4} ${3 + j(3, 2)} L ${w - 4} ${ht - 3 + j(4, 2)} L ${w - b} ${ht - 3}`;
    approxLen = ht + b * 2;
  }

  const dashOffset = approxLen * (1 - p);

  return (
    <svg
      width={w}
      height={ht}
      viewBox={`0 0 ${w} ${ht}`}
      style={{ position: "relative", overflow: "visible", pointerEvents: "none", ...style }}
    >
      <path
        d={d1}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={approxLen}
        strokeDashoffset={dashOffset}
      />
      {d2 && (
        <path
          d={d2}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(1.5, strokeWidth * 0.65)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.65}
          strokeDasharray={approxLen}
          strokeDashoffset={dashOffset}
        />
      )}
    </svg>
  );
};
