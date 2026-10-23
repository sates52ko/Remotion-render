/**
 * semantic.ts — the Vox renderer's deterministic semantics helpers (P9-A).
 *
 * ONE implementation, shared by every archetype file. Two jobs:
 *
 * 1. NEGATION SCOPE (V4/V6): which tokens of a beat's narration sit inside a
 *    REJECTED clause. A circle/box visually ASSERTS importance/correctness, so
 *    a rejected pole may only ever be struck (or left alone) — never annotated
 *    positively. Deterministic word-window rules only; no LLM/Vision.
 *
 * 2. AUTHORED PROPOSITION CHECKS (V2/V6): what the beat's authored big text
 *    says — every emphasis token it renders, whether the whole selection lives
 *    inside a negated clause, and whether the narration's own explicit
 *    negation marker is the ONLY big text on the frame.
 *
 * Kept dependency-free (no engine imports) so scripts (polarity lint,
 * proposition telemetry) and tests can require the same rules through a
 * tiny CommonJS shim.
 */

// ── Negation markers ─────────────────────────────────────────────────────────

/** A word-level negation flips the clause it sits in. */
const NEGATION_WORDS = new Set([
  "not", "no", "never", "none", "nothing", "nobody", "nowhere", "neither", "nor",
  "isnt", "isn't", "wasnt", "wasn't", "arent", "aren't", "werent", "weren't",
  "dont", "don't", "doesnt", "doesn't", "didnt", "didn't",
  "cant", "can't", "cannot", "couldnt", "couldn't", "wont", "won't",
  "shouldnt", "shouldn't", "wouldnt", "wouldn't", "aint", "ain't",
]);

/** Two-word rejections that start a rejected clause. */
const REJECTED_CLAUSE_HEADS = new Set(["instead of", "rather than", "as opposed to"]);
/** Whole-clause rejections: the clause containing this word is the rejected pole. */
const REJECTED_CLAUSE_WORDS = new Set(["illusion", "myth", "lie", "lies", "fake", "false"]);

/**
 * Tokenize into lowercase words. Apostrophes are kept (isn't), punctuation
 * dropped — the same normalization shape screen-text uses for narration.
 */
export function tokenizeWords(text: string): string[] {
  return wordSpans(text).map((s) => s.w);
}

/** Words WITH their offsets in the original string, so clause boundaries
 *  (punctuation between two words) stay visible to the scope rules. */
