/**
 * transcript-sameness.js — how alike this narration is to the channel's other narrations, the way a transcript
 * embedding sees it (2026-11-23, after the YPP "inauthentic content" rejection).
 *
 * Google's slop classifier (S-CTS) reads `Feature_video_text_embedding` — the transcript — "to detect repetitive,
 * templated narratives". The channel's 71 published films were recorded from one prompt spine (median 40 % shared
 * words, "which brings us to the" in 67 of 85). This module measures the nearest neighbour of a narration inside the
 * channel (no model, no network, about a minute on the whole channel):
 *   - runs: how often it says the channel's REPEATED RUNS (5-word runs said in ≥ 15 % of the films — "which brings us
 *     to the", "we have to look at", lib/channel-phrases.js), per 1000 words — THE BAR (policy reviewRunsPer1000);
 *   - answerWords: right / exactly / yeah / absolutely per 1000 words (the hosts answering themselves) — reported;
 *   - style: cosine of function-word skeleton 5-grams (the telling with the book masked) — reported, no bar: measured,
 *     it does not separate a formed recording from the template (see DEFAULT_POLICY);
 *   - topic: cosine of TF-IDF words — shared subject matter (two business books), reported.
 * Corpus: every book's narration on disk (config captions, Vox and Antidote alike — the same text the title lint
 * reads), every VTT in public/captions (raw or clean, one per slug) and audit/ypp-recovery/recordings, plus --extra
 * folders. The record of one book: books/<slug>/transcript-sameness.json (nearest neighbour, verdict, VTT hash);
 * preview-state.js reads it and stops with TRANSCRIPT_SAMENESS when the verdict is REVIEW and the operator has not
 * accepted it. Bar: data/quality-policy.json → transcriptSameness (operator). Tests: scripts/test-transcript-sameness.js.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const CP = require("./channel-phrases");
// MEASURED 2026-11-23 on the channel (56 narrations, .scratch calibration): no cheap cosine proxy separates the formed
// Dracula recordings from the templated films — function-word skeleton 5-grams put them at 0.65 against an old-film
// median of 0.58 (the two NotebookLM hosts talk the same way in every recording); content trigrams put everything at
// 3–7 %. What DOES separate is the channel's own repeated runs (lib/channel-phrases.js, 5-word runs said in ≥ 15 % of
// the films): old films median 1.20 per 1000 words (min 0.10), the formed Dracula recordings 0.4 and 0.0. So the bar is
// the run rate; the cosines are reported next to it, never a bar.
const DEFAULT_POLICY = { reviewRunsPer1000: 0.6, minWords: 1500 };
const ANSWER_WORDS = ["right", "exactly", "yeah", "absolutely"];
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return null; } };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function policyOf(root = ROOT) {
  const q = readJson(path.join(root, "data", "quality-policy.json")) || {};
  return { ...DEFAULT_POLICY, ...(q.transcriptSameness || {}) };
}

// ── text ────────────────────────────────────────────────────────────────────
const clean = (t) => String(t || "").toLowerCase().replace(/[’`]/g, "'").replace(/<[^>]+>/g, " ").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (t) => clean(t).split(" ").filter(Boolean);

/** VTT → narration text (cue text, word-timing tags and the rolling duplicates of auto-captions removed). */
function vttText(raw) {
  const blocks = String(raw || "").replace(/^﻿/, "").split(/\r?\n\r?\n/);
  const out = [];
  for (const block of blocks) {
    const m = block.match(/\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->[^\n]*\n([\s\S]*)/);
    if (!m) continue;
    const lines = m[1].split(/\r?\n/).map((l) => l.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
    const last = lines[lines.length - 1];
    if (last && out[out.length - 1] !== last) out.push(last);
  }
  return out.join(" ");
}

/** The narration of one book from its config (captions), else its VTT. "" when none. */
function narrationOfBook(root, slug) {
  for (const f of [`config.antidote.json`, `config.vox.json`]) {
    const c = readJson(path.join(root, "books", slug, f));
    if (!c) continue;
    const caps = (c.captions || []).map((x) => x && x.text).filter(Boolean).join(" ");
    if (caps) return { text: caps, source: `books/${slug}/${f}` };
    const sc = (c.scenes || []).map((s) => s && s._narration).filter(Boolean).join(" ");
    if (sc) return { text: sc, source: `books/${slug}/${f}` };
  }
  for (const f of [`${slug}.clean.vtt`, `${slug}.vtt`]) {
    const p = path.join(root, "public", "captions", f);
    if (fs.existsSync(p)) return { text: vttText(fs.readFileSync(p, "utf8")), source: `public/captions/${f}` };
  }
  return null;
}

/**
 * The channel corpus: [{ id, text, words, source }] — one document per book (config first, else VTT), one per extra
 * VTT (audit/ypp-recovery/recordings, --extra folders; a VTT whose stem is a book slug already in the corpus is skipped).
 */
function corpus({ root = ROOT, extra = [], minWords = DEFAULT_POLICY.minWords } = {}) {
  const docs = [], seen = new Set();
  const booksDir = path.join(root, "books");
  const slugs = fs.existsSync(booksDir) ? fs.readdirSync(booksDir).filter((s) => fs.existsSync(path.join(booksDir, s, "book.json")) || fs.existsSync(path.join(booksDir, s, "config.antidote.json")) || fs.existsSync(path.join(booksDir, s, "config.vox.json"))) : [];
  for (const s of slugs) {
    const n = narrationOfBook(root, s);
    if (!n) continue;
    const w = tokens(n.text).length;
    if (w < minWords) continue;
    docs.push({ id: s, text: n.text, words: w, source: n.source }); seen.add(s);
  }
  const vttDirs = [path.join(root, "public", "captions"), path.join(root, "audit", "ypp-recovery", "recordings"), ...extra.map((d) => path.resolve(root, d))];
  for (const dir of vttDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".vtt")).sort()) {
      const stem = f.replace(/\.clean\.vtt$|\.vtt$/, "");
      if (seen.has(stem) || /^\d+$/.test(stem) || stem === "captions") continue; // the operator's raw drops, not films
      const text = vttText(fs.readFileSync(path.join(dir, f), "utf8"));
      const w = tokens(text).length;
      if (w < minWords) continue;
      docs.push({ id: stem, text, words: w, source: path.relative(root, path.join(dir, f)).replace(/\\/g, "/") }); seen.add(stem);
    }
  }
  return docs;
}

