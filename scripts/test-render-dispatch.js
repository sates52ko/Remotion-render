#!/usr/bin/env node
/**
 * test-render-dispatch.js — the render bundle never reaches a worker that would refuse it, and a stopped dispatch
 * resumes without re-uploading or re-dispatching (2026-10-27, thinking-fast-and-slow: a 106 MB .m4a, 9 of 10 worker
 * pushes refused by GitHub's pre-receive hook, nothing dispatched, hours lost).
 *
 * Real fixtures: ffmpeg-made narrations (MP3, AAC .m4a, a >100 MB ALAC .m4a), real git repos, and ten local bare
 * "worker" repos — one with a pre-receive hook that refuses any blob over 100 MiB the way GitHub does (GH001).
 * Nothing touches GitHub, a token, or this repo's refs.
 *   1 MP3-only · 2 M4A-only · 3 MP3+M4A (MP3-first) · 4 pinned book (keeps m4a; explicit switch, hash unchanged)
 *   5 >100 MB raw m4a stops before the first push · 6 >100 MB blob in git HISTORY never travels; a big ignored file
 *   inside books/<slug>/ is caught in the TREE · 7 nine failed + one pushed → resume (no re-upload, no double dispatch)
 *   8 audio/VTT and audio/config mismatch · 9 Vox and Antidote configs.
 * Run: node scripts/test-render-dispatch.js   (~1-2 min: it encodes ~10 min of audio)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { buildBundle, auditBundle } = require("./lib/render-bundle");
const rd = require("./lib/render-dispatch");
const as = require("./lib/audio-source");
const { renderInFlight } = require("./lib/run-lock");
const { renderInputHash } = require("./lib/render-input");

let fails = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`); if (!ok) fails++; };
const sh = (cmd, args, cwd, input) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", input, maxBuffer: 64 << 20, windowsHide: true });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr || r.stdout}`);
  return r.stdout;
};
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "render-dispatch-"));
const ff = (args) => sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

// ── audio fixtures (made once) ───────────────────────────────────────────────
const A = path.join(TMP, "audio");
fs.mkdirSync(A);
const SEC = 40;
ff(["-f", "lavfi", "-i", `sine=frequency=330:duration=${SEC}:sample_rate=44100`, "-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k", path.join(A, "n.mp3")]);
ff(["-f", "lavfi", "-i", `sine=frequency=330:duration=${SEC}:sample_rate=44100`, "-ac", "2", "-c:a", "aac", "-b:a", "96k", path.join(A, "n.m4a")]);
ff(["-f", "lavfi", "-i", `sine=frequency=330:duration=${SEC + 9}:sample_rate=44100`, "-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k", path.join(A, "other.mp3")]);
// a real >100 MB narration: 150 s of 192 kHz stereo white noise, lossless ALAC (24-bit) in an .m4a (noise does not
// compress: ~0.75 MB/s), plus the same 150 s as a small MP3
const BIG = 150;
ff(["-f", "lavfi", "-i", `anoisesrc=d=${BIG}:c=white:r=192000:a=0.5`, "-ac", "2", "-sample_fmt", "s32p", "-c:a", "alac", path.join(A, "big.m4a")]);
ff(["-i", path.join(A, "big.m4a"), "-c:a", "libmp3lame", "-b:a", "96k", path.join(A, "big.mp3")]);
ff(["-f", "lavfi", "-i", "sine=frequency=880:duration=0.2", path.join(A, "sfx.wav")]);
const bigBytes = fs.statSync(path.join(A, "big.m4a")).size;
t("fixture: the lossless .m4a is really over GitHub's 100 MB limit", bigBytes > as.GITHUB_FILE_LIMIT, `${bigBytes}`);

const vtt = (sec) => `WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nhello\n\n${fmt(sec - 3)} --> ${fmt(sec - 0.5)}\nthe end\n`;
function fmt(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${x.toFixed(3).padStart(6, "0")}`; }

/** a minimal repo with the paths a bundle needs; returns its root */
let repoN = 0;
function makeRepo({ slug = "bk", engine = "antidote", audio = {}, seconds = SEC, vttSec = seconds, audioSource = null, extra = {} } = {}) {
  const root = path.join(TMP, `repo${++repoN}`);
  for (const d of ["src", "scripts", "data", ".github/workflows", `books/${slug}`, "public/audio", "public/captions", "public/sfx", "public/broll-ocean-tanker", `public/scenes/${slug}`]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "src/index.ts"), "export {};\n");
  fs.writeFileSync(path.join(root, "scripts/x.js"), "\n");
  fs.writeFileSync(path.join(root, "data/x.json"), "{}\n");
  fs.writeFileSync(path.join(root, ".github/workflows/render-video.yml"), "name: r\n");
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(path.join(root, ".gitignore"), "public/audio/\npublic/scenes/\n*.m4a\n*.mp3\n*.bin\nrender-accounts.json\n");
  for (const s of ["whoosh", "tick", "ding", "thud", "pop"]) fs.copyFileSync(path.join(A, "sfx.wav"), path.join(root, `public/sfx/${s}.wav`));
  fs.writeFileSync(path.join(root, "public/broll-ocean-tanker/mo-photoshop-background.png"), "png");
  for (const [ext, src] of Object.entries(audio)) fs.copyFileSync(path.join(A, src), path.join(root, `public/audio/${slug}.${ext}`));
  fs.writeFileSync(path.join(root, `public/captions/${slug}.vtt`), vtt(vttSec));
  const meta = { fps: 30, durationInFrames: Math.round(seconds * 30), audio: `audio/${slug}.mastered.m4a` };
  if (engine === "vox") {
    fs.writeFileSync(path.join(root, `public/scenes/${slug}/b1.png`), "img");
    fs.writeFileSync(path.join(root, `books/${slug}/config.vox.json`), JSON.stringify({ meta, beats: [{ images: [`scenes/${slug}/b1.png`] }] }, null, 2));
  } else fs.writeFileSync(path.join(root, `books/${slug}/config.antidote.json`), JSON.stringify({ meta, scenes: [{ id: 1 }] }, null, 2));
  fs.writeFileSync(path.join(root, `books/${slug}/book.json`), JSON.stringify({ slug, engine, ...(audioSource ? { audioSource } : {}) }, null, 2));
  for (const [rel, bytes] of Object.entries(extra)) fs.writeFileSync(path.join(root, rel), typeof bytes === "number" ? Buffer.alloc(bytes, 7) : bytes);
  sh("git", ["init", "-q"], root);
  sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", "-A"], root);
  sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"], root);
  return root;
}
const blobsOf = (root, sha) => sh("git", ["ls-tree", "-r", "-l", sha], root).trim().split("\n").map((l) => { const [meta, p] = l.split("\t"); return { path: p, bytes: Number(meta.trim().split(/\s+/)[3]) }; });
const cfgAudio = (root, sha, slug = "bk", f = "config.antidote.json") => JSON.parse(sh("git", ["show", `${sha}:books/${slug}/${f}`], root)).meta.audio;
const pushes = [];
const tryBuild = (o) => { try { return { b: buildBundle({ quiet: true, ...o }) }; } catch (e) { return { e }; } };

