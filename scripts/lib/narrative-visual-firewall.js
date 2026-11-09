const { resolveSvgMotif } = require('./svg-motif-identity');
/**
 * Narrative Visual Firewall (P1.1)
 *
 * A production gate, not a heuristic repairer.  It rejects a scene when the
 * book provenance, the narrated claim and the planned visual evidence cannot
 * be proven from data.  Missing data is therefore a failure, never a pass.
 */
const fs = require("fs");
const path = require("path");
const {
  validateBibleIntegrity,
  validateSceneIntegrity,
  detectContractVacuity,
  isGrounded,
  loadRegistries,
} = require("./bible-integrity");
// P7 (Vision-free 10x): the ONE semantic staging judge. The firewall and the
// audit gate (p3-visionless-gate.mjs) must reach byte-identical hard decisions,
// so the predicates live here and nowhere else.
const { evaluateSemanticStaging, effectiveStagingIntent } = require("../../src/semantic/stagingEvidence.ts");
const { deriveVisualIntent } = require("../../src/semantic/visualIntent.ts");

// "socratic_inquiry" -> "socraticInquiry" (visualProposition uses snake keys).
const camel = (s) => String(s || "").replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/**
 * 2026-09-23: fields the firewall never read. visualProposition.subject kept
 * ringOfGyges ×98 / civicPolis ×125 in show-your-work after its props were
 * "cleaned" — the scene still CLAIMED another book's world. A registry-owned
 * subject must belong to this book's world.
 * Diagnostic (report-first): these fields are metadata, not pixels, and the
 * writer (visual-intent enforceSemanticRelevance) is now world-gated, so new
 * plans cannot produce them; existing configs surface the leak in the report.
 */
function foreignSubjectErrors(scene, index, worldId) {
  const { origins } = loadRegistries();
  const out = [];
  const subjects = [scene.visualProposition?.subject, scene.director?.visualSubject].filter(Boolean);
  for (const subject of subjects) {
    const owner = origins[camel(subject)] || origins[subject];
    if (owner && owner !== worldId) {
      out.push(code("FOREIGN_WORLD", `scene claims subject '${subject}' owned by world '${owner}', not '${worldId}'`, { sceneId: scene.id, index, motif: subject, severity: "diagnostic" }));
    }
  }
  return out;
}

const REQUIRED_PROVENANCE = [
  "bookId", "sourceChapter", "narrativeSubject", "narrativeRelation",
  "narrativeState", "worldId", "allowedMotifs", "forbiddenMotifs",
  "allowedCharacters", "allowedLocations", "allowedProps",
];

const code = (reasonCode, message, extra = {}) => ({ reasonCode, message, ...extra });
const hasText = (v) => typeof v === "string" && v.trim().length > 0;
const asSet = (v) => new Set(Array.isArray(v) ? v : []);

// P1.4 PHASE C — representation-requirement kinds the firewall can enforce.
const STRATEGY_REQUIREMENT_KINDS = new Set(["absence", "concrete", "state", "relation", "fallback"]);

// P1.4 PHASE D (D2/D4) — the renderer's own charAction enum, read from the
// schema source of truth. A final-scene action outside this set is one the
// renderer would silently drop, so the firewall fails it explicitly — the
// schema-external gap ("the firewall cannot evaluate what the renderer cannot
// parse") is closed here, not papered over.
const { charAction } = require("../../src/engines/antidote/schema.ts");
const RENDERER_ACTION_ENUM = new Set(charAction.options);

/**
 * P1.4 PHASE C — returns a reason string when the scene does NOT satisfy the
 * representation requirement carried in visualEvidence.representation, or null
 * when it does. Binds to renderer-verified fields only (schema.ts:386 prop arc,
 * :422 text style, shot/character enums).
 *
 * RELATION_LOCK is PARTY-SCOPED (operator, PHASE C review): only an on-screen
 * RELATION PARTY carrying the required lookAt satisfies the binding — a third
 * character's `lookAt:"partner"` never does. What C proves: relation parties on
 * screen + relation-capable composition + a participant with partner gaze.
 * Stronger gaze-direction proof is deliberately out of C's scope (the renderer
 * lever names a stage point, not a target identity).
 */
