/**
 * render-preflight.js — ONE pre-dispatch check for every book render (render.js calls it before any pixels).
 *
 * It keeps three facts apart, per book, in books/<slug>/render-facts.json (append-only, old records stay):
 *   1. technical  — did the output file exist, have the expected frame count, and decode? (verifyRenderOutput)
 *   2. quality    — the narrative firewall's PASS/FAIL with BLOCK and REVIEW counts. A render completing
 *                   never means quality PASS.
 *   3. decision   — the operator's render decision. "Accept known quality debt" is recorded in
 *                   books/<slug>/render-decision.json and binds to ONE config version. New decisions bind to the
 *                   render-input hash (lib/render-input.js: the config as the runner renders it — mastered audio
 *                   path, formatting ignored), so the runner's own `master-audio --update-config` does not void
 *                   them; any other change does. Decisions recorded before that carry only the byte hash and
 *                   still match on bytes alone (never migrated).
 *                   Same REVIEW findings on that config are not asked again. A changed config shows what the
 *                   accepted debt covers and what is new or removed, and needs a fresh decision.
 *
 * Modes (explicit, never switched after dispatch):
 *   production    — delivery. Needs firewall PASS, or REVIEW findings covered by an accepted decision for this config.
 *   preview-only  — a FULL-LENGTH review render (all frames, all segments; not a short clip). REVIEW allowed,
 *                   BLOCK stops. Not approved for delivery.
 * BLOCK findings stop both modes. No decision overrides a BLOCK.
 *
 * This module only reads the firewall report (written by scripts/validate-narrative-visual-firewall.js
 * --report-only) and writes books/<slug>/render-decision.json / render-facts.json. It never edits the
 * storyboard, config, or runs mute tests.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync, spawnSync } = require("child_process");
const { renderInputHash, isMasteredAudio, MASTERED_RE } = require("./render-input");

const MODE = { PRODUCTION: "production", PREVIEW_ONLY: "preview-only" };
const TOLERANCE_RATIO = 0.005; // Antidote split-render mp4s run ~0.4% long (see AGENT_LOG); exact match would false-fail

function sha(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n"); }

/** Config version = sha256 of the config file bytes. Any edit to the config is a new version. */
function configHash(file) { return fs.existsSync(file) ? sha(fs.readFileSync(file)).slice(0, 16) : null; }

/** Render-input version (lib/render-input.js). null when the config is missing or does not parse. */
function inputHashOf(file) { return fs.existsSync(file) ? renderInputHash(readJson(file, null)) : null; }

/** Does a recorded decision belong to this config? Render-input hash when the decision has one, else bytes. */
function decisionMatches(d, { hash, inputHash }) {
  if (d.renderInputHash) return !!inputHash && d.renderInputHash === inputHash;
  return !!hash && d.configHash === hash;
}

function durationOf(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const v = parseFloat(String(r.stdout || "").trim());
  return r.status === 0 && Number.isFinite(v) ? v : null;
}

/**
 * On the render runner the audio MUST be the master the "Master audio" step just made: meta.audio names a
 * `.mastered.m4a` that exists, is not empty and lasts as long as its raw source (0.1 s = master-audio's own
 * drift bound). Anything else stops the render — a quiet raw track or a silent missing file both pass the
 * post-render duration/decode check. `probe` is injectable for tests.
 */
function checkMasteredAudio({ root, configFile, probe = durationOf }) {
  const cfg = configFile ? readJson(path.resolve(root, configFile), null) : null;
  const audio = cfg && cfg.meta && cfg.meta.audio;
  if (!audio) return { ok: false, detail: "config has no meta.audio" };
  if (!isMasteredAudio(audio)) return { ok: false, detail: `meta.audio is ${audio}, not a mastered file — the Master audio step did not repoint it` };
  const mastered = path.join(root, "public", audio);
  if (!fs.existsSync(mastered) || fs.statSync(mastered).size === 0) return { ok: false, detail: `mastered audio public/${audio} is missing or empty` };
  const stem = audio.replace(MASTERED_RE, "");
  const raw = [".m4a", ".mp3", ".wav"].map((e) => path.join(root, "public", stem + e)).find((f) => fs.existsSync(f));
  if (!raw) return { ok: false, detail: `no raw source next to public/${audio}` };
  const dm = probe(mastered), dr = probe(raw);
  if (dm === null || dr === null) return { ok: false, detail: "ffprobe could not read the audio durations" };
  if (Math.abs(dm - dr) > 0.1) return { ok: false, detail: `mastered audio lasts ${dm.toFixed(2)} s, raw ${dr.toFixed(2)} s (> 0.1 s apart)` };
  return { ok: true, detail: `mastered public/${audio} (${dm.toFixed(2)} s, raw ${dr.toFixed(2)} s)` };
}

