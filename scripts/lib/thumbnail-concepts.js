/**
 * thumbnail-concepts.js — Shared library for Thumbnail Art Director & Critic.
 *
 * Defines the 5 CTR concept archetypes, Flux prompt builders, layout→angle
 * mappings, and the scoring rubric weights used by thumbnail-critic.js.
 *
 * All logic is deterministic (no API calls). Story-bible data is injected
 * at call-time so the same templates work for any book.
 */

"use strict";

// ── CONCEPT ARCHETYPES ────────────────────────────────────────────────────────
// 5 universal CTR angles used for book-summary thumbnails.
// Each archetype defines a visual strategy independent of the book's content.
const ARCHETYPES = {
  power: {
    angle: "power",
    description: "Who controls the city, the story, or the world? Authority vs. challenger.",
    defaultLayout: "portrait-right",
    defaultEmotion: "confrontational curiosity",
    defaultCamera: "low-angle medium-wide",
    defaultLighting: "hard golden rim light, deep shadow on left",
    hookTemplates: [
      "WHO SHOULD RULE?",
      "WHO CONTROLS IT?",
      "POWER CORRUPTS",
      "THE WRONG RULER",
      "THEY LIED TO US",
    ],
    visualHint: "A powerful authority figure vs. the crowd or city they control. Low camera angle for grandeur.",
  },
  soul: {
    angle: "soul",
    description: "The inner psychological conflict — what drives the character from inside.",
    defaultLayout: "cinematic-bleed",
    defaultEmotion: "introspective dread",
    defaultCamera: "tight medium shot",
    defaultLighting: "split Rembrandt, cool shadow vs warm highlight",
    hookTemplates: [
      "WHO CONTROLS YOU?",
      "YOUR ENEMY IS YOU",
      "THE WAR INSIDE",
      "THE DIVIDED SELF",
      "YOU'RE NOT FREE",
    ],
    visualHint: "A single figure whose internal division is visualized — split lighting, symbolic overlay, or metaphorical fragmentation.",
  },
  scene: {
    angle: "scene",
    description: "The single most iconic or visually striking scene from the book.",
    defaultLayout: "cinematic-bleed",
    defaultEmotion: "awe and unease",
    defaultCamera: "wide establishing shot",
    defaultLighting: "volumetric dramatic backlighting",
    hookTemplates: [
      "THE TURNING POINT",
      "THE MOMENT CHANGES",
      "WHEN IT ALL FALLS",
      "THE POINT OF NO RETURN",
      "WHAT THEY SAW",
    ],
    visualHint: "Recreate the most visually arresting scene — the cave, the shipwreck, the fire — something instantly recognizable to anyone who knows the book.",
  },
  conflict: {
    angle: "conflict",
    description: "Two opposing forces in direct visual tension: ideas, people, systems.",
    defaultLayout: "two-subject-vs",
    defaultEmotion: "tension and urgency",
    defaultCamera: "medium two-shot",
    defaultLighting: "high-contrast cross-lighting, each side its own color temperature",
    hookTemplates: [
      "THE FATAL CHOICE",
      "THE REAL ENEMY",
      "ORDER VS CHAOS",
      "WHO WINS?",
      "THE COLLAPSE",
    ],
    visualHint: "Two forces, visually separated by lighting or composition: cold vs. warm, order vs. chaos, philosopher vs. crowd.",
  },
  mystery: {
    angle: "mystery",
    description: "A provocative question or hidden truth that makes the viewer need to click.",
    defaultLayout: "text-poster",
    defaultEmotion: "burning curiosity",
    defaultCamera: "macro or abstract",
    defaultLighting: "single beam spotlight on key object",
    hookTemplates: [
      "THE HIDDEN TRUTH",
      "THE REAL SECRET",
      "WHAT THEY HID",
      "DON'T BE FOOLED",
      "THE FATAL LIE",
    ],
    visualHint: "A striking symbolic or metaphorical image that makes the viewer instantly curious — not literal, but evocative.",
  },
};

