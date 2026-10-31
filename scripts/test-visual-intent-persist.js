#!/usr/bin/env node
/**
 * test-visual-intent-persist.js — Vision-free 10x P7 commit-2 tests (pure).
 *   node scripts/test-visual-intent-persist.js
 *
 * Proves:
 *   1. buildPersistedVisualIntent keeps the firewall shell verbatim and merges
 *      derived content additively (archetype/requiredActions/semanticGrammar/
 *      provenance) — authored fields always win.
 *   2. The persisted intent satisfies meaningfulVisualIntent; the shell and {}
 *      do NOT.
 *   3. inject-provenance's copyStrategyRequirement is untouched (merge-only
 *      representation transport still byte-identical).
 *   4. Grammar kinds mirror the adapter's grammar kinds per archetype.
 */
const { buildPersistedVisualIntent, meaningfulVisualIntent, intentTelemetry, GRAMMAR_KINDS } = require("./lib/visual-intent-persist");
const { deriveVisualIntent } = require("../src/semantic/visualIntent.ts");
const { copyStrategyRequirement } = require("./inject-provenance");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (got ${JSON.stringify(a).slice(0, 140)})`);

const atomOf = (text) => ({ text, subject: null, action: null, object: null, relationship: null, concepts: [], abstraction: "conceptual", visualNeed: text });

// ── 1. shell preserved + additive merge ─────────────────────────────────────
{
  const shell = {
    bookId: "ready-player-one", worldId: "speculative-2045", sourceChapter: "setup",
    narrativeSubject: "narrator", narrativeRelation: "escape vs reality",
    narrativeState: "reflective",
    allowedMotifs: ["oasis"], forbiddenMotifs: ["sword"], allowedCharacters: ["wade"],
    allowedLocations: ["stacks"], allowedProps: ["visor"],
  };
  const narration = "The oasis promises escape, but the stacks remind him of the dying world.";
  const derived = deriveVisualIntent(atomOf(narration));
  const { intent, changed } = buildPersistedVisualIntent({ shell, derived, narration, source: "inject-provenance" });

  eq(intent.bookId, shell.bookId, "shell.bookId preserved");
  eq(intent.narrativeRelation, shell.narrativeRelation, "shell.narrativeRelation preserved");
  eq(intent.allowedMotifs, shell.allowedMotifs, "shell.allowedMotifs preserved");
  ok(intent.archetype === derived.archetype, `archetype merged (${intent.archetype})`);
  eq(intent.requiredActions, derived.requiredActions, "requiredActions merged verbatim");
  ok(intent.semanticGrammar && typeof intent.semanticGrammar.kind === "string", "semanticGrammar present");
  eq(intent.semanticGrammar.subject, "narrator", "grammar.subject from shell narrativeSubject");
  ok(intent.provenance && intent.provenance.source === "inject-provenance" && intent.provenance.atomText.length > 0, "provenance audit trail present");
  ok(changed.includes("archetype") && changed.includes("semanticGrammar"), "change report names the added keys");

  // authored fields always win: a stored archetype is never overwritten
  const authored = { ...shell, archetype: "literary_critique", requiredActions: ["frame_story_through_editorial_or_literary_lens"] };
  const r2 = buildPersistedVisualIntent({ shell: authored, derived, narration });
  eq(r2.intent.archetype, "literary_critique", "authored archetype never overwritten");
  eq(r2.intent.requiredActions, authored.requiredActions, "authored requiredActions never overwritten");
}

// ── 2. meaningful vs shell ──────────────────────────────────────────────────
{
  ok(!meaningfulVisualIntent({}), "{} is not meaningful");
  ok(!meaningfulVisualIntent({ bookId: "x", narrativeSubject: "y" }), "provenance shell is not meaningful");
  ok(!meaningfulVisualIntent(undefined) && !meaningfulVisualIntent(null), "missing is not meaningful");
  const derived = deriveVisualIntent(atomOf("A is not B; it is C."));
  const { intent } = buildPersistedVisualIntent({ shell: { bookId: "x" }, derived, narration: "A is not B; it is C." });
  ok(meaningfulVisualIntent(intent), "persisted intent IS meaningful");
  ok(meaningfulVisualIntent({ archetype: "static_reflection", requiredActions: [] }), "static_reflection with no actions is still meaningful (archetype named)");
  const t = intentTelemetry([intent, {}, { bookId: "y" }, { archetype: "contrast" }]);
  ok(t.total === 4 && t.meaningful === 2 && t.shellOnly === 2, `telemetry counts (got ${JSON.stringify(t)})`);
}

// ── 3. copyStrategyRequirement untouched ────────────────────────────────────
{
  const scene = { _visualStrategy: { requirement: { kind: "fallback", lever: "diorama" }, resolution: { kind: "repaired", repairs: [{ from: "push", to: "point" }], invalidActions: ["push"] } }, _authorship: { src: "none" } };
  const evidence = { subjects: ["s"], relations: ["r"], states: ["st"] };
  const out = copyStrategyRequirement(scene, evidence);
  eq(out.subjects, evidence.subjects, "subjects untouched");
  eq(out.representation, scene._visualStrategy.requirement, "representation transport unchanged");
}

// ── 4. grammar kinds mirror the adapter ─────────────────────────────────────
{
  eq(GRAMMAR_KINDS.contrast, "comparison", "contrast grammar");
  eq(GRAMMAR_KINDS.allegory_equivalence, "two_domain_comparison", "allegory grammar");
  eq(GRAMMAR_KINDS.cause_effect, "cause_effect_flow", "cause_effect grammar");
  eq(GRAMMAR_KINDS.transformation, "cause_effect_flow", "transformation grammar");
  eq(GRAMMAR_KINDS.character_psychology, "internal_tension", "psychology grammar");
}

console.log(`test-visual-intent-persist: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
