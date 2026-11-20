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
 *   PUBLISHED        the slug is in PUBLISHED_BOOKS.md — delivered and uploaded; nothing is rendered or fetched again
 *   DELIVERED        the film was cloud-verified and downloaded once, and the render state / film was later removed
 *                    (upload + cleanup): never fetched or re-rendered by itself — the operator asks for it back
 *   NO_RENDER        no split state for the slug under the book root
 *   UNKNOWN          a segment's run list could not be read (API/auth) — nothing is suggested on a guess
 *   LEGACY_NO_BUNDLE the state has no bundle commit (very old push): the cloud cannot tell its runs apart → operator
 *   RENDERING        segments still queued / running (render.js --wait continues by itself; else just wait)
 *   SEGMENT_FAILED   a segment's run failed or never appeared → render-github-redispatch.js (only that segment)
 *   ASSEMBLING       a cloud assembly of this render is queued / running → wait (a rerun ATTACHES, never dispatches)
 *   CLOUD_ASSEMBLE   every segment done → render-github-cloud-assemble.js --slug --download [--book-root]
 *   FETCH            cloud-verified, the film is not on this PC → render-github-cloud-assemble.js --fetch
 *   VERIFIED         the verified film is on disk (sha256 = the cloud report) → render-deliver.js (final media check,
 *                    technical record, delivery report), then the YouTube pack
 * Exit (cycle 9): 0 = a state to wait on, or a next step that is not an error; 1 = SEGMENT_FAILED; 4 = UNKNOWN;
 * 5 = LEGACY_NO_BUNDLE (operator). scripts/render-deliver.js runs the printed command itself.
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
function decide({ slug, split, cloudState, localState, film, segRuns, assembleRuns, br = "", published = false, bookGone = false }) {
  const S = `--slug=${slug}${br}`;
  const f = cloudState && cloudState.verified && cloudState.report && cloudState.report.final;
  // delivered + uploaded (cycle 9, 2026-11-03: the-first-90-days was published and cleaned while its render state was
  // being read) — the post-upload cleanup removes the state and the film; that is the END, not "no render"
  if (published) return { verdict: "PUBLISHED", next: null, detail: `${slug} is in PUBLISHED_BOOKS.md — delivered and uploaded; nothing to render, assemble or fetch${f ? ` (cloud-verified ${f.frames}/${f.expected} frames, run ${cloudState.run && cloudState.run.id})` : ""}` };
  // downloaded once: the shared local state (overwritten by the next book's fetch, deleted by cleanup), or the per-slug
  // record cloud-assemble now keeps in the cloud state (cycle 9) — or the book folder itself is gone (post-upload purge)
  const fetched = !!(f && ((localState && localState.slug === slug && localState.source === "cloud" && localState.verified && localState.sha256 === f.sha256)
    || (cloudState.fetched && cloudState.fetched.sha256 === f.sha256) || bookGone));
  // an older post-render deleted the split state at delivery: a verified film on disk is still VERIFIED; without the
  // film the render is DELIVERED (removed after delivery) — never re-dispatched (NO_RENDER) or fetched by itself
  if (!split && f && !(fetched && film && film.exists)) return { verdict: "DELIVERED", next: null, detail: `the render state is gone but the cloud verified ${f.file} (${f.frames}/${f.expected} frames, run ${cloudState.run && cloudState.run.id}) — removed after delivery (cleanup); never re-rendered or fetched by itself` };
  if (!split && !f) return { verdict: "NO_RENDER", next: null, detail: `no .render-github-split.${slug}.json under the book root — nothing dispatched (or already cleaned)` };
  const verified = !!(f && (!split || (split.bundleSha && cloudState.bundleSha === split.bundleSha)));
  if (verified) {
    const onDisk = !!(film && film.exists && fetched);
    if (onDisk) return { verdict: "VERIFIED", next: `node scripts/render-deliver.js ${S}   (final media check + technical record + delivery report; then the YouTube pack: node scripts/lint-titles.js --slug=${slug} --pack)`, detail: `film verified in the cloud (${f.frames}/${f.expected} frames, full decode, audio) and on disk with the same sha256` };
    if (fetched && film && !film.exists) return { verdict: "DELIVERED", next: null, detail: `${f.file} was downloaded and sha256-verified, then removed from out/ (upload / cleanup) — not fetched again by itself; the operator can ask for it back: node scripts/render-github-cloud-assemble.js ${S} --fetch` };
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
  if (bad.length) return { verdict: "SEGMENT_FAILED", next: `node scripts/render-github-redispatch.js ${S} --seg=${bad.map((b) => b.seg).join(",")}`, detail: `segment(s) ${bad.map((b) => `${b.seg} (${b.state}${b.conclusion ? ` ${b.conclusion}` : ""})`).join(", ")} — re-run only those; the done segments are kept`, segments: per };
  return { verdict: "CLOUD_ASSEMBLE", next: `node scripts/render-github-cloud-assemble.js ${S} --download`, detail: `all ${per.length} segments done for bundle ${String(split.bundleSha).slice(0, 8)} — join + verify on a runner, download only the verified film`, segments: per };
}

const EXIT = { SEGMENT_FAILED: 1, UNKNOWN: 4, LEGACY_NO_BUNDLE: 5 };
const exitFor = (verdict) => EXIT[verdict] || 0;

/** the split state of a slug under a book root: the per-slug file, else the shared legacy name when it holds THIS slug
 *  (a pinned cb0d0311 render.js writes only .render-github-split.json — Hamnet, procrastinate-on-purpose) */
function splitFileFor(book, slug) {
  const per = path.join(book, `.render-github-split.${slug}.json`);
  if (fs.existsSync(per)) return per;
  const shared = path.join(book, ".render-github-split.json");
  const s = readJson(shared);
  return s && s.slug === slug ? shared : null;
}

/** Everything decide() needs: files under the book root + GitHub run lists (read-only). get(worker, path) is injectable. */
async function gather({ slug, book, root, get = null, accounts = null }) {
  const sf = splitFileFor(book, slug);
  const split = sf ? readJson(sf) : null;
  const cloudState = readJson(path.join(book, `.render-github-cloud.${slug}.json`));
  const localState = readJson(path.join(book, ".render-github-state.json"));
  const fFile = cloudState && cloudState.report && cloudState.report.final && cloudState.report.final.file;
  const film = { exists: !!(fFile && fs.existsSync(path.join(book, "out", fFile))), file: fFile ? path.join(book, "out", fFile) : null };
  let published = false;
  // the current register, and the book root's own copy (a book agent records the publish there before it is pushed)
  for (const r of new Set([root, book])) { try { published = published || require("./lib/frozen").publishedSlugs(r).has(slug); } catch {} }
  const segRuns = {};
  let assembleRuns = [], unreadable = 0;
  if (!published && split && split.bundleSha && !(cloudState && cloudState.verified && cloudState.bundleSha === split.bundleSha)) {
    const acc = accounts || require("./lib/render-pool").loadAccounts();
    const g = get || httpGet;
    const workerOf = (sg) => (acc.workers || []).find((w) => w.id === sg.workerId || (w.username === sg.username && w.repo === sg.repo));
    for (const sg of split.segments || []) {
      const w = workerOf(sg);
      if (!w) { unreadable++; segRuns[sg.seg] = null; continue; }
      const r = await g(w, `/repos/${w.username}/${w.repo}/actions/runs?branch=${encodeURIComponent(sg.ref.replace("refs/heads/", ""))}&per_page=20`);
      if (!r || !r.workflow_runs) { unreadable++; segRuns[sg.seg] = null; continue; }
      segRuns[sg.seg] = r.workflow_runs;
    }
    const host = workerOf([...split.segments].sort((a, b) => a.seg - b.seg)[0]);
    const a = host ? await g(host, `/repos/${host.username}/${host.repo}/actions/runs?branch=${encodeURIComponent(`render/${slug}-assemble`)}&per_page=10`) : null;
    assembleRuns = (a && a.workflow_runs) || [];
  }
  const bookGone = !fs.existsSync(path.join(book, "books", slug));
  return { split, splitFile: sf, cloudState, localState, film, published, bookGone, segRuns, assembleRuns, unreadable };
}

function httpGet(w, p) {
  return new Promise((resolve) => {
    const rq = https.request({ hostname: "api.github.com", path: p, method: "GET", timeout: 30000, headers: { "User-Agent": "render-status", Authorization: `Bearer ${w.token}`, Accept: "application/vnd.github+json" } },
      (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { if (res.statusCode >= 400) return resolve(null); try { resolve(JSON.parse(b)); } catch { resolve(null); } }); });
    rq.on("timeout", () => rq.destroy()); rq.on("error", () => resolve(null)); rq.end();
  });
}

