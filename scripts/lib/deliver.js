/**
 * deliver.js — the production GO → verified MP4 state machine (cycle 9, 2026-11-03). Used by scripts/render-deliver.js.
 *
 * Why: agents dispatched a render, then stopped at every step to ask the operator again — "dispatch?", "re-send the
 * missing segments?", "assemble?", "download?", "check the hash?". One recorded production GO
 * (render.js --authorize-render, books/<slug>/render-decision.json, bound to ONE renderInputHash) already covers that
 * whole chain. The Real cases: the-first-90-days (seg1 push recorded as failed while its ref held the bundle, segs 2-10
 * never pushed, the process gone, every segment "missing" — rescued by hand with redispatch), Hamnet + Yesteryear
 * (dispatch, cloud assembly and download done as separate asked-for steps).
 *
 * Every step re-derives the state from the book root + GitHub (render-status.gather/decide), so a restarted process
 * continues where the work is, and nothing is done twice:
 *   NO_RENDER       → render.js dispatch (needs the authorization for the CURRENT render input; else BLOCKED)
 *   RENDERING       → wait                         ASSEMBLING → attach (cloud-assemble waits on the running run)
 *   SEGMENT_FAILED  → redispatch ONLY those segments, ≤ 2 per segment per bundle; a "missing" segment waits a grace
 *                     period first (its run may not be listed yet), and nothing is re-sent while render.js still runs
 *   CLOUD_ASSEMBLE  → cloud assembly + download (≤ 2 attempts)       FETCH → download only (≤ 2 attempts)
 *   VERIFIED        → final media check + technical record (verify-render-output --media) + post-render → DONE
 *   PUBLISHED / DELIVERED → DONE, nothing touched (a film removed after upload is never fetched again by itself)
 *   UNKNOWN         → wait; ≥ unknownLimit polls in a row → BLOCKED (never act on a guess)
 *   LEGACY_NO_BUNDLE → BLOCKED (operator)
 * Never: upload, publish, cleanup, a quality-debt decision, an authorization, a local join, a --new-render.
 * Exit codes: 0 DONE · 1 FAILED (retry budget spent / a step failed for good) · 3 another driver runs this book ·
 * 4 BLOCKED (needs the operator, or GitHub unreadable) · 5 LEGACY · 6 TIME LIMIT (rerun the same command to continue).
 */

const DONE = new Set(["PUBLISHED", "DELIVERED"]);
const GRACE_MS = 5 * 60 * 1000;

/** the authorization that covers this render: production needs render-authorization for the render's input hash */
function authorizationOf({ split, decisions = [], currentInputHash = null }) {
  const mode = split ? split.mode || "PRODUCTION" : "PRODUCTION";
  const hash = split ? split.renderInputHash || null : currentInputHash;
  if (mode === "PREVIEW-ONLY") return { ok: true, mode, hash, why: "preview-only render (no production delivery)" };
  if (!hash) return { ok: false, mode, hash, why: "the render input hash is unknown (state written before it was recorded) — the operator confirms this render" };
  // the same rule as render-preflight.authorizationFor (a record without a kind predates the split: it authorized)
  const auth = decisions.filter((d) => d && d.renderInputHash === hash && (d.kind === "render-authorization" || !d.kind)).pop();
  if (!auth) return { ok: false, mode, hash, why: `no production authorization recorded for render input ${hash} (node scripts/render-decision.js --slug=<slug>)` };
  return { ok: true, mode, hash, at: auth.at, reason: auth.reason };
}

/**
 * Pure: one step. ctx = { status (decide() result), split, journal, auth, renderLockAlive, now, unknownLimit,
 *   currentInputHash }. → { kind: done|wait|run|block|fail, step, segs?, why, exit? }
 */
