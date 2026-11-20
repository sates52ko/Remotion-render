#!/usr/bin/env node
// Tests for scripts/lib/render-preflight.js: decision logic, dispatch retry classes, worker compatibility,
// config-version binding, the three-facts record, and the technical verifier's failure paths.
// No Remotion, no network, no GitHub. Exit 1 on any failure.
const fs = require("fs");
const os = require("os");
const path = require("path");
const pre = require("./lib/render-preflight");
const { MODE, evaluate, classifyDispatchCode, workerCompat, configHash, findingKey, verifyRenderOutput, recordDecision, appendFacts, factsFile } = pre;

let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${extra}` : ""}`); if (!ok) fail++; };

const rev = (msg) => ({ reasonCode: "FALLBACK_LEVER", message: msg, outcome: "REVIEW" });
const blk = (msg) => ({ reasonCode: "SUBJECT_MISMATCH", message: msg, outcome: "BLOCK" });
const fw = (violations) => {
  const keys = violations.map((v) => ({ key: findingKey(v), reasonCode: v.reasonCode, message: v.message, outcome: v.outcome }));
  return { status: "FAIL", blocks: keys.filter((k) => k.outcome === "BLOCK").length, reviews: keys.filter((k) => k.outcome !== "BLOCK").length, keys };
};
const dec = (hash, violations) => ({ configHash: hash, keys: violations.map((v) => ({ key: findingKey(v), reasonCode: v.reasonCode, message: v.message })) });

const r1 = rev("shot A"), r2 = rev("shot B"), r3 = rev("shot C");

// 1. Quality facts
t("firewall PASS in production -> PASS, no decision needed", evaluate({ mode: MODE.PRODUCTION, firewall: fw([]), hash: "h1" }).decision === "PASS");
t("no firewall (vox) -> NOT_APPLICABLE and GO", evaluate({ mode: MODE.PRODUCTION, firewall: null, hash: "h1" }).ok === true);

// 2. REVIEW without a decision: production refuses, asks for the decision
const noDec = evaluate({ mode: MODE.PRODUCTION, firewall: fw([r1, r2]), hash: "h1", decisions: [] });
t("REVIEW with no decision -> production REFUSED, needsAccept", !noDec.ok && noDec.needsAccept && noDec.decision === "REFUSED");

// 3. Accepted debt on the same config: not asked again
const accepted = evaluate({ mode: MODE.PRODUCTION, firewall: fw([r1, r2]), hash: "h1", decisions: [dec("h1", [r1, r2])] });
t("same config + same REVIEW findings -> ACCEPTED_DEBT, GO", accepted.ok && accepted.decision === "ACCEPTED_DEBT" && accepted.covered.length === 2);

// 4. Config changed: the decision does not carry over silently; diff is reported
const changed = evaluate({ mode: MODE.PRODUCTION, firewall: fw([r1, r2, r3]), hash: "h2", decisions: [dec("h1", [r1, r2])] });
t("changed config -> REFUSED, shows covered/new", !changed.ok && changed.covered.length === 2 && changed.newKeys.length === 1 && changed.removedKeys.length === 0);
const gone = evaluate({ mode: MODE.PRODUCTION, firewall: fw([r1]), hash: "h2", decisions: [dec("h1", [r1, r2])] });
t("changed config, a finding gone -> reported as removed", gone.removedKeys.length === 1 && gone.covered.length === 1);

// 5. Same config, decision covers fewer findings than now: must ask again
const partial = evaluate({ mode: MODE.PRODUCTION, firewall: fw([r1, r2, r3]), hash: "h1", decisions: [dec("h1", [r1, r2])] });
t("same config, one new REVIEW finding -> REFUSED (not silently accepted)", !partial.ok && partial.newKeys.length === 1);