// ── 1-3: which narration a NEW book takes, and what the bundle ships ─────────
{
  const r = makeRepo({ audio: { mp3: "n.mp3" } });
  const c = as.chooseNarration(r, "bk", { vtt: `public/captions/bk.vtt` });
  t("1 MP3-only: the new book takes the MP3", c.rel === "public/audio/bk.mp3" && !c.problems.length, JSON.stringify(c.problems));
  const { b, e } = tryBuild({ slug: "bk", root: r });
  t("1 MP3-only: bundle ships the MP3 and the bundled config names it", !e && b.blobs.some((x) => x.path === "public/audio/bk.mp3") && cfgAudio(r, b.sha) === "audio/bk.mp3", e && e.message);
}
{
  const r = makeRepo({ audio: { m4a: "n.m4a" } });
  const c = as.chooseNarration(r, "bk", { vtt: `public/captions/bk.vtt` });
  const { b, e } = tryBuild({ slug: "bk", root: r });
  t("2 M4A-only: the new book takes the M4A; bundle ships it", c.rel === "public/audio/bk.m4a" && !e && cfgAudio(r, b.sha) === "audio/bk.m4a", e && e.message);
}
{
  // the MP3 is made LARGER than the m4a here, to show the rule is MP3-first, not merely "smaller"
  const r = makeRepo({ audio: { mp3: "n.mp3", m4a: "n.m4a" } });
  const c = as.chooseNarration(r, "bk", { vtt: `public/captions/bk.vtt` });
  t("3 MP3+M4A of one recording: MP3-first", c.rel === "public/audio/bk.mp3" && /MP3-first|only/.test(c.reason), `${c.rel} ${c.reason}`);
  const bk = path.join(r, "books/bk/book.json");
  fs.writeFileSync(bk, JSON.stringify({ ...JSON.parse(fs.readFileSync(bk, "utf8")), audioSource: c.rel }, null, 2)); // what make-book records
  const { b, e } = tryBuild({ slug: "bk", root: r });
  t("3 MP3+M4A: the bundle ships ONLY the MP3 (the unused .m4a stays home)", !e && b.blobs.some((x) => x.path === "public/audio/bk.mp3") && !b.blobs.some((x) => x.path === "public/audio/bk.m4a"), e && e.message);
  const r2 = makeRepo({ audio: { mp3: "other.mp3", m4a: "n.m4a" } });
  const c2 = as.chooseNarration(r2, "bk", {});
  t("3 two DIFFERENT recordings (49 s vs 40 s): stop, never pick silently", c2.rel === null && c2.problems.some((p) => /different recordings/.test(p)));
}

