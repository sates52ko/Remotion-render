#!/usr/bin/env node
// judge's alignment check must know every word a frame prints. A Vox compare beat prints its two
// props.compareLabels (not emphasis); the-crucible final (2026-10-22): 4/25 correct descriptions such as
// "HIS FOCUS VS HIS DAUGHTER" were reported "not on this frame" and judge refused the sealed holdout.
// Runs mute-test.js judge in a temp root on a tiny Vox config.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${extra}` : ""}`); if (!ok) fail++; };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "mutealign-"));
fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "mute-test.js"), path.join(root, "scripts", "mute-test.js"));
for (const f of ["production-guard.js", "code-fingerprint.js", "next-step.js"]) fs.copyFileSync(path.join(__dirname, "lib", f), path.join(root, "scripts", "lib", f));
const slug = "align-book";
const B = path.join(root, "books", slug);
fs.mkdirSync(B, { recursive: true });
// 10 compare beats: kicker/emphasis are NOT what the frame shows; compareLabels are
const beats = Array.from({ length: 10 }, (_, k) => ({ id: `beat-${String(k + 1).padStart(3, "0")}`, type: "compare", fromFrame: k * 300, durationFrames: 300,
  props: { kicker: "CRISIS", emphasis: ["PR", "CATATONIC"], items: [], compareLabels: [`FOCUS${"ABCDEFGHIJ"[k]}LEFT`, `DAUGHTER${"ABCDEFGHIJ"[k]}RIGHT`] } }));
fs.writeFileSync(path.join(B, "config.vox.json"), JSON.stringify({ meta: {}, beats, captions: [] }));
const F = path.join(root, "audit", "mute", slug, "final");
fs.mkdirSync(F, { recursive: true });
const key = {}, blind = [];
beats.forEach((b, k) => {
  const img = `img-${String(k + 1).padStart(2, "0")}.png`;
  key[img] = `${b.id}-f${b.fromFrame + 200}.png`;
  blind.push({ img, text: `${b.props.compareLabels[0]} VS ${b.props.compareLabels[1]}`, sees: "two panels", message: "a contrast", confidence: "high", wouldConfuse: "none" });
});
fs.writeFileSync(path.join(F, "key.json"), JSON.stringify(key));
const judge = () => spawnSync(process.execPath, [path.join(root, "scripts", "mute-test.js"), "judge", `--slug=${slug}`, "--label=final"], { cwd: root, encoding: "utf8" });

fs.writeFileSync(path.join(F, "blind.json"), JSON.stringify(blind));
let r = judge();
t("compare frames described by their compareLabels pass the alignment check", r.status === 0 && fs.existsSync(path.join(F, "judge-input.json")) && !/misfiled|misaligned/.test(r.stdout + r.stderr), r.stderr);

// the check still bites: descriptions shifted by one image are refused
fs.rmSync(path.join(F, "judge-input.json"), { force: true });
fs.writeFileSync(path.join(F, "blind.json"), JSON.stringify(blind.map((d, k) => ({ ...blind[(k + 1) % blind.length], img: d.img }))));
r = judge();
t("misfiled compare descriptions are still refused", r.status !== 0 && /misaligned/.test(r.stderr) && !fs.existsSync(path.join(F, "judge-input.json")), r.stderr);

fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED` : "\nall mute-align checks passed");
process.exit(fail ? 1 : 0);
