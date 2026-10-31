#!/usr/bin/env node
// Tests for scripts/lib/render-input.js and the render-input binding in scripts/lib/render-preflight.js:
// an accepted quality-debt decision survives the runner's own `master-audio --update-config` rewrite, and
// nothing else. Also the runner's fail-closed mastered-audio check. No Remotion, no network, no GitHub.
//
// Real example (2026-10-23, icebreaker): local config 67244c9ab51fb08c, runner config be58ed93dfcdb3b2. Point
// RENDER_INPUT_REAL_CONFIG at that local config (read-only) to replay it; otherwise a fixture of the same shape runs.
// Exit 1 on any failure.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { masteredAudioPath, renderInputHash, withAudio } = require("./lib/render-input");
const pre = require("./lib/render-preflight");
const { MODE, evaluate, configHash, inputHashOf, findingKey, recordDecision, loadDecisions, checkMasteredAudio } = pre;

let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${extra}` : ""}`); if (!ok) fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-input-"));
const write = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };

// The two transport rewrites, exactly as the code does them.
const bundleRewrite = (text) => { const c = JSON.parse(text); return /\.mastered\.m4a$/.test(c.meta.audio) ? JSON.stringify({ ...c, meta: { ...c.meta, audio: c.meta.audio.replace(/\.mastered\.m4a$/, ".m4a") } }, null, 2) : text; }; // render-bundle.js
const runnerRewrite = (text) => { const c = JSON.parse(text); return withAudio(text, masteredAudioPath(c.meta.audio)).text; }; // master-audio --update-config

// 1. Naming rule = master-audio's old inline rule
t("masteredAudioPath: x.m4a -> x.mastered.m4a", masteredAudioPath("audio/x.m4a") === "audio/x.mastered.m4a");
t("masteredAudioPath: x.mp3 -> x.mastered.m4a", masteredAudioPath("audio/x.mp3") === "audio/x.mastered.m4a");
t("masteredAudioPath: mastered stays", masteredAudioPath("audio/x.mastered.m4a") === "audio/x.mastered.m4a");
// an MP3 book: the bundle ships audio/x.mp3, the runner masters it to x.mastered.m4a — one render input, one decision
t("render-input hash: an .mp3 raw and its master are the same input", renderInputHash({ meta: { audio: "audio/x.mp3" } }) === renderInputHash({ meta: { audio: "audio/x.mastered.m4a" } }));

// 2. The real hash change
const realFile = process.env.RENDER_INPUT_REAL_CONFIG;
if (realFile && fs.existsSync(realFile)) {
  const local = fs.readFileSync(realFile, "utf8");
  const runner = runnerRewrite(bundleRewrite(local));
  const lf = write("real/local.json", local), rf = write("real/runner.json", runner);
  console.log(`  real config ${realFile}: bytes ${configHash(lf)} -> ${configHash(rf)}`);
  t("real: bytes change on the runner (the bug)", configHash(lf) !== configHash(rf));
  t("real: render-input hash is identical across bundle + master", inputHashOf(lf) === inputHashOf(rf), `${inputHashOf(lf)} vs ${inputHashOf(rf)}`);
  if (configHash(lf) === "67244c9ab51fb08c") t("real: icebreaker runner bytes reproduce be58ed93dfcdb3b2", configHash(rf) === "be58ed93dfcdb3b2", configHash(rf));
} else console.log("  (RENDER_INPUT_REAL_CONFIG not set — real-config replay skipped; fixture below)");

// 3. Fixture of the same shape: raw audio, trailing newline (local) / mastered local audio
const base = { meta: { fps: 30, audio: "audio/book.m4a", totalFrames: 900 }, scenes: [{ id: "s1", shot: "medium", fromFrame: 0, durationFrames: 900, caption: "A" }] };
const localRaw = JSON.stringify(base, null, 2) + "\n";
const localMastered = JSON.stringify({ ...base, meta: { ...base.meta, audio: "audio/book.mastered.m4a" } }, null, 2) + "\n";
for (const [name, local] of [["raw-audio local", localRaw], ["mastered-audio local", localMastered]]) {
  const runner = runnerRewrite(bundleRewrite(local));
  const lf = write(`${name}/local.json`, local), rf = write(`${name}/runner.json`, runner);
  t(`${name}: bytes differ, render input equal`, configHash(lf) !== configHash(rf) && inputHashOf(lf) === inputHashOf(rf));
}
t("formatting only (indent, trailing newline) -> same render input", renderInputHash(JSON.parse(JSON.stringify(base))) === renderInputHash(JSON.parse(JSON.stringify(base, null, 4) + "\n\n")));

