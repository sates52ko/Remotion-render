"use strict";

/**
 * entity-core.js — P3.3 ASR entity normalization, shared by:
 *   scripts/audit-coherence.mjs   (measure: same decisions, zero drift)
 *   scripts/normalize-entities.js (apply)
 *
 * THE PROBLEM: the audio spine (_narration, clean.vtt, cast keys, identity
 * fields) was transcribed by ASR, which mangles proper nouns — "Verity" →
 * "Varity" (55×), "Lowen" → "Loen"/"Loan"/"Lman"/"Lohen". Those variants
 * baked into captions (audience-visible on the final render), into
 * meta.cast (phantom personas), and into segment grounding.
 *
 * THE RULE — generic, never book-specific (no `if (slug === …)`):
 *   • Canonical entity words come from CODE-OWNED BOOK DATA ONLY:
 *     book.json title/author + story-bible cast names.
 *   • The association graph is SEEDED: canonicals + attested cast keys.
 *     A corpus word form may only JOIN when it sits within edit distance 2
 *     of an existing member (fixpoint, ≤4 rounds). A seedless d≤2 graph over
 *     words collapses into one giant component ("what"–"that" are 1 edit
 *     apart) and every capitalized word then "resolves" to some canonical —
 *     observed failure, do not regress to it.
 *   • A word occurrence is replaced only when it carries a PROPER-NOUN
 *     SIGNAL at that occurrence:
 *       - "proper"    capitalized mid-sentence → free variant, d ≤ 2
 *                     (or chained: reachable to a canonical through other
 *                     variants — that is how "Lman" maps via "loan")
 *       - "caps"      ALL-CAPS (labels)        → not a common English word
 *       - "initial"   sentence-initial         → strict: d ≤ 2, length
 *                     within 1, not common — a bare capital proves little
 *       - "lower"     never (auto-captions do not capitalize names
 *                     lowercase mid-sentence; the English word "loan" must
 *                     stay the English word "loan")
 *   • Extensions of a canonical (readers/reader, jeremys/jeremy) are never
 *     "variants" — plurals/possessives keep their meaning. Truncations
 *     (chast→chastin) are allowed for proper/caps only and gated by the
 *     COMMON_INITIAL list when sentence-initial (read/grew/crow…).
 *
 * Keep this file dependency-free CJS; it must import cleanly from .mjs
 * (Node ESM default interop) and from plain .js scripts.
 */

/** Generic English words that sit within edit distance 2 of a name-shaped
 *  canonical/cluster and would otherwise look like variants at a sentence
 *  start or in an ALL-CAPS label. Extend when the audit reports a miss or a
 *  false hit — never special-case a book. */
const COMMON_INITIAL = new Set(
  ("very verify verse version versus vary varied lower upper hover hovered " +
    // "loan" is deliberately absent below: it only enters the graph at d≤1
    // from the name-key "lowen" (graph-first — a corpus without a Lowen-family
    // seed never maps it), and its stoplist presence blocked ×34 true initial
    // artifacts ("Loan — characterization", "Loan is standing at a crosswalk").
    // lowercase English "loan" outside such a graph is unreachable anyway.
    "grew grow crew crow crows brew screw loans lone lore love loved " +
    "ready reed reads reading read draw drew jerk jerky clan chasten " +
    "narration narrated over clever cover lover liver user team tear fear " +
    "lead lean lane line time dime core cord care cite site " +
    // words that sit d2 from the short name-key "loen" and thus joined the
    // one-hop graph — deep-walk pass surfaced them as false hits (when→lowen
    // ×38, doesn→lowen ×10, lock→lowen ×11, even→lowen ×6 in verity alone)
    "when even lock doesn")
    .split(" ")
);

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 4) return 99; // cheap bail before the DP
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Canonical single-word entities from book.json + story-bible cast names. */
function canonicalTokens({ title = "", author = "", castNames = [] } = {}) {
  const words = [];
  for (const chunk of [title, author, ...castNames]) {
    for (const w of String(chunk || "").split(/[^A-Za-z]+/)) {
      if (w.length >= 4) words.push(w.toLowerCase());
    }
  }
  return [...new Set(words)];
}

/** Walk words of `text` preserving every byte of non-word content.
 *  cb(rawWord, initial) — initial = first word of the string or right after
 *  [.!?\n] (scene/cue boundaries are newlines). Return a string to replace
 *  the word, null to keep it. */