/** Stable identity of one REVIEW/BLOCK finding: its reason code and message. */
function findingKey(v) { return sha(`${v.reasonCode}|${v.message}`).slice(0, 16); }

function gitHead(root) {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null; }
  catch { return null; }
}

function decisionFile(root, slug) { return path.join(root, "books", slug, "render-decision.json"); }
function factsFile(root, slug) { return path.join(root, "books", slug, "render-facts.json"); }

function loadDecisions(root, slug) {
  return readJson(decisionFile(root, slug), { decisions: [] }).decisions || [];
}

/** Records an operator's "accept known quality debt" for the current config version. Append-only. */
function recordDecision(root, slug, { hash, inputHash = null, commit, reason, keys }) {
  const file = decisionFile(root, slug);
  const doc = readJson(file, { note: "Operator render decisions. Written only by render.js --accept-quality-debt. Each binds to one config hash; BLOCK findings are never accepted.", decisions: [] });
  const entry = { at: new Date().toISOString(), commit, configHash: hash, ...(inputHash ? { renderInputHash: inputHash } : {}), reason, keys };
  doc.decisions = (doc.decisions || []).concat([entry]);
  writeJson(file, doc);
  return entry;
}

function appendFacts(root, slug, entry) {
  const file = factsFile(root, slug);
  if (!fs.existsSync(path.dirname(file))) return null;
  const doc = readJson(file, { note: "Three facts per run: technical (output file), quality (firewall PASS/FAIL), decision (operator). Append-only; FAIL records are never removed.", runs: [] });
  doc.runs = (doc.runs || []).concat([{ at: new Date().toISOString(), ...entry }]);
  writeJson(file, doc);
  return entry;
}

/**
 * Pure decision logic. firewall = { status, blocks, reviews, keys: [{key, reasonCode, message}] } or null (no firewall, e.g. Vox).
 * Returns what this render may do and, when refused, exactly why.
 */
function evaluate({ mode, firewall, hash, inputHash = null, decisions = [] }) {
  const out = { mode, decision: "NOT_APPLICABLE", ok: true, blockers: [], covered: [], newKeys: [], removedKeys: [], base: null, needsAccept: false };
  if (!firewall) return out;
  if (firewall.blocks > 0) {
    return { ...out, ok: false, decision: "REFUSED", blockers: [`${firewall.blocks} BLOCK finding(s): no render in either mode. An accepted decision never overrides a BLOCK.`] };
  }
  if (mode === MODE.PREVIEW_ONLY) return { ...out, decision: "PREVIEW_ONLY" };
  if (!firewall.reviews) return { ...out, decision: "PASS" };

  const current = new Set(firewall.keys.map((k) => k.key));
  const sameHash = decisions.filter((d) => decisionMatches(d, { hash, inputHash })).pop() || null;
  const base = sameHash || decisions[decisions.length - 1] || null;
  const baseKeys = new Set(((base && base.keys) || []).map((k) => k.key));
  const newKeys = [...current].filter((k) => !baseKeys.has(k));
  const removedKeys = [...baseKeys].filter((k) => !current.has(k));
  const covered = [...current].filter((k) => baseKeys.has(k));
  if (sameHash && newKeys.length === 0) {
    return { ...out, decision: "ACCEPTED_DEBT", covered: [...current], removedKeys, base: sameHash };
  }
  return {
    ...out, ok: false, decision: "REFUSED", needsAccept: true, base, covered, newKeys, removedKeys,
    blockers: [
      `${firewall.reviews} REVIEW finding(s) on config ${hash} have no accepted decision` +
        (sameHash ? ` (the decision for this config does not cover ${newKeys.length} new finding(s)).` : base ? ` (config changed since the last decision; ${covered.length} finding(s) still covered, ${newKeys.length} new, ${removedKeys.length} gone).` : "."),
    ],
  };
}

/** Maps a GitHub dispatch HTTP code to retry behaviour. Only transient causes are retried. */
function classifyDispatchCode(code) {
  if (code === 204) return "ok";
  if (code === 0 || code === 429 || code >= 500) return "transient";
  return "permanent";
}

