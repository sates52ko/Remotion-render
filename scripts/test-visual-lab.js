// Regression for the Visual Regression Lab sampler's pure parts: the seeded PRNG and the
// risk signals. Run: node scripts/test-visual-lab.js
const { rng, scoreScene } = require("./visual-lab.js");

let failed = 0;
const t = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; };

// 1) the PRNG is deterministic per seed and differs across seeds
const a1 = rng("beloved:abc"), a2 = rng("beloved:abc"), b = rng("beloved:xyz");
const seqA = [a1(), a1(), a1()], seqA2 = [a2(), a2(), a2()], seqB = [b(), b(), b()];
t("same seed -> same sequence", JSON.stringify(seqA) === JSON.stringify(seqA2));
t("different seed -> different sequence", JSON.stringify(seqA) !== JSON.stringify(seqB));
t("values in [0,1)", seqA.every((v) => v >= 0 && v < 1));

// 2) risk signals: an empty mood-only beat trips the object/relation/face rules
const moodOnly = { id: "s1", shot: "medium", characters: [{ action: "idle", expression: "neutral" }], texts: [] };
const r1 = scoreScene(moodOnly);
t("mood-only beat is risky", r1.risk >= 3);
t("mood-only beat reports no_object", r1.reasons.includes("no_object"));
t("mood-only beat reports neutral_face", r1.reasons.includes("neutral_face"));

// 3) a beat with a concept, a holding character and two people is not flagged for object/relation
const rich = {
  id: "s2", shot: "twoShot", concept: "tree",
  characters: [{ action: "hold", holds: "book", expression: "happy" }, { action: "point", expression: "sad" }],
};
const r2 = scoreScene(rich);
t("concept beat has no no_object risk", !r2.reasons.includes("no_object"));
t("two-person beat has no no_relation risk", !r2.reasons.includes("no_relation"));

// 4) a diagram beat is never flagged as no_object
const diagram = { id: "s3", diagram: { type: "flow" }, characters: [] };
t("diagram beat has no no_object risk", !scoreScene(diagram).reasons.includes("no_object"));

console.log(failed ? `\n${failed} FAILED` : "\nall visual-lab checks passed");
process.exit(failed ? 1 : 0);
