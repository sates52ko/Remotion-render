#!/usr/bin/env node
/**
 * test-relational-floor.js — Vision-free 10x P7 commit-4 tests (pure).
 *   node scripts/test-relational-floor.js
 *
 * Proves:
 *   1. Wider deterministic extraction: however/yet, from-X-to-Y, therefore, and
 *      the SENTENCE-BOUNDARY contrast (the P6 #20 false-negative: "… But" at a
 *      sentence edge) now yield floor payloads.
 *   2. Null-floor telemetry: every no-floor result carries a machine-readable
 *      nullFloorReason (NO_RELATION / RELATION_DETECTED_EXTRACTION_FAILED /
 *      LABEL_UNSAFE / AUTHORED_ALREADY_SATISFIES / UNSUPPORTED_RELATION) while
 *      the historical `reason` strings stay byte-identical.
 *   3. The floor derives from the CANONICAL relation table: contrast ⇒
 *      comparison medium, transformation ⇒ labeled_flow, etc.
 *   4. Legacy compat: `reason === "no_payload_no_floor"` still fires with the
 *      nullFloorReason beside it; `semanticPayload` stays byte-compatible.
 */
const adapter = require("./lib/director-adapter");
const { relationForArchetype, mediumForRelation } = require("../src/semantic/stagingEvidence.ts");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

const direction = { shot: "medium", cast: { count: 1 }, props: [] };
const run = (text, archetype, extra = {}) => adapter.buildDirectorOverrides({
  intent: { archetype, requiredActions: [] },
  atom: { text },
  direction,
  ...extra,
});

// ── 1. wider deterministic extraction ───────────────────────────────────────
{
  // sentence-boundary contrast — the P6 #20 case shape ("… real. But …")
  const r = run("The pain is entirely real. But the suffering is optional.", "contrast");
  ok(r.override && r.override.semanticPayload && r.override.semanticPayload.leftLabel === "PAIN IS ENTIRELY REAL"
    && r.override.semanticPayload.rightLabel === "SUFFERING IS OPTIONAL",
    `sentence-boundary contrast stages both poles (got ${JSON.stringify(r.override && r.override.semanticPayload)})`);
  // however / yet
  ok(!!run("Focus is a spotlight. However, multitasking leaks attention.", "contrast").override, "however (clause-opening) yields a contrast floor");
  ok(!!run("Plans are cheap. Yet execution is everything.", "contrast").override, "yet yields a contrast floor");
  // therefore (labels must be telegraph-safe: content words both sides)
  ok(!!run("Attention collapses. Therefore shallow work multiplies.", "cause_effect").override, "therefore yields a causal flow floor");
  // from X to Y (transformation)
  const t = run("The product went from clunky to effortless.", "transformation");
  ok(t.override && t.override.semanticPayload && t.override.semanticPayload.triggerLabel === "CLUNKY"
    && t.override.semanticPayload.consequenceLabel === "EFFORTLESS",
    `from-X-to-Y stages the transformation (got ${JSON.stringify(t.override && t.override.semanticPayload)})`);
  // regression guards: the old conservative behaviors must survive
  ok(!run("We are tearing apart the romantic myth. Okay, lets unpack this.", "cause_effect").override, "no marker ⇒ still no floor");
  ok(!run("Roskolikov did not murder that old woman because he was hungry.", "cause_effect").override, "negation-flip because ⇒ still no floor (LABEL_UNSAFE telemetry)");
  ok(!run("I do not know what this is, but honestly it just feels so wrong to me right now.", "character_psychology").override, "unsafe clause ⇒ still no floor");
}

// ── 2. null-floor telemetry ────────────────────────────────────────────────
{
  const staticR = run("He sat by the sea and thought.", "static_reflection");
  ok(staticR.nullFloorReason === "NO_RELATION" && staticR.reason === "no_semantic_requirement", "static ⇒ NO_RELATION (+ legacy reason)");
  const detected = run("We are tearing apart the romantic myth. Okay, lets unpack this.", "contrast");
  ok(detected.nullFloorReason === "RELATION_DETECTED_EXTRACTION_FAILED" && detected.reason === "no_payload_no_floor",
    "marker-less relational ⇒ RELATION_DETECTED_EXTRACTION_FAILED (+ legacy no_payload_no_floor)");
  const unsafe = run("I do not have a castle in the sky because illusions fade.", "cause_effect");
  ok(unsafe.nullFloorReason === "LABEL_UNSAFE" && unsafe.reason === "no_payload_no_floor", "negation flip ⇒ LABEL_UNSAFE (+ legacy reason)");
  // P7 commit 5: the authored decision is now MEASURED three ways —
  //   satisfied ⇒ AUTHORED_ALREADY_SATISFIES (stage nothing)
  //   unmet + extractable payload ⇒ merge_pending (merge the missing obligation,
  //     adapter emits NO whole-scene override; styling is preserved by design)
  //   unmet + no payload ⇒ unmet_visible (recorded, never silently dropped)
  const flowDirection = { shot: "insert", cast: { count: 0 }, props: [], diagram: { type: "flow", labels: ["FEAR", "PARALYSIS"], values: [], at: 4, scale: 1 } };
  const authoredSatisfied = adapter.buildDirectorOverrides({
    intent: { archetype: "cause_effect", requiredActions: [] }, atom: { text: "Fear becomes paralysis." },
    direction: flowDirection, authoredComposition: true,
  });
  ok(authoredSatisfied.nullFloorReason === "AUTHORED_ALREADY_SATISFIES" && authoredSatisfied.reason === "preserved_authored_composition"
    && authoredSatisfied.override === null && authoredSatisfied.semanticObligation.status === "satisfied_by_authored",
    "authored + already satisfies ⇒ AUTHORED_ALREADY_SATISFIES (stage nothing)");
  const authoredUnmet = run("Fear becomes paralysis.", "cause_effect", { authoredComposition: true });
  ok(authoredUnmet.reason === "preserved_authored_composition" && authoredUnmet.override === null
    && authoredUnmet.mergeObligation === true && authoredUnmet.semanticObligation.status === "merge_pending",
    "authored + unmet + extractable ⇒ merge_pending (styling preserved, obligation merged by the planner)");
  const authoredNoPayload = run("We are tearing apart the romantic myth. Okay, lets unpack this.", "contrast", { authoredComposition: true });
  ok(authoredNoPayload.semanticObligation.status === "unmet_visible" && authoredNoPayload.mergeObligation === undefined
    && authoredNoPayload.nullFloorReason === "RELATION_DETECTED_EXTRACTION_FAILED",
    "authored + unmet + no payload ⇒ unmet_visible (requirement stays visible, never silently dropped)");
  ok(staticR.relation === "none" && detected.relation === "comparison" && detected.medium === "comparison",
    "result carries the canonical relation/medium");
  // UNSUPPORTED_RELATION: relation exists but the archetype branch has no floor implementation
  const seq = adapter.buildDirectorOverrides({
    intent: { archetype: "historical_grounding", requiredActions: [] },
    atom: { text: "In 404 BC the democracy fell to the thirty tyrants." },
    direction,
  });
  ok(seq.relation === "none" && seq.nullFloorReason === "NO_RELATION", "non-relational archetype maps to NO_RELATION (sequence unenforced until needed)");
}

