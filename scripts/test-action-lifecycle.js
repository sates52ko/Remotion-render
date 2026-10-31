#!/usr/bin/env node
/**
 * test-action-lifecycle.js — P1.4 PHASE D tests (D1–D4, operator acceptance criteria).
 *   node scripts/test-action-lifecycle.js
 *
 * D1 authored action survives the lifecycle — sanitizeAction's fallback is never a
 *    semantic escape hatch: a schema-external authored action is RECORDED, not swapped.
 * D2 enumActions is wired — decideStrategy fails closed on invalid actions; the
 *    resolution is explicit, plan-tagged, and transportable.
 * D3 UNRESOLVED has an explicit lifecycle — no proof → HARD STRATEGY_UNRESOLVED at
 *    the firewall; report-only is over.
 * D4 schema-external actions — the firewall evaluates the final scene against the
 *    RENDERER's own enum; "the renderer cannot parse it" is a failure, not a gap.
 */
const { decideStrategy, resolveStrategy, RENDERER_ACTIONS, ENUM_REPAIRS, ENUM_INVALID_ACTIONS } = require("./lib/visual-strategy");
const { copyStrategyRequirement } = require("./inject-provenance");
const { validateScene } = require("./lib/narrative-visual-firewall");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (got ${JSON.stringify(a).slice(0, 140)})`);
const hasCode = (errors, rc) => errors.some((e) => e.reasonCode === rc);

const MAP = { capabilities: { "action:talk": { confidence: 0.9 }, "action:walk": { confidence: 0.9 }, "action:point": { confidence: 0.85 }, "action:idle": { confidence: 0.9 }, "action:push": { confidence: 0.85 }, "action:grab": { confidence: 0.85 }, "action:kneel": { confidence: 0.85 }, "shot:medium": { confidence: 0.9 }, "expression:none": { confidence: 0.9 }, "expression:neutral": { confidence: 0.9 }, "shot:diorama": { confidence: 0.938 } } };
const ENUM = RENDERER_ACTIONS; // the renderer's own enum — the lifecycle's single source of truth
ok(ENUM.has("point") && ENUM.has("reach") && !ENUM.has("push") && !ENUM.has("grab"), "renderer enum is the real schema enum (point/reach in, push/grab out)");

// ── D4: schema-external actions fail closed at the firewall, on ANY scene ──
const PROV = { bookId: "s", worldId: "w", sourceChapter: "c", narrativeSubject: "x", narrativeRelation: "r", narrativeState: "s", allowedMotifs: ["m"], forbiddenMotifs: [], allowedCharacters: ["x"], allowedLocations: ["room"], allowedProps: ["m"] };
const BIBLE = { world: { era: "now", worldId: "w" }, visualProvenance: { bookId: "s", worldId: "w", allowedMotifs: ["m"], forbiddenMotifs: [], allowedCharacters: ["x"], allowedLocations: ["room"], allowedProps: ["m"] }, cast: { x: { name: "X", look: "l", variant: { v: 1 } } }, places: { room: { set: "room", look: "l" } }, objects: [] };
const mk = (chars, over = {}) => ({ id: "scene-01", shot: "medium", bg: { set: "room" }, narrativeAtom: { ...PROV }, visualIntent: { ...PROV }, visualContract: { ...PROV, visualEvidence: { subjects: ["x"], relations: ["r"], states: ["s"], characterIntent: [] } }, characters: chars, props: [], texts: [], ...over });
ok(hasCode(validateScene(mk([{ identity: "x", action: "push" }]), 0, BIBLE, "s"), "STRATEGY_ACTION_SCHEMA_EXTERNAL"), "D4: push (renderer-unparseable) → STRATEGY_ACTION_SCHEMA_EXTERNAL hard");
ok(hasCode(validateScene(mk([{ identity: "x", action: "gesture" }]), 0, BIBLE, "s"), "STRATEGY_ACTION_SCHEMA_EXTERNAL"), "D4: gesture → STRATEGY_ACTION_SCHEMA_EXTERNAL hard");
eq(validateScene(mk([{ identity: "x", action: "point" }]), 0, BIBLE, "s").filter((e) => e.reasonCode.startsWith("STRATEGY_ACTION")), [], "D4: enum-valid action → no ACTION_* codes");
ok(!JSON.stringify(validateScene(mk([{ identity: "x", action: "push" }]), 0, BIBLE, "s")).match(/"severity"\s*:\s*"diagnostic".*STRATEGY_ACTION/), "D4: the ACTION failure is HARD, not diagnostic");

// ── D2: decideStrategy wired with enumActions ──
const rec = decideStrategy({ atom: { text: "plain claim" }, scene: { shot: "medium", characters: [{ action: "push" }] }, narration: "plain claim", capabilityMap: MAP, enumActions: ENUM });
ok(rec.strategy === "UNRESOLVED", "D2: enum-invalid action → UNRESOLVED (precedence 0 fires)");
ok(rec.evidence.invalidActions.includes("push"), "D2: invalid action named in the record");

// ── D1: the plan-tagged repair lifecycle ──
const scene = { shot: "medium", characters: [{ identity: "x", action: "push" }, { identity: "y", action: "grab" }], _authorship: { src: "none" } };
const rec2 = decideStrategy({ atom: { text: "plain claim" }, scene: { ...scene, characters: scene.characters.map((c) => ({ ...c, expression: "none" })) }, narration: "plain claim", capabilityMap: MAP, enumActions: ENUM });
const res = resolveStrategy(rec2, { scene, enumActions: ENUM });
eq(res.kind, "repaired", "D1: repairable schema-external actions → kind 'repaired'");
eq(res.repairs.map((r) => `${r.from}->${r.to}@${r.charIndex}`), ["push->point@0", "grab->reach@1"], "D1: repairs are per-character, plan-tagged, recorded");
eq(scene.characters[0].action, "point", "D1: push REPAIRED to point (measured adjacency), never a silent generic");
eq(scene.characters[1].action, "reach", "D1: grab REPAIRED to reach");
ok(ENUM.has(scene.characters[0].action) && ENUM.has(scene.characters[1].action), "D1: every repaired action is enum-valid");
ok(res.repairs.every((r) => r.source === "plan"), "D1: every repair is plan-tagged (no silent mutation)");

// sanitizeAction keeps its enum-internal swap and is unaffected by D
const { sanitizeAction } = require("./lib/director-adapter");
eq(sanitizeAction("celebrate", ["celebrate_action"]), "think", "D1: sanitizeAction's enum-internal swap unchanged");
eq(sanitizeAction("walk", []), "walk", "D1: sanitizeAction never touches enum-valid actions");

// ── D1: authored action without a repair entry — NO silent generic fallback ──
const aScene = { shot: "medium", characters: [{ identity: "x", action: "kneel" }], _authorship: { src: "art" } };
const aRec = decideStrategy({ atom: { text: "plain claim" }, scene: { ...aScene, characters: [{ identity: "x", action: "kneel", expression: "none" }] }, narration: "plain claim", capabilityMap: MAP, enumActions: ENUM });
ok(aRec.strategy === "UNRESOLVED", "D1: kneel is enum-invalid → the enum path fires first (D2 precedence 0), exactly as locked");
const aRes = resolveStrategy(aRec, { scene: aScene, enumActions: ENUM });
eq(aRes.kind, "authored_proof_required", "D1: authored action outside the enum demands proof (no repair entry)");
eq(aScene.characters[0].action, "kneel", "D1: the authored action STAYS on the scene — no silent talk/idle swap");
ok(/no silent generic fallback/.test(aRes.note), "D1: the note names the no-fallback rule");
const aEv = copyStrategyRequirement({ _visualStrategy: { resolution: { kind: "authored_proof_required", invalidActions: ["kneel"], note: aRes.note } }, _authorship: { src: "art" } }, { subjects: ["x"], relations: ["r"], states: ["s"] });
eq(aEv.strategyResolution.kind, "authored_proof_required", "D1: authored_proof_required transports as strategyResolution");
eq(aEv.resolutionProof.authored, "art", "D1: the authorship proof travels with the resolution");

// the firewall re-derives authored from the SCENE and demands re-authoring — the
// transport's proof field is informational, never authoritative
const fwScene = mk([{ identity: "x", action: "kneel" }]);
fwScene._authorship = { src: "art" };
fwScene.visualContract.visualEvidence.strategyResolution = { kind: "authored_proof_required", invalidActions: ["kneel"], note: "x" };
ok(hasCode(validateScene(fwScene, 0, BIBLE, "s"), "STRATEGY_ACTION_PROOF_REQUIRED"), "D1: authored enum-external action → STRATEGY_ACTION_PROOF_REQUIRED (re-author demand, no fallback)");

// ── D3: UNRESOLVED has an explicit lifecycle — report-only is over ──
const uScene = { shot: "medium", characters: [{ identity: "x", action: "talk" }], _authorship: { src: "none" } };
const uRec = decideStrategy({ atom: { text: "plain claim" }, scene: uScene, narration: "plain claim", capabilityMap: { capabilities: {} }, enumActions: ENUM });
ok(uRec.strategy === "UNRESOLVED", "D3 fixture: unknown capability + unproven action → UNRESOLVED");
const uRes = resolveStrategy(uRec, { scene: uScene, enumActions: ENUM });
eq(uRes.kind, "unresolved_no_proof", "D3: UNRESOLVED record → resolution 'unresolved_no_proof'");
const uEv = copyStrategyRequirement({ _visualStrategy: { resolution: { kind: "unresolved_no_proof", note: "unknown capability with unproven action safety" } }, _authorship: { src: "none" } }, { subjects: ["x"], relations: ["r"], states: ["s"] });
eq(uEv.strategyResolution.kind, "unresolved_no_proof", "D3: unresolved_no_proof transports as strategyResolution");
ok(hasCode(validateScene(mk([{ identity: "x", action: "talk" }]), 0, BIBLE, "s") === undefined ? undefined : (() => { const s = mk([{ identity: "x", action: "talk" }]); s.visualContract.visualEvidence.strategyResolution = { kind: "unresolved_no_proof", note: "unproven" }; return validateScene(s, 0, BIBLE, "s"); })(), "STRATEGY_UNRESOLVED"), "D3: no proof → HARD STRATEGY_UNRESOLVED (production PASS denied)");
// and the ONLY exits: proof (authored) or re-authoring
{
  const s = mk([{ identity: "x", action: "talk" }]);
  s.visualContract.visualEvidence.strategyResolution = { kind: "repaired", repairs: [{ from: "push", to: "point", source: "plan" }], invalidActions: [] };
  ok(!hasCode(validateScene(s, 0, BIBLE, "s"), "STRATEGY_"), "D3: 'repaired' resolution + enum-valid final actions → clean");
}
{
  const s = mk([{ identity: "x", action: "talk" }]);
  s.visualContract.visualEvidence.strategyResolution = { kind: "none", repairs: [], invalidActions: [] };
  eq(validateScene(s, 0, BIBLE, "s").filter((e) => e.reasonCode.startsWith("STRATEGY_")), [], "D3: 'none' resolution → no strategy codes");
}

// ── merge-only discipline still holds with the new keys ──
{
  const before = { subjects: ["x"], relations: ["r"], states: ["s"] };
  const after = copyStrategyRequirement({ _visualStrategy: { requirement: { kind: "fallback", lever: "diorama", confidence: 0.938 }, resolution: { kind: "unresolved_no_proof", note: "n" } } }, before);
  eq({ subjects: after.subjects, relations: after.relations, states: after.states }, before, "merge: base evidence untouched");
  ok(after.representation && after.strategyResolution && after.resolutionProof !== undefined, "merge: representation + strategyResolution + resolutionProof added additively");
  ok(copyStrategyRequirement({ _visualStrategy: { requirement: null } }, before) === before, "merge: no requirement + no resolution → untouched");
}

// ── regression guard: the C-era behaviors still hold ──
{
  const s = mk([]);
  s.visualContract.visualEvidence.representation = { kind: "vibes" };
  ok(hasCode(validateScene(s, 0, BIBLE, "s"), "STRATEGY_EVIDENCE_MALFORMED"), "C: malformed representation still hard");
  eq(ENUM_INVALID_ACTIONS.includes("push") && ENUM_INVALID_ACTIONS.includes("gesture"), true, "D4: production-invalid actions are enumerated");
  eq(ENUM_REPAIRS.push, "point", "D4: push's measured-adjacency repair recorded");
  eq(ENUM_REPAIRS.grab, "reach", "D4: grab's measured-adjacency repair recorded");
}

// ── D2 ORDERING CONTRACT (operator, D review): repairs land BEFORE the staging lock ──
{
  const fs = require("fs");
  const path = require("path");
  // (1) planner-shaped fixture: resolveStrategy applies the repair, THEN the lock
  //     seals the scene — the lock's action is the REPAIRED one, never the
  //     schema-external authored original.
  const scene = { id: "scene-01", shot: "medium", characters: [{ identity: "x", action: "push", expression: "neutral" }], _authorship: { src: "art" } };
  const rec = decideStrategy({ atom: { text: "plain claim" }, scene, narration: "plain claim", capabilityMap: MAP, enumActions: ENUM });
  const res = resolveStrategy(rec, { scene, enumActions: ENUM });
  eq(res.kind, "repaired", "ordering fixture: push repaired (kind 'repaired')");
  eq(scene.characters[0].action, "point", "ordering fixture: scene carries the repaired action");
  const c0 = scene.characters[0] || {};
  scene._authorship.lock = { shot: scene.shot, set: null, cast: scene.characters.map((c) => c.identity), expression: c0.expression || null, action: c0.action || null, holds: c0.holds || null, concept: null, props: [], propTypes: [] };
  eq(scene._authorship.lock.action, "point", "ORDERING: staging lock.action === the REPAIRED action ('point'), never the authored-external 'push'");
  // (2) gate-authorship --restore reads the lock — it can never flip point→push:
  const { stagingDrift, restoreAuthoredStaging } = require("./lib/authorship");
  eq(stagingDrift(scene), [], "ordering: no drift between the sealed lock and the repaired scene");
  scene.characters[0].action = "walk"; // simulate a post-plan engine restage
  ok(stagingDrift(scene).some((d) => d.startsWith("action")), "ordering: a post-plan restage is detected as drift");
  restoreAuthoredStaging({ scenes: [scene] });
  eq(scene.characters[0].action, "point", "ORDERING: --restore puts back the locked REPAIRED action — it can never resurrect 'push'");
  ok(!hasCode((() => { const s = JSON.parse(JSON.stringify(scene)); delete s._visualStrategy; return validateScene(s, 0, BIBLE, "s"); })(), "STRATEGY_ACTION"), "ordering: the restored scene is enum-clean for the firewall (no ACTION_* codes)");
  // (3) source-ordering guard: the ordering cannot silently revert
  const src = fs.readFileSync(path.join(__dirname, "plan-antidote.js"), "utf8");
  const iDecide = src.indexOf("const strategyRecord = decideStrategy(");
  const iResolve = src.indexOf("const resolution = resolveStrategy(");
  const iLock = src.indexOf("out._authorship.lock = {");
  ok(iDecide > 0 && iResolve > iDecide && iLock > iResolve, "SOURCE GUARD: decideStrategy → resolveStrategy → staging lock, in that order in plan-antidote.js");
  ok(src.includes("semanticSignature({ atom: narrativeAtom, scene: out })"), "signature guard: the record's signature is refreshed over the repaired final scene");
}

console.log(`test-action-lifecycle: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
