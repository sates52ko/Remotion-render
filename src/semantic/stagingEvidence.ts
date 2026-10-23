/**
 * stagingEvidence.ts — Vision-free 10x P7 (2026-10-05): the ONE semantic
 * enforcement engine.
 *
 * P6 measured the split brain: the P3 gate's hard decisions (HC1–HC10 in
 * visualContract.ts) and the production firewall (narrative-visual-firewall.js)
 * were two separate implementations judging the same scenes — the gate reported
 * 74 hard violations while the firewall rejected none of them. Worse, the
 * narration→intent chain produced archetype labels ("contrast") but no
 * machine-readable description of WHAT must be staged, so the renderer's
 * defaults filled the gap and relational archetypes staged 0/53.
 *
 * This module is the fix the operator spec'd (7 items, no new top-level
 * StagingContract): `VisualContract.visualEvidence` becomes the CANONICAL
 * staging representation, and every hard semantic decision flows through the
 * pure predicates here:
 *
 *   NarrativeAtom → VisualIntent → VisualContract.visualEvidence
 *     → Director requirement → rendered scene → evaluateSemanticStaging
 *
 * Consumers:
 *   - src/semantic/visualContract.ts  (HC3/HC4 call evaluateSemanticStaging)
 *   - scripts/lib/narrative-visual-firewall.js (adds SEMANTIC_STAGING_VIOLATION
 *     from the same engine — one judge, no drift)
 *   - scripts/p3-visionless-gate.mjs  (builds evidence from the derived intent)
 *
 * Everything here is deterministic and pure: no LLM, no Vision, no I/O, no
 * mutation. Every function returns new objects.
 */

import type { VisualIntent, VisualArchetype } from "./visualIntent.ts";

// ── Canonical evidence schema (additive; backward compatible) ────────────────

/** The staged relation a narration with a relational archetype requires. */
export type RequiredRelation =
  | "comparison"              // two opposed poles (contrast)
  | "equivalence"             // domain X structurally mirrors domain Y
  | "cause_effect"            // trigger → consequence
  | "transformation"          // state A mutating into state B
  | "internal_tension"        // two poles inside one subject
  | "sequence";               // ordered progression of states

/** How the required relation must appear on screen (renderer-verified media). */
export type RepresentationMedium =
  | "comparison"              // comparative split/twoShot/beforeAfter with ≥2 cast, or a structural diagram
  | "two_domain_comparison"   // sorter/spectrum/matchWave diagram or a structural analogy prop
  | "cause_effect_flow"       // a valid flow diagram (trigger → consequence)
  | "internal_tension"        // two-character staging, spectrum diagram, or tension-metaphor prop
  | "labeled_flow"            // flow/spectrum diagram with narration-safe labels
  | "editorial_or_grounded"   // editorial framing (meta) or authentic period artifact (historical)
  | "none";                   // non-relational archetype: no medium obligation

/** The three prose strings already required by deriveVisualIntent's contract. */
export interface SemanticGrammar {
  kind: string;        // adapter grammar: comparison | two_domain_comparison | cause_effect_flow | internal_tension
  subject: string;     // who/what the narration is about
  relation: string;    // what happens between/among them
  state: string;       // the state the narration leaves the subject in
}

/**
 * Canonical staging evidence — lives at `VisualContract.visualEvidence`.
 * `relation`/`subjects`/`poles`/`representation` formalize the existing
 * subjects/relations/states string lists without replacing them.
 */
export interface VisualEvidence {
  requiredRelation: RequiredRelation | "none";
  subjects: string[];
  poles: string[];                  // named endpoints of the relation (may be empty)
  representation: RepresentationMedium;
  provenance: "derived_visual_intent" | "authored" | "unknown";
}

