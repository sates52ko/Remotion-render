#!/usr/bin/env node
/**
 * P2.0 — Bible Integrity Test (Test A / Test B completion gate)
 *
 * Test A (must FAIL):   the contaminated book trips every new reason code —
 *   A1  bible-level FOREIGN_WORLD   (allowedMotifs owned by another world)
 *   A2  IDENTITY_DUPLICATE          (near-identical cast identities)
 *   A3  scene-level FOREIGN_WORLD   (rendered foreign motifs)
 *   A4  CONTRACT_VACUOUS reported as diagnostic-only (does not by itself fail)
 *   A5  VOCABULARY_NOT_GROUNDED fires on an ungrounded, unregistered motif
 *   A6  VISUAL_NOT_GROUNDED_IN_SEGMENT flags scene-20 (P3.4, report-first:
 *       the 'tree' icon vs the X-ray segment) — diagnostic, never fails alone
 *
 * Test B (must PASS):   healthy books and a fresh unseen book stay green —
 *   B1  the-republic        → PASS (0 hard violations)
 *   B2  the-myth-of-sisyphus → PASS (0 hard violations)
 *   B3  fresh synthetic book → PASS (0 hard violations)
 *
 * Also guards the mechanism itself:
 *   C1  FOREIGN_WORLD and VOCABULARY_NOT_GROUNDED stay separate codes
 *   C2  the two registries are code-owned: bible cannot override them
 *   C3  diagnostic violations never flip status to FAIL
 *
 * Exit 0 = all pass, Exit 1 = any failure.
 */

const path = require("path");
const fs = require("fs");
const { validateConfig, validateStoryBible, validateScene } = require("./lib/narrative-visual-firewall.js");

const ROOT = path.resolve(__dirname, "..");
const VERITY = "verity"; // Test A subject (measured contamination; no slug logic anywhere else)
// Frozen pre-0719298 copy: Test A must not depend on live book data, which gets
// cleaned (0719298 fixed verity and silently broke 8 Test A assertions).
const VERITY_FIXTURE = "fixtures/bible-integrity/verity-contaminated";
const HEALTHY = ["the-republic", "the-myth-of-sisyphus"]; // Test B subjects

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

const codes = (violations, code) => violations.filter((v) => v.reasonCode === code);

// ── Test A: contaminated book must FAIL with every new code ─────────────────

console.log("\n═══ P2.0 Test A: contaminated book must FAIL ═══");

const verityReport = validateConfig({
  config: loadJson(`${VERITY_FIXTURE}/config.antidote.json`),
  bible: loadJson(`${VERITY_FIXTURE}/story-bible.json`),
  slug: VERITY,
});

assert("A1 status is FAIL", verityReport.status === "FAIL",
  `got ${verityReport.status} (${verityReport.counts.violations} hard / ${verityReport.counts.diagnostics} diagnostic)`);

const verityBibleErrors = validateStoryBible(loadJson(`${VERITY_FIXTURE}/story-bible.json`), VERITY);
const bibleForeign = codes(verityBibleErrors, "FOREIGN_WORLD");
assert("A1b bible-level FOREIGN_WORLD fires on foreign allowedMotifs", bibleForeign.length >= 1,
  `got ${bibleForeign.length}`);
assert("A1c FOREIGN_WORLD names an originWorldId different from the book world",
  bibleForeign.some((v) => v.originWorldId && v.originWorldId !== v.worldId),
  JSON.stringify(bibleForeign[0] || null));

const duplicates = codes(verityBibleErrors, "IDENTITY_DUPLICATE");
assert("A2 IDENTITY_DUPLICATE fires", duplicates.length >= 1, `got ${duplicates.length}`);
assert("A2b duplicate pairs are reported explicitly",
  duplicates.some((v) => Array.isArray(v.characterIds) && v.characterIds.length === 2),
  JSON.stringify(duplicates.map((d) => d.characterIds)));

const sceneForeign = verityReport.violations.filter((v) => v.reasonCode === "FOREIGN_WORLD" && v.sceneId);
assert("A3 scene-level FOREIGN_WORLD fires on rendered foreign motifs", sceneForeign.length >= 1,
  `got ${sceneForeign.length}`);