function transformWords(text, cb) {
  const src = String(text ?? "");
  const parts = src.split(/([A-Za-z]+)/); // odd indexes are word tokens
  let initial = true;
  let changed = false;
  const changes = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (/[.!?\n]/.test(parts[i])) initial = true;
      continue;
    }
    const raw = parts[i];
    const out = cb(raw, initial);
    if (out != null && out !== raw) {
      parts[i] = out;
      changed = true;
      changes.push({ from: raw, to: out });
    }
    initial = false;
  }
  return { text: changed ? parts.join("") : src, changes };
}

function wordClass(raw, initial) {
  if (raw.length > 1 && raw === raw.toUpperCase()) return "caps";
  if (/^[A-Z]/.test(raw)) return initial ? "initial" : "proper";
  return "lower";
}

/**
 * Build the variant→canonical association graph.
 *  seeds     = canonicals ∪ extraNodes (cast keys — attested name forms from
 *              the transcript, they keep chains alive: lman → loan → lowen)
 *  join rule = a corpus signal form (capitalized/caps occurrence, ≥4 letters)
 *              attaches only within d ≤ 2 of a member; fixpoint, ≤4 rounds
 *  resolve   = nearest canonical inside the member's d≤2 component;
 *              `chained` marks members with no direct edge to it.
 * Returns { get(form), map }.
 */
function buildAssociation({ texts = [], extraNodes = [], canonicals = [] } = {}) {
  const canon = [...new Set(canonSafe(canonicals))];
  const members = new Set();
  const add = (w) => {
    const w2 = String(w || "").toLowerCase();
    if (w2.length >= 4) members.add(w2);
  };
  for (const c of canon) add(c);
  for (const k of extraNodes) add(k);

  // candidate corpus forms: any non-lowercase occurrence of a ≥4-letter word
  const candidates = new Set();
  for (const t of texts) {
    transformWords(t, (raw, initial) => {
      const w = raw.toLowerCase();
      if (w.length >= 4 && wordClass(raw, initial) !== "lower" && !members.has(w)) candidates.add(w);
      return null;
    });
  }
  // ONE hop only: a corpus form joins iff it sits within d ≤ 2 of a SEED
  // (canonical or cast key). Multi-hop chains snake into generic vocabulary —
  // observed: chast(d2 from chastin-seed) ← what(d2 from chast), and every
  // capitalized common word "resolved" to a name (what→chastin ×31). Keys
  // already ARE the attested transcript variants, so real chains run
  // key-to-canonical (lman —(1)— loan —(1)— lowen) and never need a corpus
  // bridge. Fixpoint growth of members from corpus candidates is forbidden.
  const seeds = [...members];
  for (const f of [...candidates]) {
    if (members.has(f)) continue;
    for (const s of seeds) {
      if (editDistance(f, s) <= 2) {
        members.add(f);
        break;
      }
    }
  }

  // union-find over members (edges d≤2) → resolve each to its nearest canonical
  const arr = [...members];
  const parent = new Map(arr.map((x) => [x, x]));
  const find = (x) => {
    const p = parent.get(x);
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (a, b) => parent.set(find(a), find(b));
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (editDistance(arr[i], arr[j]) <= 2) union(arr[i], arr[j]);
    }
  }
  const byRoot = new Map();
  for (const n of arr) {
    const r = find(n);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(n);
  }
  const map = new Map();
  for (const group of byRoot.values()) {
    const canonicalsHere = group.filter((g) => canon.includes(g));
    if (!canonicalsHere.length) continue;
    for (const node of group) {
      if (canon.includes(node)) continue;
      let best = null;
      for (const c of canonicalsHere) {
        const d = editDistance(node, c);
        if (!best || d < best.directD) best = { canonical: c, directD: d };
      }
      if (best) {
        // closest distance to ANY trusted seed (canonical ∪ cast key) — the
        // discriminator between attested name variants (loens→loen key, d1)
        // and English words that merely sit d2 from a short name (view→crew).
        let seedD = Infinity;
        for (const s of seeds) {
          const d = editDistance(node, s);
          if (d < seedD) seedD = d;
        }
        map.set(node, { canonical: best.canonical, directD: best.directD, seedD, chained: best.directD > 2 });
      }
    }
  }
  return {
    map,
    get: (form) => map.get(String(form || "").toLowerCase()) || null,
  };
}

function canonSafe(list) {
  return [...new Set(list.filter(Boolean).map((w) => String(w).toLowerCase()).filter((w) => w.length >= 4))];
}

