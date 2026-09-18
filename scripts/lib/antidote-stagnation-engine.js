/**
 * antidote-stagnation-engine.js — Visual Stagnation Detector & Auto-Mitigation Engine
 *
 * Antidote God Mode — Phase 2:
 * Monitors state progression across consecutive beats.
 * If 3 consecutive beats have identical or near-identical visual fingerprints,
 * flags a STAGNATION violation and applies automated director remedies:
 *   1. CHANGE_CAMERA
 *   2. CHANGE_ACTION
 *   3. INTRODUCE_MOTIF
 *   4. INTRODUCE_DIAGRAM
 *   5. CHANGE_SCALE
 *   6. CHANGE_ENVIRONMENT
 */

// ── FNV-1a 32-bit Hash ───────────────────────────────────────────────────────
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ── Visual State Extractor ──────────────────────────────────────────────────
/**
 * Extracts a normalized 10-dimensional visual state descriptor from a scene:
 *   1. shot
 *   2. camera
 *   3. charCount
 *   4. pose
 *   5. action
 *   6. motif
 *   7. diagram
 *   8. environment
 *   9. scale
 *  10. textMode
 */
function extractVisualState(scene) {
  const shot = scene.shot || "medium";

  // 1. Camera signature
  const zoomFrom = Number(scene.camera?.zoom?.[0] ?? 1);
  const zoomTo = Number(scene.camera?.zoom?.[1] ?? 1);
  const hasZoom = Math.abs(zoomTo - zoomFrom) > 0.03;
  const hasPunch = Boolean(scene.camera?.punch);
  const panX = scene.camera?.panX || [0, 0];
  const panY = scene.camera?.panY || [0, 0];
  const hasPan = (panX[0] !== 0 || panX[1] !== 0 || panY[0] !== 0 || panY[1] !== 0);

  let camera = "static";
  if (hasPunch) {
    camera = "punch";
  } else if (hasZoom && zoomTo > zoomFrom) {
    camera = "zoom_in";
  } else if (hasZoom && zoomTo < zoomFrom) {
    camera = "zoom_out";
  } else if (hasPan) {
    camera = "pan";
  }

  // 2. Character count, pose, action, holds
  const chars = scene.characters || [];
  const charCount = chars.length;
  const c0 = chars[0];
  const pose = c0 ? `${c0.body || "bust"}_${c0.expression || "neutral"}` : "none";
  const action = c0 ? (c0.action || "idle") : "none";
  const holds = c0?.holds || "none";

  // 3. Motif & Diagram
  const motif = scene.props?.[0]?.type || "none";
  const diagram = scene.diagram?.type || "none";

  // 4. Environment (set + texture)
  const envSet = scene.bg?.set || "none";
  const envTexture = scene.bg?.texture || "none";
  const environment = `${envSet}:${envTexture}`;

  // 5. Scale category
  let scale = "medium";
  if (["closeUp"].includes(shot)) {
    scale = "close";
  } else if (["wide", "diorama", "crowd"].includes(shot)) {
    scale = "wide";
  } else if (["insert"].includes(shot)) {
    scale = "object";
  } else if (["chapterCard"].includes(shot)) {
    scale = "card";
  }

  // 6. Text mode
  const textMode = scene.texts?.[0]?.style || "none";

  const canonicalKey = [
    shot,
    camera,
    charCount,
    pose,
    action,
    motif,
    diagram,
    environment,
    scale,
    textMode,
  ].join("|");

  const fingerprint = fnv1a(canonicalKey);

  return {
    shot,
    camera,
    charCount,
    pose,
    action,
    holds,
    motif,
    diagram,
    environment,
    scale,
    textMode,
    canonicalKey,
    fingerprint,
  };
}

// ── Visual Difference Metric ────────────────────────────────────────────────
/**
 * Calculates perceptual distance between two consecutive visual states.
 * Major changes (shot, action, motif, diagram, environment) carry high weights.
 */
function visualDistance(a, b) {
  let dist = 0;
  if (a.shot !== b.shot) dist += 3;
  if (a.diagram !== b.diagram) dist += 3;
  if (a.motif !== b.motif) dist += 2;
  if (a.action !== b.action) dist += 2;
  if (a.environment !== b.environment) dist += 2;
  if (a.scale !== b.scale) dist += 2;
  if (a.charCount !== b.charCount) dist += 2;
  if (a.camera !== b.camera) dist += 1;
  if (a.pose !== b.pose) dist += 1;
  if (a.textMode !== b.textMode) dist += 1;
  return dist;
}

/**
 * Two states are "near-identical" if:
 * 1. Fingerprints match exactly (distance 0), OR
 * 2. Visual distance is < 3 AND none of the major visual anchors (shot, action, motif, diagram, env) changed.
 */
function isNearIdentical(a, b) {
  if (a.fingerprint === b.fingerprint) return true;
  const dist = visualDistance(a, b);
  if (dist <= 1) return true;
  if (dist < 3) {
    const majorChange = (
      a.shot !== b.shot ||
      a.action !== b.action ||
      a.motif !== b.motif ||
      a.diagram !== b.diagram ||
      a.environment !== b.environment
    );
    return !majorChange;
  }
  return false;
}

