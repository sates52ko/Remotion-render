/**
 * TextOverlay — Timed text/title/quote overlays for YouTube videos
 *
 * Shows styled text at a specific time range in the video with smooth animations.
 * Great for: chapter titles, key quotes, stats, section headers.
 *
 * Usage:
 *   import { TextOverlay } from '../components/overlays/TextOverlay';
 *
 *   // Inside your composition:
 *   <TextOverlay
 *     text="Chapter 1: The Beginning"
 *     startTime={5}
 *     endTime={9}
 *     style="chapter"
 *   />
 *
 * Props:
 *   text        — text to display
 *   startTime   — when to show (seconds)
 *   endTime     — when to hide (seconds)
 *   style       — 'chapter' | 'quote' | 'stat' | 'minimal' | 'highlight' (default: 'chapter')
 *   position    — 'top' | 'center' | 'bottom' (default: 'top')
 *   color       — text color (default: depends on style)
 *   subtext     — optional smaller line below main text
 *   animate     — 'slide-up' | 'fade' | 'scale' (default: 'slide-up')
 */

import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

type OverlayStyle = 'chapter' | 'quote' | 'stat' | 'minimal' | 'highlight';
type AnimationType = 'slide-up' | 'fade' | 'scale';

interface TextOverlayProps {
    text: string;
    startTime: number;       // seconds
    endTime: number;         // seconds
    style?: OverlayStyle;
    position?: 'top' | 'center' | 'bottom';
    color?: string;
    subtext?: string;
    animate?: AnimationType;
}

export const TextOverlay: React.FC<TextOverlayProps> = ({
    text,
    startTime,
    endTime,
    style = 'chapter',
    position = 'top',
    color,
    subtext,
    animate = 'slide-up',
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    if (currentTime < startTime || currentTime > endTime) return null;

    const duration = endTime - startTime;
    const elapsed = currentTime - startTime;
    const fadeDuration = Math.min(0.4, duration * 0.2);

    // Opacity: fade in + fade out
    const opacity = interpolate(
        elapsed,
        [0, fadeDuration, duration - fadeDuration, duration],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    // Entry animation
    const entryProgress = spring({
        frame: frame - Math.round(startTime * fps),
        fps,
        from: 0,
        to: 1,
        config: { damping: 18, stiffness: 200, mass: 0.6 },
    });

    let transform = 'none';
    if (animate === 'slide-up') {
        const y = interpolate(entryProgress, [0, 1], [40, 0]);
        transform = `translateY(${y}px)`;
    } else if (animate === 'scale') {
        const s = interpolate(entryProgress, [0, 1], [0.8, 1]);
        transform = `scale(${s})`;
    }

    // Style presets
    const presets: Record<OverlayStyle, {
        container: React.CSSProperties;
        text: React.CSSProperties;
        subtext?: React.CSSProperties;
        accent?: string;
    }> = {
        chapter: {
            container: {
                background: 'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 70%, transparent 100%)',
                padding: '20px 48px 20px 40px',
                borderLeft: '5px solid #FFE600',
                backdropFilter: 'blur(4px)',
            },
            text: {
                fontSize: 48,
                fontWeight: 800,
                color: color ?? '#ffffff',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                letterSpacing: '-0.5px',
            },
            subtext: {
                fontSize: 28,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.7)',
                marginTop: 6,
            },
            accent: '#FFE600',
        },
        quote: {
            container: {
                background: 'rgba(0,0,0,0.65)',
                padding: '28px 52px',
                borderRadius: 16,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
            },
            text: {
                fontSize: 42,
                fontWeight: 500,
                fontStyle: 'italic',
                color: color ?? '#f5f5f5',
                fontFamily: "'Playfair Display', Georgia, serif",
                lineHeight: 1.5,
                textAlign: 'center' as const,
            },
            subtext: {
                fontSize: 24,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.6)',
                marginTop: 12,
                textAlign: 'center' as const,
            },
        },
        stat: {
            container: {
                background: 'rgba(0,0,0,0.75)',
                padding: '16px 32px',
                borderRadius: 12,
                backdropFilter: 'blur(8px)',
            },
            text: {
                fontSize: 72,
                fontWeight: 900,
                color: color ?? '#FFE600',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                textAlign: 'center' as const,
                lineHeight: 1,
            },
            subtext: {
                fontSize: 26,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.8)',
                marginTop: 8,
                textAlign: 'center' as const,
            },
        },
        highlight: {
            container: {
                background: '#FFE600',
                padding: '14px 36px',
                borderRadius: 8,
            },
            text: {
                fontSize: 44,
                fontWeight: 900,
                color: color ?? '#000000',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                letterSpacing: '-0.5px',
            },
            subtext: {
                fontSize: 22,
                fontWeight: 600,
                color: 'rgba(0,0,0,0.7)',
                marginTop: 4,
            },
        },
        minimal: {
            container: { padding: '12px 0' },
            text: {
                fontSize: 40,
                fontWeight: 700,
                color: color ?? '#ffffff',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                textShadow: '0 2px 16px rgba(0,0,0,0.8)',
            },
            subtext: {
                fontSize: 22,
                fontWeight: 300,
                color: 'rgba(255,255,255,0.7)',
                marginTop: 6,
                textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            },
        },
    };

    const preset = presets[style];

    const positionStyle: React.CSSProperties =
        position === 'top'
            ? { top: 60, left: 0, right: 0, alignItems: style === 'chapter' ? 'flex-start' : 'center' }
            : position === 'bottom'
                ? { bottom: 80, left: 0, right: 0, alignItems: style === 'chapter' ? 'flex-start' : 'center' }
                : { top: '50%', left: 0, right: 0, transform: 'translateY(-50%)', alignItems: 'center' };

    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <div
                style={{
                    position: 'absolute',
                    ...positionStyle,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: style === 'chapter' ? '0' : '0 80px',
                    opacity,
                    transform,
                }}
            >
                <div style={preset.container}>
                    <p style={{ margin: 0, ...preset.text }}>{text}</p>
                    {subtext && preset.subtext && (
                        <p style={{ margin: 0, ...preset.subtext }}>{subtext}</p>
                    )}
                </div>
            </div>
        </AbsoluteFill>
    );
};
