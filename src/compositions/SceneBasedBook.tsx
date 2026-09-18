import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Audio, staticFile } from 'remotion';
import { z } from 'zod';
import { parseCaptions } from '../utils/srtParser';
import { CinematicSceneRenderer } from '../components/CinematicSceneRenderer';
import { YPPEnhancementLayer } from '../components/YPPEnhancementLayer';
import { CinematicOverlays } from '../components/effects/CinematicOverlays';
import { EmotionalArc } from '../components/overlays/EmotionalArc';
import { ChapterCard } from '../components/overlays/ChapterCard';
import { TypewriterQuote } from '../components/effects/TypewriterQuote';
import { AnimatedCaption } from '../components/AnimatedCaption';
import { ParticleBackground } from '../components/ParticleBackground';
import { pickVisualDNA, makeVideoSeed } from '../utils/videoSeedUtils';
import { AudioWaveform } from '../components/audio/AudioWaveform';
import { MusicVisualizer } from '../components/audio/MusicVisualizer';
import { GrandExit } from '../components/effects/GrandExit';
import { ThreeDBook } from '../components/magic/ThreeDBook';
import { EmotionalArcGraph } from '../components/magic/EmotionalArcGraph';
import { GradientText } from '../components/magic/GradientText';

const sceneBasedBookSchema = z.object({
    config: z.object({
        title: z.string(),
        author: z.string(),
        genre: z.string(),
        audioFile: z.string(),
        captionContent: z.string(),
        sceneConfig: z.any(),
        chapterCards: z.array(z.any()).optional(),
        typewriterQuotes: z.array(z.any()).optional(),
        emotionalArc: z.array(z.number()).optional(),
        emotionalArcLabels: z.array(z.string()).optional(),
        channelName: z.string().optional(),
        letterbox: z.boolean().optional(),
    }),
});

export type SceneBasedBookProps = z.infer<typeof sceneBasedBookSchema>;

