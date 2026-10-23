import React from 'react';
import { AbsoluteFill, Video, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

// Simple test: Just play intro video to verify it works
export const IntroTest: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            <Video
                src={staticFile('intros/WhatsApp Video 2026-02-24 at 08.25.36.mp4')}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                }}
            />
            <div style={{
                position: 'absolute',
                top: 20,
                left: 20,
                color: 'white',
                fontSize: 24,
                background: 'rgba(0,0,0,0.7)',
                padding: 10,
            }}>
                Frame: {frame} | Time: {(frame / fps).toFixed(1)}s
            </div>
        </AbsoluteFill>
    );
};

// Simple test: Just play audio to verify it works
export const AudioTest: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    return (
        <AbsoluteFill style={{ backgroundColor: '#222' }}>
            <Audio src={staticFile('audio/Seeing_Other_People_-_Emily_Wibberly Book Summary Review AudioBook Explained Analysis.m4a')} />
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: 'white',
                fontSize: 48,
                textAlign: 'center',
            }}>
                🎵 Audio Test<br />
                <span style={{ fontSize: 24 }}>Frame: {frame} | Time: {(frame / fps).toFixed(1)}s</span>
            </div>
        </AbsoluteFill>
    );
};
