/**
 * PoppingText — Words spring-pop in sequence (word by word, not char by char)
 *
 * Great for: YouTube chapter titles, key points, dramatic reveals
 *
 * Usage:
 *   <PoppingText text="The twist nobody saw coming" />
 *
 * Props:
 *   text        — text to animate (split by spaces into words)
 *   delay       — start delay in seconds (default: 0)
 *   wordDelay   — delay between each word in seconds (default: 0.12)
 *   fontSize    — font size (default: 72)
 *   color       — base word color (default: '#ffffff')
 *   accentColor — highlight color for first appearance (default: '#FFE600')
 *   fontFamily  — font (default: Inter)
 *   fontWeight  — (default: 900)
 *   align       — 'left' | 'center' | 'right' (default: 'center')
 *   popStyle    — 'bounce' | 'flip' | 'zoom' (default: 'bounce')
 */

import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

type PopStyle = 'bounce' | 'flip' | 'zoom';

interface PoppingTextProps {
    text: string;
    delay?: number;
    wordDelay?: number;
    fontSize?: number;
    color?: string;
    accentColor?: string;
    fontFamily?: string;
    fontWeight?: number;
    align?: 'left' | 'center' | 'right';
    popStyle?: PopStyle;
}

const PoppingWord: React.FC<{
    word: string;
    startFrame: number;
    color: string;
    accentColor: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    popStyle: PopStyle;
}> = ({ word, startFrame, color, accentColor, fontSize, fontFamily, fontWeight, popStyle }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const adjustedFrame = Math.max(0, frame - startFrame);

    const progress = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 6, stiffness: 350, mass: 0.4 },
    });

    // Flash the accent color briefly then settle to base color
    const flashOpacity = Math.max(0, 1 - adjustedFrame * 0.08);
    const textColor = adjustedFrame === 0
        ? 'transparent'
        : flashOpacity > 0.1
            ? accentColor
            : color;

    const getTransform = () => {
        if (adjustedFrame === 0) return 'scale(0) translateY(0px)';
        switch (popStyle) {
            case 'bounce':
                return `scale(${progress}) translateY(${interpolate(progress, [0, 1], [30, 0])}px)`;
            case 'flip':
                return `rotateX(${interpolate(progress, [0, 1], [90, 0])}deg) scale(${progress})`;
            case 'zoom':
                return `scale(${interpolate(progress, [0, 1], [2.5, 1])})`;
            default:
                return `scale(${progress})`;
        }
    };

    return (
        <span
            style={{
                display: 'inline-block',
                fontSize,
                fontFamily,
                fontWeight,
                color: textColor,
                transform: getTransform(),
                transformOrigin: 'center bottom',
                marginRight: '0.25em',
                perspective: popStyle === 'flip' ? 400 : undefined,
            }}
        >
            {word}
        </span>
    );
};

export const PoppingText: React.FC<PoppingTextProps> = ({
    text,
    delay = 0,
    wordDelay = 0.12,
    fontSize = 72,
    color = '#ffffff',
    accentColor = '#FFE600',
    fontFamily = "Inter, 'Segoe UI', system-ui, sans-serif",
    fontWeight = 900,
    align = 'center',
    popStyle = 'bounce',
}) => {
    const { fps } = useVideoConfig();
    const delayFrames = Math.round(delay * fps);
    const wordDelayFrames = Math.round(wordDelay * fps);
    const words = text.split(' ').filter(Boolean);

    return (
        <div style={{ textAlign: align, lineHeight: 1.3 }}>
            {words.map((word, i) => (
                <PoppingWord
                    key={i}
                    word={word}
                    startFrame={delayFrames + i * wordDelayFrames}
                    color={color}
                    accentColor={accentColor}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    fontWeight={fontWeight}
                    popStyle={popStyle}
                />
            ))}
        </div>
    );
};
