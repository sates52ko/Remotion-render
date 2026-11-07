#!/usr/bin/env node
/**
 * p8-replan.mjs — P8 Aşama 1: production semantic re-plan at FROZEN boundaries.
 *
 * Runs the production semantic chain — the SAME codes plan-antidote runs at
 * plan time (director-adapter floors, diagram-label + split-copy wiring,
 * _semanticAdapter stamp, meaningful visualIntent persistence) — over the
 * EXISTING config.antidote.json at the EXISTING scene boundaries.
 *
 * Boundaries are frozen on purpose (measured in the P8 dry-runs):
 *   • The full planner re-segments (paradox-of-choice 306 vs 304 scenes,
 *     ready-player-one/miracle ±1 caption) and its art validator then refuses
 *     the authored art files on sub-word caption shifts — a full re-plan
 *     LOSES the authored art (callouts/icons/diagrams).
 *   • Every lever below is the planner's own code, called the same way, on
 *     the same narration source the gate audits (captions window over
 *     scene.fromFrame). No LLM/Vision, fully deterministic.
 *   • Authored scenes are never restyled: the P7-5 merge applies ONLY the
 *     missing semantic obligation lever (semanticGrammar kind) — styling,
 *     framing, copy and props untouched (commit-5 merge contract).
 *
 * Usage: node scripts/p8-replan.mjs --books=<slug,slug,...> [--dry-run]
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { extractNarrativeAtomSync } = require("../src/semantic/narrativeAtom.ts");
const { deriveVisualIntent } = require("../src/semantic/visualIntent.ts");
const adapter = require("./lib/director-adapter.js");
const { buildPersistedVisualIntent, meaningfulVisualIntent } = require("./lib/visual-intent-persist.js");
const { readManifest } = require("./lib/paths.js");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const root = process.cwd();
const BOOKS = String(args.books || "").split(",").filter(Boolean);
const DRY = !!args["dry-run"];
if (!BOOKS.length) {
  console.error("Usage: node scripts/p8-replan.mjs --books=<slug,slug,...> [--dry-run]");
  process.exit(1);
}
const FPS = 30;
const RELATIONAL = new Set(["contrast", "allegory_equivalence", "cause_effect", "transformation", "character_psychology"]);
const GRAMMAR = {
  contrast: "comparison",
  allegory_equivalence: "two_domain_comparison",
  cause_effect: "cause_effect_flow",
  transformation: "cause_effect_flow",
  character_psychology: "internal_tension",
};
const COMPARATIVE_SHOTS = new Set(["split", "twoShot", "beforeAfter"]);

// plan-antidote :260 — the same palette the split-copy wiring reads.
function paletteFor(slug) {
  try {
    const m = readManifest(slug) || {};
    if (m && m.palette && m.palette.paper) return m.palette;
  } catch { /* default below */ }
  return { paper: "#EAE7DE", ink: "#1E1E22", red: "#D9603C", gold: "#C99A48" };
}

// plan-antidote :293 — role→cast-key resolution against the book's cast bible.
function roleIndex(cast) {
  const byRole = {};
  for (const [key, member] of Object.entries(cast || {})) {
    const r = (member && member.role) || key;
    if (!byRole[r]) byRole[r] = key;
  }
  return (role) => byRole[role] || (cast && cast[role] ? role : byRole.narrator || Object.keys(cast || {})[0] || role);
}

// p3-visionless-gate :82 — the gate's own narration source.
function narrationFor(config, scene) {
  const captions = Array.isArray(config.captions) ? config.captions : [];
  if (captions.length && Number.isFinite(scene.fromFrame)) {
    const said = captions
      .filter((c) => c.endFrame > scene.fromFrame && c.startFrame < scene.fromFrame + (scene.durationFrames || 0))
      .map((c) => c.text).join(" ");
    if (said) return said;
  }
  return String(scene._narration || scene.subtitle || scene.text || "");
}

// p3-visionless-gate :94-116 — the T3 metric, reproduced exactly.
function isValidDiagram(d) {
  const TYPES = new Set(["sorter", "matchWave", "flow", "spectrum", "matrix", "tree", "funnel"]);
  if (!d || !TYPES.has(d.type)) return false;
  const labels = Array.isArray(d.labels) ? d.labels : [];
  return d.type === "matchWave" ? labels.length >= 1 : labels.length >= 2;
}

