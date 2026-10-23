import React from 'react';
import {
    AbsoluteFill,
    Audio,
    Sequence,
    OffthreadVideo,
    Img,
    useVideoConfig,
    useCurrentFrame,
    staticFile,
    interpolate,
    spring,
} from 'remotion';
import { z } from 'zod';
import { getTheme } from '../themes';
import { parseSRT } from '../utils/srtParser';
import { ParticleBackground } from '../components/ParticleBackground';
import { AnimatedCaption } from '../components/AnimatedCaption';

// Zod schema for type-safe props
export const bookConfigSchema = z.object({
    title: z.string(),
    author: z.string(),
    genre: z.string(),
    images: z.array(z.string()), // Array of image paths
    introVideo: z.string().optional(),
    audioFile: z.string(),
    srtContent: z.string(),
    introDuration: z.number(),
    audioOffset: z.number().optional(), // Audio sync correction in seconds
});

export const bookSummarySchema = z.object({
    config: bookConfigSchema,
});

// Type inference from schema
export type BookConfig = z.infer<typeof bookConfigSchema>;
export type BookSummaryProps = z.infer<typeof bookSummarySchema>;

// Animated Image Component with Varied Effects
const VariedAnimatedImage: React.FC<{
    src: string;
    theme: ReturnType<typeof getTheme>;
    index: number;
    totalImages: number;
}> = ({ src, theme, index }) => {
    const frame = useCurrentFrame();
    const { fps, durationInFrames } = useVideoConfig();

    // Determine effect based on index to ensure variety
    // 0: Zoom In, 1: Pan Left, 2: Zoom Out, 3: Pan Right, 4: Rotate & Scale
    const effectType = index % 5;

    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let rotate = 0;

    const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });

    switch (effectType) {
        case 0: // Slow Zoom In
            scale = interpolate(progress, [0, 1], [1, 1.15]);
            break;
        case 1: // Pan Left (Cinematic)
            scale = 1.1; // Start slightly zoomed
            translateX = interpolate(progress, [0, 1], [20, -20]);
            break;
        case 2: // Slow Zoom Out
            scale = interpolate(progress, [0, 1], [1.15, 1]);
            break;
        case 3: // Pan Right
            scale = 1.1;
            translateX = interpolate(progress, [0, 1], [-20, 20]);
            break;
        case 4: // Subtle Rotate & Scale
            scale = interpolate(progress, [0, 1], [1, 1.05]);
            rotate = interpolate(progress, [0, 1], [-1.5, 1.5]);
            break;
        default: // Default Zoom
            scale = interpolate(progress, [0, 1], [1, 1.1]);
    }

    // Fade in animation
    const opacity = spring({
        frame,
        fps,
        config: { damping: 30, stiffness: 80 },
    });

    // Glow pulse effect
    const glowIntensity = interpolate(Math.sin(frame * 0.02), [-1, 1], [0.2, 0.5]);

    return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
            {/* Glow behind image */}
            <div
                style={{
                    position: 'absolute',
                    width: '80%',
                    height: '80%',
                    background: `radial-gradient(ellipse at center, ${theme.effects.glowColor}${Math.round(glowIntensity * 50).toString(16).padStart(2, '0')} 0%, transparent 65%)`,
                    filter: 'blur(50px)',
                }}
            />
            {/* Main image container */}
            <div
                style={{
                    width: '80%',
                    height: '75%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    opacity,
                    transform: `scale(${scale}) translateX(${translateX}px) translateY(${translateY}px) rotate(${rotate}deg)`,
                }}
            >
                <Img
                    src={src}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        borderRadius: 12,
                        boxShadow: `0 25px 70px rgba(0,0,0,0.5), 0 0 50px ${theme.effects.glowColor}25`,
                    }}
                />
            </div>
        </AbsoluteFill>
    );
};

export const BookSummary: React.FC<BookSummaryProps> = ({ config }) => {
    const { fps, durationInFrames } = useVideoConfig();

    const theme = getTheme(config.genre);
    const captions = parseSRT(config.srtContent);

    const introDurationFrames = (config.introDuration || 0) * fps;
    const offsetInFrames = (config.audioOffset || 0) * fps;

    // Calculate image display segments
    // Main content duration should exclude intro
    // If intro exists, we start images AND audio after intro.
    const mainContentFrames = durationInFrames - (config.introVideo ? introDurationFrames : 0);
    const framesPerImage = Math.floor(mainContentFrames / config.images.length);

    const seed = config.title.toLowerCase().replace(/\s/g, '');

    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            {/* INTRO SECTION */}
            {config.introVideo && (
                <Sequence durationInFrames={introDurationFrames}>
                    <OffthreadVideo
                        src={staticFile(config.introVideo)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </Sequence>
            )}

            {/* MAIN CONTENT SECTION */}
            <Sequence from={config.introVideo ? introDurationFrames : 0}>

                {/* Visuals Layer */}
                <AbsoluteFill>
                    <ParticleBackground theme={theme} seed={seed} particleCount={60} />

                    {config.images.map((imagePath, index) => (
                        <Sequence
                            key={index}
                            from={index * framesPerImage}
                            durationInFrames={framesPerImage}
                        >
                            <VariedAnimatedImage
                                src={staticFile(imagePath)}
                                theme={theme}
                                index={index}
                                totalImages={config.images.length}
                            />
                        </Sequence>
                    ))}
                </AbsoluteFill>

                {/* Audio & Caption Layer - with optional offset correction */}
                {/* We shift the START of this sequence by offsetInFrames. 
                    If audioOffset is positive (e.g. 1s), audio starts 1s LATER.
                    If negative, it starts earlier (might clip start).
                    Usually caption mismatch is delay.
                 */}
                <Sequence from={offsetInFrames}>
                    <Audio src={staticFile(config.audioFile)} />

                    <AnimatedCaption
                        captions={captions}
                        theme={theme}
                        style="karaoke"
                        position="bottom"
                        fontSize={44}
                    />
                </Sequence>

                {/* Book info overlay */}
                <AbsoluteFill style={{ pointerEvents: 'none' }}>
                    <div
                        style={{
                            position: 'absolute',
                            top: 30,
                            left: 30,
                            padding: '12px 20px',
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            borderRadius: 10,
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${theme.text.accent}30`,
                        }}
                    >
                        <h2 style={{ margin: 0, fontSize: 24, color: theme.text.primary, fontFamily: 'Inter, sans-serif' }}>
                            {config.title}
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: 16, color: theme.text.secondary, fontFamily: 'Inter, sans-serif' }}>
                            by {config.author}
                        </p>
                    </div>
                </AbsoluteFill>

            </Sequence>
        </AbsoluteFill>
    );
};
