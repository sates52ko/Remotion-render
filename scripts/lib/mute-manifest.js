/**
 * mute-manifest.js — the IMMUTABLE INPUT MANIFEST of one sealed blind mute run, for running its describer and judge
 * somewhere else (a GitHub job) without losing what makes the verdict valid (2026-10-30, P2.4 feasibility; offline —
 * no model is called here).
 *
 * What travels, what must not:
 *   describer bundle = the blind frames (mute/img-NN.png) + the describer prompt. NEVER the narration, key.json, the
 *                      judge files or the book. The prompt is checked for narration leakage (8-word shingles).
 *   judge bundle     = judge-input.json (narration + blind descriptions). NEVER an image or key.json.
 * What binds the result to the film: the engine commit, the config bytes + render input, the seal (ids hash
 * re-verified), the frame identity (each blind frame's sha256, and key.json's sha256 kept judge-side only).
 * verifyManifest() recomputes everything; any drift → not the same run. Read-only on the book.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const canon = (o) => JSON.stringify(o, Object.keys(o).sort());
const words = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
function shingles(text, k = 8) { const w = words(text), out = new Set(); for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(" ")); return out; }

function describerPrompt(dir) {
  const p = fs.existsSync(path.join(dir, "PROMPTS.md")) ? fs.readFileSync(path.join(dir, "PROMPTS.md"), "utf8") : "";
  const m = p.match(/## 1\.[\s\S]*?(?=\n## 2\.|$)/);
  return m ? m[0] : "";
}

/** narration leakage into the describer's prompt: 8-word shingles shared with the narration the judge will see */
function leakCheck(prompt, narrations) {
  const ps = shingles(prompt);
  const hits = [];
  for (const n of narrations) for (const s of shingles(n)) if (ps.has(s)) { hits.push(s); if (hits.length >= 5) break; }
  const forbiddenRefs = /(key\.json|judge-key|judge-input|judge-result|books[\\/]|config\.(vox|antidote)\.json|story-bible|art\.json|designs\.json)/i.test(prompt.replace(/Do not (read|open)[^\n]*/gi, "").replace(/never [^\n]*/gi, ""));
  return { ok: hits.length === 0 && !forbiddenRefs, shingleHits: hits, forbiddenRefs };
}

function buildManifest({ root, slug, label, now = new Date() }) {
  const dir = path.join(root, "audit", "mute", slug, label);
  const book = path.join(root, "books", slug);
  if (!fs.existsSync(path.join(dir, "sample.json"))) throw new Error(`no mute label ${slug}/${label}`);
  const cfgFile = ["config.antidote.json", "config.vox.json"].map((f) => path.join(book, f)).find((f) => fs.existsSync(f)) || null;
  const meta = readJSON(path.join(dir, "sample-meta.json"), {}) || {};
  const seal = readJSON(path.join(dir, "seal.json"), null);
  const sample = readJSON(path.join(dir, "sample.json"), []) || [];
  const blindDir = path.join(dir, "mute");
  const imgs = fs.existsSync(blindDir) ? fs.readdirSync(blindDir).filter((f) => /^img-\d+\.png$/.test(f)).sort() : [];
  const frames = imgs.map((f) => { const b = fs.readFileSync(path.join(blindDir, f)); return { img: f, sha256: sha(b), bytes: b.length }; });
  let renderInputHash = null; try { renderInputHash = cfgFile ? require("./render-preflight").inputHashOf(cfgFile) : null; } catch {}
  let stills16 = null; try { stills16 = fs.readFileSync(path.join(dir, "stills", ".config-sha"), "utf8").trim(); } catch {}
  const pin = readJSON(path.join(book, "production-base.json"), {}) || {};
  const ids = sample.map((s) => s.id);
  const sealIdsSha = seal ? sha(JSON.stringify(seal.ids || [])) : null;
  const judgeInput = path.join(dir, "judge-input.json");
  const judgeItems = readJSON(judgeInput, []) || [];
  const narrations = (Array.isArray(judgeItems) ? judgeItems : Object.values(judgeItems)).map((x) => x && x.narration).filter(Boolean);
  const prompt = describerPrompt(dir);
  const m = {
    schema: "mute-cloud-manifest/1", slug, label, createdAt: now.toISOString(),
    engine: { codeHead: (seal && seal.codeHead) || meta.codeHead || null, pin: pin.productionBase || null },
    film: { configSha256: cfgFile ? sha(fs.readFileSync(cfgFile)) : null, renderInputHash, stillsConfigSha: stills16 },
    seal: { sealed: !!seal, idsSha256: seal ? seal.idsSha256 : null, verified: !!seal && sealIdsSha === seal.idsSha256 && JSON.stringify(seal.ids) === JSON.stringify(ids) },
    sample: { n: ids.length, idsSha256: sha(JSON.stringify(ids)) },
    frames,
    keySha256: fs.existsSync(path.join(dir, "key.json")) ? sha(fs.readFileSync(path.join(dir, "key.json"))) : null,
    describer: { inputs: frames.map((f) => `mute/${f.img}`), promptSha256: sha(prompt), leak: leakCheck(prompt, narrations) },
    judge: { inputSha256: fs.existsSync(judgeInput) ? sha(fs.readFileSync(judgeInput)) : null, items: narrations.length, images: 0 },
  };
  m.manifestSha256 = sha(canon({ ...m, createdAt: undefined }));
  return m;
}

/** recompute from disk; every difference is listed — an empty list means the same run, untouched */
function verifyManifest(m, { root }) {
  const now = buildManifest({ root, slug: m.slug, label: m.label });
  const diff = [];
  const same = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) diff.push(what); };
  same(now.film, m.film, "film identity (config / render input / stills config)");
  same(now.seal, m.seal, "seal");
  same(now.sample, m.sample, "sample ids");
  same(now.frames, m.frames, "blind frames (sha256)");
  same(now.keySha256, m.keySha256, "frame key (judge side)");
  same(now.describer.promptSha256, m.describer.promptSha256, "describer prompt");
  same(now.judge.inputSha256, m.judge.inputSha256, "judge input");
  if (!m.seal.verified && m.seal.sealed) diff.push("seal does not verify");
  if (!m.describer.leak.ok) diff.push("describer prompt leaks the narration or names judge-side files");
  return { ok: diff.length === 0, diff };
}

module.exports = { buildManifest, verifyManifest, leakCheck, shingles };
