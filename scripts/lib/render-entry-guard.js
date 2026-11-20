// render-entry-guard.js — the ONE rule for starting a render, shared by every entry point (cycle 7, 2026-11-02).
//
// Incident (the-most-important-thing, 2026-10-31, Antigravity conversation 20abbabb step #428): an agent ran
//   node scripts/render.js --slug=... --split --accept-quality-debt="..." --dry-run
// from its pinned book worktree. render.js had no --dry-run and no --split (both silently ignored) and its method
// defaulted to LOCAL: a 186-chunk production render started on the operator's PC (22 chunks, ~3.5 h) instead of the
// GitHub render pool. Rules from now on:
//   - production renders go to the GitHub pool (--method=github). There is NO default method: a render without --method
//     is refused before anything runs.
//   - a heavy LOCAL (or Lambda) render needs a separate, explicit operator approval for exactly that:
//     --operator-local-production="<the operator's words>" — never inferred from a quality-debt or render authorization.
//   - a GitHub failure never falls back to a local render.
//   - short local test clips stay free: --frames=a-b of at most LOCAL_TEST_MAX_FRAMES frames (written next to the film,
//     never as the film).
//   - the render runner itself (a genuine GitHub Actions Linux runner) renders its segment locally, as it always did.
// Remotion Studio, previews and still renders (mute-test, framecheck, visual A/B) do not go through here.
"use strict";

const LOCAL_TEST_MAX_FRAMES = 1800; // 60 s at 30 fps
const APPROVAL_MIN_WORDS = 6;

/** a real GitHub Actions runner: the env alone can be set by anyone, so the platform must match too (this PC is win32) */
function genuineRunner(env = process.env, platform = process.platform) {
  return env.GITHUB_ACTIONS === "true" && !!env.GITHUB_RUN_ID && !!env.RUNNER_TEMP && platform === "linux";
}

/** "a-b" → number of frames, or null when it is not a range */
function framesSpan(frames) {
  const m = String(frames || "").match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return b >= a ? b - a + 1 : null;
}

const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

/**
 * Decide whether a render with these settings may start here.
 * @returns {{ ok: boolean, kind: string, error?: string, record?: object }}
 *   kind: "github" | "runner" | "test-clip" | "operator-local-production" | refusal kinds
 */
function checkRenderStart({ method, frames = null, operatorLocal = null, otherApprovals = [], env = process.env, platform = process.platform, entry = "render.js" }) {
  const m = String(method || "").toLowerCase();
  if (!m) {
    return { ok: false, kind: "NO_METHOD", error: `${entry}: no render method given. Production renders run on the GitHub render pool: add --method=github. A local render is never chosen by default (2026-10-31: a render without --method rendered 22 of 186 chunks on this PC).` };
  }
  if (["github", "actions", "github-actions"].includes(m)) {
    // the pool renders whole films: --frames is never forwarded, so it would silently render the WHOLE film (review fix)
    if (frames && !genuineRunner(env, platform)) return { ok: false, kind: "GITHUB_FRAMES", error: `${entry}: --method=github with --frames: the pool renders whole films only (frames are not forwarded) — a short test clip is local: --method=local --frames=a-b` };
    return { ok: true, kind: "github" };
  }
  if (!["local", "lambda"].includes(m)) return { ok: false, kind: "BAD_METHOD", error: `${entry}: unknown render method "${method}" (github | local | lambda)` };
  if (m === "local" && genuineRunner(env, platform)) return { ok: true, kind: "runner" };
  const span = framesSpan(frames);
  if (m === "local" && span !== null && span <= LOCAL_TEST_MAX_FRAMES) return { ok: true, kind: "test-clip", span };
  const approval = typeof operatorLocal === "string" ? operatorLocal.trim() : "";
  if (approval) {
    if (words(approval) < APPROVAL_MIN_WORDS) return { ok: false, kind: "APPROVAL_TOO_SHORT", error: `${entry}: --operator-local-production needs the operator's own words (at least ${APPROVAL_MIN_WORDS} words), got "${approval}"` };
    if (otherApprovals.some((o) => typeof o === "string" && o.trim() && o.trim() === approval)) {
      return { ok: false, kind: "APPROVAL_REUSED", error: `${entry}: --operator-local-production repeats another approval's text (quality debt / render authorization). A local production render is its own operator decision.` };
    }
    return { ok: true, kind: "operator-local-production", record: { kind: "local-production", method: m, reason: approval, at: new Date().toISOString() } };
  }
  const what = m === "lambda" ? "an AWS Lambda render" : span !== null ? `a local render of ${span} frames (over the ${LOCAL_TEST_MAX_FRAMES}-frame test-clip limit)` : "a full-length local render";
  return {
    ok: false, kind: "LOCAL_PRODUCTION_REFUSED",
    error: `${entry}: ${what} is a production render on this machine — refused. Production renders run on the GitHub pool: --method=github (from a book worktree: the canonical launcher, node scripts/render.js --method=github --book-root=<worktree>). Short local test clip: --frames=a-b (≤ ${LOCAL_TEST_MAX_FRAMES} frames). Only the operator can approve a heavy local render: --operator-local-production="<the operator's own words>".`,
  };
}

/**
 * OLD TOOLS NEVER START A PRODUCTION RENDER: a checkout behind origin/god-mode carries older guards (2026-10-31: a pinned
 * render.js 39 commits behind, method defaulting to local). Test clips and the render runner are not production.
 * @param tools { head, behindOrigin } of the checkout whose render.js runs (production-guard codeState)
 * @returns { ok, override?, error? }
 */
function checkToolsCurrent(tools, { kind, runner = genuineRunner(), allow = (process.env.PRODUCTION_ALLOW_BEHIND || "").trim() } = {}) {
  if (runner || kind === "test-clip") return { ok: true };
  if (!tools || !tools.head || !(tools.behindOrigin > 0)) return { ok: true };
  if (allow) return { ok: true, override: allow };
  return { ok: false, error: `these tools (${String(tools.head).slice(0, 8)}) are ${tools.behindOrigin} commit(s) behind origin/god-mode (as last fetched). A production render starts only from current tools.` };
}

/** the output path for a local render: a test clip never takes the film's name (out/<slug>.mp4) */
function localOutputName(slug, frames, { runner = genuineRunner(), preview = false } = {}) {
  if (frames && !runner) return `${slug}.frames-${String(frames).replace(/\s+/g, "")}.mp4`;
  return `${slug}${preview ? ".preview" : ""}.mp4`;
}

/** for scripts that only ever render a whole film locally (legacy chains): refuse unless runner or operator-approved */
function guardLegacyEntry(entry, argv = process.argv.slice(2)) {
  const approval = (argv.find((a) => a.startsWith("--operator-local-production=")) || "").split("=").slice(1).join("=");
  const r = checkRenderStart({ method: "local", operatorLocal: approval || null, entry });
  if (!r.ok) { console.error(`❌ ${r.error}`); process.exit(2); }
  if (r.kind === "operator-local-production") console.warn(`⚠ ${entry}: LOCAL production render approved by the operator: "${r.record.reason}"`);
  return r;
}

module.exports = { checkRenderStart, checkToolsCurrent, genuineRunner, framesSpan, localOutputName, guardLegacyEntry, LOCAL_TEST_MAX_FRAMES, APPROVAL_MIN_WORDS };