function planStep({ status, split, journal, auth, renderLockAlive = false, now = Date.now(), unknownLimit = 20, maxSegRetries = 2, maxAttempts = 2, currentInputHash = null }) {
  const v = status.verdict;
  if (DONE.has(v)) return { kind: "done", step: v, why: status.detail, exit: 0 };
  if (v === "VERIFIED") return journal.finalFor && journal.finalFor === journal.filmSha && journal.finalOk ? { kind: "done", step: "VERIFIED", why: "final media check already recorded for this film", exit: 0 } : { kind: "run", step: "final", why: "verified film on disk → final media check + technical record + delivery checks" };
  if (v === "LEGACY_NO_BUNDLE") return { kind: "block", step: v, why: status.detail, exit: 5 };
  if (v === "UNKNOWN") return (journal.unknownStreak || 0) + 1 >= unknownLimit ? { kind: "block", step: v, why: `GitHub run lists unreadable for ${unknownLimit} polls in a row — nothing is done on a guess`, exit: 4 } : { kind: "wait", step: v, why: status.detail, unknown: true };
  // everything below sends work to GitHub: it must be inside the operator's GO for THIS render input
  if (!auth.ok) return { kind: "block", step: "NEEDS_AUTHORIZATION", why: auth.why, exit: 4 };
  if (renderLockAlive) return { kind: "wait", step: "DISPATCHING", why: "render.js is still running for this book (its lock is alive) — nothing is re-sent beside it" };
  if (v === "NO_RENDER") {
    if (currentInputHash && auth.hash && currentInputHash !== auth.hash) return { kind: "block", step: "NEEDS_AUTHORIZATION", why: `the config changed: render input ${currentInputHash} is not the authorized ${auth.hash}`, exit: 4 };
    if ((journal.dispatches || 0) >= maxAttempts) return { kind: "fail", step: "dispatch", why: `render.js dispatched ${journal.dispatches}× and no render state appeared`, exit: 1 };
    return { kind: "run", step: "dispatch", why: "authorized, nothing dispatched yet" };
  }
  if (v === "RENDERING") return { kind: "wait", step: v, why: status.detail };
  if (v === "ASSEMBLING") return { kind: "run", step: "attach", why: status.detail };
  if (v === "CLOUD_ASSEMBLE") return (journal.assembles || 0) >= maxAttempts ? { kind: "fail", step: "assemble", why: `cloud assembly tried ${journal.assembles}× without a verified film`, exit: 1 } : { kind: "run", step: "assemble", why: status.detail };
  if (v === "FETCH") return (journal.fetches || 0) >= maxAttempts ? { kind: "fail", step: "fetch", why: `download tried ${journal.fetches}× without a sha256 match`, exit: 1 } : { kind: "run", step: "fetch", why: status.detail };
  if (v === "SEGMENT_FAILED") {
    const bad = (status.segments || []).filter((s) => s.state === "failed" || s.state === "missing");
    const spent = bad.filter((s) => ((journal.redispatch || {})[s.seg] || 0) >= maxSegRetries);
    if (spent.length) return { kind: "fail", step: "segment", segs: spent.map((s) => s.seg), why: `segment(s) ${spent.map((s) => s.seg).join(", ")} still ${spent.map((s) => s.state).join("/")} after ${maxSegRetries} re-dispatch(es) — terminal; the done segments are kept`, exit: 1 };
    // a "missing" segment may simply not be listed yet: act only once its dispatch is older than the grace period and
    // it was missing on the previous poll too. A failed run is acted on at once.
    const segOf = (k) => (split && split.segments || []).find((g) => g.seg === k) || {};
    const ready = bad.filter((s) => s.state === "failed" || (now - (Date.parse(segOf(s.seg).dispatchedAt || segOf(s.seg).pushedAt || (split && split.dispatchedAt) || 0) || 0) >= GRACE_MS && ((journal.missingSeen || {})[s.seg] || 0) >= 1));
    if (!ready.length) return { kind: "wait", step: "SEGMENT_GRACE", segs: bad.map((s) => s.seg), why: `segment(s) ${bad.map((s) => s.seg).join(", ")} have no run yet — waiting the grace period before re-sending` };
    return { kind: "run", step: "redispatch", segs: ready.map((s) => s.seg), why: `segment(s) ${ready.map((s) => `${s.seg} (${s.state}${s.conclusion ? ` ${s.conclusion}` : ""})`).join(", ")} → re-send only those` };
  }
  return { kind: "block", step: v, why: `unhandled state ${v}: ${status.detail}`, exit: 4 };
}

/** fold one observed status into the journal (counters that survive a restart) */
function observe(journal, status) {
  const j = { ...journal, missingSeen: { ...(journal.missingSeen || {}) } };
  j.unknownStreak = status.verdict === "UNKNOWN" ? (j.unknownStreak || 0) + 1 : 0;
  const missing = new Set((status.segments || []).filter((s) => s.state === "missing").map((s) => s.seg));
  for (const k of Object.keys(j.missingSeen)) if (!missing.has(Number(k))) delete j.missingSeen[k];
  for (const k of missing) j.missingSeen[k] = (j.missingSeen[k] || 0) + 1;
  return j;
}

