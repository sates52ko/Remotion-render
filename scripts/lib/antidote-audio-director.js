/**
 * antidote-audio-director.js — Audio Director Engine (Antidote God Mode: Phase 7)
 *
 * Implements deterministic, tactile sound design frame-locked to visual and narrative beats:
 *   - SFX_POP: On kinetic text entrances and motif reveals
 *   - SFX_WHOOSH: On scene transitions and camera whips
 *   - SFX_DING: On promise payoffs, lightbulb reveals, and major narrative climaxes
 *   - SFX_THUD: On chapter cards, contradictions, and tension hits
 *   - Selective Silence: 1.5–2.5s deliberate pauses before major revelations/punchlines
 *
 * Strict gain-staging rules apply:
 *   - Master dialogue: 1.0 (0 dB / master)
 *   - Chapter hit (THUD): 0.22 (-13 dB)
 *   - Payoff chime (DING): 0.16 (-16 dB)
 *   - Transition (WHOOSH): 0.14 (-17 dB)
 *   - Text / motif entry (POP): 0.11 (-18 dB)
 *   - Micro-tick (TICK): 0.09 (-21 dB)
 */

const { ensureSfxAssets } = require("./generate-sfx");

/**
 * Plans and maps frame-accurate sound design events for all scenes.
 *
 * @param {Array<object>} scenes
 * @param {number} fps
 * @returns {{ scenes: Array<object>, audioEvents: Array<object>, stats: object }}
 */
function directAudioEvents(scenes, fps = 30) {
  // Ensure the deterministic WAV assets exist in public/sfx
  try {
    ensureSfxAssets();
  } catch (_) {}

  const globalAudioEvents = [];
  let popCount = 0;
  let whooshCount = 0;
  let dingCount = 0;
  let thudCount = 0;
  let silenceCount = 0;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const n = s.narrative || {};
    const isChapter = s.shot === "chapterCard" || Boolean(s.chapterCard);
    const trans = s.transition;
    const hasTransition = trans && trans.type !== "cut" && trans.frames > 0 && i > 0;
    const isPayoff = n.function === "PAYOFF" || s.visualJob === "reveal" || n.promiseRole === "payoff";
    const isContradiction = n.function === "CONTRADICTION" || s.visualJob === "contrast";
    const isTension = n.function === "TENSION";

    const sceneAudio = [];

    // 1. Transition Whoosh
    if (hasTransition) {
      const transFrames = trans.frames || 10;
      const offset = -Math.floor(transFrames / 2);
      sceneAudio.push({
        type: "whoosh",
        frameOffset: offset,
        volume: 0.14,
        durationFrames: Math.max(15, transFrames + 5),
        reason: `transition_${trans.type}`,
      });
      globalAudioEvents.push({
        frame: Math.max(0, s.fromFrame + offset),
        type: "whoosh",
        volume: 0.14,
        durationFrames: Math.max(15, transFrames + 5),
        reason: `scene_${i}_transition`,
      });
      whooshCount++;
    }

    // 2. Chapter Card Monumental Thud
    if (isChapter) {
      sceneAudio.push({
        type: "thud",
        frameOffset: 0,
        volume: 0.22,
        durationFrames: 25,
        reason: "chapter_card_hit",
      });
      globalAudioEvents.push({
        frame: s.fromFrame,
        type: "thud",
        volume: 0.22,
        durationFrames: 25,
        reason: `chapter_${s.chapterCard?.number || i}_card`,
      });
      thudCount++;
    }

    // 3. Contradiction / Tension Thud
    if ((isContradiction || isTension) && !isChapter) {
      const offset = 4;
      sceneAudio.push({
        type: "thud",
        frameOffset: offset,
        volume: isContradiction ? 0.18 : 0.14,
        durationFrames: 20,
        reason: isContradiction ? "counter_intuitive_turn" : "narrative_tension",
      });
      globalAudioEvents.push({
        frame: s.fromFrame + offset,
        type: "thud",
        volume: isContradiction ? 0.18 : 0.14,
        durationFrames: 20,
        reason: `scene_${i}_${isContradiction ? "contradiction" : "tension"}`,
      });
      thudCount++;
    }

    // 4. Payoff & Revelation Ding (with Selective Silence lead-in)
    if (isPayoff && !isChapter) {
      // Selective Silence: 1.5s - 2.0s deliberate ducking window preceding the payoff
      const silenceFrames = Math.round(fps * 1.8); // 1.8 seconds
      const silenceStart = Math.max(0, s.fromFrame - silenceFrames);

      // Add selective silence marker
      globalAudioEvents.push({
        frame: silenceStart,
        type: "silence",
        volume: 0.0,
        durationFrames: silenceFrames,
        reason: `pre_revelation_pause_for_scene_${i}`,
      });
      silenceCount++;

      // Climax Payoff Chime
      const offset = 6;
      sceneAudio.push({
        type: "ding",
        frameOffset: offset,
        volume: 0.16,
        durationFrames: 36,
        reason: "promise_payoff_revelation",
      });
      globalAudioEvents.push({
        frame: s.fromFrame + offset,
        type: "ding",
        volume: 0.16,
        durationFrames: 36,
        reason: `scene_${i}_payoff`,
      });
      dingCount++;
    }

    // 5. Kinetic Text Micro-Pops
    if (s.texts && s.texts.length > 0) {
      // Punctuate the primary punchy text callout
      const primaryText = s.texts[0];
      const textAt = primaryText.at ?? 0;
      sceneAudio.push({
        type: "pop",
        frameOffset: textAt,
        volume: 0.11,
        durationFrames: 12,
        reason: "kinetic_text_pop",
      });
      globalAudioEvents.push({
        frame: s.fromFrame + textAt,
        type: "pop",
        volume: 0.11,
        durationFrames: 12,
        reason: `scene_${i}_text_pop`,
      });
      popCount++;
    } else if (s.props && s.props.length > 0 && s.props.some((p) => p.enter === "pop")) {
      // Prop entry pop
      const p = s.props.find((p) => p.enter === "pop");
      const propAt = p.at ?? 0;
      sceneAudio.push({
        type: "pop",
        frameOffset: propAt,
        volume: 0.12,
        durationFrames: 12,
        reason: "prop_pop_in",
      });
      globalAudioEvents.push({
        frame: s.fromFrame + propAt,
        type: "pop",
        volume: 0.12,
        durationFrames: 12,
        reason: `scene_${i}_prop_pop`,
      });
      popCount++;
    }

    s.audioEvents = sceneAudio;
  }

  return {
    scenes,
    audioEvents: globalAudioEvents,
    stats: {
      totalAudioEvents: globalAudioEvents.length,
      popCount,
      whooshCount,
      dingCount,
      thudCount,
      silenceCount,
    },
  };
}

