/**
 * ai-budget.js — the SIMPLE monthly AI spend counter (operator decision 2026-10-30): $50 / month, warn at $40, stop new
 * paid AI work at $45, about $2 / day. No database, no service: it sums
 *   1. GitHub runs of the paid gh-aw workflows this month (their `usage` artifact: AIC, or tokens × price), and
 *   2. the local pilot ledger audit/ai-spend/<YYYY-MM>.jsonl (direct API pilots append their measured usage).
 * It is an ESTIMATE, not the provider's bill (reconcile in the Anthropic Console). When a run's usage cannot be read it
 * is counted at that workflow's per-run maximum; when the run list itself cannot be read the verdict is UNKNOWN, which
 * stops only new paid AI work — never anything else.
 * Pure functions here; the CLI (scripts/ai-budget.js) does the I/O.
 */
const fs = require("fs");
const path = require("path");

const monthKey = (d) => d.toISOString().slice(0, 7);
const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** USD from one usage record: an explicit AIC / cost field wins; else tokens × the model's price; else null */
function usdOfRecord(rec, cfg) {
  if (!rec || typeof rec !== "object") return null;
  for (const k of ["aic", "ai_credits", "aiCredits", "total_aic", "totalAic"]) if (Number.isFinite(+rec[k]) && rec[k] !== null && rec[k] !== "") return +rec[k] * cfg.aicUsd;
  for (const k of ["cost_usd", "costUsd", "total_cost_usd", "estimated_cost_usd"]) if (Number.isFinite(+rec[k]) && rec[k] !== null && rec[k] !== "") return +rec[k];
  const model = String(rec.model || rec.model_id || "").replace(/^anthropic\//, "");
  const p = cfg.prices[model] || (/haiku/.test(model) ? cfg.prices["claude-haiku-5-5"] : null);
  const n = (...ks) => ks.map((k) => +rec[k]).find((v) => Number.isFinite(v)) || 0;
  const input = n("input_tokens", "inputTokens", "prompt_tokens");
  const output = n("output_tokens", "outputTokens", "completion_tokens");
  const cRead = n("cache_read_input_tokens", "cache_read_tokens", "cacheReadTokens");
  const cWrite = n("cache_creation_input_tokens", "cache_write_tokens", "cacheWriteTokens");
  if (!p || !(input || output || cRead || cWrite)) return null;
  return (input * p.inputPerMTok + output * p.outputPerMTok + cRead * p.cacheReadPerMTok + cWrite * p.cacheWritePerMTok) / 1e6;
}

/** USD of one run from the text of its usage files (json or jsonl). Summary files (one total) win over per-call lines. */
function usdOfUsageFiles(files, cfg) {
  const totals = [], lines = [];
  for (const { name, text } of files) {
    const recs = [];
    try { const j = JSON.parse(text); (Array.isArray(j) ? j : [j]).forEach((r) => recs.push(r)); } catch {
      for (const l of String(text).split(/\r?\n/)) { if (!l.trim()) continue; try { recs.push(JSON.parse(l)); } catch {} }
    }
    const usd = recs.map((r) => usdOfRecord(r, cfg)).filter((v) => v != null);
    if (!usd.length) continue;
    (/_usage\.json$/.test(name) ? totals : lines).push({ name, usd: usd.reduce((a, b) => a + b, 0) });
  }
  // one component (agent / detection) is counted once: its summary if there is one, else its per-call lines
  const byPart = new Map();
  const part = (n) => (/detection/.test(n) ? "detection" : /evals/.test(n) ? "evals" : "agent");
  for (const t of totals) byPart.set(part(t.name), (byPart.get(part(t.name)) || 0) + t.usd);
  for (const l of lines) if (!byPart.has(part(l.name))) byPart.set(part(l.name) + ":lines", (byPart.get(part(l.name) + ":lines") || 0) + l.usd);
  if (!byPart.size) return null;
  return [...byPart.values()].reduce((a, b) => a + b, 0);
}

function readLedger(root, cfg, now) {
  const f = path.join(root, cfg.ledgerDir, `${monthKey(now)}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** runs: [{id, workflow, createdAt, status, usd|null}] (usd null = unreadable) */
function summarize({ runs, ledger, cfg, now }) {
  const day = now.getTime() - 24 * 3600e3;
  const rows = [];
  for (const r of runs) {
    const wf = cfg.paidWorkflows[r.workflow] || {};
    const estimated = r.usd == null;
    rows.push({ source: `gh:${r.workflow}#${r.id}`, at: r.createdAt, usd: estimated ? (wf.perRunMaxUsd || 0) : r.usd, estimated, status: r.status });
  }
  for (const e of ledger) rows.push({ source: `ledger:${e.source || "?"}`, at: e.at, usd: +e.usd || 0, estimated: !!e.estimated, calls: e.calls });
  const month = rows.reduce((a, r) => a + r.usd, 0);
  const daily = rows.filter((r) => Date.parse(r.at) >= day).reduce((a, r) => a + r.usd, 0);
  return { month, daily, rows, estimatedRows: rows.filter((r) => r.estimated).length };
}

/** OK | WARN | STOP | STOP_DAILY | UNKNOWN, and whether a NEW paid job costing estUsd may start */
function verdict({ month, daily, unknown, cfg, estUsd = 0 }) {
  if (unknown) return { state: "UNKNOWN", allow: false, why: `usage could not be read (${unknown}) — new paid AI work stops; nothing else does` };
  if (month + estUsd > cfg.stopUsd || month >= cfg.stopUsd) return { state: "STOP", allow: false, why: `month-to-date $${month.toFixed(2)} + this job $${estUsd.toFixed(2)} would pass the stop line $${cfg.stopUsd}` };
  if (daily + estUsd > cfg.dailyUsd) return { state: "STOP_DAILY", allow: false, why: `last 24 h $${daily.toFixed(2)} + this job $${estUsd.toFixed(2)} would pass the daily line $${cfg.dailyUsd}` };
  if (month >= cfg.warnUsd) return { state: "WARN", allow: true, why: `month-to-date $${month.toFixed(2)} ≥ warning line $${cfg.warnUsd}` };
  return { state: "OK", allow: true, why: `month-to-date $${month.toFixed(2)} of $${cfg.monthlyBudgetUsd}; last 24 h $${daily.toFixed(2)} of $${cfg.dailyUsd}` };
}

module.exports = { monthKey, monthStart, usdOfRecord, usdOfUsageFiles, readLedger, summarize, verdict };
