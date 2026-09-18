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
const ACCOUNTS = path.join(ROOT, "render-accounts.json");

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS)) {
    throw new Error("render-accounts.json yok — havuz tanımlı değil (bu dosya gitignore'da, tokenlar burada).");
  }
  return JSON.parse(fs.readFileSync(ACCOUNTS, "utf8"));
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

module.exports = { ROOT, ACCOUNTS, loadAccounts, resolveWorker, repoOf, gh, walk, parseArgs };
