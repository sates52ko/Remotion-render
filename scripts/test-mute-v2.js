#!/usr/bin/env node
// mute-test v2 (2026-10-24): full frame, captions not drawn — a DIAGNOSTIC in its own tree. Checks: v2 refuses --seal
// and Vox; v2 tally writes only audit/mute-v2/ + books/<slug>/mute-test.v2.json (never mute-test.json, never the
// engine-outcomes ledger) and is never a verdict; a beat a v2 run showed is not fresh for a v1 holdout; a v2 draw never
// shows a v1 open-sealed beat; render-sequence-stills overrides only the captions. No rendering.
// Run: node scripts/test-mute-v2.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const ROOT = path.join(__dirname, "..");
const SLUG = `zz-mute-v2-test-${process.pid}`;
const BOOK = path.join(ROOT, "books", SLUG);
const V1 = path.join(ROOT, "audit", "mute", SLUG), V2 = path.join(ROOT, "audit", "mute-v2", SLUG);
const env = { ...process.env, PRODUCTION_GUARD: "off" };
const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, "mute-test.js"), ...a, `--slug=${SLUG}`], { cwd: ROOT, encoding: "utf8", env });
const W = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
const sha = (f) => (fs.existsSync(f) ? crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex") : null);
const LEDGER = path.join(ROOT, "data", "engine-outcomes.json");

// 40 scenes x 90 frames
const scenes = Array.from({ length: 40 }, (_, k) => ({ id: `scene-${String(k + 1).padStart(2, "0")}`, fromFrame: k * 90, durationFrames: 90 }));
try {
  W(path.join(BOOK, "config.antidote.json"), { meta: { fps: 30, audio: "audio/x.m4a" }, scenes, captions: [{ startFrame: 0, endFrame: 3600, text: "narration" }] });
  W(path.join(BOOK, "book.json"), { slug: SLUG, engine: "antidote" });

  // refusals
  let r = run("prep", "--label=v2a", "--method=v2", "--seal");
  t("v2 refuses --seal (never a verdict sample)", r.status !== 0 && /v2 is a diagnostic: no --seal/.test(r.stderr), r.stderr);
  r = run("prep", "--label=x", "--method=v3", "--dry");
  t("an unknown method is refused", r.status !== 0 && /only v1 \(default\) or v2/.test(r.stderr));

  // a v1 open seal is never drawn by v2
  r = run("prep", "--label=final", "--seal");
  const seal = JSON.parse(fs.readFileSync(path.join(V1, "final", "seal.json"), "utf8"));
  r = run("prep", "--label=v2a", "--method=v2", "--dry", "--n=10");
  const drawn = (r.stdout.match(/scene-\d+/g) || []);
  t("v2 never draws a beat of the open v1 seal", drawn.length > 0 && !drawn.some((id) => seal.ids.includes(id)), r.stdout.slice(-300) + r.stderr);

  // v2 sample counts as SEEN for a later v1 holdout
  W(path.join(V2, "diag1", "sample.json"), [{ id: "scene-03", frame: 270 }, { id: "scene-04", frame: 360 }]);
  r = run("prep", "--label=holdout2", "--dry", "--n=10");
  t("beats a v2 run showed are excluded from a v1 holdout draw", /excluding \d+ units earlier runs already showed/.test(r.stdout) && !/scene-03 f|scene-04 f/.test(r.stdout), r.stdout.slice(0, 400));

  // v2 tally: own files only, never a verdict, ledger untouched
  const L = path.join(V2, "diag1");
  W(path.join(L, "sample-meta.json"), { method: "v2", framesFrom: null, seed: 1, repeatedUnits: 0 });
  W(path.join(L, "judge-key.json"), { "item-01": { frame: 270 }, "item-02": { frame: 360 } });
  W(path.join(L, "judge-input.json"), [{ id: "item-01", t: "9s" }, { id: "item-02", t: "12s" }]);
  W(path.join(L, "judge-result.json"), { items: [
    { id: "item-01", V: { correctness: "CORRECT", why: "w", contribution: "ADDS", whyC: "c", explains: "YES" } },
    { id: "item-02", V: { correctness: "CORRECT", why: "w", contribution: "ADDS", whyC: "c", explains: "NO" } }] });
  const ledgerBefore = sha(LEDGER);
  r = run("tally", "--label=diag1", "--method=v2");
  const totals = JSON.parse(fs.readFileSync(path.join(L, "totals.json"), "utf8"));
  t("v2 tally: totals marked v2, verdict false even on a PASS", totals.method === "v2" && totals.pass === true && totals.verdict === false, JSON.stringify(totals).slice(0, 300));
  t("v2 tally: written to books/<slug>/mute-test.v2.json", fs.existsSync(path.join(BOOK, "mute-test.v2.json")) && /\[v2 diagnostic\]/.test(r.stdout), r.stdout + r.stderr);
  t("v2 tally: books/<slug>/mute-test.json NOT touched (preview-ready / preview-state never see v2)", !fs.existsSync(path.join(BOOK, "mute-test.json")));
  t("v2 tally: engine-outcomes ledger NOT touched", sha(LEDGER) === ledgerBefore);

  // render-sequence-stills: captions are the only override, Antidote only
  const rs = fs.readFileSync(path.join(__dirname, "render-sequence-stills.js"), "utf8");
  t("stills: --no-captions overrides captions only, via inputProps on both select + render", /inputProps = args\["no-captions"\] \? \{ config: \{ \.\.\.config, captions: \[\] \} \}/.test(rs) && (rs.match(/\.\.\.\(inputProps \? \{ inputProps \} : \{\}\)/g) || []).length === 2);
  const mt = fs.readFileSync(path.join(__dirname, "mute-test.js"), "utf8");
  t("v1 path unchanged: still cropped at ih*0.76, still written to mute-test.json", /crop=iw:ih\*0\.76:0:0/.test(mt) && /"mute-test\.json"/.test(mt));
} finally {
  for (const d of [BOOK, V1, V2]) fs.rmSync(d, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall mute-v2 tests passed");
process.exit(failed ? 1 : 0);
