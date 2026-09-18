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
const { ARCHETYPES, buildFluxPrompt, LAYOUT_RULES } = require("./lib/thumbnail-concepts");
const { loadChannelHistory, assessHook } = require("./lib/thumbnail-governance");

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

// Use language the viewer will actually encounter in the episode. This is both
// more compelling than generic clickbait and makes the metadata promise auditable.
const EVIDENCE_PATTERNS = {
  power: [/might makes right/i, /ship of state/i, /power|justice|rule|ruler|state|authority/i],
  soul: [/civil war/i, /tripartite|appetite|reason|spirit/i, /soul|mind|psych/i],
  scene: [/cave|shadow|fire/i, /turning|fall|death|shipwreck/i],
  conflict: [/tyrant|democracy|flattery/i, /war|conflict|enemy|choice|versus/i],
  mystery: [/myth|illusion|destiny/i, /warning|truth|secret|choice|hidden/i],
};

function evidenceFor(angle) {
  const match = (EVIDENCE_PATTERNS[angle] || []).map((pattern) => chapterLabels.find((label) => pattern.test(label))).find(Boolean);
  return match
    || chapterLabels[0]
    || description.split(/[.!?]/)[0]
    || title;
}

function hookFromEvidence(angle, fallback) {
  const evidence = evidenceFor(angle)
    .replace(/\b(book|chapter)\s*\d+\b/gi, "")
    .replace(/[–—:;,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const kept = evidence.split(" ").filter(Boolean).slice(0, 5);
  while (kept.length && /^(the|a|an|and|&|of|to|in)$/i.test(kept[kept.length - 1])) kept.pop();
  const candidate = kept.join(" ").toUpperCase();
  return candidate.split(" ").length >= 2 ? candidate : fallback;
}
const mostVisualChapter = chapterLabels.find(
  (l) => /cave|allegory|shadow|war|death|fire|ship|city|fall|trap|beast/i.test(l),
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
    "WHO SHOULD RULE?",
    "WHO CONTROLS IT?",
    author ? `WHY ${author.split(" ").pop().toUpperCase()} WAS RIGHT` : "POWER CORRUPTS",
    `THE WRONG ${genre === "politics" || genre === "philosophy" ? "RULER" : "LEADER"}`,
    iconicMotif ? `THE ${iconicMotif.toUpperCase().slice(0, 12)} WINS` : "THEY LIED TO US",
  ];
  const hook = hookFromEvidence("power", hooks[0]);

  // Specific visual subject
  const placeDesc = place
    ? `${place.set === "shipDeck" ? "a ship of state" : place.set} setting`
    : "an ancient seat of power";
  const visualSubject = char
    ? `${charDesc(char)} standing in the foreground, facing a monumental ${iconicMotif || placeDesc} behind them, low camera angle emphasizing authority and scale, the crowd or opposing force barely visible at the edges`
    : `A towering authority figure facing a city or institution, low angle, symbolic of power over the many`;

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
    secondMotif ? `${secondMotif.toUpperCase().replace(/([A-Z])/g, " $1").trim().toUpperCase().slice(0, 16)}` : "3 PARTS ONE SELF",
    "YOU'RE NOT FREE",
  ];
  const hook = hookFromEvidence("soul", hooks[0]);

  // Try to use tripartite / soul-specific motifs
  const soulMotif = topObjects.find((o) =>
    /soul|mind|psyche|tripartite|spirit|appetite/i.test(o.concept),
  );
  const motifDesc = soulMotif
    ? `the ${soulMotif.concept.replace(/([A-Z])/g, " $1").trim().toLowerCase()} concept visualized as a fragmented interior landscape`
    : "the protagonist's internal psychological conflict";

  const visualSubject = char
    ? `${charDesc(char)}, tight medium framing, their silhouette or form divided by split Rembrandt lighting, ${motifDesc} visible as an abstract overlay or background — reason on one side, appetite on the other`
    : `A human figure whose body or shadow contains a divided world: order and chaos, reason and appetite, light and dark, split with precise cinematic lighting`;

  return buildConcept("soul", hook, visualSubject, arch.defaultLayout, arch, 1);
}

function makeSceneConcept() {
  const arch = ARCHETYPES.scene;

  // Find the most iconic scene from bible places + objects
  const cavePlace = Object.values(bible?.places || {}).find((p) => /cave/i.test(p.set));

  let hook = arch.hookTemplates[0] || "THE TURNING POINT";
  let visualSubject;

  if (cavePlace) {
    // Cave allegory is an iconic scene for philosophy/classics
    hook = "YOU'RE SEEING SHADOWS";
    visualSubject = `Inside a dark cave, ${era ? `set in ${era}, ` : ""}prisoners chained facing a stone wall, their shadows cast by a distant fire visible at the mouth of the cave, a single figure turning toward the blinding light outside — dramatic volumetric light rays piercing the darkness, ancient stone textures, cinematic wide establishing shot`;
  } else if (mostVisualChapter) {
    // Derive hook & visual from the most visual chapter
    const chWords = mostVisualChapter.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
    hook = chWords.length <= 18 ? chWords : (arch.hookTemplates[0] || "THE TURNING POINT");
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
  const CONFLICT_MOTIF_PRIORITY = /tyrant|regime|democracy|beast|despot|empire|crowd|enemy|war|greed|market|fear|rival/i;
  const conflictMotif =
    topObjects.find((o) => CONFLICT_MOTIF_PRIORITY.test(o.concept)) ||
    topObjects[2] ||
    null;

  let hooks;
  if (conflictMotif) {
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
    visualSubject = `${charDesc(protagonist)} on the left in warm golden light facing ${charDesc(foil)} on the right in cool shadow — two opposing philosophies, the tension between them visible in the ${era ? era + " " : ""}environment`;
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
    /soul|city|mind|state|ship|ring|myth|symbol|shadow|secret|truth|illusion|game/i.test(o.concept),
  ) || topObjects[0] || null;

  let hooks;
  if (metaphorMotif) {
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
function buildConcept(angle, hook, visualSubject, layout, arch, idx) {
  const motifMatch = topObjects[idx < topObjects.length ? idx : 0];
  const fluxPrompt = buildFluxPrompt(
    {
      angle,
      layout,
      visualSubject,
      lighting: arch.defaultLighting,
      camera: arch.defaultCamera,
      defaultLighting: arch.defaultLighting,
      defaultCamera: arch.defaultCamera,
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
  console.log(`   [${c.conceptId}] ${c.hook.padEnd(28)} layout: ${c.layout}${c._needsEditorialRefine ? "  ⚠ editorial refine" : ""}`);
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