function strategyRequirementUnmet(req, scene) {
  const chars = Array.isArray(scene.characters) ? scene.characters : [];
  switch (req.kind) {
    case "absence": {
      const styles = Array.isArray(req.textStyles) ? req.textStyles : [];
      const arcs = Array.isArray(req.propArcs) ? req.propArcs : [];
      const styleHit = styles.length && (Array.isArray(scene.texts) ? scene.texts : []).some((t) => t && styles.includes(String(t.style || "")));
      const arcHit = arcs.length && (Array.isArray(scene.props) ? scene.props : []).some((p) => p && arcs.includes(String(p.arc || "none")));
      return styleHit || arcHit ? null : `none of the required levers present (textStyles:[${styles.join(",")}] propArcs:[${arcs.join(",")}])`;
    }
    case "concrete": {
      const shots = Array.isArray(req.shots) ? req.shots : [];
      const diagramOk = !!scene.diagram;
      const shotOk = shots.includes(String(scene.shot || ""));
      return shotOk || diagramOk ? null : `shot '${scene.shot || ""}' not in [${shots.join(",")}] and no diagram`;
    }
    case "state": {
      const exprs = Array.isArray(req.expressions) ? req.expressions : [];
      const emotions = Array.isArray(req.emotions) ? req.emotions : [];
      const hit = chars.some((c) => exprs.includes(String(c.expression || "")) || (c.emotion && emotions.includes(String(c.emotion))));
      return hit ? null : "no character carries one of the required expressions/emotions";
    }
    case "relation": {
      const parties = (Array.isArray(req.parties) ? req.parties : []).map((p) => String(p).toLowerCase());
      const shots = Array.isArray(req.shots) ? req.shots : [];
      const identities = chars.map((c) => String(c.identity || c.role || "").toLowerCase());
      const missing = parties.filter((p) => !identities.includes(p));
      if (missing.length) return `relation party '${missing.join("','")}' not on screen`;
      if (!shots.includes(String(scene.shot || ""))) return `shot '${scene.shot || ""}' is not relation-capable [${shots.join(",")}]`;
      const partyGaze = chars.some((c) => parties.includes(String(c.identity || c.role || "").toLowerCase()) && c.lookAt === req.lookAt);
      if (!partyGaze) return `no relation party carries lookAt:'${req.lookAt}' (a non-party gaze never satisfies the binding)`;
      return null;
    }
    case "fallback": {
      const lever = String(req.lever || "");
      return String(scene.shot || "") === lever ? null : `shot '${scene.shot || ""}' is not the measured-safe fallback lever '${lever}'`;
    }
    default:
      return `unknown requirement kind '${req.kind}'`;
  }
}

function validateStoryBible(bible, slug) {
  const errors = [];
  if (!bible || typeof bible !== "object") {
    return [code("STORY_BIBLE_INCOMPLETE", "story-bible.json is missing or invalid")];
  }
  const world = bible.world;
  if (!world || !hasText(world.era) || !hasText(world.worldId || bible.visualProvenance?.worldId)) {
    errors.push(code("STORY_BIBLE_INCOMPLETE", "world.era and worldId are required"));
  }
  const provenance = bible.visualProvenance;
  if (!provenance || typeof provenance !== "object") {
    errors.push(code("PROVENANCE_MISSING", "story bible requires visualProvenance"));
  } else {
    if (provenance.bookId !== slug) errors.push(code("PROVENANCE_MISSING", `visualProvenance.bookId must equal '${slug}'`));
    for (const key of ["worldId", "allowedMotifs", "forbiddenMotifs", "allowedCharacters", "allowedLocations", "allowedProps"]) {
      if ((key.endsWith("Id") && !hasText(provenance[key])) || (!key.endsWith("Id") && !Array.isArray(provenance[key]))) {
        errors.push(code("PROVENANCE_MISSING", `visualProvenance.${key} is required`));
      }
    }
    // An empty vocabulary makes every motif check pass vacuously once the
    // scenes are stripped — the book must name what it may show.
    if (Array.isArray(provenance.allowedMotifs) && !provenance.allowedMotifs.length) {
      errors.push(code("PROVENANCE_MISSING", "visualProvenance.allowedMotifs must not be empty"));
    }
  }
  const cast = bible.cast || {};
  if (!Object.keys(cast).length) errors.push(code("STORY_BIBLE_INCOMPLETE", "story bible has no cast"));
  for (const [id, member] of Object.entries(cast)) {
    if (!hasText(member?.name) || !hasText(member?.look) || !member?.variant || !Object.keys(member.variant).length) {
      errors.push(code("STORY_BIBLE_INCOMPLETE", `cast.${id} needs name, look, and a non-empty variant`, { characterId: id }));
    }
  }
  const places = bible.places || {};
  if (!Object.keys(places).length) errors.push(code("STORY_BIBLE_INCOMPLETE", "story bible has no places"));
  for (const [id, place] of Object.entries(places)) {
    if (!hasText(place?.set) || !hasText(place?.look)) errors.push(code("STORY_BIBLE_INCOMPLETE", `places.${id} needs set and look`, { locationId: id }));
  }
  const forbidden = asSet(world?.forbid);
  const used = new Set((bible.objects || []).map((o) => o?.concept).filter(Boolean));
  for (const item of used) if (forbidden.has(item)) errors.push(code("STORY_BIBLE_INCOMPLETE", `object '${item}' is both forbidden and used`, { item }));
  // P2.0: motif provenance + identity integrity against code-owned registries.
  errors.push(...validateBibleIntegrity(bible, slug));
  return errors;
}

