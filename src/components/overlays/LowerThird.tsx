/**
 * LowerThird — YouTube-style animated lower-third name/info bar
 *
 * Classic TV/YouTube lower third: animated slide-in bar at bottom of screen
 * showing a name, title, or book information.
 *
 * Usage:
 *   import { LowerThird } from '../components/overlays/LowerThird';
 *
 *   <LowerThird
 *     title="A Fate So Cold"
 *     subtitle="by Amanda Foody • Fantasy"
 *     startTime={2}
 *     endTime={8}
 *   />
 *
 * Props:
 *   title       — main bold text (e.g. book title, author name)
 *   subtitle    — smaller text below (e.g. genre, role, year)
 *   startTime   — when to show (seconds)
 *   endTime     — when to hide (seconds)
 *   style       — 'classic' | 'modern' | 'minimal' | 'accent' (default: 'modern')
 *   accentColor — accent/bar color (default: '#FFE600')
 *   side        — 'left' | 'center' | 'right' (default: 'left')
 */

import React from 'react';
import { OverlayJitter } from './OverlayJitter';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

type LowerThirdStyle = 'classic' | 'modern' | 'minimal' | 'accent';
type LowerThirdSide = 'left' | 'center' | 'right';

interface LowerThirdProps {
    title: string;
    subtitle?: string;
    startTime: number;
    endTime: number;
    style?: LowerThirdStyle;
    accentColor?: string;
    side?: LowerThirdSide;
}

export const LowerThird: React.FC<LowerThirdProps> = ({
    title,
    subtitle,
    startTime,
    endTime,
    style = 'modern',
    accentColor = '#FFE600',
    side = 'left',
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    if (currentTime < startTime || currentTime > endTime) return null;

    const duration = endTime - startTime;
    const elapsed = currentTime - startTime;
    const startFrame = Math.round(startTime * fps);

    // Slide in from left (or right)
    const slideProgress = spring({
        frame: frame - startFrame,
        fps,
        from: 0,
        to: 1,
        config: { damping: 20, stiffness: 160, mass: 0.7 },
    });

    const opacity = interpolate(
        elapsed,
        [0, 0.2, duration - 0.4, duration],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const slideX =
        side === 'right'
            ? interpolate(slideProgress, [0, 1], [80, 0])
            : interpolate(slideProgress, [0, 1], [-80, 0]);

    const sideStyle: React.CSSProperties =
        side === 'left'
            ? { left: 60 }
            : side === 'right'
                ? { right: 60 }
                : { left: '50%', transform: `translateX(-50%) translateX(${slideX}px)` };

    const transformStyle =
        side !== 'center'
            ? `translateX(${slideX}px)`
            : undefined;

    // Bar width animation for classic style
    const barWidth = interpolate(slideProgress, [0, 1], [0, 100]);

    const styles: Record<LowerThirdStyle, {
        outer: React.CSSProperties;
        title: React.CSSProperties;
        subtitle?: React.CSSProperties;
        bar?: React.CSSProperties;
    }> = {
        modern: {
            outer: {
                background: 'rgba(10,10,10,0.88)',
                backdropFilter: 'blur(12px)',
                borderRadius: 10,
                padding: '14px 28px',
                borderLeft: `4px solid ${accentColor}`,
                minWidth: 320,
            },
            title: {
                fontSize: 38,
                fontWeight: 800,
                color: '#ffffff',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                margin: 0,
                letterSpacing: '-0.3px',
            },
            subtitle: {
                fontSize: 22,
                fontWeight: 400,
                color: accentColor,
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                margin: '4px 0 0',
            },
        },
        classic: {
            outer: {
                padding: '0',
            },
            bar: {
                width: `${barWidth}%`,
                height: 4,
                backgroundColor: accentColor,
                marginBottom: 8,
                borderRadius: 2,
            },
            title: {
                fontSize: 40,
                fontWeight: 900,
                color: '#ffffff',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                margin: 0,
                textShadow: '0 2px 12px rgba(0,0,0,0.8)',
            },
            subtitle: {
                fontSize: 24,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.75)',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                margin: '6px 0 0',
                textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            },
        },
        accent: {
            outer: {
                padding: '0',
            },
            title: {
                fontSize: 40,
                fontWeight: 900,
                color: '#ffffff',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                margin: 0,
                background: `linear-gradient(135deg, ${accentColor}, #ffffff)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
            },
            subtitle: {
                fontSize: 24,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.8)',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                margin: '4px 0 0',
                textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            },
        },
        minimal: {
            outer: { padding: '8px 0' },
            title: {
                fontSize: 36,
                fontWeight: 700,
                color: '#ffffff',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                margin: 0,
                textShadow: '0 2px 16px rgba(0,0,0,0.9)',
            },
            subtitle: {
                fontSize: 20,
                fontWeight: 300,
                color: 'rgba(255,255,255,0.65)',
                fontFamily: "Inter, 'Segoe UI', sans-serif",
                margin: '4px 0 0',
                textShadow: '0 1px 8px rgba(0,0,0,0.7)',
            },
        },
    };

    const preset = styles[style];

    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <div
                style={{
                    position: 'absolute',
                    bottom: 80,
                    ...sideStyle,
                    opacity,
                    transform: side !== 'center' ? transformStyle : sideStyle.transform,
                    display: 'inline-block',
                }}
            >
                <OverlayJitter intensity={0.02}>
                  <div style={preset.outer}>
                    {style === 'classic' && preset.bar && (
                      <div style={preset.bar} />
                    )}
                    <p style={preset.title}>{title}</p>
                    {subtitle && preset.subtitle && (
                      <p style={preset.subtitle}>{subtitle}</p>
                    )}
                  </div>
                </OverlayJitter>
            </div>
        </AbsoluteFill>
    );
};
