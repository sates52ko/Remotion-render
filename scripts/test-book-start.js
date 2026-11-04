#!/usr/bin/env node
// BOOK START (2026-10-26): a new book starts on the current origin/god-mode engine code, in its own linked worktree,
// pinned (scripts/lib/production-guard.js bookStartGate + scripts/preview-state.js pin/worktree). Throwaway repos:
// a bare "origin", the "main" clone, linked worktrees. No network, no Remotion. Run: node scripts/test-book-start.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync, spawnSync } = require("child_process");

let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${String(extra).slice(0, 600)}` : ""}`); if (!ok) fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bookstart-"));
const git = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const ENV = { ...process.env, PRODUCTION_GUARD: "", GITHUB_ACTIONS: "", PRODUCTION_ALLOW_DIRTY: "", PRODUCTION_ALLOW_BEHIND: "", PRODUCTION_ALLOW_MAIN: "", GIT_TERMINAL_PROMPT: "0" };
const runGuard = (cwd, slug, env = {}) => spawnSync(process.execPath, [path.join(cwd, "scripts", "run-guard.js"), slug], { cwd, encoding: "utf8", env: { ...ENV, ...env } });
const runState = (cwd, argv, env = {}) => spawnSync(process.execPath, [path.join(cwd, "scripts", "preview-state.js"), ...argv], { cwd, encoding: "utf8", env: { ...ENV, ...env } });
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const book = (root, slug) => { fs.mkdirSync(path.join(root, "books", slug), { recursive: true }); fs.writeFileSync(path.join(root, "books", slug, "book.json"), JSON.stringify({ slug, engine: "antidote" }) + "\n"); };
const hashTree = (root, rels) => crypto.createHash("sha256").update(rels.map((r) => { try { return r + fs.readFileSync(path.join(root, r), "utf8"); } catch { return r + "<missing>"; } }).join("|")).digest("hex");

