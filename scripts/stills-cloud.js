#!/usr/bin/env node
/**
 * stills-cloud.js — render a stills manifest on GitHub Actions instead of this PC (operator 2026-11-04: "makineyi
 * kasacak işlemlerden kaçınalım"; scripts/lib/local-load-guard.js refuses heavy still work locally).
 *
 *   node scripts/stills-cloud.js push  --manifest=<dir>/manifest.json --tag=<name> [--shards=N] [--dry]
 *       a PARENTLESS bundle commit (the code of THIS checkout's working tree — tracked + untracked-not-ignored files
 *       under src/ scripts/ data/ + package files + the workflow — plus stills/manifest.json and every config the
 *       manifest names, byte-exact, with their sha256 in the manifest) pushed to origin ci/stills/<tag>. The push starts
 *       .github/workflows/render-stills.yml: N parallel runners (default: one per ~30 stills, at most 20). No branch,
 *       index, HEAD or working tree changes; the push record goes next to the manifest (cloud-push.json).
 *   node scripts/stills-cloud.js fetch --tag=<name> --out=<dir> [--wait-min=90]
 *       waits for that run, downloads every stills-<k> artifact, checks each file against the shard's sha256 list and
 *       copies raw/ and strips/ into <out>. Exit 1 when a shard failed, is missing, or a file does not match.
 *   node scripts/stills-cloud.js status --tag=<name>
 * Manifest: see scripts/render-stills.js (schema stills/1). Optional "extra": [repo paths] for assets a composition
 * reads from public/ (Vox images …). Antidote stills need none.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REPO = "sates52/Remotion-test";
const WORKFLOW = ".github/workflows/render-stills.yml";
const CODE_PATHS = ["src", "scripts", "data", "package.json", "package-lock.json", "tsconfig.json", "remotion.config.ts", ".gitignore", WORKFLOW];
const GITHUB_FILE_LIMIT = 95 * 1024 * 1024;
const STILLS_PER_SHARD = 30;
const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const cmd = process.argv[2];
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sleep = (ms) => execFileSync(process.execPath, ["-e", `setTimeout(()=>{},${ms})`]);
const gh = (a, enc = "utf8") => execFileSync("gh", a, { encoding: enc, maxBuffer: 512 * 1024 * 1024 });
const tagOk = (t) => /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(String(t || ""));

function runsFor(tag) {
  return JSON.parse(gh(["api", `repos/${REPO}/actions/runs?branch=${encodeURIComponent(`ci/stills/${tag}`)}&per_page=5`])).workflow_runs || [];
}

if (cmd === "push") {
  if (!tagOk(args.tag)) { console.error("✗ --tag=<name> (letters, digits, . _ -)"); process.exit(1); }
  const MAN = path.resolve(args.manifest);
  const BASE = path.dirname(MAN);
  const man = JSON.parse(fs.readFileSync(MAN, "utf8"));
  if (man.schema !== "stills/1" || !Array.isArray(man.jobs) || !man.jobs.length) { console.error("✗ not a stills/1 manifest with jobs"); process.exit(1); }
  const stills = man.jobs.reduce((s, j) => s + j.frames.length, 0);
  const shards = Math.max(1, Math.min(20, Number(args.shards) || man.shards || Math.ceil(stills / STILLS_PER_SHARD)));
  // inputs travel byte-exact; their sha256 goes in the bundled manifest (render-stills reads them from stills/)
  const inputs = {};
  for (const j of man.jobs) {
    const src = path.join(BASE, j.config);
    if (!fs.existsSync(src)) { console.error(`✗ job ${j.id}: config ${j.config} not found`); process.exit(1); }
    inputs[`stills/${j.config.split(path.sep).join("/")}`] = src;
  }
  const extra = (man.extra || []).map((p) => p.split(path.sep).join("/"));
  for (const p of extra) if (!fs.existsSync(path.join(ROOT, p))) { console.error(`✗ extra ${p} not found`); process.exit(1); }
  const git = (a, env, opts = {}) => execFileSync("git", a, { cwd: ROOT, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
  const tracked = git(["ls-files", "-z", "--", ...CODE_PATHS]).split("\0").filter(Boolean);
  const untracked = git(["ls-files", "-z", "--others", "--exclude-standard", "--", ...CODE_PATHS]).split("\0").filter(Boolean);
  if (tracked.length < 100) { console.error(`✗ only ${tracked.length} tracked code files — refusing an incomplete bundle`); process.exit(1); }
  const code = [...new Set([...tracked, ...untracked, ...extra])].filter((f) => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
  if (!code.includes(WORKFLOW)) { console.error(`✗ ${WORKFLOW} is not in this checkout`); process.exit(1); }
  for (const f of [...code, ...Object.values(inputs)]) {
    const p = path.isAbsolute(f) ? f : path.join(ROOT, f);
    if (fs.statSync(p).size > GITHUB_FILE_LIMIT) { console.error(`✗ ${f} is over GitHub's file limit`); process.exit(1); }
  }
  const files = Object.fromEntries(Object.entries(inputs).map(([dst, src]) => [dst, sha(fs.readFileSync(src))]));
  const inputHash = sha(JSON.stringify({ files, jobs: man.jobs, composition: man.composition, entry: man.entry, silent: man.silent })).slice(0, 16);
  const bundled = { ...man, shards, inputHash, files, builtAt: new Date().toISOString() };
  console.log(`${man.name || "stills"}: ${man.jobs.length} jobs · ${stills} stills · ${shards} runner(s) · ${code.length} code files · inputHash ${inputHash}`);
  if (args.dry) process.exit(0);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stills-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, "index") };
  const manPath = path.join(tmp, "manifest.json");
  fs.writeFileSync(manPath, JSON.stringify(bundled, null, 1));
  git(["read-tree", "--empty"], env);
  const entries = [
    ...code.map((f) => [f, git(["hash-object", "-w", "--", f], env).trim()]),
    ...Object.entries(inputs).map(([dst, src]) => [dst, git(["hash-object", "-w", "--no-filters", "--", src], env).trim()]),
    ["stills/manifest.json", git(["hash-object", "-w", "--no-filters", "--", manPath], env).trim()],
  ];
  for (let i = 0; i < entries.length; i += 200) {
    execFileSync("git", ["update-index", "--add", "--index-info"], { cwd: ROOT, env, input: entries.slice(i, i + 200).map(([f, b]) => `100644 ${b}\t${f}`).join("\n") + "\n" });
  }
  const tree = git(["write-tree"], env).trim();
  const commit = git(["commit-tree", tree, "-m", `stills ${man.name || ""} · inputHash ${inputHash}`], env).trim();
  const pushedAt = Date.now();
  execFileSync("git", ["push", "-q", "origin", `${commit}:refs/heads/ci/stills/${args.tag}`, "--force"], { cwd: ROOT, stdio: "inherit" });
  fs.rmSync(tmp, { recursive: true, force: true });
  let run = null;
  for (let i = 0; i < 18 && !run; i++) { try { run = runsFor(args.tag).find((r) => Date.parse(r.created_at) >= pushedAt - 60000) || null; } catch {} if (!run) sleep(5000); }
  fs.writeFileSync(path.join(BASE, "cloud-push.json"), JSON.stringify({ tag: args.tag, commit, tree, inputHash, shards, stills, pushedAt: new Date(pushedAt).toISOString(), run: run && run.id }, null, 1));
  console.log(`✓ pushed ${commit.slice(0, 8)} to ci/stills/${args.tag}${run ? ` — run ${run.id}` : " — run not listed yet"}; then: node scripts/stills-cloud.js fetch --tag=${args.tag} --out=<dir>`);
} else if (cmd === "status" || cmd === "fetch") {
  if (!tagOk(args.tag)) { console.error("✗ --tag=<name>"); process.exit(1); }
  const waitMin = cmd === "status" ? 0 : Number(args["wait-min"] || 90);
  let run = null;
  for (let i = 0; ; i++) {
    run = runsFor(args.tag)[0] || null;
    if (cmd === "status" || (run && run.status === "completed") || i * 0.5 >= waitMin) break;
    sleep(30000);
  }
  if (!run) { console.error(`✗ no run for ci/stills/${args.tag}`); process.exit(2); }
  console.log(`run ${run.id} · ${run.status}${run.conclusion ? ` · ${run.conclusion}` : ""} · ${run.html_url}`);
  if (cmd === "status") process.exit(0);
  if (run.status !== "completed") { console.error("✗ still running — fetch again later"); process.exit(2); }
  if (!args.out) { console.error("✗ --out=<dir>"); process.exit(1); }
  const OUT = path.resolve(args.out);
  const arts = (JSON.parse(gh(["api", `repos/${REPO}/actions/runs/${run.id}/artifacts?per_page=100`])).artifacts || []).filter((a) => /^stills-\d+$/.test(a.name));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stills-fetch-"));
  let bad = 0, failedJobs = [], shardsSeen = [], of = null;
  for (const a of arts) {
    const z = path.join(tmp, `${a.name}.zip`), x = path.join(tmp, a.name);
    fs.writeFileSync(z, gh(["api", `repos/${REPO}/actions/artifacts/${a.id}/zip`], "buffer"));
    fs.mkdirSync(x);
    execFileSync(process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "unzip", process.platform === "win32" ? ["-xf", z, "-C", x] : ["-q", z, "-d", x]);
    const recF = fs.readdirSync(x).find((f) => /^shard-\d+\.json$/.test(f));
    if (!recF) { console.error(`✗ ${a.name}: no shard record`); bad++; continue; }
    const rec = JSON.parse(fs.readFileSync(path.join(x, recF), "utf8"));
    shardsSeen.push(rec.shard); of = rec.of; failedJobs.push(...rec.failed.map((f) => f.id));
    for (const [rel, h] of Object.entries(rec.files)) {
      const p = path.join(x, rel);
      if (!fs.existsSync(p) || sha(fs.readFileSync(p)) !== h) { console.error(`✗ ${a.name}: ${rel} does not match its sha256`); bad++; continue; }
      fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
      fs.copyFileSync(p, path.join(OUT, rel));
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.copyFileSync(path.join(x, recF), path.join(OUT, recF));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const missing = of == null ? ["all"] : [...Array(of).keys()].filter((s) => !shardsSeen.includes(s));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "cloud-run.json"), JSON.stringify({ tag: args.tag, run: run.id, conclusion: run.conclusion, url: run.html_url, created: run.created_at, updated: run.updated_at,
    wallSec: (Date.parse(run.updated_at) - Date.parse(run.created_at)) / 1000, shards: of, missingShards: missing, failedJobs, badFiles: bad }, null, 1));
  const ok = !bad && !missing.length && !failedJobs.length;
  console.log(`${ok ? "✓" : "✗"} ${arts.length} shard artifact(s) → ${OUT}${missing.length ? ` · missing shards ${missing.join(",")}` : ""}${failedJobs.length ? ` · failed jobs ${failedJobs.join(",")}` : ""}${bad ? ` · ${bad} bad file(s)` : ""}`);
  process.exit(ok ? 0 : 1);
} else { console.error("usage: stills-cloud.js push|fetch|status --tag=<name> …"); process.exit(1); }
