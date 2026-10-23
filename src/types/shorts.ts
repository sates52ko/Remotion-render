// ── Shorts / Reels Types ──────────────────────────────────────────────────────

/** Information about a recommended book */
export interface BookInfo {
    title: string;
    author: string;
    description: string; // One-liner hook
    coverImage?: string; // Path relative to public/ (e.g. "shorts/covers/book1.jpg")
}

/** Segment type determines layout behaviour */
export type SegmentType = 'hook' | 'book' | 'outro';

/** A single segment (clip) in the short video */
export interface Segment {
    id: string; // e.g. "segment-1"
    type: SegmentType;
    videoFile: string; // Path relative to public/ (e.g. "shorts/videos/segment-1.mp4")
    /** Optional text shown on screen (used for hook/outro) */
    overlayText?: string;
    /** Book data — only used when type === 'book' */
    book?: BookInfo;
    /** Book number label (e.g. "#1", "#2") */
    bookNumber?: number;
}

/** Transition style between segments */
export type ShortsTransitionType =
    | 'whiteFlash'
    | 'glitch'
    | 'zoom'
    | 'crossfade'
    | 'slide'
    | 'none';

/** Full configuration for a Book Recommendation Short */
export interface ShortsConfig {
    /** All segments in playback order */
    segments: Segment[];
    /** Background music file path relative to public/ */
    bgMusic?: string;
    /** Background music volume (0–1, default 0.12) */
    bgMusicVolume?: number;
    /** Transition style between segments (default: random balanced) */
    transitionType?: ShortsTransitionType;
    /** Transition duration in seconds (default: 0.4) */
    transitionDuration?: number;
    /** Theme accent colour (default: '#ff6b35' — energetic orange) */
    accentColor?: string;
}
