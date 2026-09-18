#!/usr/bin/env node
/**
 * plan-bible.js — read the WHOLE book once, before any scene is decided.
 *
 * THE GAP THIS CLOSES. Every visual decision in both engines is a regex over one
 * ~6.5-second chunk of narration, in isolation. Nothing in the pipeline has ever
 * read the book. So the planner cannot know that this is 1930s England and there
 * are no phones in it, that "Briony" is a thirteen-year-old girl and must look
 * like the same girl in beat 12 and beat 204, that the vase is this story's
 * recurring object, or that `founded` in a novel is not a startup. The measured
 * consequence is in RELEVANCE_BASELINE.md: 6.6% of the catalogue shows anything
 * tied to its own narration.
 *
 * `books/<slug>/story-bible.json` is that missing layer, and it is the ONE place
 * a book's world is described. It supersedes `creative-bible.json`, whose
 * universe heuristic is the problem in miniature — it classified Siddhartha as
 * "Investigative Journalism & Modern History" with 0.95 confidence and handed
 * the Vox planner `docType: declassified` for a Buddhist novel.
 *
 * CLAUDE-FIRST, same handoff shape as plan-vox --emit-beats / --designs:
 *
 *   node scripts/plan-bible.js --slug=<slug> --emit=<file>   # draft + evidence, then exit
 *   # Claude rewrites the draft against the evidence (the `look` fields above all
 *   # — a costume and a camera brief need understanding, not frequency counts)
 *   node scripts/plan-bible.js --slug=<slug> --bible=<file>  # validate -> story-bible.json
 *
 *   node scripts/plan-bible.js --slug=<slug>                 # heuristic only, no handoff
 *
 * NARRATION SOURCE. `--vtt=<file>` when the raw VTT is still on disk; otherwise
 * the narration is read out of the already-planned `books/<slug>/config.*.json`
 * (`captions[]` is the full word-level transcript), so this works on all 49
 * planned books today without re-downloading anything.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { parseWords } = require("./lib/vtt.js");
const { CONCEPT_LEXICON, CONCEPT_SET } = require("./lib/antidote-director.js");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
const EMIT = args.emit || null;
const BIBLE_IN = args.bible || null;
const DRY = !!args.dry;
if (!SLUG) {
  console.error("Usage: node scripts/plan-bible.js --slug=<slug> [--vtt=<file>] [--emit=<file> | --bible=<file>]");
  process.exit(1);
}
const OUT = args.out || path.join(ROOT, "books", SLUG, "story-bible.json");

/**
 * The Antidote `variant` vocabulary (src/engines/antidote/schema.ts).
 *
 * Worth stating in full, because the field names are not the obvious ones and a
 * wrong key is SILENT — it merges in, the schema default wins, and a shaved-head
 * monk keeps the auto-cast's muttonchops. `hair` is a COLOR; the style is
 * `hairStyle`. `build` is an enum, not a number — the numbers are `height` and
 * `headScale`. The garment field is `outfit`.
 */
const VARIANT_ENUMS = {
  hairStyle: ["short", "buzz", "bald", "long", "bun", "afro", "curly", "ponytail", "braids", "pigtails", "messy", "receding"],
  beard: ["none", "stubble", "full", "mustache", "goatee", "muttonchops"],
  build: ["slight", "average", "heavy"],
  outfit: ["suit", "casual", "uniform", "robe", "coat", "dress", "apron", "armor", "overalls", "vest", "cloak", "hoodie", "rags"],
  headwear: ["none", "cap", "fedora", "beanie", "hood", "headscarf", "bonnet", "crown", "helmet", "topHat", "beret", "veil", "cowboy"],
  accessory: ["none", "tie", "bowtie", "scarf", "necklace", "badge", "satchel", "suspenders", "collar"],
  age: ["child", "young", "adult", "old"],
  gender: ["m", "f"],
  expression: ["neutral", "happy", "sad", "surprised", "worried"],
};
const VARIANT_NUMBERS = new Set(["height", "headScale"]);
const VARIANT_COLORS = new Set(["skin", "hair", "suit", "shirt", "trim"]);
const VARIANT_KEYS = new Set([...Object.keys(VARIANT_ENUMS), ...VARIANT_NUMBERS, ...VARIANT_COLORS, "glasses", "overlay"]);

