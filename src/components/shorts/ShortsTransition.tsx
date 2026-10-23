import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    random,
} from 'remotion';
import type { ShortsTransitionType } from '../../types/shorts';

interface ShortsTransitionProps {
    type: ShortsTransitionType;
    /** Duration of the transition in frames */
    durationInFrames: number;
}

/**
 * ShortsTransition — Quick, punchy transitions between segments.
 * Designed for fast-paced Shorts/Reels (0.3–0.5s).
 */
export const ShortsTransition: React.FC<ShortsTransitionProps> = ({
    type,
    durationInFrames,
}) => {
    const frame = useCurrentFrame();
    useVideoConfig(); // touch for Remotion internals
    const progress = frame / durationInFrames;

    switch (type) {
        case 'whiteFlash': {
            const flashOpacity = interpolate(
                progress,
                [0, 0.3, 0.5, 1],
                [0, 1, 1, 0],
                { extrapolateRight: 'clamp' }
            );
            return (
                <AbsoluteFill
                    style={{
                        backgroundColor: '#fff',
                        opacity: flashOpacity,
                        zIndex: 100,
                    }}
                />
            );
        }

        case 'glitch': {
            const intensity = interpolate(progress, [0, 0.5, 1], [0, 1, 0], {
                extrapolateRight: 'clamp',
            });
            const sliceCount = 8;
            return (
                <AbsoluteFill style={{ zIndex: 100, overflow: 'hidden' }}>
                    {Array.from({ length: sliceCount }).map((_, i) => {
                        const yPos = (i / sliceCount) * 100;
                        const h = 100 / sliceCount;
                        const offsetX = random(`glitch-${i}-${frame}`) * 60 * intensity - 30 * intensity;
                        return (
                            <div
                                key={i}
                                style={{
                                    position: 'absolute',
                                    top: `${yPos}%`,
                                    left: `${offsetX}px`,
                                    width: '100%',
                                    height: `${h}%`,
                                    backgroundColor:
                                        random(`glitch-color-${i}`) > 0.7
                                            ? `rgba(${random(`r-${i}`) > 0.5 ? 255 : 0}, ${random(`g-${i}`) > 0.5 ? 255 : 0}, 255, ${intensity * 0.4})`
                                            : 'transparent',
                                }}
                            />
                        );
                    })}
                </AbsoluteFill>
            );
        }

        case 'zoom': {
            const scale = interpolate(progress, [0, 0.5, 1], [1, 1.8, 1], {
                extrapolateRight: 'clamp',
            });
            const opacity = interpolate(progress, [0, 0.3, 0.7, 1], [0, 1, 1, 0], {
                extrapolateRight: 'clamp',
            });
            return (
                <AbsoluteFill
                    style={{
                        backgroundColor: '#000',
                        opacity,
                        transform: `scale(${scale})`,
                        zIndex: 100,
                    }}
                />
            );
        }

        case 'slide': {
            const slideX = interpolate(progress, [0, 1], [100, -100], {
                extrapolateRight: 'clamp',
            });
            return (
                <AbsoluteFill
                    style={{
                        backgroundColor: '#111',
                        transform: `translateX(${slideX}%)`,
                        zIndex: 100,
                    }}
                />
            );
        }

        case 'crossfade': {
            const fadeOpacity = interpolate(progress, [0, 0.5, 1], [0, 0.8, 0], {
                extrapolateRight: 'clamp',
            });
            return (
                <AbsoluteFill
                    style={{
                        backgroundColor: '#000',
                        opacity: fadeOpacity,
                        zIndex: 100,
                    }}
                />
            );
        }

        case 'none':
        default:
            return null;
    }
};

/**
 * Pick a random transition type, ensuring variety.
 * Simple round-robin through the available types.
 */
const TRANSITION_POOL: ShortsTransitionType[] = [
    'whiteFlash',
    'glitch',
    'zoom',
    'crossfade',
    'slide',
];

export function pickTransition(index: number): ShortsTransitionType {
    return TRANSITION_POOL[index % TRANSITION_POOL.length];
}
