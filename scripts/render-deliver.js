#!/usr/bin/env node
/**
 * render-deliver.js — ONE production GO → a verified MP4, with no further question to the operator (cycle 9, 2026-11-03).
 *
 *   node scripts/render-deliver.js --slug=<slug> [--book-root=<pinned book worktree>]      run the chain to the end
 *   node scripts/render-deliver.js --slug=<slug> [--book-root=…] --check [--json]          READ-ONLY: state + next step
 *   options: --poll=<sec> (60) · --max-hours=<h> (6) · --once (one step, then exit 10)
 *
 * The operator's GO is the render-authorization record for ONE render input (render.js --authorize-render="<words>",
 * books/<slug>/render-decision.json). Inside that GO this runs, without asking again:
 *   dispatch (if nothing was dispatched) → track the runs → re-send ONLY failed/missing segments (bounded) → cloud
 *   assembly → download of the verified film (sha256) → final media check (frames, full decode, A/V sync, join dropouts,
 *   loudness: report only) → technical record in books/<slug>/render-facts.json → post-render (delivery files) → report.
 * State machine and rules: scripts/lib/deliver.js. Every step is re-derived from the book root + GitHub, so a restart
 * (agent, terminal, PC) continues where the work is; rerun the same command. One driver per book (lock, exit 3).
 * Never: upload, publish, cleanup, a quality-debt decision, an authorization, a local join, a new render of the same input.
 * Run it from the CURRENT code (main checkout on origin/god-mode, or ../wt-production-base); a pinned book worktree is
 * passed as --book-root (its own engine rendered the segments; this code tracks, assembles and verifies them).
 * Exit: 0 DONE · 1 FAILED · 2 usage · 3 already running · 4 BLOCKED (operator / GitHub unreadable) · 5 LEGACY · 6 time limit
 *       · 10 (--once / --check) a step remains.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const KNOWN = new Set(["slug", "book-root", "check", "json", "poll", "max-hours", "once"]);
const unknown = Object.keys(args).filter((k) => !KNOWN.has(k));
if (unknown.length || !args.slug) { console.error(`usage: node scripts/render-deliver.js --slug=<slug> [--book-root=<checkout>] [--check] [--json] [--poll=<sec>] [--max-hours=<h>] [--once]${unknown.length ? `\n❌ unknown flag(s): ${unknown.map((u) => `--${u}`).join(" ")}` : ""}`); process.exit(2); }
const SLUG = args.slug;
const BOOK = typeof args["book-root"] === "string" && args["book-root"] ? path.resolve(args["book-root"]) : ROOT;
const FOREIGN = path.resolve(BOOK) !== path.resolve(ROOT);
const BR = FOREIGN ? [`--book-root=${BOOK}`] : [];
// a book folder removed after delivery (post-upload cleanup) still has a state to report: refuse only when there is nothing
const hasState = () => ["books/" + SLUG, `.render-github-cloud.${SLUG}.json`, `.render-github-split.${SLUG}.json`].some((p) => fs.existsSync(path.join(BOOK, p)));
if (!fs.existsSync(BOOK) || !hasState()) { console.error(`❌ neither books/${SLUG} nor a render state for it under ${BOOK}`); process.exit(2); }

const status = require("./render-status");
const deliver = require("./lib/deliver");
const pre = require("./lib/render-preflight");
const RL = require("./lib/run-lock");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const JOURNAL = path.join(BOOK, `.render-deliver.${SLUG}.json`);

function configFile() {
  for (const f of ["config.antidote.json", "config.vox.json"]) { const p = path.join(BOOK, "books", SLUG, f); if (fs.existsSync(p)) return p; }
  return null;
}

/** everything the next decision needs — read-only */
function read() {
  const g = status.gather({ slug: SLUG, book: BOOK, root: ROOT });
  const statusP = g.then((x) => {
    const d = status.decide({ slug: SLUG, ...x, br: FOREIGN ? ` --book-root=${BOOK}` : "" });
    if (x.unreadable) d.warning = `${x.unreadable} run list(s) unreadable`;
    return d;
  });
  const sf = status.splitFileFor(BOOK, SLUG);
  const split = sf ? readJson(sf) : null;
  const lock = readJson(path.join(BOOK, `.render-lock.${SLUG}.json`));
  const renderLockAlive = !!(lock && RL.pidAlive(lock.pid) && (!lock.host || lock.host === os.hostname()));
  const local = readJson(path.join(BOOK, ".render-github-state.json"));
  const cfg = configFile();
  return {
    status: statusP, split, renderLockAlive,
    decisions: pre.loadDecisions(BOOK, SLUG),
    currentInputHash: cfg ? pre.inputHashOf(cfg) : null,
    filmSha: local && local.slug === SLUG && local.verified ? local.sha256 || null : null,
  };
}