/** Backdrop sets the Antidote engine can actually draw (Backdrop.tsx SETS). */
const VALID_SETS = new Set(["horizon", "office", "street", "room", "stage", "sky", "abstract",
  "kitchen", "bedroom", "classroom", "library", "cafe", "hospital", "court", "forest", "shore",
  "highway", "workstation", "startupGarage", "serverRoom", "pitchStage"]);

// ── narration ───────────────────────────────────────────────────────────────

/** the whole narration as one string plus a sentence list with frame positions */
function loadNarration() {
  if (args.vtt) {
    const words = parseWords(fs.readFileSync(args.vtt, "utf8"));
    if (!words.length) throw new Error(`no words parsed from ${args.vtt}`);
    return { words: words.map((w) => ({ w: w.w, s: Math.round(w.t * 30) })), fps: 30, source: args.vtt };
  }
  for (const f of ["config.vox.json", "config.antidote.json"]) {
    const p = path.join(ROOT, "books", SLUG, f);
    if (!fs.existsSync(p)) continue;
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    const words = [];
    for (const cap of cfg.captions || []) for (const w of cap.words || []) words.push({ w: String(w.w || ""), s: w.s });
    if (words.length) return { words, fps: (cfg.meta && cfg.meta.fps) || 30, source: f, cfg };
  }
  throw new Error(`no narration: pass --vtt=, or plan the book first so books/${SLUG}/config.*.json exists`);
}

/** split the word stream into sentences, each keeping the frame it starts at */
function sentences(words) {
  const out = [];
  let cur = [], start = words.length ? words[0].s : 0;
  for (const w of words) {
    if (!cur.length) start = w.s;
    cur.push(w.w);
    if (/[.!?]$/.test(w.w) && cur.length >= 3) { out.push({ text: cur.join(" "), s: start }); cur = []; }
  }
  if (cur.length) out.push({ text: cur.join(" "), s: start });
  return out;
}

// ── heuristic draft ─────────────────────────────────────────────────────────

/**
 * A verb that only a person does. A capitalised word followed by one of these is
 * a character, not a place — the same test plan-vox uses, kept here so the two
 * agree about who the book's people are.
 */
const PERSON_VERB = /^(says?|said|tells?|told|asks?|asked|thinks?|thought|feels?|felt|knows?|knew|wants?|wanted|goes?|went|comes?|came|takes?|took|gives?|gave|sees?|saw|does?|did|has|had|is|was|were|will|would|can|could|realizes?|realized|decides?|decided|writes?|wrote|walks?|walked|looks?|looked|turns?|turned|begins?|began|starts?|started|finds?|found|leaves?|left|loves?|loved|hates?|hated|dies?|died)$/i;

const NOT_A_NAME = new Set(["I", "He", "She", "They", "We", "You", "It", "And", "But", "So", "Then",
  "The", "A", "An", "This", "That", "There", "Here", "Now", "What", "When", "Where", "Why", "How",
  "Who", "Because", "If", "Just", "Like", "Not", "No", "Yes", "Yeah", "Okay", "OK", "Right", "Well",
  "Oh", "God", "Mom", "Dad", "Mr", "Mrs", "Dr", "January", "February", "March", "April", "May",
  "June", "July", "August", "September", "October", "November", "December", "Monday", "Tuesday",
  "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Christmas", "Thanksgiving"]);

