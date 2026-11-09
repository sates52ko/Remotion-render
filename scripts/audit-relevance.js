#!/usr/bin/env node
/**
 * audit-relevance.js — does the picture mean what the narration says?
 *
 * The sibling of `audit-antidote.js`. That one made DEAD AIR a number (does the
 * picture change often enough?) and every fix since was driven by it. This one
 * makes RELEVANCE a number (is the picture about the right thing?), which is the
 * gap nothing in the pipeline measured: a film in which every icon is wrong
 * passes `audit-antidote.js` cleanly.
 *
 * WHY THIS IS POSSIBLE OFFLINE. A planned config holds BOTH sides of the
 * question in one file: `captions[]` carries the word-level narration, and the
 * beats/scenes carry every visual decision. So for any frame we can ask what is
 * being SAID and what is being SHOWN, with no audio, no render and no API.
 *
 * THE GROUND TRUTH IS THE SPOKEN WINDOW, NOT THE PLANNED TEXT. Both planners
 * choose a visual from the beat's own text and then move the scene somewhere
 * else on the timeline (see the ANCHOR WINDOW note in plan-vox.js, and the
 * sustain/cooldown rules in antidote-director.js). So this audit reads the words
 * whose caption frames actually fall inside the scene's own window — what a
 * viewer hears while that picture is up — and scores the picture against those.
 *
 * VERDICTS, worst first. A scene gets the worst one that applies:
 *   contradicts  the picture asserts something the narration does not — a
 *                quotation that was never made, a number nobody said, a place
 *                the narration has just moved away from
 *   unrelated    the picture names a subject (it has its own vocabulary) and
 *                that subject is absent from the words being spoken over it
 *   filler       the picture cannot be about anything: a contentless motif
 *                (spotlight/ripple/orbit/shape/maze), or a Flux image whose
 *                whole prompt is three keywords scraped out of the sentence
 *   thin         nothing is shown but type on paper
 *   ok           a picture that is tied to what is being said
 *
 * USAGE
 *   node scripts/audit-relevance.js --slug=<slug>        # one book; exit 1 over budget
 *   node scripts/audit-relevance.js --all [--soft]       # the catalogue
 *   node scripts/audit-relevance.js --all --csv          # machine-readable table
 *   node scripts/audit-relevance.js --slug=<slug> --top=20   # the worst scenes, verbatim
 *   node scripts/audit-relevance.js --slug=<slug> --report    # books/<slug>/relevance-report.json
 *
 * BUDGET (VISUAL_RELEVANCE_PLAN.md §4) — override with the flags:
 *   --min-subject=70   % of scenes whose picture is tied to the beat's subject
 *   --max-wrong=5      % of scenes that contradict or are unrelated
 *   --min-airtime=90   % of frames sitting over their own narration
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { CONCEPT_LEXICON, CONCEPT_SET } = require("./lib/antidote-director.js");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SOFT = !!args.soft;
const CSV = !!args.csv;
const TOP = args.top ? parseInt(args.top, 10) : 0;
const REPORT = !!args.report;
const MIN_SUBJECT = args["min-subject"] !== undefined ? parseFloat(args["min-subject"]) : 70;
const MAX_WRONG = args["max-wrong"] !== undefined ? parseFloat(args["max-wrong"]) : 5;
const MIN_AIRTIME = args["min-airtime"] !== undefined ? parseFloat(args["min-airtime"]) : 90;

// ── vocabulary ──────────────────────────────────────────────────────────────

/**
 * Motifs that cannot be about anything. They carry no subject, so they can
 * never be "right" — only decorative. Measured across the shipped catalogue
 * these six are ~half of every prop instance drawn.
 */
const FILLER_MOTIFS = new Set(["spotlight", "ripple", "orbit", "shape", "maze", "arrow", "summit", "stack", "ladder", "crack", "balance", "clock", "counter", "barChart", "lineGrowth"]);
/** The subset of filler that is pure decoration rather than an abstract diagram. */
const PURE_DECOR = new Set(["spotlight", "ripple", "orbit", "shape", "maze", "arrow"]);
/** Sets that name no place — a scene in one of these happens nowhere. */
const NOWHERE_SETS = new Set(["abstract", "horizon", "none", "", undefined, null]);

