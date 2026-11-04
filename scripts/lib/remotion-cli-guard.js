#!/usr/bin/env node
// remotion-cli-guard.js — a guard on the SHARED Remotion CLI, so an OLD pinned checkout cannot start a heavy local
// production render by accident (cycle 8, 2026-11-03).
//
// Why it lives in node_modules and not in scripts/: render-entry-guard.js (2026-11-02) guards the entry points of the
// CURRENT code only. A book worktree pinned before that keeps its own scripts/render.js forever (a pin is never edited),
// and that render.js still defaults to a LOCAL render (2026-10-31, the-most-important-thing: 22 of 186 production chunks
// rendered on the operator's PC from a pinned worktree). Every wt-book-* and wt-production-base links node_modules to the
// main checkout's node_modules (an NTFS junction), and every heavy local path - 400-frame chunks to
// out_<comp>_chunks/chunk-NNNN.mp4, or pipeline.js's whole film with no --frames - ends in `npx remotion render`. So ONE
// shim at the top of node_modules/@remotion/cli/remotion-cli.js reaches every pin, whatever its scripts/ contain.
//
// What it decides (only for the `render` subcommand; still / studio / lambda / everything else passes untouched):
//   ALLOW  a genuine GitHub Actions Linux runner (it does its own npm install; this is belt and braces)
//   ALLOW  the calling project root has scripts/lib/render-entry-guard.js (current code guards its own entry points)
//   ALLOW  a short test clip: --frames=a-b of <= 1800 frames written to anything but a chunk file
//   ALLOW  REMOTION_LOCAL_PRODUCTION_APPROVED="<the operator's own words, >= 6 words>" (printed loudly)
//   REFUSE everything else, exit 2, with the current way to render (GitHub pool via the launcher).
// FAIL-OPEN: any exception inside the guard allows - a bug here must never break Remotion (Studio, stills, the runner).
//
// The shim requires node_modules/.render-guard/decide.js (a copy of THIS file written by install()), resolved from the
// shim's own __dirname, so it never depends on the calling checkout's scripts/. book-start.js (always read from origin)
// installs / refreshes it on every run.
//
// CLI:  node scripts/lib/remotion-cli-guard.js --status | --install | --uninstall   [--node-modules=<dir>]
// Test: node scripts/test-cli-guard.js
"use strict";
const fs = require("fs");
const path = require("path");

const LOCAL_TEST_MAX_FRAMES = 1800; // same limit as render-entry-guard.js (60 s at 30 fps)
const APPROVAL_MIN_WORDS = 6;
const APPROVAL_ENV = "REMOTION_LOCAL_PRODUCTION_APPROVED";
const MARK_BEGIN = "// >>> remotion-cli-guard >>>";
const MARK_END = "// <<< remotion-cli-guard <<<";
const GUARD_DIR = ".render-guard";
const BACKUP_SUFFIX = ".render-guard-backup";
// the chunk files of every local chunk renderer (render.js, local_chunk_renderer.js, auto-chain-render.js)
const CHUNK_RE = /out_[^\\/]*_chunks[\\/]+chunk-[^\\/]*\.mp4$/i;

const SHIM = [
  MARK_BEGIN,
  "// Installed by scripts/lib/remotion-cli-guard.js (book-start.js keeps it current). Old pinned book worktrees share this",
  "// node_modules and their own render.js still defaults to a LOCAL production render (2026-10-31): `remotion render` asks",
  "// the guard first. Fail-open: if the guard is missing or throws, Remotion runs as before. Undo: --uninstall.",
  'try { require(require("path").join(__dirname, "..", "..", ".render-guard", "decide.js")).shim(); } catch (e) { /* fail-open */ }',
  MARK_END,
].join("\n");

function genuineRunner(env, platform) {
  return env.GITHUB_ACTIONS === "true" && !!env.GITHUB_RUN_ID && !!env.RUNNER_TEMP && platform === "linux";
}
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

/** nearest ancestor of cwd (itself included) holding a package.json, or null */
function projectRoot(cwd) {
  let d = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(d, "package.json"))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/** --frames=a-b / --frames a-b -> number of frames; a single frame "n" -> 1; open or bad ranges -> null */
function framesSpan(argv) {
  let v = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--frames=")) v = a.slice(9);
    else if (a === "--frames" && i + 1 < argv.length) v = argv[i + 1];
  }
  if (v === null) return null;
  const one = String(v).match(/^\s*(\d+)\s*$/);
  if (one) return 1;
  const m = String(v).match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return b >= a ? b - a + 1 : null;
}

