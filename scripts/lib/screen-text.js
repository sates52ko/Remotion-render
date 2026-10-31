"use strict";

/**
 * screen-text.js — the ONE owner of "is this on-screen string meaningful?"
 *
 * The narrative/world firewall answers "does this visual belong to this book?".
 * This module answers a different question: "does every string printed on the
 * frame say something the audio actually says, in words a viewer can read?"
 *
 * Why it exists (2026-09-23, show-your-work): 29/29 flow diagrams carried
 * labels sliced out of narration ("PRODUCT OKAY LETS UNPACK", "GO 10 MINUTES
 * YES") and 148 kinetic texts had only 42 distinct values, 53× "WHAT ACTUALLY
 * CHANGES". Every writer had its own stopword list and none checked meaning.
 *
 * Contract:
 *   - Producers call `isLabel(str)` / `checkString(str, ctx)` BEFORE writing a
 *     string; when it fails they write NOTHING (no diagram, no text). A silent
 *     frame beats a meaningless word.
 *   - `validateConfig(config)` is the hard gate run by make-book and render.js
 *     at the last point before render (after every post-plan rewrite).
 *   - Captions are NOT screen text here: they are the transcript itself.
 *   - HUD chrome (badge, act topic) is excluded: it is navigation, not a claim.
 *
 * Honest limit: deterministic checks reject garbage; they cannot prove that a
 * cause→effect pair is TRUE. That comes from authored claims (art file /
 * briefs). Authored strings (`src: "art"` / `diagram.authored`) skip only the
 * grounding check — a metaphor may legitimately use words the narrator didn't.
 */

// ── Lexicons (single source — replaces the per-script stopword lists for
// screen-text decisions) ──────────────────────────────────────────────────────

// Spoken discourse markers: never meaningful as on-screen copy.
const FILLER = new Set(
  ("okay ok lets let's unpack frankly actually yeah yes yep hey um uh uhh hmm " +
   "basically literally honestly gonna wanna gotta kinda sorta oh wow anyway " +
   "stuff whatever alright definitely exactly precisely absolutely totally")
    .split(/\s+/)
);

const ARTICLES = new Set("a an the".split(" "));
const PREPOSITIONS = new Set(
  ("of to in on at for with from by into onto about over under through than as " +
   "like between after before during without within upon off up down out around")
    .split(" ")
);
const CONJUNCTIONS = new Set("and or but so because if when while though although whether nor yet".split(" "));
const AUX = new Set(
  ("is are was were be been being am do does did done have has had will would " +
   "shall should can could may might must get gets got going")
    .split(" ")
);
const PRONOUNS = new Set(
  ("i you he she it we they me him her us them my your his its our their this " +
   "that these those who whom which what there here").split(" ")
);
// Contractions arrive with the apostrophe stripped by ASR/normalisers.
const NEGATIONS = new Set(
  ("not no never dont doesnt didnt cant cannot wont isnt arent wasnt werent " +
   "shouldnt wouldnt couldnt havent hasnt hadnt aint").split(" ")
);
const CONTRACTION_FRAGMENTS = new Set("im youre theyre weve youve ive ill youll hes shes thats whats theres heres lets theyll itll youd theyd thatll whos".split(" "));

// A label may not END on any of these (the phrase is visibly cut off).
// Object pronouns ("BUILT TO CATCH YOU"), demonstratives ("ALL THAT") and
// adverbial particles ("THE WAR WITHIN") are legitimate endings; possessive
// determiners, subject pronouns, strict prepositions, aux and negations are not.
const STRICT_PREPOSITIONS = new Set("of to at for with from by into onto than as like between upon".split(" "));
const BAD_TAIL = new Set([
  ...ARTICLES, ...STRICT_PREPOSITIONS, ...CONJUNCTIONS, ...AUX, ...NEGATIONS, ...CONTRACTION_FRAGMENTS,
  ..."i he she we they my your his its our their who whom which what only".split(" "),
]);
// ...nor START on a clause-joining conjunction (it begins mid-sentence).
// Headline negation ("NOT A GENIUS", "DON'T WAIT") is legitimate copy.
// Clause-internal prepositions ("BY THE FEAR", "OF THE WORK") also betray a cut.
const BAD_HEAD = new Set("and or but so because though although nor whether of by than as into onto upon".split(" "));

