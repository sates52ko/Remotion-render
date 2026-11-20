/**
 * engine-fit.js — which engine SHOWS this book best, with the reasons.
 *
 * The question is not "does the text contain names or numbers" (the old
 * analyzeEngineFromVtt scored proper nouns and statistics as Vox, so a novel's
 * invented cast and a self-help book's studies both pushed toward photoreal —
 * We Were Liars scored "strong Vox" although its central scenes are teenagers
 * burning to death, which Flux refuses to draw). It is: what must the viewer SEE,
 * and which engine can draw it?
 *
 *   Vox (photoreal Flux stills) — the REAL or PERIOD world: dated real events,
 *     history/biography/documentary, a story set before ~1950 whose look matters.
 *   Antidote (vector icons, diagrams, staged cast) — IDEAS and the reader: advice,
 *     mechanisms, "you"-address; contemporary fiction with a staged cast (WWL: 0/30
 *     wrong, image adds 70%).
 *   Risk, not taste: violence / death density. Flux returns CONTENT_FILTERED on
 *     gore, children in danger and war violence — on a violent book Vox loses the
 *     very scenes the narration is about.
 *
 * Signals are per 1,000 narration words. Weights are explicit and explained in
 * `reasons`; the decision is a recommendation for the Step 0 author + operator,
 * and every book's result is logged next to its mute-test outcome
 * (data/engine-outcomes.json) so the weights can be re-fit on real results.
 */
const RE = {
  year: /\b(1[5-9]\d\d|20[0-2]\d)\b/g,
  history: /\b(century|centuries|war|wars|president|king|queen|empire|revolution|colon(?:y|ial|ies)|slavery|slaves?|civil rights|nazis?|soviet|army|battle|treaty|historians?|historical|archives?|true story|real life|biography|dynasty|government|senator|soldiers?|troops|regime)\b/gi,
  second: /\b(you|your|yourself)\b/gi,
  abstract: /\b(habits?|mindset|principles?|strateg(?:y|ies)|framework|concepts?|theory|theories|brains?|psycholog\w*|attention|focus|productiv\w*|techniques?|lessons?|models?|systems?|behaviou?r|emotions?|motivation|goals?|decisions?|values?|happiness|wealth|money|time|energy)\b/gi,
  sensitive: /\b(kill(?:ed|s|ing)?|murder\w*|dead|deaths?|died|dying|corpses?|blood(?:y)?|guns?|shot|shoot\w*|rape\w*|abus\w*|suicid\w*|overdos\w*|tortur\w*|massacre|genocide|burn(?:ed|t|ing)|drown\w*|violen\w*|assault\w*|stab\w*|execut\w*)\b/gi,
};
const SENSITIVE_OK = 6;   // per 1k — above this Flux starts dropping images
const PERIOD_YEAR = 1950; // before this, period realism is worth photoreal

/**
 * @param {string} text  the narration
 * @param {{era?: number}} ctx  era = story-bible world.approxYear when known
 */
