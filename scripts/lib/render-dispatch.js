/**
 * render-dispatch.js — get ONE render bundle onto the worker pool safely: push every segment's ref, then dispatch.
 *
 * Why (2026-10-27, thinking-fast-and-slow): a bundle GitHub refuses (a 106 MB narration) was pushed at worker after
 * worker; each refusal was printed as a warning, the workflow was dispatched at a ref that did not exist, and the
 * self-heal loop pushed the same refused bundle again. 9 of 10 pushes failed, nothing ran, hours were lost. Rules:
 *   - every push is classified: a pre-receive / size / auth refusal is PERMANENT (never retried, stops the queue —
 *     the same bundle would be refused by every worker); a network failure is TRANSIENT (bounded retries, backoff);
 *   - pushes run through a bounded queue (default 1 for a big bundle, 2 for a small one; a transient failure drops
 *     it to 1) — never ten uploads of the same 80 MB at once;
 *   - nothing is dispatched until EVERY segment's ref holds the bundle; a failed run stops before any dispatch;
 *   - a worker whose ref already holds the bundle is never pushed again; a segment already dispatched with this bundle
 *     (or whose run already exists) is never dispatched again — rerunning the same command resumes;
 *   - the state is written after every step, so a crash or a refusal leaves an exact record to resume from;
 *   - push output is redacted (a remote URL can carry a token).
 * The I/O (git push, ls-remote, the dispatch API, the run lookup) is injected, so the orchestration is tested with
 * fakes and with real local bare repos (scripts/test-render-dispatch.js).
 */
const { spawn, spawnSync } = require("child_process");

const PERMANENT_PUSH = [
  /pre-receive hook declined/i,
  /\bGH001\b/,
  /exceeds GitHub'?s file size limit/i,
  /Large files detected/i,
  /this exceeds .*file size limit/i,
  /repository rule violations/i,
  /\bGH013\b/,
  /push protection/i,
  /protected branch hook declined/i,
  /Permission to \S+ denied/i,
  /The requested URL returned error: 40[134]/i,
  /Authentication failed/i,
  /Invalid username or (password|token)/i,
  /Repository not found/i,
  /does not appear to be a git repository/i,
  /no such remote/i,
];
const TRANSIENT_PUSH = [
  /Connection (reset|refused|timed out|was reset|closed)/i,
  /RPC failed/i,
  /early EOF/i,
  /remote end hung up/i,
  /unexpected disconnect/i,
  /Could not resolve host/i,
  /timed? ?out/i,
  /The requested URL returned error: (408|429|5\d\d)/i,
  /\b(SSL|TLS|schannel)\b/i,
  /Empty reply from server/i,
  /HTTP\/2 stream/i,
  /send-pack: unexpected/i,
  // GitHub also answers "[remote rejected] … (Internal Server Error)" for a server-side hiccup: retry those
  /\[remote rejected\].*\((Internal Server Error|failed to update ref|cannot lock ref|unpacker error)/i,
];

/** 'permanent' | 'transient' — unknown failures count as transient (they are retried a bounded number of times) */
function classifyPushError(text) {
  const s = String(text || "");
  if (PERMANENT_PUSH.some((re) => re.test(s))) return "permanent";
  if (TRANSIENT_PUSH.some((re) => re.test(s))) return "transient";
  return "transient";
}

/** strip credentials from anything printed or stored: URL userinfo and GitHub token shapes */
function redact(text) {
  return String(text == null ? "" : text)
    .replace(/(https?:\/\/)[^/\s@]+@/gi, "$1***@")
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g, "***");
}

