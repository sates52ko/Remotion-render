/**
 * p2-evidence-capture.js — P2.2 blind production evidence capture.
 *
 * Reusable audit infrastructure, initially enabled only for P2.2 (operator,
 * roadmap Gate P2.2). An explicit feature flag turns it on; production
 * behavior is unchanged when it is off. Strictly observational:
 *   - runs AFTER the firewall gate said PASS (caller contract: the book-level
 *     report must read status PASS or nothing is captured)
 *   - never adds Vision/LLM calls — P2.2 evaluates the captured frames
 *     blindly, OUTSIDE production
 *   - never blocks a render: every failure is logged and swallowed
 *   - never disables cleanup: it makes its own durable copies under out/
 *     (gitignored) and gets out of the way
 *
 * Flag (environment):
 *   P2_EVIDENCE_CAPTURE=1         enable (default OFF)
 *   P2_EVIDENCE_SAMPLE_SIZE=25    PASS scenes to capture (>=1)
 *   P2_EVIDENCE_SEED=<int>        optional; deterministic shuffle selection
 *   P2_EVIDENCE_TAG=<string>      free-form tag recorded in the manifest
 *
 * Evidence tree (thin copies of EXISTING artifacts — no second schema):
 *   out/p2-blind-evidence/<slug>/<run>/
 *     manifest.json
 *     blind/sample-NNN/frame.png     the ONLY surface a blind evaluator sees
 *     metadata/sample-NNN/scene.json           full authored scene
 *                            visual-intent.json
 *                            visual-contract.json
 *                            gate.json        per-scene gate outcome
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FLAG = "P2_EVIDENCE_CAPTURE";
const DEFAULT_SIZE = 25;

function isCaptureEnabled(env = process.env) {
  const v = String(env[FLAG] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function resolveConfig(env = process.env) {
  const size = Math.max(1, Math.floor(Number(env.P2_EVIDENCE_SAMPLE_SIZE) || DEFAULT_SIZE));
  const seedRaw = env.P2_EVIDENCE_SEED;
  const parsed = seedRaw === undefined || seedRaw === "" ? NaN : Math.floor(Number(seedRaw));
  return {
    enabled: isCaptureEnabled(env),
    size,
    seed: Number.isNaN(parsed) ? null : parsed,
    tag: env.P2_EVIDENCE_TAG || null,
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hard (non-diagnostic) violation sceneIds — the REJECT set. */
function rejectedSceneIds(report) {
  const out = new Set();
  for (const v of (report && report.violations) || []) {
    if (v && v.sceneId != null && String(v.severity || "") !== "diagnostic") out.add(String(v.sceneId));
  }
  return out;
}

/**
 * Eligible population = PASS scenes only (gate-PASS scenes that carry a real
 * contract). Selection: seeded Fisher-Yates shuffle (deterministic per seed)
 * or, without a seed, the even stratified spread used by the P1.1 audit.
 */
function selectPassScenes(scenes, rejectedIds, size, seed = null) {
  const reject = rejectedIds instanceof Set ? rejectedIds : new Set(rejectedIds || []);
  const eligible = [];
  (scenes || []).forEach((s, index) => {
    if (!s || reject.has(String(s.id))) return;
    if (!s.visualContract && !s.visualEvidence) return;
    eligible.push({ scene: s, index });
  });
  let picked = [];
  const n = Math.min(size, eligible.length);
  if (n > 0) {
    if (seed !== null && seed !== undefined) {
      const rnd = mulberry32(seed);
      const pool = eligible.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      picked = pool.slice(0, n);
    } else if (n === 1) {
      picked = [eligible[Math.floor(eligible.length / 2)]];
    } else {
      const idxs = [...new Set(Array.from({ length: n }, (_, i) => Math.min(eligible.length - 1, Math.round((i * (eligible.length - 1)) / (n - 1)))))];
      picked = idxs.map((i) => eligible[i]);
    }
  }
  return { eligibleCount: eligible.length, picked };
}

/**
 * Capture the evidence package. Returns a summary; NEVER throws.
 * opts: { root, slug, config | configPath, report | reportPath, videoPath, outDir, env }
 */
