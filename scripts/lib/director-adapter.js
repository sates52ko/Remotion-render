"use strict";

/** Deterministic semantic-floor bridge; it emits overrides, never scenes. */
const COMPARATIVE_SHOTS = new Set(["split", "twoShot", "beforeAfter"]);
const DIAGRAM_TYPES = new Set(["sorter", "matchWave", "flow", "spectrum", "matrix", "tree", "funnel"]);
const screenText = require("./screen-text");
// P7 commit 4: the floor is derived from the CANONICAL relation/medium table
// (src/semantic/stagingEvidence.ts) — the adapter no longer owns a second
// semantic interpretation; it maps the canonical relation onto renderer levers.
const { relationForArchetype, mediumForRelation, satisfiesMedium } = require("../../src/semantic/stagingEvidence.ts");

/**
 * P7 commit 4 — null-floor telemetry (operator spec item 5): every no-floor
 * decision carries a machine-readable WHY alongside the historical `reason`
 * string (kept byte-compatible for the frozen screen-text fixtures).
 *   NO_RELATION                           — the archetype is not relational
 *   RELATION_DETECTED_EXTRACTION_FAILED   — relation declared, but no usable
 *                                           marker/clause pair in the narration
 *   LABEL_UNSAFE                          — clauses extracted but screen-text
 *                                           rejected the labels (or a negation
 *                                           flip) — a silent frame beats a lie
 *   AUTHORED_ALREADY_SATISFIES            — an authored/existing composition
 *                                           already stages the relation
 *   UNSUPPORTED_RELATION                  — canonical relation with no floor
 *                                           implementation (defensive)
 */
const NULL_FLOOR_REASONS = {
  NO_RELATION: "NO_RELATION",
  RELATION_DETECTED_EXTRACTION_FAILED: "RELATION_DETECTED_EXTRACTION_FAILED",
  LABEL_UNSAFE: "LABEL_UNSAFE",
  AUTHORED_ALREADY_SATISFIES: "AUTHORED_ALREADY_SATISFIES",
  UNSUPPORTED_RELATION: "UNSUPPORTED_RELATION",
};

function copyIntent(intent) {
  return {
    archetype: intent.archetype,
    domain: intent.domain,
    requiredActions: [...(intent.requiredActions || [])],
    requiredAttributes: { ...(intent.requiredAttributes || {}) },
    forbiddenTropes: [...(intent.forbiddenTropes || [])],
    semanticRequirements: [...(intent.semanticRequirements || [])],
  };
}

// ── 2026-09-23: labels are CLAUSES the narrator said, or nothing ────────────
// The old path sliced narration (`label()` = last 4 content words,
// `wordSlices()` = first 3 / last 3) and fell back to atom.subject/object,
// which the atom extractor fills from another book's defaults ("Thirty
// Tyrants" on a Crime & Punishment beat). Result: "PRODUCT OKAY LETS UNPACK",
// "IDEAS SOME GRAND U". Now a side of a graphic exists only when the sentence
// states it as a short clause on either side of an explicit marker, and the
// clause passes the shared screen-text check. Otherwise semanticPayload is
// null and NO floor is added — a silent frame beats a meaningless diagram.
const MAX_CLAUSE_TOKENS = 5; // raw clause budget; the CORE cap is LIMITS.label

// P8 Aşama 2 — degree intensifiers are NOT the referent: quoting "completely
// safe" as "SAFE" (or "100% manufactured" as "MANUFACTURED") stays the
// narrator's own words, trimmed at the EDGE only. A closed set, never content
// words; the negation guard below still runs on every dropped token.
const INTENSIFIERS = new Set([
  "completely", "totally", "entirely", "absolutely", "utterly", "fully",
  "literally", "basically", "actually", "really", "truly", "very", "simply",
  "generally", "obviously", "definitely", "essentially", "purely", "plainly",
]);
const isIntensifier = (w) => INTENSIFIERS.has(String(w).toLowerCase().replace(/[^a-z]/g, "")) || /^\d+\s*%$/.test(String(w).trim());

