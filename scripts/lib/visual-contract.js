/**
 * visual-contract.js — Visual Contract Enforcement Engine
 *
 * Enforces the core rule:
 * "Randomness can choose STYLE. It can never choose MEANING."
 *
 * Rules:
 *   1. Negative Constraint Enforcement: Motifs in mustNotShow are strictly filtered out.
 *   2. Presence Enforcement: If mustShow requires characters, empty "insert" shots are blocked.
 *   3. Autonomous Contract Repair: replaces an ILLEGAL motif on an engine-chosen beat, and
 *      restores characters when broken.
 *
 * P0.2 (2026-09-30) — the authored-icon restage hole is CLOSED:
 *   `repairSceneContract` used to swap a forbidden motif for the brief's concept or a
 *   generic "spotlight" (SAFE_FALLBACK_MOTIFS = spotlight/shape/orbit/ripple). On a
 *   beat whose icon an author decided (art file / authored brief) that is restaging an
 *   authored decision — invariant 1 — and it happened silently: the lock sealed
 *   shot/set/cast/expression/action/holds, not the icon. Now:
 *     • an authored beat is never substituted: the forbidden icon/set stays and an
 *       `UNRESOLVED` problem is raised, so the plan (plan-antidote) and the pre-render
 *       gate (hard-gate) stop with the scene id and the reason — "re-author this beat";
 *     • a heuristic (non-authored) beat simply LOSES the forbidden motif — no generic
 *       wallpaper to fill the frame;
 *     • SAFE_FALLBACK_MOTIFS is gone: `filterMotifsByContract` no longer invents a
 *       fallback when every candidate is forbidden (an empty author menu stays empty).
 */

/**
 * Is this beat's picture an author's decision (art file or Claude brief), as opposed
 * to a heuristic guess? plan-antidote stamps `_authorship.src`; "none" = heuristic.
 */
function isAuthoredBeat(scene) {
  const src = scene && scene._authorship && scene._authorship.src;
  return !!src && src !== "none";
}

/**
 * Filters a list of candidate motifs against a beat's visual contract.
 * Returns only the surviving candidates — possibly NONE. A filter may not invent
 * a subject (the fallback list is what put a spotlight on authored beats).
 */
function filterMotifsByContract(candidates, brief) {
  if (!brief || !Array.isArray(candidates)) return candidates;
  const forbidden = new Set(brief.mustNotShow || (brief.antidote && brief.antidote.forbiddenMotifs) || []);
  return candidates.filter((m) => !forbidden.has(m));
}

/**
 * Filters shot candidates against a beat's visual contract.
 */
function filterShotsByContract(shots, brief) {
  if (!brief || !Array.isArray(shots)) return shots;
  const forbidden = new Set(brief.antidote?.forbiddenShots || []);
  if (brief.mustShow?.includes("characters")) {
    forbidden.add("insert");
  }
  const filtered = shots.filter((s) => !forbidden.has(s));
  return filtered.length > 0 ? filtered : ["medium", "closeUp"];
}

// An authored EMPTY cast (art.json cast [], sealed as lock.cast []) is final: nobody.
const isCastSealedEmpty = (scene) => !!(scene && scene._authorship && scene._authorship.lock && Array.isArray(scene._authorship.lock.cast) && scene._authorship.lock.cast.length === 0);

/**
 * Validates a generated or existing scene against its beat contract.
 */
