import { SceneConfig, Scene } from '../types/scene';
import {
    selectBalancedTransition,
    selectBalancedAnimation,
    getRandomDuration,
    getRandomScale,
} from './transitionSelector';

/**
 * Get all scenes that should be visible at a given time
 * (includes current scene and next scene during transition)
 */
export function getActiveScenesAtTime(scenes: Scene[], currentTime: number): Scene[] {
    const activeScenes: Scene[] = [];

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];

        // Scene is active if current time is within its range
        if (currentTime >= scene.startTime && currentTime < scene.endTime) {
            activeScenes.push(scene);

            // Also add next scene if we're in transition period
            const nextScene = scenes[i + 1];
            if (nextScene && scene.transition) {
                const transitionStart = scene.endTime - scene.transition.duration;
                if (currentTime >= transitionStart) {
                    activeScenes.push(nextScene);
                }
            }
            break;
        }
    }

    return activeScenes;
}

/**
 * Calculate opacity for a scene based on transition timing
 */
export function calculateSceneOpacity(
    scene: Scene,
    currentTime: number,
    nextScene?: Scene
): number {
    // If no transition, full opacity within scene range
    if (!scene.transition || !nextScene) {
        return currentTime >= scene.startTime && currentTime < scene.endTime ? 1 : 0;
    }

    const transitionStart = scene.endTime - scene.transition.duration;

    // Before transition: full opacity
    if (currentTime < transitionStart) {
        return currentTime >= scene.startTime ? 1 : 0;
    }

    // During transition: fade out
    if (currentTime >= transitionStart && currentTime < scene.endTime) {
        const progress = (currentTime - transitionStart) / scene.transition.duration;
        return 1 - progress;
    }

    // After scene: no opacity
    return 0;
}


/**
 * Generate a full video scene configuration
 * @param totalDuration - Total video duration in seconds
 * @param targetSceneCount - Number of scenes to generate
 * @param imageFolder - Folder path containing scene images
 * @param imageCount - Number of available images
 * @returns Complete SceneConfig
 */
export function generateFullVideoScenes(
    totalDuration: number,
    targetSceneCount: number,
    imageFolder: string = 'scenes',
    imageCount: number = 4
): SceneConfig {
    const scenes: Scene[] = [];
    const sceneDuration = totalDuration / targetSceneCount;

    const previousTransitions: string[] = [];
    const previousAnimations: string[] = [];

    for (let i = 0; i < targetSceneCount; i++) {
        const startTime = i * sceneDuration;
        const endTime = (i + 1) * sceneDuration;

        // Cycle through available images
        const imageIndex = i % imageCount;
        const imagePath = `${imageFolder}/scene-${String(imageIndex).padStart(2, '0')}.png`;

        // Select balanced transition and animation
        const transition = selectBalancedTransition(previousTransitions as any, i);
        const animation = selectBalancedAnimation(previousAnimations as any, i);

        previousTransitions.push(transition);
        previousAnimations.push(animation);

        // Random transition duration (0.8 - 1.5 seconds)
        const transitionDuration = getRandomDuration(0.8, 1.5);

        // Create scene
        const scene: Scene = {
            id: `scene-${String(i).padStart(2, '0')}`,
            startTime,
            endTime,
            assets: [
                {
                    type: 'image',
                    path: imagePath,
                    position: { x: 50, y: 50 },
                    scale: getRandomScale(1.0, 1.3),
                    opacity: 1.0,
                    zIndex: 1,
                },
            ],
            animations: [
                {
                    type: animation,
                    easing: 'ease-in-out',
                    params: getAnimationParams(animation),
                },
            ],
            transition: {
                type: transition,
                duration: transitionDuration,
                easing: 'ease-out',
            },
            // Vary color grading across scenes
            colorGrade: {
                brightness: 0.9 + Math.random() * 0.4, // 0.9 - 1.3
                contrast: 1.0 + Math.random() * 0.3,    // 1.0 - 1.3
                saturation: 0.9 + Math.random() * 0.3,  // 0.9 - 1.2
                temperature: i % 3 === 0 ? 'warm' : i % 3 === 1 ? 'cool' : 'neutral',
            },
            filmGrain: {
                enabled: true,
                amount: 0.15 + Math.random() * 0.15, // 0.15 - 0.3
            },
            vignette: {
                enabled: i % 2 === 0,
                intensity: 0.3 + Math.random() * 0.2, // 0.3 - 0.5
            },
        };

        scenes.push(scene);
    }

    return {
        scenes,
        defaultTransition: {
            type: 'crossfade',
            duration: 1.0,
        },
        fps: 30,
        globalFilmGrain: true,
        globalVignette: false,
        cinematicBars: true,
    };
}

/**
 * Get animation-specific parameters
 */
function getAnimationParams(animationType: string): any {
    switch (animationType) {
        case 'kenburns':
            return {
                fromScale: getRandomScale(1.0, 1.2),
                toScale: getRandomScale(1.3, 1.6),
                fromX: Math.random() * 10 - 5,
                fromY: Math.random() * 10 - 5,
                toX: Math.random() * 10 - 5,
                toY: Math.random() * 10 - 5,
            };

        case 'dolly':
            return {
                fromScale: 1.0,
                toScale: getRandomScale(1.3, 1.5),
                fromY: 5,
                toY: -10,
                fov: 70 + Math.random() * 20,
            };

        case 'orbit':
            return {
                orbitRadius: 15 + Math.random() * 15,
                orbitAngle: 10 + Math.random() * 20,
            };

        case 'zoom':
            return {
                fromScale: 0.9,
                toScale: getRandomScale(1.2, 1.4),
            };

        case 'rackFocus':
            return {
                fromScale: 1.0,
                toScale: 1.1,
                blurAmount: 2 + Math.random() * 2,
            };

        case 'whipPan':
            const directions = ['left', 'right', 'up', 'down'] as const;
            return {
                direction: directions[Math.floor(Math.random() * directions.length)],
                blurAmount: 5 + Math.random() * 5,
            };

        default:
            return {};
    }
}
