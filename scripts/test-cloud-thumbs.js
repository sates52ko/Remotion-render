#!/usr/bin/env node
// Cloud thumbnails (2026-11-06, lib/cloud-thumbs.js + render-thumbnails.js --pack/--cloud + render-video.yml `thumbnails`):
// (A) finalization decisions: preview / frozen / opted out → nothing; current → skip; the assembly made them → install;
// else ONE thumbnail-only run; (B) the input hash = what the Thumb composition reads (hook, grammar, config, hero bytes),
// not the description, and the same on CRLF / reordered keys; (C) pack → verify → install on files: sha256 per file,
// stale inputs and tampering refused, B never relabelled as A, install writes ONLY the thumbnail paths; (D) the bundle
// carries code + book + Thumb assets and never narration audio; (E) the workflow: thumbnails once per film (after a
// verified assembly, or alone), read-only, continue-on-error, never in a segment run; the render job does not run in
// thumbnail-only mode; (F) the worker choice follows the split render's first segment.
// Run: node scripts/test-cloud-thumbs.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const CT = require("./lib/cloud-thumbs");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-thumbs-test-"));
const SLUG = "bk";

function makeBook(root, { engine = "antidote", hook = "WHO WROTE THE RULES?", description = "d1", crlf = false } = {}) {
  const b = path.join(root, "books", SLUG);
  fs.mkdirSync(b, { recursive: true });
  const meta = { title: "Book", author: "A. Author", description, thumbnail: { hook, grammar: { layout: "scene-still", textPos: "left", type: "condensed", treatment: "none", accent: "red" }, variants: [{ layout: "scene-still" }, { layout: "split" }, { layout: "type-only" }], image: engine === "vox" ? `scenes/${SLUG}/hero.png` : undefined } };
  const w = (f, o) => fs.writeFileSync(path.join(b, f), JSON.stringify(o, null, 2).replace(/\n/g, crlf ? "\r\n" : "\n"));
  w("youtube-meta.json", meta);
  w("book.json", { slug: SLUG, engine });
  w(engine === "antidote" ? "config.antidote.json" : "config.vox.json", { meta: { title: "Book", audio: `audio/${SLUG}.mastered.m4a` }, scenes: [{ id: 1 }] });
  fs.writeFileSync(path.join(b, "youtube.md"), "# Book\n\n## Upload checklist\n- x\n");
  return b;
}

// ── (A) decisions ────────────────────────────────────────────────────────────
const base = { mode: "PRODUCTION", published: false, noThumbnails: false, state: null, inputHash: "h1", filesOk: false, runHasThumbs: false };
t("plan: preview render → none (production finalization only)", CT.planThumbs({ ...base, mode: "PREVIEW-ONLY", runHasThumbs: true }).action === "none");
t("plan: published book → none (frozen)", CT.planThumbs({ ...base, published: true, runHasThumbs: true }).action === "none");
t("plan: --no-thumbnails → none", CT.planThumbs({ ...base, noThumbnails: true }).action === "none");
t("plan: installed for the same inputs, files intact → skip", CT.planThumbs({ ...base, state: { installed: true, inputHash: "h1" }, filesOk: true }).action === "skip");
t("plan: installed but a file changed/missing → not skipped", CT.planThumbs({ ...base, state: { installed: true, inputHash: "h1" }, filesOk: false }).action === "dispatch");
t("plan: the assembly run made them → install", CT.planThumbs({ ...base, runHasThumbs: true }).action === "install");
let p = CT.planThumbs({ ...base, state: { installed: true, inputHash: "h0" }, filesOk: true });
t("plan: inputs changed (new hook) → one thumbnail-only run, reason names it", p.action === "dispatch" && /inputs changed/.test(p.reason), JSON.stringify(p));

