/**
 * GlitchText — Cyberpunk/glitch distortion text effect
 *
 * Great for: thriller/mystery/sci-fi book titles, dramatic reveals
 *
 * Usage:
 *   <GlitchText text="A Fate So Cold" />
 *   <GlitchText text="PLOT TWIST" intensity={2} color="#FF4444" />
 *
 * Props:
 *   text        — text to display
 *   intensity   — glitch strength 0-3 (default: 1)
 *   color       — base text color (default: '#ffffff')
 *   glitchColor1 — first glitch layer color (default: '#ff00ff')
 *   glitchColor2 — second glitch layer color (default: '#00ffff')
 *   fontSize    — font size in px (default: 80)
 *   fontWeight  — (default: 900)
 *   delay       — start delay in seconds (default: 0)
 *   interval    — frames between glitch bursts (default: 20)
 */
import React from 'react';
import { random, useCurrentFrame, useVideoConfig } from 'remotion';

interface GlitchTextProps {
    text: string;
    intensity?: number;
    color?: string;
    glitchColor1?: string;
    glitchColor2?: string;
    fontSize?: number;
    fontWeight?: number;
    delay?: number;
    interval?: number;
}

export const GlitchText: React.FC<GlitchTextProps> = ({
    text,
    intensity = 1,
    color = '#ffffff',
    glitchColor1 = '#ff00ff',
    glitchColor2 = '#00ffff',
    fontSize = 80,
    fontWeight = 900,
    delay = 0,
    interval = 20,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const delayFrames = Math.round(delay * fps);
    const adjusted = Math.max(0, frame - delayFrames);

    // Glitch fires at intervals
    const glitchCycle = Math.floor(adjusted / interval);
    const glitchPhase = adjusted % interval;
    const isGlitching = glitchPhase < 4; // glitch lasts 4 frames per cycle

    // Randomize glitch offset per cycle using Remotion's deterministic random
    const offsetX1 = isGlitching ? (random(`gx1-${glitchCycle}`) - 0.5) * 20 * intensity : 0;
    const offsetX2 = isGlitching ? (random(`gx2-${glitchCycle}`) - 0.5) * 20 * intensity : 0;
    const skewY = isGlitching ? (random(`sk-${glitchCycle}`) - 0.5) * 4 * intensity : 0;

    // Clip rectangles that "tear" the glitch layers
    const clipY1 = isGlitching ? `${random(`cy1-${glitchCycle}`) * 80}%` : '0%';
    const clipH1 = isGlitching ? `${random(`ch1-${glitchCycle}`) * 30 + 5}%` : '100%';

    const baseStyle: React.CSSProperties = {
        fontSize,
        fontWeight,
        fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
        lineHeight: 1.2,
        userSelect: 'none',
    };

    if (adjusted === 0) {
        return <p style={{ ...baseStyle, color, margin: 0, opacity: 0 }}>{text}</p>;
    }

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* Glitch layer 1 — cyan */}
            <p style={{
                ...baseStyle,
                color: glitchColor2,
                margin: 0,
                position: 'absolute',
                top: 0, left: 0,
                transform: `translateX(${offsetX1}px) skewY(${skewY}deg)`,
                clipPath: isGlitching ? `inset(${clipY1} 0 calc(100% - ${clipY1} - ${clipH1}) 0)` : 'none',
                opacity: isGlitching ? 0.8 : 0,
                mixBlendMode: 'screen',
            }}>
                {text}
            </p>
            {/* Glitch layer 2 — magenta */}
            <p style={{
                ...baseStyle,
                color: glitchColor1,
                margin: 0,
                position: 'absolute',
                top: 0, left: 0,
                transform: `translateX(${offsetX2}px) skewY(${-skewY}deg)`,
                opacity: isGlitching ? 0.7 : 0,
                mixBlendMode: 'screen',
            }}>
                {text}
            </p>
            {/* Base text */}
            <p style={{ ...baseStyle, color, margin: 0, position: 'relative' }}>
                {text}
            </p>
        </div>
    );
};
