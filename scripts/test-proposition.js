#!/usr/bin/env node
/**
 * test-proposition.js — P9-B Proposition Authoring Contract (scripts/lib/proposition.js).
 *
 * Operator contract, verified end to end:
 *   • shape: relation + poles[] + asserted/rejected + evidence + visual; NO
 *     concept2 — poles and entities are plural; per-cast face/action/holds.
 *   • compiler = detect → brief requirement → verify (never writes a scene):
 *     detector-grade propositions are derived from the beat's own words and are
 *     NEVER sealed; only author-sealed ones stage and gate.
 *   • verify (config-only): both poles staged → twoSided; one pole → unstaged
 *     (REPORT — the P9-B flip is one line in GATE_POLICY); a REJECTED pole
 *     asserted as the scene's own assertion → poleViolation (DROPPED class).
 *   • idle wallpaper: single idle/talk actor + no icon/prop/diagram/strike.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`); }
}

const P = require("./lib/proposition.js");
const { evaluateAuthorship } = require("./lib/authorship.js");
const pl = require("./lib/proposition-loss.js");
const { CONCEPT_LEXICON } = require("./lib/antidote-director.js");
const SCENE_ICONS = CONCEPT_LEXICON.map(([c]) => c);
const { expression, charAction, handProp } = require("../src/engines/antidote/schema.ts");
const EXPRESSIONS = new Set(expression.options);
const ACTIONS = new Set(charAction.options);
const HOLDS = new Set(handProp.options);

// ── 1. SHAPE: closed enums, plural poles, no concept2 ────────────────────────
{
  const ok = P.normalizeProposition({
    relation: "contrast",
    poles: [
      { text: "the corner office", entity: "exec", status: "rejected" },
      { text: "the craft itself", entity: "maker", status: "asserted" },
      { text: "the audience", status: "asserted" },
    ],
    evidence: "not the corner office, but the craft itself",
    visual: {
      representation: "split",
      icon: "ladder",
      perCast: [
        { entity: "exec", face: "worried", action: "idle", holds: null },
        { entity: "maker", face: "happy", action: "write", holds: "book" },
      ],
    },
    src: "author",
  });
  assert("valid authored proposition normalizes", ok.ok && ok.prop.relation === "contrast" && ok.prop.poles.length === 3, JSON.stringify(ok.errors));
  assert("three poles survive (plural by design — no concept2)", ok.ok && ok.prop.poles.length === 3);
  assert("perCast keeps per-cast face/action/holds", ok.ok && ok.prop.visual.perCast.length === 2 && ok.prop.visual.perCast[1].action === "write" && ok.prop.visual.perCast[1].holds === "book");

  const noPoles = P.normalizeProposition({ relation: "contrast", poles: [], evidence: "x", src: "author" });
  assert("empty poles is an ERROR, never a silent fallback", !noPoles.ok && noPoles.errors.some((e) => e.includes("non-empty")));

  const badStatus = P.normalizeProposition({ relation: "contrast", poles: [{ text: "x", status: "maybe" }], evidence: "x", src: "author" });
  assert("pole status is closed (asserted|rejected)", !badStatus.ok);

  const badRep = P.normalizeProposition({ relation: "contrast", poles: [{ text: "x", status: "rejected" }, { text: "y", status: "asserted" }], evidence: "x", visual: { representation: "hologram" }, src: "author" });
  assert("representation is closed", !badRep.ok && badRep.errors.some((e) => e.includes("representation")));

  const noEvidence = P.normalizeProposition({ relation: "contrast", poles: [{ text: "x", status: "rejected" }, { text: "y", status: "asserted" }], visual: {}, src: "author" });
  assert("authored proposition requires evidence", !noEvidence.ok && noEvidence.errors.some((e) => e.includes("evidence")));

  const detectorNoEvidence = P.normalizeProposition({ relation: "contrast", poles: [{ text: "x", status: "rejected" }, { text: "y", status: "asserted" }], visual: {}, src: "detector" });
  assert("detector proposition needs no evidence", detectorNoEvidence.ok);

  assert("four poles is an error (max 3)", !P.normalizeProposition({ relation: "none", poles: [1, 2, 3, 4].map((i) => ({ text: `p${i}`, status: "asserted" })), evidence: "x", src: "author" }).ok);
}

// ── 2. DETECT: two-pole propositions from the beat's own words ──────────────
{
  const d1 = P.detectProposition("It is not about the money, but about the freedom it buys", []);
  assert("detect: not-X-but-Y → contrast with a rejected + an asserted pole", !!d1 && d1.relation === "contrast" && d1.poles[0].status === "rejected" && d1.poles[1].status === "asserted", JSON.stringify(d1));
  assert("detect: pole text is content words, marker words stripped", d1 && d1.poles[0].text === "money" && !d1.poles[1].text.startsWith("but"));

  const d2 = P.detectProposition("Everyone said the merger was a success, but in reality it was a slow failure", []);
  assert("detect: said_vs_real → pre-clause rejected, post-clause asserted", !!d2 && d2.relation === "said_vs_real" && d2.poles[0].status === "rejected" && d2.poles[1].status === "asserted", JSON.stringify(d2));

  const d3 = P.detectProposition("He stopped training because his knee gave out", []);
  assert("detect: because → cause_effect, both sides asserted", !!d3 && d3.relation === "cause_effect" && d3.poles.every((p) => p.status === "asserted") && d3.poles.length === 2);

  const d4 = P.detectProposition("The promise of the fast track is an illusion sold to the exhausted", []);
  // P9-B.2b (gold-set evidence, itw #59 strict FP + #64 borderline): a lie/illusion
  // VERDICT clause is the beat's own assertion, not a refuted claim — the old
  // "rejected pole exists" intuition produced false positives in production.
  assert("detect: illusion/lie verdict clause → null (the beat's own assertion, gold #59/#64)", d4 === null, JSON.stringify(d4));

  const castIndex = [{ key: "coach", tokens: new Set(["coach"]) }, { key: "fear", tokens: new Set(["fear"]) }];
  const d5 = P.detectProposition("It is not the coach that fails the team, but the fear of failure", { castIndex });
  assert("detect: entity poles map to the bible's cast keys", !!d5 && d5.poles.some((p) => p.entity === "coach") && d5.poles.some((p) => p.entity === "fear"), JSON.stringify(d5));
  const d5b = P.detectProposition("It is not the coach that fails the team, but the fear of failure", { castIndex: [["coach", new Set(["coach"])], ["fear", new Set(["fear"])]] });
  assert("detect: castIndex accepts the [key, tokens] form too", !!d5b && d5b.poles.some((p) => p.entity === "coach"), JSON.stringify(d5b));

  assert("detect: plain narration → null (a topic is not a proposition)", P.detectProposition("He walked along the shore and watched the birds", []) === null);

  const sealDet = P.sealFor(d1);
  assert("detect: detector-grade propositions are NEVER sealed (the gate judges author-given meaning)", sealDet === null);
}

// ── 3. VERIFY: stagedPoles on planned scenes (config-only) ───────────────────
{
  const prop = (over = {}) => P.normalizeProposition({
    relation: "contrast",
    poles: [{ text: "the corner office", status: "rejected" }, { text: "the craft", status: "asserted" }],
    evidence: "marker",
    visual: { representation: "split", icon: null, perCast: [] },
    src: "author", ...over,
  }).prop;

  const v1 = P.stagedPoles({ shot: "split", characters: [], props: [{ type: "ladder" }, { type: "book" }] }, prop());
  assert("verify: split + two pole props → twoSided", v1.twoSided && !v1.unstaged && !v1.poleViolation, JSON.stringify(v1));

  const v2 = P.stagedPoles({ shot: "medium", characters: [{ identity: "maker", action: "talk" }], props: [] }, prop());
  assert("verify: one idle actor + nothing else → unstaged AND idleWallpaper", v2.unstaged && v2.idleWallpaper, JSON.stringify(v2));

  const v3 = P.stagedPoles(
    { shot: "medium", characters: [{ identity: "x", action: "talk" }], props: [], texts: [{ text: "THE CORNER OFFICE", style: "plain" }] },
    prop()
  );
  assert("verify: REJECTED pole as the plain big text → poleViolation", v3.poleViolation, JSON.stringify(v3.verdicts));

  const v4 = P.stagedPoles(
    { shot: "medium", characters: [{ identity: "x", action: "talk" }], props: [], texts: [{ text: "the corner office", style: "strike" }] },
    prop()
  );
  assert("verify: rejected pole STRUCK is the honest rejection (no violation)", !v4.poleViolation && v4.verdicts.some((x) => x.state === "struck"), JSON.stringify(v4.verdicts));

  // the author's pole→icon mapping is EXACT (pole text === icon name): the
  // machine never guesses which pole an icon belongs to
  const v5 = P.stagedPoles({ shot: "split", characters: [], props: [{ type: "ladder" }] }, prop({ poles: [{ text: "ladder", status: "rejected" }, { text: "craft", status: "asserted" }], visual: { representation: "split", icon: "ladder", perCast: [] } }));
  assert("verify: the author's pole→icon mapping anchors exactly its own pole", v5.twoSided, JSON.stringify(v5));

  const v6 = P.stagedPoles(
    { shot: "twoShot", characters: [{ identity: "exec", expression: "worried", action: "idle" }, { identity: "maker", expression: "happy", action: "write" }], props: [] },
    prop({ poles: [{ text: null, entity: "exec", status: "rejected" }, { text: null, entity: "maker", status: "asserted" }] })
  );
  assert("verify: per-cast ENTITY poles anchor on staged identities", v6.twoSided, JSON.stringify(v6.verdicts));

  // P9-B.2c: the stager-authored flow diagram carries BOTH poles — its labels
  // are the pole texts themselves (stageProposition writes them), so it
  // self-evidences without needing a representation binding.
  const v7 = P.stagedPoles(
    { shot: "insert", characters: [], props: [{ type: "flow" }], diagram: { type: "flow", labels: ["the corner office", "the craft"], authored: true } },
    prop({ visual: { representation: "flow", icon: null, perCast: [] } })
  );
  assert("verify: authored flow diagram with pole-text labels carries the poles", v7.twoSided, JSON.stringify(v7));

  // P9-B.2c pins (operator, 2026-10-08 — Semantic Verifier Hardening): the old
  // `else if (composition) v = "staged"` shortcut proved only that the
  // renderer DRAWS two areas — not that they carry THIS proposition.
  const v8 = P.stagedPoles(
    { shot: "split", characters: [{ identity: "a", action: "idle" }, { identity: "b", action: "idle" }], props: [] },
    prop({ visual: { representation: null, icon: null, perCast: [] } })
  );
  assert("verify (P9-B.2c): split WITHOUT a representation binding → unstaged (two unrelated areas ≠ pole evidence)", v8.unstaged && !v8.twoSided, JSON.stringify(v8));

  const v9 = P.stagedPoles(
    { shot: "insert", characters: [], props: [{ type: "flow" }], diagram: { type: "flow" } },
    prop({ visual: { representation: "flow", icon: null, perCast: [] } })
  );
  assert("verify (P9-B.2c): bare flow diagram, no labels/authored stamp → unstaged (an unrelated diagram carries nothing)", v9.unstaged, JSON.stringify(v9));

  const v10 = P.stagedPoles(
    { shot: "insert", characters: [], props: [{ type: "flow" }], diagram: { type: "flow", labels: ["the corner office", "the craft"] } },
    prop({ visual: { representation: null, icon: null, perCast: [] } })
  );
  assert("verify (P9-B.2c): diagram labels stating both poles verbatim → twoSided even without a representation binding", v10.twoSided, JSON.stringify(v10));

  // P9-B.2c pilot lesson: a VOX-shaped beat (into-the-wild) carries props as an
  // OBJECT payload, not an array — the judge must return verdicts, never crash
  // on the foreign shape.
  const v11 = P.stagedPoles(
    { id: "beat-043", type: "imagefocus", characters: [], props: { text: "narration payload object" }, images: [] },
    prop({ visual: { representation: "split", icon: null, perCast: [] } })
  );
  assert("verify (P9-B.2c): vox-shaped beat (props object) judges without crashing → unstaged", Array.isArray(v11.verdicts) && v11.unstaged, JSON.stringify(v11));
}

// ── 4. STAGE: only author-sealed propositions stage; renderer levers only ────
{
  const seal = {
    relation: "contrast",
    poles: [{ text: "the corner office", entity: "exec", status: "rejected" }, { text: "the craft", entity: "maker", status: "asserted" }],
    representation: "split", icon: null,
    perCast: [{ entity: "exec", face: "worried", action: "idle", holds: null }, { entity: "maker", face: "happy", action: "reach", holds: "book" }],
  };
  const scene = { shot: "medium", characters: [{ identity: "exec", expression: "neutral", action: "talk" }, { identity: "maker", expression: "neutral", action: "idle" }], props: [] };
  const r = P.stageProposition(seal, scene, { expressionEnum: EXPRESSIONS, actionEnum: ACTIONS, holdsEnum: HOLDS, sceneIcons: SCENE_ICONS });
  assert("stage: representation shot applied (medium → split)", scene.shot === "split" && r.staged.some((x) => x.lever === "shot"), JSON.stringify(r));
  assert("stage: per-cast face applied to the RIGHT cast member", scene.characters[0].expression === "worried" && scene.characters[1].expression === "happy");
  assert("stage: per-cast action applied", scene.characters[1].action === "reach");

  const badFace = P.stageProposition({ ...seal, perCast: [{ entity: "exec", face: "smoldering", action: null, holds: null }] }, { shot: "split", characters: [{ identity: "exec" }] }, { expressionEnum: EXPRESSIONS, actionEnum: ACTIONS, holdsEnum: HOLDS, sceneIcons: SCENE_ICONS });
  assert("stage: enum-invalid face is SKIPPED and recorded, never applied", badFace.skipped.some((x) => x.lever === "perCast[0].face") , JSON.stringify(badFace));

  const iconScene = { shot: "split", characters: [], props: [] };
  const iconSeal = { relation: "contrast", poles: [], representation: null, icon: "ladder", perCast: [] };
  P.stageProposition(iconSeal, iconScene, { expressionEnum: EXPRESSIONS, actionEnum: ACTIONS, holdsEnum: HOLDS, sceneIcons: SCENE_ICONS });
  assert("stage: authored pole icon lands as scene.concept on an empty frame", iconScene.concept === "ladder");
  // P9-B.2a pixel smoke found scene.concept alone is telemetry (the renderer never
  // reads it) — the empty-frame lever must ALSO stage a DRAWN prop the renderer paints.
  assert("stage: the pole icon also stages a DRAWN prop (concept alone drew nothing)",
    Array.isArray(iconScene.props) && iconScene.props.some((p) => p && p.type === "ladder"), JSON.stringify(iconScene.props));

  const heldScene = { shot: "split", characters: [{ identity: "maker", action: "write" }], props: [] };
  P.stageProposition({ ...iconSeal, icon: "coin" }, heldScene, { expressionEnum: EXPRESSIONS, actionEnum: ACTIONS, holdsEnum: HOLDS, sceneIcons: SCENE_ICONS });
  assert("stage: pole object goes into the staged hand when cast is present", heldScene.characters[0].holds === "coin");

  const foreignIcon = P.stageProposition({ ...iconSeal, icon: "hologram" }, { shot: "split", characters: [], props: [] }, { expressionEnum: EXPRESSIONS, actionEnum: ACTIONS, holdsEnum: HOLDS, sceneIcons: SCENE_ICONS });
  assert("stage: an icon outside the world vocabulary is refused (A3 alignment)", foreignIcon.skipped.some((x) => x.lever === "icon"), JSON.stringify(foreignIcon.skipped));

  const flowScene = { shot: "medium", characters: [], props: [] };
  P.stageProposition({ relation: "cause_effect", poles: [{ text: "debt", status: "asserted" }, { text: "silence", status: "asserted" }], representation: "flow", icon: null, perCast: [] }, flowScene, {});
  assert("stage: flow representation writes an AUTHORED flow diagram", flowScene.diagram && flowScene.diagram.type === "flow" && flowScene.diagram.authored === true && flowScene.diagram.labels.includes("debt"));

  const equiv = P.stageProposition({ relation: "equivalence", poles: [{ text: "a", status: "asserted" }, { text: "b", status: "asserted" }], representation: "equivalence", icon: null, perCast: [] }, { shot: "medium", characters: [], props: [] }, {});
  assert("stage: equivalence has no dedicated shot — recorded skip, no invention", equiv.skipped.length > 0 && equiv.staged.length === 0, JSON.stringify(equiv));

  assert("stage: null/foreign seal is a no-op (detector-grade never stages)", P.stageProposition(null, { shot: "medium", characters: [], props: [] }).staged.length === 0);
}

// ── 5. SEAL → GATE: the operator's P9-A.1-style fixtures, two-poled ──────────
{
  const baseScene = () => ({
    id: "scene-09", fromFrame: 0, durationFrames: 240, shot: "medium",
    _narration: "it was never the corner office, but the craft itself",
    _authorship: { src: "brief", propTypes: [], diagramAuthored: false, conceptAuthored: null },
    characters: [{ id: "c0", rig: "everyman", identity: "maker", expression: "neutral", action: "talk" }],
    props: [], texts: [],
  });

  // (a) authored two-pole proposition, BOTH poles staged → PASS.
  // P9-B.2c: the authored decision must BIND its composition — the seal
  // carries representation:"split" and the scene renders exactly that shot
  // (mirrors sealFor + stageProposition in production).
  const both = baseScene();
  both._authorship.propositionAuthored = { relation: "contrast", poles: [{ text: "corner office", entity: null, status: "rejected" }, { text: "craft", entity: null, status: "asserted" }], representation: "split", icon: null, perCast: [] };
  both._authorship.propTypes = ["ladder", "book"];
  both.shot = "split"; both.props = [{ type: "ladder" }, { type: "book" }];
  const g1 = evaluateAuthorship({ scenes: [both] }, { engine: "antidote" });
  assert("gate: both poles staged → PASS, no proposition finding", g1.status === "PASS" && !g1.violations.some((v) => v.code.startsWith("PROPOSITION_")), JSON.stringify(g1.violations));
  assert("gate: metrics report the authored proposition", g1.metrics && g1.metrics.authoredPropositions === 1);

  // (a2) P9-B.2c pin: the SAME scene without a bound representation is the
  // fake success the operator flagged — the renderer draws two areas that say
  // nothing about the poles. Composition alone is not evidence → DROPPED.
  const fake = baseScene();
  fake._authorship.propositionAuthored = { relation: "contrast", poles: [{ text: "corner office", entity: null, status: "rejected" }, { text: "craft", entity: null, status: "asserted" }], representation: null, icon: null, perCast: [] };
  fake._authorship.propTypes = ["ladder", "book"];
  fake.shot = "split"; fake.props = [{ type: "ladder" }, { type: "book" }];
  const g1b = evaluateAuthorship({ scenes: [fake] }, { engine: "antidote" });
  assert("gate (P9-B.2c): split + two props WITHOUT a bound representation → PROPOSITION_DROPPED", g1b.status === "FAIL" && g1b.violations.some((v) => v.code === "PROPOSITION_DROPPED"), JSON.stringify(g1b.violations.map((v) => v.code)));

  // (b) one pole staged only → PROPOSITION_DROPPED (HARD). P9-B.2b (operator,
  // 2026-10-07): an AUTHOR-SEALED unstaged proposition is lost author meaning —
  // the sealed contract hardened after the detector proved strict precision
  // ≥80% on the frozen gold-set. Detector-only claims are never sealed
  // (sealFor returns null for src:"detector") and PROPOSITION_UNSTAGED stays
  // the REPORT code for future detector-only observations.
  const one = baseScene();
  one._authorship.propositionAuthored = { relation: "contrast", poles: [{ text: "corner office", entity: null, status: "rejected" }, { text: "craft", entity: null, status: "asserted" }], representation: null, icon: null, perCast: [] };
  one._authorship.propTypes = ["book"];
  one.props = [{ type: "book" }];
  const g2 = evaluateAuthorship({ scenes: [one] }, { engine: "antidote" });
  const unstagedDrop = g2.violations.find((v) => v.code === "PROPOSITION_DROPPED" && /one pole/.test(v.message));
  assert("gate: author-sealed unstaged → PROPOSITION_DROPPED (HARD, P9-B.2b)", !!unstagedDrop, JSON.stringify(g2.violations.map((v) => v.code)));
  assert("gate: author-sealed unstaged FAILS the gate; PROPOSITION_UNSTAGED itself stays REPORT", g2.status === "FAIL" && pl.severityFor("PROPOSITION_UNSTAGED") === "REPORT");

  // (c) rejected pole asserted as the scene's plain big text → DROPPED-class FAIL
  const violated = baseScene();
  violated._authorship.propositionAuthored = { relation: "contrast", poles: [{ text: "corner office", entity: null, status: "rejected" }, { text: "craft", entity: null, status: "asserted" }], representation: null, icon: null, perCast: [] };
  violated.texts = [{ text: "THE CORNER OFFICE", style: "plain" }];
  const g3 = evaluateAuthorship({ scenes: [violated] }, { engine: "antidote" });
  const dropped = g3.violations.find((v) => v.code === "PROPOSITION_DROPPED");
  assert("gate: rejected pole asserted → PROPOSITION_DROPPED + FAIL", !!dropped && g3.status === "FAIL", JSON.stringify(g3.violations.map((v) => v.code)));
  assert("gate: DROPPED is HARD in GATE_POLICY", pl.severityFor("PROPOSITION_DROPPED") === "HARD");

  // (d) detector-grade proposition on the scene does NOT gate (author-only)
  const det = baseScene();
  det._propositionDetected = { relation: "contrast", poles: [{ text: "x", status: "rejected" }, { text: "y", status: "asserted" }] };
  const g4 = evaluateAuthorship({ scenes: [det] }, { engine: "antidote" });
  assert("gate: detector-grade proposition is invisible to the gate", g4.status === "PASS" && !g4.violations.some((v) => v.code.startsWith("PROPOSITION_")));

  // (e) idle wallpaper metric: counted, never a violation by itself
  const wall = baseScene();
  const g5 = evaluateAuthorship({ scenes: [wall] }, { engine: "antidote" });
  assert("gate: idle wallpaper counted in metrics (1 single idle/talk actor)", g5.metrics && g5.metrics.idleWallpaper === 1, JSON.stringify(g5.metrics));

  // (f) the one-line P9-B flip: UNSTAGED → HARD fails the build (pinned contract)
  const before = pl.GATE_POLICY.UNSTAGED;
  pl.GATE_POLICY.UNSTAGED = "HARD";
  const g6 = evaluateAuthorship({ scenes: [one] }, { engine: "antidote" });
  pl.GATE_POLICY.UNSTAGED = before;
  assert("gate: flipping GATE_POLICY.UNSTAGED to HARD makes the same scene FAIL (one-line flip)", g6.status === "FAIL");
}

// ── 6. sealFor round-trip through a config (compact JSON, config-only) ──────
{
  const authored = P.normalizeProposition({
    relation: "contrast",
    poles: [{ text: "the corner office", status: "rejected" }, { text: "the craft", status: "asserted" }],
    evidence: "marker \"but\"",
    visual: { representation: "split", icon: "ladder", perCast: [{ entity: "maker", face: "happy", action: "write", holds: "book" }] },
    src: "author",
  }).prop;
  const seal = P.sealFor(authored);
  const json = JSON.parse(JSON.stringify(seal));
  const scene = { shot: "split", characters: [{ identity: "maker", expression: "neutral", action: "idle" }], props: [], texts: [{ text: "the corner office", style: "strike" }] };
  P.stageProposition(json, scene, { expressionEnum: EXPRESSIONS, actionEnum: ACTIONS, holdsEnum: HOLDS, sceneIcons: SCENE_ICONS });
  const v = P.stagedPoles(scene, { relation: json.relation, poles: json.poles, evidence: null, visual: { representation: json.representation, icon: json.icon, perCast: json.perCast }, src: "author" });
  assert("seal round-trip: JSON-only seal stages + verifies (config-only gate holds)", v.twoSided, JSON.stringify({ scene, v }));
}

// ── 7. the source lib imports the ONE semantic implementation ───────────────
{
  const src = fs.readFileSync(path.join(__dirname, "lib", "proposition.js"), "utf8");
  assert("proposition.js reuses vox-semantic (one negation-scope implementation)", src.includes('require("./vox-semantic.cjs")'));
  const self = fs.readFileSync(__filename, "utf8");
  assert("tests pin the contract constants (no re-derivation drift)", self.includes("no concept2") && self.includes("PROPOSITION_UNSTAGED stays"));
}

console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
if (failed) process.exit(1);