/** Machine-readable verdict of the single semantic judge. */
export interface StagingEvaluation {
  required: boolean;                // does a relational obligation exist at all?
  satisfied: boolean;               // does the scene stage the required medium?
  medium: RepresentationMedium | null;
  hardViolations: string[];         // MISSING_STRUCTURAL_EQUIVALENCE / IDLE_ACTOR_WALLPAPER
  diagnostics: string[];            // report-only observations (never a hard code)
}

/** Renderer-verifiable diagram shapes (mirrors the adapter's DIAGRAM_TYPES). */
export const DIAGRAM_TYPES = new Set(["sorter", "matchWave", "flow", "spectrum", "matrix", "tree", "funnel"]);

/** Valid diagram: renderer-supported type with enough narration-carrying labels. */
export function isValidDiagramShape(diagram: any): boolean {
  if (!diagram || typeof diagram !== "object" || !DIAGRAM_TYPES.has(diagram.type)) return false;
  const labels = Array.isArray(diagram.labels) ? diagram.labels : [];
  return diagram.type === "matchWave" ? labels.length >= 1 : labels.length >= 2;
}

/**
 * A structural prop: an object whose NAME claims the relation's structure
 * ("…MirrorDiagram", "…Contrast", "…Flow"). This is the HC3/HC4 allow-list
 * regex, preserved verbatim so historical PASS/REJECT behavior is unchanged.
 */
export function isStructuralPropName(type: string): boolean {
  return /diagram|card|split|contrast|sequence|analogy|mirror|scale|equivalence|flow|metamorphosis|tear/i.test(String(type || ""));
}

/**
 * Historical HC3's OWN allow-list (visualContract.ts pre-P7) — deliberately
 * different from HC4's: it includes soul/versus/parallel/divide and excludes
 * card/sequence/flow/metamorphosis/tear. The hard HC3 path must keep using
 * THIS regex byte-for-byte; the canonical mediums enter the hard path only
 * when the director floor can stage them (P7 commits 4–5).
 */
export function isComparisonPropName(type: string): boolean {
  return /scale|mirror|split|versus|parallel|soul|analogy|equivalence|contrast|divide|diagram/i.test(String(type || ""));
}

/** The renderer shots that stage a comparison with two visible parties. */
export const COMPARATIVE_SHOTS = new Set(["split", "twoShot", "beforeAfter"]);

/** Is this prop an authored customSvg with a relation declaration? (exported for tests/gate telemetry) */
export function sceneHasDeclaredSvg(scene: any, relation: RequiredRelation | "none"): boolean {
  const props = Array.isArray(scene && scene.props) ? scene.props : [];
  return props.some((p) => p && p.customSvg && customSvgDeclaresRelation(p.customSvg, relation));
}

/** Archetype → RequiredRelation. `none` for non-relational archetypes. */
export function relationForArchetype(archetype: VisualArchetype | string | undefined): RequiredRelation | "none" {
  switch (archetype) {
    case "contrast": return "comparison";
    case "allegory_equivalence": return "equivalence";
    case "cause_effect": return "cause_effect";
    case "transformation": return "transformation";
    case "character_psychology": return "internal_tension";
    default: return "none";
  }
}

/** RequiredRelation → the representation medium the renderer can actually draw. */
export function mediumForRelation(relation: RequiredRelation | "none"): RepresentationMedium {
  switch (relation) {
    case "comparison": return "comparison";
    case "equivalence": return "two_domain_comparison";
    case "cause_effect": return "cause_effect_flow";
    case "transformation": return "labeled_flow";
    case "internal_tension": return "internal_tension";
    default: return "none";
  }
}

/**
 * Which relation requirement an archetype's requiredActions names — the prose
 * contract from deriveVisualIntent, made machine-readable. Used as a guard so
 * evidence is only derived for archetypes that actually declare the obligation
 * (bench-05/07/08's fixed requirements stay unenforced, preserving 30/30).
 */
function actionSays(action: string, fragments: string[]): boolean {
  return fragments.some((f) => String(action || "").includes(f));
}

