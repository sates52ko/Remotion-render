/**
 * Bible Integrity Checks (P2.0)
 *
 * Generic, book-agnostic enforcement of the provenance principle:
 *
 *   1. FOREIGN_WORLD            — a motif with a registered originWorldId is
 *                                  used or claimed by a different world.
 *   2. VOCABULARY_NOT_GROUNDED  — a motif with no registered origin and no
 *                                  shared-pool membership is not grounded in
 *                                  the scene's narration/bible vocabulary.
 *   3. IDENTITY_DUPLICATE       — two cast members are near-identical
 *                                  identities (same normalized name, or keys
 *                                  one edit apart).
 *   4. CONTRACT_VACUOUS         — (diagnostic only) the contract carries no
 *                                  narrative discrimination: one constant
 *                                  relation and/or all-unknown chapters.
 *
 * No book slug, character name, or world concept is referenced anywhere in
 * this module. Authority comes from two code-owned registries:
 *
 *   data/motif-world.json          motif -> owning worldId
 *   data/shared-generic-motifs.json globally shared generic vocabulary
 *
 * Neither file can be authored into a story bible, so a bible can never
 * whitelist a foreign motif for itself.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");

const code = (reasonCode, message, extra = {}) => ({ reasonCode, message, ...extra });

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "were", "be", "been", "by", "as", "at", "it", "its", "this",
  "that", "these", "those", "from", "into", "about", "not", "no", "but", "if",
  "then", "so", "we", "you", "they", "he", "she", "my", "your", "his", "her",
  "them", "us", "all", "any", "can", "could", "would", "should", "must", "do",
  "does", "did", "have", "has", "had", "also", "more", "most", "other", "some",
  "own", "same", "than", "too", "very", "just", "because", "over", "under",
  "after", "before", "between", "out", "up", "down", "off", "again", "further",
  "once", "here", "there", "each", "few", "nor",
]);

let registries = null;

/** Load (and cache) the two code-owned registries. Missing file = empty registry, never a pass-by-omission shortcut. */
function loadRegistries() {
  if (registries) return registries;
  const readJson = (name) => {
    const p = path.join(DATA_DIR, name);
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (_) {
      return {};
    }
  };
  const worldFile = readJson("motif-world.json");
  const sharedFile = readJson("shared-generic-motifs.json");
  registries = {
    origins: worldFile && typeof worldFile.origins === "object" && worldFile.origins ? worldFile.origins : {},
    shared: new Set(Array.isArray(sharedFile?.motifs) ? sharedFile.motifs : []),
  };
  return registries;
}

/** Split a motif into content tokens: camelCase boundaries, then non-alnum, then drop stopwords/short words. */
function motifTokens(motif) {
  return String(motif || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Everything the scene could plausibly ground its vocabulary in. Never the contract's own allowedMotifs (that is the tautology). */
function groundingCorpus(scene, bible) {
  const parts = [
    scene?._narration, scene?.narration, scene?.text, scene?.subtitle,
    scene?.claim,
  ];
  for (const o of bible?.objects || []) parts.push(o?.concept, o?.name, o?.note);
  for (const [id, m] of Object.entries(bible?.cast || {})) {
    parts.push(id, m?.name, m?.role, m?.mentions);
    if (Array.isArray(m?.mentions)) parts.push(...m.mentions);
  }
  for (const [id, p] of Object.entries(bible?.places || {})) parts.push(id, p?.set, p?.look);
  parts.push(bible?.world?.era, bible?.world?.setting, bible?.world?.worldId, bible?.world?.register);
  return parts.filter((p) => typeof p === "string" && p.length).join("\n").toLowerCase();
}

/** A motif is grounded when EVERY content token appears word-wise in the corpus. No content tokens = nothing to prove. */
function isGrounded(motif, corpus) {
  const tokens = motifTokens(motif);
  if (!tokens.length) return true;
  return tokens.every((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(corpus));
}

/**
 * 2026-09-23: may an ENGINE (director motif menu, stagnation remedy, before/after
 * opposite) put this motif on a scene? Exactly what the firewall will accept:
 * registry-owned motifs only in their own world, shared-generic ones anywhere,
 * anything else only when the scene's own words name it. Engines used to draw
 * decorative motifs from class menus ("positive" -> summit/ladder) that nobody
 * said, and the firewall then failed the book for it.
 */
function isFirewallSafeMotif(name, text, worldId) {
  if (!name) return false;
  const { origins, shared } = loadRegistries();
  if (origins[name]) return origins[name] === worldId;
  if (shared.has(name)) return true;
  return isGrounded(name, String(text || "").toLowerCase());
}

/** True when two keys are identical or one edit (substitution/insertion/deletion) apart. */
function nearDuplicateKeys(a, b) {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i] && ++diff > 1) return false;
    }
    return diff === 1;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i++;
      j++;
    } else {
      if (skipped) return false;
      skipped = true;
      j++;
    }
  }
  return true;
}

