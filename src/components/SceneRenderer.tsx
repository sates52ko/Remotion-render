import React from 'react';
import {
    AbsoluteFill,
    Img,
    interpolate,
    useCurrentFrame,
    useVideoConfig,
    staticFile,
} from 'remotion';
import { Scene, SceneAsset, SceneAnimation } from '../types/scene';

interface SceneRendererProps {
    scene: Scene;
    opacity: number;
}

// Individual animated asset renderer
const AnimatedAsset: React.FC<{
    asset: SceneAsset;
    animation: SceneAnimation;
    sceneStartTime: number;
    sceneEndTime: number;
}> = ({ asset, animation, sceneStartTime, sceneEndTime }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    const sceneDuration = sceneEndTime - sceneStartTime;
    const sceneProgress = Math.max(0, Math.min(1, (currentTime - sceneStartTime) / sceneDuration));

    // Calculate animation transforms based on type
    let transform = '';
    let animatedOpacity = asset.opacity;

    switch (animation.type) {
        case 'kenburns': {
            const fromScale = animation.params?.fromScale || 1.0;
            const toScale = animation.params?.toScale || 1.2;
            const fromX = animation.params?.fromX || 0;
            const toX = animation.params?.toX || -10;
            const fromY = animation.params?.fromY || 0;
            const toY = animation.params?.toY || -10;

            const scale = interpolate(sceneProgress, [0, 1], [fromScale, toScale]);
            const x = interpolate(sceneProgress, [0, 1], [fromX, toX]);
            const y = interpolate(sceneProgress, [0, 1], [fromY, toY]);

            transform = `scale(${scale}) translate(${x}%, ${y}%)`;
            break;
        }

        case 'zoom': {
            const scale = interpolate(sceneProgress, [0, 0.3, 1], [0.8, 1, 1.1]);
            transform = `scale(${scale})`;
            break;
        }

        case 'slide': {
            const x = interpolate(sceneProgress, [0, 1], [-20, 0]);
            transform = `translateX(${x}%)`;
            break;
        }

        case 'rotate': {
            const rotation = interpolate(sceneProgress, [0, 1], [0, 360]);
            transform = `rotate(${rotation}deg)`;
            break;
        }

        case 'fade': {
            animatedOpacity = interpolate(sceneProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
            break;
        }

        case 'parallax': {
            const speed = animation.params?.speed || 1;
            const y = interpolate(sceneProgress, [0, 1], [0, -20 * speed]);
            transform = `translateY(${y}%)`;
            break;
        }

        default:
            transform = '';
    }

    // Base rotation from asset
    if (asset.rotation) {
        transform += ` rotate(${asset.rotation}deg)`;
    }

    return (
        <div
            style={{
                position: 'absolute',
                left: `${asset.position.x}%`,
                top: `${asset.position.y}%`,
                transform: `translate(-50%, -50%) ${transform}`,
                opacity: animatedOpacity,
                zIndex: asset.zIndex,
                width: asset.type === 'svg' ? '100%' : 'auto',
                height: asset.type === 'svg' ? '100%' : 'auto',
            }}
        >
            {asset.type === 'svg' && (
                <img
                    src={staticFile(asset.path)}
                    alt={`Scene asset`}
                    style={{
                        width: `${asset.scale * 100}%`,
                        height: 'auto',
                        objectFit: 'contain',
                    }}
                />
            )}
            {asset.type === 'image' && (
                <Img
                    src={staticFile(asset.path)}
                    style={{
                        maxWidth: `${asset.scale * 100}%`,
                        maxHeight: `${asset.scale * 100}vh`,
                        objectFit: 'contain',
                    }}
                />
            )}
        </div>
    );
};

// Main scene renderer
export const SceneRenderer: React.FC<SceneRendererProps> = ({ scene, opacity }) => {
    return (
        <AbsoluteFill
            style={{
                opacity,
                backgroundColor: '#000',
            }}
        >
            {scene.assets.map((asset, idx) => {
                const animation = scene.animations[idx] || scene.animations[0] || {
                    type: 'fade' as const,
                    easing: 'linear' as const,
                };

                return (
                    <AnimatedAsset
                        key={`${scene.id}-asset-${idx}`}
                        asset={asset}
                        animation={animation}
                        sceneStartTime={scene.startTime}
                        sceneEndTime={scene.endTime}
                    />
                );
            })}
        </AbsoluteFill>
    );
};