function requiredByAction(intent: VisualIntent, relation: RequiredRelation): boolean {
  const actions = (intent && Array.isArray(intent.requiredActions) ? intent.requiredActions : []).map((a) => String(a));
  switch (relation) {
    case "comparison":
      return actions.some((a) => actionSays(a, ["show_two_opposing_states_or_polarities"]));
    case "equivalence":
      return actions.some((a) => actionSays(a, ["render_structural_parallel_between_domains"]));
    case "cause_effect":
    case "transformation":
      return actions.some((a) => actionSays(a, ["depict_trigger_to_consequence_flow"]));
    case "internal_tension":
      return actions.some((a) => actionSays(a, ["visualize_internal_tension_or_rupture"]));
    default:
      return false;
  }
}

/** NarrativeAtom-shaped input (only the fields the builder reads). */
export interface AtomLike {
  text?: string;
  subject?: string | null;
  action?: string | null;
  object?: string | null;
  relationship?: string | null;
}

/**
 * Builds the canonical visualEvidence from the parts the pipeline already
 * derives. Sentences (not the whole atom text) feed the poles so a scene never
 * inherits another sentence's subject.
 *
 * Guard: a relational `requiredRelation` is emitted ONLY when the intent's
 * requiredActions actually declare the obligation (deriveVisualIntent emits the
 * action string for every non-static relational archetype, so production is
 * unaffected) — this keeps `two_distinct_comparative_elements`-style fixed
 * requirements out of the staging obligation (30/30 regression guard).
 */
export function buildVisualEvidence(atom: AtomLike, intent: VisualIntent): VisualEvidence {
  const relation = relationForArchetype(intent && intent.archetype);
  const declared = relation !== "none" && requiredByAction(intent, relation);
  const finalRelation = declared ? relation : "none";
  const text = String((atom && atom.text) || "");
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const anchor = sentences[0] || text;
  const subject = String((atom && atom.subject) || "").trim();
  const object = String((atom && atom.object) || "").trim();
  const subjects: string[] = [];
  if (subject) subjects.push(subject);
  else if (anchor) subjects.push(anchor.slice(0, 80));
  if (object && object.toLowerCase() !== subject.toLowerCase()) subjects.push(object);
  return {
    requiredRelation: finalRelation,
    subjects,
    poles: [],
    representation: mediumForRelation(finalRelation),
    provenance: "derived_visual_intent",
  };
}

/**
 * Attaches canonical evidence to a VisualContract-shaped object additively.
 * Never touches any other key. An explicit authored `visualEvidence` with a
 * non-default provenance wins (the contract is authored data, not derived).
 */
export function withCanonicalEvidence(contract: any, atom: AtomLike, intent: VisualIntent): any {
  const existing = contract && contract.visualEvidence;
  if (existing && existing.provenance === "authored") return contract;
  const evidence = buildVisualEvidence(atom, intent);
  return { ...(contract || {}), visualEvidence: evidence };
}

// ── The shared semantic judge (pure predicates) ──────────────────────────────

/**
 * Does a customSvg prop DECLARE the required relation/state?
 *
 * Spec item 4: prop-name regexes guess staging; authored SVGs must PROVE it.
 * Production customSvg motifs carry `title` + `reads` — a human-readable
 * description of what the artwork depicts ("needle swinging into the red
 * zone"). The declaration credits the scene when it actually names the
 * required structure:
 *   - comparison / internal_tension: two distinct poles declared ("A vs B",
 *     "A not B but C", "A to B") or a split of two named domains;
 *   - equivalence: the declaration names both domains and their mirror;
 *   - cause_effect / transformation: a trigger→consequence pair.
 * `customSvg exists` alone NEVER credits anything.
 */
