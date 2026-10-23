/**
 * PixelTransition — Pixelated dissolve / reveal transition overlay
 *
 * Great for: scene transitions, start/end of sections, dramatic reveals
 *
 * Usage:
 *   // As an entrance reveal (pixels disappear):
 *   <PixelTransition direction="out" duration={30} />
 *
 *   // As an exit dissolve (pixels appear and cover):
 *   <PixelTransition direction="in" duration={30} color="#000000" />
 *
 * Props:
 *   direction   — 'in' (cover) | 'out' (reveal) (default: 'out')
 *   duration    — transition duration in frames (default: 30)
 *   color       — pixel color (default: '#000000')
 *   pixelSize   — block size in px (default: 40)
 *   delay       — start delay in frames (default: 0)
 *   randomOrder — randomize pixel reveal order (default: true)
 *   seed        — random seed (default: 1)
 */
import React, { useMemo } from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';

interface PixelTransitionProps {
    direction?: 'in' | 'out';
    duration?: number;
    color?: string;
    pixelSize?: number;
    delay?: number;
    randomOrder?: boolean;
    seed?: number;
}

export const PixelTransition: React.FC<PixelTransitionProps> = ({
    direction = 'out',
    duration = 30,
    color = '#000000',
    pixelSize = 40,
    delay = 0,
    randomOrder = true,
    seed = 1,
}) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();

    const cols = Math.ceil(width / pixelSize);
    const rows = Math.ceil(height / pixelSize);
    const totalPixels = cols * rows;

    // Pre-compute pixel reveal order
    const pixelOrder = useMemo(() => {
        if (!randomOrder) return Array.from({ length: totalPixels }, (_, i) => i);
        return Array.from({ length: totalPixels }, (_, i) => ({
            i,
            r: random(`px-${seed}-${i}`),
        }))
            .sort((a, b) => a.r - b.r)
            .map((x) => x.i);
    }, [totalPixels, randomOrder, seed]);

    const adjustedFrame = Math.max(0, frame - delay);
    const progress = Math.min(adjustedFrame / duration, 1);

    // How many pixels are revealed at this frame
    const revealedCount = Math.round(progress * totalPixels);

    const revealedSet = useMemo(() => {
        return new Set(pixelOrder.slice(0, revealedCount));
    }, [pixelOrder, revealedCount]);

    if (direction === 'out' && progress >= 1) return null;
    if (direction === 'in' && adjustedFrame === 0) return null;

    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                viewBox={`0 0 ${width} ${height}`}
            >
                {Array.from({ length: totalPixels }, (_, idx) => {
                    const col = idx % cols;
                    const row = Math.floor(idx / cols);
                    const isRevealed = revealedSet.has(idx);

                    // 'out' = pixels disappear (start solid, become transparent)
                    // 'in' = pixels appear (start transparent, become solid)
                    const isVisible = direction === 'out' ? !isRevealed : isRevealed;
                    if (!isVisible) return null;

                    return (
                        <rect
                            key={idx}
                            x={col * pixelSize}
                            y={row * pixelSize}
                            width={pixelSize + 1}
                            height={pixelSize + 1}
                            fill={color}
                        />
                    );
                })}
            </svg>
        </AbsoluteFill>
    );
};
