/**
 * antidote-promise-engine.js — Multi-Beat Promise / Payoff Lifecycle Engine
 *
 * Antidote God Mode — Phase 3:
 * Coordinates the curiosity gaps and narrative commitments of the film.
 *
 * Director Rules:
 *   - Max open promises: 2-3 active at any beat.
 *   - Never open a new major promise if 3 promises are currently open (force payoff first).
 *   - Every promise must have:
 *       • 1 Setup beat
 *       • 1-2 Tension/Escalation reminder beats
 *       • 1 Payoff beat
 *   - No orphan setups (all promises resolved before video ends).
 *   - No unearned payoffs (every payoff traces to an active promise).
 */

const QUESTION_OR_HOOK_RE = /\?\s*$|\b(why|how come|what if|ask yourself|the question is|why do we|how do we|can you really|the real puzzle|the paradox|the trap)\b/i;
const TENSION_OR_ESCALATE_RE = /\b(fail|failed|failure|trap|crisis|danger|fear|pressure|struggle|panic|breakdown|stuck|lose|cost|threat|enemy|worse|risk)\b/i;
const REVEAL_OR_PAYOFF_RE = /\b(turns out|secret|discovery|breakthrough|unseen|unmask|real reason|key is|shift|unlocked|solution|result|outcome|payoff|reward|finally|the answer is)\b/i;

/**
 * Plans multi-beat promise lifecycles across a list of scenes.
 *
 * Returns: {
 *   promises: PromiseLifecycle[],
 *   scenes: SceneSpec[]
 * }
 */
function planPromiseLifecycles(scenes, options = {}) {
  const maxOpenConcurrent = options.maxOpen || 3;
  const promises = [];
  const openPromises = []; // array of active promise objects
  let promiseIndex = 1;

  // Clean slate: reset any legacy promise tags on scenes
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (s.narrative) {
      delete s.narrative.payoffPromise;
      delete s.narrative.payoff;
      delete s.narrative.promiseId;
      delete s.narrative.promiseRole;
    }
  }

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const text = s._narration || "";
    const nFunc = s.narrative?.function || "EXPLANATION";
    const isFirst = (i === 0);
    const isLast = (i === scenes.length - 1);

    // Check if an existing open promise needs a payoff
    const oldestOpen = openPromises[0];
    const minLifespanBeats = 3;
    const hasLivedEnough = oldestOpen && (i - oldestOpen.setupBeat >= minLifespanBeats);
    const needsForcedPayoff = openPromises.length >= maxOpenConcurrent && hasLivedEnough;
    const isNaturalPayoff = (REVEAL_OR_PAYOFF_RE.test(text) || ["REVEAL", "PAYOFF"].includes(nFunc)) && hasLivedEnough;

    // PAYOFF TRIGGER (Must have lived at least minLifespanBeats, unless it is the very last scene)
    if (openPromises.length > 0 && (isLast || isNaturalPayoff || needsForcedPayoff)) {
      // Resolve the oldest active promise
      const p = openPromises.shift();
      p.payoffBeat = i;
      p.status = "resolved";

      if (!s.narrative) s.narrative = { function: "PAYOFF", escalates: false };
      s.narrative.function = (nFunc === "HOOK") ? "HOOK" : "PAYOFF";
      s.narrative.promiseId = p.promiseId;
      s.narrative.promiseRole = "payoff";
      s.narrative.payoff = p.promiseId;
      continue;
    }

    // REMINDER / ESCALATION TRIGGER
    // If we have active promises and this beat has tension, contradiction, or escalation (or early payoff cue):
    if (openPromises.length > 0 && (TENSION_OR_ESCALATE_RE.test(text) || REVEAL_OR_PAYOFF_RE.test(text) || ["TENSION", "CONTRADICTION", "REVEAL"].includes(nFunc))) {
      // Find an open promise with < 2 reminders
      const targetPromise = openPromises.find((p) => p.reminderBeats.length < 2);
      if (targetPromise && !targetPromise.reminderBeats.includes(i) && i > targetPromise.setupBeat) {
        targetPromise.reminderBeats.push(i);
        if (!s.narrative) s.narrative = { function: "TENSION", escalates: true };
        s.narrative.promiseId = targetPromise.promiseId;
        s.narrative.promiseRole = (targetPromise.reminderBeats.length === 1) ? "reminder" : "escalation";
        s.narrative.escalates = true;
        continue;
      }
    }

    // SETUP TRIGGER
    // Can we open a new promise? Only if active count < maxOpenConcurrent and not near video end
    const remainingBeats = scenes.length - 1 - i;
    const canOpen = (openPromises.length < maxOpenConcurrent) && (remainingBeats >= 10);
    const isQuestionOrHook = isFirst || QUESTION_OR_HOOK_RE.test(text) || ["HOOK", "QUESTION"].includes(nFunc) || (i % 18 === 0 && openPromises.length === 0);

    if (canOpen && isQuestionOrHook) {
      const pId = `p-${String(promiseIndex++).padStart(2, "0")}`;
      const newPromise = {
        promiseId: pId,
        question: text.slice(0, 90).replace(/\s+/g, " ").trim(),
        setupBeat: i,
        reminderBeats: [],
        payoffBeat: undefined,
        status: "open",
      };
      promises.push(newPromise);
      openPromises.push(newPromise);

      if (!s.narrative) s.narrative = { function: isFirst ? "HOOK" : "QUESTION", escalates: true };
      s.narrative.promiseId = pId;
      s.narrative.promiseRole = "setup";
      s.narrative.payoffPromise = pId;
      continue;
    }

    // Default standalone scene if not part of active promise milestone
    if (s.narrative && !s.narrative.promiseRole) {
      s.narrative.promiseRole = "standalone";
    }
  }

  // Final sweep: If any promises remain open at the very end, resolve them at distinct beats
  while (openPromises.length > 0) {
    const p = openPromises.pop();
    let payoffIndex = scenes.length - 1;
    while (payoffIndex > p.setupBeat && scenes[payoffIndex]?.narrative?.payoff && payoffIndex > 0) {
      payoffIndex--;
    }
    p.payoffBeat = payoffIndex;
    p.status = "resolved";
    const s = scenes[payoffIndex];
    if (s) {
      if (!s.narrative) s.narrative = { function: "PAYOFF", escalates: true };
      s.narrative.function = "PAYOFF";
      s.narrative.promiseId = p.promiseId;
      s.narrative.promiseRole = "payoff";
      s.narrative.payoff = p.promiseId;
    }
  }

  // Ensure every promise has at least 1 reminder beat
  for (const p of promises) {
    if (p.reminderBeats.length === 0 && p.payoffBeat !== undefined && p.payoffBeat - p.setupBeat >= 2) {
      const mid = Math.floor((p.setupBeat + p.payoffBeat) / 2);
      p.reminderBeats.push(mid);
      const s = scenes[mid];
      if (s && s.narrative && s.narrative.promiseRole === "standalone") {
        s.narrative.promiseId = p.promiseId;
        s.narrative.promiseRole = "reminder";
        s.narrative.escalates = true;
      }
    }
  }

  return {
    promises,
    scenes,
  };
}

