#!/usr/bin/env node
/**
 * test-staging-evidence.js — Vision-free 10x P7 commit-1 tests (pure, no I/O).
 *   node scripts/test-staging-evidence.js
 *
 * Proves the locked P7 invariants:
 *   1. Canonical evidence: buildVisualEvidence derives relation+medium ONLY from
 *      the intent's own requiredActions (fixed requirements stay unenforced).
 *   2. The HC3/HC4 triggers and legacy pass paths are byte-preserved.
 *   3. customSvg is credited only with a DECLARED relation ("needle into the
 *      red zone" stages a cause_effect; a bare SVG never does).
 *   4. `customSvg exists` alone NEVER satisfies a medium (spec item 4).
 *   5. ONE judge: the gate's evaluateSceneVisualContract hard set and the
 *      firewall's SEMANTIC_STAGING_VIOLATION set are produced by the same
 *      engine — identical scene+intent in, identical codes out.
 *   6. A scene with no narration carries no semantic staging obligation.
 *   7. (commit 3) A DECLARED customSvg clears HC3/HC4; a bare customSvg never does.
 */
const { buildVisualEvidence, evaluateSemanticStaging, satisfiesMedium, customSvgDeclaresRelation, mediumForRelation } = require("../src/semantic/stagingEvidence.ts");
const { deriveVisualIntent } = require("../src/semantic/visualIntent.ts");
const { createVisualContractFromAtom, evaluateSceneVisualContract } = require("../src/semantic/visualContract.ts");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

const atomOf = (text) => ({ text, subject: null, action: null, object: null, relationship: null, concepts: [], abstraction: "conceptual", visualNeed: text });

// ── 1. canonical evidence ────────────────────────────────────────────────────
{
  const atom = atomOf("Discipline is not punishment; it is freedom.");
  const intent = deriveVisualIntent(atom);
  const ev = buildVisualEvidence(atom, intent);
  ok(ev.requiredRelation === "comparison" || ev.requiredRelation === "none", `contrast derives a relation or stays unenforced (got ${ev.requiredRelation})`);
  ok(typeof ev.representation === "string", "evidence carries a representation medium");
  ok(ev.provenance === "derived_visual_intent", "evidence provenance is declared");
  ok(Array.isArray(ev.subjects) && ev.subjects.length <= 2, "subjects bounded (anchor + object)");
  ok(Array.isArray(ev.poles) && ev.poles.length === 0, "poles start empty (commit 4 fills them)");
  // fixed requirements must NOT create a staging obligation
  const fixed = { ...intent, archetype: "contrast", requiredActions: [] };
  const evFixed = buildVisualEvidence(atom, fixed);
  ok(evFixed.requiredRelation === "none" && evFixed.representation === "none", "intent without requiredActions derives NO obligation (fixed requirements unenforced)");
  // non-relational archetype
  const evStatic = buildVisualEvidence(atomOf("He sat by the sea and thought."), deriveVisualIntent(atomOf("He sat by the sea and thought.")));
  ok(evStatic.requiredRelation === "none", "static_reflection carries no obligation");
}

// ── 2. HC trigger preservation (via evaluateSceneVisualContract) ─────────────
{
  const atom = atomOf("The city mirrors the structure of the human soul.");
  const contract = createVisualContractFromAtom(atom, "t-hc3");
  const bad = evaluateSceneVisualContract(
    { characters: [{ role: "plato", action: "talk" }], props: [{ type: "kallipolis" }], bg: { set: "agora" } },
    contract
  );
  ok(bad.hardViolations.some((v) => v.startsWith("MISSING_STRUCTURAL_EQUIVALENCE")), "HC3 fires on unstaged equivalence (shared judge)");
  const good = evaluateSceneVisualContract(
    { characters: [], props: [{ type: "soulCityMirrorDiagram" }], bg: { set: "conceptualSplit" } },
    contract
  );
  ok(!good.hardViolations.some((v) => v.startsWith("MISSING_STRUCTURAL_EQUIVALENCE")), "HC3 passes on structural prop");
  const dual = evaluateSceneVisualContract(
    { characters: [{ role: "a", action: "point" }, { role: "b", action: "talk" }], props: [], bg: { set: "agora" } },
    contract
  );
  ok(!dual.hardViolations.some((v) => v.startsWith("MISSING_STRUCTURAL_EQUIVALENCE")), "HC3 legacy dual-active-subjects pass preserved");
  const atomIdle = atomOf("He realizes his whole life was denial.");
  const contractIdle = createVisualContractFromAtom(atomIdle, "t-hc4");
  const wallpaper = evaluateSceneVisualContract(
    { characters: [{ role: "narrator", action: "talk" }], props: [], bg: { set: "stage" } },
    contractIdle
  );
  ok(wallpaper.hardViolations.some((v) => v.startsWith("IDLE_ACTOR_WALLPAPER")), "HC4 fires on idle talking head (shared judge)");
}