function splitAt(text, pattern) {
  const match = String(text || "").match(pattern);
  if (!match || match.index == null) return null;
  return [text.slice(0, match.index), text.slice(match.index + match[0].length)];
}

// The clause touching the marker: back to the previous boundary on the left,
// forward to the next boundary on the right.
function nearClause(side, dir) {
  const parts = String(side || "").split(/[.!?;:,—–]+/).filter((p) => p.trim());
  return (dir === "left" ? parts[parts.length - 1] : parts[0]) || "";
}

function phraseWithReason(clause, narration) {
  const toks = String(clause || "").replace(/[“”"`]/g, "").trim().split(/\s+/).filter(Boolean);
  const isEdge = (w) => screenText.FUNCTION_WORDS.has(w.toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, ""));
  let lo = 0, hi = toks.length;
  while (lo < hi && (isEdge(toks[lo]) || isIntensifier(toks[lo]))) lo++;
  while (hi > lo && (isEdge(toks[hi - 1]) || isIntensifier(toks[hi - 1]))) hi--;
  // Trimming a negation flips the meaning ("I don't have a castle" -> CASTLE).
  const isNeg = (w) => screenText.NEGATIONS.has(w.toLowerCase().replace(/[^a-z]/g, ""));
  if (toks.slice(0, lo).some(isNeg) || toks.slice(hi).some(isNeg)) return { text: null, why: "label_unsafe" };
  const core = toks.slice(lo, hi);
  // P8: the core cap is screen-text's own label limit (5 words) — the adapter
  // used to double-limit at 4; the shared check still decides everything else.
  if (!core.length || core.length > screenText.LIMITS.label.maxWords || toks.length > MAX_CLAUSE_TOKENS + 2) return { text: null, why: "clause_unextractable" };
  const text = core.join(" ").replace(/[^A-Za-z0-9%'’&\s-]/g, "").toUpperCase().trim();
  return screenText.isLabel(text, { narration }) ? { text, why: null } : { text: null, why: "label_unsafe" };
}

function phrase(clause, narration) {
  const r = phraseWithReason(clause, narration);
  return r.why === null ? r.text : null;
}

function distinctPair(left, right) {
  if (!left || !right) return null;
  return screenText.checkPair(left, right).length ? null : { left, right };
}

function markerPairDetail(text, pattern, order = "forward") {
  const split = splitAt(text, pattern);
  if (!split) return { pair: null, why: "no_marker" };
  let leftRes, rightRes;
  if (/[.!?]\s*$/.test(split[0]) || !split[0].trim()) {
    // P7 commit 4 — SENTENCE-BOUNDARY contrast (the P6 #20 false-negative):
    // the marker OPENS its own sentence ("… a designer. But wait, …"), so the
    // left pole lives in the PREVIOUS sentence and the right pole in the
    // marker's own clause. The phrase() safety guards still decide.
    const prevSentences = String(split[0]).split(/(?<=[.!?])\s+/).filter((p) => p.trim());
    const prev = prevSentences[prevSentences.length - 1] || "";
    leftRes = phraseWithReason(prev, text);
    rightRes = phraseWithReason(nearClause(split[1], "right"), text);
  } else {
    // Both sides must live in ONE sentence: "…a graphic designer. But wait, …"
    // is two sentences, not a contrast between a designer and "wait".
    const leftClause = nearClause(split[0], "left");
    // A marker that OPENS its clause with a boundary ("… a spotlight. However,
    // multitasking …") leaves the left nearClause empty — fall back to the
    // sentence-boundary source (the marker's PREVIOUS sentence).
    if (leftClause.trim()) {
      leftRes = phraseWithReason(leftClause, text);
    } else {
      const prevSentences = String(split[0]).split(/(?<=[.!?])\s+/).filter((p) => p.trim());
      leftRes = phraseWithReason(prevSentences[prevSentences.length - 1] || "", text);
    }
    rightRes = phraseWithReason(nearClause(split[1], "right"), text);
  }
  if (leftRes.why !== null || rightRes.why !== null) {
    return { pair: null, why: leftRes.why === "label_unsafe" || rightRes.why === "label_unsafe" ? "label_unsafe" : "clause_unextractable" };
  }
  const pair = order === "forward" ? distinctPair(leftRes.text, rightRes.text) : distinctPair(rightRes.text, leftRes.text);
  return pair ? { pair, why: null } : { pair: null, why: "label_unsafe" };
}

function markerPair(text, pattern, order = "forward") {
  return markerPairDetail(text, pattern, order).pair;
}

// Bare "not" negates a verb ("does not equal"); only ", not" opposes two things.
// P7 commit 4: however/yet join the contrast family (operator marker list).
const CONTRAST_MARKER = /\b(?:rather than|instead of|as opposed to|versus|vs\.?|whereas|however|yet|but)\b|,\s*not\b/i;
// P8 Aşama 2 — IMPLIED contrast shapes (operator class "explicit vs implied
// pole"): "X isn't (about) A, it's B" and "not A, but B". Both poles remain
// the narrator's quoted words; the safety layer still decides every label.
const IMPLIED_CONTRAST = [
  /\b(?:isn't|is not|aren't|are not)\s+(?:about\s+|just\s+)?([^,.!?;—–]{2,40}?)\s*[,;]?\s*(?:it's|it is|they're|they are|that's)\s+([^,.!?;—–]{2,40}?)(?:[.!?;]|$)/i,
  /\bnot\s+([^,.!?;—–]{2,40}?)\s*[,;]\s*but\s+([^,.!?;—–]{2,40}?)(?:[.!?;]|$)/i,
];
// P7 commit 4: therefore/thus/hence join the causal family.
const CAUSE_MARKER = /\b(?:leads to|led to|results in|resulted in|causes|caused|produces|therefore|thus|hence|turns into|becomes|became)\b/i;
const BECAUSE_MARKER = /\bbecause\b/i; // "B because A" → A → B
// P7 commit 4: "from X to Y" stages a transformation (X → Y flow labels).
const TRANSFORM_MARKER = /\bfrom\s+(.{2,40}?)\s+to\s+(.{2,40}?)(?:[.!?;]|$)/i;

function transformPairDetail(text) {
  const m = String(text || "").match(TRANSFORM_MARKER);
  if (!m) return { pair: null, why: "no_marker" };
  const leftRes = phraseWithReason(m[1], text);
  const rightRes = phraseWithReason(m[2], text);
  if (leftRes.why !== null || rightRes.why !== null) {
    return { pair: null, why: leftRes.why === "label_unsafe" || rightRes.why === "label_unsafe" ? "label_unsafe" : "clause_unextractable" };
  }
  const pair = distinctPair(leftRes.text, rightRes.text);
  return pair ? { pair, why: null } : { pair: null, why: "label_unsafe" };
}

/**
 * P7 commit 4: the payload PLUS the machine-readable extraction detail the
 * null-floor telemetry needs. `semanticPayload` stays the byte-compatible
 * wrapper (repair-coherence and the frozen screen-text fixtures read it).
 */
function semanticPayloadDetailed(atom, archetype) {
  const relation = archetype ? relationForArchetype(archetype) : "none";
  const detail = { relation, medium: mediumForRelation(relation), why: null, marker: null };
  if (!atom || !atom.text || relation === "none") {
    detail.why = relation === "none" ? "no_relation" : "extraction_failed";
    return { payload: null, detail };
  }
  const text = atom.text;
  const attempts = [];
  if (relation === "comparison" || relation === "equivalence" || relation === "internal_tension") {
    attempts.push(["contrast", (t) => markerPairDetail(t, CONTRAST_MARKER)]);
    for (let i = 0; i < IMPLIED_CONTRAST.length; i++) {
      attempts.push([`implied_${i}`, (t) => {
        const m = String(t || "").match(IMPLIED_CONTRAST[i]);
        if (!m) return { pair: null, why: "no_marker" };
        const leftRes = phraseWithReason(m[1], t);
        const rightRes = phraseWithReason(m[2], t);
        if (leftRes.why !== null || rightRes.why !== null) {
          return { pair: null, why: leftRes.why === "label_unsafe" || rightRes.why === "label_unsafe" ? "label_unsafe" : "clause_unextractable" };
        }
        const pair = distinctPair(leftRes.text, rightRes.text);
        return pair ? { pair, why: null } : { pair: null, why: "label_unsafe" };
      }]);
    }
  } else {
    // cause_effect / transformation: from-X-to-Y, cause, because(reverse)
    attempts.push(["transform", (t) => transformPairDetail(t)]);
    attempts.push(["cause", (t) => markerPairDetail(t, CAUSE_MARKER)]);
    attempts.push(["because", (t) => markerPairDetail(t, BECAUSE_MARKER, "reverse")]);
  }
  const whys = [];
  for (const [name, extract] of attempts) {
    const { pair, why } = extract(text);
    if (pair) {
      detail.marker = name;
      if (relation === "comparison") return { payload: { kind: "comparison_labels", leftLabel: pair.left, rightLabel: pair.right }, detail };
      if (relation === "equivalence") return { payload: { kind: "two_domain_labels", sourceLabel: pair.left, targetLabel: pair.right }, detail };
      if (relation === "internal_tension") return { payload: { kind: "internal_tension_labels", internalPoleA: pair.left, internalPoleB: pair.right }, detail };
      return { payload: { kind: "flow_labels", triggerLabel: pair.left, consequenceLabel: pair.right }, detail };
    }
    whys.push(`${name}:${why}`);
  }
  detail.why = whys.some((w) => w.endsWith(":label_unsafe")) ? "label_unsafe" : "extraction_failed";
  return { payload: null, detail };
}

function semanticPayload(atom, archetype) {
  return semanticPayloadDetailed(atom, archetype).payload;
}

function isValidDiagram(diagram) {
  if (!diagram || !DIAGRAM_TYPES.has(diagram.type)) return false;
  const labels = Array.isArray(diagram.labels) ? diagram.labels : [];
  if (diagram.type === "matchWave") return labels.length >= 1;
  return labels.length >= 2;
}

function hasComposition(direction, kind) {
  const grammar = direction.semanticGrammar && direction.semanticGrammar.kind;
  const shot = direction.shot || "";
  const castCount = Number(direction.cast && direction.cast.count) || 0;
  if (kind === "comparative") return grammar === "comparison" || (COMPARATIVE_SHOTS.has(shot) && castCount >= 2) || isValidDiagram(direction.diagram);
  if (kind === "two_domain") return grammar === "two_domain_comparison" || (isValidDiagram(direction.diagram) && ["sorter", "spectrum", "matchWave"].includes(direction.diagram.type));
  if (kind === "flow") return grammar === "cause_effect_flow" || shot === "beforeAfter" || (isValidDiagram(direction.diagram) && direction.diagram.type === "flow");
  return grammar === "internal_tension" || (isValidDiagram(direction.diagram) && direction.diagram.type === "spectrum") || castCount >= 2;
}

function comparisonOverride(direction, archetype) {
  const roles = Array.isArray(direction.cast && direction.cast.roles) ? direction.cast.roles.slice(0, 2) : [];
  while (roles.length < 2) roles.push(roles.length === 0 ? "protagonist" : "foil");
  return {
    shot: "split",
    semanticGrammar: { kind: "comparison", poles: ["LEFT_POLE", "RIGHT_POLE"] },
    cast: {
      ...(direction.cast || {}), count: 2, crowd: 0, roles,
      // Planner applies this to character two: an active counterpart prevents
      // the comparison from degenerating into idle-actor wallpaper.
      secondaryAction: archetype === "allegory_equivalence" ? "point" : "talk",
    },
  };
}

function diagramOverride(type, labels) {
  return {
    shot: "insert", cast: { count: 0, crowd: 0, roles: [] }, props: [], concept: null,
    // No title: the two labels ARE the claim. A constant title ("TRIGGER →
    // CONSEQUENCE") stamped the same words on every diagram of every book.
    diagram: { type, title: null, labels, values: [], at: 4, scale: 1 },
  };
}

function twoDomainOverride() {
  return {
    // A split is already a real, renderer-supported two-domain composition.
    // Unlike a generic diagram marker, the unchanged Gate can observe both
    // active poles without requiring a new VisualContract rule.
    ...comparisonOverride({}, "allegory_equivalence"),
    semanticGrammar: { kind: "two_domain_comparison", domains: ["SOURCE_DOMAIN", "TARGET_DOMAIN"] },
  };
}

function withGrammar(override, kind) {
  return { ...override, semanticGrammar: { kind } };
}

function propIsForbidden(prop, forbiddenTropes) {
  const type = String(prop && prop.type || "").toLowerCase();
  if (forbiddenTropes.includes("comic_lightbulb") && /lightbulb|bulb/.test(type)) return true;
  if (forbiddenTropes.includes("heart_symbol") && /heart/.test(type)) return true;
  if (forbiddenTropes.includes("party_confetti") && /confetti|party/.test(type)) return true;
  if (forbiddenTropes.includes("burning_or_destructive_action") && /fire|flame|burn|destroy|crash/.test(type)) return true;
  if (forbiddenTropes.includes("unrelated_navigation_prop") && /compass|rudder|navigation/.test(type)) return true;
  return false;
}

function sanitizeAction(action, forbiddenTropes = []) {
  return forbiddenTropes.includes("celebrate_action") && action === "celebrate" ? "think" : action;
}

/**
 * Precedence: an authored or already-valid composition wins. Only a missing
 * semantic grammar gets an override. Static reflection gets no fallback.
 */
function buildDirectorOverrides({ intent, atom, direction, authoredDiagram = false, authoredComposition = false }) {
  const archetype = intent && intent.archetype;
  const requiredActions = (intent && intent.requiredActions) || [];
  const provenance = intent ? copyIntent(intent) : null;
  const { payload, detail } = semanticPayloadDetailed(atom, archetype);
  // P7 commit 5 (spec item 6): the merge invariant. An authored/existing
  // composition KEEPS its styling/framing; only a MISSING semantic obligation
  // is merged in. The decision is measured, never assumed:
  //   authorshipSatisfies  — the authored composition already stages the
  //                          canonical medium (shared judge) → stage NOTHING
  //   authorshipSatisfies  — false and a floor exists → merge the floor's
  //                          obligation (only the missing grammar/composition
  //                          levers; styling untouched)
  //   no floor extractable → the obligation stays UNMET and VISIBLE (recorded
  //                          for the gate); never silently dropped.
  const sceneShape = {
    shot: (direction && direction.shot) || "",
    characters: Array.isArray(direction && direction.cast) ? direction.cast :
      Array.isArray(direction && direction.cast && direction.cast.roles)
        ? direction.cast.roles.map((r) => ({ role: r, action: (direction.cast.actions && direction.cast.actions[r]) || (direction.cast.count >= 2 ? "talk" : "idle") }))
        : [],
    props: (direction && direction.props) || [],
    diagram: (direction && direction.diagram) || null,
  };
  const relation = detail.relation;
  const authorshipSatisfies = relation !== "none" && satisfiesMedium(sceneShape, detail.medium, relation);
  const base = {
    override: null, reason: "no_semantic_requirement", archetype, requiredActions, provenance, semanticPayload: payload,
    // P7 commit 4: canonical relation/medium + null-floor telemetry (the
    // historical `reason` strings are kept byte-identical for the fixtures).
    relation: detail.relation,
    medium: detail.medium,
    nullFloorReason: null,
    // P7 commit 5: the merge decision columns.
    authorshipSatisfies,
    semanticObligation: { relation: detail.relation, medium: detail.medium, status: "unmet" },
  };
  if (!archetype || archetype === "static_reflection") {
    base.semanticObligation.status = "none_required";
    return { ...base, nullFloorReason: "NO_RELATION" };
  }
  // Human art may be semantically insufficient, but it is never silently
  // replaced here. P7: the composition is preserved AND the decision is now
  // measured — an authored scene that already stages the canonical medium is
  // recorded as satisfying; one that does not gets the missing obligation
  // MERGED (styled composition intact) instead of a whole-scene discard.
  if (authoredDiagram || authoredComposition) {
    if (authorshipSatisfies) {
      base.semanticObligation.status = "satisfied_by_authored";
      return { ...base, reason: "preserved_authored_composition", nullFloorReason: "AUTHORED_ALREADY_SATISFIES" };
    }
    if (payload) {
      // MERGE-ONLY: the floor below stages ONLY the missing obligation levers
      // (grammar/shot/cast); the planner keeps the authored set/copy/props.
      base.semanticObligation.status = "merge_pending";
      return { ...base, reason: "preserved_authored_composition", mergeObligation: true, nullFloorReason: null };
    }
    base.semanticObligation.status = "unmet_visible";
    return { ...base, reason: "preserved_authored_composition", nullFloorReason: "RELATION_DETECTED_EXTRACTION_FAILED" };
  }
  // A floor without words would be a composition that claims a relationship
  // nobody can read — the regex archetype alone ("not/but/while" ⇒ contrast)
  // is not evidence. No payload ⇒ no floor (with a machine-readable WHY).
  if (!payload) {
    return {
      ...base,
      reason: "no_payload_no_floor",
      nullFloorReason:
        detail.why === "no_relation" ? "NO_RELATION"
        : detail.why === "label_unsafe" ? "LABEL_UNSAFE"
        : "RELATION_DETECTED_EXTRACTION_FAILED",
    };
  }

  if (archetype === "contrast") {
    if (hasComposition(direction, "comparative")) { base.semanticObligation.status = "satisfied_by_composition"; return { ...base, reason: "preserved_existing_comparison" }; }
    base.semanticObligation.status = "merge_pending";
    return { ...base, reason: "added_comparative_floor", override: { ...comparisonOverride(direction, archetype), semanticPayload: payload }, mergeObligation: true };
  }
  if (archetype === "allegory_equivalence") {
    if (hasComposition(direction, "two_domain")) { base.semanticObligation.status = "satisfied_by_composition"; return { ...base, reason: "preserved_existing_two_domain_comparison" }; }
    base.semanticObligation.status = "merge_pending";
    return { ...base, reason: "added_two_domain_floor", override: { ...twoDomainOverride(), semanticPayload: payload }, mergeObligation: true };
  }
  if (archetype === "cause_effect" || archetype === "transformation") {
    if (hasComposition(direction, "flow")) { base.semanticObligation.status = "satisfied_by_composition"; return { ...base, reason: "preserved_existing_flow" }; }
    base.semanticObligation.status = "merge_pending";
    return { ...base, reason: "added_causal_flow_floor", override: { ...withGrammar(diagramOverride("flow", [payload.triggerLabel, payload.consequenceLabel]), "cause_effect_flow"), semanticPayload: payload }, mergeObligation: true };
  }
  if (archetype === "character_psychology") {
    if (hasComposition(direction, "tension")) { base.semanticObligation.status = "satisfied_by_composition"; return { ...base, reason: "preserved_existing_tension" }; }
    base.semanticObligation.status = "merge_pending";
    return { ...base, reason: "added_internal_tension_floor", override: { ...withGrammar(diagramOverride("spectrum", [payload.internalPoleA, payload.internalPoleB]), "internal_tension"), semanticPayload: payload }, mergeObligation: true };
  }
  return base;
}

function applyDirectorOverrides(direction, result) {
  if (!result) return direction;
  const override = result.override || {};
  const forbiddenTropes = result.provenance ? result.provenance.forbiddenTropes : [];
  const merged = {
    ...direction, ...override,
    cast: override.cast ? { ...(direction.cast || {}), ...override.cast } : direction.cast,
    props: Object.prototype.hasOwnProperty.call(override, "props") ? override.props : direction.props,
  };
  // Exclusions are applied before planner assembly. The original intent remains
  // attached as provenance; no Gate behavior is changed or bypassed.
  if (Array.isArray(merged.props)) merged.props = merged.props.filter((prop) => !propIsForbidden(prop, forbiddenTropes));
  merged.semanticConstraints = result.provenance;
  return merged;
}

module.exports = { buildDirectorOverrides, applyDirectorOverrides, sanitizeAction, isValidDiagram, semanticPayload, semanticPayloadDetailed };