// 6. BLOCK is never accepted, in either mode
const blockProd = evaluate({ mode: MODE.PRODUCTION, firewall: fw([blk("bad"), r1]), hash: "h1", decisions: [dec("h1", [blk("bad"), r1])] });
t("BLOCK + accepted decision -> still REFUSED in production", !blockProd.ok && blockProd.needsAccept !== true);
const blockPrev = evaluate({ mode: MODE.PREVIEW_ONLY, firewall: fw([blk("bad")]), hash: "h1" });
t("BLOCK in preview-only -> REFUSED", !blockPrev.ok);

// 7. Preview-only: REVIEW allowed without a decision, recorded as quality debt
const prev = evaluate({ mode: MODE.PREVIEW_ONLY, firewall: fw([r1, r2]), hash: "h1" });
t("preview-only with REVIEW -> PREVIEW_ONLY, GO", prev.ok && prev.decision === "PREVIEW_ONLY");

// 8. Dispatch classes: only transient retried
t("204 -> ok", classifyDispatchCode(204) === "ok");
t("network 0 / 429 / 503 -> transient", [0, 429, 503].every((c) => classifyDispatchCode(c) === "transient"));
t("401 / 404 / 422 -> permanent (no retry)", [401, 404, 422].every((c) => classifyDispatchCode(c) === "permanent"));

// 9. Worker compatibility: preview-only over github needs the preview_only input
const root = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-"));
fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
fs.writeFileSync(path.join(root, ".github", "workflows", "render-video.yml"), "on:\n  workflow_dispatch:\n    inputs:\n      preview_only:\n        required: false\n");
t("preview-only + github + input declared -> compatible", workerCompat({ root, method: "github", mode: MODE.PREVIEW_ONLY }).ok);
fs.writeFileSync(path.join(root, ".github", "workflows", "render-video.yml"), "on:\n  workflow_dispatch:\n    inputs: {}\n");
t("preview-only + github + input missing -> STOP", !workerCompat({ root, method: "github", mode: MODE.PREVIEW_ONLY }).ok);
t("production + github -> n/a", workerCompat({ root, method: "github", mode: MODE.PRODUCTION }).ok);

// 10. Config version binds to file bytes
const cfg = path.join(root, "config.json");
fs.writeFileSync(cfg, "{\"a\":1}");
const h1 = configHash(cfg);
fs.writeFileSync(cfg, "{\"a\":2}");
t("config hash changes when the config changes", h1 && configHash(cfg) !== h1);

// 11. Three facts: decision and quality are appended and old records stay
fs.mkdirSync(path.join(root, "books", "demo"), { recursive: true });
recordDecision(root, "demo", { hash: "h1", commit: "abc", reason: "first", keys: [{ key: "k1", reasonCode: "X", message: "m" }] });
recordDecision(root, "demo", { hash: "h2", commit: "def", reason: "second", keys: [] });
const decs = pre.loadDecisions(root, "demo");
t("decisions append; earlier decision kept", decs.length === 2 && decs[0].configHash === "h1");
appendFacts(root, "demo", { kind: "preflight", quality: { status: "FAIL" } });
appendFacts(root, "demo", { kind: "technical", technical: "VERIFIED" });
const facts = JSON.parse(fs.readFileSync(factsFile(root, "demo"), "utf8"));
t("facts keep quality FAIL and technical separate", facts.runs.length === 2 && facts.runs[0].quality.status === "FAIL" && facts.runs[1].technical === "VERIFIED");

// 12. Technical verifier: missing file fails, never claims success
const miss = verifyRenderOutput({ file: path.join(root, "nope.mp4"), expectedFrames: 100 });
t("missing output -> FAIL, file missing", miss.status === "FAIL" && miss.problems[0] === "file missing");

