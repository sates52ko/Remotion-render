/**
 * build-10x-prompts.js — Auto-builds `books/<slug>/prompts.10x.json` from
 * merged `assetRequests` across storyboard chunks, within the <= 45 Flux budget.
 */
const fs = require("fs");
const path = require("path");

function conciseArtLock(artLock) {
  const raw = String(artLock || "").trim();
  if (!raw) return "editorial gouache and fine-line ink illustration";
  const firstClause = raw.split(",")[0].trim();
  return (firstClause.length <= 140 ? firstClause : raw.slice(0, 140)).trim();
}

function collectReferencedImages(beats) {
  const refs = new Set();
  for (const b of beats || []) {
    if (!b || typeof b !== "object") continue;
    const add = (p) => { if (typeof p === "string" && p.trim()) refs.add(p.trim()); };
    add(b.bgImage?.path);
    add(b.annotatedScene?.image);
    add(b.editorialSpread?.image);
    add(b.upClose?.image);
    add(b.cutoutStage?.backdrop?.image);
    for (const a of b.cutoutStage?.actors ?? []) add(a.image);
    for (const p of b.cutoutStage?.props ?? []) add(p.image);
    add(b.beforeAfterWipe?.before?.image);
    add(b.beforeAfterWipe?.after?.image);
    for (const c of b.comparisonGrid?.columns ?? []) add(c.image);
  }
  return [...refs];
}

function buildPrompts10x({ slug, beats, pack, minorHarm = false, maxCalls = 45, publicRoot = null } = {}) {
  if (minorHarm || (pack && pack.castMode === "vectorRig")) {
    return { skipped: true, reason: "minorHarm/vectorRig — zero photoreal Flux", scenes: [], warnings: [], missingRefs: [] };
  }
  const byId = new Map();
  const warnings = [];
  for (const b of beats || []) {
    for (const req of b?.assetRequests ?? []) {
      if (!req || !req.id || !req.prompt) continue;
      const id = String(req.id).trim();
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        path: req.path ? String(req.path).trim() : `scenes/${slug}/${id}.png`,
        prompt: String(req.prompt).trim(),
        ...(req.mode ? { mode: req.mode } : {}),
        ...(req.cutout != null ? { cutout: !!req.cutout } : {}),
        ...(req.grid ? { grid: req.grid } : {}),
      });
    }
  }
  const scenes = [...byId.values()];
  if (scenes.length > maxCalls) {
    warnings.push(`prompts.10x.json declares ${scenes.length} assets, exceeding maxCalls=${maxCalls} by ${scenes.length - maxCalls}`);
  }
  const declaredPaths = new Set(scenes.map((s) => s.path));
  const missingRefs = [];
  for (const ref of collectReferencedImages(beats)) {
    if (!ref.startsWith(`scenes/${slug}/`)) continue;
    if (declaredPaths.has(ref)) continue;
    if (publicRoot && fs.existsSync(path.join(publicRoot, ref))) continue;
    missingRefs.push(ref);
  }
  return {
    skipped: false,
    generatedBy: "storyboard-merge",
    slug,
    stylePack: pack?.id || null,
    artLock: conciseArtLock(pack?.artLock),
    maxCalls,
    scenes,
    warnings,
    missingRefs,
  };
}

module.exports = { buildPrompts10x, conciseArtLock, collectReferencedImages };
