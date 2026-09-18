"use strict";

/** Deterministic semantic-floor bridge; it emits overrides, never scenes. */
const COMPARATIVE_SHOTS = new Set(["split", "twoShot", "beforeAfter"]);

function hasComposition(direction, kind) {
  if (direction.diagram) return true;
  const shot = direction.shot || "";
  const castCount = Number(direction.cast && direction.cast.count) || 0;
  if (kind === "comparative") return COMPARATIVE_SHOTS.has(shot) && castCount >= 2;
  if (kind === "flow") return shot === "beforeAfter";
  return castCount >= 2;
}

function comparisonOverride(direction, archetype) {
  const roles = Array.isArray(direction.cast && direction.cast.roles) ? direction.cast.roles.slice(0, 2) : [];
  while (roles.length < 2) roles.push(roles.length === 0 ? "protagonist" : "foil");
  return {
    shot: "split",
    cast: {
      ...(direction.cast || {}), count: 2, crowd: 0, roles,
      // Planner applies this to character two: an active counterpart prevents
      // the comparison from degenerating into idle-actor wallpaper.
      secondaryAction: archetype === "allegory_equivalence" ? "point" : "talk",
    },
  };
}

function diagramOverride(type, title, labels) {
  return {
    shot: "insert", cast: { count: 0, crowd: 0, roles: [] }, props: [], concept: null,
    diagram: { type, title, labels, values: [], at: 4, scale: 1 },
  };
}

/**
 * Precedence: an authored or already-valid composition wins. Only a missing
 * semantic grammar gets an override. Static reflection gets no fallback.
 */
function buildDirectorOverrides({ intent, direction, authoredDiagram = false }) {
  const archetype = intent && intent.archetype;
  const requiredActions = (intent && intent.requiredActions) || [];
  const base = { override: null, reason: "no_semantic_requirement", archetype, requiredActions };
  if (!archetype || archetype === "static_reflection") return base;
  if (authoredDiagram) return { ...base, reason: "preserved_authored_composition" };

  if (archetype === "contrast" || archetype === "allegory_equivalence") {
    if (hasComposition(direction, "comparative")) return { ...base, reason: "preserved_existing_comparison" };
    return { ...base, reason: "added_comparative_floor", override: comparisonOverride(direction, archetype) };
  }
  if (archetype === "cause_effect" || archetype === "transformation") {
    if (hasComposition(direction, "flow")) return { ...base, reason: "preserved_existing_flow" };
    return { ...base, reason: "added_causal_flow_floor", override: diagramOverride("flow", "TRIGGER → CONSEQUENCE", ["TRIGGER", "CONSEQUENCE"]) };
  }
  if (archetype === "character_psychology") {
    if (hasComposition(direction, "tension")) return { ...base, reason: "preserved_existing_tension" };
    return { ...base, reason: "added_internal_tension_floor", override: diagramOverride("spectrum", "INNER TENSION", ["DENIAL", "REALIZATION"]) };
  }
  return base;
}

function applyDirectorOverrides(direction, result) {
  if (!result || !result.override) return direction;
  const override = result.override;
  return {
    ...direction, ...override,
    cast: override.cast ? { ...(direction.cast || {}), ...override.cast } : direction.cast,
    props: Object.prototype.hasOwnProperty.call(override, "props") ? override.props : direction.props,
  };
}

module.exports = { buildDirectorOverrides, applyDirectorOverrides };
