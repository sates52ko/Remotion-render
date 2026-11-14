#!/usr/bin/env node
// PINNED MAINTENANCE UPGRADE (2026-10-30). Real case: the-magician-s-nephew needed a one-file preview-ready.js fix; no
// command could move its pin, so production-base.json was edited by hand under a one-off operator exception.
// maintenance-upgrade.js must: move a pinned book only for TECHNICAL files (never the engine / planners), only from the
// exact pin, only to published code, only with the operator's reason, never under a running render or over tracked
// changes, keep the book's inputs and render input byte-identical, keep the previous pin, append an audit line.
// Run: node scripts/test-maintenance-upgrade.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 500)})` : ""}`); if (!ok) failed++; };
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "maint-")));
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const W = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof x === "string" ? x : JSON.stringify(x, null, 2)); };
const SLUG = "zz-mn";
try {
  const ORIG = path.join(tmp, "origin.git"), MAIN = path.join(tmp, "main"), WT = path.join(tmp, `wt-book-${SLUG}`);
  g(tmp, "init", "-q", "--bare", ORIG);
  fs.mkdirSync(MAIN); g(MAIN, "init", "-q"); g(MAIN, "config", "user.email", "t@t"); g(MAIN, "config", "user.name", "t"); g(MAIN, "config", "core.autocrlf", "false");
  // the real tool and its libs, committed into the fixture so every commit carries them
  const REPO = path.join(__dirname, "..");
  for (const f of ["maintenance-upgrade.js", "lib/run-lock.js", "lib/render-preflight.js", "lib/render-input.js", "lib/render-accounts.js"]) { fs.mkdirSync(path.dirname(path.join(MAIN, "scripts", f)), { recursive: true }); fs.copyFileSync(path.join(REPO, "scripts", f), path.join(MAIN, "scripts", f)); }
  W(path.join(MAIN, "scripts", "preview-ready.js"), "// v1: head undefined\n");
  W(path.join(MAIN, "src", "engine.ts"), "export const v = 1;\n");
  W(path.join(MAIN, "src", "books.generated.ts"), "export const BOOKS = [];\n");
  W(path.join(MAIN, ".gitignore"), "books/\npublic/\n.render-*\n");
  g(MAIN, "add", "-A"); g(MAIN, "commit", "-q", "-m", "pin"); g(MAIN, "branch", "-M", "god-mode");
  g(MAIN, "remote", "add", "origin", ORIG); g(MAIN, "push", "-q", "origin", "god-mode");
  const PIN = g(MAIN, "rev-parse", "HEAD");
  W(path.join(MAIN, "scripts", "preview-ready.js"), "// v2: head defined, record written\n");
  W(path.join(MAIN, "scripts", "test-preview-ready-record.js"), "// test\n");
  g(MAIN, "add", "-A"); g(MAIN, "commit", "-q", "-m", "maintenance: preview-ready record");
  const MAINT = g(MAIN, "rev-parse", "HEAD");
  g(MAIN, "push", "-q", "origin", "god-mode");
  W(path.join(MAIN, "src", "engine.ts"), "export const v = 2;\n"); g(MAIN, "commit", "-q", "-am", "engine feature");
  const FEAT = g(MAIN, "rev-parse", "HEAD");
  g(MAIN, "push", "-q", "origin", "god-mode");
  g(MAIN, "fetch", "-q", "origin");
  // the pinned book worktree
  g(MAIN, "worktree", "add", "-q", "--detach", WT, PIN);
  W(path.join(WT, "books", SLUG, "production-base.json"), { productionBase: PIN, from: "origin/god-mode", worktree: path.basename(WT) });
  W(path.join(WT, "books", SLUG, "config.vox.json"), { meta: { fps: 30, audio: `audio/${SLUG}.mp3`, totalFrames: 300 }, beats: [{ id: "b" }] });
  W(path.join(WT, "books", SLUG, "preview-ready.json"), { ready: true });
  W(path.join(WT, "public", "captions", `${SLUG}.vtt`), "WEBVTT\n");
  const run = (a) => spawnSync(process.execPath, [path.join(WT, "scripts", "maintenance-upgrade.js"), `--slug=${SLUG}`, `--book-root=${WT}`, ...a], { cwd: WT, encoding: "utf8" });
  const pinNow = () => JSON.parse(fs.readFileSync(path.join(WT, "books", SLUG, "production-base.json"), "utf8"));

  let r = run([`--from=${PIN}`, `--to=${FEAT}`, "--operator-approved=x"]);
  t("an engine change (src/**) is a FEATURE upgrade → refused; the pin and HEAD stay", r.status === 2 && /FEATURE upgrade, not maintenance/.test(r.stderr) && /src\/engine\.ts/.test(r.stderr) && g(WT, "rev-parse", "HEAD") === PIN, r.stderr);
  r = run([`--from=${MAINT}`, `--to=${MAINT}`, "--operator-approved=x"]);
  t("--from that is not the pin → refused", r.status === 2 && /is not the book's pin/.test(r.stderr), r.stderr);
  r = run([`--from=${PIN}`, `--to=${MAINT}`]);
  t("no operator reason → refused", r.status === 2 && /--operator-approved/.test(r.stderr), r.stderr);
  r = run([`--from=${PIN}`, `--to=${MAINT}`, "--check"]);
  t("--check: a maintenance upgrade, listed file by file, nothing changed", r.status === 0 && /2 maintenance/.test(r.stdout) && /CHECK: a maintenance upgrade/.test(r.stdout) && g(WT, "rev-parse", "HEAD") === PIN && pinNow().productionBase === PIN, r.stdout + r.stderr);
  // a local commit that is not on origin → refused
  g(WT, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "local only");
  const LOCAL = g(WT, "rev-parse", "HEAD"); g(WT, "checkout", "-q", "--detach", PIN);
  r = run([`--from=${PIN}`, `--to=${LOCAL}`, "--operator-approved=x"]);
  t("--to not on origin/god-mode (a local-only commit, like 086a0941) → refused", r.status === 2 && /not on origin\/god-mode/.test(r.stderr), r.stderr);
  // tracked change → refused; the regenerated registry does not count
  W(path.join(WT, "src", "books.generated.ts"), "export const BOOKS = [1];\n");
  W(path.join(WT, "scripts", "preview-ready.js"), "// hand edit\n");
  r = run([`--from=${PIN}`, `--to=${MAINT}`, "--operator-approved=x"]);
  t("a tracked change in the worktree → refused (the regenerated books.generated.ts is not one)", r.status === 2 && /1 tracked change/.test(r.stderr) && /preview-ready\.js/.test(r.stderr), r.stderr);
  g(WT, "checkout", "-q", "--", "scripts/preview-ready.js", "src/books.generated.ts");
  // a render in flight → refused
  W(path.join(WT, `.render-github-split.${SLUG}.json`), { slug: SLUG, dispatchedAt: new Date().toISOString(), segments: [{ seg: 1, dispatchedAt: new Date().toISOString() }] });
  r = run([`--from=${PIN}`, `--to=${MAINT}`, "--operator-approved=x"]);
  t("a render in flight for the book → refused", r.status === 2 && /render of zz-mn is in flight/.test(r.stderr), r.stderr);
  fs.rmSync(path.join(WT, `.render-github-split.${SLUG}.json`));
  // the real upgrade
  const before = fs.readFileSync(path.join(WT, "books", SLUG, "config.vox.json"), "utf8") + fs.readFileSync(path.join(WT, "public", "captions", `${SLUG}.vtt`), "utf8");
  r = run([`--from=${PIN}`, `--to=${MAINT}`, "--operator-approved=Operator: preview-ready record fix only"]);
  const p = pinNow();
  t("maintenance upgrade: HEAD = new pin, previous pin kept, kind maintenance + the operator's reason", r.status === 0 && g(WT, "rev-parse", "HEAD") === MAINT && p.productionBase === MAINT && p.previousProductionBase === PIN && p.repin.kind === "maintenance" && /record fix only/.test(p.repin.reason) && p.pinHistory[0].productionBase === PIN, r.stdout + r.stderr);
  t("…the book's inputs are byte-identical and the render input did not move", before === fs.readFileSync(path.join(WT, "books", SLUG, "config.vox.json"), "utf8") + fs.readFileSync(path.join(WT, "public", "captions", `${SLUG}.vtt`), "utf8") && /render input \S+ unchanged/.test(r.stdout));
  const audit = fs.readFileSync(path.join(WT, "books", SLUG, "pin-history.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  t("…audit line appended (from, to, files, inputs hash, reason)", audit.length === 1 && audit[0].from === PIN && audit[0].to === MAINT && audit[0].files.includes("scripts/preview-ready.js") && audit[0].inputsSha256 && audit[0].reason);
  t("…the new code is in place (preview-ready v2)", /v2/.test(fs.readFileSync(path.join(WT, "scripts", "preview-ready.js"), "utf8")));
  r = run([`--from=${PIN}`, `--to=${MAINT}`, "--operator-approved=again"]);
  t("a second run with the old --from → refused (the pin moved; exact old SHA required)", r.status === 2 && /is not the book's pin/.test(r.stderr));
} finally {
  try { execFileSync("git", ["worktree", "prune"], { cwd: path.join(tmp, "main"), stdio: "ignore" }); } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall maintenance-upgrade checks passed");
process.exit(failed ? 1 : 0);
