import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    spring,
} from 'remotion';
import { Theme } from '../../themes';
import { Scene } from '../../types/scene';
import { OverlayJitter } from './OverlayJitter';

interface SceneTitleBurnInProps {
    scenes: Scene[];
    theme: Theme;
}

export const SceneTitleBurnIn: React.FC<SceneTitleBurnInProps> = ({
    scenes,
    theme,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    // Find current scene
    const currentScene = scenes.find(
        (s) => currentTime >= s.startTime && currentTime < s.endTime
    );

    if (!currentScene?.title) return null;

    // Show title only in the first 3.5 seconds of the scene
    const sceneLocalTime = currentTime - currentScene.startTime;
    const showDuration = 3.5; // seconds
    if (sceneLocalTime > showDuration) return null;

    const localFrame = Math.floor(sceneLocalTime * fps);

    // Entry: slide from left + fade in (first 0.8s)
    const slideIn = spring({
        frame: localFrame,
        fps,
        config: { damping: 18, stiffness: 100, mass: 0.7 },
    });

    // Accent line width animation
    const lineWidth = spring({
        frame: Math.max(0, localFrame - Math.floor(fps * 0.2)),
        fps,
        config: { damping: 15, stiffness: 80, mass: 0.5 },
    });

    // Exit: fade out (last 0.8s)
    const exitStart = Math.floor((showDuration - 0.8) * fps);
    const exitOpacity = interpolate(localFrame, [exitStart, Math.floor(showDuration * fps)], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

    // Scene number from id (e.g., "scene-5" → 5)
    const sceneNumber = parseInt(currentScene.id.replace(/\D/g, ''), 10) || 0;

    // Determine display text
    const chapterLabel = sceneNumber > 0 ? `Chapter ${sceneNumber}` : '';
    const titleText = currentScene.title;

    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 78000 }}>
            <div
                style={{
                    position: 'absolute',
                    bottom: '12%',
                    left: '5%',
                    opacity: exitOpacity,
                    transform: `translateX(${interpolate(slideIn, [0, 1], [-40, 0])}px)`,
                }}
            >
                <OverlayJitter intensity={0.01}>
                    {/* Backdrop */}
                    <div
                        style={{
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            background: 'rgba(0,0,0,0.4)',
                            borderRadius: '0 12px 12px 0',
                            padding: '14px 32px 14px 20px',
                            borderLeft: `3px solid ${theme.text.accent}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            opacity: slideIn,
                        }}
                    >
                        {/* Chapter label */}
                        {chapterLabel && (
                            <div
                                style={{
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: theme.text.accent,
                                    letterSpacing: 3,
                                    textTransform: 'uppercase',
                                }}
                            >
                                {chapterLabel}
                            </div>
                        )}

                        {/* Scene title */}
                        <div
                            style={{
                                fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                                fontSize: 22,
                                fontWeight: 500,
                                color: theme.text.primary,
                                letterSpacing: 0.5,
                                textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                            }}
                        >
                            {titleText}
                        </div>

                        {/* Description (if available) */}
                        {currentScene.description && (
                            <div
                                style={{
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: 14,
                                    color: theme.text.secondary,
                                    opacity: interpolate(localFrame, [fps * 0.5, fps * 1], [0, 0.75], {
                                        extrapolateLeft: 'clamp',
                                        extrapolateRight: 'clamp',
                                    }),
                                    maxWidth: 400,
                                }}
                            >
                                {currentScene.description}
                            </div>
                        )}
                    </div>
                </OverlayJitter>

                {/* Accent underline */}
                <div
                    style={{
                        height: 2,
                        width: lineWidth * 120,
                        background: `linear-gradient(90deg, ${theme.text.accent}, transparent)`,
                        marginTop: 4,
                        marginLeft: 20,
                        borderRadius: 1,
                    }}
                />
            </div>
        </AbsoluteFill>
    );
};
