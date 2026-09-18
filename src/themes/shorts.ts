import { ShortsTransitionType } from '../types/shorts';

export type ShortsThemeId = 'epic-bestseller' | 'dark-thriller' | 'neon-scifi' | 'romantic-rose' | 'corporate-clean';
export type OverlayAnimationType = 'spring-pop' | 'slide-up' | 'fade-blur' | 'float-in';
export type OverlayStyleEnum = 'classic' | 'modern-glass' | 'bold-solid' | 'neon-glow';

export interface ShortsTheme {
    id: ShortsThemeId;
    colors: {
        accent: string;
        textPrimary: string;
        textSecondary: string;
        backgroundGradient: [string, string];
        shadow: string;
    };
    typography: {
        titleFont: string;
        bodyFont: string;
        fontWeightPrimary: number;
    };
    animations: {
        overlayEntrance: OverlayAnimationType;
        transitionDefault: ShortsTransitionType;
    };
    styling: {
        overlayStyle: OverlayStyleEnum;
    };
}

export const SHORTS_THEMES: Record<ShortsThemeId, ShortsTheme> = {
    'epic-bestseller': {
        id: 'epic-bestseller',
        colors: {
            accent: '#f59e0b', // Epic Gold
            textPrimary: '#ffffff',
            textSecondary: '#fcd34d',
            backgroundGradient: ['rgba(0,0,0,0)', 'rgba(25, 15, 0, 0.95)'],
            shadow: 'rgba(245, 158, 11, 0.4)',
        },
        typography: {
            titleFont: "'Cinzel', 'Times New Roman', serif",
            bodyFont: "'Inter', sans-serif",
            fontWeightPrimary: 800,
        },
        animations: {
            overlayEntrance: 'spring-pop',
            transitionDefault: 'whiteFlash',
        },
        styling: {
            overlayStyle: 'classic',
        },
    },
    'dark-thriller': {
        id: 'dark-thriller',
        colors: {
            accent: '#e53e3e', // Blood Red
            textPrimary: '#ffffff',
            textSecondary: '#ff8a8a',
            backgroundGradient: ['rgba(0,0,0,0)', 'rgba(20, 0, 0, 1)'],
            shadow: 'rgba(229, 62, 62, 0.6)',
        },
        typography: {
            titleFont: "'Oswald', 'Impact', sans-serif",
            bodyFont: "'Roboto', sans-serif",
            fontWeightPrimary: 900,
        },
        animations: {
            overlayEntrance: 'fade-blur',
            transitionDefault: 'glitch',
        },
        styling: {
            overlayStyle: 'bold-solid',
        },
    },
    'neon-scifi': {
        id: 'neon-scifi',
        colors: {
            accent: '#64ffda', // Cyan Neon
            textPrimary: '#ffffff',
            textSecondary: '#a0aec0',
            backgroundGradient: ['rgba(0,0,0,0)', 'rgba(0, 15, 30, 0.9)'],
            shadow: 'rgba(100, 255, 218, 0.8)',
        },
        typography: {
            titleFont: "'Space Grotesk', 'Courier New', monospace",
            bodyFont: "'Inter', sans-serif",
            fontWeightPrimary: 700,
        },
        animations: {
            overlayEntrance: 'float-in',
            transitionDefault: 'crossfade',
        },
        styling: {
            overlayStyle: 'neon-glow',
        },
    },
    'romantic-rose': {
        id: 'romantic-rose',
        colors: {
            accent: '#ec4899', // Pink Rose
            textPrimary: '#ffffff',
            textSecondary: '#fbcfe8',
            backgroundGradient: ['rgba(0,0,0,0)', 'rgba(30, 10, 20, 0.9)'],
            shadow: 'rgba(236, 72, 153, 0.4)',
        },
        typography: {
            titleFont: "'Playfair Display', serif",
            bodyFont: "'Lora', serif",
            fontWeightPrimary: 700,
        },
        animations: {
            overlayEntrance: 'slide-up',
            transitionDefault: 'zoom',
        },
        styling: {
            overlayStyle: 'modern-glass',
        },
    },
    'corporate-clean': {
        id: 'corporate-clean',
        colors: {
            accent: '#3182ce', // Tech Blue
            textPrimary: '#ffffff',
            textSecondary: '#cbd5e0',
            backgroundGradient: ['rgba(0,0,0,0)', 'rgba(10, 20, 35, 0.95)'],
            shadow: 'rgba(49, 130, 206, 0.3)',
        },
        typography: {
            titleFont: "'Montserrat', sans-serif",
            bodyFont: "'Open Sans', sans-serif",
            fontWeightPrimary: 800,
        },
        animations: {
            overlayEntrance: 'spring-pop',
            transitionDefault: 'slide',
        },
        styling: {
            overlayStyle: 'modern-glass',
        },
    },
};

export const getShortsTheme = (id?: ShortsThemeId): ShortsTheme => {
    return SHORTS_THEMES[id || 'epic-bestseller'];
};