function refusal(kind, why, root) {
  return {
    ok: false, kind,
    error: [
      `REFUSED remotion render (shared CLI guard): ${why}.`,
      `  This checkout (${root || "no package.json above the cwd"}) has no scripts/lib/render-entry-guard.js: it is OLD code (a pin made`,
      "  before 2026-11-02 defaults to a LOCAL production render - 2026-10-31: 22 of 186 chunks on this PC).",
      "  Production renders run on the GitHub render pool through CURRENT tools:",
      "    git show origin/god-mode:scripts/book-start.js | node - --launcher",
      "    then in ../wt-production-base: node scripts/render.js --method=github --slug=<slug> --book-root=<this worktree>",
      `  Short local test clip: --frames=a-b (<= ${LOCAL_TEST_MAX_FRAMES} frames, not a chunk file).`,
      `  Only the operator can approve a heavy local render here: set ${APPROVAL_ENV}="<the operator's own words, >= ${APPROVAL_MIN_WORDS} words>".`,
    ].join("\n"),
  };
}

/**
 * The decision for one CLI invocation.
 * @param argv  the CLI arguments (process.argv.slice(2))
 * @returns {{ ok: boolean, kind: string, error?: string, loud?: string }}
 */
function decide({ argv = [], cwd = process.cwd(), env = process.env, platform = process.platform } = {}) {
  try {
    const args = Array.from(argv, String);
    const sub = args.find((a) => !a.startsWith("-"));
    if (sub !== "render") return { ok: true, kind: "not-render" };
    if (genuineRunner(env, platform)) return { ok: true, kind: "runner" };
    const root = projectRoot(cwd);
    if (root && fs.existsSync(path.join(root, "scripts", "lib", "render-entry-guard.js"))) return { ok: true, kind: "current-code" };
    const span = framesSpan(args);
    const chunk = args.some((a) => CHUNK_RE.test(a.replace(/^--output=/, "").replace(/^["']|["']$/g, "")));
    if (span !== null && span <= LOCAL_TEST_MAX_FRAMES && !chunk) return { ok: true, kind: "test-clip", span };
    const approval = String(env[APPROVAL_ENV] || "").trim();
    if (approval) {
      if (words(approval) < APPROVAL_MIN_WORDS) return refusal("APPROVAL_TOO_SHORT", `${APPROVAL_ENV} needs the operator's own words (at least ${APPROVAL_MIN_WORDS} words), got "${approval}"`, root);
      return { ok: true, kind: "operator-approved", loud: `!!! LOCAL PRODUCTION RENDER from old code (${root || cwd}) - operator approval (${APPROVAL_ENV}): "${approval}"` };
    }
    const what = chunk ? "a production CHUNK render (out_*_chunks/chunk-*.mp4)" : span === null ? "a whole-film local render (no --frames range)" : `a local render of ${span} frames (over the ${LOCAL_TEST_MAX_FRAMES}-frame test-clip limit)`;
    return refusal(chunk ? "CHUNK_RENDER_REFUSED" : "LOCAL_PRODUCTION_REFUSED", what, root);
  } catch (e) {
    return { ok: true, kind: "guard-error", error: String((e && e.message) || e) };
  }
}

/** called by the shim inside remotion-cli.js: refuse = exit 2 before Remotion loads anything */
function shim() {
  const r = decide({ argv: process.argv.slice(2) });
  if (r.loud) process.stderr.write(r.loud + "\n");
  if (!r.ok) { process.stderr.write(r.error + "\n"); process.exit(2); }
}

// ---- install / status / uninstall ----------------------------------------------------------------------------------
const files = (nodeModules) => {
  const cli = path.join(nodeModules, "@remotion", "cli", "remotion-cli.js");
  return { cli, backup: cli + BACKUP_SUFFIX, dir: path.join(nodeModules, GUARD_DIR), decide: path.join(nodeModules, GUARD_DIR, "decide.js") };
};
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const writeAtomic = (p, s) => { const tmp = `${p}.tmp-${process.pid}`; fs.writeFileSync(tmp, s); fs.renameSync(tmp, p); };
const ownSource = (source) => (typeof source === "string" ? source : fs.readFileSync(__filename, "utf8"));
// the same guard read through `git show` (LF, trimmed by book-start) or from a CRLF checkout is the same guard
const norm = (s) => s.replace(/\r\n/g, "\n").trimEnd();
const sameSource = (a, b) => a !== null && b !== null && norm(a) === norm(b);

/** the original file without our block (whatever version of the block it carries) */
function stripShim(text) {
  const a = text.indexOf(MARK_BEGIN), b = text.indexOf(MARK_END);
  if (a < 0 || b < a) return text;
  return text.slice(0, a) + text.slice(b + MARK_END.length).replace(/^\r?\n/, "");
}
/** the block goes right after the shebang (node only strips a shebang on line 1) */
function withShim(original) {
  const nl = original.indexOf("\n");
  if (original.startsWith("#!") && nl >= 0) return original.slice(0, nl + 1) + SHIM + "\n" + original.slice(nl + 1);
  return SHIM + "\n" + original;
}

/** @returns {{ state: "absent"|"missing"|"stale"|"present", cli, decide }} — "absent": no Remotion CLI in that node_modules */
function status({ nodeModules, source } = {}) {
  const f = files(nodeModules);
  const text = read(f.cli);
  if (text === null) return { state: "absent", cli: f.cli, decide: f.decide };
  if (!text.includes(MARK_BEGIN)) return { state: "missing", cli: f.cli, decide: f.decide };
  const current = text === withShim(stripShim(text)) && sameSource(read(f.decide), ownSource(source));
  return { state: current ? "present" : "stale", cli: f.cli, decide: f.decide, backup: fs.existsSync(f.backup) ? f.backup : null };
}

/**
 * Prepend the shim (idempotent) and write decide.js. `source` = this module's text (book-start.js passes the origin copy).
 * @returns {{ state: "installed"|"updated"|"present"|"absent", cli }}
 */
function install({ nodeModules, source } = {}) {
  const f = files(nodeModules);
  const text = read(f.cli);
  if (text === null) return { state: "absent", cli: f.cli };
  const before = status({ nodeModules, source });
  if (before.state === "present") return { state: "present", cli: f.cli };
  const src = ownSource(source);
  fs.mkdirSync(f.dir, { recursive: true });
  if (!sameSource(read(f.decide), src)) writeAtomic(f.decide, norm(src) + "\n");
  const original = stripShim(text);
  // a file without our block IS the original (a fresh npm install replaces it): that is the backup to restore
  if (!text.includes(MARK_BEGIN)) writeAtomic(f.backup, text);
  const next = withShim(original);
  if (next !== text) writeAtomic(f.cli, next);
  return { state: before.state === "missing" ? "installed" : "updated", cli: f.cli };
}

/** restore the backup (or strip the block when there is none) and remove decide.js */
function uninstall({ nodeModules } = {}) {
  const f = files(nodeModules);
  const text = read(f.cli);
  let state = "absent";
  if (text !== null && text.includes(MARK_BEGIN)) {
    const backup = read(f.backup);
    writeAtomic(f.cli, backup !== null && !backup.includes(MARK_BEGIN) ? backup : stripShim(text));
    state = "removed";
  }
  try { fs.unlinkSync(f.backup); } catch {}
  try { fs.rmSync(f.dir, { recursive: true, force: true }); } catch {}
  return { state, cli: f.cli };
}

module.exports = { decide, shim, install, status, uninstall, framesSpan, projectRoot, SHIM, MARK_BEGIN, MARK_END, APPROVAL_ENV, LOCAL_TEST_MAX_FRAMES, APPROVAL_MIN_WORDS };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const nmArg = argv.find((a) => a.startsWith("--node-modules="));
  let nodeModules = nmArg ? path.resolve(nmArg.slice(15)) : path.join(projectRoot(__dirname) || process.cwd(), "node_modules");
  try { nodeModules = fs.realpathSync(nodeModules); } catch {}
  const op = argv.includes("--install") ? install : argv.includes("--uninstall") ? uninstall : argv.includes("--status") ? status : null;
  if (!op) { process.stderr.write("usage: node scripts/lib/remotion-cli-guard.js --status | --install | --uninstall [--node-modules=<dir>]\n"); process.exit(1); }
  const r = op({ nodeModules });
  process.stdout.write(`render guard: ${r.state} (${nodeModules})\n`);
  process.exit(r.state === "absent" && op !== uninstall ? 1 : 0);
}
