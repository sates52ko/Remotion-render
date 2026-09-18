/**
 * art-director.js — Unified Autonomous Art Director & Pre-Production Engine
 *
 * Serves both Antidote (flat vector 2D) and Vox (documentary journalism).
 *
 * Core responsibilities:
 * 1. Worldbuilding & Universe Analysis (Era, Tone, Color Palette, Core Metaphors)
 * 2. Engine Recommender (Antidote vs. Vox suitability score & rationale)
 * 3. Asset Gap Analysis (audits existing sets/motifs/documents against script needs)
 * 4. Dynamic Asset Synthesis (produces parametric custom SVG motifs for Antidote
 *    and document styles / geo-coordinates / photo prompts for Vox)
 */

const { MODEL, ENDPOINT, USE_NVIDIA, stripThink } = require("./llm");

// ── 1. DOMAIN & ERA TAXONOMY ────────────────────────────────────────────────

const UNIVERSES = {
  ancient_philosophy: {
    label: "Classical Antiquity & Philosophy",
    keywords: ["stoic", "virtue", "wisdom", "seneca", "marcus", "aurelius", "epictetus", "socrates", "plato", "agora", "temple", "rome", "greek", "emperor", "meditations", "fate", "logos"],
    antidoteSets: ["stage", "sky", "room"],
    voxDocType: "parchment",
    recommendedEngine: "antidote",
    confidence: 0.88,
    rationale: "Mental models and philosophical axioms excel in kinetic 2D vector format with archetypal metaphors.",
    palette: {
      primary: "#991B1B",   // Roman imperial crimson
      secondary: "#B45309", // Antique bronze gold
      accent: "#D97706",
      paper: "#FDFBF7",
      ink: "#262626",
    },
    defaultCustomMotifs: {
      stoicBust: {
        title: "Stoic Bust",
        viewBox: "0 0 520 520",
        paths: [
          { d: "M 200 440 L 320 440 L 300 370 L 220 370 Z", fill: "ink" },
          { d: "M 180 440 L 340 440 L 330 460 L 190 460 Z", fill: "accent" },
          { d: "M 220 370 Q 180 300 190 220 Q 200 130 260 130 Q 320 130 330 220 Q 340 300 300 370 Z", stroke: "ink", strokeWidth: 8, fill: "none" },
          { d: "M 210 190 Q 260 160 310 190", stroke: "accent", strokeWidth: 7, fill: "none" },
          { d: "M 260 210 L 255 270 L 275 270", stroke: "ink", strokeWidth: 7, fill: "none" },
          { d: "M 235 305 Q 260 315 285 305", stroke: "ink", strokeWidth: 6, fill: "none" },
        ],
      },
      dichotomyOfControl: {
        title: "Sphere of Control",
        viewBox: "0 0 520 520",
        paths: [
          { d: "M 260 60 A 200 200 0 1 0 260 460 A 200 200 0 1 0 260 60", stroke: "ink", strokeWidth: 4, strokeDasharray: "12 12", fill: "none", opacity: 0.4 },
          { d: "M 260 160 A 100 100 0 1 0 260 360 A 100 100 0 1 0 260 160", stroke: "accent", strokeWidth: 8, fill: "none" },
          { d: "M 260 230 A 30 30 0 1 0 260 290 A 30 30 0 1 0 260 230", fill: "accent" },
        ],
      },
    },
  },

  silicon_valley_startup: {
    label: "Tech Startup & Growth Engine",
    keywords: ["startup", "launch", "customer", "saas", "code", "mrr", "stripe", "pitch", "silicon", "valley", "noah", "kagan", "founder", "weekend", "validate", "product", "software", "scale"],
    antidoteSets: ["workstation", "startupGarage", "pitchStage", "office"],
    voxDocType: "financial",
    recommendedEngine: "antidote",
    confidence: 0.94,
    rationale: "Action-oriented 48-hour sprints and tech metrics thrive with snappy vector IDEs, funnels and kinetic retention bars.",
    palette: {
      primary: "#16A34A",   // Growth emerald
      secondary: "#0F172A", // Dark slate
      accent: "#22C55E",
      paper: "#FCFCFA",
      ink: "#111827",
    },
    defaultCustomMotifs: {}, // already natively provided in motifs.tsx
  },

  behavioral_psychology: {
    label: "Cognitive Science & Behavioral Psychology",
    keywords: ["habit", "brain", "bias", "dopamine", "cognitive", "psychology", "kahneman", "thinking", "mind", "subconscious", "behavior", "cue", "craving", "routine", "reward", "decision"],
    antidoteSets: ["room", "office", "classroom", "stage"],
    voxDocType: "lab",
    recommendedEngine: "antidote",
    confidence: 0.85,
    rationale: "Mental loops and decision frameworks are best explained with kinetic animated diagrams and loops.",
    palette: {
      primary: "#7C3AED",   // Synapse violet
      secondary: "#0284C7", // Cyan focus
      accent: "#F59E0B",   // Dopamine amber
      paper: "#FDFDFE",
      ink: "#1E1B4B",
    },
    defaultCustomMotifs: {
      synapseLoop: {
        title: "Habit Loop",
        viewBox: "0 0 520 520",
        paths: [
          { d: "M 260 100 A 150 150 0 0 1 410 250", stroke: "accent", strokeWidth: 9, strokeLinecap: "round", fill: "none" },
          { d: "M 410 270 A 150 150 0 0 1 260 420", stroke: "ink", strokeWidth: 9, strokeLinecap: "round", fill: "none" },
          { d: "M 240 420 A 150 150 0 0 1 90 270", stroke: "accent", strokeWidth: 9, strokeLinecap: "round", fill: "none" },
          { d: "M 90 250 A 150 150 0 0 1 240 100", stroke: "ink", strokeWidth: 9, strokeLinecap: "round", fill: "none" },
          { d: "M 260 80 L 285 100 L 260 120 Z", fill: "accent" },
          { d: "M 430 250 L 410 275 L 390 250 Z", fill: "ink" },
          { d: "M 260 440 L 235 420 L 260 400 Z", fill: "accent" },
          { d: "M 70 270 L 90 245 L 110 270 Z", fill: "ink" },
        ],
      },
    },
  },

  investigative_history: {
    label: "Investigative Journalism & Modern History",
    keywords: ["war", "cold war", "soviet", "cia", "kgb", "nuclear", "chernobyl", "investigation", "declassified", "government", "military", "treaty", "spies", "scandal", "watergate", "classified", "timeline"],
    antidoteSets: ["office", "street", "highway"],
    voxDocType: "declassified",
    recommendedEngine: "vox",
    confidence: 0.95,
    rationale: "Authentic archival paper, declassified files, confidential stamps and geographical cartography are quintessential Vox.",
    palette: {
      primary: "#DC2626",   // Censorship red
      secondary: "#44403C", // Typewriter ribbon black
      accent: "#EAB308",   // Evidence highlighter
      paper: "#F4EFE6",
      ink: "#1C1917",
    },
    defaultCustomMotifs: {},
  },

  wealth_economics: {
    label: "Economics, Markets & Wealth Building",
    keywords: ["investing", "money", "wealth", "buffett", "compound", "interest", "stock", "market", "portfolio", "capital", "dividend", "inflation", "asset", "debt", "morgan", "houssel", "rich"],
    antidoteSets: ["office", "stage", "workstation"],
    voxDocType: "financial",
    recommendedEngine: "vox",
    confidence: 0.78,
    rationale: "Financial ledgers, multi-decade trendlines, and bar charts make economic history deeply engaging.",
    palette: {
      primary: "#059669",   // Ledger green
      secondary: "#1E293B", // Navy slate
      accent: "#F59E0B",   // Gold coin
      paper: "#F8FAF8",
      ink: "#064E3B",
    },
    defaultCustomMotifs: {},
  },
};

