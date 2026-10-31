/**
 * beat-text.js — beat text helpers + the archetype quota.
 *
 * Shared by plan-vox (new books) and apply-quota (already-planned books) so the
 * spread rule can never drift between the two paths.
 */

// ── on-screen EMPHASIS (the big words) ──────────────────────────────────────
// The emphasis words are the primary on-screen text for ~94% of beats. The old
// scorer picked the top-N *scattered* high-scoring words (length + a +6 bonus for
// ANY capitalized token), which in ASR narration means sentence-openers — so a
// beat about a coping strategy surfaced "IT'S LET". The fix: pick the single most
// salient CONTIGUOUS phrase (2-3 words) the way a headline editor would, bridging
// a small connector ("of"/"the") so "angel of death" / "book of martyrs" survive.
const EMPH_STOP = new Set((
  "the a an and or but so of to in on at by for with as is are was were be been being am " +
  "it its this that these those we you they i he she him her his hers their theirs our ours your yours my mine me us them " +
  "mean means meant just like really very much more most about into from than then now here there " +
  "what how why who whom when where which while whose not no nor yes um uh oh well okay ok yeah yep nope hmm " +
  "have has had do does did done get gets got getting go goes going gonna wanna " +
  "will would can could should may might must shall need needs " +
  "im ive id youre youve hes shes theyre thats whats lets dont doesnt didnt cant wont isnt arent " +
  "also even still yet too if because though although however therefore thus while " +
  "up down out off over under again once ever never always often sometimes " +
  "know think going want see look looking make makes made say says said thing things " +
  "s t re ve ll d m ll re"
).split(/\s+/));
const EMPH_FILLER = new Set((
  "specifically absolutely really actually basically literally honestly maybe probably obviously " +
  "essentially definitely certainly seriously totally completely kind sort bit lot pretty quite " +
  "sure right exactly yeah okay well guess mean"
).split(/\s+/));

// Analysis-scaffolding words: they describe the discussion of the book, not the
// story itself, so a beat's real subject should always beat them on screen.
const EMPH_META = new Set((
  "text texts novel novels book books author authors reader readers narrative narratives " +
  "source sources passage passages scene scenes chapter chapters story stories section sections " +
  "note notes point points idea ideas moment moments example examples detail details page pages " +
  "sequence part parts describe describes describing shows show telling tells notes noting"
).split(/\s+/));

const _emClean = (w) => w.toLowerCase().replace(/[^a-z0-9$%-]/g, "");
const _emIsContent = (c) =>
  !!c && (/\d/.test(c) || (c.length >= 3 && !EMPH_STOP.has(c) && !EMPH_FILLER.has(c)));
// tok = {clean, cap, raw} ; first = is this the segment-initial token (ASR
// capitalises sentence starts unreliably, so a cap bonus only counts
// mid-segment = a name).
const _emScore = (tok, first) => {
  let sc = 0;
  // ── base: prefer medium-length words, diminish very short/long ones ──
  sc += Math.min(tok.clean.length, 8);                     // cap at 8 so length alone can't dominate

  // ── strong signals: the things a viewer should remember ──
  if (/\d/.test(tok.clean)) sc += 12;                      // numbers, stats, years, ages
  if (/^\$/.test(tok.raw || tok.clean)) sc += 6;           // dollar amounts
  if (tok.cap && !first) sc += 10;                         // proper noun mid-sentence (Vincennes, Ashura, Roya)

  // ── weak positive: substantial content word (but not as good as a name) ──
  if (/^[a-z]{5,}$/.test(tok.clean) && !EMPH_STOP.has(tok.clean) && !EMPH_FILLER.has(tok.clean)) sc += 1;

  // ── penalties ──
  if (EMPH_META.has(tok.clean)) sc -= 10;                  // discussion scaffold, not story
  if (/ly$/.test(tok.clean) && tok.clean.length > 5) sc -= 5; // adverb (incredibly, utterly)
  // common verbs/adjectives that feel generic on screen
  if (/^(become|becomes|became|happen|happens|happened|start|starts|started|begin|begins|began|feel|feels|felt|realize|realizes|realized|decide|decides|decided|discover|discovers|discovered|learn|learns|learned|change|changes|changed|important|different|actually|certain|entire|another|something|everything|nothing|everyone|someone|without|because|between|through|before|during|after)$/.test(tok.clean)) sc -= 4;

  return sc;
};

/**
 * Pick the strongest contiguous phrase from a beat's narration for on-screen
 * display. Returns an array of 1-3 UPPERCASE words (its component words, in order,
 * so the renderer's per-word animation and colour still apply). Falls back to []
 * when nothing content-bearing is found (caller then uses keywords).
 */
