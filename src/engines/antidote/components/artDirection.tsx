import React from "react";

/**
 * Antidote 2.0 — Per-Book Art Direction Context & Rich Stage Moods.
 *
 * Breaks the monochrome grey template look that triggered YPP "generic/repetitive content"
 * while keeping every legacy Antidote config (where `artDirection` is absent) 100% unchanged.
 */

export type StageMoodName =
  | "obsidianGrid"
  | "deepViolet"
  | "warmParchment"
  | "crimsonNight"
  | "slateEditorial"
  | "blueprintNavy"
  | "inkScroll"
  | "emeraldNoir"
  | "ivoryBroadsheet"
  | "sageBotanical"
  | "terracottaStudio"
  | "swissBauhaus"
  | "monoclePrint"
  | "archivalBroadsheet"
  | "sunlitRiso"
  | "cyberXRay"
  | "bauhausNocturne"
  | "flutedGallery"
  | "chalkboardLecture"
  | "cobaltBlueprint"
  | "forestBotanical"
  | "terracottaEarth"
  | "ochreKraft"
  | "slateDenim"
  | "plumVelvet";

export type StageTextureMode =
  | "grid"
  | "dots"
  | "lines"
  | "clean"
  | "swissBand"
  | "linenFiber"
  | "halftoneCorner"
  | "risoSpeckle"
  | "xRayScanline"
  | "bauhausBlocks"
  | "flutedRib"
  | "blueprintCrosshair";

export type ArtPalette = {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceBorder: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  danger: string;
  positive: string;
};

export type ArtDirectionConfig = {
  style?: string;
  stylePack?: string;
  castMode?: "illustrated" | "vectorRig";
  polarity?: "dark" | "light" | "chromaticMid";
  typography?: "poppins" | "serif" | "condensed" | "slab";
  annotationStyle?: "circle" | "bracket" | "underline" | "spotlightMask" | "pin";
  nodeShape?: "circle" | "arch" | "hex" | "tornPaper" | "filmStrip";
  layoutGrammar?: "centered" | "editorialLeft" | "editorialRight" | "cinemaWide" | "splitSpine" | "swissPoster" | "magazineMasthead" | "filmFrame" | "diagonalSplit";
  transitionFamily?: "paper" | "editorial" | "blueprint" | "print" | "cinema" | "kinetic";
  captionAlign?: "center" | "left";
  captionStyle?: "editorialBar" | "kineticPill" | "cinemaLower" | "printRule";
  surfaceFinish?: "studioClean" | "paperGrain" | "blueprintTech" | "editorialHalftone" | "cinemaGlow";
  mood?: StageMoodName;
  palette?: Partial<ArtPalette>;
  fontDisplay?: string;
  fontBody?: string;
  captions?: "off" | "minimal" | "box";
  hud?: "off" | "minimal" | "default";
  motionDoctrine?: boolean;
};

export const STAGE_MOODS: Record<
  StageMoodName,
  {
    background: string;
    gridColor: string;
    gridSize: number;
    gridOpacity: number;
    texture?: StageTextureMode;
    vignette: string;
    palette: ArtPalette;
  }
