/**
 * staging-signature.js — what a muted viewer can see in an Antidote scene, as comparable parts, plus the
 * face-word helpers the blind tools share. Used by similar-candidates.js (tiers A/B/C) and cause-ledger.js
 * (REVIEW candidates + face/rater rules). Pure functions, no I/O.
 */

function signature(s) {
  const chars = (s.characters || []).filter((c) => !c.silhouette);
  const icons = new Set([s.concept, ...(s.props || []).map((p) => p.type), ...chars.map((c) => c.holds).flat()].filter((x) => typeof x === "string" && x));
  const faces = chars.map((c) => c.expression || "neutral").sort();
  const actions = chars.map((c) => c.action || "stand").sort();
  const pairs = chars.map((c) => `${c.expression || "neutral"}|${c.action || "stand"}`).sort();
  const textStyles = [...new Set((s.texts || []).map((t) => t.style || "plain"))].sort();
  const diagram = s.diagram ? s.diagram.type || "diagram" : null;
  const staged = !!s.relationshipStaging;
  return { shot: s.shot || null, icons: [...icons].sort(), faces, actions, pairs, textStyles, diagram, staged,
    cast: chars.map((c) => c.identity || c.rig).sort(), bare: chars.length > 0 && icons.size === 0 && !diagram && !staged };
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const shares = (a, b) => a.some((x) => b.includes(x));
// A same staging · B same picture core · C shares a part (null = unrelated, or a diagram/staged relation)
function tier(f, c) {
  const iconsMatch = f.bare ? c.bare : (f.icons.length > 0 && same(f.icons, c.icons));
  if (f.diagram || f.staged) return null; // diagrams/staged relations are compared by content, not parts
  if (iconsMatch && same(f.faces, c.faces) && same(f.actions, c.actions) && f.shot === c.shot) return "A";
  if (iconsMatch && f.faces.length && same(f.faces, c.faces)) return "B";
  const faceAction = shares(f.pairs, c.pairs);
  if (shares(f.icons, c.icons) || faceAction) return "C";
  return null;
}
const describeSig = (g) => [g.shot, g.bare ? "bare (no icon)" : `icons ${g.icons.join("+") || "-"}`,
  `faces ${g.faces.join("+") || "-"}`, `actions ${g.actions.join("+") || "-"}`, g.textStyles.includes("strike") ? "strike text" : null,
  g.diagram ? `diagram ${g.diagram}` : null, g.staged ? "relationship staged" : null].filter(Boolean).join(" · ");

// Face words a blind viewer (or a judge) uses, by mood class; configured expression -> class.
const FACE_WORDS = { positive: /\b(smil\w*|grin\w*|happy|cheerful|joyful|beaming|laugh\w*|pleased)\b/i,
  negative: /\b(frown\w*|worried|anxious|sad|upset|angry|scowl\w*|afraid|scared|distress\w*|concerned|stern|glum|crying)\b/i,
  neutral: /\b(calm|neutral|blank|flat|expressionless|impassive|composed)\b/i };
const FACE_CLASS = { happy: "positive", smirk: "positive", sad: "negative", worried: "negative", angry: "negative", afraid: "negative", neutral: "neutral", blank: "neutral" };
const faceClassesIn = (text) => Object.keys(FACE_WORDS).filter((k) => FACE_WORDS[k].test(String(text || "")));

module.exports = { signature, same, shares, tier, describeSig, FACE_WORDS, FACE_CLASS, faceClassesIn };
