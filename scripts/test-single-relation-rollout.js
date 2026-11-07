#!/usr/bin/env node
// test-single-relation-rollout.js — operator-approved selective rollout (cycle 17): eligibility, A/B selection, the
// sealed apply (authorship gate + make-book restore keep it), status after a rebuild, revert. Temp dirs, < 1 s.
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const R = require("./lib/single-relation");
const RO = require("./single-relation-rollout");
const { evaluateAuthorship, restoreAuthoredStaging } = require("./lib/authorship");

let fail = 0;
const ok = (name, fn) => { try { fn(); console.log(`✓ ${name}`); } catch (e) { fail++; console.log(`✗ ${name}\n    ${e.message}`); } };
const W = (p, j) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof j === "string" ? j : JSON.stringify(j, null, 1)); };

const narration = "Every notification pulls you out of deep work, so by noon your focus is drained and the hard project never gets touched.";
const contract = {
  schema: R.SCHEMA, type: "B", mechanism: "depletion", _author: "test",
  understanding: "Each notification takes focus until none is left.",
  evidence: "Every notification pulls you out of deep work, so by noon your focus is drained",
  claim: { asserted: "Notifications drain your focus.", polarity: "asserted", speaker: "narrator", notAsserted: [] },
  before: "a full focus tank beside the phone", transformation: "each ping drains the tank", after: "the tank is empty",
  camera: { framing: "wide-locked", purpose: "phone and tank in one frame" },
  entities: [{ id: "phone", kind: "object", glyph: "smartphone", label: "notification" }, { id: "focus", kind: "stock", label: "focus", value: 1 }],
  events: [{ at: 0.3, cause: "phone", effects: [{ entity: "focus", value: 0.1 }], repeat: 3 }],
  required: ["the phone", "the focus level falling"], omitted: ["noon", "the hard project"],
};
const lockA = { planShot: "medium", shot: "medium", set: "office", cast: ["you"], expression: "worried", action: "idle", concept: null, propTypes: [], artTexts: [{ text: "FOCUS" }] };
const sceneA = (id, from) => ({ id, fromFrame: from, durationFrames: 240, shot: "medium", bg: { kind: "office", set: "office" }, transition: { type: "cut", frames: 0 },
  characters: [{ identity: "you", role: "you", expression: "worried", action: "idle" }], texts: [{ text: "FOCUS" }], props: [], hud: { insight: 2, of: 8 },
  _narration: narration, _authorship: { src: "art", lock: { ...lockA } },
  visualContract: { characterIntent: [{ identity: "you", role: "you", action: "idle", gaze: "viewer", state: "worried" }], visualEvidence: { subjects: [], relations: [], states: [], representation: { kind: "fallback", lever: "medium" } } } });
const config = () => ({ meta: { slug: "zz-book", cast: { you: { name: "You" } } }, captions: [{ text: narration, startFrame: 0, endFrame: 1000 }], scenes: [sceneA("scene-0", 0), sceneA("scene-1", 240), sceneA("scene-2", 480)] });

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sr-rollout-"));
const B = path.join(root, "books", "zz-book");
W(path.join(B, "book.json"), { engine: "antidote" });
W(path.join(B, "production-base.json"), { productionBase: "c".repeat(40) });
W(path.join(B, "config.antidote.json"), config());
const gitOk = () => "", gitNo = () => { throw new Error("not ancestor"); };

ok("eligible: new Antidote book, pin contains the renderer, nothing rendered", () => assert.strictEqual(RO.eligibility(root, "zz-book", { git: gitOk }).ok, true));
ok("refused: a pin without the renderer (never repin for this)", () => { const e = RO.eligibility(root, "zz-book", { git: gitNo }); assert(!e.ok && e.reasons.some((r) => /does not contain 0296a84d/.test(r)), JSON.stringify(e)); });
ok("refused: a production render started", () => { W(path.join(root, ".render-github-split.zz-book.json"), {}); const e = RO.eligibility(root, "zz-book", { git: gitOk }); fs.rmSync(path.join(root, ".render-github-split.zz-book.json")); assert(!e.ok && e.reasons.some((r) => /production render started/.test(r)), JSON.stringify(e)); });
ok("refused: a Vox book", () => { W(path.join(B, "book.json"), { engine: "vox" }); const e = RO.eligibility(root, "zz-book", { git: gitOk }); W(path.join(B, "book.json"), { engine: "antidote" }); assert(!e.ok && e.reasons.some((r) => /Antidote only/.test(r))); });
ok("refused: no pin", () => { fs.renameSync(path.join(B, "production-base.json"), path.join(B, "pb.bak")); const e = RO.eligibility(root, "zz-book", { git: gitOk }); fs.renameSync(path.join(B, "pb.bak"), path.join(B, "production-base.json")); assert(!e.ok && e.reasons.some((r) => /no engine pin/.test(r))); });

