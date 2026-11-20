// readcheck "misleading" notes (2026-10-23) — an OPTIONAL DIAGNOSTIC (`readcheck.js misleading`), never a verdict or a ranking.
//
// Every blind reader already names, per beat, "the element most likely to send a viewer the wrong way, or none"
// (readcheck.js prep). The judge never saw it and tally dropped it, so the author learned of a misleading element
// only when a judge called the beat WRONG. This reads the hints back, newest per beat (full run, then recheck-1..N —
// the same order as the verdicts), and sets them beside the verdicts. It changes no count: CORRECT / NEUTRAL / WRONG,
// wrongRate and blame are computed exactly as before, without it.
//
// Measured 2026-10-23 on the existing readchecks of 33 books (4,003 beats): readers flag 33% of beats; 89% of the
// flagged beats were judged CORRECT (false positives); the hints caught 43 of 82 readcheck WRONG (52%); P(WRONG |
// flagged) 3% vs 1% unflagged. Against the REAL blind mute verdict on the same beats (20 books, 745 frames) they did
// NOT predict failure: WRONG-or-dead 26.4% flagged vs 25.8% unflagged ("face" 35% and "missing" 32% on small n).
// A hint is a place to look, never a finding — fix only what the author confirms by looking.
const fs = require("fs");
const path = require("path");

const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const NONE = /^\s*(none|n\/a|no|nothing|-|—)?\s*\.?\s*$/i;

// the element a free-text hint points at (the reader's own words are kept beside it)
const ICON_NOUNS = "alarm clock|butterfly|subway|car|coffee|crash|ledge|wave|gravestone|grave|medical|cross|notes|phone|school|house|home|family|road|storm|star|heart|flame|fire|tree|mask|mirror|key|courthouse|gavel|photo|tank|controller|briefcase|skyline|plate|coin|door|lightbulb|bulb|puppet|chain|compass|boulder|summit|mountain|ladder|clock|scale|balance|book|shield|trophy|hourglass|sword|target|magnif|wallet|gift|seal|bolt|domino|iceberg|crown|money|dollar|calendar|bag|zipper|letter|envelope|bucket";
const ELEMENTS = [
  // the reader notes something the narration needs that is NOT on screen ("no clock shown", "no visual for decisions")
  ["missing", /\b(no|without|lacks?|missing|absent)\b[^.]{0,40}\b(shown|visible|displayed|drawn|visual|depicted|image|icon|cue)\b|\bno visual\b|\bnothing (shows|on screen)/i],
  ["words", /\b(words?|text|caption|callout|title|crossed|strike|phrase|headline)\b/i],
  ["diagram", /\b(diagram|arrows?|chart|flow|buckets?|spectrum|labels?)\b/i],
  ["icon", new RegExp(`\\b(icon|symbol|emoji|logo|drawing of|image of|picture of|(?:${ICON_NOUNS})(?:e?s)?)\\b`, "i")],
  ["face", /\b(face|smil|frown|expression|look of|happy|sad|angry|worried|afraid|surprised|smirk|blank)/i],
  ["body", /\b(pose|posture|gesture|point|slump|walk|sit|reach|hold|embrace|hug|fight|grab|struggl|celebrat|arms?)\b/i],
  ["people", /\b(person|people|man|woman|figure|character|two|crowd|child|kid|boy|girl|king|old|young)\b/i],
  ["place", /\b(place|set|room|street|office|kitchen|stage|school|forest|background|setting|location)\b/i],
];
function elementOf(text) {
  if (!text || NONE.test(String(text))) return null;
  for (const [el, re] of ELEMENTS) if (re.test(text)) return el;
  return "other";
}

/** Hints per art.json beat i: newest per beat across the full run and its re-checks. dirs = [BASE, recheck-1, ...] */
function readHints(dirs) {
  const hints = new Map();
  for (const dir of dirs) {
    const key = readJSON(path.join(dir, "key.json"));
    if (!key || !fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /^guess-\d+\.json$/.test(x))) {
      for (const g of readJSON(path.join(dir, f), []) || []) {
        if (g && key[g.id] !== undefined) hints.set(key[g.id], { text: String(g.misleading || "").trim(), element: elementOf(g.misleading), from: path.basename(dir) });
      }
    }
  }
  return hints;
}

/** The report: beside, never inside, the verdict counts. verdicts = Map(i -> {correctness, blame}). */
function misleadingReport(hints, verdicts) {
  const flagged = [...hints].filter(([, h]) => h.element).map(([i, h]) => ({ i, element: h.element, hint: h.text.slice(0, 160), verdict: (verdicts.get(i) || {}).correctness || null, blame: (verdicts.get(i) || {}).blame || null }));
  const byVerdict = { CORRECT: 0, NEUTRAL: 0, WRONG: 0, unjudged: 0 };
  flagged.forEach((x) => { byVerdict[x.verdict || "unjudged"] = (byVerdict[x.verdict || "unjudged"] || 0) + 1; });
  const byElement = {};
  flagged.forEach((x) => { byElement[x.element] = (byElement[x.element] || 0) + 1; });
  const wrong = [...verdicts].filter(([, v]) => v.correctness === "WRONG").map(([i]) => i);
  const wrongFlagged = wrong.filter((i) => (hints.get(i) || {}).element);
  // on a flagged WRONG beat: did the reader's element match the judge's blame?
  const agree = flagged.filter((x) => x.verdict === "WRONG" && x.blame && (x.blame === x.element || (x.blame === "people" && ["face", "body"].includes(x.element)))).length;
  const judged = byVerdict.CORRECT + byVerdict.NEUTRAL + byVerdict.WRONG;
  return {

    diagnosticOnly: true,
    note: "Blind readers' 'misleading' notes — a DIAGNOSTIC, not a verdict and not a risk ranking. High false-positive rate (corpus 2026-10-23: 89% of flagged beats judged CORRECT) and no lift on the real mute verdict. Changes no count, gate or score.",
    beatsWithHint: hints.size, flagged: flagged.length, byVerdict, byElement,
    falsePositiveRate: judged ? +(byVerdict.CORRECT / judged).toFixed(3) : null,
    wrongCaught: wrong.length ? `${wrongFlagged.length}/${wrong.length}` : "0/0",
    elementAgreesWithJudgeOnWrong: wrongFlagged.length ? `${agree}/${wrongFlagged.length}` : "0/0",
    // every flagged beat in beat order — no ranking (measured: the notes do not predict which beats fail)
    beats: flagged.sort((a, b) => a.i - b.i),
  };
}

module.exports = { elementOf, readHints, misleadingReport };
