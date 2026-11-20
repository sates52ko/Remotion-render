"use strict";
/**
 * vox-image-recovery (2026-11-13, operator standing decision — data/vox-image-recovery-policy.json).
 *
 * A Vox image the storyboard authored can silently vanish: Flux refuses it (CONTENT_FILTERED, 3/3 attempts), the prompt
 * is over Flux's 800-char limit (HTTP 422), or a call failed — and gen-vox-images.py then DROPS the image ref from the
 * config (exit 0), and never retries an unchanged failed prompt. Re-running make-book changes nothing. Seen on hamnet
 * (58), the-witch (5), north-woods (10), the-crucible, all-the-light-we-cannot-see. Every agent re-diagnosed it from
 * scratch, blamed plan-vox, and asked the operator.
 *
 * This module answers, read-only: which authored images are lost, why (class), what the author has to change, and
 * how much of the book's Flux budget is left. The CLI (scripts/vox-image-recovery.js) runs the capped re-generation and
 * keeps the per-book ledger books/<slug>/image-recovery.json. The fix is ALWAYS authored (authored-K.json → merge →
 * make-book); config.vox.json is never edited by hand and no engine code changes.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { voxImageCoverage } = require("./preview-ready-checks");

const POLICY_DEFAULT = { maxRoundsPerBeat: 2, maxCallsPerBook: 60, attemptsPerImage: 3, subjectBudgetChars: 470, onExhausted: "text" };

// words the NVIDIA Flux filter is known to refuse (gen-vox-images.py _SOFTEN + what refused on shipped books).
// A match is a hint for the rewrite, not a verdict: the filter also refuses harmless prompts (REWRITE_COMPOSITION).
const TRIGGERS = [
  /\b\d{1,2}-year-old\b/i, /\b(girl|boy|child|children|kid|kids|infant|baby|toddler|teen(age(r)?)?|adolescent|minor|daughter|son)\b/i,
  /\b(blood(y|ied)?|bleed(ing)?|wound(ed|s)?|gore|gory|severed|dismember\w*|mutilat\w*|scalp(ed|ing)?|decapitat\w*|entrails|bruis\w*)\b/i,
  /\b(corpse|corpses|dead body|bodies|cadaver|skeleton|skull|bones?|ribs|carcass|remains)\b/i,
  /\b(kill(ing|ed|er)?|murder\w*|tortur\w*|execut\w*|massacre|slaughter\w*|stab\w*|shoot(ing)?|shot|strangl\w*|hang(ing|ed)|noose|suicide|rape\w*|assault\w*|abuse\w*)\b/i,
  /\b(gun|guns|rifle|musket|pistol|revolver|bayonet|sword|knife|knives|dagger|axe|hatchet|tomahawk|weapon\w*|bomb\w*|grenade|explosi\w*|artillery|shelling)\b/i,
  /\b(soldier\w*|troops|infantry|militia\w*|army|war|battle\w*|combat|Nazi|SS|Wehrmacht|Gestapo)\b/i,
  /\b(horror|horrif\w*|terrif\w*|grotesque|gruesome|violent|violence|brutal\w*|agony|screaming|trophy)\b/i,
  /\b(naked|nude|nudity|undress\w*|topless|lingerie|sex\w*|erotic|seduct\w*|bed with)\b/i,
  /\b(drug\w*|syringe|needle|overdose|heroin|cocaine)\b/i,
  /\b(dying|death|dead|die[sd]?)\b/i,
];

const sha = (s) => crypto.createHash("sha256").update(String(s || "")).digest("hex").slice(0, 16);
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function loadPolicy(root) {
  const p = readJSON(path.join(root, "data", "vox-image-recovery-policy.json")) || {};
  return { ...POLICY_DEFAULT, ...p };
}

function ledgerPath(root, slug) { return path.join(root, "books", slug, "image-recovery.json"); }
function loadLedger(root, slug) {
  const l = readJSON(ledgerPath(root, slug)) || {};
  return { note: "vox-image-recovery.js: per-book ledger of lost-image recovery rounds (calls spent, subjects tried)", baseline: {}, rounds: [], ...l };
}
function saveLedger(root, slug, ledger) { fs.writeFileSync(ledgerPath(root, slug), JSON.stringify(ledger, null, 1)); }

function triggersIn(text) {
  const out = [];
  for (const re of TRIGGERS) { const m = String(text || "").match(re); if (m && !out.includes(m[0].toLowerCase())) out.push(m[0].toLowerCase()); }
  return out;
}

// beat index (design position) → the storyboard file that authored it
function authoredIndex(SB) {
  const map = new Map();
  let files = [];
  try { files = fs.readdirSync(SB).filter((f) => /^authored-\d+\.json$/.test(f)); } catch {}
  for (const f of files) {
    const a = readJSON(path.join(SB, f));
    const arr = Array.isArray(a) ? a : (a && a.beats) || [];
    for (const e of arr) if (e && Number.isInteger(e.i)) map.set(e.i, `books/${path.basename(path.dirname(SB))}/storyboard/${f}`);
  }
  return { map, files };
}

const subjectOf = (d) => {
  if (!d) return "";
  if (d.compare && d.compare.left && d.compare.right) return `${d.compare.left.subject || d.compare.left.label || ""} | ${d.compare.right.subject || d.compare.right.label || ""}`;
  return (d.image && d.image.subject) || "";
};

/** Read-only diagnosis. Returns { engine, state: clean|work|exhausted|not-vox|no-config, lost[], spent, left, policy, staleMerge } */
function diagnose({ root, slug, policy = loadPolicy(root), ledger = loadLedger(root, slug) }) {
  const B = path.join(root, "books", slug), SB = path.join(B, "storyboard");
  const book = readJSON(path.join(B, "book.json")) || {};
  const cfg = readJSON(path.join(B, "config.vox.json"));
  const designs = readJSON(path.join(B, "designs.json"));
  const base = { slug, policy, lost: [], spent: 0, left: policy.maxCallsPerBook, staleMerge: false };
  if (book.engine && book.engine !== "vox") return { ...base, state: "not-vox" };
  if (!cfg || !designs) return { ...base, state: "no-config" };
  const darr = Array.isArray(designs) ? designs : ((designs.beats || []).map((b) => (b && b.design) || b));
  const cov = voxImageCoverage({ designs, config: cfg, publicDir: path.join(root, "public") });
  const report = (readJSON(path.join(B, "images.report.json")) || {}).images || [];
  const recOf = (id) => report.filter((r) => r.beat === id);
  const spent = (ledger.rounds || []).reduce((a, r) => a + (r.calls || 0), 0);
  const left = Math.max(0, policy.maxCallsPerBook - spent);
  const { map: authored, files } = authoredIndex(SB);
  let designsM = 0; try { designsM = fs.statSync(path.join(B, "designs.json")).mtimeMs; } catch {}
  const staleMerge = files.some((f) => { try { return fs.statSync(path.join(SB, f)).mtimeMs > designsM + 1000; } catch { return false; } });

  const byBeat = new Map();
  for (const f of cov.findings) {
    if (f.beat === "-") return { ...base, state: "work", spent, left, staleMerge, structural: f.problem };
    if (!byBeat.has(f.beat)) byBeat.set(f.beat, []);
    byBeat.get(f.beat).push(f.problem);
  }
  const lost = [];
  for (const [id, problems] of byBeat) {
    const i = cfg.beats.findIndex((b) => b.id === id);
    const d = darr[i] || {};
    const subject = subjectOf(d);
    const subjectSha = sha(subject);
    const recs = recOf(id);
    const failed = recs.filter((r) => r.outcome === "failed");
    const filtered = failed.some((r) => (r.filtered || 0) > 0);
    // a round counts for a beat only if Flux was actually asked for it (not a probe, not stopped by the call cap)
    const mine = (ledger.rounds || []).filter((r) => (r.beats || []).includes(id) && !r.probe && (r.results || {})[id] !== "not-attempted");
    const rounds = mine.length;
    const tried = [ledger.baseline && ledger.baseline[id] && ledger.baseline[id].subjectSha, ...mine.map((r) => (r.subjectSha || {})[id])].filter(Boolean);
    const trig = triggersIn(subject);
    const lastError = (failed.find((r) => r.lastError) || {}).lastError || null;
    let cls;
    if (problems.every((p) => /cut-out nearly empty/.test(p))) cls = "CUTOUT";
    else if (filtered) cls = trig.length ? "REWRITE_TRIGGERS" : "REWRITE_COMPOSITION";
    else if (failed.length && lastError && /^HTTP (401|402|403)\b|quota|credit|unauthori[sz]ed|forbidden/i.test(lastError)) cls = "API_ACCOUNT";
    else if (failed.length && (/^HTTP 422\b/.test(lastError || "") || subject.length > policy.subjectBudgetChars)) cls = "SHORTEN";
    else if (failed.length) cls = "RETRY";
    else cls = "GENERATE";
    const needsRewrite = /^(REWRITE_|SHORTEN)/.test(cls);
    // rewritten = the subject differs from every one already refused. Before the ledger knew the beat (a rewrite made
    // before the first `status`), fall back to the refused prompt on record: most of its words gone → a new subject.
    const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const lastPrompt = (failed.find((r) => r.softenedPrompt) || {}).softenedPrompt || null;
    const known = !!(ledger.baseline && ledger.baseline[id]) || rounds > 0;
    const overlap = lastPrompt ? words(subject).filter((w) => words(lastPrompt).includes(w)).length / Math.max(1, words(subject).length) : 1;
    const rewritten = !tried.includes(subjectSha) && (known || overlap < 0.6);
    const exhausted = !/^(CUTOUT|API_ACCOUNT)$/.test(cls) && (rounds >= policy.maxRoundsPerBeat || left <= 0);
    const ready = !exhausted && !/^(CUTOUT|API_ACCOUNT)$/.test(cls) && (!needsRewrite || rewritten);
    lost.push({ beat: id, i, type: (cfg.beats[i] || {}).type, problems, cls, triggers: trig, subject, subjectSha, subjectChars: subject.length,
      authoredFile: authored.get(i) || null, rounds, tried: tried.length, needsRewrite, rewritten, ready, lastError,
      action: cls === "API_ACCOUNT" ? "OPERATOR" : exhausted ? "TO_TEXT" : cls === "CUTOUT" ? "CUTOUT" : ready ? "GENERATE" : "REWRITE",
      lastPrompt });
  }
  // a systemic API problem: the latest Flux batch failed on every attempted image with no filter verdict — retrying or
  // converting beats to text would be wrong; the key / quota / service is the operator's (or wait and run again)
  const batches = [...new Set(report.map((r) => r.at).filter(Boolean))].sort();
  const lastBatch = report.filter((r) => r.at === batches[batches.length - 1] && r.outcome !== "skipped-existing");
  const apiProblem = lastBatch.length >= 2 && lastBatch.every((r) => r.outcome === "failed" && !(r.filtered > 0))
    ? { images: lastBatch.length, at: batches[batches.length - 1], lastError: (lastBatch.find((r) => r.lastError) || {}).lastError || "not recorded (gen-vox-images.py before 2026-11-13)" } : null;
  if (apiProblem) for (const x of lost) if (x.cls === "RETRY" && x.action === "TO_TEXT") x.action = "GENERATE";
  const state = !lost.length ? "clean" : lost.some((x) => x.action === "OPERATOR") ? "operator" : lost.every((x) => x.action === "TO_TEXT") ? "exhausted" : "work";
  return { ...base, state, lost, spent, left, staleMerge, apiProblem };
}

