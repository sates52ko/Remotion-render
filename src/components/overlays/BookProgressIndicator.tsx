import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
} from 'remotion';
import { Theme } from '../../themes';

interface BookProgressIndicatorProps {
    /** Total number of chapters/sections in the book */
    totalChapters: number;
    /** Current scene index (0-based) */
    currentSceneIndex: number;
    /** Total number of scenes */
    totalScenes: number;
    theme: Theme;
    /** Chapter titles (optional) */
    chapterTitles?: string[];
    /** Display style */
    variant?: 'bar' | 'pages' | 'dots';
}

export const BookProgressIndicator: React.FC<BookProgressIndicatorProps> = ({
    totalChapters,
    currentSceneIndex,
    totalScenes,
    theme,
    chapterTitles,
    variant = 'bar',
}) => {
    const frame = useCurrentFrame();
    const { fps, durationInFrames } = useVideoConfig();

    // Overall video progress 0–1
    const progress = frame / durationInFrames;

    // Entry animation (delayed 2s)
    const entryOpacity = interpolate(frame, [fps * 2, fps * 3], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

    // Exit animation (last 3s)
    const exitOpacity = interpolate(
        frame,
        [durationInFrames - fps * 3, durationInFrames - fps * 1],
        [1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const opacity = entryOpacity * exitOpacity * 0.8;

    // Which chapter are we in based on progress
    const currentChapter = Math.min(
        Math.floor(progress * totalChapters),
        totalChapters - 1
    );

    // Pages read (approximate)
    const approxPage = Math.floor(progress * 100);

    if (variant === 'bar') {
        return (
            <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 76000 }}>
                {/* Left vertical progress bar */}
                <div
                    style={{
                        position: 'absolute',
                        left: 24,
                        top: '15%',
                        height: '70%',
                        width: 4,
                        borderRadius: 2,
                        background: 'rgba(255,255,255,0.06)',
                        opacity,
                    }}
                >
                    {/* Filled portion */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${progress * 100}%`,
                            borderRadius: 2,
                            background: `linear-gradient(180deg, ${theme.text.accent}66, ${theme.text.accent})`,
                            boxShadow: `0 0 8px ${theme.text.accent}44`,
                            transition: 'height 0.3s ease',
                        }}
                    />

                    {/* Chapter markers */}
                    {Array.from({ length: totalChapters }).map((_, i) => {
                        const markerPos = (i / totalChapters) * 100;
                        const isReached = progress >= i / totalChapters;
                        return (
                            <div
                                key={i}
                                style={{
                                    position: 'absolute',
                                    top: `${markerPos}%`,
                                    left: -4,
                                    width: 12,
                                    height: 12,
                                    borderRadius: '50%',
                                    background: isReached ? theme.text.accent : 'rgba(255,255,255,0.1)',
                                    border: `2px solid ${isReached ? theme.text.accent : 'rgba(255,255,255,0.15)'}`,
                                    transform: 'translateY(-50%)',
                                    boxShadow: isReached ? `0 0 6px ${theme.text.accent}66` : 'none',
                                    transition: 'all 0.3s ease',
                                }}
                            />
                        );
                    })}

                    {/* Current position dot (animated) */}
                    <div
                        style={{
                            position: 'absolute',
                            top: `${progress * 100}%`,
                            left: -3,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: theme.text.accent,
                            transform: 'translateY(-50%)',
                            boxShadow: `0 0 12px ${theme.text.accent}, 0 0 24px ${theme.text.accent}44`,
                        }}
                    />
                </div>

                {/* Book icon + page counter (top-left) */}
                <div
                    style={{
                        position: 'absolute',
                        left: 16,
                        top: '11%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity,
                    }}
                >
                    <span style={{ fontSize: 16 }}>📖</span>
                    <span
                        style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 11,
                            fontWeight: 600,
                            color: theme.text.secondary,
                            letterSpacing: 1,
                        }}
                    >
                        {`${approxPage}%`}
                    </span>
                </div>
            </AbsoluteFill>
        );
    }

    if (variant === 'pages') {
        return (
            <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 76000 }}>
                <div
                    style={{
                        position: 'absolute',
                        top: 24,
                        right: 28,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        opacity,
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 20,
                        padding: '8px 16px',
                        border: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    <span style={{ fontSize: 16 }}>📖</span>
                    <span
                        style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 14,
                            fontWeight: 600,
                            color: theme.text.primary,
                        }}
                    >
                        {currentChapter + 1}
                    </span>
                    <span
                        style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 12,
                            color: theme.text.secondary,
                        }}
                    >
                        / {totalChapters}
                    </span>
                    {chapterTitles && chapterTitles[currentChapter] && (
                        <>
                            <div
                                style={{
                                    width: 1,
                                    height: 16,
                                    background: 'rgba(255,255,255,0.1)',
                                }}
                            />
                            <span
                                style={{
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: 12,
                                    color: theme.text.secondary,
                                    fontStyle: 'italic',
                                    maxWidth: 200,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {chapterTitles[currentChapter]}
                            </span>
                        </>
                    )}
                </div>
            </AbsoluteFill>
        );
    }

    // Variant: dots
    return (
        <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 76000 }}>
            <div
                style={{
                    position: 'absolute',
                    right: 24,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    opacity,
                }}
            >
                {Array.from({ length: totalChapters }).map((_, i) => {
                    const isActive = currentChapter === i;
                    const isReached = progress >= i / totalChapters;

                    return (
                        <div
                            key={i}
                            style={{
                                width: isActive ? 8 : 5,
                                height: isActive ? 22 : 5,
                                borderRadius: isActive ? 4 : '50%',
                                background: isActive
                                    ? theme.text.accent
                                    : isReached
                                        ? `${theme.text.accent}88`
                                        : 'rgba(255,255,255,0.15)',
                                boxShadow: isActive
                                    ? `0 0 10px ${theme.text.accent}66`
                                    : 'none',
                                transition: 'all 0.3s ease',
                            }}
                        />
                    );
                })}
            </div>
        </AbsoluteFill>
    );
};