/** Worker compatibility: a preview-only dispatch needs the workflow to declare the preview_only input. */
function workerCompat({ root, method, mode }) {
  if (method !== "github" || mode !== MODE.PREVIEW_ONLY) return { ok: true, detail: "n/a" };
  const wf = path.join(root, ".github", "workflows", "render-video.yml");
  const declared = fs.existsSync(wf) && /^\s*preview_only:\s*$/m.test(fs.readFileSync(wf, "utf8"));
  return { ok: declared, detail: declared ? "preview_only input declared" : "render-video.yml has no preview_only input: a preview-only dispatch would be rejected by workers" };
}

/** Expected frame count from the book's config (same precedence render.js uses). */
function expectedFramesFor(root, slug) {
  for (const f of ["config.antidote.json", "config.vox.json"]) {
    const cfg = readJson(path.join(root, "books", slug, f), null);
    if (!cfg) continue;
    const meta = cfg.meta || {};
    const n = cfg.totalFrames || meta.totalFrames || meta.durationInFrames;
    if (n) return Number(n);
  }
  return null;
}

/** Technical fact: file exists, frame count near expected (container nb_frames), and the whole video decodes. */
function verifyRenderOutput({ file, expectedFrames = null }) {
  const r = { file, exists: fs.existsSync(file), frames: null, expectedFrames, decodes: null, status: "FAIL", problems: [] };
  if (!r.exists) { r.problems.push("file missing"); return r; }
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "csv=p=0", file], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) { r.problems.push(`ffprobe failed: ${probe.error ? probe.error.code : (probe.stderr || "").slice(0, 200)}`); return r; }
  const frames = parseInt(String(probe.stdout).trim(), 10);
  r.frames = Number.isFinite(frames) ? frames : null;
  if (r.frames === null) r.problems.push("no frame count in container");
  else if (expectedFrames && Math.abs(r.frames - expectedFrames) > Math.max(2, expectedFrames * TOLERANCE_RATIO)) {
    r.problems.push(`frames ${r.frames} != expected ${expectedFrames}`);
  }
  const dec = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  r.decodes = dec.status === 0 && !String(dec.stderr || "").trim();
  if (!r.decodes) r.problems.push(`decode errors: ${String(dec.stderr || dec.error || "exit " + dec.status).slice(0, 300)}`);
  r.status = r.problems.length ? "FAIL" : "VERIFIED";
  return r;
}

/** Reads the firewall report the validator just wrote and turns it into the quality fact. */
function readQuality({ root, slug, preview }) {
  const file = path.join(root, "books", slug, preview ? "narrative-visual-firewall.preview.report.json" : "narrative-visual-firewall.report.json");
  const rep = readJson(file, null);
  if (!rep) return null;
  const keys = (rep.violations || []).map((v) => ({ key: findingKey(v), reasonCode: v.reasonCode, message: v.message, outcome: v.outcome }));
  return {
    status: rep.status, productionStatus: rep.productionStatus,
    blocks: (rep.counts && rep.counts.blocks) || keys.filter((k) => k.outcome === "BLOCK").length,
    reviews: (rep.counts && rep.counts.reviews) || keys.filter((k) => k.outcome !== "BLOCK").length,
    keys,
  };
}

/**
 * The single pre-dispatch check. Runs the firewall (report-only, writes its report), evaluates the mode,
 * applies an explicit accept if given, checks worker compatibility, prints one summary, and records the facts.
 * Returns { ok, mode, decision, record }. Callers exit when !ok.
 */
