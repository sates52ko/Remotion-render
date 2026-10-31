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
 *   production    — delivery. Needs firewall PASS, or REVIEW findings covered by an accepted decision for this config;
 *                   AND (2026-10-28, Vox and Antidote alike) preview-ready's READY for this render input
 *                   (books/<slug>/preview-ready.json), or the operator's decision for this render input that carries
 *                   preview coverage (--accept-quality-debt records it when the preview is NOT READY / stale / missing).
 *                   Authorization is a separate fact from the quality verdict: a decision never turns NOT READY into READY.
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
const { renderInputHash, isMasteredAudio } = require("./render-input");
const { rawAudioFor } = require("./audio-source");

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
  // the raw it was mastered from: book.json audioSource (.m4a or .mp3), else m4a → mp3 → wav (audio-source.js)
  const rawRel = rawAudioFor(root, audio);
  const raw = fs.existsSync(path.join(root, "public", rawRel)) ? path.join(root, "public", rawRel) : null;
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
// preview (2026-10-28): { state, mute, at } when the preview was not READY at the decision — the operator's
// production authorization of THIS render input despite it. Only ever written with a renderInputHash.
function recordDecision(root, slug, { hash, inputHash = null, commit, reason, keys, preview = null }) {
  const file = decisionFile(root, slug);
  const doc = readJson(file, { note: "Operator render decisions. Written only by render.js --accept-quality-debt. Each binds to one config hash; BLOCK findings are never accepted.", decisions: [] });
  const entry = { kind: "quality-debt", at: new Date().toISOString(), commit, configHash: hash, ...(inputHash ? { renderInputHash: inputHash } : {}), reason, keys, ...(preview && inputHash ? { preview } : {}) };
  doc.decisions = (doc.decisions || []).concat([entry]);
  writeJson(file, doc);
  return entry;
}

/**
 * The operator's PRODUCTION RENDER AUTHORIZATION (2026-10-30), kept apart from accepting quality debt. Real case:
 * the-magician-s-nephew — preview READY, Vox (no firewall), no debt: render-decision said NO_DEBT ("the production
 * render needs the operator's go") and the only flag that wrote a record was --accept-quality-debt, which would have
 * recorded a debt nobody had. Written by render.js --authorize-render="<the operator's words>" only when quality and
 * preview are settled for this render input; bound to the render input (and the config bytes + book commit seen).
 * A decision written before 2026-10-30 (no kind) was the combined "accept debt = authorize" record: it still counts.
 */
function recordAuthorization(root, slug, { hash, inputHash, commit, reason, preview = null, quality = null }) {
  const file = decisionFile(root, slug);
  const doc = readJson(file, { note: "Operator render decisions: quality-debt acceptances (--accept-quality-debt) and production render authorizations (--authorize-render), each bound to one render input. BLOCK findings are never accepted.", decisions: [] });
  const entry = { kind: "render-authorization", at: new Date().toISOString(), commit, configHash: hash, renderInputHash: inputHash, reason, keys: [], ...(preview ? { preview } : {}), ...(quality ? { quality } : {}) };
  doc.decisions = (doc.decisions || []).concat([entry]);
  writeJson(file, doc);
  return entry;
}