// ── 3. canonical derivation (no second semantic interpretation) ─────────────
{
  ok(relationForArchetype("contrast") === "comparison" && mediumForRelation("comparison") === "comparison", "contrast ⇒ comparison medium");
  ok(relationForArchetype("transformation") === "transformation" && mediumForRelation("transformation") === "labeled_flow", "transformation ⇒ labeled_flow");
  ok(relationForArchetype("allegory_equivalence") === "equivalence" && mediumForRelation("equivalence") === "two_domain_comparison", "equivalence medium");
  ok(relationForArchetype("character_psychology") === "internal_tension", "psychology relation");
}

// ── 4. legacy compat ───────────────────────────────────────────────────────
{
  const p = adapter.semanticPayload({ text: "Scenius versus genius." }, "allegory_equivalence");
  ok(p && p.sourceLabel === "SCENIUS" && p.targetLabel === "GENIUS", "semanticPayload stays byte-compatible");
  const floor = run("Fear becomes paralysis.", "cause_effect");
  ok(floor.reason === "added_causal_flow_floor" && JSON.stringify(floor.override.diagram.labels) === '["FEAR","PARALYSIS"]', "floor labels + reason unchanged");
  ok(floor.nullFloorReason === null, "applied floor ⇒ nullFloorReason null");
}

// ── 5. P8 Aşama 2 — compiler repair classes (quote-faithful, safety unchanged)
{
  // R1 intensifier edge trim: degree modifiers are not the referent; the
  // quoted pole shrinks at the EDGES only, narrator's words verbatim.
  const r1 = run("Completely calm. But the storm is coming.", "contrast");
  ok(r1.override && r1.override.semanticPayload
    && r1.override.semanticPayload.leftLabel === "CALM"
    && r1.override.semanticPayload.rightLabel === "STORM IS COMING",
    `intensifier-edged short poles yield a contrast floor (got ${JSON.stringify(r1.override && r1.override.semanticPayload)})`);
  // R2 core budget aligned with screen-text's own label limit (5 words):
  // "THINKING COMES FROM THE EGO" (5 core tokens) now extracts safely.
  const r2 = run("Raw thoughts are light. They're effortless. But thinking comes from the ego. It is heavily restrictive.", "contrast");
  ok(!!r2.override && r2.override.semanticPayload
    && r2.override.semanticPayload.leftLabel === "EFFORTLESS"
    && r2.override.semanticPayload.rightLabel === "THINKING COMES FROM THE EGO",
    `5-token core pole extracts (got ${JSON.stringify(r2.override && r2.override.semanticPayload)})`);
  // R3 implied contrast: "X isn't (about) A, it's B" and "not A, but B".
  const r3 = run("Managing stress isn't about silencing the mind, it's about changing your relationship to it.", "contrast");
  ok(!!r3.override && r3.override.semanticPayload
    && r3.override.semanticPayload.leftLabel === "SILENCING THE MIND",
    `isn't-X-it's-Y implied contrast stages poles (got ${JSON.stringify(r3.override && r3.override.semanticPayload)})`);
  const r3b = run("This is not a productivity problem, but an emotional regulation problem.", "contrast");
  ok(!!r3b.override && r3b.override.semanticPayload
    && r3b.override.semanticPayload.rightLabel === "EMOTIONAL REGULATION PROBLEM",
    `not-A-but-B implied contrast stages poles (got ${JSON.stringify(r3b.override && r3b.override.semanticPayload)})`);
  // guards: the safety discipline is unchanged by the repairs
  ok(!run("You cannot think your way out of an emotional crisis because the thinking is the crisis.", "cause_effect").override,
    "negation-pole clause ⇒ still refused (LABEL_UNSAFE)");
  ok(!run("The sentence that just crossed your mind was entirely invisible.", "cause_effect").override,
    "6-token core clause ⇒ still no floor (screen-text label limit stands)");
  ok(!run("We are tearing apart the romantic myth. Okay, lets unpack this.", "contrast").override,
    "no marker and no implied shape ⇒ still no floor");
}

console.log(`test-relational-floor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
