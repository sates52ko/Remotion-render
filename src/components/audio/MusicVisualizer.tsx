/**
 * MusicVisualizer — Music spectrum bar visualizer (CapCut / music template style)
 *
 * Usage:
 *   <MusicVisualizer audioSrc={staticFile('audio/song.mp3')} />
 *
 * Props:
 *   audioSrc        — path to audio file (use staticFile())
 *   barCount        — number of spectrum bars (default: 64)
 *   color           — bar base color (default: '#6c63ff')
 *   accentColor     — highlight color for tall bars (default: '#ff6584')
 *   height          — container height in px (default: 200)
 *   visualStyle     — 'bars' | 'rounded' | 'mirror' (default: 'mirror')
 *   noiseAmount     — organic noise on bars 0-1 (default: 0.15)
 *   containerStyle  — optional container style override
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useWindowedAudioData, visualizeAudio } from '@remotion/media-utils';
import { noise2D } from '@remotion/noise';

type VisualizerStyle = 'bars' | 'rounded' | 'mirror';

interface MusicVisualizerProps {
    audioSrc: string;
    audioData?: any; // Pre-fetched audio data
    dataOffsetInSeconds?: number;
    barCount?: number;
    color?: string;
    accentColor?: string;
    height?: number;
    visualStyle?: VisualizerStyle;
    noiseAmount?: number;
    containerStyle?: React.CSSProperties;
}

export const MusicVisualizer: React.FC<MusicVisualizerProps> = ({
    audioSrc,
    audioData: preAudioData,
    dataOffsetInSeconds: preDataOffset,
    barCount = 64,
    color = '#6c63ff',
    accentColor = '#ff6584',
    height = 200,
    visualStyle = 'mirror',
    noiseAmount = 0.15,
    containerStyle,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const time = frame / fps;

    // Use pre-fetched data if available, otherwise fetch internal
    const internalAudio = useWindowedAudioData({
        src: audioSrc,
        frame,
        fps,
        windowInSeconds: 1 / fps,
    });

    const audioData = preAudioData ?? internalAudio.audioData;
    const dataOffsetInSeconds = preDataOffset ?? internalAudio.dataOffsetInSeconds;

    let frequencyData: number[] = [];

    if (audioData) {
        frequencyData = visualizeAudio({
            audioData,
            frame,
            fps,
            numberOfSamples: barCount,
            dataOffsetInSeconds,
        });
    } else {
        // ── Fallback: Dynamic Noise ──────────────────────────────────────────
        for (let i = 0; i < barCount; i++) {
            const t = i / barCount;
            const n1 = noise2D('bar1', t * 4, time * 2) * 0.4;
            const n2 = noise2D('bar2', t * 8, time * 3.5) * 0.3;
            const n3 = Math.sin(t * Math.PI * 4 + time * 5) * 0.2;
            const pulse = Math.sin(time * Math.PI * 2) * 0.1;
            const freqWeight = t < 0.3 ? 1.0 : t < 0.6 ? 0.8 : 0.5;
            frequencyData.push(Math.max(0.05, Math.min(1, (n1 + n2 + n3 + pulse) * freqWeight + 0.3)));
        }
    }

    const barWidth = 100 / barCount;
    const gap = barWidth * 0.15;

    return (
        <div
            style={{
                width: '100%',
                height,
                display: 'flex',
                alignItems: 'flex-end',
                overflow: 'hidden',
                ...containerStyle,
            }}
        >
            {frequencyData.map((value, i) => {
                const noiseVal = noise2D('bar', i / barCount, frame / 60);
                const noisedValue = Math.max(0, Math.min(1, value + noiseVal * noiseAmount));
                const barHeightPct = noisedValue * 100;
                const isAccent = noisedValue > 0.7;
                const barColor = isAccent ? accentColor : color;

                if (visualStyle === 'mirror') {
                    return (
                        <div
                            key={i}
                            style={{
                                width: `${barWidth - gap}%`,
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: `${gap}%`,
                            }}
                        >
                            <div style={{
                                width: '100%',
                                height: `${barHeightPct / 2}%`,
                                background: `linear-gradient(to top, ${barColor}, ${accentColor}88)`,
                                borderRadius: '3px 3px 0 0',
                                marginBottom: 1,
                            }} />
                            <div style={{
                                width: '100%',
                                height: `${barHeightPct / 2}%`,
                                background: `linear-gradient(to bottom, ${barColor}, ${barColor}44)`,
                                borderRadius: '0 0 3px 3px',
                                opacity: 0.6,
                            }} />
                        </div>
                    );
                }

                if (visualStyle === 'rounded') {
                    return (
                        <div
                            key={i}
                            style={{
                                width: `${barWidth - gap}%`,
                                height: `${Math.max(2, barHeightPct)}%`,
                                background: `linear-gradient(to top, ${barColor}, ${accentColor})`,
                                borderRadius: '4px',
                                marginRight: `${gap}%`,
                                alignSelf: 'flex-end',
                                boxShadow: isAccent ? `0 0 8px ${accentColor}88` : 'none',
                            }}
                        />
                    );
                }

                // Default: 'bars'
                return (
                    <div
                        key={i}
                        style={{
                            width: `${barWidth - gap}%`,
                            height: `${Math.max(2, barHeightPct)}%`,
                            backgroundColor: barColor,
                            marginRight: `${gap}%`,
                            alignSelf: 'flex-end',
                        }}
                    />
                );
            })}
        </div>
    );
};
