/**
 * readcheck-binding.js — are a readcheck folder's verdicts the answer to exactly ITS beats, of ITS run?
 * (cycle 10, 2026-11-04; mirrors lib/judge-binding.js of the mute test, cycle 9 P0b)
 *
 * Why: `readcheck.js tally` counted whatever verdict ids matched key.json — a short verdict file shrank n, a
 * duplicated id counted once with a silently chosen answer, an unknown id was dropped, an incomplete set was only a
 * warning; a full `prep` deleted the whole readcheck folder (older re-checks too); and nothing tied a verdict file to the
 * judge run that asked for it (paths are keyed by slug only, so two runs of one book write the same file names).
 * Rules per folder (the full run or one recheck-N); any → EVIDENCE_INVALID, neither PASS nor FAIL (no bar changes):
 *   ID SET (every run, legacy too — objective corruption):
 *     - key.json ids == the visible-K ids (each id in exactly one visible file, once);
 *     - for every visible-K: guess-K and verdict-K exist and hold exactly visible-K's ids — none missing, none extra,
 *       none twice.
 *   TOKEN + RUBRIC (runs prepared with a run token; a LEGACY folder — no judge-run.json — gets them as signals only):
 *     - prep writes run.json { run }; judge writes judge-run.json { run, prepRun, inputs: { K: { guess, judge } sha256 } };
 *       verdict-K.json must be { run, items } echoing judge-run.run; the prep run and the judged inputs must be unchanged;
 *       judge-K ids == visible-K ids;
 *     - every correctness is a rubric word (CORRECT | NEUTRAL | WRONG).
 * Pure: checkFolder() takes the folder's data; readFolder() only READS a folder (the regression scan uses both).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { duplicates } = require("./mute-ids");

const CORRECTNESS = new Set(["CORRECT", "NEUTRAL", "WRONG"]);
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const rb = (p) => { try { return fs.readFileSync(p); } catch { return null; } };

/** a verdict file: the legacy array, or { run, items } (token runs) → { items: [] | null, run, shape } */
function verdictItems(raw) {
  if (Array.isArray(raw)) return { items: raw, run: null, shape: "array" };
  if (raw && typeof raw === "object" && Array.isArray(raw.items)) return { items: raw.items, run: raw.run == null ? null : String(raw.run), shape: "object" };
  return { items: null, run: null, shape: raw == null ? "missing" : "invalid" };
}

/** the files whose bytes are a folder's evidence (prompts and notes are not) */
const EVIDENCE_FILE = /^(key|run|judge-run)\.json$|^(visible|guess|judge|verdict)-\d+\.json$/;
/** sha256 over the folder's evidence files, by name then bytes (sorted by name) */
function folderSha(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => EVIDENCE_FILE.test(f)).sort(); } catch { return null; }
  const h = crypto.createHash("sha256");
  for (const f of files) { h.update(f + "\0"); h.update(rb(path.join(dir, f)) || ""); h.update("\0"); }
  return h.digest("hex");
}

/** READ ONLY: one readcheck folder as data for checkFolder() */
function readFolder(dir) {
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return null; }
  const ks = files.map((f) => (f.match(/^visible-(\d+)\.json$/) || [])[1]).filter(Boolean).sort((a, b) => a - b);
  const chunks = ks.map((k) => {
    const g = rb(path.join(dir, `guess-${k}.json`)), j = rb(path.join(dir, `judge-${k}.json`));
    const parse = (b) => { try { return b == null ? null : JSON.parse(b.toString("utf8")); } catch { return undefined; } };
    return { k, visible: rj(path.join(dir, `visible-${k}.json`)), guess: parse(g), judge: parse(j), verdict: fs.existsSync(path.join(dir, `verdict-${k}.json`)) ? parse(rb(path.join(dir, `verdict-${k}.json`))) : null,
      guessSha: g ? sha(g) : null, judgeSha: j ? sha(j) : null };
  });
  return { dir, key: rj(path.join(dir, "key.json")), prepRun: rj(path.join(dir, "run.json")), judgeRun: rj(path.join(dir, "judge-run.json")), chunks };
}

const idsOf = (arr) => (Array.isArray(arr) ? arr.map((x) => (x && typeof x === "object" ? x.id : undefined)) : []);
const minus = (a, b) => { const B = new Set(b); return [...new Set(a)].filter((x) => !B.has(x)); };
const few = (a) => a.slice(0, 3).join(", ");