// ── (B) input hash ───────────────────────────────────────────────────────────
const r1 = path.join(tmp, "r1"), r2 = path.join(tmp, "r2"), r3 = path.join(tmp, "r3"), r4 = path.join(tmp, "r4");
makeBook(r1); makeBook(r2, { crlf: true, description: "a different description" }); makeBook(r3, { hook: "ANOTHER HOOK" }); makeBook(r4, { engine: "vox" });
t("hash: CRLF + a description edit do not change it", CT.thumbInputHash(r1, SLUG) === CT.thumbInputHash(r2, SLUG));
t("hash: a hook change does", CT.thumbInputHash(r1, SLUG) !== CT.thumbInputHash(r3, SLUG));
t("hash: canon is key-order independent", CT.canon({ a: 1, b: { c: 2, d: 3 } }) === CT.canon({ b: { d: 3, c: 2 }, a: 1 }));
fs.mkdirSync(path.join(r4, "public", "scenes", SLUG), { recursive: true });
fs.writeFileSync(path.join(r4, "public", "scenes", SLUG, "hero.png"), "hero-1");
const hv1 = CT.thumbInputHash(r4, SLUG);
fs.writeFileSync(path.join(r4, "public", "scenes", SLUG, "hero.png"), "hero-2");
t("hash: Vox hero image bytes are an input", hv1 !== CT.thumbInputHash(r4, SLUG));

// ── (C) pack → verify → install ──────────────────────────────────────────────
const runner = path.join(tmp, "runner");
makeBook(runner);
fs.mkdirSync(path.join(runner, "out"), { recursive: true });
const png = (f, s) => { fs.writeFileSync(path.join(runner, "out", f), s); return path.join(runner, "out", f); };
const jobs = [{ letter: "A", grammar: { layout: "scene-still" }, file: png(`thumbnail-${SLUG}.png`, "AAA") }, { letter: "B", grammar: { layout: "split" }, file: png(`thumbnail-${SLUG}-b.png`, "BBB") }, { letter: "C", grammar: { layout: "type-only" }, file: png(`thumbnail-${SLUG}-c.png`, "CCC") }];
fs.writeFileSync(path.join(runner, "books", SLUG, "thumbnail-check.json"), JSON.stringify({ slug: SLUG, hook: "WHO WROTE THE RULES?", variants: [] }));
const checks = jobs.map((j) => ({ letter: j.letter, hookVisible: true, detail: "ok" }));
const pack = path.join(tmp, "pack");
const rec = CT.writePack({ dir: pack, root: runner, slug: SLUG, jobs, checks, hook: "WHO WROTE THE RULES?", exitCode: 0 });
t("pack: 3 PNGs + thumbnail-check.json, each with a sha256", Object.keys(rec.files).length === 4 && rec.hookVisible === true && rec.inputHash === CT.thumbInputHash(runner, SLUG));
const book = path.join(tmp, "book");
makeBook(book);
const before = new Set(fs.readdirSync(book, { recursive: true }).map(String));
let v = CT.verifyPack({ dir: pack, slug: SLUG, inputHash: CT.thumbInputHash(book, SLUG) });
t("verify: a pack of the current inputs passes", v.ok, v.problems.join("; "));
const st = CT.installPack({ dir: pack, record: v.record, bookRoot: book, slug: SLUG, run: { id: 1 } });
const after = fs.readdirSync(book, { recursive: true }).map(String).filter((f) => !before.has(f)).map((f) => f.split(path.sep).join("/")).sort();
const allowed = ["out", `out/thumbnail-${SLUG}.png`, `out/thumbnail-${SLUG}-b.png`, `out/thumbnail-${SLUG}-c.png`, `books/${SLUG}/thumbnail-check.json`, `.render-github-thumbs.${SLUG}.json`];
t("install: writes ONLY the thumbnails, thumbnail-check.json and its own record", after.every((f) => allowed.includes(f)) && after.length === allowed.length, after.join(", "));
t("install: no render / cloud / split state, no youtube-ready", !after.some((f) => /render-github-(split|cloud|state)|youtube-ready|render-facts/.test(f)));
t("install: youtube.md gets the Test & Compare block (A/B/C)", /test-compare:start[\s\S]*\*\*A\*\*[\s\S]*\*\*C\*\*[\s\S]*test-compare:end/.test(fs.readFileSync(path.join(book, "books", SLUG, "youtube.md"), "utf8")));
t("install: state = installed, same inputs, files intact", st.installed && st.inputHash === rec.inputHash && CT.installedFilesOk(book, st));
fs.writeFileSync(path.join(book, "out", `thumbnail-${SLUG}-b.png`), "edited");
t("installed files: an edited PNG is detected", !CT.installedFilesOk(book, st));
v = CT.verifyPack({ dir: pack, slug: SLUG, inputHash: "something-else" });
t("verify: a pack of OTHER inputs is refused as STALE", !v.ok && v.problems.some((x) => /^STALE/.test(x)));
v = CT.verifyPack({ dir: pack, slug: "other", inputHash: rec.inputHash });
t("verify: another slug's pack is refused", !v.ok && v.problems.some((x) => /not other/.test(x)));
fs.writeFileSync(path.join(pack, `thumbnail-${SLUG}-c.png`), "tampered");
v = CT.verifyPack({ dir: pack, slug: SLUG, inputHash: rec.inputHash });
t("verify: a file that does not match its sha256 is refused", !v.ok && v.problems.some((x) => /sha256/.test(x)));
const evil = path.join(tmp, "evil");
fs.mkdirSync(evil);
fs.writeFileSync(path.join(evil, "record.json"), JSON.stringify({ ...rec, files: { ...rec.files, "../escape.png": "x" } }));
v = CT.verifyPack({ dir: evil, slug: SLUG, inputHash: rec.inputHash });
t("verify: a path outside the pack is refused", !v.ok && v.problems.some((x) => /unsafe/.test(x)));
const onlyB = path.join(tmp, "packB");
const recB = CT.writePack({ dir: onlyB, root: runner, slug: SLUG, jobs: [jobs[1]], checks: [], hook: "x", exitCode: 1 });
t("pack: when A failed, B keeps its own name (never relabelled as A)", Object.keys(recB.files).includes(`thumbnail-${SLUG}-b.png`) && !Object.keys(recB.files).includes(`thumbnail-${SLUG}.png`));
t("verify: a pack without A is refused", !CT.verifyPack({ dir: onlyB, slug: SLUG, inputHash: recB.inputHash }).ok);

