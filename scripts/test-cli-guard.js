#!/usr/bin/env node
// SHARED REMOTION CLI GUARD (cycle 8, 2026-11-03). Real case: the-most-important-thing, 2026-10-31 — the book's PINNED
// worktree ran its own render.js, whose method defaulted to LOCAL: 22 of 186 production chunks rendered on the operator's
// PC. render-entry-guard.js (2026-11-02) guards current code only; a pin is never edited, so its old render.js stays.
// Every worktree shares one node_modules, so scripts/lib/remotion-cli-guard.js shims node_modules/@remotion/cli/remotion-cli.js.
// Checks: the decision (non-render / runner / current code / test clip / operator approval / refusals / fail-open),
// install + uninstall on a TEMP fake node_modules (never the real one), idempotent, backup restored, the shimmed fake CLI
// spawned from a fake old pin (exit 2) and from current code (runs), and book-start.js installing it from ORIGIN's copy.
// Run: node scripts/test-cli-guard.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 500)})` : ""}`); if (!ok) failed++; };
const G = require("./lib/remotion-cli-guard");
const W = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const norm = (x) => x.replace(/\r\n/g, "\n").trimEnd(); // a CRLF checkout and `git show` output are the same guard
const GUARD_SRC = norm(fs.readFileSync(require.resolve("./lib/remotion-cli-guard"), "utf8"));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cli-guard-")));
// a clean env: the cloud regression runs on a genuine runner, which the guard (rightly) allows
const CLEAN = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GITHUB_ACTIONS|GITHUB_RUN_ID|RUNNER_TEMP|REMOTION_LOCAL_PRODUCTION_APPROVED)$/.test(k)));

