#!/usr/bin/env node
/**
 * preview-ready.js — one answer to "can the operator preview this book?".
 *
 *   node scripts/preview-ready.js --slug=<slug>
 *
 * READY means: authored (gate-authorship PASS), every blocking gate report
 * PASS, and the latest fresh blind mute test PASS (WRONG <= 1/30 and dead frames
 * <= 5/30; image ADDS >= 60% is a reported target, not a block — mute-test.js).
 * Gate PASS alone is not enough — the old We Were Liars config passed every gate
 * and a blind judge found 9/30 frames WRONG.
 * Exit 0 = READY, 1 = NOT READY (reasons printed).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const slug = (process.argv.find((a) => a.startsWith("--slug=")) || "").slice(7);
if (!slug) { console.error("Usage: node scripts/preview-ready.js --slug=<slug>"); process.exit(1); }
require("./lib/production-guard").productionGuard({ slug, step: "preview-ready" });
const BOOK = path.join(ROOT, "books", slug);
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const engine = fs.existsSync(path.join(BOOK, "config.antidote.json")) ? "antidote" : fs.existsSync(path.join(BOOK, "config.vox.json")) ? "vox" : null;

const rows = [];
const check = (name, ok, detail = "") => rows.push({ name, ok, detail });

check("config exists", !!engine, engine || `run make-book for ${slug}`);
if (engine) {
  const art = engine === "antidote" ? path.join(BOOK, "art.json") : path.join(BOOK, "designs.json");
  check(`authored ${path.basename(art)}`, fs.existsSync(art), fs.existsSync(art) ? "" : "node scripts/storyboard.js prep → authors → merge --write");
  const g = spawnSync(process.execPath, ["scripts/gate-authorship.js", `--slug=${slug}`, "--report-only"], { cwd: ROOT, encoding: "utf8" });
  const gr = readJSON(path.join(BOOK, "authorship.report.json"));
  check("authorship gate", gr && gr.status === "PASS", gr ? JSON.stringify(gr.counts) : (g.stderr || "").slice(0, 200));
  if (engine === "antidote") {
    // data/quality-policy.json narrativeFirewall.previewReady: "noBlock" (operator decision 2026-10-16) = a preview
    // needs 0 BLOCK; REVIEW findings are shown as quality debt, not a block. Otherwise the production status must PASS.
    const policy = readJSON(path.join(ROOT, "data", "quality-policy.json")) || {};
    const noBlock = ((policy.narrativeFirewall || {}).previewReady || {}).rule === "noBlock";
    const fwFiles = ["narrative-visual-firewall.report.json", "narrative-visual-firewall.preview.report.json"].map((f) => path.join(BOOK, f)).filter((p) => fs.existsSync(p));
    const fwPath = fwFiles.sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs)[0];
    const fw = fwPath ? readJSON(fwPath) : null;
    if (noBlock) {
      const c = (fw && fw.counts) || {};
      check("narrative firewall (preview: 0 BLOCK)", !!fw && c.blocks === 0, fw ? `${c.blocks} BLOCK, ${c.reviews} REVIEW (quality debt, not a block for a preview; production status ${fw.productionStatus || fw.status}) — ${path.basename(fwPath)}` : "not run — make-book step 1.895");
    } else {
      check("narrative firewall", fw && fw.status === "PASS", fw ? `${fw.counts.violations} violations` : "not run — make-book step 1.895");
    }
    const stx = readJSON(path.join(BOOK, "screen-text.report.json"));
    check("screen-text gate", stx && stx.status === "PASS", stx ? `${(stx.violations || []).length} violations` : "not run — make-book step 1.896");
  }
  const mt = readJSON(path.join(BOOK, "mute-test.json"));
  const runs = (mt && mt.runs) || [];
  const last = runs[runs.length - 1];
  // Holdout rule (mute-test.js): a PASS on reused frames is a diagnostic. The
  // verdict is the latest fresh-sample run; runs recorded before the rule
  // (no `sample` field) count as fresh only if they were not a --vs comparison.
  // one rule for every run on record (two-tier bar, 2026-09-28), whatever rule tallied it
  let pol = {}; try { pol = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "quality-policy.json"), "utf8")).muteTest || {}; } catch {}
  const W = pol.blocking?.wrongPer30 ?? 1, D = pol.blocking?.deadPer30 ?? 5, A = pol.targets?.adds ?? 0.6;
  for (const r of runs) r.pass = (r.totals.WRONG || 0) <= Math.floor((W * r.n) / 30) && (r.totals.NONE || 0) <= Math.floor((D * r.n) / 30);
  const isFresh = (r) => (r.sample ? r.sample === "fresh" : !r.vs);
  const verdict = [...runs].reverse().find(isFresh);
  const ok = !!(last && last.pass && verdict && verdict.pass);
  const tot = (r) => `${r.label}: WRONG ${r.totals.WRONG || 0}/${r.n}, dead ${r.totals.NONE || 0}/${r.n}, ADDS ${r.totals.ADDS || 0}/${r.n}${(r.totals.ADDS || 0) / r.n < A ? " (text-carried)" : ""}${r.totals.EXPLAINS != null ? `, explains ${r.totals.EXPLAINS}/${r.n}` : ""}` +
    (r.imageBeats > 0 && r.imageBeats < r.n ? ` (image on ${r.imageBeats}/${r.n} frames)` : "");
  check("blind mute test (fresh holdout sample)", ok,
    !last ? "not run — node scripts/mute-test.js prep --slug=" + slug
      : ok ? tot(verdict) + (verdict !== last ? ` · latest ${tot(last)}` : "")
      : last.pass && (!verdict || !verdict.pass) ? `${tot(last)} is on reused frames; latest fresh run ${verdict ? tot(verdict) + " FAIL" : "none"} — node scripts/mute-test.js prep --slug=${slug} --label=holdout1 (fresh sample)`
      : tot(last));
  // Machine record (advisory, never a block): which code each step ran on, and whether the report-only
  // instruments ran. production-guard.js writes pipeline-record.json; framecheck.js writes framecheck.json.
  const pr = readJSON(path.join(BOOK, "pipeline-record.json"));
  const prRuns = (pr && pr.runs) || [];
  const heads = [...new Set(prRuns.map((r) => (r.head || "").slice(0, 7)).filter(Boolean))];
  const dirtyRuns = prRuns.filter((r) => r.dirty > 0);
  rows.push({ name: "pipeline code (production-guard)", advisory: true, ok: prRuns.length > 0 && dirtyRuns.every((r) => r.allowReason),
    detail: !prRuns.length ? "no record (steps ran before production-guard existed)"
      : `${prRuns.length} step(s) on ${heads.join(", ")}${heads.length > 1 ? " (MIXED code across steps)" : ""}${dirtyRuns.length ? `; ${dirtyRuns.length} on uncommitted code (${dirtyRuns.map((r) => r.allowReason || "no reason").slice(0, 2).join("; ")})` : ""}` });
  if (engine === "antidote") {
    const cfgM = fs.statSync(path.join(BOOK, "config.antidote.json")).mtimeMs;
    const fcRuns = ((readJSON(path.join(BOOK, "framecheck.json")) || {}).runs) || [];
    const fcLast = fcRuns[fcRuns.length - 1];
    rows.push({ name: "framecheck (report-only)", advisory: true, ok: !!fcLast && Date.parse(fcLast.date) >= cfgM,
      detail: !fcLast ? "not run — node scripts/framecheck.js prep --slug=" + slug + " (runbook §3b)"
        : `${fcLast.label} ${String(fcLast.date).slice(0, 10)}: ${(fcLast.findings || []).length} finding(s)${Date.parse(fcLast.date) < cfgM ? " — config changed since (stale)" : ""}` });
    const ledDir = path.join(ROOT, "audit", "cause-ledger", slug);
    const newestLedger = () => (fs.existsSync(ledDir) ? fs.readdirSync(ledDir).filter((f) => f.endsWith(".json")).map((f) => fs.statSync(path.join(ledDir, f)).mtimeMs).sort((a, b) => b - a)[0] : 0) || 0;
    const lastJudged = last && last.date ? Date.parse(last.date) : 0;
    if (last && newestLedger() < lastJudged) spawnSync(process.execPath, ["scripts/cause-ledger.js", `--slug=${slug}`], { cwd: ROOT, encoding: "utf8" });
    const led = newestLedger();
    rows.push({ name: "cause-ledger (advisory owners of each failure)", advisory: true, ok: !last || led >= lastJudged,
      detail: !last ? "no mute run yet" : led >= lastJudged ? `audit/cause-ledger/${slug}/ (newest ${new Date(led).toISOString().slice(0, 16)})` : "could not run — node scripts/cause-ledger.js --slug=" + slug });
  }
  const meta = readJSON(path.join(BOOK, "youtube-meta.json"));
  rows.push({ name: "youtube pack refined (for upload, not preview)", ok: meta ? meta.needsClaudeRefine === false : false, detail: meta ? "" : "no youtube-meta.json", advisory: true });
  if (meta) {
    const tl = require("./lib/title-lint").lintBook(slug);
    rows.push({ name: "youtube titles: search + book-specific counter-narrative (for upload)", ok: tl.status === "PASS", advisory: true,
      detail: tl.status === "PASS" ? "" : `${tl.errors.length} error(s) — node scripts/lint-titles.js --slug=${slug}` });
  }
}

const ready = rows.filter((r) => !r.advisory).every((r) => r.ok);
console.log(`\n── Preview readiness · ${slug}${engine ? ` [${engine}]` : ""}`);
for (const r of rows) console.log(`   ${r.ok ? "✓" : r.advisory ? "·" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(ready ? `\n✅ READY — preview: http://localhost:3001/${engine === "vox" ? "Vox" : "Antidote"}-${slug}` : "\n❌ NOT READY");
process.exit(ready ? 0 : 1);