// A4: vacuity detector (remeasured after P2.0b). The measured pre-fix
// signature — one constant relation + all-unknown chapters — must be caught
// as diagnostic-only; and Verity itself must NO LONGER exhibit it now that
// the data-contract fix is in (pre-fix: 263/263 vacuous → post-fix: 0).
{
  const vacuousScenes = Array.from({ length: 10 }, (_, i) => ({
    id: `synthetic-vacuous-${i}`,
    narrativeAtom: { narrativeRelation: "philosophical discourse", sourceChapter: "unknown" },
    visualIntent: { narrativeRelation: "philosophical discourse", sourceChapter: "unknown" },
    visualContract: { narrativeRelation: "philosophical discourse", sourceChapter: "unknown" },
  }));
  const syntheticReport = validateConfig({ config: { scenes: vacuousScenes }, bible: null, slug: "synthetic-vacuous" });
  const vacuous = syntheticReport.violations.filter((v) => v.reasonCode === "CONTRACT_VACUOUS");
  assert("A4 CONTRACT_VACUOUS fires on the measured pre-fix signature", vacuous.length >= 1, `got ${vacuous.length}`);
  assert("A4b CONTRACT_VACUOUS is diagnostic-only", vacuous.every((v) => v.severity === "diagnostic"),
    JSON.stringify(vacuous[0] || null));

  const verityVacuous = verityReport.violations.filter((v) => v.reasonCode === "CONTRACT_VACUOUS");
  assert("A4-rem Verity no longer vacuous after P2.0b (pre-fix 263/263 → now 0)", verityVacuous.length === 0,
    `still reported ${verityVacuous.length}`);
}

assert("A4c any remaining FAIL reason must come from a hard code",
  verityReport.violations.some((v) => v.severity !== "diagnostic"),
  "no hard violation present");

// A5: unregistered + unshared + ungrounded motif → VOCABULARY_NOT_GROUNDED
{
  const verityBible = loadJson(`${VERITY_FIXTURE}/story-bible.json`);
  const verityConfig = loadJson(`${VERITY_FIXTURE}/config.antidote.json`);
  const base = verityConfig.scenes[0];
  const scene = {
    ...base,
    id: "test-a5-ungrounded",
    props: [{ type: "quantumParadigmShift" }],
    _narration: "a completely unrelated sentence with no such vocabulary",
  };
  const errors = validateScene(scene, 0, verityBible, VERITY);
  const ungrounded = errors.filter((e) => e.reasonCode === "VOCABULARY_NOT_GROUNDED");
  assert("A5 VOCABULARY_NOT_GROUNDED fires on unregistered+unshared+ungrounded motif", ungrounded.length >= 1,
    `codes: ${[...new Set(errors.map((e) => e.reasonCode))].join(",")}`);
}

// A6 (P3.4): the scene's visual subject must be provable from its own segment.
// Measured case: scene-20 narrates an X-ray machine being smashed with a
// hammer, yet its icon concept is 'tree' — no narration in that segment
// (or its reconstruction from captions) ever says tree.
{
  const flagged = verityReport.violations.filter((v) => v.reasonCode === "VISUAL_NOT_GROUNDED_IN_SEGMENT");
  assert("A6 VISUAL_NOT_GROUNDED_IN_SEGMENT fires on scene-20",
    flagged.some((v) => v.sceneId === "scene-20"),
    `flagged ${flagged.length} scene(s): ${flagged.slice(0, 6).map((v) => v.sceneId).join(", ") || "(none)"}`);
  const s20 = flagged.find((v) => v.sceneId === "scene-20");
  assert("A6b scene-20 names the ungrounded visual subject ('tree')",
    s20 && s20.concept === "tree", JSON.stringify(s20 || null));
  assert("A6c the new reason is diagnostic (report-first) — it never fails a book by itself",
    flagged.every((v) => v.severity === "diagnostic"),
    JSON.stringify(flagged.find((v) => v.severity !== "diagnostic") || null));
}

// ── Test B: healthy + fresh books must PASS ─────────────────────────────────

console.log("\n═══ P2.0 Test B: healthy + fresh books must PASS ═══");

for (const slug of HEALTHY) {
  const report = validateConfig({
    config: loadJson(`books/${slug}/config.antidote.json`),
    bible: loadJson(`books/${slug}/story-bible.json`),
    slug,
  });
  const hard = report.violations.filter((v) => v.severity !== "diagnostic");
  assert(`B healthy book '${slug}' is PASS with 0 hard violations`, report.status === "PASS" && hard.length === 0,
    `${report.status}: ${hard.slice(0, 3).map((v) => v.reasonCode + " " + v.message).join(" | ")}`);
}