const normalizeName = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Bible-level checks. Runs against visualProvenance.allowedMotifs and cast.
 * FOREIGN_WORLD here is the "beyan seviyesi" (claim-level) rejection: the
 * bible itself claims a motif owned by another world.
 */
function validateBibleIntegrity(bible, slug) {
  const errors = [];
  const { origins } = loadRegistries();
  const prov = bible?.visualProvenance;
  const worldId = prov?.worldId || bible?.world?.worldId || null;

  if (prov && Array.isArray(prov.allowedMotifs) && worldId) {
    for (const motif of prov.allowedMotifs) {
      const origin = origins[motif];
      if (origin && origin !== worldId) {
        errors.push(code(
          "FOREIGN_WORLD",
          `allowedMotif '${motif}' belongs to world '${origin}', but this bible (world '${worldId}') claims it`,
          { motif, originWorldId: origin, worldId }
        ));
      }
    }
  }

  const cast = bible?.cast || {};
  const entries = Object.entries(cast);

  const byName = new Map();
  for (const [id, member] of entries) {
    const n = normalizeName(member?.name);
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(id);
  }
  for (const [n, ids] of byName) {
    if (ids.length > 1) {
      errors.push(code(
        "IDENTITY_DUPLICATE",
        `cast name '${n}' is used by ${ids.length} identities: ${ids.join(", ")}`,
        { characterIds: ids, similarity: "exact-name" }
      ));
    }
  }

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = normalizeName(entries[i][0]);
      const b = normalizeName(entries[j][0]);
      if (Math.min(a.length, b.length) >= 4 && nearDuplicateKeys(a, b)) {
        errors.push(code(
          "IDENTITY_DUPLICATE",
          `cast keys '${entries[i][0]}' and '${entries[j][0]}' are one edit apart — likely the same identity`,
          { characterIds: [entries[i][0], entries[j][0]], similarity: "key-edit-distance-1" }
        ));
      }
    }
  }

  return errors;
}

/**
 * Scene-level use-site checks. Runs against the motifs the scene actually
 * renders. Lookup order: registered origin -> shared pool -> grounding.
 */
function validateSceneIntegrity(scene, index, bible, registeredMotifs = new Set()) {
  const errors = [];
  const { origins, shared } = loadRegistries();
  const worldId = bible?.visualProvenance?.worldId || bible?.world?.worldId
    || scene?.visualContract?.worldId || scene?.narrativeAtom?.worldId || null;
  let corpus = null;

  for (const prop of scene?.props || []) {
    const motif = prop?.type;
    if (!motif) continue;

    const origin = origins[motif];
    if (origin) {
      if (worldId && origin !== worldId) {
        errors.push(code(
          "FOREIGN_WORLD",
          `motif '${motif}' belongs to world '${origin}', but scene world is '${worldId}'`,
          { sceneId: scene?.id, index, motif, originWorldId: origin, worldId }
        ));
      }
      continue; // registered origin proves provenance; no grounding required
    }
    if (shared.has(motif) || registeredMotifs.has(motif)) continue;

    if (corpus === null) corpus = groundingCorpus(scene, bible);
    if (!isGrounded(motif, corpus)) {
      errors.push(code(
        "VOCABULARY_NOT_GROUNDED",
        `motif '${motif}' has no registered origin, is not in the shared pool, and is not grounded in this scene's narration/bible vocabulary`,
        { sceneId: scene?.id, index, motif }
      ));
    }
  }

  return errors;
}

/**
 * Config-level vacuity detection. DIAGNOSTIC ONLY in P2.0: a degenerate
 * contract is not proof of a wrong visual (a healthy book can currently
 * exhibit the same signature). Reported, never failed on its own.
 */
function detectContractVacuity(config) {
  const scenes = config?.scenes || [];
  if (scenes.length < 5) return [];
  const relations = new Set();
  const chapters = new Set();
  for (const s of scenes) {
    relations.add(String(s?.narrativeAtom?.narrativeRelation ?? "").trim());
    chapters.add(String(s?.narrativeAtom?.sourceChapter ?? "").trim());
  }
  const signals = [];
  if (relations.size <= 1) {
    signals.push(`narrativeRelation is constant across ${scenes.length} scenes`);
  }
  const chapterList = [...chapters].filter(Boolean);
  if (chapterList.length > 0 && chapterList.every((c) => c === "unknown")) {
    signals.push(`sourceChapter is "unknown" for every scene`);
  }
  if (!signals.length) return [];
  return [{
    reasonCode: "CONTRACT_VACUOUS",
    severity: "diagnostic",
    message: `visual contract carries no narrative discrimination: ${signals.join("; ")}`,
    evidence: { distinctRelations: [...relations], distinctChapters: [...chapters] },
  }];
}

module.exports = {
  loadRegistries,
  isFirewallSafeMotif,
  motifTokens,
  groundingCorpus,
  isGrounded,
  nearDuplicateKeys,
  validateBibleIntegrity,
  validateSceneIntegrity,
  detectContractVacuity,
};