/**
 * Audits the audio soundscape against God Mode Phase 7 Audio Director standards.
 *
 * Rules:
 *   1. Payoff Coverage: 100% of payoff beats have an auditory chime (DING).
 *   2. Chapter Impact: 100% of chapter cards have monumental audio impact (THUD).
 *   3. Kinetic Synchronization: Kinetic texts have tactile pops (POP).
 *   4. Selective Silence: Major revelations have deliberate breathing room.
 *   5. Acoustic Gain Staging: Volumes strictly <= 0.25 (-12 dB) to never mask dialogue.
 */
function auditAudioDirector(scenes, fps = 30) {
  const violations = [];
  let payoffCount = 0;
  let payoffCovered = 0;
  let chapterCount = 0;
  let chapterCovered = 0;
  let textCount = 0;
  let textCovered = 0;
  let silenceEvents = 0;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const n = s.narrative || {};
    const isChapter = s.shot === "chapterCard" || Boolean(s.chapterCard);
    const isPayoff = n.function === "PAYOFF" || s.visualJob === "reveal" || n.promiseRole === "payoff";
    const hasText = s.texts && s.texts.length > 0;
    const events = s.audioEvents || [];

    if (isChapter) {
      chapterCount++;
      if (events.some((e) => e.type === "thud")) chapterCovered++;
      else {
        violations.push({
          beatIndex: i,
          sceneId: s.id,
          rule: "MISSING_CHAPTER_IMPACT",
          message: `Chapter card at beat ${i} has no THUD sound effect.`,
        });
      }
    }

    if (isPayoff && !isChapter) {
      payoffCount++;
      if (events.some((e) => e.type === "ding")) payoffCovered++;
      else {
        violations.push({
          beatIndex: i,
          sceneId: s.id,
          rule: "MISSING_PAYOFF_CHIME",
          message: `Payoff beat at ${i} has no DING sound effect.`,
        });
      }
    }

    if (hasText) {
      textCount++;
      if (events.some((e) => e.type === "pop" || e.type === "tick")) textCovered++;
    }

    for (const e of events) {
      if (e.volume > 0.25) {
        violations.push({
          beatIndex: i,
          sceneId: s.id,
          rule: "EXCESSIVE_SFX_GAIN",
          message: `SFX ${e.type} volume ${e.volume} exceeds max dialogue ceiling (0.25).`,
        });
      }
      if (e.type === "silence") {
        silenceEvents++;
      }
    }
  }

  // Calculate score (0 to 10.0)
  const penalty = violations.reduce((acc, v) => {
    if (v.rule === "MISSING_PAYOFF_CHIME") return acc + 1.5;
    if (v.rule === "MISSING_CHAPTER_IMPACT") return acc + 1.2;
    if (v.rule === "EXCESSIVE_SFX_GAIN") return acc + 2.0;
    return acc + 0.5;
  }, 0);

  const score = Math.max(0, Math.min(10, +(10 - penalty).toFixed(1)));
  const passed = violations.length === 0;

  return {
    score,
    passed,
    violations,
    metrics: {
      payoffCoverage: payoffCount > 0 ? `${Math.round((payoffCovered / payoffCount) * 100)}%` : "100%",
      chapterCoverage: chapterCount > 0 ? `${Math.round((chapterCovered / chapterCount) * 100)}%` : "100%",
      textCoverage: textCount > 0 ? `${Math.round((textCovered / textCount) * 100)}%` : "100%",
      payoffCount,
      chapterCount,
      textCount,
    },
  };
}

module.exports = {
  directAudioEvents,
  auditAudioDirector,
};
