/**
 * told-entities.js — WHAT DOES THE NARRATION NAME, and is it on screen? (Film Flow level 2, 2026-11-13.)
 *
 * The operator's finding: the narration says "Microsoft … Google … Windows versus Chrome OS" and the screen shows a
 * street and two unrelated people. This is the deterministic half of the fix: read the narration, list the THINGS IT
 * NAMES (people, companies, products, places — proper names said more than once — and the years it gives), and for a
 * planned film say on how many of the scenes that name one, that name is on screen. The other half is the author's:
 * give each name a picture (an emblem, a dressed person, an icon) and stage what happens to it (ToldStage).
 *
 * A proper name is found from capital letters inside a sentence (never the first word of one), so it works on
 * auto-captions without a model. It is a CANDIDATE list: the author removes a false name and adds a missed one in
 * books/<slug>/storyboard/entities.json; nothing here decides what a film shows. Pure; tested by test-told-entities.js.
 */
const STOP = new Set(`I I'm I've I'll I'd The A An And But So It Its It's He She They We You This That These Those There What When Where Why How If In On At Of For To Is Was Yeah Yes No Oh Right Exactly Well Okay OK Because Like Just Now Then Or As By His Her Their Our My Your One Two Three Not Wait Which Who Think Let Here Be Do Did Does Have Has Had Are Were Can Could Would Should Really Absolutely Literally Completely Totally Sure Also Even Every All Some Most Many Much More From With Without About Into Over After Before Wow Huh Hmm Mhm God Thanks Imagine Look See Say Take Maybe Actually Basically Honestly Obviously Still Never Always Again Both Each Either Neither Nobody Everyone Someone Something Nothing Everything Mr Mrs Ms Dr Chapter Part Book English American`.split(/\s+/));

