#!/usr/bin/env node
/**
 * ai-budget.js — simple monthly AI spend control (operator decision 2026-10-30; thresholds in data/ai-budget.json).
 *
 *   node scripts/ai-budget.js status                       month-to-date + last 24 h, every counted run, the verdict
 *   node scripts/ai-budget.js check --workflow=<file>      exit 0 if one more run of that paid workflow fits, else 3
 *   node scripts/ai-budget.js dispatch --workflow=<file> -f key=value ...
 *                                                          check, then `gh workflow run` (the ONLY way agents start a
 *                                                          paid gh-aw workflow); refuses on STOP / STOP_DAILY / UNKNOWN
 *   node scripts/ai-budget.js record --source=<name> --usd=<n> [--calls=<n>] [--model=<id>] [--in=<tok>] [--out=<tok>]
 *                                    [--estimated] [--note=<text>]
 *                                                          append one direct-API pilot's measured usage to the ledger
 *   node scripts/ai-budget.js check --usd=<n>              may a direct-API pilot costing at most <n> start?
 *
 * Lines: warn $40, stop new paid AI work at $45, about $2 / 24 h. ESTIMATE (gh-aw usage artifacts + the local ledger),
 * not the provider's bill — the Anthropic Console is the truth. A run whose usage cannot be read counts at its per-run
 * maximum; a run list that cannot be read makes the verdict UNKNOWN, which stops only new paid AI work.
 * The workflows also skip themselves when the repository variable AI_SPEND_PAUSED is "true" (set by the operator).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const B = require("./lib/ai-budget");

const ROOT = path.join(__dirname, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ai-budget.json"), "utf8"));
const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith("-") ? argv[0] : "status";
const opt = {}; const fields = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-f") { fields.push(argv[++i]); continue; }
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) opt[m[1]] = m[2] === undefined ? true : m[2];
}
const now = opt.now ? new Date(opt.now) : new Date();
const gh = (args, enc = "utf8") => execFileSync("gh", args, { encoding: enc, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
const cacheFile = path.join(os.tmpdir(), "ai-budget-run-usage.json");
const cache = (() => { try { return JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch { return {}; } })();

function unzipTo(zip, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [bin, args] of [["tar", ["-xf", zip, "-C", dir]], ["unzip", ["-o", "-q", zip, "-d", dir]]]) {
    try { execFileSync(bin, args, { stdio: "ignore" }); return true; } catch {}
  }
  return false;
}
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }

/** USD of one finished run from its `usage` artifact; null when it cannot be read */
function runUsd(runId, wf = null) {
  if (cache[runId] !== undefined) return cache[runId];
  let usd = null;
  try {
    const arts = JSON.parse(gh(["api", `repos/${cfg.repo}/actions/runs/${runId}/artifacts?per_page=100`])).artifacts || [];
    const a = arts.find((x) => x.name === "usage" && !x.expired);
    if (a) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-usage-"));
      const zip = path.join(dir, "u.zip");
      fs.writeFileSync(zip, gh(["api", `repos/${cfg.repo}/actions/artifacts/${a.id}/zip`], "buffer"));
      if (unzipTo(zip, path.join(dir, "x"))) {
        const files = walk(path.join(dir, "x")).filter((f) => /\.(json|jsonl)$/.test(f)).map((f) => ({ name: path.relative(path.join(dir, "x"), f).split(path.sep).join("/"), text: fs.readFileSync(f, "utf8") }));
        usd = B.usdOfUsageFiles(files, cfg);
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch { usd = null; }
  // no usage artifact: a run that never STARTED a paid step spent nothing (2026-11-02: a visual A/B that failed at the
  // input check was counted at its $10 cap and stopped the next run on the daily line). Only workflows whose budget
  // entry names their paid steps; the step states come from the run's jobs. Anything unreadable stays at the max.
  if (usd == null && wf && (cfg.paidWorkflows[wf] || {}).paidSteps) {
    try {
      const jobs = JSON.parse(gh(["api", `repos/${cfg.repo}/actions/runs/${runId}/jobs?per_page=50`])).jobs || [];
      const names = cfg.paidWorkflows[wf].paidSteps;
      const steps = jobs.flatMap((j) => j.steps || []).filter((st) => names.includes(st.name));
      if (jobs.length && jobs.every((j) => j.status === "completed") && steps.length === names.length && steps.every((st) => st.conclusion === "skipped")) usd = 0;
    } catch {}
  }
  // a shared cache keyed by run id (cycle 9 P0b): merge with what other processes wrote meanwhile, then write a unique
  // temp file and rename it into place — two parallel budget checks never truncate or clobber each other's entries
  if (usd != null) {
    cache[runId] = usd;
    try {
      const now = (() => { try { return JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch { return {}; } })();
      const tmp = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ ...now, ...cache }));
      fs.renameSync(tmp, cacheFile);
    } catch {}
  }
  return usd;
}

/** every run of every paid workflow created this month; throws when the list cannot be read */
function monthRuns() {
  const since = B.monthStart(now).toISOString().slice(0, 10);
  const out = [];
  for (const wf of Object.keys(cfg.paidWorkflows)) {
    let list;
    try { list = JSON.parse(gh(["api", `repos/${cfg.repo}/actions/workflows/${wf}/runs?created=>=${since}&per_page=100`])); }
    catch (e) { if (/HTTP 404/.test(String(e.stderr || e.message))) continue; throw new Error(`run list of ${wf}: ${String(e.stderr || e.message).split("\n")[0]}`); }
    for (const r of list.workflow_runs || []) {
      const done = r.status === "completed";
      const skipped = done && ["skipped", "cancelled"].includes(r.conclusion) && Date.parse(r.updated_at) - Date.parse(r.created_at) < 120e3;
      out.push({ id: r.id, workflow: wf, createdAt: r.created_at, status: `${r.status}/${r.conclusion || "-"}`, usd: skipped ? 0 : done ? runUsd(r.id, wf) : null });
    }
  }
  return out;
}

