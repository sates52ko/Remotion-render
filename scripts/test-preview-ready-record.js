#!/usr/bin/env node
// preview-ready.js MUST leave its record (2026-10-29). Since 3de4cf54 (10-28) the write referenced an undefined `head`;
// the ReferenceError was swallowed by an empty catch, so "READY" / "NOT READY" was printed and preview-ready.json never
// written — preview-state could never show READY on origin code. Found in the-magician-s-nephew's worktree (its owner's
// local fix 086a0941, operator-approved for that book only, upstreamed here). This runs the real script on a minimal
// book in a throw-away copy of the tree (it has no --root) and checks the record: written, with the git head field,
// and a failed write is loud (exit 1), never a silent success.
// Run: node scripts/test-preview-ready-record.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pr-record-")));
const copy = (rel) => fs.cpSync(path.join(REPO, rel), path.join(tmp, rel), { recursive: true });
try {
  copy("scripts");
  for (const f of ["package.json"]) if (fs.existsSync(path.join(REPO, f))) copy(f);
  // a git checkout, so the record carries its head
  execFileSync("git", ["init", "-q"], { cwd: tmp });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "fixture"], { cwd: tmp });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmp }).toString().trim();
  const B = path.join(tmp, "books", "zz-record");
  fs.mkdirSync(B, { recursive: true });
  fs.writeFileSync(path.join(B, "book.json"), JSON.stringify({ slug: "zz-record", engine: "antidote" }));
  fs.writeFileSync(path.join(B, "config.antidote.json"), JSON.stringify({ meta: { fps: 30, audio: "audio/zz-record.mp3", totalFrames: 30 }, scenes: [] }));
  const r = spawnSync(process.execPath, [path.join(tmp, "scripts", "preview-ready.js"), "--slug=zz-record"], { cwd: tmp, encoding: "utf8", env: { ...process.env, PRODUCTION_GUARD: "off" } });
  const out = (r.stdout || "") + (r.stderr || "");
  const rec = (() => { try { return JSON.parse(fs.readFileSync(path.join(B, "preview-ready.json"), "utf8")); } catch { return null; } })();
  t("the verdict is printed", /READY/.test(out), out.slice(-300));
  t("preview-ready.json is WRITTEN (it was silently skipped since 3de4cf54)", !!rec, out.slice(-400));
  t("the record carries the git head it was produced on", !!rec && rec.head === head, JSON.stringify(rec && rec.head));
  t("the record is the verdict (ready matches the exit code)", !!rec && (rec.ready === true) === (r.status === 0), `${rec && rec.ready} / exit ${r.status}`);
  // one contract with render preflight (2026-10-30, lib/preview-record.js): the preflight's own identity + reader
  {
    const rpp = require(path.join(tmp, "scripts", "lib", "render-preflight"));
    const cfgAbs = path.join(B, "config.antidote.json");
    const sha = require("crypto").createHash("sha256").update(fs.readFileSync(cfgAbs)).digest("hex");
    t("the record's renderInputHash is the preflight's inputHashOf(config); configSha256 is the config bytes", !!rec && rec.renderInputHash === rpp.inputHashOf(cfgAbs) && rec.configSha256 === sha, JSON.stringify(rec));
    const pv = rpp.readPreview({ root: tmp, slug: "zz-record", inputHash: rpp.inputHashOf(cfgAbs), configFile: cfgAbs });
    t("render preflight reads the record as this config's verdict (never STALE / MISSING)", pv.state === (rec && rec.ready ? "READY" : "NOT_READY"), pv.state);
    t("written atomically: no temp file left behind", !fs.readdirSync(B).some((f) => /\.tmp$/.test(f)));
    t("the console says where the record is and for which render input", /record: books\/zz-record\/preview-ready\.json — (READY|NOT_READY) for render input [0-9a-f]{16}/.test(out), out.slice(-300));
  }
  // a failed write is loud: the record path is a directory
  fs.rmSync(path.join(B, "preview-ready.json"), { force: true });
  fs.mkdirSync(path.join(B, "preview-ready.json"));
  const w = spawnSync(process.execPath, [path.join(tmp, "scripts", "preview-ready.js"), "--slug=zz-record"], { cwd: tmp, encoding: "utf8", env: { ...process.env, PRODUCTION_GUARD: "off" } });
  t("a write that fails says so and exits 1 (never a silent READY)", w.status === 1 && /preview-ready\.json NOT written/.test((w.stdout || "") + (w.stderr || "")), ((w.stdout || "") + (w.stderr || "")).slice(-300));
  const src = fs.readFileSync(path.join(REPO, "scripts", "preview-ready.js"), "utf8");
  t("no empty catch around the record write", !/writeFileSync\(path\.join\(BOOK, "preview-ready\.json"\)[\s\S]{0,400}\} catch \{\}/.test(src));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} FAILED` : "\nall preview-ready record checks passed");
process.exit(failed ? 1 : 0);