> = {
  obsidianGrid: {
    background: "radial-gradient(ellipse at 50% 38%, #1C2029 0%, #101319 65%, #090B0F 100%)",
    gridColor: "rgba(255, 255, 255, 0.08)",
    gridSize: 72,
    gridOpacity: 0.55,
    vignette: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.52) 100%)",
    palette: {
      bg: "#101319",
      bgAlt: "#1B202A",
      surface: "rgba(24, 29, 39, 0.92)",
      surfaceBorder: "rgba(255, 255, 255, 0.14)",
      ink: "#F7F4EC",
      muted: "#A6B0C2",
      accent: "#F7C948",
      accent2: "#56CFE1",
      danger: "#F05D5E",
      positive: "#4ADE80",
    },
  },
  deepViolet: {
    background: "linear-gradient(160deg, #2D1852 0%, #19102E 58%, #0E091B 100%)",
    gridColor: "rgba(232, 213, 255, 0.07)",
    gridSize: 84,
    gridOpacity: 0.4,
    vignette: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(8,4,18,0.56) 100%)",
    palette: {
      bg: "#19102E",
      bgAlt: "#2B194D",
      surface: "rgba(35, 22, 66, 0.9)",
      surfaceBorder: "rgba(216, 180, 254, 0.22)",
      ink: "#FAF6FF",
      muted: "#C4B5FD",
      accent: "#FACC15",
      accent2: "#C084FC",
      danger: "#FB7185",
      positive: "#34D399",
    },
  },
  warmParchment: {
    background: "radial-gradient(ellipse at 50% 40%, #F5EFE2 0%, #E7DEC9 72%, #D8CCB2 100%)",
    gridColor: "rgba(44, 34, 24, 0.07)",
    gridSize: 80,
    gridOpacity: 0.35,
    vignette: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 56%, rgba(42,30,16,0.22) 100%)",
    palette: {
      bg: "#EFE7D6",
      bgAlt: "#E3D8C1",
      surface: "rgba(252, 249, 242, 0.94)",
      surfaceBorder: "rgba(43, 33, 24, 0.18)",
      ink: "#1E1914",
      muted: "#5C5145",
      accent: "#C2410C",
      accent2: "#1D4ED8",
      danger: "#B91C1C",
      positive: "#15803D",
    },
  },
  crimsonNight: {
    background: "radial-gradient(ellipse at 50% 35%, #2E1418 0%, #170B0E 65%, #0B0507 100%)",
    gridColor: "rgba(255, 200, 190, 0.06)",
    gridSize: 76,
    gridOpacity: 0.45,
    vignette: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.6) 100%)",
    palette: {
      bg: "#170B0E",
      bgAlt: "#2B1318",
      surface: "rgba(38, 17, 22, 0.92)",
      surfaceBorder: "rgba(251, 146, 130, 0.22)",
      ink: "#FDF2F0",
      muted: "#D6A8A2",
      accent: "#F59E0B",
      accent2: "#FB7185",
      danger: "#EF4444",
      positive: "#4ADE80",
    },
  },
  slateEditorial: {
    background: "linear-gradient(155deg, #1A2433 0%, #121A26 60%, #0B1018 100%)",
    gridColor: "rgba(186, 214, 247, 0.07)",
    gridSize: 72,
    gridOpacity: 0.5,
    vignette: "radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 50%, rgba(5,10,18,0.52) 100%)",
    palette: {
      bg: "#121A26",
      bgAlt: "#1D2A3D",
      surface: "rgba(24, 35, 50, 0.92)",
      surfaceBorder: "rgba(148, 183, 224, 0.2)",
      ink: "#F4F7FB",
      muted: "#9FB2C9",
      accent: "#E8A838",
      accent2: "#38BDF8",
      danger: "#F87171",
      positive: "#34D399",
    },
  },
  blueprintNavy: {
    background: "radial-gradient(ellipse at 50% 40%, #132642 0%, #0B1626 68%, #060D18 100%)",
    gridColor: "rgba(56, 189, 248, 0.10)",
    gridSize: 64,
    gridOpacity: 0.65,
    vignette: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 48%, rgba(4,9,18,0.58) 100%)",
    palette: {
      bg: "#0B1626",
      bgAlt: "#132642",
      surface: "rgba(15, 31, 56, 0.92)",
      surfaceBorder: "rgba(56, 189, 248, 0.24)",
      ink: "#F4F7FB",
      muted: "#94B4D4",
      accent: "#F06449",
      accent2: "#38BDF8",
      danger: "#FB7185",
      positive: "#34D399",
    },
  },
  inkScroll: {
    background: "radial-gradient(ellipse at 50% 40%, #F3ECE0 0%, #E4D8C3 72%, #D4C5AA 100%)",
    gridColor: "rgba(28, 25, 23, 0.06)",
    gridSize: 84,
    gridOpacity: 0.4,
    vignette: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 56%, rgba(36,24,14,0.20) 100%)",
    palette: {
      bg: "#F3ECE0",
      bgAlt: "#E4D8C3",
      surface: "rgba(252, 248, 240, 0.95)",
      surfaceBorder: "rgba(28, 25, 23, 0.20)",
      ink: "#1C1917",
      muted: "#57534E",
      accent: "#B9382C",
      accent2: "#1E3A5F",
      danger: "#B91C1C",
      positive: "#166534",
    },
  },
  emeraldNoir: {
    background: "radial-gradient(ellipse at 50% 38%, #132B22 0%, #0B1914 68%, #050D0A 100%)",
    gridColor: "rgba(212, 168, 83, 0.08)",
    gridSize: 72,
    gridOpacity: 0.5,
    texture: "grid",
    vignette: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 48%, rgba(4,10,7,0.58) 100%)",
    palette: {
      bg: "#0B1914",
      bgAlt: "#132B22",
      surface: "rgba(16, 36, 29, 0.92)",
      surfaceBorder: "rgba(212, 168, 83, 0.24)",
      ink: "#F5F3EC",
      muted: "#9AB8AD",
      accent: "#D4A853",
      accent2: "#34D399",
      danger: "#F87171",
      positive: "#4ADE80",
    },
  },
  ivoryBroadsheet: {
    background: "radial-gradient(ellipse at 50% 42%, #FFFDF8 0%, #FAF7F0 65%, #F0E9DC 100%)",
    gridColor: "rgba(24, 24, 27, 0.05)",
    gridSize: 80,
    gridOpacity: 0,
    texture: "clean",
    vignette: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 62%, rgba(40,32,20,0.08) 100%)",
    palette: {
      bg: "#FAF7F0",
      bgAlt: "#F0E9DC",
      surface: "rgba(255, 253, 248, 0.96)",
      surfaceBorder: "rgba(24, 24, 27, 0.16)",
      ink: "#18181B",
      muted: "#52525B",
      accent: "#C2410C",
      accent2: "#166534",
      danger: "#B91C1C",
      positive: "#166534",
    },
  },
  sageBotanical: {
    background: "radial-gradient(ellipse at 50% 40%, #F4F8F3 0%, #EDF2EB 68%, #DFE7DC 100%)",
    gridColor: "rgba(20, 35, 27, 0.09)",
    gridSize: 28,
    gridOpacity: 0.45,
    texture: "dots",
    vignette: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 60%, rgba(16,32,22,0.10) 100%)",
    palette: {
      bg: "#EDF2EB",
      bgAlt: "#DFE7DC",
      surface: "rgba(248, 251, 247, 0.95)",
      surfaceBorder: "rgba(20, 35, 27, 0.18)",
      ink: "#14231B",
      muted: "#4B5E52",
      accent: "#166534",
      accent2: "#B45309",
      danger: "#B91C1C",
      positive: "#15803D",
    },
  },
  terracottaStudio: {
    background: "radial-gradient(ellipse at 50% 42%, #FAF1E8 0%, #F5E9DC 68%, #EAD8C5 100%)",
    gridColor: "rgba(35, 25, 21, 0.07)",
    gridSize: 44,
    gridOpacity: 0.45,
    texture: "lines",
    vignette: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 60%, rgba(45,28,18,0.12) 100%)",
    palette: {
      bg: "#F5E9DC",
      bgAlt: "#EAD8C5",
      surface: "rgba(253, 247, 241, 0.95)",
      surfaceBorder: "rgba(35, 25, 21, 0.18)",
      ink: "#231915",
      muted: "#6B5449",
      accent: "#9A3412",
      accent2: "#0F766E",
      danger: "#B91C1C",
      positive: "#0F766E",
    },
  },
  swissBauhaus: {
    background: "linear-gradient(180deg, #F6F3EA 0%, #EFE9D8 100%)",
    gridColor: "rgba(17, 17, 17, 0.08)",
    gridSize: 96,
    gridOpacity: 0.45,
    texture: "swissBand",
    vignette: "none",
    palette: {
      bg: "#F6F3EA",
      bgAlt: "#E8E1CF",
      surface: "rgba(255, 253, 248, 0.96)",
      surfaceBorder: "rgba(17, 17, 17, 0.22)",
      ink: "#111111",
      muted: "#4A4843",
      accent: "#D62828",
      accent2: "#1D4ED8",
      danger: "#B91C1C",
      positive: "#15803D",
    },
  },
  monoclePrint: {
    background: "linear-gradient(90deg, #FBF9F4 0%, #F4F1E8 100%)",
    gridColor: "rgba(26, 26, 24, 0.06)",
    gridSize: 64,
    gridOpacity: 0.4,
    texture: "linenFiber",
    vignette: "none",
    palette: {
      bg: "#FBF9F4",
      bgAlt: "#EFECE3",
      surface: "rgba(255, 255, 252, 0.96)",
      surfaceBorder: "rgba(26, 26, 24, 0.16)",
      ink: "#1A1A18",
      muted: "#57534E",
      accent: "#0F5257",
      accent2: "#B45309",
      danger: "#B91C1C",
      positive: "#0F766E",
    },
  },
  archivalBroadsheet: {
    background: "linear-gradient(180deg, #EAEAE3 0%, #DFDFD5 100%)",
    gridColor: "rgba(20, 20, 20, 0.08)",
    gridSize: 48,
    gridOpacity: 0.42,
    texture: "halftoneCorner",
    vignette: "none",
    palette: {
      bg: "#EAEAE3",
      bgAlt: "#D9D9CE",
      surface: "rgba(248, 248, 243, 0.95)",
      surfaceBorder: "rgba(20, 20, 20, 0.20)",
      ink: "#141414",
      muted: "#4B4B47",
      accent: "#9B2226",
      accent2: "#264653",
      danger: "#9B2226",
      positive: "#166534",
    },
  },
  sunlitRiso: {
    background: "linear-gradient(135deg, #FDF4E3 0%, #F8E9CE 100%)",
    gridColor: "rgba(27, 36, 50, 0.08)",
    gridSize: 36,
    gridOpacity: 0.45,
    texture: "risoSpeckle",
    vignette: "none",
    palette: {
      bg: "#FDF4E3",
      bgAlt: "#F4E2C2",
      surface: "rgba(255, 251, 242, 0.95)",
      surfaceBorder: "rgba(27, 36, 50, 0.18)",
      ink: "#1B2432",
      muted: "#4E5968",
      accent: "#C93B2B",
      accent2: "#1E40AF",
      danger: "#B91C1C",
      positive: "#15803D",
    },
  },
  cyberXRay: {
    background: "linear-gradient(180deg, #07131A 0%, #0B1E29 100%)",
    gridColor: "rgba(34, 211, 238, 0.10)",
    gridSize: 48,
    gridOpacity: 0.55,
    texture: "xRayScanline",
    vignette: "none",
    palette: {
      bg: "#07131A",
      bgAlt: "#0F2532",
      surface: "rgba(12, 31, 42, 0.92)",
      surfaceBorder: "rgba(34, 211, 238, 0.25)",
      ink: "#ECFEFF",
      muted: "#7DD3FC",
      accent: "#22D3EE",
      accent2: "#F59E0B",
      danger: "#FB7185",
      positive: "#34D399",
    },
  },
  bauhausNocturne: {
    background: "linear-gradient(90deg, #121214 0%, #19181A 100%)",
    gridColor: "rgba(244, 162, 97, 0.08)",
    gridSize: 88,
    gridOpacity: 0.45,
    texture: "bauhausBlocks",
    vignette: "none",
    palette: {
      bg: "#121214",
      bgAlt: "#201E1D",
      surface: "rgba(28, 27, 29, 0.94)",
      surfaceBorder: "rgba(244, 162, 97, 0.24)",
      ink: "#FAF8F5",
      muted: "#C4BEB5",
      accent: "#F4A261",
      accent2: "#E63946",
      danger: "#F87171",
      positive: "#4ADE80",
    },
  },
  flutedGallery: {
    background: "linear-gradient(180deg, #171210 0%, #201815 100%)",
    gridColor: "rgba(226, 176, 94, 0.08)",
    gridSize: 32,
    gridOpacity: 0.5,
    texture: "flutedRib",
    vignette: "none",
    palette: {
      bg: "#171210",
      bgAlt: "#261D19",
      surface: "rgba(34, 26, 22, 0.93)",
      surfaceBorder: "rgba(226, 176, 94, 0.22)",
      ink: "#F7F2EC",
      muted: "#C9B9A6",
      accent: "#E2B05E",
      accent2: "#60A5FA",
      danger: "#FB7185",
      positive: "#34D399",
    },
  },
  chalkboardLecture: {
    background: "linear-gradient(165deg, #10211A 0%, #152B22 100%)",
    gridColor: "rgba(246, 196, 83, 0.08)",
    gridSize: 72,
    gridOpacity: 0.45,
    texture: "blueprintCrosshair",
    vignette: "none",
    palette: {
      bg: "#10211A",
      bgAlt: "#193127",
      surface: "rgba(20, 41, 32, 0.92)",
      surfaceBorder: "rgba(246, 196, 83, 0.22)",
      ink: "#F4F7F2",
      muted: "#A7C4B5",
      accent: "#F6C453",
      accent2: "#7DD3FC",
      danger: "#F87171",
      positive: "#4ADE80",
    },
  },
  cobaltBlueprint: {
    background: "linear-gradient(155deg, #1A4D8A 0%, #17447A 60%, #123763 100%)",
    gridColor: "rgba(247, 201, 72, 0.12)",
    gridSize: 72,
    gridOpacity: 0.5,
    texture: "blueprintCrosshair",
    vignette: "none",
    palette: {
      bg: "#17447A",
      bgAlt: "#123763",
      surface: "rgba(16, 46, 84, 0.92)",
      surfaceBorder: "rgba(247, 201, 72, 0.28)",
      ink: "#F8FAFC",
      muted: "#CBD5E1",
      accent: "#F7C948",
      accent2: "#7DD3FC",
      danger: "#FB7185",
      positive: "#4ADE80",
    },
  },
  forestBotanical: {
    background: "linear-gradient(155deg, #225A46 0%, #1D4D3C 60%, #163C2E 100%)",
    gridColor: "rgba(242, 184, 75, 0.10)",
    gridSize: 64,
    gridOpacity: 0.45,
    texture: "linenFiber",
    vignette: "none",
    palette: {
      bg: "#1D4D3C",
      bgAlt: "#163C2E",
      surface: "rgba(21, 56, 43, 0.92)",
      surfaceBorder: "rgba(242, 184, 75, 0.28)",
      ink: "#F4F7F2",
      muted: "#CBE3D8",
      accent: "#F2B84B",
      accent2: "#86EFAC",
      danger: "#FDA4AF",
      positive: "#4ADE80",
    },
  },
  terracottaEarth: {
    background: "linear-gradient(155deg, #8F3B29 0%, #7F3323 60%, #68281B 100%)",
    gridColor: "rgba(253, 224, 71, 0.10)",
    gridSize: 40,
    gridOpacity: 0.45,
    texture: "risoSpeckle",
    vignette: "none",
    palette: {
      bg: "#7F3323",
      bgAlt: "#68281B",
      surface: "rgba(96, 36, 24, 0.92)",
      surfaceBorder: "rgba(253, 224, 71, 0.28)",
      ink: "#FFF9F2",
      muted: "#F5D5C8",
      accent: "#FDE047",
      accent2: "#FDBA74",
      danger: "#FCA5A5",
      positive: "#86EFAC",
    },
  },
  ochreKraft: {
    background: "linear-gradient(160deg, #D2B280 0%, #C9A673 60%, #BC9660 100%)",
    gridColor: "rgba(26, 20, 14, 0.10)",
    gridSize: 48,
    gridOpacity: 0.42,
    texture: "halftoneCorner",
    vignette: "none",
    palette: {
      bg: "#C9A673",
      bgAlt: "#B8935E",
      surface: "rgba(238, 223, 196, 0.95)",
      surfaceBorder: "rgba(26, 20, 14, 0.24)",
      ink: "#1A140E",
      muted: "#3E3020",
      accent: "#8B1E24",
      accent2: "#164E63",
      danger: "#991B1B",
      positive: "#14532D",
    },
  },
  slateDenim: {
    background: "linear-gradient(155deg, #4B6678 0%, #415968 60%, #344856 100%)",
    gridColor: "rgba(251, 191, 36, 0.10)",
    gridSize: 72,
    gridOpacity: 0.45,
    texture: "swissBand",
    vignette: "none",
    palette: {
      bg: "#415968",
      bgAlt: "#344856",
      surface: "rgba(44, 63, 75, 0.92)",
      surfaceBorder: "rgba(251, 191, 36, 0.28)",
      ink: "#F8FAFC",
      muted: "#DCE6EE",
      accent: "#FBBF24",
      accent2: "#7DD3FC",
      danger: "#FDA4AF",
      positive: "#6EE7B7",
    },
  },
  plumVelvet: {
    background: "linear-gradient(155deg, #60315B 0%, #52294D 60%, #41203D 100%)",
    gridColor: "rgba(250, 204, 21, 0.10)",
    gridSize: 36,
    gridOpacity: 0.48,
    texture: "flutedRib",
    vignette: "none",
    palette: {
      bg: "#52294D",
      bgAlt: "#41203D",
      surface: "rgba(63, 30, 59, 0.92)",
      surfaceBorder: "rgba(250, 204, 21, 0.28)",
      ink: "#FAF5FF",
      muted: "#E9D5FF",
      accent: "#FACC15",
      accent2: "#F9A8D4",
      danger: "#FDA4AF",
      positive: "#6EE7B7",
    },
  },
};