function coverageFor(scene, archetype) {
  const grammar = scene.semanticGrammar && scene.semanticGrammar.kind;
  const expected = GRAMMAR[archetype];
  const shot = scene.shot || "";
  const castCount = (scene.characters || []).length;
  if (grammar === expected) return { covered: true, how: "semanticGrammar" };
  if (scene.diagram && isValidDiagram(scene.diagram)) {
    if (expected === "cause_effect_flow" && scene.diagram.type === "flow") return { covered: true, how: "diagram" };
    if (expected === "two_domain_comparison" && ["sorter", "spectrum", "matchWave"].includes(scene.diagram.type)) return { covered: true, how: "diagram" };
    if (expected === "internal_tension" && scene.diagram.type === "spectrum") return { covered: true, how: "diagram" };
    if (expected === "comparison") return { covered: true, how: "diagram" };
  }
  if (expected === "comparison" && COMPARATIVE_SHOTS.has(shot) && castCount >= 2) return { covered: true, how: "comparative-shot" };
  const actionful = (scene.characters || []).some((c) => c.action && !["idle", "talk"].includes(c.action));
  if (!RELATIONAL.has(archetype)) {
    if (actionful) return { covered: true, how: "non-idle-action" };
    if (isValidDiagram(scene.diagram) || (Array.isArray(scene.texts) && scene.texts.length)) return { covered: true, how: "payload" };
  }
  return { covered: false, how: null };
}

const stats = {
  generatedAt: new Date().toISOString(),
  dryRun: DRY,
  books: [], scenes: 0,
  decisions: {},
  floorsApplied: 0, mergesAuthored: 0, diagramsLabeled: 0, splitCopies: 0,
  shotsChanged: 0, castsChanged: 0, diagramsCreated: 0,
  intentsUpgraded: 0, intentsAlreadyMeaningful: 0, scenesChanged: 0,
  perBook: {},
};

