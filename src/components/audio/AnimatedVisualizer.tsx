/**
 * AnimatedVisualizer — Always-visible audio visualizer
 *
 * Uses noise2D + sin waves to create a realistic-looking music visualizer
 * WITHOUT depending on audio data loading. Guaranteed to render every frame.
 *
 * Two modes:
 *   'waveform'  — Smooth oscillating waveform line (audiogram style)
 *   'bars'      — Animated frequency spectrum bars (equalizer style)
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { noise2D } from '@remotion/noise';

type VisualizerMode = 'waveform' | 'bars';

interface AnimatedVisualizerProps {
    mode?: VisualizerMode;
    color?: string;
    accentColor?: string;
    barCount?: number;
    height?: number;
    strokeWidth?: number;
    style?: React.CSSProperties;
}

export const AnimatedVisualizer: React.FC<AnimatedVisualizerProps> = ({
    mode = 'bars',
    color = '#ec4899',
    accentColor = '#d53f8c',
    barCount = 64,
    height = 100,
    strokeWidth = 3,
    style,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const time = frame / fps;

    if (mode === 'waveform') {
        return (
            <WaveformVisualizer
                color={color}
                height={height}
                strokeWidth={strokeWidth}
                time={time}
                frame={frame}
                style={style}
            />
        );
    }

    return (
        <BarsVisualizer
            color={color}
            accentColor={accentColor}
            barCount={barCount}
            height={height}
            time={time}
            frame={frame}
            style={style}
        />
    );
};

// ── Waveform Mode ──────────────────────────────────────────────────────────

const WaveformVisualizer: React.FC<{
    color: string;
    height: number;
    strokeWidth: number;
    time: number;
    frame: number;
    style?: React.CSSProperties;
}> = ({ color, height, strokeWidth, time, frame, style }) => {
    const svgWidth = 1200;
    const svgHeight = height;
    const midY = svgHeight / 2;
    const numPoints = 120;

    // Generate smooth waveform using multiple noise layers
    const points: string[] = [];
    for (let i = 0; i <= numPoints; i++) {
        const x = (i / numPoints) * svgWidth;
        const t = i / numPoints;

        // Layer multiple frequencies for organic look
        const wave1 = noise2D('wave1', t * 3, time * 1.5) * 0.5;
        const wave2 = noise2D('wave2', t * 7, time * 2.2) * 0.3;
        const wave3 = Math.sin(t * Math.PI * 6 + time * 4) * 0.15;
        const wave4 = noise2D('wave3', t * 12, time * 3) * 0.1;

        // Envelope: louder in the middle, quieter at edges
        const envelope = Math.sin(t * Math.PI) * 0.8 + 0.2;

        const amplitude = (wave1 + wave2 + wave3 + wave4) * envelope;
        const y = midY + amplitude * midY * 0.85;

        points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }

    const path = points.join(' ');

    // Mirror path
    const mirrorPoints: string[] = [];
    for (let i = 0; i <= numPoints; i++) {
        const x = (i / numPoints) * svgWidth;
        const t = i / numPoints;

        const wave1 = noise2D('wave1', t * 3, time * 1.5) * 0.5;
        const wave2 = noise2D('wave2', t * 7, time * 2.2) * 0.3;
        const wave3 = Math.sin(t * Math.PI * 6 + time * 4) * 0.15;
        const wave4 = noise2D('wave3', t * 12, time * 3) * 0.1;
        const envelope = Math.sin(t * Math.PI) * 0.8 + 0.2;

        const amplitude = (wave1 + wave2 + wave3 + wave4) * envelope;
        const y = midY - amplitude * midY * 0.85;

        mirrorPoints.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    const mirrorPath = mirrorPoints.join(' ');

    return (
        <div style={{ width: '100%', height, ...style }}>
            <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                width="100%"
                height="100%"
                style={{ display: 'block' }}
            >
                {/* Glow filter */}
                <defs>
                    <filter id="waveGlow">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Main wave */}
                <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#waveGlow)"
                />

                {/* Mirror wave */}
                <path
                    d={mirrorPath}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.5}
                    filter="url(#waveGlow)"
                />

                {/* Center line */}
                <line
                    x1={0} y1={midY}
                    x2={svgWidth} y2={midY}
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.15}
                />
            </svg>
        </div>
    );
};

// ── Bars Mode ──────────────────────────────────────────────────────────────

const BarsVisualizer: React.FC<{
    color: string;
    accentColor: string;
    barCount: number;
    height: number;
    time: number;
    frame: number;
    style?: React.CSSProperties;
}> = ({ color, accentColor, barCount, height, time, frame, style }) => {
    const barWidth = 100 / barCount;
    const gap = barWidth * 0.15;

    const bars = [];
    for (let i = 0; i < barCount; i++) {
        const t = i / barCount;

        // Multiple noise layers for organic beat-reactive look
        const n1 = noise2D('bar1', t * 4, time * 2) * 0.4;
        const n2 = noise2D('bar2', t * 8, time * 3.5) * 0.3;
        const n3 = Math.sin(t * Math.PI * 4 + time * 5) * 0.2;
        const pulse = Math.sin(time * Math.PI * 2) * 0.1;

        // Frequency distribution: more energy in low/mid frequencies
        const freqWeight = t < 0.3 ? 1.0 : t < 0.6 ? 0.8 : 0.5;

        const value = Math.max(0.05, Math.min(1, (n1 + n2 + n3 + pulse) * freqWeight + 0.3));
        const barHeightPct = value * 100;
        const isAccent = value > 0.7;
        const barColor = isAccent ? accentColor : color;

        // Mirror style
        bars.push(
            <div
                key={i}
                style={{
                    width: `${barWidth - gap}%`,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: `${gap}%`,
                }}
            >
                <div style={{
                    width: '100%',
                    height: `${barHeightPct / 2}%`,
                    background: `linear-gradient(to top, ${barColor}, ${accentColor}88)`,
                    borderRadius: '3px 3px 0 0',
                    marginBottom: 1,
                    boxShadow: isAccent ? `0 0 6px ${accentColor}66` : 'none',
                }} />
                <div style={{
                    width: '100%',
                    height: `${barHeightPct / 2}%`,
                    background: `linear-gradient(to bottom, ${barColor}, ${barColor}44)`,
                    borderRadius: '0 0 3px 3px',
                    opacity: 0.5,
                }} />
            </div>
        );
    }

    return (
        <div
            style={{
                width: '100%',
                height,
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                ...style,
            }}
        >
            {bars}
        </div>
    );
};
