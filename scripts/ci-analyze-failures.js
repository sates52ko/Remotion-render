#!/usr/bin/env node
/**
 * ci-analyze-failures.js — the CI Analyst as a normal development tool (cycle 6, 2026-10-31; pilot 1: run 41187278116
 * found the right root cause of 41020755406 for $0.021).
 *
 *   node scripts/ci-analyze-failures.js            list failed Regression runs and what WOULD be analysed (no cost)
 *   node scripts/ci-analyze-failures.js --go       dispatch the analyst for each eligible run (through ai-budget)
 *        [--limit=3] [--days=14]
 *
 * A failed run is analysed only when ALL hold:
 *   1. its regression report (artifact regression-<sha>/ci-report.json) lists at least one NEW failure (status FAIL —
 *      a run with only BASELINE_FAIL rows is a known baseline: never re-analysed, no cost);
 *   2. it was never analysed before (ledger audit/ci-analyst/analysed.jsonl — one paid analysis per run);
 *   3. scripts/ai-budget.js admits it (month / day lines, admission lock).
 * The analyst stays read-only with threat detection. Its report is a HYPOTHESIS: check the named file and line and
 * re-run the test before acting on it. No self-trigger: the analyst is never a Regression run, so it can never be
 * picked up here; a run that fails to report is not retried automatically.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REPO = "sates52/Remotion-test";
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const gh = (a, enc = "utf8") => execFileSync("gh", a, { encoding: enc, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const LEDGER = path.join(ROOT, "audit", "ci-analyst", "analysed.jsonl");
const analysed = new Set(fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => String(JSON.parse(l).run)) : []);
analysed.add("41020755406"); // pilot 1 (2026-10-31)

function newFailures(run) {
  const arts = JSON.parse(gh(["api", `repos/${REPO}/actions/runs/${run.id}/artifacts`])).artifacts || [];
  const a = arts.find((x) => /^regression-/.test(x.name) && !x.expired);
  if (!a) return { known: false, why: "no regression report artifact (expired or the suite never ran) — not analysed automatically" };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cia-"));
  fs.writeFileSync(path.join(tmp, "r.zip"), gh(["api", `repos/${REPO}/actions/artifacts/${a.id}/zip`], "buffer"));
  const x = path.join(tmp, "x"); fs.mkdirSync(x);
  execFileSync(process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "unzip", process.platform === "win32" ? ["-xf", path.join(tmp, "r.zip"), "-C", x] : ["-q", path.join(tmp, "r.zip"), "-d", x]);
  const rep = JSON.parse(fs.readFileSync(path.join(x, "ci-report.json"), "utf8"));
  fs.rmSync(tmp, { recursive: true, force: true });
  const rows = rep.rows || rep.tests || [];
  const fresh = rows.filter((r) => r.status === "FAIL").map((r) => r.name);
  return { known: true, fresh, baseline: rows.filter((r) => r.status === "BASELINE_FAIL").length };
}

const since = new Date(Date.now() - (+(args.days || 14)) * 864e5).toISOString().slice(0, 10);
let runs;
try { runs = JSON.parse(gh(["api", `repos/${REPO}/actions/workflows/regression.yml/runs?status=failure&created=>=${since}&per_page=30`])).workflow_runs || []; }
catch (e) { console.log(`✗ GitHub unreachable (${String(e.stderr || e.message).trim().slice(0, 120)}) — nothing dispatched, try again later`); process.exit(2); }
let dispatched = 0;
for (const r of runs) {
  const tag = `${r.id} ${r.head_sha.slice(0, 8)} ${r.head_branch}`;
  if (analysed.has(String(r.id))) { console.log(`· ${tag}: already analysed — skip (one paid analysis per run)`); continue; }
  let nf;
  try { nf = newFailures(r); } catch (e) { console.log(`· ${tag}: report unreadable (${String(e.message).slice(0, 80)}) — skip`); continue; }
  if (!nf.known) { console.log(`· ${tag}: ${nf.why}`); continue; }
  if (!nf.fresh.length) { console.log(`· ${tag}: only known baseline failures (${nf.baseline}) — skip, no cost`); continue; }
  console.log(`→ ${tag}: NEW failures ${nf.fresh.join(", ")}`);
  if (!args.go) continue;
  if (dispatched >= +(args.limit || 3)) { console.log("  limit reached for this call"); break; }
  try {
    execFileSync(process.execPath, [path.join(__dirname, "ai-budget.js"), "dispatch", "--workflow=ci-failure-analyst.lock.yml", "-f", `run_id=${r.id}`], { stdio: "inherit" });
    fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
    fs.appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), run: r.id, sha: r.head_sha, newFailures: nf.fresh }) + "\n");
    dispatched++;
  } catch { console.log("  ✗ not dispatched (budget / admission refused) — nothing else is affected"); break; }
}
if (!runs.length) console.log(`no failed Regression run since ${since}`);
if (!args.go) console.log("\n(dry run — add --go to dispatch the analyst for the → rows)");
