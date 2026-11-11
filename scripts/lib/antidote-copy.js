/**
 * antidote-copy.js — the CALLOUT COPYWRITER for the Antidote engine.
 *
 * The old `punchWord()` scored candidates by LENGTH and handed a bonus to words
 * ending in -ion/-ment/-ness — i.e. it actively rewarded abstract nouns. On
 * clear-thinking that produced 182 callouts of which 71% were ≥10-character
 * abstractions: ORGANIZATION / DESIGNATED / SCREAMING / MANAGEMENT / INFORMATION.
 * Nobody stops scrolling for a noun.
 *
 * This module mines short PHRASES instead and scores them on punch: concrete and
 * loaded words, negations, second person, imperatives — while penalising exactly
 * the abstractions the old scorer chased. It also knows when to say nothing: a
 * beat with no strong phrase gets no callout, because a silent frame lands
 * harder than a weak word, and it picks a kinetic STYLE that fits the phrase.
 *
 * The heuristic is the FALLBACK. The best copy comes from Claude via
 * `plan-antidote.js --emit-beats=<file>` → author → `--callouts=<file>`.
 */

const STOP = new Set(
  ("the a an and or but so of to in on at for with as is are was were be been being am it its this that these those we you they i he she him her his hers " +
    "our ours your yours my mine me us them there here what how why who whom when which while where whose not no yes do does did done have has had " +
    "can could would should will shall may might must get got gets going gonna just like really very much more most about into from than then now " +
    "one two also even still because though although if whether s t re ve ll d m").split(/\s+/),
);

// Words that read as empty in a bold callout, however long they are.
const GENERIC = new Set(
  ("completely everything something anything nothing everyone someone anyone anybody everybody absolutely basically literally actually honestly " +
    "obviously definitely essentially seriously totally probably certainly generally usually suddenly simply exactly especially particularly " +
    "kind sort thing things stuff okay yeah right mean know think say said says going different important interesting " +
    "oh wow yikes huh hmm um uh ah eh well yep nope exactly precisely sure").split(/\s+/),
);

// A callout that ends on an auxiliary or a bare negation dangles mid-thought
// ("SUCCESS ISN'T", "AREN'T ANALYZING") — it reads as a caption cut off, not a hook.
const AUX_TAIL = new Set(
  ("is are was were be been being am has have had do does did will would should could must may might " +
    "isn't isnt aren't arent wasn't wasnt weren't werent don't dont doesn't doesnt didn't didnt won't wont " +
    "can't cant couldn't couldnt shouldn't shouldnt wouldn't wouldnt not never").split(/\s+/),
);

// Concrete, loaded, human words — what a callout should actually be made of.
const STRONG = new Set(
  ("fear afraid scared terror panic anger angry rage shame guilt regret doubt dread " +
    "stuck trap trapped stall frozen broke broken break breaks lose lost losing loser fail failed failure quit weak wrong right " +
    "lie lies lying truth true real fake honest hide hidden secret blind blindspot ego pride comfort excuse blame fault " +
    "money rich poor debt broke cost costs price free cheap expensive salary income wealth profit loss " +
    "boss power control freedom cage chain leash rules risk safe danger " +
    "win won winner strong power fast slow late early cheap deadline clock time years years hours minutes " +
    "pain hurt hurts love hate alone lonely friend enemy family kid kids child parents " +
    "job career dream goal plan start stop change grow growth small big huge tiny first last only best worst enough " +
    "brain mind habit habits choice choose pick path fork door wall wall bridge ladder mountain maze " +
    "work works worked practice skill talent luck lucky effort " +
    "story mistake mistakes error blunder trap question answer proof evidence data numbers " +
    "life death dead kill fight war battle win lose survive escape " +
    "fire alarm crisis chaos mess disaster warning signal noise silence " +
    "room table seat chair phone email meeting team boss client customer market " +
    "body face voice hands heart head gut nerve guts " +
    "rule rules game score board move moves player " +
    "you your yourself everyone nobody anyone").split(/\s+/),
);

// Verbs that make a phrase an instruction — the punchiest callout shape there is.
// They are great at the HEAD of a phrase and terrible at the tail, where they
// dangle ("YOU START", "TIME YOU NEED"): see the tail rule in bestPhrase().
const IMPERATIVE = new Set(
  ("stop start ask look notice choose decide change build break try keep quit move wait listen watch think learn remember forget " +
    "ignore accept admit act do make take give run walk pause slow speed count check put need want feel get know see say tell " +
    "turn send play mean beat hold push pull open close write read").split(/\s+/),
);

// True negations only. "stop" and "without" used to live here, which made the
// `strike` style fire on imperatives — a crossed-out "STOP" says the opposite of
// what the beat means.
const NEGATION = new Set(
  "never not no none nothing nobody nowhere don't dont doesn't doesnt didn't didnt cant can't cannot won't wont isn't isnt aren't arent wasn't wasnt shouldn't shouldnt".split(/\s+/),
);

// Words that may LEAD a phrase even though they're stopwords — they carry punch.
const LEADERS = new Set("no not never your you the too more less every all one only".split(/\s+/));
// Words a phrase must never END on.
const BAD_TAIL = new Set([
  ...STOP, ...GENERIC, ...AUX_TAIL,
  ..."very so too before after into onto over under through around across toward towards upon off out up down back away again own".split(/\s+/),
]);
// A phrase that OPENS on an auxiliary reads as a caption fragment ("AREN'T
// ANALYZING"). Negations are the exception — "NEVER WORKS" opens perfectly.
const BAD_HEAD = new Set([...AUX_TAIL].filter((w) => w !== "not" && w !== "never"));

