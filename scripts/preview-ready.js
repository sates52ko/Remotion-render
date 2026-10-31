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
const { voxImageCoverage, pipelineHeads, narrationFitsBundle } = require("./lib/preview-ready-checks");
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const engine = fs.existsSync(path.join(BOOK, "config.antidote.json")) ? "antidote" : fs.existsSync(path.join(BOOK, "config.vox.json")) ? "vox" : null;

const rows = [];
let muteSummary = null;
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
  if (engine === "vox") {
    // every authored image / compare side must reach the config and the disk, and no cut-out may be empty —
    // gen-vox-images.py drops a missing image's ref and exits 0, so a silently absent image is not a PASS
    const designs = readJSON(path.join(BOOK, "designs.json")), cfg = readJSON(path.join(BOOK, "config.vox.json"));
    if (designs && cfg) {
      const cov = voxImageCoverage({ designs, config: cfg, publicDir: path.join(ROOT, "public") });
      check("authored images present (designs → config → disk, no empty cut-out)", cov.ok,
        cov.ok ? `${cov.asked} authored image(s)` : `${cov.findings.length} finding(s):\n${cov.findings.map((f) => `        - ${f.beat}: ${f.problem}`).join("\n")}`);
    }
  }
  // technical: the narration must fit a render bundle (GitHub refuses a file over 100 MB) — found now, not at render
  { const nb = narrationFitsBundle({ root: ROOT, slug }); check("narration fits a render bundle (< 100 MB)", nb.ok, nb.detail); }
  const mt = readJSON(path.join(BOOK, "mute-test.json"));
  const allRuns = (mt && mt.runs) || [];
  // only runs that judged THIS film count (2026-10-30, lib/mute-verdict.js): identity (render input / config bytes /
  // legacy stills config), not array position; retired labels (STATUS.json) and runs whose seal fails are left out —
  // an old PASS without evidence never carries over to a new input
  const MVR = require("./lib/mute-verdict").currentVerdict({ root: ROOT, slug, configFile: engine ? path.join(BOOK, `config.${engine}.json`) : null, runs: allRuns });
  const runs = MVR.matching;
  const last = runs[runs.length - 1];
  const notCounted = MVR.rejected.length ? ` (not counted: ${MVR.rejected.map((x) => `${x.label} — ${x.why}`).join("; ").slice(0, 400)})` : "";
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
    !last ? (allRuns.length ? `no run judged this film${notCounted} — node scripts/preview-state.js status --slug=${slug}` : "not run — node scripts/mute-test.js prep --slug=" + slug)
      : ok ? tot(verdict) + (verdict !== last ? ` · latest ${tot(last)}` : "") + (verdict.matchedBy ? ` [bound by ${verdict.matchedBy}]` : "")
      : last.pass && (!verdict || !verdict.pass) ? `${tot(last)} is on reused frames; latest fresh run ${verdict ? tot(verdict) + " FAIL" : "none"} — node scripts/mute-test.js prep --slug=${slug} --label=holdout1 (fresh sample)`
      : tot(last));
  // Machine record (advisory, never a block): which code each step ran on, and whether the report-only
  // instruments ran. production-guard.js writes pipeline-record.json; framecheck.js writes framecheck.json.
  // Scoped to THIS production (runs at/after the production-base.json pin): heads from before the pin are not "MIXED".
  const pr = readJSON(path.join(BOOK, "pipeline-record.json"));
  const ph = pipelineHeads((pr && pr.runs) || [], readJSON(path.join(BOOK, "production-base.json")));
  const prRuns = ph.scoped, heads = ph.heads;
  const dirtyRuns = prRuns.filter((r) => r.dirty > 0);
  rows.push({ name: "pipeline code (production-guard)", advisory: true, ok: prRuns.length > 0 && dirtyRuns.every((r) => r.allowReason),
    detail: !prRuns.length ? (ph.before ? `no step since the production pin (${ph.before} earlier run(s) not counted)` : "no record (steps ran before production-guard existed)")
      : `${prRuns.length} step(s) on ${heads.join(", ")}${ph.mixed ? " (MIXED code across steps)" : ""}${ph.before ? ` (${ph.before} run(s) before the pin not counted)` : ""}${dirtyRuns.length ? `; ${dirtyRuns.length} on uncommitted code (${dirtyRuns.map((r) => r.allowReason || "no reason").slice(0, 2).join("; ")})` : ""}` });
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
    // Antidote 10x adoption (2026-10-29), measured on every READY check so a new book's use of the tools is on record:
    // capability / authored->planned / blind, never merged, never a block. A storyboard older than its rules.md (an
    // adopted or re-prepped book) is named: the tools existed but the authors were never offered them.
    const fu = spawnSync(process.execPath, ["scripts/feature-usage.js", `--slug=${slug}`, "--json"], { cwd: ROOT, encoding: "utf8" });
    let fuRep = null;
    try { fuRep = JSON.parse(fu.stdout); } catch { /* reported below */ }
    const tx = fuRep ? fuRep.features.filter((f) => f.capability !== undefined && !/carried hold/.test(f.feature)) : [];
    const used = tx.filter((f) => typeof f.planned === "number" && f.planned > 0);
    const seen = tx.filter((f) => f.blind && typeof f.blind === "object");
    rows.push({ name: "10x adoption (advisory: capability / planned / blind)", advisory: true, ok: !!fuRep && fuRep.authoringVsRules !== "AUTHORED_BEFORE_RULES",
      detail: !fuRep ? "could not run — node scripts/feature-usage.js --slug=" + slug
        : `${tx.filter((f) => f.capability === "yes").length}/${tx.length} tools in this engine; planned: ${used.length ? used.map((f) => `${f.feature.replace("10x ", "")} ${f.planned}`).join(", ") : "none"}; blind-seen: ${seen.length ? seen.map((f) => `${f.feature.replace("10x ", "")} ${f.blind.correct}/${f.blind.stills} correct`).join(", ") : "none"}${fuRep.authoringVsRules === "AUTHORED_BEFORE_RULES" ? " — ⚠ storyboard older than rules.md (not authored against the current tools)" : ""}` });
  }
  // the mute summary preview-ready.json records (2026-10-28): the production preflight prints it next to a NOT READY
  const mr = verdict || last;
  if (mr) muteSummary = { label: mr.label || null, sample: mr.sample || (mr.vs ? "reused" : "fresh"), n: mr.n, wrong: mr.totals.WRONG || 0, dead: mr.totals.NONE || 0, adds: mr.totals.ADDS || 0, pass: !!mr.pass };
  // YouTube pack — ADVISORY, for upload, never part of the preview verdict. One row from title-lint's lintPack(slug, root)
  // when that module offers it (2026-10-28, feature-detected: another change adds it); else the two rows below.
  const tlMod = require("./lib/title-lint");
  let packRow = null;
  if (typeof tlMod.lintPack === "function") {
    try {
      const p = tlMod.lintPack(slug, ROOT) || {};
      const errs = Array.isArray(p.errors) ? p.errors : [];
      const pass = p.status ? p.status === "PASS" || p.status === "READY" : p.ok === true || p.ready === true;
      packRow = { name: "YouTube READY (upload, not preview)", ok: pass, advisory: true,
        detail: pass ? "" : `${errs.length ? `${errs.length} problem(s): ${errs.slice(0, 3).map((e) => (typeof e === "string" ? e : e.message || e.rule || JSON.stringify(e))).join("; ")}` : p.detail || "not ready"}` };
    } catch (e) { packRow = { name: "YouTube READY (upload, not preview)", ok: false, advisory: true, detail: `lintPack failed: ${String(e.message || e).slice(0, 160)}` }; }
  }
  if (packRow) rows.push(packRow);
  else {
    const meta = readJSON(path.join(BOOK, "youtube-meta.json"));
    rows.push({ name: "youtube pack refined (for upload, not preview)", ok: meta ? meta.needsClaudeRefine === false : false, detail: meta ? "" : "no youtube-meta.json", advisory: true });
    if (meta) {
      const tl = tlMod.lintBook(slug);
      rows.push({ name: "youtube titles: search + book-specific counter-narrative (for upload)", ok: tl.status === "PASS", advisory: true,
        detail: tl.status === "PASS" ? "" : `${tl.errors.length} error(s) — node scripts/lint-titles.js --slug=${slug}` });
    }
  }
}

