/**
 * Formal Story Bible Schema (P1.2a)
 *
 * Defines the minimum contract a story bible must satisfy before it can enter
 * the production pipeline. Every field requirement is generic — no book slug,
 * character name, or world concept is referenced.
 *
 * Exports:
 *   validateStoryBibleSchema(bible, slug) → { valid, errors[] }
 *   extractSemanticVocabulary(bible)      → SemanticVocabulary
 */

const hasText = (v) => typeof v === "string" && v.trim().length > 0;

// ── Schema Validation ────────────────────────────────────────────────────────

function validateStoryBibleSchema(bible, slug) {
  const errors = [];
  if (!bible || typeof bible !== "object") {
    return { valid: false, errors: [{ field: "root", message: "story-bible.json is missing or invalid" }] };
  }

  // authored flag
  if (bible.authored !== true) {
    errors.push({ field: "authored", message: "story bible must be authored (authored: true)" });
  }

  // world
  const world = bible.world;
  if (!world || typeof world !== "object") {
    errors.push({ field: "world", message: "world object is required" });
  } else {
    if (!hasText(world.era)) errors.push({ field: "world.era", message: "world.era is required" });
    if (!hasText(world.worldId)) errors.push({ field: "world.worldId", message: "world.worldId is required" });
    if (!hasText(world.setting)) errors.push({ field: "world.setting", message: "world.setting is required" });
    if (!Array.isArray(world.forbid) || world.forbid.length === 0) {
      errors.push({ field: "world.forbid", message: "world.forbid must be a non-empty array" });
    }
  }

  // visualProvenance
  const prov = bible.visualProvenance;
  if (!prov || typeof prov !== "object") {
    errors.push({ field: "visualProvenance", message: "visualProvenance object is required" });
  } else {
    if (prov.bookId !== slug) errors.push({ field: "visualProvenance.bookId", message: `must equal slug '${slug}'` });
    if (!hasText(prov.worldId)) errors.push({ field: "visualProvenance.worldId", message: "required" });
    if (world && hasText(world.worldId) && hasText(prov.worldId) && world.worldId !== prov.worldId) {
      errors.push({ field: "visualProvenance.worldId", message: "must match world.worldId" });
    }
    for (const arr of ["allowedMotifs", "forbiddenMotifs", "allowedCharacters", "allowedLocations", "allowedProps"]) {
      if (!Array.isArray(prov[arr])) errors.push({ field: `visualProvenance.${arr}`, message: "must be an array" });
    }
    // allowedCharacters must reference actual cast keys
    if (Array.isArray(prov.allowedCharacters) && bible.cast) {
      const castKeys = new Set(Object.keys(bible.cast));
      for (const ch of prov.allowedCharacters) {
        if (!castKeys.has(ch)) errors.push({ field: "visualProvenance.allowedCharacters", message: `'${ch}' not found in cast` });
      }
    }
    // allowedLocations must reference actual place keys
    if (Array.isArray(prov.allowedLocations) && bible.places) {
      const placeKeys = new Set(Object.keys(bible.places));
      for (const loc of prov.allowedLocations) {
        if (!placeKeys.has(loc)) errors.push({ field: "visualProvenance.allowedLocations", message: `'${loc}' not found in places` });
      }
    }
    // forbiddenMotifs and allowedMotifs must not overlap
    if (Array.isArray(prov.allowedMotifs) && Array.isArray(prov.forbiddenMotifs)) {
      const allowed = new Set(prov.allowedMotifs);
      for (const f of prov.forbiddenMotifs) {
        if (allowed.has(f)) errors.push({ field: "visualProvenance", message: `'${f}' is both allowed and forbidden` });
      }
    }
  }

  // cast
  const cast = bible.cast;
  if (!cast || typeof cast !== "object" || Object.keys(cast).length === 0) {
    errors.push({ field: "cast", message: "cast must be a non-empty object" });
  } else {
    for (const [id, member] of Object.entries(cast)) {
      if (!hasText(member?.name)) errors.push({ field: `cast.${id}.name`, message: "required" });
      if (!hasText(member?.look)) errors.push({ field: `cast.${id}.look`, message: "required" });
      if (!hasText(member?.role)) errors.push({ field: `cast.${id}.role`, message: "required" });
      if (!member?.variant || typeof member.variant !== "object" || Object.keys(member.variant).length === 0) {
        errors.push({ field: `cast.${id}.variant`, message: "must be a non-empty object" });
      }
    }
  }

  // places
  const places = bible.places;
  if (!places || typeof places !== "object" || Object.keys(places).length === 0) {
    errors.push({ field: "places", message: "places must be a non-empty object" });
  } else {
    for (const [id, place] of Object.entries(places)) {
      if (!hasText(place?.set)) errors.push({ field: `places.${id}.set`, message: "required" });
      if (!hasText(place?.look)) errors.push({ field: `places.${id}.look`, message: "required" });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Semantic Vocabulary Extraction ───────────────────────────────────────────

function extractSemanticVocabulary(bible) {
  if (!bible || typeof bible !== "object") {
    return null;
  }

  const prov = bible.visualProvenance || {};
  const cast = bible.cast || {};
  const places = bible.places || {};
  const objects = bible.objects || [];

  // Character name → cast key mapping (for narrator text matching)
  const characterNames = {};
  for (const [key, member] of Object.entries(cast)) {
    if (member?.name) {
      characterNames[member.name.toLowerCase()] = key;
    }
    // Also map the key itself
    characterNames[key.toLowerCase()] = key;
  }

  // Concept vocabulary from objects
  const concepts = objects
    .map((o) => o?.concept)
    .filter(Boolean);

  // Location vocabulary
  const locationNames = {};
  for (const [key, place] of Object.entries(places)) {
    locationNames[key.toLowerCase()] = key;
    if (place?.set) locationNames[place.set.toLowerCase()] = key;
  }

  return {
    worldId: prov.worldId || bible.world?.worldId || null,
    bookId: prov.bookId || bible.slug || null,
    era: bible.world?.era || null,

    // Named entities for text matching
    characterNames,      // { lowercaseName: castKey }
    locationNames,       // { lowercaseName: placeKey }
    concepts,            // string[]

    // Provenance boundaries
    allowedMotifs: new Set(prov.allowedMotifs || []),
    forbiddenMotifs: new Set(prov.forbiddenMotifs || []),
    allowedCharacters: new Set(prov.allowedCharacters || []),
    allowedLocations: new Set(prov.allowedLocations || []),
    allowedProps: new Set(prov.allowedProps || []),

    // Cast data for identity resolution
    cast,
  };
}

module.exports = { validateStoryBibleSchema, extractSemanticVocabulary };
