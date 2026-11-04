#!/usr/bin/env node
// AI BUDGET (2026-10-30, operator: $50 / month, warn $40, stop $45, ~$2 / day): the counter reads a run's usage from
// AIC or tokens × price, counts an unreadable run at its maximum, and stops ONLY new paid AI work.
// Run: node scripts/test-ai-budget.js
const fs = require("fs");
const os = require("os");
const path = require("path");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info !== undefined ? `  (${JSON.stringify(info)})` : ""}`); if (!ok) failed++; };
const B = require("./lib/ai-budget");
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "ai-budget.json"), "utf8"));
const near = (a, b) => Math.abs(a - b) < 1e-9;

t("config: warn < stop < monthly budget, daily > 0, 1 AIC = $0.01", cfg.warnUsd < cfg.stopUsd && cfg.stopUsd < cfg.monthlyBudgetUsd && cfg.dailyUsd > 0 && cfg.aicUsd === 0.01, cfg);
t("config: the operator's lines (2026-10-31): $500 / warn $400 / stop $450 / $15 a day", cfg.monthlyBudgetUsd === 500 && cfg.warnUsd === 400 && cfg.stopUsd === 450 && cfg.dailyUsd === 15, cfg);
// the same rules at the NEW scale (operator 2026-10-31) — checked with an explicit config, whatever the file holds
const big = { ...cfg, monthlyBudgetUsd: 500, warnUsd: 400, stopUsd: 450, dailyUsd: 15 };
t("$500 scale: OK at $100, WARN at $401 (still allowed), STOP when this job would pass $450", B.verdict({ month: 100, daily: 1, cfg: big, estUsd: 0.15 }).state === "OK" && (() => { const v = B.verdict({ month: 401, daily: 1, cfg: big, estUsd: 0.15 }); return v.state === "WARN" && v.allow; })() && !B.verdict({ month: 449.9, daily: 0, cfg: big, estUsd: 0.15 }).allow);
t("$500 scale: STOP_DAILY when the last 24 h would pass $15", B.verdict({ month: 50, daily: 14.9, cfg: big, estUsd: 0.15 }).state === "STOP_DAILY" && B.verdict({ month: 50, daily: 14.8, cfg: big, estUsd: 0.15 }).allow);
t("the single CI Analyst run keeps its $0.15 maximum", near(cfg.paidWorkflows["ci-failure-analyst.lock.yml"].perRunMaxUsd, 0.15));
{
  const lk = path.join(os.tmpdir(), `ai-budget-lock-${process.pid}`);
  try { fs.unlinkSync(lk); } catch {}
  const a = B.acquireLock(lk), b = B.acquireLock(lk);
  t("admission lock: the first dispatcher gets it, a parallel one does not", a === true && b === false);
  B.releaseLock(lk);
  t("admission lock: free again after release", B.acquireLock(lk) === true);
  fs.writeFileSync(lk, JSON.stringify({ pid: 1, at: Date.now() - 10 * 60e3 }));
  t("admission lock: a stale lock (crashed dispatcher, > 5 min) is taken over", B.acquireLock(lk) === true);
  B.releaseLock(lk);
}
t("config: the analyst's per-run maximum = 10 + 5 AIC", near(cfg.paidWorkflows["ci-failure-analyst.lock.yml"].perRunMaxUsd, 0.15));
t("an AIC field is priced at $0.01 each", near(B.usdOfRecord({ aic: 7 }, cfg), 0.07));
t("tokens × the Haiku price when no AIC field exists", near(B.usdOfRecord({ model: "claude-haiku-5-5", input_tokens: 1e6, output_tokens: 2e5 }, cfg), 0.10 + 0.10));
t("a record with neither AIC nor tokens is unreadable (null), not $0", B.usdOfRecord({ model: "claude-haiku-5-5" }, cfg) === null);
t("summary file wins over per-call lines of the same component; agent + detection add up",
  near(B.usdOfUsageFiles([
    { name: "agent_usage.json", text: JSON.stringify({ aic: 4 }) },
    { name: "token_usage.jsonl", text: '{"model":"claude-haiku-5-5","input_tokens":1000000}\n' },
    { name: "detection_usage.json", text: JSON.stringify({ aic: 1 }) },
  ], cfg), 0.05));
t("real artifact layout (2026-10-31 run): agent summary + detection/token_usage.jsonl → both counted",
  near(B.usdOfUsageFiles([
    { name: "agent_usage.json", text: JSON.stringify({ ai_credits: 1.630479 }) },
    { name: "agent/token_usage.jsonl", text: JSON.stringify({ model: "claude-haiku-5-5", input_tokens: 9e9 }) + "\n" },
    { name: "detection/token_usage.jsonl", text: JSON.stringify({ ai_credits: 0.467504 }) + "\n" },
  ], cfg), 0.01630479 + 0.00467504));
t("only per-call lines → their sum", near(B.usdOfUsageFiles([{ name: "token_usage.jsonl", text: '{"aic":2}\n{"aic":3}\n' }], cfg), 0.05));
t("no usable record → null (the caller counts the run at its maximum)", B.usdOfUsageFiles([{ name: "agent_usage.json", text: "{}" }], cfg) === null);

const now = new Date("2026-10-30T12:00:00Z");
const runs = [
  { id: 1, workflow: "ci-failure-analyst.lock.yml", createdAt: "2026-10-02T10:00:00Z", status: "completed/success", usd: 0.04 },
  { id: 2, workflow: "ci-failure-analyst.lock.yml", createdAt: "2026-10-30T09:00:00Z", status: "completed/success", usd: null },
];
const s = B.summarize({ runs, ledger: [{ at: "2026-10-30T08:00:00Z", source: "mute-cloud-pilot", usd: 0.30 }], cfg, now });
t("an unreadable run counts at the workflow's maximum, and is marked estimated", near(s.month, 0.04 + 0.15 + 0.30) && s.estimatedRows === 1);
t("last 24 h only counts the last day's items", near(s.daily, 0.15 + 0.30));
const small = { ...cfg, monthlyBudgetUsd: 50, warnUsd: 40, stopUsd: 45, dailyUsd: 2 }; // the first lines (2026-10-30): the rules must hold at that scale too
t("OK below the warning line", B.verdict({ month: 10, daily: 0.5, cfg: small }).state === "OK");
t("WARN at $40 still allows", (() => { const v = B.verdict({ month: 40.5, daily: 0, cfg: small, estUsd: 0.15 }); return v.state === "WARN" && v.allow; })());
t("STOP when this job would pass $45", (() => { const v = B.verdict({ month: 44.9, daily: 0, cfg: small, estUsd: 0.15 }); return v.state === "STOP" && !v.allow; })());
t("STOP_DAILY when this job would pass ~$2 in 24 h", (() => { const v = B.verdict({ month: 5, daily: 1.9, cfg: small, estUsd: 0.15 }); return v.state === "STOP_DAILY" && !v.allow; })());
t("UNKNOWN (run list unreadable) refuses the paid job only", (() => { const v = B.verdict({ month: 0, daily: 0, unknown: "HTTP 500", cfg: small, estUsd: 0.15 }); return v.state === "UNKNOWN" && !v.allow && /nothing else/.test(v.why); })());

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-budget-"));
try {
  fs.mkdirSync(path.join(tmp, cfg.ledgerDir), { recursive: true });
  fs.writeFileSync(path.join(tmp, cfg.ledgerDir, "2026-10.jsonl"), '{"at":"2026-10-30T08:00:00Z","source":"x","usd":0.2}\nnot json\n');
  fs.writeFileSync(path.join(tmp, cfg.ledgerDir, "2026-09.jsonl"), '{"at":"2026-09-30T08:00:00Z","source":"x","usd":9}\n');
  const l = B.readLedger(tmp, cfg, now);
  t("the ledger is per month and skips a broken line", l.length === 1 && l[0].usd === 0.2);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} FAILED` : "\nall ai-budget checks passed");
process.exit(failed ? 1 : 0);
