/**
 * operator-approvals.js — the operator's approvals for ROUTINE production work, recorded once per book and attempt so a
 * new session does not ask again (books/<slug>/operator-approvals.json, append-only).
 *
 * Why (2026-11-03, Hamnet): the operator approved a third fix round, the Vox re-generation of 11 filtered images (with a
 * call cap) and keeping the Vox engine — in chat. The next session saw none of it: preview-state's fix-round limit is a
 * constant (MAX_FIX_ROUNDS = 2), the image cost gate has no record, and `storyboard.js prep` reset
 * book.engineCheck.confirmed to false on every run without --confirm-engine and printed "Ask the operator" again. The
 * operator was asked the same three questions three times. Render approvals bound to renderInputHash
 * (render-decisions.json, render.js --accept-quality-debt / --authorize-render) were never re-asked: they are records.
 *
 * One record = { id, at, words, scope, attempt, limits, used[] }:
 *   words    the operator's verbatim words (>= 6 words) — never a paraphrase, never an agent's own summary
 *   scope    fixRounds   limits {max}                total fix rounds allowed (preview-state uses max(2, max))
 *            images      limits {beats[], maxCalls}  Vox: re-generate exactly these beats' images, at most maxCalls calls
 *            engineKeep  limits {conditions}         keep book.json's engine despite the narration check
 *            technicalFix limits {files[] | beats[]} a named technical fix the operator allowed
 *   attempt  {engine, productionBase, audioSha256, vttSha256} — the approval holds only for THIS attempt: a new engine,
 *            a moved pin, a new recording or a new VTT is a new question (status says which field changed)
 *   used[]   {at, n, note} appended by `preview-state.js approval-use` (images: n = Flux calls spent)
 * NEVER here: quality debt, the production render, upload, publish, cleanup — each keeps its own explicit record or
 * order (render-decisions.json bound to renderInputHash; the operator's upload / cleanup command). The writer refuses
 * them, and render-decision.js / render-preflight.js never read this file.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const SCOPES = ["fixRounds", "images", "engineKeep", "technicalFix"];
// spelled every way an agent might try: these approvals live elsewhere, with their own binding
const REFUSED = /^(quality[-_ ]?debt|render|production[-_ ]?render|final[-_ ]?render|upload|publish|cleanup|clean[-_ ]?up|purge)$/i;
const MIN_WORDS = 6;
// the brief's CLI spellings (fix-rounds / image-calls / engine-confirm) name the same scopes
const ALIASES = { "fix-rounds": "fixRounds", "image-calls": "images", "engine-confirm": "engineKeep", "technical-fix": "technicalFix" };
const canonScope = (s) => ALIASES[String(s || "").trim()] || String(s || "").trim();
const NOTE = "operator approvals for routine production work (preview-state.js approve). Append-only. A record matches only its attempt (engine, pin, audio, VTT). Quality debt, render, upload, publish and cleanup are NEVER recorded here.";

const fileOf = (root, slug) => path.join(root, "books", slug, "operator-approvals.json");
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const shaFile = (p) => { try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } catch { return null; } };

/** the attempt an approval is bound to, as it is NOW on disk */
function attemptOf(root, slug) {
  const B = path.join(root, "books", slug);
  const book = readJSON(path.join(B, "book.json"), {}) || {};
  const pin = readJSON(path.join(B, "production-base.json"));
  let head = null;
  if (!(pin && pin.productionBase)) { try { head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {} }
  let audioRel = null;
  try { audioRel = require("./audio-source").rawAudioFor(root, `audio/${slug}.mastered.m4a`, slug); } catch {}
  return {
    engine: book.engine || null,
    productionBase: (pin && pin.productionBase) || head || null,
    audioSha256: audioRel ? shaFile(path.join(root, "public", audioRel)) : null,
    vttSha256: shaFile(path.join(root, "public", "captions", `${slug}.vtt`)),
  };
}

function load(root, slug) {
  const j = readJSON(fileOf(root, slug));
  return j && Array.isArray(j.approvals) ? j : { note: NOTE, approvals: [] };
}

const isIds = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => (typeof x === "string" && x.trim()) || Number.isInteger(x));
/** null = valid, else the reason */
function limitsProblem(scope, limits) {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) return "--limits must be a JSON object";
  if (scope === "fixRounds") return Number.isInteger(limits.max) && limits.max >= 1 && limits.max <= 10 ? null : "fixRounds needs limits {\"max\": <total fix rounds, 1..10>}";
  if (scope === "images") return isIds(limits.beats) && Number.isInteger(limits.maxCalls) && limits.maxCalls >= 1 ? null : "images needs limits {\"beats\": [\"beat-012\", …], \"maxCalls\": <N>}";
  if (scope === "engineKeep") return typeof limits.conditions === "string" && limits.conditions.trim() ? null : "engineKeep needs limits {\"conditions\": \"<what the operator kept it under>\"}";
  if (scope === "technicalFix") return isIds(limits.files) || isIds(limits.beats) ? null : "technicalFix needs limits {\"files\": [\"…\"]} or {\"beats\": [\"…\"]}";
  return `unknown scope ${scope}`;
}

