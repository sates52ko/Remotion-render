#!/usr/bin/env node
/**
 * catalogue-triage.js — the old catalogue after the YPP "inauthentic content" rejection: what to delete, what to
 * delete AND record again, in what order, under the upload-pace policy. REPORT ONLY — it deletes, edits and uploads
 * nothing (2026-11-23: nothing on the channel moves while the appeal runs; the operator acts on the outcome).
 *
 *   node scripts/catalogue-triage.js [--list=<kanal-benzerlik-listesi.csv>] [--videos=<videos.json>] [--remake-min-views=N] [--per-week=N] [--json]
 *
 * Inputs: the operator's tiered list (kademe 1 "önce sil" … 6 "kalsın"; sameness 0–1, views, title, url, slug) and, when
 * present, the analytics store (~/.yt-analytics/data/videos.json: views, likes, publishedAt, privacy) for fresher counts.
 * Rule of thumb (the operator's, 2026-11-23): a tier-1 video with search demand is worth a NEW recording (v5 form prompt +
 * Film Flow) — the old audio under new pictures would keep the same transcript; one with 20–30 views is deleted and not
 * remade. Remakes are uploads: they take the pace budget (quality-policy uploadPace).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const LIST = typeof args.list === "string" ? args.list : path.join(os.homedir(), "Downloads", "film-flow-told", "kanal-listesi", "kanal-benzerlik-listesi.csv");
const VIDEOS = typeof args.videos === "string" ? args.videos : path.join(os.homedir(), ".yt-analytics", "data", "videos.json");
const REMAKE_MIN_VIEWS = Number(args["remake-min-views"]) || 100;
let perWeek = Number(args["per-week"]);
if (!perWeek) { try { perWeek = require("./lib/upload-pace").policyOf(path.join(__dirname, "..")).maxPerWeek; } catch { perWeek = 7; } }

if (!fs.existsSync(LIST)) { console.error(`✗ no list at ${LIST} (--list=<csv>)`); process.exit(2); }

// a small CSV reader (quoted fields with commas; BOM)
function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || "").trim()])));
}
const list = parseCsv(fs.readFileSync(LIST, "utf8"));
const idOf = (url) => { const m = String(url || "").match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{6,})/); return m ? m[1] : null; };

let videos = new Map();
try { const j = JSON.parse(fs.readFileSync(VIDEOS, "utf8")); for (const v of j.videos || []) videos.set(v.id, v); } catch {}

const rows = list.map((r) => {
  const id = idOf(r.url), v = id ? videos.get(id) : null;
  const tier = (r.kademe || "").trim(), tierNo = Number((tier.match(/^(\d)/) || [])[1]) || 9;
  const views = v && Number.isFinite(v.views) ? v.views : Number(r.views) || 0;
  const sameness = Number(r.sameness_0_1) || 0;
  let action = "keep";
  if (tierNo === 1 || tierNo === 2) action = views >= REMAKE_MIN_VIEWS ? "delete + re-record" : "delete";
  else if (tierNo >= 3 && tierNo <= 5) action = "measure (unmeasured: a sameness run first)";
  return { tier, tierNo, slug: r.slug || "", title: r.title || "", id, views, sameness, engine: r.engine || "", date: r.date || (v && String(v.publishedAt).slice(0, 10)) || "", privacy: v ? v.privacy : "", action };
});

const byTier = new Map();
for (const r of rows) byTier.set(r.tier, [...(byTier.get(r.tier) || []), r]);
const remakes = rows.filter((r) => r.action === "delete + re-record").sort((a, b) => b.views - a.views || b.sameness - a.sameness);
const deletes = rows.filter((r) => r.action === "delete").sort((a, b) => b.sameness - a.sameness);
const weeks = Math.ceil(remakes.length / Math.max(1, perWeek));

if (args.json) { console.log(JSON.stringify({ list: LIST, videos: videos.size, remakeMinViews: REMAKE_MIN_VIEWS, perWeek, rows, remakes: remakes.map((r) => r.slug), deletes: deletes.map((r) => r.slug), weeks }, null, 2)); process.exit(0); }

console.log(`── catalogue triage · ${rows.length} videos in ${path.basename(LIST)}${videos.size ? ` · fresh counts for ${rows.filter((r) => r.id && videos.has(r.id)).length} from videos.json` : " · no analytics store (list counts)"}`);
console.log(`   REPORT ONLY — nothing is deleted or edited; while the appeal runs the channel does not move.\n`);
for (const [tier, rs] of [...byTier.entries()].sort((a, b) => (Number(a[0][0]) || 9) - (Number(b[0][0]) || 9))) {
  const v = rs.reduce((n, r) => n + r.views, 0);
  console.log(`   ${tier.padEnd(28)} ${String(rs.length).padStart(3)} videos · ${v} views · actions: ${Object.entries(rs.reduce((m, r) => ({ ...m, [r.action]: (m[r.action] || 0) + 1 }), {})).map(([a, n]) => `${a} ${n}`).join(", ")}`);
}
console.log(`\n   RE-RECORD (tier 1–2, ≥ ${REMAKE_MIN_VIEWS} views — search demand; a new v5 recording + Film Flow, never the old audio): ${remakes.length}`);
for (const r of remakes) console.log(`     ${String(r.views).padStart(5)} views  same ${r.sameness.toFixed(2)}  ${r.tier.slice(0, 1)}  ${r.slug.padEnd(40).slice(0, 40)}  ${r.title.slice(0, 60)}`);
console.log(`\n   DELETE, not remade (tier 1–2, < ${REMAKE_MIN_VIEWS} views): ${deletes.length}`);
for (const r of deletes.slice(0, 40)) console.log(`     ${String(r.views).padStart(5)} views  same ${r.sameness.toFixed(2)}  ${r.tier.slice(0, 1)}  ${r.slug.padEnd(40).slice(0, 40)}`);
if (deletes.length > 40) console.log(`     … +${deletes.length - 40} more`);
console.log(`\n   schedule: ${remakes.length} remakes at ≤ ${perWeek} uploads / week (policy, new books share the budget) = ${weeks} week(s) of uploads; each remake = Step 0 (form prompt) → the operator records in NotebookLM → preview-hazirla → render.`);
console.log(`   unmeasured tiers 3–5 (${rows.filter((r) => r.tierNo >= 3 && r.tierNo <= 5).length}): run node scripts/transcript-sameness.js --vtt=<their VTT> when the captions are on disk; then they join tier 2 or 6.`);
