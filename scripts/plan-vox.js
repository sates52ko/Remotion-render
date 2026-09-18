#!/usr/bin/env node
/**
 * plan-vox.js (v2) — Vox Auto-Pipeline planner with LLM art-direction.
 *
 * VTT + book meta  ->  vox-config JSON { meta, captions[], beats[] }
 *
 * Timing comes from heuristic VTT segmentation; the *creative* plan (archetype,
 * kicker, emphasis, image subjects/style, compare pairs) is produced by an LLM
 * (NVIDIA llama-3.3-70b via the same NVIDIA_API_KEY) with a heuristic fallback.
 *
 * On-screen text is EMPHASIS ONLY — subtitles (captions[]) carry the full narration.
 *
 * Usage:
 *   node scripts/plan-vox.js --vtt=public/captions/single-dad-dilemma.vtt \
 *     --audio=audio/single-dad-dilemma.m4a --title="Single Dad Dilemma" \
 *     --author="Carla Sorensen" --genre=romance --slug=single-dad-dilemma \
 *     --until=180 [--no-llm]
 */
const fs = require("fs");
const { rel, ensureBookDir } = require("./lib/paths");
const { MODEL, ENDPOINT, USE_NVIDIA, stripThink } = require("./lib/llm");
const { phraseEmphasis } = require("./lib/beat-text");

const FPS = 30;
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const VTT = args.vtt || "public/captions/captions.vtt";
const AUDIO = args.audio || "audio/single_dad_dilemma.m4a";
const TITLE = args.title || "Untitled";
const AUTHOR = args.author || "";
const GENRE = (args.genre || "drama").toLowerCase();
const SLUG = args.slug || slugify(TITLE);
const UNTIL = args.until ? parseFloat(args.until) : Infinity;
// Word-level VTT from YouTube is already accurately synchronized with the audio.
// Default OFFSET is 0.0 so captions lock onto spoken words in real time without lag.
const OFFSET = args.offset !== undefined ? parseFloat(args.offset) : 0.0;
// Reproduce a pre-2026-09-12 plan byte-for-byte: lets a scene be re-anchored up
// to 9s past its own narration. See the ANCHOR WINDOW note further down; only
// use this to diff against an old config.
const LEGACY_ANCHOR = "legacy-anchor" in args;
// Beat briefs (scripts/plan-briefs.js) — the beat's SUBJECT, grounded in the
// book's story bible and matched back by narration fingerprint rather than by
// index. When one is present and confident it replaces the keyword-bag image
// subject, which is 93% of every Flux prompt this project has ever sent.
const BRIEFS_IN = args.briefs || null;
const BRIEF_MIN_CONFIDENCE = args["brief-confidence"] !== undefined ? parseFloat(args["brief-confidence"]) : 0.6;
// Opt-in transition sound layer (src/engines/vox/sfx.tsx). Off unless asked
// for: the narration is continuous speech, so every effect lands on a voice —
// worth having, but only after someone has listened to it.
const SFX = "sfx" in args || process.env.VOX_SFX === "1";
const OUT = args.out || rel.voxConfig(SLUG);
// Claude-first art-direction. Model path (llama) is dormant unless opted in.
//   --designs=<file>    consume Claude-authored designs (highest quality)
//   --emit-beats=<file> dump beat texts for Claude to design, then exit
//   USE_NVIDIA=1 / --use-llm  wake the model path;  --no-llm always forces off
const DESIGNS_IN = args.designs || null;
const EMIT_BEATS = args["emit-beats"] || null;
const USE_LLM = !args["no-llm"] && (USE_NVIDIA || !!args["use-llm"]) && !!process.env.NVIDIA_API_KEY;

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function tc(t) {
  const m = t.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0;
}

// ── VTT word-level parse ─────────────────────────────────────────────────
function parseWords(vttText) {
  const lines = vttText.split(/\r?\n/);
  const words = [];
  let cueStart = 0;
  const cueHeader = /(\d+:\d+:\d+\.\d+)\s+-->\s+(\d+:\d+:\d+\.\d+)/;
  const inlineRe = /<(\d+:\d+:\d+\.\d+)><c>\s*([^<]+?)\s*<\/c>/g;
  for (const line of lines) {
    const h = line.match(cueHeader);
    if (h) { cueStart = tc(h[1]); continue; }
    if (!line.includes("<c>")) continue;
    const firstStamp = line.indexOf("<");
    const lead = firstStamp > 0 ? line.slice(0, firstStamp).trim() : "";
    if (lead) lead.split(/\s+/).forEach((w) => words.push({ t: cueStart, w }));
    let m;
    inlineRe.lastIndex = 0;
    while ((m = inlineRe.exec(line))) words.push({ t: tc(m[1]), w: m[2].trim() });
  }
  const seen = new Set();
  const out = [];
  for (const x of words) {
    if (!x.w) continue;
    const key = x.t.toFixed(3) + "|" + x.w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (out.length && out[out.length - 1].w === x.w && Math.abs(out[out.length - 1].t - x.t) < 0.05) continue;
    out.push(x);
  }
  out.sort((a, b) => a.t - b.t);
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    out[i].end = next ? Math.max(out[i].t + 0.1, next.t) : out[i].t + 0.5;
    if (out[i].end - out[i].t > 1.2) out[i].end = out[i].t + 0.6;
  }
  return out;
}

function buildCaptions(words) {
  const caps = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    caps.push({
      text: cur.map((w) => w.w).join(" "),
      startFrame: Math.round(cur[0].t * FPS),
      endFrame: Math.round(cur[cur.length - 1].end * FPS),
      words: cur.map((w) => ({ w: w.w, s: Math.round(w.t * FPS), e: Math.round(w.end * FPS) })),
    });
    cur = [];
  };
  for (const w of words) {
    if (w.t > UNTIL) break;
    cur.push(w);
    const dur = cur[cur.length - 1].end - cur[0].t;
    if (cur.length >= 9 || dur >= 3.0 || (/[.!?]$/.test(w.w) && cur.length >= 4)) flush();
  }
  flush();
  return caps;
}

function buildBeats(words) {
  const TARGET = 6.5, MIN = 3.0, MAX = 8.5;
  const beats = [];
  let cur = [];
  const push = () => { if (cur.length) { beats.push({ words: cur, start: cur[0].t, end: cur[cur.length - 1].end }); cur = []; } };
  for (const w of words) {
    if (w.t > UNTIL) break;
    cur.push(w);
    const dur = cur[cur.length - 1].end - cur[0].t;
    if ((/[.!?]$/.test(w.w) && dur >= TARGET) || dur >= MAX) push();
  }
  push();
  const split = [];
  for (const b of beats) {
    const dur = b.end - b.start;
    if (dur <= MAX + 0.5) { split.push(b); continue; }
    const n = Math.max(2, Math.round(dur / TARGET));
    const per = Math.ceil(b.words.length / n);
    for (let i = 0; i < b.words.length; i += per) {
      const chunk = b.words.slice(i, i + per);
      split.push({ words: chunk, start: chunk[0].t, end: chunk[chunk.length - 1].end });
    }
  }
  const merged = [];
  for (const b of split) {
    if (b.end - b.start < MIN && merged.length) {
      const prev = merged[merged.length - 1];
      prev.words = prev.words.concat(b.words);
      prev.end = b.end;
    } else merged.push(b);
  }
  return merged;
}

// ── heuristic art-direction (fallback) ───────────────────────────────────
const STOP = new Set("the a an and or but so of to in on at for with as is are was were be been it its this that these those we you they i he she him her his their our your my me us them mean just like really very much more most about into from than then now here there what how why who when which not no yes um uh".split(/\s+/));
const FILLER = new Set("specifically absolutely really actually basically literally honestly maybe probably obviously essentially definitely certainly seriously totally completely".split(/\s+/));

