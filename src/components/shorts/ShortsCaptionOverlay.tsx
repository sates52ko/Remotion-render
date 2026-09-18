import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    spring,
} from 'remotion';

// ── Caption Style Library ─────────────────────────────────────

export type ShortsCaptionStyle = 'pop' | 'typewriter' | 'highlight' | 'burn-in' | 'split';

export const ALL_CAPTION_STYLES: ShortsCaptionStyle[] = [
    'pop', 'typewriter', 'highlight', 'burn-in', 'split',
];

export function pickCaptionStyle(seed: string): ShortsCaptionStyle {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return ALL_CAPTION_STYLES[Math.abs(hash + 7) % ALL_CAPTION_STYLES.length];
}

// ── Props ─────────────────────────────────────────────────────

interface ShortsCaptionOverlayProps {
    /** The caption text to display */
    text: string;
    /** Visual style of the caption animation */
    style?: ShortsCaptionStyle;
    /** Accent color for highlights */
    accentColor?: string;
    /** Font family override */
    fontFamily?: string;
    /** Position: 'top', 'center', 'bottom' */
    position?: 'top' | 'center' | 'bottom';
    /** Font size in px */
    fontSize?: number;
}

// ── Component ─────────────────────────────────────────────────

export const ShortsCaptionOverlay: React.FC<ShortsCaptionOverlayProps> = ({
    text,
    style = 'pop',
    accentColor = '#f59e0b',
    fontFamily = "'Inter', 'Montserrat', sans-serif",
    position = 'center',
    fontSize = 42,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    if (!text) return null;

    const words = text.split(/\s+/).filter(Boolean);
    const totalDuration = words.length * 0.15 + 1; // stagger + hold time

    // Position mapping
    const positionStyle: React.CSSProperties = {
        top: position === 'top' ? '8%' : position === 'center' ? '35%' : undefined,
        bottom: position === 'bottom' ? '18%' : undefined,
    };

    return (
        <AbsoluteFill
            style={{
                pointerEvents: 'none',
                zIndex: 50,
                display: 'flex',
                alignItems: position === 'center' ? 'center' : undefined,
                justifyContent: 'center',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    ...positionStyle,
                    left: '5%',
                    right: '5%',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: '6px 10px',
                }}
            >
                {words.map((word, i) => (
                    <CaptionWord
                        key={`${word}-${i}`}
                        word={word}
                        index={i}
                        totalWords={words.length}
                        style={style}
                        accentColor={accentColor}
                        fontFamily={fontFamily}
                        fontSize={fontSize}
                        fps={fps}
                        frame={frame}
                    />
                ))}
            </div>
        </AbsoluteFill>
    );
};

// ── Individual Word Component ─────────────────────────────────

interface CaptionWordProps {
    word: string;
    index: number;
    totalWords: number;
    style: ShortsCaptionStyle;
    accentColor: string;
    fontFamily: string;
    fontSize: number;
    fps: number;
    frame: number;
}

const CaptionWord: React.FC<CaptionWordProps> = ({
    word,
    index,
    totalWords,
    style,
    accentColor,
    fontFamily,
    fontSize,
    fps,
    frame,
}) => {
    // Each word appears with a stagger delay
    const staggerDelay = Math.floor(index * fps * 0.12);
    const localFrame = Math.max(0, frame - staggerDelay);

    // Exit: fade out in last 0.5s of the segment
    // (The Sequence wrapper controls the total segment duration)

    // Common entrance spring
    const enterSpring = spring({
        frame: localFrame,
        fps,
        config: { damping: 14, stiffness: 180, mass: 0.8 },
    });

    // Emphasis: first word, last word, and CAPS words get accent color
    const isEmphasis = index === 0 || index === totalWords - 1 || word === word.toUpperCase() && word.length > 1;

    switch (style) {
        case 'pop': {
            const scale = interpolate(enterSpring, [0, 1], [0.3, 1]);
            return (
                <span
                    style={{
                        fontFamily,
                        fontSize,
                        fontWeight: 900,
                        color: isEmphasis ? accentColor : '#ffffff',
                        textShadow: `0 2px 12px rgba(0,0,0,0.8), 0 0 20px ${isEmphasis ? accentColor + '60' : 'transparent'}`,
                        transform: `scale(${scale})`,
                        opacity: enterSpring,
                        display: 'inline-block',
                    }}
                >
                    {word}
                </span>
            );
        }

        case 'typewriter': {
            // Letters appear one by one
            const charsVisible = Math.floor(interpolate(
                localFrame,
                [0, Math.max(1, word.length) * 2],
                [0, word.length],
                { extrapolateRight: 'clamp' }
            ));
            const visibleText = word.slice(0, charsVisible);
            const cursor = charsVisible < word.length ? '|' : '';
            return (
                <span
                    style={{
                        fontFamily: "'Courier New', monospace",
                        fontSize: fontSize * 0.9,
                        fontWeight: 700,
                        color: isEmphasis ? accentColor : '#ffffff',
                        textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                        display: 'inline-block',
                    }}
                >
                    {visibleText}
                    <span style={{ opacity: 0.5, color: accentColor }}>{cursor}</span>
                </span>
            );
        }

        case 'highlight': {
            // Word pops in, then a highlight box slides behind it
            const bgWidth = interpolate(enterSpring, [0, 1], [0, 100]);
            return (
                <span
                    style={{
                        fontFamily,
                        fontSize,
                        fontWeight: 800,
                        color: '#ffffff',
                        position: 'relative',
                        display: 'inline-block',
                        opacity: enterSpring,
                        textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                    }}
                >
                    {/* Highlight background */}
                    {isEmphasis && (
                        <span
                            style={{
                                position: 'absolute',
                                left: -4,
                                right: -4,
                                top: -2,
                                bottom: -2,
                                background: accentColor,
                                borderRadius: 6,
                                width: `${bgWidth}%`,
                                opacity: 0.85,
                                zIndex: -1,
                            }}
                        />
                    )}
                    {word}
                </span>
            );
        }

        case 'burn-in': {
            // Cinematic fade-in with slight Y translate
            const yOffset = interpolate(enterSpring, [0, 1], [30, 0]);
            return (
                <span
                    style={{
                        fontFamily,
                        fontSize: fontSize * 1.1,
                        fontWeight: 900,
                        color: isEmphasis ? accentColor : '#ffffff',
                        textTransform: 'uppercase',
                        letterSpacing: 3,
                        textShadow: `0 4px 20px rgba(0,0,0,0.9), 0 0 40px ${accentColor}30`,
                        transform: `translateY(${yOffset}px)`,
                        opacity: enterSpring,
                        display: 'inline-block',
                    }}
                >
                    {word}
                </span>
            );
        }

        case 'split': {
            // Words alternate between top-left and bottom-right with bounce
            const isEven = index % 2 === 0;
            const bounceScale = spring({
                frame: localFrame,
                fps,
                config: { damping: 10, stiffness: 200, mass: 0.6 },
            });
            return (
                <span
                    style={{
                        fontFamily,
                        fontSize: fontSize * 1.05,
                        fontWeight: 900,
                        color: isEven ? '#ffffff' : accentColor,
                        textShadow: `0 2px 16px rgba(0,0,0,0.8)`,
                        transform: `scale(${bounceScale}) rotate(${isEven ? -2 : 2}deg)`,
                        opacity: enterSpring,
                        display: 'inline-block',
                    }}
                >
                    {word}
                </span>
            );
        }

        default:
            return <span style={{ fontFamily, fontSize, color: '#fff' }}>{word}</span>;
    }
};
