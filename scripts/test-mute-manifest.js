#!/usr/bin/env node
// CLOUD MUTE-TEST FEASIBILITY (2026-10-30, P2.4, offline): the immutable input manifest of a sealed blind run must bind
// the verdict to the film (engine commit, config / render input, seal, every blind frame's hash) and keep the two
// sides apart (the describer gets frames + prompt — never the narration, the key or judge files; the judge gets text —
// never an image). Real case run read-only: the-magician-s-nephew run5 → verify OK, no leak, 60 calls.
// Run: node scripts/test-mute-manifest.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const { buildManifest, verifyManifest, leakCheck } = require("./lib/mute-manifest");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const W = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof x === "string" || Buffer.isBuffer(x) ? x : JSON.stringify(x, null, 2)); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mute-manifest-"));
try {
  const slug = "zz", label = "run1", D = path.join(tmp, "audit", "mute", slug, label), B = path.join(tmp, "books", slug);
  W(path.join(B, "config.vox.json"), { meta: { fps: 30, audio: "audio/zz.mp3", totalFrames: 90 }, beats: [{ id: "b1" }] });
  W(path.join(B, "production-base.json"), { productionBase: "a".repeat(40) });
  const ids = ["b1", "b2"];
  W(path.join(D, "sample.json"), ids.map((id) => ({ id, frame: 1 })));
  W(path.join(D, "seal.json"), { label, ids, idsSha256: sha(JSON.stringify(ids)), codeHead: "a".repeat(40) });
  W(path.join(D, "sample-meta.json"), { seed: 1 });
  W(path.join(D, "mute", "img-01.png"), Buffer.from("png-1")); W(path.join(D, "mute", "img-02.png"), Buffer.from("png-2"));
  W(path.join(D, "key.json"), { "img-01.png": "beat-001-f1.png", "img-02.png": "beat-002-f2.png" });
  const narr = "the old king walks into the dark forest and never comes back to the castle again";
  W(path.join(D, "judge-input.json"), [{ id: "item-01", narration: narr, V: {} }, { id: "item-02", narration: "a second moment", V: {} }]);
  W(path.join(D, "PROMPTS.md"), "## 1. Blind describer\nDescribe img-01.png and img-02.png. Do not open key.json.\n## 2. Then\n");
  const m = buildManifest({ root: tmp, slug, label });
  t("manifest binds engine, film identity, seal (verified), sample and every blind frame", m.engine.pin && m.film.configSha256 && m.film.renderInputHash && m.seal.verified && m.sample.n === 2 && m.frames.length === 2 && m.frames.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  t("describer bundle = frames only (no key, no judge file, no narration); judge bundle = text, 0 images", m.describer.inputs.every((x) => /^mute\/img-\d+\.png$/.test(x)) && m.describer.leak.ok && m.judge.images === 0 && m.judge.items === 2);
  t("the same run verifies (recomputed from disk, identical)", verifyManifest(m, { root: tmp }).ok);
  t("the manifest hash is stable for the same inputs", buildManifest({ root: tmp, slug, label }).manifestSha256 === m.manifestSha256);
  W(path.join(D, "mute", "img-02.png"), Buffer.from("png-2-TAMPERED"));
  let v = verifyManifest(m, { root: tmp });
  t("a changed blind frame → not the same run", !v.ok && v.diff.includes("blind frames (sha256)"), JSON.stringify(v.diff));
  W(path.join(D, "mute", "img-02.png"), Buffer.from("png-2"));
  W(path.join(B, "config.vox.json"), { meta: { fps: 30, audio: "audio/zz.mp3", totalFrames: 91 }, beats: [{ id: "b1" }] });
  v = verifyManifest(m, { root: tmp });
  t("a changed config → the film identity differs (the verdict does not carry)", !v.ok && v.diff.some((d) => /film identity/.test(d)));
  W(path.join(B, "config.vox.json"), { meta: { fps: 30, audio: "audio/zz.mp3", totalFrames: 90 }, beats: [{ id: "b1" }] });
  W(path.join(D, "seal.json"), { label, ids: ["b1", "zz"], idsSha256: sha(JSON.stringify(ids)) });
  t("a seal whose ids do not hash to its idsSha256 → not verified", !buildManifest({ root: tmp, slug, label }).seal.verified);
  W(path.join(D, "seal.json"), { label, ids, idsSha256: sha(JSON.stringify(ids)), codeHead: "a".repeat(40) });
  t("leak: an 8-word run of the narration in the describer prompt is caught", !leakCheck("Describe the image. Context: the old king walks into the dark forest and never comes back.", [narr]).ok);
  t("leak: a prompt that points the describer at judge-side files is caught", !leakCheck("Read key.json first, then describe.", [narr]).ok);
  t("leak: telling the describer NOT to open key.json is not a leak", leakCheck("Describe the images. Do not open key.json or any other file.", [narr]).ok);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} FAILED` : "\nall mute-manifest checks passed");
process.exit(failed ? 1 : 0);
