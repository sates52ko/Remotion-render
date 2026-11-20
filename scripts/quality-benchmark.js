#!/usr/bin/env node
/**
 * quality-benchmark.js — book × mute-test metrics from the records already on disk.
 *
 * Reads every books/<slug>/mute-test.json (no render, no agent), takes each book's
 * latest FRESH run (the verdict; falls back to the latest run, marked "reused"),
 * and scores it against data/quality-policy.json. Use it to re-calibrate the policy
 * as the corpus grows and to compare the channel before/after an engine change.
 *
 *   node scripts/quality-benchmark.js [--json]   -> audit/quality-benchmark.{md,json}
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const pol = (readJSON(path.join(ROOT, "data", "quality-policy.json"), {}) || {}).muteTest || {};
const W = pol.blocking?.wrongPer30 ?? 1, D = pol.blocking?.deadPer30 ?? 5, A = pol.targets?.adds ?? 0.6;
const rows = [];
for (const slug of fs.readdirSync(path.join(ROOT, "books"))) {
  const hist = readJSON(path.join(ROOT, "books", slug, "mute-test.json"));
  const runs = (hist && hist.runs) || [];
  if (!runs.length) continue;
  const fresh = runs.filter((r) => r.sample === "fresh");
  const r = fresh[fresh.length - 1] || runs[runs.length - 1];
  const t = r.totals || {}, n = r.n || 30;
  const engine = fs.existsSync(path.join(ROOT, "books", slug, "config.antidote.json")) ? "antidote" : "vox";
  const wrong = t.WRONG || 0, dead = t.NONE || 0, adds = t.ADDS || 0;
  rows.push({ slug, engine, run: r.label, sample: r.sample || "unknown", runs: runs.length, n, wrong, dead,
    textOnly: t.TEXT_ONLY || 0, adds, addsPct: Math.round((adds / n) * 100), explains: t.EXPLAINS ?? null,
    pass: wrong <= Math.floor((W * n) / 30) && dead <= Math.floor((D * n) / 30), addsTargetMet: adds / n >= A });
}
rows.sort((a, b) => a.slug.localeCompare(b.slug));
const avg = (k) => (rows.length ? (rows.reduce((s, r) => s + (r[k] || 0), 0) / rows.length).toFixed(1) : "-");
const md = [`# Quality benchmark — ${new Date().toISOString().slice(0, 10)}`, "",
  `Policy ${readJSON(path.join(ROOT, "data", "quality-policy.json"), {})?.version || "default"}: WRONG ≤ ${W}/30 and dead ≤ ${D}/30 block; ADDS ≥ ${A * 100}% target; EXPLAINS measured only.`, "",
  "| Book | Engine | Run | Sample | WRONG | Dead | Text-only | ADDS | Explains | Result |", "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.slug} | ${r.engine} | ${r.run} (${r.runs} runs) | ${r.sample} | ${r.wrong}/${r.n} | ${r.dead}/${r.n} | ${r.textOnly}/${r.n} | ${r.adds}/${r.n} (${r.addsPct}%)${r.addsTargetMet ? "" : " text-carried"} | ${r.explains ?? "–"} | ${r.pass ? "PASS" : "FAIL"} |`),
  "", `Mean over ${rows.length} books: WRONG ${avg("wrong")} · dead ${avg("dead")} · ADDS ${avg("adds")}/30.`].join("\n");
fs.mkdirSync(path.join(ROOT, "audit"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "audit", "quality-benchmark.md"), md + "\n");
fs.writeFileSync(path.join(ROOT, "audit", "quality-benchmark.json"), JSON.stringify({ policy: pol, rows }, null, 2) + "\n");
console.log(process.argv.includes("--json") ? JSON.stringify(rows, null, 2) : md);
