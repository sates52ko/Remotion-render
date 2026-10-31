#!/usr/bin/env node
// RENDER-DELIVER (2026-10-28): one standard for every harness — GitHub workers → CLOUD assembly → cloud verification →
// only the final film downloaded. Regression: The Book of Margery Kempe's agent planned to download every segment and
// ffmpeg-concat locally (its pinned checkout's render.js did that by default). Fixtures only — nothing touches GitHub.
//   render-status.js decides one verdict + one next command (incl. a Margery-shaped legacy state assembled by current
//   code with --book-root); render-github-assemble.js refuses without the operator's reason / after a cloud verify /
//   during a cloud assembly; cloud assembly never starts twice (skip / attach / dispatch) and checks the frame total;
//   no script or entry point recommends a local join without --operator-approved.
// Run: node scripts/test-render-deliver.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 300)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const { decide } = require("./render-status");
const CA = require("./lib/cloud-assemble");

const BUNDLE = "b".repeat(40);
const split = (over = {}) => ({ slug: "bk", bundleSha: BUNDLE, totalFrames: 300, dispatchedAt: "2026-10-27T10:00:00Z", segments: [1, 2, 3].map((k) => ({ seg: k, start: (k - 1) * 100, end: k * 100 - 1, username: `u${k}`, repo: "r", ref: `render/bk-seg${k}` })), ...over });
const run = (status, conclusion, id = 1, sha = BUNDLE) => ({ id, status, conclusion, head_sha: sha, created_at: "2026-10-27T10:05:00Z" });
const allDone = { 1: [run("completed", "success", 11)], 2: [run("completed", "success", 12)], 3: [run("completed", "success", 13)] };

// ── render-status: one verdict, one command ─────────────────────────────────
let d = decide({ slug: "bk", split: null });
t("status: no state → NO_RENDER, no command", d.verdict === "NO_RENDER" && !d.next);
d = decide({ slug: "bk", split: split(), segRuns: { ...allDone, 2: [run("in_progress", null, 12)] } });
t("status: a segment still running → RENDERING (wait)", d.verdict === "RENDERING" && !d.next);
d = decide({ slug: "bk", split: split(), segRuns: { ...allDone, 3: [run("completed", "failure", 13)] } });
t("status: a failed segment → SEGMENT_FAILED, redispatch ONLY that segment", d.verdict === "SEGMENT_FAILED" && /render-github-redispatch\.js --slug=bk --seg=3$/.test(d.next), d.next);
d = decide({ slug: "bk", split: split(), segRuns: { ...allDone, 3: [run("completed", "success", 13, "a".repeat(40))] } });
t("status: a success of ANOTHER bundle does not count (stale run on the same ref) → SEGMENT_FAILED", d.verdict === "SEGMENT_FAILED");
d = decide({ slug: "bk", split: split(), segRuns: { ...allDone, 2: null } });
t("status: an unreadable run list → UNKNOWN, nothing suggested on a guess", d.verdict === "UNKNOWN" && !d.next);
d = decide({ slug: "bk", split: split(), segRuns: allDone });
t("status: every segment done → CLOUD_ASSEMBLE (cloud join + verified download)", d.verdict === "CLOUD_ASSEMBLE" && /render-github-cloud-assemble\.js --slug=bk --download/.test(d.next) && !/render-github-assemble\.js/.test(d.next));
d = decide({ slug: "bk", split: split(), segRuns: allDone, assembleRuns: [{ id: 99, status: "in_progress", created_at: "2026-10-27T11:00:00Z" }] });
t("status: an assembly already running → ASSEMBLING (a rerun attaches, never a second one)", d.verdict === "ASSEMBLING" && /attaches to run 99/.test(d.next));
const cloud = { verified: true, bundleSha: BUNDLE, run: { url: "u" }, report: { final: { file: "bk.mp4", frames: 300, expected: 300, sha256: "s".repeat(64) } } };
d = decide({ slug: "bk", split: split(), cloudState: cloud, film: { exists: false } });
t("status: cloud-verified, not downloaded → FETCH (no new run)", d.verdict === "FETCH" && /--fetch/.test(d.next));
d = decide({ slug: "bk", split: split(), cloudState: cloud, film: { exists: true }, localState: { source: "cloud", verified: true, sha256: "s".repeat(64) } });
t("status: verified film on disk (sha = cloud report) → VERIFIED, next = delivery checks", d.verdict === "VERIFIED" && /post-render\.js/.test(d.next));
d = decide({ slug: "bk", split: split({ bundleSha: undefined }), segRuns: allDone });
t("status: a legacy push without a bundle commit → LEGACY_NO_BUNDLE (operator decides, no command)", d.verdict === "LEGACY_NO_BUNDLE" && !d.next);