const CONCEPT_RE = new Map(CONCEPT_LEXICON);

/**
 * PLACE WORDS — deliberately NOT the concept lexicon.
 *
 * The first version of this check asked "did any of the 56 concept regexes fire,
 * and does its CONCEPT_SET differ from the scene's set?". Over a six-second
 * window something always fires, so it flagged a third of every book: a beat
 * about a boy setting aside "his own death" was called a contradiction because
 * `grave` matched and `grave` maps to `forest`. That is noise, and a noisy
 * metric is worse than none — it cannot drive a fix.
 *
 * A set is only WRONG when the narration names a concrete location outright and
 * the scene is standing in a different concrete location. Nouns only, no
 * metaphors, and a scene set in `abstract`/`horizon` is "nowhere", never wrong.
 */
const PLACE_WORDS = [
  [/\b(kitchen|dinner table|the stove|at the table)\b/i, "kitchen"],
  [/\b(bedroom|her room|his room|the bed\b)\b/i, "bedroom"],
  [/\b(classroom|the school|schoolyard|at school|lecture hall)\b/i, "classroom"],
  [/\b(library|the stacks|reading room)\b/i, "library"],
  [/\b(cafe|coffee shop|diner|restaurant|the bar\b)\b/i, "cafe"],
  [/\b(hospital|the ward|emergency room|operating table|clinic)\b/i, "hospital"],
  [/\b(courtroom|the court\b|courthouse|the witness stand|before the judge)\b/i, "court"],
  [/\b(forest|the woods\b|among the trees)\b/i, "forest"],
  [/\b(the shore\b|the beach\b|the coast\b|the harbor)\b/i, "shore"],
  [/\b(highway|the freeway|the interstate|the open road)\b/i, "highway"],
  [/\b(the office\b|his office|her office|the boardroom|cubicle)\b/i, "office"],
  [/\b(the street\b|the sidewalk|downtown|the alley)\b/i, "street"],
];
/** Real places. A scene set anywhere else is "nowhere", which is thin, not wrong. */
const CONCRETE_SETS = new Set(PLACE_WORDS.map(([, s]) => s).concat(["room"]));

/** Emphasis words that say nothing about the subject. */
const HOLLOW = new Set([
  "IT'S", "ITS", "THAT'S", "THERE'S", "BECAUSE", "YEAH", "OKAY", "RIGHT", "WELL", "ACTUALLY",
  "LITERALLY", "COMPLETELY", "INCREDIBLY", "REALLY", "VERY", "JUST", "LIKE", "AND", "BUT", "SO",
  "THIS", "THAT", "THESE", "THOSE", "THEY", "THEIR", "THERE", "WHAT", "WHEN", "WHICH", "WITH",
  "FIRST", "THING", "THINGS", "KIND", "SORT", "LOT", "MUCH", "MORE", "EVEN", "ALSO", "STILL",
]);

// ── helpers ─────────────────────────────────────────────────────────────────

const pct = (n, d) => (d ? (n / d) * 100 : 0);
const fmt = (x) => `${x.toFixed(1)}%`;

/** every caption word whose frame falls inside [from, to) */
function spokenIn(words, from, to) {
  const out = [];
  for (const w of words) {
    if (w.e <= from) continue;
    if (w.s >= to) break;
    out.push(w.w);
  }
  return out;
}

/** flatten captions[] to a frame-ordered word stream */
function wordStream(cfg) {
  const out = [];
  for (const cap of cfg.captions || []) {
    for (const w of cap.words || []) out.push({ w: String(w.w || ""), s: w.s, e: w.e });
  }
  out.sort((a, b) => a.s - b.s);
  return out;
}

/** the frames during which a scene's OWN planned text is spoken, or null */
function ownNarrationSpan(words, plannedText) {
  const toks = String(plannedText || "").trim().split(/\s+/).filter(Boolean);
  if (toks.length < 3) return null;
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9']/g, "");
  const a = norm(toks[0]), b = norm(toks[1]), c = norm(toks[2]);
  if (!a) return null;
  for (let i = 0; i + 2 < words.length; i++) {
    if (norm(words[i].w) === a && norm(words[i + 1].w) === b && norm(words[i + 2].w) === c) {
      const end = Math.min(i + toks.length - 1, words.length - 1);
      return { s: words[i].s, e: words[end].e };
    }
  }
  return null;
}

