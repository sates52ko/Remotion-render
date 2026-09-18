import React, { useMemo } from 'react';
import {
    AbsoluteFill,
    OffthreadVideo,
    staticFile,
    useVideoConfig,
} from 'remotion';

interface FaceVideoSegmentProps {
    /** Video file path relative to public/ */
    videoFile: string;
    /** If true, video is known to be horizontal (width > height).
     *  When undefined the component defaults to vertical-safe rendering. */
    isHorizontal?: boolean;
    /** Start playback from this second (default 0) */
    startFrom?: number;
}

/**
 * FaceVideoSegment — Plays the creator's face-camera video.
 *
 * Uses <OffthreadVideo> instead of <Video> for frame-perfect rendering:
 * - OffthreadVideo extracts exact frames via FFMPEG in a separate thread
 * - No HTML5 video seeking imprecision (the root cause of jitter)
 * - pauseWhenBuffering prevents rendering incomplete frames
 *
 * ### Orientation handling
 * - **Vertical** (default): `object-fit: cover` — fills the 1080×1920 frame.
 * - **Horizontal**: Two-layer trick —
 *   1. Background: same video, blurred + scaled up (fills frame).
 *   2. Foreground: original video centred with `object-fit: contain`.
 */
export const FaceVideoSegment: React.FC<FaceVideoSegmentProps> = ({
    videoFile,
    isHorizontal = false,
    startFrom = 0,
}) => {
    const { fps } = useVideoConfig();
    const src = useMemo(() => staticFile(videoFile), [videoFile]);

    // Round startFrom to the nearest integer frame to avoid fractional
    // frame seeking which causes jitter with non-integer FPS (e.g. 29.97)
    const startFromFrame = Math.round(startFrom * fps);

    if (isHorizontal) {
        // ── Horizontal source → blur background + centred video ──────────
        return (
            <AbsoluteFill>
                {/* Blurred background layer */}
                <OffthreadVideo
                    src={src}
                    startFrom={startFromFrame}
                    pauseWhenBuffering
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: 'blur(25px) brightness(0.5)',
                        transform: 'scale(1.4)',
                    }}
                    volume={0}
                />

                {/* Centred foreground */}
                <AbsoluteFill
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <OffthreadVideo
                        src={src}
                        startFrom={startFromFrame}
                        pauseWhenBuffering
                        style={{
                            width: '100%',
                            height: 'auto',
                            maxHeight: '55%',
                            objectFit: 'contain',
                            borderRadius: 12,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                        }}
                        volume={1}
                    />
                </AbsoluteFill>
            </AbsoluteFill>
        );
    }

    // ── Vertical source (default) → full screen cover ──────────────────
    return (
        <AbsoluteFill>
            <OffthreadVideo
                src={src}
                startFrom={startFromFrame}
                pauseWhenBuffering
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                }}
            />
        </AbsoluteFill>
    );
};
