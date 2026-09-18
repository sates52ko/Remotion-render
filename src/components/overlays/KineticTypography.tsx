import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Theme } from '../../themes';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KineticWord {
    startTime: number;   // seconds
    endTime: number;     // seconds
    word: string;
    fontSize?: number;   // px, default 120
    position?: 'center' | 'top' | 'bottom' | 'left' | 'right';
    style?: 'bold' | 'outline' | 'shadow' | 'glow' | 'split';
}

interface KineticTypographyProps {
    words: KineticWord[];
    theme: Theme;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const KineticTypography: React.FC<KineticTypographyProps> = ({ words, theme }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 85000 }}>
            {words.map((w, i) => {
                if (currentTime < w.startTime || currentTime > w.endTime) return null;

                const duration = w.endTime - w.startTime;
                const localFrame = (currentTime - w.startTime) * fps;
                const totalFrames = duration * fps;

                // Spring entrance
                const scaleIn = spring({
                    frame: localFrame,
                    fps,
                    from: 0,
                    to: 1,
                    config: { damping: 12, stiffness: 180, mass: 0.8 },
                });

                // Fade out in last 20%
                const fadeOut = interpolate(
                    localFrame,
                    [totalFrames * 0.8, totalFrames],
                    [1, 0],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );

                // Subtle float
                const float = Math.sin(localFrame * 0.08) * 5;

                const fontSize = w.fontSize || 120;
                const pos = w.position || 'center';
                const style = w.style || 'bold';

                // Position mapping
                const posMap: Record<string, React.CSSProperties> = {
                    center: { top: '50%', left: '50%', transform: `translate(-50%, -50%) scale(${scaleIn}) translateY(${float}px)` },
                    top: { top: '20%', left: '50%', transform: `translateX(-50%) scale(${scaleIn}) translateY(${float}px)` },
                    bottom: { bottom: '25%', left: '50%', transform: `translateX(-50%) scale(${scaleIn}) translateY(${float}px)` },
                    left: { top: '50%', left: '10%', transform: `translateY(-50%) scale(${scaleIn}) translateY(${float}px)` },
                    right: { top: '50%', right: '10%', transform: `translateY(-50%) scale(${scaleIn}) translateY(${float}px)` },
                };

                // Style mapping
                const styleMap: Record<string, React.CSSProperties> = {
                    bold: {
                        color: theme.text.accent,
                        fontWeight: 900,
                        textShadow: `0 4px 20px ${theme.effects.glowColor}80`,
                    },
                    outline: {
                        color: 'transparent',
                        fontWeight: 900,
                        WebkitTextStroke: `3px ${theme.text.accent}`,
                        textShadow: `0 0 30px ${theme.effects.glowColor}60`,
                    },
                    shadow: {
                        color: theme.text.primary,
                        fontWeight: 900,
                        textShadow: `8px 8px 0 ${theme.text.accent}40, 0 0 40px ${theme.effects.glowColor}30`,
                    },
                    glow: {
                        color: theme.text.accent,
                        fontWeight: 900,
                        textShadow: `0 0 20px ${theme.text.accent}, 0 0 60px ${theme.effects.glowColor}, 0 0 100px ${theme.effects.glowColor}60`,
                    },
                    split: {
                        color: theme.text.primary,
                        fontWeight: 900,
                        background: `linear-gradient(180deg, ${theme.text.accent} 50%, ${theme.effects.glowColor} 50%)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    },
                };

                return (
                    <div
                        key={`kinetic-${i}`}
                        style={{
                            position: 'absolute',
                            fontSize,
                            fontFamily: "'Inter', 'Outfit', sans-serif",
                            letterSpacing: '-0.02em',
                            opacity: fadeOut,
                            textAlign: 'center',
                            lineHeight: 1.1,
                            maxWidth: '80%',
                            ...posMap[pos],
                            ...styleMap[style],
                        }}
                    >
                        {w.word}
                    </div>
                );
            })}
        </AbsoluteFill>
    );
};