function keywords(text, n = 3) {
  const toks = text.toLowerCase().replace(/[^a-z0-9$%.\s-]/g, "").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  const freq = {};
  toks.forEach((w) => (freq[w] = (freq[w] || 0) + 1 + w.length * 0.05));
  return [...new Set(toks)].sort((a, b) => freq[b] - freq[a]).slice(0, n);
}
// Emphasis = the single most salient contiguous PHRASE (see beat-text.js).
// Falls back to the top keyword when the beat has nothing phrase-worthy.
function emphasis(text, n = 2) {
  const ph = phraseEmphasis(text, { max: n === 1 ? 2 : 3, want: n === 1 ? 1 : 2 }).slice(0, Math.max(n, 3));
  if (ph.length) return ph;
  return keywords(text, n).map((w) => w.toUpperCase());
}
function listItems(t) {
  const m = t.match(/([\w-]+(?:\s[\w-]+)?),\s*([\w-]+(?:\s[\w-]+)?),?\s*(?:and|&)\s*([\w-]+(?:\s[\w-]+)?)/i);
  return m ? [m[1], m[2], m[3]].map((s) => s.replace(/^(in|a|an|the|of|to|and)\s+/i, "").trim().toUpperCase()) : null;
}
const GENERIC = new Set("THIS THAT THESE THOSE DESCRIPTION THING THINGS STUFF PART PARTS IT ONE MORE MOST SOME MANY MUCH KIND SORT WAY WAYS".split(/\s+/));
function cleanItems(list) {
  const out = [];
  for (let it of list || []) {
    it = String(it).replace(/^(HIS|HER|THE|A|AN|OF|TO|AND|IN|THEIR|ITS)\s+/i, "").trim().toUpperCase();
    if (!it || it.length < 3 || GENERIC.has(it)) continue;
    if (!out.includes(it)) out.push(it);
  }
  return out.slice(0, 4);
}
// ── NARRATIVE DETECTORS ─────────────────────────────────────────────────────
// 88% of beats used to resolve to imagefocus/statement. These recognise the
// shapes a BOOK makes so the narrative archetypes (scenes-narrative.tsx) have
// something to fire on.
//
// They are deliberately STRICT, and each returns the PAYLOAD it found rather
// than a boolean. A loose version scored better on the archetype histogram and
// much worse on screen: "front of the room" became a `place` captioned
// PROFESSOR, "and then he looks at his children" became a `timeline` whose
// stops were PSYCHOLOGICAL / TRANSMISSION / HAPPENING. A wrong scene is worse
// than a repeated one, so a detector that cannot name its own subject declines.
//
// The real driver is meant to be the art-direction pass (`d.type`, Claude or
// the LLM); these are the fallback for --no-llm and for beats the model skips.

/** Tag questions ("right?", "you know?") are discourse, not a question beat. */
const TAG_Q = /\b(right|yeah|you know|okay|ok|huh|no)\s*\?\s*$/i;
/**
 * A beat whose PAYLOAD is a question: it ends on one, and not a verbal tic.
 */
const isQuestion = (t) => {
  const s = String(t).trim();
  if (!/\?$/.test(s)) return false;
  if (TAG_Q.test(s)) return false;
  return s.split(/\s+/).length <= 30;
};

/**
 * Chronology, and the stops to hang on the rail. Only explicit time markers
 * count — years and ages. "And then" is a narrative connective, not a timeline.
 */
const timelineStops = (t) => {
  const stops = [];
  for (const m of String(t).matchAll(/\b(1[6-9]\d{2}|20[0-4]\d)\b/g)) stops.push(m[1]);
  for (const m of String(t).matchAll(/\bat (?:the age of )?(\d{1,2})\b/gi)) stops.push("AGE " + m[1]);
  for (const m of String(t).matchAll(/\b(\d{1,2})\s+years\s+later\b/gi)) stops.push("+" + m[1] + " YRS");
  const uniq = [...new Set(stops)];
  return uniq.length >= 2 ? uniq.slice(0, 4) : null;
};

/**
 * A named setting. The place has to be a proper noun sitting behind a
 * locative preposition — no common-noun lexicon, which is what produced
 * "room" / "home" / "school" false positives on nearly every memoir beat.
 */
/**
 * People, learned from the narration itself.
 *
 * A locative preposition takes a person as happily as a place ("back at Gene
 * Westover's shop"), and half the detected "places" in a memoir were actually
 * characters — rendered as a map pin with their name under it. There is no NER
 * here, but there is a strong positional signal: a PERSON is a grammatical
 * SUBJECT somewhere in the transcript ("Shawn said", "Tara was"), while a place
 * essentially never is. Built once over the whole narration, reused per beat.
 */