function captureIfEnabled(opts = {}) {
  const cfg = resolveConfig(opts.env || process.env);
  if (!cfg.enabled) return { captured: false, reason: "disabled" };
  try {
    const root = opts.root || path.resolve(__dirname, "..", "..");
    const slug = opts.slug;
    if (!slug) return { captured: false, reason: "missing slug" };
    const config = opts.config || JSON.parse(fs.readFileSync(opts.configPath, "utf8"));
    const report = opts.report || JSON.parse(fs.readFileSync(opts.reportPath, "utf8"));
    if (String(report.status) !== "PASS") return { captured: false, reason: `book gate not PASS (${report.status})` };

    const scenes = config.scenes || [];
    const { eligibleCount, picked } = selectPassScenes(scenes, rejectedSceneIds(report), cfg.size, cfg.seed);
    if (!picked.length) return { captured: false, reason: "no eligible PASS scenes" };

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = opts.outDir || path.join(root, "out", "p2-blind-evidence", slug, stamp);
    const fps = (config.meta && Number(config.meta.fps)) || 30;
    const video = opts.videoPath && fs.existsSync(opts.videoPath) ? opts.videoPath : null;

    const samples = [];
    picked.forEach(({ scene, index }, i) => {
      const id = `sample-${String(i + 1).padStart(3, "0")}`;
      const frame = (scene.fromFrame || 0) + Math.floor((scene.durationFrames || 1) / 2);
      const seconds = +(frame / fps).toFixed(2);
      const metaDir = path.join(outDir, "metadata", id);
      const blindDir = path.join(outDir, "blind", id);
      fs.mkdirSync(metaDir, { recursive: true });
      fs.mkdirSync(blindDir, { recursive: true });
      fs.writeFileSync(path.join(metaDir, "scene.json"), JSON.stringify(scene, null, 2) + "\n");
      fs.writeFileSync(path.join(metaDir, "visual-intent.json"), JSON.stringify(scene.visualIntent || null, null, 2) + "\n");
      fs.writeFileSync(path.join(metaDir, "visual-contract.json"), JSON.stringify(scene.visualContract || null, null, 2) + "\n");
      const diagnostics = (report.violations || [])
        .filter((v) => v && v.sceneId === scene.id && String(v.severity) === "diagnostic")
        .map((v) => v.reasonCode);
      fs.writeFileSync(path.join(metaDir, "gate.json"), JSON.stringify({ sceneId: scene.id, gate: "PASS", bookGate: report.status, reportVersion: report.version || null, diagnostics }, null, 2) + "\n");

      let frameFile = null;
      let frameError = null;
      if (video) {
        frameFile = path.join(blindDir, "frame.png");
        try {
          // PNG (lossless, the plan's package sketch) — ffmpeg 8's mjpeg
          // encoder additionally requires -strict unofficial on limited-range
          // input, so PNG also sidesteps an encoder-strictness dependency.
          execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", video, "-frames:v", "1", frameFile]);
        } catch (e) { frameError = e.message; }
      }
      const haveFrame = !!(frameFile && fs.existsSync(frameFile));
      samples.push({
        id, sceneId: scene.id, sceneIndex: index, gate: "PASS", frameSeconds: seconds,
        blind: path.relative(outDir, haveFrame ? frameFile : blindDir),
        frameCaptured: haveFrame,
        frameError,
        metadata: path.relative(outDir, metaDir),
      });
    });

    const manifest = {
      mode: "p2.2-blind-production-sample",
      checkpoint: cfg.tag,
      createdAt: new Date().toISOString(),
      slug,
      sampleSize: cfg.size,
      seed: cfg.seed,
      counts: {
        eligiblePassScenes: eligibleCount,
        captured: samples.length,
        framesMissing: samples.filter((s) => !s.frameCaptured).length,
      },
      samples,
    };
    fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    return { captured: true, outDir, count: samples.length, framesMissing: manifest.counts.framesMissing };
  } catch (error) {
    console.warn(`⚠ P2 evidence capture failed (non-blocking): ${error.message}`);
    return { captured: false, reason: "capture-failed", error: error.message };
  }
}

module.exports = { FLAG, DEFAULT_SIZE, isCaptureEnabled, resolveConfig, rejectedSceneIds, selectPassScenes, captureIfEnabled };
