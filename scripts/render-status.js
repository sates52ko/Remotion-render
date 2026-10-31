#!/usr/bin/env node
/**
 * render-status.js — READ-ONLY: where a split GitHub render stands, and the ONE next command (2026-10-28).
 *
 *   node scripts/render-status.js --slug=<slug> [--book-root=<checkout>] [--json]
 *
 * Why: an agent (any harness) that lost its terminal, or picked up a render another session started, improvised —
 * The Book of Margery Kempe's agent planned to download every segment and ffmpeg-concat them on the PC (its pinned
 * checkout's render.js still did that). The standard is .claude/skills/render-deliver/SKILL.md: GitHub workers →
 * cloud assembly → cloud verification → download ONLY the final film. This prints exactly one verdict and one command:
 *   NO_RENDER        no split state for the slug under the book root
 *   UNKNOWN          a segment's run list could not be read (API/auth) — nothing is suggested on a guess
 *   LEGACY_NO_BUNDLE the state has no bundle commit (very old push): the cloud cannot tell its runs apart → operator
 *   RENDERING        segments still queued / running (render.js --wait continues by itself; else just wait)
 *   SEGMENT_FAILED   a segment's run failed or never appeared → render-github-redispatch.js (only that segment)
 *   ASSEMBLING       a cloud assembly of this render is queued / running → wait (a rerun ATTACHES, never dispatches)
 *   CLOUD_ASSEMBLE   every segment done → render-github-cloud-assemble.js --slug --download [--book-root]
 *   FETCH            cloud-verified, the film is not on this PC → render-github-cloud-assemble.js --fetch
 *   VERIFIED         the verified film is on disk (sha256 = the cloud report) → the YouTube pack step
 * It never pushes, dispatches, downloads, joins or deletes anything. A local join is never suggested: it is the
 * operator's explicit exception (render-github-assemble.js --operator-approved="<reason>").
 * --book-root: the checkout that holds the render state / books/<slug> / out/ (an older pinned checkout is assembled
 * by THIS checkout's current code without re-rendering).
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

/**
 * Pure decision. segRuns: { [seg]: [{ status, conclusion, head_sha, created_at, id }] } runs on render/<slug>-seg<k>;
 * assembleRuns: runs on render/<slug>-assemble (host repo); film: { exists, sha256 } of out/<file> per the local state.
 */
function decide({ slug, split, cloudState, localState, film, segRuns, assembleRuns, br = "" }) {
  const S = `--slug=${slug}${br}`;
  if (!split) return { verdict: "NO_RENDER", next: null, detail: `no .render-github-split.${slug}.json under the book root — nothing dispatched (or already cleaned)` };
  const verified = !!(cloudState && cloudState.verified && split.bundleSha && cloudState.bundleSha === split.bundleSha);
  if (verified) {
    const f = cloudState.report && cloudState.report.final;
    const onDisk = !!(film && film.exists && localState && localState.source === "cloud" && localState.verified && f && localState.sha256 === f.sha256);
    if (onDisk) return { verdict: "VERIFIED", next: `node scripts/post-render.js --slug=${slug}   (then the YouTube pack: node scripts/lint-titles.js --slug=${slug} --pack)`, detail: `film verified in the cloud (${f.frames}/${f.expected} frames, full decode, audio) and on disk with the same sha256` };
    return { verdict: "FETCH", next: `node scripts/render-github-cloud-assemble.js ${S} --fetch`, detail: "cloud-verified; only the final film needs downloading (no new run)" };
  }
  if (!split.bundleSha) return { verdict: "LEGACY_NO_BUNDLE", next: null, detail: "the split state has no bundle commit (legacy push): the cloud cannot tell this render's runs from stale ones — OPERATOR decides (re-render, or a local join with --operator-approved=\"<reason>\")" };
  const since = Math.max(0, Date.parse(split.dispatchedAt || 0) || 0) - 60000;
  const asm = (assembleRuns || []).filter((r) => ACTIVE.has(r.status) && !(Date.parse(r.created_at) < since)).sort((a, b) => b.id - a.id)[0];
  if (asm) return { verdict: "ASSEMBLING", next: `node scripts/render-github-cloud-assemble.js ${S} --download   (attaches to run ${asm.id}; never a second assembly)`, detail: `cloud assembly run ${asm.id} is ${asm.status}` };
  const segs = [...(split.segments || [])].sort((a, b) => a.seg - b.seg);
  const per = segs.map((sg) => {
    if ((segRuns || {})[sg.seg] === null) return { seg: sg.seg, state: "unknown" }; // the run list could not be read
    const runs = ((segRuns || {})[sg.seg] || []).filter((r) => r.head_sha === split.bundleSha).sort((a, b) => b.id - a.id);
    if (runs.some((r) => ACTIVE.has(r.status))) return { seg: sg.seg, state: "running" };
    if (runs.some((r) => r.status === "completed" && r.conclusion === "success")) return { seg: sg.seg, state: "done" };
    if (runs.length) return { seg: sg.seg, state: "failed", conclusion: runs[0].conclusion };
    return { seg: sg.seg, state: "missing" };
  });
  const bad = per.filter((p) => p.state === "failed" || p.state === "missing");
  const unknown = per.filter((p) => p.state === "unknown");
  if (unknown.length) return { verdict: "UNKNOWN", next: null, detail: `run list of segment(s) ${unknown.map((u) => u.seg).join(",")} unreadable (API/auth) — never redispatch or assemble on a guess; run render-status again`, segments: per };
  const running = per.filter((p) => p.state === "running");
  if (running.length) return { verdict: "RENDERING", next: null, detail: `${per.length - running.length - bad.length}/${per.length} segments done, ${running.length} running${bad.length ? `, ${bad.length} failed/missing (rescue after the others finish)` : ""} — wait (render.js --wait continues by itself)`, segments: per };
  if (bad.length) return { verdict: "SEGMENT_FAILED", next: `node scripts/render-github-redispatch.js --slug=${slug} --seg=${bad.map((b) => b.seg).join(",")}`, detail: `segment(s) ${bad.map((b) => `${b.seg} (${b.state}${b.conclusion ? ` ${b.conclusion}` : ""})`).join(", ")} — re-run only those; the done segments are kept`, segments: per };
  return { verdict: "CLOUD_ASSEMBLE", next: `node scripts/render-github-cloud-assemble.js ${S} --download`, detail: `all ${per.length} segments done for bundle ${String(split.bundleSha).slice(0, 8)} — join + verify on a runner, download only the verified film`, segments: per };
}

