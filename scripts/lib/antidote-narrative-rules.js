/**
 * antidote-narrative-rules.js — Narrative Director Core & Story Rules Engine (Antidote God Mode: Phase 1)
 *
 * Implements the Story Director layer:
 *   1. Assigns functional narrative jobs (HOOK, QUESTION, SETUP, EXPLANATION, TENSION,
 *      CONTRADICTION, REVEAL, PAYOFF, TRANSITION, REFLECTION).
 *   2. Coordinates promise/payoff cycles across the film.
 *   3. Enforces the 6 Golden Story Rules to eliminate narrative fatigue.
 */

const QUESTION_RE = /\?\s*$|\b(why|how come|what if|ask yourself|the question is|why do we|how do we|can you really)\b/i;
const CONTRADICTION_RE = /\b(however|instead|the opposite|paradox|not because|counter-?intuitive|wrong assumption|myth|actually|truth is|misconception|versus|vs\.?)\b/i;
const TENSION_RE = /\b(fail|failed|failure|trap|crisis|danger|fear|pressure|struggle|panic|breakdown|stuck|lose|cost|threat|enemy)\b/i;
const REVEAL_RE = /\b(turns out|secret|discovery|breakthrough|unseen|unmask|real reason|key is|shift|unlocked|solution)\b/i;
const PAYOFF_RE = /\b(result|outcome|payoff|reward|mastery|clarity|finally|transformed|in the end|freedom|achievement)\b/i;
const REFLECTION_RE = /\b(remember|moral|takeaway|ultimately|in perspective|lesson|wisdom|contemplate|reflect)\b/i;

/**
 * Assigns narrative signals and manages promise/payoff pairing across a sequence of scenes.
 */
function directNarrativeFlow(scenes, sequenceArcs) {
  const arcRoleMap = new Map();
  if (sequenceArcs && sequenceArcs.sequences) {
    for (const seq of sequenceArcs.sequences) {
      for (const b of seq.beats || []) {
        arcRoleMap.set(b.index, { role: b.role, seqId: seq.id });
      }
    }
  }

  let openPromises = [];
  let promiseCounter = 1;
  const diagnosedScenes = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const text = s._narration || "";
    const arcInfo = arcRoleMap.get(i) || { role: i === 0 ? "setup" : "explanation", seqId: "seq-01" };
    const isFirst = i === 0;
    const isChapter = !!s.chapterCard || s.shot === "chapterCard";

    let func = "EXPLANATION";
    let escalates = false;
    let conceptual = false;
    let emotional = false;
    let payoffPromise = undefined;
    let payoff = undefined;

    // 1. Determine Narrative Function
    if (isFirst) {
      func = "HOOK";
      escalates = true;
      payoffPromise = `promise-${String(promiseCounter++).padStart(2, "0")}`;
      openPromises.push({ id: payoffPromise, openedAt: i });
    } else if (isChapter) {
      func = "TRANSITION";
    } else if (CONTRADICTION_RE.test(text) || arcInfo.role === "question") {
      func = "CONTRADICTION";
      escalates = true;
    } else if (QUESTION_RE.test(text)) {
      func = "QUESTION";
      escalates = true;
      payoffPromise = `promise-${String(promiseCounter++).padStart(2, "0")}`;
      openPromises.push({ id: payoffPromise, openedAt: i });
    } else if (TENSION_RE.test(text) || arcInfo.role === "complication") {
      func = "TENSION";
      escalates = true;
      emotional = true;
    } else if (REVEAL_RE.test(text) || arcInfo.role === "reveal") {
      func = "REVEAL";
      escalates = true;
      conceptual = true;
      if (openPromises.length > 0) {
        const resolved = openPromises.shift();
        payoff = resolved.id;
      }
    } else if (PAYOFF_RE.test(text)) {
      func = "PAYOFF";
      if (openPromises.length > 0) {
        const resolved = openPromises.shift();
        payoff = resolved.id;
      }
    } else if (REFLECTION_RE.test(text)) {
      func = "REFLECTION";
      conceptual = true;
    } else if (arcInfo.role === "setup") {
      func = "SETUP";
    } else {
      func = "EXPLANATION";
      conceptual = true;
    }

    diagnosedScenes.push({
      index: i,
      id: s.id,
      function: func,
      escalates,
      conceptual,
      emotional,
      payoffPromise,
      payoff,
      durationFrames: s.durationFrames,
      narration: text.slice(0, 100),
    });
  }

  // 2. Enforce Rule 1: No 3 consecutive EXPLANATIONs (Auto-break streaks)
  for (let i = 2; i < diagnosedScenes.length; i++) {
    if (
      diagnosedScenes[i - 2].function === "EXPLANATION" &&
      diagnosedScenes[i - 1].function === "EXPLANATION" &&
      diagnosedScenes[i].function === "EXPLANATION"
    ) {
      // Intervene: turn the 3rd explanatory beat into a TENSION or CONTRADICTION
      diagnosedScenes[i].function = "CONTRADICTION";
      diagnosedScenes[i].escalates = true;
    }
  }

  // 3. Resolve any trailing dangling promises on the final scenes
  while (openPromises.length > 0) {
    const trailing = openPromises.pop();
    const lastScene = diagnosedScenes[diagnosedScenes.length - 1];
    if (lastScene && !lastScene.payoff) {
      lastScene.payoff = trailing.id;
      if (lastScene.function === "EXPLANATION") {
        lastScene.function = "PAYOFF";
      }
    }
  }

  return diagnosedScenes;
}