/**
 * P3.4 — segment grounding (REPORT-FIRST).
 *
 * The scene's rendered visual subject (its icon `concept`) must be provable
 * from THIS scene's narration — the audio↔screen coherence contract: a
 * segment that narrates an X-ray machine being smashed must not show a tree.
 * Only the segment text counts as proof here; world/bible vocabulary proves
 * provenance (VOCABULARY_NOT_GROUNDED), not that the audio says it right now.
 *
 * Diagnostic-only in P3.4, mirroring CONTRACT_VACUOUS: thematic icons a
 * segment never names are common in EVERY book (measured: 42-134 scenes in
 * the healthy Test B books), so failing on them today would reject true
 * visuals. Enforcement flips to hard together with the icon pipeline (P3.5:
 * concrete-segment > thematic > shared-generic candidates) once the data is
 * provable for every book (P3.6) — the same report → enforce path the
 * coherence audit follows. No book slug, character, or world is referenced.
 */
function segmentGroundingErrors(scene, index) {
  const concept = scene?.concept;
  // No visual-subject claim to prove — absence is not an ungrounded visual.
  if (typeof concept !== "string" || !concept.trim()) return [];
  const segment = [scene?._narration, scene?.narration, scene?.text, scene?.subtitle]
    .filter((part) => typeof part === "string" && part.length)
    .join("\n");
  if (isGrounded(concept, segment)) return [];
  return [code(
    "VISUAL_NOT_GROUNDED_IN_SEGMENT",
    `visual subject '${concept.trim()}' is not grounded in this segment's narration`,
    { sceneId: scene?.id, index, concept: concept.trim(), severity: "diagnostic", segment: segment.slice(0, 160) }
  )];
}

