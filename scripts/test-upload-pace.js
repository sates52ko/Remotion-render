#!/usr/bin/env node
/**
 * test-upload-pace.js — the upload-pace guard on a fixture register + log (seconds, no network).
 *   node scripts/test-upload-pace.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const UP = require("./lib/upload-pace");

let fails = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`); if (!ok) fails++; };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "upload-pace-"));
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "quality-policy.json"), JSON.stringify({ uploadPace: { maxPerDay: 1, maxPerWeek: 7 } }));
fs.writeFileSync(path.join(root, "PUBLISHED_BOOKS.md"), [
  "# register", "", "| # | Slug | Book | Published Date | Duration |", "|---|---|---|---|---|",
  "| 1 | `alpha` | **Alpha** — A | 2026-11-20 | 30:00 |",
  "| 2 | `beta` | **Beta** — B | 2026-11-21 | 30:00 |",
  "| 3 | `gamma` | **Gamma** — C | 2026-11-21 | 30:00 |",
  "| 4 | `epsilon` | **Epsilon** — E | 2026-11-21 | 30:00 |",
  "| 2 | `beta` | **Beta** — B (duplicate row, later date) | 2026-11-22 | 30:00 |",
  "", "prose mentioning `delta` 2026-11-22 is not a row",
].join("\n"));

const rows = UP.registerRows(root);
check("register rows: one per slug, earliest date", rows.length === 4 && rows.find((r) => r.slug === "beta").date === "2026-11-21", JSON.stringify(rows));

const r1 = UP.record({ root, slug: "delta", at: "2026-11-22T09:15:00Z" });
const r2 = UP.record({ root, slug: "delta", at: "2026-11-22T18:00:00Z" });
check("record is idempotent per slug + day", !r1.existed && r2.existed && UP.logRows(root).length === 1);
const r3 = UP.record({ root, slug: "beta", at: "2026-11-23T10:00:00Z", kind: "remake" });
check("a log row wins over the register row of the same slug", UP.uploads(root).find((u) => u.slug === "beta").date === "2026-11-23" && r3.entry.kind === "remake");

const full = UP.check({ root, now: new Date("2026-11-23T12:00:00Z") });
check("a day with an upload is DAY_FULL", !full.ok && full.reasons.some((x) => x.startsWith("DAY_FULL")), full.reasons.join(" | "));
const same = UP.check({ root, now: new Date("2026-11-23T12:00:00Z"), slug: "beta" });
check("re-packaging the slug uploaded today is not a second upload", same.ok, same.reasons.join(" | "));
const free = UP.check({ root, now: new Date("2026-11-24T12:00:00Z") });
check("the next day is free (5 in the trailing week < 7)", free.ok && free.week.length === 5, `${free.week.length} ${free.reasons.join(" | ")}`);

for (let d = 24; d <= 30; d++) UP.record({ root, slug: `book-${d}`, at: `2026-11-${d}T08:00:00Z` });
const week = UP.check({ root, now: new Date("2026-11-30T20:00:00Z") });
check("an 8th upload in 7 days is WEEK_FULL (11-24…11-30 already holds 7)", !week.ok && week.reasons.some((x) => x.startsWith("WEEK_FULL")) && week.week.length === 7, `${week.week.length} ${week.reasons.join(" | ")}`);

UP.record({ root, slug: "zeta", at: "2026-11-28T15:00:00Z" }); // a second upload on 11-28 → the Mon→Sun week of 11-23 holds 8
const rep = UP.report({ root, now: new Date("2026-12-01T12:00:00Z"), days: 30 });
check("report counts the burst days (11-21 ×2, 11-28 ×2) and the over-limit week (11-23…11-29: 8)", rep.multiUploadDays.some(([d, n]) => d === "2026-11-21" && n === 2) && rep.overDay === 2 && rep.overWeek === 1, JSON.stringify({ multi: rep.multiUploadDays, overDay: rep.overDay, overWeek: rep.overWeek, weeks: rep.weeks }));

let threw = false; try { UP.record({ root, slug: "x", at: "not a date" }); } catch { threw = true; }
check("a bad --at is refused", threw);

fs.rmSync(root, { recursive: true, force: true });
console.log(fails ? `\n✗ ${fails} failing` : "\n✓ upload pace regression passes");
process.exit(fails ? 1 : 0);
