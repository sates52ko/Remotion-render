/**
 * evidence-integrity.js — is a blind run's evidence the work of fresh readers, or one template filled in by a script?
 * (2026-11-03). Shared by mute-test.js tally and readcheck.js tally. Read-only: it never writes, never scores.
 *
 * Real case: the-most-important-thing, 2026-10-31. audit/mute/<slug>/final/blind.json held 30 descriptions of ONE
 * shape — "An animated figure is presented on stage with clear graphic elements and the typography '<on-screen
 * words>'." — and ONE identical "message" across all 30; judge-result.json gave the same "why" and the same "whyC" to
 * all 30 items and was written 16 s after judge-input.json. Its readcheck had 272 guesses "The narrator explains
 * investment principles and market cycle dynamics regarding <ON-SCREEN WORDS>." written 14 s after prep, and one
 * identical verdict reason. The tally counted it a PASS. PROMPTS.md asks for fresh agents describing one image at a
 * time; a file like that is not evidence of what a muted viewer understands, whatever its totals say.
 *
 * What is checked (calibrated 2026-11-03 on every real run on disk, read-only: 133 distinct mute runs in test/ and the
 * book worktrees, 104 readcheck folders; the honest maximum is given beside each bar):
 *   (a) blind descriptions (n >= 10): the most common normalised "message" covers >= 50% of the entries (honest max 13%),
 *       OR >= 50% of the "sees" share one template once the quoted / ALL-CAPS on-screen words are taken out (honest max
 *       7%), OR >= 50% have an empty / boilerplate "sees" or "message" (honest max 33%: die-with-zero run3, an older
 *       describer that wrote no "sees" on 10 frames);
 *   (b) judge (n >= 10): one identical "why" (or "whyC") WITH one identical verdict covers >= 90% of the items (honest
 *       max 77%: the-new-one-minute-manager final). An identical reason alone (>= 50%) with varied verdicts is a SIGNAL —
 *       real judges write stock phrases (below);
 *   (c) timing: the result file was written less than max(20 s, 0.75 s per item) after its input. A SIGNAL only — file
 *       times can be touched or copied, honest judges have written 30 items in 8 s — reported next to (a)/(b), never a
 *       block on its own; files within 2 s of each other (copied / checked out together) carry no information;
 *   (d) readcheck: the readers' guesses as (a) (>= 50% one template once the on-screen words are removed; honest max
 *       10%), the judges' "why" as (b) over the non-CORRECT verdicts only (a stock reason on CORRECT beats is normal:
 *       up to 93%) — or over every beat when no verdict varies at all.
 * Empty / missing values are not counted (an old judge without whyC is not "one template"). A tripped run is
 * EVIDENCE_INVALID: not PASS, not FAIL. Nothing here changes a bar or how the totals are computed (data/quality-policy.json).
 */
const fs = require("fs");
const path = require("path");

const MIN_N = 10;
const STATUS_INVALID = "EVIDENCE_INVALID"; // neither PASS nor FAIL: the run measured nothing
const SHARE_MESSAGE = 0.5;   // (a) identical message
const SHARE_SEES = 0.5;      // (a) one "sees" template after removing the on-screen words
const SHARE_EMPTY = 0.5;     // (a) entries with an empty / boilerplate "sees" or "message"
const SHARE_WHY = 0.5;       // (b) identical judge reason — a signal
const SHARE_SAME_REASON = 0.9; // (b) identical reason AND identical verdict — blocks
const TIME_FLOOR_S = 20, TIME_PER_ITEM_S = 0.75; // (c)
const TIME_COPY_S = 2;       // (c) input and result within 2 s = copied / checked out together: no timing information