/** The authorization that covers this render input: an explicit one, or a pre-2026-10-30 combined decision. */
function authorizationFor(decisions, inputHash) {
  if (!inputHash) return null;
  return (decisions || []).filter((d) => d && d.renderInputHash === inputHash && (d.kind === "render-authorization" || !d.kind)).pop() || null;
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
 * The PREVIEW fact for this render input (2026-10-28). books/<slug>/preview-ready.json is preview-ready.js's own
 * record; before this the production gate never read it, so a NOT READY Vox book (no firewall → NOT_APPLICABLE) got
 * a production GO with no operator decision, and an Antidote firewall PASS hid a NOT READY preview.
 *   READY      preview-ready recorded ready:true for THIS render input
 *   NOT_READY  preview-ready recorded ready:false for this render input
 *   STALE      preview-ready ran on another config (a READY on another config is not READY here)
 *   MISSING    no (readable) preview-ready.json
 * Binding: renderInputHash (lib/render-input.js — survives the runner's audio re-point). A record written before
 * preview-ready stored that hash carries only configSha256 (file bytes): it matches on bytes alone, which the
 * runner's rewritten config never does (→ STALE there: rerun preview-ready to bind it). Never migrated.
 * mute = { label, sample, n, wrong, dead, adds, pass } of the verdict run, when preview-ready recorded it.
 */
function readPreview({ root, slug, inputHash = null, configFile = null }) {
  const file = path.join(root, "books", slug, "preview-ready.json");
  const pr = readJson(file, null);
  if (!pr || typeof pr !== "object") return { state: "MISSING", ready: false, at: null, mute: null, failed: [], renderInputHash: null, detail: `no preview-ready.json — node scripts/preview-ready.js --slug=${slug}` };
  const base = { ready: pr.ready === true, at: pr.at || null, mute: pr.mute || null, failed: pr.failed || [], renderInputHash: pr.renderInputHash || null };
  let current = false;
  if (pr.renderInputHash) current = !!inputHash && pr.renderInputHash === inputHash;
  else if (pr.configSha256 && configFile && fs.existsSync(configFile)) {
    const bytes = sha(fs.readFileSync(configFile));
    current = bytes === pr.configSha256 || bytes.startsWith(String(pr.configSha256));
  }
  if (!current) return { ...base, state: "STALE", detail: `preview-ready ran on another config (${pr.renderInputHash || (pr.configSha256 ? "bytes " + String(pr.configSha256).slice(0, 16) : "unbound")}, now ${inputHash || "unreadable"}) — rerun node scripts/preview-ready.js --slug=${slug}` };
  return { ...base, state: base.ready ? "READY" : "NOT_READY", detail: base.ready ? "READY for this render input" : `NOT READY${base.failed.length ? " — " + base.failed.join("; ") : ""}` };
}

/** "mute WRONG 3/30, dead 2/30, ADDS 18/30 (holdout1)" — or "" when preview-ready recorded no mute summary. */
function muteLine(m) {
  if (!m || !m.n) return "";
  return `mute WRONG ${m.wrong}/${m.n}, dead ${m.dead}/${m.n}, ADDS ${m.adds}/${m.n}${m.label ? ` (${m.label}${m.sample && m.sample !== "fresh" ? `, ${m.sample}` : ""})` : ""}`;
}

/**
 * Pure decision logic. firewall = { status, blocks, reviews, keys: [{key, reasonCode, message}] } or null (no firewall, e.g. Vox).
 * preview = readPreview() result, or undefined = not assessed (the pre-2026-10-28 contract; preflight() and
 * render-decision.js always pass it). Returns what this render may do and, when refused, exactly why.
 *
 * PRODUCTION, in order (2026-10-28 — render AUTHORIZATION kept apart from the quality verdict, Vox and Antidote alike):
 *   1. BLOCK → REFUSED, never acceptable.
 *   2. quality: firewall PASS / no firewall → fine; REVIEW → covered only by a decision for THIS config whose keys
 *      hold every current finding (unchanged).
 *   3. preview: READY → fine; NOT_READY / STALE / MISSING → covered only by a decision for THIS render input that
 *      carries preview coverage (decision.preview, written by --accept-quality-debt since 2026-10-28). An older
 *      decision without it still covers its REVIEW keys, never a preview. A changed config is never covered.
 * PREVIEW_ONLY: BLOCK stops; the preview fact is reported, never blocks (a review render is how it gets looked at).
 */
function evaluate({ mode, firewall, hash, inputHash = null, decisions = [], preview }) {
  // a production render authorization (kind "render-authorization", 2026-10-30) never covers quality debt or a preview
  decisions = (decisions || []).filter((d) => d && d.kind !== "render-authorization");
  const out = { mode, decision: "NOT_APPLICABLE", ok: true, blockers: [], covered: [], newKeys: [], removedKeys: [], base: null, needsAccept: false, needsAcceptKinds: [], preview: preview || null, previewCovered: false, previewBase: null };
  if (firewall && firewall.blocks > 0) {
    return { ...out, ok: false, decision: "REFUSED", blockers: [`${firewall.blocks} BLOCK finding(s): no render in either mode. An accepted decision never overrides a BLOCK.`] };
  }
  if (mode === MODE.PREVIEW_ONLY) return firewall ? { ...out, decision: "PREVIEW_ONLY" } : out;

  // 2. quality
  let q = out;
  if (firewall && !firewall.reviews) q = { ...out, decision: "PASS" };
  else if (firewall) {
    const current = new Set(firewall.keys.map((k) => k.key));
    const sameHash = decisions.filter((d) => decisionMatches(d, { hash, inputHash })).pop() || null;
    const base = sameHash || decisions[decisions.length - 1] || null;
    const baseKeys = new Set(((base && base.keys) || []).map((k) => k.key));
    const newKeys = [...current].filter((k) => !baseKeys.has(k));
    const removedKeys = [...baseKeys].filter((k) => !current.has(k));
    const covered = [...current].filter((k) => baseKeys.has(k));
    if (sameHash && newKeys.length === 0) q = { ...out, decision: "ACCEPTED_DEBT", covered: [...current], removedKeys, base: sameHash };
    else {
      q = {
        ...out, ok: false, decision: "REFUSED", needsAccept: true, needsAcceptKinds: ["quality"], base, covered, newKeys, removedKeys,
        blockers: [
          `${firewall.reviews} REVIEW finding(s) on config ${hash} have no accepted decision` +
            (sameHash ? ` (the decision for this config does not cover ${newKeys.length} new finding(s)).` : base ? ` (config changed since the last decision; ${covered.length} finding(s) still covered, ${newKeys.length} new, ${removedKeys.length} gone).` : "."),
        ],
      };
    }
  }

  // 3. preview (not assessed when the caller passed none)
  if (!preview || preview.state === "READY") return q;
  // preview coverage binds to the render-input hash (a byte-hash-only entry predates preview coverage anyway) AND to the
  // preview FACT the operator saw (2026-10-29): a decision taken while the preview was MISSING accepted "no verdict
  // yet" — never a mute WRONG / DEAD that appears later. essentialism: 605 REVIEW accepted with the preview MISSING;
  // once its mute test records NOT READY, that verdict is new debt nobody accepted.
  const sameFact = (d) => d.preview && d.preview.state === preview.state && (preview.state === "MISSING" || (d.preview.at || null) === (preview.at || null));
  const forInput = decisions.filter((d) => d.preview && d.renderInputHash && inputHash && d.renderInputHash === inputHash);
  const pBase = forInput.filter(sameFact).pop() || null;
  if (pBase) return { ...q, previewCovered: true, previewBase: pBase, decision: q.decision === "REFUSED" ? "REFUSED" : "ACCEPTED_DEBT" };
  const ml = muteLine(preview.mute);
  const seen = forInput.length ? forInput[forInput.length - 1].preview : null;
  return {
    ...q, ok: false, decision: "REFUSED", needsAccept: true, needsAcceptKinds: q.needsAcceptKinds.concat(["preview"]),
    blockers: q.blockers.concat([seen
      ? `preview is now ${preview.state.replace("_", " ")}${ml ? ` (${ml})` : ""}, but the operator's decision for render input ${inputHash} saw it ${seen.state.replace("_", " ")}${seen.mute ? ` (${muteLine(seen.mute)})` : ""} — a verdict that appeared after the decision is not covered by it`
      : `preview ${preview.state.replace("_", " ")}${ml ? ` (${ml})` : ""} and no operator decision covers render input ${inputHash || "unreadable"} — production needs preview READY or the operator's recorded decision for this exact config`]),
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
function preflight({ root, slug, engine, method, mode, acceptReason = null, authorizeReason = null, skipFirewall = false, configFile, requireMasteredAudio = false, probe, credentialCall = null }) {
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

  // the preview fact (2026-10-28): production needs READY for this render input or the operator's decision
  // NOT on the render runner (requireMasteredAudio): authorization is decided by the operator's preflight BEFORE the
  // bundle is pushed; the runner re-checks the technical facts only. Re-judging there would fail a GO render whose
  // preview-ready.json predates renderInputHash (byte hash only — the runner rewrites the config bytes → STALE).
  const pv = requireMasteredAudio
    ? { state: "NOT_ASSESSED", ready: false, at: null, mute: null, failed: [], renderInputHash: null, detail: "runner: authorized by the pre-dispatch check" }
    : readPreview({ root, slug, inputHash, configFile: hashFile });
  const pvEval = pv.state === "NOT_ASSESSED" ? undefined : pv;
  let ev = evaluate({ mode, firewall, hash, inputHash, decisions: loadDecisions(root, slug), preview: pvEval });
  let acceptedNow = false;
  // needsAccept is never set with a BLOCK (evaluate returns before), so a BLOCK is never recorded as accepted
  if (acceptReason && ev.needsAccept && mode === MODE.PRODUCTION && hash && inputHash) {
    recordDecision(root, slug, {
      hash, inputHash, commit, reason: acceptReason,
      keys: (firewall ? firewall.keys : []).filter((k) => k.outcome !== "BLOCK").map(({ key, reasonCode, message }) => ({ key, reasonCode, message })),
      preview: pvEval && pv.state !== "READY" ? { state: pv.state, mute: pv.mute, at: pv.at } : null,
    });
    acceptedNow = true;
    ev = evaluate({ mode, firewall, hash, inputHash, decisions: loadDecisions(root, slug), preview: pvEval });
  }
  // the operator's production authorization (2026-10-30): its own record, never inferred from a quality verdict, a
  // preview READY or a technical GO. Recorded only when quality and preview are settled for THIS render input; the
  // runner never re-judges it (authorized by this pre-dispatch check before the bundle was pushed).
  let auth = null, authorizedNow = false, authNote = null;
  if (mode === MODE.PRODUCTION && !requireMasteredAudio) {
    auth = authorizationFor(loadDecisions(root, slug), inputHash);
    const reason = typeof authorizeReason === "string" ? authorizeReason.trim() : "";
    if (!auth && reason && ev.ok && hash && inputHash) {
      auth = recordAuthorization(root, slug, { hash, inputHash, commit, reason,
        preview: pvEval ? { state: pv.state, at: pv.at, mute: pv.mute || null } : null,
        quality: { status: !firewall ? "NOT_ASSESSED" : firewall.reviews ? "ACCEPTED_DEBT" : "PASS", reviews: firewall ? firewall.reviews : null } });
      authorizedNow = true;
    } else if (!auth && reason && !ev.ok) authNote = "not recorded: quality / preview are not settled for this render input (see the blockers)";
  }
  const compat = workerCompat({ root, method, mode });
  if (!compat.ok) blockers.push(compat.detail);
  // worker credentials BEFORE the first push (2026-10-29: a GO render failed its first dispatch — render-accounts.json
  // lived only in the main checkout). Read in place, never copied or printed; access verified once and cached.
  let cred = null;
  if (method === "github" && !requireMasteredAudio) {
    const RA = require("./render-accounts");
    try {
      const acc = RA.loadAccounts(root);
      cred = RA.verifyAccess(acc, root, credentialCall ? { call: credentialCall } : {});
      if (!cred.usable) blockers.push(`credentials: no usable render worker — ${RA.summary(cred)}`);
    } catch (e) { cred = { error: e.code || "CREDENTIALS" }; blockers.push(`credentials: ${e.code || "CREDENTIALS"} — ${e.message}`); }
  }
  const audio = requireMasteredAudio ? checkMasteredAudio({ root, configFile, ...(probe ? { probe } : {}) }) : null;
  if (audio && !audio.ok) blockers.push(`audio: ${audio.detail}`);
  blockers.push(...ev.blockers);
  if (mode === MODE.PRODUCTION && !requireMasteredAudio && ev.ok && !auth) blockers.push(`render authorization: none recorded for render input ${inputHash || "?"} — quality and preview are settled; the production render is the operator's go: rerun with --authorize-render="<the operator's words>"`);

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
  // preview + authorization (2026-10-28): the preview verdict is printed as recorded — a decision never makes it READY
  const ml = muteLine(pv.mute);
  console.log(`  preview   : ${pv.state.replace("_", " ")}${ml ? ` (${ml})` : ""}${pv.state === "READY" ? "" : ` — ${pv.detail}`}`);
  const authorization = preview ? "n/a (preview-only: not delivery-approved)"
    : requireMasteredAudio ? "runner: authorized by the pre-dispatch check"
    : ev.decision === "REFUSED" && !ev.needsAccept ? "refused (BLOCK — no decision can cover it)"
    : auth ? `${authorizedNow ? "RECORDED NOW — " : ""}operator's render authorization ${auth.at}${auth.kind ? "" : " (combined decision before 2026-10-30)"}: "${String(auth.reason || "").slice(0, 120)}"`
    : ev.needsAccept ? "NEEDS OPERATOR DECISION (quality / preview first)"
    : "MISSING — the operator's go: --authorize-render=\"<the operator's words>\"";
  console.log(`  authorization: ${authorization}${authNote ? ` (${authNote})` : ""}`);
  console.log(`  worker    : ${compat.detail}`);
  if (cred) console.log(`  credentials: ${cred.error ? `STOP (${cred.error})` : require("./render-accounts").summary(cred)}`);
  console.log(`  result    : ${ok ? "GO" : "STOP — nothing dispatched, no pixels produced"}`);
  for (const b of blockers) console.log(`    - ${b}`);
  if (!ok && ev.needsAccept) {
    console.log(`  To record the operator's decision for this exact config (${ev.needsAcceptKinds.join(" + ")}), rerun with:`);
    console.log(`    --accept-quality-debt="<why this debt is acceptable>"`);
    console.log(`  (BLOCK findings cannot be accepted; the config and the preview verdict are not changed by this.)`);
  }
  console.log("───────────────────────────────────────────────────────────────\n");

  const record = appendFacts(root, slug, {
    kind: "preflight", mode, commit, configHash: hash, renderInputHash: inputHash,
    ...(audio ? { audio: { ok: audio.ok, detail: audio.detail } } : {}),
    quality: { status: quality, blocks: firewall ? firewall.blocks : null, reviews: firewall ? firewall.reviews : null },
    preview: { state: pv.state, covered: ev.previewCovered, mute: pv.mute || null },
    decision: { kind: decisionKind, ok, accepted: acceptedNow, reason: acceptReason || null, covered: ev.covered.length, newFindings: ev.newKeys.length, goneFindings: ev.removedKeys.length },
    authorization: auth ? { at: auth.at, recordedNow: authorizedNow, kind: auth.kind || "combined" } : (mode === MODE.PRODUCTION && !requireMasteredAudio ? null : "n/a"),
    technical: "NOT_RUN",
    ...(cred ? { credentials: cred.error ? { ok: false, error: cred.error } : { ok: cred.usable > 0, source: cred.source, active: cred.active, usable: cred.usable, verified: cred.verified, refused: cred.refused.length } } : {}),
  });
  return { ok, mode, decision: ev.decision, record };
}

module.exports = { MODE, configHash, inputHashOf, decisionMatches, checkMasteredAudio, findingKey, evaluate, readPreview, muteLine, classifyDispatchCode, workerCompat, expectedFramesFor, verifyRenderOutput, preflight, recordDecision, recordAuthorization, authorizationFor, appendFacts, loadDecisions, decisionFile, factsFile, readQuality };
