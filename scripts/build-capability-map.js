#!/usr/bin/env node
/**
 * build-capability-map.js — P1.2 (2026-10-01): the Visual Capability Map.
 *
 * "LLM bize sistemi öğretir; sistem production'da LLM'e ihtiyaç duymadan çalışır."
 * This builds the map from evidence ALREADY on disk — every judged mute frame
 * (official runs + reliability passes) across every book — and never calls an
 * LLM. The unit is a FRAME (a key.json img): its worst majority verdict across
 * runs is its severity; its config scene gives its capabilities
 * (action / cast / shot / expression).
 *
 *   node scripts/build-capability-map.js            → data/visual-capability.json
 *
 * confidence per capability = 1 − (wrongMajority + 0.5·neutralMajority + 0.25·splitWrongOnly)
 *                             / (frames + PRIOR)          [frames > 0]
 * Capabilities never judged are listed as "unmeasured" — absence of evidence
 * is not evidence of reliability (the mute sampler never picked them; P1.3's
 * selector exists precisely to close that blind spot).
 * Measured-only: nothing here feeds a gate, ever.
 */
const fs = require("fs");
const path = require("path");
const TAXO = require("./lib/failure-taxonomy");

const ROOT = path.join(__dirname, "..");
const MUTE = path.join(ROOT, "audit", "mute");
const PRIOR = 2; // pseudo-frames of benefit-of-the-doubt per capability
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

function bookCfg(slug) {
  const c1 = path.join(ROOT, "books", slug, "config.antidote.json");
  const c2 = path.join(ROOT, "books", slug, "config.vox.json");
  return fs.existsSync(c1) || fs.existsSync(c2) ? readJSON(fs.existsSync(c1) ? c1 : c2) : null;
}
const sceneOf = (cfg, f) => (((cfg && (cfg.scenes || cfg.beats)) || []).find((s) => f >= s.fromFrame && f < s.fromFrame + s.durationFrames)) || null;

// ── collect one record per judged frame (unit = img across all of its runs) ──
const frames = new Map(); // "slug/img" → {slug,img,frame,scene,caps, wrongRecords, wrongMajority, neutralMajority}
const bump = (slug, img, patch) => {
  const k = `${slug}/${img}`;
  if (!frames.has(k)) frames.set(k, { slug, img, wrongRecords: 0, wrongMajority: 0, neutralMajority: 0, ...patch });
  const r = frames.get(k);
  Object.assign(r, patch, { wrongRecords: r.wrongRecords + (patch.wrongRecordsDelta || 0), wrongMajority: Math.max(r.wrongMajority, patch.wrongMajority || 0), neutralMajority: Math.max(r.neutralMajority, patch.neutralMajority || 0) });
};

for (const slug of fs.readdirSync(MUTE)) {
  const cfg = bookCfg(slug);
  for (const label of fs.readdirSync(path.join(MUTE, slug))) {
    const run = path.join(MUTE, slug, label);
    const key = readJSON(path.join(run, "key.json"));
    if (!key) continue;
    const rel = readJSON(path.join(run, "reliability", "reliability.json"), null);
    // reliability majority per img (across K passes)
    if (rel) for (const row of rel.frames || []) {
      const scene = sceneOf(cfg, row.frame);
      bump(slug, row.img, { frame: row.frame, scene, caps: TAXO.capabilitiesOf(scene), wrongMajority: row.majority.correctness === "WRONG" ? 1 : 0, neutralMajority: row.majority.correctness === "NEUTRAL" ? 1 : 0 });
      for (const j of row.judges || []) if (j.correctness === "WRONG") bump(slug, row.img, { wrongRecordsDelta: 1 });
    }
    // official run per-item verdicts (for frames whose book has no reliability pass)
    const off = readJSON(path.join(run, "judge-result.json"), null);
    const offKey = readJSON(path.join(run, "judge-key.json"), null);
    if (off && offKey) for (const it of off.items || []) {
      const v = it.V || {};
      const loc = offKey[it.id] || {};
      if (loc.img == null || loc.frame == null) continue;
      const scene = sceneOf(cfg, loc.frame);
      bump(slug, loc.img, { frame: loc.frame, scene, caps: TAXO.capabilitiesOf(scene), wrongMajority: String(v.correctness).toUpperCase() === "WRONG" ? 1 : 0, neutralMajority: String(v.correctness).toUpperCase() === "NEUTRAL" ? 1 : 0 });
      if (String(v.correctness).toUpperCase() === "WRONG") bump(slug, loc.img, { wrongRecordsDelta: 1 });
    }
  }
}

