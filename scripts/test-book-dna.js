#!/usr/bin/env node
/**
 * test-book-dna.js — P0.3 fail-closed tests for Book DNA.
 *
 * The loader used to catch everything and hand back DNA_DEFAULTS, so a book whose
 * `dna` block was present but WRONG planned with the defaults in silence: the
 * book's visual identity was simply not applied and nothing said so.
 *
 *   node scripts/test-book-dna.js
 *
 * Fixtures are FROZEN copies under fixtures/book-dna/ (nothing here touches books/).
 */
const fs = require("fs");
const path = require("path");
const { loadDNA, validateDNA, mergeDNA, DNA_DEFAULTS, VALID_SHOTS } = require("./lib/book-dna-schema");

const ROOT = path.join(__dirname, "..");
const FIX = (f) => path.join(ROOT, "fixtures", "book-dna", f);
let passed = 0, failed = 0;
function assert(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`); }
}
const throws = (fn) => { try { fn(); return null; } catch (e) { return e; } };

console.log("═══ Book DNA: a PRESENT but broken DNA stops the plan ═══");
{
  const err = throws(() => loadDNA("__fixture-dna__", { bookJsonPath: FIX("invalid-dna.json") }));
  assert("invalid dna (unknown shot) -> throws", !!err, "it returned defaults");
  assert("...and the message names the file and the reason",
    !!err && /invalid-dna\.json/.test(err.message) && /extremeCloseUp/.test(err.message), err && err.message);
  assert("...and it never returns a value", !(err === null));
}
{
  const err = throws(() => loadDNA("__fixture-dna__", { bookJsonPath: FIX("broken.json") }));
  assert("unparseable book.json -> throws", !!err && /broken\.json/.test(err.message), err && err.message);
}

console.log("\n═══ Book DNA: absent DNA stays allowed (opt-in, not fail-open) ═══");
{
  const noDna = loadDNA("__fixture-dna__", { bookJsonPath: FIX("no-dna.json") });
  assert("no `dna` key -> defaults", JSON.stringify(noDna) === JSON.stringify(DNA_DEFAULTS));
  const missing = loadDNA("__no-such-book__", { bookJsonPath: FIX("__does-not-exist__.json") });
  assert("missing book.json -> defaults", JSON.stringify(missing) === JSON.stringify(DNA_DEFAULTS));
  assert("...and both are deep copies, never the defaults object itself",
    noDna !== DNA_DEFAULTS && noDna.visual !== DNA_DEFAULTS.visual && missing !== DNA_DEFAULTS);
}

console.log("\n═══ Book DNA: a valid DNA still merges over the defaults ═══");
{
  const dna = loadDNA("__fixture-dna__", { bookJsonPath: FIX("valid-dna.json") });
  assert("authored values win", dna.visual.preferredShots.join(",") === "medium,closeUp" && dna.pacing.setRunBase === 4);
  assert("unspecified dimensions keep their defaults", dna.pacing.interruptEvery === DNA_DEFAULTS.pacing.interruptEvery && dna.character.voiceCount === DNA_DEFAULTS.character.voiceCount);
  assert("paletteOverride survives the merge", dna.color.paletteOverride.red === "#B91C1C");
  // the module's standing rule: callers get clones, the defaults object is never handed out
  dna.visual.preferredShots.push("wide");
  assert("a returned DNA is not a reference into DNA_DEFAULTS", DNA_DEFAULTS.visual.preferredShots.length === 0);
}

console.log("\n═══ Book DNA: validateDNA still rejects what the schema allows ═══");
{
  assert("unknown shot -> RangeError", !!throws(() => validateDNA(mergeDNA(DNA_DEFAULTS, { visual: { preferredShots: ["nosuch"] } }))));
  assert("driftRange[0] >= [1] -> RangeError", !!throws(() => validateDNA(mergeDNA(DNA_DEFAULTS, { camera: { driftRange: [1.08, 1.0] } }))));
  assert("every valid shot name is accepted", [...VALID_SHOTS].every((s) => validateDNA(mergeDNA(DNA_DEFAULTS, { visual: { preferredShots: [s] } }))));
  assert("no dna at all is valid (defaults)", validateDNA(mergeDNA(DNA_DEFAULTS, {})) === true);
}

console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
if (failed) process.exit(1);
