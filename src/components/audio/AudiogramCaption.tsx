/**
 * AudiogramCaption — Simple caption display for audiograms
 *
 * Works with the existing Caption type from srtParser.
 * For @remotion/captions integration, convert with: startMs/endMs = startTime/endTime * 1000
 *
 * Usage:
 *   import { AudiogramCaption } from '../components/audio/AudiogramCaption';
 *   <AudiogramCaption captions={captions} />
 *
 * Props:
 *   captions       — Caption[] from srtParser (startTime/endTime in seconds)
 *   color          — text color (default: '#ffffff')
 *   fontSize       — font size in px (default: 48)
 *   fontFamily     — font family (default: 'Inter, sans-serif')
 *   highlightColor — active word color (default: '#FFE600')
 *   position       — 'top' | 'center' | 'bottom' (default: 'bottom')
 *   offset         — sync offset in seconds (default: 0)
 *   style          — optional text style override
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { Caption } from '../../utils/srtParser';
import { getActiveWordIndex } from '../../utils/srtParser';

interface AudiogramCaptionProps {
    captions: Caption[];
    color?: string;
    fontSize?: number;
    fontFamily?: string;
    highlightColor?: string;
    position?: 'top' | 'center' | 'bottom';
    offset?: number;
    style?: React.CSSProperties;
}

export const AudiogramCaption: React.FC<AudiogramCaptionProps> = ({
    captions,
    color = '#ffffff',
    fontSize = 48,
    fontFamily = "Inter, 'Segoe UI', sans-serif",
    highlightColor = '#FFE600',
    position = 'bottom',
    offset = 0,
    style,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps - offset;

    const currentCaption = captions.find(
        (c) => currentTime >= c.startTime && currentTime <= c.endTime
    );

    if (!currentCaption) return null;

    const opacity = interpolate(
        currentTime,
        [currentCaption.startTime, currentCaption.startTime + 0.1, currentCaption.endTime - 0.1, currentCaption.endTime],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const positionStyle: React.CSSProperties =
        position === 'bottom'
            ? { bottom: 80, left: 0, right: 0 }
            : position === 'top'
                ? { top: 80, left: 0, right: 0 }
                : { top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' };

    const activeWordIndex = getActiveWordIndex(currentCaption, currentTime);

    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <div
                style={{
                    position: 'absolute',
                    ...positionStyle,
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '0 80px',
                    opacity,
                }}
            >
                <p
                    style={{
                        margin: 0,
                        fontSize,
                        fontFamily,
                        fontWeight: 800,
                        lineHeight: 1.4,
                        textAlign: 'center',
                        color,
                        textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000',
                        ...style,
                    }}
                >
                    {currentCaption.words
                        ? currentCaption.words.map((word, i) => (
                            <span
                                key={i}
                                style={{
                                    color: i === activeWordIndex ? highlightColor : color,
                                    fontWeight: i === activeWordIndex ? 900 : 800,
                                    display: 'inline-block',
                                    marginRight: '0.2em',
                                    transform: i === activeWordIndex ? 'scale(1.1)' : 'scale(1)',
                                    transformOrigin: 'center bottom',
                                    transition: 'color 0.05s',
                                }}
                            >
                                {word.text}
                            </span>
                        ))
                        : currentCaption.text}
                </p>
            </div>
        </AbsoluteFill>
    );
};
