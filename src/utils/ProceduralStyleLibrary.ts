import { BackgroundVariant } from '../components/ParticleBackground';
import { TransitionType } from '../types/scene';

export type CaptionStylePreset =
    | 'karaoke'
    | 'neonGlow'
    | 'boxed'
    | 'gradient'
    | 'outline'
    | 'vintage'
    | 'modern'
    | 'bold'
    | 'minimal'
    | 'dramatic'
    | 'elegant'
    | 'tiktok';

export interface VisualDNA {
    name: string;
    captionStyle: CaptionStylePreset;
    transitionType: TransitionType;
    particleVariant: BackgroundVariant;
    overlayDensity: number; // 0.0 to 1.0
    jitterIntensity: number; // subtle animation amplitude, 0.0 to 0.05
    sceneCount: number; // target number of scenes per video (35-50)
    colors: {
        accent: string;
        glow: string;
        text: string;
    };
    audioVisual?: {
        waveformHeight?: number;
        waveformStrokeWidth?: number;
        visualizerStyle?: 'bars' | 'rounded' | 'mirror';
        visualizerBarCount?: number;
        visualizerHeight?: number;
        waveOpacity?: number;
        barOpacity?: number;
    };
}

export const VISUAL_DNA_LIBRARY: VisualDNA[] = [
    {
        name: 'Cyberpunk Neon',
        captionStyle: 'neonGlow',
        transitionType: 'glitch',
        particleVariant: 'gridDots',
        overlayDensity: 0.9,
        jitterIntensity: 0.025,
        sceneCount: 48,
        colors: { accent: '#00ffff', glow: '#ff00ff', text: '#ffffff' },
        audioVisual: {
            waveformHeight: 100,
            waveformStrokeWidth: 4,
            visualizerStyle: 'bars',
            visualizerBarCount: 128,
            visualizerHeight: 80,
            waveOpacity: 0.9,
            barOpacity: 0.8
        }
    },
    {
        name: 'Classic Vintage',
        captionStyle: 'vintage',
        transitionType: 'filmBurn',
        particleVariant: 'dust',
        overlayDensity: 0.7,
        jitterIntensity: 0.01,
        sceneCount: 40,
        colors: { accent: '#d4a574', glow: '#8b5a2b', text: '#ffecd2' },
        audioVisual: {
            waveformHeight: 70,
            waveformStrokeWidth: 2,
            visualizerStyle: 'mirror',
            visualizerBarCount: 64,
            visualizerHeight: 50,
            waveOpacity: 0.6,
            barOpacity: 0.5
        }
    },
    {
        name: 'Modern Minimal',
        captionStyle: 'modern',
        transitionType: 'blur',
        particleVariant: 'bokeh',
        overlayDensity: 0.6,
        jitterIntensity: 0.012,
        sceneCount: 38,
        colors: { accent: '#7c3aed', glow: '#4c1d95', text: '#ffffff' },
        audioVisual: {
            waveformHeight: 60,
            waveformStrokeWidth: 2,
            visualizerStyle: 'rounded',
            visualizerBarCount: 64,
            visualizerHeight: 40,
            waveOpacity: 0.7,
            barOpacity: 0.6
        }
    },
    {
        name: 'High Impact',
        captionStyle: 'tiktok',
        transitionType: 'whiteFlash',
        particleVariant: 'speedLines',
        overlayDensity: 0.95,
        jitterIntensity: 0.03,
        sceneCount: 50,
        colors: { accent: '#FFE600', glow: '#ff6b6b', text: '#ffffff' },
        audioVisual: {
            waveformHeight: 120,
            waveformStrokeWidth: 5,
            visualizerStyle: 'bars',
            visualizerBarCount: 128,
            visualizerHeight: 100,
            waveOpacity: 1.0,
            barOpacity: 0.9
        }
    },
    {
        name: 'Deep Forest',
        captionStyle: 'elegant',
        transitionType: 'iris',
        particleVariant: 'leaves',
        overlayDensity: 0.75,
        jitterIntensity: 0.015,
        sceneCount: 42,
        colors: { accent: '#2f855a', glow: '#22543d', text: '#f0fff4' },
        audioVisual: {
            waveformHeight: 80,
            waveformStrokeWidth: 3,
            visualizerStyle: 'mirror',
            visualizerBarCount: 64,
            visualizerHeight: 60,
            waveOpacity: 0.8,
            barOpacity: 0.7
        }
    },
    {
        name: 'Oceanic Bloom',
        captionStyle: 'modern',
        transitionType: 'ripple',
        particleVariant: 'bubbles',
        overlayDensity: 0.8,
        jitterIntensity: 0.018,
        sceneCount: 44,
        colors: { accent: '#3182ce', glow: '#2b6cb0', text: '#ebf8ff' },
        audioVisual: {
            waveformHeight: 90,
            waveformStrokeWidth: 3,
            visualizerStyle: 'rounded',
            visualizerBarCount: 64,
            visualizerHeight: 70,
            waveOpacity: 0.85,
            barOpacity: 0.75
        }
    },
    {
        name: 'Dark Gothic',
        captionStyle: 'dramatic',
        transitionType: 'inkBleed',
        particleVariant: 'dust',
        overlayDensity: 0.85,
        jitterIntensity: 0.022,
        sceneCount: 46,
        colors: { accent: '#e53e3e', glow: '#9b2c2c', text: '#fff5f5' },
        audioVisual: {
            waveformHeight: 110,
            waveformStrokeWidth: 4,
            visualizerStyle: 'bars',
            visualizerBarCount: 64,
            visualizerHeight: 90,
            waveOpacity: 0.9,
            barOpacity: 0.85
        }
    },
    {
        name: 'Ethereal Soul',
        captionStyle: 'minimal',
        transitionType: 'radialBlur',
        particleVariant: 'aurora',
        overlayDensity: 0.65,
        jitterIntensity: 0.01,
        sceneCount: 38,
        colors: { accent: '#9f7aea', glow: '#6b46c1', text: '#f5f3ff' },
        audioVisual: {
            waveformHeight: 75,
            waveformStrokeWidth: 2,
            visualizerStyle: 'mirror',
            visualizerBarCount: 64,
            visualizerHeight: 55,
            waveOpacity: 0.7,
            barOpacity: 0.65
        }
    },
    {
        name: 'Golden Era',
        captionStyle: 'elegant',
        transitionType: 'pageTurn',
        particleVariant: 'glitter',
        overlayDensity: 0.7,
        jitterIntensity: 0.012,
        sceneCount: 40,
        colors: { accent: '#ecc94b', glow: '#b7791f', text: '#fefcbf' },
        audioVisual: {
            waveformHeight: 85,
            waveformStrokeWidth: 3,
            visualizerStyle: 'mirror',
            visualizerBarCount: 64,
            visualizerHeight: 65,
            waveOpacity: 0.8,
            barOpacity: 0.75
        }
    },
    {
        name: 'Cosmic Journey',
        captionStyle: 'neonGlow',
        transitionType: 'spiral',
        particleVariant: 'stars',
        overlayDensity: 0.9,
        jitterIntensity: 0.025,
        sceneCount: 48,
        colors: { accent: '#64ffda', glow: '#4fd1c5', text: '#e6fffa' },
        audioVisual: {
            waveformHeight: 100,
            waveformStrokeWidth: 4,
            visualizerStyle: 'rounded',
            visualizerBarCount: 128,
            visualizerHeight: 85,
            waveOpacity: 0.9,
            barOpacity: 0.85
        }
    },
    {
        name: 'Abstract Flow',
        captionStyle: 'gradient',
        transitionType: 'morph',
        particleVariant: 'floatingShapes',
        overlayDensity: 0.8,
        jitterIntensity: 0.018,
        sceneCount: 44,
        colors: { accent: '#ed64a6', glow: '#b83280', text: '#fff5f7' },
        audioVisual: {
            waveformHeight: 95,
            waveformStrokeWidth: 3,
            visualizerStyle: 'mirror',
            visualizerBarCount: 64,
            visualizerHeight: 75,
            waveOpacity: 0.85,
            barOpacity: 0.75
        }
    },
    {
        name: 'Kinetic Energy',
        captionStyle: 'bold',
        transitionType: 'pushSlide',
        particleVariant: 'motionLines',
        overlayDensity: 0.9,
        jitterIntensity: 0.025,
        sceneCount: 48,
        colors: { accent: '#38b2ac', glow: '#2c7a7b', text: '#e6fffa' },
        audioVisual: {
            waveformHeight: 105,
            waveformStrokeWidth: 4,
            visualizerStyle: 'bars',
            visualizerBarCount: 128,
            visualizerHeight: 95,
            waveOpacity: 1.0,
            barOpacity: 0.9
        }
    },
    {
        name: 'Geometric Puzzle',
        captionStyle: 'boxed',
        transitionType: 'gridReveal',
        particleVariant: 'geometric',
        overlayDensity: 0.85,
        jitterIntensity: 0.02,
        sceneCount: 45,
        colors: { accent: '#f6ad55', glow: '#dd6b20', text: '#fffaf0' },
        audioVisual: {
            waveformHeight: 90,
            waveformStrokeWidth: 3,
            visualizerStyle: 'bars',
            visualizerBarCount: 64,
            visualizerHeight: 80,
            waveOpacity: 0.85,
            barOpacity: 0.8
        }
    },
    {
        name: 'Soft Glow',
        captionStyle: 'modern',
        transitionType: 'lightLeak',
        particleVariant: 'bokeh',
        overlayDensity: 0.7,
        jitterIntensity: 0.012,
        sceneCount: 40,
        colors: { accent: '#f687b3', glow: '#d53f8c', text: '#fff5f7' },
        audioVisual: {
            waveformHeight: 75,
            waveformStrokeWidth: 2.5,
            visualizerStyle: 'rounded',
            visualizerBarCount: 64,
            visualizerHeight: 50,
            waveOpacity: 0.75,
            barOpacity: 0.7
        }
    },
    {
        name: 'Mystic Mist',
        captionStyle: 'minimal',
        transitionType: 'smokeReveal',
        particleVariant: 'dust',
        overlayDensity: 0.6,
        jitterIntensity: 0.008,
        sceneCount: 36,
        colors: { accent: '#cbd5e0', glow: '#4a5568', text: '#edf2f7' },
        audioVisual: {
            waveformHeight: 65,
            waveformStrokeWidth: 2,
            visualizerStyle: 'mirror',
            visualizerBarCount: 64,
            visualizerHeight: 45,
            waveOpacity: 0.65,
            barOpacity: 0.6
        }
    },
    {
        name: 'Diamond Edge',
        captionStyle: 'outline',
        transitionType: 'diamondWipe',
        particleVariant: 'shootingStars',
        overlayDensity: 0.9,
        jitterIntensity: 0.025,
        sceneCount: 48,
        colors: { accent: '#4fd1c5', glow: '#319795', text: '#e6fffa' },
        audioVisual: {
            waveformHeight: 115,
            waveformStrokeWidth: 4.5,
            visualizerStyle: 'rounded',
            visualizerBarCount: 128,
            visualizerHeight: 100,
            waveOpacity: 0.95,
            barOpacity: 0.9
        }
    },
    {
        name: 'Sunrise Glow',
        captionStyle: 'elegant',
        transitionType: 'prismShift',
        particleVariant: 'lightRays',
        overlayDensity: 0.75,
        jitterIntensity: 0.015,
        sceneCount: 42,
        colors: { accent: '#ed8936', glow: '#c05621', text: '#fffaf0' },
        audioVisual: {
            waveformHeight: 80,
            waveformStrokeWidth: 3,
            visualizerStyle: 'mirror',
            visualizerBarCount: 64,
            visualizerHeight: 60,
            waveOpacity: 0.8,
            barOpacity: 0.75
        }
    },
    {
        name: 'Speed Force',
        captionStyle: 'tiktok',
        transitionType: 'swooshWipe',
        particleVariant: 'speedLines',
        overlayDensity: 0.95,
        jitterIntensity: 0.035,
        sceneCount: 50,
        colors: { accent: '#f56565', glow: '#c53030', text: '#fff5f5' },
        audioVisual: {
            waveformHeight: 125,
            waveformStrokeWidth: 5,
            visualizerStyle: 'bars',
            visualizerBarCount: 128,
            visualizerHeight: 110,
            waveOpacity: 1.0,
            barOpacity: 0.95
        }
    },
    {
        name: 'Quantum Tech',
        captionStyle: 'neonGlow',
        transitionType: 'glitch',
        particleVariant: 'gridDots',
        overlayDensity: 0.95,
        jitterIntensity: 0.03,
        sceneCount: 50,
        colors: { accent: '#00d4ff', glow: '#0050b3', text: '#e6f7ff' },
        audioVisual: {
            waveformHeight: 110,
            waveformStrokeWidth: 4,
            visualizerStyle: 'bars',
            visualizerBarCount: 128,
            visualizerHeight: 90,
            waveOpacity: 0.95,
            barOpacity: 0.85
        }
    },
    {
        name: 'Astro Narrative',
        captionStyle: 'modern',
        transitionType: 'spiral',
        particleVariant: 'stars',
        overlayDensity: 0.85,
        jitterIntensity: 0.02,
        sceneCount: 45,
        colors: { accent: '#64ffda', glow: '#2d3748', text: '#ffffff' },
        audioVisual: {
            waveformHeight: 90,
            waveformStrokeWidth: 3,
            visualizerStyle: 'mirror',
            visualizerBarCount: 64,
            visualizerHeight: 70,
            waveOpacity: 0.8,
            barOpacity: 0.7
        }
    },
    {
        name: 'Bio Labs',
        captionStyle: 'gradient',
        transitionType: 'ripple',
        particleVariant: 'bubbles',
        overlayDensity: 0.8,
        jitterIntensity: 0.015,
        sceneCount: 42,
        colors: { accent: '#52c41a', glow: '#237804', text: '#f6ffed' },
        audioVisual: {
            waveformHeight: 85,
            waveformStrokeWidth: 3,
            visualizerStyle: 'rounded',
            visualizerBarCount: 64,
            visualizerHeight: 65,
            waveOpacity: 0.85,
            barOpacity: 0.75
        }
    }
];
