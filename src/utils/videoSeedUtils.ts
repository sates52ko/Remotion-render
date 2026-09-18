import { BackgroundVariant } from '../components/ParticleBackground';
import { VISUAL_DNA_LIBRARY, VisualDNA } from './ProceduralStyleLibrary';

/**
 * videoSeedUtils — Deterministic per-video random selector
 *
 * Converts title+author into a numeric hash seed, then uses that seed to
 * deterministically pick items from pools.  Same title+author always
 * produces the same selections, but different videos look different.
 *
 * Usage:
 *   const seed = makeVideoSeed('A Fate So Cold', 'Amanda Foody');
 *   const bgVariant   = pickFromSeed(seed, 'bg',   BG_VARIANTS);
 *   const waveStyle   = pickFromSeed(seed, 'wave', WAVE_STYLES);
 *   const captionStyle = pickFromSeed(seed, 'cap', CAPTION_STYLES);
 */

// ── Simple fast hash (djb2) ─────────────────────────────────────────────────
function hashString(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
        h = h >>> 0; // ensure unsigned 32-bit
    }
    return h;
}

/** Make a video-level seed from title + author */
export function makeVideoSeed(title: string, author: string): number {
    return hashString(`${title}::${author}`);
}

/**
 * Pick one item from `pool` based on `seed` + `key`.
 * The `key` differentiates different pick calls for the same seed
 * (e.g. 'bg', 'wave', 'caption') so each call returns independent values.
 */
export function pickFromSeed<T>(seed: number, key: string, pool: readonly T[]): T {
    const combined = hashString(`${seed}::${key}`);
    return pool[combined % pool.length];
}

/** Pick a complete Visual DNA bundle based on the video seed */
export function pickVisualDNA(seed: number): VisualDNA {
    return pickFromSeed(seed, 'visual-dna', VISUAL_DNA_LIBRARY);
}

/** Generate a random offset (e.g. for position jittering) */
export function randomOffset(seed: number, key: string, range: number): number {
    const combined = hashString(`${seed}::${key}`);
    return (combined % (range * 2)) - range;
}

// ── Background variant pools by genre ───────────────────────────────────────

import type { BackgroundVariant } from '../components/ParticleBackground';

/** Genre → suitable background variants */
export const BG_POOLS: Record<string, BackgroundVariant[]> = {
    fantasy: ['stars', 'floatingShapes', 'bokeh', 'floatingOrbs', 'pulseRings', 'geometric', 'shootingStars'],
    scifi: ['binary', 'speedLines', 'gridDots', 'motionLines', 'pulseRings', 'geometric', 'stars'],
    horror: ['dust', 'rain', 'bokeh', 'geometric', 'stars'] as BackgroundVariant[],
    romance: ['hearts', 'bokeh', 'bubbles', 'fireflies', 'floatingOrbs', 'bokeh'],
    mystery: ['dust', 'bokeh', 'stars', 'floatingOrbs', 'rain'],
    selfhelp: ['confetti', 'glitter', 'floatingShapes', 'speedLines', 'pulseRings'],
    history: ['dust', 'leaves', 'bokeh', 'geometric', 'floatingShapes'],
    default: ['stars', 'bokeh', 'floatingOrbs', 'dust', 'floatingShapes', 'geometric', 'pulseRings'],
};

/** Resolve genre string to pool key */
export function getBgPool(genre: string): BackgroundVariant[] {
    const g = genre.toLowerCase().replace(/[^a-z]/g, '');
    const key =
        ['fantasy', 'scifi', 'horror', 'romance', 'mystery', 'selfhelp', 'history'].find(k =>
            g.includes(k) || (k === 'selfhelp' && (g.includes('self') || g.includes('business')))
        ) ?? 'default';
    return BG_POOLS[key] ?? BG_POOLS.default;
}

// ── Waveform style pool ──────────────────────────────────────────────────────

export type WaveStyleChoice = 'waveform' | 'visualizer-bars' | 'visualizer-mirror' | 'visualizer-rounded';
export const WAVE_STYLES: WaveStyleChoice[] = [
    'waveform', 'visualizer-bars', 'visualizer-mirror', 'visualizer-rounded',
];

// ── Caption highlight color pool ────────────────────────────────────────────

export const HIGHLIGHT_COLORS = [
    '#FFE600', // YouTube yellow
    '#00FF88', // neon green
    '#FF6B6B', // coral red
    '#4ECDC4', // teal
    '#FFB347', // warm orange
    '#CF9FFF', // soft purple
    '#00CFFF', // electric blue
] as const;

// ── Caption base color pool ──────────────────────────────────────────────────

export const CAPTION_COLORS = [
    '#FFFFFF',
    '#F0F0F0',
    '#E8F4FD',
] as const;
