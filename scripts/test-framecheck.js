#!/usr/bin/env node
// Offline tests for framecheck.js, lib/frame-risk.js and similar-candidates.js (no render, no LLM).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const S = __dirname;
let fail = 0;
const t = (name, ok) => { console.log(`${ok ? "✓" : "✗"} ${name}`); if (!ok) fail++; };
const run = (script, argv, root) => spawnSync(process.execPath, [path.join(S, script), ...argv, `--root=${root}`], { encoding: "utf8" });

// 1) framecheck photographs the same moment as the mute test
const body = (file) => { const src = fs.readFileSync(path.join(S, file), "utf8").replace(/\r\n/g, "\n"); const m = src.match(/function sampleFrame\(u\) \{[\s\S]*?\n\}/); return m && m[0]; };
t("sampleFrame is identical in framecheck.js and mute-test.js", body("framecheck.js") && body("framecheck.js") === body("mute-test.js"));

// 2) risk flags
const { risks, selectionFlags } = require("./lib/frame-risk");
const R = { chains: { reads: "bound", neverFor: "links" } };
t("bare figure is flagged", risks({ characters: [{ expression: "neutral" }] }).includes("bare"));
t("an icon makes it not bare", !risks({ characters: [{}], concept: "phone" }).includes("bare"));
t("a measured-misread icon is reported", risks({ characters: [{}], props: [{ type: "chains" }] }, R).includes("icon:chains"));
t("strike text is flagged", risks({ texts: [{ style: "strike" }] }).includes("strike"));
t("worried face over relief narration is a polarity flag", risks({ characters: [{ expression: "worried" }], concept: "x", _narration: "and finally the relief came" }).includes("polarity:worried"));
t("selection uses only measured flags (bare, strike)", selectionFlags({ characters: [{ expression: "worried" }], props: [{ type: "chains" }], _narration: "finally relief" }, R).length === 0);

// fixture book
const root = fs.mkdtempSync(path.join(os.tmpdir(), "framecheck-"));
const slug = "fixture-book";
fs.mkdirSync(path.join(root, "books", slug), { recursive: true });
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "icon-readings.json"), JSON.stringify({ icons: R }));
const scene = (k, extra) => ({ id: `scene-${String(k).padStart(2, "0")}`, fromFrame: k * 300, durationFrames: 300, _narration: `beat ${k} narration`, ...extra });
const scenes = [
  scene(1, { shot: "medium", characters: [{ identity: "everyman", expression: "neutral", action: "talk" }], texts: [{ text: "SAYING NO KINDLY", at: 40 }] }),
  scene(2, { shot: "medium", characters: [{ identity: "everyman", expression: "neutral", action: "talk" }], texts: [{ text: "GUILT LINGERS LONG", at: 40 }] }),
  scene(3, { shot: "medium", characters: [{ identity: "everyman", expression: "neutral", action: "talk" }] }),
  scene(4, { shot: "illustration", concept: "phone", characters: [{ identity: "everyman", expression: "worried", action: "slump" }], texts: [{ text: "NOT ALTRUISTIC", style: "strike", at: 100 }] }),
  scene(5, { shot: "insert", concept: "shield", characters: [] }),
];
const cfg = { meta: {}, scenes, captions: scenes.map((s) => ({ startFrame: s.fromFrame, endFrame: s.fromFrame + 290, text: s._narration })) };
fs.writeFileSync(path.join(root, "books", slug, "config.antidote.json"), JSON.stringify(cfg));

