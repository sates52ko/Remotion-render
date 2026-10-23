/**
 * risk-selector.js — P1.3 (2026-10-01): deterministic risk scoring.
 *
 * The operator's pivot: vision raters are noisy diagnostic evidence, not ground
 * truth, and 270 calls per book is not the shape of production. So vision is
 * SPENT, not sprayed: a deterministic scorer (config scene + narration text
 * only — zero LLM, zero vision) ranks frames by how likely the rendered frame
 * is to betray the narration, and only the top-K get rated.
 *
 * Features (all measured on the 2026-10-01 corpus — data/failure-taxonomy.json):
 *   - capability risk from the P1.2 map (unmeasured capability ⇒ risky-unknown,
 *     the sampler's blind spot: push/grab/fight/fall were never judged)
 *   - negation in the narration (the classic SUBJECT failure: "robots cannot
 *     lie" drawn as a lying robot)
 *   - metaphor/figure-of-speech markers (drawn literally → METAPHOR failures)
 *   - emotional-inversion markers (celebrate/lament mismatches → STATE/SUBJECT)
 *   - multi-cast scenes (relation load) and blank expressions
 *
 * The score is a PRIOR for where to look, never a verdict and never a gate.
 */

const RISK = {
  unknownCapability: 0.6, // risk weight when a capability has never been judged
};

function makeScorer(capabilityMap) {
  const caps = (capabilityMap && capabilityMap.capabilities) || {};
  const capRisk = (key) => {
    const c = caps[key];
    if (!c || c.confidence == null) return { risk: RISK.unknownCapability, unknown: true };
    return { risk: 1 - c.confidence, unknown: false };
  };
  /**
   * scene: a config scene (characters/shot/expression...).
   * narration: the caption text around the frame (string, may be empty).
   * Returns { score, reasons: [{feature, weight}] } — deterministic.
   */
  return function scoreScene(scene, narration) {
    const reasons = [];
    const add = (feature, weight) => { if (weight > 0) reasons.push({ feature, weight: +weight.toFixed(3) }); };
    let score = 0.05; // base: even the safest frame keeps a floor
    const ch = (scene && scene.characters) || [];

    // 1) capability risk (P1.2 map), averaged over the scene's capabilities
    const keys = [];
    for (const c of ch) keys.push(`action:${String(c.action || "none")}`);
    if (scene && scene.shot) keys.push(`shot:${scene.shot}`);
    for (const c of ch) keys.push(`expression:${String(c.expression || "none")}`);
    keys.push(`cast:${ch.length}`);
    let unknownSeen = false;
    if (keys.length) {
      let s = 0;
      for (const k of keys) { const r = capRisk(k); s += r.risk; if (r.unknown) unknownSeen = true; }
      const avg = s / keys.length;
      add(`capability-risk${unknownSeen ? " (incl. unmeasured)" : ""}`, avg * 0.6);
      score += avg * 0.6;
    }

    // 2) narration markers
    const t = String(narration || "").toLowerCase();
    if (/\b(not|never|cannot|can't|cannot|don'?t|doesn'?t|isn'?t|aren'?t|without|no longer|stop)\b/.test(t)) { add("negation", 0.2); score += 0.2; }
    if (/\b(like|as if|as though|metaphor|symbolizes?|represents?)\b/.test(t)) { add("metaphor-marker", 0.15); score += 0.15; }
    if (/\b(lament\w*|grief|mourn\w*|iron\w*|paradox\w*|instead|rather than|fail\w*|wast\w*|empty|los\w*|lost)\b/.test(t)) { add("emotion-inversion", 0.1); score += 0.1; }

    // 3) composition load
    if (ch.length >= 2) { add("multi-cast-relation", 0.12); score += 0.12; }
    for (const c of ch) if (String(c.expression || "neutral") === "blank") { add("blank-expression", 0.1); score += 0.1; break; }
    if (scene && scene.shot === "split") { add("split-shot", 0.08); score += 0.08; }

    return { score: +Math.min(1, score).toFixed(3), reasons };
  };
}

/**
 * frames: [{img, frame, scene, narration}] — the caller maps key.json + config.
 * k: how many to select for vision. Deterministic: score desc, then img asc.
 */
function selectFrames(frames, k, scoreScene) {
  const scored = frames
    .map((f) => ({ img: f.img, frame: f.frame, ...scoreScene(f.scene, f.narration) }))
    .sort((a, b) => b.score - a.score || String(a.img).localeCompare(String(b.img)));
  return { selected: scored.slice(0, k), ranked: scored };
}

module.exports = { RISK, makeScorer, selectFrames };