// The template of a sentence: what is left when the words that differ per entry because they were PASTED from the
// screen are taken out — quoted spans, ALL-CAPS runs (the on-screen words as the tool prints them), the entry's own
// on-screen words, digits — then lower case, letters only. "…typography 'IS THE PERMANENT'." and "…typography 'MEAN YOU
// RISK'." have one template; two real describers of two different frames do not.
function templateOf(s, own = []) {
  let t = String(s == null ? "" : s);
  t = t.replace(/(["'“”‘’])(?:(?!\1).){1,120}?\1/g, " ").replace(/[“‘][^”’]{1,120}[”’]/g, " ");
  for (const w of own) if (w && String(w).trim().length >= 2) t = t.split(String(w)).join(" ");
  t = t.replace(/\b[A-Z][A-Z'’-]+\b/g, " ").replace(/[0-9]+/g, " ");
  return t.toLowerCase().replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
}
// identical-text key: case, spacing and punctuation never make two copies of one sentence "different"
const plainOf = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** the most common non-empty key: { n, count, share, value } (n = non-empty values) */
function topShare(values) {
  const keys = values.filter((v) => typeof v === "string" && v.length > 0);
  const c = new Map();
  for (const k of keys) c.set(k, (c.get(k) || 0) + 1);
  let value = null, count = 0;
  for (const [k, v] of c) if (v > count) { value = k; count = v; }
  return { n: keys.length, count, share: keys.length ? count / keys.length : 0, value };
}
// a field that says nothing: missing, empty, or a placeholder a script leaves behind
const BOILERPLATE = /^(n ?a|none|null|undefined|nil|todo|tbd|tbc|placeholder|unknown|same|same as above|ditto|x+|lorem ipsum.*|description|message|sees|text)$/;
const isBoilerplate = (s) => { const p = plainOf(s); return !p || BOILERPLATE.test(p); };
const pct = (x) => `${Math.round(x * 100)}%`;
const clip = (s) => (String(s).length > 70 ? String(s).slice(0, 67) + "..." : String(s));

/** (a) mute blind.json entries [{ img, text, sees, message }] → reasons[] */
function checkBlind(blind) {
  const out = [];
  if (!Array.isArray(blind) || blind.length < MIN_N) return out;
  const msg = topShare(blind.map((d) => plainOf(d && d.message)));
  if (msg.n >= MIN_N && msg.share >= SHARE_MESSAGE) out.push(`blind: ${msg.count}/${msg.n} (${pct(msg.share)}) descriptions give one identical message "${clip(msg.value)}"`);
  const sees = topShare(blind.map((d) => templateOf(d && d.sees, d && d.text ? String(d.text).split(/\s*[\/|]\s*|\s{2,}/) : [])));
  if (sees.n >= MIN_N && sees.share >= SHARE_SEES) out.push(`blind: ${sees.count}/${sees.n} (${pct(sees.share)}) "sees" follow one template once the on-screen words are removed ("${clip(sees.value)}")`);
  for (const f of ["sees", "message"]) {
    const empty = blind.filter((d) => isBoilerplate(d && d[f])).length;
    if (empty / blind.length >= SHARE_EMPTY) out.push(`blind: ${empty}/${blind.length} (${pct(empty / blind.length)}) entries have an empty or boilerplate "${f}"`);
  }
  return out;
}

/**
 * (b) judge reasons. `items` = judge-result items ({V}, or {X,Y} for --vs) or readcheck verdicts ({why, correctness}).
 * BLOCKS when one identical reason WITH one identical verdict covers >= 90% of the items considered: a script that
 * writes "CORRECT / ADDS — <one sentence>" thirty times. Measured 2026-11-03 on every official run: real judges DO reuse
 * a stock reason — readcheck judges write "guess carries the narration meaning" on up to 93% of their CORRECT beats,
 * and some mute judges wrote one stock "why" for all 30 items while their verdicts still varied (the-new-one-minute-
 * manager final 29/30, threshing-day final 30/30, verdict mix 23/6/1 and 21/7/2) — so an identical reason alone is a
 * SIGNAL (lazy, not fabricated), never a block. The reason+verdict tuple of a real run peaked at 77%; the fabricated
 * runs sat at 100% (the-most-important-thing final, piranesi run1, great-at-work run1).
 * `only` limits which items count (readcheck: the non-CORRECT verdicts, where the reason must name the failure).
 * → { reasons: [], signals: [] }
 */
function checkReasons(items, { who = "judge", pairs = [["why", "correctness"], ["whyC", "contribution"]], only = null } = {}) {
  const out = { reasons: [], signals: [] };
  if (!Array.isArray(items)) return out;
  // plainOf never keeps a "|", so it separates the reason from the verdict
  // a mute item holds V (or X and Y for --vs); a readcheck verdict holds the fields itself
  let parts = items.flatMap((it) => (it && (it.V || it.X || it.Y) ? [it.V, it.X, it.Y].filter(Boolean) : [it])).filter(Boolean);
  if (only) parts = parts.filter(only);
  for (const [f, v] of pairs) {
    const tup = topShare(parts.map((p) => (plainOf(p[f]) ? `${plainOf(p[f])}|${p[v]}` : "")));
    if (tup.n >= MIN_N && tup.share >= SHARE_SAME_REASON) {
      const [why, verdict] = tup.value.split("|");
      out.reasons.push(`${who}: ${tup.count}/${tup.n} (${pct(tup.share)}) give one identical "${f}" with one identical ${v} ${verdict} ("${clip(why)}")`);
      continue;
    }
    const s = topShare(parts.map((p) => plainOf(p[f])));
    if (s.n >= MIN_N && s.share >= SHARE_WHY) out.signals.push(`${who}: ${s.count}/${s.n} (${pct(s.share)}) give one identical "${f}" ("${clip(s.value)}") — verdicts vary, so a stock phrase, not a template`);
  }
  return out;
}

/** (d) readcheck guesses [{ id, guess }] with the visible entries they answer (for the on-screen words) */
function checkGuesses(guesses, visibleById = new Map()) {
  const out = [];
  if (!Array.isArray(guesses) || guesses.length < MIN_N) return out;
  const g = topShare(guesses.map((x) => { const v = visibleById.get(x && x.id) || {}; return templateOf(x && x.guess, [v.words].filter(Boolean).map(String)); }));
  if (g.n >= MIN_N && g.share >= SHARE_MESSAGE) out.push(`readers: ${g.count}/${g.n} (${pct(g.share)}) guesses follow one template once the on-screen words are removed ("${clip(g.value)}")`);
  return out;
}

/** (c) a result written faster than a fresh reader can read: a signal string, or null */
function timingSignal(inputFile, resultFile, n, who = "judge") {
  if (!(n >= MIN_N)) return null;
  let a, b;
  try { a = fs.statSync(inputFile).mtimeMs; b = fs.statSync(resultFile).mtimeMs; } catch { return null; }
  const dt = (b - a) / 1000, min = Math.max(TIME_FLOOR_S, TIME_PER_ITEM_S * n);
  // within TIME_COPY_S (or before the input): the files were copied / checked out together — no information either way
  // (most runs on disk after a git checkout or a worktree copy read 0 s)
  if (dt <= TIME_COPY_S) return null;
  return dt < min ? `${who}: ${n} items written ${Math.max(0, Math.round(dt))} s after the input (a fresh reader needs >= ${min} s)` : null;
}

/** one verdict from the parts: blocking reasons (a)/(b)/(d) decide; signals (timing, stock phrases) are reported beside them */
function verdictOf(reasons, signals = []) {
  const sig = signals.filter(Boolean);
  if (!reasons.length) return { ok: true, status: "OK", reasons: [], signals: sig, verdict: null };
  const all = reasons.concat(sig.map((s) => `signal — ${s}`));
  return { ok: false, status: STATUS_INVALID, reasons: all, signals: sig, verdict: `${STATUS_INVALID}: ${all.join("; ")}` };
}

/** mute-test run: blind.json + judge-result.json (+ judge-input.json for the timing signal) */
function checkMuteRun({ blind, judgeItems, judgeInputFile = null, judgeResultFile = null }) {
  const j = checkReasons(judgeItems);
  const n = Array.isArray(judgeItems) ? judgeItems.length : 0;
  return verdictOf([...checkBlind(blind), ...j.reasons], [...j.signals, judgeInputFile && judgeResultFile ? timingSignal(judgeInputFile, judgeResultFile, n) : null]);
}

/** mute run folder audit/mute/<slug>/<label>/ as written by prep / the describer / judge / the judge agent */
function checkMuteDir(dir) {
  const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
  const jr = rj(path.join(dir, "judge-result.json"));
  return checkMuteRun({ blind: rj(path.join(dir, "blind.json")), judgeItems: (jr && jr.items) || [],
    judgeInputFile: path.join(dir, "judge-input.json"), judgeResultFile: path.join(dir, "judge-result.json") });
}

/**
 * The evidence verdict of one mute-test.json run, for the readers of the record (preview-ready, preview-state). The
 * files on disk decide when they are there (a run tallied before this check existed — the-most-important-thing — has
 * no field); a run whose folder is gone keeps what its tally recorded. → { ok, status, reasons }
 */
function runEvidence({ root, slug, run, tree = "mute" }) {
  const dir = path.join(root, "audit", tree, slug, String((run && run.label) || ""));
  if (run && run.label && (fs.existsSync(path.join(dir, "blind.json")) || fs.existsSync(path.join(dir, "judge-result.json")))) return checkMuteDir(dir);
  const e = run && run.evidence;
  if (e && e.status === STATUS_INVALID) return { ok: false, status: STATUS_INVALID, reasons: e.reasons || [], signals: e.signals || [] };
  return { ok: true, status: "OK", reasons: [], signals: (e && e.signals) || [] };
}

/** readcheck folder (the full run or one recheck-N): visible-K / guess-K / judge-K / verdict-K */
function checkReadcheckDir(dir) {
  const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return verdictOf([], []); }
  const vis = new Map(), guesses = [], verdicts = [], signals = [];
  for (const f of files.filter((x) => /^visible-\d+\.json$/.test(x))) {
    const k = f.match(/\d+/)[0];
    for (const v of rj(path.join(dir, f)) || []) if (v && v.id) vis.set(v.id, v);
    const g = rj(path.join(dir, `guess-${k}.json`));
    if (Array.isArray(g)) { guesses.push(...g); signals.push(timingSignal(path.join(dir, f), path.join(dir, `guess-${k}.json`), g.length, `readers ${k}`)); }
    // a verdict file is the legacy array or, since cycle 10, { run, items } (lib/readcheck-binding.js)
    const v = require("./readcheck-binding").verdictItems(rj(path.join(dir, `verdict-${k}.json`))).items;
    if (Array.isArray(v)) { verdicts.push(...v); signals.push(timingSignal(path.join(dir, `judge-${k}.json`), path.join(dir, `verdict-${k}.json`), v.length, `judges ${k}`)); }
  }
  // the CORRECT beats' stock reason is not counted (see checkReasons); only a failure must be explained per beat
  const j = checkReasons(verdicts, { who: "judges", pairs: [["why", "correctness"]], only: (p) => p.correctness !== "CORRECT" });
  // …unless the verdict has ZERO variation: every beat one verdict with one reason is a filled-in template, not a reading
  // (the-most-important-thing: 272/272 CORRECT, one "why"; a real run never had one verdict on >= 10 beats with a
  // shared reason — the stock CORRECT reason peaked at 93% beside varied verdicts)
  const verdictsSeen = new Set(verdicts.filter(Boolean).map((v) => v.correctness));
  if (verdicts.length >= MIN_N && verdictsSeen.size === 1) j.reasons.push(...checkReasons(verdicts, { who: "judges", pairs: [["why", "correctness"]] }).reasons.map((r) => `${r} on every beat (no verdict varies)`));
  return verdictOf([...checkGuesses(guesses, vis), ...j.reasons], [...j.signals, ...signals.filter(Boolean)]);
}

/**
 * The evidence verdict of a book's readcheck (the full run + every recheck-N on disk), for preview-state / preview-ready.
 * A readcheck tallied before this check (no `evidence` field) is checked from its files; with no files, the record decides.
 */
function readcheckEvidence(bookDir, record = null) {
  // a tally since cycle 10 records its id-set / run binding (readcheck.js); only such a record can say INVALID here —
  // an older record has no `binding` field and is read exactly as before (no retroactive flip)
  if (record && record.binding === "INVALID") {
    const e = record.evidence || {};
    return { ok: false, status: STATUS_INVALID, reasons: e.reasons || ["readcheck tally: the verdicts are not the answer to exactly these beats / this run"], signals: e.signals || [] };
  }
  const base = path.join(bookDir, "storyboard", "readcheck");
  let dirs = [];
  try { dirs = [base, ...fs.readdirSync(base).filter((d) => /^recheck-\d+$/.test(d)).map((d) => path.join(base, d))]; } catch { dirs = []; }
  dirs = dirs.filter((d) => fs.existsSync(path.join(d, "key.json")));
  if (!dirs.length) {
    const e = record && record.evidence;
    return e && e.status === STATUS_INVALID ? { ok: false, status: STATUS_INVALID, reasons: e.reasons || [], signals: e.signals || [] } : { ok: true, status: "OK", reasons: [], signals: [] };
  }
  const evs = dirs.map((d) => ({ from: d === base ? "full run" : path.basename(d), ...checkReadcheckDir(d) }));
  const bad = evs.filter((e) => !e.ok);
  const reasons = bad.flatMap((e) => e.reasons.map((x) => `${e.from}: ${x}`)), signals = evs.flatMap((e) => e.signals.map((x) => `${e.from}: ${x}`));
  return bad.length ? { ok: false, status: STATUS_INVALID, reasons, signals } : { ok: true, status: "OK", reasons: [], signals };
}

module.exports = { readcheckEvidence, STATUS_INVALID, checkMuteRun, checkMuteDir, runEvidence, checkReadcheckDir, isBoilerplate, checkBlind, checkReasons, checkGuesses, timingSignal, verdictOf, templateOf, topShare,
  THRESHOLDS: { MIN_N, SHARE_MESSAGE, SHARE_SEES, SHARE_EMPTY, SHARE_WHY, SHARE_SAME_REASON, TIME_FLOOR_S, TIME_PER_ITEM_S, TIME_COPY_S } };
