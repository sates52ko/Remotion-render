/**
 * relationship-staging.js — on by default since 2026-10-16 (ANTIDOTE_EXPERIMENT_RELATIONSHIP_STAGING=0 turns it off); inert unless the author selected staging and Gate B said STAGE.
 *
 * Turns an authored, source-grounded relationship record into a book-independent
 * staging spec for one mechanism class: CONTROL THROUGH A MESSAGE.
 *   controlling side --(message: a story, demands, ...)--> controlled side,
 *   optionally: the message marked false (only if the narration says so), an alternative
 *   method shown as rejected, a negated reading shown as crossed out, and a counter-action
 *   by the controlled side.
 *
 * Either side may be a group (several figures) or a single actor (count 1). Everything
 * book-specific (which side is which, labels, colours, counts) comes from the book's story
 * bible `groups` table, which must carry evidence. No cast member stands in for a class.
 * Fails closed: if a required piece is missing or ungrounded, it returns null and the scene
 * keeps its normal staging. Every cue frame comes from the narration's word timings.
 */
const fs = require("fs");
const path = require("path");

const REJECTED_KINDS = new Set(["gun"]);
const NEGATION_KINDS = new Set(["text"]);
const COUNTER_KINDS = new Set(["wheel"]);
const HEX = /^#[0-9a-fA-F]{6}$/;
const SOURCE_ROLES = new Set(["ruling", "controlling"]);
const TARGET_ROLES = new Set(["ruled", "controlled"]);

function groupSpec(groups, key, roles, defaultCount) {
  const g = key && groups && groups[key];
  if (!g || !roles.has(g.role)) return null;
  if (!g.evidence || !g.evidence.quote || !g.evidence.source) return null;
  if (!HEX.test(g.body || "") || !HEX.test(g.accent || "")) return null;
  const count = Number.isInteger(g.count) && g.count >= 1 ? g.count : defaultCount;
  return { key, label: String(g.label || key), body: g.body, accent: g.accent, count };
}

const tok = (w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, "");
// Cue point = the frame (relative to the scene start) where KEYWORD of the narration PHRASE is spoken,
// taken from the VTT word timings. Searched only inside the scene window. Null if not found.
function cueFor(ctx, phrase, keyword) {
  if (!ctx || !Array.isArray(ctx.words)) return null;
  const P = String(phrase).split(/\s+/).map(tok).filter(Boolean);
  const K = tok(keyword);
  const a = ctx.fromFrame / ctx.fps - 0.5, b = (ctx.fromFrame + ctx.durationFrames) / ctx.fps;
  const W = ctx.words.filter((x) => x.t >= a && x.t <= b).map((x) => ({ t: x.t, w: tok(x.w) }));
  for (let i = 0; i + P.length <= W.length; i++) {
    if (P.every((p, j) => W[i + j].w === p)) {
      const k = P.indexOf(K);
      const t = W[i + (k < 0 ? 0 : k)].t;
      return { local: Math.max(0, Math.round(t * ctx.fps) - ctx.fromFrame), seconds: t, phrase, keyword };
    }
  }
  return null;
}
const firstWord = (q) => String(q).split(/\s+/).filter(Boolean)[0] || "";
const ARTICLES = new Set(["a", "an", "the"]);
const firstContentWord = (q) => String(q).split(/\s+/).filter((w) => w && !ARTICLES.has(tok(w)))[0] || firstWord(q);
const NEG = /^(not|isnt|never|no|without)$/;
const negationWord = (q) => String(q).split(/\s+/).find((w) => NEG.test(tok(w))) || firstWord(q);

function relationshipStaging(rel, bookDir, ctx) {
  if (!rel || typeof rel !== "object") return null;
  let bible = null;
  try { bible = JSON.parse(fs.readFileSync(path.join(bookDir, "story-bible.json"), "utf8")); } catch { return null; }
  const groups = bible && bible.groups;
  const ruling = groupSpec(groups, rel.source && rel.source.group, SOURCE_ROLES, 3);
  const ruled = groupSpec(groups, rel.target && rel.target.group, TARGET_ROLES, 5);
  const means = rel.means || {};
  const label = means.label && means.label.quote ? String(means.label.quote) : null;
  const falseMarker = !!(means.falseMarker && means.falseMarker.quote);
  if (!ruling || !ruled || !label) return null;

  // the effect on the controlled side is drawn only for the relation the narration states:
  // "keep (them) down" lowers the controlled side a level; any other relation draws no effect.
  const relText = `${(rel.relation && rel.relation.value) || ""} ${(rel.relation && rel.relation.evidence && rel.relation.evidence.quote) || ""}`;
  const lowers = /keep (them )?down|subjugat/i.test(relText);

  const rj = rel.rejectedMethod || null;
  const ng = rel.negation || null;
  const ca = rel.counterAction || null;
  const rejected = rj && REJECTED_KINDS.has(rj.icon) && rj.scope ? { kind: rj.icon, label: String(rj.scope).toUpperCase() } : null;
  const negation = ng && NEGATION_KINDS.has(ng.icon) && ng.scope && ng.value ? { kind: ng.icon, word: String(ng.value).toUpperCase(), label: String(ng.scope).toUpperCase() } : null;
  const counterQuotes = ca && Array.isArray(ca.label) ? ca.label.map((x) => x && x.quote).filter(Boolean) : [];
  const counter = ca && COUNTER_KINDS.has(ca.icon) && counterQuotes.length ? { kind: ca.icon, label: counterQuotes.join(" ").replace(/[.,;:]+$/, "").toUpperCase() } : null;
  if ((rj && !rejected) || (ng && !negation) || (ca && !counter)) return null; // present but ungrounded: fail closed
  if (!rejected && !negation && !counter && !falseMarker) return null; // nothing beyond the message: no mechanism to stage

  const cues = { means: cueFor(ctx, label, firstContentWord(label)) };
  if (falseMarker) cues.lie = cueFor(ctx, means.falseMarker.quote, "lie");
  if (rejected) cues.rejected = cueFor(ctx, rj.scope, firstWord(rj.scope));
  if (negation) cues.negation = cueFor(ctx, ng.evidence && ng.evidence.quote ? ng.evidence.quote : ng.scope, negationWord(ng.scope));
  if (counter) cues.counter = cueFor(ctx, ca.cue && ca.cue.quote ? ca.cue.quote : counterQuotes[0], (ca.cue && ca.cue.keyword) || firstWord(counterQuotes[0]));
  if (Object.values(cues).some((c) => !c)) return null; // timing must come from the narration

  const spec = {
    mechanism: falseMarker || rejected ? "control-by-narrative" : "control-by-message",
    rulingGroup: ruling,
    ruledGroup: ruled,
    means: falseMarker ? { label: label.toUpperCase(), marker: "LIE" } : { label: label.toUpperCase() },
  };
  if (rejected) spec.rejected = rejected;
  if (negation) spec.negation = negation;
  if (counter) spec.counterAction = counter;
  if (!lowers) spec.effect = "none";
  spec.cues = cues;
  return spec;
}

module.exports = { relationshipStaging };
