/**
 * test-visual-compiler-integration.js — P10.2a integration tests:
 * T6 (precedence), T7 (forbidden sweep), T8/T8b (authorship isolation + linkage),
 * T8c (claim-ledger completeness), T10 (evidence-strength reporting).
 *
 * Runs the compiler + the hook logic against a synthetic beat, then the REAL
 * evaluateAuthorship on a minimal config shaped exactly like plan-antidote output.
 * Run: node scripts/test-visual-compiler-integration.js
 */
"use strict";
const assert = require("assert");
const { compile: compileVisual } = require("./lib/visual-compiler.js");
const { evaluateAuthorship, authorshipStamp } = require("./lib/authorship.js");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.error(`FAIL  ${name}\n      ${e.message}`); }
}

// ── fixture: a minimal antidote-shaped scene with the hook applied ──────────
function makeScene({ visual = null, preProp = null, applyHook = true } = {}) {
  const scene = {
    id: "scene-01", shot: "illustration", type: "beat",
    characters: [{ identity: "narrator", action: "idle" }],
    props: preProp ? [JSON.parse(JSON.stringify(preProp))] : [],
    texts: [], narration: "the storm hit and the flood filled the wash",
    _narration: "the storm hit and the flood filled the wash",
  };
  const stamp = authorshipStamp({ brief: { narrative_intent: "show the cause", src: "claude" }, propTypes: preProp ? [preProp.type] : [], conceptAuthored: null });
  scene._authorship = stamp;
  if (applyHook && visual) {
    // replicate plan-antidote hook logic (kept in sync by T6/T8 assertions)
    let vc;
    try { vc = compileVisual(visual); }
    catch (e) { vc = { ok: false, errors: [String(e.message || e)], props: [], claims: [], unrepresentable: [], dropped: [] }; }
    const existing = new Set(scene.props.map((p) => p.type));
    const added = [];
    for (const p of vc.props || []) {
      if (!p || !p.type) continue;
      if (existing.has(p.type)) { vc.dropped.push({ requested: p.type, reason: "duplicate: first-writer-wins" }); continue; }
      existing.add(p.type);
      added.push({ type: p.type, x: p.x, y: p.y, scale: p.scale, at: p.at || 0, enter: p.enter || "fade", _visualClaim: p.role || p.type });
    }
    const base = scene.props.length;
    scene.props = [...scene.props, ...added];
    for (const p of added) if (!scene._authorship.propTypes.includes(p.type)) scene._authorship.propTypes.push(p.type);
    scene._authorship.visualCompiled = {
      hook: "post-staging/pre-lock (P10.2a §3a)", ok: vc.ok, errors: vc.errors || [],
      claims: vc.claims || [], unrepresentable: vc.unrepresentable || [], dropped: vc.dropped || [],
      certificate: vc.certificate || null,
      forbidden: Array.isArray(visual.forbidden) ? visual.forbidden : [],
      props: added.map((p, i) => ({ index: base + i, type: p.type, claim: p._visualClaim })),
      pixel: { evidenceStrength: "unverified", record: null },
    };
  }
  return scene;
}

const CAUSE_BRIEF = {
  relation: "cause_effect",
  claims: [
    { subject: "storm", role: "pole-0", band: "center", size: "m", text: "storm hits the wash" },
    { subject: "water", role: "pole-1", band: "center", size: "m", text: "flood fills it" },
    { subject: "arrow", role: "relator", size: "m" },
  ],
};

// ── T6 precedence: compiler ADDS, never mutates; duplicates drop
t("T6 existing prop objects are byte-identical after the hook", () => {
  const pre = { type: "car", x: 300, y: 800, scale: 0.8, at: 0 };
  const withHook = makeScene({ visual: CAUSE_BRIEF, preProp: pre });
  const stamped = withHook._authorship.lock ? withHook._authorship.lock : null;
  assert.equal(withHook.props[0].type, "car");
  assert.deepEqual(withHook.props[0], pre); // byte-identical (same values, same key order preserved by JSON copy)
  assert.equal(withHook.props.length, 1 + 3);
});
t("T6 duplicate type from compiler drops to ledger (first-writer-wins)", () => {
  const pre = { type: "storm", x: 300, y: 800, scale: 0.8 };
  const s = makeScene({ visual: CAUSE_BRIEF, preProp: pre });
  const vc = s._authorship.visualCompiled;
  assert.ok(vc.dropped.some((d) => d.requested === "storm"), "storm dropped");
  assert.equal(s.props.filter((p) => p.type === "storm").length, 1);
  assert.equal(vc.props.length, 2); // water + arrow added
});

