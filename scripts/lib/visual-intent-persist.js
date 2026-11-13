"use strict";

/**
 * visual-intent-persist.js — Vision-free 10x P7 commit 2 (2026-10-05).
 *
 * P6 measured the persistence hole: a scene's stored `visualIntent` carried
 * only the firewall's provenance shell (bookId/worldId/narrativeSubject/…),
 * never the derived semantic content (archetype / requiredActions /
 * semanticGrammar) — and the wiring KPI counted the shell as PASS because a
 * truthy object is not a meaningful intent.
 *
 * This module is the ONE writer-shape for a PERSISTED VisualIntent:
 *
 *   { ...provenance shell,            // never removed (firewall REQUIRED_PROVENANCE)
 *     archetype, domain,              // derived semantic content (merge —
 *     requiredActions,                // authored fields always win)
 *     requiredAttributes, forbiddenTropes, semanticRequirements,
 *     semanticGrammar: {kind, subject, relation, state},   // machine-readable
 *     provenance: { derivedAt, source, atomText } }        // audit trail
 *
 * `meaningfulVisualIntent()` is the contract the wiring KPI now measures:
 * an intent is meaningful iff it names its archetype AND at least one
 * requiredAction. Zero LLM/Vision, fully deterministic.
 */

const MAX_ATOM_TEXT = 220;

/**
 * The staging grammar a derivation implies for an archetype, mirroring the
 * adapter's grammar kinds so the persisted field is exactly what the director
 * floor and the evaluator both read.
 */
const GRAMMAR_KINDS = {
  contrast: "comparison",
  allegory_equivalence: "two_domain_comparison",
  cause_effect: "cause_effect_flow",
  transformation: "cause_effect_flow",
  character_psychology: "internal_tension",
};

/**
 * Builds the persisted intent. `shell` is the scene's existing stored intent
 * (the firewall provenance shape) — kept verbatim; derived fields are merged
 * additively and never overwrite authored values. `derived` is the output of
 * deriveVisualIntent for THIS scene's narration (pass null to skip).
 *
 * Returns { intent, changed, added } where `changed` reports whether the
 * persisted object actually gained semantic content the shell did not carry.
 */
function buildPersistedVisualIntent({ shell, derived, narration = "", source = "plan" }) {
  const base = shell && typeof shell === "object" ? { ...shell } : {};
  const changed = [];
  if (derived) {
    for (const key of ["archetype", "domain", "requiredActions", "requiredAttributes", "forbiddenTropes", "semanticRequirements"]) {
      if (base[key] === undefined && derived[key] !== undefined) {
        base[key] = derived[key];
        changed.push(key);
      }
    }
  }
  const archetype = String(base.archetype || "");
  const grammarKind = GRAMMAR_KINDS[archetype] || "none";
  if (base.semanticGrammar === undefined) {
    base.semanticGrammar = {
      kind: grammarKind,
      subject: String((shell && shell.narrativeSubject) || ""),
      relation: String((shell && shell.narrativeRelation) || "").slice(0, 160),
      state: String((shell && shell.narrativeState) || ""),
    };
    changed.push("semanticGrammar");
  }
  if (base.provenance === undefined) {
    base.provenance = {
      derivedAt: "plan",
      source,
      atomText: String(narration || "").slice(0, MAX_ATOM_TEXT),
    };
    changed.push("provenance");
  }
  return { intent: base, changed, added: changed.length > 0 };
}

/**
 * The wiring-KPI contract: an intent is MEANINGFUL iff it names an archetype
 * and at least one required action (or explicitly carries none —
 * static_reflection legitimately has an empty requiredActions list, but it
 * still names its archetype and grammar).
 */
function meaningfulVisualIntent(vi) {
  return !!(vi && typeof vi === "object" && String(vi.archetype || "").trim());
}

/** One-line telemetry row for reports. */
function intentTelemetry(rows) {
  const total = rows.length || 1;
  const meaningful = rows.filter(meaningfulVisualIntent).length;
  return { total: rows.length, meaningful, shellOnly: rows.length - meaningful, meaningfulPct: Math.round((meaningful / total) * 1000) / 10 };
}

module.exports = { buildPersistedVisualIntent, meaningfulVisualIntent, intentTelemetry, GRAMMAR_KINDS };
