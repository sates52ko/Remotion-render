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

  const one = async (sg) => {
    // the worker may already hold the bundle (a previous run pushed it, the record was lost): never re-upload
    let have;
    try { have = await io.remoteSha(sg); } catch { have = undefined; }
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
      const r = await io.push(sg);
      sg.pushAttempts = (sg.pushAttempts || 0) + 1;
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
      Object.assign(sg, { dispatchedAt: at, dispatchedSha: sha, dispatchCode: "run-exists" });
      out.skipped++;
      save(state);
      log(`  seg${sg.seg} → ${sg.username}: a run for ${sg.ref} already exists — not dispatched again`);
      continue;
    }
    if (exists === undefined && sg.dispatchCode !== undefined && sg.dispatchedSha !== sha && sg.dispatchAttemptSha === sha) {
      // a dispatch of THIS bundle was attempted and its outcome is unknown (crash, API down): firing again could start
      // a second run — leave it to the run check (render.js wait loop / render-github-redispatch.js), which re-dispatches
      // only after the run is seen to be absent
      out.skipped++;
      log(`  seg${sg.seg} → ${sg.username}: earlier dispatch outcome unknown and the run list cannot be read — not dispatched blind`);
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
const KEEP = ["pushed", "pushedAt", "pushSeconds", "pushAttempts", "pushError", "pushErrorKind", "dispatchedAt", "dispatchedSha", "dispatchCode", "dispatchAttemptSha"];
const pick = (o) => Object.fromEntries(KEEP.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** real git I/O for a repo root: async push of `sha` to `remote ref`, and the remote ref's current sha */
function gitIO({ root, sha, timeoutMs = 30 * 60 * 1000 }) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  return {
    push: (sg) => new Promise((resolve) => {
      const p = spawn("git", ["push", "--force", sg.remoteName, `${sha}:refs/heads/${sg.ref}`], { cwd: root, env, windowsHide: true });
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

module.exports = { classifyPushError, redact, defaultPushConcurrency, pushAll, dispatchAll, mergeResume, gitIO, PERMANENT_PUSH, TRANSIENT_PUSH };
