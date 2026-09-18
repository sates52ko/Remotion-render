/**
 * LiquidWave — Animated liquid/fluid wave SVG background
 *
 * Great for: section transitions, animated background overlays,
 *            bottom of screen decorative element
 *
 * Usage:
 *   <LiquidWave />
 *   <LiquidWave color="#6c63ff" opacity={0.4} speed={0.5} waves={3} position="bottom" />
 *
 * Props:
 *   color      — wave fill color (default: '#6c63ff')
 *   opacity    — wave opacity 0-1 (default: 0.35)
 *   speed      — animation speed multiplier (default: 1)
 *   waves      — number of wave layers 1-4 (default: 3)
 *   position   — 'bottom' | 'top' | 'full' (default: 'bottom')
 *   height     — wave area height as % of screen (default: 25)
 *   amplitude  — wave amplitude in px (default: 30)
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

interface LiquidWaveProps {
    color?: string;
    opacity?: number;
    speed?: number;
    waves?: number;
    position?: 'bottom' | 'top' | 'full';
    height?: number;
    amplitude?: number;
}

const generateWavePath = (
    frame: number,
    width: number,
    height: number,
    amplitude: number,
    phase: number,
    speed: number,
    flip: boolean
): string => {
    const t = (frame * speed * 0.03) + phase;
    const points: string[] = [];
    const steps = 20;

    for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * width;
        const y = Math.sin((i / steps) * Math.PI * 4 + t) * amplitude +
            Math.sin((i / steps) * Math.PI * 2 + t * 0.7) * (amplitude * 0.4);
        points.push(`${i === 0 ? 'M' : 'L'}${x},${y + height * 0.4}`);
    }

    const bottom = flip ? -10 : height + 10;
    points.push(`L${width},${bottom} L0,${bottom} Z`);
    return points.join(' ');
};

export const LiquidWave: React.FC<LiquidWaveProps> = ({
    color = '#6c63ff',
    opacity = 0.35,
    speed = 1,
    waves = 3,
    position = 'bottom',
    height: heightPct = 25,
    amplitude = 30,
}) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();

    const waveHeight = height * (heightPct / 100);

    const posStyle: React.CSSProperties =
        position === 'bottom'
            ? { bottom: 0, left: 0, right: 0, height: waveHeight }
            : position === 'top'
                ? { top: 0, left: 0, right: 0, height: waveHeight, transform: 'scaleY(-1)' }
                : { inset: 0, height: '100%' };

    const waveCount = Math.min(4, Math.max(1, waves));

    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', ...posStyle, overflow: 'hidden' }}>
                <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${width} ${waveHeight}`}
                    preserveAspectRatio="none"
                >
                    {Array.from({ length: waveCount }, (_, i) => {
                        const layerOpacity = opacity * (1 - i * 0.2) * (1 / (i * 0.3 + 1));
                        const layerSpeed = speed * (1 - i * 0.15);
                        const phase = i * (Math.PI / waveCount);
                        const path = generateWavePath(frame, width, waveHeight, amplitude * (1 - i * 0.2), phase, layerSpeed, false);
                        return (
                            <path
                                key={i}
                                d={path}
                                fill={color}
                                opacity={layerOpacity}
                            />
                        );
                    })}
                </svg>
            </div>
        </AbsoluteFill>
    );
};
