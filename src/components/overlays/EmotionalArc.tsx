import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Theme } from '../../themes';

export interface EmotionalArcProps {
    dataPoints: number[];
    labels?: string[];
    theme: Theme;
    height?: number;
    position?: 'top' | 'bottom';
}

export const EmotionalArc: React.FC<EmotionalArcProps> = ({
    dataPoints,
    labels,
    theme,
    height = 80,
    position = 'top',
}) => {
    // Normalize data: ensure values are 0-1
    const normalizedData = React.useMemo(() => {
        if (dataPoints.length === 0) return [];
        const max = Math.max(...dataPoints, 1);
        const min = Math.min(...dataPoints, 0);
        const range = max - min || 1;
        return dataPoints.map(v => (v - min) / range);
    }, [dataPoints]);

    if (normalizedData.length === 0) return null;

    const width = 300;
    const spacing = width / (normalizedData.length - 1 || 1);

    // Build SVG path
    const points = normalizedData.map((val, i) => {
        const x = i * spacing;
        const y = height - (val * (height - 20)) - 10;
        return `${x},${y}`;
    }).join(' ');

    const linePath = `M ${points}`;

    return (
        <div style={{
            padding: '15px 25px',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(10px)',
            borderRadius: '12px',
            border: `1px solid ${theme.background.particleColor}33`,
            color: theme.text.primary,
            fontFamily: 'Inter, sans-serif',
            boxShadow: `0 4px 20px rgba(0,0,0,0.3), 0 0 15px ${theme.effects.glowColor}22`
        }}>
            <div style={{ fontSize: '12px', marginBottom: '8px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Emotional Resonance
            </div>
            
            <svg width={width} height={height} style={{ overflow: 'visible' }}>
                {/* Simplified Path - No SVG filters (using CSS drop-shadow instead) */}
                <path
                    d={linePath}
                    fill="none"
                    stroke={theme.caption.highlightColor}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        filter: `drop-shadow(0 0 8px ${theme.effects.glowColor})`
                    }}
                />
                
                {/* Current segment highlight if needed - omitting for maximum performance */}
            </svg>
            
            {labels && labels.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '10px', opacity: 0.6 }}>
                    <span>{labels[0]}</span>
                    <span>{labels[labels.length - 1]}</span>
                </div>
            )}
        </div>
    );
};