module.exports = { decide };

// ── CLI (network reads only) ─────────────────────────────────────────────────
if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
  const SLUG = args.slug;
  if (!SLUG) { console.error("usage: node scripts/render-status.js --slug=<slug> [--book-root=<checkout>] [--json]"); process.exit(2); }
  const ROOT = path.join(__dirname, "..");
  const BOOK = typeof args["book-root"] === "string" && args["book-root"] ? path.resolve(args["book-root"]) : ROOT;
  const br = path.resolve(BOOK) === path.resolve(ROOT) ? "" : ` --book-root=${BOOK}`;
  const split = readJson(path.join(BOOK, `.render-github-split.${SLUG}.json`));
  const cloudState = readJson(path.join(BOOK, `.render-github-cloud.${SLUG}.json`));
  const localState = readJson(path.join(BOOK, ".render-github-state.json"));
  const fFile = cloudState && cloudState.report && cloudState.report.final && cloudState.report.final.file;
  const film = { exists: !!(fFile && fs.existsSync(path.join(BOOK, "out", fFile))) };
  const get = (w, p) => new Promise((resolve) => {
    const rq = https.request({ hostname: "api.github.com", path: p, method: "GET", timeout: 30000, headers: { "User-Agent": "render-status", Authorization: `Bearer ${w.token}`, Accept: "application/vnd.github+json" } },
      (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } }); });
    rq.on("timeout", () => rq.destroy()); rq.on("error", () => resolve(null)); rq.end();
  });
  (async () => {
    let segRuns = {}, assembleRuns = [], unreadable = 0;
    if (split && split.bundleSha && !(cloudState && cloudState.verified && cloudState.bundleSha === split.bundleSha)) {
      const { loadAccounts } = require("./lib/render-pool");
      const acc = loadAccounts();
      const workerOf = (sg) => (acc.workers || []).find((w) => w.id === sg.workerId || (w.username === sg.username && w.repo === sg.repo));
      for (const sg of split.segments || []) {
        const w = workerOf(sg);
        if (!w) { unreadable++; segRuns[sg.seg] = null; continue; }
        const r = await get(w, `/repos/${w.username}/${w.repo}/actions/runs?branch=${encodeURIComponent(sg.ref.replace("refs/heads/", ""))}&per_page=20`);
        if (!r || !r.workflow_runs) { unreadable++; segRuns[sg.seg] = null; continue; }
        segRuns[sg.seg] = r.workflow_runs;
      }
      const host = workerOf([...split.segments].sort((a, b) => a.seg - b.seg)[0]);
      const a = host ? await get(host, `/repos/${host.username}/${host.repo}/actions/runs?branch=${encodeURIComponent(`render/${SLUG}-assemble`)}&per_page=10`) : null;
      assembleRuns = (a && a.workflow_runs) || [];
    }
    const st = decide({ slug: SLUG, split, cloudState, localState, film, segRuns, assembleRuns, br });
    if (unreadable) st.warning = `${unreadable} segment run list(s) unreadable (API/auth) — a "missing" here may be a read failure; re-check before a redispatch`;
    if (args.json) console.log(JSON.stringify(st, null, 2));
    else {
      console.log(`${st.verdict} ${SLUG}: ${st.detail}`);
      if (st.warning) console.log(`  ⚠ ${st.warning}`);
      console.log(st.next ? `  next: ${st.next}` : "  next: (nothing to run — wait, or the operator decides)");
    }
    process.exit(0);
  })();
}