const C = path.join(root, "contracts");
W(path.join(C, "contracts", "1.json"), contract); W(path.join(C, "contracts", "2.json"), contract);
W(path.join(C, "contracts.json"), { valid: [1, 2], invalid: [0], contracts: { 0: { valid: false }, 1: { valid: true, review: { verdict: "OK" } }, 2: { valid: true, review: { verdict: "OK" } } } });
ok("select: B only where the A/B shows B > A with no added wrong inference / polarity / wrong cause", () => {
  const s = RO.select(C, { rows: [{ sceneIndex: 0, A: 0, B: 90 }, { sceneIndex: 1, A: 10, B: 80, wiA: 0, wiB: 0 }, { sceneIndex: 2, A: 50, B: 50 }] });
  assert.deepStrictEqual(s.chosen.map((c) => c.sceneIndex), [1]);
  assert.deepStrictEqual(s.kept.map((k) => [k.sceneIndex, k.why.split(":")[0]]), [[0, "contract invalid"], [2, "A/B"]]);
});
ok("select: more wrong inferences or any polarity / wrong cause with B keeps A", () => {
  const s = RO.select(C, { rows: [{ sceneIndex: 1, A: 10, B: 80, wiA: 0, wiB: 1 }, { sceneIndex: 2, A: 10, B: 80, polB: 1 }] });
  assert.strictEqual(s.chosen.length, 0); assert(s.kept.filter((k) => k.sceneIndex > 0).every((k) => /wrong inference|polarity/.test(k.why)), JSON.stringify(s.kept));
});
ok("select: over the per-book cap the largest gains go first", () => {
  const s = RO.select(C, { rows: [{ sceneIndex: 1, A: 10, B: 40 }, { sceneIndex: 2, A: 0, B: 90 }] }, { maxScenes: 1 });
  assert.deepStrictEqual(s.chosen.map((c) => c.sceneIndex), [2]); assert(s.kept.some((k) => k.sceneIndex === 1 && /cap 1/.test(k.why)));
});