// 3) prep --dry: every beat by default; --n picks flagged beats + control
let r = run("framecheck.js", ["prep", `--slug=${slug}`, "--dry"], root);
t("prep --dry looks at every beat by default", r.status === 0 && /dry: 5 beats/.test(r.stdout));
r = run("framecheck.js", ["prep", `--slug=${slug}`, "--dry", "--n=2", "--control=1"], root);
t("prep --dry --n=2 --control=1 picks 3 beats", r.status === 0 && /dry: 3 beats/.test(r.stdout) && (r.stdout.match(/ risk /g) || []).length === 2 && /control/.test(r.stdout));
r = run("framecheck.js", ["prep", `--slug=${slug}`, "--dry", "--beats=scene-99"], root);
t("prep refuses an unknown beat id", r.status !== 0);
// sealed final holdout: development checks never look at its beats
fs.mkdirSync(path.join(root, "audit", "mute", slug, "final"), { recursive: true });
fs.writeFileSync(path.join(root, "audit", "mute", slug, "final", "sample.json"), JSON.stringify([{ id: "scene-01", frame: 210 }, { id: "scene-04", frame: 1110 }]));
r = run("framecheck.js", ["prep", `--slug=${slug}`, "--dry", "--exclude-from=final"], root);
t("--exclude-from=<sealed label> drops the sealed holdout beats", r.status === 0 && /dry: 3 beats/.test(r.stdout) && !/scene-01 /.test(r.stdout) && !/scene-04 /.test(r.stdout));
r = run("framecheck.js", ["prep", `--slug=${slug}`, "--dry", "--exclude-from=final", "--beats=scene-01"], root);
t("--exclude-from refuses to look at a sealed beat on purpose", r.status !== 0 && /sealed holdout/.test(r.stderr));
// an open seal (seal.json, no totals.json) is excluded even when --exclude-from is forgotten
fs.writeFileSync(path.join(root, "audit", "mute", slug, "final", "seal.json"), JSON.stringify({ label: "final", ids: ["scene-01", "scene-04"] }));
r = run("framecheck.js", ["prep", `--slug=${slug}`, "--dry"], root);
t("an open seal is excluded without --exclude-from", r.status === 0 && /dry: 3 beats/.test(r.stdout) && /seal final/.test(r.stdout));
fs.writeFileSync(path.join(root, "audit", "mute", slug, "final", "totals.json"), "{}");
r = run("framecheck.js", ["prep", `--slug=${slug}`, "--dry"], root);
t("a tallied (closed) seal no longer excludes", r.status === 0 && /dry: 5 beats/.test(r.stdout));
fs.rmSync(path.join(root, "audit", "mute"), { recursive: true, force: true });

// 4) judge + tally on a hand-made run (stills skipped)
const OUT = path.join(root, "audit", "framecheck", slug, "fc1");
fs.mkdirSync(OUT, { recursive: true });
const frameOf = (s) => s.fromFrame + 210;
const sample = scenes.map((s) => ({ id: s.id, group: "all", reasons: risks(s, R), frame: frameOf(s) }));
fs.writeFileSync(path.join(OUT, "sample.json"), JSON.stringify(sample));
const key = Object.fromEntries(sample.map((s, k) => [`img-${String(k + 1).padStart(3, "0")}.png`, `${s.id}-f${s.frame}.png`]));
fs.writeFileSync(path.join(OUT, "key.json"), JSON.stringify(key));
fs.writeFileSync(path.join(OUT, "chunks.json"), JSON.stringify([Object.keys(key).slice(0, 3), Object.keys(key).slice(3)]));
const desc = (img, text) => ({ img, text, sees: "a man talking", message: "m", confidence: "low", wouldConfuse: "none" });
fs.writeFileSync(path.join(OUT, "blind-1.json"), JSON.stringify([desc("img-001.png", "SAYING NO KINDLY"), desc("img-002.png", "GUILT LINGERS LONG"), desc("img-003.png", "none")]));
r = run("framecheck.js", ["judge", `--slug=${slug}`, "--label=fc1"], root);
t("judge refuses while a describer chunk is missing", r.status !== 0 && /blind-2\.json missing/.test(r.stderr));
fs.writeFileSync(path.join(OUT, "blind-2.json"), JSON.stringify([desc("img-004.png", "NOT ALTRUISTIC"), desc("img-005.png", "none")]));
r = run("framecheck.js", ["prep", `--slug=${slug}`, "--label=fc1"], root);
t("prep refuses to overwrite an existing label", r.status !== 0 && /use a new --label/.test(r.stderr));
// misfiled descriptions are rejected (text of one frame filed under another)
fs.writeFileSync(path.join(OUT, "blind-1.json"), JSON.stringify([desc("img-001.png", "GUILT LINGERS LONG"), desc("img-002.png", "SAYING NO KINDLY"), desc("img-003.png", "none")]));
r = run("framecheck.js", ["judge", `--slug=${slug}`, "--label=fc1"], root);
t("judge rejects descriptions filed under the wrong images", r.status !== 0 && /wrong images/.test(r.stderr));
fs.writeFileSync(path.join(OUT, "blind-1.json"), JSON.stringify([desc("img-001.png", "SAYING NO KINDLY"), desc("img-002.png", "GUILT LINGERS LONG"), desc("img-003.png", "none")]));
r = run("framecheck.js", ["judge", `--slug=${slug}`, "--label=fc1", "--chunk=5"], root);
t("judge writes chunked judge inputs", r.status === 0 && fs.existsSync(path.join(OUT, "judge-input-1.json")));
const jk = JSON.parse(fs.readFileSync(path.join(OUT, "judge-key.json"), "utf8"));
const verdictFor = (f) => (f === frameOf(scenes[1]) ? ["WRONG", "NONE"] : f === frameOf(scenes[2]) ? ["NEUTRAL", "NONE"] : ["CORRECT", "ADDS"]);
const items = Object.entries(jk).map(([id, k]) => { const [c, b] = verdictFor(k.frame); return { id, V: { correctness: c, why: "w", contribution: b, whyC: "c", explains: "NO" } }; });
fs.writeFileSync(path.join(OUT, "judge-result-1.json"), JSON.stringify({ items: items.slice(0, 4) }));
r = run("framecheck.js", ["tally", `--slug=${slug}`, "--label=fc1"], root);
t("tally warns about an incomplete judge coverage", r.status === 0 && /1\/5 items have no judge verdict/.test(r.stderr + r.stdout));
fs.writeFileSync(path.join(OUT, "judge-result-1.json"), JSON.stringify({ items }));
r = run("framecheck.js", ["tally", `--slug=${slug}`, "--label=fc1"], root);
const rep = JSON.parse(fs.readFileSync(path.join(OUT, "report.json"), "utf8"));
t("tally reports findings by beat and never a verdict", r.status === 0 && rep.verdict === null && rep.reportOnly === true && rep.findings.map((f) => f.scene).sort().join() === "scene-02,scene-03");
t("tally writes the book's framecheck history", JSON.parse(fs.readFileSync(path.join(root, "books", slug, "framecheck.json"), "utf8")).runs.length === 1);
t("framecheck never writes mute-test.json or the config", !fs.existsSync(path.join(root, "books", slug, "mute-test.json")) && JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "books", slug, "config.antidote.json"), "utf8"))) === JSON.stringify(cfg));