function analyzeEngineFit(text, ctx = {}) {
  const n = Math.max(1, String(text).split(/\s+/).filter(Boolean).length);
  const per1k = (re) => +((((String(text).match(re) || []).length) / n) * 1000).toFixed(1);
  const s = {
    year: per1k(RE.year), history: per1k(RE.history), second: per1k(RE.second),
    abstract: per1k(RE.abstract), sensitive: per1k(RE.sensitive),
  };
  const era = Number.isFinite(ctx.era) ? ctx.era : null;

  const realWorld = s.year * 2 + s.history * 1.2;
  // Period realism matters for a STORY, not for an advice book whose bible year is
  // just the oldest anecdote (Slow Productivity: 1913).
  const narrative = s.second < 20;
  // the recorded periodLook decides when the profile has one (2026-10-29); the bare year only for legacy profiles
  const periodBonus = !narrative ? 0 : ctx.periodLook ? ({ essential: 6, backdrop: 3, none: 0 })[ctx.periodLook] || 0 : era != null && era < PERIOD_YEAR ? 6 : 0;
  const vox = realWorld * 2 + periodBonus;
  const ideas = s.second * 0.35 + s.abstract * 0.8;
  const violenceRisk = Math.max(0, s.sensitive - SENSITIVE_OK) * 1.5;
  const antidote = ideas + violenceRisk;

  const pick = vox > antidote ? "vox" : "antidote";
  const rel = Math.abs(vox - antidote) / Math.max(vox, antidote, 1);
  // Both scores small = no real signal, however lopsided the ratio (WWL: 5.1 vs 11.6).
  const top = Math.max(vox, antidote);
  const confidence = rel > 0.5 && top >= 15 ? "strong" : rel > 0.25 && top >= 8 ? "moderate" : "weak";

  const reasons = [];
  if (s.year >= 1.5 || s.history >= 2.5) reasons.push(`real-world / dated references (${s.year} years, ${s.history} history terms per 1k words) → photoreal shows the actual world (Vox)`);
  if (periodBonus) reasons.push(`set around ${era} → period realism favours Vox`);
  if (s.second >= 20) reasons.push(`the narration addresses the viewer ("you" ${s.second}/1k) → an idea/advice film, drawn as icons, diagrams and an everyman (Antidote)`);
  if (s.abstract >= 10) reasons.push(`idea vocabulary ${s.abstract}/1k (habits, decisions, attention, money…) → concepts need icons/diagrams, not photographs (Antidote)`);
  if (!reasons.length) reasons.push("no dominant signal — the story itself decides; contemporary fiction with a cast works in Antidote (WWL), period or documentary worlds in Vox");
  const risks = [];
  if (s.sensitive > SENSITIVE_OK) risks.push(`violence/death ${s.sensitive}/1k (> ${SENSITIVE_OK}) → Flux will refuse many Vox images of the key scenes (CONTENT_FILTERED); Antidote draws them symbolically`);

  return {
    pick, confidence,
    voxScore: +vox.toFixed(1), antidoteScore: +antidote.toFixed(1),
    signals: { ...s, era, words: n },
    reasons, risks,
  };
}

/**
 * analyzeBookProfile — the SAME decision at Step 0, where there is no narration
 * yet. The NotebookLM prompt is written FOR an engine (Vox: beats on real,
 * nameable figures and documentary scenes; Antidote: everyman states and ideas),
 * so the audio inherits the choice — switching after the audio exists means a new
 * prompt, a new recording and a new VTT. Step 0 therefore decides from what
 * Claude KNOWS about the book, on the same axes engine-fit measures later:
 *
 *   profile = {
 *     kind:        "fiction" | "nonfiction",
 *     world:       "real-historical" | "period" | "contemporary" | "speculative" | "ideas",
 *     era:         <year the story/events are set, optional>,
 *     realPeople:  true when specific real people/events are the subject,
 *     format:      "story" | "argument" | "mixed",   // told as a story vs. ideas/advice
 *     violence:    "none" | "some" | "central",     // death/violence in the key scenes
 *     mustSee:     ["three things the viewer must see", ...]
 *   }
 */