// ── 2. SEMANTIC WORLD INFERENCE ─────────────────────────────────────────────

function analyzeBookUniverse({ title = "", author = "", genre = "", vttText = "", words = [] }) {
  const corpus = `${title} ${author} ${genre} ${vttText.slice(0, 8000)}`.toLowerCase();
  
  let bestUniverseKey = "contemporary_general";
  let maxScore = 0;

  for (const [key, u] of Object.entries(UNIVERSES)) {
    let score = 0;
    for (const kw of u.keywords) {
      const matches = corpus.split(kw).length - 1;
      score += matches * (kw.length > 5 ? 2 : 1);
    }
    if (score > maxScore) {
      maxScore = score;
      bestUniverseKey = key;
    }
  }

  const u = UNIVERSES[bestUniverseKey] || {
    label: "Contemporary General Non-Fiction",
    antidoteSets: ["office", "room", "stage"],
    voxDocType: "newspaper",
    recommendedEngine: "antidote",
    confidence: 0.70,
    rationale: "Balanced narrative pace suited for expressive vector characters and kinetic callouts.",
    palette: { primary: "#2563EB", secondary: "#1E293B", accent: "#F97316", paper: "#FAFAF9", ink: "#18181B" },
    defaultCustomMotifs: {},
  };

  return {
    universeKey: bestUniverseKey,
    label: u.label,
    recommendedEngine: u.recommendedEngine,
    confidence: u.confidence,
    rationale: u.rationale,
    palette: u.palette,
    antidoteSets: u.antidoteSets,
    voxDocType: u.voxDocType,
    customMotifs: u.defaultCustomMotifs || {},
  };
}

