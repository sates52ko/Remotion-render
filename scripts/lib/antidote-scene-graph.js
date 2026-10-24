/**
 * antidote-scene-graph.js — Scene Graph & World State Continuity Tracker
 *
 * Prevents "State Amnesia":
 *   Ensures that characters retain physical, spatial, and emotional continuity
 *   between consecutive beats sharing the same actors, setting, and narrative arc.
 */

class SceneGraphTracker {
  constructor() {
    this.history = [];
    this.characterStates = new Map(); // role -> { expression, action, set, lastSeenIndex }
  }

  track(scene, brief, index) {
    if (!scene) return;

    // Track active characters
    if (Array.isArray(scene.characters)) {
      scene.characters.forEach((c) => {
        const role = c.role || "narrator";
        const prevState = this.characterStates.get(role);

        // If continuous scene in same set within 2 beats, maintain smooth continuity
        if (prevState && index - prevState.lastSeenIndex <= 2 && prevState.set === scene.bg?.set) {
          // If previous action was holding a prop or continuous discussion, preserve context
          if (c.action === "idle" && prevState.action === "talk") {
            c.action = "listen";
          }
        }

        // Update state
        this.characterStates.set(role, {
          expression: c.expression,
          action: c.action,
          set: scene.bg?.set,
          lastSeenIndex: index,
        });
      });
    }

    this.history.push({
      index,
      sceneId: scene.id,
      set: scene.bg?.set,
      shot: scene.shot,
      cast: (scene.characters || []).map((c) => c.role),
    });
  }
}

module.exports = {
  SceneGraphTracker,
};
