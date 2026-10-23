import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Theme } from '../../themes';
import { OverlayJitter } from './OverlayJitter';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DataVizItem {
    startTime: number;   // seconds
    endTime: number;     // seconds
    label: string;       // e.g. "Weeks on NYT Bestseller"
    value: number;       // e.g. 52
    unit?: string;       // e.g. "weeks", "#1", "%"
    icon?: string;       // emoji
    variant?: 'counter' | 'ring' | 'bar';
}

interface DataVizOverlayProps {
    items: DataVizItem[];
    theme: Theme;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const DataVizOverlay: React.FC<DataVizOverlayProps> = ({ items, theme }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 83000 }}>
            {items.map((item, i) => {
                if (currentTime < item.startTime || currentTime > item.endTime) return null;

                const duration = item.endTime - item.startTime;
                const localFrame = (currentTime - item.startTime) * fps;
                const totalFrames = duration * fps;

                // Spring entrance
                const enterScale = spring({
                    frame: localFrame,
                    fps,
                    from: 0.3,
                    to: 1,
                    config: { damping: 14, stiffness: 150 },
                });

                const enterOpacity = spring({
                    frame: localFrame,
                    fps,
                    from: 0,
                    to: 1,
                    config: { damping: 20, stiffness: 100 },
                });

                // Animated counter
                const counterProgress = interpolate(
                    localFrame,
                    [fps * 0.3, fps * 1.5],
                    [0, 1],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );
                const displayValue = Math.round(item.value * counterProgress);

                // Fade out
                const fadeOut = interpolate(
                    localFrame,
                    [totalFrames * 0.8, totalFrames],
                    [1, 0],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );

                const variant = item.variant || 'counter';

                // Ring progress (for ring variant)
                const ringProgress = counterProgress * (item.value / 100);
                const ringRadius = 55;
                const ringCircumference = 2 * Math.PI * ringRadius;
                const ringDashOffset = ringCircumference * (1 - Math.min(ringProgress, 1));

                return (
                    <div
                        key={`dataviz-${i}`}
                        style={{
                            position: 'absolute',
                            top: '15%',
                            right: '8%',
                            opacity: enterOpacity * fadeOut,
                            transform: `scale(${enterScale})`,
                        }}
                    >
                        <OverlayJitter intensity={0.015}>
                            {/* Glass card */}
                            <div style={{
                                background: 'rgba(0, 0, 0, 0.5)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                border: `1px solid ${theme.text.accent}30`,
                                borderRadius: 20,
                                padding: variant === 'ring' ? '30px 40px' : '24px 36px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 24,
                                boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 20px ${theme.effects.glowColor}15`,
                            }}>
                                {variant === 'ring' && (
                                    <svg width={130} height={130} style={{ flexShrink: 0 }}>
                                        {/* Background ring */}
                                        <circle
                                            cx={65} cy={65} r={ringRadius}
                                            fill="none"
                                            stroke="rgba(255,255,255,0.1)"
                                            strokeWidth={8}
                                        />
                                        {/* Progress ring */}
                                        <circle
                                            cx={65} cy={65} r={ringRadius}
                                            fill="none"
                                            stroke={theme.text.accent}
                                            strokeWidth={8}
                                            strokeLinecap="round"
                                            strokeDasharray={ringCircumference}
                                            strokeDashoffset={ringDashOffset}
                                            transform="rotate(-90, 65, 65)"
                                            style={{ filter: `drop-shadow(0 0 6px ${theme.effects.glowColor})` }}
                                        />
                                        {/* Center value */}
                                        <text
                                            x={65} y={65}
                                            textAnchor="middle"
                                            dominantBaseline="central"
                                            fill={theme.text.primary}
                                            fontSize={28}
                                            fontWeight={800}
                                            fontFamily="Inter, sans-serif"
                                        >
                                            {displayValue}{item.unit || ''}
                                        </text>
                                    </svg>
                                )}

                                {variant !== 'ring' && (
                                    <div style={{ flexShrink: 0, textAlign: 'center' }}>
                                        {item.icon && (
                                            <div style={{ fontSize: 32, marginBottom: 4 }}>{item.icon}</div>
                                        )}
                                        <div style={{
                                            fontSize: 56,
                                            fontWeight: 900,
                                            fontFamily: "'Inter', sans-serif",
                                            color: theme.text.accent,
                                            lineHeight: 1,
                                            textShadow: `0 0 20px ${theme.effects.glowColor}60`,
                                        }}>
                                            {displayValue}{item.unit || ''}
                                        </div>
                                    </div>
                                )}

                                <div style={{ maxWidth: 200 }}>
                                    <div style={{
                                        fontSize: 18,
                                        fontWeight: 600,
                                        color: theme.text.primary,
                                        fontFamily: "'Inter', sans-serif",
                                        lineHeight: 1.3,
                                        opacity: 0.9,
                                    }}>
                                        {item.label}
                                    </div>

                                    {variant === 'bar' && (
                                        <div style={{
                                            marginTop: 10,
                                            width: 180,
                                            height: 6,
                                            borderRadius: 3,
                                            background: 'rgba(255,255,255,0.1)',
                                            overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                width: `${Math.min(counterProgress * 100, 100)}%`,
                                                height: '100%',
                                                background: `linear-gradient(90deg, ${theme.text.accent}, ${theme.effects.glowColor})`,
                                                borderRadius: 3,
                                                boxShadow: `0 0 8px ${theme.effects.glowColor}`,
                                            }} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </OverlayJitter>
                    </div>
                );
            })}
        </AbsoluteFill>
    );
};
