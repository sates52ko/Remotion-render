/**
 * antidote-retention-auditor.js — Holistic Retention Auditor (Antidote God Mode: Phase 8)
 *
 * Synthesizes all 6 God Mode subsystems into a unified 0–100 Holistic Retention Score:
 *   1. Narrative Story Health (25%) — 6 Golden Rules, escalating beats, zero explanation fatigue
 *   2. Stagnation Free Score (20%)  — Visual state diversity, zero consecutive repeats
 *   3. Promise / Payoff Score (20%) — Complete curiosity lifecycles, earned payoffs
 *   4. Visual Novelty Budget (15%)  — Metaphors, splits, diagrams, reaction shots
 *   5. Chapter Arc Health (10%)     — Curiosity cycles per chapter (Question → Turn → Climax)
 *   6. Audio Director Score (10%)   — Frame-accurate tactile SFX & selective silence
 *
 * Generates second-by-second Retention Hotspots (predicting audience drop-off).
 */

const { auditNarrativeRules } = require("./antidote-narrative-rules");
const { detectStagnation } = require("./antidote-stagnation-engine");
const { auditPromiseRules } = require("./antidote-promise-engine");
const { auditNoveltyBudget } = require("./antidote-novelty-budget");
const { auditChapterArcs } = require("./antidote-chapter-arcs");
const { auditAudioDirector } = require("./antidote-audio-director");

/**
 * Calculates holistic retention health and identifies predictive drop-off hotspots.
 *
 * @param {object} config
 * @param {Array<object>} chapters
 * @returns {object} Holistic retention audit result
 */
function auditHolisticRetention(config, chapters = []) {
  const scenes = config.scenes || [];
  const fps = (config.meta && config.meta.fps) || 30;
  const promises = config.promises || [];

  // Run the 6 core sub-audits
  const narrativeAudit = auditNarrativeRules(scenes, fps);
  const stagnationAudit = detectStagnation(scenes);
  const promiseAudit = auditPromiseRules(scenes, promises);
  const noveltyAudit = auditNoveltyBudget(scenes, fps);
  const chapterAudit = auditChapterArcs(scenes, chapters, fps);
  const audioAudit = auditAudioDirector(scenes, fps);

  const stagnationScore = Math.max(0, Math.min(10, +(10 - (stagnationAudit.stagnationCount || 0) * 2.0).toFixed(1)));

  // Sub-scores normalized to 0–10
  const subScores = {
    narrative: +(narrativeAudit.score || 0).toFixed(1),
    stagnation: +(stagnationScore).toFixed(1),
    promises: +(promiseAudit.score || 0).toFixed(1),
    novelty: +(noveltyAudit.score || 0).toFixed(1),
    chapters: +(chapterAudit.score || 0).toFixed(1),
    audio: +(audioAudit.score || 0).toFixed(1),
  };

  // Weighted Composite Retention Score (0–100)
  const compositeScore = Math.round(
    subScores.narrative * 2.5 +
    subScores.stagnation * 2.0 +
    subScores.promises * 2.0 +
    subScores.novelty * 1.5 +
    subScores.chapters * 1.0 +
    subScores.audio * 1.0
  );

  // Identify Retention Drop-Off Hotspots along the timeline
  const hotspots = [];
  let currentFrame = 0;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = s.durationFrames || (fps * 7);
    const timeStartSec = Math.round(currentFrame / fps);
    const timeEndSec = Math.round((currentFrame + dur) / fps);
    const n = s.narrative || {};

    const risks = [];

    // 1. Explanation streak risk
    if (i >= 2 && scenes[i - 1]?.narrative?.function === "EXPLANATION" && scenes[i - 2]?.narrative?.function === "EXPLANATION" && n.function === "EXPLANATION") {
      risks.push({ type: "COGNITIVE_FATIGUE", severity: "HIGH", detail: "3 consecutive explanation beats without visual/story escalation" });
    }

    // 2. Unresolved promise stagnation (>45s)
    if (n.promiseRole === "reminder" && s.durationFrames / fps > 18) {
      risks.push({ type: "PROMISE_DRAG", severity: "MEDIUM", detail: "Prolonged beat during open curiosity loop" });
    }

    // 3. Stagnation repetition
    if (stagnationAudit.violations.some((v) => v.streakScenes.includes(s.id))) {
      risks.push({ type: "VISUAL_STAGNATION", severity: "CRITICAL", detail: "Visual fingerprint repeated without camera/motif change" });
    }

    // 4. Missing audio punctuation on major narrative moment
    if ((n.function === "PAYOFF" || s.visualJob === "reveal") && !(s.audioEvents || []).some((e) => e.type === "ding")) {
      risks.push({ type: "MUTED_PAYOFF", severity: "MEDIUM", detail: "Climactic payoff beat lacks tactile sound punch" });
    }

    if (risks.length > 0) {
      hotspots.push({
        sceneIndex: i,
        sceneId: s.id,
        timeRange: `${Math.floor(timeStartSec / 60)}:${String(timeStartSec % 60).padStart(2, "0")} - ${Math.floor(timeEndSec / 60)}:${String(timeEndSec % 60).padStart(2, "0")}`,
        startSec: timeStartSec,
        endSec: timeEndSec,
        risks,
      });
    }

    currentFrame += dur;
  }

  // Compile all violations across engines
  const noveltyViolations = [...(noveltyAudit.failures || []), ...(noveltyAudit.warnings || [])];
  const allViolations = [
    ...(narrativeAudit.violations || []).map((v) => ({ system: "Narrative", ...v })),
    ...(stagnationAudit.violations || []).map((v) => ({ system: "Stagnation", ...v })),
    ...(promiseAudit.violations || []).map((v) => ({ system: "Promises", ...v })),
    ...noveltyViolations.map((v) => ({ system: "Novelty", ...v })),
    ...(chapterAudit.violations || []).map((v) => ({ system: "Chapters", ...v })),
    ...(audioAudit.violations || []).map((v) => ({ system: "Audio", ...v })),
  ];

  const grade =
    compositeScore >= 95
      ? "S (God Tier Retention)"
      : compositeScore >= 85
      ? "A (Elite Explainer)"
      : compositeScore >= 70
      ? "B (Competent)"
      : compositeScore >= 50
      ? "C (Retention Risk)"
      : "F (Illustrated Radio)";

  const compressionPassed = (config.scenes || []).every((s) => !s.diagram || s.characters?.length === 0 || s.characters?.[0]?.scale <= 0.65);
  const criticalHotspots = hotspots.filter((h) => h.risks.some((r) => r.severity === "CRITICAL" || r.severity === "HIGH"));
  const passed = compositeScore >= 85 && criticalHotspots.length === 0 && compressionPassed;

  return {
    score: compositeScore,
    grade,
    passed,
    subScores,
    hotspots,
    criticalHotspots,
    allViolations,
    diagnostics: {
      narrativePassed: narrativeAudit.passed,
      stagnationPassed: stagnationAudit.isHealthy,
      promisesPassed: promiseAudit.passed,
      noveltyPassed: noveltyAudit.passed,
      chaptersPassed: chapterAudit.passed,
      audioPassed: audioAudit.passed,
      compressionPassed,
    },
  };
}

module.exports = {
  auditHolisticRetention,
};