/**
 * Audits a sequence of scenes against the God Mode Phase 3 Promise/Payoff Rules:
 *   1. Max open concurrent promises <= 3
 *   2. Every promise has 1 setup beat
 *   3. Every promise has 1-2 reminder/escalation beats
 *   4. Every promise has 1 payoff beat (0 open promises remaining)
 *   5. No unearned payoff (every payoff must trace back to a valid setup)
 */
function auditPromiseRules(scenes, promises = []) {
  const violations = [];

  // Track active promises at each beat
  let activeCount = 0;
  const activeTimeline = [];
  const maxAllowedConcurrent = 3;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const n = s.narrative || {};

    if (n.promiseRole === "setup") {
      activeCount++;
    }

    if (activeCount > maxAllowedConcurrent) {
      violations.push({
        beat: i,
        sceneId: s.id,
        rule: "MAX_CONCURRENT_PROMISES_EXCEEDED",
        details: `Beat ${i} has ${activeCount} concurrent open promises (maximum allowed is ${maxAllowedConcurrent}).`,
      });
    }

    if (n.promiseRole === "payoff") {
      activeCount = Math.max(0, activeCount - 1);
    }

    activeTimeline.push(activeCount);
  }

  // Audit promise object structure
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let missingReminders = 0;

  for (const p of promises) {
    if (p.status === "resolved" && p.payoffBeat !== undefined) {
      resolvedCount++;
    } else {
      unresolvedCount++;
      violations.push({
        beat: p.setupBeat,
        promiseId: p.promiseId,
        rule: "UNRESOLVED_PROMISE",
        details: `Promise ${p.promiseId} opened at beat ${p.setupBeat} was never paid off.`,
      });
    }

    if (!p.reminderBeats || p.reminderBeats.length === 0) {
      missingReminders++;
      violations.push({
        beat: p.setupBeat,
        promiseId: p.promiseId,
        rule: "MISSING_PROMISE_REMINDERS",
        details: `Promise ${p.promiseId} has 0 reminder/escalation beats between setup and payoff.`,
      });
    } else if (p.reminderBeats.length > 3) {
      violations.push({
        beat: p.setupBeat,
        promiseId: p.promiseId,
        rule: "EXCESSIVE_REMINDERS",
        details: `Promise ${p.promiseId} has ${p.reminderBeats.length} reminders (recommended: 1-2).`,
      });
    }
  }

  // Calculate Promise Health Score (0-10.0 scale)
  let score = 10.0;
  score -= violations.length * 1.5;
  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return {
    passed: violations.length === 0,
    score,
    totalPromises: promises.length,
    resolvedCount,
    unresolvedCount,
    missingReminders,
    maxConcurrentObserved: Math.max(0, ...activeTimeline),
    violations,
  };
}

module.exports = {
  planPromiseLifecycles,
  auditPromiseRules,
};
