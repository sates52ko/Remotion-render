import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    spring,
} from 'remotion';
import { Theme } from '../../themes';

export interface ChapterCardData {
    startTime: number; // seconds
    endTime: number; // seconds
    text: string;
    subtitle?: string;
    type: 'quote' | 'chapter' | 'insight' | 'keypoint';
}

interface ChapterCardProps {
    cards: ChapterCardData[];
    theme: Theme;
    seed?: number;
}

const CardContent: React.FC<{
    card: ChapterCardData;
    theme: Theme;
    localFrame: number;
    durationFrames: number;
    fps: number;
    seed?: number;
    index: number;
}> = ({ card, theme, localFrame, durationFrames, fps, seed, index }) => {
    // Deterministic visual variation based on seed + index
    const displacementX = seed ? (hashString(`${seed}-card-x-${index}`) % 6) - 3 : 0;
    const displacementY = seed ? (hashString(`${seed}-card-y-${index}`) % 6) - 3 : 0;
    const rotation = seed ? (hashString(`${seed}-card-rot-${index}`) % 4) - 2 : 0;

    // Entry animation (spring scale + fade)
    const entryProgress = spring({
        frame: localFrame,
        fps,
        config: { damping: 15, stiffness: 120, mass: 0.8 },
    });

    // Exit animation (last 0.5s)
    const exitStart = durationFrames - Math.floor(fps * 0.5);
    const exitOpacity = interpolate(localFrame, [exitStart, durationFrames], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

    // Typewriter effect for text
    const charsToShow = Math.floor(
        interpolate(localFrame, [Math.floor(fps * 0.3), Math.floor(fps * 1.5)], [0, card.text.length], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
        })
    );
    const displayText = card.text.slice(0, charsToShow);

    // Style variations per type
    const typeStyles: Record<string, React.CSSProperties> = {
        quote: {
            borderLeft: `4px solid ${theme.text.accent}`,
            paddingLeft: 24,
            fontStyle: 'italic',
        },
        chapter: {
            borderBottom: `3px solid ${theme.text.accent}`,
            paddingBottom: 12,
            textTransform: 'uppercase' as const,
            letterSpacing: 4,
        },
        insight: {
            background: `linear-gradient(135deg, ${theme.text.accent}22, ${theme.text.accent}08)`,
            borderRadius: 16,
            padding: '20px 28px',
            border: `1px solid ${theme.text.accent}33`,
        },
        keypoint: {
            background: `linear-gradient(90deg, ${theme.text.accent}15, transparent)`,
            borderLeft: `3px solid ${theme.text.accent}`,
            paddingLeft: 20,
            borderRadius: '0 12px 12px 0',
        },
    };

    // Icon per type
    const typeIcons: Record<string, string> = {
        quote: '❝',
        chapter: '📖',
        insight: '💡',
        keypoint: '🔑',
    };

    return (
        <div
            style={{
                position: 'absolute',
                top: `${50 + displacementY}%`,
                left: `${50 + displacementX}%`,
                transform: `translate(-50%, -50%) scale(${entryProgress}) rotate(${rotation}deg)`,
                opacity: entryProgress * exitOpacity,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                maxWidth: '85%',
                textAlign: 'center',
            }}
        >
            {/* Backdrop blur card */}
            <div
                style={{
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    background: `linear-gradient(145deg, rgba(0,0,0,0.6), rgba(0,0,0,0.3))`,
                    borderRadius: 20,
                    padding: '32px 48px',
                    boxShadow: `0 0 40px ${theme.effects.glowColor}22, 0 8px 32px rgba(0,0,0,0.5)`,
                    border: `1px solid rgba(255,255,255,0.08)`,
                    ...typeStyles[card.type],
                }}
            >
                {/* Icon */}
                <div
                    style={{
                        fontSize: card.type === 'quote' ? 48 : 32,
                        marginBottom: 8,
                        opacity: 0.8,
                        filter: `drop-shadow(0 0 8px ${theme.effects.glowColor})`,
                    }}
                >
                    {typeIcons[card.type]}
                </div>

                {/* Main text */}
                <div
                    style={{
                        fontFamily: card.type === 'quote'
                            ? "'Georgia', 'Times New Roman', serif"
                            : "'Inter', 'Helvetica Neue', sans-serif",
                        fontSize: card.type === 'chapter' ? 54 : 48,
                        fontWeight: card.type === 'chapter' ? 800 : 500,
                        color: theme.text.primary,
                        lineHeight: 1.3,
                        textShadow: `0 4px 12px rgba(0,0,0,0.6)`,
                    }}
                >
                    {displayText}
                    {charsToShow < card.text.length && (
                        <span
                            style={{
                                color: theme.text.accent,
                                animation: 'blink 0.5s infinite',
                                fontWeight: 100,
                            }}
                        >
                            |
                        </span>
                    )}
                </div>

                {/* Subtitle */}
                {card.subtitle && (
                    <div
                        style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 18,
                            color: theme.text.secondary,
                            marginTop: 8,
                            opacity: interpolate(localFrame, [fps * 0.8, fps * 1.2], [0, 1], {
                                extrapolateLeft: 'clamp',
                                extrapolateRight: 'clamp',
                            }),
                        }}
                    >
                        — {card.subtitle}
                    </div>
                )}
            </div>

            {/* Bottom accent line */}
            <div
                style={{
                    width: interpolate(localFrame, [fps * 0.2, fps * 0.8], [0, 200], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    }),
                    height: 2,
                    background: `linear-gradient(90deg, transparent, ${theme.text.accent}, transparent)`,
                    borderRadius: 1,
                }}
            />
        </div>
    );
};

// Simple fast hash (djb2) for internal variety
function hashString(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
        h = h >>> 0;
    }
    return h;
}

export const ChapterCard: React.FC<ChapterCardProps> = ({ cards, theme, seed }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    // Find the active card at this time
    const activeCardIndex = cards.findIndex(
        (c) => currentTime >= c.startTime && currentTime < c.endTime
    );
    const activeCard = cards[activeCardIndex];

    if (!activeCard) return null;

    const localFrame = Math.floor((currentTime - activeCard.startTime) * fps);
    const durationFrames = Math.floor((activeCard.endTime - activeCard.startTime) * fps);

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 80000 }}>
            <CardContent
                card={activeCard}
                theme={theme}
                localFrame={localFrame}
                durationFrames={durationFrames}
                fps={fps}
                seed={seed}
                index={activeCardIndex}
            />
        </AbsoluteFill>
    );
};

