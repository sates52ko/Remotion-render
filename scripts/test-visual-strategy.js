#!/usr/bin/env node
/**
 * test-visual-strategy.js — P1.4 PHASE B unit tests (pure functions, no LLM, no I/O).
 *   node scripts/test-visual-strategy.js
 *
 * Covers the operator's conditional-approval fixes:
 *   - levers ≠ measured evidence: UNKNOWN → SAFE requires a fallback lever
 *     MEASURED ≥ 0.85; no measured-safe fallback → UNRESOLVED.
 *   - cast:N excluded from the capability minimum (structural property).
 */
const { STRATEGIES, STRATEGY_LEVERS, decideStrategy, semanticSignature, relationParties, measuredSafeFallback, usedCapabilityKeys } = require("./lib/visual-strategy");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };

const MAP = {
  capabilities: {
    "action:sit": { confidence: 0.688 },   // LOW
    "action:walk": { confidence: 0.9 },    // safe
    "action:hold": { confidence: 0.846 },  // LOW
    "shot:medium": { confidence: 0.845 },
    "shot:twoShot": { confidence: 0.65 },
    "expression:neutral": { confidence: 0.75 },
  },
};
const ENUM = new Set(["idle", "talk", "point", "celebrate", "slump", "think", "walk", "sit", "hold", "reach", "lying", "collapsed", "falling", "fighting", "struggling", "grabbing"]);
const solo = (action, expression = "neutral", shot = "medium") => ({ shot, characters: [{ action, expression }] });

// ── schema sanity ──
ok(STRATEGIES.length === 7, "7 strategies");
for (const [s, levers] of Object.entries(STRATEGY_LEVERS)) ok(Array.isArray(levers), `levers declared for ${s}`);

// ── mapping table ──
ok(decideStrategy({ atom: { text: "Robots cannot knowingly lie." }, scene: solo("talk"), narration: "Robots cannot knowingly lie." }).strategy === "CONTRAST_ABSENCE", "NEGATION → CONTRAST_ABSENCE");
ok(decideStrategy({ atom: { text: "The company became a prison." }, scene: solo("talk"), narration: "The company became a prison." }).strategy === "ABSTRACT_CONCRETE", "METAPHOR → ABSTRACT_CONCRETE");
ok(decideStrategy({ atom: { text: "He was devastated." }, scene: solo("sit"), narration: "He was devastated, but remained composed." }).strategy === "EXPLICIT_STATE", "EMOTION_INVERSION → EXPLICIT_STATE");
ok(decideStrategy({ atom: { text: "plain claim" }, scene: solo("sit"), narration: "plain claim", capabilityMap: MAP }).strategy === "SAFE_REPRESENTATION", "LOW_CAPABILITY (sit 0.688) → SAFE_REPRESENTATION");
ok(decideStrategy({ atom: { text: "plain claim" }, scene: solo("walk"), narration: "plain claim", capabilityMap: MAP }).strategy === "SAFE_REPRESENTATION", "weakest used capability drives (expression:neutral 0.75 < 0.85 → SAFE)");

// precedence: negation beats metaphor beats emotion beats capability
ok(decideStrategy({ atom: { text: "not like a prison" }, scene: solo("sit"), narration: "not like a prison" }).strategy === "CONTRAST_ABSENCE", "precedence: negation first");

// ── RELATION_LOCK requires relation EVIDENCE (operator correction 3) ──
ok(decideStrategy({
  atom: { text: "John talks about his father.", subject: "John", object: null, relationship: "John mentions his father" },
  scene: { shot: "twoShot", characters: [{ action: "talk" }, { action: "idle" }] },
  narration: "John talks about his father.",
}).strategy !== "RELATION_LOCK", "two cast + no second-party object → NOT relation lock");
const rel = decideStrategy({
  atom: { text: "The manager confronts the employee.", subject: "manager", object: "employee", relationship: "manager confronts employee" },
  scene: { shot: "twoShot", characters: [{ action: "talk" }, { action: "idle" }] },
  narration: "The manager confronts the employee.",
});
ok(rel.strategy === "RELATION_LOCK", "relation-bearing subject+object + cast mapping → RELATION_LOCK");
ok(rel.evidence.subject === "manager" && rel.evidence.object === "employee", "RELATION_LOCK evidence carries subject/object binding");

