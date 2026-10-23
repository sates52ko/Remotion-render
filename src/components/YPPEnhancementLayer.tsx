import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Theme } from '../themes';

interface YPPEnhancementLayerProps {
    theme: Theme;
    currentTime: number; // seconds
    totalDuration?: number; // seconds – for accurate progress bar
    seed?: number;
    sceneIndex?: number; // current scene index
    totalScenes?: number; // total number of scenes
    channelName?: string; // channel branding
    currentKeywords?: string[]; // dynamic keywords from narration
}

export const YPPEnhancementLayer: React.FC<YPPEnhancementLayerProps> = ({
    theme,
    currentTime,
    totalDuration = 300,
    seed,
    sceneIndex = 0,
    totalScenes = 50,
    channelName = '',
    currentKeywords = [],
}) => {
    const frame = useCurrentFrame();
    const { fps, durationInFrames } = useVideoConfig();

    // ── Progress bar ──────────────────────────────────────────────────────
    const actualDuration = durationInFrames / fps;
    const progressWidth = Math.min((currentTime / actualDuration) * 100, 100);

    // ── Procedural Signature ──────────────────────────────────────────────
    const signature = seed 
        ? `DNA-${seed.toString(16).slice(0,4).toUpperCase()}-${Math.floor(actualDuration)}V`
        : '';

    // ── Pulsing accent ────────────────────────────────────────────────────
    const pulseOpacity = spring({
        frame: frame % (fps * 3),
        fps,
        config: { damping: 100, stiffness: 200 },
    });

    // ── Rotating dashed ring ──────────────────────────────────────────────
    const borderRotation = interpolate(frame, [0, fps * 8], [0, 360], {
        extrapolateRight: 'wrap',
    });

    // ── Breath scale on geometric shape ──────────────────────────────────
    const shapeScale = spring({
        frame: frame % (fps * 4),
        fps,
        from: 0.8,
        to: 1.2,
        config: { damping: 100 },
    });

    // ── Floating ambient particles ────────────────────────────────────────
    const particleY = interpolate(frame % (fps * 5), [0, fps * 5], [100, -10]);

    // ── Slow chromatic streak (top-right decorative) ──────────────────────
    const streakX = interpolate(frame % (fps * 7), [0, fps * 7], [-20, 120], {
        extrapolateRight: 'wrap',
    });
    const streakOpacity = interpolate(
        frame % (fps * 7),
        [0, fps * 0.5, fps * 3, fps * 3.5, fps * 7],
        [0, 0.6, 0.6, 0, 0],
        { extrapolateRight: 'clamp' }
    );

    // ── Scene counter animation ────────────────────────────────────────────
    const sceneCounterIn = spring({
        frame: frame % (fps * 8),
        fps,
        config: { damping: 20, stiffness: 120 },
    });

    // ── Channel branding position shift ────────────────────────────────────
    // Move branding to different corners based on scene to avoid static watermark
    const brandingPositions = [
        { bottom: 16, right: 20 },
        { bottom: 16, left: 20 },
        { top: 80, right: 20 },
        { top: 80, left: 20 },
    ];
    const brandingPos = brandingPositions[sceneIndex % brandingPositions.length];

    // ── Dynamic keyword animation ──────────────────────────────────────────
    const keywordCycleLen = fps * 8;
    const keywordLocalF = frame % keywordCycleLen;
    const showKeyword = keywordLocalF < fps * 3.5;
    const keywordIn = spring({ frame: keywordLocalF, fps, config: { damping: 14, stiffness: 200 } });
    const keywordOut = interpolate(keywordLocalF, [fps * 2.5, fps * 3.5], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    // Use dynamic keywords from narration, or fallback
    const FALLBACK_WORDS = ['INSIGHT', 'KEY POINT', 'STORY', 'LESSON', 'THEME', 'MOMENT', 'TWIST', 'TRUTH', 'WISDOM'];
    const displayKeywords = currentKeywords.length > 0 ? currentKeywords : FALLBACK_WORDS;
    const keywordIdx = Math.floor(frame / keywordCycleLen) % displayKeywords.length;

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 100 }}>

            {/* ── Top progress bar (cinematic thin line) ─────────────── */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: 4,
                    background: 'rgba(255,255,255,0.05)',
                }}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${progressWidth}%`,
                        background: `linear-gradient(90deg, ${theme.text.accent}, ${theme.effects.glowColor})`,
                        boxShadow: `0 0 14px ${theme.effects.glowColor}, 0 0 4px ${theme.text.accent}`,
                        transition: 'width 0.5s ease-out',
                    }}
                />
            </div>

            {/* ── Top-left rotating dashed ring ───────────────────────── */}
            <svg
                style={{
                    position: 'absolute',
                    top: 18,
                    left: 18,
                    width: 56,
                    height: 56,
                    opacity: 0.3 + pulseOpacity * 0.2,
                    transform: `rotate(${borderRotation}deg)`,
                }}
            >
                <circle
                    cx="28" cy="28" r="22"
                    fill="none"
                    stroke={theme.text.accent}
                    strokeWidth="1.5"
                    strokeDasharray="10 5"
                />
            </svg>

            {/* ── Scene Counter Badge ───────────────────────────────── */}
            <div
                style={{
                    position: 'absolute',
                    top: 22,
                    right: 22,
                    opacity: 0.7 * sceneCounterIn,
                    transform: `scale(${0.8 + sceneCounterIn * 0.2})`,
                }}
            >
                <div style={{
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${theme.text.accent}30`,
                    borderRadius: 8,
                    padding: '4px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                }}>
                    <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: theme.text.accent,
                        boxShadow: `0 0 8px ${theme.text.accent}`,
                    }} />
                    <span style={{
                        fontFamily: "'Inter', 'SF Pro', sans-serif",
                        fontSize: 11,
                        fontWeight: 700,
                        color: theme.text.primary,
                        letterSpacing: 1.5,
                        opacity: 0.9,
                    }}>
                        {String(sceneIndex + 1).padStart(2, '0')}/{totalScenes}
                    </span>
                </div>
            </div>

            {/* ── Floating ambient particles ───────────────────────────── */}
            {[...Array(5)].map((_, i) => {
                const xPos = 8 + i * 18;
                const delay = i * 22;
                const adjustedY = (particleY + delay) % 120;
                const opacity = interpolate(
                    adjustedY,
                    [-10, 10, 90, 110],
                    [0, 0.35, 0.35, 0],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );
                const size = 3 + (i % 3) * 2;

                return (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: `${xPos}%`,
                            top: `${adjustedY}%`,
                            width: size,
                            height: size,
                            borderRadius: '50%',
                            backgroundColor: theme.background.particleColor,
                            opacity,
                            boxShadow: `0 0 ${size * 2}px ${theme.background.particleColor}`,
                        }}
                    />
                );
            })}

            {/* ── Rotating geometric accent (bottom-left) ─────────────── */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 90,
                    left: 28,
                    width: 44,
                    height: 44,
                    opacity: 0.4,
                    transform: `scale(${shapeScale}) rotate(${frame * 0.3}deg)`,
                }}
            >
                <svg viewBox="0 0 100 100">
                    <polygon
                        points="50,8 94,92 6,92"
                        fill="none"
                        stroke={theme.text.primary}
                        strokeWidth="2.5"
                    />
                </svg>
            </div>

            {/* ── Chromatic light streak ── */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: `${streakX}%`,
                    width: '5%',
                    height: '100%',
                    background: `linear-gradient(90deg, transparent, ${theme.text.accent}18, transparent)`,
                    opacity: streakOpacity * 1.5,
                    pointerEvents: 'none',
                    transform: 'skewX(-15deg)',
                }}
            />

            {/* ── Dynamic Narration Keywords ─────────────────────────── */}
            {showKeyword && (
                <div style={{
                    position: 'absolute',
                    top: '42%',
                    right: '5%',
                    opacity: keywordIn * keywordOut,
                    transform: `scale(${0.5 + keywordIn * 0.5}) translateY(${interpolate(keywordIn, [0, 1], [10, 0])}px)`,
                    pointerEvents: 'none',
                }}>
                    <div style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        fontWeight: 900,
                        letterSpacing: 4,
                        textTransform: 'uppercase',
                        color: theme.text.accent,
                        opacity: 0.5,
                        textShadow: `0 0 16px ${theme.effects.glowColor}`,
                    }}>
                        {displayKeywords[keywordIdx]}
                    </div>
                </div>
            )}

            {/* ── Channel Branding (position shifts per scene) ─────────── */}
            {channelName && (
                <div
                    style={{
                        position: 'absolute',
                        ...brandingPos,
                        opacity: 0.35,
                        pointerEvents: 'none',
                    }}
                >
                    <div style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 2,
                        textTransform: 'uppercase',
                        color: theme.text.primary,
                    }}>
                        {channelName}
                    </div>
                </div>
            )}

            {/* ── Procedural Signature ────────────────── */}
            {signature && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 12,
                        left: 120,
                        fontSize: 9,
                        fontFamily: 'monospace',
                        color: theme.text.accent,
                        opacity: 0.25,
                        letterSpacing: 2,
                        textTransform: 'uppercase',
                    }}
                >
                    {signature}
                </div>
            )}

            {/* ── Watch-time nudge at mid-video ───────────────────────── */}
            {(() => {
                const actualDurationRef = durationInFrames / fps;
                const midPoint = Math.floor(actualDurationRef * 0.5 * fps);
                const localF = frame - midPoint;
                if (localF < 0 || localF > fps * 4) return null;
                const nudgeIn = spring({ frame: localF, fps, config: { damping: 18, stiffness: 120 } });
                const nudgeOut = interpolate(localF, [fps * 3, fps * 4], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                return (
                    <div style={{
                        position: 'absolute',
                        bottom: '18%',
                        right: '6%',
                        opacity: nudgeIn * nudgeOut,
                        transform: `translateY(${interpolate(nudgeIn, [0, 1], [20, 0])}px)`,
                        pointerEvents: 'none',
                    }}>
                        <div style={{
                            background: 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${theme.text.accent}30`,
                            borderRadius: 10,
                            padding: '6px 16px',
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 12,
                            fontWeight: 600,
                            color: theme.text.primary,
                            opacity: 0.8,
                        }}>
                            📖 Halfway through
                        </div>
                    </div>
                );
            })()}

            {/* ── Engagement Prompt at 75% ───────────────────────── */}
            {(() => {
                const engagePoint = Math.floor(actualDuration * 0.75 * fps);
                const localF = frame - engagePoint;
                if (localF < 0 || localF > fps * 5) return null;
                const engageIn = spring({ frame: localF, fps, config: { damping: 16, stiffness: 100 } });
                const engageOut = interpolate(localF, [fps * 3.5, fps * 5], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                return (
                    <div style={{
                        position: 'absolute',
                        bottom: '22%',
                        left: '6%',
                        opacity: engageIn * engageOut * 0.85,
                        transform: `translateX(${interpolate(engageIn, [0, 1], [-20, 0])}px)`,
                        pointerEvents: 'none',
                    }}>
                        <div style={{
                            background: 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${theme.text.accent}25`,
                            borderRadius: 10,
                            padding: '6px 16px',
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 12,
                            fontWeight: 600,
                            color: theme.text.primary,
                        }}>
                            🔔 Don't forget to subscribe
                        </div>
                    </div>
                );
            })()}
        </AbsoluteFill>
    );
};