try {
  // ── origin (bare) with engine v1 ───────────────────────────────────────────
  const seed = path.join(tmp, "seed"), origin = path.join(tmp, "origin.git"), main = path.join(tmp, "main");
  fs.mkdirSync(path.join(seed, "scripts", "lib"), { recursive: true });
  fs.mkdirSync(path.join(seed, "src", "engines"), { recursive: true });
  git(tmp, "init", "-q", "--bare", origin);
  git(seed, "init", "-q"); git(seed, "config", "user.email", "t@t"); git(seed, "config", "user.name", "t"); git(seed, "config", "core.autocrlf", "false");
  for (const f of ["production-guard.js", "code-fingerprint.js", "audio-source.js"]) fs.copyFileSync(path.join(__dirname, "lib", f), path.join(seed, "scripts", "lib", f));
  fs.copyFileSync(path.join(__dirname, "preview-state.js"), path.join(seed, "scripts", "preview-state.js"));
  fs.writeFileSync(path.join(seed, "scripts", "run-guard.js"), "require('./lib/production-guard').productionGuard({ slug: process.argv[2], step: 'storyboard prep' });\nconsole.log('RAN');\n");
  fs.writeFileSync(path.join(seed, "src", "engines", "face.ts"), "export const mouth = 'v1';\n");
  fs.writeFileSync(path.join(seed, ".gitignore"), "books/\nnode_modules\n");
  git(seed, "add", "-A"); git(seed, "commit", "-q", "-m", "engine v1"); git(seed, "branch", "-M", "god-mode");
  git(seed, "remote", "add", "origin", origin); git(seed, "push", "-q", "origin", "god-mode");
  git(tmp, "clone", "-q", "-b", "god-mode", origin, main);
  git(main, "config", "user.email", "t@t"); git(main, "config", "user.name", "t");
  const v1 = git(main, "rev-parse", "HEAD");
  // origin moves on: engine v2 (another agent's push)
  fs.writeFileSync(path.join(seed, "src", "engines", "face.ts"), "export const mouth = 'v2';\n");
  git(seed, "commit", "-q", "-am", "engine v2"); git(seed, "push", "-q", "origin", "god-mode");
  const v2 = git(seed, "rev-parse", "HEAD");

  // ── A. current code, own worktree → the book starts and is pinned to origin ──
  git(main, "fetch", "-q", "origin", "god-mode");
  const wtA = path.join(tmp, "wt-book-alpha");
  git(main, "worktree", "add", "-q", "--detach", wtA, "origin/god-mode");
  book(wtA, "alpha");
  let r = runGuard(wtA, "alpha");
  const pinA = readJSON(path.join(wtA, "books", "alpha", "production-base.json"));
  t("A. current origin code in its own worktree: the book starts", r.status === 0 && /RAN/.test(r.stdout), r.stderr);
  t("A. ...pinned to the verified origin SHA", !!pinA && pinA.productionBase === v2 && /book start/.test(pinA.pinnedBy || ""), JSON.stringify(pinA));
  t("A. ...and the start is recorded", (readJSON(path.join(wtA, "books", "alpha", "pipeline-record.json")) || { runs: [] }).runs.slice(-1)[0]?.bookStart?.codeEqualsOrigin === true);
  r = runGuard(wtA, "alpha");
  t("A. the next step is an ordinary step (no second start check)", r.status === 0 && !(readJSON(path.join(wtA, "books", "alpha", "pipeline-record.json")).runs.slice(-1)[0].bookStart));

  // ── B. stale code → the book does not start ─────────────────────────────────
  const wtB = path.join(tmp, "wt-book-beta");
  git(main, "worktree", "add", "-q", "--detach", wtB, v1);
  book(wtB, "beta");
  r = runGuard(wtB, "beta");
  t("B. engine code behind origin: storyboard prep is refused (exit 2, nothing ran)", r.status === 2 && !/RAN/.test(r.stdout), `${r.status} ${r.stderr}`);
  t("B. ...the refusal names the cause and the fix", /differs from origin\/god-mode/.test(r.stderr) && /preview-state\.js worktree --slug=beta/.test(r.stderr), r.stderr);
  t("B. ...no pin and no record (the next try is still a start)", !fs.existsSync(path.join(wtB, "books", "beta", "production-base.json")) && !fs.existsSync(path.join(wtB, "books", "beta", "pipeline-record.json")));
  // the state machine says so BEFORE the agent walks into the refusal (status never fetches: last fetched origin)
  fs.writeFileSync(path.join(wtB, "books", "beta", "book.json"), JSON.stringify({ slug: "beta", engine: "antidote", engineProfile: { kind: "nonfiction" } }) + "\n");
  fs.mkdirSync(path.join(wtB, "public", "audio"), { recursive: true }); fs.mkdirSync(path.join(wtB, "public", "captions"), { recursive: true });
  fs.writeFileSync(path.join(wtB, "public", "audio", "beta.m4a"), Buffer.alloc(200 * 1024, 7));
  fs.writeFileSync(path.join(wtB, "public", "captions", "beta.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nhello\n");
  r = runState(wtB, ["status", "--slug=beta", "--json"]);
  let sj = null; try { sj = JSON.parse(r.stdout); } catch {}
  t("B. preview-state status stops at the start (OPERATOR BOOK_START_STALE), not at a pin that would be refused", !!sj && sj.state === "OPERATOR" && sj.operator.code === "BOOK_START_STALE" && sj.stages.filter((x) => x.key === "code").length === 1, r.stdout.slice(0, 400));
  r = runState(wtB, ["pin", "--slug=beta"]);
  t("B. a hand-made pin cannot skip it (preview-state pin goes through the same gate)", r.status === 2 && !fs.existsSync(path.join(wtB, "books", "beta", "production-base.json")), `${r.status} ${r.stdout} ${r.stderr}`);

  // ── C. stale code + the operator's recorded exception ──────────────────────
  r = runGuard(wtB, "beta", { PRODUCTION_ALLOW_BEHIND: "operator: re-run on the engine the audio was cut for" });
  const pinC = readJSON(path.join(wtB, "books", "beta", "production-base.json"));
  t("C. PRODUCTION_ALLOW_BEHIND lets it start", r.status === 0 && /RAN/.test(r.stdout) && /ALLOWED by the operator/.test(r.stderr), r.stderr);
  t("C. ...the reason is recorded in the pin and the pipeline record", pinC && pinC.productionBase === v1 && /re-run/.test(pinC.allowBehind || "") && /re-run/.test(readJSON(path.join(wtB, "books", "beta", "pipeline-record.json")).runs[0].bookStart.allowBehind || ""), JSON.stringify(pinC));

  // ── D. dirty shared main checkout: refused, the other agent's work untouched ─
  fs.writeFileSync(path.join(main, "src", "engines", "face.ts"), "export const mouth = 'someone elses edit';\n"); // another agent's uncommitted change
  fs.mkdirSync(path.join(main, "books", "other"), { recursive: true });
  fs.writeFileSync(path.join(main, "books", "other", "art.json"), "{\"theirs\":true}\n");
  book(main, "gamma");
  const watch = ["src/engines/face.ts", "books/other/art.json", "books/gamma/book.json"];
  const before = hashTree(main, watch), headBefore = git(main, "rev-parse", "HEAD");
  r = runGuard(main, "gamma");
  t("D. a new book in the shared main checkout is refused (exit 2)", r.status === 2 && !/RAN/.test(r.stdout), `${r.status} ${r.stderr}`);
  t("D. ...the other agent's files are byte-identical, HEAD unchanged, no stash", hashTree(main, watch) === before && git(main, "rev-parse", "HEAD") === headBefore && git(main, "stash", "list") === "");
  // the same checkout, code current and clean: still refused (own worktree), allowed only with the recorded exception
  git(main, "checkout", "-q", "--", "src/engines/face.ts"); git(main, "merge", "-q", "--ff-only", "origin/god-mode");
  r = runGuard(main, "gamma");
  t("D. current code but the shared main checkout: refused, points to preview-state.js worktree", r.status === 2 && /shared main checkout/.test(r.stderr) && /preview-state\.js worktree --slug=gamma/.test(r.stderr), r.stderr);
  r = runGuard(main, "gamma", { PRODUCTION_ALLOW_MAIN: "operator: one-off Vox legacy book" });
  t("D. PRODUCTION_ALLOW_MAIN lets it start, recorded", r.status === 0 && /one-off/.test(readJSON(path.join(main, "books", "gamma", "production-base.json")).allowMain || ""), r.stderr);

  // ── E. a book under way keeps its pinned SHA when origin moves ─────────────
  fs.writeFileSync(path.join(seed, "src", "engines", "face.ts"), "export const mouth = 'v3';\n");
  git(seed, "commit", "-q", "-am", "engine v3"); git(seed, "push", "-q", "origin", "god-mode");
  git(main, "fetch", "-q", "origin", "god-mode");
  r = runGuard(wtA, "alpha");
  t("E. a pinned book under way still runs when origin moves (warning only)", r.status === 0 && /RAN/.test(r.stdout) && /behind origin\/god-mode/.test(r.stderr), `${r.status} ${r.stderr}`);
  t("E. ...its pin is unchanged and its worktree was not moved", readJSON(path.join(wtA, "books", "alpha", "production-base.json")).productionBase === v2 && git(wtA, "rev-parse", "HEAD") === v2);

  // ── fetch cannot verify origin → refused unless the operator allows it ─────
  const wtF = path.join(tmp, "wt-book-delta");
  git(main, "worktree", "add", "-q", "--detach", wtF, "origin/god-mode");
  book(wtF, "delta");
  git(main, "remote", "set-url", "origin", path.join(tmp, "missing.git"));
  r = runGuard(wtF, "delta");
  t("F0. origin cannot be fetched: the start is refused (current code cannot be verified)", r.status === 2 && /cannot be verified/.test(r.stderr), `${r.status} ${r.stderr}`);
  r = runState(main, ["worktree", "--slug=epsilon"]);
  t("F0. ...and preview-state worktree creates no book worktree on a failed fetch", r.status === 1 && /cannot be verified/.test(r.stderr) && !fs.existsSync(path.join(tmp, "wt-book-epsilon")), `${r.status} ${r.stderr}`);
  r = runGuard(wtF, "delta", { PRODUCTION_ALLOW_BEHIND: "operator: offline, last fetched origin is fine" });
  t("F0. ...with the recorded exception it starts", r.status === 0 && /offline/.test(readJSON(path.join(wtF, "books", "delta", "production-base.json")).allowBehind || ""), r.stderr);
  git(main, "remote", "set-url", "origin", origin);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
console.log(fail ? `\n${fail} FAILED` : "\nall book-start checks passed");
process.exit(fail ? 1 : 0);
