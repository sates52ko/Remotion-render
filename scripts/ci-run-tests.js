#!/usr/bin/env node
/**
 * ci-run-tests.js — the deterministic regression suite, the same way on a laptop and on a GitHub runner (2026-10-30).
 *
 *   node scripts/ci-run-tests.js [--jobs=4] [--timeout=600] [--only=a.js,b.js] [--out=<dir>] [--json]
 *
 * Runs every scripts/test-*.js (data/ci-regression.json: per-test args, known baseline failures), N at a time, each
 * with a timeout. Per test: exit, wall time and — where /usr/bin/time exists (Linux runners) — CPU time and peak RSS.
 * Writes <out>/ci-report.json bound to the commit (git HEAD) and the platform, and a Markdown table to
 * $GITHUB_STEP_SUMMARY when set. Exit 1 only for a NEW failure; a known baseline failure is reported apart, and one
 * that now passes is reported as fixed (remove it from the baseline). No model call, no render, no network, no
 * credential is involved (measured: none of the tests uses them).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const JOBS = Math.max(1, Number(args.jobs) || 4);
const TIMEOUT = Math.max(10, Number(args.timeout) || 600) * 1000;
const OUT = path.resolve(args.out || path.join(ROOT, "out", "ci"));
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ci-regression.json"), "utf8")); } catch { return {}; } })();
const baseline = cfg.knownBaseline || {};
const extraArgs = cfg.args || {};
let tests = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f)).sort();
if (args.only) { const want = new Set(String(args.only).split(",").map((x) => x.trim())); tests = tests.filter((t) => want.has(t)); }
const head = (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return process.env.GITHUB_SHA || null; } })();
const TIME = process.platform !== "win32" && fs.existsSync("/usr/bin/time") ? "/usr/bin/time" : null;

function runOne(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const statFile = path.join(OUT, `.time-${name}.txt`);
    const argv = [path.join(__dirname, name), ...(extraArgs[name] || [])];
    const cmd = TIME ? TIME : process.execPath;
    const full = TIME ? ["-o", statFile, "-f", "%e %U %S %M", process.execPath, ...argv] : argv;
    const child = spawn(cmd, full, { cwd: ROOT, env: { ...process.env, CI: "true" }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; if (out.length > 400000) out = out.slice(-200000); });
    child.stderr.on("data", (d) => { out += d; if (out.length > 400000) out = out.slice(-200000); });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill("SIGKILL"); } catch {} }, TIMEOUT);
    child.on("close", (code) => {
      clearTimeout(timer);
      const row = { name, exit: timedOut ? 124 : code, wallMs: Date.now() - t0, cpuS: null, maxRssKb: null, args: extraArgs[name] || [] };
      try { const [e, u, s, m] = fs.readFileSync(statFile, "utf8").trim().split(/\s+/).slice(-4).map(Number); row.cpuS = Math.round((u + s) * 100) / 100; row.maxRssKb = m; fs.rmSync(statFile, { force: true }); } catch {}
      const pass = row.exit === 0;
      row.status = pass ? (baseline[name] ? "BASELINE_FIXED" : "PASS") : (baseline[name] ? "BASELINE_FAIL" : "FAIL");
      if (!pass) row.tail = out.split(/\r?\n/).filter((l) => /✗|FAIL|Error|error/.test(l)).slice(-8).join("\n").slice(0, 2000) || out.slice(-1500);
      resolve(row);
    });
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const startedAt = new Date().toISOString();
  const queue = tests.slice(), rows = [];
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    while (queue.length) { const n = queue.shift(); const r = await runOne(n); rows.push(r); if (!args.json) console.log(`${r.status.padEnd(14)} ${n.padEnd(42)} ${(r.wallMs / 1000).toFixed(1)}s${r.cpuS != null ? ` cpu ${r.cpuS}s rss ${Math.round(r.maxRssKb / 1024)}MB` : ""}`); }
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  const count = (s) => rows.filter((r) => r.status === s).length;
  const summary = { tests: rows.length, pass: count("PASS"), fail: count("FAIL"), baselineFail: count("BASELINE_FAIL"), baselineFixed: count("BASELINE_FIXED"),
    wallSumS: Math.round(rows.reduce((a, r) => a + r.wallMs, 0) / 1000), cpuSumS: rows.some((r) => r.cpuS != null) ? Math.round(rows.reduce((a, r) => a + (r.cpuS || 0), 0)) : null,
    peakRssMb: rows.some((r) => r.maxRssKb) ? Math.round(Math.max(...rows.map((r) => r.maxRssKb || 0)) / 1024) : null };
  const report = { head, platform: `${process.platform}-${process.arch}`, node: process.version, cpus: os.cpus().length, jobs: JOBS, startedAt, endedAt: new Date().toISOString(),
    runner: process.env.GITHUB_ACTIONS ? { runId: process.env.GITHUB_RUN_ID, ref: process.env.GITHUB_REF, attempt: process.env.GITHUB_RUN_ATTEMPT } : null, summary, rows };
  fs.writeFileSync(path.join(OUT, "ci-report.json"), JSON.stringify(report, null, 2) + "\n");
  const md = [`## Regression @ ${String(head).slice(0, 8)} (${report.platform}, node ${process.version}, ${JOBS} at a time)`, "",
    `PASS ${summary.pass} · NEW FAIL ${summary.fail} · known baseline ${summary.baselineFail} · baseline fixed ${summary.baselineFixed} · wall Σ ${summary.wallSumS}s${summary.cpuSumS != null ? ` · CPU Σ ${summary.cpuSumS}s · peak RSS ${summary.peakRssMb} MB` : ""}`, "",
    "| test | status | wall s | CPU s | RSS MB |", "|---|---|---|---|---|",
    ...rows.filter((r) => r.status !== "PASS").concat(rows.filter((r) => r.status === "PASS")).map((r) => `| ${r.name} | ${r.status} | ${(r.wallMs / 1000).toFixed(1)} | ${r.cpuS ?? ""} | ${r.maxRssKb ? Math.round(r.maxRssKb / 1024) : ""} |`)].join("\n");
  fs.writeFileSync(path.join(OUT, "ci-report.md"), md + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n"); } catch {}
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`\n${summary.fail ? "❌" : "✅"} ${summary.pass} pass, ${summary.fail} NEW fail, ${summary.baselineFail} known baseline, ${summary.baselineFixed} baseline fixed — ${path.relative(ROOT, path.join(OUT, "ci-report.json"))}`);
    for (const r of rows.filter((x) => x.status === "FAIL")) console.log(`\n--- ${r.name} (exit ${r.exit})\n${r.tail}`);
    for (const r of rows.filter((x) => x.status === "BASELINE_FIXED")) console.log(`ⓘ ${r.name} passes now — remove it from data/ci-regression.json knownBaseline`);
  }
  process.exit(summary.fail ? 1 : 0);
})();
