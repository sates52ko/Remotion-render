#!/usr/bin/env node
/**
 * single-relation-scan.js — candidate discovery + contract validation for the single-relation capability
 * (scripts/lib/single-relation.js, Level 1, default OFF). READ-ONLY on the book: it never edits art.json or the config,
 * and it never opts a book in (that is apply-single-relation.js, and only after Level 2 / an operator decision).
 *
 *   node scripts/single-relation-scan.js scan     --slug=<slug> [--book-root=<checkout>] [--out=<dir>] [--max=20]
 *       → <out>/candidates.json: every beat whose narration STATES a cause → effect while the scene shows no object /
 *         diagram that could carry the effect (people + words only). Each candidate: sceneIndex, sceneId, evidence,
 *         cause, effect, currentLimitation, proposedRepresentation, expectedUnderstanding, risk / fallback,
 *         inputHash. Beats with a planned / hypothetical / negated / question cue are listed as REJECTED with the reason.
 *         Zero candidates is a valid result.
 *   node scripts/single-relation-scan.js validate --slug=<slug> [--book-root=<checkout>] [--out=<dir>]
 *       → validates EACH <out>/contracts/<sceneIndex>.json on its own (one invalid contract never blocks the others)
 *         against that scene's narration; writes <out>/contracts.json: per contract the author, input hash, validation
 *         result, scene index and the previous scene id. apply-single-relation.js stays atomic over what it is given.
 * <out> defaults to books/<slug>/single-relation/ in the book root. Antidote only; published books are refused.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const R = require("./lib/single-relation");

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const cmd = process.argv[2];
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex").slice(0, 16);
// a STATED cause → effect (narrower than the v1 causal list: "when", "if", "by", "so" alone are too common)
const CAUSE_FWD = /\b(leads? to|led to|results? in|resulted in|causes?|caused|turns? (?:it |them |you )?into|drives?|drove|forces?|forced|makes?|made|kills?|killed|destroys?|destroyed|prevents?|prevented|stops?|stopped|drains?|drained|shrinks?|shrank|grows?|grew|lets?|allows?|allowed|enables?|enabled|pushes|pushed|creates?|created|produces?|produced|triggers?|triggered|so that|therefore|as a result|which means|that'?s why)\b/i;
const CAUSE_BWD = /\b(because(?: of)?|due to|thanks to|since)\b/i;
const sentences = (t) => String(t || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);
const trimPhrase = (s, n = 10) => words(String(s || "").replace(/^[,;:\s-]+|[,;:\s-]+$/g, "")).slice(0, n).join(" ");

function bookPaths() {
  const slug = args.slug;
  if (!slug) { console.error("--slug required"); process.exit(2); }
  const root = path.resolve(args["book-root"] || path.join(__dirname, ".."));
  const B = path.join(root, "books", slug);
  const out = path.resolve(args.out || path.join(B, "single-relation"));
  let published = false;
  try { published = new RegExp(`\\b${slug.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`).test(fs.readFileSync(path.join(root, "PUBLISHED_BOOKS.md"), "utf8")); } catch { /* none */ }
  return { slug, root, B, out, published };
}

