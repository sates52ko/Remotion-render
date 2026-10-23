/**
 * title-lint.js — the YouTube title-set contract (search + counter-narrative, never generic).
 *
 * Operator decision 2026-10-22: counter-narrative packaging ("the ending everyone gets wrong",
 * "why smart people get it wrong") leads the channel's views and home-feed discovery, so EVERY
 * new book's title set must carry it — next to the search entity (book title + author + a
 * Summary/Explained/Review modifier). But the channel already shipped "The Ending Everyone Gets
 * Wrong" 10× and "Why Smart People Get It So Wrong" 7× verbatim: one template stamped on every
 * book reads as mass-produced (YPP "repetitive content") and the titles cannibalise each other.
 * So an angle only counts when it is THIS book's angle:
 *   - it names a book-specific ANCHOR (a character, object, event, concept from this book's own
 *     narration — not the title, not the author, not a word every book shares);
 *   - it is grounded in `titleAngles[]` (myth people believe → what the book shows → a verbatim
 *     quote from the narration that proves it);
 *   - its wording shares no 3-word run (and no near-identical skeleton) with any other book's titles.
 * Deterministic, no LLM. CLI: scripts/lint-titles.js. Regression: scripts/test-title-lint.js.
 */
const fs = require("fs");
const path = require("path");
const { ROOT, rel, listBookSlugs } = require("./paths");

const MAX_LEN = 100;
const VISIBLE = 60; // YouTube feed + Google SERP show ~60 chars
const MIN_TITLES = 5;
const MIN_ANGLES = 2;

// Search modifiers — these SHOULD repeat across books (they are what people type).
const MODIFIER_PHRASES = [
  "ending explained", "book summary", "full summary", "summary", "explained", "review", "analysis",
  "key ideas", "key lessons", "lessons", "themes", "breakdown", "recap", "audiobook", "meaning",
  "characters", "character analysis", "big ideas", "takeaways", "animated", "plot", "spoilers",
];
const MODIFIER_RE = new RegExp(`\\b(${MODIFIER_PHRASES.map((p) => p.replace(/ /g, "\\s+")).join("|")})\\b`, "i");
// Modifier words never count as angle words (stemmed into MODIFIER_WORDS below).
const MODIFIER_LIST = MODIFIER_PHRASES.join(" ").split(" ").concat(["full", "key", "big", "every", "minutes", "complete", "deep", "dive", "ending", "turning", "points", "guide", "chapter", "chapters"]);

