#!/usr/bin/env node
/**
 * plan-briefs.js — give every beat a SUBJECT.
 *
 * THE GAP. Neither engine's schema has a field saying what a beat is ABOUT.
 * The renderers consume `emphasis` (top values across the corpus: IT'S,
 * BECAUSE, YEAH, RIGHT) and `keywords` (completely, incredibly, literally), so
 * no component can draw the thing being discussed even in principle. That is
 * root cause R2 in VISUAL_RELEVANCE_PLAN.md, and it is why the catalogue scores
 * 6.6% subject-bearing.
 *
 * `books/<slug>/beat-briefs.json` is that field. One record per beat:
 *
 *   { fp, i, from, subject, entities[], concept, place, confidence,
 *     vox: { shot }, antidote: { concept, set, cast[] } }
 *
 * KEYED BY NARRATION, NOT BY INDEX. `fp` fingerprints the beat's own words.
 * Every authored artifact in this repo so far -- plan-vox `--designs`,
 * plan-antidote `--callouts`/`--cast` -- is read back as `ARR[i]`, with no
 * length check and no content check. One re-plan with a different `--scene-secs`
 * silently re-attaches every authored decision to the wrong sentence and nobody
 * is told. Briefs are matched by fingerprint and the miss count is reported.
 *
 * GROUNDED IN THE BIBLE. The subject comes from `books/<slug>/story-bible.json`:
 * which of the book's real people are named in this beat's own spoken window,
 * which of its recurring objects fire, where it happens. That is what makes a
 * `look` reusable -- the same character described the same way in beat 12 and
 * beat 204 -- and what makes the era `forbid` list enforceable.
 *
 * CONFIDENCE IS THE SAFETY RAIL. A weak match and a certain one are
 * indistinguishable in the current planners (`detectConcept` returns the first
 * regex hit with no score), so a director cannot choose to stay neutral. Every
 * brief carries one, and a consumer is expected to fall back rather than draw a
 * confident wrong picture.
 *
 * USAGE
 *   node scripts/plan-briefs.js --slug=<slug>                  # derive + write
 *   node scripts/plan-briefs.js --slug=<slug> --emit=<file>    # draft for Claude
 *   node scripts/plan-briefs.js --slug=<slug> --briefs=<file>  # consume Claude's
 *   node scripts/plan-briefs.js --slug=<slug> --config=<path>  # audit a scratch plan
 *
 * Then re-plan with them:
 *   node scripts/plan-vox.js      ... --briefs=books/<slug>/beat-briefs.json
 *   node scripts/plan-antidote.js ... --briefs=books/<slug>/beat-briefs.json
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { CONCEPT_LEXICON, CONCEPT_SET } = require("./lib/antidote-director.js");
const { compileNarrativeBeat } = require("./lib/narrative-compiler.js");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
if (!SLUG) {
  console.error("Usage: node scripts/plan-briefs.js --slug=<slug> [--config=<path>] [--emit=<file> | --briefs=<file>]");
  process.exit(1);
}
const OUT = args.out || path.join(ROOT, "books", SLUG, "beat-briefs.json");
const DRY = !!args.dry;

const CONCEPT_RE = new Map(CONCEPT_LEXICON);

/**
 * FNV-1a over the beat's normalised words. Punctuation and case move between
 * re-plans; the words do not.
 */
