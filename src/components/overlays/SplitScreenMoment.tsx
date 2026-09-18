import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile } from 'remotion';
import { Theme } from '../../themes';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SplitScreenData {
    startTime: number;   // seconds
    endTime: number;     // seconds
    leftImage: string;   // path relative to public/
    rightImage: string;  // path relative to public/
    leftLabel?: string;
    rightLabel?: string;
    dividerLabel?: string; // e.g. "VS" or "→"
}

interface SplitScreenMomentProps {
    moments: SplitScreenData[];
    theme: Theme;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SplitScreenMoment: React.FC<SplitScreenMomentProps> = ({ moments, theme }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 84000 }}>
            {moments.map((m, i) => {
                if (currentTime < m.startTime || currentTime > m.endTime) return null;

                const localFrame = (currentTime - m.startTime) * fps;
                const totalFrames = (m.endTime - m.startTime) * fps;

                // Slide-in from sides
                const leftSlide = spring({
                    frame: localFrame,
                    fps,
                    from: -100,
                    to: 0,
                    config: { damping: 18, stiffness: 100 },
                });

                const rightSlide = spring({
                    frame: localFrame + 3, // slight delay
                    fps,
                    from: 100,
                    to: 0,
                    config: { damping: 18, stiffness: 100 },
                });

                // Divider pop
                const dividerScale = spring({
                    frame: Math.max(0, localFrame - fps * 0.4),
                    fps,
                    from: 0,
                    to: 1,
                    config: { damping: 10, stiffness: 200 },
                });

                // Fade out
                const fadeOut = interpolate(
                    localFrame,
                    [totalFrames * 0.8, totalFrames],
                    [1, 0],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );

                // Subtle Ken Burns on each side
                const leftScale = interpolate(localFrame, [0, totalFrames], [1.05, 1.15]);
                const rightScale = interpolate(localFrame, [0, totalFrames], [1.15, 1.05]);

                return (
                    <AbsoluteFill key={`split-${i}`} style={{ opacity: fadeOut }}>
                        {/* Left half */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '50%',
                            height: '100%',
                            overflow: 'hidden',
                            transform: `translateX(${leftSlide}%)`,
                        }}>
                            <Img
                                src={staticFile(m.leftImage)}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    transform: `scale(${leftScale})`,
                                }}
                            />
                            {/* Gradient edge */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                width: '30%',
                                height: '100%',
                                background: 'linear-gradient(to left, rgba(0,0,0,0.6), transparent)',
                            }} />
                            {/* Label */}
                            {m.leftLabel && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '12%',
                                    left: '8%',
                                    fontSize: 28,
                                    fontWeight: 700,
                                    color: theme.text.primary,
                                    fontFamily: "'Inter', sans-serif",
                                    textShadow: '0 2px 12px rgba(0,0,0,0.8)',
                                    letterSpacing: '0.02em',
                                }}>
                                    {m.leftLabel}
                                </div>
                            )}
                        </div>

                        {/* Right half */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: '50%',
                            height: '100%',
                            overflow: 'hidden',
                            transform: `translateX(${rightSlide}%)`,
                        }}>
                            <Img
                                src={staticFile(m.rightImage)}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    transform: `scale(${rightScale})`,
                                }}
                            />
                            {/* Gradient edge */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '30%',
                                height: '100%',
                                background: 'linear-gradient(to right, rgba(0,0,0,0.6), transparent)',
                            }} />
                            {/* Label */}
                            {m.rightLabel && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '12%',
                                    right: '8%',
                                    fontSize: 28,
                                    fontWeight: 700,
                                    color: theme.text.primary,
                                    fontFamily: "'Inter', sans-serif",
                                    textShadow: '0 2px 12px rgba(0,0,0,0.8)',
                                    letterSpacing: '0.02em',
                                    textAlign: 'right',
                                }}>
                                    {m.rightLabel}
                                </div>
                            )}
                        </div>

                        {/* Center divider */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: '50%',
                            width: 4,
                            height: '100%',
                            background: `linear-gradient(to bottom, transparent 5%, ${theme.text.accent} 20%, ${theme.text.accent} 80%, transparent 95%)`,
                            transform: `translateX(-50%) scaleY(${dividerScale})`,
                            boxShadow: `0 0 20px ${theme.effects.glowColor}80`,
                        }} />

                        {/* Divider label */}
                        {m.dividerLabel && (
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: `translate(-50%, -50%) scale(${dividerScale})`,
                                background: theme.text.accent,
                                color: '#000',
                                fontSize: 22,
                                fontWeight: 900,
                                fontFamily: "'Inter', sans-serif",
                                padding: '10px 18px',
                                borderRadius: 30,
                                boxShadow: `0 4px 20px ${theme.effects.glowColor}80`,
                                letterSpacing: '0.05em',
                            }}>
                                {m.dividerLabel}
                            </div>
                        )}
                    </AbsoluteFill>
                );
            })}
        </AbsoluteFill>
    );
};