// A counter-narrative title contradicts what most people believe about the book / topic.
const COUNTER_RE = /\b(wrong|misread|misreads?|misunderstood|misunderstand|myth|myths|isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|doesn['’]?t|don['’]?t|didn['’]?t|not|never|actually|really|lie|lies|lied|lying|backfires?|backfired|mistake|mistaken|misses|missed|miss|overlook(ed)?|opposite|nobody|no one|everyone|secretly|stop|forget|fails?|failed|trap|illusion|against|instead|rather than|just|disguised)\b/i;

// Phrases that are angle-shaped but say nothing about any particular book. Each already
// shipped on several channel titles; they are banned outright with a clear message.
const STOCK_PHRASES = [
  "why smart people get it so wrong", "smart people get it wrong", "the ending everyone gets wrong",
  "the terrifying reveal everyone gets wrong", "what everyone misses", "what it really means",
  "is really about", "what the book is really about", "everything you know about",
  "will change your life", "you won't believe", "nobody talks about this", "the truth nobody tells you",
  "the big idea behind", "what the author really wants you to know", "and it's not what you think",
  "every key idea in",
];

const STOP = new Set(("a an the and or but of in on at to for from by with as is are was were be been it its it's " +
  "this that these those you your we our they their he she his her him them i me my what why how who whom which when where " +
  "so do does did can could would should will just than then into about over under after before all any most more " +
  "vs versus one's s being been has have had not no like less very").split(" "));

// Words too common across books to identify one (checked in addition to corpus document frequency).
const GENERIC = new Set(("people person life lives world story stories book books truth thing things everything everyone " +
  "nobody someone anyone ending end beginning idea ideas secret secrets lesson lessons way ways man men woman women " +
  "smart real big time times mind minds love hate fear power money success happiness moment day days year years " +
  "counterintuitive surprising shocking simple hard reason reasons question answer problem problems part reader readers author novel character characters hero villain " +
  "good bad right wrong true false hidden dark new old first last only great little why how what really actually " +
  "most every never always still even also again reveal twist plot scene chapter page pages final whole entire " +
  "explained summary review analysis meaning wants know get gets got make makes made think thinks thought " +
  "prove proves proved mean means teach teaches taught say says said matter matters happen happens happened " +
  "lie lies myth myths trap illusion mistake").split(" "));

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
const tryJson = (p) => { try { return readJson(p); } catch { return null; } };
const norm = (s) => String(s || "").toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
const stem = (w) => w.replace(/'s$/, "").replace(/'$/, "").replace(/(ies)$/, "y").replace(/([^s])s$/, "$1");
const words = (s) => norm(s).split(" ").filter(Boolean);
const MODIFIER_WORDS = new Set(MODIFIER_LIST.map(stem));
const GENERIC_STEMS = new Set([...GENERIC].map(stem));

/** The book's own short title ("The Great Gatsby: A Novel" → "The Great Gatsby"). */
function shortTitleOf(title) { return String(title || "").split(/[:—–(]| - /)[0].trim(); }

function containsPhrase(hay, needle) {
  const h = ` ${norm(hay).replace(/'s\b/g, "")} `, n = norm(needle).replace(/'s\b/g, "");
  if (!n) return -1;
  const i = h.indexOf(` ${n} `);
  return i < 0 ? -1 : i;
}

/** Index of the book title in a title (tolerates a dropped leading "The"), or -1. */
function bookTitleIndex(t, shortTitle) {
  const full = containsPhrase(t, shortTitle);
  if (full >= 0) return full;
  const noThe = shortTitle.replace(/^(the|a|an)\s+/i, "");
  return noThe.split(/\s+/).length >= 1 && noThe.length >= 4 ? containsPhrase(t, noThe) : -1;
}

function authorMentioned(t, author) {
  if (!author) return false;
  const parts = String(author).split(/,|&| and /i).map((a) => a.trim()).filter(Boolean);
  return parts.some((a) => containsPhrase(t, a) >= 0 || containsPhrase(t, a.split(/\s+/).pop()) >= 0);
}

/** Words that belong to the book's identity (title + author) — never count as an anchor or as repetition. */
function identityWords(shortTitle, author) {
  return new Set(words(`${shortTitle} ${author || ""}`).map(stem));
}

/** The "angle" words of a title: what is left after the book identity, search modifiers and stopwords. */
function angleWords(t, idWords) {
  return words(t).filter((w) => !STOP.has(w)).map(stem).filter((w) => w && !idWords.has(w) && !MODIFIER_WORDS.has(w) && !STOP.has(w) && !/^\d+$/.test(w));
}

function ngrams(arr, n) {
  const out = [];
  for (let i = 0; i + n <= arr.length; i++) out.push(arr.slice(i, i + n).join(" "));
  return out;
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Narration text of a book (config captions/beats, else the clean/raw VTT). "" when none on disk. */
function narrationOf(slug, root = ROOT) {
  const p = (r) => path.join(root, r);
  try {
    if (fs.existsSync(p(rel.antidoteConfig(slug)))) {
      const c = readJson(p(rel.antidoteConfig(slug)));
      const caps = (c.captions || []).map((x) => x.text).join(" ");
      return caps || (c.scenes || []).map((s) => s._narration || "").join(" ");
    }
    if (fs.existsSync(p(rel.voxConfig(slug)))) {
      const c = readJson(p(rel.voxConfig(slug)));
      return (c.beats || []).map((b) => (b.props && b.props.text) || "").join(" ");
    }
  } catch {}
  for (const v of [rel.cleanVtt(slug), rel.vtt(slug)]) {
    if (fs.existsSync(p(v))) {
      return fs.readFileSync(p(v), "utf8").split(/\r?\n/)
        .filter((l) => l && !/-->/.test(l) && !/^WEBVTT/.test(l) && !/^\d+$/.test(l.trim()))
        .join(" ").replace(/<[^>]+>/g, "");
    }
  }
  return "";
}

/** One book's entry in the channel corpus (exported so tests can build a corpus by hand). */
function packEntry(slug, titles, shortTitle, author, text = "") {
  const ids = identityWords(shortTitle, author);
  return { slug, titles, angles: titles.map((t) => angleWords(t, ids)), vocab: new Set(words(`${titles.join(" ")} ${text}`).map(stem)) };
}

/** Titles + text of every book's YouTube pack (read once per root): the repetition corpus and the anchor DF corpus. */
const corpusCache = new Map();
function allPacks(root) {
  if (corpusCache.has(root)) return corpusCache.get(root);
  const books = [];
  const dir = path.join(root, "books");
  const slugs = root === ROOT ? listBookSlugs() : (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  for (const s of slugs) {
    const m = tryJson(path.join(root, rel.youtubeMeta(s)));
    if (!m) continue;
    const man = tryJson(path.join(root, rel.manifest(s)));
    const titles = (Array.isArray(m.titles) ? m.titles : []).map((t) => (t && typeof t === "object" ? t.title || t.text : t)).filter((t) => typeof t === "string");
    const text = [typeof m.description === "string" ? m.description : "", Array.isArray(m.tags) ? m.tags.join(" ") : String(m.tags || "")].join(" ");
    books.push(packEntry(s, titles, shortTitleOf((man && man.title) || m.bookTitle || s.replace(/-/g, " ")), (man && man.author) || m.author || "", text));
  }
  corpusCache.set(root, books);
  return books;
}
/** Every OTHER book's pack. */
function channelCorpus(slug, root = ROOT) { return allPacks(root).filter((b) => b.slug !== slug); }

/**
 * Lint a title set.
 * @param {object} o
 *   titles, shortTitle, author, titleAngles (array of {myth, book, quote, anchor?}),
 *   narration (string), corpus (from channelCorpus)
 * @returns {{status:"PASS"|"FAIL", errors:string[], warnings:string[], perTitle:object[]}}
 */
function lintTitleSet({ titles, shortTitle, author, titleAngles, narration, corpus }) {
  const errors = [], warnings = [];
  titles = (titles || []).filter((t) => typeof t === "string" && t.trim());
  corpus = corpus || [];
  const idWords = identityWords(shortTitle, author);
  const narr = norm(narration || "");
  const narrWords = new Set(narr.split(" ").map(stem));
  const dfLimit = Math.max(3, Math.ceil(corpus.length * 0.25));
  const df = (w) => corpus.reduce((n, b) => n + (b.vocab.has(w) ? 1 : 0), 0);

  if (titles.length < MIN_TITLES) errors.push(`TOO_FEW_TITLES: ${titles.length} (need ${MIN_TITLES}: spread search intents AND counter-narrative angles)`);

  const perTitle = titles.map((t, i) => {
    const r = { i, title: t, len: t.length };
    r.bookAt = bookTitleIndex(t, shortTitle);
    r.author = authorMentioned(t, author);
    r.modifier = MODIFIER_RE.test(t);
    r.counter = COUNTER_RE.test(t);
    r.angle = angleWords(t, idWords);
    r.anchors = r.angle.filter((w) => w.length >= 3 && !GENERIC_STEMS.has(w) && !COUNTER_RE.test(w) && narrWords.has(w) && df(w) <= dfLimit);
    r.stock = STOCK_PHRASES.filter((p) => norm(t).includes(norm(p)));
    r.angled = r.counter && r.anchors.length > 0;
    if (t.length > MAX_LEN) errors.push(`TOO_LONG #${i + 1}: ${t.length} > ${MAX_LEN} chars — "${t}"`);
    if (r.bookAt < 0) errors.push(`NO_BOOK_TITLE #${i + 1}: every title must carry "${shortTitle}" (the searched entity) — "${t}"`);
    else if (r.bookAt > VISIBLE) errors.push(`BOOK_TITLE_TRUNCATED #${i + 1}: "${shortTitle}" starts at char ${r.bookAt}, past the ~${VISIBLE} visible chars — "${t}"`);
    if (/[çğıöşüÇĞİÖŞÜ]/.test(t)) errors.push(`NOT_ENGLISH #${i + 1}: Turkish characters in a title (US market, English only) — "${t}"`);
    for (const p of r.stock) errors.push(`STOCK_PHRASE #${i + 1}: "${p}" is a channel-wide template, not this book's angle — "${t}"`);
    if (r.counter && !r.anchors.length && !r.stock.length)
      warnings.push(`UNANCHORED_ANGLE #${i + 1}: counter-narrative wording but no book-specific anchor from the narration (does not count as an angle) — "${t}"`);
    return r;
  });

  if (titles.length) {
    const p = perTitle[0];
    if (!(p.bookAt >= 0 && p.bookAt <= VISIBLE && p.modifier))
      errors.push(`PRIMARY_NOT_SEARCHABLE: titles[0] must front-load "${shortTitle}" + a search modifier (Summary / Explained / Review / Analysis …) — "${titles[0]}"`);
  }
  const nAuthor = perTitle.filter((r) => r.author).length;
  if (author && nAuthor < 2) errors.push(`AUTHOR_TOO_RARE: author "${author}" in ${nAuthor} title(s), need ≥ 2`);
  const nMod = perTitle.filter((r) => r.modifier).length;
  if (nMod < 3) errors.push(`MODIFIER_TOO_RARE: search modifier in ${nMod} title(s), need ≥ 3 (Summary / Explained / Review / Analysis / Ending Explained / Key Ideas …)`);

  const angled = perTitle.filter((r) => r.angled && !r.stock.length);
  if (angled.length < 2) errors.push(`TOO_FEW_ANGLES: ${angled.length} anchored counter-narrative title(s), need ≥ 2 (each names THIS book's misread thing: a character, object, event or claim from the narration)`);
  const anchorSets = angled.map((r) => new Set(r.anchors));
  if (angled.length >= 2 && anchorSets.every((s) => [...s].every((w) => anchorSets[0].has(w))) && anchorSets[0].size <= 1)
    errors.push(`ANGLES_NOT_DISTINCT: the counter-narrative titles all hang on the same anchor (${[...anchorSets[0]].join(", ")}) — use two different misreadings`);
  if (!perTitle.some((r) => r.angled && !r.stock.length && r.modifier && r.bookAt >= 0))
    errors.push(`NO_STACKED_TITLE: need ≥ 1 title that stacks book title + search modifier + an anchored counter-narrative angle (e.g. "<Book> Ending Explained: Why <Character>'s <Act> Isn't <Common Reading>")`);

  // Repetition inside the set.
  for (let a = 0; a < perTitle.length; a++) for (let b = a + 1; b < perTitle.length; b++) {
    const A = perTitle[a].angle, B = perTitle[b].angle;
    if (A.length >= 2 && B.length >= 2 && jaccard(A, B) >= 0.6)
      errors.push(`SET_REPEATS_ITSELF: #${a + 1} and #${b + 1} say the same thing — "${titles[a]}" / "${titles[b]}"`);
  }
  // Repetition against the channel: any shared 3-word angle run, or a near-identical angle skeleton.
  for (const r of perTitle) {
    if (r.angle.length < 2) continue; // a pure "<Book> Summary — <Author>" title is meant to repeat its shape
    const mine = new Set(ngrams(r.angle, 3));
    for (const b of corpus) {
      const hit = b.angles.findIndex((ang) => ngrams(ang, 3).some((g) => mine.has(g)) || (ang.length >= 2 && jaccard(r.angle, ang) >= 0.6));
      if (hit >= 0) { errors.push(`CHANNEL_REPEAT #${r.i + 1}: same angle wording as ${b.slug} ("${b.titles[hit]}") — "${r.title}"`); break; }
    }
  }

  // Grounding: the angles must come from this book's narration.
  const angles = Array.isArray(titleAngles) ? titleAngles : [];
  if (angles.length < MIN_ANGLES)
    errors.push(`NO_TITLE_ANGLES: youtube-meta.titleAngles needs ≥ ${MIN_ANGLES} entries {myth, book, quote} — the specific belief the book overturns, what it shows instead, and a verbatim narration quote proving it`);
  angles.forEach((g, i) => {
    const q = norm(g && g.quote);
    if (!g || !String(g.myth || "").trim() || !String(g.book || "").trim()) errors.push(`ANGLE_INCOMPLETE titleAngles[${i}]: myth + book are required`);
    if (!q || q.split(" ").length < 5) errors.push(`ANGLE_UNGROUNDED titleAngles[${i}]: quote must be ≥ 5 words copied from the narration`);
    else if (narr && !narr.includes(q)) errors.push(`ANGLE_QUOTE_NOT_IN_NARRATION titleAngles[${i}]: "${g.quote}" is not in this book's narration`);
  });
  if (!narr) warnings.push("NO_NARRATION_ON_DISK: anchors and quotes could not be checked against the narration (config / VTT missing)");
  if (angles.length >= 2) {
    const myths = angles.map((g) => words(g.myth).map(stem).filter((w) => !STOP.has(w)));
    for (let a = 0; a < myths.length; a++) for (let b = a + 1; b < myths.length; b++)
      if (jaccard(myths[a], myths[b]) >= 0.6) errors.push(`ANGLES_DUPLICATE: titleAngles[${a}] and [${b}] are the same misreading`);
  }

  return { status: errors.length ? "FAIL" : "PASS", errors, warnings, perTitle };
}

/** Lint a book's youtube-meta.json against its own narration and the rest of the channel. */
function lintBook(slug, root = ROOT) {
  const mp = path.join(root, rel.youtubeMeta(slug));
  if (!fs.existsSync(mp)) return { status: "FAIL", errors: [`NO_META: ${rel.youtubeMeta(slug)} missing`], warnings: [], perTitle: [] };
  const meta = readJson(mp);
  const man = tryJson(path.join(root, rel.manifest(slug)));
  const shortTitle = shortTitleOf((man && man.title) || meta.bookTitle || slug.replace(/-/g, " "));
  const author = (man && man.author) || meta.author || "";
  return lintTitleSet({
    titles: meta.titles, shortTitle, author, titleAngles: meta.titleAngles,
    narration: narrationOf(slug, root), corpus: channelCorpus(slug, root),
  });
}

/** The rules as text — pasted into LLM prompts and printed by make-book so every author sees the same contract. */
const TITLE_RULES = `TITLE SET CONTRACT (scripts/lib/title-lint.js — lint-titles.js must PASS before upload):
- 5 titles, each ≤ 100 chars, ALL in English. Every title carries the book title within the first ~60 chars.
- titles[0] = the search title: book title + a search modifier (Summary / Explained / Review / Analysis / Ending Explained).
- Author in ≥ 2 titles; a search modifier in ≥ 3 titles.
- ≥ 2 COUNTER-NARRATIVE titles ("the reading everyone gets wrong" packaging) — but each names THIS book's misread thing:
  a character, object, event or claim from the narration (fiction: the ending / the hero / the villain / the symbol people
  misread; non-fiction: the popular advice or belief the book overturns, named concretely). Two different misreadings.
- ≥ 1 STACKED title: book title + search modifier + an anchored counter-narrative angle.
- Never a channel template: "Why Smart People Get It So Wrong", "The Ending Everyone Gets Wrong", "What Everyone Misses",
  "What It Really Means", "Is Really About" … and no 3-word angle run reused from any other book's titles.
- youtube-meta.titleAngles = [{ "myth": what most readers/people believe, "book": what this book shows instead,
  "quote": ≥ 5 words copied verbatim from the narration that prove it }] × ≥ 2. Titles are written FROM these angles.`;

module.exports = { lintTitleSet, lintBook, channelCorpus, packEntry, narrationOf, shortTitleOf, angleWords, identityWords, TITLE_RULES, STOCK_PHRASES };
