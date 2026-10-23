import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneConfig } from '../types/scene';
import { getActiveScenesAtTime, calculateSceneOpacity } from '../utils/sceneGenerator';
import { SceneRenderer } from './SceneRenderer';

interface SceneManagerProps {
    config: SceneConfig;
}

export const SceneManager: React.FC<SceneManagerProps> = ({ config }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    // Get active scenes (may be multiple during transitions)
    const activeScenes = getActiveScenesAtTime(config.scenes, currentTime);

    return (
        <AbsoluteFill>
            {activeScenes.map((scene, index) => {
                const nextScene = config.scenes[config.scenes.indexOf(scene) + 1];
                const opacity = calculateSceneOpacity(scene, currentTime, nextScene);

                return (
                    <SceneRenderer
                        key={scene.id}
                        scene={scene}
                        opacity={opacity}
                    />
                );
            })}
        </AbsoluteFill>
    );
};