try {
  // fixtures: an OLD pin (package.json, no render-entry-guard.js) and CURRENT code (has it)
  const OLD = path.join(tmp, "wt-book-old"), CUR = path.join(tmp, "wt-production-base");
  W(path.join(OLD, "package.json"), "{}\n"); W(path.join(OLD, "scripts", "render.js"), "// old: method defaults to local\n");
  W(path.join(CUR, "package.json"), "{}\n"); W(path.join(CUR, "scripts", "lib", "render-entry-guard.js"), "// current\n");
  fs.mkdirSync(path.join(OLD, "src"), { recursive: true });
  const chunk = path.join(OLD, "out_Antidote-x_chunks", "chunk-0003.mp4");
  const d = (argv, o = {}) => G.decide({ argv, cwd: o.cwd || OLD, env: o.env || {}, platform: o.platform || "win32" });

  // ── 1. the decision ────────────────────────────────────────────────────────────────────────────────────────────────
  let r = d(["still", "Thumb-x", "out/t.png", "--frame=0"]);
  t("`remotion still` from an old pin -> allowed (not render)", r.ok && r.kind === "not-render");
  r = d(["studio"]);
  t("`remotion studio` -> allowed", r.ok && r.kind === "not-render");
  r = d(["lambda", "render", "site", "Comp"]);
  t("`remotion lambda render` -> not intercepted (subcommand is lambda)", r.ok && r.kind === "not-render");
  r = d(["render", "src/index.ts", "Comp", chunk, "--frames=0-399"], { env: { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "1", RUNNER_TEMP: "/tmp" }, platform: "linux" });
  t("genuine Linux runner -> allowed", r.ok && r.kind === "runner");
  r = d(["render", "src/index.ts", "Comp", chunk, "--frames=0-399"], { env: { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "1", RUNNER_TEMP: "/tmp" }, platform: "win32" });
  t("runner env on Windows -> NOT the runner (refused)", !r.ok && r.kind === "CHUNK_RENDER_REFUSED");
  r = d(["render", "src/index.ts", "Comp", path.join(CUR, "out_C_chunks", "chunk-0001.mp4"), "--frames=0-399"], { cwd: path.join(CUR, "src") });
  t("current-code root (render-entry-guard.js, found from a subfolder) -> allowed", r.ok && r.kind === "current-code");
  r = d(["render", "src/index.ts", "Comp", chunk, "--frames=400-799"]);
  t("old pin, 400-frame CHUNK render -> refused (exit-2 kind CHUNK_RENDER_REFUSED)", !r.ok && r.kind === "CHUNK_RENDER_REFUSED");
  t("  the refusal names the launcher, the github method and the approval env", /--launcher/.test(r.error) && /--method=github/.test(r.error) && /--book-root=/.test(r.error) && /REMOTION_LOCAL_PRODUCTION_APPROVED/.test(r.error), r.error);
  r = d(["render", "Antidote-x", "out/x.mp4", "--codec=h264", "--concurrency=3", "--force"]);
  t("old pin, whole film with no --frames (pipeline.js) -> refused", !r.ok && r.kind === "LOCAL_PRODUCTION_REFUSED" && /whole-film/.test(r.error));
  r = d(["render", "src/index.ts", "Comp", "out/x.mp4", "--frames=0-5000"]);
  t("old pin, 5001 frames to a non-chunk path -> refused (over the clip limit)", !r.ok && r.kind === "LOCAL_PRODUCTION_REFUSED" && /5001 frames/.test(r.error));
  r = d(["render", "src/index.ts", "Comp", "out/x.frames-0-899.mp4", "--frames=0-899"]);
  t("old pin, short clip (900 frames) to a non-chunk path -> allowed", r.ok && r.kind === "test-clip" && r.span === 900);
  r = d(["render", "src/index.ts", "Comp", "out/x.mp4", "--frames", "0-1799"]);
  t("old pin, --frames a-b as two args, exactly 1800 -> allowed", r.ok && r.kind === "test-clip");
  r = d(["render", "src/index.ts", "Comp", chunk, "--frames=0-99"]);
  t("old pin, short range but INTO a chunk file -> refused (a chunk is production)", !r.ok && r.kind === "CHUNK_RENDER_REFUSED");
  r = d(["render", "src/index.ts", "Comp", `--output=${chunk}`, "--frames=0-99"]);
  t("old pin, chunk via --output= -> refused", !r.ok && r.kind === "CHUNK_RENDER_REFUSED");
  r = d(["render", "src/index.ts", "Comp", chunk, "--frames=0-399"], { env: { REMOTION_LOCAL_PRODUCTION_APPROVED: "the operator approves this local render tonight" } });
  t("operator approval (>= 6 words) -> allowed, with a loud line", r.ok && r.kind === "operator-approved" && /LOCAL PRODUCTION RENDER/.test(r.loud));
  r = d(["render", "src/index.ts", "Comp", chunk, "--frames=0-399"], { env: { REMOTION_LOCAL_PRODUCTION_APPROVED: "yes ok" } });
  t("approval too short -> refused (APPROVAL_TOO_SHORT)", !r.ok && r.kind === "APPROVAL_TOO_SHORT");
  r = G.decide({ argv: { get length() { throw new Error("boom"); } }, cwd: OLD, env: {}, platform: "win32" });
  t("an exception inside the guard -> allowed (fail-open)", r.ok && r.kind === "guard-error" && /boom/.test(r.error));
  r = G.decide({ argv: ["render", "Comp", "out/x.mp4"], cwd: path.parse(tmp).root, env: {}, platform: "win32" });
  t("no package.json above the cwd, whole film -> refused", !r.ok);

  // ── 2. install / status / uninstall on a TEMP fake node_modules ───────────────────────────────────────────────────
  const NM = path.join(tmp, "test", "node_modules");
  const CLI = path.join(NM, "@remotion", "cli", "remotion-cli.js");
  const ORIGINAL = "#!/usr/bin/env node\nconsole.log('FAKE REMOTION RAN ' + process.argv.slice(2).join(' '));\nprocess.exit(0);\n";
  W(CLI, ORIGINAL);
  t("status before install: missing", G.status({ nodeModules: NM }).state === "missing");
  r = G.install({ nodeModules: NM });
  const after1 = fs.readFileSync(CLI, "utf8");
  t("install -> installed; shebang stays on line 1, the block right after it", r.state === "installed" && after1.startsWith("#!/usr/bin/env node\n" + G.MARK_BEGIN) && after1.endsWith(ORIGINAL.slice(ORIGINAL.indexOf("\n") + 1)), after1);
  t("  decide.js copied INTO node_modules (independent of any checkout's scripts/)", norm(fs.readFileSync(path.join(NM, ".render-guard", "decide.js"), "utf8")) === GUARD_SRC);
  t("  backup of the original next to it", fs.readFileSync(CLI + ".render-guard-backup", "utf8") === ORIGINAL);
  r = G.install({ nodeModules: NM });
  t("install again -> present, file unchanged (idempotent, one block)", r.state === "present" && fs.readFileSync(CLI, "utf8") === after1 && after1.split(G.MARK_BEGIN).length === 2);
  t("status: present", G.status({ nodeModules: NM }).state === "present");
  // an older guard version: a different source -> updated, still one block, backup kept as the real original
  r = G.install({ nodeModules: NM, source: "// older guard\nmodule.exports = { shim() {} };\n" });
  t("a different guard source -> updated", r.state === "updated" && G.status({ nodeModules: NM }).state === "stale");
  r = G.install({ nodeModules: NM });
  t("back to the current source -> updated, one block, backup still the original", r.state === "updated" && fs.readFileSync(CLI, "utf8") === after1 && fs.readFileSync(CLI + ".render-guard-backup", "utf8") === ORIGINAL);

  // ── 3. end to end: the shimmed fake CLI spawned like `npx remotion` ───────────────────────────────────────────────
  const run = (argv, cwd, env = {}) => spawnSync(process.execPath, [CLI, ...argv], { cwd, encoding: "utf8", env: { ...CLEAN, ...env } });
  r = run(["render", "src/index.ts", "Antidote-x", chunk, "--frames=0-399"], OLD);
  t("old pin: `remotion render ... chunk-0003.mp4 --frames=0-399` -> exit 2, Remotion never runs", r.status === 2 && !/FAKE REMOTION RAN/.test(r.stdout) && /REFUSED remotion render/.test(r.stderr), `${r.status} ${r.stdout} ${r.stderr}`);
  r = run(["render", "Antidote-x", "out/x.mp4", "--codec=h264"], OLD);
  t("old pin: whole film -> exit 2", r.status === 2 && !/FAKE REMOTION RAN/.test(r.stdout), `${r.status} ${r.stderr}`);
  r = run(["still", "Thumb-x", "out/t.png", "--frame=0"], OLD);
  t("old pin: `remotion still` -> runs (exit 0)", r.status === 0 && /FAKE REMOTION RAN still/.test(r.stdout), `${r.status} ${r.stderr}`);
  r = run(["render", "src/index.ts", "Comp", "out/clip.mp4", "--frames=0-299"], OLD);
  t("old pin: 300-frame clip -> runs", r.status === 0 && /FAKE REMOTION RAN render/.test(r.stdout), `${r.status} ${r.stderr}`);
  r = run(["render", "src/index.ts", "Comp", path.join(CUR, "out_C_chunks", "chunk-0000.mp4"), "--frames=0-399"], CUR);
  t("current code: chunk render -> runs (its own entry guard decided)", r.status === 0 && /FAKE REMOTION RAN render/.test(r.stdout), `${r.status} ${r.stderr}`);
  r = run(["render", "src/index.ts", "Comp", chunk, "--frames=0-399"], OLD, { REMOTION_LOCAL_PRODUCTION_APPROVED: "operator said render this one locally now" });
  t("old pin + operator approval -> runs, loud line on stderr", r.status === 0 && /FAKE REMOTION RAN/.test(r.stdout) && /LOCAL PRODUCTION RENDER/.test(r.stderr), `${r.status} ${r.stderr}`);
  fs.writeFileSync(path.join(NM, ".render-guard", "decide.js"), "throw new Error('broken guard');\n");
  r = run(["render", "Antidote-x", "out/x.mp4"], OLD);
  t("a broken decide.js -> Remotion still runs (fail-open)", r.status === 0 && /FAKE REMOTION RAN/.test(r.stdout), `${r.status} ${r.stderr}`);
  t("  status reports it stale", G.status({ nodeModules: NM }).state === "stale");
  G.install({ nodeModules: NM });

  // ── 4. uninstall ──────────────────────────────────────────────────────────────────────────────────────────────────
  r = G.uninstall({ nodeModules: NM });
  t("uninstall -> the original restored byte for byte, backup + .render-guard removed", r.state === "removed" && fs.readFileSync(CLI, "utf8") === ORIGINAL && !fs.existsSync(CLI + ".render-guard-backup") && !fs.existsSync(path.join(NM, ".render-guard")));
  t("uninstall again -> nothing to do", G.uninstall({ nodeModules: NM }).state === "absent" && fs.readFileSync(CLI, "utf8") === ORIGINAL);
  t("install on a node_modules without @remotion/cli -> absent, nothing written", G.install({ nodeModules: path.join(tmp, "empty-nm") }).state === "absent" && !fs.existsSync(path.join(tmp, "empty-nm")));
  // a fresh npm install replaces the CLI file: the next install backs up THAT original
  G.install({ nodeModules: NM });
  const NEWER = ORIGINAL.replace("FAKE REMOTION RAN", "FAKE REMOTION v2 RAN");
  fs.writeFileSync(CLI, NEWER);
  r = G.install({ nodeModules: NM });
  t("after npm replaced the CLI -> installed again, backup = the new original", r.state === "installed" && fs.readFileSync(CLI + ".render-guard-backup", "utf8") === NEWER);
  G.uninstall({ nodeModules: NM });
  t("  uninstall restores the new original", fs.readFileSync(CLI, "utf8") === NEWER);

  // ── 5. the CLI ────────────────────────────────────────────────────────────────────────────────────────────────────
  const cli = (a) => spawnSync(process.execPath, [require.resolve("./lib/remotion-cli-guard"), a, `--node-modules=${NM}`], { encoding: "utf8", env: CLEAN });
  r = cli("--status"); t("CLI --status -> missing", r.status === 0 && /render guard: missing/.test(r.stdout), r.stdout + r.stderr);
  r = cli("--install"); t("CLI --install -> installed", r.status === 0 && /render guard: installed/.test(r.stdout), r.stdout + r.stderr);
  r = cli("--uninstall"); t("CLI --uninstall -> removed, original back", r.status === 0 && /removed/.test(r.stdout) && fs.readFileSync(CLI, "utf8") === NEWER, r.stdout + r.stderr);

  // ── 6. book-start.js installs it from ORIGIN's copy (the calling checkout is old and has neither file) ────────────
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const ORIG = path.join(tmp, "origin.git"), SEED = path.join(tmp, "seed"), MAIN = path.join(tmp, "test");
  g(tmp, "init", "-q", "--bare", ORIG); g(tmp, "init", "-q", SEED);
  for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"], ["core.autocrlf", "false"]]) g(SEED, "config", k, v);
  W(path.join(SEED, "CLAUDE.md"), "old\n"); W(path.join(SEED, ".gitignore"), "node_modules/\n");
  g(SEED, "add", "-A"); g(SEED, "commit", "-q", "-m", "old"); g(SEED, "branch", "-M", "god-mode");
  g(SEED, "remote", "add", "origin", ORIG); g(SEED, "push", "-q", "origin", "god-mode");
  // MAIN = tmp/test already holds the fake node_modules (gitignored): clone into it via init + fetch
  g(MAIN, "init", "-q"); g(MAIN, "remote", "add", "origin", ORIG); g(MAIN, "fetch", "-q", "origin", "god-mode"); g(MAIN, "checkout", "-q", "-b", "god-mode", "origin/god-mode");
  fs.mkdirSync(path.join(SEED, "scripts", "lib"), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "book-start.js"), path.join(SEED, "scripts", "book-start.js"));
  fs.copyFileSync(require.resolve("./lib/remotion-cli-guard"), path.join(SEED, "scripts", "lib", "remotion-cli-guard.js"));
  fs.copyFileSync(require.resolve("./lib/node-bin"), path.join(SEED, "scripts", "lib", "node-bin.js"));
  W(path.join(NM, "@remotion", "cli", "package.json"), JSON.stringify({ name: "@remotion/cli", bin: { remotion: "remotion-cli.js" } }));
  fs.rmSync(path.join(NM, ".bin"), { recursive: true, force: true });
  g(SEED, "add", "-A"); g(SEED, "commit", "-q", "-m", "new"); g(SEED, "push", "-q", "origin", "god-mode");
  g(MAIN, "fetch", "-q", "origin", "god-mode");
  const script = g(MAIN, "show", "origin/god-mode:scripts/book-start.js");
  const bs = (argv) => spawnSync(process.execPath, ["-", ...argv], { cwd: MAIN, input: script, encoding: "utf8", env: CLEAN });
  r = bs(["--slug=s1", "--check"]);
  t("book-start --check: reports the guard NOT installed, installs nothing", /render guard: NOT installed/.test(r.stdout) && fs.readFileSync(CLI, "utf8") === NEWER, r.stdout + r.stderr);
  t("book-start --check: reports the lost .bin shims, recreates nothing", /node_modules: 3 \.bin shim file\(s\) missing/.test(r.stdout) && !fs.existsSync(path.join(NM, ".bin")), r.stdout + r.stderr);
  r = bs(["--launcher"]);
  const shimmed = fs.readFileSync(CLI, "utf8");
  t("book-start --launcher (from an old checkout): installs the guard before anything else", /render guard: installed \(shared node_modules /.test(r.stdout) && shimmed.includes(G.MARK_BEGIN), r.stdout + r.stderr);
  t("book-start (origin's doctor, from an old checkout): the lost .bin is healed in the shared node_modules", /node_modules: healed \(3 missing/.test(r.stdout) && ["remotion", "remotion.cmd", "remotion.ps1"].every((f) => fs.existsSync(path.join(NM, ".bin", f))), r.stdout + r.stderr);
  t("  decide.js = origin's guard source (git show output, newline-normalised)", norm(fs.readFileSync(path.join(NM, ".render-guard", "decide.js"), "utf8")) === GUARD_SRC);
  t("  CLI --status from the checkout agrees: present", /render guard: present/.test(cli("--status").stdout));
  r = bs(["--slug=s1", "--check"]);
  t("book-start --check afterwards: present", /render guard: present/.test(r.stdout), r.stdout + r.stderr);
  r = bs(["--launcher"]);
  t("book-start again: node_modules ok", /node_modules: ok \(shared /.test(r.stdout), r.stdout + r.stderr);
  t("book-start again: present, file unchanged", /render guard: present/.test(r.stdout) && fs.readFileSync(CLI, "utf8") === shimmed, r.stdout + r.stderr);
  r = run(["render", "src/index.ts", "Antidote-x", chunk, "--frames=0-399"], OLD);
  t("after book-start: the old pin's chunk render -> exit 2", r.status === 2, `${r.status} ${r.stderr}`);
} catch (e) {
  t("test harness", false, e.stack);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