const WORLDS = ["real-historical", "period", "contemporary", "speculative", "ideas"];
// 2026-10-29 (operator decision): the year alone never decides "period", and harm to animals alone is never "central".
//   periodLook   "essential" | "backdrop" | "none" — how much the past world must be SEEN (2+ mustSee items are period
//                places / dress / vehicles / technology / public events = essential; 1 = backdrop; 0 = none)
//   ideaDensity  "events" | "balanced" | "ideas"   — half or more of mustSee physical events / places = events; inner
//                states or abstract ideas = ideas
//   violenceOf   "people" | "animals" | "both"       (default people)
//   animalHarm   { role: "main-conflict"|"subplot"|"backdrop", mustShow: bool, weight: "high"|"low" } — with violenceOf
//                animals; it counts as central only when it is the main conflict AND must be shown AND weighs heavily
// Profiles recorded before these fields (every published / pinned book) keep their exact scores: legacy rules apply
// when a field is absent. make-prompt validates NEW profiles strictly (the fields that matter for this book required).
const PERIOD_LOOKS = ["essential", "backdrop", "none"], IDEA_DENSITY = ["events", "balanced", "ideas"];
function validateProfile(p, { strict = false } = {}) {
  const errs = [];
  if (!p || typeof p !== "object") return ["profile must be an object"];
  if (!["fiction", "nonfiction"].includes(p.kind)) errs.push(`kind must be fiction|nonfiction`);
  if (!WORLDS.includes(p.world)) errs.push(`world must be one of ${WORLDS.join("|")}`);
  if (!["story", "argument", "mixed"].includes(p.format)) errs.push("format must be story|argument|mixed");
  if (!["none", "some", "central"].includes(p.violence)) errs.push("violence must be none|some|central");
  if (typeof p.realPeople !== "boolean") errs.push("realPeople must be true|false");
  if (p.minorHarm !== undefined && typeof p.minorHarm !== "boolean") errs.push("minorHarm must be true|false");
  if (!Array.isArray(p.mustSee) || p.mustSee.length < 2) errs.push("mustSee: at least 2 concrete things the viewer must see");
  if (p.periodLook !== undefined && !PERIOD_LOOKS.includes(p.periodLook)) errs.push(`periodLook must be ${PERIOD_LOOKS.join("|")}`);
  if (p.ideaDensity !== undefined && !IDEA_DENSITY.includes(p.ideaDensity)) errs.push(`ideaDensity must be ${IDEA_DENSITY.join("|")}`);
  if (p.violenceOf !== undefined && !["people", "animals", "both"].includes(p.violenceOf)) errs.push("violenceOf must be people|animals|both");
  if (p.animalHarm !== undefined) {
    const a = p.animalHarm || {};
    if (!["main-conflict", "subplot", "backdrop"].includes(a.role) || typeof a.mustShow !== "boolean" || !["high", "low"].includes(a.weight)) errs.push('animalHarm must be {"role":"main-conflict|subplot|backdrop","mustShow":true|false,"weight":"high|low"}');
  }
  if (strict) {
    const pastish = p.world === "period" || p.world === "real-historical" || (Number.isFinite(p.era) && p.era <= 1975 && p.world !== "speculative" && p.world !== "ideas");
    if (pastish && p.periodLook === undefined) errs.push("periodLook is required for a past world (period / real-historical, or set before 1976): essential|backdrop|none — the year alone does not decide");
    if (pastish && p.ideaDensity === undefined) errs.push("ideaDensity is required for a past world: events|balanced|ideas (from mustSee) — an interior, ideas-led book needs period photoreal less");
    if ((p.violenceOf === "animals" || p.violenceOf === "both") && p.violence !== "none" && p.animalHarm === undefined) errs.push("animalHarm is required when the violence is (also) against animals");
  }
  return errs;
}

// harm to animals alone is "central" only when it is the main conflict AND must be shown AND weighs heavily in the
// narration; otherwise it counts as "some". Harm to people is unchanged.
function effectiveViolence(p) {
  if ((p.violenceOf || "people") !== "animals" || p.violence === "none") return p.violence;
  const a = p.animalHarm || {};
  return p.violence === "central" && a.role === "main-conflict" && a.mustShow === true && a.weight === "high" ? "central" : "some";
}

