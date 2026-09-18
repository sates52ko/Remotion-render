import React from 'react';
import { AbsoluteFill } from 'remotion';

interface ShortsLayoutProps {
    children: React.ReactNode;
    /** Accent color for gradient overlays */
    accentColor?: string;
    theme?: any; // Replace with ShortsTheme if you prefer strong typing
}


/**
 * ShortsLayout — Full-screen vertical (1080×1920) container.
 * Provides a dark base + bottom gradient for text readability.
 */
export const ShortsLayout: React.FC<ShortsLayoutProps> = ({
    children,
    accentColor = '#ff6b35',
    theme,
}) => {

    return (
        <AbsoluteFill
            style={{
                backgroundColor: '#000',
                overflow: 'hidden',
            }}
        >
            {/* Content layers */}
            {children}

            {/* Bottom gradient for text readability */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '45%',
                    background: theme ? `linear-gradient(to top, ${theme.colors.backgroundGradient[1]} 0%, ${theme.colors.backgroundGradient[1].replace(/[\d.]+\)$/g, '0.5)')} 50%, ${theme.colors.backgroundGradient[0]} 100%)` : `linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)`,
                    pointerEvents: 'none',
                    zIndex: 10,
                }}
            />


            {/* Subtle top gradient */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '15%',
                    background: `linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 100%)`,
                    pointerEvents: 'none',
                    zIndex: 10,
                }}
            />

            {/* Accent glow at bottom edge */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '10%',
                    right: '10%',
                    height: 2,
                    background: accentColor,
                    boxShadow: `0 0 30px 10px ${theme ? theme.colors.shadow : accentColor + '40'}`,
                    opacity: 0.6,
                    pointerEvents: 'none',

                    zIndex: 11,
                }}
            />
        </AbsoluteFill>
    );
};
