#!/usr/bin/env node
// RENDER ENTRY GUARD (cycle 7, 2026-11-02). Real case: the-most-important-thing, 2026-10-31 — an agent ran
//   node scripts/render.js --slug=... --split --accept-quality-debt="..." --dry-run
// from its pinned book worktree; --split / --dry-run were silently ignored and the method defaulted to LOCAL: 22 of 186
// production chunks rendered on the operator's PC before it was stopped, then the token file was copied into the worktree.
// Checks: no default method, unknown flags refused, a real --dry-run, local production only with the operator's own
// approval, test clips free and never named as the film, the genuine runner only on Linux, old tools refused, legacy
// whole-film entry points guarded, a dispatch counted only with real run ids, one render per input across methods, and
// book-start naming the hazards of pinned worktrees (whose own old render.js cannot be changed).
// Run: node scripts/test-render-entry-guard.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const ROOT = path.join(__dirname, "..");
const G = require("./lib/render-entry-guard");

// ── 1. the decision ──────────────────────────────────────────────────────────────────────────────────────────────────
const RUNNER_ENV = { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "123", RUNNER_TEMP: "/tmp" };
let r = G.checkRenderStart({ method: "", env: {}, platform: "win32" });
t("no --method -> refused (NO_METHOD), never a local default", !r.ok && r.kind === "NO_METHOD" && /--method=github/.test(r.error));
r = G.checkRenderStart({ method: "github", env: {}, platform: "win32" });
t("--method=github -> allowed", r.ok && r.kind === "github");
r = G.checkRenderStart({ method: "local", env: {}, platform: "win32" });
t("--method=local, whole film, no approval -> refused (LOCAL_PRODUCTION_REFUSED)", !r.ok && r.kind === "LOCAL_PRODUCTION_REFUSED" && /GitHub pool/.test(r.error));
r = G.checkRenderStart({ method: "lambda", env: {}, platform: "win32" });
t("--method=lambda, no approval -> refused", !r.ok && r.kind === "LOCAL_PRODUCTION_REFUSED");
r = G.checkRenderStart({ method: "local", frames: "0-1799", env: {}, platform: "win32" });
t(`local test clip of ${G.LOCAL_TEST_MAX_FRAMES} frames -> allowed (test-clip)`, r.ok && r.kind === "test-clip");
r = G.checkRenderStart({ method: "local", frames: "0-1800", env: {}, platform: "win32" });
t("local render one frame over the clip limit -> refused", !r.ok && r.kind === "LOCAL_PRODUCTION_REFUSED");
r = G.checkRenderStart({ method: "local", env: RUNNER_ENV, platform: "linux" });
t("the genuine render runner (GitHub Actions env on Linux) renders its segment locally", r.ok && r.kind === "runner");
r = G.checkRenderStart({ method: "local", env: RUNNER_ENV, platform: "win32" });
t("the same runner env on Windows (this PC) is NOT a runner -> refused", !r.ok);
r = G.checkRenderStart({ method: "local", env: { GITHUB_ACTIONS: "1" }, platform: "linux" });
t("GITHUB_ACTIONS alone (no run id / runner temp) is not a runner", !r.ok);
r = G.checkRenderStart({ method: "local", operatorLocal: "ok go", env: {}, platform: "win32" });
t("--operator-local-production with too few words -> refused", !r.ok && r.kind === "APPROVAL_TOO_SHORT");
const debt = "Operator approved render dispatch across render worker pool";
r = G.checkRenderStart({ method: "local", operatorLocal: debt, otherApprovals: [debt], env: {}, platform: "win32" });
t("--operator-local-production reusing the quality-debt text -> refused (its own decision)", !r.ok && r.kind === "APPROVAL_REUSED");
r = G.checkRenderStart({ method: "local", operatorLocal: "render this book locally on my PC tonight please", env: {}, platform: "win32" });
t("--operator-local-production with the operator's own words -> allowed and recorded", r.ok && r.kind === "operator-local-production" && r.record.kind === "local-production");
t("framesSpan parses a-b / rejects junk", G.framesSpan("10-19") === 10 && G.framesSpan("x") === null && G.framesSpan("9-1") === null);
t("a local test clip never takes the film's name", G.localOutputName("zz", "0-99", { runner: false }) === "zz.frames-0-99.mp4" && G.localOutputName("zz", null, { runner: false }) === "zz.mp4");
t("on the runner a segment keeps the name the workflow renames", G.localOutputName("zz", "0-99", { runner: true }) === "zz.mp4");
t("tools behind origin -> production refused", !G.checkToolsCurrent({ head: "abc", behindOrigin: 3 }, { kind: "github", runner: false, allow: "" }).ok);
t("tools behind origin + operator PRODUCTION_ALLOW_BEHIND -> allowed, named", G.checkToolsCurrent({ head: "abc", behindOrigin: 3 }, { kind: "github", runner: false, allow: "known" }).override === "known");
t("tools behind origin, a test clip -> allowed", G.checkToolsCurrent({ head: "abc", behindOrigin: 3 }, { kind: "test-clip", runner: false, allow: "" }).ok);
t("tools current -> allowed", G.checkToolsCurrent({ head: "abc", behindOrigin: 0 }, { kind: "github", runner: false, allow: "" }).ok);

