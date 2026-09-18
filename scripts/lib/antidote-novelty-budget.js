/**
 * antidote-novelty-budget.js — Visual Novelty Budget Engine
 *
 * Antidote God Mode — Phase 4:
 * Enforces visual novelty allocation to prevent retention drops.
 *
 * Per 60-second window, aims for:
 *   1. Hero visual metaphor (prop with arc or illustration shot)
 *   2. Split / Contrast (A vs B, twoShot, split background, beforeAfter)
 *   3. Data / Diagram (flow, sorter, spectrum, matchWave, counter, quantify)
 *   4. High-stakes reaction (emotion overlay, surprise/worried, punch)
 *   5. Micro-pattern-break (insert, silhouette, lowAngle, chapterCard, pattern-break)
 *
 * Thresholds:
 *   - 45s without any novel visual = WARNING
 *   - 60s without novel visual = FAIL
 */

const NOVELTY_TYPES = {
  HERO_METAPHOR: "HERO_METAPHOR",
  SPLIT_CONTRAST: "SPLIT_CONTRAST",
  DATA_DIAGRAM: "DATA_DIAGRAM",
  HIGH_STAKES_REACTION: "HIGH_STAKES_REACTION",
  PATTERN_BREAK: "PATTERN_BREAK",
};

/**
 * Classifies which visual novelty categories a scene fulfills (can be multiple).
 */
function classifySceneNovelty(scene) {
  const fulfilled = new Set();
  const shot = scene.shot || "medium";
  const vJob = scene.visualJob || "";
  const nFunc = scene.narrative?.function || "";

  // 1. Hero Visual Metaphor
  const hasMotif = scene.props && scene.props.length > 0 && scene.props[0].type !== "none";
  const hasIllustration = ["illustration", "diorama"].includes(shot);
  const hasDynamicArc = scene.visualArc && scene.visualArc.transformation !== "none";
  if ((hasMotif && (hasDynamicArc || scene.props[0].arc !== "none")) || hasIllustration) {
    fulfilled.add(NOVELTY_TYPES.HERO_METAPHOR);
  }

  // 2. Split / Contrast
  const hasSplitShot = ["split", "beforeAfter", "twoShot"].includes(shot);
  const hasSplitBg = Array.isArray(scene.bg?.split) && scene.bg.split.length >= 2;
  const isContrastJob = vJob === "contrast" || nFunc === "CONTRADICTION";
  if (hasSplitShot || hasSplitBg || isContrastJob) {
    fulfilled.add(NOVELTY_TYPES.SPLIT_CONTRAST);
  }

  // 3. Data / Diagram
  const hasDiagram = Boolean(scene.diagram);
  const isQuantifyJob = vJob === "quantify";
  const hasDataMotif = hasMotif && ["barChart", "lineGrowth", "counter", "stack", "ladder"].includes(scene.props[0].type);
  if (hasDiagram || isQuantifyJob || hasDataMotif) {
    fulfilled.add(NOVELTY_TYPES.DATA_DIAGRAM);
  }

  // 4. High-Stakes Reaction
  const c0 = scene.characters?.[0];
  const hasEmotion = c0 && c0.emotion && c0.emotion !== "none";
  const hasHighStakesFace = c0 && ["surprised", "worried"].includes(c0.expression);
  const hasPunch = Boolean(scene.camera?.punch);
  const isEmotionalJob = ["surprise", "escalate"].includes(vJob) || ["TENSION"].includes(nFunc);
  if (hasEmotion || (hasHighStakesFace && hasPunch) || (isEmotionalJob && hasPunch)) {
    fulfilled.add(NOVELTY_TYPES.HIGH_STAKES_REACTION);
  }

  // 5. Micro-Pattern-Break
  const isBreakShot = ["insert", "chapterCard", "silhouette", "lowAngle", "crowd"].includes(shot);
  const isBreakJob = vJob === "pattern-break" || nFunc === "HOOK";
  const isDynamicTransition = ["flash", "whipLeft", "whipRight", "irisIn"].includes(scene.transition?.type);
  if (isBreakShot || isBreakJob || isDynamicTransition) {
    fulfilled.add(NOVELTY_TYPES.PATTERN_BREAK);
  }

  return Array.from(fulfilled);
}

/**
 * Audits the Visual Novelty Budget across the entire video.
 */
