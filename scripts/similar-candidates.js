#!/usr/bin/env node
/**
 * similar-candidates.js — from a blind finding (mute test or framecheck) to a list of beats that share
 * its staging, for REVIEW. Report-only: it never edits art.json/config and never says a candidate is
 * wrong. A shared icon + face + action is a hypothesis about the cause, not a verdict: the-art-of-saying-no
 * round 2 re-authored 130 "same class" beats and dead frames went 4 -> 9. Confirm candidates by looking at
 * them (framecheck.js --beats=...) before changing any.
 *
 *   node scripts/similar-candidates.js --slug=<slug> [--labels=run1,run3] [--include=WRONG,NONE]
 *        [--source=mute|framecheck|both] [--top=12] [--root=<tree with books/ and audit/>]
 *   -> audit/candidates/<slug>/<stamp>.json (+ a summary on stdout)
 *
 * Tiers, from the finding's scene (current config):
 *   A same staging      — same icons, same faces, same actions, same shot
 *   B same picture core — same icons (or both bare) and same faces, any action/shot
 *   C shares a part     — shares an icon, or the same face+action
 * Every candidate the blind tests already judged carries that verdict: a combo judged CORRECT elsewhere
 * is evidence AGAINST the hypothesis.
 */
const fs = require("fs");
const path = require("path");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const ROOT = path.resolve(args.root || process.env.CANDIDATES_ROOT || path.join(__dirname, ".."));
const SLUG = args.slug;
if (!SLUG) { console.error("Usage: node scripts/similar-candidates.js --slug=<slug> [--labels=a,b] [--include=WRONG,NONE] [--source=mute|framecheck|both] [--top=12] [--root=<dir>]"); process.exit(1); }
const INCLUDE = new Set(String(args.include || "WRONG").toUpperCase().split(",").map((x) => x.trim()));
const SOURCE = args.source || "both";
const TOP = parseInt(args.top || "12", 10);
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

const cfgPath = path.join(ROOT, "books", SLUG, "config.antidote.json");
const cfg = readJSON(cfgPath);
if (!cfg) { console.error(`❌ no Antidote config: ${cfgPath}`); process.exit(1); }
const scenes = cfg.scenes || [];
const sceneAt = (f) => scenes.find((s) => f >= s.fromFrame && f < s.fromFrame + s.durationFrames);
const readings = (readJSON(path.join(ROOT, "data", "icon-readings.json"), {}) || {}).icons || {};

// What a muted viewer can see in a scene, as comparable parts (shared with cause-ledger.js).
const { signature, tier, describeSig, FACE_WORDS, FACE_CLASS } = require("./lib/staging-signature");

