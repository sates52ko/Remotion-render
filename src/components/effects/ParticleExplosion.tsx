/**
 * ParticleExplosion — Burst/confetti/spark explosion effect
 *
 * Great for: dramatic reveals, plot twist moments, chapter titles,
 *            book rating reveals, "wow" moments in the video.
 *
 * Usage:
 *   <ParticleExplosion trigger={true} x="50%" y="50%" />
 *   <ParticleExplosion style="confetti" particleCount={80} colors={['#FFE600','#FF6B6B','#4ECDC4']} />
 *
 * Props:
 *   x              — explosion center X (default: '50%')
 *   y              — explosion center Y (default: '50%')
 *   style          — 'sparks' | 'confetti' | 'stars' | 'dots' (default: 'confetti')
 *   particleCount  — number of particles (default: 60)
 *   colors         — particle colors array (default: yellow/pink/cyan palette)
 *   speed          — explosion velocity multiplier (default: 1)
 *   gravity        — how fast particles fall (default: 1)
 *   size           — particle size multiplier (default: 1)
 *   seed           — random seed for reproducible animations (default: 42)
 */

import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, random } from 'remotion';

type ExplosionStyle = 'sparks' | 'confetti' | 'stars' | 'dots';

interface ParticleExplosionProps {
    x?: string | number;
    y?: string | number;
    style?: ExplosionStyle;
    particleCount?: number;
    colors?: string[];
    speed?: number;
    gravity?: number;
    size?: number;
    seed?: number;
}

interface Particle {
    id: number;
    angle: number;
    velocity: number;
    color: string;
    size: number;
    rotationSpeed: number;
    initialRotation: number;
    shape: 'circle' | 'rect' | 'star' | 'dots';
    wobble: number;
}

export const ParticleExplosion: React.FC<ParticleExplosionProps> = ({
    x = '50%',
    y = '50%',
    style: explosionStyle = 'confetti',
    particleCount = 60,
    colors = ['#FFE600', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FF9F43', '#A29BFE'],
    speed = 1,
    gravity = 1,
    size: sizeMultiplier = 1,
    seed = 42,
}) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();

    const particles = useMemo<Particle[]>(() => {
        return Array.from({ length: particleCount }, (_, i) => {
            const angle = random(`angle-${seed}-${i}`) * Math.PI * 2;
            const velocityBase = random(`vel-${seed}-${i}`) * 0.6 + 0.4;
            const shape =
                explosionStyle === 'confetti'
                    ? (['circle', 'rect', 'rect', 'rect'] as const)[Math.floor(random(`shape-${seed}-${i}`) * 4)]
                    : explosionStyle === 'stars'
                        ? 'star'
                        : explosionStyle === 'sparks'
                            ? 'rect'
                            : explosionStyle === 'dots'
                                ? 'dots'
                                : 'circle';
            return {
                id: i,
                angle,
                velocity: velocityBase * speed,
                color: colors[Math.floor(random(`color-${seed}-${i}`) * colors.length)],
                size: (random(`size-${seed}-${i}`) * 10 + 6) * sizeMultiplier,
                rotationSpeed: (random(`rot-${seed}-${i}`) - 0.5) * 20,
                initialRotation: random(`initrot-${seed}-${i}`) * 360,
                shape,
                wobble: random(`wob-${seed}-${i}`) * 3,
            };
        });
    }, [particleCount, seed, colors, speed, sizeMultiplier, explosionStyle]);

    const centerX = typeof x === 'number' ? x : parseFloat(x as string) / 100 * width;
    const centerY = typeof y === 'number' ? y : parseFloat(y as string) / 100 * height;

    // Duration: explosion lasts ~60 frames
    const duration = 60;
    const t = Math.min(frame / duration, 1);

    if (frame === 0 || frame > duration + 10) return null;

    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
            >
                {particles.map((p) => {
                    // Physics: velocity decreases, gravity pulls down
                    const vx = Math.cos(p.angle) * p.velocity * 400;
                    const vy = Math.sin(p.angle) * p.velocity * 400;
                    const grav = gravity * 600;

                    const px = centerX + vx * t + p.wobble * Math.sin(t * 10 + p.id) * 20;
                    const py = centerY + vy * t + 0.5 * grav * t * t;

                    const rotation = p.initialRotation + p.rotationSpeed * t * 20;
                    const opacity = interpolate(t, [0, 0.1, 0.8, 1], [0, 1, 1, 0], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    });

                    const currentSize = p.size * interpolate(t, [0, 0.1, 1], [0, 1.2, 0.5], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    });

                    if (p.shape === 'circle' || p.shape === 'dots') {
                        return (
                            <circle
                                key={p.id}
                                cx={px}
                                cy={py}
                                r={currentSize / 2}
                                fill={p.color}
                                opacity={opacity}
                            />
                        );
                    }

                    if (p.shape === 'star') {
                        const s = currentSize;
                        const path = `M0,${-s} L${s * 0.3},${-s * 0.3} L${s},0 L${s * 0.3},${s * 0.3} L0,${s} L${-s * 0.3},${s * 0.3} L${-s},0 L${-s * 0.3},${-s * 0.3}Z`;
                        return (
                            <path
                                key={p.id}
                                d={path}
                                fill={p.color}
                                opacity={opacity}
                                transform={`translate(${px},${py}) rotate(${rotation})`}
                            />
                        );
                    }

                    // rect (confetti strip)
                    return (
                        <rect
                            key={p.id}
                            x={-currentSize / 2}
                            y={-currentSize * 0.2}
                            width={currentSize}
                            height={currentSize * 0.4}
                            fill={p.color}
                            opacity={opacity}
                            transform={`translate(${px},${py}) rotate(${rotation})`}
                        />
                    );
                })}
            </svg>
        </AbsoluteFill>
    );
};
