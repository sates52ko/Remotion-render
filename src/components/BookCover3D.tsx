import React from 'react';
import {
    AbsoluteFill,
    Img,
    interpolate,
    useCurrentFrame,
    spring,
    useVideoConfig,
} from 'remotion';
import { Theme } from '../themes';

interface BookCover3DProps {
    coverSrc: string;
    theme: Theme;
    animationStyle?: 'float' | 'pulse' | 'rotate';
}

export const BookCover3D: React.FC<BookCover3DProps> = ({
    coverSrc,
    theme,
    animationStyle = 'float',
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Entry animation
    const entryProgress = spring({
        frame,
        fps,
        config: {
            damping: 20,
            stiffness: 80,
        },
    });

    // Continuous animations based on style
    const floatY = animationStyle === 'float'
        ? Math.sin(frame * 0.03) * 15
        : 0;

    const rotateY = animationStyle === 'rotate'
        ? interpolate(frame % 300, [0, 150, 300], [-5, 5, -5])
        : interpolate(frame % 600, [0, 300, 600], [-3, 3, -3]);

    const scale = animationStyle === 'pulse'
        ? 1 + Math.sin(frame * 0.05) * 0.03
        : 1;

    // Glow intensity varies with time
    const glowIntensity = interpolate(
        Math.sin(frame * 0.02),
        [-1, 1],
        [0.3, 0.8]
    );

    return (
        <AbsoluteFill
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                perspective: 1000,
            }}
        >
            {/* Book cover container with 3D transform */}
            <div
                style={{
                    position: 'relative',
                    transform: `
            translateY(${floatY}px)
            scale(${entryProgress * scale})
            rotateY(${rotateY}deg)
          `,
                    transformStyle: 'preserve-3d',
                    opacity: entryProgress,
                }}
            >
                {/* Glow effect behind cover */}
                <div
                    style={{
                        position: 'absolute',
                        inset: -30,
                        background: `radial-gradient(ellipse at center, ${theme.effects.glowColor}${Math.round(glowIntensity * 40).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
                        filter: 'blur(20px)',
                        transform: 'translateZ(-50px)',
                    }}
                />

                {/* Shadow */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: -40,
                        left: '10%',
                        right: '10%',
                        height: 60,
                        background: 'rgba(0,0,0,0.5)',
                        filter: 'blur(30px)',
                        transform: 'translateZ(-100px) rotateX(90deg)',
                        borderRadius: '50%',
                    }}
                />

                {/* Book cover image */}
                <div
                    style={{
                        maxWidth: 400,
                        maxHeight: 600,
                        borderRadius: 8,
                        overflow: 'hidden',
                        boxShadow: `
              0 20px 60px rgba(0,0,0,${theme.effects.shadowIntensity * 0.5}),
              0 0 0 1px rgba(255,255,255,0.1),
              inset 0 0 0 1px rgba(255,255,255,0.05)
            `,
                    }}
                >
                    <Img
                        src={coverSrc}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                </div>

                {/* Shine effect */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 8,
                        background: `linear-gradient(
              135deg,
              rgba(255,255,255,${0.1 + glowIntensity * 0.1}) 0%,
              transparent 50%,
              rgba(0,0,0,0.1) 100%
            )`,
                        pointerEvents: 'none',
                    }}
                />
            </div>
        </AbsoluteFill>
    );
};