function fingerprint(text) {
  const norm = String(text).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  let h = 2166136261;
  for (let i = 0; i < norm.length; i++) { h ^= norm.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const PLACE_WORDS = [
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

function loadConfig() {
  if (args.config) return { cfg: JSON.parse(fs.readFileSync(args.config, "utf8")), file: args.config };
  for (const f of ["config.vox.json", "config.antidote.json"]) {
    const p = path.join(ROOT, "books", SLUG, f);
    if (fs.existsSync(p)) return { cfg: JSON.parse(fs.readFileSync(p, "utf8")), file: f };
  }
  throw new Error(`no planned config for ${SLUG} — plan the book once first, then derive briefs from it`);
}

function loadBible() {
  const p = path.join(ROOT, "books", SLUG, "story-bible.json");
  if (!fs.existsSync(p)) {
    console.warn(`  ⚠ no story-bible.json — briefs will be ungrounded. Run: node scripts/plan-bible.js --slug=${SLUG}`);
    return { world: {}, cast: {}, places: {}, objects: [] };
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** token set per cast member, so a name never needs escaping into a regex */
function castIndex(bible) {
  const idx = [];
  for (const [key, c] of Object.entries(bible.cast || {})) {
    const toks = new Set();
    for (const src of [c.name, ...(c.aliases || [])]) {
      String(src).toLowerCase().split(/[^a-z0-9']+/).forEach((t) => {
        if (t.length > 2 && !["mr", "mrs", "dr", "the"].includes(t)) toks.add(t);
      });
    }
    idx.push({ key, entry: c, tokens: toks });
  }
  return idx;
}

/**
 * The Flux shot brief. This is the field that replaces
 * `keywords(text, 3).join(", ")` -- the three-word bag that is 93% of every
 * prompt this project has ever sent. A shot brief names WHO, doing WHAT, WHERE,
 * and WHEN, and it reuses the bible's `look` verbatim so the same character is
 * the same person in every frame.
 */
function shotBrief({ people, place, concept, bible, said }) {
  const bits = [];
  if (people.length) {
    bits.push(people.slice(0, 2).map((p) => p.entry.look || p.entry.name).join(" and "));
  } else if (concept) {
    bits.push(concept.replace(/([A-Z])/g, " $1").toLowerCase());
  }
  const action = actionPhrase(said);
  if (action) bits.push(action);
  if (place && bible.places && bible.places[place] && bible.places[place].look) bits.push(bible.places[place].look);
  else if (place) bits.push(place);
  let out = bits.filter(Boolean).join(", ");
  // The period, ONCE. A character's `look` usually ends with its own year, and
  // appending the bible's prose era on top produced
  // "... dark hair cut straight at the jaw, 1935, 1935, then 1940 and a 1999 coda".
  // Prefer a bare year; skip it entirely when the sentence already carries one.
  const year = (bible.world && bible.world.approxYear) || null;
  if (year && year < 2005 && !/\b(1[0-9]\d\d|20\d\d)\b/.test(out)) out += `, ${year}`;
  return out;
}

/**
 * A verb phrase the sentence actually contains, so the shot shows an action
 * rather than a person standing still.
 *
 * The greedy version of this produced "looking at basically a" — a fragment
 * that ends mid-noun-phrase and reads to Flux as noise. A phrase is only kept
 * when it terminates on a real word.
 */
const ACTION_RE = /\b(walk(?:s|ed|ing)?|run(?:s|ning)?|sit(?:s|ting)?|stand(?:s|ing)?|wait(?:s|ed|ing)?|writ(?:e|es|ing|ten)|read(?:s|ing)?|watch(?:es|ed|ing)?|hold(?:s|ing)?|carr(?:y|ies|ied|ying)|reach(?:es|ed|ing)?|leav(?:e|es|ing)|arriv(?:e|es|ed|ing)|fall(?:s|ing)?|climb(?:s|ed|ing)?|kneel(?:s|ing)?|weep(?:s|ing)?|shout(?:s|ed|ing)?|whisper(?:s|ed|ing)?)\b[^,.;]{0,40}/i;
const DANGLING = /\b(a|an|the|of|to|in|on|at|and|or|is|was|basically|really|just|very|that|this|his|her|their|its|my|your)$/i;
const FILLER_TAIL = /\b(basically|actually|literally|really|kind of|sort of|you know)\b/gi;
function actionPhrase(said) {
  const m = String(said).match(ACTION_RE);
  if (!m) return "";
  let p = m[0].trim().toLowerCase().replace(FILLER_TAIL, " ").replace(/\s+/g, " ").trim();
  while (DANGLING.test(p) && p.includes(" ")) p = p.slice(0, p.lastIndexOf(" ")).trim();
  // a lone verb says nothing a camera can point at
  return p.split(" ").length >= 2 ? p : "";
}

function deriveBriefs(cfg, bible) {
  const units = cfg.beats || cfg.scenes || [];
  const W = [];
  for (const cap of cfg.captions || []) for (const w of cap.words || []) W.push({ w: String(w.w || ""), s: w.s, e: w.e });
  const cast = castIndex(bible);
  const forbid = new Set((bible.world && bible.world.forbid) || []);
  const bibleConcepts = new Set((bible.objects || []).map((o) => o.concept));
  const biblePlaces = new Set(Object.values(bible.places || {}).map((p) => p.set));

  let prevBrief = null;
  return units.map((u, i) => {
    const from = u.fromFrame || 0, to = from + (u.durationFrames || 0);
    const words = W.filter((w) => w.e > from && w.s < to).map((w) => w.w);
    const said = words.join(" ");
    const planned = (u.props && u.props.text) || u._narration || said;

    // who is in this beat
    const lower = words.map((w) => w.w = String(w).toLowerCase().replace(/[^a-z0-9']/g, ""));
    const people = cast.filter((c) => lower.some((t) => c.tokens.has(t)));

    // what it is about — the book's own recurring subjects rank first
    let concept = null, tier = 0;
    for (const [name, re] of CONCEPT_LEXICON) {
      if (forbid.has(name)) continue;            // the period cannot contain it
      if (!re.test(said)) continue;
      const t = bibleConcepts.has(name) ? 2 : 1;
      if (t > tier) { concept = name; tier = t; }
      if (tier === 2) break;
    }

    // where
    const placeHit = PLACE_WORDS.find(([re]) => re.test(said));
    let place = placeHit ? placeHit[1] : (concept ? CONCEPT_SET[concept] : null);
    // A book's geography is the bible's claim, and it governs even a direct
    // mention. `placeHit` used to be exempt, which is how three scenes of a
    // parable set in ancient India ended up in a bedroom, a classroom and on a
    // highway: one loose noun in the narration outranked the whole book. If the
    // narration really does name a place the bible missed, the fix is to add it
    // to the bible — that file is authored and regenerable; the film is not.
    if (place && biblePlaces.size && !biblePlaces.has(place)) place = null;

    // how sure are we
    let confidence = 0.3;
    if (people.length && tier === 2) confidence = 0.95;
    else if (people.length) confidence = 0.8;
    else if (tier === 2) confidence = 0.75;
    else if (concept) confidence = 0.55;
    if (placeHit) confidence = Math.min(1, confidence + 0.05);

    const subject = people.length
      ? `${people.map((p) => p.entry.name).join(" and ")}${concept ? " — " + concept : ""}`
      : concept || "";

    const compiled = compileNarrativeBeat({
      index: i,
      total: units.length,
      from,
      text: planned,
      said,
      bible,
      genre: (cfg.meta && cfg.meta.genre) || "",
      prevBrief,
    });
    prevBrief = compiled;

    const finalSubject = compiled.subject || subject;
    const finalEntities = compiled.entities && compiled.entities.length ? compiled.entities : people.map((p) => p.key);
    const finalConcept = compiled.antidote?.concept || concept;
    const finalPlace = compiled.place || place;
    const finalConfidence = Math.max(confidence, compiled.confidence || 0);

    return {
      fp: fingerprint(planned),
      i, from,
      subject: finalSubject,
      entities: finalEntities,
      concept: finalConcept,
      place: finalPlace,
      confidence: Math.round(finalConfidence * 100) / 100,
      event: compiled.event,
      state: compiled.state,
      relationship: compiled.relationship,
      beatType: compiled.beatType,
      narrative_intent: compiled.narrative_intent,
      visual_intent: compiled.visual_intent,
      mustShow: compiled.mustShow,
      mustNotShow: compiled.mustNotShow,
      vox: { shot: shotBrief({ people, place: finalPlace, concept: finalConcept, bible, said }) },
      antidote: {
        concept: finalConcept,
        set: finalPlace,
        cast: compiled.antidote?.cast || people.map((p) => p.key),
        shotPreference: compiled.antidote?.shotPreference,
        forbiddenShots: compiled.antidote?.forbiddenShots,
        forbiddenMotifs: compiled.antidote?.forbiddenMotifs,
      },
      _said: said.slice(0, 180),
    };
  });
}

function summarise(briefs) {
  const n = briefs.length || 1;
  const p = (k) => ((briefs.filter(k).length / n) * 100).toFixed(1) + "%";
  console.log(`   with a named person: ${p((b) => b.entities.length)}` +
    `   with a subject: ${p((b) => b.subject)}` +
    `   with a place: ${p((b) => b.place)}` +
    `   confident (≥0.75): ${p((b) => b.confidence >= 0.75)}`);
  const bagFree = briefs.filter((b) => b.vox.shot && b.vox.shot.split(/\s+/).length >= 5).length;
  console.log(`   shot briefs that are a described shot rather than a word bag: ${((bagFree / n) * 100).toFixed(1)}%`);
}

(function main() {
  const bookDir = path.join(ROOT, "books", SLUG);
  if (!fs.existsSync(bookDir)) fs.mkdirSync(bookDir, { recursive: true });

  if (args.briefs) {
    const loaded = JSON.parse(fs.readFileSync(args.briefs, "utf8"));
    const briefs = loaded.briefs || loaded;
    if (!Array.isArray(briefs)) { console.error("  ✗ expected { briefs: [...] }"); process.exit(1); }
    let bad = 0;
    for (const b of briefs) {
      if (!b.fp) { bad++; continue; }
      if (b.confidence == null) b.confidence = 0.7;
    }
    if (bad) { console.error(`  ✗ ${bad} brief(s) without a fingerprint — they cannot be matched back`); process.exit(1); }
    if (!DRY) fs.writeFileSync(OUT, JSON.stringify({ slug: SLUG, authored: true, briefs }, null, 2) + "\n");
    console.log(`✓ ${path.relative(ROOT, OUT)} — ${briefs.length} authored briefs`);
    summarise(briefs);
    return;
  }

  const { cfg, file } = loadConfig();
  const bible = loadBible();
  const briefs = deriveBriefs(cfg, bible);
  console.log(`${SLUG}: ${briefs.length} briefs from ${file}`);
  summarise(briefs);

  // ── TARGETED AUTHORING ────────────────────────────────────────────────────
  // A full emit of a 40-minute book is ~320 briefs, and most of them the
  // heuristic already got right. Authoring all of them is the kind of per-book
  // manual pass this project has learned to design out. `--emit-weak` emits only
  // the beats whose confidence is below what the directors will act on, i.e.
  // exactly the ones currently rendering as neutral text, and `--merge` folds
  // the authored answers back in by fingerprint. The rest are left alone.
  if (args["emit-weak"]) {
    const floor = args["weak-below"] !== undefined ? parseFloat(args["weak-below"]) : 0.6;
    const weak = briefs.filter((b) => (b.confidence ?? 0) < floor);
    fs.writeFileSync(args["emit-weak"], JSON.stringify({
      slug: SLUG,
      note: `${weak.length} of ${briefs.length} beats are below ${floor} — the directors draw nothing for these.`,
      instructions: [
        "These beats have no concrete subject the heuristic could find. Most are argument,",
        "not scene. For each one decide honestly:",
        "  • it CAN be shown  -> write `subject` (what it is about) and `vox.shot` (a described",
        "    photograph: who, doing what, where, when), set `antidote.concept` to an icon from",
        "    knownConcepts when one genuinely means it, and raise `confidence` to 0.7-0.9.",
        "  • it is an idea with no picture -> LEAVE IT. Type on paper is the right answer, and",
        "    a metaphor nobody asked for is how this engine got 39.6% filler.",
        "ENGLISH ONLY. Never change `fp`.",
        "Then: node scripts/plan-briefs.js --slug=" + SLUG + " --merge=<this file>",
      ],
      knownConcepts: CONCEPT_LEXICON.map(([c]) => c),
      bible: { world: bible.world, cast: bible.cast, places: bible.places, objects: bible.objects },
      briefs: weak,
    }, null, 2) + "\n");
    console.log(`\n✍  ${args["emit-weak"]} — ${weak.length} beat(s) below ${floor}`);
    console.log(`   author only what can actually be shown, then --merge=<file>`);
    return;
  }

  if (args.merge) {
    const loaded = JSON.parse(fs.readFileSync(args.merge, "utf8"));
    const authored = new Map((loaded.briefs || loaded).filter((b) => b && b.fp).map((b) => [b.fp, b]));
    let merged = 0, raised = 0;
    const out = briefs.map((b) => {
      const a = authored.get(b.fp);
      if (!a) return b;
      merged++;
      if ((a.confidence ?? 0) > (b.confidence ?? 0)) raised++;
      return { ...b, ...a, fp: b.fp, i: b.i, from: b.from, _said: b._said };
    });
    const orphans = [...authored.keys()].filter((fp) => !out.some((b) => b.fp === fp)).length;
    if (!DRY) fs.writeFileSync(OUT, JSON.stringify({ slug: SLUG, authored: true, briefs: out }, null, 2) + "\n");
    console.log(`✓ ${path.relative(ROOT, OUT)} — merged ${merged} authored brief(s), ${raised} raised above the heuristic` +
      (orphans ? `  ⚠ ${orphans} authored brief(s) matched no beat` : ""));
    summarise(out);
    return;
  }

  if (args.emit) {
    fs.writeFileSync(args.emit, JSON.stringify({
      slug: SLUG,
      instructions: [
        "Rewrite each brief's `subject` and `vox.shot` against `_said`. ENGLISH ONLY.",
        "`subject`: one short line naming WHAT THIS BEAT IS ABOUT. Not the emphasis words.",
        "`vox.shot`: a described photograph — who, doing what, where, when. Reuse the bible's",
        "  `look` for a character verbatim so the same person recurs. Never a list of keywords.",
        "`antidote.concept`: an icon name from knownConcepts, or null. A wrong icon is worse",
        "  than none — set null and lower `confidence` when unsure.",
        "`antidote.set`: a Backdrop set, or null to leave the location alone.",
        "`confidence`: 0-1. Below 0.6 the directors keep their neutral fallback.",
        "NEVER change `fp` — it is how a brief finds its beat again after a re-plan.",
        "Then: node scripts/plan-briefs.js --slug=" + SLUG + " --briefs=<this file>",
      ],
      knownConcepts: CONCEPT_LEXICON.map(([c]) => c),
      bible: { world: bible.world, cast: bible.cast, places: bible.places, objects: bible.objects },
      briefs,
    }, null, 2) + "\n");
    console.log(`\n✍  ${args.emit}  → author, then --briefs=<file>`);
    return;
  }

  if (DRY) { console.log("   (--dry: nothing written)"); return; }
  fs.writeFileSync(OUT, JSON.stringify({ slug: SLUG, authored: false, briefs }, null, 2) + "\n");
  console.log(`✓ ${path.relative(ROOT, OUT)}`);
})();
