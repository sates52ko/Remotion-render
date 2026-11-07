#!/usr/bin/env node
// PROVENANCE (cycle 9 P0b, 2026-11-04): durable production records name the book's code (commit = its checkout / pin)
// AND the code that ran the step (tools), additively — old records and readers are untouched, the render input hash
// and the decision rules do not change. Run: node scripts/test-provenance.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const pre = require("./lib/render-preflight");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info !== undefined ? `  (${String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300)})` : ""}`); if (!ok) failed++; };
const sh = (a, cwd) => spawnSync("git", a, { cwd, encoding: "utf8" }).stdout.trim();
const toolsHead = sh(["rev-parse", "--short", "HEAD"], __dirname);

const T = fs.mkdtempSync(path.join(os.tmpdir(), "provenance-"));
try {
  // a "book worktree" with its own commit (the pin) — not this checkout
  sh(["init", "-q"], T);
  fs.mkdirSync(path.join(T, "books", "bk"), { recursive: true });
  fs.writeFileSync(path.join(T, "books", "bk", "config.antidote.json"), JSON.stringify({ meta: { fps: 30, audio: "audio/bk.m4a" }, scenes: [] }));
  fs.writeFileSync(path.join(T, "books", "bk", "production-base.json"), JSON.stringify({ productionBase: "cb0d03118d1215d3c87721ac7e1d28eca3350633" }));
  sh(["add", "-A"], T); spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "pin"], { cwd: T });
  const bookHead = sh(["rev-parse", "--short", "HEAD"], T);
  const cfg = path.join(T, "books", "bk", "config.antidote.json");
  const inputHash = pre.inputHashOf(cfg);
  // an OLD record, written before provenance existed
  fs.writeFileSync(pre.decisionFile(T, "bk"), JSON.stringify({ decisions: [{ kind: "render-authorization", at: "2026-11-01T00:00:00Z", commit: "abc1234", configHash: "x", renderInputHash: inputHash, reason: "old" }] }));
  t("an old authorization (no tools field) is still THE authorization for its render input", pre.authorizationFor(pre.loadDecisions(T, "bk"), inputHash).reason === "old");
  const a = pre.recordAuthorization(T, "bk", { hash: pre.configHash(cfg), inputHash, commit: bookHead, reason: "the operator's words" });
  t("a new authorization records the book's commit (pin checkout) AND the tools that ran", a.commit === bookHead && a.tools === toolsHead && a.commit !== a.tools, a);
  t("…and the book's production-base pin", a.pin === "cb0d03118d12", a);
  t("…the render input hash is the same value as before (provenance is additive)", a.renderInputHash === inputHash && pre.inputHashOf(cfg) === inputHash);
  t("…the newest authorization still wins for that input; the old record is unchanged on disk", pre.authorizationFor(pre.loadDecisions(T, "bk"), inputHash).reason === "the operator's words" && pre.loadDecisions(T, "bk")[0].reason === "old" && !("tools" in pre.loadDecisions(T, "bk")[0]));
  const d = pre.recordDecision(T, "bk", { hash: "x", inputHash, commit: bookHead, reason: "debt", keys: [] });
  t("a quality-debt record carries the same two identities", d.commit === bookHead && d.tools === toolsHead);
  t("provenance(): tools = this code, pin from production-base.json", pre.provenance(T, "bk").tools === toolsHead && pre.provenance(T, "bk").pin === "cb0d03118d12");
} finally { fs.rmSync(T, { recursive: true, force: true }); }

// ── a film delivered and removed before its technical fact: the cloud's verification, labelled, once ──
{
  const B = fs.mkdtempSync(path.join(os.tmpdir(), "fromcloud-"));
  try {
    fs.mkdirSync(path.join(B, "books", "bk"), { recursive: true });
    fs.writeFileSync(path.join(B, "books", "bk", "config.antidote.json"), JSON.stringify({ meta: { fps: 30 }, totalFrames: 300 }));
    fs.writeFileSync(path.join(B, ".render-github-cloud.bk.json"), JSON.stringify({ verified: true, at: "2026-11-03T11:35:20Z", bundleSha: "b".repeat(40), run: { url: "https://x/run/1" }, report: { final: { file: "bk.mp4", frames: 300, expected: 300, decodes: true, bytes: 1000, sha256: "s".repeat(64) } } }));
    const v = (...a) => spawnSync(process.execPath, [path.join(__dirname, "verify-render-output.js"), "--slug=bk", `--book-root=${B}`, "--from-cloud", ...a], { encoding: "utf8" });
    let r = v();
    const facts = () => JSON.parse(fs.readFileSync(path.join(B, "books", "bk", "render-facts.json"), "utf8")).runs;
    t("--from-cloud: film gone → CLOUD_VERIFIED recorded, labelled 'local check NOT done', with the tools identity", r.status === 0 && facts().length === 1 && facts()[0].technical === "CLOUD_VERIFIED" && /NOT_DONE/.test(facts()[0].localMediaCheck) && facts()[0].tools === toolsHead, r.stdout + r.stderr);
    r = v();
    t("--from-cloud: a second run writes nothing (idempotent per film sha256)", r.status === 0 && /already recorded/.test(r.stdout) && facts().length === 1);
    fs.mkdirSync(path.join(B, "out")); fs.writeFileSync(path.join(B, "out", "bk.mp4"), "x");
    r = v();
    t("--from-cloud: refused while the film is on disk (the real check must run)", r.status === 2 && facts().length === 1, r.stderr);
  } finally { fs.rmSync(B, { recursive: true, force: true }); }
}

const src = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
t("preflight facts + technical facts + the split state carry the tools identity", /kind: "preflight", mode, commit, \.\.\.provenance\(root, slug\)/.test(src("lib/render-preflight.js")) && /\.\.\.pre\.provenance\(BOOK, args\.slug\)/.test(src("verify-render-output.js")) && /tools: \(execSync\("git rev-parse HEAD", \{ cwd: ROOT/.test(src("render.js")) && /bookCommit:/.test(src("render.js")));

console.log(failed ? `\n${failed} FAILED` : "\nall provenance checks passed");
process.exit(failed ? 1 : 0);
