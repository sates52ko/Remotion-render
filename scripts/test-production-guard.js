#!/usr/bin/env node
// Tests for scripts/lib/production-guard.js in a throwaway git repo (no Remotion, no network).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${extra}` : ""}`); if (!ok) fail++; };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "pguard-"));
const g = (...a) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t"); g("config", "core.autocrlf", "false");
fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
fs.mkdirSync(path.join(root, "src", "engines"), { recursive: true });
fs.mkdirSync(path.join(root, "books", "demo"), { recursive: true });
for (const f of ["production-guard.js", "code-fingerprint.js"]) fs.copyFileSync(path.join(__dirname, "lib", f), path.join(root, "scripts", "lib", f));
fs.writeFileSync(path.join(root, "src", "engines", "face.ts"), "export const mouth = 'v1';\n");
fs.writeFileSync(path.join(root, "src", "books.generated.ts"), "export const books = [];\n");
fs.writeFileSync(path.join(root, "books", "demo", "book.json"), "{}\n");
fs.writeFileSync(path.join(root, ".gitignore"), "books/*/pipeline-record.json\n");
g("add", "-A"); g("commit", "-q", "-m", "v1");
const v1 = g("rev-parse", "--short", "HEAD");
fs.writeFileSync(path.join(root, "src", "engines", "face.ts"), "export const mouth = 'v2';\n");
g("commit", "-q", "-am", "v2");

const runner = path.join(root, "scripts", "run-guard.js");
fs.writeFileSync(runner, "require('./lib/production-guard').productionGuard({ slug: 'demo', step: 'test-step' });\nconsole.log('RAN');\n");
g("add", "scripts/run-guard.js"); g("commit", "-q", "-m", "runner");
const run = (env = {}, cwd = root, file = runner) => spawnSync(process.execPath, [file], { cwd, encoding: "utf8", env: { ...process.env, PRODUCTION_GUARD: "", GITHUB_ACTIONS: "", PRODUCTION_ALLOW_DIRTY: "", ...env } });
const rec = () => JSON.parse(fs.readFileSync(path.join(root, "books", "demo", "pipeline-record.json"), "utf8")).runs;

let r = run();
t("clean checkout runs and says code = HEAD", r.status === 0 && /RAN/.test(r.stdout) && /code = HEAD/.test(r.stdout), r.stderr);
t("records step, HEAD and tree ids", rec().length === 1 && rec()[0].step === "test-step" && rec()[0].head && rec()[0].srcTree && rec()[0].dirty === 0);

fs.writeFileSync(path.join(root, "src", "books.generated.ts"), "export const books = ['x'];\n");
r = run();
t("regenerated src/books.generated.ts is not drift", r.status === 0 && /RAN/.test(r.stdout), r.stderr);

fs.writeFileSync(path.join(root, "scripts", "temp-helper.js"), "// scratch\n");
r = run();
t("an untracked top-level script is not drift", r.status === 0 && /RAN/.test(r.stdout), r.stderr);

fs.writeFileSync(path.join(root, "src", "engines", "face.ts"), "export const mouth = 'v1';\n");
r = run();
t("an old copy of an engine file STOPS the run (exit 2, nothing ran)", r.status === 2 && !/RAN/.test(r.stdout), `${r.status} ${r.stdout} ${r.stderr}`);
t("the stop names the file and the old commit it matches", /src\/engines\/face\.ts/.test(r.stderr) && new RegExp(`version from ${v1}`).test(r.stderr), r.stderr);
t("the guard changed nothing on disk", fs.readFileSync(path.join(root, "src", "engines", "face.ts"), "utf8").includes("'v1'"));
t("a stopped run is still recorded with its drift", rec().slice(-1)[0].dirty === 1 && rec().slice(-1)[0].driftFiles.includes("src/engines/face.ts") && !!rec().slice(-1)[0].treeSha256);

r = run({ PRODUCTION_ALLOW_DIRTY: "testing a local face tweak" });
t("PRODUCTION_ALLOW_DIRTY lets it run and records the reason", r.status === 0 && /RAN/.test(r.stdout) && rec().slice(-1)[0].allowReason === "testing a local face tweak", r.stderr);
r = spawnSync(process.execPath, [runner, "--allow-dirty-code=flag reason"], { cwd: root, encoding: "utf8", env: { ...process.env, PRODUCTION_GUARD: "", GITHUB_ACTIONS: "", PRODUCTION_ALLOW_DIRTY: "" } });
t("--allow-dirty-code=<reason> works too", r.status === 0 && rec().slice(-1)[0].allowReason === "flag reason", r.stderr);

r = run({ GITHUB_ACTIONS: "true" });
t("skipped inside GitHub Actions", r.status === 0 && /RAN/.test(r.stdout) && !/production-guard/.test(r.stdout + r.stderr));
g("checkout", "-q", "--", "src/engines/face.ts");

fs.unlinkSync(path.join(root, "src", "engines", "face.ts"));
r = run();
t("a deleted tracked engine file STOPS the run", r.status === 2 && /face\.ts — deleted/.test(r.stderr), r.stderr);
g("checkout", "-q", "--", "src/engines/face.ts");

fs.writeFileSync(path.join(root, "scripts", "lib", "extra.js"), "module.exports = 1;\n");
r = run();
t("an untracked scripts/lib file (requirable) STOPS the run", r.status === 2 && /extra\.js — untracked/.test(r.stderr), r.stderr);
fs.unlinkSync(path.join(root, "scripts", "lib", "extra.js"));

const wt = path.join(os.tmpdir(), `pguard-wt-${path.basename(root)}`);
g("worktree", "add", "-q", wt, "-b", "dev");
fs.writeFileSync(path.join(wt, "src", "engines", "face.ts"), "export const mouth = 'dev';\n");
r = run({}, wt, path.join(wt, "scripts", "run-guard.js"));
t("in a linked worktree drift only warns (development)", r.status === 0 && /RAN/.test(r.stdout) && /linked worktree/.test(r.stderr), `${r.status} ${r.stderr}`);

g("worktree", "remove", "--force", wt);
fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED` : "\nall production-guard checks passed");
process.exit(fail ? 1 : 0);
