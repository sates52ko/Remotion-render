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

t("config: the operator's lines are $50 / $40 / $45 / $2 and 1 AIC = $0.01", cfg.monthlyBudgetUsd === 50 && cfg.warnUsd === 40 && cfg.stopUsd === 45 && cfg.dailyUsd === 2 && cfg.aicUsd === 0.01);
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
t("OK below the warning line", B.verdict({ month: 10, daily: 0.5, cfg }).state === "OK");
t("WARN at $40 still allows", (() => { const v = B.verdict({ month: 40.5, daily: 0, cfg, estUsd: 0.15 }); return v.state === "WARN" && v.allow; })());
t("STOP when this job would pass $45", (() => { const v = B.verdict({ month: 44.9, daily: 0, cfg, estUsd: 0.15 }); return v.state === "STOP" && !v.allow; })());
t("STOP_DAILY when this job would pass ~$2 in 24 h", (() => { const v = B.verdict({ month: 5, daily: 1.9, cfg, estUsd: 0.15 }); return v.state === "STOP_DAILY" && !v.allow; })());
t("UNKNOWN (run list unreadable) refuses the paid job only", (() => { const v = B.verdict({ month: 0, daily: 0, unknown: "HTTP 500", cfg, estUsd: 0.15 }); return v.state === "UNKNOWN" && !v.allow && /nothing else/.test(v.why); })());

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
