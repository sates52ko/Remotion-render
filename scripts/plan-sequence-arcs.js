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
const FPS = (config.meta && config.meta.fps) || 30;
const scenes = config.scenes || [];

const MIN_SEQ_SECS = 22;
const TARGET_SEQ_SECS = 32;
const MAX_SEQ_SECS = 48;

const QUESTION_RE = /\?\s*$|\b(why|how come|what if|imagine|ask yourself|the problem is|the question is|why do we|how do we)\b/i;
const COMPLICATION_RE = /\b(but|however|instead|trap|fail|struggle|worse|friction|emotional|harder|resist|overwhelm)\b/i;
const REVEAL_RE = /\b(truth is|key is|secret|turns out|breakthrough|actually|solution|shift|answer|rule|law|when you)\b/i;

function clusterSequences(scenes) {
  const sequences = [];
  let currentScenes = [];
  let currentFrames = 0;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
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
    fromFrame: seqFrom,
    durationFrames: seqDuration,
    durationSeconds: seqSecs,
    sceneCount: count,
    curiosityArc: ["setup", "question", "partial_answer", "complication", "reveal"].slice(0, count),
    beats,
  };
}

function main() {
  const clusters = clusterSequences(scenes);
  const sequenceArcs = clusters.map((c, i) => assignSequenceRoles(c, i));

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
  console.log(`  Avg Sequence Time: ${payload.averageDurationSecs}s (~3–5 scenes per arc)\n`);
}

main();