// ── 2. render.js itself (refusals happen before any book is read) ────────────────────────────────────────────────────
const env = { ...process.env, PRODUCTION_GUARD: "off" };
for (const k of ["GITHUB_ACTIONS", "GITHUB_RUN_ID", "RUNNER_TEMP", "PRODUCTION_ALLOW_BEHIND"]) delete env[k];
const run = (argv) => spawnSync(process.execPath, [path.join(ROOT, "scripts", "render.js"), ...argv], { cwd: ROOT, env, encoding: "utf8", timeout: 120000 });
let p = run(["--slug=zz-none", "--split", "--accept-quality-debt=Operator approved render dispatch across render worker pool", "--dry-run"]);
t("the 2026-10-31 command -> exit 2 (unknown flag --split), nothing runs", p.status === 2 && /unknown flag\(s\) --split/.test(p.stderr), p.stderr);
p = run(["--slug=zz-none", "--accept-quality-debt=Operator approved render dispatch across render worker pool", "--dry-run"]);
t("the same command without --split -> exit 2 (no --method), never a local render", p.status === 2 && /no render method given/.test(p.stderr), p.stderr);
p = run(["--slug=zz-none", "--method=local"]);
t("render.js --method=local (whole film) -> exit 2, refused before reading the book", p.status === 2 && /full-length local render is a production render/.test(p.stderr), p.stderr);
p = run(["--slug=zz-none", "--method=github", "--dry-run", "--authorize-render=go ahead with the render now"]);
t("--dry-run with an approval flag -> exit 2 (a dry run records nothing)", p.status === 2 && /--dry-run records nothing/.test(p.stderr), p.stderr);
p = run(["--slug=zz-none", "--method=github", "--frames=0-299"]);
t("--method=github --frames -> exit 2 (frames are not forwarded: the pool would render the whole film)", p.status === 2 && /pool renders whole films only/.test(p.stderr), p.stderr);
p = run(["--slug=zz-none", "--method=github", "--allow-dirty-code=x", "--dry-run"]);
t("--allow-dirty-code (production-guard's documented flag) is not an unknown flag", !/unknown flag/.test(p.stderr), p.stderr);
p = run(["--slug=zz-none", "--method=github", "stray"]);
t("a stray positional argument -> exit 2", p.status === 2 && /stray argument/.test(p.stderr), p.stderr);
p = run(["--method=github"]);
t("no --slug / --config -> exit 1, no silent default book", p.status === 1 && /varsayılan kitap yok/.test(p.stderr), p.stderr);
const src = fs.readFileSync(path.join(ROOT, "scripts", "render.js"), "utf8");
t("render.js has no default method, no default book, help says --method is required", !/args\.method \|\| "local"/.test(src) && !/slug = defaultSlug/.test(src) && !/VARSAYILAN: local/.test(src) && /ZORUNLU/.test(src));

