import React from 'react';
import {
    AbsoluteFill,
    Img,
    interpolate,
    useCurrentFrame,
    useVideoConfig,
    staticFile,
    spring,
} from 'remotion';
import { Scene, SceneAsset, SceneAnimation } from '../types/scene';

interface CinematicSceneRendererProps {
    scene: Scene;
    opacity: number;
}

// Advanced animated asset with cinematic techniques
const CinematicAnimatedAsset: React.FC<{
    asset: SceneAsset;
    animation: SceneAnimation;
    sceneStartTime: number;
    sceneEndTime: number;
    sceneProgress: number;
}> = ({ asset, animation, sceneStartTime, sceneEndTime, sceneProgress }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const sceneDuration = sceneEndTime - sceneStartTime;
    const sceneFrames = sceneDuration * fps;

    // Advanced animation calculations
    let transform = '';
    let filter = '';
    let animatedOpacity = asset.opacity;

    switch (animation.type) {
        // ===== CINEMATIC CAMERA MOVEMENTS =====

        case 'kenburns': {
            const fromScale = animation.params?.fromScale || 1.0;
            const toScale = animation.params?.toScale || 1.4;
            const fromX = animation.params?.fromX || 0;
            const toX = animation.params?.toX || -18;
            const fromY = animation.params?.fromY || 0;
            const toY = animation.params?.toY || -10;
            const springProgress = spring({
                frame: frame % sceneFrames, fps,
                config: { damping: 200, mass: 1, stiffness: 80 },
            });
            const scale = interpolate(springProgress, [0, 1], [fromScale, toScale]);
            const x = interpolate(springProgress, [0, 1], [fromX, toX]);
            const y = interpolate(springProgress, [0, 1], [fromY, toY]);
            transform = `scale(${scale}) translate(${x}%, ${y}%)`;
            break;
        }

        case 'parallax': {
            const depth = asset.zIndex || 1;
            const speed = (animation.params?.speed || 1) * depth;
            const y = interpolate(sceneProgress, [0, 1], [0, -35 * speed]);
            const scale = interpolate(sceneProgress, [0, 1], [1.15, 1.15 + (0.15 * depth)]);
            transform = `translateY(${y}%) scale(${scale})`;
            break;
        }

        case 'zoom': {
            const scale = spring({
                frame: frame % sceneFrames, fps, from: 1.0, to: 1.35,
                config: { damping: 80 },
            });
            transform = `scale(${scale})`;
            break;
        }

        case 'slide': {
            const x = interpolate(sceneProgress, [0, 0.15, 1], [-25, 0, 8], { extrapolateRight: 'clamp' });
            const s = interpolate(sceneProgress, [0, 1], [1.15, 1.25]);
            transform = `translateX(${x}%) scale(${s})`;
            break;
        }

        case 'rotate': {
            const angle = interpolate(sceneProgress, [0, 1], [-3, 3]);
            const scale = interpolate(sceneProgress, [0, 0.5, 1], [1.1, 1.25, 1.15]);
            transform = `rotate(${angle}deg) scale(${scale})`;
            break;
        }

        case 'spotlight': {
            const spScale = interpolate(sceneProgress, [0, 1], [1.1, 1.3]);
            const spX = interpolate(sceneProgress, [0, 1], [-6, 6]);
            transform = `scale(${spScale}) translateX(${spX}%)`;
            break;
        }

        case 'fade': {
            animatedOpacity = interpolate(sceneProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0.8]);
            const fadeScale = interpolate(sceneProgress, [0, 1], [1.1, 1.2]);
            transform = `scale(${fadeScale})`;
            break;
        }

        case 'dolly': {
            const dollyScale = interpolate(sceneProgress, [0, 1], [1.0, 1.4]);
            const dollyY = interpolate(sceneProgress, [0, 1], [3, -5]);
            transform = `scale(${dollyScale}) translateY(${dollyY}%)`;
            break;
        }

        case 'orbit': {
            const orbitAngle = interpolate(sceneProgress, [0, 1], [0, 360]);
            const orbX = Math.cos(orbitAngle * Math.PI / 180) * 8;
            const orbY = Math.sin(orbitAngle * Math.PI / 180) * 5;
            const orbScale = interpolate(sceneProgress, [0, 0.5, 1], [1.1, 1.2, 1.1]);
            transform = `translate(${orbX}%, ${orbY}%) scale(${orbScale})`;
            break;
        }

        case 'whipPan': {
            const direction = animation.params?.direction || 'right';
            const whipX = direction === 'left'
                ? interpolate(sceneProgress, [0, 0.12, 0.88, 1], [40, 0, 0, -8], { extrapolateRight: 'clamp' })
                : interpolate(sceneProgress, [0, 0.12, 0.88, 1], [-40, 0, 0, 8], { extrapolateRight: 'clamp' });
            const motionBlur = interpolate(sceneProgress, [0, 0.08, 0.18, 0.85, 0.92, 1], [12, 6, 0, 0, 4, 6]);
            filter = motionBlur > 0.5 ? `blur(${motionBlur}px)` : '';
            transform = `translateX(${whipX}%) scale(1.15)`;
            break;
        }

        case 'rackFocus': {
            const rackScale = interpolate(sceneProgress, [0, 0.35, 0.65, 1], [1.05, 1.25, 1.25, 1.15]);
            // REDUCED: Blur from 6px to 4px max for rendering safety
            const blurAmt = interpolate(sceneProgress, [0, 0.25, 0.45, 0.75, 1], [4, 0, 0, 0, 2]);
            filter = blurAmt > 0.1 ? `blur(${blurAmt}px)` : '';
            transform = `scale(${rackScale})`;
            break;
        }

        // ===== ZOOM VARIATIONS =====
        case 'zoomBounce': {
            const bounceScale = spring({
                frame: frame % sceneFrames, fps, from: 0.8, to: 1.25,
                config: { damping: 7, mass: 0.8, stiffness: 90 },
            });
            transform = `scale(${bounceScale})`;
            break;
        }
        case 'zoomPulse': {
            const pulsePhase = (sceneProgress * Math.PI * 3);
            const pulseScale = 1.1 + Math.sin(pulsePhase) * 0.12;
            transform = `scale(${pulseScale})`;
            break;
        }
        case 'zoomElastic': {
            const elasticScale = spring({
                frame: frame % sceneFrames, fps, from: 0.6, to: 1.2,
                config: { damping: 4, mass: 0.5, stiffness: 130 },
            });
            transform = `scale(${elasticScale})`;
            break;
        }
        case 'zoomPop': {
            const popScale = spring({
                frame: frame % sceneFrames, fps, from: 0.3, to: 1.15,
                config: { damping: 10, mass: 0.5, stiffness: 220 },
            });
            const popOpacity = interpolate(sceneProgress, [0, 0.08, 0.92, 1], [0, 1, 1, 0.9]);
            animatedOpacity = popOpacity * asset.opacity;
            transform = `scale(${popScale})`;
            break;
        }
        case 'zoomBreath': {
            const breathPhase = sceneProgress * Math.PI * 2;
            const breathScale = 1.1 + Math.sin(breathPhase) * 0.08;
            const breathY = Math.sin(breathPhase * 0.5) * 3;
            transform = `scale(${breathScale}) translateY(${breathY}%)`;
            break;
        }

        // ===== PAN VARIATIONS =====
        case 'panDrift': {
            const driftX = interpolate(sceneProgress, [0, 1], [-12, 12]);
            const driftY = interpolate(sceneProgress, [0, 1], [-4, 4]);
            const driftScale = interpolate(sceneProgress, [0, 0.5, 1], [1.1, 1.2, 1.1]);
            transform = `translate(${driftX}%, ${driftY}%) scale(${driftScale})`;
            break;
        }
        case 'panBounce': {
            const bPhase = sceneProgress * Math.PI * 2.5;
            const bounceX = Math.sin(bPhase) * 10;
            const bounceY = Math.abs(Math.sin(bPhase * 2)) * -6;
            transform = `translate(${bounceX}%, ${bounceY}%) scale(1.15)`;
            break;
        }
        case 'panSway': {
            const swayPhase = sceneProgress * Math.PI * 2;
            const swayX = Math.sin(swayPhase) * 14;
            const swayRotate = Math.sin(swayPhase) * 2.5;
            transform = `translateX(${swayX}%) rotate(${swayRotate}deg) scale(1.15)`;
            break;
        }
        case 'panFloat': {
            const floatY = interpolate(sceneProgress, [0, 1], [8, -10]);
            const floatX = Math.sin(sceneProgress * Math.PI * 2) * 5;
            const floatScale = interpolate(sceneProgress, [0, 0.5, 1], [1.1, 1.2, 1.1]);
            transform = `translate(${floatX}%, ${floatY}%) scale(${floatScale})`;
            break;
        }
        case 'panCircle': {
            const circAngle = sceneProgress * Math.PI * 2;
            const circX = Math.cos(circAngle) * 10;
            const circY = Math.sin(circAngle) * 6;
            transform = `translate(${circX}%, ${circY}%) scale(1.15)`;
            break;
        }
        case 'panWave': {
            const waveX = interpolate(sceneProgress, [0, 1], [-14, 14]);
            const waveY = Math.sin(sceneProgress * Math.PI * 3) * 5;
            transform = `translate(${waveX}%, ${waveY}%) scale(1.12)`;
            break;
        }
        case 'panGlide': {
            const t = sceneProgress;
            const glideX = interpolate(t, [0, 0.3, 0.7, 1], [-16, -5, 5, 16]);
            const glideY = interpolate(t, [0, 0.5, 1], [-5, 0, 5]);
            const glideScale = interpolate(t, [0, 0.5, 1], [1.1, 1.2, 1.1]);
            transform = `translate(${glideX}%, ${glideY}%) scale(${glideScale})`;
            break;
        }

        // ===== ROTATE VARIATIONS =====
        case 'rotateSwing': {
            const swingPhase = sceneProgress * Math.PI * 1.5;
            const swingAngle = Math.sin(swingPhase) * 5;
            const swingScale = interpolate(sceneProgress, [0, 1], [1.1, 1.2]);
            transform = `rotate(${swingAngle}deg) scale(${swingScale})`;
            break;
        }
        case 'rotateSpin': {
            const spinAngle = interpolate(sceneProgress, [0, 1], [0, 6]);
            const spinScale = interpolate(sceneProgress, [0, 0.5, 1], [1.1, 1.25, 1.15]);
            transform = `rotate(${spinAngle}deg) scale(${spinScale})`;
            break;
        }
        case 'rotateWobble': {
            const wobblePhase = sceneProgress * Math.PI * 4;
            const wobbleAngle = Math.sin(wobblePhase) * 4 * (1 - sceneProgress * 0.5);
            const wobbleScale = interpolate(sceneProgress, [0, 1], [1.1, 1.2]);
            transform = `rotate(${wobbleAngle}deg) scale(${wobbleScale})`;
            break;
        }
        case 'tiltShift': {
            const tiltX = interpolate(sceneProgress, [0, 1], [-8, 8]);
            const tiltY = interpolate(sceneProgress, [0, 1], [5, -5]);
            transform = `translate(${tiltX}%, ${tiltY}%) scale(1.15)`;
            break;
        }
        case 'rotateCarousel': {
            const carouselAngle = interpolate(sceneProgress, [0, 1], [-4, 4]);
            const carouselScale = interpolate(sceneProgress, [0, 0.5, 1], [1.1, 1.25, 1.1]);
            const carouselX = interpolate(sceneProgress, [0, 1], [-6, 6]);
            transform = `rotate(${carouselAngle}deg) translateX(${carouselX}%) scale(${carouselScale})`;
            break;
        }

        // ===== COMBO EFFECTS =====
        case 'zoomPan': {
            const zpScale = interpolate(sceneProgress, [0, 1], [1.0, 1.35]);
            const zpX = interpolate(sceneProgress, [0, 1], [-12, 12]);
            const zpY = interpolate(sceneProgress, [0, 1], [-5, 5]);
            transform = `scale(${zpScale}) translate(${zpX}%, ${zpY}%)`;
            break;
        }
        case 'spiralZoom': {
            const spAngle = interpolate(sceneProgress, [0, 1], [0, 8]);
            const spScale = interpolate(sceneProgress, [0, 1], [1.0, 1.35]);
            const spX = interpolate(sceneProgress, [0, 1], [-5, 5]);
            transform = `rotate(${spAngle}deg) scale(${spScale}) translateX(${spX}%)`;
            break;
        }
        case 'tiltZoom': {
            const tzScale = interpolate(sceneProgress, [0, 1], [1.0, 1.3]);
            const tzX = interpolate(sceneProgress, [0, 1], [5, -8]);
            const tzY = interpolate(sceneProgress, [0, 1], [3, -3]);
            transform = `scale(${tzScale}) translate(${tzX}%, ${tzY}%)`;
            break;
        }
        case 'bouncePan': {
            const bpPhase = sceneProgress * Math.PI * 2;
            const bpX = Math.sin(bpPhase) * 12;
            const bpY = Math.sin(bpPhase * 1.5) * 6;
            const bpScale = 1.1 + Math.abs(Math.sin(bpPhase * 0.5)) * 0.1;
            transform = `translate(${bpX}%, ${bpY}%) scale(${bpScale})`;
            break;
        }
        case 'swayZoom': {
            const szPhase = sceneProgress * Math.PI * 2;
            const szX = Math.sin(szPhase) * 10;
            const szScale = interpolate(sceneProgress, [0, 0.5, 1], [1.05, 1.25, 1.1]);
            const szRotate = Math.sin(szPhase * 0.5) * 3;
            transform = `translateX(${szX}%) scale(${szScale}) rotate(${szRotate}deg)`;
            break;
        }
        case 'driftRotate': {
            const drX = interpolate(sceneProgress, [0, 1], [-8, 8]);
            const drY = interpolate(sceneProgress, [0, 1], [-4, 4]);
            const drAngle = interpolate(sceneProgress, [0, 1], [-4, 4]);
            const drScale = interpolate(sceneProgress, [0, 0.5, 1], [1.05, 1.2, 1.05]);
            transform = `translate(${drX}%, ${drY}%) rotate(${drAngle}deg) scale(${drScale})`;
            break;
        }

        // ===== DYNAMIC EFFECTS =====
        case 'pushInTilt': {
            const scale = interpolate(sceneProgress, [0, 1], [1.0, 1.4]);
            const piX = interpolate(sceneProgress, [0, 1], [0, -8]);
            transform = `scale(${scale}) translateX(${piX}%)`;
            break;
        }
        case 'revealSlide': {
            const x = spring({ frame: frame % sceneFrames, fps, from: -25, to: 0, config: { damping: 35, stiffness: 80 } });
            const scale = spring({ frame: frame % sceneFrames, fps, from: 1.3, to: 1.1, config: { damping: 60 } });
            transform = `translateX(${x}%) scale(${scale})`;
            break;
        }
        case 'breathingFocus': {
            const scale = interpolate(sceneProgress, [0, 0.25, 0.5, 0.75, 1], [1.05, 1.15, 1.05, 1.15, 1.05]);
            const bfX = interpolate(sceneProgress, [0, 1], [-4, 4]);
            transform = `scale(${scale}) translateX(${bfX}%)`;
            break;
        }
        case 'heartbeat': {
            const phase = ((frame % sceneFrames) % (fps * 2)) / (fps * 2);
            const hbScale = phase < 0.1 ? 1.12 : phase < 0.2 ? 1.05 : phase < 0.3 ? 1.12 : 1.05;
            const slowZoom = 1.0 + (sceneProgress * 0.15);
            transform = `scale(${hbScale * slowZoom})`;
            break;
        }
        case 'wobbleZ': {
            const wRotate = Math.sin(sceneProgress * Math.PI * 3) * 4;
            const wScale = interpolate(sceneProgress, [0, 1], [1.1, 1.25]);
            const wX = interpolate(sceneProgress, [0, 1], [-5, 5]);
            transform = `rotate(${wRotate}deg) scale(${wScale}) translateX(${wX}%)`;
            break;
        }
        case 'flyIn': {
            const flyScale = spring({ frame: frame % sceneFrames, fps, from: 0.4, to: 1.2, config: { damping: 10, mass: 0.7 } });
            const flyY = spring({ frame: frame % sceneFrames, fps, from: 15, to: 0, config: { damping: 12 } });
            transform = `scale(${flyScale}) translateY(${flyY}%)`;
            break;
        }
        case 'quake': {
            const intensity = Math.max(0, 1 - (sceneProgress * 1.5));
            const qX = (Math.sin(frame * 2.1) * 6) * intensity;
            const qY = (Math.cos(frame * 3.4) * 6) * intensity;
            transform = `translate(${qX}%, ${qY}%) scale(1.15)`;
            break;
        }
        case 'floatUp': {
            const fuY = interpolate(sceneProgress, [0, 1], [8, -8]);
            const fuScale = interpolate(sceneProgress, [0, 1], [1.1, 1.2]);
            const fuX = Math.sin(sceneProgress * Math.PI) * 4;
            transform = `translate(${fuX}%, ${fuY}%) scale(${fuScale})`;
            break;
        }
        case 'sinkDown': {
            const sdY = interpolate(sceneProgress, [0, 1], [-8, 8]);
            const sdScale = interpolate(sceneProgress, [0, 1], [1.2, 1.1]);
            const sdX = Math.sin(sceneProgress * Math.PI) * -4;
            transform = `translate(${sdX}%, ${sdY}%) scale(${sdScale})`;
            break;
        }
        case 'cinematicPan': {
            const cpX = interpolate(sceneProgress, [0, 1], [10, -10]);
            const cpScale = interpolate(sceneProgress, [0, 1], [1.1, 1.3]);
            transform = `translateX(${cpX}%) scale(${cpScale})`;
            break;
        }

        // ===== CAPCUT-STYLE EFFECTS =====
        case 'glideIn': {
            const gx = spring({ frame: frame % sceneFrames, fps, from: -20, to: 0, config: { damping: 25, stiffness: 50 } });
            const gs = spring({ frame: frame % sceneFrames, fps, from: 1.3, to: 1.1, config: { damping: 30 } });
            transform = `translateX(${gx}%) scale(${gs})`;
            break;
        }
        case 'pullBack': {
            const pbScale = interpolate(sceneProgress, [0, 1], [1.4, 1.0]);
            const pbY = interpolate(sceneProgress, [0, 1], [-6, 0]);
            transform = `scale(${pbScale}) translateY(${pbY}%)`;
            break;
        }
        case 'gentleRock': {
            const grAngle = Math.sin(sceneProgress * Math.PI * 2) * 3;
            const grScale = interpolate(sceneProgress, [0, 0.5, 1], [1.1, 1.2, 1.1]);
            const grX = interpolate(sceneProgress, [0, 1], [-6, 6]);
            transform = `rotate(${grAngle}deg) scale(${grScale}) translateX(${grX}%)`;
            break;
        }
        case 'zoomSnap': {
            const zsScale = spring({ frame: frame % sceneFrames, fps, from: 0.7, to: 1.2, config: { damping: 6, stiffness: 250 } });
            transform = `scale(${zsScale})`;
            break;
        }
        case 'softBounce': {
            const sbY = spring({ frame: frame % sceneFrames, fps, from: 12, to: 0, config: { damping: 8, stiffness: 140, mass: 0.5 } });
            const sbScale = interpolate(sceneProgress, [0, 1], [1.1, 1.2]);
            transform = `translateY(${sbY}%) scale(${sbScale})`;
            break;
        }
        case 'tiltDrift': {
            const tdAngle = interpolate(sceneProgress, [0, 0.5, 1], [0, -5, 3]);
            const tdX = interpolate(sceneProgress, [0, 1], [-8, 8]);
            const tdScale = interpolate(sceneProgress, [0, 1], [1.1, 1.2]);
            transform = `rotate(${tdAngle}deg) translateX(${tdX}%) scale(${tdScale})`;
            break;
        }
        case 'horizonShift': {
            const hsX = interpolate(sceneProgress, [0, 0.3, 0.7, 1], [10, 0, 0, -10]);
            const hsScale = interpolate(sceneProgress, [0, 0.5, 1], [1.12, 1.2, 1.12]);
            transform = `translateX(${hsX}%) scale(${hsScale})`;
            break;
        }
        case 'verticalReveal': {
            const vrY = spring({ frame: frame % sceneFrames, fps, from: 18, to: 0, config: { damping: 18, stiffness: 70 } });
            const vrScale = interpolate(sceneProgress, [0, 1], [1.15, 1.25]);
            transform = `translateY(${vrY}%) scale(${vrScale})`;
            break;
        }
        case 'slowSpin': {
            const ssAngle = interpolate(sceneProgress, [0, 1], [0, 6]);
            const ssScale = interpolate(sceneProgress, [0, 0.5, 1], [1.1, 1.2, 1.1]);
            const ssX = interpolate(sceneProgress, [0, 1], [-5, 5]);
            transform = `rotate(${ssAngle}deg) scale(${ssScale}) translateX(${ssX}%)`;
            break;
        }
        case 'breatheAndPan': {
            const bpScale = interpolate(sceneProgress, [0, 0.25, 0.5, 0.75, 1], [1.1, 1.2, 1.1, 1.2, 1.1]);
            const bpX = interpolate(sceneProgress, [0, 1], [8, -8]);
            transform = `translateX(${bpX}%) scale(${bpScale})`;
            break;
        }

        default:
            // Fallback: cinematic drift
            const fallbackX = interpolate(sceneProgress, [0, 1], [-8, 8]);
            const fallbackScale = interpolate(sceneProgress, [0, 1], [1.1, 1.2]);
            transform = `translateX(${fallbackX}%) scale(${fallbackScale})`;
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
                filter,
                opacity: animatedOpacity,
                zIndex: asset.zIndex,
                width: '100vw',
                height: '100vh',
                transformStyle: 'preserve-3d',
            }}
        >
            {asset.type === 'svg' && (
                <img
                    src={staticFile(asset.path)}
                    alt="Scene asset"
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
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            )}
        </div>
    );
};

