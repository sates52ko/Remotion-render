/**
 * code-fingerprint.js — which code actually ran. HEAD alone is not enough: the shared checkout runs with
 * uncommitted engine files (2026-10-16: three books recorded codeSha 25224ba while 21 code files differed
 * from it). This adds the uncommitted state of scripts/ src/ data/ as a content hash + file list, so two
 * runs can be compared and a run can be traced to a patch.
 */
const crypto = require("crypto");
const { execFileSync } = require("child_process");

function git(root, argv) {
  try { return execFileSync("git", argv, { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 }).toString(); } catch { return null; }
}

function codeFingerprint(root, dirs = ["scripts", "src", "data"]) {
  const head = (git(root, ["rev-parse", "HEAD"]) || "").trim() || null;
  const diff = git(root, ["diff", "HEAD", "--", ...dirs]);
  const untracked = (git(root, ["ls-files", "--others", "--exclude-standard", "--", ...dirs]) || "").split("\n").filter(Boolean);
  const changed = (git(root, ["diff", "HEAD", "--name-only", "--", ...dirs]) || "").split("\n").filter(Boolean);
  const h = crypto.createHash("sha256").update(diff || "");
  for (const f of untracked) { const blob = (git(root, ["hash-object", "--", f]) || "").trim(); h.update(`\n?${f}:${blob}`); }
  const dirty = changed.length + untracked.length;
  return { head, dirty, treeSha256: dirty ? h.digest("hex") : null, changed: changed.slice(0, 60), untracked: untracked.slice(0, 60) };
}

module.exports = { codeFingerprint };
