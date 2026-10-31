#!/usr/bin/env node
/**
 * P1.2d — Cross-Book Firewall Regression Test
 *
 * Proves the narrative visual firewall is GENERIC by running four tests:
 *
 *   1. Sisyphus accepts its own motifs             → PASS
 *   2. Republic accepts its own motifs             → PASS
 *   3. Sisyphus rejects Republic's motifs          → REJECT (FOREIGN_WORLD)
 *   4. Republic rejects Sisyphus's motifs          → REJECT (FOREIGN_WORLD)
 *
 * Additionally validates:
 *   5. Story Bible schema validation on both books → valid
 *   6. Semantic vocabulary extraction on both      → non-null
 *   7. Missing provenance → FAIL CLOSED
 *   8. Generic fallback → FAIL CLOSED
 *   9. P1.1 reason codes preserved
 *
 * Exit 0 = all pass, Exit 1 = any failure.
 */

const path = require("path");
const fs = require("fs");
const { validateStoryBibleSchema, extractSemanticVocabulary } = require("./lib/story-bible-schema.js");
const { validateScene, validateStoryBible, REQUIRED_PROVENANCE } = require("./lib/narrative-visual-firewall.js");

const ROOT = path.resolve(__dirname, "..");
const SLUGS = ["the-myth-of-sisyphus", "the-republic"];

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