// ── aggregate frames onto capabilities ──
const agg = {};
const bumpCap = (key, f) => {
  if (!agg[key]) agg[key] = { frames: 0, framesWrong: 0, framesWrongMajority: 0, framesNeutralMajority: 0 };
  const a = agg[key];
  a.frames++;
  if (f.wrongRecords > 0) a.framesWrong++;
  if (f.wrongMajority) a.framesWrongMajority++;
  if (f.neutralMajority) a.framesNeutralMajority++;
};
for (const f of frames.values()) {
  const C = f.caps || {};
  for (const a of C.actions || []) bumpCap(`action:${a}`, f);
  if (C.castCount != null) bumpCap(`cast:${C.castCount}`, f);
  if (C.shot) bumpCap(`shot:${C.shot}`, f);
  for (const e of C.expressions || []) bumpCap(`expression:${e}`, f);
}

// ── census: how many scenes across all books carry each capability ──
const census = {};
const books = fs.readdirSync(path.join(ROOT, "books")).filter((d) => { const c = bookCfg(d); return !!c; });
for (const b of books) {
  for (const s of (bookCfg(b).scenes || [])) {
    const C = TAXO.capabilitiesOf(s);
    const bumpN = (k) => { census[k] = (census[k] || 0) + 1; };
    for (const a of C.actions || []) bumpN(`action:${a}`);
    if (C.castCount != null) bumpN(`cast:${C.castCount}`);
    if (C.shot) bumpN(`shot:${C.shot}`);
    for (const e of C.expressions || []) bumpN(`expression:${e}`);
  }
}

// ── confidence + bands ──
const bandOf = (c) => (c == null ? "unmeasured" : c >= 0.95 ? "strong" : c >= 0.85 ? "solid" : c >= 0.7 ? "weak" : "poor");
const out = { capabilities: {} };
for (const [key, a] of Object.entries(agg)) {
  const penalty = a.framesWrongMajority + 0.5 * a.framesNeutralMajority;
  const confidence = +Math.max(0, 1 - penalty / (a.frames + PRIOR)).toFixed(3);
  out.capabilities[key] = { ...a, scenesInCorpus: census[key] || 0, confidence, band: bandOf(confidence) };
}
for (const [key, n] of Object.entries(census)) {
  if (!out.capabilities[key]) out.capabilities[key] = { frames: 0, framesWrong: 0, framesWrongMajority: 0, framesNeutralMajority: 0, scenesInCorpus: n, confidence: null, band: "unmeasured" };
}

const summary = {
  date: new Date().toISOString(),
  unit: "frame (a key.json img, worst majority verdict across its runs)",
  booksJudged: [...new Set([...frames.values()].map((f) => f.slug))].sort(),
  framesJudged: frames.size,
  prior: PRIOR,
  formula: "confidence = 1 − (wrongMajority + 0.5·neutralMajority) / (frames + 2); null when never judged",
  bands: "strong ≥0.95 · solid ≥0.85 · weak ≥0.70 · poor <0.70 · unmeasured",
  source: "measured-only diagnostic; never a gate; engine never swaps an authored action because of this map",
};
const outPath = path.join(ROOT, "data", "visual-capability.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ ...summary, capabilities: out.capabilities }, null, 1) + "\n");

const rows = Object.entries(out.capabilities).sort((a, b) => (a[1].confidence ?? 9) - (b[1].confidence ?? 9));
console.log(`── visual capability map (P1.2) · ${frames.size} judged frames · ${booksJudgedCount(summary)} book(s) → ${path.relative(ROOT, outPath)}`);
console.log("confidence  band        capability                frames  wrongMaj  neutralMaj  scenesInCorpus");
for (const [k, v] of rows.slice(0, 28)) {
  const c = v.confidence == null ? "  —" : v.confidence.toFixed(3);
  console.log(`${c}  ${v.band.padEnd(11)} ${k.padEnd(24)} ${String(v.frames).padStart(6)}  ${String(v.framesWrongMajority).padStart(8)}  ${String(v.framesNeutralMajority).padStart(10)}  ${v.scenesInCorpus}`);
}
const bands = {};
for (const [, v] of rows) bands[v.band] = (bands[v.band] || 0) + 1;
console.log("   bands: " + JSON.stringify(bands));
function booksJudgedCount(s) { return s.booksJudged.length; }