/**
 * The single replacement decision, shared by audit (count) and normalize
 * (apply). Returns { canonical, style, class } or null. `initial` = sentence
 * start. Graph membership already implies "name-shaped"; these gates decide
 * per-occurrence whether the surrounding case/punctuation is convincing.
 *
 * seedD (distance to the nearest trusted seed) is the workhorse:
 *   caps   — ALL-CAPS has no case signal, so demand a seed at d ≤ 1. Real
 *            label artifacts (LOEN, VARITY, CHASTON, LOENS via the loen key)
 *            all qualify; English label words (VIEW d2-crew, CREDO, HUMAN,
 *            LOOP, DOWN, BLOWN) all sit ≥ 2 from every seed and stay put.
 *   proper — capitalized mid-sentence is already a name signal, so allow a
 *            direct canonical hit at d ≤ 2 (Varity, Lohan, Logan, Chast,
 *            Jere) or a seed at d ≤ 1 (Lmen via the loen key). Vary (d4 to
 *            verity, d2 to the varity key) fails both — observed FP, do not
 *            regress. COMMON is deliberately NOT checked here: "Loan" is a
 *            legitimate artifact even though "loan" is a common word.
 *   initial — a bare capital at a sentence start proves little: direct
 *            canonical d ≤ 2, length within 1, and not a common word.
 */
function decideReplacement(raw, initial, assoc) {
  const lower = raw.toLowerCase();
  if (lower.length < 4) return null;
  const t = assoc.get(lower);
  if (!t) return null;
  if (lower === t.canonical) return null;
  // extensions of a canonical are plurals/possessives, not ASR variants
  if (lower.startsWith(t.canonical)) return null;
  const cls = wordClass(raw, initial);
  const d = t.directD;
  const dlen = Math.abs(lower.length - t.canonical.length);
  let ok = false;
  // proper: capitalized mid-sentence is a name signal — allow a direct
  // canonical hit at d≤2 or a trusted seed at d≤2 (Lman's nearest stable seed
  // after the key merge is the bible's loen key at d2); COMMON still guards
  // comma-adjacent English ("…, When …") and everything else stoplisted.
  if (cls === "proper") ok = (d <= 2 || t.seedD <= 2) && !COMMON_INITIAL.has(lower);
  // seedD ≤ 0 = the form IS an attested cast key (itself a trusted seed).
  // Keys like "loan" collide with COMMON_INITIAL (the English guard) — the
  // attestation wins over the stoplist, but only for the exact key form, so
  // lowercase English "loan" and every non-key neighbor stay guarded.
  else if (cls === "caps") ok = ( !COMMON_INITIAL.has(lower) && t.seedD <= 1 ) || t.seedD <= 0;
  // lower: transcripts DO emit lowercase names mid-sentence ("the house is
  // entirely saturated with varity") — a lowercase English word sits d≤1 from
  // a canonical only when it IS the name; loan/grew/crow/very stay guarded by
  // COMMON_INITIAL, everything else needs a direct canonical hit.
  else if (cls === "lower") ok = d <= 1 && !COMMON_INITIAL.has(lower);
  // initial: seedD≤2 keeps runs deterministic after the first pass merges the
  // config cast keys away (Lman has no key left to seed from — its nearest
  // stable seed is the bible's loen key at d2), COMMON still guards real
  // English sentence-openers (grew/crow/verify…); seedD≤0 = the exact attested
  // key itself, which beats the stoplist (key "Loan" collides with it).
  // dlen relaxes to seedD≤2: "Chast"→chastin is d2/dlen2 — two inserts from
  // the name itself (a truncation, not an English lengthening); English
  // neighbors at seedD≤2 (verify/lover/lower…) all sit in COMMON_INITIAL.
  else if (cls === "initial")
    ok =
      ((d <= 2 || t.seedD <= 2) && (dlen <= 1 || t.seedD <= 2) && !COMMON_INITIAL.has(lower)) ||
      t.seedD <= 0;
  if (!ok) return null;
  const style = cls === "caps" ? "upper" : cls === "lower" ? "lower" : "capitalize";
  return { canonical: t.canonical, style, class: cls };
}

function applyStyle(canonical, style) {
  if (style === "upper") return canonical.toUpperCase();
  if (style === "capitalize") return canonical.charAt(0).toUpperCase() + canonical.slice(1).toLowerCase();
  return canonical.toLowerCase();
}

module.exports = {
  COMMON_INITIAL,
  editDistance,
  canonicalTokens,
  transformWords,
  wordClass,
  buildAssociation,
  decideReplacement,
  applyStyle,
};