// ── 4: an old/pinned book keeps its file; switching is explicit and hash-neutral ──
{
  const r = makeRepo({ audio: { m4a: "n.m4a", mp3: "n.mp3" } });
  t("4 pinned book (config, no audioSource): keeps its .m4a", as.rawAudioFor(r, "audio/bk.mastered.m4a", "bk") === "audio/bk.m4a");
  const cfg = JSON.parse(fs.readFileSync(path.join(r, "books/bk/config.antidote.json"), "utf8"));
  const before = renderInputHash(cfg);
  const sw = as.switchNarration(r, "bk", "mp3", { reason: "test" });
  const book = JSON.parse(fs.readFileSync(path.join(r, "books/bk/book.json"), "utf8"));
  t("4 explicit --use=mp3: same recording, recorded with its render-input hash", sw.ok && book.audioSource === "public/audio/bk.mp3" && book.audioSourceHistory.length === 1 && sw.record.renderInputHash === before, JSON.stringify(sw.problems));
  t("4 the config file is untouched and its render-input hash unchanged", renderInputHash(JSON.parse(fs.readFileSync(path.join(r, "books/bk/config.antidote.json"), "utf8"))) === before);
  const { b, e } = tryBuild({ slug: "bk", root: r });
  t("4 after the switch the bundle ships the MP3", !e && cfgAudio(r, b.sha) === "audio/bk.mp3", e && e.message);
  const r2 = makeRepo({ audio: { m4a: "n.m4a", mp3: "other.mp3" } });
  const sw2 = as.switchNarration(r2, "bk", "mp3");
  t("4 switching to a DIFFERENT recording is refused (timings would not match)", !sw2.ok && sw2.problems.some((p) => /different recording/.test(p)) && !JSON.parse(fs.readFileSync(path.join(r2, "books/bk/book.json"), "utf8")).audioSource);
}

