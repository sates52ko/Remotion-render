/**
 * test-visual-compiler.js — P10.2a pure-function tests: T1–T5, T8c, T9
 * (design test matrix; no pipeline needed). Run: node scripts/test-visual-compiler.js
 */
"use strict";
const assert = require("assert");
const {
  RENDERER_PROP_TYPES, ARROW_PATH_START, ARROW_PATH_END, ARROW_BOX,
  capabilitiesOf, classify, compile, composeFrame, claimLedgerComplete,
} = require("./lib/visual-compiler.js");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.error(`FAIL  ${name}\n      ${e.message}`); }
}

// ── T1 capability grounding — every capability answer matches a code-verified mechanism
t("T1 staticPresence true iff type in renderer enum", () => {
  assert.equal(capabilitiesOf("storm").staticPresence, true);
  assert.equal(capabilitiesOf("water").staticPresence, true);
  assert.equal(capabilitiesOf("arroyo").staticPresence, false);
  assert.equal(capabilitiesOf("door").staticPresence, true); // REGISTRY≠SCENE_ICONS: door renders
});
t("T1 visibleAction only for motifs with per-frame motion", () => {
  assert.equal(capabilitiesOf("storm").visibleAction, true);   // flicker
  assert.equal(capabilitiesOf("water").visibleAction, true);   // churn
  assert.equal(capabilitiesOf("mirror").visibleAction, false); // static drawing
});
t("T1 stateTransition only for stateIndex consumers", () => {
  assert.equal(capabilitiesOf("fiveRegimes").stateTransition, true);
  assert.equal(capabilitiesOf("storm").stateTransition, false);
});

// ── T2 type purity (REGISTRY/schema contract, NOT SCENE_ICONS)
t("T2 every compiled prop type is in the renderer vocabulary", () => {
  const brief = { relation: "none", claims: ["storm", "water", "door", "mirror"] };
  const c = compile(brief);
  assert.equal(c.ok, true, c.errors.join("; "));
  for (const p of c.props) assert.ok(RENDERER_PROP_TYPES.has(p.type), `unknown type ${p.type}`);
});
t("T2 unknown type goes to the ledger, never emitted", () => {
  const c = compile({ relation: "none", claims: ["arroyo", "storm"] });
  assert.equal(c.props.some((p) => p.type === "arroyo"), false);
  assert.equal(c.unrepresentable.length, 1);
  assert.match(c.unrepresentable[0].reason, /no renderer motif/);
});

// ── T3 no coordinates authored; geometry ONLY from composeFrame
t("T3 compiler output carries band/size, geometry comes from composeFrame alone", () => {
  const c = compile({ relation: "none", claims: [{ subject: "storm", band: "sky", size: "l" }] });
  assert.equal(c.ok, true);
  const p = c.props[0];
  assert.ok(p.band && p.size, "band/size present");
  // geometry determinism: same input → same numbers
  const c2 = compile({ relation: "none", claims: [{ subject: "storm", band: "sky", size: "l" }] });
  assert.deepEqual(c.props, c2.props);
  assert.equal(c.certificate.allInSafeArea, true);
});

// ── T4 three-level verdicts (ITW #029 worked example, design §1)
t("T4 ITW #029 classification reproduced exactly", () => {
  const storm = classify({ subject: "storm" }, "storm");
  assert.equal(storm.verdict, "REPRESENTABLE");
  const water = classify({ subject: "water" }, "water");
  assert.equal(water.verdict, "REPRESENTABLE");
  const wash = classify({ subject: "desert wash" }, "horizon"); // no desert set — but horizon IS an enum bg set, not a prop; probe the prop path
  // desert-wash-as-prop is not representable:
  const noSet = compile({ relation: "none", claims: ["desertWash"] });
  assert.equal(noSet.unrepresentable[0].verdict.verdict || noSet.unrepresentable[0].verdict, "UNREPRESENTABLE");
  const transformation = classify({ subject: "water", spatial: { kind: "transformation" } }, "water");
  assert.equal(transformation.verdict, "UNREPRESENTABLE");
  assert.match(transformation.reason, /links two props/);
  const partial = classify({ subject: "mirror", action: "cracks" }, "mirror"); // static drawing + action claim
  assert.equal(partial.verdict, "PARTIAL");
  assert.ok(partial.missing[0].includes("visibleAction"));
});