module.exports = { decide, gather, splitFileFor, exitFor };

// ── CLI (network reads only) ─────────────────────────────────────────────────
if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
  const SLUG = args.slug;
  if (!SLUG) { console.error("usage: node scripts/render-status.js --slug=<slug> [--book-root=<checkout>] [--json]"); process.exit(2); }
  const ROOT = path.join(__dirname, "..");
  const BOOK = typeof args["book-root"] === "string" && args["book-root"] ? path.resolve(args["book-root"]) : ROOT;
  const br = path.resolve(BOOK) === path.resolve(ROOT) ? "" : ` --book-root=${BOOK}`;
  (async () => {
    const g = await gather({ slug: SLUG, book: BOOK, root: ROOT });
    const { unreadable } = g;
    const st = decide({ slug: SLUG, ...g, br });
    if (unreadable) st.warning = `${unreadable} segment run list(s) unreadable (API/auth) — a "missing" here may be a read failure; re-check before a redispatch`;
    if (args.json) console.log(JSON.stringify(st, null, 2));
    else {
      console.log(`${st.verdict} ${SLUG}: ${st.detail}`);
      if (st.warning) console.log(`  ⚠ ${st.warning}`);
      console.log(st.next ? `  next: ${st.next}` : "  next: (nothing to run — wait, or the operator decides)");
    }
    process.exit(exitFor(st.verdict));
  })();
}