/** append one approval; throws with the reason on a refusal (nothing is written) */
function record(root, slug, { scope, limits, words, by = process.env.USERNAME || process.env.USER || "agent", at = new Date().toISOString() }) {
  scope = canonScope(scope);
  if (!scope || REFUSED.test(String(scope).trim())) throw new Error(`scope "${scope}" is never recorded here: quality debt and the production render are render.js --accept-quality-debt / --authorize-render (bound to the render input); upload, publish and cleanup are the operator's own order each time`);
  if (!SCOPES.includes(scope)) throw new Error(`unknown scope "${scope}" (allowed: ${SCOPES.join(", ")})`);
  const w = String(words || "").trim();
  if (w.split(/\s+/).filter(Boolean).length < MIN_WORDS) throw new Error(`--words must be the operator's own words, verbatim (at least ${MIN_WORDS} words) — never an agent's summary`);
  const bad = limitsProblem(scope, limits);
  if (bad) throw new Error(bad);
  if (!fs.existsSync(path.join(root, "books", slug, "book.json"))) throw new Error(`books/${slug}/book.json missing`);
  const j = load(root, slug);
  const id = `appr-${j.approvals.length + 1}`;
  const rec = { id, at, by: String(by), book: slug, words: w, scope, attempt: attemptOf(root, slug), limits, used: [] };
  j.approvals.push(rec);
  j.note = NOTE;
  fs.writeFileSync(fileOf(root, slug), JSON.stringify(j, null, 2) + "\n");
  return rec;
}

/** append a use (images: n = calls spent) to an existing record — the record itself is never rewritten otherwise */
function use(root, slug, id, { n = 1, note = "", at = new Date().toISOString() } = {}) {
  const j = load(root, slug);
  const rec = j.approvals.find((a) => a.id === id);
  if (!rec) throw new Error(`no approval ${id} in books/${slug}/operator-approvals.json`);
  if (!Number.isInteger(n) || n < 0) throw new Error("--n must be a whole number >= 0");
  rec.used = [...(rec.used || []), { at, n, note: String(note).slice(0, 200) }];
  fs.writeFileSync(fileOf(root, slug), JSON.stringify(j, null, 2) + "\n");
  return rec;
}

const FIELDS = { engine: "engine", productionBase: "pin", audioSha256: "audio", vttSha256: "VTT" };
/** {matches, stale}: matches hold for the attempt on disk now; stale carry `why` (which field changed) */
function matching(root, slug, scope = null) {
  const all = load(root, slug).approvals;
  if (!all.length) return { matches: [], stale: [], attempt: null };   // no file: no hashing (candidates walks every book)
  const now = attemptOf(root, slug);
  const out = { matches: [], stale: [], attempt: now };
  for (const a of all) {
    if (scope && a.scope !== scope) continue;
    if (!SCOPES.includes(a.scope)) continue;   // a hand-written refused scope is never honoured
    if (a.book && a.book !== slug) continue;   // a record copied from another book never carries over
    const was = a.attempt || {};
    const changed = Object.keys(FIELDS).filter((k) => (was[k] || null) !== (now[k] || null));
    if (changed.length) out.stale.push({ ...a, why: changed.map((k) => `${FIELDS[k]} changed (${String(was[k] || "-").slice(0, 8)} → ${String(now[k] || "-").slice(0, 8)})`) });
    else out.matches.push(a);
  }
  return out;
}

const usedCount = (a) => (a.used || []).reduce((s, u) => s + (Number.isInteger(u.n) ? u.n : 0), 0);
/** the latest matching approval of a scope (later words supersede earlier ones) */
const latest = (root, slug, scope) => { const m = matching(root, slug, scope).matches; return m.length ? m[m.length - 1] : null; };

/** one line per approval for a status print: id, scope, limits used/left, the first 80 chars of the words */
function describe(a, { fixRoundsUsed = null } = {}) {
  const L = a.limits || {};
  const lim = a.scope === "fixRounds" ? `rounds ${fixRoundsUsed == null ? "?" : fixRoundsUsed}/${L.max}`
    : a.scope === "images" ? `beats ${L.beats.join(",")}; calls used ${usedCount(a)}/${L.maxCalls}, left ${Math.max(0, L.maxCalls - usedCount(a))}`
    : a.scope === "engineKeep" ? `conditions: ${L.conditions}`
    : `${L.files ? `files ${L.files.join(",")}` : `beats ${L.beats.join(",")}`}${(a.used || []).length ? `; used ${(a.used || []).length}×` : ""}`;
  const w = a.words.length > 80 ? `${a.words.slice(0, 80)}…` : a.words;
  return `${a.id} ${a.scope} · ${lim} · "${w}"`;
}

module.exports = { SCOPES, ALIASES, canonScope, MIN_WORDS, fileOf, attemptOf, load, record, use, matching, latest, usedCount, describe, limitsProblem };
