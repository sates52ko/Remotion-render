// local-load-guard.js — heavy work does not run on the operator's PC (operator, 2026-11-04: "makineyi çok kasıyor, bu tür
// işlemleri GitHub Actions'ta yap, makineyi kasacak işlemlerden kaçınalım, sistemleştir").
//
// Incident (cycle 11, 2026-11-04): an experiment rendered 240 A/B stills locally — four Node processes, each with its own
// Remotion bundle and headless Chrome (23 chrome-headless-shell processes), about 2 minutes a still — and the PC was
// unusable for an hour. render-entry-guard.js (film renders) and remotion-cli-guard.js (the CLI `render`) never saw it:
// still renders call @remotion/renderer directly. The rule for STILL renders (A/B strips, framechecks, contact sheets):
//   ALLOW  a genuine GitHub Actions Linux runner — that is where heavy still work belongs (scripts/stills-cloud.js)
//   ALLOW  a quick local look: at most LOCAL_STILL_BUDGET stills in one run
//   ALLOW  more, only with the operator's own words for exactly that: --operator-local="<their words, >= 6 words>"
//   REFUSE everything else, with the cloud command to use instead.
// And on this PC never two still renders at once: one machine-wide lock (a second local render is refused, not queued).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { genuineRunner } = require("./render-entry-guard");

const LOCAL_STILL_BUDGET = 12;
const APPROVAL_MIN_WORDS = 6;
const LOCK = path.join(os.tmpdir(), "remotion-local-stills.lock");

/** decide whether `stills` still renders may run here. Returns { ok, reason, cloud } — pure, no side effects. */
function decideStills({ stills, operatorLocal, env = process.env, platform = process.platform }) {
  if (genuineRunner(env, platform)) return { ok: true, reason: "GitHub Actions runner" };
  if (stills <= LOCAL_STILL_BUDGET) return { ok: true, reason: `${stills} still(s) ≤ local budget ${LOCAL_STILL_BUDGET}` };
  const words = String(operatorLocal || "").trim().split(/\s+/).filter(Boolean).length;
  if (words >= APPROVAL_MIN_WORDS) return { ok: true, reason: `operator-approved local run: "${String(operatorLocal).trim()}"` };
  return {
    ok: false,
    reason: `${stills} stills is heavy work for this PC (local budget ${LOCAL_STILL_BUDGET}). Render them on GitHub Actions: ` +
      "node scripts/stills-cloud.js push --manifest=<stills manifest> --tag=<name>, then fetch --tag=<name> --out=<dir>. " +
      `A local run needs the operator's own words: --operator-local="<their words>" (≥ ${APPROVAL_MIN_WORDS} words).`,
  };
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

/** take the machine-wide local still-render lock (never on a runner). Returns a release function; refuses when held. */
function takeLocalLock({ what, env = process.env, platform = process.platform, lockFile = LOCK } = {}) {
  if (genuineRunner(env, platform)) return () => {};
  try {
    const held = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    if (held && held.pid !== process.pid && alive(held.pid)) {
      return { refused: `another local still render is running (pid ${held.pid}, ${held.what}, since ${held.at}) — one at a time on this PC` };
    }
  } catch { /* no lock or unreadable: free */ }
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, what, at: new Date().toISOString() }));
  const release = () => { try { const h = JSON.parse(fs.readFileSync(lockFile, "utf8")); if (h.pid === process.pid) fs.unlinkSync(lockFile); } catch {} };
  process.on("exit", release);
  return release;
}

/** the one call an entry point makes before rendering stills: exits 2 with the reason when refused */
function guardStills({ what, stills, operatorLocal }) {
  const d = decideStills({ stills, operatorLocal });
  if (!d.ok) { process.stderr.write(`✗ ${what}: ${d.reason}\n`); process.exit(2); }
  if (/operator-approved/.test(d.reason)) process.stderr.write(`! ${what}: ${d.reason}\n`);
  const r = takeLocalLock({ what });
  if (r && r.refused) { process.stderr.write(`✗ ${what}: ${r.refused}\n`); process.exit(2); }
  return d;
}

module.exports = { LOCAL_STILL_BUDGET, APPROVAL_MIN_WORDS, LOCK, decideStills, takeLocalLock, guardStills };