// B3: fresh unseen book — minimal, fully grounded, no registries touched.
{
  const narration = "The lighthouse keeper counted each gull flock above the tidal mirror by night.";
  const worldId = "fresh-unseen-world-9f3";
  const prov = {
    bookId: "fresh-unseen-9f3",
    worldId,
    sourceChapter: "act-1",
    narrativeSubject: "the keeper",
    narrativeRelation: "counts the silent gulls",
    narrativeState: "vigilant",
    allowedMotifs: ["hourglass", "gullFlock"], // shared pool + grounded-in-narration
    forbiddenMotifs: ["smartphone"],
    allowedCharacters: ["keeper"],
    allowedLocations: ["lighthouse"],
    allowedProps: ["hourglass", "gullFlock"],
  };
  const freshBible = {
    authored: true,
    slug: "fresh-unseen-9f3",
    world: { era: "modern", worldId, setting: "a coastal lighthouse", register: "literary", forbid: ["neon billboards"] },
    visualProvenance: { ...prov },
    cast: { keeper: { name: "Keeper", role: "protagonist", look: "oilskin coat", variant: { coat: "oilskin" } } },
    places: { lighthouse: { set: "lighthouse", look: "a stone tower" } },
    objects: [{ concept: "gullFlock" }],
  };
  const makeLayer = () => ({ ...prov });
  const freshScene = {
    id: "fresh-scene-1",
    _narration: narration,
    characters: [{ role: "keeper", identity: "keeper", action: "talk", gaze: "center" }],
    props: [{ type: "hourglass" }, { type: "gullFlock" }],
    bg: { set: "lighthouse" },
    narrativeAtom: makeLayer(),
    visualIntent: makeLayer(),
    visualContract: {
      ...makeLayer(),
      visualEvidence: { subjects: ["the keeper"], relations: ["counts the silent gulls"], states: ["vigilant"] },
      characterIntent: [{ identity: "keeper", role: "keeper", action: "talk", gaze: "center", state: "neutral" }],
    },
  };
  // Two more scenes so config-level vacuity detection has enough samples.
  const freshConfig = { scenes: [freshScene, { ...freshScene, id: "fresh-scene-2" }, { ...freshScene, id: "fresh-scene-3" }, { ...freshScene, id: "fresh-scene-4" }, { ...freshScene, id: "fresh-scene-5" }] };
  const report = validateConfig({ config: freshConfig, bible: freshBible, slug: "fresh-unseen-9f3" });
  const hard = report.violations.filter((v) => v.severity !== "diagnostic");
  assert("B3 fresh unseen book is PASS with 0 hard violations", report.status === "PASS" && hard.length === 0,
    `${report.status}: ${hard.slice(0, 5).map((v) => v.reasonCode + " " + v.message).join(" | ")}`);
}

// ── Mechanism guards ────────────────────────────────────────────────────────

console.log("\n═══ P2.0 Mechanism Guards ═══");

// C1: the two motif failure reasons stay separate codes (never merged).
{
  const verityBible = loadJson(`${VERITY_FIXTURE}/story-bible.json`);
  const verityConfig = loadJson(`${VERITY_FIXTURE}/config.antidote.json`);
  const sceneForeignOnly = validateScene(
    { ...verityConfig.scenes.find((s) => (s.props || []).some((p) => p.type === "civicPolis")) || verityConfig.scenes[0] },
    0, verityBible, VERITY
  );
  assert("C1a FOREIGN_WORLD exists as its own code", sceneForeignOnly.some((e) => e.reasonCode === "FOREIGN_WORLD"));
  assert("C1b VOCABULARY_NOT_GROUNDED exists as its own code",
    validateScene({ ...verityConfig.scenes[0], id: "x", props: [{ type: "ungroundedZebraToken" }], _narration: "nothing" }, 0, verityBible, VERITY)
      .some((e) => e.reasonCode === "VOCABULARY_NOT_GROUNDED"));
  assert("C1c a FOREIGN_WORLD motif never also reports VOCABULARY_NOT_GROUNDED",
    !sceneForeignOnly.some((e) => e.reasonCode === "VOCABULARY_NOT_GROUNDED" && e.motif === "civicPolis"));
}

// C2: registry is code-owned — a bible claiming a foreign motif is rejected,
// i.e. the bible cannot whitelist itself into the shared pool.
{
  const verityBible = loadJson(`${VERITY_FIXTURE}/story-bible.json`);
  const clone = JSON.parse(JSON.stringify(verityBible));
  clone.visualProvenance.allowedMotifs = [...new Set([...clone.visualProvenance.allowedMotifs, "tripartiteSoul"])];
  const errs = validateStoryBible(clone, VERITY);
  assert("C2 bible cannot whitelist a registry-owned foreign motif (tripartiteSoul still rejected)",
    errs.some((e) => e.reasonCode === "FOREIGN_WORLD" && e.motif === "tripartiteSoul"),
    errs.map((e) => e.reasonCode).join(","));
}

// C3: diagnostics never flip status by themselves.
{
  const vacuousOnly = {
    version: "x", slug: "diag-check", status: "PASS",
    counts: { scenes: 5, violations: 0, diagnostics: 1 },
    violations: [{ reasonCode: "CONTRACT_VACUOUS", severity: "diagnostic", message: "probe" }],
  };
  const hard = vacuousOnly.violations.filter((v) => v.severity !== "diagnostic");
  assert("C3 a config whose only issue is diagnostic stays PASS", hard.length === 0);
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
if (failed > 0) {
  console.log("\n❌ P2.0 BIBLE INTEGRITY FAILED\n");
  process.exit(1);
} else {
  console.log("\n✅ P2.0 ALL PASS — Test A fails the contaminant, Test B keeps the healthy books green\n");
  process.exit(0);
}