function validateSceneAgainstContract(scene, brief) {
  const violations = [];
  if (!brief) return { valid: true, violations };

  // 1. Check mustNotShow motifs
  const forbidden = new Set(brief.mustNotShow || (brief.antidote && brief.antidote.forbiddenMotifs) || []);
  if (Array.isArray(scene.props)) {
    for (const p of scene.props) {
      if (forbidden.has(p.type)) {
        violations.push({
          rule: "FORBIDDEN_MOTIF",
          motif: p.type,
          message: `Scene ${scene.id} displays motif "${p.type}" which is forbidden by visual contract`,
        });
      }
    }
  }

  // 1b. Check forbidden sets
  if (scene.bg && forbidden.has(scene.bg.set)) {
    violations.push({
      rule: "FORBIDDEN_SET",
      set: scene.bg.set,
      message: `Scene ${scene.id} uses set "${scene.bg.set}" which is forbidden by visual contract`,
    });
  }

  // 2. Check mustShow characters (a diagram beat satisfies it: the diagram is the subject)
  // An authored EMPTY cast (sealed lock.cast []) is never filled: it is reported.
  const castSealedEmpty = isCastSealedEmpty(scene);
  if (castSealedEmpty && brief.mustShow?.includes("characters")) {
    problems.push({ sceneId: scene.id, rule: "UNRESOLVED", field: "cast", message: `scene ${scene.id} was authored with cast [] but its beat brief requires characters — re-author this beat (no figure is added)` });
  } else if (brief.mustShow?.includes("characters") && !scene.diagram) {
    if (scene.shot === "insert" || !Array.isArray(scene.characters) || scene.characters.length === 0) {
      violations.push({
        rule: "MISSING_REQUIRED_CHARACTERS",
        entities: brief.entities || [],
        shot: scene.shot,
        message: `Scene ${scene.id} requires character dramatization but uses empty "${scene.shot}" shot with 0 characters`,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Repairs a scene that violates its visual contract, and REPORTS what it refused to
 * repair. Returns { scene, problems }; a problem is `{ sceneId, rule:"UNRESOLVED", … }`
 * and means "this beat's own brief forbids what its author decided — re-author it".
 *
 * @param {object} scene
 * @param {object} brief  beat brief (authored) carrying mustNotShow / antidote / place
 * @param {object} palette unused by the current repairs; kept for call compatibility
 */
// opts.castEmpty: the art file authored cast [] on this beat. plan-antidote runs the
// repair BEFORE it seals the lock, so the sealed lock cannot say so yet.
function applyContractRepair(scene, brief, palette = { red: "#DC2626", ink: "#1C1917" }, opts = {}) {
  const problems = [];
  if (!brief) return { scene, problems };
  const forbidden = new Set(brief.mustNotShow || (brief.antidote && brief.antidote.forbiddenMotifs) || []);
  const authored = isAuthoredBeat(scene);

  // 1. Fix forbidden motifs.
  if (Array.isArray(scene.props)) {
    const kept = [];
    for (const p of scene.props) {
      if (!p || !forbidden.has(p.type)) { kept.push(p); continue; }
      if (authored) {
        // The author's subject stands; swapping it for an engine's own idea is the
        // restage this gate exists to stop. The plan stops instead (exit non-zero).
        kept.push(p);
        problems.push({
          sceneId: scene.id,
          rule: "UNRESOLVED",
          field: "icon",
          prop: p.type,
          message: `scene ${scene.id} shows the authored icon "${p.type}", which this beat's brief forbids (mustNotShow) — re-author this beat (no substitution)`,
        });
      } else {
        // A heuristic beat keeps nothing rather than accepting generic wallpaper.
        console.warn(`   ⚠ scene ${scene.id}: dropped forbidden motif "${p.type}" (heuristic beat — no fallback motif)`);
      }
    }
    scene.props = kept;
  }

  // 1b. Fix forbidden sets — same rule: an authored location is never silently swapped.
  if (scene.bg && forbidden.has(scene.bg.set)) {
    if (authored) {
      problems.push({
        sceneId: scene.id,
        rule: "UNRESOLVED",
        field: "set",
        prop: scene.bg.set,
        message: `scene ${scene.id} is staged in the authored set "${scene.bg.set}", which this beat's brief forbids — re-author this beat (no substitution)`,
      });
    } else {
      scene.bg.set = (brief.place && !forbidden.has(brief.place))
        ? brief.place
        : (forbidden.has("classroom") ? "agora" : "room");
    }
  }

  // 2. Fix missing characters on character beats
  // A diagram scene has no cast on purpose (the diagram IS the beat); restoring
  // one turned authored diagrams back into talking heads.
  // An authored EMPTY cast (sealed lock.cast []) is never filled: it is reported.
  const castSealedEmpty = isCastSealedEmpty(scene) || opts.castEmpty === true;
  if (castSealedEmpty && brief.mustShow?.includes("characters")) {
    problems.push({ sceneId: scene.id, rule: "UNRESOLVED", field: "cast", message: `scene ${scene.id} was authored with cast [] but its beat brief requires characters — re-author this beat (no figure is added)` });
  } else if (brief.mustShow?.includes("characters") && !scene.diagram) {
    if (scene.shot === "insert" || !Array.isArray(scene.characters) || scene.characters.length === 0) {
      // Switch shot to preferred framing
      const prefShot = (brief.antidote?.shotPreference && brief.antidote.shotPreference.find((s) => s !== "insert")) || "medium";
      scene.shot = prefShot;

      // Restore cast
      const primaryRole = (brief.antidote?.cast && brief.antidote.cast[0]) || (brief.entities && brief.entities[0]) || "narrator";
      scene.characters = [
        {
          id: `c-${scene.id}-0`,
          rig: "everyman",
          role: primaryRole,
          expression: "neutral",
          enter: "fade",
          action: "talk",
          lookAt: "motif",
        },
      ];
    }
  }

  return { scene, problems };
}

/**
 * Back-compat wrapper: repair and drop the problems. Callers that must not restage
 * an authored beat (plan-antidote, hard-gate) use applyContractRepair and act on
 * the problems; this exists for any caller that only wanted the scene back.
 */
function repairSceneContract(scene, brief, palette) {
  return applyContractRepair(scene, brief, palette).scene;
}

module.exports = {
  isCastSealedEmpty,
  filterMotifsByContract,
  filterShotsByContract,
  validateSceneAgainstContract,
  applyContractRepair,
  repairSceneContract,
  isAuthoredBeat,
};
