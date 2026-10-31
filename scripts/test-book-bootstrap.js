#!/usr/bin/env node
// BOOK START from ANY checkout (2026-10-28): a stale shared main checkout (24d7186d, ~80 behind) produced new books on
// old engine code. book-start.js is read from origin (`git show origin/god-mode:scripts/book-start.js | node -`) and
// needs nothing from the checkout it runs in. Fixture: a bare origin, an OLD main clone (with its own node_modules, the
// operator's inputs and another agent's staged WIP), a NEWER origin commit carrying the real book-start.js +
// preview-state.js. Asserts: current worktree, pinned SHA, locked, node_modules link, inputs copied, the main checkout
// untouched (HEAD / index / status); a resume copies late inputs and never overwrites; a started book is refused (never
// migrated silently) unless --adopt; --launcher refreshes the shared launcher only when clean; a failed fetch refuses;
// every harness entry file carries the bootstrap. (scripts/test-book-start.js tests the production-guard gate itself.)
// Run: node scripts/test-book-bootstrap.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 500)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const W = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "book-bootstrap-")));
const ORIG = path.join(tmp, "origin.git"), SEED = path.join(tmp, "seed"), MAIN = path.join(tmp, "test");
try {
  g(tmp, "init", "-q", "--bare", ORIG);
  g(tmp, "init", "-q", SEED);
  for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"], ["core.autocrlf", "false"]]) g(SEED, "config", k, v);
  W(path.join(SEED, "CLAUDE.md"), "old instructions\n");
  W(path.join(SEED, "scripts", "old.js"), "// old engine\n");
  g(SEED, "add", "-A"); g(SEED, "commit", "-q", "-m", "old"); g(SEED, "branch", "-M", "god-mode");
  g(SEED, "remote", "add", "origin", ORIG); g(SEED, "push", "-q", "origin", "god-mode");
  g(tmp, "clone", "-q", "-b", "god-mode", ORIG, MAIN);
  for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"], ["core.autocrlf", "false"]]) g(MAIN, "config", k, v);
  const OLD = g(MAIN, "rev-parse", "HEAD");
  // newer production code on origin: the real book-start.js + preview-state.js
  W(path.join(SEED, "CLAUDE.md"), "new instructions\n");
  fs.copyFileSync(path.join(__dirname, "book-start.js"), path.join(SEED, "scripts", "book-start.js"));
  fs.copyFileSync(path.join(__dirname, "preview-state.js"), path.join(SEED, "scripts", "preview-state.js"));
  W(path.join(SEED, "scripts", "lib", "new-engine.js"), "// new engine\n");
  g(SEED, "add", "-A"); g(SEED, "commit", "-q", "-m", "new"); g(SEED, "push", "-q", "origin", "god-mode");
  const NEW = g(SEED, "rev-parse", "HEAD");
  // the main checkout stays OLD: its node_modules, the operator's inputs, another agent's staged WIP
  W(path.join(MAIN, "node_modules", "marker.txt"), "main node_modules\n");
  W(path.join(MAIN, ".gitignore"), "node_modules/\n");
  W(path.join(MAIN, "public", "audio", "s1.mp3"), "AUDIO1");
  W(path.join(MAIN, "public", "captions", "s1.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhi\n");
  W(path.join(MAIN, "books", "s1", "prompt.notebooklm.md"), "prompt s1\n");
  W(path.join(MAIN, "books", "s1", "book.json"), JSON.stringify({ slug: "s1", engine: "antidote" }));
  W(path.join(MAIN, "other-agent-wip.txt"), "wip\n"); g(MAIN, "add", "other-agent-wip.txt");
  g(MAIN, "fetch", "-q", "origin", "god-mode"); // the bootstrap instruction fetches first
  const snap = () => ({ head: g(MAIN, "rev-parse", "HEAD"), status: g(MAIN, "status", "--porcelain", "--ignored"), index: g(MAIN, "ls-files", "-s") });
  const before = snap();
  const script = g(MAIN, "show", "origin/god-mode:scripts/book-start.js");
  t("fixture: main is OLD, origin is NEW, the old checkout has no book-start.js", before.head === OLD && OLD !== NEW && !fs.existsSync(path.join(MAIN, "scripts", "book-start.js")));
  // the bootstrap exactly as an agent in the old checkout runs it
  const run = (argv, cwd = MAIN, env = {}) => spawnSync(process.execPath, ["-", ...argv], { cwd, input: script, encoding: "utf8", env: { ...process.env, ...env } });
  const WT = path.join(tmp, "wt-book-s1");

  let r = run(["--slug=s1", "--check"]);
  t("--check from the old checkout: READY, names the stale checkout, creates nothing", r.status === 0 && /READY s1/.test(r.stdout) && /BEHIND/.test(r.stdout) && !fs.existsSync(WT), r.stdout + r.stderr);

  r = run(["--slug=s1"]);
  const pin = (() => { try { return JSON.parse(fs.readFileSync(path.join(WT, "books", "s1", "production-base.json"), "utf8")); } catch { return null; } })();
  t("creates ../wt-book-s1 on the CURRENT origin commit", r.status === 0 && fs.existsSync(WT) && g(WT, "rev-parse", "HEAD") === NEW, r.stdout + r.stderr);
  t("the new engine code is there (not the old checkout's)", fs.existsSync(path.join(WT, "scripts", "lib", "new-engine.js")) && fs.readFileSync(path.join(WT, "CLAUDE.md"), "utf8") === "new instructions\n");
  t("pinned: production-base.json = the origin SHA", !!pin && pin.productionBase === NEW && pin.worktree === "wt-book-s1", JSON.stringify(pin));
  const wtBlock = (name) => g(MAIN, "worktree", "list", "--porcelain").split(/\r?\n\r?\n/).find((b) => b.includes(name)) || "";
  t("locked (git refuses `worktree remove` through the node_modules link)", /\nlocked/.test(wtBlock("wt-book-s1")), wtBlock("wt-book-s1"));
  let nm = null; try { nm = fs.lstatSync(path.join(WT, "node_modules")); } catch {}
  t("node_modules is a link to the main checkout's (one shared install)", !!nm && nm.isSymbolicLink() && fs.readFileSync(path.join(WT, "node_modules", "marker.txt"), "utf8") === "main node_modules\n");
  t("the operator's inputs are copied (audio, VTT, Step 0 files)", ["public/audio/s1.mp3", "public/captions/s1.vtt", "books/s1/prompt.notebooklm.md", "books/s1/book.json"].every((f) => fs.existsSync(path.join(WT, f))));
  const after = snap();
  t("the shared main checkout is untouched: HEAD, index (another agent's staged WIP) and status", after.head === before.head && after.index === before.index && after.status === before.status, JSON.stringify({ before, after }).slice(0, 400));
  t("prints where to continue", /Next|Continue/.test(r.stdout) && r.stdout.includes("wt-book-s1"));

  // resume: a later input is copied; a different existing file is never overwritten
  W(path.join(MAIN, "public", "audio", "s1.m4a"), "AUDIO1-M4A");
  W(path.join(MAIN, "public", "captions", "s1.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nchanged\n");
  r = run(["--slug=s1"]);
  t("resume: RESUME in the pinned worktree, the late audio copied", r.status === 0 && /RESUME s1/.test(r.stdout) && fs.existsSync(path.join(WT, "public", "audio", "s1.m4a")), r.stdout + r.stderr);
  t("resume: a VTT that differs is reported, never overwritten", /NOT copied[^\n]*s1\.vtt/.test(r.stdout) && /hi/.test(fs.readFileSync(path.join(WT, "public", "captions", "s1.vtt"), "utf8")), r.stdout);
  r = run(["--slug=s1"], WT);
  t("run from inside the book's worktree: the same RESUME (any checkout works)", r.status === 0 && /RESUME s1/.test(r.stdout), r.stdout + r.stderr);

  // a book already STARTED in the main checkout is never migrated silently
  W(path.join(MAIN, "books", "s2", "pipeline-record.json"), JSON.stringify({ runs: [{ step: "storyboard prep", head: OLD, at: "2026-10-27T10:00:00Z", linkedWorktree: false }] }));
  W(path.join(MAIN, "books", "s2", "storyboard", "authored-1.json"), "[]");
  W(path.join(MAIN, "AGENT_LOG.md"), "# log\n\n## Active WIP (who is touching what right now)\n| preview-s2 | books/s2 | in progress | owner: agent X |\n\n## Changelog\n");
  r = run(["--slug=s2"]);
  t("started in main: REFUSED (exit 2) with the evidence and its WIP row; nothing created", r.status === 2 && /STARTED/.test(r.stderr) && /storyboard prep/.test(r.stderr) && /owner: agent X/.test(r.stdout) && !fs.existsSync(path.join(tmp, "wt-book-s2")), r.stdout + r.stderr);
  r = run(["--slug=s2", "--adopt=owner moves it to current code"]);
  const WT2 = path.join(tmp, "wt-book-s2");
  t("--adopt: a NEW pinned copy on current code, the reason recorded, the original untouched", r.status === 0 && fs.existsSync(path.join(WT2, "books", "s2", "adopted-from.json")) && fs.existsSync(path.join(WT2, "books", "s2", "storyboard", "authored-1.json")) && fs.existsSync(path.join(MAIN, "books", "s2", "pipeline-record.json")) && g(WT2, "rev-parse", "HEAD") === NEW, r.stdout + r.stderr);
  r = run(["--slug=s2"], MAIN);
  t("after adoption the book resumes in its own worktree", r.status === 0 && /RESUME s2/.test(r.stdout), r.stdout + r.stderr);
  const final = snap();
  t("main checkout still untouched after every run", final.head === before.head && final.index === before.index, JSON.stringify(final).slice(0, 300));

  // the shared launcher: refreshed to origin only when clean, stays locked
  const L = path.join(tmp, "wt-production-base");
  g(MAIN, "worktree", "add", "--detach", "-q", L, OLD); g(MAIN, "worktree", "lock", "--reason", "launcher", L);
  r = run(["--launcher"]);
  t("--launcher: the clean launcher moves to origin and stays locked", r.status === 0 && g(L, "rev-parse", "HEAD") === NEW && /\nlocked/.test(wtBlock("wt-production-base")), r.stdout + r.stderr);
  g(L, "checkout", "-q", "--detach", OLD);
  W(path.join(L, "CLAUDE.md"), "someone's edit\n");
  r = run(["--launcher"]);
  t("--launcher: a launcher with modified tracked files is never touched", r.status === 2 && g(L, "rev-parse", "HEAD") === OLD && fs.readFileSync(path.join(L, "CLAUDE.md"), "utf8") === "someone's edit\n", r.stdout + r.stderr);

  // offline: a failed fetch refuses (stale code cannot be verified) unless the operator allows it
  g(MAIN, "remote", "set-url", "origin", path.join(tmp, "nowhere.git"));
  r = run(["--slug=s3", "--check"]);
  t("fetch fails: REFUSED unless PRODUCTION_ALLOW_BEHIND", r.status === 2 && /fetch origin god-mode failed/.test(r.stderr), r.stdout + r.stderr);
  r = run(["--slug=s3", "--check"], MAIN, { PRODUCTION_ALLOW_BEHIND: "offline test" });
  t("fetch fails + PRODUCTION_ALLOW_BEHIND: proceeds on the last fetched origin, says so", r.status === 0 && /NOT fetched/.test(r.stdout), r.stdout + r.stderr);
} finally {
  // the fixture's worktrees hold a junction into the fixture's own node_modules only
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// every harness entry file routes book work through the bootstrap (the same command, read from origin)
const CMD = "git show origin/god-mode:scripts/book-start.js | node - --slug=";
for (const f of ["CLAUDE.md", "AGENTS.md", ".cursor/rules/antidote-agents.mdc", ".agents/workflows/preview-hazirla.md", ".agents/skills/notebooklm-prompt/SKILL.md", ".claude/skills/notebooklm-prompt/SKILL.md", ".claude/skills/preview-hazirla/SKILL.md"]) {
  let s = ""; try { s = fs.readFileSync(path.join(REPO, f), "utf8"); } catch {}
  t(`entry ${f}: carries the book-start bootstrap`, s.includes(CMD), f);
}
const bs = fs.readFileSync(path.join(__dirname, "book-start.js"), "utf8");
t("book-start.js is self-contained: node built-ins only (it runs from origin, nothing from the checkout)", (bs.match(/require\(["']([^"']+)["']\)/g) || []).every((x) => /require\(["'](fs|path|child_process)["']\)/.test(x)));
t("book-start.js is pure ASCII (Windows PowerShell 5.1 pipes text to native programs as ASCII)", [...bs].every((c) => c.charCodeAt(0) < 128));
console.log(failed ? `\n${failed} FAILED` : "\nall book-bootstrap checks passed");
process.exit(failed ? 1 : 0);
