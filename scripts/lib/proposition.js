/**
 * proposition.js — P9-B: the Proposition Authoring Contract.
 *
 * P9-A made the engine unable to LOSE authored meaning (DROPPED = HARD).
 * P9-B lets the author STATE meaning as a two-pole proposition the machine can
 * verify: relation + poles[] + asserted/rejected + evidence + visual. The
 * architectural rule (operator, 2026-10-06):
 *
 *   P9-A: the author's meaning must not be lost.
 *   P9-B: the author must be able to EXPRESS meaning, two-poled.
 *
 * THE COMPILER IS THE CONTRACT (detect → brief requirement → verify):
 *   1. DETECT   — `detectProposition()` derives a detector-grade proposition
 *                 from the beat's own words (src:"detector"; never trusted as
 *                 the author's claim).
 *   2. REQUIRE  — the brief carries it (`brief.proposition`); the author may
 *                 overwrite it via the emit/merge pass (src:"author"). This
 *                 file never writes a scene.
 *   3. VERIFY   — `stagedPoles()` judges a PLANNED SCENE against the authored
 *                 proposition from the config alone (render-bundle safe), the
 *                 same way authorship.js judges a dropped icon.
 *
 * Shape (NO `concept2` — poles are a plural list; entities are plural):
 *   {
 *     relation: "contrast"|"cause_effect"|"said_vs_real"|"before_after"|"equivalence"|"none",
 *     poles: [ { text, entity, status: "asserted"|"rejected" } ],   // 1..3
 *     evidence: "<narration span the proposition is grounded in>",
 *     visual: {
 *       representation: "split"|"beforeAfter"|"flow"|"equivalence"|"twoShot"|"icon"|null,
 *       icon: "<CONCEPT_LEXICON name>"|null,          // single-pole staging
 *       perCast: [ { entity, face, action, holds } ],  // per-cast semantic roles
 *     },
 *     src: "author"|"detector",
 *   }
 *
 * The renderer already draws every lever the contract names: shot split /
 * beforeAfter / flow / twoShot (schema.ts), per-cast face (expression) /
 * action / holds, texts style "strike" for a rejected pole, props arcs. The
 * contract only names them; the planner stages them.
 */

const { detectRelation, negationScopes, tokenizeWords } = require("./vox-semantic.cjs");

// ── Closed enums ─────────────────────────────────────────────────────────────

const RELATIONS = ["contrast", "cause_effect", "said_vs_real", "before_after", "equivalence", "none"];
const POLE_STATUSES = ["asserted", "rejected"];
const REPRESENTATIONS = ["split", "beforeAfter", "flow", "equivalence", "twoShot", "icon", "none"];

/** The shots that can carry BOTH poles of a relation on one frame. */
const TWO_SIDED_SHOTS = new Set(["twoShot", "split", "beforeAfter", "overShoulder"]);

// ── Normalize / validate ─────────────────────────────────────────────────────

const isStr = (v) => typeof v === "string";
const cleanStr = (v) => (isStr(v) ? v.trim() : "");

/**
 * Validate + normalize one raw proposition (from a brief, an art file, or the
 * detector). Returns { ok, prop, errors }. Structural nonsense is an ERROR,
 * never a silent fallback — the contract is closed like CODES is.
 */
function normalizeProposition(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, prop: null, errors: ["proposition must be an object"] };

  const relation = RELATIONS.includes(raw.relation) ? raw.relation : null;
  if (!relation) errors.push(`relation must be one of ${RELATIONS.join("|")}`);

  const poles = [];
  if (!Array.isArray(raw.poles) || !raw.poles.length) {
    errors.push("poles must be a non-empty array (plural by design — there is no concept2)");
  } else {
    if (raw.poles.length > 3) errors.push("at most 3 poles");
    for (const [k, p] of raw.poles.slice(0, 3).entries()) {
      const text = cleanStr(p && p.text);
      const entity = cleanStr(p && p.entity) || null;
      const status = p && POLE_STATUSES.includes(p.status) ? p.status : null;
      if (!text && !entity) errors.push(`pole[${k}]: text or entity required`);
      if (!status) errors.push(`pole[${k}]: status must be asserted|rejected`);
      else poles.push({ text, entity, status });
    }
  }

  const visual = raw.visual && typeof raw.visual === "object" ? raw.visual : {};
  const representation = visual.representation == null || visual.representation === ""
    ? null
    : (REPRESENTATIONS.includes(visual.representation) ? visual.representation : (errors.push(`visual.representation must be one of ${REPRESENTATIONS.join("|")}`), null));
  const icon = cleanStr(visual.icon) || null;
  const perCast = Array.isArray(visual.perCast)
    ? visual.perCast.slice(0, 3).map((c) => ({
        entity: cleanStr(c && c.entity),
        face: cleanStr(c && c.face) || null,
        action: cleanStr(c && c.action) || null,
        holds: cleanStr(c && c.holds) || null,
      })).filter((c) => c.entity)
    : [];

  const src = raw.src === "author" ? "author" : "detector";
  const evidence = cleanStr(raw.evidence) || null;
  if (!evidence && src === "author") errors.push("evidence required for an authored proposition (which narration span says this)");

  if (errors.length) return { ok: false, prop: null, errors };
  return {
    ok: true,
    prop: { relation, poles, evidence, visual: { representation, icon, perCast }, src },
    errors,
  };
}

