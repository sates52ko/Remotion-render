#!/usr/bin/env node
/**
 * test-failure-taxonomy.js — P1.1 unit tests (pure functions, no LLM, no I/O).
 *   node scripts/test-failure-taxonomy.js
 */
const { CLASSES, RULES, classifyWrong, capabilitiesOf, aggregateCapabilities } = require("./lib/failure-taxonomy");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };

// ── classes: exactly the operator-approved 9 ──
ok(CLASSES.length === 9, "9 classes");
for (const c of ["SUBJECT", "ACTION", "RELATION", "STATE", "WORLD", "IDENTITY", "COMPOSITION", "METAPHOR", "TEXT"]) ok(CLASSES.includes(c), `class ${c} exists`);

// ── classifyWrong: judge-supplied class wins ──
ok(classifyWrong({ why: "celebrates while narration laments", cls: "ACTION" }).class === "ACTION", "judge-labeled class wins over rules");
ok(classifyWrong({ why: "x", cls: "nonsense" }).class !== "NONSENSE", "unknown judge class ignored");

// ── deterministic rules on realistic judge evidence (from the measured corpus) ──
ok(classifyWrong({ why: "The text says 'THAT ROBOT LIES' which contradicts the narration that robots cannot knowingly lie." }).class === "TEXT", "on-screen text contradiction -> TEXT");
ok(classifyWrong({ why: "The viewer's message completely contradicts the narration's discussion; a trophy suggests triumph not critique." }).class === "SUBJECT", "meaning contradiction -> SUBJECT");
ok(classifyWrong({ why: "Depicts anxiety over messaging rather than her overdose handled with banality." }).class === "SUBJECT", "rather-than -> SUBJECT");
ok(classifyWrong({ why: "Viewer reads it as unrelated to society incinerating books." }).class === "SUBJECT", "unrelated -> SUBJECT");
ok(classifyWrong({ why: "Narration explains a myth, but the image is read literally as an explosion." }).class === "METAPHOR", "literal reading -> METAPHOR");
ok(classifyWrong({ why: "Fails to convey shock and terror; faces stay neutral." }).class === "STATE", "missing dread -> STATE");
ok(classifyWrong({ why: "Narration laments the frozen grin; the visual shows a worried man instead." }).class === "STATE", "frozen grin mismatch -> STATE");
ok(classifyWrong({ why: "Wrong character conflates the narrator with the mentor." }).class === "IDENTITY", "conflated who -> IDENTITY");
ok(classifyWrong({ why: "The handoff between the two people is unclear; who does what to whom is lost." }).class === "RELATION", "lost handoff -> RELATION");
ok(classifyWrong({ why: "The scene shows a modern office in a story set in 1800; the era is wrong." }).class === "WORLD", "era mismatch -> WORLD");
ok(classifyWrong({ why: "Frame is too busy; salience hierarchy buries the subject." }).class === "COMPOSITION", "salience -> COMPOSITION");
ok(classifyWrong({ why: "The grabbing action is illegible; they appear to be standing." }).class === "ACTION", "illegible verb -> ACTION");
ok(classifyWrong({}).class === "UNCLASSIFIED", "no evidence -> UNCLASSIFIED");

// ── the TEXT rule must NOT fire on blind-description phrasings (measured bug) ──
ok(classifyWrong({ why: "Viewer read the wrong meaning; the frame shows a trophy.", sees: "a man, text reading THE SETUP in the corner" }).class === "SUBJECT", "sees text does not force TEXT class");

// ── capabilitiesOf ──
const caps = capabilitiesOf({ shot: "twoShot", characters: [{ action: "talk", expression: "worried" }, { action: "idle", expression: "neutral" }] });
ok(caps.castCount === 2 && caps.shot === "twoShot", "capabilitiesOf reads cast/shot");
ok(JSON.stringify(caps.actions) === JSON.stringify(["idle", "talk"]), "capabilitiesOf sorts actions");
ok(capabilitiesOf(null).castCount === 0, "capabilitiesOf(null) is safe");

// ── aggregateCapabilities: evidence + majority split ──
const agg = aggregateCapabilities([
  { cls: "SUBJECT", isMajority: true, capabilities: { actions: ["hold"], castCount: 1, shot: "illustration", expressions: ["neutral"] } },
  { cls: "TEXT", isMajority: false, capabilities: { actions: ["hold"], castCount: 1, shot: "medium", expressions: ["neutral"] } },
]);
ok(agg["action:hold"].evidence === 2, "action evidence aggregates");
ok(agg["action:hold"].wrongMajority === 1, "majority counted separately from evidence");
ok(agg["action:hold"].classes.SUBJECT === 1 && agg["action:hold"].classes.TEXT === 1, "per-class tally");
ok(agg["shot:illustration"].evidence === 1, "shot evidence keyed");

// rules compile (no regex syntax drift)
for (const [re, cls] of RULES) ok(CLASSES.includes(cls), `rule targets a real class: ${cls}`);

console.log(`test-failure-taxonomy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