const numbersIn = (text) =>
  (String(text).match(/\b\d[\d,]*(?:\.\d+)?\b/g) || []).map((n) => parseFloat(n.replace(/,/g, ""))).filter(Number.isFinite);

/**
 * Is this Flux prompt a described shot, or three keywords scraped out of the
 * sentence? `cinematic editorial still: lingering, period., ghost..` is the
 * latter, and it is ~93% of every prompt the corpus has ever generated.
 */
function isKeywordBag(prompt) {
  const m = String(prompt || "").match(/still:\s*(.*?)\.\s/);
  if (!m) return false;
  const subject = m[1].trim();
  const parts = subject.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return true;
  // a real shot brief is a phrase; a bag is a handful of lone words
  const allSingleWords = parts.every((p) => p.split(/\s+/).length <= 1);
  return allSingleWords && parts.length <= 4;
}

// ── per-scene evaluation ────────────────────────────────────────────────────

function scoreScene({ engine, id, from, dur, spoken, planned, shown }) {
  const flags = [];
  const said = spoken.join(" ");
  const saidLc = said.toLowerCase();
  const saidNums = new Set(numbersIn(said).concat(numbersIn(planned)));

  // ── contradictions: the picture asserts something nobody said ────────────
  for (const n of shown.numbers) {
    if (!saidNums.has(n)) flags.push({ f: "fabricated-number", d: `shows ${n}, not spoken` });
  }
  if (shown.assertsQuote && !/["“”]/.test(said) && !/["“”]/.test(String(planned))) {
    flags.push({ f: "false-quote", d: "quotation marks, no quotation" });
  }
  if (shown.set && CONCRETE_SETS.has(shown.set)) {
    // the narration names a location outright, and we are standing somewhere else
    const named = PLACE_WORDS.find(([re]) => re.test(said));
    if (named && named[1] !== shown.set) {
      flags.push({ f: "wrong-place", d: `set=${shown.set}, narration is in the ${named[1]}` });
    }
  }

  // ── is any picture on screen tied to what is being said? ─────────────────
  let grounded = 0, ungrounded = 0, filler = 0;
  for (const icon of shown.icons) {
    if (PURE_DECOR.has(icon)) { filler++; continue; }
    const re = CONCEPT_RE.get(icon);
    if (!re) { filler++; continue; }          // drawable but nameless: cannot be about anything
    if (re.test(said)) grounded++;
    else if (FILLER_MOTIFS.has(icon)) filler++;
    else ungrounded++;                        // it names a subject, and that subject is not being said
  }
  // TEST THE CLAIM, NOT THE COSTUME.
  //
  // When the planner states what the beat is about (`props.subject`, written
  // from a beat brief), that is the claim, and the honest question is whether
  // the thing it names is actually being said right now. The Flux prompt is a
  // costume description — "a young Indian brahmin man with a shaved head and a
  // plain ochre robe" — whose words need never appear in the narration, so
  // scoring the prompt marked correct pictures as unrelated.
  //
  // This is not circular and not gameable by decoration: the subject is checked
  // against the audio, so a subject that lies is caught, and adding scenery to
  // the prompt changes nothing.
  if (shown.subject) {
    // A subject is either a PHRASE taken from the book ("Kamala's songbird found
    // dead") or a CONCEPT LABEL ("family"). A label is verified through the
    // concept's own vocabulary, because the label itself need not be spoken —
    // `family` is grounded by "mother", not by the word "family". Testing labels
    // by word-overlap marked 17% of the catalogue as unrelated when the icons
    // were in fact correct.
    const raw = String(shown.subject);
    const labels = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
      .map((t) => [...CONCEPT_RE.keys()].find((k) => k.toLowerCase() === t))
      .filter(Boolean);
    const claim = raw.toLowerCase().match(/[a-z]{4,}/g) || [];
    const byLabel = labels.some((k) => CONCEPT_RE.get(k).test(said));
    const byWords = claim.some((w) => saidLc.includes(w));
    if (byLabel || byWords) grounded++;
    else ungrounded++;
  } else {
    for (const img of shown.images) {
      if (img.bag) { filler++; continue; }
      // no stated subject: fall back to asking whether the described shot shares
      // a content word with the words spoken over it
      const words = String(img.subject).toLowerCase().match(/[a-z]{4,}/g) || [];
      if (words.some((w) => saidLc.includes(w))) grounded++;
      else ungrounded++;
    }
  }
  if (shown.groundedData) grounded++;

  const hasPicture = shown.icons.length + shown.images.length > 0 || shown.groundedData;
  const hollowText = shown.text.length > 0 && shown.text.every((t) => HOLLOW.has(String(t).toUpperCase()));
  if (hollowText) flags.push({ f: "hollow-text", d: shown.text.join(" ") });

  let verdict;
  if (flags.some((f) => f.f === "fabricated-number" || f.f === "false-quote" || f.f === "wrong-place")) verdict = "contradicts";
  else if (ungrounded > 0 && grounded === 0) verdict = "unrelated";
  else if (grounded === 0 && filler > 0) verdict = "filler";
  else if (!hasPicture) verdict = "thin";
  else verdict = "ok";

  return { id, from, dur, verdict, flags, grounded, ungrounded, filler, said: said.slice(0, 190), shown };
}

