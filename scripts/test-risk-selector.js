#!/usr/bin/env node
/**
 * test-risk-selector.js — P1.3 unit tests (pure functions, no LLM, no I/O).
 *   node scripts/test-risk-selector.js
 */
const { makeScorer, selectFrames, RISK } = require("./lib/risk-selector");
const { capabilitiesOf } = require("./lib/failure-taxonomy");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };

const EMPTY_MAP = { capabilities: {} };
const MEASURED_MAP = {
  capabilities: {
    "action:sit": { confidence: 0.688 },
    "action:walk": { confidence: 0.9 },
    "shot:medium": { confidence: 0.845 },
    "cast:1": { confidence: 0.838 },
    "expression:neutral": { confidence: 0.75 },
    "cast:2": { confidence: 0.633 },
    "shot:twoShot": { confidence: 0.65 },
    "expression:blank": { confidence: 0.5 },
  },
};

const scorer = makeScorer(MEASURED_MAP);
const bare = makeScorer(EMPTY_MAP);

// determinism
{
  const scene = { shot: "medium", characters: [{ action: "sit", expression: "neutral" }] };
  ok(JSON.stringify(scorer(scene, "he cannot lie")) === JSON.stringify(scorer(scene, "he cannot lie")), "deterministic: same input, same output");
}

// unmeasured capabilities are riskier than measured-strong ones
{
  const a = bare({ shot: "closeUp", characters: [{ action: "fight", expression: "neutral" }] }, "");
  const b = scorer({ shot: "medium", characters: [{ action: "walk", expression: "neutral" }] }, "");
  ok(a.score > b.score, `unknown capability outrisks measured-strong (${a.score} > ${b.score})`);
  ok(a.reasons.some((r) => /unmeasured/.test(r.feature)), "unknown capability is flagged in reasons");
}

// negation raises risk
{
  const scene = { shot: "medium", characters: [{ action: "sit", expression: "neutral" }] };
  const no = scorer(scene, "robots cannot knowingly lie");
  const yes = scorer(scene, "robots follow every order exactly");
  ok(no.score > yes.score, `negation raises risk (${no.score} > ${yes.score})`);
}

// metaphor + emotion-inversion markers
{
  const m = scorer({ shot: "medium", characters: [{ action: "sit", expression: "neutral" }] }, "like a fish out of water");
  ok(m.reasons.some((r) => r.feature === "metaphor-marker"), "metaphor marker fires");
  const e = scorer({ shot: "medium", characters: [{ action: "sit", expression: "neutral" }] }, "he laments the wasted years");
  ok(e.reasons.some((r) => r.feature === "emotion-inversion"), "emotion-inversion marker fires");
}

// multi-cast + blank expression add composition load
{
  const two = scorer({ shot: "twoShot", characters: [{ action: "talk", expression: "neutral" }, { action: "idle", expression: "blank" }] }, "");
  const one = scorer({ shot: "medium", characters: [{ action: "sit", expression: "neutral" }] }, "");
  ok(two.score > one.score, `two-cast blank scene outrisks solo (${two.score} > ${one.score})`);
}

// selectFrames: ranks, cuts to k, tie-breaks by img
{
  const { selected, ranked } = selectFrames(
    [
      { img: "img-02.png", frame: 200, scene: { shot: "medium", characters: [{ action: "walk", expression: "neutral" }] }, narration: "they walk" },
      { img: "img-01.png", frame: 100, scene: { shot: "twoShot", characters: [{ action: "fight", expression: "blank" }, { action: "struggle", expression: "afraid" }] }, narration: "he can never forgive" },
      { img: "img-03.png", frame: 300, scene: { shot: "closeUp", characters: [{ action: "reach", expression: "neutral" }] }, narration: "like a mountain of gold" },
    ],
    2,
    scorer
  );
  ok(selected.length === 2, "cut to k=2");
  ok(selected[0].img === "img-01.png", `highest-risk frame first (got ${selected[0].img})`);
  ok(ranked.length === 3, "full ranking returned");
  ok(selected[0].score >= selected[1].score, "descending order");
}

// scores stay bounded
{
  const crazy = scorer({ shot: "split", characters: [{ action: "fight", expression: "blank" }, { action: "struggle", expression: "blank" }] }, "not never like a failed lament instead");
  ok(crazy.score <= 1, `score capped at 1 (got ${crazy.score})`);
}

// RISK constant sane
ok(RISK.unknownCapability > 0.3 && RISK.unknownCapability < 1, "unknown-capability weight in range");

console.log(`test-risk-selector: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