/** characters, ranked — a name is a pattern only when it recurs */
function findCast(sents) {
  const hits = Object.create(null);
  for (const { text, s } of sents) {
    const toks = text.split(/\s+/);
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i].replace(/[^A-Za-z']/g, "");
      if (!/^[A-Z][a-z]{2,}$/.test(w) || NOT_A_NAME.has(w)) continue;
      const next = (toks[i + 1] || "").replace(/[^A-Za-z']/g, "");
      const isSubject = PERSON_VERB.test(next);
      const h = hits[w] || (hits[w] = { name: w, count: 0, subject: 0, first: s, last: s, quotes: [] });
      h.count++; if (isSubject) h.subject++;
      h.last = s;
      if (h.quotes.length < 3 && isSubject) h.quotes.push(text.slice(0, 160));
    }
  }
  return Object.values(hits)
    .filter((h) => h.subject >= 2)               // 1 is noise, 2 is a pattern
    .sort((a, b) => b.subject - a.subject || b.count - a.count)
    .slice(0, 8);
}

/** concrete locations the narration actually names, with the set they map to */
const PLACE_WORDS = [
  // Classical Antiquity & Philosophical Sets
  [/\b(agora|marketplace|acropolis|assembly|pnyx|polis|square)\b/i, "agora"],
  [/\b(colonnade|temple|portico|columns?|stoa|atrium|pediment|sanctuary)\b/i, "colonnade"],
  [/\b(cave|cavern|underground|stalactite|shadows? on the wall|chained|darkness)\b/i, "cave"],
  [/\b(ship|galley|trireme|deck|mast|sail|rudder|helm|pilot|steersman|sea|ocean|waves)\b/i, "shipDeck"],
  [/\b(manuscript|scroll|parchment|papyrus|text|dialogue|treatise|writing|codex)\b/i, "manuscript"],
  // Modern & General Sets
  [/\b(kitchen|dinner table|the stove)\b/i, "kitchen"],
  [/\b(bedroom|her room|his room)\b/i, "bedroom"],
  [/\b(classroom|the school\b|schoolyard|lecture hall)\b/i, "classroom"],
  [/\b(library|the stacks|reading room)\b/i, "library"],
  [/\b(cafe|coffee shop|diner|restaurant)\b/i, "cafe"],
  [/\b(hospital|the ward|emergency room|clinic)\b/i, "hospital"],
  [/\b(courtroom|the court\b|courthouse|the witness stand)\b/i, "court"],
  [/\b(forest|the woods\b)\b/i, "forest"],
  [/\b(the shore\b|the beach\b|the river\b|the harbor)\b/i, "shore"],
  [/\b(highway|the freeway|the open road)\b/i, "highway"],
  [/\b(the office\b|his office|her office|the boardroom)\b/i, "office"],
  [/\b(the street\b|the sidewalk|downtown|the alley)\b/i, "street"],
];

function findPlaces(sents, forbidSets = new Set()) {
  const hits = Object.create(null);
  for (const { text, s } of sents) {
    for (const [re, set] of PLACE_WORDS) {
      if (forbidSets.has(set)) continue;
      if (!re.test(text)) continue;
      const h = hits[set] || (hits[set] = { set, count: 0, first: s, quotes: [] });
      h.count++;
      if (h.quotes.length < 2) h.quotes.push(text.slice(0, 150));
    }
  }
  return Object.values(hits).sort((a, b) => b.count - a.count);
}

/** the book's recurring subjects, by the engine's own icon vocabulary */
function findObjects(sents) {
  const hits = Object.create(null);
  for (const { text, s } of sents) {
    for (const [concept, re] of CONCEPT_LEXICON) {
      if (!re.test(text)) continue;
      const h = hits[concept] || (hits[concept] = { concept, count: 0, at: [], quote: text.slice(0, 140) });
      h.count++; if (h.at.length < 12) h.at.push(s);
    }
  }
  return Object.values(hits).filter((h) => h.count >= 3).sort((a, b) => b.count - a.count).slice(0, 12);
}

/**
 * When is this set? Years the narration states win; otherwise period language.
 * The point of `era` is the FORBID list — an icon the period cannot contain is
 * the loudest possible anachronism, and today nothing prevents one.
 */
const PERIOD_HINTS = [
  [/\b(temple|the gods|ancient|antiquity|the emperor|chariot|plato|socrates|aristotle|athens|sparta|kallipolis)\b/i, { era: "classical antiquity", from: -375 }],
  [/\b(carriage|horseback|telegram|the empire|steamship|gaslight)\b/i, { era: "19th century or earlier", from: 1800 }],
  [/\b(television|the war\b|world war|nineteen (forties|fifties|sixties))\b/i, { era: "mid-20th century", from: 1930 }],
  [/\b(smartphone|iphone|internet|online|email|laptop|website|social media|app\b)\b/i, { era: "contemporary", from: 1995 }],
];
const MODERN_ONLY = ["phone", "codeWindow", "laptopMockup", "rocketLaunch", "funnelMetrics",
  "dollarExchange", "subway", "car", "alarmClock", "medical", "coffee"];
const MODERN_FORBIDDEN_SETS = ["classroom", "office", "workstation", "startupGarage", "serverRoom",
  "pitchStage", "kitchen", "bedroom", "hospital"];

function loadBookMeta(slug) {
  const dir = path.join(ROOT, "books", slug);
  let book = null, creative = null;
  try {
    const p = path.join(dir, "book.json");
    if (fs.existsSync(p)) book = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  try {
    const p = path.join(dir, "creative-bible.json");
    if (fs.existsSync(p)) creative = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return { book, creative };
}

function findEra(allText, bookMeta = {}) {
  let era = null, from = null;

  // 1. Check metadata overrides
  const universeKey = bookMeta.creative?.world?.universeKey || "";
  const genre = String(bookMeta.book?.genre || "").toLowerCase();
  const author = String(bookMeta.book?.author || "").toLowerCase();
  const isAncientMeta = universeKey === "ancient_philosophy" ||
    genre === "philosophy" ||
    /plato|socrates|aristotle|marcus aurelius|seneca|epictetus|homer|cicero/.test(author);

  // 2. Check explicit BC / BCE years
  const bcMatch = allText.match(/\b(\d{1,4})\s*(?:bc|bce)\b/i);
  if (bcMatch) {
    from = -parseInt(bcMatch[1], 10);
    era = `${bcMatch[1]} BC`;
  }

  // 3. Check 4-digit AD years if no BC year
  if (from == null) {
    const years = (allText.match(/\b(1[0-9]\d\d|20\d\d)\b/g) || []).map(Number).filter((y) => y > 1000 && y < 2100);
    if (years.length && !isAncientMeta) {
      years.sort((a, b) => a - b);
      from = years[Math.floor(years.length / 2)];
      era = `${years[0]}–${years[years.length - 1]}`;
    }
  }

  // 4. Period hints check (with ancient check taking precedence for ancient authors/meta)
  if (!era) {
    if (isAncientMeta) {
      era = "classical antiquity";
      from = from != null ? from : -375;
    } else {
      const hit = PERIOD_HINTS.find(([re]) => re.test(allText));
      if (hit) { era = hit[1].era; from = hit[1].from; }
    }
  }

  let forbid = [];
  if (from != null && from < 500) {
    forbid = [...MODERN_ONLY, ...MODERN_FORBIDDEN_SETS];
  } else if (from != null && from < 1980) {
    forbid = MODERN_ONLY.slice();
  }

  return { era: era || "unspecified", approxYear: from, forbid };
}

/** the argument/act spine — from the planned chapters when we have them */
function findSpine(cfg, sents, fps) {
  if (cfg && Array.isArray(cfg.chapters) && cfg.chapters.length) {
    return cfg.chapters.map((c) => ({
      act: c.title || c.label || "",
      fromFrame: c.fromFrame ?? c.startFrame ?? 0,
      claim: "",
    }));
  }
  const n = Math.min(5, Math.max(3, Math.round(sents.length / 40)));
  const per = Math.ceil(sents.length / n);
  const names = ["setup", "development", "turn", "consequence", "close"];
  return Array.from({ length: n }, (_, i) => ({
    act: names[i] || `act ${i + 1}`,
    fromFrame: sents[i * per] ? sents[i * per].s : 0,
    claim: "",
  }));
}

function draft(nar) {
  const sents = sentences(nar.words);
  const allText = sents.map((s) => s.text).join(" ");
  const bookMeta = loadBookMeta(SLUG);
  const world = findEra(allText, bookMeta);
  const cast = findCast(sents);
  const places = findPlaces(sents, new Set(world.forbid));
  const objects = findObjects(sents);

  return {
    bible: {
      slug: SLUG,
      world: {
        era: world.era,
        approxYear: world.approxYear,
        setting: "",                  // Claude: one line — where and among whom this happens
        register: "",                 // Claude: literary | reportage | self-help | mythic | ...
        forbid: world.forbid,         // icons the period cannot contain
      },
      cast: Object.fromEntries(cast.map((c) => [c.name.toLowerCase(), {
        name: c.name,
        role: "",                     // protagonist | foil | mentor | narrator | extra
        look: "",                     // Claude: one Flux-ready sentence. This is what makes the
                                      // same character the same person in beat 12 and beat 204.
        variant: {},                  // Claude: Antidote costume hints (garment/hair/height/...)
        mentions: c.subject,
      }])),
      places: Object.fromEntries(places.map((p) => [p.set, {
        set: p.set,                   // must be a real Backdrop set
        look: "",                     // Claude: one line of what this place looks like here
        mentions: p.count,
      }])),
      objects: objects.map((o) => ({ concept: o.concept, mentions: o.count, why: "" })),
      spine: findSpine(nar.cfg, sents, nar.fps),
    },
    evidence: {
      sentences: sents.length,
      cast: cast.map((c) => ({ name: c.name, asSubject: c.subject, total: c.count, samples: c.quotes })),
      places: places.map((p) => ({ set: p.set, mentions: p.count, samples: p.quotes })),
      objects: objects.map((o) => ({ concept: o.concept, mentions: o.count, sample: o.quote })),
      openingLines: sents.slice(0, 6).map((s) => s.text),
      closingLines: sents.slice(-4).map((s) => s.text),
    },
  };
}

// ── validation ──────────────────────────────────────────────────────────────

function validate(b) {
  const errs = [], warns = [];
  if (!b || typeof b !== "object") errs.push("not an object");
  if (!b.world) errs.push("missing world");
  else {
    if (!b.world.era) warns.push("world.era is empty — no anachronism guard is possible");
    for (const f of b.world.forbid || []) if (typeof f !== "string") errs.push(`world.forbid: ${f} is not a string`);
  }
  for (const [k, c] of Object.entries(b.cast || {})) {
    if (!/^[a-z0-9-]+$/.test(k)) errs.push(`cast key "${k}" must be a lowercase slug`);
    if (!c.look) warns.push(`cast.${k}.look is empty — this character will look different every time`);
    // A wrong variant key is silent: it merges in, the schema default wins, and
    // the auto-cast's look survives underneath. Catch it here instead.
    for (const [vk, vv] of Object.entries(c.variant || {})) {
      if (!VARIANT_KEYS.has(vk)) {
        errs.push(`cast.${k}.variant.${vk} is not a variant field — did you mean ` +
          `${vk === "garment" ? "outfit" : vk === "hair" ? "hairStyle (hair is a COLOR)" : [...VARIANT_KEYS].slice(0, 6).join("/")}?`);
        continue;
      }
      if (VARIANT_ENUMS[vk] && !VARIANT_ENUMS[vk].includes(vv)) {
        errs.push(`cast.${k}.variant.${vk} = ${JSON.stringify(vv)} — must be one of ${VARIANT_ENUMS[vk].join(" ")}`);
      }
      if (VARIANT_NUMBERS.has(vk) && typeof vv !== "number") {
        errs.push(`cast.${k}.variant.${vk} must be a number (0.72 child → 1.12 tall adult)`);
      }
      if (VARIANT_COLORS.has(vk) && !/^#|^rgb/.test(String(vv))) {
        errs.push(`cast.${k}.variant.${vk} is a COLOR (hex or rgb()), got ${JSON.stringify(vv)}` +
          (vk === "hair" ? " — the hair STYLE field is `hairStyle`" : ""));
      }
    }
  }
  for (const [k, p] of Object.entries(b.places || {})) {
    if (!VALID_SETS.has(p.set)) errs.push(`places.${k}.set "${p.set}" is not a Backdrop set`);
  }
  const known = new Set(CONCEPT_LEXICON.map(([c]) => c));
  for (const o of b.objects || []) {
    if (o.concept && !known.has(o.concept)) warns.push(`objects: "${o.concept}" has no icon yet (Phase 4 draws it)`);
  }
  return { errs, warns };
}

// ── coverage ────────────────────────────────────────────────────────────────

/**
 * Can this bible actually supply a subject for the film? For every scene in the
 * planned config, does the narration spoken during that scene name one of the
 * bible's people or one of its objects?
 *
 * This is the headroom number. Today's baseline is 6.6% of scenes showing
 * anything tied to the narration (RELEVANCE_BASELINE.md); coverage says how far
 * Phase 3 could push that with this bible in hand. A low number means the bible
 * is too thin to drive decisions, and more authoring is needed before any
 * director change is worth making.
 */
function coverage(bible) {
  let cfg = null, file = null;
  for (const f of ["config.vox.json", "config.antidote.json"]) {
    const p = path.join(ROOT, "books", SLUG, f);
    if (fs.existsSync(p)) { cfg = JSON.parse(fs.readFileSync(p, "utf8")); file = f; break; }
  }
  if (!cfg) { console.error(`No planned config for ${SLUG} — coverage needs one.`); process.exit(1); }
  const W = [];
  for (const cap of cfg.captions || []) for (const w of cap.words || []) W.push(w);
  const units = cfg.beats || cfg.scenes || [];

  // a token SET, not a regex: the names come from authored data and would have
  // to be escaped, and one missed escape silently reports 0%
  const tokens = (s) => String(s).toLowerCase().split(/[^a-z0-9']+/i).filter(Boolean);
  const nameTokens = new Set();
  for (const c of Object.values(bible.cast || {})) {
    tokens(c.name).forEach((t) => { if (t.length > 2 && !["mr", "mrs", "dr"].includes(t)) nameTokens.add(t); });
    (c.aliases || []).forEach((a) => tokens(a).forEach((t) => nameTokens.add(t)));
  }
  const objRes = (bible.objects || []).map((o) => CONCEPT_RE.get(o.concept)).filter(Boolean);

  let cast = 0, obj = 0, any = 0;
  for (const u of units) {
    const from = u.fromFrame || 0, to = from + (u.durationFrames || 0);
    const words = W.filter((w) => w.e > from && w.s < to).map((w) => w.w);
    const hasCast = words.some((w) => nameTokens.has(tokens(w)[0]));
    const hasObj = objRes.some((r) => r.test(words.join(" ")));
    if (hasCast) cast++;
    if (hasObj) obj++;
    if (hasCast || hasObj) any++;
  }
  const p = (n) => ((n / (units.length || 1)) * 100).toFixed(1) + "%";
  console.log(`\n══ ${SLUG} — bible coverage over ${units.length} planned scenes (${file})`);
  console.log(`   names a cast member: ${p(cast)}    names a bible object: ${p(obj)}    EITHER: ${p(any)}`);
  console.log(`   (today's subject-bearing baseline is 6.6% catalogue-wide — this is the headroom)`);
  return (any / (units.length || 1)) * 100;
}
const CONCEPT_RE = new Map(CONCEPT_LEXICON);

// ── main ────────────────────────────────────────────────────────────────────

(function main() {
  const bookDir = path.join(ROOT, "books", SLUG);
  if (!fs.existsSync(bookDir)) fs.mkdirSync(bookDir, { recursive: true });

  if (args.coverage) {
    const p = path.join(bookDir, "story-bible.json");
    if (!fs.existsSync(p)) { console.error(`No ${path.relative(ROOT, p)} — write one first.`); process.exit(1); }
    coverage(JSON.parse(fs.readFileSync(p, "utf8")));
    return;
  }

  if (BIBLE_IN) {
    const loaded = JSON.parse(fs.readFileSync(BIBLE_IN, "utf8"));
    const b = loaded.bible || loaded;
    const { errs, warns } = validate(b);
    warns.forEach((w) => console.warn(`  ⚠ ${w}`));
    if (errs.length) { errs.forEach((e) => console.error(`  ✗ ${e}`)); process.exit(1); }
    b.slug = SLUG;
    b.authored = true;
    if (!DRY) fs.writeFileSync(OUT, JSON.stringify(b, null, 2) + "\n");
    const nCast = Object.keys(b.cast || {}).length, withLook = Object.values(b.cast || {}).filter((c) => c.look).length;
    console.log(`✓ ${path.relative(ROOT, OUT)} — authored: ${nCast} cast (${withLook} with a look), ` +
      `${Object.keys(b.places || {}).length} places, ${(b.objects || []).length} objects, era "${(b.world || {}).era}"`);
    return;
  }

  const nar = loadNarration();
  const { bible, evidence } = draft(nar);
  console.log(`Read ${nar.words.length} words from ${nar.source} — ${evidence.sentences} sentences`);

  if (EMIT) {
    fs.writeFileSync(EMIT, JSON.stringify({
      slug: SLUG,
      instructions: [
        "Rewrite `bible` against `evidence`. The counts are a starting point, not the answer.",
        "ENGLISH ONLY (US market invariant).",
        "cast: keep only real characters, key them by a lowercase slug, and give every one a `look`:",
        "  ONE Flux-ready sentence naming age, build, hair, clothing and period.",
        "  This is the field that makes a character the same person in beat 12 and beat 204.",
        "  `variant` carries Antidote costume hints (garment, headwear, hair, height, build, headScale).",
        "places: `set` MUST be one of " + [...VALID_SETS].join(" ") + ".",
        "objects: the book's OWN recurring subjects. `concept` may name an icon we do not have yet;",
        "  say so in `why` and Phase 4 will draw it.",
        "world.forbid: icons this period cannot contain. An anachronism is the loudest mistake we can make.",
        "spine: one entry per act; `claim` is the argument that act makes, in one sentence.",
        "Then: node scripts/plan-bible.js --slug=" + SLUG + " --bible=<this file>",
      ],
      validSets: [...VALID_SETS],
      knownConcepts: CONCEPT_LEXICON.map(([c]) => c),
      bible, evidence,
    }, null, 2) + "\n");
    console.log(`\n✍  ${EMIT}`);
    console.log(`   draft: ${Object.keys(bible.cast).length} cast, ${Object.keys(bible.places).length} places, ` +
      `${bible.objects.length} objects, era "${bible.world.era}"`);
    console.log(`   Claude: rewrite it, then → node scripts/plan-bible.js --slug=${SLUG} --bible=${EMIT}`);
    return;
  }

  bible.authored = false;
  if (!DRY) fs.writeFileSync(OUT, JSON.stringify(bible, null, 2) + "\n");
  console.log(`✓ ${path.relative(ROOT, OUT)} (heuristic draft — no "look" fields; run --emit for the authored one)`);
  console.log(`   cast: ${Object.keys(bible.cast).join(", ") || "(none found)"}`);
  console.log(`   places: ${Object.keys(bible.places).join(", ") || "(none named)"}`);
  console.log(`   objects: ${bible.objects.map((o) => o.concept + "×" + o.mentions).join(", ") || "(none recurring)"}`);
  console.log(`   era: ${bible.world.era}${bible.world.forbid.length ? `  forbid: ${bible.world.forbid.join(" ")}` : ""}`);
})();