const sel = RO.select(C, { rows: [{ sceneIndex: 1, A: 10, B: 80 }] });
const before = config();
const p = RO.plan(before, sel, { now: "t" });
ok("plan: the selected scene becomes single-relation, meta.singleRelation on, others untouched", () => {
  assert(p.ok, JSON.stringify(p.errors)); assert(p.config.scenes[1].singleRelation); assert.strictEqual(p.config.meta.singleRelation, true);
  assert.deepStrictEqual(p.config.scenes[0], before.scenes[0]); assert.deepStrictEqual(p.config.scenes[2], before.scenes[2]);
});
ok("plan: the authorship gate passes (sealed as the beat's authored decision, stamp kept)", () => {
  const a0 = evaluateAuthorship(before, { engine: "antidote", slug: "zz-book" }), a1 = evaluateAuthorship(p.config, { engine: "antidote", slug: "zz-book" });
  const at1 = (a1.violations || []).filter((v) => v.sceneId === "scene-1" || !v.sceneId);
  const at0 = (a0.violations || []).filter((v) => v.sceneId === "scene-1" || !v.sceneId);
  assert.strictEqual(at1.length, at0.length, JSON.stringify(at1.map((v) => v.code + " " + v.message)));
  const L = p.config.scenes[1]._authorship.lock;
  assert.strictEqual(L.singleRelation.mechanism, "depletion"); assert.deepStrictEqual(p.config.scenes[1]._authorship.previousLock, lockA);
});
ok("plan: make-book's restoreAuthoredStaging keeps the sealed scene", () => { const c = JSON.parse(JSON.stringify(p.config)); const snap = JSON.stringify(c.scenes[1]); restoreAuthoredStaging(c); assert.strictEqual(JSON.stringify(c.scenes[1]), snap); });
ok("plan: the planner's visual contract is rebound to what is on screen (old representation kept as previous)", () => {
  const vc = p.config.scenes[1].visualContract;
  assert.deepStrictEqual(vc.characterIntent, []); assert(!vc.visualEvidence.representation); assert.strictEqual(vc.visualEvidence.previousRepresentation.kind, "fallback");
});
ok("plan: the record keeps the previous scene, a diff and the A/B", () => {
  const s = p.record.scenes[0];
  assert.strictEqual(s.sceneIndex, 1); assert.deepStrictEqual(s.previous, before.scenes[1]); assert.deepStrictEqual(s.ab, { A: 10, B: 80, wiA: 0, wiB: 0 }); assert(/medium→/.test(s.diff.shot));
});
ok("plan: an invalid contract refuses everything (nothing to write)", () => {
  W(path.join(C, "contracts", "9.json"), { ...contract, evidence: "a sentence the narration never says at all" });
  const bad = RO.plan(before, { chosen: [{ sceneIndex: 1, contract: path.join(C, "contracts", "9.json"), ab: {} }], kept: [] });
  assert.strictEqual(bad.ok, false);
});
ok("plan: more than the per-book cap is refused", () => {
  const many = { chosen: Array.from({ length: RO.POLICY.perBook.maxScenes + 1 }, (_, k) => ({ sceneIndex: k, contract: "x" })), kept: [] };
  assert.strictEqual(RO.plan(before, many).ok, false);
});
ok("status: ACTIVE after apply, MISSING after a config rebuild, NONE without a record", () => {
  assert.strictEqual(RO.status(p.config, p.record).state, "ACTIVE");
  const st = RO.status(before, p.record); assert.strictEqual(st.state, "MISSING"); assert.deepStrictEqual(st.missing, [1]);
  assert.strictEqual(RO.status(before, null).state, "NONE");
});
ok("revert: the previous scene comes back, meta.singleRelation off when none is left", () => {
  const r = RO.revert(p.config, p.record);
  assert.deepStrictEqual(r.config.scenes[1], before.scenes[1]); assert.strictEqual(r.config.meta.singleRelation, undefined); assert.deepStrictEqual(r.record.reverted, [1]);
  assert.strictEqual(RO.status(r.config, r.record).state, "NONE");
});
ok("policy: global default stays off; render / upload / publish / cleanup / repin / Flux are not covered", () => {
  assert.strictEqual(RO.POLICY.scope.globalDefault, false);
  for (const x of ["full production render", "upload", "publish", "cleanup", "repin", "paid Flux calls"]) assert(RO.POLICY.notCovered.includes(x), x);
});
// make-book step 1.885: reapply --pipeline (CLI): no record = no-op; a rebuilt A config gets its B back; idempotent
{
  const { spawnSync } = require("child_process");
  const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, "single-relation-rollout.js"), "reapply", "--slug=zz-book", `--book-root=${root}`, "--write", "--pipeline", ...a], { encoding: "utf8" });
  const SRD = path.join(B, "single-relation");
  ok("reapply --pipeline without a record: nothing to do (exit 0)", () => { const r = run(); assert.strictEqual(r.status, 0, r.stderr); assert(/nothing to re-apply/.test(r.stdout)); });
  W(path.join(SRD, "active-contracts", "1.json"), contract);
  W(path.join(SRD, "active.json"), p.record);
  const recBytes = fs.readFileSync(path.join(SRD, "active.json"), "utf8");
  ok("reapply --pipeline on a freshly planned (A) config puts the recorded B scene back, record untouched", () => {
    const r = run(); assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    const c = JSON.parse(fs.readFileSync(path.join(B, "config.antidote.json"), "utf8"));
    assert(c.scenes[1].singleRelation && c.meta.singleRelation === true); assert.strictEqual(RO.status(c, p.record).state, "ACTIVE");
    assert.strictEqual(fs.readFileSync(path.join(SRD, "active.json"), "utf8"), recBytes);
  });
  ok("reapply --pipeline again: already in the config, unchanged", () => {
    const before2 = fs.readFileSync(path.join(B, "config.antidote.json"), "utf8"); const r = run();
    assert.strictEqual(r.status, 0); assert(/already in the config/.test(r.stdout)); assert.strictEqual(fs.readFileSync(path.join(B, "config.antidote.json"), "utf8"), before2);
  });
  ok("reapply --pipeline refuses when the scene's narration changed since the apply", () => {
    const c = config(); c.scenes[1]._narration = "something else entirely"; W(path.join(B, "config.antidote.json"), c);
    const r = run(); assert.strictEqual(r.status, 1); assert(/narration of scene\(s\) 1 changed/.test(r.stderr), r.stderr);
  });
}
ok("decide --none: fine with 0 candidates; with candidates every one needs an author decision with a reason (cycle 18)", () => {
  const d = path.join(root, "nc"); fs.mkdirSync(d, { recursive: true });
  assert.strictEqual(RO.noneCoverage(d).ok, false);
  W(path.join(d, "candidates.json"), { candidates: [] }); assert.strictEqual(RO.noneCoverage(d).ok, true);
  W(path.join(d, "candidates.json"), { candidates: [{ sceneIndex: 4 }, { sceneIndex: 9 }] });
  assert(/no author decision with a reason for 2/.test(RO.noneCoverage(d).why));
  W(path.join(d, "author-decisions.json"), [{ sceneIndex: 4, decision: "skipped", why: "inner state only" }, { sceneIndex: 9, decision: "skipped", why: "" }]);
  assert(/for 1 \(9\)/.test(RO.noneCoverage(d).why), RO.noneCoverage(d).why);
  W(path.join(d, "author-decisions.json"), [{ sceneIndex: 4, decision: "skipped", why: "inner state only" }, { sceneIndex: 9, decision: "contract", why: "drawable" }]);
  assert(/never validated/.test(RO.noneCoverage(d).why));
  W(path.join(d, "contracts.json"), { valid: [], invalid: [9] }); assert.strictEqual(RO.noneCoverage(d).ok, true);
});
fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? `\n${fail} rollout check(s) FAILED` : "\nall single-relation rollout checks passed");
process.exit(fail ? 1 : 0);