// ── LAYOUT → COMPOSITION RULES ────────────────────────────────────────────────
const LAYOUT_RULES = {
  "cinematic-bleed": {
    textSide: "left",
    negativeSpaceHint: "dark atmospheric space on left third, subject centered-right",
    aspectNote: "full 16:9 cinematic fill",
  },
  "portrait-right": {
    textSide: "left",
    negativeSpaceHint: "subject framed on right 60%, left 40% deep shadow for typography",
    aspectNote: "tight character right",
  },
  "split-face": {
    textSide: "center",
    negativeSpaceHint: "vertical split: left warm/right cold or two opposing subjects",
    aspectNote: "bilateral symmetry",
  },
  "two-subject-vs": {
    textSide: "center",
    negativeSpaceHint: "two figures in confrontation, text overlaid center",
    aspectNote: "facing subjects",
  },
  "text-poster": {
    textSide: "center",
    negativeSpaceHint: "graphic background, minimal subject, large hook text dominates",
    aspectNote: "text-first",
  },
  "object-hero": {
    textSide: "left",
    negativeSpaceHint: "iconic object center-right, dramatic spotlight, left negative space",
    aspectNote: "symbolic object focus",
  },
  "full-bleed": {
    textSide: "left",
    negativeSpaceHint: "wide scene, subject subtly right, text left",
    aspectNote: "environmental wide",
  },
};

// ── FLUX PROMPT BUILDER ────────────────────────────────────────────────────────
// Builds a rich, book-specific Flux image prompt from a concept spec + bible data.
// Designed to avoid the "generic dramatic man" trap by injecting book-specific
// motifs, era, characters, and location directly into the prompt.
/**
 * @param {object} concept  - The filled concept spec
 * @param {object} bible    - story-bible.json content (cast, places, objects, world)
 * @param {object} bookJson - book.json content (genre, palette)
 * @returns {string} The Flux prompt string (<= 800 chars)
 */
function buildFluxPrompt(concept, bible, bookJson) {
  const NO_TEXT =
    ", no text, no words, no letters, no writing, no typography, no labels, no captions, no titles";
  const layout = LAYOUT_RULES[concept.layout] || LAYOUT_RULES["cinematic-bleed"];

  // Era / period anchor — prevents anachronisms
  const world = bible?.world || {};
  const era = world.era || "";
  const periodHead = era
    ? `Set in ${era}, historically accurate costume and materials, no modern objects. `
    : "";
  const periodTail = era ? ", period-accurate, no anachronisms" : "";

  // Core visual subject (already built by art director, injected here)
  const subject = concept.visualSubject || concept.visualHint || "dramatic cinematic scene";

  // Composition instruction
  const compNote = layout.negativeSpaceHint;

  // Lighting + camera
  const lighting = concept.lighting || concept.defaultLighting || "dramatic cinematic rim lighting";
  const camera = concept.camera || concept.defaultCamera || "medium shot";

  // Palette from book.json (use red/gold as accent descriptors)
  const palette = buildPaletteDesc(bookJson?.palette, concept.angle);

  // Style
  const style =
    "cinematic film still, 35mm photography, photorealistic, sharp focus, 8k, award-winning cinematography, high contrast";

  // Assemble
  const parts = [
    `${periodHead}${subject}`,
    compNote,
    `${camera}, ${lighting}`,
    palette,
    style,
    "eye-catching YouTube thumbnail composition, no watermark",
  ].filter(Boolean);

  let prompt = parts.join(". ") + NO_TEXT + periodTail;

  // Hard cap: NVIDIA endpoint rejects > 800 chars
  if (prompt.length > 800) {
    prompt = prompt.slice(0, 795 - periodTail.length).rsplit
      ? prompt.slice(0, 795 - periodTail.length) + periodTail
      : prompt.slice(0, 795) + periodTail;
  }

  return prompt;
}

function buildPaletteDesc(palette, angle) {
  if (!palette) return "";
  const { paper, red, gold } = palette;
  // Translate hex to approximate English color names for Flux
  const accent = red || "#B83A24";
  const secondary = gold || "#C98A2C";
  // Map angle to palette mood
  const moodMap = {
    power: `deep charcoal background, ${hexApprox(accent)} accent glow, ${hexApprox(secondary)} rim highlight`,
    soul: `muted desaturated tones, ${hexApprox(accent)} emotional heat, cool shadow contrast`,
    scene: `rich atmospheric tones, ${hexApprox(secondary)} warm backlighting`,
    conflict: `high contrast, ${hexApprox(accent)} warm side vs cool blue opposite`,
    mystery: `deep black, single ${hexApprox(secondary)} beam, minimal palette`,
  };
  return moodMap[angle] || `dramatic color palette with ${hexApprox(accent)} accent`;
}