// ── UNKNOWN ≠ SAFE: levers are declarations, the map is the evidence ──
// (1) unproven action safety → UNRESOLVED
const unk = decideStrategy({ atom: { text: "plain claim" }, scene: solo("grabbing"), narration: "plain claim", capabilityMap: { capabilities: {} } });
ok(unk.strategy === "UNRESOLVED", "UNKNOWN capability + unproven action → UNRESOLVED (unknown ≠ safe)");
ok(unk.risks.some((r) => r.startsWith("UNKNOWN_CAPABILITY")), "unknown keys recorded in risks");

// (2) known-safe action + unknown primary + MEASURED-safe fallback → SAFE,
//     and the evidence names the measured fallback lever (levers ≠ evidence)
const mapDiorama = {
  capabilities: {
    "action:walk": { confidence: 0.9 },
    "shot:diorama": { confidence: 0.938 }, // measured-safe fallback
    "expression:neutral": { confidence: 0.9 },
  },
};
const unkSafe = decideStrategy({ atom: { text: "plain claim" }, scene: solo("walk", "neutral", "crowd"), narration: "plain claim", capabilityMap: mapDiorama });
ok(unkSafe.strategy === "SAFE_REPRESENTATION", "known-safe action + unknown primary + measured-safe fallback → SAFE_REPRESENTATION");
ok(unkSafe.evidence.fallback && unkSafe.evidence.fallback.lever === "shot:diorama" && unkSafe.evidence.fallback.confidence === 0.938, "evidence names the MEASURED fallback lever + confidence");

// (3) known-safe action + unknown primary + NO measured-safe fallback → UNRESOLVED
//     (illustration 0.800 / medium 0.845 measured — both below 0.85; diorama/closeUp unmeasured)
const mapWeakFallbacks = {
  capabilities: {
    "action:walk": { confidence: 0.9 },
    "shot:illustration": { confidence: 0.8 },
    "shot:medium": { confidence: 0.845 },
    "expression:neutral": { confidence: 0.9 },
  },
};
const unkNoFallback = decideStrategy({ atom: { text: "plain claim" }, scene: solo("walk", "neutral", "crowd"), narration: "plain claim", capabilityMap: mapWeakFallbacks });
ok(unkNoFallback.strategy === "UNRESOLVED", "known-safe action + unknown primary + NO measured-safe fallback → UNRESOLVED");
ok(/no measured-safe fallback/.test(unkNoFallback.evidence.note), "the reason names the missing measured-safe fallback");
ok(JSON.stringify(unkNoFallback.evidence.fallbackCandidatesChecked) === JSON.stringify(["shot:illustration", "shot:diorama", "shot:medium", "shot:closeUp"]), "checked fallback candidates recorded for audit");

// (4) measuredSafeFallback picks the BEST qualifying lever and rejects sub-threshold ones
ok(measuredSafeFallback({ capabilities: { "shot:illustration": { confidence: 0.8 }, "shot:medium": { confidence: 0.845 } } }) === null, "illustration 0.800 / medium 0.845 are NOT measured-safe");
ok(measuredSafeFallback({ capabilities: { "shot:illustration": { confidence: 0.8 }, "shot:closeUp": { confidence: 0.917 } } }).lever === "shot:closeUp", "best qualifying lever wins");

