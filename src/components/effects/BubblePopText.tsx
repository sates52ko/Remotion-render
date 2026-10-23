/**
 * BubblePopText — Characters pop in one-by-one like bubbles bursting
 *
 * Great for: chapter titles, dramatic reveals, key quotes
 *
 * Usage:
 *   <BubblePopText text="A Fate So Cold" />
 *
 * Props:
 *   text           — text to animate
 *   delay          — start delay in seconds (default: 0)
 *   charDelay      — delay between each character in seconds (default: 0.06)
 *   fontSize       — font size (default: 80)
 *   color          — text color (default: '#ffffff')
 *   bubbleColor    — pop glow color (default: '#FFE600')
 *   fontFamily     — font (default: Inter)
 *   fontWeight     — (default: 900)
 *   align          — 'left' | 'center' | 'right' (default: 'center')
 */

import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface BubblePopTextProps {
    text: string;
    delay?: number;
    charDelay?: number;
    fontSize?: number;
    color?: string;
    bubbleColor?: string;
    fontFamily?: string;
    fontWeight?: number;
    align?: 'left' | 'center' | 'right';
}

const BubbleChar: React.FC<{
    char: string;
    startFrame: number;
    color: string;
    bubbleColor: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
}> = ({ char, startFrame, color, bubbleColor, fontSize, fontFamily, fontWeight }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const adjustedFrame = Math.max(0, frame - startFrame);

    const progress = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 8, stiffness: 400, mass: 0.5 },
    });

    const glowProgress = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 10, stiffness: 200, mass: 0.3 },
    });

    // Pop: overshoot scale then settle
    const scale = adjustedFrame === 0 ? 0 : progress;
    const glowOpacity = adjustedFrame < 6 ? glowProgress * 0.8 : Math.max(0, 0.8 - (adjustedFrame - 6) * 0.08);

    // Space character — render as small gap
    if (char === ' ') {
        return <span style={{ display: 'inline-block', width: fontSize * 0.3 }} />;
    }

    return (
        <span
            style={{
                display: 'inline-block',
                fontSize,
                fontFamily,
                fontWeight,
                color,
                transform: `scale(${scale})`,
                transformOrigin: 'center bottom',
                textShadow: glowOpacity > 0.05
                    ? `0 0 ${20 * glowOpacity}px ${bubbleColor}, 0 0 ${40 * glowOpacity}px ${bubbleColor}`
                    : 'none',
                filter: adjustedFrame === 0 ? 'none' : undefined,
            }}
        >
            {char}
        </span>
    );
};

export const BubblePopText: React.FC<BubblePopTextProps> = ({
    text,
    delay = 0,
    charDelay = 0.06,
    fontSize = 80,
    color = '#ffffff',
    bubbleColor = '#FFE600',
    fontFamily = "Inter, 'Segoe UI', system-ui, sans-serif",
    fontWeight = 900,
    align = 'center',
}) => {
    const { fps } = useVideoConfig();
    const delayFrames = Math.round(delay * fps);
    const charDelayFrames = Math.round(charDelay * fps);

    return (
        <div style={{ textAlign: align, lineHeight: 1.2 }}>
            {text.split('').map((char, i) => (
                <BubbleChar
                    key={i}
                    char={char}
                    startFrame={delayFrames + i * charDelayFrames}
                    color={color}
                    bubbleColor={bubbleColor}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    fontWeight={fontWeight}
                />
            ))}
        </div>
    );
};