const PERSON_VERB = /^(was|is|were|are|had|has|said|says|told|went|goes|did|does|would|could|will|thought|knew|knows|looked|looks|walked|walks|came|comes|took|takes|started|starts|felt|feels|believed|decided|wanted|wants|grabbed|screamed|yelled|drove|climbed|worked|works|calls|called)$/i;
function buildPersonSet(allTexts) {
  const hits = Object.create(null);
  for (const t of allTexts) {
    const toks = String(t).split(/\s+/);
    for (let i = 0; i < toks.length - 1; i++) {
      const w = toks[i].replace(/[^A-Za-z']/g, "");
      const next = toks[i + 1].replace(/[^A-Za-z']/g, "");
      if (!/^[A-Z][a-z]{2,}$/.test(w)) continue;
      if (PERSON_VERB.test(next)) hits[w] = (hits[w] || 0) + 1;
    }
  }
  return new Set(Object.keys(hits).filter((w) => hits[w] >= 2)); // 1 is noise, 2 is a pattern
}
/** Filled in once the beats are parsed; empty until then (detectors degrade safely). */
let PERSONS = new Set();

// Pronouns, sentence openers, and TIME names — "at Thanksgiving" / "in June"
// are locative in grammar only; a map pin under them reads as a mistake.
const NOT_PLACE = /^(I|He|She|They|We|You|It|And|But|So|Then|The|A|An|Mom|Dad|God|English|American|Mormon|January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Christmas|Thanksgiving|Easter|Halloween)$/;
const placeName = (t) => {
  // STRONG locatives only. "to" and "from" take people just as readily as
  // places ("talked to Gene Westover"), which is how a character's name ended
  // up rendered as a map pin.
  const m = String(t).match(/\b(?:in|at|out in|up on|down in|across|near|outside|inside)\s+([A-Z][a-z]{2,}(?:'s)?(?:\s+[A-Z][a-z]{2,}){0,2})\b/);
  if (!m) return null;
  const name = m[1].trim();
  const head = name.split(/\s+/)[0];
  if (NOT_PLACE.test(head)) return null;
  if (PERSONS.has(head.replace(/'s$/, ""))) return null;   // a character, not a setting
  if (/^[A-Za-z]+'s$/.test(name)) return null;             // "Tara's" on its own is possession
  return name;
};

/**
 * Two NAMED subjects held together. Captures whole name phrases so
 * "John Stewart Mill and Mary Wollstonecraft" does not come back as
 * ["Mill", "Mary"].
 */
const duoPair = (t) => {
  const m = String(t).match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\s+and\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/);
  if (!m || /\bvs\b/i.test(t)) return null;
  const [a, b] = [m[1].trim(), m[2].trim()];
  if (NOT_PLACE.test(a.split(/\s+/)[0]) || NOT_PLACE.test(b.split(/\s+/)[0])) return null;
  return [a, b];
};

/**
 * A turn: the sentence reverses what came before it. `reveal` wipes these in
 * rather than springing them, which lands the reversal harder.
 */
const isReveal = (t) =>
  /\b(but then|until|instead|turns out|in fact|no longer|the truth is|never again|everything changed)\b/i.test(t) &&
  String(t).split(/\s+/).length <= 24;

/**
 * DETECTOR VOCABULARY — one definition, shared by heuristicDesign() and the
 * main assignment ladder below.
 *
 * Two bugs lived here and both are structural, not typos:
 *
 * 1. UNANCHORED SUBSTRINGS. Every token is now `\b`-anchored, because a bare
 *    `ratio` matched inside naRATIOn / frustRATIOn / geneRATIOn (185 of 202
 *    `dataviz` hits across the shipped corpus were that), `pact` matched inside
 *    imPACT, and `from .* to` matched ordinary English ("takes the vase from her
 *    to fill it" rendered a transatlantic flight path).
 * 2. TWO COMPETING LADDERS. heuristicDesign() used LOOSE regexes and the main
 *    ladder STRICT ones, but each strict branch was guarded by `d.type === X ||`
 *    — so in the default no-LLM path (which is every shipped book) the loose
 *    copy always won and the strict copy was dead code. There is now one copy.
 *
 * Rule for editing: a detector fires on MEANING. If a token also appears inside
 * unrelated words, or inside ordinary prose, it does not belong here.
 */
const RE = {
  checklist: /\b(action step|takeaway|checklist|habit|rule\s+#?\d|lesson\s+#?\d)\b/i,
  polaroid: /\b(photograph|portrait|case study|snapshot|archival photo)\b/i,
  chart: /\b(compound(ing|ed)?|exponential|growth curve|return on investment)\b/i,
  stat: /(\$?\d[\d,\.]*\s?(%|percent|million|billion|trillion|x\b))/i,
  quote: /["“”]/,
  document: /\b(newspaper|headline|official record|classified|declassified|dossier|investigation)\b/i,
  map: /\b(flight path|trade route|the border|geography of|journey across|fled to|sailed to|crossed into)\b/i,
  trendline: /\b(trend|trajectory|surge|decline|over time|through the years|decade)\b/i,
  flow: /\b(chain reaction|mechanism of|leads to the|domino effect|step by step)\b/i,
  dataviz: /\b(percent|proportion of|ratio of|scale matrix)\b/i,
  network: /\b(conspiracy|network of|web of|connected to|allies with|alliance)\b/i,
  year: /\b(19\d\d|20\d\d)\b/,
};

/**
 * Archetypes that can only draw a graphic if the planner hands them real data.
 * Left to their own defaults they invent it — a `STANDARD BENCHMARK 35%` next to
 * `firstNumberInText % 100`, a conspiracy board asserting LINKED TO / INFLUENCED
 * between three emphasis words, a trendline plotting a hardcoded 24/58/42/89.
 * That is fabricated evidence in a factual video, and it is worse than a plain
 * frame. `groundedPayload()` below is the gate: no payload, no archetype.
 * Phase 3 of VISUAL_RELEVANCE_PLAN.md supplies the payloads and re-opens them.
 */
const NEEDS_REAL_DATA = new Set(["dataviz", "trendline", "flow", "network", "chart", "map"]);

/**
 * The real numbers a beat actually says, in order. A quantity graphic that is
 * not built from these must not render.
 */
function spokenNumbers(text) {
  return (String(text).match(/\b\d[\d,]*(?:\.\d+)?\b/g) || [])
    .map((n) => parseFloat(n.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

/**
 * Returns the grounded payload for a data archetype, or null when the beat
 * cannot support it. Null means "pick a different archetype".
 */
/** place -> the region GeoMap can legitimately highlight. Small and literal on purpose. */
const MAP_REGIONS = [
  [/\b(america|american|u\.?s\.?a?\b|united states|washington|new york|california|texas|chicago|canada|mexico)\b/i, "northAmerica"],
  [/\b(europe|european|england|english|britain|british|london|france|french|paris|germany|german|berlin|italy|rome|spain|russia|moscow|poland|greece|athens)\b/i, "europe"],
  [/\b(asia|asian|china|chinese|beijing|japan|japanese|tokyo|india|indian|korea|vietnam|thailand)\b/i, "asia"],
  [/\b(middle east|iran|iraq|persia|israel|jerusalem|egypt|cairo|syria|arabia|baghdad|turkey|istanbul)\b/i, "middleEast"],
];

/**
 * Returns the grounded payload for a data archetype, or null when the beat
 * cannot support it. Null means "pick a different archetype".
 *
 * The shapes here must match src/engines/vox/schema.ts exactly — the renderers
 * now REFUSE to draw without them (UngroundedFallback), so a malformed payload
 * is a silently blank graphic rather than a crash.
 */
function groundedPayload(type, text) {
  const nums = spokenNumbers(text);
  if (type === "dataviz") {
    // every percentage the sentence actually states; nothing is compared
    // against a benchmark we would have to invent
    const pcts = [...String(text).matchAll(/\b(\d{1,3}(?:\.\d+)?)\s?(?:%|percent)\b/gi)];
    if (!pcts.length) return null;
    return {
      chartData: pcts.slice(0, 3).map((m) => parseFloat(m[1])),
      chartLabels: pcts.slice(0, 3).map((m) => `${m[1]}%`),
    };
  }
  if (type === "trendline") {
    // a trend needs stated figures AND something to hang them on
    const years = String(text).match(/\b(19\d\d|20\d\d)\b/g) || [];
    const vals = nums.filter((n) => !(n >= 1900 && n <= 2099));
    if (vals.length < 2) return null;
    return {
      trendPoints: vals.slice(0, 5).map((v, i) => ({
        label: years[i] || String(v),
        year: years[i],
        value: v,
        ...(i === Math.min(vals.length, 5) - 1 ? { isHighlight: true } : {}),
      })),
    };
  }
  if (type === "chart") {
    const vals = nums.filter((n) => !(n >= 1900 && n <= 2099));
    return vals.length >= 2 ? { chartData: vals.slice(0, 8) } : null;
  }
  if (type === "flow") {
    const stops = cleanItems(listItems(text) || []);
    return stops.length >= 2 ? { flowNodes: stops.slice(0, 4).map((s) => ({ label: s })) } : null;
  }
  if (type === "network") {
    // A relation graph asserts that A is LINKED TO B. Nothing here can extract
    // real entities and real relations from one sentence, and a guessed
    // relation is a fabricated claim, so `network` is never selected. Phase 3
    // of VISUAL_RELEVANCE_PLAN.md supplies props.networkNodes/networkLinks.
    return null;
  }
  if (type === "map") {
    // GeoMap used to invent a North-America -> Europe flight path from
    // hash(beat.id). It draws only when the narration names a real place, and
    // the highlighted region comes from that place -- never a route we made up.
    const p = placeName(text);
    if (!p) return null;
    const hit = MAP_REGIONS.find(([re]) => re.test(text));
    return hit ? { mapRegion: hit[1] } : {};
  }
  return null;
}

/**
 * Which paper a `document` beat is: today the renderer coin-flips newspaper vs
 * declassified on hash(beat.id), so a 1930s novel got a TOP SECRET dossier.
 * The narration names it; write it down. (Consumed by DocumentScene's
 * `beat.props.docType`.)
 */
function docTypeOf(text) {
  // Values MUST come from the `docType` union in src/engines/vox/schema.ts:
  // newspaper | declassified | parchment | telegram | lab | financial
  if (/\b(classified|declassified|dossier|top secret|case file)\b/i.test(text)) return "declassified";
  if (/\b(newspaper|headline|the press|front page)\b/i.test(text)) return "newspaper";
  if (/\b(telegram|wrote to|a letter|his letter|her letter|diary|journal entry)\b/i.test(text)) return "telegram";
  if (/\b(manuscript|scroll|ancient text|the gospel|parchment|inscription)\b/i.test(text)) return "parchment";
  if (/\b(study|experiment|laboratory|researchers?|clinical|trial)\b/i.test(text)) return "lab";
  if (/\b(ledger|balance sheet|the accounts|invoice|financial record)\b/i.test(text)) return "financial";
  return "newspaper";
}

/**
 * Does this sentence contain something a camera could point at? A proper noun
 * (a person, a place, a title) or a detected place name. Deliberately narrow:
 * with the current keyword-bag image prompts, a picture we cannot name is worse
 * than no picture, so the default answer is no.
 */
const NOT_A_NAME = new Set([
  "I", "I'm", "I've", "I'd", "I'll", "And", "But", "So", "Then", "Now", "The", "A", "An",
  "It", "It's", "He", "She", "They", "We", "You", "This", "That", "There", "Here",
  "Yeah", "Okay", "OK", "Right", "Well", "Oh", "What", "When", "Where", "Why", "How", "Who",
  "Because", "If", "Just", "Like", "Not", "No", "Yes", "Her", "His", "My", "Your", "Our",
]);
/**
 * BEAT BRIEFS — the subject layer.
 *
 * Matched by a fingerprint of the beat's own words, never by index: every other
 * authored artifact here (`--designs`, `--callouts`, `--cast`) is read back as
 * `ARR[i]` with no check, so one re-plan at a different segmentation silently
 * attaches every authored decision to the wrong sentence. The fingerprint must
 * stay identical to the one in scripts/plan-briefs.js.
 */
function briefFingerprint(text) {
  const norm = String(text).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  let h = 2166136261;
  for (let i = 0; i < norm.length; i++) { h ^= norm.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
let BRIEFS = null;          // Map<fp, brief>
let briefHits = 0, briefMisses = 0;
function loadBriefs() {
  if (!BRIEFS_IN) return;
  const loaded = JSON.parse(fs.readFileSync(BRIEFS_IN, "utf8"));
  const arr = loaded.briefs || loaded;
  BRIEFS = new Map(arr.filter((b) => b && b.fp).map((b) => [b.fp, b]));
  console.log(`  briefs: ${BRIEFS.size} loaded from ${BRIEFS_IN}`);
}
function briefFor(text) {
  if (!BRIEFS) return null;
  const b = BRIEFS.get(briefFingerprint(text));
  if (b) briefHits++; else briefMisses++;
  return b && (b.confidence ?? 0) >= BRIEF_MIN_CONFIDENCE ? b : null;
}

function isPicturable(text) {
  if (placeName(text)) return true;
  const toks = String(text).trim().split(/\s+/);
  for (let k = 1; k < toks.length; k++) {           // k=1: skip the sentence-initial capital
    const w = toks[k].replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "");
    if (w.length < 3 || NOT_A_NAME.has(w)) continue;
    // a real proper noun mid-sentence, not an ASR all-caps artifact
    if (/^[A-Z][a-z']+$/.test(w) && !/[.!?]$/.test(toks[k - 1] || "")) return true;
  }
  return false;
}

function heuristicDesign(text, i, total) {
  const li = listItems(text);
  let type = "statement";
  if (i === 0) type = "title";
  else if (i === total - 1) type = "punchline";
  else if (isQuestion(text)) type = "question";
  else if (RE.checklist.test(text) && li) type = "checklist";
  else if (li) type = "list";
  else if (RE.polaroid.test(text)) type = "polaroid";
  else if (RE.chart.test(text)) type = "chart";
  else if (timelineStops(text)) type = "timeline";
  else if (RE.stat.test(text)) type = "stat";
  else if (RE.quote.test(text)) type = "quote";
  else if (RE.document.test(text)) type = "document";
  else if (RE.map.test(text)) type = "map";
  else if (RE.trendline.test(text) && RE.year.test(text)) type = "trendline";
  else if (RE.flow.test(text)) type = "flow";
  else if (RE.dataviz.test(text)) type = "dataviz";
  else if (RE.network.test(text)) type = "network";
  else if (placeName(text)) type = "place";
  else if (text.split(/\s+/).length <= 8) type = "statement";
  // A beat with no detected subject used to alternate imagefocus/statement on
  // INDEX PARITY (`i % 2 === 0`) — whether a beat got a photograph at all was
  // decided by whether its index was even, on ~78% of all beats. Ask instead
  // whether the sentence has something picturable in it: a proper noun or a
  // place. Everything else is an idea, and an idea is better served by type on
  // paper than by whatever Flux returns for three scraped keywords.
  // (Phase 3 of VISUAL_RELEVANCE_PLAN.md replaces this with the beat's real
  // subject, at which point far more beats can safely carry a picture.)
  else type = isPicturable(text) ? "imagefocus" : "statement";
  const kw = keywords(text, 3);
  const d = { type, kicker: type === "title" ? "BOOK BREAKDOWN" : "", emphasis: emphasis(text, type === "list" || type === "checklist" ? 1 : 2), items: li || [], compare: null };
  if (type === "title" || type === "imagefocus" || type === "polaroid") d.image = { subject: kw.join(", "), style: "card" };
  else d.image = null;
  return d;
}

// ── LLM art-direction (with incremental per-beat cache) ────────────────────
function textHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const PROMPT_VERSION = "v2"; // bump to invalidate cache when the system prompt changes

async function llmDesign(beatTexts) {
  const key = process.env.NVIDIA_API_KEY;
  const cacheFile = rel.cache(SLUG);
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch {}
  const results = new Array(beatTexts.length);
  const miss = [];
  beatTexts.forEach((t, i) => {
    const h = PROMPT_VERSION + ":" + textHash(t);
    if (cache[h]) results[i] = cache[h];
    else miss.push(i);
  });
  console.log(`  cache: ${beatTexts.length - miss.length} hit, ${miss.length} to design`);

  const CHUNK = 24;
  for (let start = 0; start < miss.length; start += CHUNK) {
    const idxs = miss.slice(start, start + CHUNK);
    const slice = idxs.map((i) => beatTexts[i]);
    const sys = `You are the art director for a world-class Vox / Johnny-Harris-style motion-graphics investigative book-summary video about the ${GENRE} book "${TITLE}"${AUTHOR ? " by " + AUTHOR : ""}.
For each narration beat, design ONE scene. Output STRICT JSON: an array (same length & order as input) of objects with keys:
- "type": one of "title","statement","list","quote","stat","imagefocus","compare","punchline",
  "question" (the beat asks something), "timeline" (a chronology - also fill "items" with 2-4 stops),
  "place" (a setting - put the place name first in "emphasis"), "duo" (two subjects held TOGETHER,
  as opposed to "compare" which sets them against each other), "reveal" (a turn or reversal),
  "document" (newspaper headline, archival record, classified file, declassified memo or report),
  "map" (geography, country borders, travel routes, strategic territories or journey tracking),
  "dataviz" (data journalism, percentages, scale matrices, proportion of people/items, or comparative bar scales),
  "trendline" (historical trajectory, economic or social trends across decades, inflection points),
  "flow" (cause-and-effect mechanism, step-by-step pipeline from catalyst to structural friction to outcome),
  "network" (connection web, relationships between multiple characters/institutions, conspiracy board),
  "checklist" (3-4 actionable steps, habits or lessons from the book to check off),
  "polaroid" (an archival photograph, portrait, experiment or case study framed as an instant photo),
  "chart" (compounding growth curve, exponential curve, or trend line for finance/habits/psychology).
- "kicker": 2-4 word ALL-CAPS label or "" (a section tag, not a sentence).
- "emphasis": 1-3 SHORT ALL-CAPS words that will appear big on screen. Pick the most SPECIFIC, CONCRETE nouns from the beat — character names, place names, key terms, numbers, book-specific concepts. NEVER generic verbs (happens, becomes, realizes), adjectives (important, different), or common words. A proper noun alone ("ASHURA") beats a vague phrase ("THE MOMENT"). NEVER a full sentence.
- "items": for "list" only, 2-4 SHORT ALL-CAPS items, else [].
- "image": null, or {"subject":"<concrete cinematic visual to illustrate this beat, no text>","style":"cutout"|"card"}. Use "cutout" for a single person/character or object (it will be masked onto a paper background); "card" for an environment/place/scene. Only add an image when it genuinely helps.
- "compare": for "compare" only, {"left":{"label":"<CAPS>","subject":"<visual>"},"right":{"label":"<CAPS>","subject":"<visual>"}}, else null.
Rules: on-screen text is EMPHASIS ONLY (subtitles carry the words). Vary archetypes so no 3 in a row repeat. First beat = "title". Prefer concrete, specific image subjects tied to the story (characters, settings, objects), not abstractions.`;
    const user = "Beats:\n" + slice.map((t, i) => `${i}. ${t}`).join("\n") + "\n\nReturn ONLY the JSON array.";
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: sys }, { role: "user", content: user }],
          temperature: 0.5, max_tokens: 4000,
        }),
      });
      const j = await resp.json();
      const txt = stripThink(j.choices?.[0]?.message?.content);
      const arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1));
      idxs.forEach((gi, k) => {
        const d = arr[k] || heuristicDesign(beatTexts[gi], gi, beatTexts.length);
        results[gi] = d;
        cache[PROMPT_VERSION + ":" + textHash(beatTexts[gi])] = d;
      });
      fs.writeFileSync(cacheFile, JSON.stringify(cache)); // save incrementally (resume-safe)
      console.log(`  designed misses ${start}-${start + idxs.length - 1} / ${miss.length}`);
    } catch (e) {
      console.warn(`  LLM chunk @${start} failed (${e.message}); heuristics for it.`);
      idxs.forEach((gi) => { results[gi] = heuristicDesign(beatTexts[gi], gi, beatTexts.length); });
    }
  }
  for (let i = 0; i < beatTexts.length; i++) if (!results[i]) results[i] = heuristicDesign(beatTexts[i], i, beatTexts.length);
  return results;
}

// per-book palette overrides (thematic, keyed by slug) — win over the genre default
const SLUG_PALETTES = {
  // The Mountain Is You: self-sabotage (cold, high-altitude shadow) → mastery (golden summit dawn)
  "the-mountain-is-you": "cold alpine blue-slate shadows warming into golden summit dawn light, misty high-altitude air, restrained palette",
};

function imagePrompt(subject, style) {
  const palette = SLUG_PALETTES[SLUG]
    || (GENRE === "romance" ? "warm cinematic light, muted earthy tones, emotional"
    : ["thriller", "mystery", "horror"].includes(GENRE) ? "moody low-key lighting, desaturated, tense"
    : "cinematic, filmic, atmospheric");
  const iso = style === "cutout" ? "single isolated subject, plain seamless studio background, centered, full subject in frame, " : "";
  // Flux is bad at rendering text — suppress it so Remotion handles all on-screen text.
  const NO_TEXT = "no text, no words, no letters, no writing, no typography, no labels, no captions, no titles";
  return `cinematic editorial still: ${subject}. ${iso}${palette}, shallow depth of field, ${NO_TEXT}, no watermark, high detail, 8k`;
}

// ── build ─────────────────────────────────────────────────────────────────
(async () => {
  ensureBookDir(SLUG); // books/<slug>/ must exist before writing config.vox.json / cache.json
  const vttText = fs.readFileSync(VTT, "utf8");
  const words = parseWords(vttText);
  if (!words.length) { console.error("No words parsed from VTT."); process.exit(1); }
  const captions = buildCaptions(words);
  const rawBeats = buildBeats(words);
  const texts = rawBeats.map((b) => b.words.map((w) => w.w).join(" "));
  // The person profile needs the WHOLE narration, so it is built here, before
  // any beat is classified (see buildPersonSet).
  PERSONS = buildPersonSet(texts);
  loadBriefs();

  // ── DESIGN SOURCE (Claude-first) ──────────────────────────────────────────
  // Author's manual (--emit-beats → author → --designs) beats the model; the
  // model beats heuristics. All three yield the same design[] shape.
  if (EMIT_BEATS) {
    const payload = {
      slug: SLUG, title: TITLE, author: AUTHOR, genre: GENRE, count: texts.length,
      instructions:
        "Author one design per beat, SAME order & length. Then: node scripts/plan-vox.js --designs=<thisFileEdited> (same other args).",
      designSchema: {
        type: "title|statement|list|quote|stat|imagefocus|compare|punchline|checklist|polaroid|chart",
        kicker: "2-4 word ALL-CAPS section tag or ''",
        emphasis: "1-3 SHORT ALL-CAPS words: pick the most SPECIFIC nouns — names, places, key terms, numbers (never generic verbs/adjectives, never a full sentence)",
        items: "list-only: 2-4 SHORT ALL-CAPS items, else []",
        image: "null OR {subject:'concrete cinematic visual, no text', style:'cutout'|'card'}",
        compare: "compare-only: {left:{label,subject},right:{label,subject}}, else null",
      },
      beats: texts.map((t, i) => ({ i, text: t, design: heuristicDesign(t, i, texts.length) })),
    };
    ensureBookDir(SLUG);
    fs.writeFileSync(EMIT_BEATS, JSON.stringify(payload, null, 2));
    console.log(`\n✍  ${texts.length} beat yazıldı → ${EMIT_BEATS}`);
    console.log(`   Claude: her beat için "design"i kitaba özgü yeniden yaz (heuristic taslak dolu), sonra:`);
    console.log(`   node scripts/plan-vox.js --designs=${EMIT_BEATS} --vtt=${VTT} --slug=${SLUG} --title="${TITLE}" ...`);
    return;
  }

  let designs;
  if (DESIGNS_IN) {
    const loaded = JSON.parse(fs.readFileSync(DESIGNS_IN, "utf8"));
    // accept either the emit-beats payload ({beats:[{design}]}) or a bare design[]
    const arr = Array.isArray(loaded) ? loaded : (loaded.beats || []).map((b) => b.design || b);
    if (arr.length !== texts.length) {
      console.warn(`  ⚠ designs count ${arr.length} ≠ beats ${texts.length}; missing filled with heuristics.`);
    }
    designs = texts.map((t, i) => arr[i] || heuristicDesign(t, i, texts.length));
    console.log(`Planning ${rawBeats.length} beats via Claude designs (${DESIGNS_IN}) ...`);
  } else if (USE_LLM) {
    console.log(`Planning ${rawBeats.length} beats via LLM (${MODEL}) ...`);
    designs = await llmDesign(texts);
  } else {
    console.log(`Planning ${rawBeats.length} beats via heuristics (Claude-first: --emit-beats to hand-direct, or USE_NVIDIA=1 for the model) ...`);
    designs = texts.map((t, i) => heuristicDesign(t, i, texts.length));
  }

  const arr = (v) => (Array.isArray(v) ? v : v ? String(v).split(/\s*[,/]\s*/) : []);
  const usedTypes = [];
  // data archetypes declined for lack of real data, counted so the decline is a
  // reported number rather than a silent downgrade
  const ungrounded = {};
  const beats = rawBeats.map((b, i) => {
    const d = designs[i] || heuristicDesign(texts[i], i, texts.length);
    const id = `beat-${String(i).padStart(3, "0")}`;
    const fromFrame = Math.round(b.start * FPS);
    const durationFrames = Math.max(30, Math.round((b.end - b.start) * FPS));
    const kicker = String(d.kicker || "").toUpperCase();
    const emphasis = arr(d.emphasis).map((s) => String(s).toUpperCase()).slice(0, 3);
    let items = cleanItems(arr(d.items));
    const kws = keywords(texts[i], 3);
    const blob = kicker + " " + emphasis.join(" ");

    // ── deterministic archetype assignment (LLM content + code variety) ──
    let type;
    const textList = cleanItems(listItems(texts[i]) || []);
    const list2 = items.length >= 2 ? items : textList;
    // detector payloads, computed once: each archetype is fed the thing the
    // detector actually FOUND, never a recycled emphasis word
    const stops = timelineStops(texts[i]);
    const place = placeName(texts[i]);
    let duoLabels = duoPair(texts[i]);
    // `props` is built further down (after the archetype is known), so a branch
    // that discovers a payload parks it here and it is merged in at that point.
    // Writing to `props` from inside this ladder is a TDZ ReferenceError.
    const payload = {};
    // What this beat is ABOUT, if anything told us. Matched by fingerprint of
    // the beat's own words — see briefFor().
    const brief = briefFor(texts[i]);
    if (brief && brief.subject) payload.subject = brief.subject;
    if (i === 0) type = "title";
    else if (i === texts.length - 1) type = "punchline";
    // A question owns the frame before anything else claims the beat: it is the
    // one shape that buys retention on its own (QuestionScene).
    else if (d.type === "question" || isQuestion(texts[i])) type = "question";
    else if (/\bVS\b/i.test(blob) || d.type === "compare") type = "compare";
    // a chronology cue WITH labels to hang on the rail beats a plain list
    else if (d.type === "timeline" || stops) {
      type = "timeline";
      // the stops ARE the nodes; LLM-authored items only fill in when it asked
      // for a timeline itself and supplied its own labels
      items = stops || (list2.length >= 2 ? list2 : emphasis.slice(0, 3));
    } else if (d.type === "checklist" || (RE.checklist.test(texts[i]) && (items.length >= 2 || textList.length >= 2))) {
      type = "checklist";
      payload.checklistItems = items.length >= 2 ? items : textList;
    } else if (items.length >= 2 || textList.length >= 2) {
      type = "list";
      if (items.length < 2) items = textList;
    } else if (d.type === "stat" || RE.stat.test(texts[i])) type = "stat";
    else if (d.type === "quote") type = "quote";
    else if (d.type === "polaroid" || (RE.polaroid.test(texts[i]) && d.image)) {
      type = "polaroid";
    } else if (d.type === "chart" || RE.chart.test(texts[i])) {
      type = "chart";
    }
    // two NAMED subjects held together; compare covers the opposition case
    else if (d.type === "duo" || duoLabels) type = "duo";
    else if (d.type === "reveal" || isReveal(texts[i])) type = "reveal";
    else if (d.type === "place" || place) type = "place";
    else if (d.type === "document" || RE.document.test(texts[i])) type = "document";
    else if (d.type === "map" || RE.map.test(texts[i])) type = "map";
    else if (d.type === "trendline" || (RE.trendline.test(texts[i]) && RE.year.test(texts[i]))) type = "trendline";
    else if (d.type === "flow" || RE.flow.test(texts[i])) type = "flow";
    else if (d.type === "dataviz" || RE.dataviz.test(texts[i])) type = "dataviz";
    else if (d.type === "network" || RE.network.test(texts[i])) type = "network";
    // A confident brief means we can name what a photograph of this beat would
    // contain, which is exactly the condition `imagefocus` needs. Without briefs
    // this falls back to isPicturable()'s proper-noun test.
    else if ((brief && brief.vox && brief.vox.shot) || (d.image && d.image.subject)) type = "imagefocus";
    else type = "statement";

    // ── GROUNDING GATE ─────────────────────────────────────────────────────
    // The data archetypes draw a graphic whether or not anyone gave them data,
    // and their defaults are invented (a 35% "standard benchmark", a conspiracy
    // board wiring three emphasis words together with LINKED TO / INFLUENCED,
    // a trendline plotting 24/58/42/89). In a video that presents itself as
    // factual that is fabricated evidence, so an archetype that cannot be fed
    // from the narration does not get selected: it falls back to the ordinary
    // treatment of the same words.
    if (NEEDS_REAL_DATA.has(type)) {
      const g = groundedPayload(type, texts[i]);
      if (g) Object.assign(payload, g);
      else {
        ungrounded[type] = (ungrounded[type] || 0) + 1;
        type = d.image && d.image.subject ? "imagefocus" : "statement";
      }
    }
    // A `document` beat knows which paper it is; the renderer otherwise
    // coin-flips newspaper vs TOP SECRET dossier on hash(beat.id).
    if (type === "document") payload.docType = docTypeOf(texts[i]);
    // ── MONOTONY BREAKER ───────────────────────────────────────────────────
    // The content detectors above are strict on purpose, so they stay rare and
    // most beats still land on statement/imagefocus. This rotation is what
    // actually spreads the histogram, and it is SAFE to apply anywhere:
    // statement, reveal and quote all render nothing but the beat's emphasis
    // words, so swapping between them can never show the wrong thing — only a
    // different treatment of the same words (spring / wipe / serif pull-quote).
    // Content-dependent archetypes (question, place, timeline, duo) are never
    // chosen here; being wrong about those is worse than being repetitive.
    // A WINDOW, not just the previous beat: the planner's natural output is a
    // strict statement/imagefocus alternation, so an "is the last one the same"
    // check never fires and the viewer still sees two frames for forty minutes.
    // …with ONE correction to that claim: `quote` is not a neutral treatment.
    // QuoteScene wraps the words in quotation marks, which asserts that the book
    // said them in that order — and 38% of shipped `quote` beats have no
    // quotation mark anywhere in their narration. A treatment may restyle the
    // words; it may not put words in the author's mouth. So `quote` is only in
    // the rotation for a beat that actually contains a quotation.
    const TEXT_ROTATION = RE.quote.test(texts[i])
      ? ["statement", "reveal", "quote"]
      : ["statement", "reveal"];
    const win = usedTypes.slice(-4);
    if (type === "statement" && win.filter((t) => t === "statement").length >= 2) {
      const count = (t) => usedTypes.filter((u) => u === t).length;
      type = TEXT_ROTATION.slice().sort((a, b) => count(a) - count(b))[0];
    }
    // imagefocus keeps its image — it just stops being every other beat
    if (type === "imagefocus" && win.filter((t) => t === "imagefocus").length >= 3) type = "statement";
    usedTypes.push(type);

    const images = [];
    const addImg = (suffix, subject, style) => {
      const path = `scenes/${SLUG}/${id}${suffix}.png`;
      const img = { path, prompt: imagePrompt(subject, style), style };
      if (style === "cutout") img.cut = `scenes/${SLUG}/${id}${suffix}-cut.png`;
      images.push(img);
      return img;
    };

    const sourceMatch = texts[i].match(/\b(?:according to|study by|research at|published in|harvard|stanford|in chapter \d+)\b[^,\.\;]{0,36}/i);
    const sourceRef = sourceMatch ? sourceMatch[0].trim().toUpperCase() : undefined;
    const props = { text: texts[i], kicker, emphasis, items, keywords: kws, ...payload, ...(sourceRef ? { sourceRef } : {}) };
    if (i === 0) { props.title = TITLE; props.author = AUTHOR; if (!props.kicker) props.kicker = "BOOK BREAKDOWN"; }

    if (type === "compare") {
      let left, right, ls, rs;
      if (d.compare && d.compare.left && d.compare.right) {
        left = String(d.compare.left.label || "").toUpperCase();
        right = String(d.compare.right.label || "").toUpperCase();
        ls = d.compare.left.subject || left;
        rs = d.compare.right.subject || right;
      } else {
        const src = emphasis.find((e) => /\bVS\b/i.test(e)) || (/\bVS\b/i.test(kicker) ? kicker : emphasis.join(" VS "));
        const parts = src.split(/\bVS\b/i).map((s) => s.trim()).filter(Boolean);
        left = (parts[0] || emphasis[0] || kws[0] || "THIS").toUpperCase();
        right = (parts[1] || emphasis[1] || kws[1] || "THAT").toUpperCase();
        ls = `${left.toLowerCase()} concept, ${GENRE} story`;
        rs = `${right.toLowerCase()} concept, ${GENRE} story`;
      }
      props.compareLabels = [left, right];
      addImg("-a", ls, "cutout");
      addImg("-b", rs, "cutout");
    } else if (type === "place") {
      // PlaceScene reads emphasis[0] as the place name, so put the detected
      // name there rather than whatever the emphasis extractor happened to pick
      if (place) props.emphasis = [place.toUpperCase(), ...emphasis.filter((e) => e !== place.toUpperCase())].slice(0, 2);
    } else if (type === "duo") {
      // same two-image staging as compare; the connector differs, not the assets
      const la = (duoLabels && duoLabels[0]) || emphasis[0] || kws[0] || "HER";
      const lb = (duoLabels && duoLabels[1]) || emphasis[1] || kws[1] || "HIM";
      props.compareLabels = [la.toUpperCase(), lb.toUpperCase()];
      addImg("-a", (d.compare && d.compare.left && d.compare.left.subject) || `${la.toLowerCase()}, ${GENRE} story`, "cutout");
      addImg("-b", (d.compare && d.compare.right && d.compare.right.subject) || `${lb.toLowerCase()}, ${GENRE} story`, "cutout");
    } else if (type === "title") {
      if (d.image && d.image.subject) addImg("", d.image.subject, d.image.style === "cutout" ? "cutout" : "card");
      else addImg("", `evocative ${GENRE} book cover mood for "${TITLE}"`, "card");
    } else if (type === "imagefocus") {
      // A confident brief outranks the design's own subject: the brief was built
      // from the book's story bible, so it names the person by the same `look`
      // every time they appear. `d.image.subject` in the default path is three
      // keywords scraped out of this one sentence.
      const subj = (brief && brief.vox && brief.vox.shot)
        || (d.image && d.image.subject) || kicker.toLowerCase() || kws.join(", ");
      const style = d.image && d.image.style === "card" ? "card" : "cutout";
      addImg("", subj, style);
    }
    // `_raw` is the beat's own narration window; used to report airtime
    // alignment at the end of the run and stripped before the config is written.
    return { id, type, fromFrame, durationFrames, props, images, _raw: { start: rawBeats[i].start, end: rawBeats[i].end } };
  });

  // ── SYNC: re-anchor each scene to when its on-screen key word is actually
  // spoken (a beat's emphasis word is usually mid-sentence, so starting the
  // scene at the beat's first word makes the visual lead the audio by seconds).
  const PREROLL = 0.35; // s of lead so the entrance lands right as the word is heard
  const CLEAN = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tokenize = (list) =>
    (list || []).flatMap((e) => String(e).toLowerCase().split(/\s+/)).map((w) => w.replace(/[^a-z0-9]/g, "")).filter((w) => w.length > 2);
  // Search the GLOBAL word stream from the beat's start onward — the on-screen
  // emphasis word ("Buffalo") is often spoken a few seconds later, sometimes past
  // the chunk boundary, so anchoring only inside the beat's own words misses it.
  const firstSpokenAfter = (tokens, fromT, maxT) => {
    if (!tokens.length) return null;
    for (const wd of words) {
      if (wd.t < fromT - 0.05) continue;
      if (wd.t > maxT) break;
      if (tokens.includes(CLEAN(wd.w))) return wd.t;
    }
    return null;
  };
  // ── ANCHOR WINDOW (the airtime fix) ────────────────────────────────────────
  // The search used to run to `rb.end + 9`, i.e. up to nine seconds PAST the
  // beat's own narration, and the scene then ran from there to the next scene's
  // start. Measured on shipped books, only 57.7% (atonement) / 62.7%
  // (the-handmaid's-tale) / 74.6% (the-color-purple) of a scene's airtime sat
  // over the words it was planned for — median lag 2.9s. So roughly a third to a
  // half of every finished film showed beat N's picture under beat N+1's words,
  // no matter how good that picture was.
  //
  // Cutting on the word is still worth having, so the anchor survives — but only
  // when the word arrives EARLY in the beat. If the key word is spoken later, the
  // scene starts with its own narration and the word reveal still lands on time,
  // because the sub-beat event clock below already gives every on-screen word its
  // own anchor frame (props.anchors) relative to the scene start. The whole-scene
  // shift was written before that clock existed and is now redundant past this
  // window.
  const ANCHOR_WINDOW = Number(args["anchor-window"] ?? 1.0); // s after the beat's first word
  const anchorTime = beats.map((beat, i) => {
    const rb = rawBeats[i];
    const primary = tokenize([...(beat.props.emphasis || []), ...(beat.props.items || []), ...(beat.props.compareLabels || [])]);
    const secondary = tokenize(beat.props.keywords);
    const cap = LEGACY_ANCHOR ? rb.end + 9 : Math.min(rb.end, rb.start + ANCHOR_WINDOW);
    const at = firstSpokenAfter(primary, rb.start, cap) ?? firstSpokenAfter(secondary, rb.start, cap);
    return at != null ? at : rb.start;
  });
  // monotonic starts, preroll + global sync offset; title pinned to 0
  let prev = -1;
  beats.forEach((beat, i) => {
    let s = i === 0 ? 0 : anchorTime[i] - PREROLL + OFFSET;
    s = Math.max(s, prev + 0.5); // don't let scenes collide
    beat.fromFrame = Math.round(s * FPS);
    prev = s;
  });
  // each scene runs until the next scene's start (last one to end of narration)
  beats.forEach((beat, i) => {
    const next = i + 1 < beats.length ? beats[i + 1].fromFrame : Math.round((rawBeats[i].end + OFFSET) * FPS);
    beat.durationFrames = Math.max(20, next - beat.fromFrame);
  });

  // COLLAPSE rapid clusters: when several emphasis words are spoken in quick
  // succession, anchoring packs their scenes into ~1s (flashing). Keep only the
  // most visual beat per <MIN_SCENE window; it holds from the cluster's start.
  const MIN_SCENE = Math.round(1.8 * FPS);
  const visualScore = (b) =>
    (b.images.length ? 2 : 0) + (["compare", "list", "stat", "title", "punchline"].includes(b.type) ? 1 : 0);
  const finalBeats = [];
  let collapsed = 0;
  for (const beat of beats) {
    const prev = finalBeats[finalBeats.length - 1];
    if (prev && beat.fromFrame - prev.fromFrame < MIN_SCENE) {
      collapsed++;
      if (visualScore(beat) > visualScore(prev)) {
        beat.fromFrame = prev.fromFrame; // keep the earlier (synced) start
        finalBeats[finalBeats.length - 1] = beat;
      }
      // otherwise drop this beat; prev keeps holding
    } else {
      finalBeats.push(beat);
    }
  }
  finalBeats.forEach((b, i) => {
    const next = i + 1 < finalBeats.length ? finalBeats[i + 1].fromFrame : b.fromFrame + b.durationFrames;
    b.durationFrames = Math.max(FPS, next - b.fromFrame);
  });

  // ── SUB-BEAT EVENT CLOCK ───────────────────────────────────────────────────
  // A beat is ~8s but every archetype used to fire all of its reveals inside the
  // first ~1.3s and then hold a frozen frame for the remaining 7s. That dead air
  // is the gap between this engine and the reference channels (Harris/Vox cut or
  // change something every ~2s).
  //
  // We do NOT cut more — cutting is bounded by the narration. Instead each of a
  // beat's on-screen words gets its OWN anchor: the frame at which that word is
  // actually spoken. The renderer (beatAnchors in src/engines/vox/shared.tsx)
  // reveals word i at anchors[i] and the camera punches there, so one 8s beat
  // becomes 2-4 spread visual events. `null` = word not found in the audio →
  // the renderer falls back to its original fixed cadence for that slot.
  const SUB_LEAD = 0.1;   // s of lead so the reveal lands ON the word, not after
  const SUB_GAP = Math.round(0.4 * FPS); // never stack two events on top of each other
  finalBeats.forEach((b) => {
    const onScreen = (b.props.items && b.props.items.length ? b.props.items
      : b.props.emphasis && b.props.emphasis.length ? b.props.emphasis
      : (b.props.keywords || []).map((k) => String(k).toUpperCase())).slice(0, 4);
    if (!onScreen.length) return;
    const startT = b.fromFrame / FPS - OFFSET;              // back into VTT time
    const endT = (b.fromFrame + b.durationFrames) / FPS - OFFSET;
    let cursor = startT;
    let lastFrame = -SUB_GAP;
    const anchors = onScreen.map((phrase) => {
      const toks = tokenize([phrase]);
      const t = toks.length ? firstSpokenAfter(toks, cursor, endT) : null;
      if (t == null) return null;
      cursor = t + 0.05;                                     // keep them in order
      const f = Math.round((t - SUB_LEAD - startT) * FPS);
      const clamped = Math.max(0, Math.max(f, lastFrame + SUB_GAP));
      lastFrame = clamped;
      return clamped;
    });
    // ── LATE PULSES ────────────────────────────────────────────────────────
    // The word anchors alone cluster at the head of the beat: the beat's own
    // fromFrame is already synced to its primary emphasis word, so word #2 is
    // usually spoken right behind word #1 and the back 5-7s stays dead.
    // So we PAD the clock with extra beats-of-attention on content words spoken
    // later in the beat. Archetypes only read anchors[0..n-1] for their word
    // reveals, so these extras are consumed by the Scene camera (a punch-in)
    // and by any trailing element (a marker underline) — which is exactly the
    // late visual event the reference channels put there.
    const PULSE_GAP = 2.2; // s — a beat of attention roughly every 2s, Harris-rate
    let pulseFrom = (anchors.filter((a) => a != null).slice(-1)[0] ?? 0) / FPS + startT;
    const pulses = [];
    for (const wd of words) {
      if (wd.t <= pulseFrom + PULSE_GAP) continue;
      if (wd.t > endT - 0.9) break;                    // nothing right before the cut
      if (CLEAN(wd.w).length < 4) continue;            // skip filler; land on a real word
      pulses.push(Math.round((wd.t - SUB_LEAD - startT) * FPS));
      pulseFrom = wd.t;
      if (pulses.length >= 3) break;                   // 4 events max per beat
    }
    const full = [...anchors, ...pulses];
    // all-null adds nothing; keep the config clean
    if (full.some((a) => a != null)) b.props.anchors = full;
  });
  // captions keep word-accurate timing; only shifted by the global sync offset
  const offFrames = Math.round(OFFSET * FPS);
  if (offFrames) {
    captions.forEach((c) => {
      c.startFrame += offFrames;
      c.endFrame += offFrames;
      c.words.forEach((w) => { w.s += offFrames; w.e += offFrames; });
    });
  }

  const totalFrames = finalBeats.length ? finalBeats[finalBeats.length - 1].fromFrame + finalBeats[finalBeats.length - 1].durationFrames : 0;
  const config = {
    meta: { title: TITLE, author: AUTHOR, genre: GENRE, slug: SLUG, audio: AUDIO, fps: FPS, width: 1920, height: 1080, totalFrames, until: UNTIL === Infinity ? null : UNTIL, planner: USE_LLM ? "llm" : "heuristic", ...(SFX ? { sfx: true } : {}), generatedAt: new Date().toISOString() },
    captions,
    beats: finalBeats,
  };
  // `_raw` is planner bookkeeping (the beat's own narration window) — it must
  // not reach the config the renderer validates.
  fs.writeFileSync(OUT, JSON.stringify(config, (k, v) => (k === "_raw" ? undefined : v), 2));

  const counts = finalBeats.reduce((a, b) => ((a[b.type] = (a[b.type] || 0) + 1), a), {});
  const imgCount = finalBeats.reduce((a, b) => a + b.images.length, 0);
  const cutCount = finalBeats.reduce((a, b) => a + b.images.filter((im) => im.cut).length, 0);
  const minDur = Math.min(...finalBeats.map((b) => b.durationFrames)) / FPS;
  console.log(`\n✓ ${OUT}`);
  console.log(`  beats: ${finalBeats.length} (collapsed ${collapsed} rapid)  captions: ${captions.length}  duration: ${(totalFrames / FPS).toFixed(1)}s`);
  console.log(`  archetypes:`, counts);
  console.log(`  images: ${imgCount} (cutouts: ${cutCount})  shortest scene: ${minDur.toFixed(1)}s`);
  if (BRIEFS) {
    console.log(`  briefs matched: ${briefHits}/${briefHits + briefMisses}` +
      (briefMisses ? `  ⚠ ${briefMisses} beat(s) had no brief — re-derive them after a segmentation change` : ""));
  }
  const ug = Object.entries(ungrounded);
  if (ug.length) {
    console.log(`  declined (no real data in the narration, so no invented graphic): ` +
      ug.map(([t, n]) => `${t} ×${n}`).join(", "));
  }
  // The airtime number this plan actually achieved — the metric Phase 1b of
  // VISUAL_RELEVANCE_PLAN.md governs. Anything under ~90% means scenes are
  // playing over the wrong words regardless of how good the art direction is.
  {
    let own = 0, tot = 0;
    finalBeats.forEach((b, i) => {
      const rb = b._raw;
      if (!rb) return;
      const nS = Math.round((rb.start + OFFSET) * FPS), nE = Math.round((rb.end + OFFSET) * FPS);
      const bS = b.fromFrame, bE = b.fromFrame + b.durationFrames;
      own += Math.max(0, Math.min(nE, bE) - Math.max(nS, bS));
      tot += bE - bS;
    });
    if (tot) console.log(`  airtime over own narration: ${(own / tot * 100).toFixed(1)}%  (target ≥ 90%)`);
  }
})();