// ── 3. legacy whole-film entry points ────────────────────────────────────────────────────────────────────────────────
for (const [file, what] of [["local_chunk_renderer.js", "local_chunk_renderer.js"], [path.join("scripts", "auto-chain-render.js"), "auto-chain-render.js"]]) {
  const q = spawnSync(process.execPath, [path.join(ROOT, file)], { cwd: ROOT, env, encoding: "utf8", timeout: 60000 });
  t(`${what} without the operator's approval -> exit 2, nothing renders`, q.status === 2 && /production render on this machine/.test(q.stderr), (q.stderr || q.stdout).slice(-300));
}
t("render.js --dry-run appends nothing to pipeline-record (productionGuard record:false)", /record: !DRY_RUN/.test(src));
t("auto-chain-render.js forwards the operator's approval to local_chunk_renderer.js", /--operator-local-production=\$\{JSON\.stringify\(APPROVAL\)\}/.test(fs.readFileSync(path.join(ROOT, "scripts", "auto-chain-render.js"), "utf8")));
t("finish-merge.sh (an unguarded whole-film local render) is archived", !fs.existsSync(path.join(ROOT, "scripts", "finish-merge.sh")));
t("pipeline.js --step=render is guarded", /guardLegacyEntry\('pipeline\.js --step=render'\)/.test(fs.readFileSync(path.join(ROOT, "scripts", "pipeline.js"), "utf8")));
const pkg = require(path.join(ROOT, "package.json"));
t("npm run render = the GitHub pool", pkg.scripts.render === "node scripts/render.js --method=github");
t("no live script reads the token file directly (dispatch-lotf-render.mjs archived)", !fs.existsSync(path.join(ROOT, "scripts", "dispatch-lotf-render.mjs")));

