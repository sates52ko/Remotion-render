// render-accounts.js — where the render-worker credentials come from, and whether they can dispatch (2026-10-29).
//
// Why: every book now runs in its own worktree (../wt-book-<slug>), but render-accounts.json (gitignored, live GitHub
// PATs) exists only in the main checkout. A production render passed the preflight (GO) and then failed its first
// dispatch with "render-accounts.json not found"; the agent copied the token file into the book worktree to get on.
// Copies of a token file multiply leak paths and go stale. Now:
//   - the file is READ IN PLACE: $RENDER_ACCOUNTS_FILE, else this checkout's, else the main checkout's (git common dir);
//     never copied, never printed (only its location and counts);
//   - the source must be safe: gitignored and untracked where it lives;
//   - nothing writes the credential file any more: the round-robin pointer and the access-check cache live in
//     <git common dir>/render-pool-state.json — inside .git, so it can never be committed or bundled, and it holds no
//     token or token derivative;
//   - the preflight knows BEFORE the first push: found? safe? enough active workers with a token? access verified
//     (cached), unverified (said so), or refused (401/403/404: that worker is out of the pool)?
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const NAME = "render-accounts.json";
const TOKEN_SHAPE = /^(ghp_|github_pat_|gho_|ghs_)[A-Za-z0-9_]{20,}$/;
const ACCESS_TTL_MS = 12 * 3600 * 1000;