// ── DETECT (brief-writer input; never trusted as the author's claim) ─────────

/** Content words carry a pole; markers/articles/verbs-of-being/pronouns do not. */
const STOPWORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "is", "was", "are", "were", "it", "its", "that", "this", "and", "or", "for", "with", "as", "be", "been", "about", "not", "no", "never", "but", "however", "yet", "though", "although", "instead", "rather", "than", "actually", "just", "only", "so", "he", "she", "they", "we", "you", "his", "her", "their", "our", "my", "your"]);

/** Clause-split markers — the FIRST one (searched in this order, so compound
 *  markers like "in reality" beat their inner words) cuts the beat in two.
 *  P9-B.2b (precision repair, gold-set 2026-10-07): "not just" LEFT the list —
 *  it asserts MORE rather than pivoting sides (gold FP #30); the negation-scope
 *  path carries its rejected pole instead. Added: "whether…or" (rival causes,
 *  FN #266), "deeper than just" (assertion continuation, FN #119), "reveals
 *  himself to be" (said_vs_real, FN #69) and bare "when" (in-window causal
 *  frames, FN #29/#31). */
const SPLIT_MARKERS = [
  [/\bin reality\b/i, "said_vs_real"], [/\bthe truth is\b/i, "said_vs_real"], [/\bsupposedly\b/i, "said_vs_real"],
  [/\bpretends?\b/i, "said_vs_real"], [/\bclaims?\b/i, "said_vs_real"],
  [/\bcalls? (?:it|this)\b/i, "said_vs_real"], [/\bturns? out\b/i, "said_vs_real"],
  [/\breveals? (?:himself|herself|itself|themselves)? ?to be\b/i, "said_vs_real"],
  [/\bactually\b/i, "said_vs_real"], [/\bseems?\b/i, "said_vs_real"], [/\bappears?\b/i, "said_vs_real"],
  [/\breally\b/i, "said_vs_real"],
  [/\binstead of\b/i, "contrast"], [/\brather than\b/i, "contrast"], [/\bas opposed to\b/i, "contrast"],
  [/\bon the other hand\b/i, "contrast"], [/\bin contrast\b/i, "contrast"],
  [/\bhowever\b/i, "contrast"], [/\bwhereas\b/i, "contrast"], [/\balthough\b/i, "contrast"], [/\bthough\b/i, "contrast"],
  [/\bbut\b/i, "contrast"], [/\byet\b/i, "contrast"], [/\bwhile\b/i, "contrast"],
  [/\bdeeper than just\b/i, "contrast"],
  [/\bwhether\b[^?!\.\n]{0,80}?\bor\b/i, "contrast"],
  [/\bbecause\b/i, "cause_effect"], [/\bsince\b/i, "cause_effect"], [/\btherefore\b/i, "cause_effect"],
  [/\bthus\b/i, "cause_effect"], [/\bhence\b/i, "cause_effect"], [/\bso that\b/i, "cause_effect"],
  [/\bleads? to\b/i, "cause_effect"], [/\bled to\b/i, "cause_effect"], [/\bresults? in\b/i, "cause_effect"],
  [/\bcauses?\b/i, "cause_effect"], [/\bas a result\b/i, "cause_effect"],
];

/** said_vs_real markers that FRAME or emphasize ("really is", "actually
 *  manages", "seems to") rather than refute: they only carry a proposition
 *  when an explicit refutation signal ALSO appears (gold-set: 8/8 frame-role
 *  detections were false — emphasis and meta-discourse, no refuted claim). */
const FRAME_SVR_MARKER_RE = /^(really|actually|seems?|appears?)$/i;
const SAID_REAL_REFUTE_RE = /\b(in reality|the truth is|supposedly|pretends?|claims?|turns? out|reveals? (?:himself|herself|itself|themselves)? ?to be)\b/i;

/** A negation run opened by a contraction/categorical negative ("didn't know",
 *  "can't swim", "no compass", "never X") states a FACT the narration asserts —
 *  it is not a refuted claim (gold: 15/15 false; "not X"/"not just X" frames
 *  are the genuine refutation shapes and stay). */
