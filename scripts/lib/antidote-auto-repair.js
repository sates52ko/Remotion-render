/**
 * antidote-auto-repair.js — Closed-Loop Auto-Repair Engine (Antidote God Mode: Phase 9)
 *
 * Implements the autonomous diagnostic repair loop:
 *   [Detect Deficit] → [Generate Candidates] → [Score Simulation] → [Apply Best Fix] → [Re-Audit]
 *
 * Runs iteratively until:
 *   - Holistic Retention Score >= 95
 *   - 0 Critical Violations
 *   - 0 Stagnation Streaks
 *   - 100% Promise/Payoff Resolution
 */

const { auditHolisticRetention } = require("./antidote-retention-auditor");
const { directNarrativeFlow } = require("./antidote-narrative-rules");
const { mitigateStagnation } = require("./antidote-stagnation-engine");
const { planPromiseLifecycles } = require("./antidote-promise-engine");
const { balanceNoveltyBudget } = require("./antidote-novelty-budget");
const { planChapterArcs } = require("./antidote-chapter-arcs");
const { directAudioEvents } = require("./antidote-audio-director");

/**
 * Executes the closed-loop auto-repair workflow on an Antidote config.
 *
 * @param {object} config
 * @param {Array<object>} chapters
 * @param {object} options
 * @returns {object} { config, initialScore, finalScore, passesRun, repairs, isFullyClean }
 */
