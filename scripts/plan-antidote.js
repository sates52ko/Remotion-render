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
const { createCopywriter } = require("./lib/antidote-copy");
const { castBook, WORLD_NAMES } = require("./lib/antidote-costume");
const { repairSceneContract } = require("./lib/visual-contract");
const { extractNarrativeAtomSync } = require("../src/semantic/narrativeAtom.ts");
const { deriveVisualIntent } = require("../src/semantic/visualIntent.ts");
const { buildDirectorOverrides, applyDirectorOverrides } = require("./lib/director-adapter");

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
const CALLOUTS_IN = args.callouts || null;
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
const BRIEFS = (() => {
  if (!BRIEFS_IN) return null;
  const loaded = JSON.parse(fs.readFileSync(BRIEFS_IN, "utf8"));
  const arr = loaded.briefs || loaded;
  return new Map(arr.filter((b) => b && b.fp).map((b) => [b.fp, b]));
})();
let briefHits = 0, briefMisses = 0;
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
const MIN_HOLD = 40; // a callout must stay up at least this long, or it just flashes
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

/**
 * A scene names a ROLE; the cast may be keyed by character NAME. This maps one
 * to the other, so `role: "protagonist"` resolves to `cast.patch` when Claude
 * has cast Patch as the protagonist. Falls back to the role key itself, which
 * is what every pre-3.1 config uses.
 */
function roleIndex(cast) {
  const byRole = {};
  for (const [key, member] of Object.entries(cast || {})) {
    const r = (member && member.role) || key;
    if (!byRole[r]) byRole[r] = key;
  }
  return (role) => byRole[role] || (cast && cast[role] ? role : byRole.narrator || Object.keys(cast || {})[0] || role);
}

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
      if (loaded && loaded.world) CAST_WORLD = loaded.world;
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
  const bibleFile = path.join("books", SLUG, "creative-bible.json");
  const bible = fs.existsSync(bibleFile) ? JSON.parse(fs.readFileSync(bibleFile, "utf8")) : null;
  if (bible) {
    console.log(`[+] Art Director Creative Bible detected: ${bible.world?.label || "Custom Universe"}`);
  }
  const customPalette = bible?.world?.palette ? {
    ...PAL,
    red: bible.world.palette.primary || PAL.red,
    accent: bible.world.palette.primary || PAL.accent,
    ink: bible.world.palette.ink || PAL.ink,
  } : null;
  const effectivePalette = customPalette || PAL;
  const director = createDirector({ palette: effectivePalette, genre: GENRE, slug: SLUG, bible });
  // Callouts: Claude-authored when --callouts was given, heuristic otherwise.
  const copy = createCopywriter();

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
        : (copy.write(s.text.replace(new RegExp(TITLE, "i"), ""), "title") || {}).text;
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
        texts.push({ text: sub.toUpperCase(), style: "box", color: PAL.paper, boxColor: PAL.red, enter: "pop", at });
        calloutAt = at;
      }
    } else {
      const call = CALLOUTS ? authored : copy.write(s.text, beatOf(s.text));
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
    let d = director.direct({
      text: s.text, index: i, isTitle, calloutAt, total: scenes.length, durationFrames,
      concept: hasOwn(ART && ART[i], "concept") ? ART[i].concept
        : (brief && brief.antidote && brief.antidote.concept) ? brief.antidote.concept : undefined,
      brief,
    });
    // Semantic floor: bridge the shared deterministic intent model into the
    // existing director. This never replaces an authored or valid composition.
    const narrativeAtom = extractNarrativeAtomSync(s.text, { bookTitle: BOOK, author: AUTHOR });
    const visualIntent = deriveVisualIntent(narrativeAtom);
    const semanticAdapter = buildDirectorOverrides({
      intent: visualIntent,
      direction: d,
      authoredDiagram: hasOwn(ART && ART[i], "diagram") && !!ART[i].diagram,
    });
    d = applyDirectorOverrides(d, semanticAdapter);
    // The brief's place wins over the genre rotation for the same reason. The
    // director's own HOLD/decay rule still governs how long we stay there — a
    // set that changes every beat is strobing, not geography.
    if (brief && brief.antidote && brief.antidote.set && d.bg && !hasOwn(ART && ART[i], "set")) {
      d.bg.set = brief.antidote.set;
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
    const diagram = hasOwn(ART && ART[i], "diagram") ? ART[i].diagram : (d.diagram || null);
    if (diagram) {
      d.shot = "insert";
      d.cast = { ...d.cast, count: 0, crowd: 0 };
      d.props = [];
      d.concept = null;
      texts.length = 0;
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
    for (let c = 0; c < d.cast.count; c++) {
      const role = castKeyFor(d.cast.roles[c] || "extra");
      const isSecond = c > 0;
      const lead = c === 0 && !isTitle && business;
      const la = isTitle ? undefined : lookAtFor(c);
      const emotion = isTitle ? "none" : lead ? (d.emotion || detectEmotion(s.text, d.class)) : (isSecond ? "none" : (d.emotion || "none"));
      const emotionAt = calloutAt != null ? Math.max(4, calloutAt - 4) : 8;
      characters.push({
        id: `c${i}-${c}`,
        rig: "everyman",
        role,
        expression: isTitle ? "happy" : isSecond ? (r.expression === "happy" ? "worried" : "neutral") : r.expression,
        ...(emotion && emotion !== "none" ? { emotion, emotionAt } : {}),
        enter: continued ? "none" : d.shot === "twoShot" || d.shot === "split" ? (c === 0 ? "left" : "right") : i % 2 === 0 ? "left" : "fade",
        ...(continued ? { poseAt: 60 } : {}),
        action: lead ? business.action : isTitle ? "talk" : isSecond ? (d.cast.secondaryAction || (r.action === "celebrate" ? "slump" : "idle")) : r.action,
        ...(lead && business.holds ? { holds: business.holds } : {}),
        ...(lead && business.travel ? { travel: business.travel } : {}),
        ...(d.cast.crowd && c === 0 ? { crowd: d.cast.crowd } : {}),
        ...(la ? { lookAt: la } : {}),
      });
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

    const rawScene = {
      id: isTitle ? "intro" : `scene-${String(i).padStart(2, "0")}`,
      fromFrame: s.from,
      durationFrames: Math.max(FPS, durationFrames),
      hud,
      _narration: s.text.slice(0, 160), // hint for Claude's art-direction; safe to delete
      _semanticAdapter: {
        archetype: semanticAdapter.archetype,
        requiredActions: semanticAdapter.requiredActions,
        reason: semanticAdapter.reason,
        applied: !!semanticAdapter.override,
      },
      ...(briefSubject ? { _subject: briefSubject } : {}),
      _beat: d.class, // which beat class the director read; safe to delete
      _act: d.act, // where the color script places this beat; safe to delete
      ...(d.sustain ? { _take: "sustained" } : {}), // continues the previous shot; safe to delete
      ...(d.concept ? { concept: d.concept } : {}), // the beat's literal subject (icon)
      ...(diagram ? { diagram } : {}), // explanatory graphic — the hero of the beat (4.0)
      shot: d.shot,
      transition: d.transition,
      bg: d.bg,
      camera: cam,
      characters,
      props,
      texts,
    };
    return brief ? repairSceneContract(rawScene, brief, PAL) : rawScene;
  });

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
        "  (a crash, a home, a lake, a wall of notes); set null to force talking heads; omit to let the",
        "  lexicon decide. Use sparingly and only when it's the true subject — a wrong icon is worse than none.",
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
