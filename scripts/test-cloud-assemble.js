#!/usr/bin/env node
// Cloud assembly (2026-10-24, lib/cloud-assemble.js + render-cloud-assemble.js + render-video.yml `assemble` job):
// (A) the manifest is strict (segments 1..n, contiguous frames); (B) the one run per segment is picked correctly
// among duplicates (ref, success, bundle commit, live artifact, newest); (C) segment + final verification on real tiny
// MP4s (frames, decode, audio) catches a short segment, a missing audio track and a broken concat; (D) the workflow:
// the render job is unchanged for runs without a manifest, the assemble job is read-only and uses no secret.
// Run: node scripts/test-cloud-assemble.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const CA = require("./lib/cloud-assemble");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// ── (A) manifest ─────────────────────────────────────────────────────────────
const entries = [{ seg: 2, repo: "bob/Remotion-render", runId: 456, start: 100, end: 199 }, { seg: 1, repo: "alice/Remotion-render", runId: 123, start: 0, end: 99 }];
const m = CA.buildManifest(entries);
t("manifest: built in segment order", m === "1:alice/Remotion-render:123:0-99;2:bob/Remotion-render:456:100-199", m);
t("manifest: round-trips", JSON.stringify(CA.parseManifest(m)) === JSON.stringify([...entries].sort((a, b) => a.seg - b.seg)));
t("manifest: a gap is refused", throws(() => CA.parseManifest("1:a/r:1:0-99;2:b/r:2:101-199"), /gap or overlap/));
t("manifest: an overlap is refused", throws(() => CA.parseManifest("1:a/r:1:0-99;2:b/r:2:90-199"), /gap or overlap/));
t("manifest: segments out of order are refused", throws(() => CA.parseManifest("2:a/r:1:0-99;1:b/r:2:100-199"), /1\.\.n in order/));
t("manifest: must start at frame 0", throws(() => CA.parseManifest("1:a/r:1:5-99"), /expected 0/));
t("manifest: junk / injection is refused", throws(() => CA.parseManifest("1:a/r;rm -rf:1:0-9"), /is not seg:owner/) && throws(() => CA.parseManifest(""), /empty/));

// ── (B) duplicate runs ───────────────────────────────────────────────────────
const REF = "render/bk-seg1", SHA = "b".repeat(40), OLD = "a".repeat(40);
const run = (id, o) => ({ id, head_branch: REF, head_sha: SHA, status: "completed", conclusion: "success", created_at: `2026-10-24T10:0${id}:00Z`, ...o });
const art = (live = true) => [{ name: "video-bk-seg1", expired: !live }];
const pick = (runs, artifacts) => CA.pickSegmentRun({ runs, artifacts, ref: REF, bundleSha: SHA, slug: "bk", seg: 1 });
let p = pick([run(1), run(2), run(3, { conclusion: "failure" })], { 1: art(), 2: art() });
t("runs: newest of two successful duplicates of this bundle", p.run && p.run.id === 2 && /duplicate/.test(p.reason), JSON.stringify(p));
p = pick([run(1), run(2, { head_sha: OLD })], { 1: art(), 2: art() });
t("runs: a newer run of an OLDER bundle on the same ref is ignored", p.run && p.run.id === 1);
p = pick([run(1, { head_branch: "render/other-seg1" })], { 1: art() });
t("runs: another ref's run never counts", !p.run && /no run on/.test(p.reason));
p = pick([run(1, { conclusion: "failure" }), run(2, { status: "in_progress", conclusion: null })], {});
t("runs: only failed / running -> no run, reason given", !p.run && /no successful run/.test(p.reason));
p = pick([run(1), run(2)], { 1: art(), 2: art(false) });
t("runs: an expired artifact is skipped (older live one wins)", p.run && p.run.id === 1);
p = pick([run(1)], { 1: [{ name: "video-bk-seg2", expired: false }] });
t("runs: the artifact must be THIS segment's", !p.run && /no live artifact video-bk-seg1/.test(p.reason));

