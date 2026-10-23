/**
 * FloatingChip — Words float in as pill/chip badges with gentle hover animation
 *
 * Great for: book tags, genre labels, key theme words, hashtags, highlight keywords
 *
 * Usage:
 *   <FloatingChip words={['Fantasy', 'Romance', 'Mystery']} />
 *   <FloatingChip words={['Plot Twist', 'Shocking Ending', 'Must Read']} color="#FFE600" textColor="#000" />
 *
 * Props:
 *   words         — array of strings, each becomes a chip
 *   delay         — start delay in seconds (default: 0)
 *   chipDelay     — delay between each chip in seconds (default: 0.15)
 *   color         — chip background color (default: 'rgba(255,230,0,0.9)')
 *   textColor     — chip text color (default: '#000000')
 *   fontSize      — font size in px (default: 32)
 *   hoverFloat    — amplitude of floating animation in px (default: 8)
 *   align         — 'left' | 'center' | 'right' (default: 'center')
 *   variant       — 'pill' | 'square' | 'outline' (default: 'pill')
 */

import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

type ChipVariant = 'pill' | 'square' | 'outline';

interface FloatingChipProps {
    words: string[];
    delay?: number;
    chipDelay?: number;
    color?: string;
    textColor?: string;
    fontSize?: number;
    hoverFloat?: number;
    align?: 'left' | 'center' | 'right';
    variant?: ChipVariant;
}

const Chip: React.FC<{
    word: string;
    startFrame: number;
    color: string;
    textColor: string;
    fontSize: number;
    hoverFloat: number;
    chipIndex: number;
    variant: ChipVariant;
}> = ({ word, startFrame, color, textColor, fontSize, hoverFloat, chipIndex, variant }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const adjustedFrame = Math.max(0, frame - startFrame);

    const enterProgress = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 12, stiffness: 200, mass: 0.6 },
    });

    // Gentle floating after entry (each chip has different phase)
    const floatY = adjustedFrame > 0
        ? Math.sin((frame + chipIndex * 15) * 0.06) * hoverFloat
        : 0;

    const opacity = enterProgress;
    const scale = interpolate(enterProgress, [0, 1], [0.5, 1]);
    const translateY = interpolate(enterProgress, [0, 1], [40, 0]) + floatY;

    const borderRadius =
        variant === 'pill' ? '999px' :
            variant === 'square' ? '8px' :
                '999px';

    const background =
        variant === 'outline' ? 'transparent' : color;

    const border =
        variant === 'outline' ? `2px solid ${color}` : 'none';

    const chipTextColor =
        variant === 'outline' ? color : textColor;

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                background,
                border,
                borderRadius,
                padding: `${fontSize * 0.25}px ${fontSize * 0.55}px`,
                margin: `${fontSize * 0.1}px ${fontSize * 0.15}px`,
                fontSize,
                fontWeight: 700,
                color: chipTextColor,
                fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
                letterSpacing: '0.02em',
                opacity,
                transform: `scale(${scale}) translateY(${translateY}px)`,
                boxShadow: variant !== 'outline'
                    ? `0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)`
                    : 'none',
            }}
        >
            {word}
        </span>
    );
};

export const FloatingChip: React.FC<FloatingChipProps> = ({
    words,
    delay = 0,
    chipDelay = 0.15,
    color = 'rgba(255,230,0,0.92)',
    textColor = '#000000',
    fontSize = 32,
    hoverFloat = 8,
    align = 'center',
    variant = 'pill',
}) => {
    const { fps } = useVideoConfig();
    const delayFrames = Math.round(delay * fps);
    const chipDelayFrames = Math.round(chipDelay * fps);

    return (
        <div
            style={{
                textAlign: align,
                lineHeight: 1,
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                alignItems: 'center',
            }}
        >
            {words.map((word, i) => (
                <Chip
                    key={i}
                    word={word}
                    startFrame={delayFrames + i * chipDelayFrames}
                    color={color}
                    textColor={textColor}
                    fontSize={fontSize}
                    hoverFloat={hoverFloat}
                    chipIndex={i}
                    variant={variant}
                />
            ))}
        </div>
    );
};