const git = (argv, cwd) => { try { return execFileSync("git", argv, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
const commonDir = (root) => { const c = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], root); return c ? path.resolve(c) : null; };

/** where the accounts file is, in order — never copies anything */
function locate(root) {
  const cands = [];
  if (process.env.RENDER_ACCOUNTS_FILE) cands.push({ file: path.resolve(process.env.RENDER_ACCOUNTS_FILE), source: "RENDER_ACCOUNTS_FILE" });
  cands.push({ file: path.join(root, NAME), source: "this checkout" });
  const cd = commonDir(root);
  if (cd) { const main = path.join(path.dirname(cd), NAME); if (path.resolve(main) !== path.resolve(path.join(root, NAME))) cands.push({ file: main, source: "main checkout (read in place, not copied)" }); }
  const hit = cands.find((c) => fs.existsSync(c.file));
  return hit ? { ...hit, searched: cands.map((c) => c.source) } : { file: null, source: null, searched: cands.map((c) => c.source) };
}

/** a token file must be gitignored and untracked in the repo it lives in (else one `git add -A` publishes it) */
function sourceSafety(file) {
  const dir = path.dirname(file);
  const inRepo = git(["rev-parse", "--is-inside-work-tree"], dir) === "true";
  if (!inRepo) return { safe: true, detail: "outside any repository" };
  const tracked = git(["ls-files", "--error-unmatch", path.basename(file)], dir) !== null;
  const ignored = git(["check-ignore", "-q", path.basename(file)], dir) !== null;
  return { safe: !tracked && ignored, detail: tracked ? "TRACKED by git — it would be pushed" : ignored ? "gitignored, untracked" : "NOT gitignored — one `git add -A` would commit it" };
}

/** the pool state that tools may write (never the credential file) */
function stateFile(root) { const cd = commonDir(root); return cd ? path.join(cd, "render-pool-state.json") : path.join(root, ".git-render-pool-state.json"); }
function readState(root) { try { return JSON.parse(fs.readFileSync(stateFile(root), "utf8")); } catch { return {}; } }
function writeState(root, patch) { const f = stateFile(root); const s = { ...readState(root), ...patch }; try { fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n"); } catch { /* best effort */ } return s; }

/** load the pool: the file's content, with the round-robin pointer from the state file. Throws a CLASSED error. */
function loadAccounts(root) {
  const loc = locate(root);
  if (!loc.file) { const e = new Error(`render-accounts.json not found (looked in: ${loc.searched.join(", ")}) — the operator provides the worker pool; never recreate or copy it`); e.code = "CREDENTIALS_MISSING"; throw e; }
  const safety = sourceSafety(loc.file);
  if (!safety.safe) { const e = new Error(`render-accounts.json at ${loc.source} is not a safe source: ${safety.detail}`); e.code = "CREDENTIALS_UNSAFE"; throw e; }
  let acc;
  try { acc = JSON.parse(fs.readFileSync(loc.file, "utf8")); } catch { const e = new Error(`render-accounts.json (${loc.source}) is not valid JSON`); e.code = "CREDENTIALS_UNREADABLE"; throw e; }
  const st = readState(root);
  if (typeof st.lastUsedWorkerIndex === "number") acc.lastUsedWorkerIndex = st.lastUsedWorkerIndex;
  // a copy in a linked book worktree (an earlier workaround) is still read, but named: the main checkout's file is the source
  const cd = commonDir(root), main = cd ? path.join(path.dirname(cd), NAME) : null;
  const copy = loc.source === "this checkout" && !!main && path.resolve(main) !== path.resolve(loc.file) && fs.existsSync(main);
  Object.defineProperty(acc, "__source", { value: { source: loc.source, file: loc.file, mtimeMs: fs.statSync(loc.file).mtimeMs, copy }, enumerable: false });
  return acc;
}

/** counts and field problems — never a token value */
function inspect(acc, root) {
  const workers = acc.workers || [];
  const active = workers.filter((w) => w.active !== false);
  const st = readState(root);
  const src = acc.__source || {};
  const cache = st.access && st.access.accountsMtimeMs === src.mtimeMs ? st.access.byWorker || {} : {};
  const rows = active.map((w) => {
    const missing = ["username", "repo", "token"].filter((k) => !w[k]);
    const c = cache[`${w.username}/${w.repo}`];
    const fresh = c && Date.now() - Date.parse(c.at) < ACCESS_TTL_MS;
    return { id: w.id || w.username, repo: `${w.username}/${w.repo}`, missing, tokenShape: !!w.token && TOKEN_SHAPE.test(String(w.token)), access: fresh ? c.status : "UNVERIFIED", checkedAt: fresh ? c.at : null };
  });
  const usable = rows.filter((r) => !r.missing.length && r.access !== "UNAUTHORIZED" && r.access !== "NO_ACCESS");
  return { source: src.source || null, copy: !!src.copy, total: workers.length, active: active.length, rows, usable: usable.length, verified: rows.filter((r) => r.access === "OK").length,
    refused: rows.filter((r) => r.access === "UNAUTHORIZED" || r.access === "NO_ACCESS").map((r) => `${r.id}: ${r.access}`),
    malformed: rows.filter((r) => r.missing.length).map((r) => `${r.id}: missing ${r.missing.join(", ")}`) };
}

/**
 * Verify each active worker can see its repo (one read-only `gh api repos/<u>/<r>` per worker, token via GH_TOKEN env —
 * never argv, never printed). Cached per accounts-file version for 12 h; a network failure stays UNVERIFIED (said so),
 * never OK. `call` is injectable for tests.
 */
function verifyAccess(acc, root, { call } = {}) {
  const src = acc.__source || {};
  const st = readState(root);
  const byWorker = st.access && st.access.accountsMtimeMs === src.mtimeMs ? { ...(st.access.byWorker || {}) } : {};
  const run = call || ((w) => {
    try {
      execFileSync("gh", ["api", `repos/${w.username}/${w.repo}`, "--jq", ".permissions.push"], { env: { ...process.env, GH_TOKEN: w.token, GITHUB_TOKEN: w.token }, stdio: ["ignore", "pipe", "pipe"], timeout: 20000 });
      return "OK";
    } catch (e) {
      const msg = String((e.stderr || "") + (e.message || ""));
      return /\b401\b|Bad credentials/i.test(msg) ? "UNAUTHORIZED" : /\b40[34]\b|Not Found/i.test(msg) ? "NO_ACCESS" : "UNVERIFIED";
    }
  });
  for (const w of (acc.workers || []).filter((x) => x.active !== false && x.token && x.username && x.repo)) {
    const k = `${w.username}/${w.repo}`, c = byWorker[k];
    if (c && c.status !== "UNVERIFIED" && Date.now() - Date.parse(c.at) < ACCESS_TTL_MS) continue; // no repeat calls
    byWorker[k] = { status: run(w), at: new Date().toISOString() };
  }
  writeState(root, { access: { accountsMtimeMs: src.mtimeMs, byWorker } });
  return inspect(acc, root);
}

/** the workers a dispatch may use: active, complete, and not refused by GitHub */
function usableWorkers(acc, root) {
  const ins = inspect(acc, root);
  const bad = new Set(ins.rows.filter((r) => r.missing.length || r.access === "UNAUTHORIZED" || r.access === "NO_ACCESS").map((r) => r.repo));
  return (acc.workers || []).filter((w) => w.active !== false && w.token && !bad.has(`${w.username}/${w.repo}`));
}

/** one line for logs and the preflight: location + counts, never a token */
function summary(ins) {
  return `render-accounts.json: ${ins.source}${ins.copy ? " (a COPY of the main checkout's token file sits in this worktree — the main checkout's is the source; removing the copy is the operator's call)" : ""} · ${ins.usable}/${ins.active} active worker(s) usable · access ${ins.verified} verified${ins.active - ins.verified - ins.refused.length > 0 ? `, ${ins.active - ins.verified - ins.refused.length} unverified` : ""}${ins.refused.length ? `, refused: ${ins.refused.join("; ")}` : ""}${ins.malformed.length ? `, malformed: ${ins.malformed.join("; ")}` : ""}`;
}

module.exports = { NAME, locate, sourceSafety, loadAccounts, inspect, verifyAccess, usableWorkers, summary, stateFile, readState, writeState, TOKEN_SHAPE };
