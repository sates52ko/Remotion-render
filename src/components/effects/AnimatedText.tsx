/**
 * AnimatedText — Smooth entrance animations for titles, captions, and headings
 *
 * Usage:
 *   <AnimatedText text="A Fate So Cold" animate="slide-up" delay={0.2} />
 *
 * Props:
 *   text        — text to display
 *   animate     — 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'typewriter' (default: 'slide-up')
 *   delay       — delay in seconds before animation starts (default: 0)
 *   duration    — spring settle time in seconds (default: 0.6)
 *   fontSize    — font size in px (default: 72)
 *   fontWeight  — (default: 800)
 *   color       — text color (default: '#ffffff')
 *   fontFamily  — (default: Inter)
 *   align       — 'left' | 'center' | 'right' (default: 'center')
 *   style       — optional style overrides on the text element
 */

import React, { useMemo } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

type AnimateType = 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'typewriter';

interface AnimatedTextProps {
    text: string;
    animate?: AnimateType;
    delay?: number;
    duration?: number;
    fontSize?: number;
    fontWeight?: number;
    color?: string;
    fontFamily?: string;
    align?: 'left' | 'center' | 'right';
    style?: React.CSSProperties;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
    text,
    animate = 'slide-up',
    delay = 0,
    duration = 0.6,
    fontSize = 72,
    fontWeight = 800,
    color = '#ffffff',
    fontFamily = "Inter, 'Segoe UI', system-ui, sans-serif",
    align = 'center',
    style,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const delayFrames = Math.round(delay * fps);
    const adjustedFrame = Math.max(0, frame - delayFrames);

    const progress = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 16, stiffness: 140, mass: 0.8 },
    });

    // Typewriter: reveal characters one by one
    const typewriterChars = useMemo(() => {
        if (animate !== 'typewriter') return null;
        const totalFrames = text.length * 2;
        const revealed = Math.floor(interpolate(adjustedFrame, [0, totalFrames], [0, text.length], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
        }));
        return text.slice(0, revealed);
    }, [animate, adjustedFrame, text]);

    const getStyle = (): React.CSSProperties => {
        switch (animate) {
            case 'fade':
                return { opacity: progress };
            case 'slide-up':
                return {
                    opacity: progress,
                    transform: `translateY(${interpolate(progress, [0, 1], [50, 0])}px)`,
                };
            case 'slide-left':
                return {
                    opacity: progress,
                    transform: `translateX(${interpolate(progress, [0, 1], [80, 0])}px)`,
                };
            case 'scale':
                return {
                    opacity: progress,
                    transform: `scale(${interpolate(progress, [0, 1], [0.6, 1])})`,
                };
            case 'typewriter':
                return {};
            default:
                return { opacity: progress };
        }
    };

    return (
        <p
            style={{
                margin: 0,
                fontSize,
                fontWeight,
                color,
                fontFamily,
                textAlign: align,
                lineHeight: 1.2,
                textShadow: '-1px -1px 0 rgba(0,0,0,0.5), 1px 1px 0 rgba(0,0,0,0.5)',
                ...getStyle(),
                ...style,
            }}
        >
            {animate === 'typewriter' ? typewriterChars : text}
            {animate === 'typewriter' && adjustedFrame > 0 && (adjustedFrame % 24 < 12) && (
                <span style={{ opacity: 0.8 }}>|</span>
            )}
        </p>
    );
};
