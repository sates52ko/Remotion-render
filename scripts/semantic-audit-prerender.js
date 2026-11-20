#!/usr/bin/env node
/**
 * P1.3 Pre-Render Semantic Audit
 *
 * Evaluates whether each scene's planned visual elements (characters, props,
 * background, texts) semantically match the narration claim — WITHOUT rendering.
 *
 * This is a contract-level audit: it checks if the scene PLAN would produce
 * correct visuals if rendered, by examining the scene data against the
 * VisualContract and story bible provenance.
 *
 * Metrics:
 *   - semantic_visual_coverage: % of scenes where planned visuals match narration
 *   - foreign_world_leakage: scenes using motifs from wrong world
 *   - character_identity_mismatch: named character in narration absent from scene
 *   - generic_fallback_usage: scenes using only generic/default visuals
 *
 * Usage: node scripts/semantic-audit-prerender.js --slug=<slug>
 */

const fs = require("fs");
const path = require("path");
const { extractSemanticVocabulary } = require("./lib/story-bible-schema");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const slug = args.slug;
if (!slug) {
  console.error("Usage: node scripts/semantic-audit-prerender.js --slug=<slug>");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const bookDir = path.join(ROOT, "books", slug);
const config = JSON.parse(fs.readFileSync(path.join(bookDir, "config.antidote.json"), "utf8"));
const bible = JSON.parse(fs.readFileSync(path.join(bookDir, "story-bible.json"), "utf8"));
const vocab = extractSemanticVocabulary(bible);

const scenes = config.scenes || [];
const count = parseInt(args.count || "25", 10);

// Stratified sampling
const step = Math.max(1, Math.floor(scenes.length / count));
const sampleIndices = [];
for (let i = 0; i < count; i++) {
  sampleIndices.push(Math.min(i * step, scenes.length - 1));
}

const results = [];

for (const idx of sampleIndices) {
  const scene = scenes[idx];
  const narration = (scene._narration || scene.narration || scene.narrative?.text || "").toLowerCase();
  const characters = (scene.characters || []);
  const charIds = characters.map(c => (c.identity || c.role || "").toLowerCase());
  const props = (scene.props || []).map(p => p.type).filter(Boolean);
  const location = scene.bg?.set || "unknown";
  const texts = (scene.texts || []).map(t => t.text || "").filter(Boolean);

  const issues = [];
  let semanticMatch = false;
  let foreignWorldLeak = false;
  let characterMismatch = false;
  let genericFallback = false;

  // 1. Check if any character mentioned in narration is on screen
  const mentionedChars = [];
  for (const [name, castKey] of Object.entries(vocab.characterNames)) {
    if (name.length > 2 && narration.includes(name.toLowerCase())) {
      mentionedChars.push({ name, castKey });
    }
  }

  for (const mc of mentionedChars) {
    const onScreen = charIds.includes(mc.castKey.toLowerCase()) || charIds.includes(mc.name.toLowerCase());
    if (!onScreen) {
      characterMismatch = true;
      issues.push(`CHARACTER_ABSENT: '${mc.name}' mentioned in narration but not on screen (have: ${charIds.join(",")})`);
    }
  }

  // 2. Check for foreign world motifs
  for (const prop of props) {
    if (vocab.forbiddenMotifs.has(prop)) {
      foreignWorldLeak = true;
      issues.push(`FOREIGN_MOTIF: '${prop}' is forbidden in ${vocab.worldId}`);
    }
  }

  // 3. Check for generic fallback (no meaningful props/characters)
  const hasSpecificProp = props.some(p => vocab.allowedMotifs.has(p));
  const hasSpecificChar = charIds.some(id => vocab.allowedCharacters.has(id));
  if (!hasSpecificProp && !hasSpecificChar && characters.length <= 1) {
    genericFallback = true;
    issues.push("GENERIC_FALLBACK: scene has no book-specific props or characters");
  }

  // 4. Semantic coverage: does the visual plan address the narration?
  // Check if props/location/characters relate to the narration claim
  const narrationConcepts = [];
  for (const concept of vocab.concepts) {
    if (narration.includes(concept.toLowerCase())) {
      narrationConcepts.push(concept);
    }
  }

  // Check if any narration concept is represented visually
  const visualConcepts = [...props, location, ...charIds];
  const conceptCovered = narrationConcepts.some(nc =>
    visualConcepts.some(vc => vc.toLowerCase().includes(nc.toLowerCase()))
  );

  // Scene is semantically matched if:
  // - No foreign world leaks AND
  // - No character mismatches AND
  // - Either concepts are covered OR characters are present with relevant action
  semanticMatch = !foreignWorldLeak && !characterMismatch && (conceptCovered || (hasSpecificChar && !genericFallback));

  if (!semanticMatch && issues.length === 0) {
    issues.push("SEMANTIC_GAP: narration concepts not represented in visual plan");
  }

  results.push({
    idx,
    sceneId: scene.id,
    narration: (scene._narration || scene.narration || "").slice(0, 120),
    characters: charIds,
    props,
    location,
    semanticMatch,
    foreignWorldLeak,
    characterMismatch,
    genericFallback,
    issues,
  });
}

// Compute metrics
const total = results.length;
const semanticCoverage = results.filter(r => r.semanticMatch).length / total;
const leakageCount = results.filter(r => r.foreignWorldLeak).length;
const charMismatchCount = results.filter(r => r.characterMismatch).length;
const genericCount = results.filter(r => r.genericFallback).length;

console.log(`\n═══ P1.3 Pre-Render Semantic Audit: ${slug} ═══\n`);
console.log(`Sampled: ${total} scenes (stratified from ${scenes.length})\n`);

console.log(`  Semantic Visual Coverage: ${(semanticCoverage * 100).toFixed(1)}% (target: ≥90%)`);
console.log(`  Foreign World Leakage:    ${leakageCount} (target: 0)`);
console.log(`  Character Mismatch:       ${charMismatchCount} (target: 0)`);
console.log(`  Generic Fallback:         ${genericCount}`);

const pass = semanticCoverage >= 0.9 && leakageCount === 0 && charMismatchCount === 0;
console.log(`\n  Verdict: ${pass ? "✅ PASS" : "❌ FAIL"}\n`);

// Show failures
const failures = results.filter(r => !r.semanticMatch);
if (failures.length > 0) {
  console.log(`── Failures (${failures.length}) ──\n`);
  for (const f of failures.slice(0, 15)) {
    console.log(`  [${f.idx}] ${f.sceneId}`);
    console.log(`    Narration: "${f.narration}"`);
    console.log(`    Visual: chars=[${f.characters}] props=[${f.props}] loc=${f.location}`);
    for (const issue of f.issues) console.log(`    → ${issue}`);
    console.log();
  }
  if (failures.length > 15) console.log(`  ... and ${failures.length - 15} more\n`);
}

// Write report
const report = {
  version: "P1.3-prerender",
  slug,
  sampledScenes: total,
  totalScenes: scenes.length,
  metrics: {
    semanticVisualCoverage: Number((semanticCoverage * 100).toFixed(1)),
    foreignWorldLeakage: leakageCount,
    characterIdentityMismatch: charMismatchCount,
    genericFallbackUsage: genericCount,
  },
  verdict: pass ? "PASS" : "FAIL",
  results,
};

const outPath = path.join(bookDir, "semantic-audit-prerender.report.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(`Report → ${path.relative(ROOT, outPath)}`);

process.exit(pass ? 0 : 1);
