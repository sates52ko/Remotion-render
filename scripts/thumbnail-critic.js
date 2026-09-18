#!/usr/bin/env node
/**
 * thumbnail-critic.js — Scores 5 thumbnail concepts + image candidates,
 * selects the winner, and updates youtube-meta.json with the winning brief.
 *
 * Scored across 10 CRITERIA (100% total) using REAL PIXEL INSPECTION:
 *   1. bookSpecificity    (15%) — Story-bible motifs, characters, places
 *   2. conceptClarity     (12%) — Hook + visual angle convey a cohesive message
 *   3. visualQuality      (15%) — Real pixel sharpness, contrast & brightness balance
 *   4. semanticRelevance  (15%) — Narrative conflict, chapters, and core thesis alignment
 *   5. genericityPenalty  (10%) — Penalizes stock tropes ("dramatic man staring into camera")
 *   6. mobileReadability  (10%) — Real pixel contrast & quadrant separation at 320x180 card
 *   7. composition        (8%)  — Layout match + focal placement & framing
 *   8. negativeSpace      (5%)  — Left-side darkness ratio (pixel-verified text safe zone)
 *   9. hookQuality        (5%)  — Hook brevity (<=3 words ideal), punch, cadence
 *  10. titleComplement    (5%)  — Hook is distinct from title (no lazy duplication)
 *
 * Real pixel analysis is executed via scripts/thumbnail-image-critic.py (PIL + numpy).
 *
 * Usage:
 *   node scripts/thumbnail-critic.js --slug=the-republic
 *   node scripts/thumbnail-critic.js --slug=the-republic --dry-run
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  CRITIC_WEIGHTS,
  LAYOUT_RULES,
  genericityScore,
  hookScore,
  layoutMatchScore,
} = require("./lib/thumbnail-concepts");
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
  console.error("Usage: node scripts/thumbnail-critic.js --slug=<slug> [--dry-run]");
  process.exit(1);
}

// ── READ INPUTS ───────────────────────────────────────────────────────────────
const conceptsPath = path.join(ROOT, "books", SLUG, "thumbnail-concepts.json");
const metaPath = path.join(ROOT, "books", SLUG, "youtube-meta.json");

if (!fs.existsSync(conceptsPath)) {
  console.error(`❌ thumbnail-concepts.json not found. Run thumbnail-art-director.js first.`);
  process.exit(1);
}
if (!fs.existsSync(metaPath)) {
  console.error(`❌ youtube-meta.json not found.`);
  process.exit(1);
}

const conceptsDoc = JSON.parse(fs.readFileSync(conceptsPath, "utf8"));
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));

const concepts = conceptsDoc.concepts || [];
const titles = meta.titles || [];
const chapters = meta.chapters || [];
const description = (meta.description || "").toLowerCase();
const channelHistory = loadChannelHistory(ROOT, SLUG);

// ── REAL PIXEL ANALYSIS VIA PYTHON ────────────────────────────────────────────
function runImageCritic(imagePaths) {
  const existing = imagePaths.filter((p) => fs.existsSync(path.join(ROOT, "public", p)));
  if (existing.length === 0) return {};

  const absPaths = existing.map((p) => path.join(ROOT, "public", p));
  const scriptPath = path.join(ROOT, "scripts", "thumbnail-image-critic.py");

  try {
    const cmd = `python "${scriptPath}" ${absPaths.map((p) => `"${p}"`).join(" ")}`;
    const stdout = execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], timeout: 30000 });
    const parsed = JSON.parse(stdout.toString("utf8"));
    const map = {};
    for (const item of parsed) {
      if (item && item.path && item.scores && !item.scores.error) {
        // Map back to relative path
        const rel = path.relative(path.join(ROOT, "public"), item.path).replace(/\\/g, "/");
        map[rel] = item.scores;
        // Also map by direct basename for flexible lookup
        map[path.basename(item.path)] = item.scores;
      }
    }
    return map;
  } catch (e) {
    console.log(`  [info] Image pixel analysis unavailable (${e.message}). Using layout heuristics.`);
    return {};
  }
}

const allImagePaths = concepts.map((c) => c.imagePath).filter(Boolean);
const pixelMetricsMap = runImageCritic(allImagePaths);

// ── SCORER (10 CRITERIA) ──────────────────────────────────────────────────────
function scoreConcept(concept) {
  const scores = {};
  const subj = concept.visualSubject || "";
  const hook = concept.hook || "";
  const imgRel = concept.imagePath || "";
  const pixelScores = pixelMetricsMap[imgRel] || pixelMetricsMap[path.basename(imgRel)] || null;

  // 1. Book specificity (15%) — proper nouns, specific world references, motif bonus
  const properNouns = (subj.match(/\b[A-Z][a-z]{3,}\b/g) || []);
  const uniqueNouns = new Set(properNouns.map((n) => n.toLowerCase())).size;
  const motifBonus = concept.iconicMotif ? 0.25 : 0;
  scores.bookSpecificity = Math.min(1.0, uniqueNouns * 0.18 + motifBonus + (subj.length > 90 ? 0.15 : 0));

  // 2. Concept clarity (12%) — hook + visual angle tell a cohesive story
  const angleKeywords = {
    power: ["rule", "control", "power", "city", "authority", "crowd", "ruler", "leader", "throne"],
    soul: ["soul", "mind", "control", "inner", "divided", "psychological", "conflict", "free"],
    scene: ["turning", "moment", "cave", "shadow", "fire", "ship", "crossroads", "light", "scene"],
    conflict: ["trap", "enemy", "chaos", "order", "fatal", "versus", "choice", "force", "opposing"],
    mystery: ["lie", "truth", "secret", "hidden", "symbolic", "abstract", "metaphor", "matters"],
  };
  const kws = angleKeywords[concept.angle] || [];
  const subjLower = subj.toLowerCase();
  const hookLower = hook.toLowerCase();
  const matchCount = kws.filter((k) => subjLower.includes(k) || hookLower.includes(k)).length;
  scores.conceptClarity = Math.min(1.0, Math.max(0.4, matchCount * 0.35));

  // 3. Visual quality (15%) — REAL PIXELS: sharpness + dynamic range + exposure balance
  if (pixelScores && pixelScores.visualQuality !== undefined) {
    scores.visualQuality = pixelScores.visualQuality;
  } else {
    // Heuristic fallback if image is not yet rendered
    const lighting = (concept.lighting || "").toLowerCase();
    const isDramatic = /rim|chiaroscuro|spotlight|rembrandt|contrast|volumetric/i.test(lighting);
    scores.visualQuality = isDramatic ? 0.75 : 0.50;
  }

  // 4. Semantic relevance (15%) — Alignment with chapters, thesis, and book description
  const chapterText = chapters.map((c) => c.label).join(" ").toLowerCase();
  const motifLower = (concept.iconicMotif || "").toLowerCase();
  let relevanceSignals = 0;
  if (motifLower && (chapterText.includes(motifLower) || description.includes(motifLower))) relevanceSignals += 2;
  const subjWords = subjLower.split(/\s+/).filter((w) => w.length >= 4);
  for (const w of subjWords) {
    if (chapterText.includes(w) || description.includes(w)) relevanceSignals++;
  }
  scores.semanticRelevance = Math.min(1.0, Math.max(0.35, relevanceSignals * 0.15));

  // 5. Genericity penalty (10%) — Penalize generic AI tropes
  scores.genericityPenalty = genericityScore(subj);

  // 6. Mobile readability (10%) — REAL PIXELS: contrast + quadrant separation at 320x180 card
  if (pixelScores && pixelScores.mobileReadability !== undefined) {
    scores.mobileReadability = pixelScores.mobileReadability;
  } else {
    // Layout-based estimate
    scores.mobileReadability = concept.layout === "text-poster" ? 0.90 : 0.65;
  }

  // 7. Composition (8%) — Layout match + subject placement
  const layoutBase = layoutMatchScore(concept.angle, concept.layout);
  let compBonus = 0;
  if (pixelScores && pixelScores.faceProxy !== undefined) {
    // If portrait layout, having clear subject presence in right half is a bonus
    if (concept.layout === "portrait-right" && pixelScores.faceProxy > 0.35) compBonus = 0.15;
  }
  scores.composition = Math.min(1.0, layoutBase + compBonus);

  // 8. Negative space (5%) — REAL PIXELS: left 35% darkness ratio for text overlay
  if (pixelScores && pixelScores.leftDarkness !== undefined) {
    scores.negativeSpace = pixelScores.leftDarkness;
  } else {
    const layoutRule = LAYOUT_RULES[concept.layout] || {};
    scores.negativeSpace =
      layoutRule.textSide === "left" ? 0.90
      : concept.negativeSpace === "left" ? 0.80
      : 0.40;
  }

  // 9. Hook quality (5%) — Brevity (<=3 words ideal), punch, cadence
  scores.hookQuality = hookScore(hook, titles);

  // 10. Title complement (5%) — Hook is distinct from title (creates curiosity gap)
  const titleWords = new Set(
    (meta.title || "").toLowerCase().split(/\s+/).filter((w) => w.length > 3),
  );
  const hookWords = hookLower.split(/\s+/);
  const titleOverlap = hookWords.filter((w) => titleWords.has(w)).length / Math.max(hookWords.length, 1);
  scores.titleComplement = titleOverlap > 0.5 ? 0.1 : titleOverlap > 0.2 ? 0.5 : 1.0;

  // ── WEIGHTED TOTAL (100%) ──
  const total = Object.entries(CRITIC_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + (scores[key] || 0) * weight;
  }, 0);

  const policy = concept.policy || assessHook({
    hook,
    evidence: `${concept.evidence || ""} ${meta.description || ""} ${chapterText}`,
    title: meta.title || "",
    history: channelHistory,
    layout: concept.layout,
    angle: concept.angle,
  });
  return { scores, total: Math.round(total * 100), hasPixelInspection: !!pixelScores, policy };
}

// ── SCORE ALL CONCEPTS ────────────────────────────────────────────────────────
console.log(`\n🎬 Thumbnail Critic (10-Criteria God Mode) — ${conceptsDoc.title || SLUG}`);
const inspectedCount = Object.keys(pixelMetricsMap).length;
if (inspectedCount > 0) {
  console.log(`   👁️  Real pixel inspection active: ${inspectedCount} image(s) analyzed via PIL.`);
} else {
  console.log(`   ℹ️  No rendered candidate images found yet in public/scenes/${SLUG}/. Using layout heuristics.`);
}
console.log(`   Scoring ${concepts.length} concepts across 10 CTR criteria...\n`);

const scored = concepts.map((c) => {
  const result = scoreConcept(c);
  const imgRel = c.imagePath || "";
  const imgExists = fs.existsSync(path.join(ROOT, "public", imgRel));
  // If images exist for some candidates, candidate with missing image is heavily discounted
  let effectiveScore = imgExists ? result.total : Math.round(result.total * (inspectedCount > 0 ? 0.35 : 0.85));
  // Do not let a generic/repeated/unverifiable promise beat a slightly weaker
  // picture. It stays available for an editor, but cannot silently win on CTR.
  if (!result.policy.ok) effectiveScore = Math.round(effectiveScore * 0.55);
  return {
    ...c,
    _score: result.total,
    _effectiveScore: effectiveScore,
    _imageExists: imgExists,
    _hasPixelInspection: result.hasPixelInspection,
    _scoreBreakdown: result.scores,
    policy: result.policy,
    _needsEditorialRefine: !result.policy.ok,
  };
});

// Sort by effective score
scored.sort((a, b) => b._effectiveScore - a._effectiveScore);

// Print scores & 10-criteria breakdown
console.log("📊 Evaluation Matrix:");
for (const c of scored) {
  const imgTag = c._imageExists ? (c._hasPixelInspection ? "✓ PIXEL" : "✓ FILE") : "✗ NONE";
  console.log(
    `   [${c.conceptId}] ${String(c._effectiveScore).padStart(3)}/100  ${c.hook.padEnd(26)} [${imgTag.padEnd(7)}] layout:${c.layout}${c._needsEditorialRefine ? " ⚠ REVIEW" : ""}`,
  );
  for (const [k, w] of Object.entries(CRITIC_WEIGHTS)) {
    const s = c._scoreBreakdown[k] || 0;
    const contribution = Math.round(s * w * 100);
    console.log(
      `            ${k.padEnd(20)} ${String(Math.round(s * 100)).padStart(3)}%  × ${String(Math.round(w * 100)).padStart(2)}w = ${String(contribution).padStart(2)}pts`,
    );
  }
}

// Select winner (highest effective score)
const winner = scored[0];
winner._winner = true;

console.log(`\n🏆 WINNER: [${winner.conceptId}] "${winner.hook}" (score: ${winner._effectiveScore}/100)`);
if (!winner._imageExists) {
  console.log(`   ⚠ Note: winner image not found at public/${winner.imagePath}`);
  console.log(`     gen-thumbnail.py --concepts will render it, or Remotion still will use fallback.`);
}

// ── UPDATE CONCEPTS JSON ──────────────────────────────────────────────────────
const updatedConcepts = scored.map((c) => ({
  ...c,
  _needsCriticScore: false,
}));

const updatedDoc = {
  ...conceptsDoc,
  concepts: updatedConcepts,
  winner: {
    conceptId: winner.conceptId,
    angle: winner.angle,
    hook: winner.hook,
    layout: winner.layout,
    imagePath: winner.imagePath,
    cutPath: winner.cutPath,
    score: winner._effectiveScore,
    scoredAt: new Date().toISOString(),
    evaluationMode: inspectedCount > 0 ? "pixel-inspected" : "heuristic",
    policy: winner.policy,
  },
};

// ── UPDATE YOUTUBE-META.JSON THUMBNAIL BRIEF ──────────────────────────────────
const updatedMeta = {
  ...meta,
  thumbnail: {
    ...meta.thumbnail,
    hook: winner.hook,
    subject: winner.visualSubject,
    layout: winner.layout,
    image: winner.imagePath,
    cut: winner._imageExists ? winner.cutPath : meta.thumbnail?.cut,
    concept: winner.conceptId,
    angle: winner.angle,
    fluxPrompt: winner.fluxPrompt,
    criticScore: winner._effectiveScore,
    _artDirected: true,
    reviewRequired: winner._needsEditorialRefine,
    reviewReasons: winner.policy.reasons,
  },
};

if (DRY_RUN) {
  console.log("\n[dry-run] Would update:", conceptsPath);
  console.log("[dry-run] Would update:", metaPath);
  console.log("\nUpdated thumbnail brief:");
  console.log(JSON.stringify(updatedMeta.thumbnail, null, 2));
} else {
  fs.writeFileSync(conceptsPath, JSON.stringify(updatedDoc, null, 2));
  fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));
  console.log(`\n✅ Updated: ${conceptsPath}`);
  console.log(`✅ Updated: ${metaPath}`);
  console.log(`\n   thumbnail.hook    → "${winner.hook}"`);
  console.log(`   thumbnail.layout  → "${winner.layout}"`);
  console.log(`   thumbnail.image   → "${winner.imagePath}"`);
  console.log(`\n   Preview still: npx remotion still Thumb-${SLUG} out/thumbnail-${SLUG}.png --frame=0`);
}
