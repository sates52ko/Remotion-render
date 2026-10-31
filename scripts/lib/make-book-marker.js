// books/<slug>/make-book.done.json — "make-book finished on exactly these inputs" (2026-10-23).
//
// make-book writes {status:"running"} as it starts and {status:"done", configSha256, inputs} only on its success
// exit. preview-state accepts the make-book stage only when the marker says done AND the config and every input the
// film was built from still hash the same: a failed run (status stays "running"), a changed storyboard, story bible,
// own icons, VTT or audio can never be read as a finished make-book. One definition for the writer and the reader.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const shaOf = (p) => { try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } catch { return null; } };
const FILE = (root, slug) => path.join(root, "books", slug, "make-book.done.json");

/** The inputs a make-book film is built from. paths are relative to root (as make-book resolved them). */
function inputsOf(root, slug, { engine, vtt, audio }) {
  const B = path.join("books", slug);
  const rels = {
    storyboard: path.join(B, engine === "vox" ? "designs.json" : "art.json"),
    storyBible: path.join(B, "story-bible.json"),
    motifs: path.join(B, "motifs.json"),
    vtt: vtt || path.join("public", "captions", `${slug}.vtt`),
    audio: audio || null,
  };
  const out = {};
  for (const [k, rel] of Object.entries(rels)) if (rel) out[k] = { path: rel.replace(/\\/g, "/"), sha256: shaOf(path.join(root, rel)) };
  return out;
}

function markStarted(root, slug, extra = {}) {
  try {
    fs.mkdirSync(path.dirname(FILE(root, slug)), { recursive: true });
    fs.writeFileSync(FILE(root, slug), JSON.stringify({ status: "running", startedAt: new Date().toISOString(), ...extra }, null, 2) + "\n");
  } catch (e) { console.warn(`⚠ make-book.done.json (running) yazılamadı: ${e.message}`); }
}

function markDone(root, slug, { configRel, engine, vtt, audio, extra = {} }) {
  const prev = (() => { try { return JSON.parse(fs.readFileSync(FILE(root, slug), "utf8")); } catch { return {}; } })();
  fs.writeFileSync(FILE(root, slug), JSON.stringify({ status: "done", startedAt: prev.startedAt || null, at: new Date().toISOString(),
    config: path.basename(configRel), configSha256: shaOf(path.join(root, configRel)), inputs: inputsOf(root, slug, { engine, vtt, audio }), ...extra }, null, 2) + "\n");
}

/** Is the marker a finished make-book for the CURRENT config and inputs? -> { ok, why } */
function verify(root, slug, configRel) {
  let m = null;
  try { m = JSON.parse(fs.readFileSync(FILE(root, slug), "utf8")); } catch { return { ok: false, exists: false, why: "no make-book.done.json" }; }
  if (m.status !== "done") return { ok: false, exists: true, why: m.status === "running" ? `make-book started ${m.startedAt || "?"} and did not finish (a blocking step failed or it crashed)` : "marker has no done status" };
  if (m.configSha256 !== shaOf(path.join(root, configRel))) return { ok: false, exists: true, why: "the config changed after make-book finished" };
  const changed = Object.entries(m.inputs || {}).filter(([, v]) => v && v.path && shaOf(path.join(root, v.path)) !== v.sha256).map(([k]) => k);
  if (!m.inputs) return { ok: false, exists: true, why: "marker records no inputs" };
  if (changed.length) return { ok: false, exists: true, why: `changed since make-book finished: ${changed.join(", ")}` };
  return { ok: true, exists: true, why: `finished ${m.at}` };
}

module.exports = { inputsOf, markStarted, markDone, verify, FILE };