// ── vectors ─────────────────────────────────────────────────────────────────
function grams(words, n) {
  if (n === 1) return words;
  const out = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
  return out;
}
// The TELLING, not the book: every content word becomes "_" and only the function words, the discourse markers and
// the hosts' answer-words stay ("which brings us to the _", "right so _ _ is", "i have to push back"). Two films about
// different books share these skeleton trigrams only through the way they are told — the template a transcript
// embedding reads across a channel. (A first try with IDF-weighted content trigrams put every film at 1–2 %: the book's
// own names drowned the telling.)
const FUNCTION_WORDS = new Set(("a an the and or but nor so yet for of in on at to from by with as is are was were be been being am " +
  "it its it's this that these those there here then than when where while which who whom whose what why how if because although though " +
  "you your yours we our ours us they their theirs them he his him she her hers i my mine me one ones " +
  "do does did done doing have has had having can could will would shall should may might must need " +
  "not no yes yeah yep nope okay ok oh ah um uh hmm well right exactly absolutely precisely totally literally basically actually really just " +
  "very quite pretty rather almost even still also too either neither both all any some each every most more much many few less least " +
  "like kind sort thing things way ways about into onto over under up down out off again back again through across between among " +
  "before after during until since now ago later soon already never always often sometimes once twice " +
  "say says said saying think thinks thought know knows knew mean means meant get gets got go goes went come comes came let let's " +
  "look looks looked see sees saw talk talks talked push unpack dive deep brings bring bringing point case question idea " +
  "something anything nothing everything someone anyone no-one nobody everyone else other another such same different " +
  "first second third next last new old big little great good bad true false real whole part " +
  "and/or vs is-not isn't aren't wasn't weren't don't doesn't didn't can't couldn't won't wouldn't shouldn't that's it's there's here's what's who's let's i'm i've i'd i'll you're you've you'd you'll we're we've we'd we'll they're they've they'd they'll he's she's").split(/\s+/));
function skeleton(words) { return words.map((w) => (FUNCTION_WORDS.has(w) ? w : "_")); }