function validateScene(scene, index, bible, slug, motifs = {}) {
  const errors = [];
  const atom = scene.narrativeAtom;
  const intent = scene.visualIntent;
  const contract = scene.visualContract;
  for (const [name, value] of [["NarrativeAtom", atom], ["VisualIntent", intent], ["VisualContract", contract]]) {
    if (!value || typeof value !== "object") errors.push(code("PROVENANCE_MISSING", `${name} is required`, { sceneId: scene.id, index }));
  }
  // P3.4: audio↔screen coherence for this scene's visual subject — runs before
  // the early return so a provenance-broken scene still reports its grounding
  // row (report-first; never the reason a book fails).
  errors.push(...segmentGroundingErrors(scene, index));
  errors.push(...foreignSubjectErrors(scene, index, bible?.visualProvenance?.worldId || bible?.world?.worldId));
  // Keep checking actual props even when the contract is absent. Otherwise an
  // uncontracted foreign motif would be hidden behind a generic missing-data
  // failure instead of being explicitly rejected.
  if (!atom || !intent || !contract) {
    for (const prop of scene.props || []) errors.push(code("MOTIF_NOT_ALLOWED", `motif '${prop.type}' has no book-scoped provenance authorizing it`, { sceneId: scene.id, index, motif: prop.type }));
    if (scene.bg?.set) errors.push(code("FOREIGN_WORLD", `location '${scene.bg.set}' has no book-scoped provenance authorizing it`, { sceneId: scene.id, index, location: scene.bg.set }));
    return errors;
  }
  for (const [name, value] of [["NarrativeAtom", atom], ["VisualIntent", intent], ["VisualContract", contract]]) {
    for (const key of REQUIRED_PROVENANCE) {
      const v = value[key];
      if ((key === "bookId" || key === "sourceChapter" || key === "narrativeSubject" || key === "narrativeRelation" || key === "narrativeState" || key === "worldId") ? !hasText(v) : !Array.isArray(v)) {
        errors.push(code("PROVENANCE_MISSING", `${name}.${key} is required`, { sceneId: scene.id, index }));
      }
    }
    if (value.bookId !== slug || value.worldId !== bible.visualProvenance?.worldId) {
      errors.push(code("FOREIGN_WORLD", `${name} provenance does not match the book world`, { sceneId: scene.id, index }));
    }
  }
  const registeredMotifs = new Set();
  const semanticProps = (scene.props || []).map(prop => {
    const resolved = resolveSvgMotif(prop, motifs);
    if (resolved.registered) registeredMotifs.add(resolved.motif);
    if (resolved.invalid) errors.push(code("SVG_ASSET_INVALID", "customSvg requires a valid viewBox and nonempty path geometry", { sceneId: scene.id, index }));
    return { ...prop, type: resolved.motif };
  });
  const allowedMotifs = asSet(contract.allowedMotifs);
  const forbiddenMotifs = asSet(contract.forbiddenMotifs);
  const allowedProps = asSet(contract.allowedProps);
  const allowedLocations = asSet(contract.allowedLocations);
  const allowedCharacters = asSet(contract.allowedCharacters);
  for (const prop of semanticProps) {
    // 2026-09-23: was `!allowedMotifs.has || !allowedProps.has` — a prop had to be
    // in BOTH lists. When a bible keeps motif ids and plain-English props apart
    // (show-your-work), every prop failed and deleting all props was the only
    // way to PASS. A prop is allowed when the book's vocabulary names it in
    // either list; FOREIGN_WORLD / registry checks still apply independently.
    if (!allowedMotifs.has(prop.type) && !allowedProps.has(prop.type)) errors.push(code("MOTIF_NOT_ALLOWED", `motif '${prop.type}' is not allowed by this scene contract`, { sceneId: scene.id, index, motif: prop.type }));
    if (forbiddenMotifs.has(prop.type)) errors.push(code("FOREIGN_WORLD", `motif '${prop.type}' is forbidden in this book world`, { sceneId: scene.id, index, motif: prop.type }));
  }
  if (scene.bg?.set && !allowedLocations.has(scene.bg.set)) errors.push(code("FOREIGN_WORLD", `location '${scene.bg.set}' is not allowed by this scene contract`, { sceneId: scene.id, index, location: scene.bg.set }));
  const visual = contract.visualEvidence;
  if (!visual || !Array.isArray(visual.subjects) || !Array.isArray(visual.relations) || !Array.isArray(visual.states)) {
    errors.push(code("SUBJECT_MISMATCH", "VisualContract.visualEvidence must explicitly name subjects, relations, and states", { sceneId: scene.id, index }));
  } else {
    if (!visual.subjects.includes(atom.narrativeSubject)) errors.push(code("SUBJECT_MISMATCH", `visual evidence does not depict '${atom.narrativeSubject}'`, { sceneId: scene.id, index }));
    if (!visual.relations.includes(atom.narrativeRelation)) errors.push(code("RELATION_MISMATCH", `visual evidence does not depict '${atom.narrativeRelation}'`, { sceneId: scene.id, index }));
    if (!visual.states.includes(atom.narrativeState)) errors.push(code("RELATION_MISMATCH", `visual evidence does not depict state '${atom.narrativeState}'`, { sceneId: scene.id, index }));
  }
  const identities = new Set((scene.characters || []).map((c) => c.identity || c.role).filter(Boolean));
  for (const character of contract.characterIntent || []) {
    if (!hasText(character.identity) || !hasText(character.role) || !hasText(character.action) || !character.gaze || !hasText(character.state)) {
      errors.push(code("CHARACTER_MISMATCH", "characterIntent requires identity, role, action, gaze, and state", { sceneId: scene.id, index }));
      continue;
    }
    if (!allowedCharacters.has(character.identity) || !identities.has(character.identity)) {
      errors.push(code("CHARACTER_MISMATCH", `named character '${character.identity}' is not represented by a matching scene identity`, { sceneId: scene.id, index, characterId: character.identity }));
    }
  }
  // ── P1.4 PHASE C: strategy requirement enforcement ────────────────────────
  // The firewall judges CONTRACT EVIDENCE against the REAL SCENE. It NEVER reads
  // the scene's strategy record (declarative metadata — never a trusted flag):
  // the requirement reaches the firewall only through visualEvidence.representation,
  // which the planner / inject-provenance wrote. Absent → no check (pre-C books
  // and DIRECT_SCENE are unaffected). Present but malformed → hard. Present but
  // unsatisfied by the actual scene → hard. Neither the strategy record nor the
  // evidence key alone can ever produce a PASS — only the real scene state can.
  const representation = contract.visualEvidence ? contract.visualEvidence.representation : undefined;
  if (representation != null) {
    const known = representation && typeof representation === "object" && hasText(representation.kind) && STRATEGY_REQUIREMENT_KINDS.has(representation.kind);
    if (!known) {
      errors.push(code("STRATEGY_EVIDENCE_MALFORMED", "VisualContract.visualEvidence.representation is present but carries no enforceable requirement kind", { sceneId: scene.id, index }));
    } else {
      const unmet = strategyRequirementUnmet(representation, scene);
      if (unmet) {
        // ── TITLE CARD (operator-approved Gate C.1, 2026-10-02) ─────────────
        // plan-antidote's title branch (i === 0 -> id "intro") HARD-CODES the
        // sub-callout style ("box") and gives the card no motif arc, so an
        // `absence`/`fallback` requirement on it is unsatisfiable by ANY
        // authoring — and `stageRequirement` already refuses to stage it
        // (`skipped:"title"`). The requirement stays VISIBLE as a diagnostic
        // instead of blocking a scene no authoring can satisfy. One line to
        // revert: drop the `severity` spread below.
        const isTitleCard = index === 0 && scene.id === "intro";
        errors.push(code("STRATEGY_REQUIREMENT_UNMET", `representation requirement '${representation.kind}' is not satisfied by the scene: ${unmet}`, { sceneId: scene.id, index, kind: representation.kind, unmet, ...(isTitleCard ? { severity: "diagnostic", reason: "title card: no authorable lever (fixed callout style, no motif arc)" } : {}) }));
      }
    }
  }
  // ── P1.4 PHASE D: authored-action lifecycle (D1–D4) ─────────────────────
  // The resolution reaches the firewall through visualEvidence.strategyResolution
  // (merge-only transport) — never through the scene's strategy record. An
  // explicit resolution without proof is HARD: `unresolved_no_proof` denies
  // production PASS (D3 — report-only is over), and an authored action outside
  // the renderer's enum demands a renderable re-authoring instead of a silent
  // generic fallback (D1). Independently, EVERY final-scene action is checked
  // against the renderer's own enum (D4): anything the renderer would silently
  // drop is named and failed.
  const strategyResolution = contract.visualEvidence ? contract.visualEvidence.strategyResolution : undefined;
  if (strategyResolution && strategyResolution.kind === "unresolved_no_proof") {
    errors.push(code("STRATEGY_UNRESOLVED", `scene carries no proof for its unresolved strategy: ${strategyResolution.note || "no reason recorded"}`, { sceneId: scene.id, index }));
  } else if (strategyResolution && strategyResolution.kind === "authored_proof_required") {
    errors.push(code("STRATEGY_ACTION_PROOF_REQUIRED", `authored action [${(Array.isArray(strategyResolution.invalidActions) ? strategyResolution.invalidActions : []).join(",")}] is outside the renderer's action enum — re-author with a renderable action or extend the schema deliberately (no silent generic fallback)`, { sceneId: scene.id, index }));
  }
  for (const c of scene.characters || []) {
    const a = String((c && c.action) || "");
    if (a && !RENDERER_ACTION_ENUM.has(a)) {
      errors.push(code("STRATEGY_ACTION_SCHEMA_EXTERNAL", `action '${a}' is not in the renderer's charAction enum — the renderer would silently drop it`, { sceneId: scene.id, index, action: a }));
    }
  }
  // ── P7: the shared semantic staging judge (spec item 3) ───────────────
  // The SAME engine the audit gate runs, over the SAME staging intent: a stored
  // meaningful visualIntent wins, otherwise the intent is derived from this
  // scene's narration with the gate's exact deterministic rules. One
  // implementation, two consumers — the gate and this firewall can no longer
  // drift apart.
  // REPORT-FIRST (the repo's P3.4/P2.0 pattern): the codes land as diagnostics
  // until commit 4/5 wire the director floor that can actually SATISFY the
  // obligation — hard-failing now would block every book before the fix exists.
  // One line to flip at the acceptance benchmark: remove the `severity: "diagnostic"`
  // spread below (mirror of the title-card precedent in the representation block).
  {
    const narrationText = typeof scene.narration === "string" && scene.narration
      ? scene.narration
      : [scene._narration, scene.text, scene.subtitle].filter((p) => typeof p === "string").join(" ");
    // No narration → no semantic obligation to enforce (a synthetic or
    // narration-less scene cannot stage a claim nobody made).
    if (String(narrationText || "").trim()) {
      const intent = effectiveStagingIntent(scene, String(narrationText), deriveVisualIntent);
      const staging = evaluateSemanticStaging({ scene, intent });
      for (const v of staging.hardViolations) errors.push(code("SEMANTIC_STAGING_VIOLATION", v, { sceneId: scene.id, index, violation: v, severity: "diagnostic", source: "shared-semantic-judge" }));
    }
  }
  // P2.0: use-site motif provenance (FOREIGN_WORLD / VOCABULARY_NOT_GROUNDED).
  errors.push(...validateSceneIntegrity({ ...scene, props: semanticProps }, index, bible, registeredMotifs));
  return errors;
}