const FUNCTION_WORDS = new Set([...ARTICLES, ...PREPOSITIONS, ...CONJUNCTIONS, ...AUX, ...PRONOUNS, ...NEGATIONS, ...CONTRACTION_FRAGMENTS, ...FILLER]);

// Code-owned template literals. Every engine that used to stamp one of these
// when it had nothing to say now writes nothing instead; the gate makes the
// regression impossible. Superset of FORBIDDEN_GENERIC_TEXTS
// (src/semantic/visualContract.ts), mirrored here because CJS can't import TS.
const TEMPLATE_TEXTS = new Set([
  // floors / fallbacks removed 2026-09-23
  "TRIGGER", "CONSEQUENCE", "TRIGGER → CONSEQUENCE", "CAUSE", "EFFECT",
  "DENIAL", "REALIZATION", "INNER TENSION", "LEFT_POLE", "RIGHT_POLE", "SOURCE_DOMAIN", "TARGET_DOMAIN",
  "WHAT ACTUALLY CHANGES", "NOT WHAT IT SEEMS", "THE COMMON PATH", "UNDER THE SURFACE",
  "A NEW MENTAL MODEL", "HABIT LOOP", "REWARD", "DEFAULT TRAP", "REAL LEVERAGE",
  "STEP 01", "STEP 02", "RESULT", "LESS", "MORE", "ONE", "TWO", "THREE",
  "CHAPTER", "PART A", "PART B", "ROOT PRINCIPLE",
  // FORBIDDEN_GENERIC_TEXTS
  "CRITICAL DISTINCTION", "SYSTEM 1 VS SYSTEM 2", "THE 99% DEFAULT", "DOPAMINE LOOP",
  "1% COMPOUND", "CAREER LEVERAGE", "TASK FRICTION", "THE PASSENGER SEAT", "NO REAL",
  "BY THE REAL", "THE FIVE-ALARM TRAP", "THE HIDDEN MECHANISM", "THE ESSENTIAL 1%",
  "100+ DISTRACTIONS & NOISE",
]);

const LIMITS = {
  label: { maxWords: 5, maxChars: 40 },
  title: { maxWords: 7, maxChars: 44 },
  text: { maxWords: 7, maxChars: 48 },
  chapter: { maxWords: 10, maxChars: 60 },
};
const REPEAT_LIMIT = 3; // same string on more than N scenes = a template in disguise

// ── Tokenising ───────────────────────────────────────────────────────────────

function norm(str) {
  return String(str == null ? "" : str).replace(/\s+/g, " ").trim().toUpperCase();
}

function tokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9%\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

function contentTokens(str) {
  return tokens(str).filter((t) => !FUNCTION_WORDS.has(t) && (t.length > 2 || /\d/.test(t)));
}

function stem(t) {
  return t.length > 5 ? t.slice(0, 5) : t.replace(/(ing|ed|es|s)$/, "") || t;
}

// ── Single-string checks ─────────────────────────────────────────────────────

/**
 * @param {string} str
 * @param {{kind?: "label"|"title"|"text"|"chapter", narration?: string, authored?: boolean}} ctx
 * @returns {{code: string, message: string}[]}  empty = OK
 */
