import React from 'react';
import { Composition, staticFile } from 'remotion';
import { getVideoMetadata, getAudioDurationInSeconds } from '@remotion/media-utils';
import { SceneBasedBook } from './SceneBasedBook';
import { before_coffeeVTT } from '../data/before-coffee-vtt';
import { z } from 'zod';

export const CoffeeVideo: React.FC<{
    introVideo: string;
    introDurationInFrames: number;
    mainConfig: any;
}> = ({ introVideo, introDurationInFrames, mainConfig }) => {
    // This will be used in IntroMainVideo or similar structure
    // For now, let's keep it simple and direct for the user to review
    return (
        <SceneBasedBook config={{
            ...mainConfig,
            srtContent: before_coffeeVTT,
        }} />
    );
};