function validateConfig({ config, bible, slug, motifs = {} }) {
  const violations = validateStoryBible(bible, slug);
  // Grounding reads the scene's FULL caption window, not only `_narration`
  // (the planner truncates that to 160 chars, so "design school" said at char
  // 200 made a `school` icon "ungrounded").
  const captions = Array.isArray(config.captions) ? config.captions : [];
  for (const [index, scene] of (config.scenes || []).entries()) {
    const said = captions.length && Number.isFinite(scene.fromFrame)
      ? captions.filter((c) => c.endFrame > scene.fromFrame && c.startFrame < scene.fromFrame + (scene.durationFrames || 0)).map((c) => c.text).join(" ")
      : "";
    const view = said && !scene.narration ? { ...scene, narration: said } : scene;
    violations.push(...validateScene(view, index, bible || {}, slug, motifs));
  }
  // P2.0: contract vacuity is diagnostic-only — reported, never failed on.
  violations.push(...detectContractVacuity(config));
  const hard = violations.filter((v) => v.severity !== "diagnostic");
  return {
    version: "P2.0",
    slug,
    status: hard.length ? "FAIL" : "PASS",
    counts: { scenes: (config.scenes || []).length, violations: hard.length, diagnostics: violations.length - hard.length },
    violations,
  };
}

function loadBook(root, slug) {
  const dir = path.join(root, "books", slug);
  return {
    motifs: fs.existsSync(path.join(dir, "motifs.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "motifs.json"), "utf8")) : {},
    config: JSON.parse(fs.readFileSync(path.join(dir, "config.antidote.json"), "utf8")),
    bible: JSON.parse(fs.readFileSync(path.join(dir, "story-bible.json"), "utf8")),
  };
}

module.exports = { REQUIRED_PROVENANCE, validateStoryBible, validateScene, validateConfig, loadBook, isDiagnostic: (v) => v.severity === "diagnostic", strategyRequirementUnmet };
