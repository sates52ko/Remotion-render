import React from 'react';
import {
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    spring,
    Img,
    staticFile,
} from 'remotion';
import type { BookInfo } from '../../types/shorts';

interface BookInfoOverlayProps {
    book: BookInfo;
    bookNumber?: number;
    accentColor?: string;
    theme?: any; // The assigned ShortsTheme
}


/**
 * BookInfoOverlay — Animated book title + author overlay.
 *
 * Positioned in the bottom third of the vertical frame.
 * Uses spring animations for a punchy, TikTok-style entrance.
 */
export const BookInfoOverlay: React.FC<BookInfoOverlayProps> = ({
    book,
    bookNumber,
    accentColor = '#ff6b35',
    theme,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const titleFont = theme ? theme.typography.titleFont : "'Inter', 'Segoe UI', sans-serif";
    const bodyFont = theme ? theme.typography.bodyFont : "'Inter', 'Segoe UI', sans-serif";
    const titleWeight = theme ? theme.typography.fontWeightPrimary : 900;

    // Animation type handling
    const animType = theme ? theme.animations.overlayEntrance : 'spring-pop';


    // ── Number badge animation ─────────────────────────────────────────
    const badgeScale = spring({
        frame: frame - 5,
        fps,
        config: { damping: 12, stiffness: 200, mass: 0.8 },
    });

    // ── Title animation ───────────────────────────────────────
    const titleProgress = spring({
        frame: frame - 10,
        fps,
        config: animType === 'float-in' ? { damping: 20, stiffness: 100 } : { damping: 14, stiffness: 180, mass: 0.6 },
    });

    // Dynamic values based on animation style
    let titleY = interpolate(titleProgress, [0, 1], [60, 0]);
    let titleScale = 1;
    let titleOp = interpolate(titleProgress, [0, 1], [0, 1]);

    if (animType === 'spring-pop') {
        titleScale = interpolate(titleProgress, [0, 1], [0.8, 1]);
    } else if (animType === 'fade-blur') {
        titleY = 0; // Pure fade
    }

    // ── Author fade-in ────────────────────────────────────────────────
    const authorProgress = spring({
        frame: frame - 18,
        fps,
        config: { damping: 14, stiffness: 150, mass: 0.6 },
    });
    const authorOpacity = interpolate(authorProgress, [0, 1], [0, 1]);
    const authorY = animType === 'fade-blur' ? 0 : interpolate(authorProgress, [0, 1], [30, 0]);

    // ── Description fade-in ────────────────────────────────────────────
    const descProgress = spring({
        frame: frame - 25,
        fps,
        config: { damping: 14, stiffness: 150, mass: 0.6 },
    });
    const descOpacity = interpolate(descProgress, [0, 1], [0, 1]);


    // ── Cover image slide-in (if provided) ────────────────────────────
    const coverProgress = spring({
        frame: frame - 8,
        fps,
        config: { damping: 12, stiffness: 200, mass: 0.8 },
    });
    const coverScale = interpolate(coverProgress, [0, 1], [0.5, 1]);
    const coverOpacity = interpolate(coverProgress, [0, 1], [0, 1]);

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '8%',
                left: 0,
                right: 0,
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '0 40px',
            }}
        >
            {/* Book cover (optional) */}
            {book.coverImage && (
                <div
                    style={{
                        marginBottom: 20,
                        transform: `scale(${coverScale})`,
                        opacity: coverOpacity,
                    }}
                >
                    <Img
                        src={staticFile(book.coverImage)}
                        style={{
                            width: 160,
                            height: 240,
                            objectFit: 'cover',
                            borderRadius: 10,
                            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${accentColor}30`,
                            border: `2px solid ${accentColor}60`,
                        }}
                    />
                </div>
            )}

            {/* Number badge */}
            {bookNumber !== undefined && (
                <div
                    style={{
                        transform: `scale(${badgeScale})`,
                        marginBottom: 12,
                    }}
                >
                    <div
                        style={{
                            background: accentColor,
                            color: theme ? theme.colors.backgroundGradient[1].replace(/rgba?\((.*?)[,\)].*/, 'rgba($1,1)') : '#fff', // Use a dark text color if bg is bright, or just white
                            fontSize: 35,
                            fontWeight: 900,
                            fontFamily: titleFont,
                            padding: '8px 30px',
                            borderRadius: theme?.styling?.overlayStyle === 'bold-solid' ? 0 : 50,
                            letterSpacing: 1,
                            boxShadow: `0 4px 20px ${theme ? theme.colors.shadow : accentColor + '80'}`,
                            textTransform: 'uppercase',
                        }}
                    >
                        #{bookNumber}
                    </div>

                </div>
            )}

            {/* Book title */}
            <div
                style={{
                    transform: `translateY(${titleY}px) scale(${titleScale})`,
                    opacity: titleOp,
                    marginBottom: 8,
                }}
            >
                <h2
                    style={{
                        fontSize: 58,
                        fontWeight: titleWeight,
                        fontFamily: titleFont,
                        color: theme ? theme.colors.textPrimary : '#fff',
                        textAlign: 'center',
                        lineHeight: 1.15,
                        margin: 0,
                        textShadow: theme?.styling?.overlayStyle === 'neon-glow'
                            ? `0 0 10px ${accentColor}, 0 0 20px ${accentColor}`
                            : '0 2px 12px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.4)',
                        letterSpacing: -0.5,
                    }}
                >
                    {book.title}
                </h2>
            </div>


            {/* Author */}
            <div
                style={{
                    transform: `translateY(${authorY}px)`,
                    opacity: authorOpacity,
                    marginBottom: 10,
                }}
            >
                <p
                    style={{
                        fontSize: 32,
                        fontWeight: 700,
                        fontFamily: bodyFont,
                        color: accentColor,
                        textAlign: 'center',
                        margin: 0,
                        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                    }}
                >
                    by {book.author}
                </p>
            </div>


            {/* Description tagline */}
            <div style={{ opacity: descOpacity }}>
                <p
                    style={{
                        fontSize: 28,
                        fontWeight: 400,
                        fontFamily: bodyFont,
                        color: theme ? theme.colors.textSecondary : 'rgba(255,255,255,0.85)',
                        textAlign: 'center',
                        margin: 0,
                        maxWidth: 800,
                        lineHeight: 1.4,
                        textShadow: '0 1px 6px rgba(0,0,0,0.5)',
                    }}
                >
                    {book.description}
                </p>
            </div>

        </div>
    );
};