// ── 3. ASSET GAP ANALYSIS (ANTIDOTE) ─────────────────────────────────────────

function auditAntidoteAssets(universe, currentRegistry = {}) {
  const gaps = [];
  const activeCustomMotifs = {};

  if (universe.customMotifs) {
    for (const [mName, mDef] of Object.entries(universe.customMotifs)) {
      if (!currentRegistry[mName]) {
        gaps.push({ type: "motif", name: mName, action: "synthesize_customSvg" });
        activeCustomMotifs[mName] = mDef;
      }
    }
  }

  return {
    coverageScore: gaps.length === 0 ? 1.0 : 0.85,
    gaps,
    activeCustomMotifs,
  };
}

// ── 4. ASSET GAP ANALYSIS (VOX) ──────────────────────────────────────────────

function auditVoxAssets(universe, vttText = "") {
  // Extract potential locations for map scenes
  const knownCities = [
    { name: "San Francisco", lat: 37.7749, lng: -122.4194 },
    { name: "New York", lat: 40.7128, lng: -74.0060 },
    { name: "London", lat: 51.5074, lng: -0.1278 },
    { name: "Washington", lat: 38.9072, lng: -77.0369 },
    { name: "Berlin", lat: 52.5200, lng: 13.4050 },
    { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
    { name: "Athens", lat: 37.9838, lng: 23.7275 },
    { name: "Rome", lat: 41.9028, lng: 12.4964 },
  ];

  const foundLocations = knownCities.filter(c => vttText.toLowerCase().includes(c.name.toLowerCase()));

  return {
    recommendedDocType: universe.voxDocType || "newspaper",
    suggestedLocations: foundLocations,
    photoPromptStyle: `${universe.label}, archival editorial lighting, documentary realism, tactile paper texture, 35mm photograph`,
  };
}

// ── 5. CREATIVE BIBLE GENERATOR ─────────────────────────────────────────────

async function generateCreativeBible({ title, author, genre, vttText = "" }) {
  const universe = analyzeBookUniverse({ title, author, genre, vttText });
  const antidoteAudit = auditAntidoteAssets(universe);
  const voxAudit = auditVoxAssets(universe, vttText);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: "Antidote/Vox Unified Art Director v5.0",
      book: { title, author, genre },
    },
    world: {
      universeKey: universe.universeKey,
      label: universe.label,
      recommendedEngine: universe.recommendedEngine,
      engineConfidence: universe.confidence,
      engineRationale: universe.rationale,
      palette: universe.palette,
    },
    antidote: {
      preferredSets: universe.antidoteSets,
      activeCustomMotifs: antidoteAudit.activeCustomMotifs,
      gaps: antidoteAudit.gaps,
    },
    vox: {
      primaryDocType: voxAudit.recommendedDocType,
      suggestedLocations: voxAudit.suggestedLocations,
      photoPromptStyle: voxAudit.photoPromptStyle,
    },
  };
}

module.exports = {
  UNIVERSES,
  analyzeBookUniverse,
  auditAntidoteAssets,
  auditVoxAssets,
  generateCreativeBible,
};