export const SceneBasedBook: React.FC<SceneBasedBookProps> = ({ config }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    // Parse all captions once (memoized). Performance: parsing 335KB VTT to object takes ~10-20ms.
    const allCaptions = React.useMemo(() => {
        return parseCaptions(config.captionContent);
    }, [config.captionContent]);

    // Use a window of captions for the current time to keep component updates fast
    const windowedCaptions = React.useMemo(() => {
        const windowStart = currentTime - 60; // 1 minute before
        const windowEnd = currentTime + 60;   // 1 minute after
        return allCaptions.filter(c => 
            (c.startTime >= windowStart && c.startTime <= windowEnd) ||
            (c.endTime >= windowStart && c.endTime <= windowEnd)
        );
    }, [allCaptions, currentTime]);

    const videoSeed = React.useMemo(() => makeVideoSeed(config.title, config.author), [config.title, config.author]);
    const visualDNA = React.useMemo(() => pickVisualDNA(videoSeed), [videoSeed]);

    const theme = React.useMemo(() => ({
        name: visualDNA.name,
        background: {
            gradient: [visualDNA.colors.accent, '#000000'] as [string, string],
            particleColor: visualDNA.colors.glow,
        },
        text: {
            primary: visualDNA.colors.text,
            secondary: visualDNA.colors.accent,
            accent: visualDNA.colors.accent,
        },
        caption: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            textColor: '#ffffff',
            highlightColor: visualDNA.colors.accent,
        },
        effects: {
            glowColor: visualDNA.colors.glow,
            shadowIntensity: 0.8,
        }
    }), [visualDNA]);

    const sceneConfig = React.useMemo(() => config.sceneConfig || { scenes: [] }, [config]);
    const currentSceneIndex = React.useMemo(() => {
        return (sceneConfig.scenes || []).findIndex((s: any) => currentTime >= s.startTime && currentTime <= s.endTime);
    }, [currentTime, sceneConfig.scenes]);

    const currentScene = currentSceneIndex >= 0 ? sceneConfig.scenes[currentSceneIndex] : null;
    const totalScenes = sceneConfig.scenes?.length || 0;

    // Extract dynamic keywords from current captions for YPP layer
    const currentKeywords = React.useMemo(() => {
        const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'and', 'but', 'or', 'if', 'so', 'not', 'it', 'its', 'this', 'that', 'he', 'she', 'they', 'we', 'you', 'me', 'my', 'his', 'her', 'our', 'your', 'their', 'what', 'which', 'who', 'how', 'about', 'just', 'like', 'know', 'said', 'says']);
        const windowCaptions = windowedCaptions
            .filter(c => c.startTime >= currentTime - 5 && c.startTime <= currentTime + 5)
            .map(c => c.text)
            .join(' ');
        const words = windowCaptions.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
            .filter(w => w.length > 3 && !STOP.has(w));
        const freq: Record<string, number> = {};
        words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w.toUpperCase());
    }, [windowedCaptions, currentTime]);

    return (
        <AbsoluteFill style={{ backgroundColor: theme.background.gradient[0] }}>
            <Audio src={staticFile(config.audioFile)} />

            {/* Particle Background */}
            <ParticleBackground
                theme={theme}
                variant={visualDNA.particleVariant}
                seed={String(videoSeed)}
            />
            

            {/* Cinematic Rendering */}
            {currentScene?.showThreeD ? (
                <ThreeDBook 
                    title={config.title}
                    coverImage={currentScene?.assets?.[0]?.path} 
                />
            ) : (
                currentScene && (
                    <CinematicSceneRenderer
                        scene={currentScene}
                        opacity={1}
                    />
                )
            )}

            {/* Cinematic Overlays — Letterbox, Light Leaks, Vignette */}
            <CinematicOverlays
                theme={theme}
                currentTime={currentTime}
                sceneIndex={currentSceneIndex >= 0 ? currentSceneIndex : 0}
                totalScenes={totalScenes}
                letterbox={config.letterbox !== false}
                letterboxIntensity={0.5}
            />

            {/* Enhancement Layer */}
            <YPPEnhancementLayer
                theme={theme}
                currentTime={currentTime}
                totalDuration={allCaptions[allCaptions.length - 1]?.endTime || 300}
                seed={videoSeed}
                sceneIndex={currentSceneIndex >= 0 ? currentSceneIndex : 0}
                totalScenes={totalScenes}
                channelName={config.channelName}
                currentKeywords={currentKeywords}
            />

            {/* Emotional Arc */}
            {config.emotionalArc && (
                <div style={{ zIndex: 110000 }}>
                    <EmotionalArcGraph
                        data={config.emotionalArc}
                        labels={config.emotionalArcLabels || []}
                    />
                </div>
            )}

            {/* Chapter Cards */}
            <div style={{ zIndex: 120000 }}>
                {config.chapterCards && (
                    <ChapterCard
                        cards={config.chapterCards}
                        theme={theme}
                        seed={videoSeed}
                    />
                )}
            </div>

            {/* Typewriter Quotes */}
            <div style={{ zIndex: 130000 }}>
                {config.typewriterQuotes && (
                    <TypewriterQuote
                        quotes={config.typewriterQuotes}
                        theme={theme}
                    />
                )}
            </div>

            {/* Animated Captions */}
            <div style={{ zIndex: 140000 }}>
                <AnimatedCaption
                    captions={windowedCaptions}
                    theme={theme}
                    style={visualDNA.captionStyle}
                />
            </div>

            {/* Audio Visualizers */}
            {visualDNA.audioVisual && (
                <>
                    {/* Top Waveform (Mirror style) */}
                    <div style={{ position: 'absolute', top: 100, width: '100%', zIndex: 150000, opacity: visualDNA.audioVisual.waveOpacity ?? 0.8 }}>
                        <AudioWaveform
                            audioSrc={staticFile(config.audioFile)}
                            color={theme.text.accent}
                            height={visualDNA.audioVisual.waveformHeight ?? 80}
                            strokeWidth={visualDNA.audioVisual.waveformStrokeWidth ?? 3}
                            mirror={true}
                        />
                    </div>

                    {/* Bottom Spectrum Bars */}
                    <div style={{ position: 'absolute', bottom: 80, width: '100%', zIndex: 150000, opacity: visualDNA.audioVisual.barOpacity ?? 0.7 }}>
                        <MusicVisualizer
                            audioSrc={staticFile(config.audioFile)}
                            color={theme.text.accent}
                            accentColor={visualDNA.colors.glow}
                            height={visualDNA.audioVisual.visualizerHeight ?? 60}
                            barCount={visualDNA.audioVisual.visualizerBarCount ?? 64}
                            visualStyle={visualDNA.audioVisual.visualizerStyle ?? 'mirror'}
                        />
                    </div>
                </>
            )}

            {/* Grand Exit (Starts 5 seconds before the end) */}
            <GrandExit
                theme={theme}
                triggerTime={allCaptions[allCaptions.length - 1]?.endTime - 5 || 300}
                channelName={config.channelName || 'NARRATIVE LABS'}
            />
        </AbsoluteFill>
    );
};

export { sceneBasedBookSchema };
