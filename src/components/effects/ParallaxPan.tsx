/**
 * ParallaxPan — Ken Burns / Parallax pan & zoom effect for images
 *
 * Great for: scene images, book cover reveals, cinematic photo animation
 *
 * Usage:
 *   <ParallaxPan src={staticFile('scenes/scene1.jpg')} />
 *   <ParallaxPan src={staticFile('cover.jpg')} effect="zoom-in" duration={150} />
 *
 * Props:
 *   src         — image source URL (use staticFile())
 *   effect      — 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'diagonal' (default: 'zoom-in')
 *   duration    — animation duration in frames (default: 120)
 *   zoomAmount  — max zoom scale (default: 1.12)
 *   easing      — 'linear' | 'ease' (default: 'ease')
 *   style       — container style override
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

type PanEffect = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'diagonal';

interface ParallaxPanProps {
    src: string;
    effect?: PanEffect;
    duration?: number;
    zoomAmount?: number;
    style?: React.CSSProperties;
}

export const ParallaxPan: React.FC<ParallaxPanProps> = ({
    src,
    effect = 'zoom-in',
    duration = 120,
    zoomAmount = 1.12,
    style,
}) => {
    const frame = useCurrentFrame();

    const t = Math.min(frame / duration, 1);

    // Ease-out curve
    const eased = 1 - Math.pow(1 - t, 2);

    const getTransform = (): string => {
        switch (effect) {
            case 'zoom-in':
                return `scale(${interpolate(eased, [0, 1], [1, zoomAmount])})`;
            case 'zoom-out':
                return `scale(${interpolate(eased, [0, 1], [zoomAmount, 1])})`;
            case 'pan-left':
                return `scale(${zoomAmount}) translateX(${interpolate(eased, [0, 1], [0, -5])}%)`;
            case 'pan-right':
                return `scale(${zoomAmount}) translateX(${interpolate(eased, [0, 1], [0, 5])}%)`;
            case 'pan-up':
                return `scale(${zoomAmount}) translateY(${interpolate(eased, [0, 1], [3, -3])}%)`;
            case 'diagonal':
                return `scale(${interpolate(eased, [0, 1], [1, zoomAmount])}) translate(${interpolate(eased, [0, 1], [0, -3])}%, ${interpolate(eased, [0, 1], [3, -3])}%)`;
            default:
                return `scale(${interpolate(eased, [0, 1], [1, zoomAmount])})`;
        }
    };

    return (
        <AbsoluteFill style={{ overflow: 'hidden', ...style }}>
            <div
                style={{
                    position: 'absolute',
                    inset: '-5%',
                    backgroundImage: `url(${src})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    transform: getTransform(),
                    transformOrigin: 'center center',
                    willChange: 'transform',
                }}
            />
        </AbsoluteFill>
    );
};