// Blind verdicts per scene id, from every run of every source.
function runsOf(kind) {
  const base = path.join(ROOT, "audit", kind, SLUG);
  if (!fs.existsSync(base)) return [];
  // mute-test writes judge-result.json; framecheck writes chunked judge-result-N.json / judge-input-N.json
  const resultFiles = (d) => (fs.existsSync(d) && fs.statSync(d).isDirectory() ? fs.readdirSync(d).filter((f) => /^judge-result(-\d+)?\.json$/.test(f)) : []);
  return fs.readdirSync(base).filter((l) => resultFiles(path.join(base, l)).length && fs.existsSync(path.join(base, l, "judge-key.json")))
    .map((label) => ({ kind, label, dir: path.join(base, label),
      mtime: Math.max(...resultFiles(path.join(base, label)).map((f) => fs.statSync(path.join(base, label, f)).mtimeMs)) }))
    .sort((a, b) => a.mtime - b.mtime);
}
function loadJudged(dir) {
  const items = [], input = {};
  for (const f of fs.readdirSync(dir)) {
    if (/^judge-result(-\d+)?\.json$/.test(f)) items.push(...((readJSON(path.join(dir, f), {}) || {}).items || []));
    if (/^judge-input(-\d+)?\.json$/.test(f)) (readJSON(path.join(dir, f), []) || []).forEach((x) => { input[x.id] = x; });
  }
  return { items, input };
}
const sources = SOURCE === "both" ? ["mute", "framecheck"] : [SOURCE];
const runs = sources.flatMap(runsOf).sort((a, b) => a.mtime - b.mtime);
if (!runs.length) { console.error(`❌ no judged runs under audit/{${sources.join(",")}}/${SLUG}/`); process.exit(1); }
const runId = (r) => `${r.kind}/${r.label}`;
const latestLabel = runId(runs[runs.length - 1]);
const verdicts = {}; // sceneId -> [{run, correctness, contribution}]
// Face readability over EVERY judged frame (not only failures): the configured expression of a one-face
// scene vs the face words in the blind description. Only meaningful for the latest run (config = judged).
const faceObs = [];
const findings = [];
const wantLabels = args.labels ? new Set(String(args.labels).split(",")) : null;
// A run judged the CURRENT staging when art.json has not changed since (a fix round rewrites art.json).
const artPath = path.join(ROOT, "books", SLUG, "art.json");
const artMtime = fs.existsSync(artPath) ? fs.statSync(artPath).mtimeMs : 0;
const isCurrent = (r) => r.mtime >= artMtime;
for (const r of runs) {
  const { items, input } = loadJudged(r.dir);
  const key = readJSON(path.join(r.dir, "judge-key.json"));
  const current = isCurrent(r) || runId(r) === latestLabel;
  for (const it of items) {
    const k = key[it.id]; if (!k) continue;
    const v = it.V || (k.thisIsX ? it.X : it.Y); if (!v) continue;
    const s = sceneAt(k.frame); if (!s) continue;
    (verdicts[s.id] = verdicts[s.id] || []).push({ run: `${r.kind}/${r.label}`, correctness: v.correctness, contribution: v.contribution });
    const seesTxt = String((input[it.id] && (input[it.id].V || input[it.id].X) || {}).sees || "");
    const faces1 = [...new Set((s.characters || []).filter((c) => !c.silhouette).map((c) => c.expression || "neutral"))];
    if (current && faces1.length === 1 && FACE_CLASS[faces1[0]]) {
      const readAs = Object.keys(FACE_WORDS).filter((k) => FACE_WORDS[k].test(seesTxt));
      if (readAs.length === 1) faceObs.push({ run: runId(r), scene: s.id, configured: faces1[0], intended: FACE_CLASS[faces1[0]], readAs: readAs[0], correctness: v.correctness });
    }
    const hit = INCLUDE.has(v.correctness) || (INCLUDE.has("NONE") && v.contribution === "NONE") || (INCLUDE.has("DEAD") && v.contribution === "NONE");
    if (!hit || (wantLabels && !wantLabels.has(r.label))) continue;
    const view = input[it.id] && (input[it.id].V || input[it.id].X) || {};
    findings.push({ run: runId(r), latestRun: current, scene: s.id, frame: k.frame,
      verdict: `${v.correctness}/${v.contribution}`, why: v.why, whyC: v.whyC, sees: view.sees || null,
      narration: s._narration || (input[it.id] && input[it.id].narration) || null });
  }
}

const sigs = Object.fromEntries(scenes.map((s) => [s.id, signature(s)]));
const out = [];
for (const f of findings) {
  const fs0 = sigs[f.scene];
  const iconNotes = fs0.icons.map((i) => readings[i] && readings[i].neverFor ? `${i}: measured "${readings[i].reads}"; never for ${readings[i].neverFor}` : null).filter(Boolean);
  const byTier = { A: [], B: [], C: [] };
  for (const s of scenes) {
    if (s.id === f.scene) continue;
    const t = tier(fs0, sigs[s.id]);
    if (t) byTier[t].push({ scene: s.id, t: `${(s.fromFrame / 30).toFixed(0)}s`, narration: String(s._narration || "").slice(0, 140),
      staging: describeSig(sigs[s.id]), judged: verdicts[s.id] || [] });
  }
  // counter-evidence: same staging judged CORRECT somewhere
  const judgedA = byTier.A.concat(byTier.B).flatMap((c) => c.judged);
  out.push({ ...f, staging: describeSig(fs0), stagingCurrentAsJudged: f.latestRun ? "yes (art.json unchanged since this run)" : "unknown: earlier run, the scene may have been re-authored since",
    iconReadings: iconNotes, counts: { A: byTier.A.length, B: byTier.B.length, C: byTier.C.length },
    sameStagingJudged: { correct: judgedA.filter((v) => v.correctness === "CORRECT").length, wrong: judgedA.filter((v) => v.correctness === "WRONG").length, dead: judgedA.filter((v) => v.contribution === "NONE").length },
    candidates: { A: byTier.A.slice(0, TOP), B: byTier.B.slice(0, TOP), C: byTier.C.slice(0, Math.min(TOP, 6)) },
    reviewBeats: byTier.A.concat(byTier.B).filter((c) => !c.judged.length).slice(0, 6).map((c) => c.scene) });
}

