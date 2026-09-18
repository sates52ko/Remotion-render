import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Theme } from '../../themes';

interface CinematicOverlaysProps {
    theme: Theme;
    currentTime: number;
    sceneIndex: number;
    totalScenes: number;
    /** Enable animated letterbox bars that shift aspect ratio for dramatic moments */
    letterbox?: boolean;
    /** Intensity of the letterbox (0 = none, 1 = full 2.39:1) */
    letterboxIntensity?: number;
    /** Enable bottom-edge cinematic gradient */
    bottomGradient?: boolean;
    /** Enable edge light leaks */
    lightLeaks?: boolean;
}

/**
 * CinematicOverlays — Film-grade visual enhancement layer
 * Adds letterbox bars, light leaks, edge gradients, and subtle vignette
 * for a premium cinematic feel.
 */
export const CinematicOverlays: React.FC<CinematicOverlaysProps> = ({
    theme,
    currentTime,
    sceneIndex,
    totalScenes,
    letterbox = true,
    letterboxIntensity = 0.6,
    bottomGradient = true,
    lightLeaks = true,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // ── Animated Letterbox Bars ─────────────────────────────────
    // Bars animate in/out at scene transitions and dramatic moments
    const barHeight = letterbox
        ? interpolate(
            letterboxIntensity,
            [0, 1],
            [0, 120],  // max 120px bars (approximating 2.39:1 on 1080 height)
            { extrapolateRight: 'clamp' }
        )
        : 0;

    // Smooth bar animation on scene change
    const barSpring = spring({
        frame: frame % (fps * 6),
        fps,
        from: 0.85,
        to: 1,
        config: { damping: 100, stiffness: 80 },
    });

    const animatedBarHeight = barHeight * barSpring;

    // ── Light Leak Effects ────────────────────────────────────────
    // Anamorphic-style horizontal light streaks
    const leakPhase = interpolate(frame, [0, fps * 12], [0, 360], { extrapolateRight: 'wrap' });
    const leakX = Math.sin(leakPhase * Math.PI / 180) * 30 + 50;
    const leakOpacity = interpolate(
        Math.sin(leakPhase * 2 * Math.PI / 180),
        [-1, 0, 1],
        [0, 0.08, 0.15]
    );

    // Second leak with offset
    const leak2Phase = leakPhase + 120;
    const leak2X = Math.sin(leak2Phase * Math.PI / 180) * 40 + 50;
    const leak2Opacity = interpolate(
        Math.sin(leak2Phase * 2 * Math.PI / 180),
        [-1, 0, 1],
        [0, 0.06, 0.12]
    );

    // ── Corner accent lines ────────────────────────────────────────
    const cornerOpacity = interpolate(
        frame % (fps * 4),
        [0, fps * 2, fps * 4],
        [0.15, 0.35, 0.15]
    );

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 90 }}>

            {/* ── Top Letterbox Bar ─────────────────────────────── */}
            {letterbox && animatedBarHeight > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: animatedBarHeight,
                        background: 'linear-gradient(180deg, #000000 70%, rgba(0,0,0,0.7) 100%)',
                        zIndex: 200,
                    }}
                />
            )}

            {/* ── Bottom Letterbox Bar ─────────────────────────────── */}
            {letterbox && animatedBarHeight > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        width: '100%',
                        height: animatedBarHeight,
                        background: 'linear-gradient(0deg, #000000 70%, rgba(0,0,0,0.7) 100%)',
                        zIndex: 200,
                    }}
                />
            )}

            {/* ── Bottom gradient for caption readability ────────── */}
            {bottomGradient && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        width: '100%',
                        height: '35%',
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.5))',
                        zIndex: 85,
                    }}
                />
            )}

            {/* ── Edge vignette ─────────────────────────────────── */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)',
                    zIndex: 80,
                }}
            />

            {/* ── Anamorphic Light Leaks ────────────────────────── */}
            {lightLeaks && (
                <>
                    <div
                        style={{
                            position: 'absolute',
                            top: '15%',
                            left: `${leakX - 15}%`,
                            width: '30%',
                            height: '3px',
                            background: `linear-gradient(90deg, transparent, ${theme.text.accent}40, ${theme.effects.glowColor}30, transparent)`,
                            opacity: leakOpacity,
                            filter: 'blur(4px)',
                            zIndex: 95,
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: '72%',
                            left: `${leak2X - 20}%`,
                            width: '40%',
                            height: '2px',
                            background: `linear-gradient(90deg, transparent, ${theme.effects.glowColor}30, ${theme.text.accent}20, transparent)`,
                            opacity: leak2Opacity,
                            filter: 'blur(3px)',
                            zIndex: 95,
                        }}
                    />
                </>
            )}

            {/* ── Corner accent marks ────────────────────────────── */}
            {/* Top-left corner */}
            <svg
                style={{
                    position: 'absolute',
                    top: animatedBarHeight + 8,
                    left: 12,
                    width: 28,
                    height: 28,
                    opacity: cornerOpacity,
                    zIndex: 96,
                }}
            >
                <path d="M 0 20 L 0 0 L 20 0" fill="none" stroke={theme.text.accent} strokeWidth="1.5" />
            </svg>

            {/* Bottom-right corner */}
            <svg
                style={{
                    position: 'absolute',
                    bottom: animatedBarHeight + 8,
                    right: 12,
                    width: 28,
                    height: 28,
                    opacity: cornerOpacity,
                    zIndex: 96,
                }}
            >
                <path d="M 28 8 L 28 28 L 8 28" fill="none" stroke={theme.text.accent} strokeWidth="1.5" />
            </svg>
        </AbsoluteFill>
    );
};