/** L2-normalised sparse vectors for every doc: `tfidf` on word n-grams (topic) or `skeleton` trigram counts (style). */
function vectors(docs, n, mode = "tfidf") {
  const tfs = docs.map((d) => { const m = new Map(); const ws = tokens(d.text); for (const g of grams(mode === "skeleton" ? skeleton(ws) : ws, n)) if (!/^_( _)*$/.test(g)) m.set(g, (m.get(g) || 0) + 1); return m; });
  const df = new Map();
  for (const tf of tfs) for (const g of tf.keys()) df.set(g, (df.get(g) || 0) + 1);
  const N = docs.length;
  return tfs.map((tf) => {
    const v = new Map(); let norm = 0;
    for (const [g, c] of tf) { const w = mode === "tfidf" ? (1 + Math.log(c)) * (Math.log((N + 1) / ((df.get(g) || 0) + 1)) + 1) : c; v.set(g, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1;
    for (const [g, w] of v) v.set(g, w / norm);
    return v;
  });
}
function cosine(a, b) {
  const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [g, w] of s) { const x = l.get(g); if (x) dot += w * x; }
  return dot;
}

/** The channel's repeated runs (5-word runs in ≥ share of the films) and how often this text says them. */
function runsCensus(docs, opts = {}) { return CP.census(docs.map((d) => d.text), opts); }
function runRate(text, census) { const r = CP.rate(text, census); return r ? { per1000: r.per1000, said: r.said.slice(0, 8) } : { per1000: 0, said: [] }; }
function answerWordsPer1000(text) { const w = tokens(text); return w.length ? Math.round((w.filter((x) => ANSWER_WORDS.includes(x)).length / w.length) * 10000) / 10 : 0; }

/**
 * Every doc: its rate of channel runs (the bar), its answer words, and its nearest neighbour on style (function-word
 * skeleton 5-grams) and topic (words, TF-IDF) — both reported only.
 * @returns {{ docs:[{id, words, source, runs:{per1000, said}, answerWords, style:{nn, sim}, topic:{nn, sim}}], median:{runs, answerWords, style, topic}, census:{runs:number}, pairs:number }}
 */
function measure(docs, { census: censusOpts } = {}) {
  const census = runsCensus(docs, censusOpts);
  const S = vectors(docs, 5, "skeleton"), T = vectors(docs, 1, "tfidf");
  const out = docs.map((d) => ({ id: d.id, words: d.words, source: d.source, runs: runRate(d.text, census), answerWords: answerWordsPer1000(d.text), style: { nn: null, sim: 0 }, topic: { nn: null, sim: 0 } }));
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const s = cosine(S[i], S[j]), t = cosine(T[i], T[j]);
    if (s > out[i].style.sim) out[i].style = { nn: docs[j].id, sim: s };
    if (s > out[j].style.sim) out[j].style = { nn: docs[i].id, sim: s };
    if (t > out[i].topic.sim) out[i].topic = { nn: docs[j].id, sim: t };
    if (t > out[j].topic.sim) out[j].topic = { nn: docs[i].id, sim: t };
  }
  const med = (xs) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  for (const o of out) { o.style.sim = r3(o.style.sim); o.topic.sim = r3(o.topic.sim); }
  return {
    docs: out,
    median: { runs: r3(med(out.map((o) => o.runs.per1000))), answerWords: r3(med(out.map((o) => o.answerWords))), style: r3(med(out.map((o) => o.style.sim))), topic: r3(med(out.map((o) => o.topic.sim))) },
    census: { runs: census.runs.length, films: census.films }, pairs: (docs.length * (docs.length - 1)) / 2,
  };
}

/** One narration against the corpus (itself excluded by id): the census is the OTHER films' (its own runs never count). */
function measureOne({ id, text }, docs, { census: censusOpts } = {}) {
  const others = docs.filter((d) => d.id !== id);
  const census = runsCensus(others, censusOpts);
  const all = [{ id, text, words: tokens(text).length, source: "(this)" }, ...others];
  const m = measure(all, { census: censusOpts });
  const me = { ...m.docs[0], runs: runRate(text, census) };
  const channel = measure(others, { census: censusOpts });
  return { me, channelMedian: channel.median, corpus: others.length, census: { runs: census.runs.length, films: census.films } };
}

/** REVIEW when the narration says the channel's repeated runs at or over the bar (per 1000 words). */
function verdictOf(runsPer1000, policy) { return runsPer1000 >= policy.reviewRunsPer1000 ? "REVIEW" : "OK"; }

const recordPath = (root, slug) => path.join(root, "books", slug, "transcript-sameness.json");
/** Write the book's record (read by preview-state.js). */
function writeRecord(root, slug, rec) { fs.mkdirSync(path.dirname(recordPath(root, slug)), { recursive: true }); fs.writeFileSync(recordPath(root, slug), JSON.stringify(rec, null, 2) + "\n"); return rec; }
function readRecord(root, slug) { return readJson(recordPath(root, slug)); }
/** The hash the record is bound to: the VTT on disk (the recording), else the config narration. */
function inputHash(root, slug) {
  for (const f of [`${slug}.vtt`, `${slug}.clean.vtt`]) { const p = path.join(root, "public", "captions", f); if (fs.existsSync(p)) return { sha256: sha(fs.readFileSync(p)), source: `public/captions/${f}` }; }
  const n = narrationOfBook(root, slug);
  return n ? { sha256: sha(n.text), source: n.source } : null;
}

module.exports = { policyOf, DEFAULT_POLICY, ANSWER_WORDS, clean, tokens, skeleton, FUNCTION_WORDS, vttText, narrationOfBook, corpus, vectors, cosine, runsCensus, runRate, answerWordsPer1000, measure, measureOne, verdictOf, recordPath, writeRecord, readRecord, inputHash };
