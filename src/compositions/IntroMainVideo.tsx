import React from 'react';
import {
    AbsoluteFill,
    OffthreadVideo,
    Sequence,
    staticFile,
} from 'remotion';
import { z } from 'zod';
import { SceneBasedBook, sceneBasedBookSchema } from './SceneBasedBook';

// Schema for intro + main video composition
const introMainVideoSchema = z.object({
    introVideo: z.string(), // Path to intro video file
    introDurationInFrames: z.number().optional(), // Dynamic duration
    mainConfig: sceneBasedBookSchema.shape.config, // Main video config
});

export type IntroMainVideoProps = z.infer<typeof introMainVideoSchema>;

export const IntroMainVideo: React.FC<IntroMainVideoProps> = ({ introVideo, introDurationInFrames = 28 * 24, mainConfig }) => {
    return (
        <AbsoluteFill>
            {/* Intro Video - Dynamic duration */}
            <Sequence from={0} durationInFrames={introDurationInFrames}>
                <OffthreadVideo
                    src={staticFile(introVideo)}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            </Sequence>

            {/* Main Scene-Based Video - After intro */}
            <Sequence from={introDurationInFrames}>
                <SceneBasedBook config={mainConfig} />
            </Sequence>
        </AbsoluteFill>
    );
};

export { introMainVideoSchema };