// 13. Render AUTHORIZATION separate from the quality verdict (2026-10-28): the preview decides production, Vox and
//     Antidote alike. Fixtures in the temp root; preflight() runs for real (Vox: no firewall spawn).
{
  const { readPreview, inputHashOf } = pre;
  const slug = "pv";
  const bdir = path.join(root, "books", slug);
  fs.mkdirSync(bdir, { recursive: true });
  const cfgRel = `books/${slug}/config.vox.json`, cfgAbs = path.join(root, cfgRel);
  const setCfg = (n) => fs.writeFileSync(cfgAbs, JSON.stringify({ meta: { fps: 30, audio: `audio/${slug}.mastered.m4a` }, beats: [{ id: "b", n }] }, null, 2) + "\n");
  const mute = { label: "holdout1", sample: "fresh", n: 30, wrong: 4, dead: 2, adds: 17, pass: false };
  const setPreview = (ready, ih = inputHashOf(cfgAbs)) => fs.writeFileSync(path.join(bdir, "preview-ready.json"), JSON.stringify({ ready, at: "2026-10-28T10:00:00.000Z", renderInputHash: ih, mute: ready ? { ...mute, wrong: 0, pass: true } : mute, failed: ready ? [] : ["blind mute test (fresh holdout sample)"] }));
  const run = (mode, extra = {}) => { const q = console.log; let out = ""; console.log = (s = "") => { out += s + "\n"; }; try { return { ...pre.preflight({ root, slug, engine: "vox", method: "local", mode, configFile: cfgRel, ...extra }), out }; } finally { console.log = q; } };
  setCfg(1);

  t("readPreview: no preview-ready.json -> MISSING", readPreview({ root, slug, inputHash: inputHashOf(cfgAbs) }).state === "MISSING");
  let r = run(MODE.PRODUCTION);
  t("Vox production, preview MISSING, no decision -> STOP (needs operator decision)", !r.ok && /NEEDS OPERATOR DECISION/.test(r.out), r.out);
  setPreview(true);
  r = run(MODE.PRODUCTION);
  // 2026-10-30: READY + no debt is settled quality, not the operator's go — the authorization is its own record
  t("Vox preview READY, no render authorization -> STOP (authorization MISSING)", !r.ok && /preview   : READY/.test(r.out) && /authorization: MISSING/.test(r.out), r.out);
  r = run(MODE.PRODUCTION, { authorizeReason: "Operator: render it" });
  t("Vox preview READY + --authorize-render -> GO, recorded as render-authorization", r.ok && pre.loadDecisions(root, slug).slice(-1)[0].kind === "render-authorization", r.out);
  fs.writeFileSync(pre.decisionFile(root, slug), JSON.stringify({ decisions: [] })); // the next cases start without decisions
  setPreview(false);
  t("readPreview: ready:false for this input -> NOT_READY with the mute summary", readPreview({ root, slug, inputHash: inputHashOf(cfgAbs) }).state === "NOT_READY" && readPreview({ root, slug, inputHash: inputHashOf(cfgAbs) }).mute.wrong === 4);
  r = run(MODE.PRODUCTION);
  t("Vox preview NOT READY, no decision -> STOP", !r.ok && r.decision === "REFUSED", r.out);
  t("…prints 'preview   : NOT READY (mute WRONG 4/30 …)' and NEEDS OPERATOR DECISION", /preview   : NOT READY \(mute WRONG 4\/30/.test(r.out) && /authorization: NEEDS OPERATOR DECISION/.test(r.out), r.out);
  r = run(MODE.PREVIEW_ONLY);
  t("preview-only + preview NOT READY -> GO (fact printed, never blocks)", r.ok && /preview   : NOT READY/.test(r.out), r.out);
  t("preview-only never records a decision", pre.loadDecisions(root, slug).length === 0);
  r = run(MODE.PREVIEW_ONLY, { acceptReason: "x" });
  t("--accept-quality-debt in preview-only records nothing", r.ok && pre.loadDecisions(root, slug).length === 0);
  r = run(MODE.PRODUCTION, { acceptReason: "Operator: ship despite mute 4/30" });
  let decs = pre.loadDecisions(root, slug);
  t("--accept-quality-debt with preview NOT READY -> coverage recorded (kind quality-debt) for this render input; no render go yet -> STOP", !r.ok && decs.length === 1 && decs[0].kind === "quality-debt" && decs[0].preview && decs[0].preview.state === "NOT_READY" && decs[0].preview.mute.wrong === 4 && decs[0].renderInputHash === inputHashOf(cfgAbs) && /authorization: MISSING/.test(r.out), r.out);
  r = run(MODE.PRODUCTION, { authorizeReason: "Operator: render it with the accepted debt" });
  decs = pre.loadDecisions(root, slug);
  t("…+ --authorize-render -> GO; the authorization is a second, separate record", r.ok && decs.length === 2 && decs[1].kind === "render-authorization", r.out);
  r = run(MODE.PRODUCTION);
  t("Vox NOT READY + debt decision + authorization for THIS input -> GO without asking again", r.ok && /authorization: operator's render authorization/.test(r.out), r.out);
  t("…the preview verdict stays NOT READY in the record (a decision is not READY)", /preview   : NOT READY/.test(r.out) && JSON.parse(fs.readFileSync(path.join(bdir, "preview-ready.json"), "utf8")).ready === false);
  // the runner's rewrite (raw audio path, different formatting) keeps the same render input
  fs.writeFileSync(cfgAbs, JSON.stringify({ meta: { fps: 30, audio: `audio/${slug}.m4a` }, beats: [{ id: "b", n: 1 }] }));
  t("same decision + the runner's audio re-point -> still covered (render-input hash)", run(MODE.PRODUCTION).ok);
  setCfg(2);
  r = run(MODE.PRODUCTION);
  t("same decision + CHANGED config -> STOP (preview STALE, decision for another input)", !r.ok && /preview   : STALE/.test(r.out), r.out);
  setPreview(true, "0000000000000000");
  t("STALE preview (READY recorded on another config) -> not READY, STOP", readPreview({ root, slug, inputHash: inputHashOf(cfgAbs) }).state === "STALE" && !run(MODE.PRODUCTION).ok);
  fs.writeFileSync(path.join(bdir, "preview-ready.json"), JSON.stringify({ ready: true, configSha256: require("crypto").createHash("sha256").update(fs.readFileSync(cfgAbs)).digest("hex") }));
  t("legacy record (configSha256 only, bytes match) -> READY", readPreview({ root, slug, inputHash: inputHashOf(cfgAbs), configFile: cfgAbs }).state === "READY");
  t("legacy record on other bytes -> STALE", readPreview({ root, slug, inputHash: inputHashOf(cfgAbs), configFile: path.join(root, "config.json") }).state === "STALE");

  // evaluate(): Antidote rules with the preview
  const H = "ih000000000000aa";
  const NR = { state: "NOT_READY", mute, at: "x" }, READY = { state: "READY" }; // at = the preview-ready record the decision saw
  const pdec = (extra = {}) => ({ configHash: "c1", renderInputHash: H, keys: [], preview: { state: "NOT_READY", mute, at: "x" }, ...extra });
  t("Antidote firewall PASS + preview NOT READY, no decision -> STOP (needsAccept preview)", (() => { const e = evaluate({ mode: MODE.PRODUCTION, firewall: fw([]), hash: "c1", inputHash: H, preview: NR }); return !e.ok && e.needsAccept && e.needsAcceptKinds.join() === "preview"; })());
  t("Antidote firewall PASS + preview READY -> PASS, GO", evaluate({ mode: MODE.PRODUCTION, firewall: fw([]), hash: "c1", inputHash: H, preview: READY }).decision === "PASS");
  t("Antidote firewall PASS + preview NOT READY + decision with preview for this input -> GO", evaluate({ mode: MODE.PRODUCTION, firewall: fw([]), hash: "c1", inputHash: H, preview: NR, decisions: [pdec()] }).ok);
  const bl = evaluate({ mode: MODE.PRODUCTION, firewall: fw([blk("bad")]), hash: "c1", inputHash: H, preview: NR, decisions: [pdec({ keys: dec("c1", [blk("bad")]).keys })] });
  t("Antidote BLOCK + any decision (incl. preview coverage) -> STOP, nothing to accept", !bl.ok && !bl.needsAccept);
  t("BLOCK in preview-only with preview NOT READY -> STOP", !evaluate({ mode: MODE.PREVIEW_ONLY, firewall: fw([blk("bad")]), hash: "c1", inputHash: H, preview: NR }).ok);
  const oldDec = { configHash: "c1", renderInputHash: H, keys: dec("c1", [r1]).keys };
  const od = evaluate({ mode: MODE.PRODUCTION, firewall: fw([r1]), hash: "c1", inputHash: H, preview: NR, decisions: [oldDec] });
  t("old decision (no preview coverage) still covers its REVIEW keys but never a NOT READY preview", !od.ok && od.covered.length === 1 && od.needsAcceptKinds.join() === "preview");
  t("old decision + preview READY -> ACCEPTED_DEBT, GO (quality coverage unchanged)", evaluate({ mode: MODE.PRODUCTION, firewall: fw([r1]), hash: "c1", inputHash: H, preview: READY, decisions: [oldDec] }).decision === "ACCEPTED_DEBT");
  const both = evaluate({ mode: MODE.PRODUCTION, firewall: fw([r1, r2]), hash: "c1", inputHash: H, preview: NR, decisions: [pdec({ keys: dec("c1", [r1]).keys })] });
  t("preview covered but a NEW REVIEW finding -> STOP (needs quality)", !both.ok && both.needsAcceptKinds.join() === "quality");
  // 2026-10-29: a decision covers the preview FACT it saw, never a verdict that appeared after it (essentialism: 605
  // REVIEW accepted while the preview was MISSING — its later mute WRONG / DEAD must not count as accepted)
  const sawMissing = { configHash: "c1", renderInputHash: H, keys: [], preview: { state: "MISSING", mute: null, at: null } };
  t("decision saw MISSING, preview still MISSING -> covered (the operator accepted 'no verdict yet')", evaluate({ mode: MODE.PRODUCTION, firewall: fw([]), hash: "c1", inputHash: H, preview: { state: "MISSING" }, decisions: [sawMissing] }).ok);
  const later = evaluate({ mode: MODE.PRODUCTION, firewall: fw([]), hash: "c1", inputHash: H, preview: NR, decisions: [sawMissing] });
  t("decision saw MISSING, now NOT READY (mute FAIL) -> STOP: a verdict after the decision is not covered", !later.ok && later.needsAcceptKinds.join() === "preview" && /saw it MISSING/.test(later.blockers.join()) && /not covered by it/.test(later.blockers.join()), JSON.stringify(later.blockers));
  t("decision saw one NOT READY record, a NEWER preview-ready record now -> STOP", !evaluate({ mode: MODE.PRODUCTION, firewall: fw([]), hash: "c1", inputHash: H, preview: { ...NR, at: "y" }, decisions: [pdec()] }).ok);
  t("…and the SAME record it saw -> still covered", evaluate({ mode: MODE.PRODUCTION, firewall: fw([]), hash: "c1", inputHash: H, preview: NR, decisions: [pdec()] }).ok);
  t("a decision for another render input never covers this one (hash unchanged rule)", !evaluate({ mode: MODE.PRODUCTION, firewall: fw([]), hash: "c1", inputHash: "ih-other", preview: { state: "MISSING" }, decisions: [sawMissing] }).ok);
  t("preview decision bound to another render input -> STOP", !evaluate({ mode: MODE.PRODUCTION, firewall: null, hash: "c2", inputHash: "ih0000000000bbbb", preview: NR, decisions: [pdec()] }).ok);
  t("byte-hash-only decision never carries preview coverage", !evaluate({ mode: MODE.PRODUCTION, firewall: null, hash: "c1", inputHash: H, preview: { state: "MISSING" }, decisions: [{ configHash: "c1", keys: [], preview: { state: "MISSING" } }] }).ok);
}

fs.rmSync(root, { recursive: true, force: true });
console.log(fail ?`\n${fail} FAILED` : "\nall render-preflight tests passed");
process.exit(fail ? 1 : 0);
