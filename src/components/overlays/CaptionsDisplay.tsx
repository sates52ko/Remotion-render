/**
 * CaptionsDisplay — YouTube-optimized animated captions using @remotion/captions
 *
 * Uses `createTikTokStyleCaptions` to group SRT captions into "pages" (chunks),
 * then renders each page as a Sequence with word-by-word token highlighting.
 *
 * WHY THIS IS GOOD FOR YOUTUBE:
 *  - Burned-in animated subtitles increase watch time & viewer retention
 *  - Word-by-word highlight keeps viewers engaged and following along
 *  - Large readable font works on mobile (most YouTube watch happens on mobile)
 *  - No background box — clean, doesn't cover scene content
 *  - 1500ms page duration = comfortable reading pace for long-form content
 *
 * Usage:
 *   import { CaptionsDisplay } from '../components/overlays/CaptionsDisplay';
 *   import { parseSRT, srtToRemotionCaptions } from '../utils/srtParser';
 *
 *   const srtCaptions = parseSRT(srtContent);
 *   const captions = srtToRemotionCaptions(srtCaptions);
 *
 *   <CaptionsDisplay captions={captions} />
 *
 * Props:
 *   captions              — Caption[] from srtToRemotionCaptions()
 *   captionStyle          — 'youtube' | 'minimal' | 'highlight-box' (default: 'youtube')
 *   fontSize              — font size in px (default: 56)
 *   position              — 'bottom' | 'top' | 'center' (default: 'bottom')
 *   color                 — base text color (default: '#ffffff')
 *   highlightColor        — active word color (default: '#FFE600')
 *   pageMs                — ms per caption page (default: 1500)
 *   bottomOffset          — px from bottom edge (default: 90)
 *   offset                — seconds to delay captions (e.g. -1.8 to shift earlier)
 */

import React, { useMemo } from 'react';
import {
    AbsoluteFill,
    Sequence,
    useCurrentFrame,
    useVideoConfig,
} from 'remotion';
import { createTikTokStyleCaptions } from '@remotion/captions';
import type { Caption as RemotionCaption, TikTokPage, TikTokToken } from '@remotion/captions';

// ─── Types ────────────────────────────────────────────────────────────────────

type CaptionStyle = 'youtube' | 'minimal' | 'highlight-box';

interface CaptionsDisplayProps {
    captions: RemotionCaption[];
    captionStyle?: CaptionStyle;
    fontSize?: number;
    position?: 'bottom' | 'top' | 'center';
    color?: string;
    highlightColor?: string;
    pageMs?: number;
    bottomOffset?: number;
    offset?: number;
}

// ─── Single Token (word) ──────────────────────────────────────────────────────

const CaptionToken: React.FC<{
    token: TikTokToken;
    isActive: boolean;
    captionStyle: CaptionStyle;
    color: string;
    highlightColor: string;
    fontSize: number;
}> = ({ token, isActive, captionStyle, color, highlightColor, fontSize }) => {
    const activeStyle: React.CSSProperties =
        captionStyle === 'highlight-box'
            ? {
                backgroundColor: isActive ? highlightColor : 'transparent',
                color: isActive ? '#000' : color,
                borderRadius: 6,
                padding: '0 4px',
            }
            : {
                color: isActive ? highlightColor : color,
            };

    return (
        <span
            style={{
                display: 'inline-block',
                fontWeight: isActive ? 900 : 800,
                fontSize,
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
                transformOrigin: 'center bottom',
                transition: 'color 0.05s, transform 0.05s',
                whiteSpace: 'pre',
                ...activeStyle,
            }}
        >
            {token.text}
        </span>
    );
};

// ─── One Page of Captions ─────────────────────────────────────────────────────

const CaptionPage: React.FC<{
    page: TikTokPage;
    captionStyle: CaptionStyle;
    fontSize: number;
    color: string;
    highlightColor: string;
    position: 'bottom' | 'top' | 'center';
    bottomOffset: number;
}> = ({ page, captionStyle, fontSize, color, highlightColor, position, bottomOffset }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // currentTimeMs relative to start of this Sequence
    const currentTimeMs = (frame / fps) * 1000;
    // Absolute time = page start + offset within sequence
    const absoluteTimeMs = page.startMs + currentTimeMs;

    const positionStyle: React.CSSProperties =
        position === 'bottom'
            ? { bottom: bottomOffset, left: 0, right: 0 }
            : position === 'top'
                ? { top: 80, left: 0, right: 0 }
                : { top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' };

    // Text shadow for all styles — ensures readability on any background
    const textShadow =
        captionStyle === 'minimal'
            ? '0 2px 8px rgba(0,0,0,0.8)'
            : '-2px -2px 0 rgba(0,0,0,0.9), 2px -2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.9), 0 3px 12px rgba(0,0,0,0.8)';

    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <div
                style={{
                    position: 'absolute',
                    ...positionStyle,
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '0 80px',
                }}
            >
                <div
                    style={{
                        textAlign: 'center',
                        lineHeight: 1.3,
                        fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
                        textShadow,
                        maxWidth: '85%',
                    }}
                >
                    {page.tokens.map((token) => {
                        const isActive =
                            token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
                        return (
                            <CaptionToken
                                key={token.fromMs}
                                token={token}
                                isActive={isActive}
                                captionStyle={captionStyle}
                                color={color}
                                highlightColor={highlightColor}
                                fontSize={fontSize}
                            />
                        );
                    })}
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ─── Main Export ──────────────────────────────────────────────────────────────

export const CaptionsDisplay: React.FC<CaptionsDisplayProps> = ({
    captions,
    captionStyle = 'youtube',
    fontSize = 56,
    position = 'bottom',
    color = '#ffffff',
    highlightColor = '#FFE600',
    pageMs = 1500,
    bottomOffset = 90,
    offset = 0,
}) => {
    const { fps } = useVideoConfig();

    // Shift all captions by the offset (convert seconds → ms)
    const shiftedCaptions = useMemo(() => {
        if (offset === 0) return captions;
        const shiftMs = Math.round(offset * 1000);
        return captions.map((c) => ({
            ...c,
            startMs: Math.max(0, c.startMs + shiftMs),
            endMs: Math.max(0, c.endMs + shiftMs),
            timestampMs: c.timestampMs !== null ? Math.max(0, c.timestampMs + shiftMs) : null,
        }));
    }, [captions, offset]);

    const { pages } = useMemo(
        () =>
            createTikTokStyleCaptions({
                captions: shiftedCaptions,
                combineTokensWithinMilliseconds: pageMs,
            }),
        [shiftedCaptions, pageMs]
    );

    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            {pages.map((page, index) => {
                const nextPage = pages[index + 1] ?? null;
                const startFrame = Math.round((page.startMs / 1000) * fps);
                const rawEnd = nextPage
                    ? Math.round((nextPage.startMs / 1000) * fps)
                    : startFrame + Math.round((pageMs / 1000) * fps);
                const endFrame = Math.min(rawEnd, startFrame + Math.round((pageMs / 1000) * fps));
                const durationInFrames = Math.max(1, endFrame - startFrame);

                return (
                    <Sequence
                        key={index}
                        from={startFrame}
                        durationInFrames={durationInFrames}
                        layout="none"
                    >
                        <CaptionPage
                            page={page}
                            captionStyle={captionStyle}
                            fontSize={fontSize}
                            color={color}
                            highlightColor={highlightColor}
                            position={position}
                            bottomOffset={bottomOffset}
                        />
                    </Sequence>
                );
            })}
        </AbsoluteFill>
    );
};