const FACT_START_RE = /^(?:[a-z]+n't|cannot|can't|no|never)\b/;

/** Marker/conjunction words never belong in a pole's text. STOPWORDS plus the
 *  split-marker vocabulary — a pole names a SIDE, not the pivot between sides
 *  (detector only; VERIFY's textSays keeps plain STOPWORDS). */
const DETECTOR_STOPWORDS = new Set([...STOPWORDS, "when", "whether", "because", "since", "therefore", "thus", "hence", "while", "although", "though", "however", "whereas", "instead", "rather", "but", "yet", "than", "why", "how", "if"]);

/** The head content words of a clause — the pole's text (≤3 content words). */
function poleTextOfClause(clause) {
  const words = tokenizeWords(clause).filter((w) => !DETECTOR_STOPWORDS.has(w));
  return words.length ? words.slice(0, 3).join(" ") : null;
}

/** Longest contiguous run of one negation scope: raw run words + word-index
 *  range (for the sentence-boundary check) + stopword-stripped pole text. */
function poleTextFromRun(words, scopes, statuses) {
  let best = null;
  let i = 0;
  while (i < words.length) {
    if (!statuses.has(scopes[i])) { i++; continue; }
    let j = i;
    while (j < words.length && statuses.has(scopes[j])) j++;
    const raw = words.slice(i, j);
    const run = raw.filter((w) => !DETECTOR_STOPWORDS.has(w));
    if (run.length && (!best || run.length > best.length)) best = { text: run.slice(0, 3).join(" "), raw, from: i, to: j - 1 };
    i = j;
  }
  return best;
}

const BEFORE_AFTER_RE = /\b(used to|no longer|before[,.] |after[,.] |once .{2,40} now)\b/i;
const EQUIVALENCE_RE = /\b(is (?:just|really|simply)|the same as|amounts to|nothing more than|is another (?:form|name) of)\b/i;

/**
 * The deterministic detector: one proposition per beat's own words, or null.
 *
 * Clause-splitting: the FIRST relation marker cuts the beat into a pre-clause
 * and a post-clause, and the relation decides what the two sides MEAN —
 *   said_vs_real → the pre-clause is the REFUTED claim (rejected), the
 *                  post-clause is what is really true (asserted);
 *   cause_effect → cause (pre) → effect (post), both asserted;
 *   contrast     → with an explicit negation scope the rejected pole comes
 *                  from the negated run ("not X, but Y"); without one, both
 *                  sides are asserted poles in tension ("A, but B");
 *   before_after / equivalence → both sides asserted (or negation-scoped).
 * `castIndex` (array of {key, tokens:Set}) marks entity poles.
 */
