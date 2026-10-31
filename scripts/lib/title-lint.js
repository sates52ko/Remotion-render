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

// Scaffold residue (2026-10-28, The Book of Margery Kempe shipped "… Explained — TODO counter-narrative angle 1
// (lint-titles.js)" in youtube.md): placeholder words, unfilled template slots, lint instructions. A HARD fail anywhere
// in the pack — titles, angles, description, chapters, tags, hook.
const PLACEHOLDER_RE = /\b(TODO|TBD|FIXME|XXX|PLACEHOLDER|lorem ipsum)\b|lint-titles\.js|\bcounter-narrative angle \d\b|<(book|title|author|character|slug|hook)[^>]*>|\{\{[^}]*\}\}|\$\{[^}]*\}|\[(insert|your|title|book|author)[^\]]*\]/i;
function placeholderIn(s) { const m = typeof s === "string" && s.match(PLACEHOLDER_RE); return m ? m[0] : null; }

// Sensational wording the narration rarely supports — a WARNING (the author checks the claim against the book).
const SENSATIONAL_RE = /\b(shocking|insane|destroyed|destroys|exposed|banned|you won't believe|mind[- ]blowing|jaw[- ]dropping|nobody is talking|they don't want you|gone wrong|100% true)\b|!!/i;

// Sentences only the deterministic fallback writes (plan-meta.js / plan-antidote-meta.js) — a pack still carrying one
// was never refined, whatever its needsClaudeRefine flag says.
const SCAFFOLD_SENTINELS = [
  "No fluff, no ending spoilers", "we break down every key idea in plain language",
  "one reframing you can actually use", "the one argument the book quietly proves",
  "and the reading most people miss, and we take on the book's hardest criticism head-on",
  "and it's not the story you remember", "and it's not what you'd expect",
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

  // Source-grounded INSIGHT angles (2026-10-28): when the book has no honest misreading to overturn, a surprising idea
  // from the narration counts too — a forced "everyone gets X wrong" is a fake counter-narrative. Its words come from
  // the angle's own `book`/`claim` text, so the title must name that idea, not just carry a modifier.
  const insightWords = new Set((Array.isArray(titleAngles) ? titleAngles : []).filter((g) => g && g.kind === "insight")
    .flatMap((g) => angleWords(`${g.claim || ""} ${g.book || ""}`, idWords)).filter((w) => w.length >= 3 && !GENERIC_STEMS.has(w)));

  const perTitle = titles.map((t, i) => {
    const len = [...t].length; // code points: what YouTube counts (an em dash or curly quote is ONE character)
    const r = { i, title: t, len };
    r.bookAt = bookTitleIndex(t, shortTitle);
    r.author = authorMentioned(t, author);
    r.modifier = MODIFIER_RE.test(t);
    r.counter = COUNTER_RE.test(t);
    r.angle = angleWords(t, idWords);
    r.anchors = r.angle.filter((w) => w.length >= 3 && !GENERIC_STEMS.has(w) && !COUNTER_RE.test(w) && narrWords.has(w) && df(w) <= dfLimit);
    r.stock = STOCK_PHRASES.filter((p) => norm(t).includes(norm(p)));
    r.insight = !r.counter && r.anchors.some((w) => insightWords.has(w));
    r.angled = r.anchors.length > 0 && (r.counter || r.insight);
    const ph = placeholderIn(t);
    if (ph) errors.push(`PLACEHOLDER #${i + 1}: scaffold/template text "${ph}" in a title — write the real title — "${t}"`);
    if (SENSATIONAL_RE.test(t)) warnings.push(`SENSATIONAL #${i + 1}: clickbait wording ("${t.match(SENSATIONAL_RE)[0]}") — the claim must be what the narration shows — "${t}"`);
    if (len > MAX_LEN) errors.push(`TOO_LONG #${i + 1}: ${len} > ${MAX_LEN} chars — "${t}"`);
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
  if (angled.length < 2) errors.push(`TOO_FEW_ANGLES: ${angled.length} anchored angle title(s), need ≥ 2 (each names THIS book's misread thing — a character, object, event or claim from the narration — or a surprising idea grounded in a titleAngles {kind:"insight"} entry)`);
  // Five titles = five angles, not one title with its modifier swapped (Summary / Review / Explained / Analysis …).
  const bare = perTitle.filter((r) => !r.angle.length);
  if (bare.length > 2)
    errors.push(`MODIFIER_SWAP: ${bare.length} titles are only book + author + a search modifier (#${bare.map((r) => r.i + 1).join(", #")}) — at most 2; the others need their own angle`);
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
    if (!g || !String(g.book || "").trim() || (g.kind !== "insight" && !String(g.myth || "").trim()))
      errors.push(`ANGLE_INCOMPLETE titleAngles[${i}]: ${g && g.kind === "insight" ? "book (the idea) is required" : "myth + book are required (no honest misreading? use {kind:\"insight\", book, quote})"}`);
    for (const k of ["myth", "book", "claim", "quote"]) { const ph = g && placeholderIn(g[k]); if (ph) errors.push(`PLACEHOLDER titleAngles[${i}].${k}: "${ph}"`); }
    if (!q || q.split(" ").length < 5) errors.push(`ANGLE_UNGROUNDED titleAngles[${i}]: quote must be ≥ 5 words copied from the narration`);
    else if (narr && !narr.includes(q)) errors.push(`ANGLE_QUOTE_NOT_IN_NARRATION titleAngles[${i}]: "${g.quote}" is not in this book's narration`);
  });
  if (!narr) warnings.push("NO_NARRATION_ON_DISK: anchors and quotes could not be checked against the narration (config / VTT missing)");
  if (angles.length >= 2) {
    const myths = angles.map((g) => words((g && (g.myth || g.book)) || "").map(stem).filter((w) => !STOP.has(w)));
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

const DANGLING = new Set(("a an the and or but nor of in on at to for from by with as into onto than that which who whose " +
  "this these those my your our their his its he she they we i is are was were be been has have had do does did will would " +
  "can could should if when while because so then").split(" "));
const FALLBACK_SELF_HELP = /^(self improvement|personal development|nonfiction summary|#selfimprovement)$/i;
const SELF_HELP_GENRE = /self|help|business|productiv|psycholog|nonfiction|non-fiction|leadership|finance|habit|health|science|educat/i;
const fmtT = (t) => { t = Math.round(t); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = String(t % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`; };

/**
 * YouTube READY — the whole publishing pack, Vox and Antidote alike (2026-10-28). The Book of Margery Kempe shipped a
 * youtube.md with "TODO counter-narrative angle" titles, the fallback description ("No fluff, no ending spoilers"),
 * ASR-snippet chapter labels and self-improvement tags on a medieval classic, while only youtube-meta.json's titles had
 * been refined; The Thinking Fast and Slow upload got the raw rolling VTT. A pack is READY only when every part that is
 * pasted into YouTube is real, consistent and checked. Metadata never blocks a render — only the upload.
 * @returns {{status:"READY"|"NOT_READY", errors:string[], warnings:string[], titles:object}}
 */
function lintPack(slug, root = ROOT) {
  const errors = [], warnings = [];
  const P = (r) => path.join(root, r);
  const meta = tryJson(P(rel.youtubeMeta(slug)));
  if (!meta) return { status: "NOT_READY", errors: [`NO_META: ${rel.youtubeMeta(slug)} missing or unreadable`], warnings, titles: null };
  const man = tryJson(P(rel.manifest(slug))) || {};
  const shortTitle = shortTitleOf(man.title || meta.bookTitle || meta.title || slug.replace(/-/g, " "));
  const author = man.author || meta.author || "";
  const genre = String(man.genre || meta.genre || "");

  // 1. titles — the existing contract (+ placeholders, code-point lengths, modifier swaps, insight angles)
  const titles = lintTitleSet({ titles: meta.titles, shortTitle, author, titleAngles: meta.titleAngles, narration: narrationOf(slug, root), corpus: channelCorpus(slug, root) });
  for (const e of titles.errors) errors.push(`TITLES ${e}`);
  for (const w of titles.warnings) warnings.push(`TITLES ${w}`);

  // 2. refined, not the scaffold
  if (meta.needsClaudeRefine !== false) errors.push(`NOT_REFINED: youtube-meta.needsClaudeRefine is ${JSON.stringify(meta.needsClaudeRefine)} — the deterministic scaffold must be hand-refined from the narration (titles, description, chapters, tags, hook), then set to false`);
  const fields = { description: meta.description, pinnedComment: meta.pinnedComment, "thumbnail.hook": meta.thumbnail && meta.thumbnail.hook, primaryKeyword: meta.primaryKeyword };
  (meta.tags || []).forEach((t, i) => { fields[`tags[${i}]`] = t; });
  (meta.hashtags || []).forEach((t, i) => { fields[`hashtags[${i}]`] = t; });
  (meta.chapters || []).forEach((c, i) => { fields[`chapters[${i}]`] = c && c.label; });
  for (const [k, v] of Object.entries(fields)) { const ph = placeholderIn(v); if (ph) errors.push(`PLACEHOLDER ${k}: "${ph}"`); }
  const desc = String(meta.description || "");
  const scaffold = SCAFFOLD_SENTINELS.filter((s) => norm(desc).includes(norm(s)));
  if (scaffold.length) errors.push(`SCAFFOLD_DESCRIPTION: the fallback description is still there ("${scaffold[0]}") — write it from the narration`);

  // 3. description
  if (!desc.trim()) errors.push("NO_DESCRIPTION");
  else {
    if ([...desc].length > 5000) errors.push(`DESCRIPTION_TOO_LONG: ${[...desc].length} > 5000 chars`);
    if (containsPhrase(desc, shortTitle) < 0) errors.push(`DESCRIPTION_NO_BOOK_TITLE: "${shortTitle}" is not in the description`);
    else if (containsPhrase(desc.slice(0, 157), shortTitle) < 0) warnings.push(`DESCRIPTION_ABOVE_FOLD: "${shortTitle}" is not in the first ~157 chars (shown above the fold)`);
    if (author && !authorMentioned(desc, author)) warnings.push(`DESCRIPTION_NO_AUTHOR: "${author}" is not in the description`);
    const anchors = new Set(titles.perTitle.filter((r) => r.angled).flatMap((r) => r.anchors));
    const descWords = new Set(words(desc).map(stem));
    if (anchors.size && ![...anchors].some((w) => descWords.has(w))) warnings.push(`TITLE_DESCRIPTION_MISMATCH: the description never names what the angle titles promise (${[...anchors].slice(0, 5).join(", ")})`);
  }

  // 4. chapters (YouTube: first at 0:00, ≥ 3, each ≥ 10 s, and they must be IN the description to become chapters)
  const ch = Array.isArray(meta.chapters) ? meta.chapters.filter((c) => c && typeof c.t === "number") : [];
  if (ch.length) {
    if (ch.length < 3) errors.push(`CHAPTERS_TOO_FEW: ${ch.length} (YouTube needs ≥ 3)`);
    if (ch[0].t !== 0) errors.push(`CHAPTERS_NOT_AT_ZERO: the first chapter starts at ${fmtT(ch[0].t)}, YouTube needs 0:00`);
    ch.forEach((c, i) => { if (i && c.t - ch[i - 1].t < 10) errors.push(`CHAPTERS_ORDER: chapter ${i + 1} (${fmtT(c.t)}) is < 10 s after the previous one`); });
    // a name can end on "you" / "me" / "them" ("She Reads You"); never on an article, preposition, conjunction or subject
    const fragments = ch.filter((c) => { const w = words(c.label); return w.length && !/[?!]\s*$/.test(c.label) && DANGLING.has(w[w.length - 1]); });
    if (fragments.length >= 2) errors.push(`CHAPTER_LABELS_ARE_FRAGMENTS: ${fragments.length} label(s) end mid-phrase — cut-off narration snippets, not chapter names (${fragments.slice(0, 3).map((c) => `"${c.label}"`).join(", ")})`);
    const missing = ch.filter((c) => !desc.includes(`${fmtT(c.t)} ${c.label}`));
    if (missing.length) errors.push(`CHAPTERS_NOT_IN_DESCRIPTION: ${missing.length} chapter(s) missing from the description's timestamp list (e.g. "${fmtT(missing[0].t)} ${missing[0].label}") — YouTube reads chapters only from the description`);
  } else warnings.push("NO_CHAPTERS: youtube-meta.chapters is empty");

  // 5. tags / hashtags
  const tags = (meta.tags || []).filter((t) => typeof t === "string");
  const plainChars = tags.reduce((n, t) => n + [...t].length, 0) + Math.max(0, tags.length - 1);
  const tagChars = plainChars + 2 * tags.filter((t) => /\s/.test(t)).length;
  if (!tags.length) errors.push("NO_TAGS");
  if (plainChars > 500) errors.push(`TAGS_TOO_LONG: ${plainChars} > 500 chars`);
  else if (tagChars > 500) warnings.push(`TAGS_NEAR_LIMIT: ${tagChars} chars if YouTube counts the quotes around multi-word tags (> 500 is refused)`);
  if (tags.length && !tags.some((t) => containsPhrase(t, shortTitle) >= 0)) errors.push(`TAGS_NO_BOOK_TITLE: no tag carries "${shortTitle}"`);
  const offGenre = [...tags, ...(meta.hashtags || [])].filter((t) => FALLBACK_SELF_HELP.test(String(t).trim()));
  if (offGenre.length && !SELF_HELP_GENRE.test(genre)) errors.push(`TAGS_WRONG_GENRE: fallback self-help tags on a "${genre}" book (${offGenre.join(", ")})`);

  // 6. thumbnail hook: present, not the title again, visible in the rendered image
  const hook = String((meta.thumbnail && meta.thumbnail.hook) || "").trim();
  if (!hook) errors.push("NO_HOOK: youtube-meta.thumbnail.hook is empty");
  else {
    if (words(hook).length > 7) warnings.push(`HOOK_LONG: ${words(hook).length} words — a thumbnail hook reads in ≤ 5–7`);
    const idw = identityWords(shortTitle, author);
    const own = words(hook).filter((w) => !STOP.has(w)).map(stem).filter((w) => !idw.has(w));
    if (!own.length) warnings.push(`HOOK_REPEATS_TITLE: the hook only repeats the book title/author ("${hook}") — it should add what the title doesn't`);
  }
  const check = tryJson(P(`books/${slug}/thumbnail-check.json`));
  if (!check) warnings.push(`HOOK_UNVERIFIED: no books/${slug}/thumbnail-check.json — run render-thumbnails.js (it checks the hook pixels in every variant)`);
  else {
    if (hook && check.hook && check.hook !== hook) errors.push(`HOOK_STALE_THUMBNAIL: the thumbnails were rendered with hook "${check.hook}", the meta now says "${hook}" — re-run render-thumbnails.js`);
    for (const v of check.variants || []) if (v.hookVisible === false) errors.push(`HOOK_NOT_VISIBLE: ${v.file} — the hook text is not in the image (${v.detail || "no pixel difference with/without the hook"})`);
  }

  // 7. youtube.md = what the operator pastes; it must be the refined pack, not an older scaffold
  const mdPath = P(rel.youtubeMd(slug));
  if (!fs.existsSync(mdPath)) errors.push(`NO_YOUTUBE_MD: ${rel.youtubeMd(slug)} missing`);
  else {
    const md = fs.readFileSync(mdPath, "utf8");
    const ph = placeholderIn(md);
    if (ph) errors.push(`STALE_MD: youtube.md still carries scaffold text ("${ph}") — regenerate it from the refined meta (plan-meta.js / plan-antidote-meta.js --md-only)`);
    const notIn = (meta.titles || []).filter((t) => typeof t === "string" && !md.includes(t));
    if (notIn.length) errors.push(`STALE_MD: ${notIn.length} refined title(s) are not in youtube.md (e.g. "${notIn[0]}") — regenerate it (--md-only)`);
    if (desc && !md.includes(desc.trim().slice(0, 120))) errors.push("STALE_MD: youtube.md does not carry the refined description — regenerate it (--md-only)");
    if (/SCAFFOLD \(deterministic\)/.test(md)) errors.push("STALE_MD: youtube.md is marked SCAFFOLD");
  }

  // 8. captions: the upload file
  const vttPath = P(rel.cleanVtt(slug));
  if (!fs.existsSync(vttPath)) errors.push(`NO_CLEAN_VTT: ${rel.cleanVtt(slug)} missing (node scripts/clean-vtt.js public/captions/${slug}.vtt ${rel.cleanVtt(slug)})`);
  else { const v = require("./vtt-validate").validateUploadVttFile(vttPath); for (const e of v.errors) errors.push(`CAPTIONS ${e}`); }

  return { status: errors.length ? "NOT_READY" : "READY", errors, warnings, titles };
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
  "quote": ≥ 5 words copied verbatim from the narration that prove it }] × ≥ 2. Titles are written FROM these angles.
- No honest misreading in this book? Never invent one: use { "kind": "insight", "book": the surprising idea the
  narration states, "quote": ≥ 5 verbatim words } — the title names that idea (its words), no "wrong / myth" wording.
- Five titles = five angles: at most 2 titles may be only book + author + a modifier (no Summary/Review/Explained swaps).
- No placeholder ever (TODO, TBD, [Insert …], {{…}}, "counter-narrative angle 1"); no unsupported sensational claims.`;

module.exports = { lintTitleSet, lintBook, lintPack, placeholderIn, PLACEHOLDER_RE, SCAFFOLD_SENTINELS, channelCorpus, packEntry, narrationOf, shortTitleOf, angleWords, identityWords, TITLE_RULES, STOCK_PHRASES };