const node = (script, extra, opts = {}) => spawnSync(process.execPath, [path.join(ROOT, "scripts", script), `--slug=${SLUG}`, ...extra, ...BR], { cwd: ROOT, stdio: opts.capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

async function run(step, plan) {
  if (step === "dispatch") { const r = node("render.js", ["--method=github", ...(FOREIGN ? [] : ["--no-wait"])]); return { ok: r.status === 0, status: r.status }; }
  if (step === "redispatch") { const r = node("render-github-redispatch.js", [`--seg=${plan.segs.join(",")}`]); return { ok: r.status === 0, status: r.status }; }
  if (step === "assemble" || step === "attach") { const r = node("render-github-cloud-assemble.js", ["--download", "--no-post-render"]); return { ok: r.status === 0, status: r.status }; }
  if (step === "fetch") { const r = node("render-github-cloud-assemble.js", ["--fetch"]); return { ok: r.status === 0, status: r.status }; }
  if (step === "final") {
    const v = node("verify-render-output.js", ["--media", "--json"], { capture: true });
    let detail = null;
    try { detail = JSON.parse(String(v.stdout || "").slice(String(v.stdout || "").indexOf("{"))); } catch {}
    // thumbnails A/B/C (lib/cloud-thumbs.js, 2026-11-06): current → nothing; else the assembly run's; else ONE
    // thumbnail-only cloud run. Production only; a thumbnail problem is reported, never a reason to fail the film.
    const sp = readJson(status.splitFileFor(BOOK, SLUG) || "");
    const cs = readJson(path.join(BOOK, `.render-github-cloud.${SLUG}.json`));
    const CT = require("./lib/cloud-thumbs");
    const acc = require("./lib/render-pool").loadAccounts();
    const host = CT.hostFor({ acc, bookRoot: BOOK, slug: SLUG });
    const th = host ? await CT.finalizeThumbs({ slug: SLUG, bookRoot: BOOK, root: ROOT, acc, host, mode: (sp && sp.mode) || "PRODUCTION", assembleRun: cs && cs.verified ? cs.run : null })
      : { ok: false, problems: ["no active render-pool worker"] };
    if (!th.ok) console.warn(`⚠ thumbnails not ready: ${th.problems.join("; ")} — retry (no re-render): node scripts/render-thumbnails.js --slug=${SLUG} --cloud${FOREIGN ? ` --book-root=${BOOK}` : ""}`);
    // delivery files (thumbnail, clean.vtt, YouTube pack): reported, never a reason to fail the film; deletes nothing
    const p = node("post-render.js", ["--no-cleanup"]);
    if (detail) detail.deliveryFiles = p.status === 0 ? "YOUTUBE_READY" : p.status === 2 ? "PACK_INCOMPLETE" : `POST_RENDER_EXIT_${p.status}`;
    return { ok: v.status === 0, status: v.status, detail };
  }
  return { ok: false, status: null };
}

function report(res, j) {
  const f = j.final;
  console.log("\n" + "─".repeat(64));
  console.log(`render-deliver ${SLUG}: ${res.outcome} (exit ${res.exit})`);
  if (j.result && j.result.why) console.log(`  ${j.result.why}`);
  if (f) {
    console.log(`  film: ${f.file} · ${f.frames}/${f.expectedFrames} frames · decode ${f.decodes ? "clean" : "ERRORS"} · technical ${f.technical}`);
    if (f.media) {
      const m = f.media;
      console.log(`  A/V sync ${m.sync.verdict} (start ${m.sync.startOffsetSec}s, end ${m.sync.endOffsetSec}s) · join dropouts ${m.joinDropouts.count} (${m.joinDropouts.status}) · stretch ${m.video.stretchSec}s`);
      if (m.loudness) console.log(`  loudness (report only): ${m.loudness.integratedLufs} LUFS, peak ${m.loudness.samplePeakDbfs} dBFS`);
    }
    console.log(`  delivery files: ${f.deliveryFiles || "?"}`);
  }
  console.log(`  never done here: upload, publish, cleanup — the operator's`);
  console.log("─".repeat(64));
}

(async () => {
  if (args.check) {
    // READ-ONLY: no lock, no journal write, no spawn
    const r = read();
    const st = await r.status;
    const journal = deliver.observe(readJson(JOURNAL) || {}, st);
    journal.filmSha = r.filmSha;
    const auth = deliver.authorizationOf({ split: r.split, decisions: r.decisions, currentInputHash: r.currentInputHash });
    const plan = deliver.planStep({ status: st, split: r.split, journal, auth, renderLockAlive: r.renderLockAlive, currentInputHash: r.currentInputHash });
    const out = { slug: SLUG, bookRoot: BOOK, verdict: st.verdict, detail: st.detail, warning: st.warning || null, authorization: auth, renderInputHash: r.split ? r.split.renderInputHash || null : r.currentInputHash, plan: { kind: plan.kind, step: plan.step, segs: plan.segs || null, why: plan.why } };
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`${st.verdict} ${SLUG}: ${st.detail}${st.warning ? `\n  ⚠ ${st.warning}` : ""}`);
      console.log(`  authorization: ${auth.ok ? `OK for ${auth.hash || "?"}${auth.at ? ` (${auth.at})` : ""}` : `MISSING — ${auth.why}`}`);
      console.log(`  next step (read-only check, nothing done): ${plan.kind} ${plan.step}${plan.segs ? ` seg ${plan.segs.join(",")}` : ""} — ${plan.why}`);
    }
    process.exit(plan.kind === "done" ? 0 : plan.kind === "block" ? plan.exit : plan.kind === "fail" ? 1 : 10);
  }
  if (FOREIGN) {
    const chk = require("./lib/book-root").checkBookRoot({ launcher: ROOT, bookRoot: BOOK, slug: SLUG });
    if (!chk.ok) { console.error(`❌ --book-root: ${chk.error}`); process.exit(2); }
  }
  RL.takeRunLock(path.join(BOOK, `.render-deliver-lock.${SLUG}.json`), `render-deliver ${SLUG}`);
  const res = await deliver.runDeliver({
    io: {
      read, run, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now(), log: (l) => console.log(`${new Date().toISOString().slice(11, 19)} ${l}`),
      loadJournal: () => readJson(JOURNAL), saveJournal: (j) => fs.writeFileSync(JOURNAL, JSON.stringify(j, null, 2) + "\n"),
    },
    pollMs: (Number(args.poll) || 60) * 1000, maxMs: (Number(args["max-hours"]) || 6) * 3600 * 1000, once: !!args.once,
  });
  report(res, res.journal);
  process.exit(res.exit);
})().catch((e) => { console.error(`❌ render-deliver: ${e.message}`); process.exit(1); });