const ABSTRACT = /(tion|sion|ment|ness|ity|ance|ence|ism|ology|ative|ational)$/i;

const norm = (w) => w.toLowerCase().replace(/[^\w']/g, "");

/** Punch value of a single word, before phrase-level bonuses. */
function wordScore(raw) {
  const w = norm(raw);
  if (!w) return -99;
  let s = 0;
  if (STRONG.has(w)) s += 6;
  if (NEGATION.has(w)) s += 5;
  if (IMPERATIVE.has(w)) s += 4;
  if (GENERIC.has(w)) s -= 6;
  if (STOP.has(w)) s -= 2;
  if (ABSTRACT.test(w)) s -= 5; // the exact class the old scorer rewarded
  if (w.length >= 11) s -= 3;
  else if (w.length >= 9) s -= 1;
  else if (w.length <= 6 && !STOP.has(w)) s += 2; // short words punch
  return s;
}

/** Mine 1–4 word phrases and score them. Returns the best, or null. */
function bestPhrase(text) {
  // sentence-ish units keep phrases from straddling a full stop
  const units = text.split(/[.!?;:]+/).map((u) => u.trim()).filter(Boolean);
  let best = null;
  for (const unit of units) {
    const raw = unit.split(/\s+/).map((w) => w.replace(/^[^\w'$%]+|[^\w'$%]+$/g, "")).filter(Boolean);
    for (let i = 0; i < raw.length; i++) {
      for (let n = 1; n <= 4 && i + n <= raw.length; n++) {
        const span = raw.slice(i, i + n);
        const head = norm(span[0]);
        const tail = norm(span[span.length - 1]);
        if (!head || !tail) continue;
        if (STOP.has(head) && !LEADERS.has(head)) continue;
        if (BAD_HEAD.has(head)) continue;
        if (BAD_TAIL.has(tail)) continue;
        // The LAST word is the payload — it is what the viewer is left holding.
        // For a multi-word callout it has to be a concrete, loaded word, never a
        // dangling verb or adjective ("LIFE A FLAT", "YOU CANNOT BEAT").
        if (n > 1 && (!STRONG.has(tail) || IMPERATIVE.has(tail))) continue;
        const chars = span.join(" ").length;
        if (chars > 22) continue;

        let s = span.reduce((a, w) => a + wordScore(w), 0);
        // a phrase beats a lone noun — but only if it earns its width
        if (n === 2) s += 3;
        else if (n === 3) s += 4;
        else if (n === 4) s += 2;
        if (span.some((w) => NEGATION.has(norm(w)))) s += 4;
        if (span.some((w) => norm(w) === "you" || norm(w) === "your")) s += 3;
        if (IMPERATIVE.has(head)) s += 4;
        if (chars > 16) s -= (chars - 16) * 0.6;
        if (span.every((w) => STOP.has(norm(w)))) s -= 20;

        if (!best || s > best.score) best = { text: span.join(" "), score: s, words: n, negated: span.some((w) => NEGATION.has(norm(w))) };
      }
    }
  }
  return best;
}

/**
 * A number/stat is the strongest thing that can be on screen — but only if it
 * MEANS something. A bare two-digit number is usually a time or a list index
 * ("8.15 a.m.", "the next 10 moves"); stamping it on the frame says nothing, so
 * a stat must carry a currency, a unit, or be big enough to be a real figure.
 */
function statOf(text) {
  const m = text.match(
    /\$\s?\d[\d,.]*\s?(?:million|billion|thousand|k)?|\b\d[\d,.]*\s?(?:%|percent|million|billion|thousand|x|times)\b|\b\d{3,}(?:[.,]\d+)?\b/i,
  );
  if (!m) return null;
  return m[0].toUpperCase().replace(/\s+/g, " ").replace(/\s?PERCENT/, "%").trim();
}

/**
 * Copywriter — stateful across the film so callouts don't repeat and don't fire
 * on every single scene. Scarcity is what makes the ones that do fire land.
 */
function createCopywriter({ minScore = 12 } = {}) {
  const used = new Set();
  let sinceLast = 99;

  /** @returns {{text,style}|null} */
  function write(text, beatClass) {
    sinceLast += 1;
    const stat = statOf(text);
    if (stat && !used.has(stat)) {
      used.add(stat);
      sinceLast = 0;
      return { text: stat, style: "outline" };
    }

    const p = bestPhrase(text);
    if (!p) return null;
    const key = p.text.toUpperCase();
    if (used.has(key)) return null; // never say the same callout twice

    // Back-to-back callouts blunt each other: the second one has to be better.
    const floor = sinceLast <= 1 ? minScore + 5 : minScore;
    if (p.score < floor) return null;

    used.add(key);
    sinceLast = 0;
    return { text: key, style: pickStyle(p, beatClass) };
  }

  return { write };
}

/** The kinetic treatment that fits the phrase's shape and the beat. */
function pickStyle(p, beatClass) {
  if (p.negated) return "strike"; // "NEVER TOO LATE" gets crossed out
  if (beatClass === "stat") return "outline";
  if (p.words >= 3) return "reveal"; // read it the way it is spoken
  if (p.words === 2) return "highlight"; // accent bar wipes in behind the operative word
  if (beatClass === "positive" || beatClass === "crowd") return "stack";
  return "box";
}

module.exports = { createCopywriter, bestPhrase, statOf, pickStyle };
