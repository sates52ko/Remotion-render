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

fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED` : "\nall render-preflight tests passed");
process.exit(fail ? 1 : 0);