function wordSpans(text: string): Array<{ w: string; start: number; end: number }> {
  const out: Array<{ w: string; start: number; end: number }> = [];
  const re = /[A-Za-z0-9%’'\-]+/g;
  let m: RegExpExecArray | null;
  const src = String(text || "");
  while ((m = re.exec(src))) out.push({ w: m[0].toLowerCase().replace(/’/g, "'"), start: m.index, end: m.index + m[0].length });
  return out;
}

/**
 * Negation-scope resolution for one narration (V4). Returns, per word index:
 *  - "negated"  — inside a rejected/not-clause (may strike, may NOT circle/box)
 *  - "asserted" — otherwise
 * The window: a negation flips words from itself up to (but not including) the
 * next clause boundary (", but" / ". " / ";" / "?" / "!") or up to 6 words,
 * whichever comes first; the coordinating contrast words (but / though /
 * however / yet / instead / actually) close the window early because they
 * open the ASSERTED pole ("NOT laziness BUT fear" — fear is asserted).
 * A clause whose head is "instead of"/"rather than"/"as opposed to" and any
 * clause containing illusion/myth/lie/false/fake is rejected wholesale.
 */
export function negationScopes(narration: string): Array<"negated" | "asserted"> {
  const spans = wordSpans(narration);
  const words = spans.map((s) => s.w);
  const scopes: Array<"negated" | "asserted"> = words.map(() => "asserted");
  const bare = (w: string) => w.replace(/'/g, "");
  // Words that close a negation window early: they open the ASSERTED pole
  // ("NOT laziness BUT fear" — fear is asserted).
  const CLOSE = new Set(["but", "however", "though", "although", "yet", "actually"]);
  // A clause boundary is PUNCTUATION BETWEEN two words ("," ends the rejected
  // noun phrase; "." ends the sentence) — checked in the raw narration gap.
  const boundary = (j: number) =>
    j > 0 && /[.!?;:,]/.test(narration.slice(spans[j - 1].end, spans[j].start));

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let head = ""; // which marker opened this rejected span (for telemetry)
    if (NEGATION_WORDS.has(w) || NEGATION_WORDS.has(bare(w))) head = w;
    else if (i + 1 < words.length && REJECTED_CLAUSE_HEADS.has(`${w} ${words[i + 1]}`)) head = `${w} ${words[i + 1]}`;
    else if (w === "instead" || w === "rather") head = w; // sentence-position rejection heads
    else if (REJECTED_CLAUSE_WORDS.has(w) || REJECTED_CLAUSE_WORDS.has(bare(w))) head = w;
    if (!head) continue;

    // A rejection HEAD ("instead of X", "rather than X", or a sentence-level
    // "Instead, …") rejects the OBJECT phrase only — the clause it opens, NOT
    // the sentence before it. A word negation ("not/never/illusion…") sits
    // inside its own rejected clause.
    const headIsPhrase = head.includes(" ");
    const headAlone = head === "instead" || head === "rather";
    const limit = Math.min(words.length, i + (headIsPhrase ? 7 : 6));
    let j = i;
    while (j < limit) {
      if (j > i) {
        // A sentence-level head ("Instead, …") OPENS its clause: its own left
        // boundary is where the rejected clause starts, never where it ends.
        if (!(headAlone && j === i + 1) && boundary(j)) break;
        if (NEGATION_WORDS.has(words[j]) || NEGATION_WORDS.has(bare(words[j]))) break; // double flip: stop conservatively
        if (CLOSE.has(words[j])) break;
      }
      if (headIsPhrase && j > i + 1) break; // only the head + the object phrase
      if (headAlone && j > i + 3) break; // "Instead, it killed him." → the following clause only
      scopes[j] = "negated";
      j++;
    }
    // "instead of X" consumes the head word too ("instead"/"rather"/"as opposed").
    if (head.includes(" ")) scopes[i + 1] = "negated";
    i = Math.max(i, j - 1); // resume after the span (spans never nest)
  }
  return scopes;
}

// Occurrence matching, not a word→scope map: repeated function words ("a",
// "is") carry different scopes in different clauses, so a token is judged by
// the scope of the place in the narration where the token actually appears.
const bareWord = (w: string) => w.replace(/'/g, "");

function negatedOccurrences(token: string, narration: string): { start: number; len: number; negated: number; negatedFlags: boolean[] }[] {
  if (!narration) return [];
  const words = tokenizeWords(narration);
  const scopes = negationScopes(narration);
  const bare = words.map(bareWord);
  const tok = tokenizeWords(token).map(bareWord).filter(Boolean);
  if (!tok.length) return [];
  const out: { start: number; len: number; negated: number; negatedFlags: boolean[] }[] = [];
  for (let i = 0; i + tok.length <= words.length; i++) {
    let match = true;
    for (let k = 0; k < tok.length; k++) if (bare[i + k] !== tok[k]) { match = false; break; }
    if (!match) continue;
    const negatedFlags = tok.map((_, k) => scopes[i + k] === "negated");
    out.push({ start: i, len: tok.length, negated: negatedFlags.filter(Boolean).length, negatedFlags });
  }
  return out;
}

/** Is ANY word of the token inside a negated scope of this narration? (V4) */
export function tokenInNegatedScope(token: string, narration: string): boolean {
  const occ = negatedOccurrences(token, narration);
  if (occ.length) return occ.some((o) => o.negated > 0);
  // No contiguous occurrence (label normalized differently): judge word-wise.
  return tokenizeWords(token).some((w) => negatedOccurrences(w, narration).some((o) => o.negated > 0));
}

/** Whole-token check: EVERY content word of the token sits in a negated
 *  scope. Articles (a/an/the) carry no polarity and never block — "THE MYTH"
 *  is the rejected noun phrase even though "the" sits before the marker. */
const ARTICLE = new Set(["a", "an", "the"]);
export function tokenFullyNegated(token: string, narration: string): boolean {
  const occ = negatedOccurrences(token, narration);
  if (occ.length) {
    const tokBare = tokenizeWords(token).map(bareWord);
    return occ.some((o) =>
      tokBare.every((w, k) => ARTICLE.has(w) || o.negatedFlags[k]),
    );
  }
  const words = tokenizeWords(token).filter((w) => !ARTICLE.has(w));
  return words.length > 0 && words.every((w) => negatedOccurrences(w, narration).some((o) => o.negated > 0));
}

/**
 * The negation/rejection marker for a token, for telemetry/lint reasons
 * ("which rule rejected this pole"). One of:
 *  "not" | "never" | "isn't" | "is not" | "aren't" | "instead of" | "rather than" |
 *  "illusion" | "myth" | null
 */
export function negationReasonFor(token: string, narration: string): string | null {
  if (!tokenFullyNegated(token, narration)) return null;
  // The span that made the token rejected: the first fully-negated occurrence,
  // or — when the token never occurs contiguously — the first negated word.
  const occ = negatedOccurrences(token, narration);
  let spanStart = -1;
  if (occ.length) {
    // Prefer a fully-negated occurrence; its FIRST content word is where the
    // rejected phrase begins (skipping articles keeps "THE MYTH" on "myth").
    const best = occ.find((o) => tokenizeWords(token).map(bareWord).every((w, k) => ARTICLE.has(w) || o.negatedFlags[k])) || occ[0];
    const tokBare = tokenizeWords(token).map(bareWord);
    spanStart = best.start + tokBare.findIndex((w) => !ARTICLE.has(w) && best.negatedFlags[tokBare.indexOf(w)]);
    if (spanStart < best.start) spanStart = best.start;
  } else {
    for (const w of tokenizeWords(token)) {
      const o = negatedOccurrences(w, narration).find((x) => x.negated > 0);
      if (o) { spanStart = o.start; break; }
    }
  }
  if (spanStart < 0) return "negated-clause";
  // Walk back from the rejected span to the marker that opened it (≤3 words).
  const name = (w: string, i: number): string | null => {
    if (w === "isn't" || bareWord(w) === "isnt") return "isn't";
    if (w === "aren't" || bareWord(w) === "arent") return "aren't";
    if (w === "never") return "never";
    if (w === "illusion") return "illusion";
    if (w === "myth") return "myth";
    if (w === "not") {
      // The bare "not" IS the rejection reason when the token sits right after
      // it; the "is" before it is the clause's verb, not the rejecting marker
      // ("is not X" vs "is, not X" are the same assertion this rule rejects).
      const prev = i > 0 ? wordSpans(narration)[i - 1].w : "";
      return prev === "is" || prev === "are" ? "not (is not)" : "not";
    }
    if (i + 1 < wordSpans(narration).length) {
      const two = `${w} ${wordSpans(narration)[i + 1].w}`;
      if (two === "instead of") return "instead of";
      if (two === "rather than") return "rather than";
    }
    return null;
  };
  const spans = wordSpans(narration);
  for (let i = spanStart; i >= Math.max(0, spanStart - 3); i--) {
    const r = name(spans[i].w, i);
    if (r) return r;
  }
  return "negated-clause";
}

/**
 * V2 — the emphasis tokens a beat will render, INDEPENDENT (never joined).
 * Mirrors what the renderer draws: emphasis words, else the keywords.
 */
export function bigTextTokens(beat: { props: { emphasis?: string[]; keywords?: string[] } }): string[] {
  const em = (beat.props.emphasis || []).filter(Boolean);
  if (em.length) return em.slice(0, 3).map((t) => String(t).toUpperCase());
  return (beat.props.keywords || []).slice(0, 3).map((t) => String(t).toUpperCase());
}

/**
 * V6 — polarity lint (REPORT-ONLY): true when the beat's ONLY big text sits
 * inside a negated/rejected clause of its own narration. The frame then shows
 * a rejected pole as the assertive message. Noisy by design; never a gate.
 */
export function onlyBigTextIsNegated(
  beat: { props: { emphasis?: string[]; keywords?: string[] } },
  narration: string,
): { flagged: boolean; reason: string | null; tokens: string[] } {
  const tokens = bigTextTokens(beat);
  if (!tokens.length) return { flagged: false, reason: null, tokens };
  const negated = tokens.filter((t) => tokenFullyNegated(t, narration));
  if (!negated.length) return { flagged: false, reason: null, tokens };
  const asserted = tokens.filter((t) => !tokenFullyNegated(t, narration));
  if (asserted.length) return { flagged: false, reason: null, tokens };
  return { flagged: true, reason: negationReasonFor(tokens[0], narration), tokens };
}

/**
 * O2/O3 (antidote, but detector-shaped for both engines) — the deterministic
 * RELATION DETECTOR the telemetry reads. Regex only; precision unmeasured on
 * purpose, so its output may NEVER hard-fail a build (UNSTAGED, not DROPPED).
 */
export type DetectedRelation = "contrast" | "cause_effect" | "said_vs_real" | "none";

const CONTRAST_RE = /\b(but|however|yet|whereas|while|although|though|instead of|rather than|not just|isn'?t|aren'?t|wasn'?t|is not|are not|in contrast|as opposed to|on the other hand)\b/i;
const CAUSE_RE = /\b(because|since|therefore|thus|hence|so that|leads? to|led to|results? in|causes?|as a result)\b/i;
const SAID_REAL_RE = /\b(calls? (?:it|this)|claims?|pretends?|seems?|appears?|supposedly|in reality|actually|the truth is|really)\b/i;

export function detectRelation(narration: string): { relation: DetectedRelation; marker: string | null } {
  const t = String(narration || "");
  if (!t.trim()) return { relation: "none", marker: null };
  const mC = t.match(CONTRAST_RE);
  if (mC) return { relation: "contrast", marker: mC[1].toLowerCase() };
  const mK = t.match(CAUSE_RE);
  if (mK) return { relation: "cause_effect", marker: mK[1].toLowerCase() };
  const mS = t.match(SAID_REAL_RE);
  if (mS) return { relation: "said_vs_real", marker: mS[1].toLowerCase() };
  return { relation: "none", marker: null };
}
