import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    spring,
} from 'remotion';
import { Theme } from '../../themes';

export interface IntermissionCardData {
    /** Time in seconds when the card appears */
    time: number;
    /** Duration in seconds (default 2) */
    duration?: number;
    /** Text to display */
    text: string;
    /** Card style */
    style?: 'nextUp' | 'keyTakeaway' | 'meanwhile' | 'reflection';
}

interface IntermissionCardProps {
    cards: IntermissionCardData[];
    theme: Theme;
}

const styleConfig: Record<string, { icon: string; label: string }> = {
    nextUp: { icon: '▶', label: 'COMING UP' },
    keyTakeaway: { icon: '🔑', label: 'KEY TAKEAWAY' },
    meanwhile: { icon: '↳', label: 'MEANWHILE' },
    reflection: { icon: '💭', label: 'REFLECTION' },
};

export const IntermissionCard: React.FC<IntermissionCardProps> = ({
    cards,
    theme,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    // Find active card
    const activeCard = cards.find((c) => {
        const duration = c.duration ?? 2;
        return currentTime >= c.time && currentTime < c.time + duration;
    });

    if (!activeCard) return null;

    const duration = activeCard.duration ?? 2;
    const localTime = currentTime - activeCard.time;
    const localFrame = Math.floor(localTime * fps);
    const durationFrames = Math.floor(duration * fps);
    const cardStyle = activeCard.style ?? 'nextUp';
    const config = styleConfig[cardStyle] ?? styleConfig.nextUp;

    // Zoom + fade entry
    const entryProgress = spring({
        frame: localFrame,
        fps,
        config: { damping: 14, stiffness: 150, mass: 0.6 },
    });

    // Exit
    const exitStart = durationFrames - Math.floor(fps * 0.4);
    const exitOpacity = interpolate(localFrame, [exitStart, durationFrames], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

    // Background blur intensity
    const blurAmount = interpolate(entryProgress, [0, 1], [0, 24]);

    // Label bar animation
    const labelWidth = spring({
        frame: Math.max(0, localFrame - Math.floor(fps * 0.15)),
        fps,
        config: { damping: 12, stiffness: 100, mass: 0.5 },
    });

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 85000 }}>
            {/* Full-screen dim */}
            <AbsoluteFill
                style={{
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    backdropFilter: `blur(${blurAmount}px)`,
                    WebkitBackdropFilter: `blur(${blurAmount}px)`,
                    opacity: entryProgress * exitOpacity,
                }}
            />

            {/* Card */}
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: `translate(-50%, -50%) scale(${0.85 + entryProgress * 0.15})`,
                    opacity: entryProgress * exitOpacity,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 16,
                }}
            >
                {/* Label pill */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: `${theme.text.accent}20`,
                        border: `1px solid ${theme.text.accent}44`,
                        borderRadius: 20,
                        padding: '6px 20px',
                        transform: `scaleX(${labelWidth})`,
                    }}
                >
                    <span style={{ fontSize: 14 }}>{config.icon}</span>
                    <span
                        style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 12,
                            fontWeight: 700,
                            color: theme.text.accent,
                            letterSpacing: 3,
                        }}
                    >
                        {config.label}
                    </span>
                </div>

                {/* Main text */}
                <div
                    style={{
                        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                        fontSize: 34,
                        fontWeight: 500,
                        color: theme.text.primary,
                        textAlign: 'center',
                        maxWidth: '65%',
                        lineHeight: 1.5,
                        textShadow: `0 4px 12px rgba(0,0,0,0.6)`,
                    }}
                >
                    {activeCard.text}
                </div>

                {/* Decorative dots */}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                backgroundColor: theme.text.accent,
                                opacity: interpolate(
                                    localFrame,
                                    [fps * (0.3 + i * 0.1), fps * (0.5 + i * 0.1)],
                                    [0, 0.6],
                                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                                ),
                            }}
                        />
                    ))}
                </div>
            </div>
        </AbsoluteFill>
    );
};
