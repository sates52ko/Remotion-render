/**
 * failure-taxonomy.js — P1.1 (2026-10-01): WHY was a frame WRONG?
 *
 * The operator's pivot: a vision rater is diagnostic EVIDENCE, not ground truth
 * (one book, same 30 frames, same Gemini model: official pass 1 WRONG, fresh
 * passes 5-6 WRONG; NIM 11b shifts the disagreement to contribution instead).
 * So the question that survives rater noise is not "which frame is wrong" but
 * "which visual capability is unreliable". This module classifies every judged
 * WRONG into the 9 operator classes, then aggregates evidence onto SCENE
 * capabilities (action/cast/shot/expression) — the input P1.2's capability map
 * and P1.3's risk selector read.
 *
 * Classification is a DETERMINISTIC keyword classifier over judge evidence
 * (correctness why, contribution whyC, the frame's blind "sees") — not another
 * LLM, so the taxonomy itself has no rater variance. When a judge supplies
 * class/subclass directly (the harness judge prompt asks for them on WRONG),
 * those win and the keyword rules only fill historical/unlabeled records.
 * Measured-only: nothing here feeds a gate, ever.
 */

// the operator-approved classes
const CLASSES = [
  "SUBJECT",      // the salient subject/event contradicts the narration
  "ACTION",       // what characters DO is illegible, different or opposite
  "RELATION",     // who-does-what-to-whom between entities lost or wrong
  "STATE",        // internal state / emotional register not visible or wrong
  "WORLD",        // setting/era/place/objects wrong for the story world
  "IDENTITY",     // wrong who: actor/role/group conflated or swapped
  "COMPOSITION",  // readable elements, wrong salience/arrangement/framing
  "METAPHOR",     // figure of speech drawn literally / metaphor misread
  "TEXT",         // on-screen text misread, absent, or carries the wrong message
];
// keyword rules: [regex on lowercase evidence, class]. First match wins.
const RULES = [
  [/metaphor|\bliteral(ly)?\b|figure of speech|idiom/, "METAPHOR"],
  [/on-?screen text|caption|printed (word|text|label)|title (says|reads|wrong)|text (says|reads|wrong|misread)/, "TEXT"],
  [/wrong (who|person|character|group|role)|identit|conflat\w*|confus\w* (him|her|them) with|swapped/, "IDENTITY"],
  [/(afraid|exhausted|unconscious|panic|desperat|weary|grief|lament|mourn|regret).*(not visible|invisible|unreadable|wrong)|internal state|state (is )?(not|invisib)|wrong emotion|wrong emotional|emotional register|wrong tone|tone mismatch/, "STATE"],
  [/relation|interaction|who does what|attacked? by|gives? to|handoff|exchange.*(lost|wrong)|between.*(lost|unclear)/, "RELATION"],
  [/(action|verb|gesture|movement|doing).*(illegible|unclear|wrong|different|opposite|not visible)|not (actually )?(doing|performing)/, "ACTION"],
  [/(setting|era|period|place|location|environment|world).*(wrong|off|modern|anachron)|wrong (room|city|country|office|time)/, "WORLD"],
  [/salience|composition|arrangement|framing|crowded|clutter|too (busy|small)|hierarchy|generic|vague/, "COMPOSITION"],
  [/fails?|failing to convey (shock|terror|panic|fear|dread|horror)|frozen (smile|grin)|(grin|glee|smil\w+).*(worried|frozen)/, "STATE"],
  // SUBJECT: the depicted salient event/meaning contradicts the narration —
  // emphasis the narration rejects, negations lost on screen, celebrating what
  // the narration laments, distractors taking over the frame.
  [/emphasis|distract|reject|instead of|focus.*away|attention.*(away|wrong)|opposite meaning|different meaning|suggests a different|reads? as (if|though)|(cannot|can't|doesn'?t) (know|lie|speak|see)|celebrat|proud|milestone|surplus/, "SUBJECT"],
  // SUBJECT net: the remaining meaning-contradiction phrasings measured on the
  // 2026-10-01 corpus ("viewer interpreted X", "contradicts the narration",
  // "unrelated to", "rather than", "misled", ...). WRONG *means* the understood
  // message differs from the narration, so the last rule is a deliberate
  // catch-all: unmatched mechanisms default to SUBJECT, never UNCLASSIFIED.
  [/viewer.{0,24}\b(interpret|understand|read|think|conclude|hear)|misinterpret|contradict|unrelated|rather than|instead of|misses|fails? to convey|misled|diverging|portrays?|suggests/, "SUBJECT"],
  [/.*/, "SUBJECT"],
];

// Classify ONE wrongness record. evidence: {why, whyC, sees, cls, subclass} —
// strings may be null; judge-supplied cls wins over the keyword rules.
function classifyWrong(evidence) {
  const declared = String(evidence.cls || "").toUpperCase();
  if (CLASSES.includes(declared)) {
    return { class: declared, subclass: String(evidence.subclass || "judge-labeled").slice(0, 60), matchedRule: "judge" };
  }
  // Judge reasoning (why + whyC) is the classification evidence. The blind
  // "sees" is deliberately NOT in the haystack: its neutral phrasings ("text
  // reading …") mis-trigger the TEXT rule on frames whose failure is meaning,
  // not text (measured on the 2026-10-01 corpus).
  const hay = [evidence.why, evidence.whyC]
    .map((x) => String(x || "").toLowerCase())
    .join(" \n ");
  if (!hay.trim()) return { class: "UNCLASSIFIED", subclass: "no-evidence", matchedRule: null };
  for (const [re, cls] of RULES) {
    const m = hay.match(re);
    if (m) return { class: cls, subclass: m[0].slice(0, 60), matchedRule: String(re) };
  }
  return { class: "UNCLASSIFIED", subclass: hay.slice(0, 60), matchedRule: null };
}

/** The capability signature of a judged frame (from its config scene). */
function capabilitiesOf(scene) {
  if (!scene) return { actions: [], castCount: 0, shot: null, expressions: [] };
  const ch = scene.characters || [];
  return {
    actions: ch.map((c) => String(c.action || "none")).sort(),
    castCount: ch.length,
    shot: scene.shot || null,
    expressions: ch.map((c) => String(c.expression || "none")).sort(),
  };
}

/**
 * Aggregate classified WRONG evidence onto capabilities.
 * rows: [{slug,label,img,frame,cls,subclass,capabilities}] — produced by the
 * harness `taxonomy` command from every reliability/official judge record.
 * Returns per-capability evidence counts keyed "action:X", "cast:N", "shot:Y".
 */
function aggregateCapabilities(rows) {
  const caps = {};
  const bump = (key, cls, isMajority) => {
    if (!caps[key]) caps[key] = { evidence: 0, wrongMajority: 0, classes: {} };
    caps[key].evidence++;
    if (isMajority) caps[key].wrongMajority++;
    if (cls) caps[key].classes[cls] = (caps[key].classes[cls] || 0) + 1;
  };
  for (const r of rows) {
    const C = r.capabilities || {};
    for (const a of C.actions || []) bump(`action:${a}`, r.cls, !!r.isMajority);
    if (C.castCount != null) bump(`cast:${C.castCount}`, r.cls, !!r.isMajority);
    if (C.shot) bump(`shot:${C.shot}`, r.cls, !!r.isMajority);
    for (const e of C.expressions || []) bump(`expression:${e}`, r.cls, !!r.isMajority);
  }
  return caps;
}

module.exports = { CLASSES, RULES, classifyWrong, capabilitiesOf, aggregateCapabilities };
