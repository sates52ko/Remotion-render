/**
 * post-plan-ledger.js — P1.4 PHASE E1 (operator-approved, RECORD-ONLY).
 *
 * Every declared post-plan mutator write site announces its own changes through
 * this helper. ZERO behavior change: the helper never blocks, reverts, guards,
 * skips or reorders anything — it measures and records. Anything NOT wired is an
 * unattributed mutation, and coverage is asserted, not assumed: a scene must not
 * gain unknown top-level keys (the coverage test fails on uninstrumented writes).
 *
 * The per-mutation entry (operator-locked shape):
 *   { engine, pass, field, from, to, reason, sigBefore, sigAfter,
 *     semanticChange, reviewRequired }
 *
 * `semanticChange` is a MEASUREMENT, never an assertion: it compares the scene's
 * semanticSignature (action / subject / relation / state / world / metaphor —
 * PHASE B) before and after the write. `reviewRequired` is true when the write
 * overrides a strategy-staged field or a requirement-bearing representation, or
 * when the delta is semantic. The ledger travels ON the scene's own record
 * (`_visualStrategy.postPlanDeltas`) so the config stays self-describing.
 */
const { semanticSignature } = require("./visual-strategy");
const { strategyRequirementUnmet } = require("./narrative-visual-firewall");

/** Deep snapshot of the fields mutators are known to write + the semantic core. */
function snapshot(scene) {
  return {
    sig: semanticSignature({ scene }),
    shot: scene.shot,
    texts: JSON.parse(JSON.stringify(scene.texts || [])),
    props: JSON.parse(JSON.stringify(scene.props || [])),
    characters: JSON.parse(JSON.stringify(scene.characters || [])),
    narrative: JSON.parse(JSON.stringify(scene.narrative || null)),
    visualJob: scene.visualJob,
    visualArc: JSON.parse(JSON.stringify(scene.visualArc || null)),
    attention: JSON.parse(JSON.stringify(scene.attention || null)),
    holdsScaleXy: JSON.stringify((scene.characters || []).map((c) => [c.scale, c.x, c.y, c.holds])),
    emotion: JSON.stringify((scene.characters || []).map((c) => c.emotion)),
  };
}

/** Field-level diffs between two snapshots (top-level paths only). */
function diff(before, after) {
  const fields = [];
  for (const key of Object.keys(before)) {
    if (key === "sig") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) fields.push(key);
  }
  return fields;
}

const SEMANTIC_KEYS = ["action", "subject", "relation", "state", "world", "metaphor"];
function signatureDelta(sigBefore, sigAfter) {
  const changed = SEMANTIC_KEYS.filter((k) => String(sigBefore[k] || "") !== String(sigAfter[k] || ""));
  return { semanticChange: changed.length > 0, changedKeys: changed };
}

/** Wrap a SINGLE mutator call: measures per-scene deltas and records them. */
function withEngine(engine, pass, reason, scenes, mutator) {
  const before = new Map(scenes.map((s) => [s.id, snapshot(s)]));
  const out = mutator(scenes);
  const resultScenes = (out && out.scenes) || scenes;
  for (const s of resultScenes) {
    const b = before.get(s.id);
    if (!b) continue;
    const a = snapshot(s);
    const changed = diff(b, a);
    if (!changed.length) continue;
    const { semanticChange, changedKeys } = signatureDelta(b.sig, a.sig);
    const vs = s._visualStrategy || {};
    const stagedFields = new Set(((vs.staging && vs.staging.staged) || []).map((x) => x.field));
    const overriddenStaging = changed.some((f) => stagedFields.has(f));
    const representation = vs.requirement && vs.requirement.kind
      ? s.visualContract && s.visualContract.visualEvidence && s.visualContract.visualEvidence.representation
      : null;
    const requirementBroken = !!(representation && strategyRequirementUnmet(representation, s));
    s._visualStrategy = {
      ...(vs.strategy ? vs : {}),
      ...(vs.strategy ? {} : {}),
      postPlanDeltas: [
        ...((vs.postPlanDeltas || [])),
        {
          engine, pass, field: changed.join("+"), from: null, to: null,
          fields: changed,
          reason: reason || null,
          detail: changed.map((f) => `${f}: ${abbreviate(b[f])} -> ${abbreviate(a[f])}`).join("; ").slice(0, 400),
          sigBefore: b.sig, sigAfter: a.sig, changedKeys,
          semanticChange, // MEASURED (diff of the semantic signature), never asserted
          stagedOverride: overriddenStaging || null,
          requirementBroken: requirementBroken || null,
          reviewRequired: semanticChange || requirementBroken || overriddenStaging,
        },
      ],
    };
  }
  return out;
}

function abbreviate(v) {
  const s = JSON.stringify(v);
  return s && s.length > 80 ? s.slice(0, 77) + "..." : s;
}

/** Coverage summary over a finished config (the operator-locked six counters). */
function summarize(config) {
  const scenes = config.scenes || [];
  let total = 0, instrumented = 0, strategyOverrides = 0, requirementOverrides = 0, semantic = 0, review = 0;
  for (const s of scenes) {
    const deltas = s._visualStrategy && s._visualStrategy.postPlanDeltas || [];
    instrumented += deltas.length;
    for (const d of deltas) {
      if (d.stagedOverride) strategyOverrides++;
      if (d.requirementBroken) requirementOverrides++;
      if (d.semanticChange) semantic++;
      if (d.reviewRequired) review++;
    }
  }
  // unattributed = staged shot (or other declared strategy staging) no longer
  // matching the final scene, with NO delta entry claiming it
  let unattributed = 0;
  for (const s of scenes) {
    const vs = s._visualStrategy || {};
    const stagedShots = ((vs.staging && vs.staging.staged) || []).filter((x) => x.field === "shot");
    for (const st of stagedShots) {
      if (s.shot !== st.to) {
        const claimed = (vs.postPlanDeltas || []).some((d) => d.fields && d.fields.includes("shot"));
        if (!claimed) unattributed++;
      }
    }
  }
  total = instrumented + unattributed;
  return { total, instrumented, unattributed, strategyOverrides, requirementOverrides, semantic, review };
}

module.exports = { snapshot, diff, signatureDelta, withEngine, summarize };
