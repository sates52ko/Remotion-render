#!/usr/bin/env node
/**
 * upload-pace.js — the channel's publishing rhythm (operator policy: ≤ 1 upload per day, ≤ 7 per week, 2026-11-23).
 *
 *   node scripts/upload-pace.js --report [--days=30]            day / week distribution from PUBLISHED_BOOKS.md + data/upload-log.json
 *   node scripts/upload-pace.js --check [--slug=<s>] [--now=ISO]  may <slug> be uploaded now? exit 1 when the day / week is full
 *   node scripts/upload-pace.js --record --slug=<s> [--at=ISO] [--kind=new|remake] [--note="…"]
 *                                                               the operator uploaded it: append to data/upload-log.json
 * package-youtube.js runs the check itself. Rules + why: scripts/lib/upload-pace.js.
 */
const UP = require("./lib/upload-pace");

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const has = (k) => process.argv.includes(`--${k}`);
const now = arg("now") ? new Date(arg("now")) : new Date();
if (Number.isNaN(now.getTime())) { console.error(`✗ --now "${arg("now")}" is not a date`); process.exit(2); }

if (has("record")) {
  const slug = arg("slug");
  if (!slug) { console.error("usage: node scripts/upload-pace.js --record --slug=<slug> [--at=ISO] [--kind=new|remake] [--note=…]"); process.exit(2); }
  const r = UP.record({ slug, at: arg("at") || new Date().toISOString(), kind: arg("kind") || "new", note: arg("note") || "" });
  console.log(`${r.existed ? "· already recorded" : "✓ recorded"} ${r.entry.slug} ${r.entry.at} (${r.entry.kind}) → ${UP.LOG_REL}`);
  const c = UP.check({ now: new Date(r.entry.at), slug: null });
  const dayN = c.day.length, weekN = c.week.length;
  console.log(`  that day: ${dayN} upload(s) · trailing 7 days: ${weekN} (policy ≤ ${c.policy.maxPerDay} / day, ≤ ${c.policy.maxPerWeek} / week)`);
  if (dayN > c.policy.maxPerDay || weekN > c.policy.maxPerWeek) console.log("  ⚠ over the policy — the next upload waits");
  process.exit(0);
}

if (has("check") || arg("slug")) {
  const c = UP.check({ now, slug: arg("slug") });
  console.log(`── upload pace · ${c.today} (policy ≤ ${c.policy.maxPerDay} / day, ≤ ${c.policy.maxPerWeek} / 7 days)`);
  console.log(`   today: ${c.day.length} (${c.day.map((u) => u.slug).join(", ") || "none"}) · ${c.weekStart}…${c.today}: ${c.week.length}`);
  for (const r of c.reasons) console.log(`   ✗ ${r}`);
  console.log(c.ok ? "✅ an upload fits today" : "❌ no upload today — wait for the next free day");
  process.exit(c.ok ? 0 : 1);
}

const r = UP.report({ now, days: Number(arg("days")) || 30 });
console.log(`── upload pace · ${r.from} → ${r.to} (policy ≤ ${r.policy.maxPerDay} / day, ≤ ${r.policy.maxPerWeek} / week) · ${r.total} uploads on record`);
console.log(`   last ${Number(arg("days")) || 30} days: ${r.inWindow} upload(s) on ${r.daysWithUploads} day(s)`);
for (const [d, n] of r.perDay) console.log(`   ${d}  ${"█".repeat(n)} ${n}${n > r.policy.maxPerDay ? "  ✗ over the day limit" : ""}`);
console.log(`   weeks (Mon→Sun): ${r.weeks.map(([w, n]) => `${w.slice(5)}:${n}${n > r.policy.maxPerWeek ? "✗" : ""}`).join("  ")}`);
if (r.multiUploadDays.length) console.log(`   all-time multi-upload days: ${r.multiUploadDays.length} (worst ${r.multiUploadDays.slice(0, 5).map(([d, n]) => `${d}×${n}`).join(", ")})`);
console.log(`   over the policy: ${r.overDay} day(s), ${r.overWeek} week(s) — the register has dates only; times of day come from data/upload-log.json (--record after every upload)`);
