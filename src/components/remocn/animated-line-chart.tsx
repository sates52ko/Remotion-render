import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface AnimatedLineChartProps {
  data?: number[];
  labels?: string[];
  title?: string;
  subtitle?: string;
  width?: number;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  gridColor?: string;
  textColor?: string;
  showDot?: boolean;
  speed?: number;
  className?: string;
}

export function AnimatedLineChart({
  data = [1, 2, 4, 8, 15, 27, 45, 78, 130],
  labels = ["Day 1", "Day 30", "Day 60", "Day 90", "Day 180", "Day 365"],
  title,
  subtitle,
  width = 960,
  height = 480,
  strokeColor = "#059669",
  strokeWidth = 6,
  gridColor = "rgba(30,42,36,0.12)",
  textColor = "#1E2A24",
  showDot = true,
  speed = 1,
  className,
}: AnimatedLineChartProps) {
  const frame = useCurrentFrame() * speed;
  const { fps, durationInFrames } = useVideoConfig();

  const paddingLeft = 70;
  const paddingRight = 40;
  const paddingTop = title ? 80 : 40;
  const paddingBottom = labels.length ? 60 : 40;

  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = paddingLeft + (index / (data.length - 1)) * innerWidth;
    const y = paddingTop + innerHeight - ((value - min) / range) * innerHeight;
    return { x, y };
  });

  let pathLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    pathLength += Math.hypot(dx, dy);
  }

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  const progress = spring({
    frame,
    fps,
    durationInFrames: Math.round(durationInFrames * 0.75),
    config: { damping: 24 },
  });

  const dashOffset = pathLength * (1 - progress);

  const targetLen = pathLength * progress;
  let traveled = 0;
  let dotX = points[0].x;
  let dotY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segLen = Math.hypot(dx, dy);
    if (traveled + segLen >= targetLen) {
      const t = (targetLen - traveled) / segLen;
      dotX = points[i - 1].x + dx * t;
      dotY = points[i - 1].y + dy * t;
      break;
    }
    traveled += segLen;
    dotX = points[i].x;
    dotY = points[i].y;
  }

  const gridRows = 4;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width,
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: "visible" }}
      >
        {/* Title & Subtitle */}
        {title ? (
          <text
            x={paddingLeft}
            y={36}
            fill={textColor}
            fontSize={26}
            fontWeight={800}
            letterSpacing="-0.01em"
          >
            {title}
          </text>
        ) : null}
        {subtitle ? (
          <text
            x={paddingLeft}
            y={62}
            fill={textColor}
            opacity={0.6}
            fontSize={17}
            fontWeight={600}
          >
            {subtitle}
          </text>
        ) : null}

        {/* Horizontal grid lines */}
        {Array.from({ length: gridRows + 1 }).map((_, i) => {
          const y = paddingTop + (i / gridRows) * innerHeight;
          const val = Math.round(max - (i / gridRows) * range);
          return (
            <React.Fragment key={`h-${i}`}>
              <line
                x1={paddingLeft}
                x2={paddingLeft + innerWidth}
                y1={y}
                y2={y}
                stroke={gridColor}
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <text
                x={paddingLeft - 14}
                y={y + 5}
                textAnchor="end"
                fill={textColor}
                opacity={0.5}
                fontSize={15}
                fontWeight={600}
              >
                {val}
              </text>
            </React.Fragment>
          );
        })}

        {/* X Axis labels */}
        {labels.map((lbl, idx) => {
          const x = paddingLeft + (idx / (labels.length - 1)) * innerWidth;
          return (
            <text
              key={`lbl-${idx}`}
              x={x}
              y={paddingTop + innerHeight + 28}
              textAnchor={idx === 0 ? "start" : idx === labels.length - 1 ? "end" : "middle"}
              fill={textColor}
              opacity={0.65}
              fontSize={15}
              fontWeight={700}
            >
              {lbl}
            </text>
          );
        })}

        {/* Animated line */}
        <path
          d={d}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={pathLength}
          strokeDashoffset={dashOffset}
        />

        {/* Leading Dot */}
        {showDot && progress > 0 && (
          <circle
            cx={dotX}
            cy={dotY}
            r={strokeWidth * 1.6}
            fill={strokeColor}
            stroke="#F7F5F0"
            strokeWidth={3}
          />
        )}
      </svg>
    </div>
  );
}