// (5) MIXED actions (PHASE B review 2): one known-safe action does NOT carry
//     an unproven one — EVERY authored action must be known AND ≥ 0.85, even
//     when a measured-safe fallback lever exists.
const mapMixed = {
  capabilities: {
    "action:walk": { confidence: 0.9 },
    "shot:diorama": { confidence: 0.938 }, // measured-safe fallback exists…
    "expression:neutral": { confidence: 0.9 },
  },
};
const unkMixed = decideStrategy({
  atom: { text: "plain claim" },
  scene: { shot: "crowd", characters: [{ action: "walk", expression: "neutral" }, { action: "grabbing", expression: "neutral" }] },
  narration: "plain claim",
  capabilityMap: mapMixed,
});
ok(unkMixed.strategy === "UNRESOLVED", "mixed actions (walk 0.90 + grabbing UNKNOWN + crowd) → UNRESOLVED despite measured-safe fallback");
ok(/unproven action safety/.test(unkMixed.evidence.note), "mixed-action reason names the unproven authored action safety");

// ── cast:N excluded from the capability minimum (operator review fix 2) ──
// "walk + wide + happy" with NO cast row in the map: previously cast:1 unknown
// → UNRESOLVED; now cast is structural, not a lever → DIRECT_SCENE.
const castFreeMap = { capabilities: { "action:walk": { confidence: 0.9 }, "shot:wide": { confidence: 0.9 }, "expression:happy": { confidence: 0.9 } } };
ok(decideStrategy({ atom: { text: "plain claim" }, scene: solo("walk", "happy", "wide"), narration: "plain claim", capabilityMap: castFreeMap }).strategy === "DIRECT_SCENE", "no cast row in map → not unknown, not SAFE");
// with cast:1 measured LOW (0.838): must STILL be DIRECT — cast cannot drag the scene
const castLowMap = { ...castFreeMap, capabilities: { ...castFreeMap.capabilities, "cast:1": { confidence: 0.838 } } };
ok(decideStrategy({ atom: { text: "plain claim" }, scene: solo("walk", "happy", "wide"), narration: "plain claim", capabilityMap: castLowMap }).strategy === "DIRECT_SCENE", "cast:1 at 0.838 cannot drag the scene into SAFE");
ok(!usedCapabilityKeys(solo("walk", "happy", "wide")).some((k) => k.startsWith("cast:")), "usedCapabilityKeys never emits cast:*");

// ── enum fail-closed ──
const bad = decideStrategy({ atom: { text: "x" }, scene: solo("push"), narration: "x", enumActions: ENUM });
ok(bad.strategy === "UNRESOLVED", "enum-invalid action (push) → UNRESOLVED");
ok(bad.evidence.invalidActions.includes("push"), "invalid action named in evidence");

// ── zero-mutation invariant: decide never touches the scene ──
{
  const scene = solo("sit");
  const atom = { text: "He was devastated.", subject: "he", relationship: "he laments" };
  const before = JSON.stringify({ scene, atom });
  decideStrategy({ atom, scene, narration: atom.text, capabilityMap: MAP });
  const after = JSON.stringify({ scene, atom });
  ok(before === after, "decideStrategy mutates nothing");
  ok(JSON.stringify(semanticSignature({ atom, scene })) === JSON.stringify(semanticSignature({ atom, scene })), "semanticSignature deterministic");
}

// ── declarative metadata discipline (operator correction 4) ──
{
  const r = decideStrategy({ atom: { text: "plain" }, scene: solo("sit"), narration: "plain", capabilityMap: MAP });
  ok(/never a trusted flag/.test(r.note), "record states it is not a trusted flag");
  ok(!("verdict" in r) && !("pass" in r), "strategy record carries no verdict/pass field — judging is the firewall's job");
}

// ── relationParties helper ──
ok(relationParties({ subject: "John", object: "father" }).count === 2, "distinct parties count 2");
ok(relationParties({ subject: "John", object: "John" }) === null, "same-party is not a relation");
ok(relationParties({ subject: "John", object: null }) === null, "missing object is not a relation");

console.log(`test-visual-strategy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
