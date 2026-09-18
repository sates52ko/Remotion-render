import React from 'react';
import {
    AbsoluteFill,
    interpolate,
    spring,
    useCurrentFrame,
    useVideoConfig,
} from 'remotion';
import { Caption, getActiveWordIndex } from '../utils/srtParser';
import { Theme } from '../themes';

// 10+ Caption Style Presets for YPP compliance
type CaptionStylePreset =
    | 'karaoke'
    | 'neonGlow'
    | 'boxed'
    | 'gradient'
    | 'outline'
    | 'vintage'
    | 'modern'
    | 'bold'
    | 'minimal'
    | 'dramatic'
    | 'elegant'
    | 'tiktok';



const CAPTION_PRESETS: CaptionStylePreset[] = [
    'karaoke', 'neonGlow', 'boxed', 'gradient', 'outline',
    'vintage', 'modern', 'bold', 'minimal', 'dramatic', 'elegant', 'tiktok',
];

interface CaptionStyleConfig {
    bgColor: string;
    textColor: string;
    highlightColor: string;
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    padding: string;
    borderRadius: number;
    textShadow: string;
    boxShadow: string;
    backdropFilter?: string;
    border?: string;
    letterSpacing?: string;
    textTransform?: string;
}

function getPresetStyle(preset: CaptionStylePreset, baseFontSize: number): CaptionStyleConfig {
    switch (preset) {
        case 'neonGlow':
            return {
                bgColor: 'rgba(0, 0, 0, 0.6)',
                textColor: '#00ffff',
                highlightColor: '#ff00ff',
                fontFamily: "'Orbitron', 'Inter', sans-serif",
                fontWeight: 700,
                fontSize: baseFontSize,
                padding: '16px 32px',
                borderRadius: 8,
                textShadow: '0 0 10px #00ffff, 0 0 30px #00ffff, 0 0 60px #0088ff',
                boxShadow: '0 0 20px rgba(0, 255, 255, 0.3), inset 0 0 20px rgba(0, 255, 255, 0.1)',
                border: '1px solid rgba(0, 255, 255, 0.4)',
            };
        case 'boxed':
            return {
                bgColor: 'rgba(20, 20, 20, 0.85)',
                textColor: '#ffffff',
                highlightColor: '#4ecdc4',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: baseFontSize,
                padding: '18px 36px',
                borderRadius: 4,
                textShadow: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                border: '2px solid rgba(255,255,255,0.15)',
            };
        case 'gradient':
            return {
                bgColor: 'linear-gradient(135deg, rgba(102,51,153,0.8), rgba(51,153,204,0.8))',
                textColor: '#ffffff',
                highlightColor: '#ffd700',
                fontFamily: "'Poppins', 'Inter', sans-serif",
                fontWeight: 600,
                fontSize: baseFontSize,
                padding: '20px 40px',
                borderRadius: 16,
                textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                boxShadow: '0 8px 32px rgba(102,51,153,0.4)',
            };
        case 'outline':
            return {
                bgColor: 'transparent',
                textColor: '#ffffff',
                highlightColor: '#ff6b6b',
                fontFamily: "'Montserrat', 'Inter', sans-serif",
                fontWeight: 800,
                fontSize: baseFontSize + 6,
                padding: '10px 20px',
                borderRadius: 0,
                textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 10px rgba(0,0,0,0.8)',
                boxShadow: 'none',
            };
        case 'vintage':
            return {
                bgColor: 'rgba(139, 90, 43, 0.75)',
                textColor: '#ffecd2',
                highlightColor: '#ff9a56',
                fontFamily: "'Playfair Display', Georgia, serif",
                fontWeight: 500,
                fontSize: baseFontSize - 2,
                padding: '20px 40px',
                borderRadius: 4,
                textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 0 40px rgba(139,90,43,0.2)',
                border: '1px solid rgba(255,236,210,0.3)',
            };
        case 'modern':
            return {
                bgColor: 'rgba(255, 255, 255, 0.1)',
                textColor: '#ffffff',
                highlightColor: '#7c3aed',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: baseFontSize,
                padding: '20px 40px',
                borderRadius: 20,
                textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                backdropFilter: 'blur(12px) saturate(1.5)',
                border: '1px solid rgba(255,255,255,0.15)',
            };
        case 'bold':
            return {
                bgColor: 'transparent',
                textColor: '#ffffff',
                highlightColor: '#ffd700',
                fontFamily: "'Impact', 'Arial Black', sans-serif",
                fontWeight: 900,
                fontSize: baseFontSize + 12,
                padding: '10px 20px',
                borderRadius: 0,
                textShadow: '0 4px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.6)',
                boxShadow: 'none',
                letterSpacing: '2px',
                textTransform: 'uppercase',
            };
        case 'minimal':
            return {
                bgColor: 'transparent',
                textColor: 'rgba(255,255,255,0.85)',
                highlightColor: '#ffffff',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 300,
                fontSize: baseFontSize - 6,
                padding: '8px 16px',
                borderRadius: 0,
                textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                boxShadow: 'none',
                letterSpacing: '1px',
            };
        case 'dramatic':
            return {
                bgColor: 'rgba(180, 0, 0, 0.7)',
                textColor: '#ffffff',
                highlightColor: '#ff4444',
                fontFamily: "'Oswald', 'Impact', sans-serif",
                fontWeight: 700,
                fontSize: baseFontSize + 4,
                padding: '16px 36px',
                borderRadius: 2,
                textShadow: '0 2px 10px rgba(180,0,0,0.8)',
                boxShadow: '0 4px 30px rgba(180,0,0,0.5), inset 0 -2px 10px rgba(0,0,0,0.3)',
                letterSpacing: '3px',
                textTransform: 'uppercase',
            };
        case 'elegant':
            return {
                bgColor: 'rgba(0, 0, 0, 0.5)',
                textColor: '#e8d5b7',
                highlightColor: '#ffd700',
                fontFamily: "'Cormorant Garamond', 'Playfair Display', serif",
                fontWeight: 500,
                fontSize: baseFontSize + 2,
                padding: '20px 48px',
                borderRadius: 0,
                textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                boxShadow: 'none',
                border: '1px solid rgba(232,213,183,0.3)',
                letterSpacing: '2px',
            };
        case 'tiktok':
            return {
                bgColor: 'transparent',
                textColor: '#ffffff',
                highlightColor: '#FFE600',
                fontFamily: "'Inter', 'Montserrat', system-ui, sans-serif",
                fontWeight: 800,
                fontSize: baseFontSize,
                padding: '0px',
                borderRadius: 0,
                textShadow:
                    '-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000,' +
                    '-3px 0 0 #000, 3px 0 0 #000, 0 -3px 0 #000, 0 3px 0 #000,' +
                    '0 4px 12px rgba(0,0,0,0.9)',
                boxShadow: 'none',
                letterSpacing: '0.5px',
            };
        case 'karaoke':
        default:
            return {
                bgColor: 'rgba(0, 0, 0, 0.65)',
                textColor: '#cccccc',
                highlightColor: '#ffffff',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontWeight: 500,
                fontSize: baseFontSize,
                padding: '20px 40px',
                borderRadius: 12,
                textShadow: 'none',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            };
    }
}