const clean = (w) => String(w || "").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9']+$/g, "");
// "We've", "It'll", "Don't" are not names: an apostrophe inside a word is a contraction (a possessive 's is stripped before)
const isName = (w) => /^[A-Z][A-Za-z-]{1,}$/.test(w) && !STOP.has(w);
const endsSentence = (w) => /[.!?]["')\]]?$/.test(String(w || ""));

/**
 * namesIn(text) → the proper names in one stretch of narration, in order: runs of capitalised words that do not start
 * a sentence ("Google Docs", "Johann Rochlitz"), plus four-digit years.
 */
function namesIn(text) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out = [];
  let run = [];
  const flush = () => { if (run.length) out.push(run.join(" ")); run = []; };
  words.forEach((raw, i) => {
    const w = clean(raw).replace(/['’]s$/, "");
    const first = i === 0 || endsSentence(words[i - 1]);
    if (/^(1[5-9]|20)\d\d$/.test(w)) { flush(); out.push(w); return; }
    // a capitalised first word is a name only when it continues one ("…Google. Microsoft Office" — the run decides)
    if (isName(w) && (!first || (isName(clean(words[i + 1] || "")) && !endsSentence(raw)))) run.push(w);
    else flush();
    if (endsSentence(raw)) flush();
  });
  flush();
  return out;
}

/**
 * entitiesOf(scenes) → [{name, count, scenes:[index], kind}] for names said in `min`+ scenes (a name inside a longer
 * one — "Mozart" in "Wolfgang Mozart" — counts with it). kind: "year" or "name" (the author says person / company / place).
 */
function entitiesOf(scenes, { min = 2 } = {}) {
  const per = scenes.map((s) => [...new Set(namesIn(typeof s === "string" ? s : s._narration || s.text || ""))]);
  const count = new Map();
  per.forEach((names, i) => { for (const n of names) count.set(n, [...(count.get(n) || []), i]); });
  // a full name and the surname people keep saying are one person: "Wolfgang Mozart" counts with "Mozart",
  // "Johann Rochlitz" with "Rochlitz". Only the LAST word folds: "Google Docs" is not "Google", it is its product.
  for (const long of [...count.keys()]) {
    const words = long.split(" ");
    const last = words[words.length - 1];
    if (words.length < 2 || !count.has(last)) continue;
    count.set(last, [...new Set([...count.get(last), ...count.get(long)])].sort((a, b) => a - b));
    count.delete(long);
  }
  return [...count].filter(([, at]) => at.length >= min).map(([name, at]) => ({ name, count: at.length, scenes: at, kind: /^\d{4}$/.test(name) ? "year" : "name" }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ── THE BOOK'S OWN TERMS (2026-11-18) ───────────────────────────────────────────────────────────────────────────────
// A proper name starts with a capital, so a book of IDEAS had nothing to show: "Thinking in Systems" gave two
// candidates (CEO, Meadows) while it says "feedback loop", "stock" and "delay" in scene after scene — and its film
// stood in the shared office. A TERM is a phrase of content words the narration says in many scenes and the other
// films of the channel do not (data/narration-background.json). Candidates only: the author keeps the ones that are
// the book's ideas, draws each (entities.json, kind "idea") and stages it. No model.
const FUNCTION_WORDS = new Set(`a an the and or but so if then than that this these those there here it its is are was were be been being am do does did done have has had having will would can could should may might must shall not no nor of in on at to for from by with without into onto over under about as up down out off again more most much many very just only even also still really actually literally basically kind sort lot lots thing things something anything everything nothing someone anyone everyone people person way ways time times day days year years moment point part bit one two three four five first second third next last new old good bad big small little great right wrong true real whole same other another every each all both few some any such own what which who whom whose when where why how i you he she we they me him her us them my your his our their mine yours yeah yes okay ok oh uh um well like know think mean say says said saying tell tells told talk talking look looks looking see sees seen get gets got getting go goes going went come comes came make makes made making take takes took want wants need needs let lets put keep kept give gives gave feel feels felt find finds found work works working use uses used try tries tried call calls called start starts started book books author chapter page pages story idea ideas example examples question questions answer answers sense fact facts world life lives mind minds exactly absolutely precisely completely entirely simply suddenly always never often sometimes usually maybe perhaps because though although while until since before after during between against through across around toward towards within upon back away together instead rather quite pretty enough too almost already yet now then today tomorrow yesterday ever once twice`.split(/\s+/));
const termWord = (w) => /^[a-z][a-z'-]{2,}$/.test(w) && !FUNCTION_WORDS.has(w) && !FUNCTION_WORDS.has(w.replace(/'s$|s$/, ""));

/** phrasesIn(text) → every one-, two- and three-word run of content words in a stretch of narration (lowercase). */
function phrasesIn(text) {
  const out = [];
  for (const sentence of String(text || "").toLowerCase().split(/[.!?;:,()"“”]+/)) {
    const words = sentence.split(/\s+/).map((w) => w.replace(/^[^a-z]+|[^a-z']+$/g, "").replace(/['’]s$/, "")).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      if (!termWord(words[i])) continue;
      out.push(words[i]);
      if (i + 1 < words.length && termWord(words[i + 1])) { out.push(`${words[i]} ${words[i + 1]}`); if (i + 2 < words.length && termWord(words[i + 2])) out.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`); }
    }
  }
  return out;
}

/**
 * termsOf(scenes, { background, max }) → [{ term, count, scenes:[index], sharedBy }] — the phrases this film says in many
 * scenes that few other films say. background = data/narration-background.json ({ books, phrases }); without it every
 * frequent phrase is a candidate. A word that almost only appears inside a kept longer phrase is folded into it
 * ("feedback" into "feedback loop"); a plural folds into its singular.
 */
function termsOf(scenes, { background = null, max = 24 } = {}) {
  const N = scenes.length, at = new Map();
  scenes.forEach((s, i) => { for (const p of new Set(phrasesIn(typeof s === "string" ? s : s._narration || s.text || ""))) at.set(p, [...(at.get(p) || []), i]); });
  // plural → singular when both are said
  for (const p of [...at.keys()]) { const sing = p.replace(/s$/, ""); if (sing !== p && at.has(sing)) { at.set(sing, [...new Set([...at.get(sing), ...at.get(p)])].sort((a, b) => a - b)); at.delete(p); } }
  // a name is not a term: what entitiesOf lists (any capitalised word said in two scenes) is left to it
  const names = new Set(entitiesOf(scenes, { min: 2 }).flatMap((e) => e.name.toLowerCase().split(" ")));
  const books = (background && background.books) || 0, shared = (p) => (background && background.phrases && (background.phrases[p] || background.phrases[`${p}s`])) || 0;
  const need = Math.max(4, Math.ceil(N * 0.012));
  const cands = [];
  for (const [p, sc] of at) {
    const len = p.split(" ").length, df = shared(p);
    if (sc.length < (len === 1 ? need + 2 : need)) continue;
    if (books && df / books > (len === 1 ? 0.07 : 0.14)) continue; // the whole channel says it
    if (len === 1 && p.length < 5) continue;
    if (p.split(" ").some((w) => names.has(w))) continue;
    if (books && len > 1 && p.split(" ").some((w) => shared(w) / books > 0.5)) continue; // built on a word every film says ("massive", "entire")
    cands.push({ term: p, count: sc.length, scenes: sc, sharedBy: df, len });
  }
  // a shorter phrase that lives inside a kept longer one is that longer one
  const keep = cands.filter((c) => !cands.some((l) => l.len > c.len && ` ${l.term} `.includes(` ${c.term} `) && l.count >= c.count * 0.6));
  return keep.sort((a, b) => b.count * (1 + 0.4 * (b.len - 1)) - a.count * (1 + 0.4 * (a.len - 1)) || a.term.localeCompare(b.term)).slice(0, max).map(({ len, ...c }) => c);
}

/** Everything a scene puts on screen as words: texts, diagram labels, name tags, and every label of a told stage. */
function shownText(scene) {
  const parts = [];
  for (const t of scene.texts || []) parts.push(t.text);
  if (scene.diagram) parts.push(JSON.stringify(scene.diagram.labels || ""), JSON.stringify(scene.diagram.nodes || ""), JSON.stringify(scene.diagram.items || ""));
  for (const c of scene.characters || []) parts.push(c.label, c.name, c.says);
  for (const p of scene.props || []) parts.push(p.label, p.text);
  for (const it of (scene.told && scene.told.items) || []) parts.push(it.label, it.sub);
  for (const sh of scene.shots || []) parts.push(shownText(sh));
  return parts.filter(Boolean).join(" · ").toLowerCase();
}

/** Is this name on screen in this scene? Any word of it longer than two letters counts ("Mozart" for "Wolfgang Mozart"). */
function showsName(scene, name) {
  const txt = shownText(scene);
  return String(name).toLowerCase().split(/\s+/).some((w) => w.length > 2 && new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(txt));
}

/**
 * mentionCoverage(config) → of the scenes whose narration names something the film names repeatedly, how many show it.
 * {entities, mentions, shown, share, missing:[{scene, name}]}
 */
function mentionCoverage(config, opts = {}) {
  const scenes = config.scenes || [];
  const ents = entitiesOf(scenes, opts).filter((e) => e.kind === "name");
  let mentions = 0, shown = 0;
  const missing = [];
  scenes.forEach((s, i) => {
    const here = ents.filter((e) => e.scenes.includes(i));
    if (!here.length) return;
    mentions++;
    if (here.some((e) => showsName(s, e.name))) shown++;
    else missing.push({ scene: s.id, names: here.map((e) => e.name) });
  });
  return { entities: ents.length, mentions, shown, share: mentions ? shown / mentions : null, missing };
}

module.exports = { STOP, namesIn, entitiesOf, phrasesIn, termsOf, shownText, showsName, mentionCoverage };