function loadBible(slug) {
  const p = path.join(ROOT, "books", slug, "story-bible.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ── Test 1 & 2: Story Bible Schema Validation ──────────────────────────────

console.log("\n═══ P1.2a: Story Bible Schema Validation ═══");

for (const slug of SLUGS) {
  const bible = loadBible(slug);
  const result = validateStoryBibleSchema(bible, slug);
  assert(`${slug} schema valid`, result.valid,
    result.errors.length ? result.errors.map(e => `${e.field}: ${e.message}`).join("; ") : undefined);
}

// ── Test 3 & 4: Semantic Vocabulary Extraction ──────────────────────────────

console.log("\n═══ P1.2a: Semantic Vocabulary Extraction ═══");

const vocabs = {};
for (const slug of SLUGS) {
  const bible = loadBible(slug);
  const vocab = extractSemanticVocabulary(bible);
  vocabs[slug] = vocab;
  assert(`${slug} vocabulary extracted`, vocab !== null && vocab.worldId !== null,
    vocab ? `worldId=${vocab.worldId}` : "null");
  assert(`${slug} has character names`, vocab && Object.keys(vocab.characterNames).length > 0,
    vocab ? `${Object.keys(vocab.characterNames).length} names` : "none");
  assert(`${slug} has allowed motifs`, vocab && vocab.allowedMotifs.size > 0,
    vocab ? `${vocab.allowedMotifs.size} motifs` : "none");
  assert(`${slug} has forbidden motifs`, vocab && vocab.forbiddenMotifs.size > 0,
    vocab ? `${vocab.forbiddenMotifs.size} forbidden` : "none");
}

// ── Test 5: Self-acceptance (own motifs pass own firewall) ───────────────────

console.log("\n═══ P1.2d: Self-Acceptance Tests ═══");

for (const slug of SLUGS) {
  const bible = loadBible(slug);
  const prov = bible.visualProvenance;

  // Build a synthetic scene that uses this book's own motifs
  const ownMotif = prov.allowedMotifs[0];
  const ownLocation = prov.allowedLocations[0];
  const ownCharacter = prov.allowedCharacters[0];

  const syntheticScene = {
    id: `test-self-${slug}`,
    characters: [{ role: ownCharacter, identity: ownCharacter, action: "talk", gaze: "center" }],
    props: [{ type: ownMotif }],
    bg: { set: ownLocation },
    narrativeAtom: {
      bookId: prov.bookId,
      worldId: prov.worldId,
      sourceChapter: "test",
      narrativeSubject: "test subject",
      narrativeRelation: "test relation",
      narrativeState: "test state",
      allowedMotifs: prov.allowedMotifs,
      forbiddenMotifs: prov.forbiddenMotifs,
      allowedCharacters: prov.allowedCharacters,
      allowedLocations: prov.allowedLocations,
      allowedProps: prov.allowedProps,
    },
    visualIntent: {
      bookId: prov.bookId,
      worldId: prov.worldId,
      sourceChapter: "test",
      narrativeSubject: "test subject",
      narrativeRelation: "test relation",
      narrativeState: "test state",
      allowedMotifs: prov.allowedMotifs,
      forbiddenMotifs: prov.forbiddenMotifs,
      allowedCharacters: prov.allowedCharacters,
      allowedLocations: prov.allowedLocations,
      allowedProps: prov.allowedProps,
    },
    visualContract: {
      bookId: prov.bookId,
      worldId: prov.worldId,
      sourceChapter: "test",
      narrativeSubject: "test subject",
      narrativeRelation: "test relation",
      narrativeState: "test state",
      allowedMotifs: prov.allowedMotifs,
      forbiddenMotifs: prov.forbiddenMotifs,
      allowedCharacters: prov.allowedCharacters,
      allowedLocations: prov.allowedLocations,
      allowedProps: prov.allowedProps,
      visualEvidence: {
        subjects: ["test subject"],
        relations: ["test relation"],
        states: ["test state"],
      },
      characterIntent: [{
        identity: ownCharacter,
        role: ownCharacter,
        action: "talk",
        gaze: "center",
        state: "neutral",
      }],
    },
  };

  const errors = validateScene(syntheticScene, 0, bible, slug);
  assert(`${slug} accepts its own motifs (${ownMotif})`, errors.length === 0,
    errors.length ? errors.map(e => e.message).join("; ") : undefined);
}

// ── Test 6: Cross-rejection (foreign motifs rejected) ────────────────────────

console.log("\n═══ P1.2d: Cross-Rejection Tests ═══");

const sisyphusBible = loadBible("the-myth-of-sisyphus");
const republicBible = loadBible("the-republic");

// Sisyphus → inject a Republic-forbidden motif (caveAllegory)
{
  const foreignMotif = sisyphusBible.visualProvenance.forbiddenMotifs[0]; // caveAllegory
  const scene = {
    id: "test-cross-sisyphus-reject-republic",
    characters: [],
    props: [{ type: foreignMotif }],
    bg: { set: "manuscript" },
    narrativeAtom: null,
    visualIntent: null,
    visualContract: null,
  };
  const errors = validateScene(scene, 0, sisyphusBible, "the-myth-of-sisyphus");
  const hasForeignWorld = errors.some(e => e.reasonCode === "FOREIGN_WORLD" || e.reasonCode === "MOTIF_NOT_ALLOWED");
  assert(`Sisyphus rejects Republic motif '${foreignMotif}'`, hasForeignWorld,
    hasForeignWorld ? undefined : "expected FOREIGN_WORLD/MOTIF_NOT_ALLOWED but got: " + errors.map(e => e.reasonCode).join(","));
}

// Republic → inject a Sisyphus-forbidden motif (boulder)
{
  const foreignMotif = republicBible.visualProvenance.forbiddenMotifs[0]; // boulder
  const scene = {
    id: "test-cross-republic-reject-sisyphus",
    characters: [],
    props: [{ type: foreignMotif }],
    bg: { set: "manuscript" },
    narrativeAtom: null,
    visualIntent: null,
    visualContract: null,
  };
  const errors = validateScene(scene, 0, republicBible, "the-republic");
  const hasForeignWorld = errors.some(e => e.reasonCode === "FOREIGN_WORLD" || e.reasonCode === "MOTIF_NOT_ALLOWED");
  assert(`Republic rejects Sisyphus motif '${foreignMotif}'`, hasForeignWorld,
    hasForeignWorld ? undefined : "expected FOREIGN_WORLD/MOTIF_NOT_ALLOWED but got: " + errors.map(e => e.reasonCode).join(","));
}

// Sisyphus → inject Republic worldId → FOREIGN_WORLD
{
  const prov = sisyphusBible.visualProvenance;
  const scene = {
    id: "test-cross-sisyphus-reject-republic-world",
    characters: [],
    props: [],
    bg: { set: "manuscript" },
    narrativeAtom: {
      bookId: prov.bookId,
      worldId: "plato-republic", // WRONG worldId
      sourceChapter: "test", narrativeSubject: "test", narrativeRelation: "test",
      narrativeState: "test", allowedMotifs: prov.allowedMotifs,
      forbiddenMotifs: prov.forbiddenMotifs, allowedCharacters: prov.allowedCharacters,
      allowedLocations: prov.allowedLocations, allowedProps: prov.allowedProps,
    },
    visualIntent: {
      bookId: prov.bookId,
      worldId: "plato-republic",
      sourceChapter: "test", narrativeSubject: "test", narrativeRelation: "test",
      narrativeState: "test", allowedMotifs: prov.allowedMotifs,
      forbiddenMotifs: prov.forbiddenMotifs, allowedCharacters: prov.allowedCharacters,
      allowedLocations: prov.allowedLocations, allowedProps: prov.allowedProps,
    },
    visualContract: {
      bookId: prov.bookId,
      worldId: "plato-republic",
      sourceChapter: "test", narrativeSubject: "test", narrativeRelation: "test",
      narrativeState: "test", allowedMotifs: prov.allowedMotifs,
      forbiddenMotifs: prov.forbiddenMotifs, allowedCharacters: prov.allowedCharacters,
      allowedLocations: prov.allowedLocations, allowedProps: prov.allowedProps,
      visualEvidence: { subjects: ["test"], relations: ["test"], states: ["test"] },
      characterIntent: [],
    },
  };
  const errors = validateScene(scene, 0, sisyphusBible, "the-myth-of-sisyphus");
  const hasForeignWorld = errors.some(e => e.reasonCode === "FOREIGN_WORLD");
  assert(`Sisyphus rejects Republic worldId 'plato-republic'`, hasForeignWorld,
    hasForeignWorld ? undefined : "expected FOREIGN_WORLD but got: " + errors.map(e => e.reasonCode).join(","));
}

// Republic → inject Sisyphus worldId → FOREIGN_WORLD
{
  const prov = republicBible.visualProvenance;
  const scene = {
    id: "test-cross-republic-reject-sisyphus-world",
    characters: [],
    props: [],
    bg: { set: "manuscript" },
    narrativeAtom: {
      bookId: prov.bookId,
      worldId: "camus-absurdism", // WRONG worldId
      sourceChapter: "test", narrativeSubject: "test", narrativeRelation: "test",
      narrativeState: "test", allowedMotifs: prov.allowedMotifs,
      forbiddenMotifs: prov.forbiddenMotifs, allowedCharacters: prov.allowedCharacters,
      allowedLocations: prov.allowedLocations, allowedProps: prov.allowedProps,
    },
    visualIntent: {
      bookId: prov.bookId,
      worldId: "camus-absurdism",
      sourceChapter: "test", narrativeSubject: "test", narrativeRelation: "test",
      narrativeState: "test", allowedMotifs: prov.allowedMotifs,
      forbiddenMotifs: prov.forbiddenMotifs, allowedCharacters: prov.allowedCharacters,
      allowedLocations: prov.allowedLocations, allowedProps: prov.allowedProps,
    },
    visualContract: {
      bookId: prov.bookId,
      worldId: "camus-absurdism",
      sourceChapter: "test", narrativeSubject: "test", narrativeRelation: "test",
      narrativeState: "test", allowedMotifs: prov.allowedMotifs,
      forbiddenMotifs: prov.forbiddenMotifs, allowedCharacters: prov.allowedCharacters,
      allowedLocations: prov.allowedLocations, allowedProps: prov.allowedProps,
      visualEvidence: { subjects: ["test"], relations: ["test"], states: ["test"] },
      characterIntent: [],
    },
  };
  const errors = validateScene(scene, 0, republicBible, "the-republic");
  const hasForeignWorld = errors.some(e => e.reasonCode === "FOREIGN_WORLD");
  assert(`Republic rejects Sisyphus worldId 'camus-absurdism'`, hasForeignWorld,
    hasForeignWorld ? undefined : "expected FOREIGN_WORLD but got: " + errors.map(e => e.reasonCode).join(","));
}

// ── Test 7: Missing provenance → FAIL CLOSED ────────────────────────────────

console.log("\n═══ P1.2d: Fail-Closed Tests ═══");

{
  const scene = {
    id: "test-missing-provenance",
    characters: [{ role: "narrator", identity: "narrator" }],
    props: [{ type: "book" }],
    bg: { set: "manuscript" },
    // No narrativeAtom, visualIntent, visualContract
  };
  const errors = validateScene(scene, 0, sisyphusBible, "the-myth-of-sisyphus");
  const hasProvMissing = errors.some(e => e.reasonCode === "PROVENANCE_MISSING");
  assert("Missing provenance → FAIL (PROVENANCE_MISSING)", hasProvMissing);
}

{
  // Scene with generic fallback (unknown character not in allowedCharacters)
  const prov = sisyphusBible.visualProvenance;
  const scene = {
    id: "test-generic-fallback-reject",
    characters: [{ role: "unknown_default_character", identity: "unknown_default_character" }],
    props: [{ type: "generic_prop_that_does_not_exist" }],
    bg: { set: "manuscript" },
    narrativeAtom: {
      bookId: prov.bookId, worldId: prov.worldId, sourceChapter: "test",
      narrativeSubject: "test", narrativeRelation: "test", narrativeState: "test",
      allowedMotifs: prov.allowedMotifs, forbiddenMotifs: prov.forbiddenMotifs,
      allowedCharacters: prov.allowedCharacters, allowedLocations: prov.allowedLocations,
      allowedProps: prov.allowedProps,
    },
    visualIntent: {
      bookId: prov.bookId, worldId: prov.worldId, sourceChapter: "test",
      narrativeSubject: "test", narrativeRelation: "test", narrativeState: "test",
      allowedMotifs: prov.allowedMotifs, forbiddenMotifs: prov.forbiddenMotifs,
      allowedCharacters: prov.allowedCharacters, allowedLocations: prov.allowedLocations,
      allowedProps: prov.allowedProps,
    },
    visualContract: {
      bookId: prov.bookId, worldId: prov.worldId, sourceChapter: "test",
      narrativeSubject: "test", narrativeRelation: "test", narrativeState: "test",
      allowedMotifs: prov.allowedMotifs, forbiddenMotifs: prov.forbiddenMotifs,
      allowedCharacters: prov.allowedCharacters, allowedLocations: prov.allowedLocations,
      allowedProps: prov.allowedProps,
      visualEvidence: { subjects: ["test"], relations: ["test"], states: ["test"] },
      characterIntent: [{
        identity: "unknown_default_character", role: "unknown_default_character",
        action: "idle", gaze: "center", state: "neutral",
      }],
    },
  };
  const errors = validateScene(scene, 0, sisyphusBible, "the-myth-of-sisyphus");
  const hasMotifReject = errors.some(e => e.reasonCode === "MOTIF_NOT_ALLOWED");
  const hasCharReject = errors.some(e => e.reasonCode === "CHARACTER_MISMATCH");
  assert("Generic fallback character → FAIL (CHARACTER_MISMATCH)", hasCharReject);
  assert("Generic fallback prop → FAIL (MOTIF_NOT_ALLOWED)", hasMotifReject);
}

// ── Test 8: P1.1 Reason Codes Preserved ──────────────────────────────────────

console.log("\n═══ P1.2d: P1.1 Reason Code Regression ═══");

const EXPECTED_CODES = [
  "FOREIGN_WORLD", "MOTIF_NOT_ALLOWED", "SUBJECT_MISMATCH",
  "RELATION_MISMATCH", "CHARACTER_MISMATCH", "STORY_BIBLE_INCOMPLETE",
  "PROVENANCE_MISSING",
];

{
  // Validate that validateStoryBible produces STORY_BIBLE_INCOMPLETE for empty bible
  const emptyBibleErrors = validateStoryBible({}, "test-empty");
  const codes = new Set(emptyBibleErrors.map(e => e.reasonCode));
  assert("Empty bible → STORY_BIBLE_INCOMPLETE", codes.has("STORY_BIBLE_INCOMPLETE"));
  assert("Empty bible → PROVENANCE_MISSING", codes.has("PROVENANCE_MISSING"));
}

// ── Test 9: No book-specific hardcodes in semantic modules ──────────────────

console.log("\n═══ P1.2b: No Book-Specific Hardcodes ═══");

{
  const naPath = path.join(ROOT, "src", "semantic", "narrativeAtom.ts");
  const vcPath = path.join(ROOT, "src", "semantic", "visualContract.ts");
  const naContent = fs.readFileSync(naPath, "utf8");
  const vcContent = fs.readFileSync(vcPath, "utf8");

  const bookSpecificPatterns = [
    /\bsocrates\b/i,
    /\bthrasymachus\b/i,
    /\bkallipolis\b/i,
    /\bgolding\b/i,
    /\bjack\b/i,
    /\bpiggy\b/i,
    /\bralph\b/i,
    /\bstephen king\b/i,
    /\bpolemarchus\b/i,
    /\bpiraeus\b/i,
    /\bsisyphus\b/i,
    /\bcamus\b/i,
  ];

  let naClean = true;
  let vcClean = true;
  for (const pat of bookSpecificPatterns) {
    if (pat.test(naContent)) {
      naClean = false;
      assert(`narrativeAtom.ts has no '${pat.source}' hardcode`, false);
    }
    if (pat.test(vcContent)) {
      vcClean = false;
      assert(`visualContract.ts has no '${pat.source}' hardcode`, false);
    }
  }
  if (naClean) assert("narrativeAtom.ts has no book-specific hardcodes", true);
  if (vcClean) assert("visualContract.ts has no book-specific hardcodes", true);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
if (failed > 0) {
  console.log("\n❌ P1.2 REGRESSION FAILED — do NOT proceed to P2\n");
  process.exit(1);
} else {
  console.log("\n✅ P1.2 ALL PASS — ready for P1.3 blind render audit\n");
  process.exit(0);
}
