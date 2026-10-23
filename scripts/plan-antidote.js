#!/usr/bin/env node
/**
 * plan-antidote.js — VTT → a SCAFFOLD books/<slug>/config.antidote.json for the
 * Antidote engine (flat-vector characters + kinetic text + subtitles).
 *
 * It does the deterministic part — timing, scene segmentation, word-timed
 * captions, a first-guess scene type + placeholder character/text — so Claude
 * only has to ART-DIRECT (pick characters, expressions, actions, kinetic copy,
 * props) on top of a config that already renders. Same Claude-first split as the
 * Vox pipeline. NVIDIA is not involved.
 *
 * Usage:
 *   node scripts/plan-antidote.js --vtt=public/captions/<slug>.vtt --slug=<slug> \
 *     --title="Book" --author="Author" --genre=psychology [--until=<sec>] [--scene-secs=11]
 *
 * Callout copy (highest quality path — same shape as plan-vox --emit-beats):
 *   1) node scripts/plan-antidote.js --emit-beats=<file> ...same args...
 *   2) Claude rewrites each beat's `callout` in that file
 *   3) node scripts/plan-antidote.js --callouts=<file> ...same args...
 */
const fs = require("fs");
const path = require("path");
const { rel, abs, ensureBookDir, readManifest } = require("./lib/paths");
const { parseWords, buildCaptions } = require("./lib/vtt");
const { createDirector, classify: beatOf, SCENE_ICONS, detectEmotion } = require("./lib/antidote-director");
const { sealFor: propositionSeal, stageProposition } = require("./lib/proposition.js");
const { isAuthoredBrief, authorshipStamp } = require("./lib/authorship");
const { compile: compileVisual } = require("./lib/visual-compiler.js");
const { shotName, setName, expression: expressionEnum, charAction, handProp, CONCEPT_MOTIONS } = require("../src/engines/antidote/schema.ts");
const { enterNewcomers } = require("../src/engines/antidote/continuity.ts");
const { shotPreset } = require("../src/engines/antidote/shots.ts");
const EXPRESSIONS = new Set(expressionEnum.options);
const CHAR_ACTIONS = new Set(charAction.options);
const HAND_PROPS = new Set(handProp.options);
const SHOT_NAMES = new Set(shotName.options);
const SET_NAMES = new Set(setName.options);
const { createCopywriter } = require("./lib/antidote-copy");
const { castBook, WORLD_NAMES } = require("./lib/antidote-costume");
const { applyContractRepair } = require("./lib/visual-contract");
const { extractNarrativeAtomSync } = require("../src/semantic/narrativeAtom.ts");
const { deriveVisualIntent } = require("../src/semantic/visualIntent.ts");
const { buildDirectorOverrides, applyDirectorOverrides, sanitizeAction } = require("./lib/director-adapter");
const { partnerActionFor } = require("./lib/partner-contract");
const { decideStrategy, requirementFor, resolveStrategy, stageRequirement, semanticSignature, RENDERER_ACTIONS, strikeSupported } = require("./lib/visual-strategy");
const screenText = require("./lib/screen-text");
const { recordPropositionLoss, makePropositionLossEvent, propositionLossSummary } = require("./lib/proposition-loss");
// Heuristic copy (no --callouts file) is sliced from the narration; it ships
// only when it reads as copy. Authored copy is never filtered here.
const readable = (call, narration) =>
  call && call.text && screenText.checkString(call.text, { kind: "text", narration }).length === 0 ? call : null;
const { loadDNA } = require("./lib/book-dna-schema");

const FPS = 30;
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const TITLE = args.title || "Untitled";
// Clean short title: strip Amazon/marketing subtitles (anything after :, —, –, |, or -)
// so the hero headline stays bold, punchy and readable without suffocating the frame.
const cleanShortTitle = (t) => {
  if (!t) return "";
  const part = t.split(/[:—–|]/)[0].trim();
  return part || t;
};
const SHORT_TITLE = cleanShortTitle(TITLE);
const AUTHOR = args.author || "";
const GENRE = (args.genre || "psychology").toLowerCase();
const SLUG = args.slug || slugify(TITLE);
const VTT = args.vtt || rel.vtt(SLUG);
const UNTIL = args.until ? parseFloat(args.until) : Infinity;
// Scene tempo. Was 11s -> ~115 scenes for a 29-min book (~15s of screen time
// each once durations run to the next scene's start), which is roughly double
// the reference channels (School of Life ~5-8s, Kurzgesagt ~3-5s). 6.5s lands
// in that band while still breaking on sentence ends. Antidote scenes are pure
// 2D SVG/CSS, so ~2x the scene count costs almost nothing to render.
const SCENE_SECS = args["scene-secs"] ? parseFloat(args["scene-secs"]) : 6.5;
// Claude handoff, mirroring plan-vox's --emit-beats/--designs pair:
//   --emit-beats=<file>  dump every beat (narration + shot + heuristic callout) and exit
//   --callouts=<file>    consume that file after Claude has rewritten the callouts
const EMIT_BEATS = args["emit-beats"] || null;
// books/<slug>/art.json is the authored art file's home: make-book's plan step
// never passed --callouts, so an authored book silently re-planned from the
// heuristics. It is picked up automatically (--no-art to ignore it).
const DEFAULT_ART = path.join(__dirname, "..", "books", SLUG, "art.json");
const CALLOUTS_IN = args.callouts || (!args["emit-beats"] && !args["no-art"] && fs.existsSync(DEFAULT_ART) ? DEFAULT_ART : null);
// ── CASTING (Antidote 3.1) ─────────────────────────────────────────────────
//   --emit-cast=<file>  dump the auto-cast bible and exit, for Claude to rewrite
//                       with the book's real characters
//   --cast=<file>       consume that file as meta.cast
//   --world=<name>      override the detected wardrobe world
const EMIT_CAST = args["emit-cast"] || null;
const CAST_IN = args.cast || null;
const WORLD = args.world || null;
// The authored art file (Claude-first). Each beat may carry a `callout` and/or a
// `concept` (the scene's literal subject → its icon). Kept raw as ART so the
// concept survives; CALLOUTS is the callout-only view the copy path consumes.
/**
 * BEAT BRIEFS (scripts/plan-briefs.js) — what each scene is ABOUT, grounded in
 * the book's story bible.
 *
 * Matched by a fingerprint of the scene's own narration, NOT by index. `ART[i]`
 * / `CALLOUTS[i]` below are index-keyed with no length check and no content
 * check, so a re-plan at a different `--scene-secs` silently re-attaches every
 * authored decision to the wrong sentence. Briefs cannot do that, and the miss
 * count is reported at the end of the run.
 *
 * The fingerprint is taken over the SAME string that is written to
 * `_narration` (`s.text.slice(0, 160)`), because that is what plan-briefs reads
 * back out of a planned config.
 */
