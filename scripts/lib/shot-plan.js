/**
 * shot-plan.js — C19 (2026-11-07): one narrated beat → consecutive SHOTS cut at the narrator's own words, so the
 * viewer follows an action and its result across cuts (Stickman Video Director's short shot list, done on the
 * existing Antidote scene model — no new renderer, no new framework).
 *
 *   splitBeat(config, sceneIndex, shots) → scenes[]   (pure; the caller puts them in place of the beat)
 *   shots = [{ at: "<narration words>" | <scene frame> (first shot: 0), scene: { …Antidote scene fields },
 *              cues: { "<characterIndex>": "<narration words>" } }]
 *
 * Every shot keeps the beat's narration, HUD, beat / act records and its share of the audio events; the beat's
 * frames are covered exactly (the shots tile [fromFrame, fromFrame + durationFrames)). A cut word is looked for strictly
 * AFTER the previous cut (a phrase said twice — "You … You … You" — is matched in order). `cues` puts a character's action moment (actionAt) on
 * the frame its word is said, relative to the shot. A word the timings do not contain throws — a shot is never cut
 * at a guessed moment.
 */
"use strict";
const { findPhrase } = require("./semantic-director");

/** the narrator's words inside a scene, in SCENE frames */
function wordsOf(config, scene) {
  const a = scene.fromFrame, b = scene.fromFrame + scene.durationFrames;
  return (config.captions || []).flatMap((c) => c.words || []).filter((w) => w && w.s >= a && w.s < b).map((w) => ({ w: w.w, s: w.s - a }));
}

const KEEP = ["hud", "_narration", "_beat", "_act", "_authorship", "narrativeAtom", "visualIntent", "visualContract"];

function splitBeat(config, sceneIndex, shots) {
  const base = config.scenes[sceneIndex];
  if (!base) throw new Error(`no scene ${sceneIndex}`);
  if (!Array.isArray(shots) || !shots.length) throw new Error("a shot plan needs at least one shot");
  const words = wordsOf(config, base);
  const starts = [];
  let after = -Infinity;
  for (const [k, sh] of shots.entries()) {
    let at;
    if (k === 0) at = 0;
    else if (typeof sh.at === "number") at = sh.at;
    else { at = findPhrase(words, sh.at, after + 1); if (at == null) throw new Error(`shot ${k}: "${sh.at}" is not in the word timings of scene ${sceneIndex} after frame ${after}`); }
    if (k > 0 && at <= starts[k - 1]) throw new Error(`shot ${k}: cut at ${at} is not after the previous cut (${starts[k - 1]})`);
    if (at >= base.durationFrames) throw new Error(`shot ${k}: cut at ${at} is past the beat (${base.durationFrames} frames)`);
    starts.push(at); after = at;
  }
  return shots.map((sh, k) => {
    const s0 = starts[k], s1 = k + 1 < starts.length ? starts[k + 1] : base.durationFrames;
    const keep = Object.fromEntries(KEEP.filter((f) => base[f] !== undefined).map((f) => [f, base[f]]));
    const audioEvents = (base.audioEvents || []).filter((e) => (e.at ?? e.frame ?? 0) >= s0 && (e.at ?? e.frame ?? 0) < s1).map((e) => ({ ...e, ...(e.at != null ? { at: e.at - s0 } : {}), ...(e.frame != null ? { frame: e.frame - s0 } : {}) }));
    const scene = { ...keep, ...JSON.parse(JSON.stringify(sh.scene || {})), id: `${base.id}-shot${k + 1}`, fromFrame: base.fromFrame + s0, durationFrames: s1 - s0, ...(audioEvents.length ? { audioEvents } : {}) };
    if (k > 0 && !(sh.scene && sh.scene.transition)) scene.transition = { type: "cut", frames: 0 };
    if (k === 0 && !(sh.scene && sh.scene.transition) && base.transition) scene.transition = base.transition;
    for (const [ci, phrase] of Object.entries(sh.cues || {})) {
      const f = findPhrase(words, phrase, s0);
      if (f == null || f >= s1) throw new Error(`shot ${k}: cue "${phrase}" for character ${ci} is not said inside the shot (${s0}–${s1})`);
      if (!scene.characters || !scene.characters[ci]) throw new Error(`shot ${k}: no character ${ci} for cue "${phrase}"`);
      scene.characters[ci].actionAt = f - s0;
      scene.characters[ci].cueExact = true;
    }
    scene._shotPlan = { beat: base.id, shot: k + 1, of: shots.length, cutAt: k === 0 ? null : sh.at, frames: [s0, s1] };
    return scene;
  });
}

/** replace beats by their shots, re-indexing nothing else (frames stay; scene ids gain -shotN) */
function applyPlan(config, plan) {
  const byIdx = new Map(plan.map((p) => [p.sceneIndex, p.shots]));
  const scenes = [];
  for (const [i, s] of config.scenes.entries()) { if (byIdx.has(i)) scenes.push(...splitBeat(config, i, byIdx.get(i))); else scenes.push(s); }
  return { ...config, scenes };
}

module.exports = { splitBeat, applyPlan, wordsOf };