// Simple hex → approximate English color name for prompt naturalness
function hexApprox(hex) {
  if (!hex) return "warm amber";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (r > 160 && g < 80 && b < 80) return "deep crimson red";
  if (r > 160 && g > 120 && b < 80) return "warm terracotta gold";
  if (r < 80 && g < 80 && b > 160) return "deep royal blue";
  if (r > 200 && g > 200 && b > 200) return "soft ivory white";
  if (r < 50 && g < 50 && b < 50) return "near black";
  return "warm amber";
}

// ── SCORER WEIGHTS (10 CRITERIA, EXACTLY 100%) ────────────────────────────────
// Used by thumbnail-critic.js. Each key maps to a 0–1 score.
const CRITIC_WEIGHTS = {
  bookSpecificity: 0.15,   // Story-bible motifs, characters, places (not generic subject)
  conceptClarity: 0.12,    // Hook + visual angle convey a cohesive message
  visualQuality: 0.15,     // Real pixel sharpness, contrast & brightness balance
  semanticRelevance: 0.15, // Narrative conflict, chapters, and core thesis alignment
  genericityPenalty: 0.10, // Penalizes stock tropes ("dramatic man staring into camera")
  mobileReadability: 0.10, // Small-screen readability (320x180 card contrast & separation)
  composition: 0.08,       // Layout match + focal placement
  negativeSpace: 0.05,     // Left-side darkness ratio (pixel-verified text safe zone)
  hookQuality: 0.05,       // Hook brevity (<=3 words ideal), punch, cadence
  titleComplement: 0.05,   // Hook is distinct from title (no lazy duplication)
};

// ── GENERIC SUBJECT DETECTOR ──────────────────────────────────────────────────
// Detects "generic AI" patterns in the visual subject description.
// Lower score = more generic = penalized by critic.
const GENERIC_PHRASES = [
  "dramatic man looking",
  "intense male figure",
  "man staring into camera",
  "man looking intensely",
  "dramatic cinematic man",
  "generic cinematic",
  "dramatic person looking",
  "man with intense expression",
  "dramatic lighting man",
];

function genericityScore(visualSubject) {
  if (!visualSubject) return 0;
  const lower = visualSubject.toLowerCase();
  for (const phrase of GENERIC_PHRASES) {
    if (lower.includes(phrase)) return 0.1; // Very generic
  }
  // Count specific proper nouns (capitalized 4+ letter words) as specificity signals
  // NOTE: do NOT lowercase here — we need the original capitalisation to find proper nouns
  const specificitySignals = (visualSubject.match(/\b[A-Z][a-z]{3,}\b/g) || []);
  const uniqueSignals = new Set(specificitySignals.map((s) => s.toLowerCase()));
  if (uniqueSignals.size >= 4) return 1.0;
  if (uniqueSignals.size >= 2) return 0.8;
  if (uniqueSignals.size >= 1) return 0.6;
  return 0.3; // Generic — no identifiable proper nouns
}

// ── HOOK SCORER ───────────────────────────────────────────────────────────────
function hookScore(hook, titles) {
  if (!hook) return 0;
  const words = hook.trim().split(/\s+/).length;
  const lengthScore = words <= 3 ? 1.0 : words <= 4 ? 0.8 : words <= 5 ? 0.5 : 0.1;

  // Penalize if hook is a substring of any title
  const titleStr = (titles || []).join(" ").toLowerCase();
  const hookLower = hook.toLowerCase().replace(/[^a-z ]/g, "");
  const redundancyPenalty = titleStr.includes(hookLower) ? 0.3 : 0;

  return Math.max(0, lengthScore - redundancyPenalty);
}

// ── LAYOUT MATCH SCORER ───────────────────────────────────────────────────────
const ANGLE_PREFERRED_LAYOUTS = {
  power: ["portrait-right", "cinematic-bleed", "two-subject-vs"],
  soul: ["cinematic-bleed", "portrait-right", "split-face"],
  scene: ["cinematic-bleed", "full-bleed", "object-hero"],
  conflict: ["two-subject-vs", "split-face", "cinematic-bleed"],
  mystery: ["text-poster", "object-hero", "cinematic-bleed"],
};

function layoutMatchScore(angle, layout) {
  const preferred = ANGLE_PREFERRED_LAYOUTS[angle] || [];
  const idx = preferred.indexOf(layout);
  if (idx === 0) return 1.0;
  if (idx === 1) return 0.75;
  if (idx === 2) return 0.5;
  return 0.2;
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────
module.exports = {
  ARCHETYPES,
  LAYOUT_RULES,
  CRITIC_WEIGHTS,
  buildFluxPrompt,
  genericityScore,
  hookScore,
  layoutMatchScore,
};