export interface AnimatedCaptionProps {
    captions: Caption[];
    theme: Theme;
    style?: CaptionStylePreset;
    position?: 'top' | 'center' | 'bottom' | 'bottomBar';
    fontSize?: number;
    offset?: number; // Offset in seconds to sync captions with audio
    maxWordsPerLine?: number; // Max words shown per line (tiktok style)
}

// TikTok word scale animation component
const TikTokWord: React.FC<{
    word: { text: string };
    isActive: boolean;
    isPast: boolean;
    presetStyle: CaptionStyleConfig;
    frame: number;
    fps: number;
    wordStartFrame: number;
}> = ({ word, isActive, isPast, presetStyle, frame, fps, wordStartFrame }) => {
    // Spring scale: punchy pop when word becomes active
    const wordScale = isActive
        ? spring({
            frame: frame - wordStartFrame,
            fps,
            from: 1,
            to: 1.15,
            config: { damping: 9, stiffness: 320, mass: 0.35 },
        })
        : 1;

    // Glow pulse on active word
    const glowPulse = isActive
        ? spring({
            frame: frame - wordStartFrame,
            fps,
            from: 0,
            to: 1,
            config: { damping: 20, stiffness: 200 },
        })
        : 0;

    const color = isActive
        ? presetStyle.highlightColor        // use the dynamic highlight color
        : isPast
            ? 'rgba(255,255,255,0.30)'      // past = more faded
            : presetStyle.textColor;

    const activeShadow = isActive
        ? `0 0 ${12 * glowPulse}px ${presetStyle.highlightColor}, 0 0 ${28 * glowPulse}px ${presetStyle.highlightColor},
           -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000`
        : presetStyle.textShadow;

    return (
        <span
            style={{
                display: 'inline-block',
                color,
                textShadow: activeShadow,
                fontWeight: isActive ? 900 : presetStyle.fontWeight,
                transform: `scale(${wordScale})`,
                transformOrigin: 'bottom center',
                transition: 'color 0.06s',
                whiteSpace: 'nowrap',
            }}
        >
            {word.text}
        </span>
    );
};

