/**
 * story-share.js — how much of a narration TELLS the book (2026-11-20).
 *
 * The first measure counted the sentences that carry a proper name. Two things were wrong with it:
 *   - a told scene is mostly sentences that carry none ("He takes the pen and signs them.") — a scene is a STRETCH:
 *     the sentence that names the book and the sentences beside it;
 *   - a book is also named by its THINGS and roles ("the count", "the log", "the mirror" — no capital letter).
 * storyShare() counts the WORDS standing in such stretches (a sentence within `reach` sentences of a naming one) and the
 * longest run of words that names nothing. With `vocab` (vocabOf(entities)) a sentence also names the book when it
 * says one of the book's own words; without it only proper names count (a recording that has no book folder yet).
 *
 * Measured 2026-11-20, names only / names + things: Dracula old 41-min film 71 % / 81 %, second formed recording
 * 53 % / 68 %, v4 recording 43 % / 65 %. Channel, names only: fiction median 60 %, nonfiction 41 % (CHANNEL below).
 * The formed recordings argue more and retell less than the old one — by either measure. Pure; reports only.
 */
const { namesIn } = require("./told-entities");

const CHANNEL = { fiction: 0.6, nonfiction: 0.41, all: 0.49 }; // names only, reach 1, 85 films (2026-11-20)
const STOP = new Set(["the", "of", "and", "a", "an", "in", "at", "to", "with", "open", "three", "year", "that", "this", "from", "into", "their", "what", "when", "which"]);
const plain = (s) => String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z ]+/g, " ").split(" ").filter(Boolean);

/** the book's own words: every entity's label, names and words (4 letters or more; ids are not words) */
function vocabOf(entities = {}) {
  const v = new Set();
  for (const e of Object.values(entities || {})) { if (!e || typeof e !== "object") continue; for (const src of [e.label, ...(Array.isArray(e.words) ? e.words : []), ...(Array.isArray(e.names) ? e.names : [])]) for (const w of plain(src)) if (w.length >= 4 && !STOP.has(w)) v.add(w); }
  return v;
}

/**
 * The book's PLACES as the narration says them (2026-11-23): for every drawn place of entities.json the phrases a
 * narration uses for it — its id ("ellie-room" → "ellie room"), its label without "the", its readings (the place's own
 * and its backdrop's). Generic words that name no particular place ("room", "home", "place", "house", "office") are
 * dropped, as are phrases under four letters. → [{ id, phrases: [..] }]
 */
// words that name no particular place, or that a narration mostly says for something else ("the table", "a flat
// voice", "coffee", "the door", "the road ahead") — a reading is drawn for a blind viewer, not for the narration
const GENERIC_PLACE = new Set(["room", "home", "place", "house", "office", "building", "city", "inside", "outside", "scene", "interior",
  "table", "flat", "coffee", "coffee cup", "trees", "road", "door", "front door", "stove", "cooker", "hallway", "street", "window"]);
function placeWordsOf(entities = {}) {
  const out = [];
  for (const [id, e] of Object.entries(entities || {})) {
    if (!e || e.kind !== "place") continue;
    const src = [id.replace(/[-_]+/g, " "), e.label, ...(Array.isArray(e.reads) ? e.reads : []), ...((e.backdrop && Array.isArray(e.backdrop.reads)) ? e.backdrop.reads : [])];
    const phrases = [...new Set(src.map((s) => plain(s).filter((w) => w !== "the" && w !== "a").join(" ")).filter((p) => p.length >= 4 && !GENERIC_PLACE.has(p)))];
    if (phrases.length) out.push({ id, phrases });
  }
  return out;
}
/** which places a text names (whole-word match; a trailing "s" allowed) → [{ id, phrase }] */
function placesNamedIn(text, placeWords) {
  const t = ` ${plain(text).join(" ")} `, hits = [];
  for (const p of placeWords || []) { const ph = p.phrases.find((x) => t.includes(` ${x} `) || t.includes(` ${x}s `)); if (ph) hits.push({ id: p.id, phrase: ph }); }
  return hits;
}

function storyShare(text, { reach = 1, vocab = null } = {}) {
  const sentences = String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+/).filter(Boolean);
  if (!sentences.length) return null;
  const has = vocab && vocab.size ? (s) => plain(s).some((w) => vocab.has(w) || vocab.has(w.replace(/s$/, ""))) : () => false;
  const names = (s) => namesIn(s).some((nm) => !/^\d{4}$/.test(nm)) || has(s);
  const words = sentences.map((s) => s.split(" ").length), naming = sentences.map(names);
  const near = naming.map((_, i) => { for (let d = -reach; d <= reach; d++) if (naming[i + d]) return true; return false; });
  const total = words.reduce((a, b) => a + b, 0);
  let inStory = 0, run = 0, longest = 0;
  near.forEach((n, i) => { if (n) { inStory += words[i]; run = 0; } else { run += words[i]; if (run > longest) longest = run; } });
  const long = sentences.map((s, i) => [s, naming[i]]).filter(([s]) => s.split(" ").length >= 4);
  return { share: total ? inStory / total : null, namingSentences: long.length ? long.filter(([, n]) => n).length / long.length : null, longestTalkWords: longest, words: total, withThings: !!(vocab && vocab.size) };
}

module.exports = { storyShare, vocabOf, placeWordsOf, placesNamedIn, CHANNEL };
