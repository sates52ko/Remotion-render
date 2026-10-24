// The SECOND person in an authored two-person beat (2026-10-22). One definition for storyboard merge (what an
// author may write), plan-antidote (what the partner does) and the lock (what gate-authorship holds them to).
//
// - A verb that only reads with two people carries its partner's body with it (measured 2026-09-28 / 2026-10-20:
//   alone, fighting read as "fuming", grabbing as "walking", struggling as "recoiling"; an embrace is two people
//   holding each other). That pairing is the verb's physical contract, not an invented reaction.
// - Anything else about the partner comes from the author (`partnerAction`, `partnerExpression`) or stays neutral /
//   idle. The engine never derives a partner feeling from the lead's (no happy -> worried, celebrate -> slump).
const PAIRED = Object.freeze({ fighting: "fighting", grabbing: "struggling", struggling: "grabbing", embrace: "embrace" });
// deeds that need their own setup (an object in hand, a second person of their own): never a free partner choice
const NOT_A_PARTNER_CHOICE = new Set(["take", ...Object.keys(PAIRED)]);

/** The partner's body for an authored two-person beat: the verb's pair, else the author's choice, else idle. */
function partnerActionFor(leadAction, authored) {
  if (PAIRED[leadAction]) return PAIRED[leadAction];
  return authored || "idle";
}

/** Merge-time problems for an authored beat's partnerAction (empty = valid). `actions` = the action vocabulary. */
function partnerActionProblems(beat, actions) {
  const out = [];
  const pa = beat.partnerAction;
  if (pa == null) return out;
  const two = Array.isArray(beat.cast) && beat.cast.length === 2;
  if (!two) { out.push(`partnerAction is the second cast member's body: it needs exactly two cast members (got ${JSON.stringify(beat.cast)})`); return out; }
  if (actions && !actions.has(pa)) { out.push(`partnerAction "${pa}" is not an action (${[...actions].join(", ")})`); return out; }
  const pair = PAIRED[beat.action];
  if (pair && pa !== pair) out.push(`partnerAction "${pa}" contradicts action "${beat.action}": its partner is "${pair}" (the verb only reads as a pair) — write "partnerAction": "${pair}" or leave it out`);
  else if (!pair && NOT_A_PARTNER_CHOICE.has(pa)) out.push(`partnerAction "${pa}" needs its own setup (${pa === "take" ? "an object in the partner's hand" : `the lead's action "${PAIRED[pa] || pa}"`}) — stage it as the lead's action instead`);
  return out;
}

module.exports = { PAIRED, NOT_A_PARTNER_CHOICE, partnerActionFor, partnerActionProblems };