/**
 * The loop. io = { read() → { status, split, decisions, currentInputHash, renderLockAlive, filmSha }, run(step, plan) →
 *   Promise<{ status, ok, detail? }>, sleep(ms), now(), log(line), loadJournal(), saveJournal(j) }.
 * Returns { exit, outcome, steps, journal }.
 */
async function runDeliver({ io, pollMs = 60000, maxMs = 6 * 3600 * 1000, unknownLimit = 20, once = false }) {
  const t0 = io.now();
  let journal = io.loadJournal() || {};
  const steps = [];
  for (;;) {
    const r = io.read();
    const st = await r.status;
    // counters belong to ONE render (bundle): a new bundle starts a fresh budget
    const bundle = r.split && r.split.bundleSha || null;
    if (journal.bundleSha !== bundle) journal = { bundleSha: bundle, renderInputHash: r.split && r.split.renderInputHash || null, startedAt: new Date(io.now()).toISOString() };
    journal = observe(journal, st);
    journal.filmSha = r.filmSha || null;
    const auth = authorizationOf({ split: r.split, decisions: r.decisions, currentInputHash: r.currentInputHash });
    const plan = planStep({ status: st, split: r.split, journal, auth, renderLockAlive: r.renderLockAlive, now: io.now(), unknownLimit, currentInputHash: r.currentInputHash });
    steps.push({ at: new Date(io.now()).toISOString(), verdict: st.verdict, kind: plan.kind, step: plan.step, segs: plan.segs || null, why: plan.why });
    io.log(`[${st.verdict}] ${plan.kind} ${plan.step}${plan.segs ? ` seg ${plan.segs.join(",")}` : ""} — ${plan.why}`);
    if (plan.kind === "done" || plan.kind === "block" || plan.kind === "fail") {
      journal.result = { outcome: plan.kind === "done" ? plan.step : `${plan.kind.toUpperCase()}:${plan.step}`, exit: plan.exit, why: plan.why, at: new Date(io.now()).toISOString() };
      journal.steps = (journal.steps || []).concat(steps).slice(-200);
      io.saveJournal(journal);
      return { exit: plan.exit, outcome: journal.result.outcome, steps, journal };
    }
    if (plan.kind === "run") {
      const key = { dispatch: "dispatches", assemble: "assembles", attach: "attaches", fetch: "fetches", final: "finals" }[plan.step];
      if (key) journal[key] = (journal[key] || 0) + 1;
      if (plan.step === "redispatch") { journal.redispatch = { ...(journal.redispatch || {}) }; for (const k of plan.segs) journal.redispatch[k] = (journal.redispatch[k] || 0) + 1; }
      io.saveJournal(journal);
      const res = await io.run(plan.step, plan);
      steps[steps.length - 1].result = res;
      if (plan.step === "final") {
        journal.finalOk = !!res.ok;
        journal.finalFor = journal.filmSha;
        journal.final = res.detail || null;
        if (!res.ok) {
          journal.result = { outcome: "FAILED:final", exit: 1, why: (res.detail && res.detail.problems || []).join("; ") || "final media check failed", at: new Date(io.now()).toISOString() };
          journal.steps = (journal.steps || []).concat(steps).slice(-200);
          io.saveJournal(journal);
          return { exit: 1, outcome: journal.result.outcome, steps, journal };
        }
      }
      io.saveJournal(journal);
      if (once) return { exit: 10, outcome: `STEP:${plan.step}`, steps, journal };
      continue; // re-read the state at once: the step changed it
    }
    // wait
    io.saveJournal(journal);
    if (once) return { exit: 10, outcome: `WAIT:${plan.step}`, steps, journal };
    if (io.now() - t0 >= maxMs) {
      journal.result = { outcome: "TIME_LIMIT", exit: 6, why: `still ${st.verdict} after ${Math.round(maxMs / 60000)} min — rerun the same command to continue (nothing is lost)`, at: new Date(io.now()).toISOString() };
      io.saveJournal(journal);
      return { exit: 6, outcome: "TIME_LIMIT", steps, journal };
    }
    await io.sleep(pollMs);
  }
}

module.exports = { planStep, observe, runDeliver, authorizationOf, GRACE_MS };
