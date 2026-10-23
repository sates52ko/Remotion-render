import React from 'react';
import {
    AbsoluteFill,
    Audio,
    Sequence,
    useVideoConfig,
    useCurrentFrame,
    staticFile,
    interpolate,
    random,
} from 'remotion';
import { z } from 'zod';
import { parseSRT } from '../utils/srtParser';
import { AnimatedCaption } from '../components/AnimatedCaption';
import { ParticleBackground } from '../components/ParticleBackground';
import { AudioWaveform, MusicVisualizer } from '../components/audio';
import { getTheme } from '../themes';

// Schema for composition props
const bookConfigSchema = z.object({
    title: z.string(),
    author: z.string(),
    genre: z.string(),
    audioFile: z.string(),
    srtContent: z.string(),
    testDuration: z.number().optional(), // Duration in seconds for test renders
});

export const seeingOtherPeopleSchema = z.object({
    config: bookConfigSchema,
});

export type BookConfig = z.infer<typeof bookConfigSchema>;
export type SeeingOtherPeopleProps = z.infer<typeof seeingOtherPeopleSchema>;

// Main Book Summary Component
export const SeeingOtherPeople: React.FC<SeeingOtherPeopleProps> = ({ config }) => {
    const { fps } = useVideoConfig();
    const frame = useCurrentFrame();

    // Parse captions
    const captions = React.useMemo(() => parseSRT(config.srtContent), [config.srtContent]);

    // Get theme based on genre
    const theme = getTheme(config.genre);

    // Deterministic waveform type based on audio file name
    // Each video gets one consistent style — 0: waveform bars, 1: waveform line, 2: music bars, 3: music rounded
    const waveformSeed = random(config.audioFile);
    const waveformType = Math.floor(waveformSeed * 4); // 0-3
    const accentColor = theme.effects.glowColor ?? '#FFE600';

    // Calculate fade in/out
    const fadeIn = interpolate(frame, [0, fps * 1], [0, 1], {
        extrapolateRight: 'clamp',
    });

    // Book title display (first 5 seconds)
    const titleOpacity = interpolate(frame, [0, fps * 3, fps * 5], [1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

    const titleScale = interpolate(frame, [0, fps * 3], [0.8, 1], {
        extrapolateRight: 'clamp',
    });

    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            {/* Animated Background with Particles */}
            <ParticleBackground
                theme={theme}
                particleCount={50}
                seed="seeing-other-people"
            />

            {/* Book Title & Author - First 5 seconds */}
            {titleOpacity > 0 && (
                <AbsoluteFill
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        opacity: titleOpacity,
                        transform: `scale(${titleScale})`,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(10px)',
                    }}
                >
                    <h1
                        style={{
                            fontSize: 80,
                            fontWeight: 900,
                            color: theme.text.primary,
                            textAlign: 'center',
                            margin: 0,
                            marginBottom: 20,
                            textShadow: `0 0 40px ${theme.effects.glowColor}`,
                            fontFamily: 'Inter, system-ui, sans-serif',
                        }}
                    >
                        {config.title}
                    </h1>
                    <p
                        style={{
                            fontSize: 40,
                            color: theme.text.secondary,
                            margin: 0,
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 300,
                        }}
                    >
                        by {config.author}
                    </p>
                </AbsoluteFill>
            )}

            {/* Audio */}
            <Audio src={staticFile(config.audioFile)} />

            {/* Waveform Visualizer — bottom bar above captions */}
            {/* Each video gets a consistent random style based on the audio file name */}
            <AbsoluteFill style={{ pointerEvents: 'none' }}>
                <div style={{
                    position: 'absolute',
                    bottom: 160,   // sits above the caption bar
                    left: '50%',
                    transform: 'translateX(-50%)',
                    opacity: 0.55,
                }}>
                    {waveformType < 2 ? (
                        <AudioWaveform
                            audioSrc={staticFile(config.audioFile)}
                            color={accentColor}
                            height={60}
                        />
                    ) : (
                        <MusicVisualizer
                            audioSrc={staticFile(config.audioFile)}
                            color={accentColor}
                            accentColor={accentColor}
                            height={60}
                            barCount={32}
                            visualStyle={waveformType === 2 ? 'bars' : 'rounded'}
                        />
                    )}
                </div>
            </AbsoluteFill>

            {/* Animated Captions */}
            <Sequence from={0}>
                <AnimatedCaption
                    captions={captions}
                    theme={theme}
                    style="tiktok"
                    position="bottom"
                    fontSize={56}
                    maxWordsPerLine={4}
                />
            </Sequence>

            {/* Fade in overlay */}
            <AbsoluteFill
                style={{
                    backgroundColor: '#000',
                    opacity: 1 - fadeIn,
                    pointerEvents: 'none',
                }}
            />
        </AbsoluteFill>
    );
};
