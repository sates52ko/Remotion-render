/**
 * frame-risk.js — config-only reasons to look at a beat's real frame first (framecheck.js --n).
 * A flag is a reason to LOOK, never a finding.
 *
 * Measured 2026-10-16 (scripts/frame-risk-eval.js: 23 Antidote books, the latest blind mute run of each,
 * 690 judged frames; base WRONG 5%, dead 8%):
 *   bare     339 frames  WRONG 7% (not bare 3%)   dead 10% (6%)   -> used for selection
 *   strike    80 frames  WRONG 10% (not 4%)       dead 8%         -> used for selection
 *   icon     141 frames  WRONG 3% (not 5%)        dead 7%         -> reported only (no lift: authors already avoid them)
 *   polarity  21 frames  WRONG 0%                 dead 10%        -> reported only (no lift)
 * Leave-one-book-out, the best config score put 47% of WRONG frames in its top third: config predicts
 * misreads weakly. That is why framecheck looks at EVERY beat by default and --n is only a shortcut.
 */
const NEG_FACES = new Set(["sad", "worried", "angry", "afraid"]);
const POS_FACES = new Set(["happy", "smirk"]);
const POS_WORDS = /\b(relief|relieved|free|freedom|finally|better|respect|calm|peace|happy|joy|hope|hopeful|confident|strength|win|wins|won|succeed\w*|love[sd]?|proud|safe|healthy|easier|lighter)\b/i;
const NEG_WORDS = /\b(fear|afraid|guilt|shame|anxiety|anxious|dread|pain|cruel|death|dead|die[sd]?|kill\w*|loss|lost|terrible|disaster|tragedy|suffer\w*|hate[sd]?|angry|rage|resent\w*|miserable|exhausted|drained|failure|betray\w*|war|destroy\w*|horror|monstrous)\b/i;
const SELECT_FLAGS = ["bare", "strike"];

function iconsOf(s) {
  const chars = (s.characters || []).filter((c) => !c.silhouette);
  return [s.concept, ...(s.props || []).map((p) => p.type), ...chars.map((c) => c.holds).flat()].filter((x) => typeof x === "string" && x);
}

function risks(s, readings = {}) {
  const chars = (s.characters || []).filter((c) => !c.silhouette);
  const icons = iconsOf(s);
  const out = [];
  if (chars.length && !icons.length && !s.diagram && !s.relationshipStaging) out.push("bare");
  icons.filter((i) => readings[i] && readings[i].neverFor).forEach((i) => out.push(`icon:${i}`));
  const faces = [...new Set(chars.map((c) => c.expression || "neutral"))];
  const narr = String(s._narration || "");
  if (faces.length === 1 && ((NEG_FACES.has(faces[0]) && POS_WORDS.test(narr) && !NEG_WORDS.test(narr)) ||
      (POS_FACES.has(faces[0]) && NEG_WORDS.test(narr) && !POS_WORDS.test(narr)))) out.push(`polarity:${faces[0]}`);
  if ((s.texts || []).some((t) => t.style === "strike")) out.push("strike");
  return out;
}
const selectionFlags = (s, readings) => risks(s, readings).filter((r) => SELECT_FLAGS.includes(r.split(":")[0]));

module.exports = { risks, selectionFlags, iconsOf, SELECT_FLAGS };
