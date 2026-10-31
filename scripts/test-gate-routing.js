#!/usr/bin/env node
// ENGINE-AWARE GATES + "ALREADY DECIDED" (2026-10-27). Fixtures in a temp root (nothing in books/ is touched):
//   firewall CLI — Vox: NOT_APPLICABLE, no report (a hand run on their-eyes produced a fake STORY_BIBLE_INCOMPLETE
//   BLOCK); Antidote: a missing config is CONFIG_MISSING, a missing bible STORY_BIBLE_INCOMPLETE, a real plan is
//   validated and its report stamped with the config it was computed on.
//   render-decision.js — H: the operator's decision for THIS config is found (COVERED → not asked again); a new
//   config / new finding is never covered; a BLOCK never; Vox has nothing to accept; a stale report is not trusted;
//   the preview verdict is reported unchanged.
// Run: node scripts/test-gate-routing.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const rp = require("./lib/render-preflight");
const { withOutcomes } = require("./lib/firewall-outcomes");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 300)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gate-routing-"));
const node = (script, ...a) => spawnSync(process.execPath, [path.join(__dirname, script), ...a, `--root=${tmp}`], { cwd: REPO, encoding: "utf8" });
const book = (slug, files) => { const d = path.join(tmp, "books", slug); fs.mkdirSync(d, { recursive: true }); for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(d, f), typeof v === "string" ? v : JSON.stringify(v, null, 2)); return d; };
const reportOf = (d) => path.join(d, "narrative-visual-firewall.report.json");
try {
  // ── firewall CLI routing ──────────────────────────────────────────────────
  const vox = book("vx", { "book.json": { slug: "vx", engine: "vox" }, "config.vox.json": { meta: { fps: 30 }, beats: [] } });
  let r = node("validate-narrative-visual-firewall.js", "--slug=vx", "--report-only");
  t("firewall: a Vox book is NOT_APPLICABLE, exit 0", r.status === 0 && /NOT_APPLICABLE vx/.test(r.stdout), r.stdout + r.stderr);
  t("firewall: …and no report is written (nothing a gate could read as a BLOCK)", !fs.existsSync(reportOf(vox)));
  const noCfg = book("ax", { "book.json": { slug: "ax", engine: "antidote" }, "story-bible.json": {} });
  r = node("validate-narrative-visual-firewall.js", "--slug=ax", "--report-only");
  t("firewall: an Antidote book without its config is CONFIG_MISSING, not 'story bible incomplete'", /CONFIG_MISSING/.test(r.stdout) && !/STORY_BIBLE_INCOMPLETE/.test(r.stdout), r.stdout);
  const noBible = book("ay", { "book.json": { slug: "ay", engine: "antidote" }, "config.antidote.json": { meta: { fps: 30 }, scenes: [] } });
  r = node("validate-narrative-visual-firewall.js", "--slug=ay", "--report-only");
  t("firewall: …without its story bible it IS STORY_BIBLE_INCOMPLETE (a real BLOCK stays a BLOCK)", /STORY_BIBLE_INCOMPLETE/.test(r.stdout) && /\[BLOCK\]/.test(r.stdout), r.stdout);
  // a real plan (an unpublished book's committed files, copied)
  const src = path.join(REPO, "books", "burn-of-the-everflame");
  if (fs.existsSync(path.join(src, "config.antidote.json"))) {
    const real = book("az", { "book.json": { slug: "az", engine: "antidote" } });
    for (const f of ["config.antidote.json", "story-bible.json", "motifs.json"]) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(real, f));
    r = node("validate-narrative-visual-firewall.js", "--slug=az", "--report-only");
    const rep = fs.existsSync(reportOf(real)) ? JSON.parse(fs.readFileSync(reportOf(real), "utf8")) : null;
    t("firewall: a real Antidote plan is validated (counts reported)", !!rep && rep.counts && Number.isFinite(rep.counts.blocks), r.stdout.slice(0, 200));
    t("firewall: …its report names the config it was computed on", !!rep && rep.renderInputHash === rp.inputHashOf(path.join(real, "config.antidote.json")));
  }

  // ── render-decision.js (scenario H) ───────────────────────────────────────
  const cfg = { meta: { fps: 30, audio: "audio/dd.mastered.m4a" }, scenes: [{ id: "intro", durationFrames: 30 }] };
  const d = book("dd", { "book.json": { slug: "dd", engine: "antidote" }, "config.antidote.json": cfg, "story-bible.json": {} });
  const cf = path.join(d, "config.antidote.json");
  const finding = (msg, code = "STRATEGY_REQUIREMENT_UNMET") => ({ reasonCode: code, message: msg });
  const writeReport = (violations) => {
    const rep = withOutcomes({ version: "P1.1", slug: "dd", status: violations.length ? "FAIL" : "PASS", counts: { scenes: 1, violations: violations.length }, violations }, false);
    rep.configHash = rp.configHash(cf); rep.renderInputHash = rp.inputHashOf(cf);
    fs.writeFileSync(reportOf(d), JSON.stringify(rep, null, 2));
  };
  r = node("render-decision.js", "--slug=dd");
  t("decision: no report yet → NO_REPORT (exit 3), nothing is assumed", r.status === 3 && /^NO_REPORT/.test(r.stdout), r.stdout);
  writeReport([finding("scene 1 strategy a"), finding("scene 2 strategy b")]);
  r = node("render-decision.js", "--slug=dd");
  t("decision: REVIEW findings and no decision → NEEDS_DECISION (exit 2): the operator decides", r.status === 2 && /^NEEDS_DECISION/.test(r.stdout), r.stdout);
  const keys = rp.readQuality({ root: tmp, slug: "dd", preview: false }).keys.map(({ key, reasonCode, message }) => ({ key, reasonCode, message }));
  rp.recordDecision(tmp, "dd", { hash: rp.configHash(cf), inputHash: rp.inputHashOf(cf), commit: "abc12345", reason: "Operator accepted 2 REVIEW findings for this config", keys });
  // preview READY for this render input + the quality decision → covered
  fs.writeFileSync(path.join(d, "preview-ready.json"), JSON.stringify({ ready: true, renderInputHash: rp.inputHashOf(cf) }));
  r = node("render-decision.js", "--slug=dd");
  t("H. preview READY + the quality decision for THIS config → COVERED (exit 0)", r.status === 0 && /^COVERED/.test(r.stdout), r.stdout);
  // P2 (2026-10-28): a quality-only decision never covers a NOT READY preview — authorization is a separate fact
  fs.writeFileSync(path.join(d, "preview-ready.json"), JSON.stringify({ ready: false, renderInputHash: rp.inputHashOf(cf), failed: ["blind mute test"] }));
  r = node("render-decision.js", "--slug=dd");
  t("P2. preview NOT READY, decision covers only the REVIEW findings → NEEDS_DECISION (exit 2)", r.status === 2 && /^NEEDS_DECISION/.test(r.stdout) && /preview NOT READY/.test(r.stdout), r.stdout);
  rp.recordDecision(tmp, "dd", { hash: rp.configHash(cf), inputHash: rp.inputHashOf(cf), commit: "abc12345", reason: "Operator: render despite the mute FAIL", keys, preview: { state: "NOT_READY", mute: null, at: null } });
  r = node("render-decision.js", "--slug=dd");
  t("H. the operator's decision for THIS config incl. the NOT READY preview → COVERED (exit 0): not asked again", r.status === 0 && /^COVERED/.test(r.stdout) && /not asking|without asking again/.test(r.stdout), r.stdout);
  t("H. …and the preview verdict is reported unchanged (NOT READY stays NOT READY)", /preview: NOT READY/.test(r.stdout), r.stdout);
  t("H. …the quality stays FAIL in the record (a decision is not a PASS)", JSON.parse(node("render-decision.js", "--slug=dd", "--json").stdout).quality === "FAIL");
  writeReport([finding("scene 1 strategy a"), finding("scene 2 strategy b"), finding("scene 3 a NEW finding")]);
  r = node("render-decision.js", "--slug=dd");
  t("H. a NEW finding on the same config is not covered → NEEDS_DECISION", r.status === 2 && /^NEEDS_DECISION/.test(r.stdout), r.stdout);
  writeReport([finding("scene 1 strategy a"), finding("scene 2 strategy b")]);
  fs.writeFileSync(cf, JSON.stringify({ ...cfg, scenes: [{ id: "intro", durationFrames: 31 }] }));
  r = node("render-decision.js", "--slug=dd");
  t("H. a CHANGED config with the old report → STALE_REPORT (exit 3), never COVERED", r.status === 3 && /^STALE_REPORT/.test(r.stdout), r.stdout);
  writeReport([finding("scene 1 strategy a"), finding("scene 2 strategy b")]);
  r = node("render-decision.js", "--slug=dd");
  t("H. a CHANGED config, same findings → NEEDS_DECISION (an older decision does not carry over)", r.status === 2 && /^NEEDS_DECISION/.test(r.stdout), r.stdout);
  writeReport([finding("scene 1 broken provenance", "MISSING_BOOK_PROVENANCE")]);
  r = node("render-decision.js", "--slug=dd");
  t("H. a BLOCK is never covered (exit 1)", r.status === 1 && /^BLOCK/.test(r.stdout), r.stdout);
  r = node("render-decision.js", "--slug=vx");
  t("P2. Vox without a preview verdict → NEEDS_DECISION (exit 2): no automatic production render", r.status === 2 && /^NEEDS_DECISION/.test(r.stdout), r.stdout);
  fs.writeFileSync(path.join(vox, "preview-ready.json"), JSON.stringify({ ready: true, renderInputHash: rp.inputHashOf(path.join(vox, "config.vox.json")) }));
  r = node("render-decision.js", "--slug=vx");
  t("decision: Vox preview READY → no debt to accept (exit 2): the production render is still the operator's go", r.status === 2 && /^(NO_DEBT|NOT_APPLICABLE)/.test(r.stdout), r.stdout);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall gate-routing checks passed");
process.exit(failed ? 1 : 0);
