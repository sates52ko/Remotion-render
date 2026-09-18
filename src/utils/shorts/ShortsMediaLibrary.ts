// ═══════════════════════════════════════════════════════════════
// 🎵 Shorts Media Library — Background Music & SFX
// Seeded random selection ensures YPP uniqueness per video
// ═══════════════════════════════════════════════════════════════

export interface MusicTrack {
    /** File path relative to public/ */
    file: string;
    /** Human-readable name */
    name: string;
    /** Suggested volume (0–1) — tuned per track loudness */
    volume: number;
    /** Vibe tag for theme matching */
    vibe: 'motivational' | 'epic' | 'calm' | 'dramatic' | 'energetic';
}

export interface TransitionSfx {
    file: string;
    name: string;
    volume: number;
}

// ── Music Library ─────────────────────────────────────────────
// Download from Pixabay (royalty-free, YouTube-safe):
//   1. pixabay.com/music/upbeat-inspiring-documentary-116194/
//   2. pixabay.com/music/epic-cinematic-epic-opener-137351/
//   3. pixabay.com/music/motivational-motivational-trailer-106148/
//   4. pixabay.com/music/piano-solo-soft-background-piano-252924/
//   5. pixabay.com/music/upbeat-dramatic-rise-279695/
// Place them in: public/music/shorts/

export const SHORTS_MUSIC_TRACKS: MusicTrack[] = [
    {
        file: 'shorts/music/bg-inspiring.mp3',
        name: 'Inspiring Documentary',
        volume: 0.085,
        vibe: 'motivational',
    },
    {
        file: 'shorts/music/bg-epic.mp3',
        name: 'Epic Cinematic Opener',
        volume: 0.068,
        vibe: 'epic',
    },
    {
        file: 'shorts/music/bg-motivational.mp3',
        name: 'Motivational Trailer',
        volume: 0.0765,
        vibe: 'energetic',
    },
    {
        file: 'shorts/music/bg-piano.mp3',
        name: 'Soft Background Piano',
        volume: 0.102,
        vibe: 'calm',
    },
    {
        file: 'shorts/music/bg-dramatic.mp3',
        name: 'Dramatic Rise',
        volume: 0.0765,
        vibe: 'dramatic',
    },
];

// ── Transition SFX ────────────────────────────────────────────
// Place in: public/shorts/sfx/

export const SHORTS_TRANSITION_SFX: TransitionSfx[] = [
    {
        file: 'shorts/sfx/whoosh.mp3',
        name: 'Whoosh',
        volume: 0.6,
    },
    {
        file: 'shorts/sfx/swipe.mp3',
        name: 'Swipe',
        volume: 0.5,
    },
    {
        file: 'shorts/sfx/pop.mp3',
        name: 'Pop',
        volume: 0.55,
    },
];

// ── Seeded Hash ───────────────────────────────────────────────
// Simple deterministic hash so the same title always gets the same music

function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash |= 0; // Convert to 32-bit int
    }
    return Math.abs(hash);
}

// ── Pickers ───────────────────────────────────────────────────

/**
 * Pick a music track based on a seed string (e.g. video title).
 * Same seed → same track every time.
 */
export function pickMusic(seed: string): MusicTrack {
    const idx = simpleHash(seed) % SHORTS_MUSIC_TRACKS.length;
    return SHORTS_MUSIC_TRACKS[idx];
}

/**
 * Pick a transition SFX based on a seed string.
 */
export function pickSfx(seed: string): TransitionSfx {
    const idx = simpleHash(seed + '-sfx') % SHORTS_TRANSITION_SFX.length;
    return SHORTS_TRANSITION_SFX[idx];
}

/**
 * Get a full media selection for a Shorts video.
 */
export function getAutoMedia(videoTitle: string) {
    const music = pickMusic(videoTitle);
    const sfx = pickSfx(videoTitle);
    return { music, sfx };
}