// ── (D) bundle ───────────────────────────────────────────────────────────────
const vb = path.join(tmp, "voxbook");
makeBook(vb, { engine: "vox" });
fs.mkdirSync(path.join(vb, "public", "scenes", SLUG), { recursive: true });
fs.writeFileSync(path.join(vb, "public", "scenes", SLUG, "hero.png"), "hero");
fs.mkdirSync(path.join(vb, "public", "broll-ocean-tanker"), { recursive: true });
fs.writeFileSync(path.join(vb, "public", "broll-ocean-tanker", "mo-photoshop-background.png"), "bg");
fs.writeFileSync(path.join(vb, "books", SLUG, "narration-copy.m4a"), "audio");
const ROOT = path.join(__dirname, "..");
const bf = CT.thumbBundleFiles({ slug: SLUG, root: ROOT, bookRoot: vb });
const paths = bf.entries.map((e) => e.path);
t("bundle: no problems for a complete Vox book", !bf.problems.length, bf.problems.join("; "));
t("bundle: carries the renderer, the workflow, the Thumb source and the book", ["scripts/render-thumbnails.js", "scripts/render-cloud-assemble.js", ".github/workflows/render-video.yml", "src/Root.tsx", `books/${SLUG}/youtube-meta.json`, `books/${SLUG}/config.vox.json`].every((x) => paths.includes(x)));
t("bundle: the Vox hero + shared background, not the scene images", paths.includes(`public/scenes/${SLUG}/hero.png`) && paths.includes("public/broll-ocean-tanker/mo-photoshop-background.png"));
t("bundle: NEVER narration audio (it cannot render the film)", !paths.some((x) => /\.(m4a|mp3|aac|flac|ogg|opus)$/i.test(x)));
t("bundle: no credential file (render-accounts*.json, .env, .pem)", !paths.some((x) => /render-accounts[^/]*\.json$|(^|\/)\.env$|\.pem$/.test(x)));
fs.rmSync(path.join(vb, "public", "scenes", SLUG, "hero.png"));
t("bundle: a missing hero image is a named problem (refused, not a blank thumbnail)", CT.thumbBundleFiles({ slug: SLUG, root: ROOT, bookRoot: vb }).problems.some((x) => /hero\.png/.test(x)));

// Antidote: the hero is read only by a cinematic-bleed variant (grammar layout wins over the legacy thumbnail.layout)
const legacy = { image: "scenes/bk/thumbnail-hero.png", layout: "cinematic-bleed" };
t("hero (Antidote): a scene-still/text-poster grammar over a legacy cinematic-bleed layout needs NO hero (The Maze Runner)",
  CT.neededHeroAssets({ ...legacy, grammar: { layout: "scene-still" }, variants: [{ layout: "scene-still" }, { layout: "text-poster" }, { layout: "scene-still" }] }, "antidote", "bk").length === 0);
