/**
 * cold-open.js — Antidote 10x Phase 3 ColdOpenDirector.
 *
 * Syncs 100% to the incoming NotebookLM audio (zero operator voice recording)
 * and choreographs the first 0:00–0:50s to crush the 0:30 -> 1:00 retention drop-off.
 */

const HOOK_DEVICE_MAP = {
  scene: {
    devices: ["hookPoster", "annotatedScene(dollyZoom)", "upClose", "cutoutStage"],
    transition: "pushThrough",
    note: "Drop straight into the physical scene on frame 0 with hookPoster or dollyZoom.",
  },
  belief: {
    devices: ["hookPoster", "crumpleToss", "kineticManifesto", "beforeAfterWipe"],
    transition: "whipPan",
    note: "State the common myth, then visually shatter/toss it on the narrator's turn.",
  },
  number: {
    devices: ["statSlam", "barRace", "cohortGrid"],
    transition: "pushThrough",
    note: "Slam the exact spoken number/cost immediately, then show its scale.",
  },
  ending: {
    devices: ["hookPoster", "upClose", "annotatedScene(dollyZoom)", "timelineScrub"],
    transition: "focusPull",
    note: "Open on the final image/decision, then rewind the timeline.",
  },
  object: {
    devices: ["upClose", "annotatedScene", "explodedView"],
    transition: "focusPull",
    note: "Spotlight the signature object in frame 1 and zoom into its consequence.",
  },
  question: {
    devices: ["hookPoster", "kineticManifesto", "decisionTree", "spatialJourney"],
    transition: "pushThrough",
    note: "Put the urgent question on stage cleanly and branch the stakes.",
  },
  contrast: {
    devices: ["hookPoster", "beforeAfterWipe", "balanceScale", "comparisonGrid"],
    transition: "whipPan",
    note: "Split the two opposing choices side-by-side from second 1.",
  },
  confession: {
    devices: ["hookPoster", "crumpleToss", "editorialSpread", "kineticManifesto"],
    transition: "focusPull",
    note: "Frame the misreading first, then strike/replace it with the book's scene.",
  },
};

function coldOpenRulesBlock(opening) {
  if (!opening || !opening.hook) return "";
  const spec = HOOK_DEVICE_MAP[opening.hook] || HOOK_DEVICE_MAP.scene;
  return [
    "",
    "## Cold-Open Visual Choreography (0:00–0:50s — Synced to Incoming Audio)",
    `- Book opening hook: \`${opening.hook}\` (naming: \`${opening.naming || "early"}\`, promise: \`${opening.promise || "stake"}\`).`,
    `- Keep beats in the first 50s (\`coldOpen: true\`) tight (**6–12s** per visual shift, never a 25s static hold).`,
    `- For Beat 0 (0:00–0:05), prefer \`hookPoster\`: 2-block semantic hook (\`setup\` -> whole-block \`payoff\` settle) + \`before -> after\` visual anomaly.`,
    `- Preferred 10x opening devices: ${spec.devices.join(", ")}.`,
    `- Direction: ${spec.note}`,
  ].join("\n");
}

function applyColdOpenDirection(scene, { index = 0, fromSec = 999, opening = null, pack = null, authorContinue = false } = {}) {
  if (!scene || typeof scene !== "object" || fromSec >= 50) return scene;

  // Energetic cold-open camera momentum without breaking authored zoom
  const cam = scene.camera || { zoom: [1, 1], panX: [0, 0], panY: [0, 0] };
  const z0 = Array.isArray(cam.zoom) ? cam.zoom[0] : 1;
  const z1 = Array.isArray(cam.zoom) ? cam.zoom[1] : 1;
  if (Math.abs(z1 - z0) < 0.025) {
    scene.camera = { ...cam, zoom: [z0, Number((z0 + 0.042).toFixed(3))] };
  }

  // Hook-aligned transition for fast opening cuts (unless authored or continued)
  if (index > 0 && !authorContinue) {
    const hookSpec = opening && opening.hook ? HOOK_DEVICE_MAP[opening.hook] : null;
    const tType = (hookSpec && hookSpec.transition) || (pack && pack.polarity === "light" ? "paperTear" : "pushThrough");
    scene.transition = {
      ...(scene.transition || {}),
      type: tType,
      frames: 12,
    };
  }

  return scene;
}

function eventRelayRulesBlock() {
  return [
    "",
    "## Event Relay (Before -> Visible Change -> Result Hold)",
    "- Every visual beat must stage a real intra-scene state change: `before_state -> visible_change -> result_hold -> next handoff`.",
    "- Camera zoom/pan, caption turnover, and background grain/glow alone do NOT count as local visual action.",
    "- Never slide a background alone to fake character/object action; prefer a motivated hold over idle wobble.",
    "- Cold Open (< 50s): keep local visual state changes <= 4.0s apart; Body: <= 6.0s apart.",
  ].join("\n");
}

module.exports = { HOOK_DEVICE_MAP, coldOpenRulesBlock, applyColdOpenDirection, eventRelayRulesBlock };