/**
 * The 6 Golden Narrative Rules Auditor.
 * Evaluates an Antidote config against Pixar/Vox retention standards.
 */
function auditNarrativeRules(scenes, fps = 30) {
  const violations = [];
  let explanationStreak = 0;
  let lastEscalationFrame = 0;
  let currentFrame = 0;

  const openPromises = new Map();
  let resolvedPromises = 0;
  let orphanPayoffs = 0;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const n = s.narrative || { function: "EXPLANATION", escalates: false };
    const dur = s.durationFrames || (fps * 7);

    // Track promises
    if (n.payoffPromise) {
      openPromises.set(n.payoffPromise, { beatIndex: i, openedAtFrame: currentFrame });
    }
    if (n.payoff) {
      if (openPromises.has(n.payoff)) {
        openPromises.delete(n.payoff);
        resolvedPromises++;
      } else {
        orphanPayoffs++;
        violations.push({
          beatIndex: i,
          sceneId: s.id,
          rule: "ORPHAN_PAYOFF",
          message: `Payoff '${n.payoff}' delivered without an earlier open promise setup.`,
        });
      }
    }

    // Rule 1: No 3 consecutive EXPLANATION beats
    if (n.function === "EXPLANATION") {
      explanationStreak++;
      if (explanationStreak >= 3) {
        violations.push({
          beatIndex: i,
          sceneId: s.id,
          rule: "EXPLANATION_STREAK",
          message: `3 consecutive EXPLANATION beats detected (${explanationStreak} in a row). Audience fatigue risk.`,
        });
      }
    } else {
      explanationStreak = 0;
    }

    // Rule 2: No 2 consecutive low-value beats (TRANSITION + SETUP)
    if (i > 0) {
      const prevN = scenes[i - 1].narrative || { function: "EXPLANATION" };
      if (
        (prevN.function === "TRANSITION" || prevN.function === "SETUP") &&
        (n.function === "TRANSITION" || n.function === "SETUP")
      ) {
        violations.push({
          beatIndex: i,
          sceneId: s.id,
          rule: "CONSECUTIVE_LOW_VALUE",
          message: `Consecutive low-tension beats: ${prevN.function} → ${n.function}.`,
        });
      }
    }

    // Rule 6: No long stretch without escalation (>28s)
    if (n.escalates) {
      lastEscalationFrame = currentFrame;
    } else {
      const stretchSecs = (currentFrame - lastEscalationFrame) / fps;
      if (stretchSecs > 28) {
        violations.push({
          beatIndex: i,
          sceneId: s.id,
          rule: "ESCALATION_DROUGHT",
          message: `${Math.round(stretchSecs)}s elapsed without an escalating narrative beat.`,
        });
        lastEscalationFrame = currentFrame; // reset so we don't spam every frame
      }
    }

    currentFrame += dur;
  }

  // Rule 5: Unresolved promises
  for (const [id, info] of openPromises.entries()) {
    violations.push({
      beatIndex: info.beatIndex,
      sceneId: scenes[info.beatIndex]?.id || `scene-${info.beatIndex}`,
      rule: "UNRESOLVED_PROMISE",
      message: `Curiosity promise '${id}' opened at beat ${info.beatIndex} was never resolved.`,
    });
  }

  // Narrative Health Score: 10 - penalty
  const penalty = violations.reduce((acc, v) => {
    if (v.rule === "EXPLANATION_STREAK") return acc + 1.5;
    if (v.rule === "UNRESOLVED_PROMISE") return acc + 2.0;
    if (v.rule === "ORPHAN_PAYOFF") return acc + 1.0;
    if (v.rule === "ESCALATION_DROUGHT") return acc + 1.2;
    return acc + 0.8;
  }, 0);

  const score = Math.max(1, Math.min(10, Math.round((10 - penalty) * 10) / 10));

  return {
    score,
    passed: violations.length === 0,
    totalViolations: violations.length,
    resolvedPromises,
    unresolvedPromises: openPromises.size,
    violations,
  };
}

module.exports = {
  directNarrativeFlow,
  auditNarrativeRules,
};
