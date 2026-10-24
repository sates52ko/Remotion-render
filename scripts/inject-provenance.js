#!/usr/bin/env node
/**
 * Generic Provenance Injection (P1.2)
 *
 * Injects narrativeAtom, visualIntent, and visualContract provenance layers
 * into every scene of a book's config.antidote.json, using the story bible
 * as the source of truth.
 *
 * Usage: node scripts/inject-provenance.js --slug=<slug> [--dry-run]
 *
 * This is a generic tool — no book-specific logic.
 */

const fs = require("fs");
const path = require("path");
// P7 commit 2: persistence of the MEANINGFUL visual intent. The shell alone
// (bookId/worldId/narrativeSubject/…) is not an intent — the derived semantic
// content (archetype/requiredActions/semanticGrammar/provenance) is merged in
// additively; authored fields always win.
const { deriveVisualIntent } = require("../src/semantic/visualIntent.ts");
const { buildPersistedVisualIntent } = require("./lib/visual-intent-persist");

/**
 * P1.4 PHASE C — merge-only strategy-requirement transport.
 *
 * When a scene carries a `_visualStrategy.requirement` (written at plan time by
 * plan-antidote), it is copied INTO the scene's VisualContract.visualEvidence as
 * the additive `representation` key so the firewall can enforce evidence ⇄ real
 * scene. MERGE-ONLY by design: subjects/relations/states/characterIntent are
 * never read, let alone rewritten — this function only ever adds or replaces the
 * `representation` key (asserted byte-for-byte in scripts/test-strategy-enforcement.js).
 * The firewall never reads `_visualStrategy` itself; the evidence is the transport.
 */
function copyStrategyRequirement(scene, evidence) {
  const req = scene && scene._visualStrategy && scene._visualStrategy.requirement;
  if (req) evidence = { ...evidence, representation: JSON.parse(JSON.stringify(req)) };
  const res = scene && scene._visualStrategy && scene._visualStrategy.resolution;
  if (res && res.kind && res.kind !== "none") {
    evidence = {
      ...evidence,
      strategyResolution: {
        kind: res.kind,
        repairs: res.repairs || [],
        invalidActions: res.invalidActions || [],
        note: res.note || null,
      },
      // PHASE D proof carried from the planner: `_authorship.src` (the authorship
      // provenance) — the firewall re-derives `authored` from the SCENE, and the
      // equality of the two is asserted in scripts/test-action-lifecycle.js.
      resolutionProof: { authored: scene && scene._authorship ? scene._authorship.src : null },
    };
  }
  return evidence;
}

module.exports = { copyStrategyRequirement };

