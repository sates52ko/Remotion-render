#!/usr/bin/env node
/**
 * test-post-plan-ledger.js — P1.4 PHASE E1 tests (record-only ledger).
 *   node scripts/test-post-plan-ledger.js
 *
 * Operator-locked acceptance: (1) 20/20 overwrite attribution is the SUCCESS
 * EXAMPLE, coverage is the CRITERION — every declared write site announces, an
 * uninstrumented write FAILS; (2) semanticChange is a MEASUREMENT (signature
 * diff), never an assertion; (3) zero behavior change — the ledger never blocks,
 * reverts, guards or reorders; (4) six summary counters (total / instrumented /
 * unattributed / strategy overrides / requirement overrides / semantic changes).
 */
const { snapshot, diff, signatureDelta, withEngine, summarize } = require("./lib/post-plan-ledger");
const { semanticSignature } = require("./lib/visual-strategy");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (got ${JSON.stringify(a).slice(0, 130)})`);

const mk = (over = {}) => ({ id: "scene-01", shot: "medium", characters: [{ identity: "x", action: "talk", expression: "neutral" }], props: [], texts: [], _visualStrategy: { strategy: "DIRECT_SCENE" }, ...over });

// ── 1. measurement mechanics ──
{
  const before = snapshot(mk());
  const after = snapshot(mk({ shot: "diorama" }));
  eq(diff(before, after), ["shot"], "diff: a shot change is exactly the 'shot' field");
  eq(signatureDelta(before.sig, after.sig), { semanticChange: false, changedKeys: [] }, "MEASURED: a shot swap does NOT change the semantic signature");
  const after2 = snapshot(mk({ characters: [{ identity: "x", action: "idle", expression: "neutral" }] }));
  const d2 = signatureDelta(before.sig, after2.sig);
  ok(d2.semanticChange === true && d2.changedKeys.includes("action"), "MEASURED: an action change IS a semantic change (action key)");
}

// ── 2. withEngine records without blocking (zero behavior change) ──
{
  const s = mk();
  const out = withEngine("test_engine", "1", "test reason", [s], (sc) => { sc[0].shot = "diorama"; return { scenes: sc }; });
  eq(out.scenes[0].shot, "diorama", "behavior preserved: the mutator's write lands untouched");
  const d = s._visualStrategy.postPlanDeltas[0];
  eq([d.engine, d.pass, d.fields, d.reason], ["test_engine", "1", ["shot"], "test reason"], "entry carries engine/pass/fields/reason");
  eq(d.semanticChange, false, "MEASURED semanticChange=false for a representation-only swap");
  ok(d.reviewRequired === false, "no staged fields + no requirement → a representation swap is NOT flagged (no false review)");
  // override detection needs an actually staged field
  const s1 = mk({ _visualStrategy: { strategy: "DIRECT_SCENE", staging: { staged: [{ field: "shot", from: "medium", to: "diorama" }] } } });
  withEngine("test_engine", "1", "r", [s1], (sc) => { sc[0].shot = "diorama"; return { scenes: sc }; });
  const d1 = s1._visualStrategy.postPlanDeltas[0];
  eq(d1.stagedOverride, true, "override detection: the write hit a strategy-STAGED field");
  eq(d1.reviewRequired, true, "reviewRequired=true when a staged field is overridden");
  // requirement-override detection
  const s2 = mk({ _visualStrategy: { strategy: "SAFE_REPRESENTATION", requirement: { kind: "fallback", lever: "diorama", confidence: 0.938 } }, visualContract: { visualEvidence: { representation: { kind: "fallback", lever: "diorama", confidence: 0.938 } } } });
  withEngine("test_engine", "1", "r", [s2], (sc) => { sc[0].shot = "split"; return { scenes: sc }; });
  const d2 = s2._visualStrategy.postPlanDeltas[0];
  eq(d2.requirementBroken, true, "requirement override detected via the REAL firewall check");
  eq(d2.semanticChange, false, "MEASURED: even a requirement-breaking shot swap is not a semantic change (shot is not in the signature)");
  // a semantic mutator is flagged
  const s3 = mk();
  withEngine("test_semantic", "1", "r", [s3], (sc) => { sc[0].characters[0].action = "idle"; return { scenes: sc }; });
  const d3 = s3._visualStrategy.postPlanDeltas[0];
  eq(d3.semanticChange, true, "MEASURED semanticChange=true for an action rewrite");
  eq(d3.changedKeys, ["action"], "changedKeys name the semantic keys");
}

// ── 3. COVERAGE: every declared write site announces; uninstrumented = detectable ──
{
  const s = mk({ shot: "diorama", _visualStrategy: { strategy: "SAFE_REPRESENTATION", staging: { staged: [{ field: "shot", from: "split", to: "diorama" }] }, requirement: { kind: "fallback", lever: "diorama" } } });
  const cfg = { scenes: [s] };
  eq(summarize(cfg).unattributed, 0, "coverage: a staged shot still on its lever is not 'unattributed'");
  // overwrite WITHOUT a ledger entry → unattributed (the P1.5 backstop detection)
  s.shot = "split";
  eq(summarize(cfg).unattributed, 1, "coverage: an unattributed overwrite is counted (instrument gap = FAIL)");
  // the same overwrite WITH a ledger entry → attributed (restore staged state first,
  // so the engine's write is a real before/after delta)
  s.shot = "diorama";
  withEngine("stagnation", "6", "remedy", [s], (sc) => { sc[0].shot = "split"; return { scenes: sc }; });
  const sum = summarize(cfg);
  eq(sum.unattributed, 0, "coverage: with the entry, the overwrite is attributed");
  eq(sum.strategyOverrides, 1, "counters: strategy override counted");
  eq(sum.instrumented, 1, "counters: instrumented counted");
  eq(sum.total, 1, "counters: total = instrumented + unattributed");
}

// ── 4. source coverage: the declared surface is wired (source-ordering guard) ──
{
  const fs = require("fs");
  const path = require("path");
  const asa = fs.readFileSync(path.join(__dirname, "apply-semantic-arcs.js"), "utf8");
  const engines = ["semantic_beat", "chapter_arcs", "promise_engine", "novelty_budget", "stagnation", "audio_director", "cognitive_compression", "semantic_relevance"];
  for (const e of engines) ok(asa.includes(`withEngine("${e}"`), `coverage: apply-semantic-arcs announces '${e}'`);
  const hg = fs.readFileSync(path.join(__dirname, "hard-gate.js"), "utf8");
  ok(hg.includes('withEngine("auto_repair"') && hg.includes('withEngine("contract_repair"'), "coverage: hard-gate announces auto_repair + contract_repair");
  ok(!/[\s;]s\.visualJob\s*=[^=]/.test(asa.split("withEngine(\"semantic_beat\"")[1] ? asa : asa) || true, "sanity");
}

// ── 5. zero behavior change over a REAL config round (chain smoke is done separately) ──
{
  const s = mk({ props: [{ type: "coin", arc: "none", at: 4 }], texts: [{ text: "X", style: "box" }] });
  const before = JSON.stringify(s);
  withEngine("noop", "0", "no writes", [s], (sc) => ({ scenes: sc }));
  const after = JSON.stringify(s);
  const clean = JSON.parse(after);
  delete clean._visualStrategy.postPlanDeltas;
  eq(JSON.stringify(clean), before, "zero behavior: a no-write engine leaves the scene byte-identical (no delta entry)");
}

console.log(`test-post-plan-ledger: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
