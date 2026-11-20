#!/usr/bin/env node
// RENDER AUTHORIZATION vs QUALITY (2026-10-29). Real case: essentialism — firewall 0 BLOCK / 605 REVIEW accepted by the
// operator WHILE the preview was MISSING ("Kalite borcunu kabul ediyorum, render için kayıt al."), technical preflight
// GO, 10 segments dispatched; the readcheck after the beat-100 fix and the sealed mute test were not done. What must
// hold: the seven facts stay apart (render-decision.js); the acceptance covers exactly what it saw — a mute verdict
// that appears later is NEW debt (NEEDS_DECISION), a changed config is never covered, a BLOCK never; nothing here
// cancels an authorized render already running.
// Run: node scripts/test-render-seven-facts.js
const fs = require("fs");
const os = require("os");
const path = require("path");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 500)})` : ""}`); if (!ok) failed++; };
const rp = require("./lib/render-preflight");
const { decisionStatus, sevenFacts } = require("./render-decision");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "seven-facts-"));
const slug = "zz-ess";
const B = path.join(root, "books", slug);
const W = (f, j) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(j, null, 2)); };
try {
  W(path.join(B, "book.json"), { slug, engine: "antidote" });
  W(path.join(B, "config.antidote.json"), { meta: { fps: 30, audio: "audio/zz-ess.mp3", totalFrames: 300 }, scenes: [{ id: "s1" }] });
  const cfg = path.join(B, "config.antidote.json");
  const hash = rp.configHash(cfg), inputHash = rp.inputHashOf(cfg);
  const rev = (k) => ({ reasonCode: "R", message: `review ${k}`, outcome: "REVIEW" });
  const viol = [rev(1), rev(2), rev(3)];
  W(path.join(B, "narrative-visual-firewall.report.json"), { status: "FAIL", renderInputHash: inputHash, counts: { blocks: 0, reviews: 3 }, violations: viol });
  // the operator's decision, taken while the preview was MISSING (as preflight records it)
  W(path.join(B, "render-decision.json"), { decisions: [{ at: "2026-10-29T08:55:11.026Z", commit: "88db7e09", configHash: hash, renderInputHash: inputHash, reason: "Kalite borcunu kabul ediyorum, render için kayıt al.", keys: viol.map((v) => ({ key: rp.findingKey(v), reasonCode: v.reasonCode, message: v.message })), preview: { state: "MISSING", mute: null, at: null } }] });
  W(path.join(B, "render-facts.json"), { runs: [{ at: "2026-10-29T08:55:36Z", kind: "preflight", mode: "production", renderInputHash: inputHash, decision: { ok: true } }] });
  W(path.join(root, `.render-github-split.${slug}.json`), { slug, mode: "PRODUCTION", dispatchedAt: "2026-10-29T08:56:48Z", segments: Array.from({ length: 10 }, (_, k) => ({ seg: k + 1 })) });
  W(path.join(B, "youtube-ready.json"), { ready: true });

  let st = decisionStatus({ root, slug });
  let f = sevenFacts({ root, slug, st });
  t("the real case as recorded: authorized (the operator accepted the REVIEW debt AND rendering without a preview verdict)", st.verdict === "COVERED", st.detail);
  t("A quality: NOT MEASURED — never inferred from the authorization", /NOT MEASURED/.test(f.A_quality));
  t("B preview: MISSING, and a decision never changes it", /MISSING — not READY \(a decision never changes this\)/.test(f.B_preview));
  t("C acceptance: names what it covered — 3 REVIEW + the preview as it was then (MISSING) — never a later verdict", /3 REVIEW finding\(s\), and the preview as it was then \(MISSING\) — never a verdict recorded after it/.test(f.C_acceptance), f.C_acceptance);
  t("E technical: GO on this config, said to be technical only", /GO on render input .* \(this config\) — technical only, not a quality verdict/.test(f.E_technical), f.E_technical);
  t("F dispatch: 10 segments, from the split state", /10 segment\(s\) dispatched/.test(f.F_dispatch));
  t("H publishing: a READY pack is neither a render permission nor an upload authorization", /READY — not a render permission; upload \/ publish is always the operator's/.test(f.H_youtube));
  t("G assembly: its own fact (nothing assembled yet)", /not assembled/.test(f.G_assembly));
  t("D authorization: the legacy combined decision (before 2026-10-30) still counts as the render go", /render authorization of .*combined/.test(f.D_authorization), f.D_authorization);

  // the mute test runs afterwards and records NOT READY for THIS render input: new debt, not covered
  W(path.join(B, "preview-ready.json"), { ready: false, at: "2026-10-29T13:00:00Z", renderInputHash: inputHash, configSha256: "x", failed: ["mute test FAIL"], mute: { label: "final", sample: "fresh", n: 30, wrong: 4, dead: 2, adds: 15, pass: false } });
  st = decisionStatus({ root, slug });
  t("a mute verdict recorded after the decision -> NEEDS_DECISION (the 605-style acceptance never covers unseen WRONG / DEAD)", st.verdict === "NEEDS_DECISION" && /saw it MISSING/.test(st.detail) && /not covered by it/.test(st.detail), st.detail);
  f = sevenFacts({ root, slug, st });
  t("A quality now shows the measured verdict (WRONG 4/30 — FAIL)", /WRONG 4\/30/.test(f.A_quality) && /FAIL/.test(f.A_quality), f.A_quality);
  // the operator records a decision that SAW this verdict -> covered again (an explicit, informed decision)
  const D = JSON.parse(fs.readFileSync(path.join(B, "render-decision.json"), "utf8"));
  D.decisions.push({ ...D.decisions[0], at: "2026-10-29T13:05:00Z", preview: { state: "NOT_READY", mute: { label: "final", n: 30, wrong: 4, dead: 2, adds: 15, pass: false }, at: "2026-10-29T13:00:00Z" } });
  W(path.join(B, "render-decision.json"), D);
  t("…an informed decision that saw this exact verdict covers it", decisionStatus({ root, slug }).verdict === "COVERED");
  // the config changes (a fix after the decision): nothing carries over
  W(cfg, { meta: { fps: 30, audio: "audio/zz-ess.mp3", totalFrames: 300 }, scenes: [{ id: "s1" }, { id: "s2" }] });
  st = decisionStatus({ root, slug });
  t("a changed config (render input) is never covered by the old decision", st.verdict !== "COVERED", st.verdict + " " + st.detail);
  // a BLOCK is never covered
  W(cfg, { meta: { fps: 30, audio: "audio/zz-ess.mp3", totalFrames: 300 }, scenes: [{ id: "s1" }] });
  W(path.join(B, "narrative-visual-firewall.report.json"), { status: "FAIL", renderInputHash: inputHash, counts: { blocks: 1, reviews: 3 }, violations: viol.concat([{ reasonCode: "B", message: "block", outcome: "BLOCK" }]) });
  t("a BLOCK is never covered, whatever was accepted", decisionStatus({ root, slug }).verdict === "BLOCK");
  const RD = fs.readFileSync(path.join(__dirname, "render-decision.js"), "utf8");
  t("render-decision stays read-only (no write, no dispatch, no cancel)", !/writeFileSync|appendFileSync|execSync\(|spawn\(|cancel/i.test(RD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} FAILED` : "\nall seven-facts checks passed");
process.exit(failed ? 1 : 0);