// Everything below is the CLI run; importing this file as a module (the
// integration tests do) must not execute it.
if (require.main === module) {
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const slug = args.slug;
if (!slug) {
  console.error("Usage: node scripts/inject-provenance.js --slug=<slug> [--dry-run] [--force] [--update-derived]");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const bookDir = path.join(ROOT, "books", slug);
const configPath = path.join(bookDir, "config.antidote.json");
const biblePath = path.join(bookDir, "story-bible.json");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const bible = JSON.parse(fs.readFileSync(biblePath, "utf8"));

const prov = bible.visualProvenance;
if (!prov) {
  console.error(`ERROR: ${slug} story bible has no visualProvenance`);
  process.exit(1);
}

// ── P2.0b: sentinel-only derived-field repair ────────────────────────────────
// The original injection read fields that do not exist on any book config
// (`scene.narration`, `scene.chapter`, `scene.act`), so narrativeRelation
// collapsed to a constant sentinel and sourceChapter to "unknown".
// --update-derived rewrites ONLY fields that still hold those sentinels;
// anything already carrying real derived data is left untouched, and the
// `allowed*` provenance lists are never modified.
const RELATION_SENTINEL = "philosophical discourse";
const CHAPTER_SENTINEL = "unknown";
const LAYERS = ["narrativeAtom", "visualIntent", "visualContract"];

if (args["update-derived"]) {
  const stats = {
    relationRewritten: 0, chapterRewritten: 0, evidenceRelationsRewritten: 0,
    scenesTouched: 0, scenesUntouched: 0, fieldsPreserved: 0,
    before: { relations: {}, chapters: {} }, after: { relations: {}, chapters: {} },
    allowedArraysModified: 0,
  };

  for (const scene of config.scenes || []) {
    // Correct sources: books store narration in `_narration` and act in `_act`.
    const narrationText = scene._narration || scene.narration || scene.text || scene.claim || "";
    const derivedRelation = narrationText.slice(0, 80).trim() || RELATION_SENTINEL;
    const derivedChapter = scene.chapter || scene.act || scene._act || CHAPTER_SENTINEL;

    let touched = false;
    for (const name of LAYERS) {
      const layer = scene[name];
      if (!layer || typeof layer !== "object") continue;

      if (layer.narrativeRelation === RELATION_SENTINEL) {
        stats.before.relations[layer.narrativeRelation] = (stats.before.relations[layer.narrativeRelation] || 0) + 1;
        if (derivedRelation !== RELATION_SENTINEL) {
          layer.narrativeRelation = derivedRelation;
          stats.relationRewritten++;
          touched = true;
        }
      } else if (typeof layer.narrativeRelation === "string") {
        stats.fieldsPreserved++; // real data already present — do not touch
      }
      stats.after.relations[layer.narrativeRelation] = (stats.after.relations[layer.narrativeRelation] || 0) + 1;

      if (layer.sourceChapter === CHAPTER_SENTINEL) {
        stats.before.chapters[layer.sourceChapter] = (stats.before.chapters[layer.sourceChapter] || 0) + 1;
        if (derivedChapter !== CHAPTER_SENTINEL) {
          layer.sourceChapter = derivedChapter;
          stats.chapterRewritten++;
          touched = true;
        }
      } else if (typeof layer.sourceChapter === "string") {
        stats.fieldsPreserved++;
      }
      stats.after.chapters[layer.sourceChapter] = (stats.after.chapters[layer.sourceChapter] || 0) + 1;

      // visualEvidence must stay consistent with the relation it mirrors,
      // otherwise the P1.1 RELATION_MISMATCH check would fire on healthy books.
      const evidence = layer.visualEvidence;
      if (Array.isArray(evidence?.relations) && evidence.relations.includes(RELATION_SENTINEL) && derivedRelation !== RELATION_SENTINEL) {
        evidence.relations = evidence.relations.map((r) => (r === RELATION_SENTINEL ? derivedRelation : r));
        stats.evidenceRelationsRewritten++;
        touched = true;
      }
    }

    if (touched) stats.scenesTouched++;
    else stats.scenesUntouched++;
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`${slug} --update-derived: ${stats.scenesTouched} scenes touched, ${stats.scenesUntouched} untouched`);
  console.log(`  narrativeRelation rewritten: ${stats.relationRewritten}, preserved (already real): ${stats.fieldsPreserved}`);
  console.log(`  sourceChapter rewritten: ${stats.chapterRewritten}`);
  console.log(`  visualEvidence.relations rewritten: ${stats.evidenceRelationsRewritten}`);
  console.log(`  distinct relation after: ${Object.keys(stats.after.relations).length}, distinct chapter after: ${Object.keys(stats.after.chapters).length}`);
  console.log(`  allowed* arrays modified: ${stats.allowedArraysModified} (never touched by design)`);
  console.log(`Written → ${path.relative(ROOT, configPath)}`);
  process.exit(0);
}

const scenes = config.scenes || [];
let injected = 0;
let skipped = 0;

for (const scene of scenes) {
  // Ensure every character in scene has explicit identity
  for (const c of scene.characters || []) {
    if (!c.identity) c.identity = c.role || "narrator";
  }

  // Skip scenes that already have full provenance unless --force is given
  if (!args.force && scene.narrativeAtom && scene.visualIntent && scene.visualContract) {
    skipped++;
    continue;
  }

  // Extract narrative subject from scene data. Books store narration in
  // `_narration` and the act in `_act`; the other names are legacy fallbacks.
  const narrationText = scene._narration || scene.narration || scene.text || scene.claim || "";
  const characters = (scene.characters || []).map(c => c.identity || c.role).filter(Boolean);
  const motifs = (scene.props || []).map(p => p.type).filter(Boolean);
  const location = scene.bg?.set || prov.allowedLocations[0] || "manuscript";

  // Derive a basic narrative subject from the scene
  const subject = characters[0] || motifs[0] || "the argument";
  const relation = narrationText.slice(0, 80).trim() || "philosophical discourse";
  const state = scene.mood || "reflective";

  // Build provenance layers
  const provenanceBase = {
    bookId: prov.bookId,
    worldId: prov.worldId,
    sourceChapter: scene.chapter || scene.act || scene._act || "unknown",
    narrativeSubject: subject,
    narrativeRelation: relation,
    narrativeState: state,
    allowedMotifs: prov.allowedMotifs,
    forbiddenMotifs: prov.forbiddenMotifs,
    allowedCharacters: prov.allowedCharacters,
    allowedLocations: prov.allowedLocations,
    allowedProps: prov.allowedProps,
  };

  if (!scene.narrativeAtom || args.force) {
    scene.narrativeAtom = { ...provenanceBase };
  }
  if (!scene.visualIntent || args.force) {
    // P7 commit 2: persist the MEANINGFUL intent — the provenance shell stays
    // verbatim; archetype/domain/requiredActions/semanticGrammar/provenance are
    // merged in from the same deterministic derivation the audit gate uses.
    const derivedAtom = {
      text: narrationText,
      subject: subject,
      action: null,
      object: null,
      relationship: null,
      concepts: [],
      abstraction: "conceptual",
      visualNeed: narrationText,
    };
    const { intent: persistedIntent } = buildPersistedVisualIntent({
      // A fresh scene gets the provenance shell the firewall requires
      // (REQUIRED_PROVENANCE runs on every layer); an existing one keeps its own.
      shell: scene.visualIntent && typeof scene.visualIntent === "object" ? scene.visualIntent : { ...provenanceBase },
      derived: deriveVisualIntent(derivedAtom),
      narration: narrationText,
      source: "inject-provenance",
    });
    scene.visualIntent = persistedIntent;
  }
  if (!scene.visualContract || args.force) {
    scene.visualContract = {
      ...provenanceBase,
      visualEvidence: copyStrategyRequirement(scene, {
        subjects: [subject],
        relations: [relation],
        states: [state],
      }),
      characterIntent: characters.map(id => ({
        identity: id,
        role: id,
        action: "talk",
        gaze: "center",
        state: "neutral",
      })),
    };
  }

  injected++;
}

console.log(`${slug}: ${injected} scenes injected, ${skipped} already had provenance (${scenes.length} total)`);

if (!args["dry-run"]) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Written → ${path.relative(ROOT, configPath)}`);
} else {
  console.log("(dry-run, no file written)");
}
}
