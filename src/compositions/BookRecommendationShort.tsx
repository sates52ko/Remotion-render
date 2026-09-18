import React from 'react';
import {
    AbsoluteFill,
    Sequence,
    Audio,
    staticFile,
    useVideoConfig,
    useCurrentFrame,
    spring,
} from 'remotion';
import { z } from 'zod';
import {
    ShortsLayout,
    FaceVideoSegment,
    BookInfoOverlay,
    ShortsTransition,
} from '../components/shorts';
import { ShortsCaptionOverlay, pickCaptionStyle, ShortsCaptionStyle } from '../components/shorts/ShortsCaptionOverlay';
import { getAutoMedia } from '../utils/shorts/ShortsMediaLibrary';
import { getShortsTheme, ShortsThemeId } from '../themes/shorts';



// Types from ../types/shorts are used via Zod schema inference

// ── Zod Schema ───────────────────────────────────────────────────────────────

const bookInfoSchema = z.object({
    title: z.string(),
    author: z.string(),
    description: z.string(),
    coverImage: z.string().optional(),
});

const segmentSchema = z.object({
    id: z.string(),
    type: z.enum(['hook', 'book', 'outro']),
    videoFile: z.string(),
    overlayText: z.string().optional(),
    book: bookInfoSchema.optional(),
    bookNumber: z.number().optional(),
    isHorizontal: z.boolean().optional(),
});

export const bookRecommendationShortSchema = z.object({
    segments: z.array(segmentSchema),
    bgMusic: z.string().optional(),
    bgMusicVolume: z.number().optional(),
    /** Transition SFX file (e.g. whoosh/swoosh) played at each segment boundary */
    transitionSfx: z.string().optional(),
    transitionSfxVolume: z.number().optional(),
    transitionDuration: z.number().optional(),
    transitionType: z.custom<any>().optional(), // ShortsTransitionType
    accentColor: z.string().optional(),
    themeId: z.custom<ShortsThemeId>().optional(),
    /** Seed for auto-selecting music (defaults to first segment id) */
    musicSeed: z.string().optional(),
    /** Caption animation style (auto-picked if not set) */
    captionStyle: z.custom<ShortsCaptionStyle>().optional(),
    /** Show animated captions (default: true) */
    showCaptions: z.boolean().optional(),

    /** Array of durations in frames, dynamically computed via calculateMetadata */
    segmentDurations: z.array(z.number()).optional(),
});

export type BookRecommendationShortProps = z.infer<typeof bookRecommendationShortSchema>;

// ── Component ────────────────────────────────────────────────────────────────