export function customSvgDeclaresRelation(svg: any, relation: RequiredRelation | "none"): boolean {
  if (!svg || typeof svg !== "object" || relation === "none") return false;
  const title = String(svg.title || "");
  const reads = String(svg.reads || "");
  const decl = `${title} ${reads}`.toLowerCase();
  if (!decl.trim()) return false;
  switch (relation) {
    case "comparison":
    case "internal_tension":
      return /\b(vS\.?|versus|two|both|poles?|split|oppos|against|left|right|from .+ to )\b/i.test(decl) ||
        /(\b\w[\w-]*\b)[^.?!]{0,40}\b(?:not|but|rather than|instead of)\b[^.?!]{0,40}\b\w/.test(decl);
    case "equivalence":
      return /\b(mirror|equivalen|parallel|allegor|as\b|like\b|same structure)\b/i.test(decl);
    case "cause_effect":
    case "transformation":
      return /\b(then|into|becom|caus|leads? to|trigger|consequence|red ?zone|drop|rise|spik\w*)\b/i.test(decl);
    default:
      return false;
  }
}

/**
 * Legacy HC3's dual-active-subjects acceptance: two on-screen characters with
 * at least one non-idle action stage a relation between them. Preserved verbatim
 * so historical PASS decisions survive the refactor.
 */
export function hasDualActiveSubjects(scene: any): boolean {
  const chars = Array.isArray(scene && scene.characters) ? scene.characters : [];
  return chars.length >= 2 && chars.some((c: any) => String((c && c.action) || "") !== "idle");
}

/**
 * The core predicate: does the scene stage the required representation medium?
 * Renderer-verified fields only (schema.ts: shot, characters, prop arc, text
 * style, diagram labels; motifs.tsx: customSvg).
 */
export function satisfiesMedium(scene: any, medium: RepresentationMedium, relation: RequiredRelation | "none"): boolean {
  const chars = Array.isArray(scene && scene.characters) ? scene.characters : [];
  const cast = chars.length;
  const shot = String((scene && scene.shot) || "");
  const props = Array.isArray(scene && scene.props) ? scene.props : [];
  const diagram = (scene && scene.diagram) || null;
  if (hasDualActiveSubjects(scene)) return true; // legacy acceptance, all relational mediums
  switch (medium) {
    case "comparison": {
      if (COMPARATIVE_SHOTS.has(shot) && cast >= 2) return true;
      if (isValidDiagramShape(diagram)) return true;
      if (props.some((p) => p && isStructuralPropName(p.type))) return true;
      if (sceneHasDeclaredSvg(scene, relation)) return true;
      return false;
    }
    case "two_domain_comparison": {
      if (isValidDiagramShape(diagram) && ["sorter", "spectrum", "matchWave"].includes(diagram.type)) return true;
      if (props.some((p) => p && isStructuralPropName(p.type))) return true;
      if (sceneHasDeclaredSvg(scene, relation)) return true;
      return false;
    }
    case "cause_effect_flow": {
      return isValidDiagramShape(diagram) && diagram.type === "flow";
    }
    case "labeled_flow": {
      if (!(isValidDiagramShape(diagram) && (diagram.type === "flow" || diagram.type === "spectrum"))) return false;
      const labels = (diagram.labels || []).map((l) => String(l || "").trim()).filter(Boolean);
      return labels.every((l) => (l.toUpperCase() === l ? l.length >= 3 : true));
    }
    case "internal_tension": {
      if (cast >= 2) return true;
      if (isValidDiagramShape(diagram) && diagram.type === "spectrum") return true;
      if (props.some((p) => p && isStructuralPropName(p.type))) return true;
      if (sceneHasDeclaredSvg(scene, relation)) return true;
      return false;
    }
    default:
      return false;
  }
}