// Cinematic scene renderer with advanced effects
export const CinematicSceneRenderer: React.FC<CinematicSceneRendererProps> = ({
    scene,
    opacity
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    const sceneDuration = scene.endTime - scene.startTime;
    const sceneProgress = Math.max(0, Math.min(1, (currentTime - scene.startTime) / sceneDuration));

    // Film grain overlay - CPU optimized (only if enabled in scene config)
    const showFilmGrain = scene.filmGrain?.enabled !== false;
    const filmGrainOpacity = showFilmGrain ? (scene.filmGrain?.amount || 0.12) : 0;

    // Color grading shift throughout scene
    const colorGradeHue = interpolate(sceneProgress, [0, 1], [0, 10]);
    const brightness = scene.colorGrade?.brightness || 1;
    const contrast = scene.colorGrade?.contrast || 1;
    const saturation = scene.colorGrade?.saturation || 1.1;

    return (
        <AbsoluteFill
            style={{
                opacity,
                backgroundColor: '#000',
                transformStyle: 'preserve-3d',
            }}
        >
            {/* Color grading overlay */}
            <div
                style={{
                    position: 'absolute',
                    top: 0, left: 0, width: '100%', height: '100%',
                    filter: `hue-rotate(${colorGradeHue}deg) saturate(${saturation}) brightness(${brightness}) contrast(${contrast})`,
                    pointerEvents: 'none',
                }}
            >
                {/* Render scene assets */}
                {scene.assets.map((asset, idx) => {
                    const animation = scene.animations[idx] || scene.animations[0] || {
                        type: 'fade' as const,
                        easing: 'linear' as const,
                    };

                    return (
                        <CinematicAnimatedAsset
                            key={`${scene.id}-asset-${idx}`}
                            asset={asset}
                            animation={animation}
                            sceneStartTime={scene.startTime}
                            sceneEndTime={scene.endTime}
                            sceneProgress={sceneProgress}
                        />
                    );
                })}
            </div>

            {/* Vignette overlay */}
            {scene.vignette?.enabled && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, width: '100%', height: '100%',
                        background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${scene.vignette.intensity || 0.4}) 100%)`,
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* Film grain texture - DISABLED to debug crash */}
            {/* 
            {showFilmGrain && filmGrainOpacity > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, width: '100%', height: '100%',
                        opacity: filmGrainOpacity,
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                        mixBlendMode: 'overlay',
                        pointerEvents: 'none',
                    }}
                />
            )}
            */}
        </AbsoluteFill>
    );
};
