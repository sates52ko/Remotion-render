#!/usr/bin/env node
/**
 * thumbnail-art-director.js — Generates 5 distinct CTR-thesis thumbnail concepts
 * from a book's story-bible.json, youtube-meta.json, and book.json.
 *
 * Each concept is a different visual argument for why someone should click:
 *   1. power   — Who controls the story / city / world?
 *   2. soul    — The inner psychological conflict
 *   3. scene   — The book's single most iconic visual scene
 *   4. conflict — Two opposing forces in direct tension
 *   5. mystery — The most burning unanswered question
 *
 * Output: books/<slug>/thumbnail-concepts.json
 *
 * Usage:
 *   node scripts/thumbnail-art-director.js --slug=the-republic
 *   node scripts/thumbnail-art-director.js --slug=the-republic --dry-run
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { ARCHETYPES, buildFluxPrompt, LAYOUT_RULES, pickStyle } = require("./lib/thumbnail-concepts");
const { loadChannelHistory, assessHook } = require("./lib/thumbnail-governance");
const { usesPropositionWorlds } = require("./lib/visual-intent");
const screenText = require("./lib/screen-text");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);

const SLUG = args.slug;
const DRY_RUN = !!args["dry-run"];

if (!SLUG) {
  console.error("Usage: node scripts/thumbnail-art-director.js --slug=<slug> [--dry-run]");
  process.exit(1);
}

// ── READ INPUT FILES ──────────────────────────────────────────────────────────
function readJson(absPath, label) {
  try {
    return JSON.parse(fs.readFileSync(absPath, "utf8"));
  } catch (e) {
    if (label) console.warn(`  [warn] ${label} not found: ${absPath}`);
    return null;
  }
}

const biblePath = path.join(ROOT, "books", SLUG, "story-bible.json");
const metaPath = path.join(ROOT, "books", SLUG, "youtube-meta.json");
const bookPath = path.join(ROOT, "books", SLUG, "book.json");

const bible = readJson(biblePath, "story-bible.json");
const meta = readJson(metaPath, "youtube-meta.json");
const bookJson = readJson(bookPath, "book.json");

if (!meta) {
  console.error(`❌ youtube-meta.json not found for slug "${SLUG}". Run plan-meta.js first.`);
  process.exit(1);
}

// ── EXTRACT BOOK INTELLIGENCE ─────────────────────────────────────────────────
// Pull the most actionable data from bible + meta for concept generation.

const title = meta.title || bookJson?.title || SLUG.replace(/-/g, " ");
const author = meta.author || bookJson?.author || "";
const genre = meta.genre || bookJson?.genre || "drama";
const titles = meta.titles || [];
const description = meta.description || "";
const chapters = meta.chapters || [];

// Top cast characters (by mentions, top 3)
const castEntries = Object.values(bible?.cast || {})
  .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
  .slice(0, 3);
const topCharacter = castEntries[0] || null;
const antagonist = castEntries[1] || null;

// Top objects / motifs (by mentions, exclude generic ones)
const SKIP_CONCEPTS = new Set(["phone", "car", "laptop", "office", "coffee", "bedroom"]);
const topObjects = (bible?.objects || [])
  .filter((o) => !SKIP_CONCEPTS.has(o.concept))
  .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
  .slice(0, 5);

// Top places (by mentions)
const topPlaces = Object.values(bible?.places || {})
  .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
  .slice(0, 3);

// Era / world
const world = bible?.world || {};
const era = world.era || "";

// Most mentioned object (the iconic motif of the book)
const iconicMotif = topObjects[0]?.concept || null;
const secondMotif = topObjects[1]?.concept || null;

// Extract chapter themes for scene concept
const chapterLabels = chapters.map((c) => c.label).filter(Boolean);
const channelHistory = loadChannelHistory(ROOT, SLUG);

// ── BOOK WORLD GATE (2026-09-23) ──────────────────────────────────────────────
// This director was written against The Republic: its "soul" prompt ended with
// "reason on one side, appetite on the other" (the tripartite soul) and fired on
// any "mind"/"psych" word, so a creativity book (show-your-work) got a Platonic
// thumbnail. Republic-specific vocabulary now lives in WORLD_OVERLAYS, used only
// when the book's world owns it in the code-owned registry (data/motif-world.json
// via usesPropositionWorlds — the same gate as the video's proposition engine).
// Every other book gets the generic base, built from its own story bible.
const WORLD_ID = bible?.visualProvenance?.worldId || bible?.world?.worldId || null;
const PROPOSITION_BOOK = usesPropositionWorlds({ meta: { slug: SLUG } }, { worldId: WORLD_ID });
const WORLD_OVERLAYS = {
  proposition: {
    evidence: {
      power: [/might makes right/i, /ship of state/i, /justice|ruler|state/i],
      soul: [/civil war/i, /tripartite|appetite|reason|spirit/i, /soul|psych/i],
      scene: [/cave|shadow|fire/i, /shipwreck/i],
      conflict: [/tyrant|democracy|flattery/i],
      mystery: [/myth|destiny/i],
    },
    powerHook: "WHO SHOULD RULE?",
    soulHook: "3 PARTS ONE SELF",
    soulMotif: /soul|mind|psyche|tripartite|spirit|appetite/i,
    soulTension: "reason on one side, appetite on the other",
    conflictMotif: /tyrant|regime|democracy|beast|despot|empire/i,
    mysteryMotif: /soul|city|state|ship|ring/i,
    visualChapter: /cave|allegory|ship|beast/i,
    caveScene: true,
    shipOfState: true,
    rulerWord: "RULER",
  },
};
const OVERLAY = PROPOSITION_BOOK ? WORLD_OVERLAYS.proposition : null;

// Generic, book-agnostic evidence: words any book's chapters may use.
const BASE_EVIDENCE = {
  power: [/power|control|authority|rule|status|money|leader/i],
  soul: [/fear|doubt|self|identity|impostor|mind|inner|myth/i],
  scene: [/turning|fall|death|moment|first|last/i],
  conflict: [/\bvs\b|versus|against|enemy|war|conflict|choice|rival|objection/i],
  mystery: [/secret|truth|hidden|lie|illusion|why|question|warning/i],
};
// Use language the viewer will actually encounter in the episode. This is both
// more compelling than generic clickbait and makes the metadata promise auditable.
const EVIDENCE_PATTERNS = Object.fromEntries(Object.keys(BASE_EVIDENCE).map((k) => [
  k, [...((OVERLAY && OVERLAY.evidence[k]) || []), ...BASE_EVIDENCE[k]],
]));

// The book's own central tension, from its story bible (spine claim), when present.
const spineClaim = ((bible?.spine || []).map((x) => x && x.claim).filter(Boolean)[0] || "").replace(/[.]+$/, "");

function evidenceFor(angle) {
  const match = (EVIDENCE_PATTERNS[angle] || []).map((pattern) => chapterLabels.find((label) => pattern.test(label))).find(Boolean);
  return match
    || chapterLabels[0]
    || description.split(/[.!?]/)[0]
    || title;
}

// A hook is a WHOLE chapter label the viewer will hear, or a template — never
// its first five words ("THE LIE OF THE HIDDEN", "THE GREAT BEAST WHY
// DEMOCRACY"). It must also pass the shared screen-text check.
function readableHook(label) {
  const clean = (t) => String(t || "")
    .replace(/\b(book|chapter)s?\s*[\d-]+\b/gi, "")
    .replace(/[–—;,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  // "LEONTIUS AT THE WALL: THE CIVIL WAR WITHIN" -> the whole label, else one
  // of its colon halves; never an arbitrary word window.
  const halves = String(label || "").split(":");
  const parts = halves.flatMap((h) => h.split(/\s&\s/));
  const options = [label, ...halves, ...parts].map(clean).filter(Boolean);
  return options.find((c) => {
    const n = c.split(" ").length;
    return n >= 2 && n <= 5 && screenText.checkString(c, { kind: "text" }).length === 0;
  }) || null;
}

function hookFromEvidence(angle, fallback) {
  return readableHook(evidenceFor(angle)) || fallback;
}
const mostVisualChapter = chapterLabels.find(
  (l) => (OVERLAY && OVERLAY.visualChapter.test(l)) || /shadow|war|death|fire|city|fall|trap/i.test(l),
) || chapterLabels[Math.floor(chapterLabels.length * 0.4)] || "";

// Build character visual desc from bible
function charDesc(char) {
  if (!char) return "a protagonist figure";
  const look = char.look || char.name || "a key character";
  const era2 = era ? ` in ${era}` : "";
  return `${look}${era2}`;
}

// ── CONCEPT BUILDERS ──────────────────────────────────────────────────────────
// Each builder returns a ThumbnailConcept object. Hook is chosen from the
// archetype's template list, personalized with book-specific terms where possible.

function makePowerConcept() {
  const arch = ARCHETYPES.power;
  const char = topCharacter;
  const place = topPlaces[0];

  // Build book-specific hook
  const hooks = [
    (OVERLAY && OVERLAY.powerHook) || "WHO CONTROLS IT?",
    "WHO CONTROLS IT?",
    author ? `WHY ${author.split(" ").pop().toUpperCase()} WAS RIGHT` : "POWER CORRUPTS",
    `THE WRONG ${(OVERLAY && OVERLAY.rulerWord) || "LEADER"}`,
    iconicMotif ? `THE ${iconicMotif.toUpperCase().slice(0, 12)} WINS` : "THEY LIED TO US",
  ];
  const hook = hookFromEvidence("power", hooks[0]);

  // Specific visual subject
  const placeDesc = place
    ? `${OVERLAY && OVERLAY.shipOfState && place.set === "shipDeck" ? "a ship of state" : place.set} setting`
    : "an ancient seat of power";
  // Generic books: stage the figure in the book's own place (story-bible look),
  // not a "monumental" Republic city.
  const lcFirst = (t) => String(t || "").replace(/^[A-Z](?=[a-z\s])/, (c) => c.toLowerCase());
  const visualSubject = !char
    ? `A towering authority figure facing a city or institution, low angle, symbolic of power over the many`
    : OVERLAY
      ? `${charDesc(char)} standing in the foreground, facing a monumental ${iconicMotif || placeDesc} behind them, low camera angle emphasizing authority and scale, the crowd or opposing force barely visible at the edges`
      : `${charDesc(char)} standing in the foreground of ${place && place.look ? lcFirst(place.look) : "the world they are trying to change"}, low camera angle emphasizing scale, the people they want to reach barely visible at the edges`;

  return buildConcept("power", hook, visualSubject, arch.defaultLayout, arch, 0);
}

function makeSoulConcept() {
  const arch = ARCHETYPES.soul;
  const char = topCharacter;

  // Soul-specific hooks — lean into psychological / internal
  const hooks = [
    "WHO CONTROLS YOU?",
    "YOUR ENEMY IS YOU",
    "THE WAR INSIDE",
    secondMotif ? `${secondMotif.toUpperCase().replace(/([A-Z])/g, " $1").trim().toUpperCase().slice(0, 16)}` : ((OVERLAY && OVERLAY.soulHook) || "THE DIVIDED SELF"),
    "YOU'RE NOT FREE",
  ];
  const hook = hookFromEvidence("soul", hooks[0]);

  // Book-specific soul motifs only in the world that owns them (Republic:
  // tripartite soul); every other book shows ITS OWN central tension, taken
  // from the story bible's spine claim.
  const soulMotif = OVERLAY ? topObjects.find((o) => OVERLAY.soulMotif.test(o.concept)) : null;
  const motifDesc = soulMotif
    ? `the ${soulMotif.concept.replace(/([A-Z])/g, " $1").trim().toLowerCase()} concept visualized as a fragmented interior landscape`
    : spineClaim
      ? `the book's central tension (${spineClaim})`
      : "the protagonist's internal psychological conflict";
  const tension = OVERLAY ? ` — ${OVERLAY.soulTension}` : "";

  const visualSubject = char
    ? `${charDesc(char)}, tight medium framing, their silhouette or form divided by split Rembrandt lighting, ${motifDesc} visible as an abstract overlay or background${tension}`
    : OVERLAY
      ? `A human figure whose body or shadow contains a divided world: order and chaos, reason and appetite, light and dark, split with precise cinematic lighting`
      : `A human figure whose shadow holds the book's central tension${spineClaim ? ` (${spineClaim})` : ""}, split with precise cinematic lighting`;

  return buildConcept("soul", hook, visualSubject, arch.defaultLayout, arch, 1);
}

function makeSceneConcept() {
  const arch = ARCHETYPES.scene;

  // Find the most iconic scene from bible places + objects
  // The cave-allegory scene belongs to the Republic's world only.
  const cavePlace = OVERLAY && OVERLAY.caveScene ? Object.values(bible?.places || {}).find((p) => /cave/i.test(p.set)) : null;

  let hook = arch.hookTemplates[0] || "THE TURNING POINT";
  let visualSubject;

  if (cavePlace) {
    // Cave allegory is an iconic scene for philosophy/classics
    hook = "YOU'RE SEEING SHADOWS";
    visualSubject = `Inside a dark cave, ${era ? `set in ${era}, ` : ""}prisoners chained facing a stone wall, their shadows cast by a distant fire visible at the mouth of the cave, a single figure turning toward the blinding light outside — dramatic volumetric light rays piercing the darkness, ancient stone textures, cinematic wide establishing shot`;
  } else if (mostVisualChapter) {
    // Derive hook & visual from the most visual chapter
    // Whole label or template — the first three words of a label are a fragment.
    hook = readableHook(mostVisualChapter) || arch.hookTemplates[0] || "THE TURNING POINT";
    const motifDesc = iconicMotif
      ? `featuring ${iconicMotif.replace(/([A-Z])/g, " $1").trim().toLowerCase()}`
      : "at a dramatic crossroads";
    visualSubject = `The climactic scene from "${title}" (${mostVisualChapter}) ${motifDesc}: ${charDesc(topCharacter)}, ${era ? `${era} setting, ` : ""}dramatic wide shot, volumetric backlighting creating a silhouette, the weight of the moment visible in the environment`;
  } else {
    hook = arch.hookTemplates[1] || "THE MOMENT CHANGES";
    visualSubject = `A pivotal dramatic scene from ${era || "the story"}: ${charDesc(topCharacter)} at the critical decision point, cinematic wide shot, high contrast lighting, environment charged with symbolic tension`;
  }

  return buildConcept("scene", hookFromEvidence("scene", hook), visualSubject, arch.defaultLayout, arch, 2);
}

function makeConflictConcept() {
  const arch = ARCHETYPES.conflict;
  const protagonist = topCharacter;
  const foil = antagonist;

  // Look for conflict / opposition concepts in objects (in priority order)
  const CONFLICT_MOTIF_PRIORITY = /crowd|enemy|war|greed|market|fear|rival/i;
  const conflictMotif =
    (OVERLAY && topObjects.find((o) => OVERLAY.conflictMotif.test(o.concept))) ||
    topObjects.find((o) => CONFLICT_MOTIF_PRIORITY.test(o.concept)) ||
    topObjects[2] ||
    null;

  let hooks;
  // "<MOTIF>'S TRAP" was written for Republic motifs ("TYRANT'S TRAP"); on
  // other books it produced "GIFT'S TRAP". Generic books use the templates.
  if (conflictMotif && OVERLAY) {
    const rawTerm = conflictMotif.concept.replace(/([A-Z])/g, " $1").trim().toUpperCase();
    const hookTerm = rawTerm.length <= 14 ? rawTerm : rawTerm.split(" ")[0];
    hooks = [
      `${hookTerm}'S TRAP`,
      "THE REAL ENEMY",
      "ORDER VS CHAOS",
      "THE FATAL CHOICE",
      "WHO WINS?",
    ];
  } else {
    hooks = [
      "THE REAL ENEMY",
      "ORDER VS CHAOS",
      "THE FATAL CHOICE",
      "WHO WINS?",
      "THE COLLAPSE",
    ];
  }
  const hook = hookFromEvidence("conflict", hooks[0]);

  let visualSubject;
  if (protagonist && foil) {
    visualSubject = `${charDesc(protagonist)} on the left in warm golden light facing ${charDesc(foil)} on the right in cool shadow — two opposing ${OVERLAY ? "philosophies" : "ideas"}, the tension between them visible in the ${era ? era + " " : ""}environment`;
  } else if (conflictMotif) {
    const motifName = conflictMotif.concept.replace(/([A-Z])/g, " $1").trim().toLowerCase();
    visualSubject = `${charDesc(protagonist)} standing alone against the overwhelming force of ${motifName}: a vast crowd, a powerful institution, or a symbolic presence looming behind them in the ${era ? era : "dramatic"} setting`;
  } else {
    visualSubject = `Two opposing forces dramatically confronted in ${era ? era : "the"} setting — order and chaos, the individual and the crowd, each side lit with contrasting warm and cool tones`;
  }

  return buildConcept("conflict", hook, visualSubject, arch.defaultLayout, arch, 3);
}

function makeMasteryConcept() {
  const arch = ARCHETYPES.mystery;

  // Find the most abstract / metaphorical concept from objects
  const metaphorMotif = topObjects.find((o) =>
    (OVERLAY && OVERLAY.mysteryMotif.test(o.concept)) || /mind|myth|symbol|shadow|secret|truth|illusion|game|mask|iceberg/i.test(o.concept),
  ) || topObjects[0] || null;

  let hooks;
  // "THE <MOTIF> IS A LIE" fits Republic motifs ("THE CITY IS A LIE"); on other
  // books it produced "THE ICEBERG DEPTH IS A LIE".
  if (metaphorMotif && OVERLAY) {
    const rawTerm = metaphorMotif.concept.replace(/([A-Z])/g, " $1").trim().toUpperCase();
    const hookTerm = rawTerm.length <= 14 ? rawTerm : rawTerm.split(" ")[0];
    hooks = [
      `THE ${hookTerm} IS A LIE`,
      "THE HIDDEN TRUTH",
      "WHAT THEY HID",
      `WHY ${(title.split(":")[0] || title).split(" ").slice(-1)[0].toUpperCase()} MATTERS`,
      "THE BIG SECRET",
    ];
  } else {
    hooks = [
      "THE HIDDEN TRUTH",
      "THE REAL SECRET",
      "WHAT THEY HID",
      `WHY ${(title.split(":")[0] || title).split(" ").slice(-1)[0].toUpperCase()} MATTERS`,
      "DON'T BE FOOLED",
    ];
  }
  const hook = hookFromEvidence("mystery", hooks[0]);

  let visualSubject;
  if (metaphorMotif) {
    const motifName = metaphorMotif.concept.replace(/([A-Z])/g, " $1").trim().toLowerCase();
    visualSubject = `A symbolic ${era ? era + " " : ""}visualization of "${title}": ${motifName} depicted as an abstract metaphor — perhaps contained within a human silhouette, an iconic symbol in dramatic isolation, or a landscape of the mind. Minimal, graphic, high-concept. Deep black background with a single dramatic spotlight revealing the symbol`;
  } else {
    visualSubject = `A dramatic symbolic image representing the central mystery of "${title}" — abstract, thought-provoking, a single iconic object or symbol isolated in deep shadow with one piercing beam of light`;
  }

  return buildConcept("mystery", hook, visualSubject, arch.defaultLayout, arch, 4);
}

// ── CORE BUILDER ─────────────────────────────────────────────────────────────
const usedStyles = new Set(); // no two concepts of the same book share a style

function buildConcept(angle, hook, visualSubject, layout, arch, idx) {
  const motifMatch = topObjects[idx < topObjects.length ? idx : 0];
  // Style DNA: deterministic per (slug, angle), anti-correlated with recent
  // channel styles so the feed doesn't collapse into one visual language.
  const recentStyles = channelHistory.slice(-12).map((h) => h.style).filter(Boolean);
  const style = pickStyle(angle, SLUG, recentStyles, usedStyles);
  usedStyles.add(style.key);
  const fluxPrompt = buildFluxPrompt(
    {
      angle,
      layout,
      visualSubject,
      lighting: arch.defaultLighting,
      camera: arch.defaultCamera,
      defaultLighting: arch.defaultLighting,
      defaultCamera: arch.defaultCamera,
      stylePrompt: style.prompt,
    },
    bible,
    bookJson,
  );

  return {
    conceptId: `${angle}-${String(idx).padStart(2, "0")}`,
    angle,
    hook,
    evidence: evidenceFor(angle),
    thesis: arch.description,
    visualSubject,
    iconicMotif: motifMatch?.concept || null,
    emotion: arch.defaultEmotion,
    layout,
    camera: arch.defaultCamera,
    lighting: arch.defaultLighting,
    style: style.key,
    negativeSpace: LAYOUT_RULES[layout]?.textSide === "left" ? "left" : "center",
    fluxPrompt,
    imagePath: `scenes/${SLUG}/thumbnail-concept-${angle}.png`,
    cutPath: `scenes/${SLUG}/thumbnail-concept-${angle}-cut.png`,
    _needsCriticScore: true,
    _score: null,
    _winner: false,
  };
}

// ── GENERATE ALL 5 CONCEPTS ───────────────────────────────────────────────────
console.log(`\n🎨 Thumbnail Art Director — ${title}`);
console.log(`   slug: ${SLUG}`);
console.log(`   bible: ${bible ? "✓" : "✗ (missing — concepts will be less specific)"}`);
console.log(`   era: ${era || "(none)"}`);
console.log(`   world: ${WORLD_ID || "(none)"}${OVERLAY ? " (proposition-world overlay ON)" : " (generic)"}`);
console.log(`   top cast: ${castEntries.map((c) => c.name).join(", ") || "(none)"}`);
console.log(`   top motifs: ${topObjects.slice(0, 3).map((o) => o.concept).join(", ") || "(none)"}`);
console.log(`   top places: ${topPlaces.map((p) => p.set).join(", ") || "(none)"}\n`);

const concepts = [
  makePowerConcept(),
  makeSoulConcept(),
  makeSceneConcept(),
  makeConflictConcept(),
  makeMasteryConcept(),
];

// Ensure no two concepts have the same hook
const usedHooks = new Set();
for (const c of concepts) {
  if (usedHooks.has(c.hook)) {
    // Dedupe by appending the angle
    const arch = ARCHETYPES[c.angle];
    const altHooks = arch.hookTemplates.filter((h) => !usedHooks.has(h));
    if (altHooks.length) c.hook = altHooks[0];
  }
  usedHooks.add(c.hook);
}

for (const concept of concepts) {
  concept.policy = assessHook({
    hook: concept.hook,
    evidence: `${concept.evidence} ${description}`,
    title,
    history: channelHistory,
    layout: concept.layout,
    angle: concept.angle,
  });
  concept._needsEditorialRefine = !concept.policy.ok;
}

// Print summary
console.log("📋 Generated concepts:");
for (const c of concepts) {
  console.log(`   [${c.conceptId}] ${c.hook.padEnd(28)} layout: ${c.layout}  style: ${c.style}${c._needsEditorialRefine ? "  ⚠ editorial refine" : ""}`);
  console.log(`              → ${c.visualSubject.slice(0, 90)}...`);
}

// ── OUTPUT ────────────────────────────────────────────────────────────────────
const outPath = path.join(ROOT, "books", SLUG, "thumbnail-concepts.json");

const output = {
  slug: SLUG,
  title,
  author,
  genre,
  generatedAt: new Date().toISOString(),
  _artDirector: "thumbnail-art-director.js v2",
  channelContext: { priorThumbnails: channelHistory.length },
  concepts,
};

if (DRY_RUN) {
  console.log("\n[dry-run] Would write:", outPath);
  console.log(JSON.stringify(output, null, 2));
} else {
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Concepts written → ${outPath}`);
  console.log("   Next: python scripts/gen-thumbnail.py --concepts=" + outPath);
}