for (const slug of BOOKS) {
  const configPath = path.join(root, "books", slug, "config.antidote.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const meta = config.meta || {};
  const PAL = paletteFor(slug);
  const castKeyFor = roleIndex(meta.cast);
  const scenes = config.scenes || [];
  const book = {
    slug, scenes: scenes.length,
    before: { relational: 0, covered: 0, meaningful: 0 },
    after: { relational: 0, covered: 0, meaningful: 0 },
    floors: 0, merges: 0, intents: 0, changed: 0,
    changedSceneKinds: {},
  };
  stats.books.push(book);
  stats.scenes += scenes.length;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const narration = narrationFor(config, scene);
    const atom = extractNarrativeAtomSync(narration, { bookTitle: meta.title || "", author: meta.author || "" });
    const intent = deriveVisualIntent(atom);
    const archetype = intent.archetype;

    if (RELATIONAL.has(archetype)) {
      book.before.relational++;
      if (coverageFor(scene, archetype).covered) book.before.covered++;
    }
    if (meaningfulVisualIntent(scene.visualIntent)) book.before.meaningful++;

    const authoredDiagram = !!(scene.diagram && scene.diagram.authored);
    const authoredComposition = !!(scene._authorship && scene._authorship.src && scene._authorship.src !== "none");

    // The adapter reads the scene EXACTLY like the gate/benchmark direction view.
    const direction = {
      shot: scene.shot,
      cast: { count: (scene.characters || []).length, roles: (scene.characters || []).map((c) => c.role || c.identity || "extra") },
      props: scene.props || [],
      ...(scene.diagram ? { diagram: scene.diagram } : {}),
      ...(scene.semanticGrammar ? { semanticGrammar: scene.semanticGrammar } : {}),
    };
    const result = adapter.buildDirectorOverrides({ intent, atom, direction, authoredDiagram, authoredComposition });
    const payload = result.semanticPayload;
    const decisionKey = result.nullFloorReason || (result.override ? `floor:${result.reason}` : result.reason);
    stats.decisions[decisionKey] = (stats.decisions[decisionKey] || 0) + 1;

    const snapshot = JSON.stringify({
      shot: scene.shot, characters: scene.characters, props: scene.props,
      diagram: scene.diagram, texts: scene.texts, semanticGrammar: scene.semanticGrammar,
    });
    const kinds = [];
    // Rollback support: before the first mutation of a scene, record the exact
    // pre-state of every key this tool may touch, and stash the plan-time
    // _semanticAdapter stamp (the re-run must never overwrite the stash with
    // its own stamp — the stash IS the rollback target).
    if (!scene._p8Floor) {
      scene._p8Floor = {
        keys: ["shot", "characters", "props", "diagram", "texts", "semanticGrammar"],
        snapshot: JSON.parse(snapshot),
      };
    }
    if (scene._p8Adapter === undefined && (!scene._semanticAdapter || scene._semanticAdapter.replannedAt !== "p8-replan")) {
      scene._p8Adapter = scene._semanticAdapter || null;
    }

    if (result.override && payload) {
      // Non-authored floor — the planner's own assembly order:
      //   applyDirectorOverrides → diagram branch (if a diagram survives) →
      //   split box copy (comparison/equivalence) → characters from d.cast.
      const d = adapter.applyDirectorOverrides(direction, result);
      kinds.push("floor");
      stats.floorsApplied++;
      book.floors++;

      const diagramNow = d.diagram || null; // override.diagram (flow/tension floors) replaces; else the scene's own
      if (diagramNow) {
        // plan-antidote :703-714 (diagram branch) — the diagram IS the frame.
        if (!scene.diagram || JSON.stringify(scene.diagram) !== JSON.stringify(diagramNow)) {
          kinds.push("diagram");
          stats.diagramsCreated++;
        }
        const payloadLabels = payload.kind === "flow_labels"
          ? [payload.triggerLabel, payload.consequenceLabel]
          : payload.kind === "internal_tension_labels"
            ? [payload.internalPoleA, payload.internalPoleB]
            : null;
        if (payloadLabels && payloadLabels[0] && payloadLabels[1] && payloadLabels[0] !== payloadLabels[1]) {
          diagramNow.labels = payloadLabels;
        }
        scene.diagram = diagramNow;
        scene.shot = "insert";
        scene.characters = [];
        scene.props = [];
        if (scene.concept) scene.concept = null;
        scene.texts = [];
      } else if (payload.kind === "comparison_labels" || payload.kind === "two_domain_labels") {
        // plan-antidote :716-722 — split box copy, appended to existing copy.
        const left = payload.leftLabel || payload.sourceLabel;
        const right = payload.rightLabel || payload.targetLabel;
        if (left && right) {
          scene.texts = [
            ...(scene.texts || []),
            { text: left, style: "box", color: PAL.ink, boxColor: PAL.paper, enter: "left", at: 6, x: 470, y: 250, size: 48 },
            { text: right, style: "box", color: PAL.paper, boxColor: PAL.red, enter: "right", at: 6, x: 1450, y: 250, size: 48 },
          ];
          kinds.push("split-copy");
          stats.splitCopies++;
        }
      }

      if (!diagramNow) {
        // comparisonOverride shape: split + 2 cast (planner :777 action rules).
        if (d.shot && d.shot !== scene.shot) { scene.shot = d.shot; kinds.push("shot"); stats.shotsChanged++; }
        if (d.cast) {
          const old = scene.characters || [];
          const roles = (d.cast.roles || []).map((r) => castKeyFor(r));
          const want = d.cast.count || 0;
          while (old.length < want) {
            const ci = old.length;
            old.push({
              id: `${scene.id}-c${ci}`, rig: "everyman", identity: roles[ci] || "extra", role: roles[ci] || "extra",
              expression: "neutral",
              enter: scene.shot === "split" || scene.shot === "twoShot" ? (ci === 0 ? "left" : "right") : "fade",
              action: ci === 0 ? "talk" : (d.cast.secondaryAction || "idle"),
            });
            kinds.push("cast+");
          }
          while (old.length > want) { old.pop(); kinds.push("cast-"); }
          old.forEach((c, ci) => {
            c.role = roles[ci] || c.role;
            c.identity = c.identity || c.role;
            if (ci > 0 && d.cast.secondaryAction) {
              const a = adapter.sanitizeAction(d.cast.secondaryAction, (result.provenance && result.provenance.forbiddenTropes) || []);
              if (c.action !== a) { c.action = a; kinds.push("action"); }
            }
            // lookAtFor (planner :747): split/twoShot → both figures face each other.
            if (scene.shot === "split" || scene.shot === "twoShot") c.lookAt = "partner";
          });
          if (JSON.stringify(scene.characters) !== JSON.stringify(old)) stats.castsChanged++;
          scene.characters = old;
        }
        if (Array.isArray(d.props) && JSON.stringify(d.props) !== JSON.stringify(scene.props)) {
          scene.props = d.props; // forbidden-trope filter applied by the adapter
          kinds.push("props");
        }
      }
      if (d.semanticGrammar && JSON.stringify(d.semanticGrammar) !== JSON.stringify(scene.semanticGrammar)) {
        scene.semanticGrammar = d.semanticGrammar;
        kinds.push("grammar");
      }
    } else if (scene.diagram && !authoredDiagram && payload
      && (payload.kind === "flow_labels" || payload.kind === "internal_tension_labels")) {
      // plan-antidote :704-711 — a surviving non-authored director diagram gets
      // the atom-derived labels even without a floor override.
      const labels = payload.kind === "flow_labels"
        ? [payload.triggerLabel, payload.consequenceLabel]
        : [payload.internalPoleA, payload.internalPoleB];
      if (labels[0] && labels[1] && labels[0] !== labels[1]
        && JSON.stringify(scene.diagram.labels) !== JSON.stringify(labels)) {
        scene.diagram.labels = labels;
        kinds.push("diagram-labels");
        stats.diagramsLabeled++;
      }
    } else if (result.mergeObligation && payload) {
      // P7-5 authored merge: ONLY the missing semantic-obligation lever lands;
      // styling, framing, copy and props stay authored (commit-5 contract).
      const kind = GRAMMAR[archetype];
      if (kind && (!scene.semanticGrammar || scene.semanticGrammar.kind !== kind)) {
        scene.semanticGrammar = { kind };
        kinds.push("authored-merge");
        stats.mergesAuthored++;
        book.merges++;
      }
    }

    // P7 commit-2 writer: the meaningful persisted intent (additive merge).
    const { intent: persisted, added } = buildPersistedVisualIntent({
      shell: scene.visualIntent && typeof scene.visualIntent === "object" ? scene.visualIntent : undefined,
      derived: intent,
      narration,
      source: "p8-replan",
    });
    scene.visualIntent = persisted;
    if (added) { stats.intentsUpgraded++; book.intents++; kinds.push("intent"); }
    else if (meaningfulVisualIntent(scene.visualIntent)) stats.intentsAlreadyMeaningful++;

    // The planner's own audit stamp (plan-antidote :976-986); the plan-time
    // original is stashed in _p8Adapter for the rollback artifact.
    scene._semanticAdapter = {
      archetype: result.archetype,
      requiredActions: result.requiredActions,
      reason: result.reason,
      applied: !!result.override,
      nullFloorReason: result.nullFloorReason || null,
      authorshipSatisfies: !!result.authorshipSatisfies,
      semanticObligation: result.semanticObligation,
      provenance: result.provenance,
      grammar: scene.semanticGrammar || null,
      payload: result.override ? payload : null,
      replannedAt: "p8-replan",
    };

    const afterSnapshot = JSON.stringify({
      shot: scene.shot, characters: scene.characters, props: scene.props,
      diagram: scene.diagram, texts: scene.texts, semanticGrammar: scene.semanticGrammar,
    });
    // A scene back at its recorded pre-state needs no rollback record.
    if (scene._p8Floor && afterSnapshot === JSON.stringify(scene._p8Floor.snapshot)) delete scene._p8Floor;
    if (afterSnapshot !== snapshot) {
      stats.scenesChanged++;
      book.changed++;
      for (const k of kinds) book.changedSceneKinds[k] = (book.changedSceneKinds[k] || 0) + 1;
    }

    if (RELATIONAL.has(archetype)) {
      book.after.relational++;
      if (coverageFor(scene, archetype).covered) book.after.covered++;
    }
    if (meaningfulVisualIntent(scene.visualIntent)) book.after.meaningful++;
  }

  if (!DRY) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  }
  console.log(`${slug}: ${scenes.length} scenes — floors ${book.floors}, authored merges ${book.merges}, intents ${book.intents}, changed ${book.changed} (relational covered ${book.before.covered}/${book.before.relational} → ${book.after.covered}/${book.after.relational}, meaningful ${book.before.meaningful} → ${book.after.meaningful})${DRY ? " [DRY]" : ""}`);
}

const outDir = path.join(root, "audit", "visionless-10x");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "p8-replan-report.json"), JSON.stringify(stats, null, 2));
console.log(`→ audit/visionless-10x/p8-replan-report.json (${stats.scenesChanged} scenes changed)${DRY ? " [DRY — configs NOT written]" : ""}`);