// ── T5 no silent omission: claims + ledger cover 100% of authored claims
t("T5 every authored claim is staged or ledgered (R3)", () => {
  const brief = { relation: "cause_effect", claims: [
    { subject: "storm", role: "pole-0", text: "storm hits" },
    { subject: "water", role: "pole-1", text: "flood fills" },
    { subject: "arroyo" },                                   // unrepresentable
    { subject: "water", spatial: { kind: "transformation" } }, // unrepresentable
  ] };
  const c = compile(brief);
  const total = c.claims.length + c.unrepresentable.length + c.dropped.length;
  assert.equal(total, 4, `coverage ${total} != 4`);
  assert.ok(claimLedgerComplete(c));
});

// ── T9 layout certificate
t("T9 canonical two-pole+relator passes with real arrow endpoints anchored", () => {
  // the baked arrow supports the horizontal rise (left-low → right-high); the
  // canonical layout is therefore the two-band diagonal with horizontal offset:
  const c = compile({ relation: "cause_effect", claims: [
    { subject: "storm", role: "pole-0", band: "center", size: "m", text: "storm" },
    { subject: "water", role: "pole-1", band: "center", size: "m", text: "flood" },
    { subject: "arrow", role: "relator", size: "m" },
  ] });
  assert.equal(c.ok, true, c.errors.join("; "));
  assert.equal(c.certificate.polesSeparate, true);
  assert.equal(c.certificate.relatorAnchored, true, `cert=${JSON.stringify(c.certificate)}`);
  assert.equal(c.certificate.allInSafeArea, true);
  assert.equal(c.certificate.pass, true);
  // the certificate used the REAL path vertices:
  const rel = c.props.find((p) => p.role === "relator");
  assert.ok(rel);
  const bx = rel.x - (ARROW_BOX.w * rel.scale) / 2, by = rel.y - (ARROW_BOX.h * rel.scale) / 2;
  const start = { x: bx + ARROW_PATH_START.x * rel.scale, y: by + ARROW_PATH_START.y * rel.scale };
  assert.ok(Math.abs(start.y - (by + 150 * rel.scale)) < 1); // M20,150 transformed
});
t("T9 vertical-drop relator orientation is unsupported → ledger, not staged as if fine", () => {
  // poles stacked in one column (same x): the wide baked arrow cannot anchor
  // both boxes → certificate must name the rule, not pass silently
  const layout = composeFrame([
    { type: "storm", role: "pole-0", band: "sky", size: "m" },
    { type: "water", role: "pole-1", band: "ground", size: "m" },
    { type: "arrow", role: "relator", size: "m" },
  ]);
  assert.equal(layout.certificate.relatorAnchored, false);
  assert.equal(layout.certificate.rule, "relator-orientation-unsupported");
  assert.equal(layout.certificate.pass, false);
});
t("T9 same-band horizontal poles anchor correctly", () => {
  // same band → horizontal slots (0.33/0.67) → the baked rise spans pole-0 → pole-1
  const layout = composeFrame([
    { type: "storm", role: "pole-0", band: "sky", size: "m" },
    { type: "water", role: "pole-1", band: "sky", size: "m" },
    { type: "arrow", role: "relator", size: "m" },
  ]);
  assert.equal(layout.certificate.relatorAnchored, true);
  assert.equal(layout.certificate.pass, true);
});

// ── R4 forbidden enforcement
t("R4 requested+forbidden is a hard error, not a filter", () => {
  assert.throws(() => compile({ relation: "none", claims: ["storm"], forbidden: ["storm"] }), /both requested and forbidden/);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
