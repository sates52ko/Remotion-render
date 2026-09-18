import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Theme } from '../../themes';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MapPoint {
    time: number;           // seconds — when this point activates
    locationName: string;
    x: number;             // 0-100 percentage
    y: number;             // 0-100 percentage
}

interface MapJourneyProps {
    points: MapPoint[];
    theme: Theme;
    showFrom: number;       // seconds — when the map first appears
    showUntil: number;      // seconds — when the map disappears
    variant?: 'dots' | 'path' | 'radar';
}

// ── Component ─────────────────────────────────────────────────────────────────

export const MapJourney: React.FC<MapJourneyProps> = ({
    points,
    theme,
    showFrom,
    showUntil,
    variant = 'path',
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    if (currentTime < showFrom || currentTime > showUntil) return null;

    const localFrame = (currentTime - showFrom) * fps;
    const totalFrames = (showUntil - showFrom) * fps;

    // Container entrance
    const containerOpacity = interpolate(
        localFrame,
        [0, fps * 0.5, totalFrames - fps * 0.5, totalFrames],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const containerScale = spring({
        frame: localFrame,
        fps,
        from: 0.7,
        to: 1,
        config: { damping: 18, stiffness: 100 },
    });

    // Active points (ones whose time has passed)
    const activePoints = points.filter(p => currentTime >= p.time);
    const currentPointIndex = activePoints.length - 1;

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 81000 }}>
            <div style={{
                position: 'absolute',
                bottom: '5%',
                left: '5%',
                width: 380,
                height: 260,
                opacity: containerOpacity,
                transform: `scale(${containerScale})`,
            }}>
                {/* Glass card background */}
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.55)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${theme.text.accent}25`,
                    borderRadius: 16,
                    overflow: 'hidden',
                }}>
                    {/* Grid lines */}
                    <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.08 }}>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <React.Fragment key={`grid-${i}`}>
                                <line
                                    x1={`${(i + 1) * 12.5}%`} y1="0"
                                    x2={`${(i + 1) * 12.5}%`} y2="100%"
                                    stroke={theme.text.primary}
                                    strokeWidth={0.5}
                                />
                                <line
                                    x1="0" y1={`${(i + 1) * 12.5}%`}
                                    x2="100%" y2={`${(i + 1) * 12.5}%`}
                                    stroke={theme.text.primary}
                                    strokeWidth={0.5}
                                />
                            </React.Fragment>
                        ))}
                    </svg>
                </div>

                {/* SVG for paths and points */}
                <svg
                    width={380}
                    height={260}
                    style={{ position: 'absolute', top: 0, left: 0 }}
                >
                    {/* Connection lines */}
                    {variant === 'path' && activePoints.map((p, idx) => {
                        if (idx === 0) return null;
                        const prev = activePoints[idx - 1];
                        const lineProgress = interpolate(
                            currentTime,
                            [p.time - 0.5, p.time + 0.5],
                            [0, 1],
                            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                        );

                        const x1 = (prev.x / 100) * 380;
                        const y1 = (prev.y / 100) * 260;
                        const x2 = x1 + ((p.x / 100) * 380 - x1) * lineProgress;
                        const y2 = y1 + ((p.y / 100) * 260 - y1) * lineProgress;

                        return (
                            <line
                                key={`line-${idx}`}
                                x1={x1} y1={y1}
                                x2={x2} y2={y2}
                                stroke={theme.text.accent}
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                opacity={0.7}
                            />
                        );
                    })}

                    {/* Point dots */}
                    {activePoints.map((p, idx) => {
                        const px = (p.x / 100) * 380;
                        const py = (p.y / 100) * 260;
                        const isLatest = idx === currentPointIndex;

                        const dotScale = spring({
                            frame: Math.max(0, (currentTime - p.time) * fps),
                            fps,
                            from: 0,
                            to: 1,
                            config: { damping: 10, stiffness: 200 },
                        });

                        const pulseSize = isLatest
                            ? 8 + Math.sin(frame * 0.15) * 4
                            : 0;

                        return (
                            <React.Fragment key={`point-${idx}`}>
                                {/* Pulse ring for latest point */}
                                {isLatest && (
                                    <circle
                                        cx={px} cy={py}
                                        r={pulseSize + 6}
                                        fill="none"
                                        stroke={theme.text.accent}
                                        strokeWidth={1.5}
                                        opacity={0.4}
                                    />
                                )}
                                {/* Dot */}
                                <circle
                                    cx={px} cy={py}
                                    r={isLatest ? 6 : 4}
                                    fill={isLatest ? theme.text.accent : theme.text.primary}
                                    opacity={dotScale}
                                    style={{ filter: isLatest ? `drop-shadow(0 0 6px ${theme.effects.glowColor})` : undefined }}
                                />
                            </React.Fragment>
                        );
                    })}
                </svg>

                {/* Location name label (for current point) */}
                {activePoints.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: 10,
                        left: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: theme.text.accent,
                            boxShadow: `0 0 8px ${theme.effects.glowColor}`,
                        }} />
                        <span style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: theme.text.accent,
                            fontFamily: "'Inter', sans-serif",
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                        }}>
                            {activePoints[currentPointIndex].locationName}
                        </span>
                    </div>
                )}

                {/* Progress dots at bottom */}
                <div style={{
                    position: 'absolute',
                    bottom: 10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 6,
                }}>
                    {points.map((_, idx) => (
                        <div
                            key={`dot-${idx}`}
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: idx <= currentPointIndex
                                    ? theme.text.accent
                                    : 'rgba(255,255,255,0.2)',
                                transition: 'background 0.3s',
                            }}
                        />
                    ))}
                </div>
            </div>
        </AbsoluteFill>
    );
};