// ── engine adapters: what does this config put on screen for a scene? ───────

function inventoryVox(beat) {
  const p = beat.props || {};
  const numbers = []
    .concat((p.chartData || []).filter(Number.isFinite))
    .concat((p.trendPoints || []).map((t) => t && t.value).filter(Number.isFinite));
  const images = (beat.images || []).map((im) => {
    const m = String(im.prompt || "").match(/still:\s*(.*?)\.\s/);
    return { subject: m ? m[1] : "", bag: isKeywordBag(im.prompt) };
  });
  return {
    icons: [],
    images,
    // what the planner says this beat is ABOUT (written from a beat brief)
    subject: p.subject || null,
    set: null,
    numbers,
    assertsQuote: beat.type === "quote",
    text: (p.emphasis || []).concat(p.items || []),
    groundedData: !!((p.trendPoints || []).length >= 2 || (p.flowNodes || []).length >= 2 || (p.chartData || []).length),
    label: `${beat.type}${images.length ? " +img" : ""}`,
  };
}

function inventoryAntidote(scene) {
  const props = scene.props || [];
  const numbers = props.filter((x) => x.type === "counter" && Number.isFinite(x.value)).map((x) => x.value);
  const holds = (scene.characters || []).map((c) => c.holds).filter(Boolean);
  return {
    icons: props.map((x) => x.type).concat(holds),
    images: [],
    // the claim, when the planner stated one (written from a beat brief)
    subject: scene._subject || null,
    set: (scene.bg && scene.bg.set) || null,
    numbers,
    assertsQuote: false,
    text: (scene.texts || []).map((t) => (typeof t === "string" ? t : t && (t.text || t.label)) || "").filter(Boolean),
    groundedData: !!(scene.diagram && (scene.diagram.labels || []).length),
    label: `${scene.shot}/${(scene.bg && scene.bg.set) || "-"}${props.length ? " " + props.map((x) => x.type).join("+") : ""}`,
  };
}

// ── per-book ────────────────────────────────────────────────────────────────