const ready = rows.filter((r) => !r.advisory).every((r) => r.ok);
console.log(`\n── Preview readiness · ${slug}${engine ? ` [${engine}]` : ""}`);
for (const r of rows) console.log(`   ${r.ok ? "✓" : r.advisory ? "·" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(ready ? `\n✅ READY — preview: http://localhost:3001/${engine === "vox" ? "Vox" : "Antidote"}-${slug}` : "\n❌ NOT READY");
// THE record of the verdict (2026-10-26): preview-state.js shows READY only from this file, for this exact config —
// an agent's report of "HAZIR" must come from here, never from Studio opening or a passing gate
// the git HEAD this verdict was produced on (was referenced but never defined: the record write threw and was swallowed)
const head = (() => { try { return require("child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null; } catch { return null; } })();
// one contract with render preflight (lib/preview-record.js): atomic write, the preflight's own render-input identity,
// read back with the preflight's reader — READY is the exit code only when the record says so for THIS config
// (renderInputHash: the runner rewrites meta.audio, so configSha256 (bytes) never matches there; both kept)
const rec = require("./lib/preview-record").writePreviewRecord({ root: ROOT, slug, engine, ready, head, mute: muteSummary, failed: rows.filter((r) => !r.advisory && !r.ok).map((r) => r.name) });
if (!rec.ok) console.error(`\n❌ preview-ready.json NOT written: ${rec.error} — the verdict is not recorded`);
else console.log(`   record: books/${slug}/preview-ready.json — ${rec.state} for render input ${rec.record.renderInputHash || "(no config)"}${head ? ` @ ${head.slice(0, 8)}` : ""}`);
// after READY (2026-10-30): the hand-off and the YouTube pack are routine; the production render is the operator's go
if (ready && rec.ok) console.log(`\n→ READY recorded. Next (routine, no question): report HAZIR with this ✅ line, finish the YouTube pack until "YouTube READY" (node scripts/lint-titles.js --slug=${slug} --pack). The production render is NOT routine: node scripts/render-decision.js --slug=${slug} says whether the operator's go is recorded.`);
else if (!ready && rec.ok) console.log(require("./lib/next-step").nextStepLine(slug, "preview-ready (NOT READY)"));
process.exit(ready && rec.ok ? 0 : 1);
