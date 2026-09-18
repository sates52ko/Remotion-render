// Theme definitions for book genres
// Each theme provides colors, fonts, and animation styles

export interface Theme {
  name: string;
  background: {
    gradient: [string, string];
    particleColor: string;
  };
  text: {
    primary: string;
    secondary: string;
    accent: string;
  };
  caption: {
    backgroundColor: string;
    textColor: string;
    highlightColor: string;
  };
  effects: {
    glowColor: string;
    shadowIntensity: number;
  };
}

export const themes: Record<string, Theme> = {
  mystery: {
    name: 'Mystery & Thriller',
    background: {
      gradient: ['#1a1a2e', '#16213e'],
      particleColor: '#4a5568',
    },
    text: {
      primary: '#e2e8f0',
      secondary: '#a0aec0',
      accent: '#9f7aea',
    },
    caption: {
      backgroundColor: 'rgba(26, 26, 46, 0.85)',
      textColor: '#f7fafc',
      highlightColor: '#9f7aea',
    },
    effects: {
      glowColor: '#805ad5',
      shadowIntensity: 0.8,
    },
  },
  
  horror: {
    name: 'Horror & Gothic',
    background: {
      gradient: ['#0d0d0d', '#1a0a0a'],
      particleColor: '#8b0000',
    },
    text: {
      primary: '#e2e8f0',
      secondary: '#a0aec0',
      accent: '#e53e3e',
    },
    caption: {
      backgroundColor: 'rgba(13, 13, 13, 0.9)',
      textColor: '#f7fafc',
      highlightColor: '#fc8181',
    },
    effects: {
      glowColor: '#c53030',
      shadowIntensity: 1.0,
    },
  },
  
  romance: {
    name: 'Romance & Drama',
    background: {
      gradient: ['#2d1f3d', '#4a2c5a'],
      particleColor: '#ed64a6',
    },
    text: {
      primary: '#fdf2f8',
      secondary: '#f9a8d4',
      accent: '#ec4899',
    },
    caption: {
      backgroundColor: 'rgba(45, 31, 61, 0.85)',
      textColor: '#fdf2f8',
      highlightColor: '#f472b6',
    },
    effects: {
      glowColor: '#d53f8c',
      shadowIntensity: 0.6,
    },
  },
  
  scifi: {
    name: 'Sci-Fi & Fantasy',
    background: {
      gradient: ['#0a192f', '#112240'],
      particleColor: '#64ffda',
    },
    text: {
      primary: '#ccd6f6',
      secondary: '#8892b0',
      accent: '#64ffda',
    },
    caption: {
      backgroundColor: 'rgba(10, 25, 47, 0.85)',
      textColor: '#ccd6f6',
      highlightColor: '#64ffda',
    },
    effects: {
      glowColor: '#4fd1c5',
      shadowIntensity: 0.7,
    },
  },
  
  selfhelp: {
    name: 'Self-Help & Business',
    background: {
      gradient: ['#1a365d', '#2c5282'],
      particleColor: '#f6e05e',
    },
    text: {
      primary: '#f7fafc',
      secondary: '#e2e8f0',
      accent: '#ecc94b',
    },
    caption: {
      backgroundColor: 'rgba(26, 54, 93, 0.85)',
      textColor: '#f7fafc',
      highlightColor: '#f6e05e',
    },
    effects: {
      glowColor: '#d69e2e',
      shadowIntensity: 0.5,
    },
  },
  
  history: {
    name: 'History & Biography',
    background: {
      gradient: ['#2d2522', '#3d322d'],
      particleColor: '#d4a574',
    },
    text: {
      primary: '#f5f0e8',
      secondary: '#d4c5b5',
      accent: '#c9a66b',
    },
    caption: {
      backgroundColor: 'rgba(45, 37, 34, 0.85)',
      textColor: '#f5f0e8',
      highlightColor: '#d4a574',
    },
    effects: {
      glowColor: '#b7935a',
      shadowIntensity: 0.6,
    },
  },
  
  science: {
    name: 'Science & Narrative Labs',
    background: {
      gradient: ['#04101a', '#0a2538'],
      particleColor: '#00d4ff',
    },
    text: {
      primary: '#e6f7ff',
      secondary: '#91d5ff',
      accent: '#1890ff',
    },
    caption: {
      backgroundColor: 'rgba(4, 16, 26, 0.85)',
      textColor: '#e6f7ff',
      highlightColor: '#40a9ff',
    },
    effects: {
      glowColor: '#0050b3',
      shadowIntensity: 0.7,
    },
  },
};

export const getTheme = (genre: string): Theme => {
  const normalizedGenre = genre.toLowerCase().replace(/[^a-z]/g, '');
  
  // Map common genre names to theme keys
  const genreMap: Record<string, string> = {
    mystery: 'mystery',
    thriller: 'mystery',
    crime: 'mystery',
    horror: 'horror',
    gothic: 'horror',
    dark: 'horror',
    romance: 'romance',
    drama: 'romance',
    love: 'romance',
    scifi: 'scifi',
    fantasy: 'scifi',
    sciencefiction: 'scifi',
    selfhelp: 'selfhelp',
    business: 'selfhelp',
    motivational: 'selfhelp',
    psychology: 'selfhelp',
    history: 'history',
    biography: 'history',
    historical: 'history',
    science: 'science',
    tech: 'science',
    technology: 'science',
    narrative: 'science',
  };
  
  const themeKey = genreMap[normalizedGenre] || 'mystery';
  return themes[themeKey];
};