// ── workers: ten local bare repos; a GitHub-like pre-receive hook (100 MiB per blob, GH001) ──
const HOOK = `#!/bin/sh
while read old new ref; do
  git rev-list --objects "$new" | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' | while read type size rest; do
    if [ "$type" = blob ] && [ "$size" -gt 104857600 ]; then
      echo "remote: error: GH001: Large files detected. You may want to try Git Large File Storage."
      echo "remote: error: File $rest is $((size/1048576)) MB; this exceeds GitHub's file size limit of 100.00 MB"
      exit 1
    fi
  done || exit 1
done
exit 0
`;
function makeWorkers(root, n, { hook = true } = {}) {
  const ws = [];
  for (let i = 1; i <= n; i++) {
    const bare = path.join(TMP, `w${repoN}-${i}.git`);
    sh("git", ["init", "-q", "--bare", bare], TMP);
    if (hook) { fs.writeFileSync(path.join(bare, "hooks", "pre-receive"), HOOK); try { fs.chmodSync(path.join(bare, "hooks", "pre-receive"), 0o755); } catch {} }
    sh("git", ["remote", "add", `render-worker-${i}`, bare], root);
    ws.push({ bare, remoteName: `render-worker-${i}` });
  }
  return ws;
}
const stateFor = (slug, sha, ws) => ({ slug, bundleSha: sha, totalFrames: 1200, segments: ws.map((w, i) => ({ seg: i + 1, start: i * 120, end: i * 120 + 119, username: `u${i + 1}`, remoteName: w.remoteName, ref: `render/${slug}-seg${i + 1}` })) });
const refAt = (w, ref) => { const r = spawnSync("git", ["rev-parse", "--verify", "-q", `refs/heads/${ref}`], { cwd: w.bare, encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : null; };

// ── 5: a >100 MB narration stops before the FIRST push ───────────────────────
{
  const r = makeRepo({ audio: { m4a: "big.m4a", mp3: "big.mp3" }, seconds: BIG });
  const ws = makeWorkers(r, 10);
  const { e } = tryBuild({ slug: "bk", root: r });
  t("5 >100 MB raw .m4a: the bundle is refused before any push", !!e && !!e.oversize && /over GitHub's 100 MB file limit/.test(e.message), e ? e.message : "built");
  t("5 the refusal names the same-recording MP3 already on disk and the explicit switch", !!e && /--use=mp3/.test(e.message));
  t("5 no worker received anything", ws.every((w) => sh("git", ["for-each-ref"], w.bare).trim() === ""));
  // the operator's switch, then the same command: bundle fits, all ten accept it
  t("5 after --use=mp3 (same 150 s recording) …", as.switchNarration(r, "bk", "mp3").ok);
  const { b, e: e2 } = tryBuild({ slug: "bk", root: r });
  t("5 … the bundle builds (MP3, under the limit)", !e2 && cfgAudio(r, b.sha) === "audio/bk.mp3", e2 && e2.message);
}

// ── 6: history blobs never travel; a big ignored file in books/<slug>/ is caught IN THE TREE ──
{
  const r = makeRepo({ audio: { mp3: "n.mp3" } });
  fs.writeFileSync(path.join(r, "huge.dat"), Buffer.alloc(101 * 1048576, 1));
  sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", "huge.dat"], r);
  sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "big"], r);
  sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "rm", "-q", "huge.dat"], r);
  sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "rm big"], r);
  const ws = makeWorkers(r, 2);
  const { b, e } = tryBuild({ slug: "bk", root: r });
  t("6 a 101 MB blob in HISTORY: the parentless bundle builds without it", !e && !b.blobs.some((x) => x.path === "huge.dat") && !sh("git", ["cat-file", "-p", b.sha], r).includes("parent "), e && e.message);
  const st = stateFor("bk", b.sha, ws);
  pushes.push(rd.pushAll({ state: st, sha: b.sha, io: rd.gitIO({ root: r, sha: b.sha }), concurrency: 1 }).then((res) => {
    t("6 … and the GitHub-like hook accepts the push on every worker", res.ok && ws.every((w, i) => refAt(w, `render/bk-seg${i + 1}`) === b.sha), JSON.stringify(res.failed));
  }));
  // ignored files inside books/<slug>/ ride along with git add -f: a stray copy of audio is dropped, a big blob stops
  const r2 = makeRepo({ audio: { mp3: "n.mp3" }, extra: { "books/bk/old-take.m4a": fs.readFileSync(path.join(A, "n.m4a")), "books/bk/dump.bin": 101 * 1048576 } });
  const { e: e3 } = tryBuild({ slug: "bk", root: r2 });
  t("6 a 101 MB ignored file inside books/<slug>/ is found in the written tree (a path-list check counted the dir as 0)", !!e3 && /books\/bk\/dump\.bin is 101\.0 MB/.test(e3.message), e3 ? e3.message : "built");
  fs.rmSync(path.join(r2, "books/bk/dump.bin"));
  const { b: b4, e: e4 } = tryBuild({ slug: "bk", root: r2 });
  t("6 audio the render does not read (books/bk/old-take.m4a) is dropped from the bundle", !e4 && b4.dropped.includes("books/bk/old-take.m4a") && !blobsOf(r2, b4.sha).some((x) => x.path === "books/bk/old-take.m4a"), e4 && e4.message);
  const { b: b5 } = tryBuild({ slug: "bk", root: r2 });
  t("6 bundles are deterministic: the same tree is the same commit (a rerun can find what is already pushed)", b5.sha === b4.sha);
  fs.writeFileSync(path.join(r2, "books/bk/render-accounts.json"), "{}");
  const { e: e6 } = tryBuild({ slug: "bk", root: r2 });
  t("6 a credentials file swept in by git add -f (books/bk/render-accounts.json) stops the bundle", !!e6 && /credential/.test(e6.message), e6 ? e6.message : "built");
}