t("hero (Antidote): no grammar → the legacy cinematic-bleed layout applies → hero needed", CT.neededHeroAssets(legacy, "antidote", "bk").join() === "public/scenes/bk/thumbnail-hero.png");
t("hero (Antidote): one cinematic-bleed variant → the default hero path when the meta names none",
  CT.neededHeroAssets({ grammar: { layout: "scene-still" }, variants: [{ layout: "scene-still" }, { layout: "cinematic-bleed" }] }, "antidote", "bk").join() === "public/scenes/bk/thumbnail-hero.png");
t("hero (Vox): always the named hero + cut-out", CT.neededHeroAssets({ image: "a.png", cut: "b.png", grammar: { layout: "scene-still" } }, "vox", "bk").join() === "public/a.png,public/b.png");

// ── (E) workflow ─────────────────────────────────────────────────────────────
const wf = fs.readFileSync(path.join(ROOT, ".github", "workflows", "render-video.yml"), "utf8").replace(/\r\n/g, "\n");
const job = (name) => { const m = wf.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z_]+:\\n|$)`)); return m ? m[1] : ""; };
const th = job("thumbnails"), rj = job("render"), aj = job("assemble");
t("workflow: a `thumbnails` input (≤ 10 dispatch inputs)", /\n      thumbnails:\n/.test(wf) && (wf.match(/\n      [a-z_]+:\n        description:/g) || []).length <= 10);
t("workflow: thumbnails job runs after a SUCCESSFUL assembly, or alone (thumbnail-only)", /needs: assemble/.test(th) && /needs\.assemble\.result == 'success'/.test(th) && /assemble_manifest == ''/.test(th) && /thumbnails == 'true'/.test(th));
t("workflow: thumbnails job is read-only, uses no secret, cannot fail the run", /permissions:\n\s+contents: read/.test(th) && !/secrets\./.test(th) && /continue-on-error: true/.test(th) && /persist-credentials: false/.test(th));
t("workflow: thumbnails job runs render-thumbnails.js and uploads thumbs-<slug>", /render-thumbnails\.js --slug=.*--pack=/.test(th) && /name: thumbs-\$\{\{ github\.event\.inputs\.slug \}\}/.test(th));
t("workflow: thumbnail-only never renders the film", /thumbnails != 'true'/.test(rj.split("\n").find((l) => /^\s+if:/.test(l)) || ""));
t("workflow: in the render job, thumbnails only for a whole-film production run, after the film upload, never failing it", (() => {
  const i = rj.indexOf("Upload Video Artifact"), k = rj.indexOf("Render thumbnails A/B/C");
  const step = rj.slice(k, rj.indexOf("- name:", k + 10));
  return i > 0 && k > i && /seg == ''/.test(step) && /frames == ''/.test(step) && /preview_only != 'true'/.test(step) && /continue-on-error: true/.test(step);
})());
t("workflow: the assemble job is unchanged (manifest-gated, read-only)", /if: \$\{\{ github\.event\.inputs\.assemble_manifest != '' \}\}/.test(aj) && /contents: read\n\s+actions: read/.test(aj));

// ── (F) worker ───────────────────────────────────────────────────────────────
const acc = { workers: [{ id: "w1", username: "u1", repo: "R", token: "x" }, { id: "w2", username: "u2", repo: "R", token: "y" }, { id: "w3", username: "u3", repo: "R", token: "z", active: false }] };
const hb = path.join(tmp, "hostbook");
fs.mkdirSync(hb);
t("worker: no render recorded → the first active worker", CT.hostFor({ acc, bookRoot: hb, slug: SLUG }).id === "w1");
fs.writeFileSync(path.join(hb, `.render-github-split.${SLUG}.json`), JSON.stringify({ slug: SLUG, segments: [{ seg: 2, workerId: "w1" }, { seg: 1, workerId: "w2" }] }));
t("worker: the split render's FIRST segment's worker (cleanup covers it)", CT.hostFor({ acc, bookRoot: hb, slug: SLUG }).id === "w2");
t("worker: an explicit inactive worker is not used", CT.hostFor({ acc, bookRoot: hb, slug: SLUG, workerId: "w3" }) === null);
t("names: artifact thumbs-<slug>, ref render/<slug>-thumbs", CT.THUMBS_ARTIFACT(SLUG) === "thumbs-bk" && CT.thumbsRef(SLUG) === "render/bk-thumbs");

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
