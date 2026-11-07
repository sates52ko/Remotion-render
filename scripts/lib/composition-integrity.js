"use strict";

/**
 * composition-integrity.js — no gate may be passed by DELETING what was planned.
 *
 * 2026-09-23 (show-your-work): the firewall went green after a session deleted
 * `props` from all 239 scenes, remapped motif types to arbitrary shared motifs
 * and re-ran inject-provenance over the result. Every check that loops over
 * `scene.props || []` passes vacuously on an empty scene, and there was no
 * record of what the planner had produced, so nothing could tell.
 *
 * This is NOT a quota. It never asks a scene to have an icon. It compares the
 * config with the pipeline's OWN output (the manifest make-book writes after the
 * last automated writer) and fails when content was removed or remapped by
 * hand without a recorded reason. Re-planning writes a fresh manifest.
 */

const crypto = require("crypto");

const fp = (text) => crypto.createHash("sha1").update(String(text || "")).digest("hex").slice(0, 10);

function sceneShape(scene) {
  return {
    fp: fp(scene._narration || ""),
    props: (scene.props || []).map((p) => p && p.type).filter(Boolean),
    texts: (scene.texts || []).filter((t) => t && t.text).length,
    diagram: scene.diagram ? scene.diagram.type || "diagram" : null,
    characters: (scene.characters || []).length,
    concept: scene.concept || null,
    set: (scene.bg && scene.bg.set) || null,
  };
}

const hasContent = (sh) => sh.props.length > 0 || sh.texts > 0 || !!sh.diagram || sh.characters > 0 || !!sh.concept;

/** @returns manifest object (caller writes it) */
function snapshot(config, { reason = "pipeline", previous = null } = {}) {
  const scenes = {};
  for (const s of config.scenes || []) scenes[s.id] = sceneShape(s);
  const history = [...((previous && previous.history) || []), { at: new Date().toISOString(), reason, scenes: Object.keys(scenes).length }];
  return { version: 1, slug: config.meta && config.meta.slug, generatedAt: new Date().toISOString(), history, scenes };
}

// Thresholds are book-level so a handful of deliberate art-direction edits
// (Claude removing one weak icon) never trip them; a sweep does.
const LIMITS = { emptiedScenes: 3, propLossRatio: 0.25, remapRatio: 0.2 };

function compare(config, manifest) {
  const violations = [];
  if (!manifest || !manifest.scenes) {
    return { status: "WARN", violations: [{ code: "MANIFEST_MISSING", message: "no plan-manifest.json — config predates the composition-integrity check; re-plan or snapshot with a reason" }] };
  }
  let planned = 0, now = 0, remapped = 0, comparable = 0;
  const emptied = [];
  for (const s of config.scenes || []) {
    const before = manifest.scenes[s.id];
    if (!before) continue;
    const after = sceneShape(s);
    if (before.fp !== after.fp) continue; // different beat (re-timed) — not comparable
    comparable++;
    planned += before.props.length;
    now += after.props.length;
    if (hasContent(before) && !hasContent(after)) emptied.push(s.id);
    if (before.props.length && after.props.length && before.props.join("|") !== after.props.join("|")) remapped++;
  }
  if (emptied.length > LIMITS.emptiedScenes) {
    violations.push({ code: "COMPOSITION_REMOVED", message: `${emptied.length} scenes emptied after planning (e.g. ${emptied.slice(0, 5).join(", ")}) — deletion is not a fix` });
  }
  if (planned > 0 && (planned - now) / planned > LIMITS.propLossRatio) {
    violations.push({ code: "COMPOSITION_REMOVED", message: `${planned - now}/${planned} planned props removed after planning (${Math.round(((planned - now) / planned) * 100)}%)` });
  }
  if (comparable > 0 && remapped / comparable > LIMITS.remapRatio) {
    violations.push({ code: "COMPOSITION_REMAPPED", message: `motif types changed on ${remapped}/${comparable} scenes after planning — a bulk remap hides the original mismatch instead of fixing it` });
  }
  return { status: violations.length ? "FAIL" : "PASS", comparable, plannedProps: planned, currentProps: now, emptied: emptied.length, remapped, violations };
}

module.exports = { snapshot, compare, sceneShape, LIMITS };