// ── T7 forbidden sweep (config-only, gate-level)
t("T7 forbidden object staged by ANY writer → FORBIDDEN_OBJECT_STAGED", () => {
  const scene = makeScene({ visual: { ...CAUSE_BRIEF, forbidden: ["car"] }, preProp: { type: "car", x: 300, y: 800, scale: 0.8 } });
  const filler = (id) => ({ id, type: "beat", shot: "illustration", characters: [{ identity: "narrator", action: "idle" }], props: [], texts: [], narration: "u" + id, _narration: "u" + id, _authorship: authorshipStamp({ brief: { narrative_intent: "intent " + id, src: "claude" }, propTypes: [] }) });
  const scenes = [scene];
  for (let i = 2; i <= 12; i++) scenes.push(filler("scene-" + String(i).padStart(2, "0")));
  const res = evaluateAuthorship({ engine: "antidote", scenes }, { engine: "antidote" });
  assert.ok(res.violations.some((v) => v.code === "FORBIDDEN_OBJECT_STAGED"), JSON.stringify(res.violations));
});
t("T7 severity is REPORT (live gate PASS unchanged)", () => {
  const scene = makeScene({ visual: { ...CAUSE_BRIEF, forbidden: ["car"] }, preProp: { type: "car", x: 300, y: 800, scale: 0.8 } });
  const filler = (id) => ({ id, type: "beat", shot: "illustration", characters: [{ identity: "narrator", action: "idle" }], props: [], texts: [], narration: "u" + id, _narration: "u" + id, _authorship: authorshipStamp({ brief: { narrative_intent: "show the cause " + id, src: "claude" }, propTypes: [] }) });
  const scenes = [scene];
  for (let i = 2; i <= 12; i++) scenes.push(filler("scene-" + String(i).padStart(2, "0")));
  const res = evaluateAuthorship({ engine: "antidote", scenes }, { engine: "antidote" });
  const { severityFor } = require("./lib/proposition-loss.js");
  assert.equal(severityFor("FORBIDDEN_OBJECT_STAGED"), "REPORT");
  assert.ok(!res.violations.some((v) => v.code === "FORBIDDEN_OBJECT_STAGED" && v.hard), "must not be hard");
});

// ── T8/T8b authorship isolation + linkage (REAL evaluateAuthorship)
t("T8b compiled props pass the gate with ZERO ENGINE_INVENTED_PROP", () => {
  const scene = makeScene({ visual: CAUSE_BRIEF });
  const res = evaluateAuthorship({ engine: "antidote", scenes: [scene] }, { engine: "antidote" });
  const invented = res.violations.filter((v) => v.code === "ENGINE_INVENTED_PROP");
  assert.equal(invented.length, 0, JSON.stringify(invented));
});
t("T8b stamp isolation: only propTypes (appended) + visualCompiled differ from baseline", () => {
  const baseline = makeScene({ visual: null, preProp: null });
  const hooked = makeScene({ visual: CAUSE_BRIEF });
  const a = { ...baseline._authorship }, b = { ...hooked._authorship };
  delete a.propTypes; delete a.visualCompiled;
  delete b.propTypes; delete b.visualCompiled;
  assert.deepEqual(a, b, "all other stamp fields must be identical");
  // propTypes = baseline ∪ compiled types
  const base = new Set(baseline._authorship.propTypes || []);
  const extra = (hooked._authorship.propTypes || []).filter((t2) => !base.has(t2));
  assert.deepEqual(extra.sort(), ["arrow", "storm", "water"].sort());
});
t("T8b no visual block → hook writes nothing (baseline identical to pre-P10.2a shape)", () => {
  const s = makeScene({ visual: null, preProp: null });
  assert.equal(s.props.length, 0);
  assert.equal(s._authorship.visualCompiled, undefined);
  assert.deepEqual(s._authorship.propTypes, []);
});

// ── T8c claim-ledger completeness (the reverse-direction proof)
t("T8c every REPRESENTABLE claim leaves a staged prop; unrepresentable ones ledgered", () => {
  const brief = { relation: "cause_effect", claims: [
    ...CAUSE_BRIEF.claims,
    { subject: "arroyo" },                                      // → unrepresentable
  ] };
  const s = makeScene({ visual: brief });
  const vc = s._authorship.visualCompiled;
  const stagedTypes = new Set(vc.props.map((p) => p.type));
  for (const claim of vc.claims) {
    if (claim.verdict === "REPRESENTABLE") {
      assert.ok(stagedTypes.has(claim.subject), `REPRESENTABLE claim ${claim.subject} not staged`);
    }
  }
  assert.equal(vc.unrepresentable.length, 1);
  assert.equal(vc.unrepresentable[0].requested, "arroyo");
});
t("T8c PARTIAL claim stages its showable noun AND records the gap", () => {
  const s = makeScene({ visual: { relation: "none", claims: [{ subject: "mirror", action: "cracks" }] } });
  const vc = s._authorship.visualCompiled;
  assert.equal(vc.claims[0].verdict, "PARTIAL");
  assert.ok(vc.claims[0].missing[0].includes("visibleAction"));
  assert.ok(stagedTypeOf(vc, "mirror"));
  function stagedTypeOf() { return vc.props.some((p) => p.type === "mirror"); }
});

// ── T10 evidence-strength reporting: structural/pixel split, no inference
t("T10 visualCompiled.pixel starts unverified regardless of structural success", () => {
  const s = makeScene({ visual: CAUSE_BRIEF });
  assert.equal(s._authorship.visualCompiled.pixel.evidenceStrength, "unverified");
  assert.equal(s._authorship.visualCompiled.pixel.record, null);
});
t("T10 structural verdicts visible in claims ledger (perPole basis)", () => {
  const s = makeScene({ visual: CAUSE_BRIEF });
  const roles = s._authorship.visualCompiled.claims.map((c) => c.role || null).sort();
  assert.deepEqual(roles, ["pole-0", "pole-1", "relator"]);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
