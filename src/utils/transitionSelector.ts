import { TransitionType, AnimationType } from '../types/scene';

// All available transitions with categories
const SMOOTH_TRANSITIONS: TransitionType[] = ['crossfade', 'blur', 'zoom', 'lightLeak', 'radialBlur'];
const DRAMATIC_TRANSITIONS: TransitionType[] = ['whiteFlash', 'glitch', 'filmBurn', 'inkBleed', 'dustCloud', 'smokeReveal'];
const CREATIVE_TRANSITIONS: TransitionType[] = ['rotate', 'circleWipe', 'pixelate', 'colorShift', 'slide', 'wipe', 'ripple', 'prismShift', 'verticalBlinds', 'diamondWipe', 'swooshWipe'];

const ALL_TRANSITIONS: TransitionType[] = [
    ...SMOOTH_TRANSITIONS,
    ...DRAMATIC_TRANSITIONS,
    ...CREATIVE_TRANSITIONS,
];

// All available animations with categories
const SLOW_ANIMATIONS: AnimationType[] = ['kenburns', 'dolly', 'orbit'];
const FAST_ANIMATIONS: AnimationType[] = ['zoom', 'whipPan', 'rotate'];
const SUBTLE_ANIMATIONS: AnimationType[] = ['rackFocus', 'parallax', 'spotlight', 'fade', 'slide'];

const ALL_ANIMATIONS: AnimationType[] = [
    ...SLOW_ANIMATIONS,
    ...FAST_ANIMATIONS,
    ...SUBTLE_ANIMATIONS,
];

/**
 * Select a balanced transition that avoids repetition
 * @param previousTransitions - Array of previously used transitions
 * @param sceneIndex - Current scene index
 * @returns Selected transition type
 */
export function selectBalancedTransition(
    previousTransitions: TransitionType[],
    sceneIndex: number
): TransitionType {
    // Never use 'none'
    const availableTransitions = ALL_TRANSITIONS.filter(t => t !== 'none');

    // Get last 3 transitions to avoid immediate repetition
    const recentTransitions = previousTransitions.slice(-3);

    // Count usage in last 10 transitions
    const last10 = previousTransitions.slice(-10);
    const usageCounts = new Map<TransitionType, number>();
    last10.forEach(t => {
        usageCounts.set(t, (usageCounts.get(t) || 0) + 1);
    });

    // Filter out overused transitions (used 3+ times in last 10)
    let candidates = availableTransitions.filter(t => {
        const count = usageCounts.get(t) || 0;
        return count < 3;
    });

    // Filter out recently used transitions
    candidates = candidates.filter(t => !recentTransitions.includes(t));

    // If we filtered out everything, just use any non-recent transition
    if (candidates.length === 0) {
        candidates = availableTransitions.filter(t => t !== previousTransitions[previousTransitions.length - 1]);
    }

    // Balance between smooth, dramatic, and creative
    let selectedPool: TransitionType[];
    const poolChoice = sceneIndex % 3;

    if (poolChoice === 0) {
        selectedPool = candidates.filter(t => SMOOTH_TRANSITIONS.includes(t));
    } else if (poolChoice === 1) {
        selectedPool = candidates.filter(t => DRAMATIC_TRANSITIONS.includes(t));
    } else {
        selectedPool = candidates.filter(t => CREATIVE_TRANSITIONS.includes(t));
    }

    // If pool is empty, use all candidates
    if (selectedPool.length === 0) {
        selectedPool = candidates;
    }

    // Randomly select from pool
    const randomIndex = Math.floor(Math.random() * selectedPool.length);
    return selectedPool[randomIndex];
}

/**
 * Select a balanced animation that avoids repetition
 * @param previousAnimations - Array of previously used animations
 * @param sceneIndex - Current scene index  
 * @returns Selected animation type
 */
export function selectBalancedAnimation(
    previousAnimations: AnimationType[],
    sceneIndex: number
): AnimationType {
    // Get last 2 animations to avoid immediate repetition
    const recentAnimations = previousAnimations.slice(-2);

    // Filter out recently used
    let candidates = ALL_ANIMATIONS.filter(a => !recentAnimations.includes(a));

    // If we filtered everything, just avoid the last one
    if (candidates.length === 0) {
        candidates = ALL_ANIMATIONS.filter(a => a !== previousAnimations[previousAnimations.length - 1]);
    }

    // Alternate between slow and fast for pacing
    let selectedPool: AnimationType[];

    if (sceneIndex % 2 === 0) {
        selectedPool = candidates.filter(a => SLOW_ANIMATIONS.includes(a) || SUBTLE_ANIMATIONS.includes(a));
    } else {
        selectedPool = candidates.filter(a => FAST_ANIMATIONS.includes(a) || SUBTLE_ANIMATIONS.includes(a));
    }

    // If pool is empty, use all candidates
    if (selectedPool.length === 0) {
        selectedPool = candidates;
    }

    // Randomly select
    const randomIndex = Math.floor(Math.random() * selectedPool.length);
    return selectedPool[randomIndex];
}

/**
 * Get random duration within range
 * @param min - Minimum duration in seconds
 * @param max - Maximum duration in seconds
 * @returns Random duration
 */
export function getRandomDuration(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

/**
 * Get random scale within range
 * @param min - Minimum scale
 * @param max - Maximum scale
 * @returns Random scale
 */
export function getRandomScale(min: number = 1.0, max: number = 1.5): number {
    return min + Math.random() * (max - min);
}