// ── Stagnation Detector ─────────────────────────────────────────────────────
/**
 * Evaluates a sequence of scenes for visual stagnation.
 * Rule: 3 consecutive beats with identical or near-identical visual states = VIOLATION.
 */
function detectStagnation(scenes) {
  const states = scenes.map((s, idx) => ({
    index: idx,
    id: s.id || `scene-${idx}`,
    ...extractVisualState(s),
  }));

  const violations = [];
  let consecutiveStagnant = 1;

  for (let i = 1; i < states.length; i++) {
    const prev = states[i - 1];
    const curr = states[i];

    if (isNearIdentical(prev, curr)) {
      consecutiveStagnant++;
      if (consecutiveStagnant >= 3) {
        violations.push({
          index: i,
          sceneId: curr.id,
          length: consecutiveStagnant,
          scenes: [states[i - 2].id, states[i - 1].id, curr.id],
          reason: `3 consecutive beats sharing near-identical visual state (${curr.shot}, ${curr.action}, motif:${curr.motif}, set:${curr.environment})`,
          fingerprints: [states[i - 2].fingerprint, states[i - 1].fingerprint, curr.fingerprint],
        });
      }
    } else {
      consecutiveStagnant = 1;
    }
  }

  // Calculate overall visual diversity
  const uniqueFingerprints = new Set(states.map((s) => s.fingerprint)).size;
  const diversityRatio = states.length > 0 ? (uniqueFingerprints / states.length) : 1;

  return {
    violations,
    stagnationCount: violations.length,
    states,
    uniqueFingerprints,
    diversityRatio,
    isHealthy: violations.length === 0,
  };
}

// ── Curated Remedy Catalog ──────────────────────────────────────────────────
const MOTIF_REMEDIES = [
  "lightbulb", "hourglass", "dominoCascade", "target", "shield", "balance",
  "compass", "icebergDepth", "chains", "ladder", "clock", "zap", "trophy"
];

const SET_REMEDIES = [
  "room", "office", "classroom", "library", "workstation", "cafe", "stage", "horizon"
];

const TEXTURE_REMEDIES = ["grain", "dots", "grid", "paper"];

const ACTION_REMEDIES = {
  EXPLANATION: ["think", "point", "sit"],
  QUESTION: ["think", "reach", "point"],
  SETUP: ["walk", "hold", "point"],
  TENSION: ["slump", "think", "idle"],
  CONTRADICTION: ["point", "think", "slump"],
  REVEAL: ["celebrate", "point", "reach"],
  PAYOFF: ["celebrate", "hold", "reach"],
  HOOK: ["point", "walk", "celebrate"],
  TRANSITION: ["walk", "idle", "sit"],
  REFLECTION: ["sit", "think", "slump"],
};

const HANDPROP_REMEDIES = [
  "notes", "book", "lightbulb", "compass", "hourglass", "target", "shield", "key"
];

// ── Auto-Mitigation Engine ──────────────────────────────────────────────────
/**
 * Automatically cures stagnation by applying God Mode director remedies:
 *   - CHANGE_CAMERA
 *   - CHANGE_ACTION
 *   - INTRODUCE_MOTIF
 *   - INTRODUCE_DIAGRAM
 *   - CHANGE_SCALE
 *   - CHANGE_ENVIRONMENT
 *
 * Runs iteratively until 0 stagnation violations remain.
 */