// Margery-Kempe-shaped state: written by the OLD render.js of a checkout 76 commits behind (bundleSha + segments, no
// cloud state, no per-segment push/dispatch marks) — assembled by CURRENT code from its own checkout, nothing re-rendered
const margery = { slug: "the-book-of-margery-kempe", composition: "Vox-the-book-of-margery-kempe", totalFrames: 59789, bundleSha: BUNDLE, mode: "PRODUCTION", dispatchedAt: "2026-10-27T13:00:00Z",
  segments: Array.from({ length: 10 }, (_, i) => ({ seg: i + 1, start: i * 5979, end: Math.min((i + 1) * 5979, 59789) - 1, workerId: `w${i + 1}`, username: `u${i + 1}`, repo: "Remotion-render", remoteName: `render-worker-${i + 1}`, ref: `render/the-book-of-margery-kempe-seg${i + 1}` })) };
const mRuns = Object.fromEntries(margery.segments.map((s) => [s.seg, [run("completed", "success", 100 + s.seg)]]));
d = decide({ slug: margery.slug, split: margery, segRuns: mRuns, br: " --book-root=C:/x/test" });
t("Margery: old pinned state, all segments done → CLOUD_ASSEMBLE by current code with --book-root (no local join, no re-render)", d.verdict === "CLOUD_ASSEMBLE" && /render-github-cloud-assemble\.js --slug=the-book-of-margery-kempe --book-root=C:\/x\/test --download/.test(d.next), d.next);
const mManifest = CA.buildManifest(margery.segments.map((s) => ({ seg: s.seg, repo: `${s.username}/${s.repo}`, runId: 100 + s.seg, start: s.start, end: s.end })));
t("Margery: its manifest covers the whole film (= split total = config frames)", CA.checkManifestTotal({ manifest: mManifest, splitTotal: margery.totalFrames, expected: 59789 }).ok);
t("Margery: a frame mismatch with the book's config refuses the dispatch", !CA.checkManifestTotal({ manifest: mManifest, splitTotal: margery.totalFrames, expected: 59790 }).ok);

// ── cloud assembly never starts twice ───────────────────────────────────────
t("cloud: verified for this bundle → skip (fetch / post-render only)", CA.planCloudAssemble({ slug: "bk", split: split(), cloudState: cloud, assembleRuns: [] }).action === "skip");
t("cloud: verified for ANOTHER bundle → not a skip", CA.planCloudAssemble({ slug: "bk", split: split(), cloudState: { ...cloud, bundleSha: "c".repeat(40) }, assembleRuns: [] }).action === "dispatch");
t("cloud: an assembly queued/running for this render → attach", CA.planCloudAssemble({ slug: "bk", split: split(), cloudState: null, assembleRuns: [{ id: 7, head_branch: "render/bk-assemble", status: "queued", created_at: "2026-10-27T11:00:00Z" }] }).action === "attach");
t("cloud: an older render's assembly run is not attached to", CA.planCloudAssemble({ slug: "bk", split: split(), cloudState: null, assembleRuns: [{ id: 7, head_branch: "render/bk-assemble", status: "in_progress", created_at: "2026-10-20T11:00:00Z" }] }).action === "dispatch");

