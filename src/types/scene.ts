// Enhanced scene types with cinematic transitions

export type AnimationType =
    | 'fade'
    | 'slide'
    | 'zoom'
    | 'rotate'
    | 'kenburns'
    | 'parallax'
    | 'spotlight'
    | 'dolly'
    | 'orbit'
    | 'whipPan'
    | 'rackFocus'
    // Zoom variations
    | 'zoomBounce'
    | 'zoomPulse'
    | 'zoomElastic'
    | 'zoomPop'
    | 'zoomBreath'
    // Pan variations
    | 'panDrift'
    | 'panBounce'
    | 'panSway'
    | 'panFloat'
    | 'panCircle'
    | 'panWave'
    | 'panGlide'
    // Rotate variations
    | 'rotateSwing'
    | 'rotateSpin'
    | 'rotateWobble'
    | 'tiltShift'
    | 'rotateCarousel'
    // Combo effects
    | 'zoomPan'
    | 'spiralZoom'
    | 'tiltZoom'
    | 'bouncePan'
    | 'swayZoom'
    | 'driftRotate'
    // 10 New Dynamic Effects
    | 'pushInTilt'
    | 'revealSlide'
    | 'breathingFocus'
    | 'heartbeat'
    | 'wobbleZ'
    | 'flyIn'
    | 'quake'
    | 'floatUp'
    | 'sinkDown'
    | 'cinematicPan'
    // 10 CapCut-Style Effects (Round 2)
    | 'glideIn'
    | 'pullBack'
    | 'gentleRock'
    | 'zoomSnap'
    | 'softBounce'
    | 'tiltDrift'
    | 'horizonShift'
    | 'verticalReveal'
    | 'slowSpin'
    | 'breatheAndPan';

export type TransitionType =
    | 'crossfade'
    | 'wipe'
    | 'zoom'
    | 'blur'
    | 'glitch'
    | 'filmBurn'
    | 'whiteFlash'
    | 'rotate'
    | 'circleWipe'
    | 'pixelate'
    | 'colorShift'
    | 'slide'
    | 'morph'        // Transform-based morph
    | 'spiral'       // Spiral rotation transition
    | 'pushSlide'    // Push slide effect
    | 'diagonalWipe' // Diagonal line sweep
    | 'blinds'       // Venetian blinds
    | 'pageTurn'     // 3D page flip
    | 'gridReveal'   // Grid squares reveal
    // 10 New Rich Transitions (Round 2)
    | 'iris'
    | 'ripple'        // Radial wave distortion
    | 'inkBleed'      // Ink spread dissolve
    | 'lightLeak'     // Warm light leak sweep
    | 'prismShift'    // RGB channel split
    | 'dustCloud'     // Particle dust burst
    | 'verticalBlinds'// Vertical venetian blinds
    | 'diamondWipe'   // Diamond-shaped reveal
    | 'swooshWipe'    // Curved arc wipe
    | 'radialBlur'    // Center-out blur spread
    | 'smokeReveal'   // Gradient smoke dissolve
    | 'none';

export type EasingType =
    | 'linear'
    | 'ease-in'
    | 'ease-out'
    | 'ease-in-out'
    | 'spring'
    | 'bounce';

export interface SceneAsset {
    type: 'svg' | 'image' | 'video';
    path: string; // Path relative to public folder
    position: { x: number; y: number }; // Percentage (0-100)
    scale: number; // 1.0 = 100%
    opacity: number; // 0-1
    zIndex: number;
    rotation?: number; // degrees
    // For parallax layers
    depth?: number; // 0-10, higher = further back
}

export interface SceneAnimation {
    type: AnimationType;
    duration?: number; // seconds, defaults to scene duration
    easing: EasingType;
    delay?: number; // seconds
    // Animation-specific parameters
    params?: {
        // For kenburns
        fromScale?: number;
        toScale?: number;
        fromX?: number;
        fromY?: number;
        toX?: number;
        toY?: number;
        // For parallax
        layers?: number[];
        speed?: number;
        // For spotlight
        radius?: number;
        intensity?: number;
        // For dolly
        fov?: number; // Field of view
        // For orbit
        orbitRadius?: number;
        orbitAngle?: number;
        // For whipPan
        direction?: 'left' | 'right' | 'up' | 'down';
        blurAmount?: number;
    };
}

export interface TransitionEffect {
    type: TransitionType;
    duration: number; // seconds
    easing?: EasingType;
    // Transition-specific params
    params?: {
        // For glitch
        intensity?: number;
        // For wipe
        direction?: 'left' | 'right' | 'up' | 'down';
        angle?: number;
        // For filmBurn
        burnColor?: string;
    };
}

export interface Scene {
    id: string;
    startTime: number; // seconds
    endTime: number; // seconds
    assets: SceneAsset[];
    animations: SceneAnimation[];
    transition?: TransitionEffect;
    // Optional metadata
    title?: string;
    description?: string;
    // Cinematic enhancements
    colorGrade?: {
        brightness?: number;
        contrast?: number;
        saturation?: number;
        temperature?: string; // 'warm' | 'cool' | 'neutral'
    };
    filmGrain?: {
        enabled: boolean;
        amount?: number; // 0-1
    };
    vignette?: {
        enabled: boolean;
        intensity?: number; // 0-1
    };
}

export interface SceneConfig {
    scenes: Scene[];
    defaultTransition?: TransitionEffect;
    fps?: number;
    // Global cinematic settings
    globalFilmGrain?: boolean;
    globalVignette?: boolean;
    cinematicBars?: boolean; // 2.39:1 letterboxing
}