function report() {
  let runs = [], unknown = null;
  try { runs = monthRuns(); } catch (e) { unknown = e.message; }
  const s = B.summarize({ runs, ledger: B.readLedger(ROOT, cfg, now), cfg, now });
  return { ...s, unknown };
}

const est = opt.usd != null ? +opt.usd : opt.workflow ? (cfg.paidWorkflows[opt.workflow] || {}).perRunMaxUsd : 0;
if (opt.workflow && !cfg.paidWorkflows[opt.workflow]) { console.error(`not a paid workflow in data/ai-budget.json: ${opt.workflow}`); process.exit(2); }

if (cmd === "record") {
  if (!opt.source || !Number.isFinite(+opt.usd)) { console.error("record needs --source=<name> --usd=<n>"); process.exit(2); }
  const e = { at: now.toISOString(), source: opt.source, usd: +opt.usd, calls: opt.calls ? +opt.calls : undefined, model: opt.model, inputTokens: opt.in ? +opt.in : undefined, outputTokens: opt.out ? +opt.out : undefined, estimated: !!opt.estimated, note: opt.note };
  const f = path.join(ROOT, cfg.ledgerDir, `${B.monthKey(now)}.jsonl`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(e) + "\n");
  console.log(`recorded $${e.usd.toFixed(4)} (${e.source}) → ${path.relative(ROOT, f)}`);
  process.exit(0);
}

// ADMISSION (2026-10-31): two dispatches that check the budget at the same moment would both see room. A dispatch holds
// an exclusive lock from its check until the new run is VISIBLE on GitHub (then it is counted at its per-run maximum
// by every later check). A second dispatch waits for the lock or gives up — it never dispatches unchecked.
const LOCK = path.join(ROOT, cfg.ledgerDir, ".dispatch.lock");
if (cmd === "dispatch") {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  let got = false;
  for (let k = 0; k < 24 && !(got = B.acquireLock(LOCK)); k++) execFileSync(process.execPath, ["-e", "setTimeout(()=>{},5000)"]);
  if (!got) { console.error("✗ another paid dispatch holds the admission lock — try again shortly (nothing was dispatched)"); process.exit(4); }
  process.on("exit", () => B.releaseLock(LOCK));
}
const r = report();
const v = B.verdict({ month: r.month, daily: r.daily, unknown: r.unknown, cfg, estUsd: est || 0 });
const head = `AI budget ${B.monthKey(now)}: ${v.state} — ${v.why}`;

if (cmd === "status") {
  console.log(head);
  console.log(`  month-to-date $${r.month.toFixed(4)} · last 24 h $${r.daily.toFixed(4)} · lines: warn $${cfg.warnUsd} / stop $${cfg.stopUsd} / daily $${cfg.dailyUsd} · ${r.rows.length} counted item(s), ${r.estimatedRows} at their maximum (usage unreadable)`);
  for (const x of r.rows) console.log(`  ${x.at}  $${x.usd.toFixed(4)}${x.estimated ? " (max, usage unreadable)" : ""}  ${x.source}${x.status ? "  " + x.status : ""}${x.calls ? `  ${x.calls} calls` : ""}`);
  console.log("  ESTIMATE — reconcile with the Anthropic Console (the provider bill is the truth).");
  process.exit(v.state === "UNKNOWN" ? 3 : 0);
}
if (cmd === "check") { console.log(`${head}${est ? ` · this job ≤ $${est.toFixed(2)}` : ""}`); process.exit(v.allow ? 0 : 3); }
if (cmd === "dispatch") {
  if (!opt.workflow) { console.error("dispatch needs --workflow=<file>"); process.exit(2); }
  console.log(`${head} · this run ≤ $${est.toFixed(2)}`);
  if (!v.allow) { console.error("✗ not dispatched — new paid AI work is stopped (nothing else is)."); process.exit(3); }
  const args = ["workflow", "run", opt.workflow, "--repo", cfg.repo, "--ref", opt.ref || "main"];
  for (const f of fields) args.push("-f", f);
  const t0 = Date.now();
  gh(args);
  // keep the lock until GitHub lists the new run (then every later check counts it at its maximum)
  let seen = false;
  for (let k = 0; k < 18 && !seen; k++) {
    execFileSync(process.execPath, ["-e", "setTimeout(()=>{},5000)"]);
    try { seen = (JSON.parse(gh(["api", `repos/${cfg.repo}/actions/workflows/${opt.workflow}/runs?per_page=5`])).workflow_runs || []).some((x) => Date.parse(x.created_at) >= t0 - 5000); } catch {}
  }
  console.log(`✓ dispatched ${opt.workflow} ${fields.join(" ")} on ${cfg.repo}@${opt.ref || "main"} — ${seen ? "run visible" : "run not yet visible after 90 s (counted once it appears)"}; counted at ≤ $${est.toFixed(2)} until its usage artifact is read`);
  process.exit(0);
}
console.error(`unknown command: ${cmd}`); process.exit(2);
