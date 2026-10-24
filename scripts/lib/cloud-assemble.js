/**
 * cloud-assemble.js — join a split GitHub render's segments ON A RUNNER, verify, publish one final artifact.
 *
 * Why: render-github-assemble.js downloads every segment (GBs) to the operator's PC and runs ffmpeg there.
 * The cloud path does the same work inside one GitHub Actions run, so the PC only dispatches and (optionally)
 * downloads the single verified film. render-github-assemble.js stays the local fallback.
 *
 * Least privilege: the worker repos are PUBLIC, so the assembling run reads the other workers' segment artifacts
 * with ITS OWN short-lived GITHUB_TOKEN (job permissions: contents read, actions read). No PAT reaches a runner and
 * no secret is stored anywhere. If GitHub refuses that cross-repo read, the run fails with ARTIFACT_ACCESS_DENIED.
 *
 * Which run per segment is decided LOCALLY (pickSegmentRun, with every worker's own token) and passed in the
 * manifest, so the runner never guesses: the segment's own ref, conclusion success, the bundle commit this render
 * pushed (a run of an older bundle on the same ref is a stale duplicate), the segment artifact present and not
 * expired; newest wins among true duplicates.
 *
 * Manifest (one workflow_dispatch input): "seg:owner/repo:runId:start-end" joined by ";" e.g.
 *   "1:alice/Remotion-render:123:0-7406;2:bob/Remotion-render:456:7407-14813"
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SEP = ";";
const segArtifact = (slug, seg) => `video-${slug}-seg${seg}`;
const FINAL_ARTIFACT = (slug) => `video-${slug}-final`;
const VERIFY_ARTIFACT = (slug) => `verify-${slug}`;

function buildManifest(entries) {
  return [...entries].sort((a, b) => a.seg - b.seg)
    .map((e) => `${e.seg}:${e.repo}:${e.runId}:${e.start}-${e.end}`).join(SEP);
}

/** Strict parse: contiguous frames from 0, segs 1..n in order, every field present. Throws on anything else. */
function parseManifest(s) {
  const out = String(s || "").split(SEP).filter(Boolean).map((part) => {
    const m = part.match(/^(\d+):([A-Za-z0-9-]+\/[A-Za-z0-9._-]+):(\d+):(\d+)-(\d+)$/);
    if (!m) throw new Error(`manifest entry "${part}" is not seg:owner/repo:runId:start-end`);
    return { seg: +m[1], repo: m[2], runId: +m[3], start: +m[4], end: +m[5] };
  });
  if (!out.length) throw new Error("empty manifest");
  out.forEach((e, k) => {
    if (e.seg !== k + 1) throw new Error(`segments must be 1..n in order (got seg ${e.seg} at position ${k + 1})`);
    if (e.end < e.start) throw new Error(`seg ${e.seg}: end ${e.end} < start ${e.start}`);
    const expectStart = k === 0 ? 0 : out[k - 1].end + 1;
    if (e.start !== expectStart) throw new Error(`seg ${e.seg} starts at ${e.start}, expected ${expectStart} (gap or overlap)`);
  });
  return out;
}

/**
 * Pick THE run for one segment out of everything GitHub lists for that worker repo.
 *   runs      — [{ id, head_branch, head_sha, status, conclusion, created_at }]
 *   artifacts — { [runId]: [{ name, expired }] } for the candidate runs
 * Returns { run, reason } — run null with the reason when there is no usable run.
 */
function pickSegmentRun({ runs, artifacts, ref, bundleSha, slug, seg }) {
  const name = segArtifact(slug, seg);
  const onRef = (runs || []).filter((r) => r.head_branch === ref);
  if (!onRef.length) return { run: null, reason: `no run on ${ref}` };
  const ok = onRef.filter((r) => r.status === "completed" && r.conclusion === "success");
  if (!ok.length) return { run: null, reason: `no successful run on ${ref} (${onRef.map((r) => r.conclusion || r.status).join(", ")})` };
  const sameBundle = bundleSha ? ok.filter((r) => r.head_sha === bundleSha) : ok;
  if (!sameBundle.length) return { run: null, reason: `successful runs on ${ref} are of another bundle (want ${String(bundleSha).slice(0, 8)}, have ${ok.map((r) => String(r.head_sha).slice(0, 8)).join(", ")})` };
  const withArtifact = sameBundle.filter((r) => (artifacts[r.id] || []).some((a) => a.name === name && !a.expired));
  if (!withArtifact.length) return { run: null, reason: `no live artifact ${name} on the successful run(s) of this bundle` };
  withArtifact.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
  return { run: withArtifact[0], reason: withArtifact.length > 1 ? `newest of ${withArtifact.length} duplicate successful runs` : "the one successful run" };
}

// ── runner side ─────────────────────────────────────────────────────────────
function probeFrames(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file], { encoding: "utf8" });
  const n = parseInt(String(r.stdout || "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}
function hasAudio(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { encoding: "utf8" });
  return /audio/.test(r.stdout || "");
}
function decodesClean(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0 && !String(r.stderr || "").trim(), err: String(r.stderr || "").slice(0, 300) };
}
const TOL = (n) => Math.max(2, Math.ceil(n * 0.005)); // split renders run ~0.4% long (AGENT_LOG); same tolerance as render-preflight

/** Verify one segment file against its frame range. */
function verifySegment(file, { start, end }) {
  const expected = end - start + 1;
  const frames = probeFrames(file);
  const dec = decodesClean(file);
  const problems = [];
  if (frames === null) problems.push("no frame count");
  else if (Math.abs(frames - expected) > TOL(expected)) problems.push(`frames ${frames} != expected ${expected}`);
  if (!dec.ok) problems.push(`decode errors: ${dec.err}`);
  if (!hasAudio(file)) problems.push("no audio stream");
  return { file: path.basename(file), expected, frames, decodes: dec.ok, audio: problems.every((p) => p !== "no audio stream"), ok: !problems.length, problems };
}

/** Concat (stream copy, frame order) + verify the result as a whole. Returns the report; never throws on a bad file. */
function concatAndVerify(segFiles, outFile, expectedTotal) {
  const list = outFile + ".parts.txt";
  fs.writeFileSync(list, segFiles.map((f) => `file '${path.resolve(f).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const c = spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", outFile], { encoding: "utf8" });
  fs.rmSync(list, { force: true });
  if (c.status !== 0) return { ok: false, problems: [`concat failed: ${String(c.stderr || "").slice(0, 300)}`] };
  const frames = probeFrames(outFile);
  const dec = decodesClean(outFile);
  const problems = [];
  if (frames === null) problems.push("no frame count");
  else if (Math.abs(frames - expectedTotal) > TOL(expectedTotal)) problems.push(`frames ${frames} != expected ${expectedTotal}`);
  if (!dec.ok) problems.push(`decode errors: ${dec.err}`);
  if (!hasAudio(outFile)) problems.push("no audio stream");
  const d = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", outFile], { encoding: "utf8" });
  const durationSec = parseFloat(String(d.stdout || "").trim());
  if (!(durationSec > 1)) problems.push("no valid duration");
  return { ok: !problems.length, problems, frames, expected: expectedTotal, decodes: dec.ok, durationSec: durationSec > 0 ? durationSec : null, bytes: fs.statSync(outFile).size };
}

/** sha256 of a (multi-GB) file, streamed. */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = require("crypto").createHash("sha256");
    fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

module.exports = { buildManifest, parseManifest, pickSegmentRun, segArtifact, FINAL_ARTIFACT, VERIFY_ARTIFACT, verifySegment, concatAndVerify, probeFrames, sha256File };