/** Fallback staging: no medium, but at least not a passive-actor wallpaper. */
export function sceneHasNonIdleStaging(scene: any): boolean {
  const chars = Array.isArray(scene && scene.characters) ? scene.characters : [];
  const idleish = new Set(["idle", "none", ""]);
  const actionful = chars.some((c) => {
    const a = String((c && c.action) || "");
    return !idleish.has(a) && a !== "talk";
  });
  if (actionful) return true;
  if (isValidDiagramShape(scene && scene.diagram)) return true;
  const texts = Array.isArray(scene && scene.texts) ? scene.texts : [];
  if (texts.some((t) => t && String(t.text || "").trim())) return true;
  return false;
}

/**
 * The ONE hard semantic decision. Both evaluators call this; neither may
 * reimplement the predicates.
 *
 * Input evidence (any of):
 *   - `contract.visualEvidence` — canonical (has requiredRelation/representation)
 *   - `intent` — fallback: evidence derived on the fly (never persisted)
 *
 * Semantics (regression-guarded — see the P7 commit notes):
 *   - The structural-equivalence hard check fires on the SAME trigger as the
 *     historical HC3: an `allegory_equivalence` archetype (or an explicit
 *     `two_distinct_comparative_elements` semantic requirement). Other
 *     relational archetypes report `not_staged` as a DIAGNOSTIC until the
 *     director floor lands (commit 4) — widening now would regress bench-05/07/08.
 *   - The idle-wallpaper hard check fires on the SAME trigger as HC4: the
 *     `static_idle_actor_wallpaper` forbidden trope — and is cleared by the
 *     SAME structural evidence as before, now extended with canonical mediums.
 */
export function evaluateSemanticStaging(input: {
  scene: any;
  evidence?: VisualEvidence | null;
  intent?: VisualIntent | null;
}): StagingEvaluation {
  const scene = input.scene || {};
  let evidence = input.evidence || null;
  if (!evidence && input.intent) {
    // Fallback: evidence derived on the fly (never persisted). buildVisualEvidence
    // reads atom.text only for subjects, so an empty atom yields correct relation/medium.
    evidence = buildVisualEvidence({ text: "" }, input.intent);
  }
  const relation = (evidence && evidence.requiredRelation) || "none";
  const medium = (evidence && evidence.representation) || mediumForRelation(relation);
  const intent = input.intent || null;
  const arch = String((intent && intent.archetype) || "");

  const hardViolations: string[] = [];
  const diagnostics: string[] = [];

  // ── P7 commit 3: the DECLARED-SVG credit channel (spec item 4) ─────────
  // An authored customSvg that DECLARES the scene's archetype relation
  // ("needle swings into the red zone" stages a cause_effect) is real staged
  // evidence and must clear the hard checks; a bare `customSvg` prop never
  // does. Bench-30 has no customSvg fixtures and the pinned 100-scene corpus
  // has none either, so this widens ONLY genuinely authored scenes.
  const creditRelation = relation !== "none" ? relation : relationForArchetype(arch);
  const declaredSvg = creditRelation !== "none" ? sceneHasDeclaredSvg(scene, creditRelation) : false;

  // ── Structural equivalence (historical HC3 trigger, unchanged) ──────────
  const hc3Triggered =
    arch === "allegory_equivalence" ||
    (intent && Array.isArray(intent.semanticRequirements) && intent.semanticRequirements.includes("two_distinct_comparative_elements"));
  if (hc3Triggered) {
    // BYTE-PRESERVED legacy predicate (dual-active subjects OR HC3's own prop
    // regex). The canonical medium machine reports alongside but never replaces
    // this hard path in commit 1 — satisfaction mediums become enforceable
    // when the floor can stage them (commits 4–5).
    const hasDualSubjects = hasDualActiveSubjects(scene);
    const hasComparisonProp = Array.isArray(scene.props)
      && scene.props.some((p: any) => p && isComparisonPropName(p.type));
    const mediumSatisfied = satisfiesMedium(scene, medium === "none" ? "two_domain_comparison" : medium, relation);
    if (!hasDualSubjects && !hasComparisonProp && !declaredSvg) {
      hardViolations.push(
        "MISSING_STRUCTURAL_EQUIVALENCE: Claim asserts equivalence/analogy, but scene only depicts single domain without structural parallel"
      );
    } else if (declaredSvg && !hasDualSubjects && !hasComparisonProp) {
      diagnostics.push(`structural_equivalence:declared-svg:${creditRelation}`);
    } else if (mediumSatisfied) {
      diagnostics.push("structural_equivalence:legacy-pass");
    }
  } else if (relation !== "none" && medium !== "none") {
    // Wider relational coverage is DIAGNOSTIC-only until commit 4 wires the
    // director floor: the 30-case benchmark's good fixtures do not stage
    // mediums for other archetypes, and a hard gate here would regress them.
    const satisfied = satisfiesMedium(scene, medium, relation);
    if (!satisfied) diagnostics.push(`staging_not_proven:${medium}`);
  }

  // ── Idle-actor wallpaper (historical HC4 predicate, byte-preserved) ─────
  // Fires iff (single passive actor OR an idle character) and NO structural
  // prop. The customSvg escape lands in the authored-SVG commit (P7 item 4);
  // widening it here first would regress the 30-case benchmark.
  const forbidIdle = !!(intent && Array.isArray(intent.forbiddenTropes) && intent.forbiddenTropes.includes("static_idle_actor_wallpaper"));
  if (forbidIdle) {
    const chars = Array.isArray(scene.characters) ? scene.characters : [];
    const isSingleActorPassive =
      chars.length === 1 && ["talk", "idle", "walk", "point"].includes(String((chars[0] && chars[0].action) || ""));
    const hasIdleCharacter = chars.some((c) => String((c && c.action) || "") === "idle");
    const hasStructuralProp = Array.isArray(scene.props) && scene.props.some((p: any) => p && isStructuralPropName(p.type));
    if ((isSingleActorPassive || hasIdleCharacter) && !hasStructuralProp && !declaredSvg) {
      hardViolations.push("IDLE_ACTOR_WALLPAPER: Complex proposition or psychological claim rendered with idle/talking statue actor");
    } else if (declaredSvg && (isSingleActorPassive || hasIdleCharacter) && !hasStructuralProp) {
      diagnostics.push(`idle_wallpaper_cleared_by:declared-svg:${creditRelation}`);
    }
  }

  return { required: relation !== "none", satisfied: hardViolations.length === 0, medium, hardViolations, diagnostics };
}