const MB = 1048576;
/** push concurrency: one at a time for a big bundle (each worker receives all of it), two for a small one */
function defaultPushConcurrency(bundleBytes) {
  return bundleBytes > 50 * MB ? 1 : 2;
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Push the bundle to every segment's ref. Mutates and persists `state.segments[i]`:
 *   pushed (sha), pushedAt, pushSeconds, pushAttempts, pushError, pushErrorKind
 * io: { push(seg) → Promise<{ ok, output }>, remoteSha(seg) → Promise<string|null|undefined> }
 * Returns { ok, pushed, skipped, failed: [{ seg, kind, error }], stoppedEarly }.
 */
async function pushAll({ state, sha, io, concurrency = 2, retries = 3, backoffMs = 5000, sleep = sleepMs, save = () => {}, log = () => {} }) {
  const queue = state.segments.filter((sg) => sg.pushed !== sha);
  const result = { ok: true, pushed: 0, skipped: state.segments.length - queue.length, failed: [], stoppedEarly: false };
  for (const sg of state.segments) if (sg.pushed === sha) log(`  seg${sg.seg} → ${sg.username}: already holds ${sha.slice(0, 8)} (resume) — not pushed again`);
  let limit = Math.max(1, concurrency);
  let stop = false;
  let running = 0;
  let next = 0;

  const remoteOf = async (sg) => { try { return await io.remoteSha(sg); } catch { return undefined; } };
  const one = async (sg) => {
    // the worker may already hold the bundle (a previous run pushed it, the record was lost): never re-upload
    let have = await remoteOf(sg);
    if (have === sha) {
      Object.assign(sg, { pushed: sha, pushedAt: sg.pushedAt || new Date().toISOString(), pushError: null, pushErrorKind: null });
      result.skipped++;
      save(state);
      log(`  seg${sg.seg} → ${sg.username}: ref already at ${sha.slice(0, 8)} — not pushed again`);
      return;
    }
    for (let attempt = 1; attempt <= retries; attempt++) {
      if (stop) return;
      const t0 = Date.now();
      // cycle 9: the push is a LEASE on what the worker's ref holds right now (null = must not exist) — a ref that moved
      // since we looked is never overwritten. A ref we cannot read is never pushed blind: that attempt fails (transient).
      const r = have === undefined ? { ok: false, output: "remote ref state unreadable (ls-remote failed) — not pushed blind" } : await io.push({ ...sg, expect: have });
      sg.pushAttempts = (sg.pushAttempts || 0) + 1;
      if (!r.ok) {
        // cycle 9 (the-first-90-days, 2026-11-03): "failed to push some refs" was recorded for seg1 while the worker's ref
        // DID hold the bundle. Ask the worker before counting a failure or retrying: the remote is the truth.
        const now = await remoteOf(sg);
        if (now === sha) {
          Object.assign(sg, { pushed: sha, pushedAt: new Date().toISOString(), pushSeconds: Math.round((Date.now() - t0) / 100) / 10, pushError: null, pushErrorKind: null, pushReconciled: true });
          result.pushed++;
          save(state);
          log(`  seg${sg.seg} → ${sg.username}: push reported an error but the ref holds ${sha.slice(0, 8)} — counted as pushed (reconciled with the worker)`);
          return;
        }
        if (now !== undefined) have = now;
      }
      if (r.ok) {
        Object.assign(sg, { pushed: sha, pushedAt: new Date().toISOString(), pushSeconds: Math.round((Date.now() - t0) / 100) / 10, pushError: null, pushErrorKind: null });
        result.pushed++;
        save(state);
        log(`  seg${sg.seg} → ${sg.username}: pushed ${sha.slice(0, 8)} (${sg.pushSeconds}s${attempt > 1 ? `, attempt ${attempt}` : ""})`);
        return;
      }
      const kind = classifyPushError(r.output);
      const error = redact(String(r.output || "").trim()).slice(-600);
      Object.assign(sg, { pushError: error, pushErrorKind: kind });
      save(state);
      if (kind === "permanent") {
        // the same bundle goes to every worker: a refusal of its content repeats everywhere — stop the queue
        stop = true;
        result.stoppedEarly = true;
        result.failed.push({ seg: sg.seg, kind, error });
        log(`  ❌ seg${sg.seg} → ${sg.username}: push REFUSED (permanent, not retried): ${error.split("\n").slice(-3).join(" | ")}`);
        return;
      }
      if (attempt < retries) {
        limit = 1; // a network failure under load: one upload at a time from here on
        const wait = backoffMs * 2 ** (attempt - 1);
        log(`  ⚠ seg${sg.seg} → ${sg.username}: push failed (transient), retry ${attempt + 1}/${retries} in ${Math.round(wait / 1000)}s`);
        await sleep(wait);
      } else {
        result.failed.push({ seg: sg.seg, kind, error });
        log(`  ❌ seg${sg.seg} → ${sg.username}: push failed ${retries}× (transient): ${error.split("\n").slice(-2).join(" | ")}`);
      }
    }
  };

  await new Promise((resolve) => {
    const pump = () => {
      if ((stop || next >= queue.length) && running === 0) return resolve();
      while (!stop && running < limit && next < queue.length) {
        const sg = queue[next++];
        running++;
        one(sg).catch((e) => { result.failed.push({ seg: sg.seg, kind: "transient", error: redact(e.message) }); }).finally(() => { running--; pump(); });
      }
    };
    pump();
  });
  if (stop) for (const sg of queue) if (sg.pushed !== sha && !result.failed.some((f) => f.seg === sg.seg)) result.failed.push({ seg: sg.seg, kind: "not-attempted", error: "not pushed: the queue stopped on a permanent refusal" });
  result.ok = result.failed.length === 0;
  // PARTIAL (cycle 9): only network failures, and at least one ref holds the bundle — the pushed segments may be
  // dispatched; the others are retried later (render-deliver / redispatch). A permanent refusal is never partial.
  result.partial = !result.ok && result.failed.every((f) => f.kind === "transient") && state.segments.some((sg) => sg.pushed === sha);
  return result;
}

/**
 * Dispatch every pushed segment exactly once. Mutates and persists: dispatchedAt, dispatchedSha, dispatchCode.
 * io: { dispatch(seg) → Promise<{ code, body }>, runExists(seg) → Promise<boolean | { createdAt } | undefined> }
 * A segment is skipped when it was already dispatched with this bundle, or when a run for its ref already exists.
 */
async function dispatchAll({ state, sha, io, save = () => {}, log = () => {} }) {
  const out = { ok: true, dispatched: 0, skipped: 0, failed: [] };
  for (const sg of state.segments) {
    if (sg.pushed !== sha) { out.failed.push({ seg: sg.seg, error: "not pushed" }); continue; }
    if (sg.dispatchedSha === sha && sg.dispatchedAt) { out.skipped++; log(`  seg${sg.seg} → ${sg.username}: already dispatched (${sg.dispatchedAt}) — not dispatched again`); continue; }
    let exists;
    try { exists = await io.runExists(sg); } catch { exists = undefined; }
    if (exists === true || (exists && typeof exists === "object")) {
      // the run's OWN creation time: "now" would make the run check treat that (older) run as stale and dispatch again
      const at = exists && exists.createdAt ? new Date(exists.createdAt).toISOString() : sg.dispatchedAt || sg.pushedAt || new Date().toISOString();
      Object.assign(sg, { dispatchedAt: at, dispatchedSha: sha, dispatchCode: "run-exists", ...(exists && exists.id ? { runId: exists.id, runUrl: exists.url || null, runCreatedAt: exists.createdAt || null } : {}) });
      out.skipped++;
      save(state);
      log(`  seg${sg.seg} → ${sg.username}: a run for ${sg.ref} already exists — not dispatched again`);
      continue;
    }
    if (exists === undefined) {
      // cycle 9: "could not read the run list" is never "no run" — a run of this bundle may exist (an earlier attempt,
      // another session). Not dispatched; reported as unknown so the caller exits non-zero and reconciles later.
      out.unknown = (out.unknown || 0) + 1;
      out.failed.push({ seg: sg.seg, error: "run list unreadable — not dispatched blind", unknown: true });
      log(`  seg${sg.seg} → ${sg.username}: run list unreadable — not dispatched blind (reconcile later)`);
      continue;
    }
    sg.dispatchAttemptSha = sha;
    sg.dispatchCode = "pending";
    save(state);
    const r = await io.dispatch(sg);
    if (r && r.code === 204) {
      Object.assign(sg, { dispatchedAt: new Date().toISOString(), dispatchedSha: sha, dispatchCode: 204 });
      out.dispatched++;
      save(state);
    } else {
      sg.dispatchCode = r ? r.code : 0;
      save(state);
      out.failed.push({ seg: sg.seg, error: `HTTP ${r ? r.code : 0} ${redact(r && r.body).slice(0, 200)}` });
    }
  }
  out.ok = out.failed.length === 0;
  return out;
}

/**
 * CONFIRM (cycle 7, 2026-11-02): GitHub answers a dispatch with HTTP 204 before any run exists, and a 204 is not a render.
 * A segment counts as dispatched only when its OWN Actions run is seen on its ref (created after its push): its run id
 * and url go into the state (the segment manifest: seg, frames, worker, ref, bundle, runId). Polls up to timeoutMs.
 * io: { findRun(seg) → Promise<{ id, url, createdAt } | null (no run) | undefined (could not tell)> }
 * Returns { ok, confirmed, missing: [seg] } — never throws for a missing run; the caller decides (exit or heal).
 */
async function confirmRuns({ state, sha, io, timeoutMs = 4 * 60 * 1000, pollMs = 15000, sleep = sleepMs, save = () => {}, log = () => {}, now = () => Date.now() }) {
  const due = state.segments.filter((sg) => sg.dispatchedSha === sha);
  const start = now();
  for (;;) {
    for (const sg of due) {
      if (sg.runId) continue;
      let r;
      try { r = await io.findRun(sg); } catch { r = undefined; }
      if (r && r.id) { Object.assign(sg, { runId: r.id, runUrl: r.url || null, runCreatedAt: r.createdAt || null }); save(state); log(`  seg${sg.seg} → ${sg.username}: run ${r.id} confirmed`); }
    }
    const missing = due.filter((sg) => !sg.runId).map((sg) => sg.seg);
    if (!missing.length || now() - start >= timeoutMs) {
      state.runsConfirmedAt = missing.length ? null : new Date().toISOString();
      save(state);
      return { ok: missing.length === 0 && due.length === state.segments.length, confirmed: due.length - missing.length, missing };
    }
    await sleep(pollMs);
  }
}

/**
 * One segment's runs, as GitHub has them (cycle 9). runs: gh `run list --json databaseId,status,conclusion,headBranch,
 * headSha,createdAt` (or the REST shape: id/head_branch/head_sha/created_at). A run is THIS render's when it is on the
 * segment's ref and built from the render's bundle commit (legacy push without one: created after `since` - 60 s).
 * → { state: "live" (queued/running/succeeded — never dispatch again) | "failed" (only failed/cancelled runs) | "none", live, mine }
 */
function segmentRunState({ runs, ref, bundleSha = null, since = 0 }) {
  const bare = String(ref).replace(/^refs\/heads\//, "");
  const n = (r) => ({ id: r.databaseId != null ? r.databaseId : r.id, branch: r.headBranch || r.head_branch, sha: r.headSha || r.head_sha, created: Date.parse(r.createdAt || r.created_at || 0), status: r.status, conclusion: r.conclusion });
  const mine = (runs || []).filter((r) => {
    const x = n(r);
    if (x.branch !== bare && x.branch !== `refs/heads/${bare}`) return false;
    return bundleSha ? x.sha === bundleSha : !(x.created < since - 60000) || x.status !== "completed";
  }).sort((a, b) => n(b).id - n(a).id);
  const live = mine.find((r) => r.status !== "completed") || mine.find((r) => r.conclusion === "success") || null;
  return { state: live ? "live" : mine.length ? "failed" : "none", live, mine };
}

/**
 * Resume rule: a previous run that never FINISHED (its process stopped before the end: a refused or failed push, a
 * crash) with the same slug, bundle, mode, settings and segmentation keeps its push/dispatch marks. Anything else —
 * including a finished render whose segment failed on the runner — starts fresh, so every segment is dispatched
 * again (refs that already hold the bundle are still not uploaded again: pushAll asks the worker first).
 */
function mergeResume(prev, fresh, { newRender = false } = {}) {
  if (!prev || newRender || prev.endedAt || prev.slug !== fresh.slug || prev.bundleSha !== fresh.bundleSha || prev.totalFrames !== fresh.totalFrames) return fresh;
  if ((prev.mode || null) !== (fresh.mode || null) || String(prev.chunkSize || "") !== String(fresh.chunkSize || "") || String(prev.concurrency || "") !== String(fresh.concurrency || "")) return fresh;
  const same = (a, b) => a.seg === b.seg && a.start === b.start && a.end === b.end && a.ref === b.ref && a.username === b.username;
  if (!Array.isArray(prev.segments) || prev.segments.length !== fresh.segments.length || !fresh.segments.every((s, i) => same(s, prev.segments[i]))) return fresh;
  return { ...fresh, firstDispatchedAt: prev.firstDispatchedAt || prev.dispatchedAt, resumedAt: new Date().toISOString(), segments: fresh.segments.map((s, i) => ({ ...prev.segments[i], ...s, ...pick(prev.segments[i]) })) };
}
const KEEP = ["pushed", "pushedAt", "pushSeconds", "pushAttempts", "pushError", "pushErrorKind", "dispatchedAt", "dispatchedSha", "dispatchCode", "dispatchAttemptSha", "runId", "runUrl", "runCreatedAt"];
const pick = (o) => Object.fromEntries(KEEP.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** real git I/O for a repo root: async push of `sha` to `remote ref`, and the remote ref's current sha */
function gitIO({ root, sha, timeoutMs = 30 * 60 * 1000 }) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  return {
    // sg.expect (cycle 9): the sha the worker's ref held when we looked (null = absent) → --force-with-lease on exactly
    // that value, so a ref that moved meanwhile is refused instead of overwritten. Without it (older callers) the
    // per-render ref is force-updated as before; render/<slug>-segN refs are this render's alone (never a shared branch).
    push: (sg) => new Promise((resolve) => {
      const how = sg.expect === undefined ? ["--force"] : [`--force-with-lease=refs/heads/${sg.ref}:${sg.expect || ""}`];
      const p = spawn("git", ["push", ...how, sg.remoteName, `${sha}:refs/heads/${sg.ref}`], { cwd: root, env, windowsHide: true });
      let out = "";
      const t = setTimeout(() => { out += "\n(timed out)"; p.kill(); }, timeoutMs);
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (out += d));
      p.on("error", (e) => { clearTimeout(t); resolve({ ok: false, output: e.message }); });
      p.on("close", (code) => { clearTimeout(t); resolve({ ok: code === 0, output: redact(out) }); });
    }),
    remoteSha: async (sg) => {
      const r = spawnSync("git", ["ls-remote", sg.remoteName, `refs/heads/${sg.ref}`], { cwd: root, env, encoding: "utf8", timeout: 60000, windowsHide: true });
      if (r.status !== 0) return undefined; // could not tell — push
      const line = String(r.stdout || "").trim().split("\n").find(Boolean);
      return line ? line.split(/\s+/)[0] : null;
    },
  };
}

module.exports = { classifyPushError, redact, defaultPushConcurrency, pushAll, dispatchAll, confirmRuns, segmentRunState, mergeResume, gitIO, PERMANENT_PUSH, TRANSIENT_PUSH };
