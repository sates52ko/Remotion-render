/**
 * upload-pace.js — the channel's publishing rhythm, measured and guarded.
 *
 * Why (2026-11-23): YouTube's synthetic-slop classifier (Google Research, S-CTS, 2026) scores a channel on
 * `Feature_avg_log_upload_pace` / `Feature_time_to_first_upload_secs` — "non-human, high-frequency publishing" — next
 * to transcript and title/description embeddings. The channel's register shows 20 of 32 upload days with 2–5 videos
 * and one week with 19, while YPP_HISTORY.md had said "1/day, no bursts" since 2026-08-11 with nothing enforcing it.
 * The YPP rejection of 2026-11-17 ("generic or repetitive / inauthentic content") is reviewed on the channel as a whole.
 *
 * Operator decision 2026-11-23: at most ONE upload per day, at most SEVEN per week (data/quality-policy.json →
 * uploadPace). This module only reads two records and compares them with the policy:
 *   - PUBLISHED_BOOKS.md 📊 Summary Table rows (date only) — the publish register (lib/frozen.js parses the same rows)
 *   - data/upload-log.json — `{ "entries": [{ "slug", "at": ISO, "kind": "new" | "remake", "note"? }] }`, written by
 *     `node scripts/upload-pace.js --record --slug=<s>` right after the operator uploads (the only place with a time of day)
 * package-youtube.js refuses to build a second bundle on a day that already has an upload (operator override recorded).
 * Pure: no network, no git. Tests: scripts/test-upload-pace.js.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DEFAULT_POLICY = { maxPerDay: 1, maxPerWeek: 7 };
const LOG_REL = "data/upload-log.json";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return null; } };

/** The policy block (operator decisions only), with the defaults the operator chose on 2026-11-23. */
function policyOf(root = ROOT) {
  const q = readJson(path.join(root, "data", "quality-policy.json")) || {};
  const p = q.uploadPace || {};
  return { maxPerDay: Number.isFinite(p.maxPerDay) ? p.maxPerDay : DEFAULT_POLICY.maxPerDay, maxPerWeek: Number.isFinite(p.maxPerWeek) ? p.maxPerWeek : DEFAULT_POLICY.maxPerWeek };
}

/** Publish-register rows `| n | `slug` | … | YYYY-MM-DD |` → [{slug, date}] (one per slug, earliest date wins). */
function registerRows(root = ROOT) {
  let md = ""; try { md = fs.readFileSync(path.join(root, "PUBLISHED_BOOKS.md"), "utf8"); } catch { return []; }
  const seen = new Map();
  for (const m of md.matchAll(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|[^|]*\|\s*(\d{4}-\d{2}-\d{2})/gm)) {
    const prev = seen.get(m[1]);
    if (!prev || m[2] < prev.date) seen.set(m[1], { slug: m[1], date: m[2], source: "register" });
  }
  return [...seen.values()];
}

/** data/upload-log.json entries → [{slug, date, at, kind, source:"log"}] (bad rows dropped). */
function logRows(root = ROOT) {
  const j = readJson(path.join(root, LOG_REL));
  const entries = j && Array.isArray(j.entries) ? j.entries : [];
  return entries.filter((e) => e && typeof e.slug === "string" && typeof e.at === "string" && !Number.isNaN(Date.parse(e.at)))
    .map((e) => ({ slug: e.slug, at: e.at, date: e.at.slice(0, 10), kind: e.kind === "remake" ? "remake" : "new", note: e.note || "", source: "log" }));
}

/** Every upload the channel recorded: the log row wins over the register row of the same slug (it carries a time). */
function uploads(root = ROOT) {
  const bySlug = new Map();
  for (const r of registerRows(root)) bySlug.set(r.slug, r);
  for (const r of logRows(root)) bySlug.set(r.slug, r);
  return [...bySlug.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const dayOf = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const daysAgo = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

/**
 * May the operator upload `slug` on `now`? Counts the uploads of that calendar day and of the trailing 7 days
 * (today included). A slug already recorded today is idempotent (re-packaging the same book is not a second upload).
 */
function check({ root = ROOT, now = new Date(), slug = null } = {}) {
  const policy = policyOf(root);
  const today = dayOf(now), weekStart = daysAgo(today, 6);
  const all = uploads(root).filter((u) => u.slug !== slug);
  const dayRows = all.filter((u) => u.date === today);
  const weekRows = all.filter((u) => u.date >= weekStart && u.date <= today);
  const reasons = [];
  if (dayRows.length >= policy.maxPerDay) reasons.push(`DAY_FULL: ${dayRows.length} upload(s) already on ${today} (${dayRows.map((u) => u.slug).join(", ")}) — policy: at most ${policy.maxPerDay} per day`);
  if (weekRows.length >= policy.maxPerWeek) reasons.push(`WEEK_FULL: ${weekRows.length} upload(s) in ${weekStart}…${today} — policy: at most ${policy.maxPerWeek} per 7 days`);
  return { ok: !reasons.length, today, weekStart, day: dayRows, week: weekRows, policy, reasons };
}

/** Day / week distribution of the last `days` days (and the all-time worst days) — the pace a reviewer sees. */
function report({ root = ROOT, now = new Date(), days = 30 } = {}) {
  const today = dayOf(now), from = daysAgo(today, days - 1);
  const all = uploads(root);
  const perDay = new Map();
  for (const u of all) perDay.set(u.date, (perDay.get(u.date) || 0) + 1);
  const window = [...perDay.entries()].filter(([d]) => d >= from && d <= today).sort();
  const multi = [...perDay.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const weeks = new Map();
  for (const u of all) { const d = new Date(`${u.date}T00:00:00Z`); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); const k = d.toISOString().slice(0, 10); weeks.set(k, (weeks.get(k) || 0) + 1); }
  const policy = policyOf(root);
  return {
    policy, from, to: today, total: all.length,
    inWindow: window.reduce((n, [, c]) => n + c, 0),
    daysWithUploads: window.length,
    perDay: window, multiUploadDays: multi,
    weeks: [...weeks.entries()].sort(),
    overDay: multi.filter(([, n]) => n > policy.maxPerDay).length,
    overWeek: [...weeks.values()].filter((n) => n > policy.maxPerWeek).length,
  };
}

/** Append an upload to data/upload-log.json (idempotent per slug + day). Returns the entry written or the existing one. */
function record({ root = ROOT, slug, at = new Date().toISOString(), kind = "new", note = "" }) {
  if (!slug) throw new Error("record: slug required");
  if (Number.isNaN(Date.parse(at))) throw new Error(`record: bad --at "${at}" (ISO date-time expected)`);
  const file = path.join(root, LOG_REL);
  const j = readJson(file) || { note: "Uploads to YouTube as the operator made them (time of day included) — read by scripts/lib/upload-pace.js. Append with scripts/upload-pace.js --record; never edit by hand.", entries: [] };
  if (!Array.isArray(j.entries)) j.entries = [];
  const day = at.slice(0, 10);
  const existing = j.entries.find((e) => e && e.slug === slug && typeof e.at === "string" && e.at.slice(0, 10) === day);
  if (existing) return { entry: existing, existed: true };
  const entry = { slug, at, kind: kind === "remake" ? "remake" : "new", ...(note ? { note } : {}) };
  j.entries.push(entry);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  return { entry, existed: false };
}

module.exports = { policyOf, registerRows, logRows, uploads, check, report, record, DEFAULT_POLICY, LOG_REL };
