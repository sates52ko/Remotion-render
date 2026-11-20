#!/usr/bin/env node
/**
 * test-p2-evidence-capture.js — P2.2 evidence capture, operator-locked groups:
 *   disabled mode · enabled mode · rejected-scene exclusion · cleanup survival ·
 *   capture-failure non-blocking · deterministic sampling
 * The production gate itself is untouched; this suite exercises the adapter.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { FLAG, isCaptureEnabled, resolveConfig, rejectedSceneIds, selectPassScenes, captureIfEnabled } = require("./lib/p2-evidence-capture");

let passed = 0, failed = 0;
const t = (name, cond) => { if (cond) { passed++; console.log(`  ok ${name}`); } else { failed++; console.error(`  FAIL ${name}`); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p2cap-"));
const mk = (p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); return p; };

// ── synthetic book: 60 scenes, scene-5 hard-REJECTED, scene-9 diagnostic-only
// timestamps stay inside the 6s test video: scene i covers frames [3i, 3i+3)
// → midpoint (3i+1)/30s ≤ 5.97s at fps 30 (a past-EOF seek yields no frame —
// ffmpeg exits 0 with no output — which the missing-video group exercises)
const scenes = Array.from({ length: 60 }, (_, i) => ({
  id: `scene-${i + 1}`,
  fromFrame: i * 3,
  durationFrames: 3,
  visualIntent: { archetype: `arch-${i}` },
  visualContract: { visualEvidence: { representation: { kind: "fallback", lever: "diorama" } } },
  _narration: `narration ${i + 1}`,
}));
scenes[8].visualContract = undefined; // scene-9: no-contract scene — never eligible at all
scenes[49].visualContract = { visualEvidence: { representation: { kind: "fallback", lever: "closeUp" } } }; // scene-50: diagnostic-only, stays eligible
const report = {
  version: "P1.1", slug: "p2cap-book", status: "PASS",
  violations: [
    { reasonCode: "MOTIF_NOT_ALLOWED", message: "x", sceneId: "scene-5", severity: "hard" },
    { reasonCode: "FOREIGN_WORLD", message: "diag", sceneId: "scene-9", severity: "diagnostic" },
  ],
};
const config = { meta: { fps: 30 }, scenes };
const configPath = mk(path.join(tmp, "books", "p2cap-book", "config.antidote.json"));
fs.writeFileSync(configPath, JSON.stringify(config));
const reportPath = mk(path.join(tmp, "books", "p2cap-book", "narrative-visual-firewall.report.json"));
fs.writeFileSync(reportPath, JSON.stringify(report));

// tiny real video so frame extraction is exercised end to end
let videoPath = null, haveFfmpeg = true;
try {
  videoPath = path.join(tmp, "p2cap.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=6:size=64x64:rate=10", "-pix_fmt", "yuv420p", videoPath]);
} catch { haveFfmpeg = false; }

// ── 1. disabled mode
console.log("── disabled mode");
t("flag parsing: off by default", isCaptureEnabled({}) === false);
t("flag parsing: off for 0/false/empty", !isCaptureEnabled({ [FLAG]: "0" }) && !isCaptureEnabled({ [FLAG]: "false" }) && !isCaptureEnabled({ [FLAG]: "" }));
t("flag parsing: on for 1/true/yes/on", ["1", "true", "yes", "on"].every((v) => isCaptureEnabled({ [FLAG]: v })));
const offDir = path.join(tmp, "out-off");
const off = captureIfEnabled({ root: tmp, slug: "p2cap-book", configPath, reportPath, outDir: offDir, env: {} });
t("disabled → no capture", off.captured === false && off.reason === "disabled");
t("disabled → no evidence directory", !fs.existsSync(offDir));

// ── 2. enabled mode
console.log("── enabled mode");
const env = { [FLAG]: "1", P2_EVIDENCE_SAMPLE_SIZE: "5", P2_EVIDENCE_SEED: "42", P2_EVIDENCE_TAG: "p2cap-run" };
const outDir = path.join(tmp, "out-on", "pkg");
const on = captureIfEnabled({ root: tmp, slug: "p2cap-book", configPath, reportPath, outDir, videoPath, env });
t("enabled → captured", on.captured === true);
t("requested sample size", on.count === 5);
const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"));
t("manifest mode field", manifest.mode === "p2.2-blind-production-sample");
t("manifest carries seed + tag", manifest.seed === 42 && manifest.checkpoint === "p2cap-run");
t("manifest eligible count excludes rejects + no-contract", manifest.counts.eligiblePassScenes === 58); // 60 − scene-5 (REJECT) − scene-9 (no contract)
t("metadata/sample-001/scene.json exists", fs.existsSync(path.join(outDir, "metadata", "sample-001", "scene.json")));
t("metadata visual-intent.json exists", fs.existsSync(path.join(outDir, "metadata", "sample-001", "visual-intent.json")));
t("metadata visual-contract.json exists", fs.existsSync(path.join(outDir, "metadata", "sample-001", "visual-contract.json")));
const gate = JSON.parse(fs.readFileSync(path.join(outDir, "metadata", "sample-001", "gate.json"), "utf8"));
t("gate.json records PASS + report version", gate.gate === "PASS" && gate.reportVersion === "P1.1");
if (haveFfmpeg) {
  t("blind frame extracted from the real video (PNG)", fs.existsSync(path.join(outDir, "blind", "sample-001", "frame.png")));
  t("all frames captured", manifest.counts.framesMissing === 0);
} else {
  t("no ffmpeg → framesMissing counted, no crash", manifest.counts.framesMissing === 5);
}

// ── 3. rejected scene exclusion
console.log("── rejected-scene exclusion");
const sampledIds = manifest.samples.map((s) => s.sceneId);
t("hard-REJECT scene-5 never sampled", !sampledIds.includes("scene-5"));
t("diagnostic-only scene-50 stays eligible", selectPassScenes(scenes, rejectedSceneIds(report), 60, 7).picked.some((p) => p.scene.id === "scene-50"));

// ── 4. cleanup survival
console.log("── cleanup survival");
const fakeTemp = path.join(tmp, "render-temp");
fs.mkdirSync(fakeTemp, { recursive: true });
fs.writeFileSync(path.join(fakeTemp, "chunk-0.mp4"), "x");
fs.rmSync(fakeTemp, { recursive: true, force: true }); // normal cleanup runs
t("cleanup removes temp artifacts", !fs.existsSync(fakeTemp));
t("evidence package survives cleanup", fs.existsSync(path.join(outDir, "manifest.json")) && fs.existsSync(path.join(outDir, "blind", "sample-001")));

// ── 5. capture failure non-blocking
console.log("── capture-failure non-blocking");
let threw = null, broken = null;
try {
  broken = captureIfEnabled({ root: tmp, slug: "p2cap-book", configPath: path.join(tmp, "missing.json"), reportPath, outDir: path.join(tmp, "out-broken"), env });
} catch (e) { threw = e; }
t("broken inputs → no throw", threw === null);
t("broken inputs → capture-failed reason", broken && broken.captured === false && broken.reason === "capture-failed");
const noVideo = captureIfEnabled({ root: tmp, slug: "p2cap-book", configPath, reportPath, outDir: path.join(tmp, "out-novideo"), videoPath: path.join(tmp, "nope.mp4"), env });
t("missing video → package still written, frames missing", noVideo.captured === true && noVideo.framesMissing === 5 && fs.existsSync(path.join(tmp, "out-novideo", "manifest.json")));
t("non-PASS book → nothing captured", captureIfEnabled({ root: tmp, slug: "x", configPath, reportPath, outDir: path.join(tmp, "out-fail"), env: { [FLAG]: "1" }, report: { status: "FAIL", violations: [] } }).reason.startsWith("book gate not PASS"));

// ── 6. deterministic sampling
console.log("── deterministic sampling");
const rej = rejectedSceneIds(report);
const a1 = selectPassScenes(scenes, rej, 8, 42).picked.map((p) => p.scene.id);
const a2 = selectPassScenes(scenes, rej, 8, 42).picked.map((p) => p.scene.id);
const b = selectPassScenes(scenes, rej, 8, 43).picked.map((p) => p.scene.id);
const strat = selectPassScenes(scenes, rej, 6, null).picked.map((p) => p.scene.id);
t("same seed → identical sample order", JSON.stringify(a1) === JSON.stringify(a2));
t("different seed → different order (overwhelmingly likely)", JSON.stringify(a1) !== JSON.stringify(b));
t("no seed → even stratified spread, unique scenes", new Set(strat).size === 6);
t("seeded picks stay inside the eligible population", a1.every((id) => id !== "scene-5" && id !== "scene-10"));
t("size clamps to population (request 999)", selectPassScenes(scenes, rej, 999, 1).picked.length === 58);
t("seeded picks avoid the REJECT scene (determinism × population)", [...new Set([42, 43, 7, 99].map((s) => selectPassScenes(scenes, rej, 58, s).picked.map((p) => p.scene.id)))].length === 4 && [42, 43, 7, 99].every((s) => !selectPassScenes(scenes, rej, 58, s).picked.some((p) => p.scene.id === "scene-5")));
t("resolveConfig defaults", JSON.stringify(resolveConfig({})).includes('"size":25') && resolveConfig({}).seed === null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ntest-p2-evidence-capture: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
