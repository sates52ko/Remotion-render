/**
 * antidote-chapter-arcs.js — Chapter-Level Narrative Arc Engine
 *
 * Antidote God Mode — Phase 6:
 * Structures each chapter as a self-contained curiosity cycle:
 *   1. Chapter Card (New Curiosity Cycle Beginning, not just a static title)
 *   2. 1 Macro Question (Opens chapter curiosity gap)
 *   3. 2-3 Supporting Principles (Deconstructs mechanics / explanation)
 *   4. 1 Counter-Intuitive Turn (Contradiction / paradox / contrast)
 *   5. 1 Memorable Visual Payoff (Hero diagram or dynamic metaphor payoff)
 */

const fs = require("fs");
const path = require("path");

/**
 * Plans and aligns chapter-level narrative arcs across scenes.
 */
function planChapterArcs(scenes, chapters = [], fps = 30) {
  if (!scenes || scenes.length === 0) return { scenes, chapterArcs: [] };

  // Faz 0 (2026-09-24): chapter CARDS come only from authored chapters. With
  // none, the engine invented "PART 02" every ~160s and stamped it over an
  // authored beat (WWL pilot: the struck "BREEZY ROMANCE" beat became a card).
  // Invented boundaries still structure the narrative functions below.
  const inventedChapters = !chapters || chapters.length === 0;
  const filmEnd = scenes[scenes.length - 1].fromFrame + scenes[scenes.length - 1].durationFrames;
  // ...and a chapter that starts after the film ends must not snap onto the last scene.
  let activeChapters = inventedChapters ? chapters : chapters.filter((ch) => ch.t * fps < filmEnd);
  const cardsAllowed = !inventedChapters && activeChapters.length > 0;
  if (!activeChapters || activeChapters.length === 0) {
    const totalSecs = (scenes[scenes.length - 1].fromFrame + scenes[scenes.length - 1].durationFrames) / fps;
    const numChaps = Math.max(2, Math.floor(totalSecs / 160));
    const secPerChap = totalSecs / numChaps;
    activeChapters = [];
    for (let c = 0; c < numChaps; c++) {
      activeChapters.push({
        t: Math.round(c * secPerChap),
        label: `PART ${String(c + 1).padStart(2, "0")}`,
      });
    }
  }

  // Map chapters to scene indices
  const chapterBoundaries = [];
  for (let c = 0; c < activeChapters.length; c++) {
    const ch = activeChapters[c];
    const targetFrame = ch.t * fps;
    // Find closest scene whose fromFrame is near targetFrame
    let bestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < scenes.length; i++) {
      const diff = Math.abs(scenes[i].fromFrame - targetFrame);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = i;
      }
    }
    chapterBoundaries.push({
      chapterIndex: c + 1,
      title: ch.label,
      startSceneIdx: bestIdx,
    });
  }

  // Sort and deduplicate scene indices
  chapterBoundaries.sort((a, b) => a.startSceneIdx - b.startSceneIdx);
  const dedupedBoundaries = [];
  let lastIdx = -1;
  for (const b of chapterBoundaries) {
    if (b.startSceneIdx > lastIdx) {
      dedupedBoundaries.push(b);
      lastIdx = b.startSceneIdx;
    }
  }

  // Calculate chapter ranges [startIdx, endIdx]
  const chapterArcs = [];
  const skippedCards = [];
  for (let k = 0; k < dedupedBoundaries.length; k++) {
    const startIdx = dedupedBoundaries[k].startSceneIdx;
    const endIdx = (k < dedupedBoundaries.length - 1) ? dedupedBoundaries[k + 1].startSceneIdx - 1 : scenes.length - 1;
    chapterArcs.push({
      chapterNumber: String(k + 1).padStart(2, "0"),
      title: dedupedBoundaries[k].title,
      startIdx,
      endIdx,
      length: endIdx - startIdx + 1,
    });
  }

  // Structure each chapter's internal narrative arc
  for (const arc of chapterArcs) {
    const { startIdx, endIdx, length, chapterNumber, title } = arc;
    if (length < 2) continue;

    // 1. Beat 0: Chapter Card as Curiosity Beginning
    const cardScene = scenes[startIdx];
    // A card REPLACES the whole scene (Scene.tsx draws scene.chapterCard instead of its staging). Never on an
    // authored beat (invariant 1: burn 217/236, the-courage-to-be-disliked 19/19 cards hid authored beats), never
    // untitled (a bare "CHAPTER 16" says nothing). Skipped cards are reported, not moved onto another beat.
    const cardOnAuthored = !!(cardScene && cardScene._authorship && cardScene._authorship.src === "art");
    const untitled = !String(title || "").trim();
    if (startIdx > 0 && cardsAllowed && (cardOnAuthored || untitled)) {
      skippedCards.push({ chapter: chapterNumber, sceneId: cardScene && cardScene.id, reason: cardOnAuthored ? "authored beat" : "untitled chapter" });
    } else if (startIdx > 0 && cardsAllowed) {
      cardScene.shot = "chapterCard";
      cardScene.chapterCard = {
        category: "CHAPTER",
        number: chapterNumber,
        title: String(title || "").toUpperCase(),
        // No subtitle: the constant "A NEW MENTAL MODEL" sat under every chapter
        // of every book. ChapterCard renders the title alone.
      };
      if (!cardScene.narrative) cardScene.narrative = { function: "TRANSITION", escalates: false };
      cardScene.narrative.function = "TRANSITION";
      cardScene.narrative.escalates = false;
    }

    // 2. Beat 1: Macro Question / Curiosity Opening
    const questionIdx = Math.min(endIdx, startIdx + 1);
    const qScene = scenes[questionIdx];
    if (qScene) {
      if (!qScene.narrative) qScene.narrative = { function: "QUESTION", escalates: true };
      qScene.narrative.function = "QUESTION";
      qScene.narrative.escalates = true;
      qScene.visualJob = "surprise";
    }

    // 3. Middle Beats: 1-2 Supporting Principles alternating with tension/setup (No 3 consecutive EXPLANATIONs!)
    const turnIdx = (length >= 4) ? endIdx - 1 : Math.min(endIdx, questionIdx + 1);

    for (let m = questionIdx + 1; m < turnIdx; m++) {
      if (scenes[m]) {
        if (!scenes[m].narrative) scenes[m].narrative = { function: "EXPLANATION", escalates: false };
        const offset = m - (questionIdx + 1);
        if (offset % 2 === 0) {
          scenes[m].narrative.function = "EXPLANATION";
          scenes[m].narrative.escalates = false;
        } else {
          scenes[m].narrative.function = (offset % 4 === 1) ? "TENSION" : "SETUP";
          scenes[m].narrative.escalates = true;
        }
      }
    }

    // 4. Turn Beat: 1 Counter-Intuitive Turn (~60% into chapter)
    const turnScene = scenes[turnIdx];
    if (turnScene && turnIdx > questionIdx) {
      if (!turnScene.narrative) turnScene.narrative = { function: "CONTRADICTION", escalates: true };
      turnScene.narrative.function = "CONTRADICTION";
      turnScene.narrative.escalates = true;
      turnScene.visualJob = "contrast";
      // Faz 0: an authored beat keeps its composition — the arc may tag it, not re-shoot it.
      const authoredBeat = turnScene._authorship && turnScene._authorship.src !== "none";
      if (!authoredBeat && !turnScene.diagram && !["split", "beforeAfter", "twoShot"].includes(turnScene.shot)) {
        turnScene.shot = "split";
      }
    }

    // 5. Climax Beat: 1 Memorable Visual Payoff (Last beat of chapter)
    const payoffScene = scenes[endIdx];
    if (payoffScene && endIdx > turnIdx) {
      if (!payoffScene.narrative) payoffScene.narrative = { function: "PAYOFF", escalates: true };
      payoffScene.narrative.function = "PAYOFF";
      payoffScene.narrative.escalates = true;
      payoffScene.visualJob = "reveal";
      if (!payoffScene.diagram && !payoffScene._noIcon && (!payoffScene.props || payoffScene.props.length === 0)) {
        payoffScene.props = [
          {
            type: "lightbulb",
            x: 960,
            y: 540,
            scale: 1.2,
            enter: "pop",
            at: 6,
            arc: "grow",
          },
        ];
      }
    }
  }

  // Escalation Watchdog: Ensure no stretch between escalating beats exceeds 22 seconds
  let lastEscFrame = 0;
  let curFrame = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = s.durationFrames || (fps * 7);
    if (!s.narrative) s.narrative = { function: "EXPLANATION", escalates: false };
    if (s.narrative.escalates) {
      lastEscFrame = curFrame + dur;
    } else {
      const gapSecs = (curFrame + dur - lastEscFrame) / fps;
      if (gapSecs >= 22) {
        s.narrative.escalates = true;
        lastEscFrame = curFrame + dur;
      }
    }
    curFrame += dur;
  }

  if (skippedCards.length) {
    const why = (r) => skippedCards.filter((x) => x.reason === r).map((x) => `${x.chapter}@${x.sceneId}`);
    const a = why("authored beat"), u = why("untitled chapter");
    if (a.length) console.warn(`  ⚠ chapter cards not placed on authored beats (a card would replace the beat): ${a.join(", ")}`);
    if (u.length) console.warn(`  ⚠ chapter cards not placed — chapter has no title (refine youtube-meta chapters): ${u.join(", ")}`);
  }
  return {
    scenes,
    chapterArcs,
    skippedCards,
  };
}