function autoRepairAntidote(config, chapters = [], options = {}) {
  const maxPasses = options.maxPasses || 4;
  const fps = (config.meta && config.meta.fps) || 30;
  const repairs = [];

  let initialAudit = auditHolisticRetention(config, chapters);
  const initialScore = initialAudit.score;

  if (initialAudit.score >= 100 && initialAudit.passed) {
    return {
      config,
      initialScore,
      finalScore: initialScore,
      passesRun: 0,
      repairs: [],
      isFullyClean: true,
    };
  }

  let currentConfig = JSON.parse(JSON.stringify(config));
  let passesRun = 0;

  while (passesRun < maxPasses) {
    passesRun++;
    let preAudit = auditHolisticRetention(currentConfig, chapters);
    if (preAudit.score >= 100 && preAudit.passed) break;

    let scenes = currentConfig.scenes || [];
    let passRepairs = 0;

    // ── STEP 1: Repair Chapter Curiosity Arcs ────────────────────────────────
    if (!preAudit.diagnostics.chaptersPassed) {
      const chRes = planChapterArcs(scenes, chapters, fps);
      scenes = chRes.scenes;
      repairs.push({
        pass: passesRun,
        type: "CHAPTER_ARCS",
        detail: `Harmonized ${chRes.chapterArcs.length} chapter curiosity cycles`,
      });
      passRepairs++;
    }

    // ── STEP 2: Repair Promises & Curiosity Lifecycles ──────────────────────
    if (!preAudit.diagnostics.promisesPassed || preAudit.subScores.promises < 10) {
      const pRes = planPromiseLifecycles(scenes);
      scenes = pRes.scenes;
      currentConfig.promises = pRes.promises;
      repairs.push({
        pass: passesRun,
        type: "PROMISE_LIFECYCLES",
        detail: `Planned ${pRes.promises.length} multi-beat curiosity loops with earned payoffs`,
      });
      passRepairs++;
    }

    // ── STEP 3: Repair Visual Novelty Budget ─────────────────────────────────
    if (!preAudit.diagnostics.noveltyPassed || preAudit.subScores.novelty < 10) {
      const nRes = balanceNoveltyBudget(scenes, fps);
      scenes = nRes.scenes;
      if (nRes.remediesApplied.length > 0) {
        repairs.push({
          pass: passesRun,
          type: "NOVELTY_BALANCE",
          detail: `Injected ${nRes.remediesApplied.length} novelty elements to cure visual drought`,
        });
        passRepairs++;
      }
    }

    // ── STEP 4: Repair Stagnation & Visual Repetition ────────────────────────
    if (!preAudit.diagnostics.stagnationPassed || preAudit.subScores.stagnation < 10) {
      const sRes = mitigateStagnation(scenes);
      scenes = sRes.scenes;
      if (sRes.remediesApplied.length > 0) {
        repairs.push({
          pass: passesRun,
          type: "STAGNATION_MITIGATION",
          detail: `Applied ${sRes.remediesApplied.length} visual state remedies`,
        });
        passRepairs++;
      }
    }

    // ── STEP 5: Repair Narrative Golden Rules ────────────────────────────────
    if (!preAudit.diagnostics.narrativePassed || preAudit.subScores.narrative < 10) {
      const nFlow = directNarrativeFlow(scenes);
      for (let i = 0; i < scenes.length; i++) {
        if (nFlow[i]) {
          scenes[i].narrative = {
            ...(scenes[i].narrative || {}),
            function: nFlow[i].function,
            escalates: nFlow[i].escalates,
            ...(nFlow[i].payoffPromise ? { payoffPromise: nFlow[i].payoffPromise } : {}),
            ...(nFlow[i].payoff ? { payoff: nFlow[i].payoff } : {}),
          };
        }
      }
      repairs.push({
        pass: passesRun,
        type: "NARRATIVE_FLOW",
        detail: "Eliminated narrative droughts & explanation streaks",
      });
      passRepairs++;
    }

    // ── STEP 6: Repair Audio Soundscape & Selective Silence ──────────────────
    if (!preAudit.diagnostics.audioPassed || preAudit.subScores.audio < 10) {
      const aRes = directAudioEvents(scenes, fps);
      scenes = aRes.scenes;
      currentConfig.audioEvents = aRes.audioEvents;
      repairs.push({
        pass: passesRun,
        type: "AUDIO_DIRECTOR",
        detail: `Synchronized ${aRes.stats.totalAudioEvents} tactile audio events`,
      });
      passRepairs++;
    }

    // ── STEP 6.5: Repair Cognitive Compression (Gate 6) ──────────────────────
    let compressedCount = 0;
    for (const s of scenes) {
      if (s.diagram && s.characters && s.characters.length > 0) {
        for (const c of s.characters) {
          if (c.scale === undefined || c.scale > 0.65) {
            c.scale = 0.58;
            c.x = 230;
            c.y = 840;
            compressedCount++;
          }
        }
      }
    }
    if (compressedCount > 0) {
      repairs.push({
        pass: passesRun,
        type: "COGNITIVE_COMPRESSION",
        detail: `Scaled down ${compressedCount} character(s) to presenter pose for diagram clarity`,
      });
      passRepairs++;
    }

    // ── STEP 7: Repair Individual Critical Retention Hotspots ────────────────
    const postAudit = auditHolisticRetention({ ...currentConfig, scenes }, chapters);
    for (const hotspot of postAudit.criticalHotspots) {
      const targetScene = scenes[hotspot.sceneIndex];
      if (!targetScene) continue;

      for (const risk of hotspot.risks) {
        if (risk.type === "COGNITIVE_FATIGUE") {
          // Break fatigue by turning beat into TENSION or contrasting visual
          if (targetScene.narrative) {
            targetScene.narrative.function = "TENSION";
            targetScene.narrative.escalates = true;
          }
          targetScene.visualJob = "contrast";
          if (!["split", "beforeAfter"].includes(targetScene.shot)) {
            targetScene.shot = "split";
          }
          repairs.push({
            pass: passesRun,
            type: "HOTSPOT_BREAK",
            detail: `Resolved cognitive fatigue at beat #${hotspot.sceneIndex} via shot split & narrative tension`,
          });
          passRepairs++;
        }
      }
    }

    currentConfig.scenes = scenes;
    if (passRepairs === 0) break; // Reached fixed point
  }

  const finalAudit = auditHolisticRetention(currentConfig, chapters);

  return {
    config: currentConfig,
    initialScore,
    finalScore: finalAudit.score,
    grade: finalAudit.grade,
    passesRun,
    repairs,
    isFullyClean: finalAudit.score >= 95 && finalAudit.passed,
    finalAudit,
  };
}

module.exports = {
  autoRepairAntidote,
};