// phrases that look causal but are not ("let's look", "made up of", "makes sense") and claims a viewer must not take as
// the narrator's own ("everyone thinks …", "you might think …")
const NOT_CAUSAL = /\b(let'?s|made up of|makes? sense|make sure|made it (?:to|through)|makes? no sense)\b/gi;
const REPORTED = /\b(everyone|people|most people|they|many) (thinks?|believes?|assumes?|says?)\b|\b(i hear|you might think|the myth|the misconception)\b/i;
const DISCOURSE = /\b(for a second|stop (?:here|the momentum)|because i think|let me|let'?s (?:zoom|clarify|look|talk|dig|go|pause|unpack)|i have to (?:stop|interject|push back|jump in)|go for it|for the listener)\b/i;
// classes fresh authors rejected in cycles 14–15 (16 of 21 skips; audit/c16): filtered before an author is paid for them.
// Kept on purpose: "once you stop …" (radical-compassion 128), an inner-state EFFECT ("impossible to think", knave 99).
const AUTHOR_REJECTS = [
  { kind: "obligation / advice", re: /\b(have to|has to|need to|needs to|must|ought to|should)\b/i },
  { kind: "conditional", re: /\b(if|unless|next time|in case)\b/i },
  { kind: "quoted speech / opinion", re: /["“”]/ },
  { kind: "evaluation / identity", re: /\b(proves? (?:that )?(?:you|he|she|they) (?:are|is)|feels? [\w ]{0,30}\bbecause|is (?:a|an) (?:\w+ )?(?:chilling|brilliant|great|terrible|fascinating|powerful) \w+ because)\b/i },
  { kind: "an end that is only a pronoun", test: (s, rel) => [rel.cause, rel.effect].some((p) => /^(it|this|that|they|he|she)\b/i.test(p) && words(p).length <= 3) },
].map((x) => ({ ...x, test: x.test || ((s) => x.re.test(s)) }));
/** the relational-motion mechanism a cue suggests (the author decides; lib/single-relation.js MECHANISMS) */
function proposeMechanism(sentence) {
  const t = String(sentence).toLowerCase();
  if (/\b(gives?|gave|takes?|took|steals?|stole|hands?|transfers?|moves? .* to|passes?|wins?|loses? .* to)\b/.test(t)) return "transfer";
  if (/\b(piles?|builds? up|accumulatw*|overloadw*|adds? up|stacks?)\b/.test(t)) return "accumulation";
  if (/\b(drains?|depletes?|loses?|lost|shrinks?|erodes?|destroys?|kills?|crushes?)\b/.test(t)) return "depletion";
  if (/\b(restores?|recovers?|grows?|rebuilds?|boosts?|raises?)\b/.test(t)) return "recovery";
  if (/\b(removes?|clears?|stops?|eliminates?|breaks? through|lifts?)\b/.test(t)) return "removal";
  if (/\b(turns? (?:w+ )?into|transforms?|becomes?)\b/.test(t)) return "transformation";
  return "cause-effect";
}
/** split one causal sentence into cause / effect phrases (heuristic — the contract author decides) */
function splitRelation(s0) {
  if (!/[.!]\s*$/.test(s0) || words(s0).length < 7) return null; // a whole statement, not a caption fragment
  if (DISCOURSE.test(s0)) return null; // the hosts talking about the conversation, not the book's content
  const s = s0.replace(NOT_CAUSAL, (m) => m.replace(/[a-z]/gi, "_"));
  const b = s.match(CAUSE_BWD);
  if (b) { const [eff, cau] = [s.slice(0, b.index), s.slice(b.index + b[0].length)]; if (words(eff).length >= 3 && words(cau).length >= 3) return { cause: trimPhrase(s0.slice(b.index + b[0].length)), effect: trimPhrase(s0.slice(0, b.index)), cue: b[0] }; }
  const f = s.match(CAUSE_FWD);
  if (f) { const [cau, eff] = [s.slice(0, f.index), s.slice(f.index + f[0].length)]; if (words(cau).length >= 3 && words(eff).length >= 3) return { cause: trimPhrase(s0.slice(0, f.index)), effect: trimPhrase(s0.slice(f.index + f[0].length)), cue: f[0] }; }
  return null;
}

function scan() {
  const P = bookPaths();
  // a published book is frozen: refused — except a read-only EXPERIMENT scan (--experiment) whose output lies outside the
  // book's folder (pre-registered holdouts read published configs; they never write into them)
  const outside = !path.resolve(P.out).startsWith(path.resolve(P.B) + path.sep);
  if (P.published && !(args.experiment && outside)) { console.error(`✗ ${P.slug} is published (frozen) — no scan${outside ? " (a read-only experiment scan needs --experiment)" : ""}`); process.exit(1); }
  const cfgPath = path.join(P.B, "config.antidote.json");
  if (!fs.existsSync(cfgPath)) { console.log(`${P.slug}: no config.antidote.json yet (storyboard not built) — 0 candidates`); return writeOut(P, [], [], { reason: "no config" }); }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const cands = [], rejected = [];
  cfg.scenes.forEach((sc, i) => {
    if (sc.shot === "chapterCard" || sc.chapterCard) return;
    const narration = sc._narration || "";
    const visible = (sc.props || []).length > 0 || !!sc.concept || !!sc.diagram;
    for (const s of sentences(narration)) {
      const rel = splitRelation(s);
      if (!rel) continue;
      const hard = R.HARD.find((h) => h.re.test(s)) || (REPORTED.test(s) ? { kind: "reported / rejected-premise", re: REPORTED } : null)
        || AUTHOR_REJECTS.find((h) => h.test(s, rel));
      const base = { sceneIndex: i, sceneId: sc.id, evidence: s, cause: rel.cause, effect: rel.effect, cue: rel.cue, inputHash: sha({ narration, shot: sc.shot, props: sc.props, concept: sc.concept, diagram: sc.diagram }) };
      if (hard) { rejected.push({ ...base, rejectClass: hard.kind, reason: `${hard.kind} cue${hard.re ? ` ("${(s.match(hard.re) || [""])[0]}")` : ""} — not an asserted, drawable relation; stays as authored (or a quote card)` }); continue; }
      if (visible) { rejected.push({ ...base, reason: "the scene already shows an object / diagram that can carry the effect — keep the authored storyboard" }); continue; }
      cands.push({ ...base,
        currentLimitation: `people${(sc.texts || []).length ? " + on-screen words" : ""} only (shot ${sc.shot}) — no object or diagram shows the effect; a muted viewer gets it from words or a face`,
        proposedRepresentation: "B cause → effect: the cause marked, a token, a pause, the effect visibly changes another entity (one locked frame)",
        proposedMechanism: proposeMechanism(s),
        expectedUnderstanding: `${rel.cause} → ${rel.effect}`,
        risk: "the two ends must be drawable as entities named in the narration; if not, or if the author finds the claim not asserted, fall back to the authored scene (or a quote card)" });
      break; // one candidate per scene: its first stated relation
    }
  });
  // strongest first: a forward cue with both ends short and concrete beats a long "because" clause
  const score = (c) => (CAUSE_FWD.test(c.cue) ? 2 : 1) - Math.abs(words(c.cause).length - 4) * 0.05 - Math.abs(words(c.effect).length - 5) * 0.05;
  cands.sort((a, b) => score(b) - score(a) || a.sceneIndex - b.sceneIndex);
  const max = Number(args.max || 20);
  return writeOut(P, cands.slice(0, max), rejected, { scenes: cfg.scenes.length, causalBeats: cands.length + rejected.length, listed: Math.min(max, cands.length), configHash: sha(fs.readFileSync(cfgPath, "utf8")) });
}

function writeOut(P, cands, rejected, meta) {
  fs.mkdirSync(P.out, { recursive: true });
  const rec = { schema: "single-relation-candidates/1", slug: P.slug, at: new Date().toISOString(), capability: R.SCHEMA, level: "Level 1 — default OFF; candidates are proposals, nothing is applied", ...meta, candidates: cands, rejected };
  fs.writeFileSync(path.join(P.out, "candidates.json"), JSON.stringify(rec, null, 1));
  console.log(`${P.slug}: ${cands.length} candidate(s), ${rejected.length} rejected → ${path.join(P.out, "candidates.json")}`);
  return rec;
}

function validateAll() {
  const P = bookPaths();
  const cfg = JSON.parse(fs.readFileSync(path.join(P.B, "config.antidote.json"), "utf8"));
  const cast = (cfg.meta && cfg.meta.cast) || {};
  const ctx0 = { cast: Object.keys(cast), castNames: Object.entries(cast).flatMap(([k, v]) => [k, (v && v.name) || ""]).filter(Boolean), castLabels: Object.fromEntries(Object.entries(cast).map(([k, v]) => [k, (v && v.name) || k])) };
  const dir = path.join(P.out, "contracts");
  const prov = (() => { try { return JSON.parse(fs.readFileSync(path.join(P.out, "contracts.json"), "utf8")).contracts || {}; } catch { return {}; } })();
  const outRec = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x)) : []) {
    const i = Number(f.replace(".json", "")), sc = cfg.scenes[i];
    let c, errors;
    try { c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { errors = [`invalid JSON: ${e.message}`]; }
    if (!sc) errors = [`no scene ${i}`];
    if (!errors) errors = R.validate(c, { ...ctx0, narration: sc._narration || "" });
    outRec[i] = { sceneIndex: i, sceneId: sc && sc.id, previousSceneId: i > 0 && cfg.scenes[i - 1] ? cfg.scenes[i - 1].id : null,
      author: (prov[i] && prov[i].author) || (c && c._author) || "unknown", inputHash: sc ? sha({ narration: sc._narration, shot: sc.shot }) : null,
      contractHash: c ? sha(c) : null, valid: errors.length === 0, errors, review: c && !errors.length ? R.review(c) : null };
  }
  const vals = Object.values(outRec);
  fs.writeFileSync(path.join(P.out, "contracts.json"), JSON.stringify({ schema: "single-relation-contracts/1", slug: P.slug, at: new Date().toISOString(), valid: vals.filter((v) => v.valid).map((v) => v.sceneIndex), invalid: vals.filter((v) => !v.valid).map((v) => v.sceneIndex), contracts: outRec }, null, 1));
  console.log(`${P.slug}: ${vals.filter((v) => v.valid).length} valid, ${vals.filter((v) => !v.valid).length} invalid → contracts.json`);
  for (const v of vals.filter((x) => !x.valid)) console.log(`  ✗ scene ${v.sceneIndex}: ${v.errors.join(" | ")}`);
}

if (require.main === module) {
  if (cmd === "scan") scan();
  else if (cmd === "validate") validateAll();
  else { console.error("usage: single-relation-scan.js scan|validate --slug=<slug> [--book-root=<dir>] [--out=<dir>]"); process.exit(2); }
}
/** the reject class a sentence falls in (null = still a candidate shape) — for tests and reports */
function rejectClass(s) { const rel = splitRelation(s); if (!rel) return "no stated relation"; const h = R.HARD.find((x) => x.re.test(s)) || (REPORTED.test(s) ? { kind: "reported" } : null) || AUTHOR_REJECTS.find((x) => x.test(s, rel)); return h ? h.kind : null; }
module.exports = { splitRelation, rejectClass, proposeMechanism, CAUSE_FWD, CAUSE_BWD };
