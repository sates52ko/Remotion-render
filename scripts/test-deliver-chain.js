#!/usr/bin/env node
// PRODUCTION GO → VERIFIED MP4 (cycle 9, 2026-11-03). Fixtures + local bare git repos only — nothing touches GitHub.
//   1  the-first-90-days dispatch failure (seg1 "failed to push some refs" while its ref held the bundle; segs 2-10 never
//      pushed; the process gone) — reconciled with the worker, partial pushes no longer hold the others back
//   2  retry / duplicate protection: run state per segment by bundle sha, unreadable ≠ missing, lease push (real git)
//   3  the render-deliver state machine for every intermediate state (operator list) + budgets + authorization scope
//   4  the loop end to end against a simulated pool, restart/resume (once-steps across "processes"), failures
//   5  media verification: real sync vs container/join effects (Hamnet-shaped fixture), loudness report-only
//   6  render-status: delivered / published / cleaned states are an END, never a re-render or a re-download
// Run: node scripts/test-deliver-chain.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const rd = require("./lib/render-dispatch");
const D = require("./lib/deliver");
const MV = require("./lib/media-verify");
const { decide, exitFor, splitFileFor } = require("./render-status");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info !== undefined ? `  (${String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 300)})` : ""}`); if (!ok) failed++; };
const SHA = "9c1be1bec6a054334c4845058fdce4795c55deb4"; // the-first-90-days bundle
const segsOf = (n, slug = "the-first-90-days") => Array.from({ length: n }, (_, i) => ({ seg: i + 1, start: i * 6208, end: Math.min((i + 1) * 6208, 62079) - 1, username: `u${i + 1}`, repo: "Remotion-render", remoteName: `render-worker-${i + 1}`, ref: `render/${slug}-seg${i + 1}` }));
const nosleep = async () => {};

(async () => {
  // ── 1. the-first-90-days ────────────────────────────────────────────────
  {
    // the exact record found on disk (2026-11-03): seg1 one attempt, transient, not pushed; segs 2-10 untouched
    const fixture = { slug: "the-first-90-days", bundleSha: SHA, totalFrames: 62079, renderInputHash: "9716bbb06a9bdef5", mode: "PRODUCTION", chunkSize: "400", dispatchedAt: "2026-11-03T08:51:27.000Z", segments: segsOf(10) };
    Object.assign(fixture.segments[0], { pushAttempts: 1, pushError: "error: failed to push some refs to 'https://github.com/sates52ko/Remotion-render.git'", pushErrorKind: "transient" });
    // what the workers really held (AGENT_LOG 2026-11-03: seg1's ref = the bundle)
    const remote = new Map([["render/the-first-90-days-seg1", SHA]]);
    const uploads = [];
    const io = {
      remoteSha: async (sg) => remote.get(sg.ref) || null,
      push: async (sg) => { uploads.push({ seg: sg.seg, expect: sg.expect }); remote.set(sg.ref, SHA); return { ok: true, output: "" }; },
    };
    const st = rd.mergeResume(JSON.parse(JSON.stringify(fixture)), { ...fixture, segments: segsOf(10) });
    const r = await rd.pushAll({ state: st, sha: SHA, io, concurrency: 2, sleep: nosleep });
    t("1 F90 fixture: seg1's ref already holds the bundle → not uploaded again (the remote is the truth)", !uploads.some((u) => u.seg === 1) && st.segments[0].pushed === SHA, uploads);
    t("1 F90 fixture: segs 2-10 are pushed (nothing held back by seg1's old error)", r.ok && uploads.length === 9 && st.segments.every((g) => g.pushed === SHA));
    t("1 every push is a lease on what the ref held (absent → must not exist)", uploads.every((u) => u.expect === null));

    // the push that "failed" but landed: error text, yet the ref holds the bundle afterwards → reconciled, not retried
    const remote2 = new Map();
    let calls = 0;
    const io2 = {
      remoteSha: async (sg) => remote2.get(sg.ref) || null,
      push: async (sg) => { calls++; remote2.set(sg.ref, SHA); return sg.seg === 1 ? { ok: false, output: "error: failed to push some refs to 'https://x@github.com/u1/Remotion-render.git'" } : { ok: true, output: "" }; },
    };
    const st2 = { ...fixture, segments: segsOf(10) };
    const r2 = await rd.pushAll({ state: st2, sha: SHA, io: io2, concurrency: 2, sleep: nosleep });
    t("1 'failed to push some refs' + the ref holds the bundle → counted as pushed (pushReconciled), no retry", r2.ok && calls === 10 && st2.segments[0].pushReconciled === true && !st2.segments[0].pushError);

    // seg1's network keeps failing: the other nine are pushed, the result is PARTIAL (not a stop, not a success)
    const remote3 = new Map();
    const io3 = {
      remoteSha: async (sg) => remote3.get(sg.ref) || null,
      push: async (sg) => { if (sg.seg === 1) return { ok: false, output: "fatal: the remote end hung up unexpectedly" }; remote3.set(sg.ref, SHA); return { ok: true, output: "" }; },
    };
    const st3 = { ...fixture, segments: segsOf(10) };
    const r3 = await rd.pushAll({ state: st3, sha: SHA, io: io3, concurrency: 2, retries: 3, backoffMs: 1, sleep: nosleep });
    t("1 one segment's network failure: 9 pushed, seg1 failed after 3 attempts, result PARTIAL (exit stays non-zero)", !r3.ok && r3.partial && r3.failed.length === 1 && r3.failed[0].seg === 1 && st3.segments.filter((g) => g.pushed === SHA).length === 9 && st3.segments[0].pushAttempts === 3);
    // dispatch only what holds the bundle; the missing one is reported
    const fired = [];
    const d3 = await rd.dispatchAll({ state: st3, sha: SHA, io: { dispatch: async (sg) => { fired.push(sg.seg); return { code: 204 }; }, runExists: async () => false } });
    t("1 partial: the 9 pushed segments are dispatched, seg1 is reported 'not pushed' (dispatch result not ok)", fired.length === 9 && !fired.includes(1) && !d3.ok && d3.failed.some((f) => f.seg === 1 && /not pushed/.test(f.error)));
    // a PERMANENT refusal is never partial
    const st4 = { ...fixture, segments: segsOf(3) };
    const r4 = await rd.pushAll({ state: st4, sha: SHA, io: { remoteSha: async () => null, push: async () => ({ ok: false, output: "remote: error: GH001: Large files detected" }) }, concurrency: 1, sleep: nosleep });
    t("1 a permanent refusal stops the queue and is NOT partial (the same bundle would be refused everywhere)", !r4.ok && !r4.partial && r4.stoppedEarly);
    // a ref that cannot be read is never pushed blind
    let blind = 0;
    const st5 = { ...fixture, segments: segsOf(1) };
    const r5 = await rd.pushAll({ state: st5, sha: SHA, io: { remoteSha: async () => undefined, push: async () => { blind++; return { ok: true, output: "" }; } }, retries: 2, backoffMs: 1, sleep: nosleep });
    t("1 ls-remote unreadable → no blind push, a transient failure (retried, then reported)", blind === 0 && !r5.ok && r5.failed[0].kind === "transient");
  }

  // ── 2. retry / duplicate protection ─────────────────────────────────────
  {
    const run = (id, status, conclusion, sha = SHA, branch = "render/bk-seg1") => ({ databaseId: id, status, conclusion, headSha: sha, headBranch: branch, createdAt: "2026-11-03T09:00:00Z" });
    let s = rd.segmentRunState({ runs: [run(5, "completed", "failure"), run(7, "in_progress", null)], ref: "render/bk-seg1", bundleSha: SHA });
    t("2 a running run of this bundle → live (never dispatched again)", s.state === "live" && s.live.databaseId === 7);
    s = rd.segmentRunState({ runs: [run(5, "completed", "failure"), run(6, "completed", "cancelled")], ref: "render/bk-seg1", bundleSha: SHA });
    t("2 only failed/cancelled runs of this bundle → failed (re-send allowed)", s.state === "failed" && s.mine.length === 2);
    s = rd.segmentRunState({ runs: [run(8, "completed", "success", "a".repeat(40))], ref: "render/bk-seg1", bundleSha: SHA });
    t("2 a success of ANOTHER bundle on the same ref does not count", s.state === "none");
    s = rd.segmentRunState({ runs: [{ id: 9, status: "completed", conclusion: "success", head_sha: SHA, head_branch: "render/bk-seg1", created_at: "2026-11-03T09:00:00Z" }], ref: "refs/heads/render/bk-seg1", bundleSha: SHA });
    t("2 the REST shape (id / head_sha / head_branch) is read the same way", s.state === "live");
    // dispatchAll: unreadable is never "missing"; a live run is recorded with its id
    const st = { segments: [{ seg: 1, pushed: SHA, username: "u", ref: "render/bk-seg1" }, { seg: 2, pushed: SHA, username: "u", ref: "render/bk-seg2" }] };
    let fired = 0;
    const d = await rd.dispatchAll({ state: st, sha: SHA, io: { dispatch: async () => { fired++; return { code: 204 }; }, runExists: async (sg) => (sg.seg === 1 ? { id: 41, url: "u", createdAt: "2026-11-03T09:00:00Z" } : undefined) } });
    t("2 a run that exists → recorded (run id 41), not dispatched; an unreadable run list → NOT dispatched, reported unknown", fired === 0 && st.segments[0].runId === 41 && st.segments[0].dispatchCode === "run-exists" && d.unknown === 1 && !d.ok);
    // the same command twice: nothing fires twice
    const st2 = { segments: [{ seg: 1, pushed: SHA, username: "u", ref: "r1" }] };
    let n = 0;
    const io = { dispatch: async () => { n++; return { code: 204 }; }, runExists: async () => (n ? { id: 1 } : false) };
    await rd.dispatchAll({ state: st2, sha: SHA, io });
    delete st2.segments[0].dispatchedSha; // even a lost record: GitHub says the run exists
    await rd.dispatchAll({ state: st2, sha: SHA, io });
    t("2 rerun after a lost record: the run seen on GitHub stops a second dispatch", n === 1);

    // the lease on a REAL repo: a ref that moved since we looked is refused, never overwritten
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c9-lease-"));
    try {
      const sh = (a, cwd) => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim(); };
      const bare = path.join(tmp, "w.git"), work = path.join(tmp, "work");
      sh(["init", "-q", "--bare", bare], tmp); sh(["init", "-q", work], tmp);
      const commit = (msg) => { fs.writeFileSync(path.join(work, "f.txt"), msg); sh(["add", "f.txt"], work); sh(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", msg], work); return sh(["rev-parse", "HEAD"], work); };
      const a = commit("a"), b = commit("b"), c = commit("c");
      sh(["remote", "add", "w", bare], work);
      sh(["push", "-q", "w", `${a}:refs/heads/render/bk-seg1`], work);
      const seg = { seg: 1, remoteName: "w", ref: "render/bk-seg1" };
      const looked = await rd.gitIO({ root: work, sha: b }).remoteSha(seg);
      sh(["push", "-q", "--force", "w", `${c}:refs/heads/render/bk-seg1`], work); // someone else moves the ref meanwhile
      const r = await rd.gitIO({ root: work, sha: b }).push({ ...seg, expect: looked });
      t("2 real git: a lease push on a ref that moved is REFUSED (the other bundle stays)", !r.ok && sh(["rev-parse", "refs/heads/render/bk-seg1"], bare) === c, r.output);
      const r2 = await rd.gitIO({ root: work, sha: b }).push({ ...seg, expect: c });
      t("2 real git: the lease on the current value updates the per-render ref", r2.ok && sh(["rev-parse", "refs/heads/render/bk-seg1"], bare) === b, r2.output);
      const r3 = await rd.gitIO({ root: work, sha: b }).push({ seg: 2, remoteName: "w", ref: "render/bk-seg2", expect: null });
      t("2 real git: a new ref with expect=null (must not exist) is created", r3.ok && sh(["rev-parse", "refs/heads/render/bk-seg2"], bare) === b, r3.output);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  // ── 3. the state machine, state by state ────────────────────────────────
  {
    const AUTH = { ok: true, hash: "h1" };
    const split = { bundleSha: SHA, renderInputHash: "h1", dispatchedAt: new Date(Date.now() - 60 * 60000).toISOString(), segments: segsOf(3).map((g) => ({ ...g, dispatchedAt: new Date(Date.now() - 60 * 60000).toISOString() })) };
    const P = (status, extra = {}) => D.planStep({ status, split, journal: {}, auth: AUTH, ...extra });
    let p = P({ verdict: "NO_RENDER" }, { split: null, currentInputHash: "h1" });
    t("3 dispatch not started + GO for this input → run dispatch", p.kind === "run" && p.step === "dispatch");
    p = P({ verdict: "NO_RENDER" }, { split: null, auth: D.authorizationOf({ split: null, decisions: [], currentInputHash: "h1" }) });
    t("3 dispatch not started, NO GO recorded → BLOCKED (exit 4), nothing sent", p.kind === "block" && p.exit === 4 && p.step === "NEEDS_AUTHORIZATION");
    p = P({ verdict: "NO_RENDER" }, { split: null, currentInputHash: "h2" });
    t("3 the config changed after the GO (input h2 ≠ authorized h1) → BLOCKED", p.kind === "block" && /not the authorized/.test(p.why));
    p = P({ verdict: "SEGMENT_FAILED", segments: [{ seg: 1, state: "done" }, { seg: 2, state: "missing" }, { seg: 3, state: "done" }] });
    t("3 partial push failure, first sight of a missing segment → wait (grace), nothing re-sent yet", p.kind === "wait" && p.step === "SEGMENT_GRACE");
    p = P({ verdict: "SEGMENT_FAILED", segments: [{ seg: 1, state: "done" }, { seg: 2, state: "missing" }, { seg: 3, state: "done" }] }, { journal: { missingSeen: { 2: 1 } } });
    t("3 … missing on two polls and past the grace period → re-send ONLY seg 2", p.kind === "run" && p.step === "redispatch" && JSON.stringify(p.segs) === "[2]");
    p = P({ verdict: "SEGMENT_FAILED", segments: [{ seg: 2, state: "missing" }] }, { journal: { missingSeen: { 2: 1 } }, renderLockAlive: true });
    t("3 render.js still alive (its lock) → wait, nothing re-sent beside it", p.kind === "wait" && p.step === "DISPATCHING");
    p = P({ verdict: "RENDERING" });
    t("3 run in progress → wait", p.kind === "wait");
    p = P({ verdict: "CLOUD_ASSEMBLE" });
    t("3 runs completed → cloud assembly", p.kind === "run" && p.step === "assemble");
    p = P({ verdict: "SEGMENT_FAILED", segments: [{ seg: 3, state: "failed", conclusion: "failure" }] });
    t("3 a chunk/segment failed on the runner → re-send that segment at once", p.kind === "run" && JSON.stringify(p.segs) === "[3]");
    p = P({ verdict: "SEGMENT_FAILED", segments: [{ seg: 3, state: "failed" }] }, { journal: { redispatch: { 3: 2 } } });
    t("3 … failed again after 2 re-sends → FAILED (terminal, exit 1), done segments kept", p.kind === "fail" && p.exit === 1 && /terminal/.test(p.why));
    p = P({ verdict: "CLOUD_ASSEMBLE" }, { journal: { assembles: 2 } });
    t("3 assembly failed twice → FAILED (exit 1)", p.kind === "fail" && p.exit === 1);
    p = P({ verdict: "ASSEMBLING" });
    t("3 an assembly already running → attach (never a second assembly)", p.kind === "run" && p.step === "attach");
    p = P({ verdict: "FETCH" });
    t("3 download missing → fetch only", p.kind === "run" && p.step === "fetch");
    p = P({ verdict: "VERIFIED" }, { journal: { filmSha: "s" } });
    t("3 MP4 verified on disk → final media check (once)", p.kind === "run" && p.step === "final");
    p = P({ verdict: "VERIFIED" }, { journal: { filmSha: "s", finalFor: "s", finalOk: true } });
    t("3 … recorded for this film → DONE (exit 0)", p.kind === "done" && p.exit === 0);
    for (const v of ["PUBLISHED", "DELIVERED"]) { p = P({ verdict: v }, { auth: { ok: false, why: "x" } }); t(`3 ${v} → DONE, no step (even without an authorization)`, p.kind === "done" && p.exit === 0); }
    p = P({ verdict: "UNKNOWN" }, { journal: { unknownStreak: 19 } });
    t("3 GitHub unreadable 20 polls in a row → BLOCKED (exit 4), never a guess", p.kind === "block" && p.exit === 4);
    p = P({ verdict: "LEGACY_NO_BUNDLE" });
    t("3 legacy push → BLOCKED for the operator (exit 5)", p.kind === "block" && p.exit === 5);
    p = P({ verdict: "CLOUD_ASSEMBLE" }, { auth: { ok: false, why: "no production authorization recorded" } });
    t("3 work outside the GO (no authorization for this render input) → BLOCKED, not done", p.kind === "block" && p.step === "NEEDS_AUTHORIZATION");
    const a1 = D.authorizationOf({ split: { renderInputHash: "h1" }, decisions: [{ kind: "quality-debt", renderInputHash: "h1" }] });
    t("3 a quality-debt decision is NOT a production GO", !a1.ok);
    const a2 = D.authorizationOf({ split: { renderInputHash: "h1" }, decisions: [{ kind: "render-authorization", renderInputHash: "h0" }] });
    t("3 a GO for another render input does not cover this one", !a2.ok);
    t("3 a preview-only render needs no production GO", D.authorizationOf({ split: { mode: "PREVIEW-ONLY" } }).ok);
    const src = fs.readFileSync(path.join(__dirname, "lib", "deliver.js"), "utf8") + fs.readFileSync(path.join(__dirname, "render-deliver.js"), "utf8");
    const forbidden = ["render-github-cleanup", "purge-render-branches", "render-purge", "--accept-quality-debt", "--authorize-render=", "--new-render", "render-github-assemble.js", "--local-assemble", "package-youtube"];
    t("3 the driver never calls cleanup, publish, a debt/authorization record, a new render or a local join", !forbidden.some((f) => new RegExp(`node\\(\\s*"${f}|"${f}`).test(src)), forbidden.filter((f) => src.includes(`"${f}`)));
  }

  // ── 4. the loop against a simulated pool, restart/resume ─────────────────
  {
    // world: a render that has to be dispatched, renders, gets seg 2 lost, is assembled, fetched and verified
    const mkWorld = (o = {}) => ({ split: null, segs: {}, assembled: false, fetched: false, asmFails: o.asmFails || 0, losesSeg2: !!o.losesSeg2, calls: [], t: Date.parse("2026-11-03T12:00:00Z") });
    const statusOf = (w) => {
      if (w.fetched) return { verdict: "VERIFIED", detail: "on disk" };
      if (w.assembled) return { verdict: "FETCH", detail: "verified in the cloud" };
      if (!w.split) return { verdict: "NO_RENDER", detail: "" };
      const per = [1, 2, 3].map((k) => ({ seg: k, state: w.segs[k] || "missing" }));
      if (per.some((p) => p.state === "running")) return { verdict: "RENDERING", detail: "", segments: per };
      if (per.some((p) => p.state === "missing" || p.state === "failed")) return { verdict: "SEGMENT_FAILED", detail: "", segments: per };
      return { verdict: "CLOUD_ASSEMBLE", detail: "", segments: per };
    };
    const ioFor = (w, store) => ({
      read: () => ({ status: Promise.resolve(statusOf(w)), split: w.split, decisions: [{ kind: "render-authorization", renderInputHash: "h1" }], currentInputHash: "h1", renderLockAlive: false, filmSha: w.fetched ? "film" : null }),
      run: async (step, plan) => {
        w.calls.push(plan.segs ? `${step}:${plan.segs.join(",")}` : step);
        if (step === "dispatch") { w.split = { bundleSha: SHA, renderInputHash: "h1", dispatchedAt: new Date(w.t).toISOString(), segments: segsOf(3).map((g) => ({ ...g, dispatchedAt: new Date(w.t).toISOString() })) }; w.segs = { 1: "running", 2: w.losesSeg2 ? undefined : "running", 3: "running" }; }
        if (step === "redispatch") for (const k of plan.segs) w.segs[k] = "running";
        if (step === "assemble") { if (w.asmFails > 0) { w.asmFails--; return { ok: false, status: 1 }; } w.assembled = true; }
        if (step === "fetch") w.fetched = true;
        if (step === "final") return { ok: true, status: 0, detail: { technical: "VERIFIED" } };
        return { ok: true, status: 0 };
      },
      sleep: async (ms) => { w.t += ms; for (const k of [1, 2, 3]) if (w.segs[k] === "running") w.segs[k] = "done"; },
      now: () => w.t, log: () => {}, loadJournal: () => store.j || null, saveJournal: (j) => { store.j = JSON.parse(JSON.stringify(j)); },
    });
    let w = mkWorld(), store = {};
    let res = await D.runDeliver({ io: ioFor(w, store), pollMs: 60000 });
    t("4 one GO → dispatch → wait → cloud assembly → fetch → final → DONE, each step once", res.exit === 0 && res.outcome === "VERIFIED" && w.calls.join(" ") === "dispatch assemble fetch final", w.calls);
    // seg 2 never appears: grace, then re-sent once
    w = mkWorld({ losesSeg2: true }); store = {};
    res = await D.runDeliver({ io: ioFor(w, store), pollMs: 60000 });
    t("4 a segment lost at dispatch is re-sent ONCE after the grace period, then the chain finishes", res.exit === 0 && w.calls.filter((c) => c.startsWith("redispatch")).join() === "redispatch:2" && w.calls.at(-1) === "final", w.calls);
    // restart: a new "process" per step (once), the journal + the world persist — same result, nothing twice
    w = mkWorld({ losesSeg2: true }); store = {};
    let n = 0;
    do { res = await D.runDeliver({ io: ioFor(w, store), pollMs: 60000, once: true }); if (res.exit === 10 && res.outcome.startsWith("WAIT")) await ioFor(w, store).sleep(60000); n++; } while (res.exit === 10 && n < 50);
    t("4 restart after every step (a new process each time): same DONE, dispatch 1×, seg-2 re-send 1×, assembly 1×", res.exit === 0 && w.calls.filter((c) => c === "dispatch").length === 1 && w.calls.filter((c) => c === "redispatch:2").length === 1 && w.calls.filter((c) => c === "assemble").length === 1, w.calls);
    // assembly fails twice → FAILED, exit 1, not an endless loop
    w = mkWorld({ asmFails: 5 }); store = {};
    res = await D.runDeliver({ io: ioFor(w, store), pollMs: 60000 });
    t("4 cloud assembly failing → 2 attempts, then FAILED (exit 1) with the reason", res.exit === 1 && /assemble/.test(res.outcome) && w.calls.filter((c) => c === "assemble").length === 2, [res, w.calls]);
    // a time limit is resumable (exit 6), not a failure
    w = mkWorld(); store = {};
    const io = ioFor(w, store);
    io.sleep = async (ms) => { w.t += ms; }; // the pool never finishes
    res = await D.runDeliver({ io, pollMs: 60000, maxMs: 10 * 60000 });
    t("4 still rendering at the time limit → exit 6 (rerun continues), no extra dispatch", res.exit === 6 && w.calls.join() === "dispatch");
  }

  // ── 5. media verification ───────────────────────────────────────────────
  {
    // Hamnet-shaped: 30 fps, chunk 400, segments of 1200 frames; each join holds the video 42.7 ms and the audio stays
    // continuous with 2048 extra samples per chunk (both streams stretch together)
    const fps = 30, fd = 1 / 30, frames = 3600, chunk = 400, segStarts = [0, 1200, 2400];
    const segStartOf = (i) => segStarts.filter((s) => s <= i).pop();
    const pts = []; let tt = 0;
    for (let i = 0; i < frames; i++) { if (i > 0 && (i - segStartOf(i)) % chunk === 0) tt += 0.0427; pts.push(+tt.toFixed(4)); tt += fd; }
    const videoEnd = pts.at(-1) + fd;
    const aac = 1024 / 48000; const aud = []; for (let a = 0; a < videoEnd + 0.03; a += aac) aud.push([+a.toFixed(5), aac]);
    const joinsAt = pts.filter((p, i) => i > 0 && pts[i] - pts[i - 1] > fd * 1.5).map((p) => p - 0.06);
    const sil = joinsAt.map((s) => ({ start: s, end: s + 0.035, sec: 0.035 }));
    let m = MV.analyze({ fps, frames, videoPts: pts, audioPackets: aud, chunkSize: chunk, segmentStarts: segStarts, filmSilences: sil, sourceSilences: [{ start: 1, end: 1.1, sec: 0.1 }], narrationSec: frames / fps });
    t("5 Hamnet-shaped film: sync PASS (holds on the chunk/segment grid, streams end together)", m.sync.verdict === "PASS", m.sync);
    t("5 … the join dropouts are REPORTED (not a gate): one per join, vs the source's own", m.joinDropouts.status === "DEFECT_REPORTED" && m.joinDropouts.count === joinsAt.length && m.joinDropouts.sourceZeroRuns === 1, m.joinDropouts);
    t("5 … the stretch is measured (both streams): video +stretch, audio over the narration", m.video.stretchSec > 0.3 && m.audio.excessOverNarrationSec > 0.3 && m.video.offGridHolds === 0);
    const off = pts.slice(); for (let i = 1000; i < off.length; i++) off[i] += 0.1; // a hold off the grid (lost frames)
    m = MV.analyze({ fps, frames, videoPts: off, audioPackets: aud.concat([[videoEnd + 0.1, aac]]), chunkSize: chunk, segmentStarts: segStarts });
    t("5 a hold OFF the join grid → sync FAIL", m.sync.verdict === "FAIL" && m.sync.problems.some((p) => /off the chunk\/segment grid/.test(p)), m.sync.problems);
    const gap = aud.map((x, i) => (i > 500 ? [x[0] + 0.2, x[1]] : x));
    m = MV.analyze({ fps, frames, videoPts: pts, audioPackets: gap, chunkSize: chunk, segmentStarts: segStarts });
    t("5 an audio timeline discontinuity (0.2 s jump) → sync FAIL", m.sync.verdict === "FAIL" && m.sync.audioDiscontinuities === 1);
    m = MV.analyze({ fps, frames, videoPts: pts, audioPackets: aud.filter((x) => x[0] < videoEnd - 0.5), chunkSize: chunk, segmentStarts: segStarts });
    t("5 audio ending 0.5 s before the video → sync FAIL (a real desync, not container rounding)", m.sync.verdict === "FAIL" && m.sync.problems.some((p) => /audio ends/.test(p)));
    m = MV.analyze({ fps, frames, videoPts: pts, audioPackets: aud, audioStart: 0.1, chunkSize: chunk, segmentStarts: segStarts });
    t("5 audio starting 0.1 s after the video (> 1 frame) → sync FAIL", m.sync.verdict === "FAIL");
    m = MV.analyze({ fps, frames, videoPts: pts, audioPackets: aud });
    t("5 end offset within 1 frame + 2 AAC frames (container rounding) → PASS; without a chunk size holds are reported, not judged", m.sync.verdict === "PASS" && m.video.holds > 0, m.sync);
    t("5 loudness is REPORT_ONLY in measure() (no gate)", /status: "REPORT_ONLY"/.test(fs.readFileSync(path.join(__dirname, "lib", "media-verify.js"), "utf8")));
  }

  // ── 6. render-status ends ───────────────────────────────────────────────
  {
    const f = { file: "bk.mp4", frames: 300, expected: 300, sha256: "s".repeat(64) };
    const cloud = { verified: true, bundleSha: SHA, run: { id: 1 }, report: { final: f } };
    const split = { slug: "bk", bundleSha: SHA, segments: [] };
    let d = decide({ slug: "bk", split, cloudState: { ...cloud, fetched: { sha256: f.sha256 } }, film: { exists: false } });
    t("6 the per-slug download record + film gone → DELIVERED (no 1 GB re-download after cleanup)", d.verdict === "DELIVERED");
    d = decide({ slug: "bk", split, cloudState: cloud, film: { exists: false }, bookGone: true });
    t("6 books/<slug> removed (post-upload purge) → DELIVERED, never FETCH", d.verdict === "DELIVERED");
    d = decide({ slug: "bk", split, cloudState: cloud, film: { exists: false } });
    t("6 cloud-verified, never downloaded, book present → FETCH", d.verdict === "FETCH");
    d = decide({ slug: "bk", split: null, cloudState: cloud, film: { exists: true }, localState: { slug: "bk", source: "cloud", verified: true, sha256: f.sha256 } });
    t("6 split state deleted by an older post-render, film on disk + matching sha → still VERIFIED", d.verdict === "VERIFIED");
    t("6 exit codes: SEGMENT_FAILED 1, UNKNOWN 4, LEGACY 5, waiting/done 0", exitFor("SEGMENT_FAILED") === 1 && exitFor("UNKNOWN") === 4 && exitFor("LEGACY_NO_BUNDLE") === 5 && exitFor("RENDERING") === 0 && exitFor("VERIFIED") === 0);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c9-split-"));
    try {
      fs.writeFileSync(path.join(tmp, ".render-github-split.json"), JSON.stringify({ slug: "hamnet" }));
      t("6 a pinned render.js that wrote only .render-github-split.json is found for ITS slug (Hamnet)", splitFileFor(tmp, "hamnet") === path.join(tmp, ".render-github-split.json") && splitFileFor(tmp, "other") === null);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    const post = fs.readFileSync(path.join(__dirname, "post-render.js"), "utf8");
    t("6 post-render no longer deletes the split state (the run record + the already-dispatched guard)", !/unlinkSync\(splitState\)/.test(post) && /--book-root/.test(post));
    // the canonical workflow: every harness entry + the launcher print the ONE command (else agents keep the old pieces)
    const R = path.join(__dirname, "..");
    for (const f of [".claude/skills/render-deliver/SKILL.md", ".agents/skills/render-deliver/SKILL.md", ".agents/workflows/render-deliver.md", "CLAUDE.md", "AGENTS.md", "docs/AGENT-OPERATING-CONTRACT.md", "scripts/book-start.js", "scripts/render.js"]) {
      t(`6 ${f} names render-deliver.js`, fs.readFileSync(path.join(R, f), "utf8").includes("render-deliver.js"));
    }
    t("6 the canonical skill says re-dispatch / assembly / download / verification are inside the GO (never ask again)", /never ask the operator for them/.test(fs.readFileSync(path.join(R, ".claude/skills/render-deliver/SKILL.md"), "utf8")));
  }

  console.log(failed ? `\n${failed} FAILED` : "\nall deliver-chain checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