export const DEFAULT_DISPLAY_FONT =
  '"Poppins", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const DEFAULT_BODY_FONT =
  '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const TYPOGRAPHY_STACKS: Record<
  "poppins" | "serif" | "condensed" | "slab",
  { display: string; body: string }
> = {
  poppins: {
    display: DEFAULT_DISPLAY_FONT,
    body: DEFAULT_BODY_FONT,
  },
  serif: {
    display: '"Playfair Display", Georgia, "Times New Roman", serif',
    body: 'Georgia, "Times New Roman", serif',
  },
  condensed: {
    display: '"Oswald", "Arial Narrow", Arial, sans-serif',
    body: DEFAULT_BODY_FONT,
  },
  slab: {
    display: '"Roboto Slab", Rockwell, Georgia, serif',
    body: DEFAULT_BODY_FONT,
  },
};

export function resolveArtFonts(ad?: ArtDirectionConfig | null): { display: string; body: string } {
  const stack = ad?.typography ? TYPOGRAPHY_STACKS[ad.typography] : undefined;
  return {
    display: ad?.fontDisplay ?? stack?.display ?? DEFAULT_DISPLAY_FONT,
    body: ad?.fontBody ?? stack?.body ?? DEFAULT_BODY_FONT,
  };
}

export function isLightPalette(palette: ArtPalette): boolean {
  return hexLuminance(palette.bg) > 0.5;
}