function phraseEmphasis(text, { max = 3, want = 2 } = {}) {
  const segs = String(text).split(/[,.!?;:—]+|\s-\s/).map((s) => s.trim()).filter(Boolean);
  const cands = [];
  for (const seg of segs) {
    const toks = seg.split(/\s+/)
      .map((w) => {
        const raw = w.replace(/^[^A-Za-z0-9$%]+|[^A-Za-z0-9$%]+$/g, "").replace(/'\w+$/, "");
        return { raw, clean: _emClean(w), cap: /^[A-Z]/.test(raw) };
      })
      .filter((t) => t.raw.length);
    if (!toks.length) continue;
    for (let len = 1; len <= Math.min(max, toks.length); len++) {
      for (let a = 0; a + len <= toks.length; a++) {
        const win = toks.slice(a, a + len);
        if (!_emIsContent(win[0].clean) || !_emIsContent(win[len - 1].clean)) continue;
        const content = win.filter((t) => _emIsContent(t.clean));
        if (content.length * 2 < len) continue;         // majority must be content
        const stopInside = len - content.length;
        if (stopInside > 1) continue;                    // bridge at most one connector
        let score = win.reduce((s, t, k) => s + (_emIsContent(t.clean) ? _emScore(t, a + k === 0) : -3), 0);
        // prefer tight phrases, but a single high-value word (proper noun, number) should still win
        const hasProper = win.some((w, j) => w.cap && (a + j > 0));
        const hasNumber = win.some((w) => /\d/.test(w.clean));
        score += len === want ? 4 : len === 1 ? ((hasProper || hasNumber) ? 2 : -3) : len === 3 ? 1 : 0;
        cands.push({ words: win.map((t) => t.raw.toUpperCase()), score });
      }
    }
  }
  if (!cands.length) return [];
  cands.sort((a, b) => b.score - a.score);
  return cands[0].words;
}

/** Pull "a, b and c" out of narration as 2-4 short list items, else null. */
function listItems(t) {
  const m = String(t).match(
    /([\w-]+(?:\s[\w-]+)?),\s*([\w-]+(?:\s[\w-]+)?),?\s*(?:and|&)\s*([\w-]+(?:\s[\w-]+)?)/i,
  );
  return m ? [m[1], m[2], m[3]].map((s) => s.replace(/^(in|a|an|the|of|to|and)\s+/i, "").trim().toUpperCase()) : null;
}

const GENERIC = new Set(
  "THIS THAT THESE THOSE DESCRIPTION THING THINGS STUFF PART PARTS IT ONE MORE MOST SOME MANY MUCH KIND SORT WAY WAYS".split(/\s+/),
);

/** Normalize/uppercase list items, drop junk, cap at 4. */
function cleanItems(list) {
  const out = [];
  for (let it of list || []) {
    it = String(it).replace(/^(HIS|HER|THE|A|AN|OF|TO|AND|IN|THEIR|ITS)\s+/i, "").trim().toUpperCase();
    if (!it || it.length < 3 || GENERIC.has(it)) continue;
    if (!out.includes(it)) out.push(it);
  }
  return out.slice(0, 4);
}

/** Archetypes that break the statement/imagefocus alternation. */
const TEXTURE = new Set(["list", "quote", "stat", "compare"]);

const listScore = (b) => {
  const li = cleanItems(listItems(b.props.text) || []);
  return li.length >= 2 ? 100 + li.length : 0;
};
const statScore = (b) =>
  /(\$?\d[\d,.]*\s?(%|percent|million|billion|trillion|thousand))/i.test(b.props.text) ? 80 : 0;
const quoteScore = (b) => {
  // Only promote to `quote` when the beat genuinely reads like a line. QuoteScene
  // renders serif italic inside quotation marks — wrapping arbitrary narration in
  // it tells the viewer "the book says this" when it doesn't. Better to leave a
  // window short and let StatementScene's layout variants carry the variety.
  let sc = 0;
  if (/["“”]/.test(b.props.text)) sc += 45;
  const words = String(b.props.text).split(/\s+/).length;
  const e = (b.props.emphasis || []).length;
  if (words <= 14 && e >= 1 && e <= 2) sc += 25;
  else if (words <= 20 && e >= 1 && e <= 2) sc += 12;
  return sc >= 25 ? sc : 0;
};

/**
 * Enforce an archetype spread over a finished beat list, in place.
 *
 * Measured across two finished books: 94% of beats came out statement+imagefocus
 * alternating and `compare` was never used once — the old "no 3 in a row" guard
 * produces a binary alternation rather than variety.
 *
 * Content-aware on purpose: `list` needs real list items and `stat` needs a real
 * number, so the best CANDIDATE inside each window is promoted rather than
 * whatever beat happens to sit at the boundary. Only image-less `statement`
 * beats are eligible, so no generated image is orphaned and no extra Flux render
 * is implied. `compare` is never synthesised here — it needs two images, so it
 * has to come from art direction.
 *
 * @returns {{promoted: {list:number,stat:number,quote:number}, short:number, texture:number}}
 */
function applyQuota(beats, { window = 10, min = 2 } = {}) {
  const promoted = { list: 0, stat: 0, quote: 0 };
  let short = 0;
  for (let start = 0; start < beats.length; start += window) {
    const win = beats.slice(start, start + window);
    if (win.length < 4) break; // trailing stub — leave it alone
    let have = win.filter((b) => TEXTURE.has(b.type)).length;
    while (have < min) {
      const cands = win.filter((b) => b.type === "statement" && b.images.length === 0);
      let best = null;
      for (const b of cands) {
        for (const [kind, sc] of [["list", listScore(b)], ["stat", statScore(b)], ["quote", quoteScore(b)]]) {
          if (sc > 0 && (!best || sc > best.sc)) best = { b, kind, sc };
        }
      }
      if (!best) { short++; break; } // window genuinely has nothing promotable
      best.b.type = best.kind;
      if (best.kind === "list") best.b.props.items = cleanItems(listItems(best.b.props.text) || []);
      promoted[best.kind]++;
      have++;
    }
  }
  return { promoted, short, texture: beats.filter((b) => TEXTURE.has(b.type)).length };
}

module.exports = { listItems, cleanItems, GENERIC, TEXTURE, applyQuota, phraseEmphasis };