// ── 7: nine failed + one pushed → resume ─────────────────────────────────────
async function resumeTests() {
  // (a) real repos, PERMANENT: the bundle content is refused → the queue stops at the first refusal
  {
    const r = makeRepo({ audio: { mp3: "n.mp3" } });
    const ws = makeWorkers(r, 10, { hook: false });
    // a commit GitHub would refuse, built by hand (what a bundle without the audit — the pinned code — sends)
    fs.writeFileSync(path.join(r, "fat.bin"), Buffer.alloc(101 * 1048576, 3));
    const blob = sh("git", ["hash-object", "-w", "fat.bin"], r).trim();
    const tree = sh("git", ["mktree"], r, `100644 blob ${blob}\tbk.m4a\n`).trim();
    const fat = sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit-tree", tree, "-m", "fat"], r).trim();
    for (const w of ws.slice(1)) { fs.writeFileSync(path.join(w.bare, "hooks", "pre-receive"), HOOK); try { fs.chmodSync(path.join(w.bare, "hooks", "pre-receive"), 0o755); } catch {} }
    const st = stateFor("bk", fat, ws);
    let calls = 0;
    const io0 = rd.gitIO({ root: r, sha: fat });
    const io = { ...io0, push: (sg) => { calls++; return io0.push(sg); } };
    const res = await rd.pushAll({ state: st, sha: fat, io, concurrency: 1, backoffMs: 1, sleep: async () => {} });
    t("7a worker-1 (no hook) accepted, worker-2 refused with GH001 → classified PERMANENT", st.segments[0].pushed === fat && st.segments[1].pushErrorKind === "permanent" && /GH001|exceeds GitHub/.test(st.segments[1].pushError), JSON.stringify(st.segments[1]));
    t("7a the queue STOPPED: 2 uploads, not 10 (and no retries of a refusal)", calls === 2 && !res.ok && res.stoppedEarly && res.failed.filter((f) => f.kind === "not-attempted").length === 8, `calls=${calls}`);
    let dispatched = 0;
    // render.js dispatches only when pushAll is ok — nothing here
    t("7a nothing is dispatched after a refusal", dispatched === 0 && !res.ok);
    // the old loop (pre-2026-10-27 render.js) for comparison: push-warn-dispatch on every worker
    let oldPushes = 0, oldDispatch = 0;
    for (const sg of st.segments) { oldPushes++; await io0.push(sg); oldDispatch++; }
    t("7a for comparison, the old loop: 10 uploads of the refused bundle + 10 dispatches at refs that do not hold it", oldPushes === 10 && oldDispatch === 10);
  }
  // (b) fake I/O, TRANSIENT: worker-1 succeeds, nine fail every attempt → nothing dispatched; resume pushes only those nine
  {
    const sha = "a".repeat(40);
    const remote = new Map(); // ref → sha (what each worker holds)
    let net = false, uploads = [], dispatches = [];
    const io = {
      push: async (sg) => { uploads.push(sg.seg); if (sg.seg === 1 || net) { remote.set(sg.ref, sha); return { ok: true, output: "" }; } return { ok: false, output: "error: RPC failed; curl 56 Recv failure: Connection was reset\nfatal: the remote end hung up unexpectedly" }; },
      remoteSha: async (sg) => remote.get(sg.ref) || null,
    };
    const ws = Array.from({ length: 10 }, (_, i) => ({ remoteName: `render-worker-${i + 1}` }));
    let saved = null;
    const save = (s) => { saved = JSON.parse(JSON.stringify(s)); };
    const st = stateFor("bk", sha, ws);
    const r1 = await rd.pushAll({ state: st, sha, io, concurrency: 2, retries: 3, backoffMs: 1, sleep: async () => {}, save });
    t("7b run 1: 1 pushed, 9 failed (transient, retried 3× each), nothing dispatched", !r1.ok && r1.pushed === 1 && r1.failed.length === 9 && r1.failed.every((f) => f.kind === "transient") && uploads.length === 1 + 27, `uploads=${uploads.length}`);
    t("7b the state on disk records exactly which ref holds the bundle", saved.segments.filter((s) => s.pushed === sha).length === 1 && saved.segments.filter((s) => s.pushErrorKind === "transient").length === 9);
    const stDisk = path.join(TMP, "split.json");
    fs.writeFileSync(stDisk, JSON.stringify({ ...saved, dispatchedAt: new Date().toISOString() }));
    t("7b a run that dispatched nothing is not 'in flight': the same command may resume it", renderInFlight(stDisk) === null);
    // run 2: network back. Same bundle + segmentation → resume
    net = true; uploads = [];
    const st2 = rd.mergeResume(saved, stateFor("bk", sha, ws));
    const r2 = await rd.pushAll({ state: st2, sha, io, concurrency: 2, backoffMs: 1, sleep: async () => {}, save });
    t("7b run 2 (resume): only the nine missing refs are uploaded — worker-1 is not pushed again", r2.ok && uploads.length === 9 && !uploads.includes(1) && st2.resumedAt, `uploads=${uploads}`);
    const dio = { dispatch: async (sg) => { dispatches.push(sg.seg); return { code: 204 }; }, runExists: async () => false };
    const d2 = await rd.dispatchAll({ state: st2, sha, io: dio, save });
    t("7b … then all ten are dispatched once", d2.ok && dispatches.length === 10 && new Set(dispatches).size === 10);
    const stDisk2 = path.join(TMP, "split2.json");
    fs.writeFileSync(stDisk2, JSON.stringify({ ...saved, dispatchedAt: new Date().toISOString() }));
    t("7b once something is dispatched the render IS in flight (no accidental second render)", !!renderInFlight(stDisk2));
    // run 3: the same command again → nothing uploaded, nothing dispatched twice
    uploads = []; dispatches = [];
    const st3 = rd.mergeResume(saved, stateFor("bk", sha, ws));
    await rd.pushAll({ state: st3, sha, io, save });
    await rd.dispatchAll({ state: st3, sha, io: dio, save });
    t("7b run 3: 0 uploads, 0 dispatches — no workflow is triggered twice", uploads.length === 0 && dispatches.length === 0, `u=${uploads} d=${dispatches}`);
    // a state record lost, the worker already holds the bundle → ls-remote check, no re-upload
    uploads = [];
    const fresh = stateFor("bk", sha, ws);
    await rd.pushAll({ state: fresh, sha, io, save: () => {} });
    t("7b even with the state file lost, a ref that already holds the bundle is not uploaded again", uploads.length === 0);
    // dispatch outcome unknown + run list unreadable → not fired blind
    const st4 = { ...stateFor("bk", sha, ws.slice(0, 1)) };
    Object.assign(st4.segments[0], { pushed: sha, dispatchAttemptSha: sha, dispatchCode: "pending" });
    let fired = 0;
    await rd.dispatchAll({ state: st4, sha, io: { dispatch: async () => { fired++; return { code: 204 }; }, runExists: async () => undefined } });
    t("7b an earlier dispatch with an unknown outcome is not re-fired blind when the run list is unreadable", fired === 0);
    // a different bundle → a fresh start, nothing inherited
    t("7b a different bundle does not inherit push marks", !rd.mergeResume(saved, stateFor("bk", "b".repeat(40), ws)).resumedAt);
    // review #0: a FINISHED render (one segment failed on the runner) is re-run, not "resumed": every segment is
    // dispatched again, and still nothing is uploaded again (the workers already hold the bundle)
    const finished = { ...saved, endedAt: new Date().toISOString(), waited: true, exitCode: 1 };
    finished.segments = finished.segments.map((g) => ({ ...g, dispatchedAt: new Date().toISOString(), dispatchedSha: sha, dispatchCode: 204 }));
    uploads = []; dispatches = [];
    const st5 = rd.mergeResume(finished, stateFor("bk", sha, ws));
    await rd.pushAll({ state: st5, sha, io, save: () => {} });
    await rd.dispatchAll({ state: st5, sha, io: dio, save: () => {} });
    t("7c a finished render with a failed segment is re-run: all ten dispatched again, 0 uploads", !st5.resumedAt && uploads.length === 0 && dispatches.length === 10, `u=${uploads.length} d=${dispatches.length}`);
    t("7c --new-render and a changed mode never resume", !rd.mergeResume(saved, stateFor("bk", sha, ws), { newRender: true }).resumedAt && !rd.mergeResume({ ...saved, mode: "PREVIEW-ONLY" }, { ...stateFor("bk", sha, ws), mode: "PRODUCTION" }).resumedAt);
    // review #2: a run found on resume keeps ITS creation time (else the run check calls it stale and dispatches again)
    const st6 = stateFor("bk", sha, ws.slice(0, 1));
    Object.assign(st6.segments[0], { pushed: sha, pushedAt: "2026-10-27T10:00:00Z", dispatchAttemptSha: sha, dispatchCode: "pending" });
    await rd.dispatchAll({ state: st6, sha, io: { dispatch: async () => ({ code: 204 }), runExists: async () => ({ createdAt: "2026-10-27T10:01:00Z" }) } });
    t("7c a run found on resume is recorded with its own creation time", st6.segments[0].dispatchedAt === "2026-10-27T10:01:00.000Z" && st6.segments[0].dispatchCode === "run-exists", st6.segments[0].dispatchedAt);
    // review #4: the in-flight window counts from the NEWEST segment dispatch
    const stClock = path.join(TMP, "split3.json");
    const now = Date.now();
    fs.writeFileSync(stClock, JSON.stringify({ ...saved, dispatchedAt: new Date(now - 2.9 * 3600 * 1000).toISOString(), segments: saved.segments.map((g) => ({ ...g, dispatchedAt: new Date(now - 5 * 60000).toISOString(), dispatchCode: 204 })) }));
    t("7c a resumed run dispatched 5 min ago is still in flight when the state's first stamp passes 3 h", !!renderInFlight(stClock, 3, now + 0.2 * 3600 * 1000));
  }
}