function hexLuminance(hex?: string): number {
  if (!hex || typeof hex !== "string") return 0.5;
  const m = hex.trim().replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return 0.5;
  const n = parseInt(full, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function resolveArtPalette(ad?: ArtDirectionConfig | null, moodOverride?: StageMoodName): ArtPalette {
  const mood = moodOverride ?? ad?.mood ?? "obsidianGrid";
  const base = STAGE_MOODS[mood]?.palette ?? STAGE_MOODS.obsidianGrid.palette;
  const ov = ad?.palette ?? {};
  const isLightBg = hexLuminance(base.bg) > 0.5;
  if (!isLightBg) return { ...base, ...ov };
  const safeOv: Partial<ArtPalette> = { ...ov };
  for (const k of ["accent", "ink", "muted", "positive", "danger"] as const) {
    if (safeOv[k] && hexLuminance(safeOv[k]) > 0.45) {
      delete safeOv[k];
    }
  }
  return { ...base, ...safeOv };
}

export function toneColor(
  tone: "neutral" | "accent" | "danger" | "positive" | undefined,
  palette: ArtPalette
): string {
  switch (tone) {
    case "accent":
      return palette.accent;
    case "danger":
      return palette.danger;
    case "positive":
      return palette.positive;
    default:
      return palette.ink;
  }
}

export const ArtDirectionContext = React.createContext<ArtDirectionConfig | null>(null);
export const ArtDirectionProvider = ArtDirectionContext.Provider;
export const useArtDirection = () => React.useContext(ArtDirectionContext);