function preflight({ root, slug, engine, method, mode, acceptReason = null, skipFirewall = false, configFile, requireMasteredAudio = false, probe }) {
  const hashFile = configFile ? path.resolve(root, configFile) : null;
  const hash = hashFile ? configHash(hashFile) : null;
  const inputHash = hashFile ? inputHashOf(hashFile) : null;
  const commit = gitHead(root);
  const preview = mode === MODE.PREVIEW_ONLY;
  let firewall = null;
  let firewallNote = "n/a (no narrative firewall for this engine)";
  const blockers = [];

  if (engine === "antidote" && skipFirewall) {
    firewallNote = "SKIPPED (--skip-narrative-firewall: emergency escape hatch, not for delivery)";
  } else if (engine === "antidote") {
    const cmd = `node scripts/validate-narrative-visual-firewall.js --slug=${slug} --report-only${preview ? " --preview-only" : ""}`;
    const run = spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    firewall = run.status === 0 ? readQuality({ root, slug, preview }) : null;
    if (!firewall) blockers.push(`firewall did not produce a report (exit ${run.status}): ${String(run.stderr || "").slice(0, 200)}`);
  }

  let ev = evaluate({ mode, firewall, hash, inputHash, decisions: loadDecisions(root, slug) });
  let acceptedNow = false;
  if (acceptReason && ev.needsAccept && mode === MODE.PRODUCTION && hash && inputHash) {
    recordDecision(root, slug, { hash, inputHash, commit, reason: acceptReason, keys: firewall.keys.filter((k) => k.outcome !== "BLOCK").map(({ key, reasonCode, message }) => ({ key, reasonCode, message })) });
    acceptedNow = true;
    ev = evaluate({ mode, firewall, hash, inputHash, decisions: loadDecisions(root, slug) });
  }
  const compat = workerCompat({ root, method, mode });
  if (!compat.ok) blockers.push(compat.detail);
  const audio = requireMasteredAudio ? checkMasteredAudio({ root, configFile, ...(probe ? { probe } : {}) }) : null;
  if (audio && !audio.ok) blockers.push(`audio: ${audio.detail}`);
  blockers.push(...ev.blockers);

  const quality = !firewall ? "NOT_ASSESSED" : firewall.blocks ? "FAIL" : firewall.reviews ? "FAIL" : "PASS";
  const decisionKind = acceptedNow ? "ACCEPTED_DEBT (recorded now)" : ev.decision;
  const ok = blockers.length === 0;

  const modeLabel = preview ? "PREVIEW-ONLY (full-length review render, all frames; not a short clip; not delivery-approved)" : "PRODUCTION (delivery)";
  console.log("\n── Pre-dispatch check ─────────────────────────────────────────");
  console.log(`  mode      : ${modeLabel}`);
  console.log(`  commit    : ${commit || "unknown"}`);
  console.log(`  config    : ${configFile || "n/a"}${hash ? ` (version ${hash}, render input ${inputHash || "unreadable"})` : ""}`);
  if (audio) console.log(`  audio     : ${audio.ok ? "OK" : "STOP"} — ${audio.detail}`);
  console.log(`  quality   : ${firewall ? `${quality} — ${firewall.blocks} BLOCK, ${firewall.reviews} REVIEW (firewall ${firewall.status})` : firewallNote}`);
  if (firewall && ev.decision === "ACCEPTED_DEBT") console.log(`  decision  : ${decisionKind} — covers ${ev.covered.length} REVIEW finding(s) on this config; none new`);
  else if (firewall && ev.needsAccept) console.log(`  decision  : ${decisionKind} — covered ${ev.covered.length}, new ${ev.newKeys.length}, gone ${ev.removedKeys.length}`);
  else console.log(`  decision  : ${decisionKind}${ev.decision === "PREVIEW_ONLY" && firewall && firewall.reviews ? ` — ${firewall.reviews} REVIEW finding(s) reported as quality debt` : ""}`);
  console.log(`  worker    : ${compat.detail}`);
  console.log(`  result    : ${ok ? "GO" : "STOP — nothing dispatched, no pixels produced"}`);
  for (const b of blockers) console.log(`    - ${b}`);
  if (!ok && ev.needsAccept) {
    console.log(`  To accept this quality debt for this exact config, rerun with:`);
    console.log(`    --accept-quality-debt="<why this debt is acceptable>"`);
    console.log(`  (BLOCK findings cannot be accepted; the config is not changed by this.)`);
  }
  console.log("───────────────────────────────────────────────────────────────\n");

  const record = appendFacts(root, slug, {
    kind: "preflight", mode, commit, configHash: hash, renderInputHash: inputHash,
    ...(audio ? { audio: { ok: audio.ok, detail: audio.detail } } : {}),
    quality: { status: quality, blocks: firewall ? firewall.blocks : null, reviews: firewall ? firewall.reviews : null },
    decision: { kind: decisionKind, ok, accepted: acceptedNow, reason: acceptReason || null, covered: ev.covered.length, newFindings: ev.newKeys.length, goneFindings: ev.removedKeys.length },
    technical: "NOT_RUN",
  });
  return { ok, mode, decision: ev.decision, record };
}

module.exports = { MODE, configHash, inputHashOf, decisionMatches, checkMasteredAudio, findingKey, evaluate, classifyDispatchCode, workerCompat, expectedFramesFor, verifyRenderOutput, preflight, recordDecision, appendFacts, loadDecisions, decisionFile, factsFile, readQuality };