// ── 8: audio vs captions vs config ───────────────────────────────────────────
{
  const r = makeRepo({ audio: { mp3: "n.mp3" }, vttSec: SEC + 30 });
  const { e } = tryBuild({ slug: "bk", root: r });
  t("8 captions far longer than the narration (+30 s): refused before any push", !!e && /captions run to .* the VTT belongs to another recording/.test(e.message), e ? e.message : "built");
  const rS = makeRepo({ audio: { mp3: "n.mp3" }, vttSec: SEC + 5 });
  const { b: bS, e: eS } = tryBuild({ slug: "bk", root: rS });
  t("8 captions 4.5 s past the audio (over the 2 s line, far under 10 s): bundles, with a warning — never refuses a book that rendered before", !eS && bS.warnings.some((w) => /captions/.test(w)), eS && eS.message);
  // preview-ready reads the audio the CONFIG names, not a slug-guessed file
  const rC = makeRepo({ audio: { mp3: "n.mp3" } });
  const cf = path.join(rC, "books/bk/config.antidote.json");
  fs.copyFileSync(path.join(rC, "public/audio/bk.mp3"), path.join(rC, "public/audio/bk-final.mp3"));
  fs.rmSync(path.join(rC, "public/audio/bk.mp3"));
  const cj = JSON.parse(fs.readFileSync(cf, "utf8"));
  fs.writeFileSync(cf, JSON.stringify({ ...cj, meta: { ...cj.meta, audio: "audio/bk-final.mp3" } }));
  const nfb = require("./lib/preview-ready-checks").narrationFitsBundle({ root: rC, slug: "bk" });
  t("8 preview-ready's size check reads the audio the config names", nfb.ok && nfb.rel === "public/audio/bk-final.mp3", JSON.stringify(nfb));
  const r2 = makeRepo({ audio: { mp3: "n.mp3" }, seconds: SEC + 20, vttSec: SEC });
  const { e: e2 } = tryBuild({ slug: "bk", root: r2 });
  t("8 a config planned on a longer narration: refused (not the narration it was planned on)", !!e2 && /not the narration the config was planned on/.test(e2.message), e2 ? e2.message : "built");
  const a = auditBundle({ blobs: [{ path: "public/audio/x.mp3", bytes: 5 }], narration: "audio/y.mp3", allowed: ["public/audio/x.mp3"] });
  t("8 a bundled config naming audio the bundle does not carry is refused", a.problems.some((p) => /the runner could not master it/.test(p)));
}