// ── 4. a dispatch counts only with real run ids ──────────────────────────────────────────────────────────────────────
(async () => {
  const rd = require("./lib/render-dispatch");
  const mk = () => ({ segments: [1, 2, 3].map((seg) => ({ seg, ref: `render/zz-seg${seg}`, username: `u${seg}`, pushed: "S", dispatchedSha: "S", dispatchedAt: "2026-11-02T00:00:00Z" })) });
  let clock = 0;
  const fake = (found) => ({ findRun: async (sg) => (found.includes(sg.seg) ? { id: 1000 + sg.seg, url: `https://x/${sg.seg}`, createdAt: "2026-11-02T00:00:05Z" } : null) });
  let st = mk();
  let cr = await rd.confirmRuns({ state: st, sha: "S", io: fake([1, 2, 3]), sleep: async () => { clock += 15000; }, now: () => clock });
  t("confirmRuns: every segment's run found -> ok, run ids in the manifest", cr.ok && st.segments.every((g) => g.runId === 1000 + g.seg) && !!st.runsConfirmedAt, JSON.stringify(cr));
  st = mk(); clock = 0;
  cr = await rd.confirmRuns({ state: st, sha: "S", io: fake([1, 3]), timeoutMs: 60000, pollMs: 15000, sleep: async () => { clock += 15000; }, now: () => clock });
  t("confirmRuns: a 204 with no run -> NOT confirmed (seg 2 named), no throw", !cr.ok && cr.missing.join() === "2" && st.runsConfirmedAt === null, JSON.stringify(cr));
  st = mk(); clock = 0;
  cr = await rd.confirmRuns({ state: st, sha: "S", io: { findRun: async () => undefined }, timeoutMs: 30000, sleep: async () => { clock += 15000; }, now: () => clock });
  t("confirmRuns: the run list cannot be read -> NOT confirmed (never assumed)", !cr.ok && cr.missing.length === 3);

  // ── 5. one render per input, across methods ──────────────────────────────────────────────────────────────────────────
  const RL = require("./lib/run-lock");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "entry-guard-"));
  const sf = path.join(tmp, "split.json");
  fs.writeFileSync(sf, JSON.stringify({ renderInputHash: "H", dispatchedAt: "x", runsConfirmedAt: null, segments: [{ dispatchedAt: "x" }, { dispatchedAt: "x" }] }));
  const unc = RL.inputDispatched(sf, "H");
  t("a dispatched-but-UNCONFIRMED render still blocks a second dispatch (review fix: its runs may exist), flagged unconfirmed", !!unc && unc.confirmed === false, JSON.stringify(unc));
  fs.writeFileSync(sf, JSON.stringify({ renderInputHash: "H", dispatchedAt: "x", runsConfirmedAt: "y", segments: [{ dispatchedAt: "x", runId: 1 }, { dispatchedAt: "x", runId: 2 }] }));
  t("a confirmed render of the same input is 'done' (a second dispatch needs --new-render)", !!RL.inputDispatched(sf, "H"));
  fs.writeFileSync(sf, JSON.stringify({ renderInputHash: "H", dispatchedAt: "x", segments: [{ dispatchedAt: "x" }] }));
  t("an older state (before run confirmation) keeps its old meaning", !!RL.inputDispatched(sf, "H"));
  const lf = path.join(tmp, "local.json");
  RL.recordLocalStart(lf, { renderInputHash: "H", approval: { kind: "local-production", reason: "r" } });
  t("a local production start is recorded per input and blocks the same input", !!RL.localStarted(lf, "H") && RL.localStarted(lf, "OTHER") === null);
  fs.rmSync(tmp, { recursive: true, force: true });

  // ── 6. pinned worktrees: their own old render.js cannot be changed — book-start names the hazard ───────────────────────
  const old = spawnSync("git", ["show", "88db7e09:scripts/render.js"], { cwd: ROOT, encoding: "utf8" });
  if (old.status === 0) t("RESIDUAL (documented): the 2026-10-31 pin's own render.js still defaults to local", /args\.method \|\| "local"/.test(old.stdout));
  else console.log("· SKIP residual check: commit 88db7e09 not in this clone (shallow CI checkout)");
  const fx = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "book-start-hz-")));
  const MAIN = path.join(fx, "main");
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    fs.mkdirSync(path.join(MAIN, "scripts"), { recursive: true });
    g(MAIN, "init", "-q"); g(MAIN, "config", "user.email", "t@t"); g(MAIN, "config", "user.name", "t");
    fs.writeFileSync(path.join(MAIN, "scripts", "render.js"), 'const method = (args.method || "local");\n');
    fs.writeFileSync(path.join(MAIN, ".gitignore"), "render-accounts*.json\n");
    g(MAIN, "add", "-A"); g(MAIN, "commit", "-q", "-m", "old pin");
    g(MAIN, "update-ref", "refs/remotes/origin/god-mode", "HEAD");
    g(MAIN, "worktree", "add", "-q", "--detach", path.join(fx, "wt-production-base"));
    g(MAIN, "worktree", "add", "-q", "--detach", path.join(fx, "wt-book-zz"));
    fs.writeFileSync(path.join(fx, "wt-book-zz", "render-accounts.json"), "{\"workers\":[]}");
    const q = spawnSync(process.execPath, [path.join(ROOT, "scripts", "book-start.js"), "--launcher", "--check"], { cwd: MAIN, encoding: "utf8", env: { ...env, PRODUCTION_ALLOW_BEHIND: "test fixture (no remote)" }, timeout: 60000 });
    const outp = q.stdout + q.stderr;
    t("book-start --launcher names a token-file COPY in a book worktree (STOP)", /STOP\s+token-file COPY .*wt-book-zz.*render-accounts\.json/.test(outp), outp.slice(-600));
    t("book-start --launcher names a pin whose own render.js has no guard (RENDER never run …)", /RENDER never run wt-book-zz's own scripts\/render\.js/.test(outp), outp.slice(-600));
  } finally {
    try { g(MAIN, "worktree", "remove", "--force", path.join(fx, "wt-book-zz")); } catch {}
    try { g(MAIN, "worktree", "remove", "--force", path.join(fx, "wt-production-base")); } catch {}
    fs.rmSync(fx, { recursive: true, force: true });
  }

  console.log(failed ? `\n${failed} FAILED` : "\nall render-entry-guard checks passed");
  process.exit(failed ? 1 : 0);
})();