// 4. Everything else is a different render input
const h0 = renderInputHash(base);
const mut = (f) => { const c = JSON.parse(JSON.stringify(base)); f(c); return renderInputHash(c); };
t("other audio source -> different", mut((c) => { c.meta.audio = "audio/other.m4a"; }) !== h0);
t("other audio source, mastered -> different", mut((c) => { c.meta.audio = "audio/other.mastered.m4a"; }) !== h0);
t("visual change (shot) -> different", mut((c) => { c.scenes[0].shot = "wide"; }) !== h0);
t("timing change -> different", mut((c) => { c.scenes[0].durationFrames = 899; }) !== h0);
t("caption text change -> different", mut((c) => { c.scenes[0].caption = "B"; }) !== h0);
t("added field -> different", mut((c) => { c.scenes[0].extra = 1; }) !== h0);
t("fps change -> different", mut((c) => { c.meta.fps = 25; }) !== h0);

// 5. Decision binding (evaluate)
const rev = (m) => ({ reasonCode: "FALLBACK_LEVER", message: m, outcome: "REVIEW" });
const v = [rev("a"), rev("b")];
const keys = v.map((x) => ({ key: findingKey(x), reasonCode: x.reasonCode, message: x.message, outcome: x.outcome }));
const fw = { status: "FAIL", blocks: 0, reviews: 2, keys };
const dk = keys.map(({ key, reasonCode, message }) => ({ key, reasonCode, message }));
const lf = write("bind/local.json", localRaw), rf = write("bind/runner.json", runnerRewrite(bundleRewrite(localRaw)));
const L = { hash: configHash(lf), inputHash: inputHashOf(lf) }, R = { hash: configHash(rf), inputHash: inputHashOf(rf) };
const newDec = [{ configHash: L.hash, renderInputHash: L.inputHash, keys: dk }];
const oldDec = [{ configHash: L.hash, keys: dk }];
const ok = (d, side) => evaluate({ mode: MODE.PRODUCTION, firewall: fw, hash: side.hash, inputHash: side.inputHash, decisions: d });
t("new decision accepted locally", ok(newDec, L).decision === "ACCEPTED_DEBT");
t("new decision accepted on the runner after master-audio (the fix)", ok(newDec, R).decision === "ACCEPTED_DEBT");
t("old byte-only decision: local still accepted", ok(oldDec, L).decision === "ACCEPTED_DEBT");
t("old byte-only decision: NOT carried to the runner config (no silent migration)", ok(oldDec, R).decision === "REFUSED");
const changed = write("bind/changed.json", JSON.stringify({ ...base, scenes: [{ ...base.scenes[0], shot: "wide" }] }, null, 2));
t("new decision + changed visual config -> REFUSED", ok(newDec, { hash: configHash(changed), inputHash: inputHashOf(changed) }).decision === "REFUSED");
const otherAudio = write("bind/other-audio.json", JSON.stringify({ ...base, meta: { ...base.meta, audio: "audio/other.mastered.m4a" } }, null, 2));
t("new decision + different audio source -> REFUSED", ok(newDec, { hash: configHash(otherAudio), inputHash: inputHashOf(otherAudio) }).decision === "REFUSED");
t("no decision -> REFUSED", ok([], R).decision === "REFUSED");
t("new finding on an accepted config -> REFUSED", evaluate({ mode: MODE.PRODUCTION, firewall: { ...fw, reviews: 3, keys: keys.concat([{ key: findingKey(rev("c")), reasonCode: "FALLBACK_LEVER", message: "c", outcome: "REVIEW" }]) }, ...R, decisions: newDec }).decision === "REFUSED");
t("unreadable config (no render-input hash) never matches a new decision", ok(newDec, { hash: L.hash, inputHash: null }).decision === "REFUSED");

// 6. recordDecision stores both hashes; old entries untouched
fs.mkdirSync(path.join(tmp, "books", "bk"), { recursive: true });
recordDecision(tmp, "bk", { hash: L.hash, commit: "c0", reason: "old", keys: dk });
recordDecision(tmp, "bk", { hash: L.hash, inputHash: L.inputHash, commit: "c1", reason: "new", keys: dk });
const ds = loadDecisions(tmp, "bk");
t("recordDecision: old-style entry has no renderInputHash", ds[0].renderInputHash === undefined);
t("recordDecision: new entry binds byte + render-input hash", ds[1].configHash === L.hash && ds[1].renderInputHash === L.inputHash);