/** the id-set problems of `got` against `want` (one file) */
function idSetProblems(got, want, what) {
  const p = [];
  const dup = duplicates(got), missing = minus(want, got), extra = minus(got, want);
  if (dup.length) p.push(`${what} answers ${dup.length} beat(s) more than once (${few(dup)})`);
  if (missing.length) p.push(`${what} is missing ${missing.length} of ${want.length} beat(s) (${few(missing)}) — a short file would shrink n`);
  if (extra.length) p.push(`${what} answers ${extra.length} id(s) its visible file never showed (${few(extra.map(String))})`);
  return p;
}

/**
 * f = readFolder(dir) (or the same shape built in memory).
 * → { ok, reasons[], signals[], legacy, counted: Map(id → verdict) } — counted = the verdicts the tally may use: known
 *   ids, first answer each (so a broken folder is still recorded without crashing; it is INVALID, not counted as a pass).
 */
function checkFolder(f) {
  const reasons = [], signals = [], counted = new Map();
  const legacy = !(f && f.judgeRun);
  if (!f || !f.key || typeof f.key !== "object") return { ok: false, reasons: ["key.json missing or unreadable"], signals, legacy, counted };
  const keyIds = Object.keys(f.key);
  const chunks = f.chunks || [];
  const visAll = chunks.flatMap((c) => idsOf(c.visible));
  const strict = (msgs) => (legacy ? signals : reasons).push(...msgs.map((m) => (legacy ? `LEGACY (not counted): ${m}` : m)));
  if (!chunks.length) reasons.push("no visible-K.json in the folder — the verdicts cannot be tied to what the readers were shown");
  const vDup = duplicates(visAll);
  if (vDup.length) reasons.push(`the visible files show ${vDup.length} id(s) more than once (${few(vDup)})`);
  if (minus(keyIds, visAll).length || minus(visAll, keyIds).length) reasons.push(`key.json and the visible files name different beats (key ${keyIds.length}, visible ${visAll.length})`);
  const words = [];
  for (const c of chunks) {
    const want = idsOf(c.visible).filter((x) => x !== undefined);
    if (c.guess === null) reasons.push(`guess-${c.k}.json missing (${want.length} beats never read)`);
    else if (!Array.isArray(c.guess)) reasons.push(`guess-${c.k}.json is not a list`);
    else reasons.push(...idSetProblems(idsOf(c.guess), want, `guess-${c.k}.json`));
    const v = verdictItems(c.verdict);
    if (v.shape === "missing") { reasons.push(`verdict-${c.k}.json missing (${want.length} beats never judged)`); continue; }
    if (!v.items) { reasons.push(`verdict-${c.k}.json is not a verdict list`); continue; }
    reasons.push(...idSetProblems(idsOf(v.items), want, `verdict-${c.k}.json`));
    const W = new Set(want);
    for (const it of v.items) {
      if (!it || !W.has(it.id) || counted.has(it.id)) continue;
      counted.set(it.id, it);
      if (!CORRECTNESS.has(it.correctness) && words.length < 6) words.push(`verdict-${c.k}.json ${it.id}: correctness "${it.correctness}" is not a rubric word`);
    }
    if (!legacy) {
      if (v.shape !== "object") reasons.push(`verdict-${c.k}.json does not echo its judge run (a bare list; expected { "run": "${f.judgeRun.run}", "items": [...] })`);
      else if (v.run !== f.judgeRun.run) reasons.push(`verdict-${c.k}.json is not the answer to this judge run (run "${v.run || "—"}" ≠ "${f.judgeRun.run}")`);
      const inp = (f.judgeRun.inputs || {})[c.k] || {};
      if (inp.guess && inp.guess !== c.guessSha) reasons.push(`guess-${c.k}.json changed after its judge run was issued`);
      if (inp.judge && inp.judge !== c.judgeSha) reasons.push(`judge-${c.k}.json changed after its judge run was issued (another judge wrote over it)`);
      if (!Array.isArray(c.judge)) reasons.push(`judge-${c.k}.json missing or not a list`);
      else reasons.push(...idSetProblems(idsOf(c.judge), want, `judge-${c.k}.json`));
    }
  }
  if (words.length) strict(words);
  if (legacy) signals.push("LEGACY: prepared before readcheck run tokens (2026-11-04) — the verdicts' run could not be checked");
  else {
    const pr = f.prepRun && f.prepRun.run;
    if (f.judgeRun.prepRun && f.judgeRun.prepRun !== pr) reasons.push(`the folder was prepared again after its judge run (prep run "${pr || "—"}" ≠ "${f.judgeRun.prepRun}")`);
  }
  return { ok: reasons.length === 0, reasons, signals, legacy, counted };
}

module.exports = { CORRECTNESS, verdictItems, folderSha, readFolder, checkFolder, EVIDENCE_FILE };
