#!/usr/bin/env node
/**
 * plan-sequence-arcs.js — Macro Sequence Arcs & Curiosity Gap Planner
 *
 * Groups scenes into 25–45 second narrative sequences (typically 3–6 scenes).
 * Orchestrates macro curiosity cycles across the film:
 *   SETUP → QUESTION → PARTIAL_ANSWER → COMPLICATION → REVEAL
 *
 * Usage:
 *   node scripts/plan-sequence-arcs.js --slug=<slug> [--out=<path>]
 */

const fs = require("fs");
const path = require("path");
const { abs, rel } = require("./lib/paths");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const SLUG = args.slug;
// set by main() from the config; the planner functions below are exported for tests
let FPS = 30;

const MIN_SEQ_SECS = 22;
const TARGET_SEQ_SECS = 32;
const MAX_SEQ_SECS = 48;

const QUESTION_RE = /\?\s*$|\b(why|how come|what if|imagine|ask yourself|the problem is|the question is|why do we|how do we)\b/i;
const COMPLICATION_RE = /\b(but|however|instead|trap|fail|struggle|worse|friction|emotional|harder|resist|overwhelm)\b/i;
const REVEAL_RE = /\b(truth is|key is|secret|turns out|breakthrough|actually|solution|shift|answer|rule|law|when you)\b/i;

// AUTHORED SEQUENCES (2026-10-20, plan P1): a run of beats the storyboard author linked with `continue: true`
// (art.json -> continueFromPrev, sealed in _authorship.lock.continue) IS a sequence: its first beat sets the stage,
// every continued beat keeps it. Its boundaries and roles come from the author — the engine assigns no curiosity
// role (no invented question / reveal) inside it, and the duration clustering below never splits or absorbs it.
// `relationToPrevious` / `explainedBy` are free text: reading roles out of them would be the engine guessing again.
const authoredContinue = (s) => !!(s && s.continueFromPrev === true && s._authorship && s._authorship.lock && s._authorship.lock.continue === true);
function authoredRuns(scenes) {
  const runOf = new Map(); // scene index -> run id
  const runs = [];
  for (let i = 1; i < scenes.length; i++) {
    if (!authoredContinue(scenes[i])) continue;
    let run = runOf.get(i - 1);
    if (run == null) { run = runs.length; runs.push([i - 1]); runOf.set(i - 1, run); }
    runs[run].push(i); runOf.set(i, run);
  }
  return { runs, runOf };
}

function clusterSequences(scenes) {
  const sequences = [];
  let currentScenes = [];
  let currentFrames = 0;
  const { runs, runOf } = authoredRuns(scenes);

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (runOf.has(i)) {
      // an authored run: flush the engine cluster, add the run as it is, skip past it
      if (currentScenes.length) { sequences.push(currentScenes); currentScenes = []; currentFrames = 0; }
      const run = runs[runOf.get(i)];
      const seq = run.map((k) => ({ scene: scenes[k], index: k }));
      seq.authored = true;
      sequences.push(seq);
      i = run[run.length - 1];
      continue;
    }
    const isChapter = !!s.chapterCard || s.shot === "chapterCard";
    const durSec = s.durationFrames / FPS;

    // Start a fresh sequence if we hit a chapterCard or if the current sequence reaches capacity
    if (currentScenes.length > 0) {
      const wouldExceedMax = (currentFrames + s.durationFrames) / FPS > MAX_SEQ_SECS;
      const targetReached = currentFrames / FPS >= TARGET_SEQ_SECS;

      if (isChapter || wouldExceedMax || (targetReached && currentScenes.length >= 3)) {
        sequences.push(currentScenes);
        currentScenes = [];
        currentFrames = 0;
      }
    }

    currentScenes.push({ scene: s, index: i });
    currentFrames += s.durationFrames;
  }

  if (currentScenes.length > 0) {
    sequences.push(currentScenes);
  }

  return sequences;
}