/**
 * The atom shape BOTH evaluators derive the staging intent from. The gate builds
 * it from the narration window; the firewall builds it from the same narration
 * via validateScene's view — identical text in, identical decisions out.
 */
export function atomShapeFromScene(scene: any, narration: string): AtomLike & { concepts: string[]; abstraction: string; visualNeed: string } {
  return {
    text: String(narration || ""),
    subject: (scene && scene.narrativeAtom && scene.narrativeAtom.narrativeSubject) || (scene && scene._subject) || null,
    action: null,
    object: null,
    relationship: null,
    concepts: [],
    abstraction: "conceptual",
    visualNeed: String(narration || ""),
  };
}

/**
 * The effective staging intent for a scene: the STORED intent when it is
 * meaningful (carries an archetype — authored briefs), otherwise derived from
 * the narration with the same deterministic rules the audit gate uses. A stored
 * `{}` (P6: 100/100 scenes) is never trusted — truthiness is not meaning.
 */
export function effectiveStagingIntent(scene: any, narration: string, derive: (atom: AtomLike & { concepts: string[]; abstraction: string; visualNeed: string }) => VisualIntent): VisualIntent {
  const stored = scene && scene.visualIntent;
  if (stored && typeof stored === "object" && String(stored.archetype || "")) return stored as VisualIntent;
  return derive(atomShapeFromScene(scene, narration));
}

/** Grep-able marker: the firewall never reimplements these predicates. */
export const SHARED_JUDGE_MARKER = "stagingEvidence.ts is the single semantic judge";