// 7. Runner mastered-audio check (fail closed)
const croot = path.join(tmp, "audio-root");
const cfgRel = "books/bk/config.vox.json";
const setCfg = (audio) => { fs.mkdirSync(path.join(croot, "books", "bk"), { recursive: true }); fs.writeFileSync(path.join(croot, cfgRel), JSON.stringify({ meta: audio === undefined ? {} : { audio } })); };
const pub = (rel, bytes = "x") => { const f = path.join(croot, "public", rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); };
const probe = (d) => (f) => (/\.mastered\./.test(f) ? d.m : d.r);
setCfg(undefined);
t("audio check: no meta.audio -> STOP", !checkMasteredAudio({ root: croot, configFile: cfgRel, probe: probe({ m: 1, r: 1 }) }).ok);
setCfg("audio/bk.m4a"); pub("audio/bk.m4a");
t("audio check: raw path (master step did not repoint) -> STOP", !checkMasteredAudio({ root: croot, configFile: cfgRel, probe: probe({ m: 1, r: 1 }) }).ok);
setCfg("audio/bk.mastered.m4a");
t("audio check: mastered file missing -> STOP", !checkMasteredAudio({ root: croot, configFile: cfgRel, probe: probe({ m: 1, r: 1 }) }).ok);
pub("audio/bk.mastered.m4a", "");
t("audio check: mastered file empty -> STOP", !checkMasteredAudio({ root: croot, configFile: cfgRel, probe: probe({ m: 1, r: 1 }) }).ok);
pub("audio/bk.mastered.m4a", "x");
t("audio check: duration drift > 0.1 s -> STOP", !checkMasteredAudio({ root: croot, configFile: cfgRel, probe: probe({ m: 10.3, r: 10 }) }).ok);
t("audio check: unreadable duration -> STOP", !checkMasteredAudio({ root: croot, configFile: cfgRel, probe: () => null }).ok);
t("audio check: mastered, present, same length -> OK", checkMasteredAudio({ root: croot, configFile: cfgRel, probe: probe({ m: 10.04, r: 10 }) }).ok);
fs.rmSync(path.join(croot, "public", "audio", "bk.m4a"));
t("audio check: raw source missing -> STOP", !checkMasteredAudio({ root: croot, configFile: cfgRel, probe: probe({ m: 1, r: 1 }) }).ok);

// 7b. Same check with real ffprobe on real files
const haveFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
if (haveFfmpeg) {
  const mk = (rel, secs) => { const f = path.join(croot, "public", rel); spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", String(secs), "-c:a", "aac", f]); };
  mk("audio/bk.m4a", 2); mk("audio/bk.mastered.m4a", 2);
  t("audio check (ffprobe): equal-length real files -> OK", checkMasteredAudio({ root: croot, configFile: cfgRel }).ok);
  mk("audio/bk.mastered.m4a", 3);
  t("audio check (ffprobe): 1 s longer master -> STOP", !checkMasteredAudio({ root: croot, configFile: cfgRel }).ok);
} else console.log("  (ffmpeg not on PATH — real-file audio check skipped)");

// 8. preflight() end to end: the audio blocker reaches the result; off by default
setCfg("audio/bk.m4a");
fs.writeFileSync(path.join(croot, "public", "audio", "bk.m4a"), "x");
// preview READY for this render input (2026-10-28: production also needs the preview fact) — this test is about audio
fs.writeFileSync(path.join(croot, "books", "bk", "preview-ready.json"), JSON.stringify({ ready: true, renderInputHash: pre.inputHashOf(path.join(croot, cfgRel)) }));
const quiet = console.log; console.log = () => {};
const runnerPre = pre.preflight({ root: croot, slug: "bk", engine: "vox", method: "local", mode: MODE.PRODUCTION, configFile: cfgRel, requireMasteredAudio: true, probe: probe({ m: 1, r: 1 }) });
const localPre = pre.preflight({ root: croot, slug: "bk", engine: "vox", method: "local", mode: MODE.PRODUCTION, configFile: cfgRel });
console.log = quiet;
t("preflight on the runner: raw audio -> STOP", runnerPre.ok === false);
t("preflight off the runner: no audio requirement (unchanged)", localPre.ok === true);
t("facts record carries the render-input hash", !!(runnerPre.record && runnerPre.record.renderInputHash));
// 2026-10-28: the RUNNER never re-judges the preview — a GO render whose preview-ready.json predates renderInputHash
// (byte hash only; the runner rewrites the config bytes) must not fail on the worker. Authorization was decided before
// the push, by the operator's preflight.
setCfg("audio/bk.mastered.m4a"); pub("audio/bk.m4a"); pub("audio/bk.mastered.m4a", "x");
fs.writeFileSync(path.join(croot, "books", "bk", "preview-ready.json"), JSON.stringify({ ready: true, configSha256: "0".repeat(64) }));
console.log = () => {};
const runnerOk = pre.preflight({ root: croot, slug: "bk", engine: "vox", method: "local", mode: MODE.PRODUCTION, configFile: cfgRel, requireMasteredAudio: true, probe: probe({ m: 10.02, r: 10 }) });
const localStale = pre.preflight({ root: croot, slug: "bk", engine: "vox", method: "local", mode: MODE.PRODUCTION, configFile: cfgRel });
console.log = quiet;
t("runner: a stale/old-format preview record never stops the worker (authorization was decided before the push)", runnerOk.ok === true);
t("operator's machine: the same stale preview record stops a production render (no automatic production on NOT READY/STALE)", localStale.ok === false);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
