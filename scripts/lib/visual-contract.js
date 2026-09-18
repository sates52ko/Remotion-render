/**
 * visual-contract.js — Visual Contract Enforcement Engine
 *
 * Enforces the core rule:
 * "Randomness can choose STYLE. It can never choose MEANING."
 *
 * Rules:
 *   1. Negative Constraint Enforcement: Motifs in mustNotShow are strictly filtered out.
 *   2. Presence Enforcement: If mustShow requires characters, empty "insert" shots are blocked.
 *   3. Autonomous Contract Repair: Replaces illegal motifs and restores characters when broken.
 */

const SAFE_FALLBACK_MOTIFS = ["spotlight", "shape", "orbit", "ripple"];

/**
 * Filters a list of candidate motifs against a beat's visual contract.
 */
function filterMotifsByContract(candidates, brief) {
  if (!brief || !Array.isArray(candidates)) return candidates;
  const forbidden = new Set(brief.mustNotShow || (brief.antidote && brief.antidote.forbiddenMotifs) || []);
  const filtered = candidates.filter((m) => !forbidden.has(m));
  return filtered.length > 0 ? filtered : SAFE_FALLBACK_MOTIFS.filter((m) => !forbidden.has(m));
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

  // 2. Check mustShow characters
  if (brief.mustShow?.includes("characters")) {
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
 * Autonomously repairs a scene violating its visual contract.
 */
function repairSceneContract(scene, brief, palette = { red: "#DC2626", ink: "#1C1917" }) {
  if (!brief) return scene;
  const forbidden = new Set(brief.mustNotShow || (brief.antidote && brief.antidote.forbiddenMotifs) || []);

  // 1. Fix forbidden motifs
  if (Array.isArray(scene.props)) {
    scene.props = scene.props.map((p) => {
      if (forbidden.has(p.type)) {
        // Substitute with brief's concept or safe fallback
        const replacement = (brief.antidote && brief.antidote.concept && !forbidden.has(brief.antidote.concept))
          ? brief.antidote.concept
          : "spotlight";
        return {
          ...p,
          type: replacement,
        };
      }
      return p;
    });
  }

  // 1b. Fix forbidden sets
  if (scene.bg && forbidden.has(scene.bg.set)) {
    const replacementSet = (brief.place && !forbidden.has(brief.place))
      ? brief.place
      : (forbidden.has("classroom") ? "agora" : "room");
    scene.bg.set = replacementSet;
  }

  // 2. Fix missing characters on character beats
  if (brief.mustShow?.includes("characters")) {
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

  return scene;
}

module.exports = {
  filterMotifsByContract,
  filterShotsByContract,
  validateSceneAgainstContract,
  repairSceneContract,
  SAFE_FALLBACK_MOTIFS,
};