export const AnimatedCaption: React.FC<AnimatedCaptionProps> = ({
    captions,
    theme,
    style = 'modern', // Default to a specific single style
    position = 'bottom',
    fontSize = 42,
    offset = 0, // Default no offset
    maxWordsPerLine = 4,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    // FIX: Subtract offset to shift captions later (matching audio delay)
    const currentTime = frame / fps - offset;

    // Find current caption
    const currentCaption = captions.find(
        (c) => currentTime >= c.startTime && currentTime <= c.endTime
    );

    if (!currentCaption) return null;

    // Use the style provided in props, or fallback to karaoke
    const activePreset = CAPTION_PRESETS.includes(style as any) ? (style as CaptionStylePreset) : 'karaoke';
    const presetStyle = getPresetStyle(activePreset, fontSize);

    // Override the preset styles with theme customized colors
    presetStyle.textColor = theme.caption.textColor;
    presetStyle.highlightColor = theme.caption.highlightColor;

    const activeWordIndex = getActiveWordIndex(currentCaption, currentTime);

    const positionStyles: Record<string, React.CSSProperties> = {
        bottom: { bottom: 100, left: 0, right: 0 },
        bottomBar: { bottom: 0, left: 0, right: 0, height: '8%', display: 'flex', alignItems: 'center' }, // New cinematic bar pos
        center: { top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' },
        top: { top: 80, left: 0, right: 0 },
    };

    // Calculate caption fade in/out
    const captionProgress = interpolate(
        currentTime,
        [currentCaption.startTime, currentCaption.startTime + 0.15, currentCaption.endTime - 0.15, currentCaption.endTime],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    // Scale animation for some presets
    const scaleAnim = (activePreset === 'bold' || activePreset === 'dramatic')
        ? interpolate(
            currentTime,
            [currentCaption.startTime, currentCaption.startTime + 0.2],
            [0.85, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        )
        : 1;

    const isGradientBg = presetStyle.bgColor.startsWith('linear-gradient');

    // ── TikTok style: word-by-word with per-word spring animations ──
    if (activePreset === 'tiktok' && currentCaption.words) {
        const words = currentCaption.words;

        // Split words into chunks of maxWordsPerLine for multi-line display
        const chunks: typeof words[] = [];
        for (let i = 0; i < words.length; i += maxWordsPerLine) {
            chunks.push(words.slice(i, i + maxWordsPerLine));
        }
        // Only show the chunk that contains the active word
        const activeChunkIdx = Math.floor(Math.max(0, activeWordIndex) / maxWordsPerLine);
        const visibleChunk = chunks[activeChunkIdx] ?? chunks[0];
        const chunkOffset = activeChunkIdx * maxWordsPerLine;

        return (
            <AbsoluteFill style={{ pointerEvents: 'none' }}>
                <div
                    style={{
                        position: 'absolute',
                        ...positionStyles[position],
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '100%',
                        padding: '0 40px',
                        opacity: captionProgress,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            alignItems: 'baseline',
                            rowGap: '20px',
                            columnGap: '8px',
                            maxWidth: '100%',
                            lineHeight: 1.2,
                            fontSize: presetStyle.fontSize,
                            fontFamily: presetStyle.fontFamily,
                            ...(presetStyle.letterSpacing ? { letterSpacing: presetStyle.letterSpacing } : {}),
                        }}
                    >
                        {visibleChunk.map((word, i) => {
                            const globalIdx = chunkOffset + i;
                            const isActive = globalIdx === activeWordIndex;
                            const isPast = globalIdx < activeWordIndex;
                            // Estimate frame when this word became active
                            const wordStartFrame = word.startTime !== undefined
                                ? Math.round((word.startTime + offset) * fps)
                                : frame;
                            return (
                                <TikTokWord
                                    key={`${globalIdx}-${word.text}`}
                                    word={word}
                                    isActive={isActive}
                                    isPast={isPast}
                                    presetStyle={presetStyle}
                                    frame={frame}
                                    fps={fps}
                                    wordStartFrame={wordStartFrame}
                                />
                            );
                        })}
                    </div>
                </div>
            </AbsoluteFill>
        );
    }

    // ── Default render for all other styles ──
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <div
                style={{
                    position: 'absolute',
                    ...positionStyles[position],
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '0 60px',
                    opacity: captionProgress,
                    transform: `scale(${scaleAnim})`,
                }}
            >
                <div
                    style={{
                        ...(isGradientBg
                            ? { background: presetStyle.bgColor }
                            : { backgroundColor: presetStyle.bgColor }),
                        padding: presetStyle.padding,
                        borderRadius: presetStyle.borderRadius,
                        maxWidth: '80%',
                        boxShadow: presetStyle.boxShadow,
                        ...(presetStyle.backdropFilter
                            ? { backdropFilter: presetStyle.backdropFilter, WebkitBackdropFilter: presetStyle.backdropFilter }
                            : {}),
                        ...(presetStyle.border ? { border: presetStyle.border } : {}),
                    }}
                >
                    <p
                        style={{
                            margin: 0,
                            fontSize: presetStyle.fontSize,
                            fontFamily: presetStyle.fontFamily,
                            fontWeight: presetStyle.fontWeight,
                            lineHeight: 1.5,
                            textAlign: 'center',
                            color: presetStyle.textColor,
                            textShadow: presetStyle.textShadow,
                            ...(presetStyle.letterSpacing ? { letterSpacing: presetStyle.letterSpacing } : {}),
                            ...(presetStyle.textTransform ? { textTransform: presetStyle.textTransform as any } : {}),
                        }}
                    >
                        {currentCaption.words
                            ? currentCaption.words.map((word, i) => (
                                <span
                                    key={i}
                                    style={{
                                        color: i <= activeWordIndex
                                            ? presetStyle.highlightColor
                                            : presetStyle.textColor,
                                        textShadow: i === activeWordIndex
                                            ? (activePreset === 'neonGlow'
                                                ? '0 0 15px #ff00ff, 0 0 40px #ff00ff'
                                                : `0 0 20px ${presetStyle.highlightColor}`)
                                            : presetStyle.textShadow,
                                        transition: 'color 0.1s, text-shadow 0.15s',
                                        fontWeight: i === activeWordIndex
                                            ? Math.min(presetStyle.fontWeight + 200, 900)
                                            : presetStyle.fontWeight,
                                    }}
                                >
                                    {word.text}{' '}
                                </span>
                            ))
                            : currentCaption.text}
                    </p>
                </div>
            </div>
        </AbsoluteFill>
    );
};