function auditBook(slug, configPath) {
  // `--config=` scores a plan that is not installed yet — how a change to the
  // planner is measured before anything ships.
  let engine, cfg;
  if (configPath) {
    cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    engine = cfg.scenes ? "antidote" : "vox";
  } else {
    const voxPath = path.join(ROOT, "books", slug, "config.vox.json");
    const antiPath = path.join(ROOT, "books", slug, "config.antidote.json");
    engine = fs.existsSync(voxPath) ? "vox" : fs.existsSync(antiPath) ? "antidote" : null;
    if (!engine) return null;
    cfg = JSON.parse(fs.readFileSync(engine === "vox" ? voxPath : antiPath, "utf8"));
  }
  const units = engine === "vox" ? cfg.beats || [] : cfg.scenes || [];
  if (!units.length) return null;
  const words = wordStream(cfg);

  const scenes = [];
  let airOwn = 0, airTot = 0, airSkipped = 0;
  for (const u of units) {
    const from = u.fromFrame || 0;
    const to = from + (u.durationFrames || 0);
    const spoken = spokenIn(words, from, to);
    const planned = engine === "vox" ? (u.props && u.props.text) || "" : u._narration || "";
    const shown = engine === "vox" ? inventoryVox(u) : inventoryAntidote(u);
    scenes.push(scoreScene({ engine, id: u.id, from, dur: to - from, spoken, planned, shown }));

    // AIRTIME, only where it can be measured honestly.
    //
    // The span of a scene's own narration is located by matching its planned
    // text back into the word stream. Antidote writes `_narration` TRUNCATED to
    // 160 characters (plan-antidote.js), so for a longer scene the measured span
    // ends early and the overlap is understated — 43% of a typical Antidote book
    // hits that limit, which is most of the apparent gap. A truncated scene is
    // skipped rather than scored, and a book where too many are skipped reports
    // no airtime at all instead of a misleading number.
    if (String(planned).length >= 160) { airSkipped++; continue; }
    const own = ownNarrationSpan(words, planned);
    if (own) {
      airOwn += Math.max(0, Math.min(own.e, to) - Math.max(own.s, from));
      airTot += to - from;
    }
  }

  const n = scenes.length;
  const count = (v) => scenes.filter((s) => s.verdict === v).length;
  const distinctGrounded = new Set();
  scenes.forEach((s) => s.shown.icons.forEach((i) => { if (CONCEPT_RE.has(i)) distinctGrounded.add(i); }));

  return {
    slug, engine, scenes: n,
    subjectBearing: pct(count("ok"), n),
    wrong: pct(count("contradicts") + count("unrelated"), n),
    filler: pct(count("filler"), n),
    thin: pct(count("thin"), n),
    // too much of the book unmeasurable -> say nothing rather than mislead
    airtime: airTot && airSkipped / (scenes.length || 1) < 0.35 ? pct(airOwn, airTot) : null,
    vocabReach: distinctGrounded.size,
    verdicts: { ok: count("ok"), thin: count("thin"), filler: count("filler"), unrelated: count("unrelated"), contradicts: count("contradicts") },
    detail: scenes,
  };
}

// ── output ──────────────────────────────────────────────────────────────────

const RANK = { contradicts: 0, unrelated: 1, filler: 2, thin: 3, ok: 4 };