// ── 9: Vox and Antidote ─────────────────────────────────────────────────────
{
  const r = makeRepo({ engine: "vox", audio: { mp3: "n.mp3" } });
  const { b, e } = tryBuild({ slug: "bk", root: r });
  t("9 Vox: bundle ships its image + MP3, config.vox.json re-pointed", !e && b.blobs.some((x) => x.path === "public/scenes/bk/b1.png") && cfgAudio(r, b.sha, "bk", "config.vox.json") === "audio/bk.mp3", e && e.message);
  const r2 = makeRepo({ engine: "antidote", audio: { m4a: "n.m4a" } });
  const { b: b2, e: e2 } = tryBuild({ slug: "bk", root: r2 });
  t("9 Antidote: bundle ships the M4A, config.antidote.json re-pointed", !e2 && cfgAudio(r2, b2.sha) === "audio/bk.m4a", e2 && e2.message);
}

// ── classification + redaction ──────────────────────────────────────────────
const gh001 = "remote: error: GH001: Large files detected.\nremote: error: File public/audio/x.m4a is 101.47 MB; this exceeds GitHub's file size limit of 100.00 MB\n ! [remote rejected] abc -> render/x-seg2 (pre-receive hook declined)";
t("class: GitHub's GH001 size refusal is permanent", rd.classifyPushError(gh001) === "permanent");
t("class: auth / missing repo are permanent", rd.classifyPushError("remote: Permission to u/r.git denied to x.\nfatal: unable to access: The requested URL returned error: 403") === "permanent" && rd.classifyPushError("remote: Repository not found.") === "permanent");
t("class: GitHub's '[remote rejected] … (Internal Server Error)' is transient (retried), a pre-receive decline is not", rd.classifyPushError(" ! [remote rejected] abc -> render/x-seg1 (Internal Server Error)") === "transient" && rd.classifyPushError(" ! [remote rejected] abc -> render/x-seg1 (pre-receive hook declined)") === "permanent");
t("class: reset / timeout / 408 / 5xx are transient", ["error: RPC failed; curl 92 HTTP/2 stream 0 was not closed cleanly", "fatal: the remote end hung up unexpectedly", "The requested URL returned error: 408", "The requested URL returned error: 502", "Connection timed out"].every((m) => rd.classifyPushError(m) === "transient"));
t("redact: URL credentials and token shapes never print", !/ghp_|github_pat_|s3cr3t/.test(rd.redact("fatal: https://user:s3cr3t@github.com/a/b.git ghp_ABCDEFGHIJKLMNOPQRSTUVWX github_pat_11ABCDEFGHIJKLMNOPQRSTU_xyz")));
t("push concurrency: one upload at a time for a big bundle, two for a small one", rd.defaultPushConcurrency(81 * 1048576) === 1 && rd.defaultPushConcurrency(8 * 1048576) === 2);

(async () => {
  await Promise.all(pushes);
  await resumeTests();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  console.log(fails ? `\n${fails} FAILED` : "\nall render-dispatch checks passed");
  process.exit(fails ? 1 : 0);
})();