// 5) similar-candidates from a mute finding
const M = path.join(root, "audit", "mute", slug, "run1");
fs.mkdirSync(M, { recursive: true });
fs.writeFileSync(path.join(M, "judge-key.json"), JSON.stringify({ "item-01": { frame: frameOf(scenes[1]) }, "item-02": { frame: frameOf(scenes[0]) } }));
fs.writeFileSync(path.join(M, "judge-input.json"), JSON.stringify([{ id: "item-01", narration: "n", V: { sees: "a smiling man talking" } }, { id: "item-02", narration: "n", V: { sees: "a calm man" } }]));
fs.writeFileSync(path.join(M, "judge-result.json"), JSON.stringify({ items: [{ id: "item-01", V: { correctness: "WRONG", contribution: "NONE", why: "smile over guilt" } }, { id: "item-02", V: { correctness: "CORRECT", contribution: "ADDS", why: "ok" } }] }));
r = run("similar-candidates.js", [`--slug=${slug}`, "--source=mute"], root);
const cdir = path.join(root, "audit", "candidates", slug);
const cand = fs.existsSync(cdir) ? JSON.parse(fs.readFileSync(path.join(cdir, fs.readdirSync(cdir)[0]), "utf8")) : null;
const f0 = cand && cand.findings[0];
t("candidates: one finding from the WRONG item", r.status === 0 && cand && cand.findings.length === 1 && f0.scene === "scene-02");
t("candidates: same staging is tier A (scene-01, scene-03)", f0 && f0.candidates.A.map((c) => c.scene).sort().join() === "scene-01,scene-03");
t("candidates: a judged-CORRECT twin counts as counter-evidence", f0 && f0.sameStagingJudged.correct === 1);
t("candidates: the unjudged twin is the one to look at first", f0 && f0.reviewBeats.join() === "scene-03");
t("candidates: report-only, nothing confirmed", cand && cand.reportOnly === true);
t("candidates: neutral face read as a smile is counted", cand && cand.faceReadability.misread === 1);

fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
