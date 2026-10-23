import React, { useMemo } from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    random,
} from 'remotion';
import { Theme } from '../themes';

export type BackgroundVariant =
    | 'snow'
    | 'rain'
    | 'stars'
    | 'bubbles'
    | 'dust'
    | 'fireflies'
    | 'confetti'
    | 'bokeh'
    | 'shootingStars'
    | 'lightRays'
    | 'waves'
    | 'pulseRings'
    | 'glitter'
    | 'leaves'
    | 'gridDots'
    | 'speedLines'
    | 'floatingOrbs'
    | 'geometric'
    | 'binary'
    | 'hearts'
    | 'floatingShapes'
    | 'motionLines'
    | 'aurora'
    | 'none';

interface Particle {
    id: number;
    x: number;
    y: number;
    size: number;
    speed: number;
    opacity: number;
    delay: number;
    type?: number;
}

interface ParticleBackgroundProps {
    theme: Theme;
    particleCount?: number;
    seed?: string;
    variant?: BackgroundVariant;
}

export const ParticleBackground: React.FC<ParticleBackgroundProps> = ({
    theme,
    particleCount = 50,
    seed = 'default',
    variant = 'snow',
}) => {
    const frame = useCurrentFrame();

    // Adjust particle count loosely based on variant
    const actualCount = useMemo(() => {
        switch (variant) {
            case 'stars': case 'dust': case 'glitter': return 100; // Reduced from 150
            case 'rain': case 'speedLines': return 70; // Reduced from 100
            case 'bokeh': case 'floatingOrbs': case 'pulseRings': case 'aurora': return 25;
            case 'none': return 0;
            default: return Math.min(particleCount, 40); // Cap default
        }
    }, [variant, particleCount]);

    const particles = useMemo((): Particle[] => {
        return Array.from({ length: actualCount }, (_, i) => ({
            id: i,
            x: random(`${seed}-x-${i}`) * 100,
            y: random(`${seed}-y-${i}`) * 100,
            size: random(`${seed}-size-${i}`) * 4 + 2,
            speed: random(`${seed}-speed-${i}`) * 0.5 + 0.1,
            opacity: random(`${seed}-opacity-${i}`) * 0.5 + 0.2,
            delay: random(`${seed}-delay-${i}`) * 100,
            type: Math.floor(random(`${seed}-type-${i}`) * 3), // 0, 1, or 2
        }));
    }, [actualCount, seed]);

    const [color1, color2] = theme.background.gradient;

    const renderVariantLayers = () => {
        if (variant === 'none') return null;

        return particles.map((p) => {
            const time = frame + p.delay;

            switch (variant) {
                case 'snow': {
                    const y = (p.y + time * p.speed) % 120 - 10;
                    const sway = Math.sin(time * 0.02) * 2;
                    return <circle key={p.id} cx={`${p.x + sway}%`} cy={`${y}%`} r={p.size} fill={theme.background.particleColor} opacity={p.opacity} />;
                }
                case 'rain': {
                    const y = (p.y + time * p.speed * 8) % 120 - 10;
                    return <line key={p.id} x1={`${p.x}%`} y1={`${y}%`} x2={`${p.x - 2}%`} y2={`${y + p.size * 3}%`} stroke={theme.background.particleColor} strokeWidth={p.size / 2} opacity={p.opacity * 1.5} />;
                }
                case 'stars': {
                    const twinkle = Math.abs(Math.sin(time * p.speed * 0.1));
                    return <circle key={p.id} cx={`${p.x}%`} cy={`${p.y}%`} r={p.size * 0.5} fill={theme.background.particleColor} opacity={p.opacity * twinkle} />;
                }
                case 'dust': {
                    const y = (p.y - time * p.speed * 0.2) % 120;
                    const swayx = Math.sin(time * 0.01 + p.id) * 5;
                    const swayy = Math.cos(time * 0.015 + p.id) * 5;
                    return <circle key={p.id} cx={`${(p.x + swayx + 100) % 100}%`} cy={`${(y + swayy + 120) % 120}%`} r={p.size * 0.3} fill={theme.background.particleColor} opacity={p.opacity * 0.6} />;
                }
                case 'bubbles': {
                    const y = (p.y - time * p.speed * 1.5) % 120;
                    const yPos = y < -10 ? 110 : y;
                    const sway = Math.sin(time * 0.03) * 3;
                    return <circle key={p.id} cx={`${p.x + sway}%`} cy={`${yPos}%`} r={p.size * 1.5} fill="none" stroke={theme.background.particleColor} strokeWidth={1} opacity={p.opacity} />;
                }
                case 'fireflies': {
                    const pulse = Math.abs(Math.sin(time * p.speed * 0.1));
                    const swayx = Math.sin(time * 0.02 + p.id) * 10;
                    const swayy = Math.cos(time * 0.025 + p.id) * 10;
                    return <circle key={p.id} cx={`${p.x + swayx}%`} cy={`${p.y + swayy}%`} r={p.size * 0.8} fill="#ffffaa" opacity={p.opacity * pulse * 1.5} />;
                }
                case 'bokeh': {
                    const y = (p.y - time * p.speed * 0.5) % 120;
                    const yPos = y < -20 ? 120 : y;
                    return <circle key={p.id} cx={`${p.x}%`} cy={`${yPos}%`} r={p.size * 5} fill={theme.background.particleColor} opacity={p.opacity * 0.4} />;
                }
                case 'lightRays': {
                    const sway = Math.sin(time * 0.005 + p.x) * 10;
                    return <rect key={p.id} x={`${p.x + sway - 5}%`} y="-10%" width={`${p.size * 2}%`} height="120%" fill={`url(#rayGradient)`} opacity={p.opacity * 0.3} transform={`rotate(${15 * p.speed} ${p.x} 0)`} />;
                }
                case 'confetti': {
                    const y = (p.y + time * p.speed * 2) % 120 - 10;
                    const rotateConfetti = time * p.speed * 10;
                    const colors = ['#FF3B30', '#34C759', '#007AFF', '#FFCC00', '#AF52DE'];
                    const color = colors[p.id % colors.length];
                    return <rect key={p.id} x={`${p.x}%`} y={`${y}%`} width={p.size * 2} height={p.size * 1.5} fill={color} opacity={p.opacity + 0.5} transform={`rotate(${rotateConfetti} ${p.x} ${y})`} />;
                }
                case 'geometric': {
                    const y = (p.y - time * p.speed) % 120;
                    const yPos = y < -10 ? 110 : y;
                    const rotate = time * p.speed * 2;
                    if (p.type === 0) return <circle key={p.id} cx={`${p.x}%`} cy={`${yPos}%`} r={p.size * 1.5} fill="none" stroke={theme.background.particleColor} opacity={p.opacity} />;
                    if (p.type === 1) return <rect key={p.id} x={`${p.x}%`} y={`${yPos}%`} width={p.size * 2} height={p.size * 2} fill="none" stroke={theme.background.particleColor} opacity={p.opacity} transform={`rotate(${rotate} ${p.x} ${yPos})`} />;
                    return <polygon key={p.id} points={`${p.x},${yPos - p.size} ${p.x - p.size},${yPos + p.size} ${p.x + p.size},${yPos + p.size}`} fill="none" stroke={theme.background.particleColor} opacity={p.opacity} transform={`rotate(${rotate} ${p.x} ${yPos})`} />;
                }
                case 'shootingStars': {
                    // Only show occasionally
                    if (time % (100 + p.delay) < 20) {
                        const progress = time % (100 + p.delay);
                        const top = p.y + progress * 2;
                        const left = p.x + progress * 2;
                        return <line key={p.id} x1={`${left}%`} y1={`${top}%`} x2={`${left - 5}%`} y2={`${top - 5}%`} stroke="#fff" strokeWidth={p.size / 2} opacity={(20 - progress) / 20} />;
                    }
                    return null;
                }
                case 'glitter': {
                    const twinkle = Math.abs(Math.sin(time * p.speed * 0.3));
                    return <polygon key={p.id} points={`${p.x},${p.y - p.size / 2} ${p.x - p.size / 2},${p.y} ${p.x},${p.y + p.size / 2} ${p.x + p.size / 2},${p.y}`} fill="#fff" opacity={p.opacity * twinkle} />;
                }
                case 'floatingOrbs': {
                    const swayx = Math.sin(time * 0.01 + p.id) * 5;
                    const y = (p.y - time * p.speed * 0.5) % 120;
                    const yPos = y < -20 ? 120 : y;
                    return <circle key={p.id} cx={`${p.x + swayx}%`} cy={`${yPos}%`} r={p.size * 3} fill={`url(#orbGradient)`} opacity={p.opacity * 0.6} />;
                }
                case 'gridDots': {
                    // Static moving grid
                    const offsetDots = (time * p.speed * 0.5) % 10;
                    return <circle key={p.id} cx={`${Math.round(p.x / 5) * 5}%`} cy={`${(Math.round(p.y / 5) * 5 + offsetDots) % 100}%`} r={1.5} fill={theme.background.particleColor} opacity={0.3} />;
                }
                case 'speedLines': {
                    const x = (p.x + time * p.speed * 15) % 120 - 10;
                    return <line key={p.id} x1={`${x}%`} y1={`${p.y}%`} x2={`${x + p.size * 5}%`} y2={`${p.y}%`} stroke={theme.background.particleColor} strokeWidth={p.size / 3} opacity={p.opacity * 0.5} />;
                }
                case 'pulseRings': {
                    const progress = (time * p.speed * 0.5 + p.delay) % 100;
                    const currentSize = p.size * (progress / 10);
                    const op = Math.max(0, 1 - progress / 100) * p.opacity;
                    return <circle key={p.id} cx={`${p.x}%`} cy={`${p.y}%`} r={currentSize} fill="none" stroke={theme.background.particleColor} strokeWidth={2} opacity={op} />;
                }
                case 'binary': {
                    const y = (p.y + time * p.speed * 5) % 120 - 10;
                    const char = p.id % 2 === 0 ? '0' : '1';
                    return <text key={p.id} x={`${p.x}%`} y={`${y}%`} fill="#0f0" fontSize={p.size * 3 + 8} opacity={p.opacity} fontFamily="monospace">{char}</text>;
                }
                case 'waves': {
                    if (p.id > 10) return null; // Only use a few particles for waves
                    let path = `M -10 ${p.y} `;
                    for (let i = 0; i <= 110; i += 10) {
                        path += `Q ${i - 5} ${p.y + Math.sin(time * 0.05 + p.id) * 20}, ${i} ${p.y} `;
                    }
                    return <path key={p.id} d={path} fill="none" stroke={theme.background.particleColor} strokeWidth={p.size} opacity={p.opacity * 0.2} />;
                }
                case 'leaves': {
                    const y = (p.y + time * p.speed * 1.5) % 120 - 10;
                    const swayx = Math.sin(time * 0.05 + p.id) * 8;
                    const rotate = Math.sin(time * 0.05 + p.id) * 45 + time;
                    return (
                        <g key={p.id} transform={`translate(${p.x + swayx} ${y}) rotate(${rotate})`}>
                            <path d="M0,0 C10,-10 20,-5 20,10 C10,20 0,15 0,0" fill={theme.background.particleColor} opacity={p.opacity} transform={`scale(${p.size / 5})`} />
                        </g>
                    );
                }
                case 'hearts': {
                    const y = (p.y - time * Math.max(p.speed, 0.3) * 2) % 120;
                    const yPos = y < -10 ? 110 : y;
                    const swayx = Math.sin(time * 0.03 + p.id) * 3;
                    return (
                        <g key={p.id} transform={`translate(${p.x + swayx} ${yPos}) scale(${p.size / 6})`}>
                            <path d="M0,5 C0,0 5,-5 10,-5 C15,-5 20,0 20,5 C20,12 10,20 10,20 C10,20 0,12 0,5 Z" fill="#ff4d4d" opacity={p.opacity * 0.8} />
                        </g>
                    );
                }
                default:
                    return null;

                case 'floatingShapes': {
                    // Geometric shapes: circles, triangles, squares floating up
                    const y = (p.y - time * p.speed * 0.8) % 120;
                    const yPos = y < -20 ? 120 : y;
                    const swayx = Math.sin(time * 0.015 + p.id * 0.7) * 8;
                    const rotate = time * p.speed * 3 + p.id * 45;
                    const pulse = 0.8 + Math.sin(time * 0.04 + p.id) * 0.2;
                    if (p.type === 0) {
                        return <circle key={p.id} cx={`${p.x + swayx}%`} cy={`${yPos}%`} r={p.size * 2 * pulse} fill="none" stroke={theme.background.particleColor} strokeWidth={1.5} opacity={p.opacity * 0.7} />;
                    }
                    if (p.type === 1) {
                        return <rect key={p.id} x={`${p.x + swayx - p.size}%`} y={`${yPos - p.size}%`} width={p.size * 3} height={p.size * 3} fill="none" stroke={theme.background.particleColor} strokeWidth={1.5} opacity={p.opacity * 0.6} transform={`rotate(${rotate} ${p.x} ${yPos})`} />;
                    }
                    const pts = `${p.x + swayx},${yPos - p.size * 2.5} ${p.x + swayx - p.size * 2},${yPos + p.size * 1.5} ${p.x + swayx + p.size * 2},${yPos + p.size * 1.5}`;
                    return <polygon key={p.id} points={pts} fill="none" stroke={theme.background.particleColor} strokeWidth={1.5} opacity={p.opacity * 0.6} />;
                }

                case 'motionLines': {
                    // Diagonal speed lines from top-left to bottom-right
                    const progress = ((time * p.speed * 4 + p.delay) % 140) - 20;
                    const x1 = progress - 20;
                    const y1 = p.y * 0.6;
                    const len = p.size * 6 + 10;
                    const x2 = x1 + len;
                    const y2 = y1 + len * 0.3;
                    const opacity = Math.min(1, (progress + 20) / 20) * p.opacity * 0.5;
                    return <line key={p.id} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke={theme.background.particleColor} strokeWidth={p.size * 0.4} opacity={opacity} strokeLinecap="round" />;
                }

                case 'aurora': {
                    // Smoky, wavy vertical bands of light (like coffee steam / aurora)
                    const x = p.x;
                    const sway = Math.sin(time * 0.01 + p.id) * 20;
                    const stretch = Math.abs(Math.cos(time * 0.005 + p.id)) * 60 + 40;
                    const pulse = 0.5 + Math.sin(time * 0.02 + p.delay) * 0.5;
                    return (
                        <ellipse
                            key={p.id}
                            cx={`${x + sway}%`}
                            cy="50%"
                            rx={p.size * 8}
                            ry={`${stretch}%`}
                            fill={theme.background.particleColor}
                            opacity={p.opacity * pulse * 0.5}
                        />
                    );
                }
            }
        });
    };

    return (
        <AbsoluteFill>
            {/* Gradient Background */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
                }}
            />

            {/* SVG Defs for special effects */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <defs>
                    <linearGradient id="rayGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                    </linearGradient>
                    <radialGradient id="orbGradient">
                        <stop offset="0%" stopColor="#fff" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                    </radialGradient>
                </defs>
            </svg>

            {/* Animated Particles */}
            <svg
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'visible',
                }}
            >
                {renderVariantLayers()}
            </svg>

            {/* Vignette overlay */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)',
                    pointerEvents: 'none',
                }}
            />
        </AbsoluteFill>
    );
};