// ── (C) verification on real tiny files ─────────────────────────────────────
const ff = spawnSync("ffmpeg", ["-version"]).status === 0;
if (!ff) console.log("  (ffmpeg not on PATH — file checks skipped)");
else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-asm-"));
  const mk = (name, frames, { audio = true } = {}) => {
    const f = path.join(tmp, name);
    const a = audio ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${frames / 30}`] : [];
    spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `testsrc=size=320x180:rate=30:duration=${frames / 30}`, ...a, "-c:v", "libx264", "-pix_fmt", "yuv420p", ...(audio ? ["-c:a", "aac", "-shortest"] : []), f]);
    return f;
  };
  const s1 = mk("s1.mp4", 60), s2 = mk("s2.mp4", 60);
  t("segment: 60 frames for range 0-59 -> ok", CA.verifySegment(s1, { start: 0, end: 59 }).ok, JSON.stringify(CA.verifySegment(s1, { start: 0, end: 59 })));
  const short = CA.verifySegment(s2, { start: 60, end: 179 });
  t("segment: 60 frames for a 120-frame range -> refused", !short.ok && /frames 60 != expected 120/.test(short.problems.join()), JSON.stringify(short));
  const silent = CA.verifySegment(mk("s3.mp4", 60, { audio: false }), { start: 0, end: 59 });
  t("segment: no audio stream -> refused (a silent film passes a decode check)", !silent.ok && silent.problems.includes("no audio stream"));
  const bad = path.join(tmp, "bad.mp4"); fs.writeFileSync(bad, fs.readFileSync(s2).subarray(0, Math.floor(fs.statSync(s2).size / 3)));
  t("segment: a truncated file -> refused", !CA.verifySegment(bad, { start: 60, end: 119 }).ok);
  const fin = CA.concatAndVerify([s1, s2], path.join(tmp, "film.mp4"), 120);
  t("final: two good segments -> 120 frames, clean, audio", fin.ok && fin.frames === 120 && fin.decodes, JSON.stringify(fin));
  const wrongTotal = CA.concatAndVerify([s1, s2], path.join(tmp, "film2.mp4"), 180);
  t("final: a missing segment's frames are caught on the total", !wrongTotal.ok && /frames 120 != expected 180/.test(wrongTotal.problems.join()));
  CA.sha256File(path.join(tmp, "film.mp4")).then((h) => {
    t("final: streamed sha256", /^[0-9a-f]{64}$/.test(h));
    fs.rmSync(tmp, { recursive: true, force: true });
    finish();
  });
}

// ── (D) the workflow ─────────────────────────────────────────────────────────
const yml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "render-video.yml"), "utf8").replace(/\r\n/g, "\n");
const job = (name) => { const i = yml.indexOf(`\n  ${name}:\n`); const j = yml.indexOf("\n  render:\n", i + 1); return i < 0 ? "" : yml.slice(i, name === "assemble" ? j : undefined); };
t("workflow: render job runs only without a manifest (old dispatches unchanged)", /\n  render:\n[\s\S]*?if: \$\{\{ github\.event\.inputs\.assemble_manifest == '' \}\}/.test(yml));
t("workflow: assemble job only with a manifest", /if: \$\{\{ github\.event\.inputs\.assemble_manifest != '' \}\}/.test(job("assemble")));
t("workflow: assemble job is read-only (contents/actions read, nothing else)", /permissions:\n\s+contents: read\n\s+actions: read\n\s+steps:/.test(job("assemble")));
t("workflow: no secret is used anywhere", !/secrets\./.test(yml));
t("workflow: the render job keeps its steps (master audio, render, upload)", /Master audio[\s\S]*Render Video \(Local Chunking on Runner\)[\s\S]*Upload Video Artifact/.test(job("render")));

// ── (E) post-render accepts a cloud-verified film; a local file that differs is checked locally ───────────────
{
  const ROOT = path.join(__dirname, "..");
  const slug = `zz-cloud-pr-${process.pid}`;
  const cf = path.join(ROOT, `.render-github-cloud.${slug}.json`), film = path.join(ROOT, "out", `${slug}.mp4`);
  const pr = () => spawnSync(process.execPath, [path.join(__dirname, "post-render.js"), `--slug=${slug}`], { cwd: ROOT, encoding: "utf8" });
  try {
    fs.writeFileSync(cf, JSON.stringify({ slug, verified: true, run: { url: "https://example/run/1" }, finalArtifact: { name: `video-${slug}-final` },
      report: { ok: true, final: { file: `${slug}.mp4`, frames: 120, expected: 120, durationSec: 4, bytes: 1e6, sha256: "0".repeat(64) } } }));
    let r = pr();
    t("post-render: no local film + cloud-verified report -> MP4 step passes (pack check decides: exit 2)", r.status === 2 && /DOĞRULANDI \(bulutta\)/.test(r.stdout), r.stdout.slice(-300) + r.stderr);
    fs.mkdirSync(path.dirname(film), { recursive: true });
    fs.writeFileSync(film, "not the cloud film");
    r = pr();
    t("post-render: a local film whose sha256 differs is NOT trusted -> local checks run (and fail on junk)", r.status === 1 && !/bulutta/.test(r.stdout), r.stdout.slice(-300) + r.stderr);
  } finally { fs.rmSync(cf, { force: true }); fs.rmSync(film, { force: true }); }
}

{ // render.js: the heavy local fallback never starts by itself (operator, 2026-10-24)
  const rj = fs.readFileSync(path.join(__dirname, "render.js"), "utf8").replace(/\r\n/g, "\n");
  t("render.js: a failed cloud assembly stops with the commands unless --local-fallback=\"<the operator's reason>\"", /if \(!args\["local-fallback"\] \|\| !localReason\) \{[\s\S]{0,600}it was NOT started[\s\S]{0,400}process\.exit\(1\);/.test(rj));
}

function finish() { console.log(failed ? `\n${failed} FAILED` : "\nall cloud-assemble tests passed"); process.exit(failed ? 1 : 0); }
if (!ff) finish();