function auditNoveltyBudget(scenes, fps = 30) {
  const warnings = [];
  const failures = [];
  const windowSeconds = 60;
  const framesPerWindow = windowSeconds * fps;

  let lastNoveltyFrame = 0;
  let currentFrame = 0;

  const sceneNovelties = [];
  const typeFrequencies = {
    [NOVELTY_TYPES.HERO_METAPHOR]: 0,
    [NOVELTY_TYPES.SPLIT_CONTRAST]: 0,
    [NOVELTY_TYPES.DATA_DIAGRAM]: 0,
    [NOVELTY_TYPES.HIGH_STAKES_REACTION]: 0,
    [NOVELTY_TYPES.PATTERN_BREAK]: 0,
  };

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = s.durationFrames || (fps * 7);
    const startFrame = currentFrame;
    const endFrame = startFrame + dur;

    const novelties = classifySceneNovelty(s);
    sceneNovelties.push({ index: i, sceneId: s.id, novelties, startFrame, endFrame });

    for (const t of novelties) {
      typeFrequencies[t] = (typeFrequencies[t] || 0) + 1;
    }

    if (novelties.length > 0) {
      lastNoveltyFrame = endFrame;
    } else {
      const gapFrames = endFrame - lastNoveltyFrame;
      const gapSeconds = Math.round(gapFrames / fps);

      if (gapSeconds >= 60) {
        failures.push({
          beat: i,
          sceneId: s.id,
          gapSeconds,
          level: "FAIL",
          details: `${gapSeconds}s without any novel visual state (limit: 60s).`,
        });
      } else if (gapSeconds >= 45) {
        warnings.push({
          beat: i,
          sceneId: s.id,
          gapSeconds,
          level: "WARNING",
          details: `${gapSeconds}s without any novel visual state (warning threshold: 45s).`,
        });
      }
    }

    currentFrame = endFrame;
  }

  const totalDurationSeconds = Math.round(currentFrame / fps);
  const totalMinutes = Math.max(1, totalDurationSeconds / 60);

  // Per-minute density of each novelty type
  const densityPerMinute = {};
  for (const [k, v] of Object.entries(typeFrequencies)) {
    densityPerMinute[k] = Math.round((v / totalMinutes) * 10) / 10;
  }

  // Score calculation (0 - 10.0)
  let score = 10.0;
  score -= failures.length * 2.0;
  score -= warnings.length * 0.5;
  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return {
    passed: failures.length === 0,
    score,
    totalDurationSeconds,
    totalMinutes: Math.round(totalMinutes * 10) / 10,
    warnings,
    failures,
    typeFrequencies,
    densityPerMinute,
    sceneNovelties,
  };
}

/**
 * Automatically balances the Visual Novelty Budget by injecting missing novelty
 * categories into any drought that exceeds 40 seconds.
 */
function balanceNoveltyBudget(scenes, fps = 30) {
  const remediesApplied = [];
  let currentFrame = 0;
  let lastNoveltyFrame = 0;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = s.durationFrames || (fps * 7);
    const startFrame = currentFrame;
    const endFrame = startFrame + dur;

    let novelties = classifySceneNovelty(s);

    if (novelties.length > 0) {
      lastNoveltyFrame = endFrame;
    } else {
      const gapSeconds = Math.round((endFrame - lastNoveltyFrame) / fps);

      // If gap exceeds 40s, proactively inject a novel visual
      if (gapSeconds >= 40) {
        const nFunc = s.narrative?.function || "EXPLANATION";
        let injectedType = null;

        if (["CONTRADICTION", "TENSION"].includes(nFunc)) {
          // Inject Split / Contrast
          s.shot = "split";
          s.visualJob = "contrast";
          s.bg = {
            ...(s.bg || {}),
            split: ["#17242B", "#264E5A"],
          };
          injectedType = NOVELTY_TYPES.SPLIT_CONTRAST;
        } else if (["REVEAL", "PAYOFF"].includes(nFunc)) {
          // Inject High-Stakes Reaction + Camera Punch
          s.shot = "closeUp";
          s.camera = {
            zoom: [1.0, 1.1],
            panX: [0, 0],
            panY: [0, -20],
            punch: { at: 6, amount: 0.08 },
          };
          if (s.characters?.[0]) {
            s.characters[0].expression = "happy";
            s.characters[0].emotion = "lightbulb";
          }
          injectedType = NOVELTY_TYPES.HIGH_STAKES_REACTION;
        } else if (["SETUP", "EXPLANATION"].includes(nFunc) && (i % 2 === 0)) {
          // Inject Data / Diagram
          s.diagram = {
            type: "flow",
            labels: ["TRIGGER", "HABIT LOOP", "REWARD"],
            values: [30, 60, 90],
            at: 6,
            scale: 1,
          };
          s.visualJob = "quantify";
          injectedType = NOVELTY_TYPES.DATA_DIAGRAM;
        } else {
          // Inject Hero Metaphor
          s.props = [
            {
              type: "hourglass",
              x: 960,
              y: 540,
              scale: 1.15,
              enter: "pop",
              at: 6,
              arc: "grow",
            },
          ];
          injectedType = NOVELTY_TYPES.HERO_METAPHOR;
        }

        lastNoveltyFrame = endFrame;
        remediesApplied.push({
          beat: i,
          sceneId: s.id,
          gapSeconds,
          injectedType,
        });
      }
    }

    currentFrame = endFrame;
  }

  const postAudit = auditNoveltyBudget(scenes, fps);

  return {
    scenes,
    remediesApplied,
    postAudit,
  };
}

module.exports = {
  NOVELTY_TYPES,
  classifySceneNovelty,
  auditNoveltyBudget,
  balanceNoveltyBudget,
};
