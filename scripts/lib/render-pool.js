/**
 * render-pool.js — shared helpers for the multi-worker GitHub-Actions render pool.
 *
 * The pool is defined in render-accounts.json (GITIGNORED — holds live GitHub PATs):
 *   { activeWorker, strategy, lastUsedWorkerIndex,
 *     workers: [ { id, name, username, repo, branch, token, remoteName, monthlyMinutes, active } ] }
 *
 * scripts/render.js owns DISPATCH (round-robin → push code → trigger render-video.yml).
 * The download + cleanup scripts use these helpers so all three agree on the pool shape
 * and authenticate to GitHub as the chosen worker (never printing the token).
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const ACCOUNTS = path.join(ROOT, "render-accounts.json"); // legacy export: THIS checkout's path only — load with loadAccounts()
// the pool is read IN PLACE from this checkout or the main checkout (lib/render-accounts.js, 2026-10-29): a book
// worktree has no token file and must never get a copy
function loadAccounts() {
  return require("./render-accounts").loadAccounts(ROOT);
}

/**
 * Pick a worker. `sel` = a worker id/username/name, or "auto"/"last"/undefined to use the
 * one render.js most recently dispatched to (lastUsedWorkerIndex over the ACTIVE workers).
 */
function resolveWorker(acc, sel) {
  const workers = acc.workers || [];
  if (sel && sel !== "auto" && sel !== "last") {
    const w = workers.find((w) => w.id === sel || w.username === sel || w.name === sel);
    if (!w) throw new Error(`Worker bulunamadı: ${sel}`);
    if (!w.token) throw new Error(`Worker "${sel}" için token yok.`);
    return w;
  }
  const active = workers.filter((w) => w.active !== false && w.token);
  if (!active.length) throw new Error("Aktif worker yok (render-accounts.json).");
  const raw = typeof acc.lastUsedWorkerIndex === "number" ? acc.lastUsedWorkerIndex : active.length - 1;
  return active[((raw % active.length) + active.length) % active.length];
}

const repoOf = (w) => `${w.username}/${w.repo}`;

/**
 * Run `gh` authenticated AS this worker (token via GH_TOKEN env — never on the argv, so
 * it can't leak into a process listing or error string). Returns stdout; parses JSON when
 * `json` is set. Throws with gh's stderr on failure.
 */
function gh(worker, argv, { json = false } = {}) {
  let out;
  try {
    out = execFileSync("gh", argv, {
      encoding: "utf8",
      env: { ...process.env, GH_TOKEN: worker.token, GITHUB_TOKEN: worker.token, CLICOLOR: "0", NO_COLOR: "1" },
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || "").toString().trim();
    throw new Error(msg.slice(0, 500) || "gh komutu başarısız");
  }
  return json ? JSON.parse(out || "null") : out;
}

/**
 * Async version of `gh` for parallel downloads across workers.
 */
function ghAsync(worker, argv, { json = false } = {}) {
  const { execFile } = require("child_process");
  return new Promise((resolve, reject) => {
    execFile("gh", argv, {
      encoding: "utf8",
      env: { ...process.env, GH_TOKEN: worker.token, GITHUB_TOKEN: worker.token, CLICOLOR: "0", NO_COLOR: "1" },
      maxBuffer: 128 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message || "").toString().trim();
        return reject(new Error(msg.slice(0, 500) || "gh komutu başarısız"));
      }
      try {
        resolve(json ? JSON.parse(stdout || "null") : stdout);
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

// ── Remote refs (the per-render bundle branches) ────────────────────────────

/**
 * Strip credentials from anything we print. The `render-worker-N` remotes embed a
 * live PAT in `.git/config`, so a raw git error string can leak a token into a log
 * or an agent reply. Never print these URLs un-redacted.
 */
const redact = (s) =>
  String(s == null ? "" : s).replace(/(https?:\/\/)[^\s/@]+@/g, "$1***@");

/** Local git remote names (`render-worker-1`, ...). */
function gitRemotes() {
  return execFileSync("git", ["remote"], { encoding: "utf8", cwd: ROOT })
    .split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Branch names on a worker remote, e.g. ["god-mode", "render/surrounded-by-idiots-seg1"]. */
function lsRemoteHeads(remote) {
  const out = execFileSync("git", ["ls-remote", "--heads", remote], {
    encoding: "utf8", cwd: ROOT, maxBuffer: 16 * 1024 * 1024,
    // stderr MUST be piped, not inherited: it carries the remote URL, which embeds a
    // live PAT in .git/config. Inheriting it would print a token to the terminal.
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });
  return out.split("\n").map((l) => {
    const m = l.match(/^([0-9a-f]{7,40})\s+refs\/heads\/(.+)$/);
    return m ? { sha: m[1], ref: m[2] } : null;
  }).filter(Boolean);
}

/**
 * A ref is only ever deletable if it is one of OUR per-render bundle refs.
 * Anything outside `render/`, and the worker's shared branch, is refused — the
 * workers' `god-mode` is stale by design and must survive (CLAUDE.md).
 */
const DELETABLE = /^render\/[A-Za-z0-9._-]+$/;
function isDeletableRef(ref, worker) {
  if (!ref || !DELETABLE.test(ref)) return false;
  if (worker && worker.branch && ref === worker.branch) return false;
  return ref !== "god-mode" && ref !== "main" && ref !== "master";
}

/** Bundle refs for one book on one worker. */
function renderRefsFor(worker, slug, remoteName) {
  const remote = remoteName || worker.remoteName;
  if (!remote) return [];
  return lsRemoteHeads(remote)
    .map((h) => h.ref)
    .filter((r) => isDeletableRef(r, worker) && (r === `render/${slug}` || r.startsWith(`render/${slug}-`)));
}

/**
 * Delete one remote ref.
 *
 * `gh api -X DELETE repos/<o>/<r>/branches/<ref>` does NOT work here: with a
 * slash-bearing branch name GitHub answers 404 on every worker even when the
 * branch exists (measured 2026-09-29, all 10). `git push --delete` against the
 * already-authenticated `render-worker-N` remote is the working path.
 */
function deleteRemoteRef(remote, ref) {
  if (!isDeletableRef(ref)) throw new Error(`Refus edildi (guard): "${ref}" bizim render/ branch'imiz değil.`);
  try {
    execFileSync("git", ["push", remote, "--delete", ref], {
      encoding: "utf8", cwd: ROOT, maxBuffer: 16 * 1024 * 1024,
      // Piped for the same reason as lsRemoteHeads — and also so git's per-push
      // "To https://..." progress noise does not leak into an agent's transcript.
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    });
    return true;
  } catch (e) {
    const msg = redact((e.stderr || e.stdout || e.message || "").toString()).trim();
    throw new Error(msg.split("\n").filter(Boolean).slice(-1)[0]?.slice(0, 200) || "git push --delete başarısız");
  }
}

/** Recursively list files under dir. */
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

/** Tiny --k=v / --flag argv parser. */
function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((a) => {
      const m = a.match(/^--([^=]+)=(.*)$/);
      return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
    }),
  );
}

module.exports = {
  ROOT, ACCOUNTS, loadAccounts, resolveWorker, repoOf, gh, ghAsync, walk, parseArgs,
  redact, gitRemotes, lsRemoteHeads, isDeletableRef, renderRefsFor, deleteRemoteRef,
};
