#!/usr/bin/env node
/**
 * test-strategy-enforcement.js — P1.4 PHASE C integration tests (pure, no LLM, no I/O
 * beyond reading this repo's sources).   node scripts/test-strategy-enforcement.js
 *
 * Proves the locked C invariants:
 *   1. Strategy → requirement → VisualContract.visualEvidence → Firewall → real scene.
 *   2. The firewall NEVER reads `_visualStrategy` — metadata can never move a verdict;
 *      only visualEvidence.representation + the real scene state can.
 *   3. The requirement transport (copyStrategyRequirement) is MERGE-ONLY, byte-level:
 *      subjects/relations/states/characterIntent identical, representation added/replaced.
 *   4. Per-strategy bindings bind to renderer-verified scene fields; RELATION_LOCK is
 *      PARTY-SCOPED (a third character's lookAt never satisfies the binding).
 *   5. Backward compatibility: no representation key → zero new violations.
 *
 * The capability map here is a small SYNTHETIC deterministic map for unit tests;
 * the real map's values (illustration 0.800 / medium 0.845 / diorama 0.938 /
 * closeUp 0.917) are exercised in test-visual-strategy.js.
 */
const fs = require("fs");
const path = require("path");
const { decideStrategy, requirementFor, STRATEGY_LEVERS } = require("./lib/visual-strategy");
const { copyStrategyRequirement } = require("./inject-provenance");
const { validateScene } = require("./lib/narrative-visual-firewall");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (got ${JSON.stringify(a).slice(0, 120)})`);
const codes = (errors) => errors.map((e) => e.reasonCode);

// ── synthetic deterministic capability map ──
const MAP = {
  capabilities: {
    "action:talk": { confidence: 0.9 }, "action:idle": { confidence: 0.9 }, "action:sit": { confidence: 0.9 },
    "action:walk": { confidence: 0.9 },
    "shot:medium": { confidence: 0.845 }, "shot:twoShot": { confidence: 0.65 },
    "shot:diorama": { confidence: 0.938 }, // the measured-safe fallback in this map
    "expression:neutral": { confidence: 0.75 }, "expression:worried": { confidence: 0.9 },
    "emotion:shock": { confidence: 0.9 },
  },
};

// ── minimal but complete provenance bible for the firewall ──
const PROVENANCE = {
  bookId: "synthetic", worldId: "synthetic-world", sourceChapter: "ch1",
  narrativeSubject: "manager", narrativeRelation: "manager confronts employee", narrativeState: "tense",
  allowedMotifs: ["x"], forbiddenMotifs: [], allowedCharacters: ["manager", "employee", "observer"],
  allowedLocations: ["room"], allowedProps: ["x"],
};
const BIBLE = {
  world: { era: "present", worldId: "synthetic-world" },
  visualProvenance: { bookId: "synthetic", worldId: "synthetic-world", allowedMotifs: ["x"], forbiddenMotifs: [], allowedCharacters: ["manager", "employee", "observer"], allowedLocations: ["room"], allowedProps: ["x"] },
  cast: { manager: { name: "M", look: "suit", variant: { a: 1 } }, employee: { name: "E", look: "shirt", variant: { b: 2 } }, observer: { name: "O", look: "coat", variant: { c: 3 } } },
  places: { room: { set: "room", look: "plain" } },
  objects: [],
};

const baseScene = (over = {}) => ({
  id: "scene-01", shot: "medium", bg: { set: "room" },
  narrativeAtom: { ...PROVENANCE },
  visualIntent: { ...PROVENANCE },
  visualContract: { ...PROVENANCE, visualEvidence: { subjects: ["manager"], relations: ["manager confronts employee"], states: ["tense"], characterIntent: [] } },
  characters: [], props: [], texts: [],
  ...over,
});
const withRepresentation = (scene, requirement) => {
  scene.visualContract.visualEvidence.representation = requirement;
  return scene;
};
const validate = (scene) => validateScene(scene, 0, BIBLE, "synthetic");
const hasCode = (scene, rc) => validate(scene).some((e) => e.reasonCode === rc);
const strategyCodes = (scene) => codes(validate(scene)).filter((c) => c.startsWith("STRATEGY_"));

// ── 0. the firewall never reads the metadata (grep-able, plus §J tests) ──
const fwSrc = fs.readFileSync(path.join(__dirname, "lib", "narrative-visual-firewall.js"), "utf8");
ok(!fwSrc.includes("_visualStrategy"), "firewall source contains NO reference to _visualStrategy");

// ── A. CONTRAST_ABSENCE ──
const recAbs = decideStrategy({ atom: { text: "Robots cannot knowingly lie." }, scene: { shot: "medium", characters: [{ action: "talk" }] }, narration: "Robots cannot knowingly lie.", capabilityMap: MAP });
ok(recAbs.strategy === "CONTRAST_ABSENCE", "negation → CONTRAST_ABSENCE record");
const reqAbs = requirementFor(recAbs, MAP);
eq(reqAbs.textStyles, ["strike"], "absence textStyles derived from the strategy's own lever declaration");
eq(reqAbs.propArcs, ["shrink", "closein"], "absence propArcs derived from the lever declaration");
ok(!hasCode(withRepresentation(baseScene({ texts: [{ text: "NOT THIS", style: "strike" }] }), reqAbs), "STRATEGY_REQUIREMENT_UNMET"), "absence satisfied (strike text) → clean");
ok(hasCode(withRepresentation(baseScene({ texts: [{ text: "hello", style: "box" }] }), reqAbs), "STRATEGY_REQUIREMENT_UNMET"), "absence violated (no lever present) → STRATEGY_REQUIREMENT_UNMET");

// ── B. ABSTRACT_CONCRETE ──
const recCon = decideStrategy({ atom: { text: "The company became a prison." }, scene: { shot: "medium", characters: [{ action: "talk" }] }, narration: "The company became a prison.", capabilityMap: MAP });
ok(recCon.strategy === "ABSTRACT_CONCRETE", "metaphor → ABSTRACT_CONCRETE record");
const reqCon = requirementFor(recCon, MAP);
eq(reqCon.shots, ["illustration", "diorama", "insert"], "concrete shots derived from levers");
ok(!hasCode(withRepresentation(baseScene({ shot: "illustration" }), reqCon), "STRATEGY_REQUIREMENT_UNMET"), "concrete satisfied (illustration shot) → clean");
ok(hasCode(withRepresentation(baseScene({ shot: "medium" }), reqCon), "STRATEGY_REQUIREMENT_UNMET"), "concrete violated → UNMET names shot + allowed shots");
ok(!hasCode(withRepresentation(baseScene({ shot: "medium", diagram: { type: "flow" } }), reqCon), "STRATEGY_REQUIREMENT_UNMET"), "concrete satisfied via diagram → clean");

// ── C. EXPLICIT_STATE ──
const recState = decideStrategy({ atom: { text: "He was devastated, but remained composed." }, scene: { shot: "medium", characters: [{ action: "sit", expression: "neutral" }] }, narration: "He was devastated, but remained composed.", capabilityMap: MAP });
ok(recState.strategy === "EXPLICIT_STATE", "emotion inversion → EXPLICIT_STATE record");
const reqState = requirementFor(recState, MAP);
ok(reqState.expressions.includes("worried") && reqState.emotions.includes("shock"), "state expressions/emotions derived from levers");
ok(!hasCode(withRepresentation(baseScene({ characters: [{ identity: "manager", expression: "worried" }] }), reqState), "STRATEGY_REQUIREMENT_UNMET"), "state satisfied (worried expression) → clean");
ok(hasCode(withRepresentation(baseScene({ characters: [{ identity: "manager", expression: "neutral" }] }), reqState), "STRATEGY_REQUIREMENT_UNMET"), "state violated (neutral only) → UNMET");

// ── D. RELATION_LOCK — full pipeline, PARTY-SCOPED gaze ──
const relAtom = { text: "The manager confronts the employee.", subject: "manager", object: "employee", relationship: "manager confronts employee" };
const relRec = decideStrategy({ atom: relAtom, scene: { shot: "twoShot", characters: [{ identity: "manager", action: "talk" }, { identity: "employee", action: "idle" }] }, narration: relAtom.text, capabilityMap: MAP });
ok(relRec.strategy === "RELATION_LOCK", "relation-bearing atom + cast → RELATION_LOCK");
const reqRel = requirementFor(relRec, MAP);
eq(reqRel.parties, ["manager", "employee"], "relation parties from the atom's subject/object");
eq(reqRel.shots, ["twoShot", "overShoulder", "split"], "relation-capable shots from levers");
eq(reqRel.lookAt, "partner", "relation lookAt binding");
ok(!hasCode(withRepresentation(baseScene({ shot: "twoShot", characters: [{ identity: "manager", lookAt: "partner" }, { identity: "employee", lookAt: "motif" }] }), reqRel), "STRATEGY_REQUIREMENT_UNMET"), "relation satisfied (both parties + capable shot + party gaze) → clean");
// operator's case: the THIRD character carries the gaze — must NOT satisfy
ok(hasCode(withRepresentation(baseScene({ shot: "twoShot", characters: [{ identity: "manager", lookAt: "motif" }, { identity: "employee", lookAt: "viewer" }, { identity: "observer", lookAt: "partner" }] }), reqRel), "STRATEGY_REQUIREMENT_UNMET"), "PARTY-SCOPED: a non-party lookAt:'partner' never satisfies the binding");
ok(hasCode(withRepresentation(baseScene({ shot: "twoShot", characters: [{ identity: "manager", lookAt: "partner" }] }), reqRel), "STRATEGY_REQUIREMENT_UNMET"), "relation violated (employee off screen) → UNMET names the missing party");
ok(hasCode(withRepresentation(baseScene({ shot: "medium", characters: [{ identity: "manager", lookAt: "partner" }, { identity: "employee" }] }), reqRel), "STRATEGY_REQUIREMENT_UNMET"), "relation violated (shot not relation-capable) → UNMET");

// ── E. SAFE_REPRESENTATION — the measured-safe lever becomes a scene fact ──
const recSafeLow = decideStrategy({ atom: { text: "plain claim" }, scene: { shot: "medium", characters: [{ action: "sit", expression: "neutral" }] }, narration: "plain claim", capabilityMap: { capabilities: { "action:sit": { confidence: 0.688 }, "shot:medium": { confidence: 0.9 }, "expression:neutral": { confidence: 0.9 } } } });
ok(recSafeLow.strategy === "SAFE_REPRESENTATION", "LOW_CAPABILITY branch → SAFE_REPRESENTATION");
const reqSafe = requirementFor(recSafeLow, MAP);
eq(reqSafe, { kind: "fallback", lever: "diorama", confidence: 0.938 }, "fallback requirement = best MEASURED-safe lever in the map (declaration alone never qualifies)");
const recSafeUnk = decideStrategy({ atom: { text: "plain claim" }, scene: { shot: "crowd", characters: [{ action: "walk", expression: "neutral" }] }, narration: "plain claim", capabilityMap: MAP });
ok(recSafeUnk.strategy === "SAFE_REPRESENTATION" && recSafeUnk.evidence.fallback, "UNKNOWN branch with measured fallback → SAFE_REPRESENTATION");
eq(requirementFor(recSafeUnk, MAP), reqSafe, "both SAFE branches bind to the SAME measured requirement (branch-independent)");
ok(!hasCode(withRepresentation(baseScene({ shot: "diorama" }), reqSafe), "STRATEGY_REQUIREMENT_UNMET"), "fallback satisfied (scene.shot === lever) → clean");
ok(hasCode(withRepresentation(baseScene({ shot: "medium" }), reqSafe), "STRATEGY_REQUIREMENT_UNMET"), "fallback violated → UNMET names the measured-safe lever");

// ── F. no-requirement strategies ──
eq(requirementFor({ strategy: "DIRECT_SCENE", levers: [] }, MAP), null, "DIRECT_SCENE implies no requirement");
eq(requirementFor({ strategy: "UNRESOLVED", levers: [], evidence: { note: "x" } }, MAP), null, "UNRESOLVED implies no requirement in C (report-only; D acceptance criterion)");

// ── G. malformed evidence is HARD ──
ok(hasCode(withRepresentation(baseScene(), {}), "STRATEGY_EVIDENCE_MALFORMED"), "representation without kind → STRATEGY_EVIDENCE_MALFORMED");
ok(hasCode(withRepresentation(baseScene(), "fallback"), "STRATEGY_EVIDENCE_MALFORMED"), "non-object representation → MALFORMED");
ok(hasCode(withRepresentation(baseScene(), { kind: "vibes" }), "STRATEGY_EVIDENCE_MALFORMED"), "unknown kind → MALFORMED");

// ── H. backward compatibility: no representation key → zero new codes ──
eq(strategyCodes(baseScene()), [], "pre-C config (no representation) → no STRATEGY_* codes at all");
eq(strategyCodes(baseScene({ characters: [{ identity: "manager" }] })), [], "DIRECT-scene-shaped config → no STRATEGY_* codes");

// ── I. MERGE-ONLY transport, byte-level (operator test 1) ──
{
  const before = { subjects: ["manager"], relations: ["manager confronts employee"], states: ["tense"] };
  const sceneW = { _visualStrategy: { requirement: reqRel } };
  const after = copyStrategyRequirement(sceneW, before);
  eq(after.subjects, before.subjects, "merge: subjects identical");
  eq(after.relations, before.relations, "merge: relations identical");
  eq(after.states, before.states, "merge: states identical");
  eq(after.representation, reqRel, "merge: representation added (deep copy)");
  ok(after.representation !== sceneW._visualStrategy.requirement, "merge: representation is a copy, not a shared reference");
  ok(!("representation" in before), "merge: the input evidence object is NOT mutated");
  ok(copyStrategyRequirement({}, before) === before, "no requirement → the SAME evidence object returned untouched");
  ok(copyStrategyRequirement({ _visualStrategy: null }, before) === before, "no _visualStrategy → untouched");
  // the inject-provenance --force rebuild path: a C rebuild minus representation
  // is byte-identical to a non-C rebuild
  const rebuilt = copyStrategyRequirement(sceneW, { subjects: ["s"], relations: ["r"], states: ["st"] });
  const { representation, ...rest } = rebuilt;
  eq(rest, { subjects: ["s"], relations: ["r"], states: ["st"] }, "--force rebuild: everything but representation is byte-identical");
  eq(representation, reqRel, "--force rebuild: representation carries the requirement");
  ok(JSON.parse(JSON.stringify(reqRel)).lookAt === "partner", "requirement survives a config JSON round-trip");
}

// ── J. metadata vs evidence — the firewall's authority is the SCENE (operator test 2) ──
{
  // original: RELATION_LOCK record + relation requirement + satisfied scene
  const satisfied = baseScene({ shot: "twoShot", characters: [{ identity: "manager", lookAt: "partner" }, { identity: "employee", lookAt: "motif" }] });
  withRepresentation(satisfied, reqRel);
  const original = { ...satisfied, _visualStrategy: { strategy: "RELATION_LOCK" } };
  // mutation: flip ONLY the metadata — evidence + scene unchanged
  const mutated = { ...satisfied, _visualStrategy: { strategy: "SAFE_REPRESENTATION" } };
  eq(strategyCodes(mutated), strategyCodes(original), "metadata flip (SAFE on a relation scene) leaves every verdict byte-identical");
  eq(strategyCodes({ ...satisfied }), strategyCodes(original), "deleting _visualStrategy entirely leaves every verdict byte-identical");
  ok(strategyCodes(original).length === 0, "satisfied relation scene → no strategy violations regardless of metadata");

  // reverse: fallback requirement + fallback NOT satisfied, metadata claims RELATION_LOCK
  const failing = withRepresentation(baseScene({ shot: "medium" }), reqSafe);
  const f1 = { ...failing, _visualStrategy: { strategy: "SAFE_REPRESENTATION" } };
  const f2 = { ...failing, _visualStrategy: { strategy: "RELATION_LOCK" } };
  const f3 = { ...failing };
  eq(strategyCodes(f1), strategyCodes(f2), "metadata flip on a failing scene changes nothing");
  eq(strategyCodes(f2), strategyCodes(f3), "deleting the metadata changes nothing");
  ok(strategyCodes(f1).includes("STRATEGY_REQUIREMENT_UNMET"), "evidence ⇄ scene decides: fallback unsatisfied → STRATEGY_REQUIREMENT_UNMET under every metadata variant");
  // and the same failing scene with NO representation key is clean — proof the
  // violation comes from the evidence+scene pair, not from anything else
  eq(strategyCodes(baseScene({ shot: "medium" })), [], "same scene without the evidence key → no violation");
}

// ── L. decideStrategy stays pure; records are deterministic (re-plan shape) ──
{
  const scene = { shot: "twoShot", characters: [{ identity: "manager", action: "talk" }, { identity: "employee", action: "idle" }] };
  const atom = { ...relAtom };
  const before = JSON.stringify({ scene, atom });
  const r1 = decideStrategy({ atom, scene, narration: atom.text, capabilityMap: MAP });
  const r2 = decideStrategy({ atom, scene, narration: atom.text, capabilityMap: MAP });
  ok(JSON.stringify({ scene, atom }) === before, "decideStrategy still mutates nothing");
  eq(r1, r2, "same inputs → identical record (re-plan determinism)");
  eq(r1.strategy, "RELATION_LOCK", "pipeline unchanged from PHASE B");
}

// ── M. title-card severity carve-out (Gate C.1, operator-approved 2026-10-02) ──
// An unsatisfiable requirement on the title card (planner hard-codes the
// sub-callout style; stageRequirement skips titles) is DIAGNOSTIC, not hard —
// and the exemption is scoped to the title card only (index 0 + id "intro").
{
  const violated = (id, index) => {
    const scene = withRepresentation(baseScene({ id, texts: [{ text: "hello", style: "box" }] }), reqAbs);
    return validateScene(scene, index, BIBLE, "synthetic").find((e) => e.reasonCode === "STRATEGY_REQUIREMENT_UNMET");
  };
  const intro = violated("intro", 0);
  ok(!!intro, "title-card UNMET still reported (never silent)");
  ok(intro && intro.severity === "diagnostic", "title-card (index 0 + id intro) UNMET → diagnostic, not hard");
  ok(intro && typeof intro.reason === "string" && intro.reason.includes("title card"), "title-card diagnostic carries its reason");
  const other = violated("scene-02", 0);
  ok(!!other && other.severity !== "diagnostic", "same unsatisfiable requirement on a normal scene → HARD");
  const lateIntro = violated("intro", 1);
  ok(!!lateIntro && lateIntro.severity !== "diagnostic", "id intro at index 1 (not the title position) → HARD");
}

console.log(`test-strategy-enforcement: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