function analyzeBookProfile(p) {
  let vox = 0, antidote = 0;
  const reasons = [], risks = [];
  if (p.realPeople || p.world === "real-historical") { vox += 30; reasons.push("the subject is real people / real events → photoreal shows the actual world (Vox)"); }
  // PERIOD realism is a property of the WORLD, not of a year: an early `era` on a speculative book (a fantasy whose
  // frame story is set in 1900) does not buy the period bonus — the rubric defines "period" and "speculative" as
  // different worlds (2026-10-27: a fantasy profile flipped to Vox only because its frame year was typed in)
  const earlyEra = Number.isFinite(p.era) && p.era < PERIOD_YEAR && p.format !== "argument";
  if (p.periodLook !== undefined && p.world !== "speculative" && p.world !== "ideas" && p.format !== "argument") {
    // the decided rule: how much the past world must be SEEN, not which side of 1950 the year falls
    const pts = { essential: 20, backdrop: 10, none: 0 }[p.periodLook] * (p.ideaDensity === "ideas" ? 0.5 : 1);
    if (pts) { vox += pts; reasons.push(`the past world must be seen (${p.periodLook}${Number.isFinite(p.era) ? `, ${p.era}` : ""}${p.ideaDensity === "ideas" ? "; an interior, ideas-led book: half" : ""}) → period realism favours Vox`); }
    else reasons.push(`set in ${Number.isFinite(p.era) ? p.era : "the past"}, but its look is not what the viewer must see (periodLook none) — no period bonus`);
  } else if (p.world === "period" || (p.world === "real-historical" && earlyEra)) { vox += 20; reasons.push(`a period world${Number.isFinite(p.era) ? ` (${p.era})` : ""} → period realism favours Vox`); }
  else if (earlyEra && p.world === "speculative") reasons.push(`a speculative world with a ${p.era} frame: its look is invented (creatures, magic, other worlds), not a past world to reproduce — no period bonus`);
  if (p.ideaDensity === "ideas" && p.periodLook !== undefined && p.format !== "argument" && p.world !== "ideas") { antidote += 10; reasons.push("an interior book (mustSee mostly inner states / ideas) → drawn concepts and a staged cast (Antidote)"); }
  if (p.format === "argument") { antidote += 30; reasons.push("an ideas/advice book → concepts are drawn as icons, diagrams and an everyman (Antidote)"); }
  if (p.format === "mixed") { antidote += 10; reasons.push("mixed story + argument → leans Antidote for the ideas"); }
  if (p.world === "ideas") antidote += 15;
  if (p.kind === "fiction" && (p.world === "contemporary" || p.world === "speculative")) {
    antidote += 15;
    reasons.push(p.world === "speculative"
      ? "speculative fiction with a cast → staged characters and invented things drawn in Antidote (measured: I, Robot 1/30 wrong, Ready Player One 0/30 — data/engine-outcomes.json; no speculative Vox book measured)"
      : "contemporary fiction with a cast → staged characters in Antidote (We Were Liars: 0/30 wrong, image adds 70%)");
  }
  const violence = effectiveViolence(p);
  if (violence === "central") { antidote += 20; risks.push("violence/death is central to the key scenes → Flux refuses many of those images (CONTENT_FILTERED); Antidote draws them symbolically"); }
  else if (violence === "some") risks.push(p.violence === "central" ? "harm to animals is present but not central (not the main conflict, or not shown, or light in the narration) → plan those beats as aftermath/symbol if Vox" : "some violence → plan those beats as aftermath/symbol if Vox");
  // Abuse of a child at the centre of the book (Lolita): a photoreal depiction is
  // never acceptable and Flux refuses it anyway. This is a policy, not a weight.
  if (p.minorHarm) {
    risks.push("harm to a minor is central → never depict the child in that context; symbolic/abstract only (storyboard rule), photoreal excluded");
    return { pick: "antidote", confidence: "strong", voxScore: vox, antidoteScore: antidote, reasons: [...reasons, "minorHarm: photoreal is excluded by policy → Antidote, symbolic staging only"], risks, source: "book-profile" };
  }
  const pick = vox > antidote ? "vox" : "antidote";
  const top = Math.max(vox, antidote, 1);
  const rel = Math.abs(vox - antidote) / top;
  const confidence = rel > 0.5 && top >= 25 ? "strong" : rel > 0.2 ? "moderate" : "weak";
  if (!reasons.length) reasons.push("no dominant signal — decide from mustSee: real/period places and people → Vox, ideas and a contemporary cast → Antidote");
  return { pick, confidence, voxScore: vox, antidoteScore: antidote, reasons, risks, source: "book-profile" };
}

module.exports = { analyzeEngineFit, analyzeBookProfile, validateProfile, effectiveViolence, SENSITIVE_OK, PERIOD_YEAR, PERIOD_LOOKS, IDEA_DENSITY };
