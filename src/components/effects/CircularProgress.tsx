/**
 * CircularProgress — Animated circular progress / rating ring
 *
 * Great for: book ratings (4.5/5), chapter completion, score reveals
 *
 * Usage:
 *   <CircularProgress value={85} label="4.3/5" sublabel="Goodreads" />
 *   <CircularProgress value={90} color="#FFE600" duration={60} />
 *
 * Props:
 *   value       — 0-100 target percentage
 *   label       — center text (e.g. "4.5★" or "90%")
 *   sublabel    — smaller text below label
 *   color       — progress arc color (default: '#FFE600')
 *   trackColor  — background ring color (default: 'rgba(255,255,255,0.15)')
 *   size        — diameter in px (default: 200)
 *   strokeWidth — ring thickness (default: 12)
 *   duration    — animation frames to complete (default: 60)
 *   delay       — start delay in seconds (default: 0)
 *   fontSize    — center label font size (default: 48)
 */
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface CircularProgressProps {
    value?: number;
    label?: string;
    sublabel?: string;
    color?: string;
    trackColor?: string;
    size?: number;
    strokeWidth?: number;
    duration?: number;
    delay?: number;
    fontSize?: number;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
    value = 75,
    label,
    sublabel,
    color = '#FFE600',
    trackColor = 'rgba(255,255,255,0.15)',
    size = 200,
    strokeWidth = 12,
    duration = 60,
    delay = 0,
    fontSize = 48,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const delayFrames = Math.round(delay * fps);
    const adjusted = Math.max(0, frame - delayFrames);

    const progress = spring({
        frame: adjusted,
        fps,
        config: { damping: 20, stiffness: 80, mass: 1 },
    });

    const animatedValue = interpolate(progress, [0, 1], [0, value], {
        extrapolateRight: 'clamp',
    });

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (animatedValue / 100) * circumference;
    const center = size / 2;

    const displayLabel = label ?? `${Math.round(animatedValue)}%`;

    return (
        <div style={{ display: 'inline-block', position: 'relative', width: size, height: size }}>
            <svg width={size} height={size}>
                {/* Track */}
                <circle
                    cx={center} cy={center} r={radius}
                    fill="none" stroke={trackColor} strokeWidth={strokeWidth}
                />
                {/* Progress arc */}
                <circle
                    cx={center} cy={center} r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    transform={`rotate(-90 ${center} ${center})`}
                    style={{ filter: `drop-shadow(0 0 8px ${color}88)` }}
                />
            </svg>
            {/* Center label */}
            <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
            }}>
                <span style={{
                    fontSize, fontWeight: 900, color: '#fff',
                    fontFamily: "Inter, 'Segoe UI', sans-serif",
                    lineHeight: 1,
                }}>
                    {displayLabel}
                </span>
                {sublabel && (
                    <span style={{
                        fontSize: fontSize * 0.42, fontWeight: 400,
                        color: 'rgba(255,255,255,0.65)',
                        fontFamily: "Inter, 'Segoe UI', sans-serif",
                        marginTop: 4,
                    }}>
                        {sublabel}
                    </span>
                )}
            </div>
        </div>
    );
};
