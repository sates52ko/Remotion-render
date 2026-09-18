import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    spring,
} from 'remotion';
import { Theme } from '../../themes';

export interface TypewriterQuoteData {
    startTime: number; // seconds
    endTime: number; // seconds
    text: string;
    attribution?: string; // e.g. "— Chapter 3"
}

interface TypewriterQuoteProps {
    quotes: TypewriterQuoteData[];
    theme: Theme;
    fontSize?: number;
    position?: 'center' | 'top' | 'bottom';
}

export const TypewriterQuote: React.FC<TypewriterQuoteProps> = ({
    quotes,
    theme,
    fontSize = 54,
    position = 'center',
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    const activeQuote = quotes.find(
        (q) => currentTime >= q.startTime && currentTime < q.endTime
    );

    if (!activeQuote) return null;

    const localFrame = Math.floor((currentTime - activeQuote.startTime) * fps);
    const durationFrames = Math.floor((activeQuote.endTime - activeQuote.startTime) * fps);

    // Entry spring
    const entryScale = spring({
        frame: localFrame,
        fps,
        config: { damping: 20, stiffness: 100, mass: 0.6 },
    });

    // Exit fade
    const exitStart = durationFrames - Math.floor(fps * 0.6);
    const exitOpacity = interpolate(localFrame, [exitStart, durationFrames], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

    // Typewriter: characters per second ~25
    const charsPerSecond = 25;
    const startDelay = Math.floor(fps * 0.4); // wait for entry anim
    const charsToShow = Math.floor(
        Math.max(0, (localFrame - startDelay) / fps) * charsPerSecond
    );
    const displayText = activeQuote.text.slice(0, Math.min(charsToShow, activeQuote.text.length));
    const isTyping = charsToShow < activeQuote.text.length;

    // Cursor blink
    const cursorVisible = isTyping || Math.floor(frame * 0.08) % 2 === 0;

    // Attribution fade in (after typing completes)
    const typingEndFrame = startDelay + Math.ceil((activeQuote.text.length / charsPerSecond) * fps);
    const attrOpacity = interpolate(localFrame, [typingEndFrame, typingEndFrame + fps * 0.5], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

    // Position mapping
    const positionStyles: Record<string, React.CSSProperties> = {
        center: { top: '50%', left: '50%', transform: `translate(-50%, -50%) scale(${entryScale})` },
        top: { top: '15%', left: '50%', transform: `translateX(-50%) scale(${entryScale})` },
        bottom: { bottom: '20%', left: '50%', transform: `translateX(-50%) scale(${entryScale})` },
    };

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 80000 }}>
            <div
                style={{
                    position: 'absolute',
                    ...positionStyles[position],
                    opacity: entryScale * exitOpacity,
                    maxWidth: '80%',
                    textAlign: 'center',
                }}
            >
                {/* Glass card container */}
                <div
                    style={{
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        background: 'rgba(0,0,0,0.45)',
                        borderRadius: 16,
                        padding: '28px 40px',
                        border: `1px solid rgba(255,255,255,0.06)`,
                        boxShadow: `0 0 30px ${theme.effects.glowColor}15, inset 0 1px 0 rgba(255,255,255,0.05)`,
                    }}
                >
                    {/* Opening quote mark */}
                    <div
                        style={{
                            fontSize: 56,
                            color: theme.text.accent,
                            opacity: 0.3,
                            lineHeight: 0.5,
                            marginBottom: 8,
                            fontFamily: 'Georgia, serif',
                        }}
                    >
                        "
                    </div>

                    {/* Typewriter text */}
                    <div
                        style={{
                            fontFamily: "'Georgia', 'Times New Roman', serif",
                            fontSize,
                            fontWeight: 400,
                            color: theme.text.primary,
                            lineHeight: 1.6,
                            letterSpacing: 0.3,
                            textShadow: `0 2px 6px rgba(0,0,0,0.4)`,
                            minHeight: fontSize * 1.6 * 2, // Reserve space for 2 lines
                        }}
                    >
                        {displayText}
                        {/* Blinking cursor */}
                        <span
                            style={{
                                color: theme.text.accent,
                                fontWeight: 200,
                                opacity: cursorVisible ? 1 : 0,
                                marginLeft: 2,
                                transition: 'opacity 0.05s',
                            }}
                        >
                            |
                        </span>
                    </div>

                    {/* Attribution */}
                    {activeQuote.attribution && (
                        <div
                            style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: 16,
                                color: theme.text.secondary,
                                marginTop: 16,
                                opacity: attrOpacity,
                                fontStyle: 'italic',
                            }}
                        >
                            — {activeQuote.attribution}
                        </div>
                    )}

                    {/* Bottom accent bar */}
                    <div
                        style={{
                            marginTop: 16,
                            height: 2,
                            background: `linear-gradient(90deg, transparent, ${theme.text.accent}66, transparent)`,
                            borderRadius: 1,
                            width: interpolate(localFrame, [0, fps * 0.8], [0, 100], {
                                extrapolateLeft: 'clamp',
                                extrapolateRight: 'clamp',
                            }) + '%',
                            margin: '16px auto 0',
                        }}
                    />
                </div>
            </div>
        </AbsoluteFill>
    );
};