function assignSequenceRoles(seqScenes, seqIdx) {
  const count = seqScenes.length;
  const seqFrom = seqScenes[0].scene.fromFrame;
  const lastScene = seqScenes[count - 1].scene;
  const seqDuration = lastScene.fromFrame + lastScene.durationFrames - seqFrom;
  const seqSecs = Math.round((seqDuration / FPS) * 10) / 10;

  if (seqScenes.authored) {
    // the author's sequence: "authored-start" sets the stage, "authored-kept" continues it. No curiosity arc.
    return {
      id: `seq-${String(seqIdx + 1).padStart(2, "0")}`,
      source: "authored",
      fromFrame: seqFrom,
      durationFrames: seqDuration,
      durationSeconds: seqSecs,
      sceneCount: count,
      curiosityArc: [],
      beats: seqScenes.map((item, idx) => ({
        index: item.index,
        sceneId: item.scene.id,
        fromFrame: item.scene.fromFrame,
        durationFrames: item.scene.durationFrames,
        role: idx === 0 ? "authored-start" : "authored-kept",
        narration: (item.scene._narration || "").slice(0, 100),
      })),
    };
  }

  // Identify curiosity hooks
  let questionIdx = -1;
  let revealIdx = -1;

  seqScenes.forEach((item, idx) => {
    const text = item.scene._narration || "";
    if (questionIdx === -1 && idx > 0 && idx < count - 1 && QUESTION_RE.test(text)) {
      questionIdx = idx;
    }
    if (idx >= count - 2 && REVEAL_RE.test(text)) {
      revealIdx = idx;
    }
  });

  // Assign roles based on position and narrative markers
  const beats = seqScenes.map((item, idx) => {
    let role = "setup";
    if (count === 1) {
      role = "reveal";
    } else if (idx === 0) {
      role = "setup";
    } else if (idx === count - 1) {
      role = "reveal";
    } else if (idx === questionIdx || (questionIdx === -1 && idx === 1)) {
      role = "question";
    } else if (idx === count - 2 || COMPLICATION_RE.test(item.scene._narration || "")) {
      role = "complication";
    } else {
      role = "partial_answer";
    }

    return {
      index: item.index,
      sceneId: item.scene.id,
      fromFrame: item.scene.fromFrame,
      durationFrames: item.scene.durationFrames,
      role,
      narration: (item.scene._narration || "").slice(0, 100),
    };
  });

  return {
    id: `seq-${String(seqIdx + 1).padStart(2, "0")}`,
    source: "engine", // fallback: no authored sequence here — duration grouping + position/regex roles
    fromFrame: seqFrom,
    durationFrames: seqDuration,
    durationSeconds: seqSecs,
    sceneCount: count,
    curiosityArc: ["setup", "question", "partial_answer", "complication", "reveal"].slice(0, count),
    beats,
  };
}

function planSequences(scenes, fps = 30) {
  FPS = fps;
  return clusterSequences(scenes).map((c, i) => assignSequenceRoles(c, i));
}

function main() {
  if (!SLUG) {
    console.error("Usage: node scripts/plan-sequence-arcs.js --slug=<slug>");
    process.exit(1);
  }
  const configPath = abs.antidoteConfig(SLUG);
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Config not found at ${configPath}`);
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const scenes = config.scenes || [];
  const sequenceArcs = planSequences(scenes, (config.meta && config.meta.fps) || 30);

  const outPath = args.out || path.join(path.dirname(configPath), "sequence-arcs.json");
  const payload = {
    slug: SLUG,
    totalSequences: sequenceArcs.length,
    totalScenes: scenes.length,
    averageDurationSecs: Math.round((config.meta.durationInFrames / FPS / sequenceArcs.length) * 10) / 10,
    sequences: sequenceArcs,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n✓ Sequence Arcs planned: ${outPath}`);
  console.log(`  Total Sequences:   ${sequenceArcs.length}`);
  console.log(`  Total Scenes:      ${scenes.length}`);
  console.log(`  Avg Sequence Time: ${payload.averageDurationSecs}s (~3–5 scenes per arc)`);
  const authored = sequenceArcs.filter((q) => q.source === "authored");
  console.log(`  Authored (continue runs): ${authored.length} sequence(s), ${authored.reduce((n, q) => n + q.sceneCount, 0)} scenes — no engine roles\n`);
}

if (require.main === module) main();
module.exports = { planSequences, authoredRuns, authoredContinue };