/**
 * Audits chapter-level narrative arcs.
 * Checks for:
 *   - 1 Macro question per chapter
 *   - At least 2 supporting principles (EXPLANATION/SETUP)
 *   - 1 Counter-intuitive turn (CONTRADICTION)
 *   - 1 Memorable payoff (PAYOFF/REVEAL)
 */
function auditChapterArcs(scenes, chapters = [], fps = 30) {
  const { chapterArcs } = planChapterArcs(scenes, chapters, fps);
  const violations = [];
  const arcReports = [];

  for (const arc of chapterArcs) {
    const { chapterNumber, title, startIdx, endIdx, length } = arc;
    const subScenes = scenes.slice(startIdx, endIdx + 1);

    let hasQuestion = false;
    let explanationCount = 0;
    let hasContradiction = false;
    let hasPayoff = false;

    for (let i = 0; i < subScenes.length; i++) {
      const s = subScenes[i];
      const func = s.narrative?.function || "EXPLANATION";
      if (func === "QUESTION" || func === "HOOK") hasQuestion = true;
      if (["EXPLANATION", "SETUP"].includes(func)) explanationCount++;
      if (func === "CONTRADICTION" || s.visualJob === "contrast") hasContradiction = true;
      if (["PAYOFF", "REVEAL"].includes(func) || s.visualJob === "reveal") hasPayoff = true;
    }

    const minExplanations = length >= 7 ? 2 : (length >= 5 ? 1 : 0);
    const missing = [];
    if (!hasQuestion && length >= 3) missing.push("MACRO_QUESTION");
    if (explanationCount < minExplanations) missing.push(`SUPPORTING_PRINCIPLES (<${minExplanations})`);
    if (!hasContradiction && length >= 4) missing.push("COUNTER_INTUITIVE_TURN");
    if (!hasPayoff && length >= 3) missing.push("MEMORABLE_PAYOFF");

    if (missing.length > 0 && length >= 4) {
      violations.push({
        chapterNumber,
        title,
        scenesRange: `${startIdx}..${endIdx}`,
        missing,
      });
    }

    arcReports.push({
      chapterNumber,
      title,
      length,
      hasQuestion,
      explanationCount,
      hasContradiction,
      hasPayoff,
      isCoherent: missing.length === 0,
    });
  }

  let score = 10.0;
  score -= violations.length * 1.5;
  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return {
    passed: violations.length === 0,
    score,
    totalChapters: chapterArcs.length,
    violations,
    arcReports,
  };
}

module.exports = {
  planChapterArcs,
  auditChapterArcs,
};