const BRIEFS_IN = args.briefs || null;
const BRIEF_MIN_CONFIDENCE = args["brief-confidence"] !== undefined ? parseFloat(args["brief-confidence"]) : 0.6;
function briefFingerprint(text) {
  const norm = String(text).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  let h = 2166136261;
  for (let i = 0; i < norm.length; i++) { h ^= norm.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
// Faz 0 (2026-09-24): only a CLAUDE-authored brief is consumed. A heuristic
// brief's concept is the lexicon's guess; passing it as `concept` laundered the
// guess into an "authored" icon (forced illustration, no cooldown) — the
// 20 phones in We Were Liars. Heuristic briefs are ignored, and counted.
const BRIEFS = (() => {
  if (!BRIEFS_IN) return null;
  const loaded = JSON.parse(fs.readFileSync(BRIEFS_IN, "utf8"));
  const arr = (loaded.briefs || loaded).filter((b) => b && b.fp);
  const authored = arr.filter((b) => isAuthoredBrief(b, loaded));
  if (authored.length < arr.length) {
    console.warn(`  ⚠ briefs: ${arr.length - authored.length}/${arr.length} are heuristic (not Claude-authored) — ignored`);
  }
  return new Map(authored.map((b) => [b.fp, b]));
})();  let briefHits = 0, briefMisses = 0;
  let propStagedCount = 0;
function briefFor(text) {
  if (!BRIEFS) return null;
  const b = BRIEFS.get(briefFingerprint(String(text).slice(0, 160)));
  if (b) briefHits++; else briefMisses++;
  return b && (b.confidence ?? 0) >= BRIEF_MIN_CONFIDENCE ? b : null;
}

const ART = (() => {
  if (!CALLOUTS_IN) return null;
  const loaded = JSON.parse(fs.readFileSync(CALLOUTS_IN, "utf8"));
  return Array.isArray(loaded) ? loaded : loaded.beats || [];
})();
const CALLOUTS = ART
  // a beat may legitimately have no callout — null/"" means "leave this frame silent"
  ? ART.map((b) => (b && b.callout && b.callout.text ? b.callout : b && b.text ? b : null))
  : null;
const hasOwn = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);

const STOP = new Set("the a an an and or but so of to in on at for with as is are was were be been being it its this that these those we you they i he she him her his hers their theirs our ours your yours my mine me us them just like really very much more most about into from than then now here there what how why who whom when which while where whose not no yes can could would should will shall may might must do does did done have has had get got gets going gonna kind sort thing things stuff okay ok yeah right mean know think say said says one two also even still because though although if because whether than".split(/\s+/));
// vague intensifiers / pronoun-ish words that read as empty in a bold callout
const GENERIC = new Set("completely everything something anything nothing everyone someone anyone anybody everybody absolutely basically literally actually honestly obviously definitely essentially seriously totally really probably certainly generally usually suddenly simply exactly especially particularly unbelievable incredible amazing awesome pretty little".split(/\s+/));
// legacy helper still used by the thumbnail scaffold below
const emphasisWords = (text, n = 2) =>
  [...new Set(text.replace(/[^\w$%\s]/g, " ").split(/\s+/).filter((w) => w.length > 4 && !STOP.has(w.toLowerCase())))]
    .sort((a, b) => b.length - a.length).slice(0, n).map((w) => w.toUpperCase());

// ── WORD-LEVEL SYNC ─────────────────────────────────────────────────────────
// Callouts used to be stamped at a fixed `at: 22` (0.73s into the scene) while
// the phrase they quote was actually spoken a MEDIAN 3.3 SECONDS later (p90
// 13.6s, worst 17.5s) — only 16% landed within half a second of the word. That
// mismatch is what makes motion graphics feel like they belong to a different
// video than the voice. The VTT already carries per-word frame timings, so the
// fix is just to use them: find where the phrase is actually spoken and put the
// type there, a few frames early so it is already on screen as the word arrives.
// A non-quantity motif must be on screen within this many frames of the cut, so
// a late word-anchored callout can never leave the scene opening frozen. 12 was
// already what a SILENT scene used, so this just extends that same rule to the
// scenes that do have a callout.
const MOTIF_LATEST = 12;
// Motifs that ARE a quantity: they animate their own value, so they keep leading
// the callout instead of firing at the cut. (The directors own SELF_ANIMATING set
// lists "lineChart", which is not a real propType - the actual one is
// "lineGrowth", named here. That set governs ARCS and is left untouched.)
const QUANTITY_MOTIFS = new Set(["counter", "barChart", "stack", "ladder", "clock", "lineGrowth"]);
const LEAD = 4; // frames the callout leads the spoken word
// A callout must stay up at least this long, or it just flashes. 40 (1.3s) was
// not enough: the next scene's wipe eats the tail, and the P3 re-measure found a
// word-anchored callout readable for <1s ("DEEPLY EM…" under the wipe). 2s may
// lead the spoken word by up to ~0.7s, which reads as a cue, not a spoiler.
const MIN_HOLD = 60;
const normw = (w) => String(w).toLowerCase().replace(/[^a-z0-9']/g, "");
function anchorAt(scene, phrase, fallback, durationFrames) {
  if (!phrase || !scene.words || !scene.words.length) return fallback;
  const want = String(phrase).split(/\s+/).map(normw).filter(Boolean);
  if (!want.length) return fallback;
  const said = scene.words.map((w) => normw(w.w));
  let frame = -1;
  for (let i = 0; i + want.length <= said.length; i++) {
    if (want.every((w, k) => said[i + k] === w)) { frame = scene.words[i].s; break; }
  }
  if (frame < 0) { const i = said.indexOf(want[0]); if (i >= 0) frame = scene.words[i].s; }
  if (frame < 0) return fallback;
  const latest = Math.max(0, durationFrames - MIN_HOLD);
  return Math.max(0, Math.min(frame - scene.from - LEAD, latest));
}

// ── LATE PULSES ─────────────────────────────────────────────────────────────
// A scene fires its motif near the cut and its callout on the spoken word, and
// then holds a frozen frame for whatever is left. On a-good-man-is-hard-to-find
// that was 45 scenes leaving >8s of tail after their last event. `ambient()`
// keeps the set breathing, but breathing is not a CHANGE — neither the dead-air
// audit nor a viewer looking for something to happen can see it.
//
// So pad the scene with extra beats-of-attention on content words spoken later
// in it, at roughly the rate the reference channels change something (~2s).
// This is Antidote's equivalent of the Vox `anchors` tail (SKILL 9.3b); like
// there, the Scene CAMERA consumes them as a small push-in.
const PULSE_GAP = Math.round(2.2 * FPS); // a beat of attention roughly every 2s
const PULSE_TAIL = Math.round(0.9 * FPS); // never pulse right before the cut

/**
 * pulseClock — fill EVERY gap in the scene, not just the tail.
 *
 * A first version only padded after the scene's last event, which fixed frozen
 * TAILS and left frozen HEADS: a scene with no motif and a word-anchored callout
 * 8-10s in still opened on a static frame, because the pulses all queued up
 * behind the callout. So walk the scene's words once and drop a pulse wherever
 * more than PULSE_GAP has passed since the last thing that happened — whether
 * that was the cut, one of the scene's own events, or an earlier pulse.
 *
 * Frame 0 counts as an event: the scene opens on its `transition`, which sweeps
 * the whole frame, so the head only needs filling once that has settled.
 *
 * The cap follows the scene LENGTH rather than being a constant — sustaining a
 * ~2s rate across a 13s scene takes more than the 3 that suit an 8s one. Spacing
 * is still enforced at PULSE_GAP, so a higher cap extends coverage and cannot
 * bunch them up.
 */
function pulseClock(scene, ownEvents, durationFrames) {
  if (!scene.words || !scene.words.length) return [];
  const limit = durationFrames - PULSE_TAIL;
  const max = Math.max(3, Math.ceil(durationFrames / PULSE_GAP));
  const own = ownEvents.filter((n) => n != null).sort((a, b) => a - b);
  const out = [];
  let last = 0; // the cut/transition itself
  let oi = 0;
  for (const w of scene.words) {
    const rel = w.s - scene.from; // words carry ABSOLUTE frames
    if (rel > limit) break;
    // anything the scene already does before this word resets the clock
    while (oi < own.length && own[oi] <= rel) { last = Math.max(last, own[oi]); oi += 1; }
    if (rel <= last + PULSE_GAP) continue;
    if (normw(w.w).length < 4) continue; // land on a real word, not filler
    out.push(rel);
    last = rel;
    if (out.length >= max) break;
  }
  return out;
}

// ── palette (book-specific, from book.json → drives bg + text + cast colors so
//    the Antidote video shares its book's color identity instead of a generic
//    blue/cream look). Falls back to a warm-neutral default. ────────────────
const hx = (h) => { const m = String(h).replace("#", ""); const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb = ([r, g, b]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
const mixc = (h, to, a) => rgb(hx(h).map((c) => c + (to - c) * a));
const lighten = (h, a) => mixc(h, 255, a);
const darken = (h, a) => mixc(h, 0, a);
const PAL = (() => {
  const m = (readManifest(SLUG) || {}).palette;
  return m && m.paper ? m : { paper: "#EAE7DE", ink: "#1E1E22", red: "#D9603C", gold: "#C99A48" };
})();
// four LIGHT backgrounds tuned from the palette (characters + text read on them)
const BGS = [
  { type: "flat", colors: [lighten(PAL.paper, 0.25)] },
  { type: "gradient", colors: [lighten(PAL.paper, 0.4), PAL.paper] },
  { type: "gradient", colors: [lighten(PAL.gold, 0.62), lighten(PAL.paper, 0.2)] },
  { type: "gradient", colors: [lighten(PAL.red, 0.66), lighten(PAL.paper, 0.28)] },
];
// ── CAST BIBLE ──────────────────────────────────────────────────────────────
// The old planner did `CAST[(i + c) % CAST.length]`, minting a fresh stranger
// every scene: 224 character instances, 224 identities, zero continuity. Then it
// shipped ONE hardcoded bible instead, which fixed continuity and created a new
// problem: the same five actors, in the same three coats, in every book on the
// channel.
//
// Casting now happens per book (scripts/lib/antidote-costume.js): the narration
// picks a wardrobe WORLD (present day, 1920s, 19th century, war, farm, regime,
// university, corporate, pre-modern), and five visibly different people are
// drawn from that world's pools — different garments, headwear, builds and
// head-to-body ratios, deterministic from the slug. Claude then replaces them
// with the book's actual characters via --emit-cast / --cast.
const SEED = SLUG.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

// A scene names a ROLE; the cast may be keyed by character NAME. roleIndex maps
// one to the other; castSlots keeps two slots from resolving to the same person
// (the "twins" bug, 2026-10-17). Both live in scripts/lib/cast-slots.js.
const { roleIndex, castSlots, lockedCast, isEmptyAuthoredCast, castFreeShot } = require("./lib/cast-slots");

(() => {
  const vttText = fs.readFileSync(abs.vtt ? (fs.existsSync(VTT) ? VTT : abs.vtt(SLUG)) : VTT, "utf8");
  const words = parseWords(vttText);
  if (!words.length) { console.error("No words parsed from VTT: " + VTT); process.exit(1); }
  const captions = buildCaptions(words, FPS, UNTIL);
  if (!captions.length) { console.error("No captions built."); process.exit(1); }

  // segment captions into ~SCENE_SECS scenes, breaking at sentence ends
  const scenes = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const from = cur[0].startFrame;
    const end = cur[cur.length - 1].endFrame;
    const text = cur.map((c) => c.text).join(" ");
    // Keep the word-level timings with the scene: they're what lets a callout
    // land ON the word it quotes instead of at a fixed offset (see anchorAt).
    scenes.push({ from, end, text, words: cur.flatMap((c) => c.words || []) });
    cur = [];
  };
  // ── CUTS LAND IN THE BREATH, NOT ON THE CLOCK ───────────────────────────
  // Scenes used to break on "long enough AND the caption ends in a period",
  // which puts a cut wherever the transcript happens to punctuate — often mid
  // breath, sometimes a second after the speaker already stopped.
  //
  // Finding the real pauses takes one extra step, because an ASR VTT has no
  // silences in it: every word's end time is just the next word's start, so
  // caption-to-caption gaps are 0 for 866 of 875 captions on a 36-minute book.
  // The pause is hiding in the SLOT — a two-letter word occupying 20 frames is
  // a speaker who stopped talking. So compare each word's slot against the time
  // that word could plausibly take to say; the surplus IS the breath.
  //
  // This is the edit trick a hand-animated channel cannot afford to do
  // frame-accurately across thirty minutes, and it costs us nothing.
  const GAP_BREATH = 7; // ~0.23s of surplus — a real pause between phrases (~p70)
  const GAP_STRONG = 13; // ~0.43s — an unmistakable beat of silence (~p88)
  const sayFrames = (w) => Math.min(20, 3 + 1.3 * String(w).replace(/[^A-Za-z0-9']/g, "").length);
  const breathAfter = (k) => {
    const ws = captions[k].words;
    const next = captions[k + 1];
    if (!ws || !ws.length || !next) return Infinity; // end of the film: always a break
    const nw = next.words && next.words[0];
    if (!nw) return Infinity;
    const last = ws[ws.length - 1];
    return Math.max(0, nw.s - last.s - sayFrames(last.w));
  };
  for (let k = 0; k < captions.length; k++) {
    const c = captions[k];
    cur.push(c);
    const dur = (c.endFrame - cur[0].startFrame) / FPS;
    const endsSentence = /[.!?]$/.test(c.text);
    const breath = breathAfter(k);
    if (dur >= SCENE_SECS && (endsSentence || breath >= GAP_BREATH)) flush();
    // a long silence is worth cutting on slightly early — it is a better edit
    // point than a sentence end half a scene later
    else if (dur >= SCENE_SECS * 0.72 && breath >= GAP_STRONG) flush();
    // past the target and drifting: take ANY audible seam rather than riding to
    // the hard cap, which is what pushed the average scene to 9.8s against a
    // 6.5s target and stretched the dead windows with it
    else if (dur >= SCENE_SECS * 1.25 && breath >= 4) flush();
    else if (dur >= SCENE_SECS * 1.6) flush();
  }
  flush();

  // ── CASTING ─────────────────────────────────────────────────────────────
  // The world is read from the narration itself, so a 1920s novel gets fedoras
  // and a regime dystopia gets hoods without anyone saying so. A --cast file
  // (Claude, after reading the book) always wins.
  const sample = captions.slice(0, 220).map((c) => c.text).join(" ");
  const auto = castBook({ slug: SLUG, palette: PAL, genre: GENRE, title: TITLE, sample, world: WORLD });
  let CAST_BIBLE = auto.cast;
  let CAST_WORLD = auto.world;
  // The story bible already names this book's real people and carries a
  // `variant` for each, in exactly the shape --cast expects. Without this the
  // auto-cast wins and every book ships the same five generic roles — narrator,
  // protagonist, foil, mentor, extra — which is the templated-content signal the
  // Character Foundry was built to remove. An explicit --cast file still wins.
  const BIBLE_CAST_PATH = abs.bookDir(SLUG) + "/story-bible.json";
  const castSource = CAST_IN || (fs.existsSync(BIBLE_CAST_PATH) ? BIBLE_CAST_PATH : null);
  if (castSource) {
    const loaded = JSON.parse(fs.readFileSync(castSource, "utf8"));
    const authored = loaded && loaded.cast ? loaded.cast : loaded;
    if (authored && typeof authored === "object" && Object.keys(authored).length) {
      // Merge over the auto-cast per member, so Claude can set three fields on a
      // character and inherit a complete, coherent variant for the rest.
      CAST_BIBLE = {};
      for (const [key, member] of Object.entries(authored)) {
        const fallback = auto.cast[member && member.role ? member.role : key] || auto.cast.narrator;
        const merged = { ...fallback.variant, ...((member && member.variant) || {}) };
        // A recolored character must not keep the auto-cast's derived trim, or
        // Claude sets a cream suit and the hat stays the old character's black.
        if (member && member.variant && member.variant.suit && !member.variant.trim) delete merged.trim;
        CAST_BIBLE[key] = {
          name: (member && member.name) || key,
          ...(member && member.role ? { role: member.role } : {}),
          variant: merged,
        };
      }
      // a story bible's `world` is an object (era, places); only a --cast file names a wardrobe world
      if (loaded && typeof loaded.world === "string") CAST_WORLD = loaded.world;
    }
  }
  /**
   * Which act of the book a frame falls in, from the story bible's `spine`.
   * Returns "" when there is no bible or no spine, which keeps the old HUD
   * behaviour for every book that has neither.
   */
  const SPINE = (() => {
    try {
      const b = fs.existsSync(BIBLE_CAST_PATH) ? JSON.parse(fs.readFileSync(BIBLE_CAST_PATH, "utf8")) : null;
      const sp = (b && Array.isArray(b.spine) ? b.spine : [])
        .filter((x) => x && x.act)
        .map((x) => ({ act: x.act, from: Number(x.fromFrame) || 0 }))
        .sort((a, c) => a.from - c.from);
      return sp.length ? sp : null;
    } catch { return null; }
  })();
  const ACT_AT = (frame) => {
    if (!SPINE) return "";
    let cur = "";
    for (const e of SPINE) { if (e.from <= frame) cur = e.act; else break; }
    return cur;
  };

  const castKeyFor = roleIndex(CAST_BIBLE);

  // ── Claude handoff: dump the cast and stop ──────────────────────────────
  if (EMIT_CAST) {
    const payload = {
      book: { slug: SLUG, title: TITLE, author: AUTHOR, genre: GENRE },
      world: CAST_WORLD,
      worlds: WORLD_NAMES,
      instructions: [
        "Recast this book with ITS OWN characters. Rename the keys to the people the",
        "  narration is actually about (`patch`, `saint`, `grace`) and give each a `role`",
        "  from narrator|protagonist|foil|mentor|extra so the director can still cast a beat.",
        "Keep `narrator` for non-fiction — there the five generic roles are the right cast.",
        "Silhouette carries a character further than color does. Set `outfit`, `headwear`,",
        "  `build`, `height` and `headScale` before you touch a hex value: at the size a wide",
        "  shot renders, a hat reads and a shirt color does not.",
        "A child is `height` ~0.74 with `headScale` ~1.2 — not a small adult.",
        "Only fields you set are overridden; the rest are inherited from the auto-cast, so",
        "  three well-chosen fields beat a fully retyped variant.",
        "`overlay` takes raw SVG paths in rig units (400 wide, head at 200,150, shoulders",
        "  y=322, hips y=596) for a SIGNATURE feature a wardrobe combination can't reach —",
        "  an eyepatch, a chest plate, a scar. Use it for one or two characters at most.",
        "Then re-run plan-antidote with --cast=<this file>.",
      ],
      vocabulary: {
        outfit: ["suit", "casual", "uniform", "robe", "coat", "dress", "apron", "armor", "overalls", "vest", "cloak", "hoodie", "rags"],
        headwear: ["none", "cap", "fedora", "beanie", "hood", "headscarf", "bonnet", "crown", "helmet", "topHat", "beret", "veil", "cowboy"],
        hairStyle: ["short", "buzz", "bald", "long", "bun", "afro", "curly", "ponytail", "braids", "pigtails", "messy", "receding"],
        beard: ["none", "stubble", "full", "mustache", "goatee", "muttonchops"],
        accessory: ["none", "tie", "bowtie", "scarf", "necklace", "badge", "satchel", "suspenders", "collar"],
        build: ["slight", "average", "heavy"],
        age: ["child", "young", "adult", "old"],
        height: "0.72 (child) - 1.12 (very tall)",
        headScale: "0.9 (adult, severe) - 1.2 (child)",
      },
      cast: CAST_BIBLE,
    };
    fs.writeFileSync(EMIT_CAST, JSON.stringify(payload, null, 2) + "\n");
    console.log(`✓ ${EMIT_CAST} — dünya: ${CAST_WORLD} (${auto.label}), ${Object.keys(CAST_BIBLE).length} karakter`);
    console.log(`  Claude kadroyu kitaba göre yeniden yazdıktan sonra:`);
    console.log(`  node scripts/plan-antidote.js --cast=${EMIT_CAST} --vtt=${VTT} --slug=${SLUG} --title="${TITLE}" --genre=${GENRE}`);
    return;
  }

  // crude sentiment → drives the character's action + expression so the everyman
  // reacts to the narration instead of idling through 180 scenes identically.
  const NEG = /\b(wrong|fail|failed|lose|lost|struggle|hard|fear|afraid|doubt|stuck|weak|worse|worst|mistake|quit|give up|can'?t|never|problem|pressure|anxious|worry)\b/i;
  const POS = /\b(win|won|grow|growth|better|best|succeed|success|achieve|potential|thrive|breakthrough|master|improve|proud|great|greater|rise|unlock)\b/i;
  const react = (text) => {
    const even = text.length % 2 === 0; // deterministic tiebreak (resume-safe)
    if (/\?\s*$/.test(text.trim()) || /\b(why|how|what if|imagine|consider)\b/i.test(text)) return { action: "think", expression: "surprised" };
    if (NEG.test(text)) return { action: even ? "slump" : "point", expression: "worried" };
    if (POS.test(text)) return { action: even ? "celebrate" : "point", expression: "happy" };
    return { action: "talk", expression: "neutral" };
  };

  // The DIRECTOR owns framing, transitions, backdrops and motifs (see
  // scripts/lib/antidote-director.js). The planner keeps what it is good at:
  // timing, cast continuity and the kinetic copy.
  // ── Book DNA (P2.1) — P0.3: a missing DNA still gets the defaults (logged once),
  // but a DNA that is PRESENT and broken stops the plan: silently planning without
  // the book's visual identity is what this guards against.
  let bookDNA = null;
  try { bookDNA = loadDNA(SLUG); } catch (e) { console.error(`\n❌ ${e.message}\n`); process.exit(1); }

  const bibleFile = path.join("books", SLUG, "creative-bible.json");
  const bible = fs.existsSync(bibleFile) ? JSON.parse(fs.readFileSync(bibleFile, "utf8")) : null;
  if (bible) {
    console.log(`[+] Art Director Creative Bible detected: ${bible.world?.label || "Custom Universe"}`);
  }
  const customPalette = (() => {
    // Priority: dna.color.paletteOverride > bible.world.palette > book.json.palette > defaults
    const dnaPal = bookDNA && bookDNA.color && bookDNA.color.paletteOverride;
    if (dnaPal) return { ...PAL, ...dnaPal };
    if (bible?.world?.palette) {
      // The icon accent is the bible's ACCENT. It used to take `primary`, which the
      // Art Director usually sets equal to `ink` (#0F172A) — so every icon drew
      // ink-on-ink: 204/204 props in We Were Liars were solid navy blobs (the
      // "empty ovals" of the mute test). An accent equal to ink is never used.
      const bp = bible.world.palette;
      const ink = bp.ink || PAL.ink;
      const pick = [bp.accent, bp.primary, PAL.red].find((c) => c && String(c).toLowerCase() !== String(ink).toLowerCase()) || PAL.red;
      return { ...PAL, red: pick, accent: pick, ink };
    }
    return null;
  })();
  const effectivePalette = customPalette || PAL;
  const director = createDirector({ palette: effectivePalette, genre: GENRE, slug: SLUG, bible, dna: bookDNA });
  // P9-A O1/O2: authored-meaning refusals collected across the plan (filled by
  // the director's onConceptRefused callback in the scene loop below).
  const conceptRefusals = [];
  const BOOK_LOCATIONS = (() => {
    try {
      const sb = JSON.parse(fs.readFileSync(BIBLE_CAST_PATH, "utf8"));
      const locs = sb && sb.visualProvenance && sb.visualProvenance.allowedLocations;
      return Array.isArray(locs) && locs.length ? new Set(locs) : null;
    } catch { return null; }
  })();
  // Callouts: Claude-authored when --callouts was given, heuristic otherwise.
  const copy = createCopywriter();

  // ART / CALLOUTS are index-keyed. An art file authored against a different
  // segmentation (other --scene-secs, a re-cut VTT) would attach every decision
  // to the wrong sentence — refuse it instead of shipping mismatched copy.
  if (ART) {
    const key = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const bad = ART.map((b, i) => (b && b.narration != null && scenes[i] && key(b.narration) !== key(scenes[i].text) ? i : -1)).filter((i) => i >= 0);
    if (ART.length !== scenes.length || bad.length) {
      console.error(`❌ art file ${CALLOUTS_IN} does not match this segmentation: ${ART.length} beats vs ${scenes.length} scenes, ${bad.length} narration mismatch(es)${bad.length ? ` (first: beat ${bad[0]})` : ""}.`);
      console.error("   Re-emit with --emit-beats and re-author, or pass --no-art.");
      process.exit(1);
    }
  }
  // P0.2: beats whose authored icon/set its own brief forbids. `repairSceneContract`
  // no longer substitutes them (that restaged an authored beat in silence); they are
  // collected here and stop the plan with the scene id and the reason.
  // P1.4 PHASE C: the measured capability map feeds the strategy decision.
  // Loaded once; unreadable/missing → null → every capability reads UNKNOWN,
  // which is the fail-closed direction (unknown ≠ safe).
  const CAPABILITY_MAP = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "visual-capability.json"), "utf8")); }
    catch { return null; }
  })();
  const unresolvedAuthored = [];
  let lastPlannedShot = null; // the previous scene's final shot: an authored `continue` keeps it
  const sceneSpecs = scenes.map((s, i) => {
    const next = scenes[i + 1];
    const durationFrames = (next ? next.from : s.end) - s.from;
    const isTitle = i === 0;
    const r = react(s.text);

    // ── kinetic copy first: the callout frame drives the camera punch ────────
    // Copy comes from Claude when a --callouts file was supplied, otherwise from
    // the copywriter heuristic. Either way a beat may legitimately get NO
    // callout — a silent frame lands harder than a weak word.
    const texts = [];
    let calloutAt = null;
    const authored = CALLOUTS ? CALLOUTS[i] : null;
    if (isTitle) {
      // With a --callouts file, Claude's `null` MEANS silence — never fall back to
      // the heuristic, or every deliberately silent beat gets a weak word stamped.
      const sub = CALLOUTS
        ? (authored ? authored.text : null)
        : (readable(copy.write(s.text.replace(new RegExp(TITLE, "i"), ""), "title"), s.text) || {}).text;
      const rawAt = sub ? anchorAt(s, sub, 26, durationFrames) : null;
      // Let the hero title breathe for at least ~80 frames before sub-callout enters
      const at = rawAt != null ? Math.max(90, rawAt) : null;
      const titleDuration = at != null ? Math.min(80, at - 15) : undefined;

      texts.push({
        text: (SHORT_TITLE || TITLE).toUpperCase(),
        style: "plain",
        color: PAL.ink,
        enter: "down",
        at: 6,
        ...(titleDuration ? { duration: titleDuration } : {}),
      });

      if (sub && at != null) {
        texts.push({ text: sub.toUpperCase(), style: "box", color: PAL.paper, boxColor: PAL.red, enter: "pop", at, ...(CALLOUTS ? { src: "art" } : {}) });
        calloutAt = at;
      }
    } else {
      let call = CALLOUTS ? authored : readable(copy.write(s.text, beatOf(s.text)), s.text);
      // P9-A A4: a strike is a rejection ASSERTION — it may only carry a phrase
      // this scene's narration actually says. An ungrounded struck phrase
      // fabricates a rejected proposition nobody heard (the-second-mountain:
      // 14+ authored strike callouts were paraphrases, not narration spans).
      // The line still ships; the strike does not.
      // AUTHORED copy is exempt (storyboard invariant 1, 2026-10-17): an art-file
      // callout's style reaches the screen unchanged. Demoting the-art-of-saying-no
      // 207's struck "The guilt just evaporates" (narration: "the guilt just NEATLY
      // evaporates") to plain made the frame assert the very claim the author
      // rejected (a fresh WRONG). The guard now applies to ENGINE copy only; an
      // authored strike that is not a verbatim span is reported, not rewritten.
      if (call && call.style === "strike" && !strikeSupported(call.text, s.text)) {
        if (CALLOUTS) console.warn(`  ⚠ art callout strike "${call.text}" is not a verbatim narration span — kept as authored (scene ${i})`);
        else call = { ...call, style: "plain", _strikeRefused: "phrase_not_in_narration" };
      }
      if (call && call.text) {
        const stat = call.style === "outline";
        // land the type on the word, not on the cut
        const at = anchorAt(s, call.text, 22, durationFrames);
        texts.push({
          text: String(call.text).toUpperCase(),
          style: call.style || "box",
          color: stat ? PAL.ink : call.style === "box" || call.style === "stack" ? PAL.paper : PAL.ink,
          boxColor: stat ? PAL.gold : PAL.red,
          enter: "pop",
          at,
          // Provenance for the screen-text gate: authored copy may use words the
          // narrator didn't (a metaphor); heuristic copy must be audibly grounded.
          ...(CALLOUTS ? { src: "art" } : {}),
        });
        calloutAt = at;
      }
    }
    // Staging (x / y / size) is intentionally omitted — the SHOT preset places
    // the copy, so re-directing a scene never means re-typing coordinates.

    // Claude-first: when the art file names a beat's `concept`, it wins (a string
    // forces that icon, null forces none); otherwise the director's lexicon reads
    // the subject from the narration.
    // A beat brief names the scene's subject (and where it happens) from the
    // book's story bible, so it outranks the director's first-match regex —
    // which has no confidence and cannot tell "this beat is definitely about a
    // courtroom" from "the word matched". An explicit art file still wins over
    // both: it is a human decision about this specific beat.
    const brief = briefFor(s.text);
    // P9-A O1/O2: the director reports an authored concept it had to refuse
    // (world-vocabulary gate) instead of dropping the author's meaning in
    // silence. Collected per plan and written by the O3 telemetry + the
    // authorship gate (see scripts/lib/proposition-loss.js).
    let d = director.direct({
      text: s.text, index: i, isTitle, calloutAt, total: scenes.length, durationFrames,
      concept: hasOwn(ART && ART[i], "concept") ? ART[i].concept
        : (brief && brief.antidote && brief.antidote.concept) ? brief.antidote.concept : undefined,
      brief,
      onConceptRefused: (r) => conceptRefusals.push({ ...r, engine: "antidote" }),
    });
    // Faz 0: the director can no longer invent a subject, so whatever it drew
    // HERE came from an authored decision. Anything a later stage adds is not —
    // gate-authorship compares the final props against this list.
    const authoredPropTypes = (d.props || []).map((p) => p && p.type).filter(Boolean);
    // Semantic floor: bridge the shared deterministic intent model into the
    // existing director. This never replaces an authored or valid composition.
    const narrativeAtom = extractNarrativeAtomSync(s.text, { bookTitle: TITLE, author: AUTHOR });
    const visualIntent = deriveVisualIntent(narrativeAtom);
    const semanticAdapter = buildDirectorOverrides({
      intent: visualIntent,
      atom: narrativeAtom,
      direction: d,
      authoredDiagram: hasOwn(ART && ART[i], "diagram") && !!ART[i].diagram,
      // Any authored decision for this beat (callout, silence, icon) is the human
      // composition; an adapter floor on top of it put "AMAZING VISUAL | CASTLE"
      // boxes over an authored callout.
      authoredComposition: !!(ART && ART[i]),
    });
    d = applyDirectorOverrides(d, semanticAdapter);
    const semanticPayload = semanticAdapter.override ? semanticAdapter.semanticPayload : null;
    // The brief's place wins over the genre rotation for the same reason. The
    // director's own HOLD/decay rule still governs how long we stay there — a
    // set that changes every beat is strobing, not geography.
    if (brief && brief.antidote && brief.antidote.set && d.bg && !hasOwn(ART && ART[i], "set")) {
      d.bg.set = brief.antidote.set;
    }
    // Faz 0: the art file's `shot` and `set` were emitted as editable and then
    // never read — the author's framing and location were dropped in silence
    // (WWL pilot: "shore" became "abstract", a "medium" became a sky silhouette).
    // Honour them when the renderer can draw them; say so when it cannot.
    if (ART && ART[i] && !isTitle) {
      const a = ART[i];
      // `shot` in the emit file is the director's own first guess (informational);
      // an authored framing goes in `shotOverride`.
      if (typeof a.shotOverride === "string" && a.shotOverride && a.shotOverride !== d.shot) {
        if (SHOT_NAMES.has(a.shotOverride)) d.shot = a.shotOverride;
        else console.warn(`  ⚠ art shotOverride "${a.shotOverride}" is not a renderable shot — ignored (scene ${i})`);
      }
      // A CONTINUED stage keeps its framing (2026-10-20): the director re-picked a shot per beat, so 15-secrets 75
      // ("still holding the phone") became a closeUp with the phone out of frame. Unless the author re-frames it.
      if (a.continue === true && !(typeof a.shotOverride === "string" && a.shotOverride) && lastPlannedShot && SHOT_NAMES.has(lastPlannedShot) && lastPlannedShot !== "chapterCard") d.shot = lastPlannedShot;
      // An AUTHORED split gets the split's two-tone field (2026-10-22): only the director's own split pick set
      // bg.split, so an author's "split" drew one plain backdrop behind both halves (the-art-of-saying-no 196, blind
      // NEUTRAL/NONE). Same colours as the director (antidote-director.js); an authored set still wins below.
      if (a.shotOverride === "split" && d.shot === "split" && d.bg && !d.bg.split) {
        d.bg.split = [lighten(PAL.paper, 0.34), lighten(PAL.red, 0.58)];
        if (!(typeof a.set === "string" && a.set)) d.bg.set = "none";
      }
    }
    if (ART && ART[i] && typeof ART[i].set === "string" && ART[i].set && d.bg) {
      if (SET_NAMES.has(ART[i].set)) d.bg.set = ART[i].set;
      else console.warn(`  ⚠ art set "${ART[i].set}" is not a renderable set — ignored (scene ${i})`);
    }
    // A shot preset may force a location (silhouette -> "sky", insert -> "none")
    // the book never allowed; the firewall then fails the whole plan. Fall back to
    // a placeless set the book does allow. A split keeps "none" (its two-tone field).
    if (d.bg && BOOK_LOCATIONS && !BOOK_LOCATIONS.has(d.bg.set) && !(d.bg.set === "none" && d.shot === "split")) {
      d.bg.set = ["abstract", "horizon", "stage"].find((x) => BOOK_LOCATIONS.has(x)) || [...BOOK_LOCATIONS][0];
    }
    // The brief's SUBJECT, recorded on the scene. It is what the picture claims
    // to be about, stated in words, so `audit-relevance.js` can check the claim
    // against the audio instead of re-deriving grounding from the icon's regex.
    // That distinction is not cosmetic: an authored metaphor is usually right
    // and lexically absent — the beat about "its hardness, its greenness" is
    // correctly drawn as the river stone, and the `water` regex never fires on
    // it — so scoring the icon marked good art direction as unrelated.
    const briefSubject = brief && brief.subject ? brief.subject : null;

    // ── EXPLANATORY DIAGRAM (4.0) ────────────────────────────────────────────
    // Claude's authored `diagram` in the art file wins (a truthy value forces it,
    // null forces it off); otherwise the director's conservative heuristic. A
    // diagram is the whole beat: insert framing, no cast, no competing motif or
    // callout — the diagram's own title carries the copy.
    const diagram = hasOwn(ART && ART[i], "diagram")
      ? (ART[i].diagram ? { ...ART[i].diagram, authored: true } : null)
      : (d.diagram || null);
    if (diagram) {
      // The adapter supplies atom-derived nodes/poles, while this existing
      // diagram branch remains the only planner-to-renderer transport path.
      // Authored diagrams never reach this code with an adapter override.
      // P3.2: a pair only ships when its two halves differ — a degenerate pair
      // stamps the same phrase on both ends of the graphic.
      const payloadLabels =
        semanticPayload?.kind === "flow_labels"
          ? [semanticPayload.triggerLabel, semanticPayload.consequenceLabel]
          : semanticPayload?.kind === "internal_tension_labels"
            ? [semanticPayload.internalPoleA, semanticPayload.internalPoleB]
            : null;
      if (payloadLabels && payloadLabels[0] && payloadLabels[1] && payloadLabels[0] !== payloadLabels[1]) {
        diagram.labels = payloadLabels;
      }
      d.shot = "insert";
      // a split's "none" field does not survive the switch to insert
      if (d.bg && BOOK_LOCATIONS && !BOOK_LOCATIONS.has(d.bg.set)) {
        d.bg.set = ["abstract", "horizon", "stage"].find((x) => BOOK_LOCATIONS.has(x)) || [...BOOK_LOCATIONS][0];
      }
      d.cast = { ...d.cast, count: 0, crowd: 0 };
      d.props = [];
      d.concept = null;
      texts.length = 0;
    }

    // An authored person is never framed out (2026-10-21). A beat whose art.json names its cast, with no
    // authored shotOverride and no diagram, does not keep a shot that draws nobody (shots.ts dropsCast:
    // insert / beforeAfter / chapterCard): a `continue` inherited the previous castless insert, so
    // threshing-day 40/68/70-72/78/107/197/221-226 showed an empty forest under the callout while the
    // narration named Brennan or Rhiannon. Decided HERE, before the cast is built, so the slots, entrances,
    // lookAt, motif timing, the lock and the next beat's lastPlannedShot all follow the people-holding shot.
    // The author's own shotOverride always wins (invariant 1); a diagram beat shows nobody by design.
    if (ART && ART[i] && !isTitle && !diagram && Array.isArray(ART[i].cast) && ART[i].cast.length
      && !(typeof ART[i].shotOverride === "string" && ART[i].shotOverride) && shotPreset(d.shot).dropsCast) {
      const was = d.shot;
      d.shot = ART[i].cast.length >= 2 ? "twoShot" : "medium";
      // leaving a castless shot: a split's half-and-half backdrop does not follow a person shot (as on every other
      // exit from split in this file), and its set "none" needs a place
      if (d.bg) {
        delete d.bg.split;
        if (d.bg.set === "none") {
          const a = ART[i];
          d.bg.set = (a.set && (!BOOK_LOCATIONS || BOOK_LOCATIONS.has(a.set))) ? a.set
            : BOOK_LOCATIONS ? (["abstract", "horizon", "stage"].find((x) => BOOK_LOCATIONS.has(x)) || [...BOOK_LOCATIONS][0]) : "room";
        }
      }
      // said only where it changes the picture: with nobody planned (count 0) the authored-cast block below re-frames
      // the insert the same way, as it always did
      if (d.cast && d.cast.count > 0) console.log(`  ↻ scene ${i}: authored cast ${ART[i].cast.slice(0, 2).join("+")} on "${was}" (draws nobody) → ${d.shot}`);
    }

    // Existing split staging and KineticText already draw explicit x/y labels.
    // Add these only for an adapter-applied floor; authored and valid director
    // compositions keep their copy untouched.
    if (!diagram && semanticAdapter.override && (semanticPayload?.kind === "comparison_labels" || semanticPayload?.kind === "two_domain_labels")) {
      const left = semanticPayload.leftLabel || semanticPayload.sourceLabel;
      const right = semanticPayload.rightLabel || semanticPayload.targetLabel;
      texts.push(
        { text: left, style: "box", color: PAL.ink, boxColor: PAL.paper, enter: "left", at: 6, x: 470, y: 250, size: 48 },
        { text: right, style: "box", color: PAL.paper, boxColor: PAL.red, enter: "right", at: 6, x: 1450, y: 250, size: 48 },
      );
    }

    // ── cast: roles, not looks. meta.cast resolves the face at render time ───
    const characters = [];
    // BUSINESS — what the lead does with their body this beat (hold an object,
    // walk across the set, sit down). The director rations these; when one
    // fires it overrides the sentiment-derived action, because a person holding
    // a letter should not also be celebrating.
    const business = d.cast.business || null;
    // A sustained beat is the SAME take: nobody re-enters and no pose replays.
    const continued = !!d.cast.continued;
    // LOOK-AT (Antidote 4.0): give a beat's cast something to look AT, so two
    // people in a shot face each other and a lone figure turns to the idea it is
    // discussing instead of staring at the lens. Assigned from the shot's own
    // intent; the renderer resolves it to a stage point (Scene.lookPointFor) and
    // no-ops when the target is absent, so this can never break a beat.
    const motifPresent = Array.isArray(d.props) && d.props.length > 0;
    const lookAtFor = (c) => {
      // dialogue / contrast shots → the two figures face each other
      if (d.shot === "twoShot" || d.shot === "split" || d.shot === "overShoulder") return "partner";
      // if holding an object with no dominant motif, look down to inspect the held prop
      if (c === 0 && business && business.holds && !motifPresent) return "heldProp";
      // the figure stands with its subject → it looks at the icon
      if ((d.shot === "illustration" || d.shot === "diorama") && motifPresent) return "motif";
      // a presenter with a motif on screen turns to it (lead only)
      if (motifPresent && c === 0 && (d.shot === "medium" || d.shot === "closeUp")) return "motif";
      // if callout is on screen and no motif, glance at text
      if (calloutAt != null && c === 0 && d.shot === "medium") return "callout";
      // wandering contemplative gaze on questions or stories
      if (d.class === "question" || d.class === "story") return "wander";
      return "viewer";
    };
    // TWINS: slot n>0 gets the next UNUSED cast key; with nobody distinct left an
    // unauthored two-person shot becomes a one-person medium. An authored cast
    // keeps the legacy resolution (the authored list overwrites the slots below).
    const artCastAuthored = !!(ART && ART[i] && Array.isArray(ART[i].cast));
    const artShotAuthored = !!(ART && ART[i] && typeof ART[i].shotOverride === "string" && ART[i].shotOverride);
    // An authored EMPTY cast is final: no slot is filled (cast-slots.js) and a
    // person-shot the author did not pick becomes a people-free one.
    const artCastEmpty = !isTitle && isEmptyAuthoredCast(ART && ART[i]);
    if (artCastEmpty) {
      const was = d.shot;
      d.shot = castFreeShot(d.shot, { shotAuthored: artShotAuthored });
      if (was === "split" && d.shot !== "split" && d.bg) {
        delete d.bg.split;
        if (d.bg.set === "none") {
          const a = ART[i];
          d.bg.set = (a.set && (!BOOK_LOCATIONS || BOOK_LOCATIONS.has(a.set))) ? a.set
            : BOOK_LOCATIONS ? (["abstract", "horizon", "stage"].find((x) => BOOK_LOCATIONS.has(x)) || [...BOOK_LOCATIONS][0]) : "room";
        }
      }
    }
    const slots = castSlots({
      resolve: castKeyFor, roles: d.cast.roles, count: artCastEmpty ? 0 : d.cast.count, shot: d.shot,
      castAuthored: artCastAuthored || isTitle, shotAuthored: artShotAuthored,
    });
    if (slots.dropped) {
      d.shot = slots.shot;
      // leaving split: its half-and-half backdrop and set "none" go with it
      if (slots.dropped === "split" && d.bg) {
        delete d.bg.split;
        if (d.bg.set === "none") {
          const a = ART && ART[i];
          d.bg.set = (a && a.set && (!BOOK_LOCATIONS || BOOK_LOCATIONS.has(a.set))) ? a.set
            : BOOK_LOCATIONS ? (["abstract", "horizon", "stage"].find((x) => BOOK_LOCATIONS.has(x)) || [...BOOK_LOCATIONS][0]) : "room";
        }
      }
    }
    for (let c = 0; c < slots.keys.length; c++) {
      const role = slots.keys[c];
      const isSecond = c > 0;
      const lead = c === 0 && !isTitle && business;
      const la = isTitle ? undefined : lookAtFor(c);
      const emotion = isTitle ? "none" : lead ? (d.emotion || detectEmotion(s.text, d.class)) : (isSecond ? "none" : (d.emotion || "none"));
      const emotionAt = calloutAt != null ? Math.max(4, calloutAt - 4) : 8;
      characters.push({
        id: `c${i}-${c}`,
        rig: "everyman",
        // P1.2: identity is the stable, book-scoped WHO (a story-bible cast
        // key); `role` stays the generic staging role. A named character may
        // not silently degrade into the generic presenter at render time, and
        // the firewall binds characterIntent.identity to this field.
        identity: role,
        role,
        // title scene is never authored (ART skips it): 'surprised' has no measured capability → UNRESOLVED hard gate; 'worried' is measured 0.947
        expression: isSecond ? (r.expression === "happy" ? "worried" : "neutral") : isTitle && r.expression === "surprised" ? "worried" : r.expression,
        ...(emotion && emotion !== "none" ? { emotion, emotionAt } : {}),
        enter: continued ? "none" : d.shot === "twoShot" || d.shot === "split" ? (c === 0 ? "left" : "right") : i % 2 === 0 ? "left" : "fade",
        ...(continued ? { poseAt: 60 } : {}),
        action: sanitizeAction(
          lead ? business.action : isTitle ? "talk" : isSecond ? (d.cast.secondaryAction || (r.action === "celebrate" ? "slump" : "idle")) : r.action,
          d.semanticConstraints?.forbiddenTropes,
        ),
        ...(lead && business.holds ? { holds: business.holds } : {}),
        ...(lead && business.travel ? { travel: business.travel } : {}),
        ...(d.cast.crowd && c === 0 ? { crowd: d.cast.crowd } : {}),
        ...(la ? { lookAt: la } : {}),
      });
    }
    // Faz 2: the art file may stage the PEOPLE, not just the icon. The mute test
    // found 18/30 frames carried by the callout alone — two neutral figures
    // standing still while the narration describes Penny purging the house.
    //   cast:       ["penny","carrie"] — who is on screen (story-bible cast keys)
    //   expression: the lead's face (neutral|happy|sad|surprised|worried)
    //   action:     the lead's body (point|slump|think|walk|sit|hold|reach|…)
    //   holds:      an object in the lead's hand (photo|letter|key|coin|…)
    // (the director may have put nobody on screen — an authored cast still stands,
    // except on a diagram beat, whose graphic is the whole frame)
    if (ART && ART[i] && !isTitle && (characters.length || (Array.isArray(ART[i].cast) && ART[i].cast.length && !diagram))) {
      const a = ART[i];
      const warn = (m) => console.warn(`  ⚠ art ${m} — ignored (scene ${i})`);
      if (Array.isArray(a.cast) && a.cast.length) {
        const want = a.cast.slice(0, 2).map((k) => castKeyFor(k));
        // The authored cast IS the people on screen. A two-person shot with one
        // authored person drew the lead twice ("two identical women", a mirrored
        // split); a one-person shot with two authored people dropped the second
        // (the women's-safety beat showed only Carter). overShoulder and split
        // draw one of two people as a black cut-out — nobody can tell who it is.
        const TWO = new Set(["twoShot", "split", "overShoulder"]);
        const wasSplit = d.shot === "split";
        const own = typeof a.shotOverride === "string" && a.shotOverride;
        // crowd multiplies the lead into 8-10 look-alikes ("ghost duplicates", SBC run6 #38/#181):
        // never for an authored cast unless the author asked for the crowd
        if (d.shot === "crowd" && !own) d.shot = want.length === 2 ? "twoShot" : "medium";
        if (want.length === 1 && TWO.has(d.shot) && !own) d.shot = "medium";
        if (want.length === 2 && !own && (d.shot === "split" || d.shot === "overShoulder" || d.shot === "medium" || d.shot === "closeUp" || d.shot === "lowAngle")) d.shot = "twoShot";
        // an authored embrace is two people facing each other: never a silhouette/insert/illustration of it
        if (want.length === 2 && !own && a.action === "embrace") d.shot = "twoShot";
        // leaving split: its half-and-half backdrop and set "none" go with it
        if (wasSplit && d.shot !== "split" && d.bg) {
          delete d.bg.split;
          if (d.bg.set === "none") d.bg.set = (a.set && (!BOOK_LOCATIONS || BOOK_LOCATIONS.has(a.set))) ? a.set : BOOK_LOCATIONS ? [...BOOK_LOCATIONS][0] : "room";
        }
        // an authored person on a figure-less shot (insert) needs a shot that holds people
        if (!characters.length && d.shot === "insert" && !own) d.shot = want.length === 2 ? "twoShot" : "medium";
        const tmpl = characters[0] || { rig: "everyman", enter: "fade", lookAt: "viewer" };
        characters.length = Math.min(characters.length, want.length);
        while (characters.length < want.length) {
          characters.push({ ...tmpl, id: `c${i}-${characters.length}`, expression: "neutral", action: "idle", holds: undefined, emotion: undefined });
        }
        want.forEach((key, n) => {
          characters[n].role = key;
          characters[n].identity = key;
          if (d.shot === "twoShot") { characters[n].enter = n === 0 ? "left" : "right"; characters[n].lookAt = "partner"; }
          // a named, authored person is drawn as the person, never as a cut-out
          characters[n].silhouette = false;
          if (d.shot !== "crowd") delete characters[n].crowd;
        });
      }
      // Emotion overlays (fire / sweat / lightbulb) are the engine's regex guess,
      // not an authored decision; a flame over a calm man's head read as "he is on
      // fire" (Southern Book Club #71, F451 #223). Authored beats carry none.
      characters.forEach((ch) => { delete ch.emotion; delete ch.emotionAt; });
      const L = characters[0];
      if (a.expression) {
        if (EXPRESSIONS.has(a.expression)) L.expression = a.expression; else warn(`expression "${a.expression}"`);
      }
      if (a.holds) {
        if (HAND_PROPS.has(a.holds)) { L.holds = a.holds; L.action = "hold"; if (!motifPresent) L.lookAt = "heldProp"; }
        else warn(`holds "${a.holds}"`);
      }
      if (a.action) {
        if (CHAR_ACTIONS.has(a.action)) L.action = sanitizeAction(a.action, d.semanticConstraints?.forbiddenTropes);
        else warn(`action "${a.action}"`);
      }
      // A fight, a grab or a struggle takes two. The art file authors only the lead's body, so the
      // second person's is the planner's own default (idle) — which drew a man punching
      // a bystander. Their reaction follows from the authored verb; nothing authored changes.
      // An embrace takes two who hold each other: the partner embraces back (2026-10-20).
      // THE SECOND PERSON of an authored two-person cast (2026-10-22, lib/partner-contract.js): the verb's pair
      // (fighting / grabbing / struggling / embrace), else the author's `partnerAction`, else idle; the author's
      // `partnerExpression`, else neutral. The planner's own partner defaults above (a worried face beside a happy
      // lead, a slump beside a celebration) are inventions on an authored beat and are replaced here; beats whose
      // cast the author did not write keep the legacy behaviour.
      const authoredPair = Array.isArray(a.cast) && a.cast.length >= 2 && characters[1];
      if (authoredPair) {
        let pa = a.partnerAction;
        if (pa != null && !CHAR_ACTIONS.has(pa)) { warn(`partnerAction "${pa}"`); pa = undefined; }
        characters[1].action = sanitizeAction(partnerActionFor(L.action, pa), d.semanticConstraints?.forbiddenTropes);
        characters[1].expression = a.partnerExpression && EXPRESSIONS.has(a.partnerExpression) ? a.partnerExpression : "neutral";
        if (a.partnerExpression && !EXPRESSIONS.has(a.partnerExpression)) warn(`partnerExpression "${a.partnerExpression}"`);
      }
      // AUTHORED ACTION MOMENT (take / embrace): the author's `actionCue` phrase, word-timed (same anchor as the
      // callouts); else the movement's own default (40% of the beat). Both figures of an embrace share it.
      if ((L.action === "take" || L.action === "embrace") && a.actionCue) {
        const cueAt = anchorAt(s, a.actionCue, null, durationFrames + MIN_HOLD);
        if (cueAt == null) warn(`actionCue "${a.actionCue}" is not spoken in this beat — the ${L.action} happens at 40% of the beat`);
        else {
          const at = Math.min(cueAt, Math.max(0, durationFrames - 1));
          L.actionAt = at;
          if (L.action === "embrace" && characters[1]) characters[1].actionAt = at;
        }
      }
      // The illustration/diorama presets draw the lead as a flat black cut-out —
      // which hides exactly what was just authored (face, held object, WHO it is).
      // A staged lead is drawn as the person. (The silhouette shot and the
      // overShoulder foreground stay cut-outs on purpose.)
      const staged = a.expression || a.holds || a.action || Array.isArray(a.cast);
      if (staged && (d.shot === "illustration" || d.shot === "diorama")) L.silhouette = false;
    }

    // Motif timing, hoisted so the pulse clock can see where the last event is.
    // A motif illustrates the idea, so it should arrive with it. On the icon shots
    // (insert / illustration / diorama / beforeAfter) the icon IS the shot, so keep
    // the director's own `at` (0, or the beforeAfter stagger).
    //
    // Otherwise a metaphor motif leads the callout slightly - but only as far as
    // MOTIF_LATEST. Callouts are word-anchored (anchorAt lands the type on the frame
    // its phrase is actually spoken), so an authored callout quoting a phrase spoken
    // late in its scene used to drag the motif late with it and the scene opened on
    // a frozen frame. QUANTITY motifs are exempt and still lead the callout: they
    // animate their own value, so firing one at the cut means a counter finishes
    // counting before its number is spoken. The clamp is monotone - it can only move
    // a motif EARLIER, never later.
    const props = d.props.map((p) => ({
      ...p,
      at: ["insert", "illustration", "diorama", "beforeAfter"].includes(d.shot)
        ? (p.at ?? 0)
        : calloutAt != null
          ? QUANTITY_MOTIFS.has(p.type)
            ? Math.max(0, calloutAt - 8)
            : Math.min(MOTIF_LATEST, Math.max(0, calloutAt - 8))
          : MOTIF_LATEST,
    }));
    // AUTHORED ICON BEHAVIOUR (art.json `conceptMotion`, 2026-10-19): only what the author
    // asked for, only on the beat's own concept icon, only where the icon draws it
    // (CONCEPT_MOTIONS). Word-synced start: the author's `conceptMotionCue` phrase, else the
    // callout's anchored word, else the icon's own arrival. Never set automatically.
    if (!isTitle && ART && ART[i] && ART[i].conceptMotion) {
      const a = ART[i];
      const ok = (CONCEPT_MOTIONS[a.concept] || []).includes(a.conceptMotion);
      const target = ok ? props.find((p) => p.type === a.concept) : null;
      if (!target) {
        console.warn(`  ⚠ art conceptMotion "${a.conceptMotion}" on concept "${a.concept}" — ${ok ? "the icon is not on screen" : "that icon has no such motion"}; ignored (scene ${i})`);
      } else {
        let cue = null;
        if (a.conceptMotionCue) {
          // on the word itself: a motion needs no MIN_HOLD reading time (that clamp is for copy)
          cue = anchorAt(s, a.conceptMotionCue, null, durationFrames + MIN_HOLD);
          if (cue != null) cue = Math.min(cue, Math.max(0, durationFrames - 1));
          if (cue == null) console.warn(`  ⚠ art conceptMotionCue "${a.conceptMotionCue}" is not spoken in scene ${i} — the motion starts on the callout instead`);
        }
        if (cue == null) cue = calloutAt != null ? calloutAt : (target.at ?? 0);
        target.motion = a.conceptMotion;
        target.motionAt = Math.max(target.at ?? 0, cue);
      }
    }

    // The pulse clock is handed everything this scene already does, so it only
    // fills the gaps between them — a scene that is already busy throughout gets
    // no pulses at all.
    const ownEvents = [
      calloutAt,
      d.camera && d.camera.punch ? d.camera.punch.at : null,
      ...props.map((p) => p.at ?? 0),
    ];
    const pulses = pulseClock(s, ownEvents, durationFrames);
    const cam = pulses.length ? { ...d.camera, pulses } : d.camera;

    // ── RETENTION HUD PER-SCENE AUTO-TAGGING ──────────────────────────────────
    const totalScenes = scenes.length;
    const totalInsights = Math.max(3, Math.min(8, Math.ceil(totalScenes / 12)));
    const insightNum = Math.min(totalInsights, Math.floor((i / totalScenes) * totalInsights) + 1);
    const CONCEPT_HUMAN_LABELS = {
      alarmClock: "THE SNOOZE BUTTON",
      butterfly: "THE BUTTERFLY EFFECT",
      subway: "THE MISSED TRAIN",
      car: "ONE WRONG TURN",
      coffee: "MORNING ROUTINE",
      hourglass: "PASSAGE OF TIME",
      zap: "THE TURNING POINT",
      dominoCascade: "CHAIN REACTION",
      icebergDepth: "HIDDEN DEPTHS",
      funnelTrap: "RUTHLESS FOCUS",
      codeWindow: "SOFTWARE SYSTEM",
      laptopMockup: "DIGITAL PLATFORM",
      rocketLaunch: "STARTUP LAUNCH",
      dollarExchange: "THE MARKETPLACE",
      shield: "RISK & DEFENSE",
      target: "CLEAR OBJECTIVE",
      trophy: "THE WINNING EDGE",
      sword: "DECISIVE ACTION",
      magnifier: "UNDER THE LENS",
      wallet: "FINANCIAL STAKE",
      gift: "RECIPROCITY",
      road: "THE UNSEEN PATH",
      crash: "SYSTEM COLLAPSE",
      war: "GLOBAL CONFLICT",
    };

    const firstText = texts[0] && texts[0].text ? texts[0].text.replace(/[\r\n]+/g, " ").trim() : "";
    // THE HUD LABEL IS A CHAPTER SLOT, NOT AN ICON NAME.
    //
    // It used to lead with the beat's concept, so a loose regex hit became a
    // confident WORD standing on screen for the whole scene: "SCHOOL" over a
    // beat where Siddhartha goes to Kamala's grove, because the narration said
    // "teacher". A wrong icon is a bad picture; a wrong label is a false
    // caption, and it persists.
    //
    // The story bible's `spine` says which act we are in — a stable, correct
    // thing to name — so it wins when there is one. Everything below it is the
    // previous chain, so a book with no bible is untouched.
    const act = ACT_AT(s.from);
    const hudTopic =
      (act ? String(act).toUpperCase() : "") ||
      (d.concept && CONCEPT_HUMAN_LABELS[d.concept]) ||
      (firstText && firstText.length <= 32 ? firstText.toUpperCase() : "") ||
      (d.concept ? String(d.concept).replace(/([A-Z])/g, " $1").toUpperCase() : "") ||
      (TITLE || "INSIGHT").toUpperCase();

    const hud = isTitle || d.shot === "chapterCard"
      ? { hidden: true }
      : {
          badge: `INSIGHT ${String(insightNum).padStart(2, "0")} / ${String(totalInsights).padStart(2, "0")}`,
          topic: hudTopic,
        };

    // AUTHORED CONTINUATION (art.json `"continue": true`, 2026-10-19): this beat keeps the
    // previous beat's stage. Only the author sets it (never the planner); the scene gets
    // `continueFromPrev` and a 0-frame cut, and the renderer keeps whoever/whatever was
    // already on screen (src/engines/antidote/continuity.ts). Nothing else is filled in.
    const authorContinue = !isTitle && i > 0 && !!(ART && ART[i] && ART[i].continue === true);
    const rawScene = {
      id: isTitle ? "intro" : `scene-${String(i).padStart(2, "0")}`,
      fromFrame: s.from,
      durationFrames: Math.max(FPS, durationFrames),
      hud,
      _narration: s.text.slice(0, 160), // hint for Claude's art-direction; safe to delete
      // Authored "no icon" (art file concept: null). Post-plan engines (chapter
      // payoff, novelty hero metaphor, stagnation remedy) must not decorate it —
      // the P3 mute test found their icons on beats the author left clean.
      // Faz 0: a beat with no authored concept is "no icon" too — the engines
      // above may not guess one for it.
      ...(!d.concept ? { _noIcon: true } : {}),
      // Faz 0 provenance: who decided this beat's picture. Read by
      // scripts/gate-authorship.js (config-only, so it also runs in a render bundle).
      _authorship: authorshipStamp({
        art: ART ? ART[i] : null,
        brief,
        propTypes: authoredPropTypes,
        diagramAuthored: !!(diagram && diagram.authored),
        // P9-A A3: the authored icon decision, sealed BEFORE the world-vocab
        // gate can quietly discard it. A scene with conceptAuthored but no
        // icon now PROVES the engine lost author-given meaning (the O3
        // telemetry and gate-authorship read this field).
        conceptAuthored: ART && ART[i] && hasOwn(ART[i], "concept") ? ART[i].concept : (brief && brief.antidote && brief.antidote.concept != null ? brief.antidote.concept : null),
        // P9-B: the authored two-pole proposition, sealed verbatim (compact).
        // Detector-grade briefs are NOT sealed — the gate judges author-given
        // meaning only. scripts/lib/proposition.js owns the shape.
        propositionAuthored: brief && brief.proposition && brief.proposition.src === "author"
          ? propositionSeal(brief.proposition)
          : null,
      }),
      _semanticAdapter: {
        archetype: semanticAdapter.archetype,
        requiredActions: semanticAdapter.requiredActions,
        reason: semanticAdapter.reason,
        applied: !!semanticAdapter.override,
        // Exact, machine-readable VisualIntent transport. This is audit data,
        // not a second Gate and not a production-config policy change.
        provenance: semanticAdapter.provenance,
        grammar: d.semanticGrammar || null,
        payload: semanticPayload,
      },
      // P1.1: an author may attach a complete, book-scoped contract in the
      // matching beat brief. We intentionally do not invent this data from a
      // regex: an absent contract must fail the firewall, not become a fake PASS.
      ...(brief?.narrativeAtom ? { narrativeAtom: brief.narrativeAtom } : {}),
      ...(brief?.visualIntent ? { visualIntent: brief.visualIntent } : {}),
      ...(brief?.visualContract ? { visualContract: brief.visualContract } : {}),
      ...(briefSubject ? { _subject: briefSubject } : {}),
      _beat: d.class, // which beat class the director read; safe to delete
      _act: d.act, // where the color script places this beat; safe to delete
      ...(d.sustain ? { _take: "sustained" } : {}), // continues the previous shot; safe to delete
      ...(d.concept ? { concept: d.concept } : {}), // the beat's literal subject (icon)
      ...(diagram ? { diagram } : {}), // explanatory graphic — the hero of the beat (4.0)
      ...(process.env.ANTIDOTE_EXPERIMENT_RELATIONSHIP !== "0" && ART && ART[i] && ART[i].relationship ? { relationship: ART[i].relationship } : {}), // EXPERIMENT (flag off by default): carry the authored, source-grounded relationship
      ...(process.env.ANTIDOTE_EXPERIMENT_RELATIONSHIP_STAGING !== "0" && ART && ART[i] && ART[i].relationship && ART[i].stageRelationship === true ? ((st) => (st ? { relationshipStaging: st } : {}))(require("./lib/relationship-staging").relationshipStaging(ART[i].relationship, abs.bookDir(SLUG), { words, fromFrame: s.from, durationFrames: Math.max(FPS, durationFrames), fps: FPS })) : {}), // EXPERIMENT (flag off by default): book-independent control-by-narrative staging
      shot: d.shot,
      transition: authorContinue ? { type: "cut", frames: 0 } : d.transition,
      ...(authorContinue ? { continueFromPrev: true } : {}),
      bg: d.bg,
      camera: cam,
      characters: process.env.ANTIDOTE_EXPERIMENT_RELATIONSHIP_STAGING !== "0" && ART && ART[i] && ART[i].stageRelationship === true && Array.isArray(ART[i].cast) && ART[i].cast.length === 0 ? [] : characters, // EXPERIMENT: an authored empty cast on a relationship-staged beat is drawn as written
      props,
      texts,
    };
    // the lock is sealed further down, so tell the repair here that the cast is authored-empty
    const repaired = brief ? applyContractRepair(rawScene, brief, PAL, { castEmpty: artCastEmpty }) : { scene: rawScene, problems: [] };
    const out = repaired.scene;
    if (repaired.problems.length) unresolvedAuthored.push(...repaired.problems);
    // The beat brief may demand people (mustShow characters) where the author put
    // nobody: never fill the authored empty cast — the plan stops (P0.2 pattern).
    if (artCastEmpty && (out.characters || []).length) {
      unresolvedAuthored.push({ sceneId: out.id, rule: "UNRESOLVED", field: "cast", message: `scene ${out.id} was authored with cast [] but its beat brief requires characters — re-author this beat (no figure is added)` });
    }
    // ── P1.4 PHASE C: Semantic Visual Strategy (declarative record + additive evidence) ──
    // decideStrategy() is PURE (zero mutation, asserted in tests): it reads the
    // beat's atom, the post-contract-repair scene and the measured capability
    // map. `_visualStrategy` is the RECORD of the decision — metadata like
    // `_authorship`; the firewall never reads it. The enforceable
    // requirementFor() result is copied INTO the scene's own
    // VisualContract.visualEvidence when one exists (authored-brief passthrough
    // :983), so the firewall can enforce evidence ⇄ real scene.
    // ── P1.4 PHASE D: authored-action lifecycle (D1–D4) ────────────────────
    // ORDERING CONTRACT (operator, D review): applyContractRepair →
    // decideStrategy → resolveStrategy (plan-tagged repairs: push→point,
    // grab→reach) → record → STAGING LOCK. The repairs are applied HERE, BEFORE
    // the lock seals the scene, so the lock seals the REPAIRED action:
    // gate-authorship --restore then restores the enum-valid repaired action and
    // can never resurrect a schema-external one (the authored original lives in
    // the art file + the resolution record). sanitizeAction's swap
    // (celebrate→think) stays INSIDE the enum and outlives this block; the
    // resolution record is what makes it non-silent.
    const enumActions = new Set(RENDERER_ACTIONS);
    const strategyRecord = decideStrategy({ atom: narrativeAtom, scene: out, narration: s.text, capabilityMap: CAPABILITY_MAP, enumActions });
    const resolution = resolveStrategy(strategyRecord, { scene: out, enumActions });
    // P1.5: the requirement is CAST-AWARE (two-person SAFE → closeUp; solo →
    // diorama) and is STAGED on the scene (P1.5a-d, operator sign-off): only
    // levers the renderer draws today; authored beats and titles are NEVER
    // restaged (their unmet requirement stays visible); nothing is invented.
    // Runs BEFORE the lock, inside the D ordering contract, so the lock seals
    // the staged representation too. The staging is plan-tagged on the record.
    const requirement = requirementFor(strategyRecord, CAPABILITY_MAP, out);
    const staging = stageRequirement(requirement, { scene: out, isTitle });
    out._visualStrategy = {
      strategy: strategyRecord.strategy,
      risks: strategyRecord.risks,
      capabilityConfidence: strategyRecord.capabilityConfidence,
      // the signature describes the scene that SHIPS: refreshed over the
      // repaired final state; the resolution documents the authored→final delta
      // (a pre-repair signature would make PHASE E read the recorded repair as
      // a post-plan semantic mutation)
      semanticSignature: semanticSignature({ atom: narrativeAtom, scene: out }),
      levers: strategyRecord.levers,
      requirement,
      evidence: strategyRecord.evidence,
      resolution: { kind: resolution.kind, repairs: resolution.repairs, invalidActions: resolution.invalidActions, note: resolution.note },
      staging: { staged: staging.staged, skipped: staging.skipped || null },
      provenance: { decidedAt: "plan", capabilityMap: "data/visual-capability.json" },
      note: strategyRecord.note,
    };
    if (requirement && out.visualContract && out.visualContract.visualEvidence) {
      // COPY-ON-WRITE: out.visualContract may be the authored brief's object
      // (:983 passthrough shares it across scenes with identical narration
      // fingerprints) — mutating it in place would leak this scene's requirement
      // into every other scene that brief serves. Only the additive
      // `representation` key is added, on the scene's own copy.
      out.visualContract = {
        ...out.visualContract,
        visualEvidence: { ...out.visualContract.visualEvidence, representation: requirement },
      };
    }
    // ── P9-B: stage the AUTHORED proposition's poles (before the lock seals it) ──
    // Only src:"author" seals stage; the levers are the renderer's own (shot
    // split/beforeAfter/twoShot, authored flow diagram, per-cast face/action/
    // holds, pole icon); every skip is recorded on the scene. The gate then
    // verifies the two poles from the config alone (stagedPoles).
    if (!isTitle && out._authorship && out._authorship.propositionAuthored) {
      const propStage = stageProposition(out._authorship.propositionAuthored, out, {
        expressionEnum: EXPRESSIONS, actionEnum: CHAR_ACTIONS, holdsEnum: HAND_PROPS, sceneIcons: SCENE_ICONS,
      });
      if (propStage.staged.length || propStage.skipped.length) {
        out._propositionStaging = { staged: propStage.staged, skipped: propStage.skipped };
        propStagedCount += propStage.staged.length ? 1 : 0;
      }
    }
    // P10.2a VISUAL COMPILER HOOK — the ONE sanctioned integration point:
    // AFTER proposition staging, BEFORE the _authorship.lock seal. The author's
    // `visual` block (if present) is compiled into claim-checked props; existing
    // props are never mutated or removed; compiled types are APPENDED to the
    // already-created _authorship.propTypes (the one post-creation extension,
    // legal pre-lock); provenance lands in _authorship.visualCompiled. The lock
    // below then seals the combined set exactly as it seals any staged prop.
    // R4 IS A HARD PLAN ERROR (review fix): a subject that is both requested
    // and forbidden means the brief contradicts itself — the compiler THROWS
    // and the hook stops the plan (same shape as the unresolvedAuthored / art
    // mismatch exits above). The earlier metadata-only catch shipped a filmed
    // lie without a gate signal; refuse the plan instead.
    if (!isTitle && brief && brief.visual && out._authorship) {
      let vc = null;
      try { vc = compileVisual(brief.visual); }
      catch (e) {
        console.error(`\n❌ ${SLUG} beat ${i}: the authored visual block violates R4 — the plan stops:`);
        console.error(`   ${String(e.message || e)}`);
        console.error(`   Fix the beat brief's visual.claims/forbidden lists, then re-plan. Nothing was written.`);
        process.exit(1);
      }
      const existingTypes = new Set((out.props || []).map((p) => p && p.type).filter(Boolean));
      const addedProps = [];
      for (const p of vc.props || []) {
        if (!p || !p.type) continue;                       // defensive; compile never emits these
        if (existingTypes.has(p.type)) {                   // first-writer-wins (design §3)
          vc.dropped = vc.dropped || [];
          vc.dropped.push({ requested: p.type, reason: "duplicate: a prop of this type is already on the scene (first-writer-wins)" });
          continue;
        }
        existingTypes.add(p.type);
        // map the compiled claim-slot prop onto the renderer's own PropSpec
        // levers — geometry (x/y/scale) comes from composeFrame only, colors
        // come from the compiler? No: the compiler is palette-blind; the
        // renderer's own accent chain colors them. (P10.1 lesson.)
        addedProps.push({
          type: p.type,
          x: p.x, y: p.y, scale: p.scale,
          at: p.at || 0,
          enter: p.enter || "fade",
          ...(Number.isInteger(p.stateIndex) ? { stateIndex: p.stateIndex } : {}),
          _visualClaim: p.role || p.type,
        });
      }
      out.props = [...(out.props || []), ...addedProps];
      // append compiled types to the existing stamp's propTypes (pre-lock)
      for (const p of addedProps) {
        const t = p.type;
        if (!out._authorship.propTypes.includes(t)) out._authorship.propTypes.push(t);
      }
      out._authorship.visualCompiled = {
        hook: "post-staging/pre-lock (P10.2a §3a)",
        ok: vc.ok,
        errors: vc.errors || [],
        claims: vc.claims || [],
        unrepresentable: vc.unrepresentable || [],
        dropped: vc.dropped || [],
        composition: vc.composition || null,
        certificate: vc.certificate || null,
        forbidden: Array.isArray(brief.visual.forbidden) ? brief.visual.forbidden : [], // sealed for the config-only gate sweep
        props: addedProps.map((p, idx) => ({ index: (out.props.length - addedProps.length) + idx, type: p.type, claim: p._visualClaim })),
        pixel: { evidenceStrength: "unverified", record: null }, // filled by p10.2a-render-verify
      };
    }
    // STAGING LOCK: what the art file staged is sealed here, AFTER the strategy
    // repairs (P1.4 PHASE D ordering contract), so no later engine (VIG floor,
    // stagnation remedies, semantic enforcement) can silently restage it — and
    // gate-authorship --restore restores the enum-valid REPAIRED action, never a
    // schema-external authored original. The gate FAILs on a drift.
    const A = ART && ART[i];
    // what EVERY authored beat seals, staged or not (2026-10-20, burn 217/236): its own callout text(s) and
    // that it is a scene, not a chapter card. `planShot` lets --restore undo a card without sealing the
    // engine-chosen shot of a beat whose staging the author left to the engine.
    const artTexts = (out.texts || []).filter((t) => t && t.src === "art").map((t) => JSON.parse(JSON.stringify(t)));
    const beatSeal = { planShot: out.shot, ...(artTexts.length ? { artTexts } : {}) };
    if (A && !isTitle && out._authorship && !(Array.isArray(A.cast) || A.expression || A.action || A.holds || A.set || A.shotOverride || A.conceptMotion || authorContinue)) {
      // ICON + CALLOUT only (no staging authored): seal the icon and the callout, never the engine's shot/set/cast.
      out._authorship.lock = {
        ...beatSeal,
        concept: out.concept ?? null,
        props: JSON.parse(JSON.stringify(out.props || [])),
        propTypes: (out.props || []).map((p) => p && p.type).filter(Boolean),
      };
    }
    if (A && !isTitle && out._authorship && (Array.isArray(A.cast) || A.expression || A.action || A.holds || A.set || A.shotOverride || A.conceptMotion || authorContinue)) {
      const c0 = (out.characters || [])[0] || {};
      out._authorship.lock = {
        ...beatSeal,
        shot: out.shot, set: out.bg ? out.bg.set : null,
        // only an AUTHORED cast is sealed; an engine-chosen one is not the author's
        cast: lockedCast(A, out.characters),
        expression: c0.expression || null, action: c0.action || null, holds: c0.holds || null,
        // the authored action moment, and the partner's reciprocal body (embrace: the partner embraces back)
        ...(c0.actionAt != null ? { actionAt: c0.actionAt } : {}),
        // an authored two-person cast seals the partner too (2026-10-22): what the planner set from the author
        // (or the verb's pair, or the neutral / idle default) is the decision; a later engine change is drift
        ...((c0.action === "embrace" || (Array.isArray(A.cast) && A.cast.length >= 2)) && (out.characters || [])[1] ? { partnerAction: out.characters[1].action || null } : {}),
        ...((A.partnerExpression || (Array.isArray(A.cast) && A.cast.length >= 2)) && (out.characters || [])[1] ? { partnerExpression: out.characters[1].expression || null } : {}),
        // P0.2 — the ICON is an authored decision too. Sealed here so no later
        // engine can swap it and so gate-authorship --restore can put it back
        // (it used to be the one authored field the lock did not cover).
        concept: out.concept ?? null,
        props: JSON.parse(JSON.stringify(out.props || [])),
        propTypes: (out.props || []).map((p) => p && p.type).filter(Boolean),
        // the authored icon behaviour (conceptMotion) rides in props[].motion; named here
        // so the gate can say WHAT was lost when an engine rebuilds the icon
        ...((out.props || []).some((p) => p && p.motion) ? { conceptMotion: (out.props.find((p) => p && p.motion) || {}).motion } : {}),
        // the authored continuation (art.json `continue`): the gate reports it lost, --restore puts it back
        ...(authorContinue ? { continue: true } : {}),
      };
    }
    lastPlannedShot = out.shot;
    return out;
  });

  // NEWCOMERS ENTER (2026-10-19): on any continuation (authored `continue` or the
  // director's sustained take) a person who was NOT on screen in the previous scene makes
  // a normal entrance. The sustained take stamps every figure `enter: "none"`, and an
  // authored cast applied afterwards could swap WHO stands there (burn scene-97: diem ->
  // luther with no entrance). Runs after every scene exists, so it sees the real cast.
  {
    const entered = enterNewcomers(sceneSpecs, (shot) => !shotPreset(shot).dropsCast);
    if (entered.length) console.log(`↳ ${entered.length} figure(s) new to a continued take given a normal entrance: ${entered.slice(0, 8).join(", ")}${entered.length > 8 ? " …" : ""}`);
  }

  if (unresolvedAuthored.length) {
    console.error(`\n❌ ${unresolvedAuthored.length} authored beat(s) contradict their own beat brief — the plan stops here (never substitute an authored decision, invariant 1):`);
    for (const p of unresolvedAuthored) console.error(`   - ${p.sceneId} [${p.field}]: ${p.message}`);
    console.error(`   Re-author those beats in the art file or the beat briefs, then re-plan. ${rel.antidoteConfig(SLUG)} was NOT written.\n`);
    process.exit(1);
  }

  // P1.4 PHASE D: UNRESOLVED is no longer report-only. Every UNRESOLVED scene
  // carries the explicit resolution on its record; the firewall turns
  // `unresolved_no_proof` into a HARD violation unless the scene itself carries
  // the proof (contract/authorship evidence), so production PASS requires the
  // lifecycle's exit (operator acceptance criterion D3). A scene whose
  // resolution kind is `repaired` is NOT unresolved — its repairs superseded
  // the enum-caused UNRESOLVED record and the firewall passes it.
  const unresolvedStrategy = sceneSpecs.filter((sc) => sc._visualStrategy && sc._visualStrategy.strategy === "UNRESOLVED" && sc._visualStrategy.resolution && sc._visualStrategy.resolution.kind !== "repaired");
  const repairedStrategy = sceneSpecs.filter((sc) => sc._visualStrategy && sc._visualStrategy.resolution && sc._visualStrategy.resolution.kind === "repaired");
  if (repairedStrategy.length) console.log(`↺ ${repairedStrategy.length} scene(s) had schema-external actions repaired to renderer-enum actions (plan-tagged; each scene's resolution carries from→to).`);
  if (unresolvedStrategy.length) {
    console.warn(`⚠ ${unresolvedStrategy.length} scene(s) UNRESOLVED by the visual strategy (HARD-failed at the firewall unless the scene proves its state — PHASE D):`);
    for (const sc of unresolvedStrategy.slice(0, 10)) console.warn(`   - ${sc.id} [${(sc._visualStrategy.risks || []).join(",")}]: ${(sc._visualStrategy.evidence && sc._visualStrategy.evidence.note) || "no reason recorded"}`);
    if (unresolvedStrategy.length > 10) console.warn(`   … and ${unresolvedStrategy.length - 10} more`);
  }

  // ── Claude handoff: dump the beats and stop, so the copy can be authored ──
  // The heuristic copywriter is deliberate about scarcity, so many beats come
  // back with `callout: null` — that means "this frame stays silent", not "fill
  // me in". Claude should rewrite the weak ones and leave the quiet ones quiet.
  if (EMIT_BEATS) {
    const payload = {
      book: { slug: SLUG, title: TITLE, author: AUTHOR, genre: GENRE },
      instructions: [
        "Rewrite `callout.text` per beat: 2-4 words, concrete and loaded, in the viewer's second person where it fits.",
        "NEVER an abstract noun (ORGANIZATION / MANAGEMENT / INFORMATION). Prefer what a person can see, feel or do.",
        "Set callout to null when the beat has no hook worth stamping — silence is a valid, good choice.",
        "`style`: reveal (3-4 words) | highlight (2 words) | strike (a negation) | outline (a real stat) | box | stack.",
        "`concept`: the beat's LITERAL subject → a scene icon that gets shown instead of talking heads.",
        `  Allowed: ${SCENE_ICONS.join(", ")}. Set a string when the beat is really ABOUT that thing`,
        "  (a crash, a home, a lake, a wall of notes); null or omitted = no icon (there is no lexicon",
        "  fallback). Use only when it's the true subject — a wrong icon is worse than none. The icon must",
        "  be in the book's story-bible visualProvenance.allowedMotifs or it is dropped with a warning.",
        "`set` (optional): the location, one of the renderer's sets — honoured as written.",
        "`shotOverride` (optional): force a framing. `shot` above is only the director's first guess.",
        "The director stages the body itself from the concept — a beat whose subject is a",
        "  letter/phone/key/photo/book/coin/mirror/mask/idea/compass/meal/love/job/court puts that",
        "  object IN THE LEAD'S HAND, an outdoor beat can make them walk across the set, an indoor",
        "  one can sit them down. You do not author that here; naming the right `concept` is what",
        "  turns it on. A wrong concept costs more now than it used to.",
        "`diagram`: an EXPLANATORY self-drawing graphic that BECOMES the whole beat (cast dropped,",
        "  no callout). Author one ONLY on a genuinely conceptual beat; leave null otherwise — a weak",
        "  or generic diagram is worse than none. Use at most a handful across the whole book. Shape:",
        "  { type, title?, labels[], values[] }, where type is one of:",
        "    sorter   — a taxonomy sorting into buckets. labels = the 2-4 category names; values = optional per-bucket counts.",
        "    matchWave— two rhythms drifting then locking into sync. labels[0] = the payoff word (e.g. IN SYNC).",
        "    flow     — a cause→effect chain. labels = 2-3 ordered node names.",
        "    spectrum — a marker on a continuum. labels = [leftPole, rightPole]; values = [0..1 marker position].",
        "  Keep labels 1-2 words. Best on the beat that first NAMES a framework, a sync, a process or a scale.",
        // P3 blind mute test (audit/p3-mute-test/REPORT.md): these were the frames a
        // muted viewer could not read even though every gate passed.
        "`concept: null` means NO icon on this beat (not even a decorative one); omitting the key is ALSO no icon — there is no lexicon fallback (Faz 0). Every beat needs an entry; an unauthored beat fails gate-authorship.",
        "Do not leave a beat silent when its narration names concrete things (a list of objects, an anecdote, a person doing something) — give it the narrator's phrase or the object.",
        "Prefer the narrator's concrete phrase over an abstract metaphor label (\"PAUSE THE IMPULSE\", not \"A LOGIC FILTER\").",
        "A diagram title must not promise a shape its type cannot draw (no \"LOOP\"/\"PYRAMID\" on a straight flow).",
        "Keep the array order and length. Then re-run plan-antidote with --callouts=<this file>.",
        "After re-running: node scripts/audit-antidote.js --slug=<slug> — it FAILS the plan if any",
        "  window runs longer than 8s with nothing happening on screen.",
      ],
      beats: sceneSpecs.map((sc, i) => ({
        i,
        shot: sc.shot,
        beat: sc._beat,
        concept: sc.concept ?? null,
        diagram: sc.diagram ?? null,
        narration: scenes[i].text,
        callout: sc.texts.length ? { text: sc.texts[sc.texts.length - 1].text, style: sc.texts[sc.texts.length - 1].style } : null,
      })),
    };
    fs.writeFileSync(EMIT_BEATS, JSON.stringify(payload, null, 2) + "\n");
    const filled = payload.beats.filter((b) => b.callout).length;
    console.log(`✓ ${EMIT_BEATS} — ${payload.beats.length} beat, ${filled} heuristik callout (${payload.beats.length - filled} sessiz)`);
    console.log(`  Claude callout'ları yeniden yazdıktan sonra:`);
    console.log(`  node scripts/plan-antidote.js --callouts=${EMIT_BEATS} --vtt=${VTT} --slug=${SLUG} --title="${TITLE}" --genre=${GENRE}`);
    return;
  }

  const durationInFrames = sceneSpecs.length ? sceneSpecs[sceneSpecs.length - 1].fromFrame + sceneSpecs[sceneSpecs.length - 1].durationFrames : 0;
  const audio = fs.existsSync(abs.audio(SLUG)) ? rel.audio(SLUG).replace(/^public\//, "") : undefined;

  // Thumbnail brief scaffold — Claude ART-DIRECTS the `hook` (≤4 words, book-specific
  // AND original, NOT the title) and may tune the variant/action/motif. The PALETTE
  // is NOT here: it lives in books/<slug>/book.json (BOOK_PALETTES) so the video and
  // thumbnail share one color identity. Registered as Thumb-<slug> when engine=antidote.
  let thumbnail = {
    hook: emphasisWords(TITLE, 2).join(" ") || TITLE.toUpperCase(),
    _needsClaudeRefine: true, // replace hook with an original ≤4-word book-specific line
    variant: { ...(CAST_BIBLE.narrator || Object.values(CAST_BIBLE)[0]).variant, expression: "happy" },
    action: "celebrate",
    expression: "happy",
    motif: "risingBars",
  };
  // Re-planning a book (new shot grammar, retimed VTT…) must never throw away a
  // hand-refined thumbnail brief — the baked PNG is built from it.
  if (fs.existsSync(abs.antidoteConfig(SLUG))) {
    try {
      const prev = JSON.parse(fs.readFileSync(abs.antidoteConfig(SLUG), "utf8"));
      const prevThumb = prev && prev.meta && prev.meta.thumbnail;
      if (prevThumb && !prevThumb._needsClaudeRefine) {
        thumbnail = prevThumb;
        console.log("↻ thumbnail brief korundu (elle rafine edilmiş): " + JSON.stringify(prevThumb.hook));
      }
    } catch { /* unreadable previous config — fall back to the scaffold */ }
  }

  const config = {
    // multiplane: Antidote 4.0 2.5D depth — cast/motifs/copy parallax against the
    // camera by depth (Scene applies per-shot depth defaults). New plans opt in;
    // configs written before 4.0 simply lack the flag and render flat, unchanged.
    meta: {
      slug: SLUG,
      title: TITLE,
      author: AUTHOR,
      // Downstream genre checks (plan-briefs, hard-gate, visual-intent) read
      // meta.genre; it was never written, so every book looked genre-less.
      genre: GENRE,
      fps: FPS,
      width: 1920,
      height: 1080,
      ...(audio ? { audio } : {}),
      durationInFrames,
      multiplane: true,
      hud: {
        enabled: true,
        accent: PAL.red || PAL.gold || "#F59E0B",
        title: (SHORT_TITLE || TITLE || "GOOD BOOK SUMMARY").toUpperCase(),
        showProgress: true,
        showBadge: true,
      },
      thumbnail,
      cast: CAST_BIBLE,
    },
    scenes: sceneSpecs,
    captions,
  };

  // --out = test mode: write only the scaffold to a custom path, don't mutate the
  // real config.antidote.json or book.json.
  const outPath = args.out || null;
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`✓ (test) ${outPath} — ${sceneSpecs.length} scene(s), ${captions.length} captions, ${(durationInFrames / FPS).toFixed(0)}s (book.json NOT touched)`);
    return;
  }

  ensureBookDir(SLUG);
  fs.writeFileSync(abs.antidoteConfig(SLUG), JSON.stringify(config, null, 2) + "\n");

  // ── SEMANTIC VISUAL ALIGNMENT & PROGRESSION (Antidote 6.0) ─────────────────
  // Automatically generate macro sequence arcs and apply the Three-Layer semantic director
  // so every plan is natively free of parrot copy and static decorator scenes.
  if (!args["skip-semantic"]) {
    try {
      const { execFileSync } = require("child_process");
      const rootDir = path.join(__dirname, "..");
      execFileSync(process.execPath, [path.join(rootDir, "scripts", "plan-sequence-arcs.js"), `--slug=${SLUG}`], { stdio: "pipe" });
      execFileSync(process.execPath, [path.join(rootDir, "scripts", "apply-semantic-arcs.js"), `--slug=${SLUG}`], { stdio: "pipe" });
      console.log(`✓ semantik görsel görevler, dönüşüm arkları ve merak dizileri uygulandı (Antidote 6.0)`);
    } catch (e) {
      console.warn(`  ⚠ semantic alignment warning: ${e.message}`);
    }
  }

  // book.json engine = antidote (source of truth for the pipeline)
  const man = readManifest(SLUG) || { slug: SLUG, title: TITLE, author: AUTHOR, genre: GENRE };
  man.engine = "antidote";
  fs.writeFileSync(abs.manifest(SLUG), JSON.stringify(man, null, 2) + "\n");

  // P9-A O1/O2: record the plan's proposition-loss events (report-only).
  if (conceptRefusals.length) {
    const events = conceptRefusals.map((r) => makePropositionLossEvent("CONCEPT_REFUSED", {
      sceneId: r.sceneId, engine: "antidote",
      message: `authored concept "${r.concept}" refused by the world-vocabulary gate (${r.reason})`,
      data: { authoredBy: r.authoredBy, concept: r.concept, reason: r.reason },
    }));
    const doc = recordPropositionLoss(path.join(__dirname, "..", "books", SLUG), SLUG, events);
    console.log(`⚠ ${propositionLossSummary(doc)} — see books/${SLUG}/proposition-loss.report.json (DROPPED is HARD: the authorship gate fails the build)`);
  }

  if (propStagedCount) console.log(`P9-B: ${propStagedCount} authored proposition(s) staged (split/beforeAfter/flow/per-cast/pole icon); verdicts verified by the authorship gate`);
  console.log(`✓ ${rel.antidoteConfig(SLUG)} — ${sceneSpecs.length} scene(s), ${captions.length} captions, ${(durationInFrames / FPS).toFixed(0)}s`);
  console.log(`✓ ${rel.manifest(SLUG)} — engine: antidote`);
  console.log(`✓ kadro: ${Object.keys(CAST_BIBLE).length} karakter, gardırop dünyası "${CAST_WORLD}"${CAST_IN ? " (Claude tarafından yazıldı)" : " (otomatik — --emit-cast ile kitaba özelleştir)"}`);
  console.log(`\n⚠  SCAFFOLD — CLAUDE ŞİMDİ ART-DIRECT ETMELİ (Claude-first, en kaliteli yol):`);
  console.log(`   Yönetmen kadraj/geçiş/dekor/motif'i zaten kurdu ("shot", "transition", "bg", "props").`);
  console.log(`   Claude'un işi: "_narration" + "_beat" ipuçlarına göre kinetik metni kitaba özgü YENİDEN YAZMAK,`);
  console.log(`   yanlış okunmuş beat'lerde "shot"u değiştirmek ve motif'i anlatıya oturtmak.`);
  console.log(`   Staging (x/y/size) bilerek boş — shot preset'i yerleştiriyor; sadece override gerekirse yaz.`);
  console.log(`   KADRO: kitabın gerçek karakterleriyle yeniden dök —`);
  console.log(`     node scripts/plan-antidote.js --emit-cast=/tmp/${SLUG}.cast.json --vtt=${VTT} --slug=${SLUG} --title="${TITLE}" --genre=${GENRE}`);
  console.log(`     (Claude isimleri + kostümleri yazar) → aynı komutu --cast=/tmp/${SLUG}.cast.json ile tekrar çalıştır.`);
  console.log(`   DENETİM: node scripts/audit-antidote.js --slug=${SLUG}  (8sn'den uzun ölü pencere varsa düşer)`);
  console.log(`   Sonra: node scripts/gen-books-registry.js`);
  console.log(`   Önizle: http://localhost:3001/Antidote-${SLUG}`);
})();