/** baseline: the subject each lost beat had when it was first seen lost — a rewrite must differ from it */
function recordBaseline(ledger, diag) {
  ledger.baseline = ledger.baseline || {};
  let added = 0;
  for (const x of diag.lost) if (!ledger.baseline[x.beat] && x.cls !== "CUTOUT") { ledger.baseline[x.beat] = { subjectSha: x.subjectSha, cls: x.cls, at: new Date().toISOString() }; added++; }
  return added;
}

const ADVICE = {
  REWRITE_TRIGGERS: "Flux refused it 3/3 and the subject holds filter words. Re-author the SAME moment without them: show the aftermath, a symbol, the place or the object instead of the act; a minor becomes 'young woman/young man' only if the narration allows, else drop the person. Keep who/what a muted viewer must read.",
  REWRITE_COMPOSITION: "Flux refused a harmless-looking subject 3/3 (the filter also reads the person/look). Change the COMPOSITION, not just a word: no face/body (hands, back view, silhouette at distance), or the place / object alone; shorten a reused `look`.",
  SHORTEN: `The call failed without a filter verdict and the subject is over the budget — Flux's 800-char prompt limit (HTTP 422). Cut the subject (one look, no duplicated description).`,
  READY: "Re-authored (the subject differs from every refused one) — the next round generates it.",
  RETRY: "A transient error (no filter verdict). No rewrite needed: the next round retries it as named.",
  GENERATE: "Never generated (call cap / new prompt). No rewrite needed.",
  API_ACCOUNT: "Flux refused the CALL (key / quota / credits — HTTP 401/402/403): not a storyboard problem and not a retry. Stop and tell the operator the recorded error (never print the key).",
  CUTOUT: "The image exists but its cut-out is empty: delete the -cut.png and re-run `python scripts/cutout.py books/<slug>/config.vox.json` (no Flux call).",
  TO_TEXT: "Recovery budget used (2 rounds for this beat, or the book's call cap). Re-author it as a TEXT beat from its narration (statement / quote / question / stat / list — no image), merge, make-book. Report it in the hand-off.",
};

module.exports = { diagnose, loadPolicy, loadLedger, saveLedger, ledgerPath, recordBaseline, triggersIn, sha, ADVICE, POLICY_DEFAULT };