function checkString(str, ctx = {}) {
  const kind = ctx.kind || "label";
  const out = [];
  const text = norm(str);
  if (!text) return [{ code: "EMPTY", message: "empty string" }];
  const toks = tokens(text);
  const content = contentTokens(text);
  const lim = LIMITS[kind] || LIMITS.label;

  if (TEMPLATE_TEXTS.has(text)) out.push({ code: "CONSTANT_TEMPLATE", message: `'${text}' is a code template, not copy about this beat` });
  const filler = toks.filter((t) => FILLER.has(t));
  if (filler.length) out.push({ code: "FILLER_TOKEN", message: `spoken filler on screen: ${filler.join(", ")}` });
  // Titles legitimately use "A → B"; judge each side for fragments.
  const parts = kind === "title" || kind === "chapter" ? text.split(/\s*(?:→|->|\bVS\b\.?|\/|:)\s*/).filter(Boolean) : [text];
  for (const part of parts) {
    const pt = tokens(part);
    if (!pt.length) continue;
    if (BAD_TAIL.has(pt[pt.length - 1])) out.push({ code: "FRAGMENT", message: `'${part}' ends mid-phrase ('${pt[pt.length - 1]}')` });
    else if (BAD_HEAD.has(pt[0])) out.push({ code: "FRAGMENT", message: `'${part}' starts mid-clause ('${pt[0]}')` });
    const seen = new Set();
    // Authored chapter titles may echo a word on purpose ("CITY OF PIGS VS THE FEVERED CITY").
    for (const t of kind === "chapter" ? [] : pt) {
      if (!FUNCTION_WORDS.has(t) && seen.has(t)) { out.push({ code: "FRAGMENT", message: `'${part}' repeats '${t}'` }); break; }
      seen.add(t);
    }
  }
  // The narration slicer stripped every function word by construction, so its
  // output reads as keyword soup ("PHRASE HAUNTS CREATORS TOXIC", "DAN PROVOS
  // TOM HAND"). Real 4+ word English copy almost always keeps one ("THE COST
  // OF WAITING", "PAINTING YOU LOVE"). Contractions inside a label ("YEARS DONT
  // SHARE WORK", "ARENT CAREFUL LOSE") are the same artifact.
  if (kind === "label" || kind === "text") {
    const bare = parts.length === 1 ? toks : [];
    // A possessive ("DAN HARMON'S STORY CIRCLE") is grammar, not soup.
    const possessive = /[A-Z0-9]['’]S\b/i.test(text);
    if (bare.length >= 4 && !possessive && !bare.some((t) => FUNCTION_WORDS.has(t) && !FILLER.has(t) && !CONTRACTION_FRAGMENTS.has(t) && !NEGATIONS.has(t))) {
      out.push({ code: "TELEGRAPHIC", message: `'${text}' is keyword soup (no function word in ${bare.length} words)` });
    }
    const contr = toks.filter((t) => CONTRACTION_FRAGMENTS.has(t) || (NEGATIONS.has(t) && t.endsWith("nt")));
    if (kind === "label" && contr.length) out.push({ code: "FRAGMENT", message: `'${text}' carries a spoken contraction ('${contr[0]}')` });
  }
  if (!content.length && !TEMPLATE_TEXTS.has(text)) out.push({ code: "FRAGMENT", message: `'${text}' has no content word` });
  if (toks.length > lim.maxWords || text.length > lim.maxChars) out.push({ code: "LENGTH", message: `'${text}' is ${toks.length} words / ${text.length} chars (max ${lim.maxWords}/${lim.maxChars} for ${kind})` });

  if (!ctx.authored && typeof ctx.narration === "string" && content.length) {
    const said = new Set(contentTokens(ctx.narration).map(stem));
    const missing = content.filter((t) => !said.has(stem(t)) && !/^\d+%?$/.test(t));
    // Half the content words must be audibly said in this scene's window.
    if (missing.length / content.length > 0.5) out.push({ code: "UNGROUNDED", message: `'${text}' is not said in this scene (missing: ${missing.join(", ")})` });
  }
  return out;
}

/** Producer-side shortcut: may this string be written as a label at all? */
function isLabel(str, ctx = {}) {
  return checkString(str, { kind: "label", ...ctx }).length === 0;
}

/** Two sides of one graphic must be two different ideas. */
function checkPair(a, b) {
  const A = new Set(contentTokens(a).map(stem));
  const B = new Set(contentTokens(b).map(stem));
  if (!A.size || !B.size) return [];
  if (norm(a) === norm(b)) return [{ code: "PAIR_DUPLICATE", message: `both sides read '${norm(a)}'` }];
  const inter = [...A].filter((t) => B.has(t)).length;
  if (inter / Math.min(A.size, B.size) > 0.5) return [{ code: "PAIR_OVERLAP", message: `'${norm(a)}' and '${norm(b)}' are the same idea` }];
  return [];
}

// ── Config-level gate ────────────────────────────────────────────────────────

function sceneNarration(scene, captions) {
  if (Array.isArray(captions) && captions.length && Number.isFinite(scene.fromFrame)) {
    const from = scene.fromFrame;
    const to = from + (scene.durationFrames || 0);
    const said = captions.filter((c) => c.endFrame > from && c.startFrame < to).map((c) => c.text).join(" ");
    if (said) return said;
  }
  return scene._narration || "";
}

/** Every printed string of a scene, with its kind. HUD chrome and captions excluded. */
function collectScreenStrings(scene, meta = {}) {
  const out = [];
  const titleNorm = norm(meta.title || "");
  (scene.texts || []).forEach((t, i) => {
    if (!t || typeof t.text !== "string") return;
    const s = norm(t.text);
    // The title card's book title is the book's name, not a claim.
    if (titleNorm && (titleNorm === s || titleNorm.startsWith(s))) return;
    out.push({ kind: "text", text: t.text, path: `texts[${i}]`, authored: t.src === "art" });
  });
  const d = scene.diagram;
  if (d) {
    const authored = !!d.authored;
    if (d.title) out.push({ kind: "title", text: d.title, path: "diagram.title", authored });
    (d.labels || []).forEach((l, i) => out.push({ kind: "label", text: l, path: `diagram.labels[${i}]`, authored, pairGroup: "diagram" }));
  }
  if (scene.chapterCard) {
    if (scene.chapterCard.title) out.push({ kind: "chapter", text: scene.chapterCard.title, path: "chapterCard.title", authored: true });
    if (scene.chapterCard.subtitle) out.push({ kind: "chapter", text: scene.chapterCard.subtitle, path: "chapterCard.subtitle", authored: true });
  }
  (scene.props || []).forEach((p, i) => {
    if (p && typeof p.label === "string" && p.label) out.push({ kind: "label", text: p.label, path: `props[${i}].label`, authored: false });
  });
  return out;
}

/**
 * @returns {{status: "PASS"|"FAIL", scenes: number, strings: number,
 *   violations: {sceneId, path, text, code, message}[], counts: Record<string, number>}}
 */
function validateConfig(config) {
  const meta = config.meta || {};
  const captions = config.captions || [];
  const violations = [];
  const seenOn = new Map(); // norm text -> Set(sceneId)
  let strings = 0;

  for (const scene of config.scenes || []) {
    const narration = sceneNarration(scene, captions);
    const items = collectScreenStrings(scene, meta);
    strings += items.length;
    for (const it of items) {
      for (const v of checkString(it.text, { kind: it.kind, narration, authored: it.authored })) {
        violations.push({ sceneId: scene.id, path: it.path, text: norm(it.text), ...v });
      }
      if (it.kind !== "chapter") {
        const key = norm(it.text);
        if (!seenOn.has(key)) seenOn.set(key, new Set());
        seenOn.get(key).add(scene.id);
      }
    }
    const pairs = items.filter((it) => it.kind === "label" && it.pairGroup === "diagram");
    for (let i = 0; i < pairs.length; i++)
      for (let j = i + 1; j < pairs.length; j++)
        for (const v of checkPair(pairs[i].text, pairs[j].text))
          violations.push({ sceneId: scene.id, path: `${pairs[i].path}+${pairs[j].path}`, text: `${norm(pairs[i].text)} | ${norm(pairs[j].text)}`, ...v });
    // Kinetic texts on one frame (e.g. the left/right comparison boxes).
    const tx = items.filter((it) => it.kind === "text");
    for (let i = 0; i < tx.length; i++)
      for (let j = i + 1; j < tx.length; j++)
        for (const v of checkPair(tx[i].text, tx[j].text))
          violations.push({ sceneId: scene.id, path: `${tx[i].path}+${tx[j].path}`, text: `${norm(tx[i].text)} | ${norm(tx[j].text)}`, ...v });
  }
  for (const [text, ids] of seenOn) {
    if (ids.size > REPEAT_LIMIT) {
      violations.push({ sceneId: [...ids][0], path: "*", text, code: "BOOK_REPETITION", message: `'${text}' appears on ${ids.size} scenes (max ${REPEAT_LIMIT})` });
    }
  }
  const counts = {};
  for (const v of violations) counts[v.code] = (counts[v.code] || 0) + 1;
  return { status: violations.length ? "FAIL" : "PASS", scenes: (config.scenes || []).length, strings, violations, counts };
}

module.exports = {
  checkString, isLabel, checkPair, validateConfig, collectScreenStrings, sceneNarration,
  contentTokens, tokens, norm,
  FILLER, FUNCTION_WORDS, NEGATIONS, TEMPLATE_TEXTS, LIMITS, REPEAT_LIMIT,
};
