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
  const periodBonus = narrative && era != null && era < PERIOD_YEAR ? 6 : 0;
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
function validateProfile(p) {
  const errs = [];
  if (!p || typeof p !== "object") return ["profile must be an object"];
  if (!["fiction", "nonfiction"].includes(p.kind)) errs.push(`kind must be fiction|nonfiction`);
  if (!WORLDS.includes(p.world)) errs.push(`world must be one of ${WORLDS.join("|")}`);
  if (!["story", "argument", "mixed"].includes(p.format)) errs.push("format must be story|argument|mixed");
  if (!["none", "some", "central"].includes(p.violence)) errs.push("violence must be none|some|central");
  if (typeof p.realPeople !== "boolean") errs.push("realPeople must be true|false");
  if (p.minorHarm !== undefined && typeof p.minorHarm !== "boolean") errs.push("minorHarm must be true|false");
  if (!Array.isArray(p.mustSee) || p.mustSee.length < 2) errs.push("mustSee: at least 2 concrete things the viewer must see");
  return errs;
}

function analyzeBookProfile(p) {
  let vox = 0, antidote = 0;
  const reasons = [], risks = [];
  if (p.realPeople || p.world === "real-historical") { vox += 30; reasons.push("the subject is real people / real events → photoreal shows the actual world (Vox)"); }
  if (p.world === "period" || (Number.isFinite(p.era) && p.era < PERIOD_YEAR && p.format !== "argument")) { vox += 20; reasons.push(`a period world${Number.isFinite(p.era) ? ` (${p.era})` : ""} → period realism favours Vox`); }
  if (p.format === "argument") { antidote += 30; reasons.push("an ideas/advice book → concepts are drawn as icons, diagrams and an everyman (Antidote)"); }
  if (p.format === "mixed") { antidote += 10; reasons.push("mixed story + argument → leans Antidote for the ideas"); }
  if (p.world === "ideas") antidote += 15;
  if (p.kind === "fiction" && (p.world === "contemporary" || p.world === "speculative")) { antidote += 15; reasons.push(`${p.world} fiction with a cast → staged characters in Antidote (We Were Liars: 0/30 wrong, image adds 70%)`); }
  if (p.violence === "central") { antidote += 20; risks.push("violence/death is central to the key scenes → Flux refuses many of those images (CONTENT_FILTERED); Antidote draws them symbolically"); }
  else if (p.violence === "some") risks.push("some violence → plan those beats as aftermath/symbol if Vox");
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

module.exports = { analyzeEngineFit, analyzeBookProfile, validateProfile, SENSITIVE_OK, PERIOD_YEAR };