function mitigateStagnation(scenes, options = {}) {
  const maxPasses = options.maxPasses || 3;
  let passes = 0;
  const remediesApplied = [];

  while (passes < maxPasses) {
    passes++;
    const { violations } = detectStagnation(scenes);
    if (violations.length === 0) break;

    for (const v of violations) {
      const idx = v.index;
      const scene = scenes[idx];
      const prevScene = scenes[idx - 1] || {};
      const prevPrevScene = scenes[idx - 2] || {};
      const nFunc = scene.narrative?.function || "EXPLANATION";

      // Select remedy strategy based on narrative function & current lack of novelty
      const hasMotif = scene.props && scene.props.length > 0;
      const hasDiagram = Boolean(scene.diagram);

      let remedyChosen = null;

      // REMEDY STRATEGY 1: INTRODUCE_DIAGRAM (for explanatory/contrast beats)
      if (!hasDiagram && !hasMotif && ["EXPLANATION", "CONTRADICTION"].includes(nFunc) && (idx % 2 === 0)) {
        const diagramTypes = ["flow", "sorter", "spectrum", "matchWave"];
        const dType = diagramTypes[idx % diagramTypes.length];
        scene.diagram = {
          type: dType,
          labels: nFunc === "CONTRADICTION" ? ["DEFAULT TRAP", "REAL LEVERAGE"] : ["STEP 01", "STEP 02", "RESULT"],
          values: [40, 85],
          at: 6,
          scale: 1,
        };
        remedyChosen = "INTRODUCE_DIAGRAM";
      }

      // REMEDY STRATEGY 2: INTRODUCE_MOTIF (if no motif on screen)
      else if (!hasMotif && !scene.diagram) {
        const motifType = MOTIF_REMEDIES[idx % MOTIF_REMEDIES.length];
        const arcs = ["grow", "rise", "shrink", "closein"];
        const arc = arcs[idx % arcs.length];
        scene.props = [
          {
            type: motifType,
            x: 960,
            y: 540,
            scale: 1.1,
            enter: "pop",
            at: 6,
            arc: arc,
          },
        ];
        remedyChosen = "INTRODUCE_MOTIF";
      }

      // REMEDY STRATEGY 3: CHANGE_SCALE / CHANGE_CAMERA
      else if (scene.shot === prevScene.shot && scene.shot === prevPrevScene.shot) {
        if (["REVEAL", "PAYOFF", "HOOK"].includes(nFunc)) {
          // Punch in for impact
          scene.shot = "closeUp";
          scene.camera = {
            zoom: [1.0, 1.1],
            panX: [0, 0],
            panY: [0, -20],
            punch: { at: 6, amount: 0.08 },
          };
          remedyChosen = "CHANGE_SCALE (closeUp + camera punch)";
        } else if (["SETUP", "QUESTION"].includes(nFunc)) {
          // Open up to wide establishing
          scene.shot = "wide";
          scene.camera = {
            zoom: [1.05, 1.0],
            panX: [0, 0],
            panY: [0, 0],
          };
          if (scene.characters?.[0]) {
            scene.characters[0].body = "full";
          }
          remedyChosen = "CHANGE_SCALE (wide establishing)";
        } else {
          // Break framing monotony by shifting to a complementary shot
          const altShots = ["closeUp", "medium", "overShoulder", "wide"];
          const newShot = altShots.find((sh) => sh !== scene.shot) || "closeUp";
          scene.shot = newShot;
          scene.camera = {
            zoom: [1.0, 1.06],
            panX: [0, 0],
            panY: [0, 0],
            punch: { at: 6, amount: 0.07 },
          };
          remedyChosen = `CHANGE_SCALE & SHOT (${newShot})`;
        }
      }

      // REMEDY STRATEGY 3B: REPEATED MOTIF
      else if (scene.props?.[0] && prevScene.props?.[0] && scene.props[0].type === prevScene.props[0].type) {
        const altMotifs = MOTIF_REMEDIES.filter((m) => m !== scene.props[0].type);
        const newMotif = altMotifs[idx % altMotifs.length];
        scene.props[0].type = newMotif;
        scene.props[0].arc = ["grow", "rise", "shrink", "closein"][idx % 4];
        remedyChosen = `INTRODUCE_MOTIF (${newMotif})`;
      }

      // REMEDY STRATEGY 4: CHANGE_ACTION
      else if (scene.characters?.[0] && scene.characters[0].action === prevScene.characters?.[0]?.action) {
        const pool = ACTION_REMEDIES[nFunc] || ["think", "point", "sit"];
        const nextAction = pool[idx % pool.length];
        scene.characters[0].action = nextAction;

        // Give them a handProp if holding or pointing
        if (nextAction === "hold" || nextAction === "point") {
          scene.characters[0].holds = HANDPROP_REMEDIES[idx % HANDPROP_REMEDIES.length];
        }

        // Add emotional micro-reaction
        if (["REVEAL", "PAYOFF"].includes(nFunc)) {
          scene.characters[0].expression = "happy";
          scene.characters[0].emotion = "lightbulb";
        } else if (["TENSION", "CONTRADICTION"].includes(nFunc)) {
          scene.characters[0].expression = "worried";
          scene.characters[0].emotion = "sweat";
        }
        remedyChosen = `CHANGE_ACTION (${nextAction})`;
      }

      // REMEDY STRATEGY 5: CHANGE_ENVIRONMENT
      else {
        const curSet = scene.bg?.set || "none";
        const altSets = SET_REMEDIES.filter((s) => s !== curSet);
        const newSet = altSets[idx % altSets.length];
        const newTexture = TEXTURE_REMEDIES[idx % TEXTURE_REMEDIES.length];

        scene.bg = {
          ...(scene.bg || {}),
          set: newSet,
          texture: newTexture,
        };
        remedyChosen = `CHANGE_ENVIRONMENT (${newSet} + ${newTexture})`;
      }

      remediesApplied.push({
        beatIndex: idx,
        sceneId: scene.id,
        remedy: remedyChosen,
        narrativeFunction: nFunc,
      });
    }
  }

  // Final validation check
  const postAudit = detectStagnation(scenes);

  return {
    scenes,
    remediesApplied,
    passes,
    finalStagnationCount: postAudit.stagnationCount,
    isClean: postAudit.isHealthy,
  };
}

module.exports = {
  extractVisualState,
  visualDistance,
  isNearIdentical,
  detectStagnation,
  mitigateStagnation,
};
