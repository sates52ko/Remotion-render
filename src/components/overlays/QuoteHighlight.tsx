import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Theme } from '../../themes';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuoteHighlightData {
    startTime: number;   // seconds
    endTime: number;     // seconds
    text: string;
    attribution?: string; // e.g. "— Chapter 3"
    variant?: 'glass' | 'minimal' | 'elegant' | 'neon';
}

interface QuoteHighlightProps {
    quotes: QuoteHighlightData[];
    theme: Theme;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const QuoteHighlight: React.FC<QuoteHighlightProps> = ({ quotes, theme }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 82000 }}>
            {quotes.map((q, i) => {
                if (currentTime < q.startTime || currentTime > q.endTime) return null;

                const duration = q.endTime - q.startTime;
                const localFrame = (currentTime - q.startTime) * fps;
                const totalFrames = duration * fps;

                // Spring entrance
                const slideUp = spring({
                    frame: localFrame,
                    fps,
                    from: 40,
                    to: 0,
                    config: { damping: 15, stiffness: 120 },
                });

                const fadeIn = spring({
                    frame: localFrame,
                    fps,
                    from: 0,
                    to: 1,
                    config: { damping: 20, stiffness: 100 },
                });

                // Fade out
                const fadeOut = interpolate(
                    localFrame,
                    [totalFrames * 0.75, totalFrames],
                    [1, 0],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );

                // Line reveal animation
                const lineWidth = interpolate(
                    localFrame,
                    [fps * 0.2, fps * 0.8],
                    [0, 100],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );

                const variant = q.variant || 'glass';

                const variantStyles: Record<string, React.CSSProperties> = {
                    glass: {
                        background: 'rgba(0, 0, 0, 0.45)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: `1px solid rgba(255, 255, 255, 0.12)`,
                        borderRadius: 20,
                    },
                    minimal: {
                        background: 'transparent',
                        borderLeft: `4px solid ${theme.text.accent}`,
                        borderRadius: 0,
                        paddingLeft: 30,
                    },
                    elegant: {
                        background: `linear-gradient(135deg, rgba(0,0,0,0.6), rgba(0,0,0,0.3))`,
                        border: `2px solid ${theme.text.accent}40`,
                        borderRadius: 16,
                        boxShadow: `0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
                    },
                    neon: {
                        background: 'rgba(0, 0, 0, 0.7)',
                        border: `2px solid ${theme.text.accent}`,
                        borderRadius: 12,
                        boxShadow: `0 0 20px ${theme.text.accent}40, inset 0 0 20px ${theme.text.accent}10`,
                    },
                };

                return (
                    <div
                        key={`quote-${i}`}
                        style={{
                            position: 'absolute',
                            bottom: '18%',
                            left: '50%',
                            transform: `translateX(-50%) translateY(${slideUp}px)`,
                            width: '70%',
                            maxWidth: 900,
                            padding: '36px 44px',
                            opacity: fadeIn * fadeOut,
                            ...variantStyles[variant],
                        }}
                    >
                        {/* Decorative top line */}
                        <div style={{
                            position: 'absolute',
                            top: -1,
                            left: '10%',
                            width: `${lineWidth * 0.8}%`,
                            height: 3,
                            background: `linear-gradient(90deg, transparent, ${theme.text.accent}, transparent)`,
                            borderRadius: 2,
                        }} />

                        {/* Opening quote mark */}
                        <div style={{
                            position: 'absolute',
                            top: -20,
                            left: 20,
                            fontSize: 80,
                            fontFamily: 'Georgia, serif',
                            color: theme.text.accent,
                            opacity: 0.4,
                            lineHeight: 1,
                        }}>
                            "
                        </div>

                        {/* Quote text */}
                        <p style={{
                            margin: 0,
                            fontSize: 28,
                            fontFamily: "'Georgia', 'Playfair Display', serif",
                            fontStyle: 'italic',
                            color: theme.text.primary,
                            lineHeight: 1.6,
                            letterSpacing: '0.01em',
                            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }}>
                            {q.text}
                        </p>

                        {/* Attribution */}
                        {q.attribution && (
                            <p style={{
                                margin: '16px 0 0 0',
                                fontSize: 18,
                                fontFamily: "'Inter', sans-serif",
                                color: theme.text.accent,
                                opacity: 0.8,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                            }}>
                                {q.attribution}
                            </p>
                        )}
                    </div>
                );
            })}
        </AbsoluteFill>
    );
};