// ── 3+4. customSvg declarative credit ────────────────────────────────────────
{
  const gauge = { title: "Thoughts per minute", reads: "the needle swings into the red zone as the loop tightens" };
  ok(customSvgDeclaresRelation(gauge, "cause_effect"), "gauge needle→red-zone DECLARES cause_effect");
  ok(!customSvgDeclaresRelation({ title: "A wall of laws", reads: "a brick wall three courses high" }, "cause_effect"), "wall SVG does not declare cause_effect");
  ok(!customSvgDeclaresRelation({ title: "", reads: "" }, "comparison"), "empty declaration credits nothing");
  ok(!customSvgDeclaresRelation(null, "comparison"), "null SVG credits nothing");
  ok(!customSvgDeclaresRelation(gauge, "none"), "no obligation → nothing to credit");
  // existence alone never satisfies a medium
  const sceneSvgOnly = { characters: [{ role: "n", action: "talk" }], props: [{ type: "customSvg", customSvg: { title: "Decorative blob", reads: "some shapes" } }] };
  ok(!satisfiesMedium(sceneSvgOnly, "comparison", "comparison"), "customSvg existence alone does NOT satisfy comparison");
  ok(!satisfiesMedium(sceneSvgOnly, "cause_effect_flow", "cause_effect"), "customSvg existence alone does NOT satisfy cause_effect_flow");
  // a declaring SVG credits the matching medium (not flow diagrams — that stays diagram-bound)
  const sceneGauge = { characters: [{ role: "n", action: "talk" }], props: [{ type: "customSvg", customSvg: gauge }] };
  ok(satisfiesMedium(sceneGauge, "internal_tension", "cause_effect"), "declared SVG satisfies a declared-credit medium");
}

// ── 5. ONE judge: gate hard set == firewall engine set for the same input ────
{
  // The gate consumes evaluateSemanticStaging internally (visualContract.ts);
  // call the engine directly with the same atom+intent the gate derives.
  const atom = atomOf("The city mirrors the structure of the human soul.");
  const intent = deriveVisualIntent(atom);
  const scene = { characters: [{ role: "plato", action: "talk" }], props: [{ type: "kallipolis" }], bg: { set: "agora" } };
  const contract = createVisualContractFromAtom(atom, "t-one-judge", undefined, intent);
  const gateHard = evaluateSceneVisualContract(scene, contract).hardViolations.filter((v) =>
    v.startsWith("MISSING_STRUCTURAL_EQUIVALENCE") || v.startsWith("IDLE_ACTOR_WALLPAPER"));
  const engine = evaluateSemanticStaging({ scene, intent });
  ok(JSON.stringify(gateHard) === JSON.stringify(engine.hardViolations),
    `gate semantic set == engine set (${JSON.stringify(gateHard)} vs ${JSON.stringify(engine.hardViolations)})`);
}

// ── 6. commit 3: declared SVG clears hard checks; bare SVG never does ───────
{
  const atomCause = atomOf("When the loop tightens, attention collapses into the red zone of burnout.");
  const intentCause = deriveVisualIntent(atomCause);
  const gauge = { title: "Thoughts per minute", reads: "the needle swings into the red zone as the loop tightens" };
  const sceneGauge = { characters: [{ role: "n", action: "talk" }], props: [{ type: "customSvg", customSvg: gauge }] };
  const cleared = evaluateSemanticStaging({ scene: sceneGauge, intent: intentCause });
  ok(!cleared.hardViolations.some((v) => v.startsWith("IDLE_ACTOR_WALLPAPER")), "declared gauge SVG clears HC4 (idle wallpaper)");
  ok(cleared.diagnostics.some((d) => d.startsWith("idle_wallpaper_cleared_by:declared-svg")), "clearance is recorded as a diagnostic with its source");
  const bare = evaluateSemanticStaging({
    scene: { characters: [{ role: "n", action: "talk" }], props: [{ type: "customSvg", customSvg: { title: "Blob study", reads: "some shapes floating" } }] },
    intent: intentCause,
  });
  ok(bare.hardViolations.some((v) => v.startsWith("IDLE_ACTOR_WALLPAPER")), "bare customSvg does NOT clear HC4");
  // equivalence: a declared mirror SVG satisfies HC3 where nothing else does
  const atomEq = atomOf("The network mirrors the structure of a living hive.");
  const intentEq = deriveVisualIntent(atomEq);
  const svgEq = evaluateSemanticStaging({
    scene: { characters: [{ role: "n", action: "talk" }], props: [{ type: "customSvg", customSvg: { title: "Hive network", reads: "the hive mirrors the network like a map" } }] },
    intent: intentEq,
  });
  ok(!svgEq.hardViolations.some((v) => v.startsWith("MISSING_STRUCTURAL_EQUIVALENCE")), "declared mirror SVG clears HC3");
  // non-SVG structural prop still passes the legacy path unchanged
  const legacy = evaluateSemanticStaging({ scene: { characters: [], props: [{ type: "soulCityMirrorDiagram" }] }, intent: intentEq });
  ok(!legacy.hardViolations.length, "legacy structural-prop pass unchanged");
}

// ── 7. no narration → no obligation (firewall guard) ────────────────────────
{
  // The guard lives in the firewall; here we prove the engine itself never
  // fabricates an obligation from an empty-intent scene.
  const engine = evaluateSemanticStaging({ scene: { characters: [] }, intent: null, evidence: null });
  ok(engine.hardViolations.length === 0 && !engine.required, "no intent + no evidence → no hard violations");
  ok(mediumForRelation("none") === "none", "none relation → none medium");
}

console.log(`test-staging-evidence: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
