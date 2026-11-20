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
 *       ~30 s: files are hashed in one git process; the push is non-interactive and time-boxed (--push-timeout-min=10),
 *       retried with the gh credential, and counts only when `git ls-remote` shows origin holding the commit (exit 1 if not).
 *       A book worktree pinned before 2026-11-14 has the old, slow push: run the current one against it with
 *       `git show origin/god-mode:scripts/stills-cloud.js | node - push --root=. --manifest=… --tag=…` (its code is bundled).
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
const { execFileSync, spawnSync } = require("child_process");

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const cmd = process.argv[2];
// --root=<checkout>: run the CURRENT script from origin against an older pinned book worktree, whose code is bundled:
//   git show origin/god-mode:scripts/stills-cloud.js | node - push --root=. --manifest=… --tag=…
const ROOT = args.root ? path.resolve(String(args.root))
  : fs.existsSync(path.join(__dirname, "render-stills.js")) ? path.join(__dirname, "..") : process.cwd();
if (!fs.existsSync(path.join(ROOT, "scripts", "render-stills.js"))) { console.error(`✗ ${ROOT} is not a repo checkout — pass --root=<checkout> (needed when the script comes from stdin)`); process.exit(1); }
// git never waits on a human here: no terminal prompt, no Credential-Manager window (a hidden GUI prompt hung pushes).
const NOPROMPT = { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
// fallback when the machine's credential manager serves the wrong GitHub account (memory: git-push-credential)
const GH_HELPER = ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential",
  "-c", "credential.https://github.com.helper=", "-c", "credential.https://github.com.helper=!gh auth git-credential"];
const T0 = Date.now();
const lap = (m) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
// the sha origin holds for a ref ("" = no such ref; null = could not ask)
function remoteSha(ref) {
  const r = spawnSync("git", ["ls-remote", "origin", ref], { cwd: ROOT, env: { ...process.env, ...NOPROMPT }, encoding: "utf8", timeout: 90000 });
  if (r.status !== 0) return null;
  return (r.stdout.split(/\r?\n/).find((l) => l.endsWith(`\t${ref}`)) || "").split("\t")[0];
}
const REPO = "sates52/Remotion-test";
const WORKFLOW = ".github/workflows/render-stills.yml";
const CODE_PATHS = ["src", "scripts", "data", "package.json", "package-lock.json", "tsconfig.json", "remotion.config.ts", ".gitignore", WORKFLOW];
const GITHUB_FILE_LIMIT = 95 * 1024 * 1024;
const STILLS_PER_SHARD = 30;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sleep = (ms) => execFileSync(process.execPath, ["-e", `setTimeout(()=>{},${ms})`]);
// A network blip is not a failed run: the first fetch of dracula's clips died on one "TLS handshake timeout" while the
// run was still rendering (2026-11-16). Transient transport errors are retried; anything else is thrown at once.
const TRANSIENT = /TLS handshake timeout|connection reset|i\/o timeout|timeout awaiting|unexpected EOF|EOF$|ECONNRESET|ETIMEDOUT|temporary failure|HTTP 50[234]|could not resolve host|dial tcp/i;
const gh = (a, enc = "utf8") => {
  for (let k = 0; ; k++) {
    try { return execFileSync("gh", a, { encoding: enc, maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) {
      const msg = String((e && e.stderr) || (e && e.message) || "");
      if (k >= 5 || !TRANSIENT.test(msg)) throw e;
      console.error(`  (network: ${msg.trim().split("\n").pop().slice(0, 120)} — retry ${k + 1}/5)`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000 * (k + 1));
    }
  }
};
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
  // ONE git process per batch (--stdin-paths), never one per file: 640 spawns took 217 s on Windows and agents' 2-min
  // command timeouts killed the push before it started (2026-11-14, american-psycho A/B).
  const hashAll = (paths, noFilters) => {
    if (!paths.length) return [];
    const out = execFileSync("git", ["hash-object", "-w", ...(noFilters ? ["--no-filters"] : []), "--stdin-paths"],
      { cwd: ROOT, env, input: paths.join("\n") + "\n", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const ids = out.trim().split(/\r?\n/);
    if (ids.length !== paths.length || ids.some((h) => !/^[0-9a-f]{40,64}$/.test(h))) { console.error(`✗ hash-object returned ${ids.length} ids for ${paths.length} files`); process.exit(1); }
    return ids;
  };
  lap(`hashing ${code.length + Object.keys(inputs).length + 1} files`);
  const codeIds = hashAll(code, false);
  const inputIds = hashAll([...Object.values(inputs), manPath], true);
  const entries = [
    ...code.map((f, i) => [f, codeIds[i]]),
    ...Object.keys(inputs).map((dst, i) => [dst, inputIds[i]]),
    ["stills/manifest.json", inputIds[inputIds.length - 1]],
  ];
  for (let i = 0; i < entries.length; i += 200) {
    execFileSync("git", ["update-index", "--add", "--index-info"], { cwd: ROOT, env, input: entries.slice(i, i + 200).map(([f, b]) => `100644 ${b}\t${f}`).join("\n") + "\n" });
  }
  const tree = git(["write-tree"], env).trim();
  const commit = git(["commit-tree", tree, "-m", `stills ${man.name || ""} · inputHash ${inputHash}`], env).trim();
  const pushedAt = Date.now();
  const REF = `refs/heads/ci/stills/${args.tag}`;
  const pushMin = Number(args["push-timeout-min"] || 10);
  // a push counts only when origin holds the commit: exit codes and "success" lines were not enough (2026-11-14: a
  // reported push left no ci/stills ref and no run). Non-interactive, time-boxed, then the gh credential as fallback.
  let landed = null;
  for (const [label, pre] of [["git credential", []], ["gh credential", GH_HELPER]]) {
    lap(`pushing ${commit.slice(0, 8)} → ci/stills/${args.tag} (${label})`);
    const r = spawnSync("git", [...pre, "push", "--force", "origin", `${commit}:${REF}`],
      { cwd: ROOT, env: { ...process.env, ...NOPROMPT }, encoding: "utf8", timeout: pushMin * 60000, maxBuffer: 64 * 1024 * 1024 });
    const at = remoteSha(REF);
    if (at === commit) { landed = label; break; }
    const why = r.error ? `${r.error.code || r.error.message}${r.error.code === "ETIMEDOUT" ? ` after ${pushMin} min` : ""}` : `exit ${r.status}`;
    console.error(`  ✗ push via ${label} did not land (${why}; origin has ${at === null ? "?" : at ? at.slice(0, 8) : "no such ref"}): ${String(r.stderr || "").trim().split(/\r?\n/).slice(-3).join(" | ")}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!landed) {
    console.error(`✗ ci/stills/${args.tag} is NOT on origin — nothing will render. Check: gh auth status (must be the repo owner), network; then push again (same command). Do not fetch.`);
    process.exit(1);
  }
  lap(`origin holds ${commit.slice(0, 8)} — waiting for the run to be listed`);
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
  if (!run) {
    const at = remoteSha(`refs/heads/ci/stills/${args.tag}`);
    console.error(at === "" ? `✗ ci/stills/${args.tag} does not exist on origin — the push never landed; run stills-cloud.js push again`
      : `✗ no run for ci/stills/${args.tag}${at ? ` (origin has ${at.slice(0, 8)}; the workflow did not start — check Actions)` : ""}`);
    process.exit(2);
  }
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