function faceSummary() {
  const rows = {};
  for (const o of faceObs) { const k = o.configured + " -> read " + o.readAs; const r = rows[k] = rows[k] || { n: 0, wrong: 0, scenes: [] }; r.n++; if (o.correctness === "WRONG") r.wrong++; r.scenes.push(o.scene); }
  const misread = faceObs.filter((o) => o.intended !== o.readAs);
  return { run: [...new Set(faceObs.map((o) => o.run))].join(",") || latestLabel, oneFaceFramesWithFaceWords: faceObs.length, misread: misread.length, rows,
    note: "configured expression vs the face words a blind viewer used; one-face frames of the latest run only. A misread here is a renderer/face-readability lead, not proof." };
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = path.join(ROOT, "audit", "candidates", SLUG);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${stamp}.json`);
fs.writeFileSync(file, JSON.stringify({ slug: SLUG, created: new Date().toISOString(), reportOnly: true,
  note: "Candidates share staging with a blind finding. They are NOT confirmed wrong. Confirm with framecheck.js --beats before changing any; never change a whole class blind.",
  include: [...INCLUDE], runs: runs.map((r) => `${r.kind}/${r.label}`), faceReadability: faceSummary(), findings: out }, null, 2) + "\n");

console.log(`── similar candidates · ${SLUG} · ${out.length} finding(s) (${[...INCLUDE].join(",")}) from ${runs.length} judged run(s)`);
for (const f of out) {
  console.log(`\n${f.run} ${f.scene} ${f.verdict}${f.latestRun ? "" : "  (earlier run: staging may have changed since)"}`);
  console.log(`   narration: ${String(f.narration || "").slice(0, 150)}`);
  console.log(`   viewer saw: ${String(f.sees || "").slice(0, 150)}`);
  console.log(`   judge: ${f.why}`);
  console.log(`   staging: ${f.staging}`);
  f.iconReadings.forEach((n) => console.log(`   icon-readings: ${n}`));
  console.log(`   same staging: A ${f.counts.A} · B ${f.counts.B} · C ${f.counts.C}  | already judged in A+B: ${f.sameStagingJudged.correct} correct, ${f.sameStagingJudged.wrong} wrong, ${f.sameStagingJudged.dead} dead`);
  if (f.reviewBeats.length) console.log(`   look at first (unjudged A/B): ${f.reviewBeats.join(",")}`);
}
const fsum = faceSummary();
if (fsum.oneFaceFramesWithFaceWords) {
  console.log(`\nface readability (${fsum.run}, one-face frames the viewer described a face on): ${fsum.misread}/${fsum.oneFaceFramesWithFaceWords} read as a different mood`);
  Object.entries(fsum.rows).filter(([k]) => { const [c, r] = k.split(" -> read "); return FACE_CLASS[c] !== r; })
    .forEach(([k, r]) => console.log(`   ${k}: ${r.n} (WRONG ${r.wrong}) ${r.scenes.join(",")}`));
}
console.log(`\n✓ ${path.relative(ROOT, file)} — review candidates; confirm with: node scripts/framecheck.js prep --slug=${SLUG} --beats=<ids>`);
