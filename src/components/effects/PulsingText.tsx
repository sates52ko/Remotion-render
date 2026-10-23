/**
 * PulsingText — Text that breathes/pulses with a gentle scale & glow animation
 *
 * Great for: attention-grabbing titles, "rating reveals", CTA text
 *
 * Usage:
 *   <PulsingText text="4.8 ★" />
 *   <PulsingText text="BEST BOOK OF 2024" pulseColor="#FFE600" speed={0.5} />
 *
 * Props:
 *   text         — text to display
 *   color        — text color (default: '#ffffff')
 *   pulseColor   — glow color (default: '#FFE600')
 *   fontSize     — (default: 72)
 *   fontWeight   — (default: 900)
 *   speed        — pulse speed multiplier (default: 1)
 *   amplitude    — scale amplitude 0-0.3 (default: 0.08)
 *   delay        — start delay in seconds (default: 0)
 *   glowRadius   — glow blur size in px (default: 30)
 */
import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

interface PulsingTextProps {
    text: string;
    color?: string;
    pulseColor?: string;
    fontSize?: number;
    fontWeight?: number;
    speed?: number;
    amplitude?: number;
    delay?: number;
    glowRadius?: number;
}

export const PulsingText: React.FC<PulsingTextProps> = ({
    text,
    color = '#ffffff',
    pulseColor = '#FFE600',
    fontSize = 72,
    fontWeight = 900,
    speed = 1,
    amplitude = 0.08,
    delay = 0,
    glowRadius = 30,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const delayFrames = Math.round(delay * fps);
    const adjusted = Math.max(0, frame - delayFrames);

    // Entry fade-in
    const entryOpacity = Math.min(1, adjusted / (fps * 0.3));

    // Pulse cycle: sin wave
    const pulseCycle = (adjusted / fps) * speed * Math.PI * 2;
    const pulse = Math.sin(pulseCycle);

    const scale = 1 + pulse * amplitude;
    const glowOpacity = interpolate(pulse, [-1, 1], [0.2, 0.9]);

    return (
        <p
            style={{
                margin: 0,
                fontSize,
                fontWeight,
                color,
                fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
                lineHeight: 1.2,
                opacity: entryOpacity,
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                textShadow: [
                    `0 0 ${glowRadius * glowOpacity}px ${pulseColor}`,
                    `0 0 ${glowRadius * 2 * glowOpacity}px ${pulseColor}88`,
                    `-1px -1px 0 rgba(0,0,0,0.8), 1px 1px 0 rgba(0,0,0,0.8)`,
                ].join(', '),
            }}
        >
            {text}
        </p>
    );
};
