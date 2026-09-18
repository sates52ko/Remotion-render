#!/usr/bin/env node
/**
 * apply-semantic-arcs.js — Apply Semantic Alignment & Three-Layer Rules to Antidote Config
 *
 * Enriches config.antidote.json with:
 *   - visualJob (narrative purpose from macro sequence arc)
 *   - visualArc (intra-scene state progression)
 *   - attention (high-level choreography milestones)
 *   - complementary text punches (eliminating parrot echo)
 *
 * Usage:
 *   node scripts/apply-semantic-arcs.js --slug=<slug> [--dry]
 */

const fs = require("fs");
const path = require("path");
const { abs } = require("./lib/paths");
const { directSemanticBeat } = require("./lib/antidote-semantic-director");
const { directNarrativeFlow } = require("./lib/antidote-narrative-rules");
const { mitigateStagnation } = require("./lib/antidote-stagnation-engine");
const { planPromiseLifecycles } = require("./lib/antidote-promise-engine");
const { planChapterArcs } = require("./lib/antidote-chapter-arcs");
const { balanceNoveltyBudget } = require("./lib/antidote-novelty-budget");
const { directAudioEvents } = require("./lib/antidote-audio-director");
const { enforceSemanticRelevance } = require("./lib/visual-intent");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const SLUG = args.slug;
if (!SLUG) {
  console.error("Usage: node scripts/apply-semantic-arcs.js --slug=<slug> [--dry]");
  process.exit(1);
}

const DRY = !!args.dry;
const configPath = abs.antidoteConfig(SLUG);
if (!fs.existsSync(configPath)) {
  console.error(`Error: Config not found at ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
let scenes = config.scenes || [];

// Load or derive sequence arcs
const seqPath = path.join(path.dirname(configPath), "sequence-arcs.json");
let seqData = { sequences: [] };
let roleMap = new Map();
if (fs.existsSync(seqPath)) {
  seqData = JSON.parse(fs.readFileSync(seqPath, "utf8"));
  for (const seq of seqData.sequences || []) {
    for (const b of seq.beats || []) {
      roleMap.set(b.index, b.role);
    }
  }
}

// 1. Story Director Layer: Assign narrative functions and promise/payoff pairings
const narrativeFlow = directNarrativeFlow(scenes, seqData);

let rewrittenTexts = 0;
let dynamicArcs = 0;

for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  const role = roleMap.get(i) || (i % 4 === 0 ? "setup" : i % 4 === 1 ? "question" : i % 4 === 2 ? "complication" : "reveal");
  const n = narrativeFlow[i] || { function: "EXPLANATION", escalates: false };

  s.narrative = {
    function: n.function,
    ...(n.payoffPromise ? { payoffPromise: n.payoffPromise } : {}),
    ...(n.payoff ? { payoff: n.payoff } : {}),
    escalates: n.escalates,
    conceptual: n.conceptual,
    emotional: n.emotional,
  };

  // 2. Visual Director Layer: Driven directly by the Story Director's function
  const semantic = directSemanticBeat({
    scene: s,
    sequenceRole: role,
    narrativeFunction: n.function,
    index: i,
    totalScenes: scenes.length,
  });

  s.visualJob = semantic.visualJob;
  s.visualArc = semantic.visualArc;
  s.attention = semantic.attention;

  if (s.visualArc && s.visualArc.transformation !== "none") {
    dynamicArcs++;
  }

  // Check if texts were updated
  const oldTextStr = (s.texts || []).map((t) => t.text).join("|");
  const newTextStr = semantic.texts.map((t) => t.text).join("|");
  if (oldTextStr !== newTextStr) {
    rewrittenTexts++;
  }
  s.texts = semantic.texts;
}

// Load chapters from youtube-meta.json if present
let chapters = [];
const metaPath = abs.youtubeMeta(SLUG);
if (fs.existsSync(metaPath)) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    chapters = meta.chapters || [];
  } catch (_) {}
}

const fps = (config.meta && config.meta.fps) || 30;

// 3. Chapter-Level Narrative Arcs (God Mode Phase 6): Structure each chapter as a curiosity cycle
const chapterResult = planChapterArcs(scenes, chapters, fps);
scenes = chapterResult.scenes;

// 4. Promise / Payoff Engine (God Mode Phase 3): Multi-beat curiosity lifecycles
const promiseResult = planPromiseLifecycles(scenes);
config.promises = promiseResult.promises;
scenes = promiseResult.scenes;

// 5. Visual Novelty Budget Engine (God Mode Phase 4): Balance novelty & eliminate droughts
const noveltyResult = balanceNoveltyBudget(scenes, fps);
scenes = noveltyResult.scenes;

// 6. Stagnation Engine (God Mode Phase 2): Auto-mitigate visual repetition
const stagnationResult = mitigateStagnation(scenes);
scenes = stagnationResult.scenes;
config.scenes = scenes;

// 7. Audio Director Layer (God Mode Phase 7): Frame-accurate tactile sound design
const audioResult = directAudioEvents(scenes, fps);
scenes = audioResult.scenes;
config.scenes = scenes;
config.audioEvents = audioResult.audioEvents;

// 8. Cognitive Compression Engine (God Mode Phase 5): Clear focal stage for diagram heroes
for (const s of scenes) {
  if (s.diagram && s.characters && s.characters.length > 0) {
    for (const c of s.characters) {
      if (c.scale > 0.65) {
        c.scale = 0.58;
        c.x = 230;
        c.y = 840;
      }
    }
  }
}

// 9. Semantic Relevance & Conceptual Alignment Engine (Antidote 6.1)
enforceSemanticRelevance(config);
scenes = config.scenes;

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  APPLY SEMANTIC ARCS: ${SLUG}`);
console.log(`══════════════════════════════════════════════════════════════`);
console.log(`  Total Scenes Processed:       ${scenes.length}`);
console.log(`  Semantic Specs Added:         ${scenes.length} (100%)`);
console.log(`  Dynamic Visual Arcs Created:  ${dynamicArcs} (${Math.round(dynamicArcs / scenes.length * 100)}%)`);
console.log(`  Parrot Callouts Rewritten:    ${rewrittenTexts}`);
console.log(`  Chapter Curiosity Cycles:     ${chapterResult.chapterArcs.length}`);
console.log(`  Promise Arcs Planned:         ${promiseResult.promises.length}`);
console.log(`  Novelty Remedies Injected:    ${noveltyResult.remediesApplied.length}`);
console.log(`  Stagnation Remedies Applied:  ${stagnationResult.remediesApplied.length}`);
console.log(`  Final Stagnation Count:       ${stagnationResult.finalStagnationCount}`);

if (DRY) {
  console.log(`\n  [DRY RUN] No changes written to disk.`);
} else {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`\n  ✓ Successfully updated: ${configPath}`);
}
console.log(`══════════════════════════════════════════════════════════════\n`);
