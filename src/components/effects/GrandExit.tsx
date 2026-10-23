import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Theme } from '../../themes';
import { ParticleExplosion } from './ParticleExplosion';

interface GrandExitProps {
    theme: Theme;
    triggerTime: number; // seconds when the exit starts
    channelName?: string;
}

export const GrandExit: React.FC<GrandExitProps> = ({ theme, triggerTime, channelName = 'NARRATIVE LABS' }) => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();
    const currentTime = frame / fps;
    const localTime = Math.max(0, currentTime - triggerTime);
    const localFrame = localTime * fps;

    if (currentTime < triggerTime) return null;

    // ── Background Fade ───────────────────────────────────────────
    const bgOpacity = interpolate(localTime, [0, 1], [0, 0.95], { extrapolateRight: 'clamp' });

    // ── Branding Reveal ───────────────────────────────────────────
    const brandingScale = interpolate(localTime, [0.5, 1.5], [0.8, 1.2], { extrapolateRight: 'clamp' });
    const brandingOpacity = interpolate(localTime, [0.5, 1], [0, 1], { extrapolateRight: 'clamp' });

    // ── CTA Slide Up ──────────────────────────────────────────────
    const ctaY = interpolate(localTime, [1.5, 2], [100, 0], { extrapolateRight: 'clamp' });
    const ctaOpacity = interpolate(localTime, [1.5, 1.8], [0, 1], { extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill style={{ zIndex: 1000000 }}>
            {/* Dark Overlay */}
            <AbsoluteFill style={{ 
                backgroundColor: '#000', 
                opacity: bgOpacity,
                backdropFilter: 'blur(20px)',
            }} />

            {/* Particle Burst upon entry */}
            {localTime < 2 && (
                <ParticleExplosion
                    x={width / 2}
                    y={height / 2}
                    color={theme.text.accent}
                    count={150}
                    velocity={15}
                    size={8}
                />
            )}

            {/* Main Branding */}
            <div style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: `translate(-50%, -50%) scale(${brandingScale})`,
                opacity: brandingOpacity,
                textAlign: 'center',
            }}>
                <h1 style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 120,
                    fontWeight: 900,
                    letterSpacing: 10,
                    color: theme.text.primary,
                    margin: 0,
                    textShadow: `0 0 40px ${theme.effects.glowColor}88, 0 0 10px ${theme.text.accent}`,
                }}>
                    {channelName}
                </h1>
                <div style={{
                    height: 4,
                    width: interpolate(localTime, [1, 2], [0, 400], { extrapolateRight: 'clamp' }),
                    background: `linear-gradient(90deg, transparent, ${theme.text.accent}, transparent)`,
                    margin: '20px auto',
                }} />
            </div>

            {/* CTA Section */}
            <div style={{
                position: 'absolute',
                bottom: '20%',
                left: '50%',
                transform: `translateX(-50%) translateY(${ctaY}px)`,
                opacity: ctaOpacity,
                textAlign: 'center',
            }}>
                <div style={{
                    background: 'rgba(255,255,255,0.05)',
                    padding: '20px 60px',
                    borderRadius: 20,
                    border: `1px solid ${theme.text.accent}40`,
                    boxShadow: `0 20px 40px rgba(0,0,0,0.5), 0 0 20px ${theme.text.accent}20`,
                }}>
                    <p style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 32,
                        fontWeight: 600,
                        color: theme.text.secondary,
                        margin: 0,
                        letterSpacing: 2,
                    }}>
                        Subscribe for more daily insights
                    </p>
                </div>
            </div>

            {/* Scanning Light Streak */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: `${interpolate(localTime % 4, [0, 4], [-20, 120])}%`,
                width: '10%',
                height: '100%',
                background: `linear-gradient(90deg, transparent, ${theme.text.accent}15, transparent)`,
                transform: 'skewX(-20deg)',
                pointerEvents: 'none',
            }} />
        </AbsoluteFill>
    );
};