export const BookRecommendationShort: React.FC<BookRecommendationShortProps> = ({
    segments,
    bgMusic,
    bgMusicVolume,
    transitionSfx,
    transitionSfxVolume,
    transitionDuration = 0.4,
    transitionType,
    accentColor,
    themeId = 'epic-bestseller',
    musicSeed,
    captionStyle,
    showCaptions = true,
    segmentDurations,
}) => {
    const theme = getShortsTheme(themeId);
    const activeAccentColor = accentColor || theme.colors.accent;
    const activeTransition = transitionType || theme.animations.transitionDefault;

    // ── Auto-select music & SFX from library if not explicitly provided ──
    const seed = musicSeed || segments[0]?.id || 'default-shorts';
    const autoMedia = React.useMemo(() => getAutoMedia(seed), [seed]);
    const activeBgMusic = bgMusic || autoMedia.music.file;
    const activeBgMusicVolume = bgMusicVolume ?? autoMedia.music.volume;
    const activeTransitionSfx = transitionSfx || autoMedia.sfx.file;
    const activeTransitionSfxVolume = transitionSfxVolume ?? autoMedia.sfx.volume;

    // ── Auto-select caption style if not explicitly provided ──
    const activeCaptionStyle = captionStyle || pickCaptionStyle(seed);

    console.log(`BookRecommendationShort [${seed}] 🎵 ${autoMedia.music.name} | ✍️ ${activeCaptionStyle} | segments:`, segments.length);



    const { fps } = useVideoConfig();
    const transFrames = Math.round(transitionDuration * fps);

    // Default durations if not dynamically computed (fallback: 10s each)
    const durations = segmentDurations ?? segments.map(() => fps * 10);

    // Build sequences: for each segment, figure out its absolute start frame
    let currentFrame = 0;
    const sequenceEntries: {
        segment: (typeof segments)[number] & { isHorizontal?: boolean };
        startFrame: number;
        durationInFrames: number;
    }[] = [];

    for (let i = 0; i < segments.length; i++) {
        const dur = durations[i] ?? fps * 10;
        sequenceEntries.push({
            segment: segments[i] as (typeof segments)[number] & { isHorizontal?: boolean },
            startFrame: currentFrame,
            durationInFrames: dur,
        });
        currentFrame += dur;
    }

    console.log("Sequence Entries:", sequenceEntries.map(s => ({ id: s.segment.id, startFrame: s.startFrame, duration: s.durationInFrames })));


    return (
        <AbsoluteFill style={{ fontFamily: theme.typography.bodyFont }}>
            <ShortsLayout theme={theme} accentColor={activeAccentColor}>
                {/* ── Segment sequences ─────────────────────────────── */}

                {sequenceEntries.map(({ segment, startFrame, durationInFrames }, i) => (
                    <Sequence
                        key={segment.id}
                        from={startFrame}
                        durationInFrames={durationInFrames}
                    >
                        {/* Face-camera video */}
                        <FaceVideoSegment
                            videoFile={segment.videoFile}
                            isHorizontal={segment.isHorizontal ?? false}
                        />

                        {/* Book info overlay (only for book segments) */}
                        {segment.type === 'book' && segment.book && (
                            <BookInfoOverlay
                                book={segment.book}
                                bookNumber={segment.bookNumber}
                                theme={theme}
                                accentColor={activeAccentColor}
                            />
                        )}

                        {/* Animated caption overlay */}
                        {showCaptions && (
                            <ShortsCaptionOverlay
                                text={
                                    segment.overlayText ||
                                    (segment.book ? segment.book.title : '')
                                }
                                style={activeCaptionStyle}
                                accentColor={activeAccentColor}
                                fontFamily={theme.typography.titleFont}
                                position={segment.type === 'hook' ? 'center' : segment.type === 'outro' ? 'bottom' : 'top'}
                                fontSize={segment.type === 'hook' ? 48 : 36}
                            />
                        )}

                        {/* Book number badge (pulsing) */}
                        {segment.type === 'book' && segment.bookNumber && (
                            <BookNumberBadge
                                number={segment.bookNumber}
                                accentColor={activeAccentColor}
                            />
                        )}

                    </Sequence>
                ))}

                {/* ── Transitions between segments ──────────────────── */}
                {sequenceEntries.slice(1).map(({ startFrame }, i) => (
                    <Sequence
                        key={`trans-${i}`}
                        from={startFrame - transFrames}
                        durationInFrames={transFrames * 2}
                    >
                        <ShortsTransition
                            type={activeTransition}
                            durationInFrames={transFrames * 2}
                        />

                    </Sequence>
                ))}

                {/* ── Transition SFX at each segment boundary ────────── */}
                {activeTransitionSfx &&
                    sequenceEntries.slice(1).map(({ startFrame }, i) => (
                        <Sequence
                            key={`sfx-${i}`}
                            from={Math.max(0, startFrame - transFrames)}
                            durationInFrames={transFrames * 3}
                        >
                            <Audio
                                src={staticFile(activeTransitionSfx)}
                                volume={activeTransitionSfxVolume}
                            />
                        </Sequence>
                    ))}
            </ShortsLayout>

            {/* ── Background music (auto-selected from library) ── */}
            <Audio
                src={staticFile(activeBgMusic)}
                volume={activeBgMusicVolume}
                loop
            />
        </AbsoluteFill>
    );
};

// ── Helper: simple text overlay for hook / outro segments ─────────────────────

const OverlayText: React.FC<{ text: string; theme: any; accentColor: string }> = ({
    text,
    theme,
    accentColor,
}) => {

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '10%',
                left: 0,
                right: 0,
                zIndex: 20,
                display: 'flex',
                justifyContent: 'center',
                padding: '0 36px',
            }}
        >
            <p
                style={{
                    fontSize: 45,
                    fontWeight: theme.typography.fontWeightPrimary,
                    fontFamily: theme.typography.titleFont,
                    color: theme.colors.textPrimary,
                    textAlign: 'center',
                    lineHeight: 1.3,
                    margin: 0,
                    textShadow: `0 2px 12px rgba(0,0,0,0.8), 0 0 30px ${theme.colors.shadow}`,
                }}
            >

                {text}
            </p>
        </div>
    );
};

// ── BookNumberBadge: pulsing circle for "#1", "#2" etc. ───────────────────────

const BookNumberBadge: React.FC<{ number: number; accentColor: string }> = ({
    number,
    accentColor,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Entrance spring
    const enterScale = spring({
        frame,
        fps,
        config: { damping: 12, stiffness: 180, mass: 0.8 },
    });

    // Gentle pulse after entrance
    const pulse = spring({
        frame: frame % (fps * 2),
        fps,
        from: 1,
        to: 1.08,
        config: { damping: 100, stiffness: 200 },
    });

    return (
        <div
            style={{
                position: 'absolute',
                top: '6%',
                left: '6%',
                zIndex: 60,
                transform: `scale(${enterScale * pulse})`,
                opacity: enterScale,
            }}
        >
            <div
                style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: accentColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 4px 20px ${accentColor}80, 0 0 40px ${accentColor}40`,
                    border: '3px solid rgba(255,255,255,0.3)',
                }}
            >
                <span
                    style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 32,
                        fontWeight: 900,
                        color: '#ffffff',
                        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    }}
                >
                    #{number}
                </span>
            </div>
        </div>
    );
};