function printBook(r) {
  console.log(`\n══ ${r.slug}  (${r.engine}, ${r.scenes} scenes)`);
  console.log(`   subject-bearing ${fmt(r.subjectBearing)}   wrong ${fmt(r.wrong)}   filler ${fmt(r.filler)}   thin ${fmt(r.thin)}` +
    (r.airtime != null ? `   airtime ${fmt(r.airtime)}` : "   airtime n/a") + `   grounded icons used ${r.vocabReach}`);
  console.log(`   ${Object.entries(r.verdicts).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  if (TOP) {
    const worst = r.detail.slice().sort((a, b) => RANK[a.verdict] - RANK[b.verdict] || b.dur - a.dur).slice(0, TOP);
    console.log(`\n   worst ${worst.length}:`);
    for (const s of worst) {
      if (s.verdict === "ok") break;
      console.log(`   [${s.verdict}] ${s.id}  SHOWN: ${s.shown.label}`);
      console.log(`       SAID: "${s.said}"`);
      if (s.flags.length) console.log(`       ${s.flags.map((f) => f.f + " (" + f.d + ")").join("; ")}`);
    }
  }
}

function gate(r) {
  const fails = [];
  if (r.subjectBearing < MIN_SUBJECT) fails.push(`subject-bearing ${fmt(r.subjectBearing)} < ${MIN_SUBJECT}%`);
  if (r.wrong > MAX_WRONG) fails.push(`wrong ${fmt(r.wrong)} > ${MAX_WRONG}%`);
  if (r.airtime != null && r.airtime < MIN_AIRTIME) fails.push(`airtime ${fmt(r.airtime)} < ${MIN_AIRTIME}%`);
  return fails;
}

(function main() {
  const slugs = args.all
    ? fs.readdirSync(path.join(ROOT, "books")).sort()
    : args.slug ? [args.slug] : null;
  if (!slugs) {
    console.error("Kullanım: node scripts/audit-relevance.js --slug=<slug> | --all [--soft] [--csv] [--top=N] [--report]");
    process.exit(1);
  }

  const results = [];
  for (const s of slugs) {
    let r = null;
    try { r = auditBook(s, args.config || null); } catch (e) { console.warn(`  ⚠ ${s}: ${e.message}`); }
    if (r) results.push(r);
  }
  if (!results.length) { console.error("Planlanmış kitap bulunamadı."); process.exit(1); }

  if (CSV) {
    console.log("slug,engine,scenes,subjectBearing,wrong,filler,thin,airtime,groundedIconsUsed");
    for (const r of results) {
      console.log([r.slug, r.engine, r.scenes, r.subjectBearing.toFixed(1), r.wrong.toFixed(1),
        r.filler.toFixed(1), r.thin.toFixed(1), r.airtime == null ? "" : r.airtime.toFixed(1), r.vocabReach].join(","));
    }
  } else if (results.length === 1) {
    printBook(results[0]);
  } else {
    // worst first — this ordering IS the work list
    const sorted = results.slice().sort((a, b) => (a.subjectBearing - b.subjectBearing) || (b.wrong - a.wrong));
    console.log(`\n══ RELEVANCE BASELINE — ${results.length} planned books, ${results.reduce((a, r) => a + r.scenes, 0)} scenes\n`);
    console.log("  " + "book".padEnd(38) + "eng".padEnd(5) + "scn".padStart(5) + "subject".padStart(9) + "wrong".padStart(8) + "filler".padStart(8) + "thin".padStart(8) + "airtime".padStart(9));
    for (const r of sorted) {
      console.log("  " + r.slug.padEnd(38) + r.engine.slice(0, 4).padEnd(5) + String(r.scenes).padStart(5) +
        fmt(r.subjectBearing).padStart(9) + fmt(r.wrong).padStart(8) + fmt(r.filler).padStart(8) +
        fmt(r.thin).padStart(8) + (r.airtime == null ? "n/a" : fmt(r.airtime)).padStart(9));
    }
    const tot = results.reduce((a, r) => a + r.scenes, 0);
    const wsum = (key) => results.reduce((a, r) => a + (r[key] / 100) * r.scenes, 0);
    const air = results.filter((r) => r.airtime != null);
    console.log("\n  " + "CATALOGUE (scene-weighted)".padEnd(43) + String(tot).padStart(5) +
      fmt(pct(wsum("subjectBearing"), tot)).padStart(9) + fmt(pct(wsum("wrong"), tot)).padStart(8) +
      fmt(pct(wsum("filler"), tot)).padStart(8) + fmt(pct(wsum("thin"), tot)).padStart(8) +
      fmt(air.reduce((a, r) => a + r.airtime, 0) / (air.length || 1)).padStart(9));
  }

  if (REPORT) {
    for (const r of results) {
      const out = path.join(ROOT, "books", r.slug, "relevance-report.json");
      fs.writeFileSync(out, JSON.stringify({
        slug: r.slug, engine: r.engine, scenes: r.scenes,
        metrics: { subjectBearing: r.subjectBearing, wrong: r.wrong, filler: r.filler, thin: r.thin, airtime: r.airtime },
        verdicts: r.verdicts,
        worklist: r.detail.filter((s) => s.verdict !== "ok")
          .map((s) => ({ id: s.id, verdict: s.verdict, shown: s.shown.label, said: s.said, flags: s.flags })),
      }, null, 2));
    }
    console.log(`\n  ✓ ${results.length} relevance-report.json yazıldı`);
  }

  const failing = results.map((r) => ({ slug: r.slug, fails: gate(r) })).filter((x) => x.fails.length);
  if (failing.length && !SOFT) {
    console.log(`\n  ✗ FAIL — ${failing.length}/${results.length} book(s) over budget`);
    if (results.length === 1) console.log(`    ${failing[0].fails.join("; ")}`);
    process.exit(1);
  }
  if (failing.length) console.log(`\n  (soft) ${failing.length}/${results.length} book(s) over budget`);
})();