function detectProposition(narration, { castIndex = [] } = {}) {
  const text = String(narration || "").trim();
  if (!text) return null;
  const { relation: base, marker } = detectRelation(text);
  const ba = BEFORE_AFTER_RE.test(text), eq = EQUIVALENCE_RE.test(text);

  const words = tokenizeWords(text);
  const scopes = negationScopes(text);
  let negRun = poleTextFromRun(words, scopes, new Set(["negated"]));
  // P9-B.2b: an EXPLICIT SPLIT MARKER is relation evidence in its own right —
  // scan for it BEFORE the early null, so pure-marker beats ("reveals himself
  // to be", gold FN #69) are not dropped at the door (old gate: base==="none"
  // && no negRun → null without ever consulting the marker list).
  let earlyMarker = null;
  for (const [re, rel] of SPLIT_MARKERS) {
    const m = text.match(re);
    if (m && m.index != null) { earlyMarker = { rel, text: m[0] }; break; }
  }
  if (base === "none" && !ba && !eq && !negRun && !earlyMarker) return null;
  // negRun-only (illusion/myth/lie clause, no clause marker) = a rejected
  // claim against what stands — the neutral two-pole tension is contrast.
  // A marker found above governs the relation even from base "none".
  let relation = base !== "none" ? base : earlyMarker ? earlyMarker.rel : negRun && !ba && !eq ? "contrast" : (ba ? "before_after" : "equivalence");

  // cut at the first clause marker (already found above — SPLIT_MARKERS is
  // searched in order so compound markers like "in reality" beat their inner
  // words); the post-clause starts right after the marker itself, and the
  // MARKER's relation governs what the two sides mean. "whether … or" is a
  // SPANNING marker — the two rival sides sit INSIDE the span, so the cut
  // lands between the poles, not after "or".
  let cut = -1, cutLen = 0, cutRel = null, cutMarker = null, cutInside = -1;
  if (earlyMarker) {
    // earlyMarker.text is the exact first-match substring from the ordered scan
    const idx = text.indexOf(earlyMarker.text);
    if (idx >= 0) {
      cut = idx; cutLen = earlyMarker.text.length; cutRel = earlyMarker.rel; cutMarker = earlyMarker.text;
      if (cutRel === "contrast" && /^whether/i.test(cutMarker)) {
        const o = text.slice(cut + cutLen).search(/\bor\b/i);
        if (o >= 0) cutInside = cut + cutLen + o; // split the rivals apart
      }
    }
  }
  if (cutRel) relation = cutRel;
  const pre = cutInside >= 0 ? text.slice(0, cutInside) : cut > 0 ? text.slice(0, cut) : null;
  const post = cutInside >= 0 ? text.slice(cutInside + 2) : cut >= 0 ? text.slice(cut + cutLen) : null;

  const unpack = (c) => Array.isArray(c)
    ? { key: String(c[0] || ""), toks: [...(c[1] || [])] }
    : { key: String((c && c.key) || ""), toks: [...((c && c.tokens) || [])] };
  const entityFor = (t) => {
    const toks = new Set(String(t || "").toLowerCase().split(/[^a-z0-9']+/).filter(Boolean));
    const hit = castIndex.find((c) => { const { key, toks: ks } = unpack(c); return key && ks.some((k) => toks.has(k)); });
    return hit ? unpack(hit).key : null;
  };

  const poles = [];
  const add = (t, status) => {
    if (!t) return;
    if (poles.some((p) => p.text === t)) return;
    poles.push({ text: t, entity: entityFor(t), status });
  };

  // P9-B.2b precision guards (gold-set 2026-10-07, the-three failure classes):
  // 1. a said_vs_real marker in FRAMING role ("really is", "actually manages",
  //    "seems to vanish") with no explicit refutation signal anywhere in the
  //    beat is emphasis/meta-discourse — never a refuted claim;
  // 2. a rejected pole stating a FACT (contraction/categorical negatives:
  //    "didn't know", "can't swim", "no compass", "never X") flips to asserted —
  //    only "not X" / "not just X" shapes carry a genuine refutation. The flip
  //    applies inside the clause path and the negation-scope path alike, and a
  //    collapsed "both asserted" pair stays a proposition when the marker says
  //    a two-sided relation (contrast "A, but B"). A from/to-be verb inside a
  //    REJECTED run is the PRETENSE ("reveals himself to be X") — that side
  //    stays rejected.
  const svrFrame = relation === "said_vs_real" && FRAME_SVR_MARKER_RE.test(String(cutMarker || "")) && !SAID_REAL_REFUTE_RE.test(text);
  if (svrFrame) return null;
  // meta-phrase artifact: "cause" matched inside "cause and effect" — the beat
  // EXPLAINS the causal frame, it does not state a cause→effect pair
  if (relation === "cause_effect" && /\bcause and effect\b/i.test(text)) return null;
  // a one-sided clause pivot (pre side has NO content words) has no first pole
  if ((cut >= 0 || cutInside >= 0) && pre && post && !poleTextOfClause(pre)) return null;
  // runIsFact (P9-B.2b, gold): a negation shaped like "didn't know", "can't
  // swim", "no compass", "never X" states a FACT the narration asserts — even
  // mid-run was/is ("didn't know it was there", gold #231/#233) does not turn
  // it into a REFUTED claim. Only a leading "not" keeps a rejected reading
  // ("not the money, but the freedom"), and a verdict clause (lie/illusion) is
  // the beat's own assertion, not anything it attributes to a speaker.
  const runIsFact = (run) => run && FACT_START_RE.test(run.raw.join(" ")) && !/^not\b/i.test(run.raw[0] || "") && !/\bnot\b/i.test(run.raw.join(" "));
  const runIsVerdict = (run) => run && /\b(?:illusion|myth|lies?|fake|false)\b/i.test(run.raw.join(" "));
  const negRunIsFact = relation !== "said_vs_real" && runIsFact(negRun);
  const negRunIsVerdict = relation !== "said_vs_real" && runIsVerdict(negRun);
  // A negation that states a FACT or the beat's own VERDICT carries no refuted
  // claim — the rejection evidence is void. A real clause pivot (marker + two
  // sides with content) can still carry the relation both-sides-asserted;
  // without one the beat has no detectable two-pole proposition.
  const clauseTwoSided = !!(cutRel && pre && post && poleTextOfClause(pre) && poleTextOfClause(post));
  // A negation run that CROSSES a sentence boundary is trimmed at the FIRST
  // boundary (gold #253 vs #61): the shared scope resolver walks a bare
  // rejection head ("Instead,", "No,") across ". And …" and swallows the NEXT
  // sentence's words — they are not part of the negated pole. #61 ("not about
  // the $123. No, it's about …") keeps its real pole after the trim; #253's
  // trimmed run has no content left, so the beat correctly falls to null.
  if (negRun) {
    const spans = [...text.matchAll(/[A-Za-z0-9%'’\-]+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
    if (spans.length === words.length) {
      let cut2 = -1;
      for (let k = negRun.from + 1; k <= negRun.to; k++) if (/[.!?]/.test(text.slice(spans[k - 1].end, spans[k].start))) { cut2 = k; break; }
      if (cut2 >= 0) {
        const raw2 = words.slice(negRun.from, cut2);
        const content2 = raw2.filter((w) => !DETECTOR_STOPWORDS.has(w));
        negRun = content2.length ? { text: content2.slice(0, 3).join(" "), raw: raw2, from: negRun.from, to: cut2 - 1 } : null;
      }
    }
  }
  // Retrospective-pivot neighbor steps (gold #253): "... He did X. But he
  // started Y" restates the PREVIOUS beat's action — the post clause continues
  // the same actor's behavior; it does not open a second side. A SENTENCE
  // boundary before the marker ("seeds from the plant instead. And Krakauer…")
  // makes the pivot retrospective by construction: both sides live in
  // different sentences, so the in-window "first side" is not a side at all.
  {
    const at = cutInside >= 0 ? cutInside : cut;
    if (at > 0) {
      // only a CONJUNCTIVE continuation ("And/So …") — a sentence-initial "But"
      // is a legitimate contrast pivot (gold TP #43/#183/#189/#315)
      if (/[.?!]\s*$/.test(text.slice(0, at)) && /^\s*(?:and|so)\b/i.test(text.slice(at))) return null;
      const postHead = text.slice(at).slice(0, 24).match(/^(?:and )?(he|she|they|it|we|you)\b/i);
      if (postHead) {
        const subj = postHead[1].toLowerCase();
        if (new RegExp(`\\b${subj}\\b`, "i").test(text.slice(Math.max(0, at - 40), at))) return null;
      }
    }
  }
  // Interactive / rhetorical frames carry no two-sided claim at all (gold):
  // an "X, just …, not Y" appositive restate (#248), a "my question" meta pivot
  // (#264), a "why not …?" rhetorical alternative (#236), and CTA closures
  // ("let that sit", "until next time", #317).
  if (/\bjust\b[^.!?]{0,40},\s*not\b/i.test(text)) return null;
  if (/\bmy question\b/i.test(text)) return null;
  if (/\bwhy not\b/i.test(text)) return null;
  if (/\blet that (?:sit|sink)\b|\bthink about (?:the map|that|it)\b|\buntil next time\b|\bdeep dive\b/i.test(text)) return null;
  // A dangling single-adverb pre side ("heavily. But Krakauer…", gold #49) has
  // no pole at all — the fragment is the tail of the previous sentence. Only
  // applies while the PRE/POST path builds the poles; a negation-scope run
  // supplies the rejected pole on its own (gold TP #147, "not just an annoyance").
  if (pre && post && !negRun) {
    const preWords = poleTextOfClause(pre);
    if (preWords && !preWords.includes(" ") && /ly$/i.test(preWords)) return null;
  }
  // A PRETENSE verb in the pre clause ("wanted to be", "pretend he was", gold
  // #232): the pre side states the narrator's asserted fact about the subject,
  // not a claim anyone made — the svr rejection has nothing to refute.
  if (relation === "said_vs_real" && pre && /\b(?:wanted?|pretend(?:s|ing|ed)?|tried? to be|claimed to be)\b/i.test(pre) && !SAID_REAL_REFUTE_RE.test(pre)) return null;
  // The post clause OPENING on a contraction-fact ("But Chris doesn't know",
  // "but the gates won't", gold #195/#231/#260 — the contraction sits directly
  // on its subject, so only the leading span matters): the post side is the
  // narrator's asserted reality — it cannot carry the second pole of a tension.
  if (post && /\b(?:doesn'?t|don'?t|didn'?t|can'?t|cannot|won'?t|wouldn'?t|couldn'?t|never)\b/i.test(post.slice(0, 32))) return null;

  if (relation === "said_vs_real" && pre && post) {
    add(poleTextOfClause(pre), "rejected");
    add(poleTextOfClause(post), "asserted");
  } else if (relation === "cause_effect" && pre && post) {
    add(poleTextOfClause(pre), "asserted");
    add(poleTextOfClause(post), "asserted");
  } else if (negRun && !negRunIsFact && !negRunIsVerdict) {
    // negation scope outranks the clause split: the negated run is the
    // rejected pole, the longest asserted run is the other side
    add(negRun.text, "rejected");
    add(poleTextFromRun(words, scopes, new Set(["asserted"]))?.text, "asserted");
  } else if (pre && post && (relation === "contrast" || relation === "before_after" || relation === "equivalence")) {
    add(poleTextOfClause(pre), "asserted");
    add(poleTextOfClause(post), "asserted");
  }
  if (!poles.length) return null;
  // One pole and no rejected side is a topic, not a proposition — the brief
  // already carries topics (subject/concept). Keep the contract two-poled.
  if (poles.length === 1 && poles[0].status === "asserted") return null;

  return normalizeProposition({
    relation,
    poles,
    evidence: cutMarker ? `marker "${cutMarker}"` : (marker ? `marker "${marker}"` : relation),
    visual: { representation: null, icon: null, perCast: [] },
    src: "detector",
  }).prop;
}

// ── VERIFY (config-only; the gate's judge) ───────────────────────────────────

const screenText = require("./screen-text");
const tokensOf = (t) => screenText.tokens(String(t || ""));
/** Do all of the pole's content tokens appear in the text's tokens? */
function textSays(poleText, textTokens) {
  const p = tokensOf(poleText).filter((w) => !STOPWORDS.has(w));
  if (!p.length) return false;
  return p.every((w) => textTokens.includes(w));
}

// P9-B.2c pilot lesson: scene.props is an ARRAY in antidote scenes but an
// OBJECT payload in vox beats — the judge must never crash on a foreign shape.
const propArrayOf = (s) => (Array.isArray(s && s.props) ? s.props : []);
const iconOnScene = (s, icon) =>
  !!icon && !!(s.concept === icon
    || propArrayOf(s).some((p) => p && p.type === icon)
    || (s.characters || []).some((ch) => ch && ch.holds === icon));

/**
 * Per-pole diagram evidence (P9-B.2c): a diagram whose labels state the
 * pole's own text carries THAT pole — regardless of any representation
 * binding. stageProposition writes the pole texts as flow labels, so a
 * stager-authored diagram self-evidences both poles; an unrelated diagram
 * (no labels, or labels that say nothing about the pole) carries nothing.
 */
function diagramLabelsSay(scene, pole) {
  const d = scene && scene.diagram;
  if (!d || !Array.isArray(d.labels) || !pole || !pole.text) return false;
  return d.labels.some((label) => textSays(pole.text, tokensOf(label)));
}

/**
 * The AUTHOR'S pole→icon mapping, verbatim: an icon belongs to the pole whose
 * text (or entity) names it. Strict equality on purpose — the mapping is an
 * authored decision, never fuzzy-matched by the machine.
 */
function poleIconOwners(pole, prop) {
  const icon = prop && prop.visual && prop.visual.icon;
  if (!icon) return [];
  return (pole.text && pole.text === icon) || (pole.entity && pole.entity === icon) ? [icon] : [];
}

/** The renderer's strike lever: a REJECTED pole may appear only struck. */
const struckTexts = (s) => (Array.isArray(s.texts) ? s.texts.filter((t) => t && t.style === "strike") : []);
const plainTexts = (s) => (Array.isArray(s.texts) ? s.texts.filter((t) => t && t.style !== "strike") : []);
/**
 * A frame whose two-pole composition is BOUND to the authored proposition.
 * P9-B.2c (operator, 2026-10-08 — Semantic Verifier Hardening): the old
 * structural shortcut (ANY split/twoShot, ANY two props, ANY diagram) proved
 * only that the renderer DRAWS two areas — not that those areas carry THIS
 * proposition's poles. A split of two unrelated figures passed both poles
 * while asserting nothing about them (green tests, unrelated scenes). So a
 * composition anchors poles ONLY when it is BOUND to the authored
 * proposition:
 *   1. the author sealed a two-pole representation AND the scene renders
 *      exactly that shot (stageProposition sets shot=rep from the seal), or
 *   2. the scene carries an AUTHORED flow diagram for this proposition
 *      (stager-stamped `authored`/`diagramAuthored`, rep === "flow").
 * A diagram's own labels stating the pole texts are direct per-pole evidence
 * (see diagramLabelsSay) and need no representation binding.
 */
const ALWAYS_TWO_SIDED = new Set(["split", "beforeAfter", "twoShot"]);
const compositionCoversBoth = (s, prop = null) => {
  const rep = prop && prop.visual && prop.visual.representation;
  if (rep && ALWAYS_TWO_SIDED.has(rep)) {
    if (s.shot === rep) return true;
  }
  if (rep === "flow" && s.diagram && s.diagram.type === "flow"
    && (s.diagram.authored || (s._authorship && s._authorship.diagramAuthored))) return true;
  return false;
};

/**
 * The wallpaper default (operator, P9-B brief): one actor whose whole
 * performance is idle/talk, no icon, no prop, no diagram, no strike — a
 * text-only frame with a statue. Independent of any proposition: this is the
 * shape the renderer fills an unstaged beat with (P7 root cause).
 */
function idleWallpaperOf(scene) {
  const chars = (scene && Array.isArray(scene.characters) && scene.characters) || [];
  const idleAction = (c) => !c.action || c.action === "idle" || c.action === "talk";
  return chars.length === 1
    && idleAction(chars[0])
    && !scene.concept
    && !propArrayOf(scene).some((p) => p && p.type)
    && !scene.diagram
    && !struckTexts(scene).length;
}

/**
 * Judge a planned scene against one proposition. Pure: reads the config scene,
 * writes nothing. Verdicts per pole:
 *   staged          — the pole's content is on screen
 *   struck          — a rejected pole shown struck (the honest rejection)
 *   missing         — nothing on screen carries it
 *   asserted-wrong  — a REJECTED pole shown unstruck as the scene's subject
 * Top-level:
 *   twoSided        — every pole anchored (the proposition reached the screen)
 *   unstaged        — 2+ poles, fewer than 2 anchored (one pole carried it)
 *   poleViolation   — a rejected pole asserted as the subject
 *   idleWallpaper   — single actor, idle/talk, nothing else on the frame
 */
function stagedPoles(scene, prop) {
  const out = { verdicts: [], twoSided: false, unstaged: false, poleViolation: false, idleWallpaper: false };
  out.idleWallpaper = idleWallpaperOf(scene);
  if (!scene || !prop || !Array.isArray(prop.poles) || !prop.poles.length) return out;

  const chars = Array.isArray(scene.characters) ? scene.characters : [];
  const identities = new Set(chars.map((c) => c && c.identity).filter(Boolean));
  const struck = struckTexts(scene).map((t) => tokensOf(t.text));
  const plain = plainTexts(scene).map((t) => tokensOf(t.text));
  const composition = compositionCoversBoth(scene, prop);

  for (const pole of prop.poles) {
    const owned = poleIconOwners(pole, prop);
    let v = "missing";
    if (pole.entity && identities.has(pole.entity)) {
      v = "staged";
    } else if (pole.entity) {
      const pc = (prop.visual && prop.visual.perCast || []).find((c) => c.entity === pole.entity);
      if (pc && identities.has(pc.entity)) v = "staged";
    }
    if (v === "missing" && owned.length && owned.some((ic) => iconOnScene(scene, ic))) v = "staged";
    if (v === "missing" && pole.text) {
      if (iconOnScene(scene, pole.text)) v = "staged";
      else if (struck.some((tk) => textSays(pole.text, tk))) v = "struck";
      else if (plain.some((tk) => textSays(pole.text, tk))) v = pole.status === "rejected" ? "asserted-wrong" : "staged";
      else if (diagramLabelsSay(scene, pole)) v = "staged"; // the diagram's labels state this pole verbatim
      else if (composition) v = "staged"; // a composition BOUND to this proposition (see compositionCoversBoth)
    }
    if (v === "staged" && pole.status === "rejected" && plain.length && !composition && !owned.length && !iconOnScene(scene, pole.text)) {
      // a rejected pole carried ONLY by plain copy on a one-pole frame is the
      // frame's own assertion (a strike would have been the honest rejection)
      v = "asserted-wrong";
    }
    out.verdicts.push({ pole: pole.text || pole.entity, status: pole.status, state: v });
  }

  const anchored = out.verdicts.filter((v) => v.state === "staged" || v.state === "struck").length;
  out.poleViolation = out.verdicts.some((v) => v.state === "asserted-wrong");
  out.twoSided = prop.poles.length >= 2 && anchored >= prop.poles.length && !out.poleViolation;
  out.unstaged = prop.poles.length >= 2 && !out.twoSided && !out.poleViolation;
  return out;
}

/**
 * The compact seal for `_authorship.propositionAuthored` — the authored
 * proposition as the config-only gate must see it (no brief file needed).
 * Detector propositions are NOT sealed: the gate judges author-given meaning.
 */
function sealFor(prop) {
  if (!prop || prop.src !== "author" || !Array.isArray(prop.poles) || !prop.poles.length) return null;
  return {
    relation: prop.relation,
    poles: prop.poles.map((p) => ({ text: p.text || null, entity: p.entity || null, status: p.status })),
    representation: (prop.visual && prop.visual.representation) || null,
    icon: (prop.visual && prop.visual.icon) || null,
    perCast: ((prop.visual && prop.visual.perCast) || []).map((c) => ({ entity: c.entity, face: c.face || null, action: c.action || null, holds: c.holds || null })),
  };
}

/**
 * P9-B stager: put the AUTHOR-SEALED proposition's poles on the scene with
 * levers the renderer draws today (verified against schema.ts/shots.ts):
 *   split / beforeAfter / twoShot → scene.shot (the both-poles frames)
 *   flow                          → an AUTHORED flow diagram (cause → effect)
 *   perCast[]                     → per-cast face/action/holds (enum-checked)
 *   visual.icon                   → scene.concept (no cast) or a held hand-prop
 * Only author-sealed propositions stage (detector-grade never does); every
 * skip is recorded, nothing is invented (the P9-A A4 rule). Mutates ONLY the
 * representational levers named by the seal — never the narration or the copy.
 */
function stageProposition(seal, scene, { expressionEnum = null, actionEnum = null, holdsEnum = null, sceneIcons = null } = {}) {
  const out = { staged: [], skipped: [] };
  if (!seal || !Array.isArray(seal.poles) || !scene) {
    if (seal) out.skipped.push({ lever: "all", reason: "proposition needs two poles and a scene" });
    return out;
  }
  const note = (lever, detail) => out.staged.push({ lever, detail });
  const skip = (lever, reason) => out.skipped.push({ lever, reason });
  const rep = seal.representation;

  if (rep === "split" || rep === "beforeAfter" || rep === "twoShot") {
    if (scene.shot !== rep) { note("shot", `${scene.shot}→${rep} (authored ${seal.relation})`); scene.shot = rep; }
    else skip("shot", `already ${rep}`);
  } else if (rep === "flow" && !scene.diagram) {
    scene.diagram = { type: "flow", labels: seal.poles.map((p) => p.text || p.entity || "").filter(Boolean).slice(0, 2), at: 0, authored: true };
    if (scene._authorship) scene._authorship.diagramAuthored = true;
    note("diagram", "authored flow diagram carries the cause→effect poles");
  } else if (rep === "equivalence") {
    skip("representation", "equivalence has no dedicated shot — stage it via perCast faces/holds (the renderer has no equivalence shot)");
  } else if (rep) {
    skip("representation", `unknown representation "${rep}"`);
  }

  (seal.perCast || []).forEach((pc, k) => {
    const ch = (scene.characters || []).find((c) => c && c.identity === pc.entity);
    if (!ch) { skip(`perCast[${k}]`, `no staged cast member "${pc.entity}"`); return; }
    if (pc.face) {
      if (expressionEnum && expressionEnum.has(pc.face)) { if (ch.expression !== pc.face) { note(`perCast[${k}].face`, `${ch.expression}→${pc.face}`); ch.expression = pc.face; } }
      else skip(`perCast[${k}].face`, `"${pc.face}" is not a renderer expression`);
    }
    if (pc.action) {
      if (actionEnum && actionEnum.has(pc.action)) { if (ch.action !== pc.action) { note(`perCast[${k}].action`, `${ch.action}→${pc.action}`); ch.action = pc.action; } }
      else skip(`perCast[${k}].action`, `"${pc.action}" is not a renderer action`);
    }
    if (pc.holds) {
      if (holdsEnum && holdsEnum.has(pc.holds)) { if (ch.holds !== pc.holds) { note(`perCast[${k}].holds`, `${ch.holds || "none"}→${pc.holds}`); ch.holds = pc.holds; } }
      else skip(`perCast[${k}].holds`, `"${pc.holds}" is not a renderer hand prop`);
    }
  });

  if (seal.icon && (!sceneIcons || sceneIcons.includes(seal.icon)) && !iconOnScene(scene, seal.icon)) {
    const chars = scene.characters || [];
    if (!chars.length) {
      // PIXEL-PROOF FIX (P9-B.2a smoke): scene.concept alone is telemetry — the
      // renderer never reads it, so a concept-only staging drew NOTHING. The
      // icon now stages twice: concept (the beat's subject, config-level) AND a
      // drawn prop motif the renderer paints (every SCENE_ICON is a propType).
      note("concept", `authored pole icon "${seal.icon}" on the empty frame (concept + drawn prop)`);
      scene.concept = seal.icon;
      if (!Array.isArray(scene.props)) scene.props = [];
      if (!scene.props.some((p) => p && p.type === seal.icon)) scene.props.push({ type: seal.icon, at: 0 });
    }
    else if (holdsEnum && holdsEnum.has(seal.icon)) { note("holds", `authored pole object "${seal.icon}" into the staged hand`); chars[0].holds = seal.icon; }
    else skip("icon", `cast present and "${seal.icon}" is not a hand prop — the composition stays the author's`);
  } else if (seal.icon && sceneIcons && !sceneIcons.includes(seal.icon)) {
    skip("icon", `"${seal.icon}" is not a scene icon (world vocabulary)`);
  }
  return out;
}

module.exports = {
  RELATIONS, POLE_STATUSES, REPRESENTATIONS, TWO_SIDED_SHOTS,
  normalizeProposition, detectProposition, stagedPoles, sealFor, stageProposition, idleWallpaperOf,
};