// ── the local join is the operator's recorded exception ────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-deliver-"));
try {
  fs.mkdirSync(path.join(tmp, "books", "bk"), { recursive: true });
  fs.writeFileSync(path.join(tmp, ".render-github-split.bk.json"), JSON.stringify(split()));
  const asm = (...a) => spawnSync(process.execPath, [path.join(__dirname, "render-github-assemble.js"), "--slug=bk", `--book-root=${tmp}`, ...a], { cwd: REPO, encoding: "utf8" });
  let r = asm();
  t("local join: refused without --operator-approved (exit 2), the cloud command printed", r.status === 2 && /render-github-cloud-assemble\.js --slug=bk --download/.test(r.stderr) && /operator-approved/.test(r.stderr), r.stderr);
  fs.writeFileSync(path.join(tmp, ".render-github-cloud.bk.json"), JSON.stringify(cloud));
  r = asm("--operator-approved=test");
  t("local join: refused when the cloud already verified this render, even with a reason → --fetch", r.status === 2 && /CLOUD-VERIFIED/.test(r.stderr) && /--fetch/.test(r.stderr), r.stderr);
  fs.rmSync(path.join(tmp, ".render-github-cloud.bk.json"));
  fs.writeFileSync(path.join(tmp, ".cloud-assemble-lock.bk.json"), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  r = asm("--operator-approved=test");
  t("local join: refused while a cloud assembly of the book runs (its lock is alive)", r.status === 2 && /cloud assembly is running/.test(r.stderr), r.stderr);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── no script / entry point sends an agent to a local join ──────────────────
const src = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
const lines = ["scripts/render.js", "scripts/render-github-download.js", "scripts/render-github-cloud-assemble.js", "scripts/render-status.js"]
  .flatMap((f) => src(f).split(/\r?\n/).map((l, i) => ({ f, i: i + 1, l })))
  .filter(({ l }) => /render-github-assemble\.js --slug/.test(l) && !/operator-approved/.test(l) && !/^\s*(\/\/|\*)/.test(l));
t("no command printed by the render scripts recommends the local join without --operator-approved", !lines.length, lines.map((x) => `${x.f}:${x.i}`).join(", "));
t("the tracked one-off local joiners are archived", !fs.existsSync(path.join(__dirname, "fast-assemble.js")) && !fs.existsSync(path.join(__dirname, "download-and-monitor.js")));
const canon = src(".claude/skills/render-deliver/SKILL.md");
t("canonical skill: cloud assembly only, render-status decides, no local fallback", /render-status\.js/.test(canon) && /No automatic local fallback/.test(canon) && /Never download segments/.test(canon));
for (const [h, f] of [["Claude Code", "CLAUDE.md"], ["Cursor / AGENTS.md", "AGENTS.md"], ["Antigravity (skill)", ".agents/skills/render-deliver/SKILL.md"], ["Antigravity (workflow)", ".agents/workflows/render-deliver.md"]]) {
  const s = src(f);
  t(`${h}: routes the final render to the canonical render-deliver skill`, s.includes(".claude/skills/render-deliver/SKILL.md"));
}
// every agent-facing skill that still documents an ffmpeg concat says, right there, that it never applies to GitHub
// segments (2026-10-28: a blind Antigravity read found .agents/skills/remotion's concat recipe without that caveat)
for (const f of [".agents/skills/remotion/SKILL.md", "SKILL.md"]) {
  const L = src(f).split(/\r?\n/);
  const bare = L.map((l, i) => ({ l, i })).filter(({ l }) => /ffmpeg concat|-f concat|Concatenate the (segments|local chunks)/i.test(l) && !/^\s*#/.test(l))
    .filter(({ i }) => !L.slice(Math.max(0, i - 3), i + 4).some((x) => /cloud assembly|render-deliver|LEGACY|never for a GitHub/i.test(x)));
  t(`${f}: every ffmpeg-concat recipe carries the cloud-assembly caveat`, !bare.length, bare.map((x) => `${f}:${x.i + 1}`).join(", "));
}
t("Antigravity remotion skill: render-deliver rule at the top", /render-deliver\/SKILL\.md/.test(src(".agents/skills/remotion/SKILL.md").slice(0, 1200)));
t("Antigravity render-deliver skill: Turkish triggers in its description", /birleştir/.test(src(".agents/skills/render-deliver/SKILL.md")) && /videoyu indir/.test(src(".agents/skills/render-deliver/SKILL.md")));
console.log(failed ? `\n${failed} FAILED` : "\nall render-deliver checks passed");
process.exit(failed ? 1 : 0);
