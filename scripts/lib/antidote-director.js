/**
 * antidote-director.js — the SHOT DIRECTOR for the Antidote engine.
 *
 * plan-antidote.js used to stage every beat identically: one waist-up figure,
 * left/right by index parity, one punch word, one slow zoom. Across a 45-minute
 * book that produced 163 of 181 scenes with the exact same composition — dull to
 * watch and a "templated content" signal on the YPP side.
 *
 * This module decides, per beat: the SHOT (framing), the TRANSITION into it, the
 * BACKDROP (parallax set + texture + color), the MOTIF (visual metaphor) and the
 * CAST PLAN. Everything is deterministic — same VTT in, same film out — so runs
 * stay reproducible and resumable.
 */

const { filterMotifsByContract, filterShotsByContract } = require("./visual-contract");

// ── color helpers (kept local so the director owns its own palette math) ────
// Accepts hex AND the `rgb(r,g,b)` strings these helpers themselves return —
// the color script composes them (darken(lighten(x))), and a hex-only parser
// silently yields NaN, which renders as pure black.
const hx = (h) => {
  const s = String(h).trim();
  const m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = s.replace("#", "");
  const full = t.length === 3 ? t.split("").map((c) => c + c).join("") : t;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = ([r, g, b]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
const mixc = (h, to, a) => rgb(hx(h).map((c) => c + (to - c) * a));
const lighten = (h, a) => mixc(h, 255, a);
const darken = (h, a) => mixc(h, 0, a);

// deterministic pseudo-random in [0,1) from an integer seed — no Math.random,
// so a re-plan of the same VTT yields byte-identical JSON.
const rnd = (seed) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// ── beat classification ─────────────────────────────────────────────────────
const RE = {
  question: /\?\s*$|\b(why|how come|what if|imagine|ask yourself|consider this)\b/i,
  stat: /[$%]|\b\d{2,}\b|\b(million|billion|percent|thousand|times more|двое)\b/i,
  // "instead of X, Y" — a real fork in the road, worth a split/two-shot
  contrast: /\b(however|instead|rather than|versus|vs\.?|on the other hand|the opposite|difference between|the problem is|the truth is)\b/i,
  // a bare "but"/"or" is just spoken filler; it only decides the beat when
  // nothing stronger matched, otherwise a third of the film becomes split shots
  weakContrast: /\b(but|either|or you can|although|though)\b/i,
  crowd: /\b(most people|everyone|everybody|we all|people who|others|society|the crowd|the average person|nobody|no one)\b/i,
  negative: /\b(wrong|fail|failed|failure|lose|lost|losing|struggle|struggling|hard|fear|afraid|doubt|stuck|weak|worse|worst|mistake|quit|give up|can'?t|never|problem|pressure|anxious|worry|trap|pain|broken)\b/i,
  positive: /\b(win|won|grow|growth|better|best|succeed|success|achieve|potential|thrive|breakthrough|master|improve|proud|great|greater|rise|unlock|freedom|clarity|momentum)\b/i,
  story: /\b(he |she |they |his |her |told|said|asked|remembers?|one day|years ago|walked|met|sat|called)\b/i,
  time: /\b(years?|decades?|months?|hours?|minutes?|later|eventually|over time|someday|deadline|too late)\b/i,
  choice: /\b(choose|choice|decide|decision|option|path|fork|trade-?off|commit)\b/i,
};

function classify(text) {
  if (RE.stat.test(text)) return "stat";
  if (RE.crowd.test(text)) return "crowd";
  if (RE.contrast.test(text) || RE.choice.test(text)) return "contrast";
  if (RE.question.test(text)) return "question";
  if (RE.negative.test(text)) return "negative";
  if (RE.positive.test(text)) return "positive";
  if (RE.story.test(text)) return "story";
  if (RE.time.test(text)) return "time";
  if (RE.weakContrast.test(text)) return "contrast";
  return "neutral";
}

// ── CONCEPT LEXICON — the beat's literal SUBJECT ────────────────────────────
// classify() reads a beat's FORM (is it a stat? a question? negative?). This
// reads its SUBJECT — the concrete thing it is about — so "she survived the
// crash" can show a crash instead of two talking heads. Each concept maps 1:1 to
// a scene icon (see motifs.tsx SCENE_ICONS). Ordered specific → general; the
// first hit wins. This is the deterministic BASELINE; Claude overrides per beat
// with an explicit concept at art-direction time (same Claude-first split as the
// callouts). The set is the highest-frequency concepts across the book catalog.
const CONCEPT_LEXICON = [
  // ── High-Retention Narrative & Metaphor Concepts (Antidote 5.1) ──────────
  ["alarmClock", /\b(alarm|snooze|wake(s|d| up)?|waking up|asleep|sleep(ing|s)?|in bed|nightstand|morning alarm|five more minutes)\b/i],
  ["butterfly", /\b(butterfly( effect)?|fluke|chaos( theory)?|randomness|contingency|unbroken chain)\b/i],
  ["subway", /\b(subway|metro|train|transit|commute|platform|miss the train|railway)\b/i],
  // `car` no longer swallows "car crash" — `crash` is the subject there. The
  // lexicon is first-match-wins and nothing enforced the "specific before
  // general" rule its own comment asserts; scripts/lint-vocabulary.js now probes
  // for exactly this kind of shadowing.
  ["car", /\b(automobile|motorcade|stalls? the car|steering wheel|behind the wheel|car(?! crash))\b/i],
  ["coffee", /\b(coffee|espresso|cup of|mug|cafe|breakfast|morning routine)\b/i],
  // ── Tech, Silicon Valley & Startup Concepts (Antidote 5.0) ───────────────
  ["codeWindow", /\b(code|coding|programmer|developer|software|python|javascript|typescript|engineer|github|algorithm|app|build(ing)? an app|bug|feature|stack|repo|database)\b/i],
  ["rocketLaunch", /\b(launch(ed|ing)?|startup|silicon valley|take off|liftoff|mvp|prototype|y combinator|found(er|ed|ing)?|co-founder|scale|scale-up)\b/i],
  // a bare "funnel" shadowed `funnelTrap` (the essentialism metaphor) for every
  // book; the marketing funnel now has to say so
  ["funnelMetrics", /\b(sales funnel|conversion|leads?|prospects?|outreach|cold email|traffic|visitors?|subscribers?|opt-?in|retention rate)\b/i],
  ["dollarExchange", /\b(customer|paying customer|ask for money|pre-?order|first dollar|sale|sell(ing)?|credit card|stripe|paypal|transaction|payment|revenue|checkout)\b/i],
  ["laptopMockup", /\b(laptop|computer|macbook|dashboard|website|saas|platform|screen|interface|portal|landing page)\b/i],
  ["crash", /\b(car crash|crash(ed|ing)?|collision|accident|wreck(ed|age)?|smash(ed)?|totaled|head-on|pile-?up)\b/i],
  ["ledge", /\b(ledge|rooftop|\broof\b|cliff|bell tower|the edge|jump(ed|ing|s)?|leap(ed|t|ing)?|\bfell\b|falling|plunge|stories up|balcony)\b/i],
  ["water", /\b(lake|river(bed)?|ocean|\bsea\b|drown(ed|ing)?|flood|underwater|the water|blue hole|\bswim|\bwaves?\b)\b/i],
  ["grave", /\b(grave(yard)?|funeral|buried|\bbury\b|cemetery|memorial|headstone|tombstone|passed away|\bdied\b|\bdying\b|\bdeath\b)\b/i],
  ["medical", /\b(hospital|\bdoctor|therapist|therapy|counsel(or|ing)|diagnos(is|ed)|medication|\bpills?\b|clinic|\bnurse|psychiatr|mental illness|depression|bipolar)\b/i],
  ["notes", /\b(post-?its?|sticky notes?|\bnotes?\b|letter|\bwrote\b|writes?|writing|journal|diary|scribbl)\b/i],
  ["phone", /\b(text(s|ed|ing)?|\bphone|call(ed|s|ing)?|message|voicemail|\bscreen\b|\bemail)\b/i],
  ["school", /\b(school|classroom|schoolyard|homework|student|graduation|college|principal|\bgrades?\b|\bteacher\b|\bexam(s)?\b|\bin class\b|(?:math|science|history|art|english) class)\b/i],
  ["home", /\b(\bhome\b|\bhouse\b|bedroom|kitchen|\bcloset|living room|\bher room|\bhis room|apartment|the doorway)\b/i],
  ["family", /\b(mother|father|\bmom\b|\bdad\b|parents|\bfamily|\bsister|brother|siblings?|\bson\b|daughter)\b/i],
  ["road", /\b(\broad\b|highway|\bmap\b|drove|driving|\bdrive\b|journey|road trip|travel(ed|ing|s)?|wander(ed|ing|s)?|\bmiles?\b)\b/i],
  ["storm", /\b(\bstorm|rain(ing|ed|y)?|\bsnow|winter|freezing|the cold|\bdarkness|midnight|the wind)\b/i],
  ["star", /\b(\bstars?\b|starlight|bright place|the light|sunlight|shining|\bglow|constellation|ultraviolet)\b/i],
  ["heart", /\b(\blove\b|fell in love|kiss(ed|ing)?|romance|relationship|marriage|\bwedding|heartbreak)\b/i],
  ["fire", /\b(\bfire\b|flames?|burn(ed|ing|s)?|\bblaze|ashes?)\b/i],
  ["tree", /\b(\btree|forest|\bwoods\b|branch(es)?|\bleaves\b|highest branch|\bgarden)\b/i],
  // ── Phase 2 concepts (next frequency tier) ────────────────────────────────
  ["mask", /\b(mask|disguise|pretend(ing|ed)?|persona|facade|two faces|hiding behind|put on a face)\b/i],
  ["mirror", /\b(mirror|reflection|reflect(s|ing|ed)? (on|back)|stares? at (her|him|them)self)\b/i],
  ["key", /\b(a key\b|the key to|house key|car key|unlock(s|ed|ing)?|padlock|keyhole|locked away)\b/i],
  ["law", /\b(court(room)?|\bjudge\b|\bjury\b|\bgavel|lawsuit|\bsued?\b|\blegal\b|\btrial\b|verdict|police|arrest|prison|\bjail)\b/i],
  ["photo", /\b(photograph|photo\b|\bcamera|picture of|selfie|snapshot|framed picture|school picture|portrait)\b/i],
  ["war", /\b(\bwar\b|battle(field|s)?|\bfought\b|\bfight(s|ing)?\b|\benemy\b|soldier|\barmy\b|weapon|combat|\btroops)\b/i],
  ["game", /\b(\bgame\b|\bmatch(es)?\b|\bteam\b|\bscore(d|s)?\b|championship|tournament|trophy|\bcoach\b|the field)\b/i],
  ["work", /\b(\bjob\b|career|\boffice\b|workplace|\bboss\b|employee|coworker|paycheck|the firm|\bfired\b|got hired)\b/i],
  ["city", /\b(\bcity\b|skyline|downtown|skyscraper|the streets|metropolis|\burban\b)\b/i],
  ["food", /\b(\bdinner|breakfast|\blunch|\bmeal\b|\bfood\b|hungry|\bsupper|green beans|the dinner table)\b/i],
  // Reused abstract motifs given a concept mapping — no new drawing, low priority
  // so a real narrative subject above always wins first.
  ["coin", /\b(\bmoney\b|dollars?|\bcash\b|\bwealth\b|\bdebt\b|salary|\bincome\b|paycheck|can'?t afford|dead broke)\b/i],
  ["door", /\b(slam(med)? the door|shut the door|open(ed)? the door|the doorway|threshold|knock(ed|ing)? on)\b/i],
  // Archetypal / Philosophical Metaphors (Anthem, Psychology, Strategy)
  ["lightbulb", /\b(idea|lightbulb|invention|invented|spark|electricity|discovery|eureka|breakthrough|illumination|genius|light in the dark)\b/i],
  ["shadowSelf", /\b(shadow|dark side|subconscious|repressed|hidden self|dark nature|sinister|hidden motive|unconscious drive)\b/i],
  ["puppeteer", /\b(puppeteer|puppet|strings|manipulat(e|ion|ed|ing)|controlled|marionette|pull the strings|mastermind)\b/i],
  ["chains", /\b(chains|chained|freedom|escape|break free|liberation|shackles|prison|cage|unshackle)\b/i],
  ["compass", /\b(compass|true north|direction|guidance|navigation|purpose|moral compass|orient)\b/i],
  // Hypnotic Vector Metaphors (Compounding, Depth, Focus)
  ["dominoCascade", /\b(domino(es)?|compound(ing|ed)?|exponential|chain reaction|atomic habits?|small habits?|slight edge|ripple effect|snowball effect)\b/i],
  ["icebergDepth", /\b(iceberg|below the surface|hidden depths?|under the water|tip of the iceberg|unseen (effort|work|sacrifice)|what people see)\b/i],
  ["funnelTrap", /\b(funnel|prioritiz(e|ation|ing)|filter(ing)? the noise|essentialism|the one thing|ruthless(ly)?|100 distractions|noise into signal)\b/i],
  // Classical Philosophy & Conceptual Thought Experiments (Antidote 6.1)
  ["thirtyTyrants", /\b(thirty tyrants|tyrants|coup|404\s*bc|oligarch(s|y)?|sparta(n)?|critias|terror regime|bloody purge|30-?man\s*jun[ta]+|junta)\b/i],
  ["ringOfGyges", /\b(ring of gyges|gyges|invisible|invisibility|unseen|glaucon'?s challenge|impunity|shepherd'?s ring)\b/i],
  ["caveAllegory", /\b(allegory of the cave|the cave|shadows? on the wall|cave wall|shackled|prisoners in the cave|firelight|sunlight|ascent from the cave|platonic cave)\b/i],
  ["shipOfState", /\b(ship of state|the ship|the pilot|steersman|captain|mutinous crew|mutiny|true navigator|stargazer|star-gazer)\b/i],
  ["tripartiteSoul", /\b(tripartite soul|three parts of the soul|appetite|spirited part|charioteer|two horses|logistikon|thumos|epithumia|inner harmony|balance the soul)\b/i],
  ["kallipolis", /\b(kallipolis|ideal city|just city|philosopher king(s)?|philosopher ruler(s)?|guardian class|city in speech|city in the heavens|noble lie|three classes of the state)\b/i],
  ["fiveRegimes", /\b(five regimes|decline of the city|timocracy|oligarchy|democracy|tyranny|aristocracy|degeneration|decay of the state)\b/i],
  ["mythOfEr", /\b(myth of er|spindle of necessity|ananke|reincarnation|afterlife|transmigration|lots of souls|fates|clotho|lachesis|atropos)\b/i],
  // ── drawable motifs that had no way of being chosen by meaning ────────────
  // `lint-vocabulary.js` reports 18 of these. The abstract ones — spotlight,
  // ripple, orbit, shape, maze, arrow — stay unreachable ON PURPOSE: they carry
  // no subject, so a regex for them would only manufacture false relevance.
  // These six do carry one, and are deliberately narrow.
  ["summit", /\b(summit|the peak\b|mountaintop|top of the mountain|pinnacle|the ascent)\b/i],
  ["ladder", /\b(ladder|rung\b|climb(ed|ing)? (the|up)|career ladder|step by step up)\b/i],
  ["crack", /\b(cracks?\b|cracked|cracking|fracture|fissure|splits? apart|broke apart|shattered)\b/i],
  ["clock", /\b(the clock|o'?clock|hours? (later|passed|went by)|minutes ticking|running out of time)\b/i],
  ["balance", /\b(trade-?offs?|weigh(s|ed|ing) (the|up)|equilibrium|in the balance|evenly matched)\b/i],
  // NARROW on purpose: "the book" is said in every other sentence on a
  // book-summary channel, so a loose pattern would fire on the whole film.
  ["book", /\b(turns? the page|turned the page|the pages|paperback|bookshelf|manuscript|reading a book|opens? the book)\b/i],
  // Vector Handprops
  ["shield", /\b(shield|protect(ion|ed|ing)?|defense|defend|downside|guard|safe(ty)?|risk management|asymmetry)\b/i],
  ["trophy", /\b(trophy|champion(ship)?|win(ning|ner)?|victory|mastery|prize|conquer|award)\b/i],
  ["hourglass", /\b(hourglass|patience|urgent|urgency|deadline|clock ticking)\b/i],
  ["sword", /\b(sword|courage|brave|warrior|slay|cut through|decisive)\b/i],
  ["target", /\b(target|aim|bullseye|focus|the one thing|goal|objective|mission)\b/i],
  ["magnifier", /\b(magnifi(er|ed|ying)|examine|inspect|analyze|microscope|details?|look closer)\b/i],
  ["wallet", /\b(wallet|sav(e|ing|ings)|budget|cash|invest(ment|ing)?)\b/i],
  ["gift", /\b(gift|give|giving|generos(ity|ous)|present|charity|reciprocity)\b/i],
  ["zap", /\b(zap|lightning|momentum|spark|electric|momentum cascade)\b/i],
];

function detectConcept(text) {
  for (const [c, re] of CONCEPT_LEXICON) if (re.test(text)) return c;
  return null;
}
const SCENE_ICON_SET = new Set(CONCEPT_LEXICON.map(([c]) => c));
// lowercase spelling -> canonical (camelCase) icon name, so an authored
// "codewindow" / "CodeWindow" / "codeWindow" all resolve to the drawable one.
const CONCEPT_BY_LOWER = new Map(CONCEPT_LEXICON.map(([c]) => [c.toLowerCase(), c]));
// one warning per unknown authored concept per run, not one per scene
const warnedConcepts = new Set();

// ── CHARACTER EMOTIONS (Micro-reactions) ──────────────────────────────────
function detectEmotion(text, cls) {
  const t = String(text).toLowerCase();
  if (/\b(fire|burn(ing)?|discipline|unstoppable|drive|relentless|grind|dominate|crush it|passion|momentum|energy|warrior)\b/i.test(t)) return "fire";
  if (/\b(shock(ed|ing)?|sudden(ly)?|everything changed|blew my mind|blown away|crisis|unbelievable|astonishing|jaw drop)\b/i.test(t)) return "shock";
  if (/\b(lightbulb|eureka|aha|idea|realized|realize|discover(ed)?|the secret|the key|insight|breakthrough|clarity)\b/i.test(t)) return "lightbulb";
  if (/\b(mistake|trap|danger|fail(ure|ed)?|worry|stress|anxious|anxiety|threat|cost(ly)?|panic|fear|downside|stuck)\b/i.test(t) || cls === "negative") return "sweat";
  if (/\?|\b(why|how come|what if|puzzle|wonder|paradox|mystery|curious|ask yourself)\b/i.test(t) || cls === "question") return "question";
  if (cls === "positive") return "lightbulb";
  return "none";
}

// ── EXPLANATORY DIAGRAM detector (4.0) ───────────────────────────────────────
// A conservative HEURISTIC fallback. The high-quality path is Claude authoring a
// `diagram` in the emit-beats handoff (labels need real understanding); this only
// catches the one pattern whose diagram needs no authored labels — two rhythms
// locking into sync — so a book art-directed without Claude still gets the
// signature graphic on the beats that most call for it. A wrong diagram is worse
// than none, so everything that needs specific labels declines here and defers.
function detectDiagram(text) {
  const t = String(text).toLowerCase();
  if (/\b(in sync|synchron|entrain|neural align|align(?:ed|ing)? (?:their|our|the)|same (?:frequency|wavelength|rhythm)|lock(?:ed)? (?:in|into) (?:sync|phase|step)|match(?:ing|ed)? (?:their|the)? ?(?:frequency|rhythm|energy|intensity))\b/.test(t))
    return { type: "matchWave", labels: ["IN SYNC"], values: [] };
  return null;
}

// Icons that read as a place/event a figure can stand INSIDE — these use the
// `diorama` shot (large environmental icon + a silhouette in front of it) instead
// of the side-by-side `illustration`. The rest (an object held up, an emotion) stay
// side-by-side.
const DIORAMA_ICONS = new Set([
  "home", "school", "city", "grave", "ledge", "crash", "road", "water", "tree", "storm", "work", "war", "notes",
]);
// For a CONTRAST beat that has a concept, the `beforeAfter` shot shows the concept
// and its opposite with an arrow between — a transformation in one frame. Only
// pairs that read cleanly and whose second icon exists.
const OPPOSITE = {
  home: "grave", grave: "home", star: "storm", storm: "star",
  fire: "water", water: "fire", heart: "grave", work: "home",
  war: "heart", crash: "medical", notes: "fire",
};

// ── CONCEPT → LOCATION ──────────────────────────────────────────────────────
// The backdrop used to rotate through a genre's four abstract sets on a fixed
// run length, so it never said WHERE a beat happened: a dinner-table beat and a
// courtroom beat shared a field. The engine now owns real places, and the beat's
// own subject picks one. A location still HOLDS for a run (a set that changes
// every beat is strobing, not geography) — this only overrides the rotation when
// the narration has actually moved somewhere.
const CONCEPT_SET = {
  home: "room", family: "kitchen", food: "kitchen",
  school: "classroom", notes: "library", book: "library",
  work: "office", medical: "hospital", law: "court",
  city: "street", road: "highway", crash: "highway",
  water: "shore", tree: "forest", grave: "forest",
  storm: "sky", star: "sky", heart: "cafe", phone: "cafe",
  mirror: "bedroom", photo: "bedroom", key: "room",
  game: "stage", war: "horizon", ledge: "street",
  // Tech & Silicon Valley (Antidote 5.0)
  codeWindow: "workstation",
  laptopMockup: "workstation",
  rocketLaunch: "startupGarage",
  funnelMetrics: "pitchStage",
  dollarExchange: "pitchStage",
  // High-Retention Narrative & Metaphor Concepts (Antidote 5.1)
  alarmClock: "bedroom",
  subway: "street",
  car: "street",
  butterfly: "horizon",
  coffee: "kitchen",
  hourglass: "room",
  zap: "abstract",
  // Classical Philosophy & Conceptual Thought Experiments (Antidote 6.1)
  thirtyTyrants: "agora",
  ringOfGyges: "colonnade",
  caveAllegory: "cave",
  shipOfState: "shipDeck",
  tripartiteSoul: "colonnade",
  kallipolis: "agora",
  fiveRegimes: "colonnade",
  mythOfEr: "manuscript",
};
// Places a figure can plausibly SIT in — the sit pose needs furniture behind it
// or it reads as a person crouching in a void.
const SEATED_SETS = new Set(["kitchen", "cafe", "library", "classroom", "hospital", "bedroom", "office", "room", "workstation", "startupGarage", "pitchStage", "colonnade", "manuscript", "agora"]);
// Places that are outdoors and wide — where WALKING across the frame reads.
const WALKABLE_SETS = new Set(["street", "highway", "forest", "shore", "horizon", "city", "sky", "agora", "colonnade", "shipDeck", "cave"]);
// Shots that draw the full rig (must mirror charsFull in src/engines/antidote/shots.ts).
// Only these can show legs, so only these can walk or sit.
const FULL_BODY_SHOTS = new Set(["wide", "crowd", "diorama", "illustration", "lowAngle", "silhouette"]);

// ── CONCEPT → HAND PROP ─────────────────────────────────────────────────────
// When the subject is something a person can hold, the person holds it.
const CONCEPT_HOLD = {
  // Direct vector handprops
  shield: "shield",
  trophy: "trophy",
  hourglass: "hourglass",
  sword: "sword",
  target: "target",
  magnifier: "magnifier",
  wallet: "wallet",
  gift: "gift",
  zap: "zap",
  phone: "phone",
  // Classical Philosophy handprops
  ringOfGyges: "coin",
  thirtyTyrants: "sword",
  kallipolis: "shield",
  tripartiteSoul: "shield",
  // Tech & Business Handprops (5.0)
  codeWindow: "laptop",
  laptopMockup: "laptop",
  dollarExchange: "creditCard",
  // Narrative mapping. These were substitutions for glyphs that in fact exist
  // under the concept's own name in the `handProp` enum (schema.ts) — `key` was
  // being handed a `target`, `compass` an `hourglass` — and `food` was mapped to
  // "coffee", which is NOT in the enum at all, so the character held nothing.
  // Prefer the literal glyph; substitute only where the concept has none.
  coin: "coin",
  food: "cup",
  notes: "notes",
  key: "key",
  lightbulb: "lightbulb",
  compass: "compass",
  game: "trophy",
  war: "sword",
  // Previously unreachable glyphs that the lexicon already names as concepts.
  mask: "mask",
  photo: "photo",
  mirror: "mirror",
  work: "briefcase",
  heart: "flower",
  home: "key",
};
// Shots where the cast is present AND its hands are in frame. `closeUp` is
// deliberately absent: at that scale the hands are below the bottom edge, so a
// hold there spends the beat's business on an object nobody can see.
const HOLDABLE_SHOTS = new Set(["medium", "twoShot", "overShoulder", "wide", "lowAngle"]);

// ── SUSTAINED SHOTS ─────────────────────────────────────────────────────────
// Every beat used to reset the stage: new shot, new backdrop, new transition,
// every ~6.5s, for 45 minutes. That is a very well-cut SLIDE DECK, and it is the
// clearest structural difference from a hand-animated channel, where a shot
// begins, develops and ends across several sentences. A sustained beat keeps the
// previous shot, set and cast, cuts on nothing, and CONTINUES the camera move —
// so two or three beats read as one continuous take.
const SUSTAINABLE = new Set(["medium", "wide", "twoShot", "closeUp", "diorama", "overShoulder"]);
const MAX_SUSTAIN = 2; // extra beats added to a take; 3 beats total is the ceiling

// ── shot candidates per beat class (ranked) ─────────────────────────────────
const SHOT_MENU = {
  title: ["lowAngle", "medium", "wide"],
  stat: ["insert", "closeUp", "lowAngle", "medium"],
  crowd: ["crowd", "wide", "split", "medium"],
  contrast: ["split", "twoShot", "overShoulder", "wide"],
  question: ["closeUp", "insert", "overShoulder", "medium"],
  negative: ["silhouette", "closeUp", "overShoulder", "medium"],
  positive: ["lowAngle", "wide", "insert", "medium"],
  story: ["twoShot", "overShoulder", "wide", "medium"],
  time: ["insert", "wide", "closeUp", "medium"],
  neutral: ["medium", "wide", "closeUp", "twoShot"],
};

// Big shots are strong but wear out fast — each gets a cooldown in scenes.
const COOLDOWN = { insert: 5, crowd: 9, silhouette: 7, split: 6, lowAngle: 5, overShoulder: 4, closeUp: 3, twoShot: 4, wide: 2, medium: 0, illustration: 2 };
// Shots that count as a pattern interrupt when the film has gone flat. The
// illustration shot is cast-light (one silhouette + a scene icon), so it breaks
// a presenter run just like an insert does.
const INTERRUPTS = ["insert", "silhouette", "crowd", "split", "lowAngle", "illustration"];
// Beat classes that are prone to the talking-head default and have no strong
// structural shot of their own — these are the ones an illustration should take
// over when the beat has a concrete subject. stat/crowd/contrast already own a
// non-presenter shot (the number, the crowd, the split), so they keep it.
const ILLUSTRATABLE = new Set(["story", "neutral", "negative", "positive", "question", "time"]);

// ── motifs per beat class ───────────────────────────────────────────────────
const MOTIF_MENU = {
  stat: ["counter", "barChart"],
  crowd: ["orbit", "ripple"],
  contrast: ["balance", "door", "maze"],
  question: ["maze", "orbit", "ripple"],
  negative: ["crack", "maze", "clock"],
  positive: ["lineGrowth", "summit", "ladder", "stack"],
  story: ["book", "spotlight", "clock"],
  time: ["clock", "ripple", "lineGrowth"],
  neutral: ["shape", "orbit", "ripple", "spotlight"],
  title: ["spotlight", "orbit"],
};
const MONEY_MOTIFS = ["coin", "moneyRain", "barChart", "counter"];

// ── backdrop sets per genre — a "location" holds for a run of beats ─────────
const SET_MENU = {
  money: ["workstation", "pitchStage", "office", "street"],
  business: ["workstation", "startupGarage", "pitchStage", "office", "serverRoom"],
  tech: ["workstation", "serverRoom", "startupGarage", "office"],
  psychology: ["room", "abstract", "horizon", "stage"],
  philosophy: ["agora", "colonnade", "cave", "manuscript", "shipDeck", "horizon", "stage"],
  "self-help": ["room", "horizon", "abstract", "street"],
  default: ["abstract", "horizon", "room", "street"],
};
const TEXTURE_FOR = {
  office: "grid", street: "grain", room: "grain", stage: "rays", sky: "none", abstract: "dots", horizon: "grain", none: "grain",
  workstation: "grid", startupGarage: "dots", serverRoom: "grid", pitchStage: "grain",
  agora: "grain", colonnade: "grain", cave: "grain", shipDeck: "grain", manuscript: "paper",
};

// ── transitions per beat class ──────────────────────────────────────────────
const TRANS_MENU = {
  stat: ["flash", "irisIn", "wipeUp"],
  crowd: ["wipeUp", "dissolve", "wipeRight"],
  contrast: ["wipeLeft", "whipLeft", "dissolve", "whipRight"],
  question: ["dissolve", "irisIn", "wipeRight"],
  negative: ["dissolve", "wipeLeft", "slideUp"],
  positive: ["wipeRight", "slideUp", "irisIn"],
  story: ["wipeRight", "dissolve", "wipeLeft"],
  time: ["dissolve", "wipeUp", "irisIn"],
  neutral: ["wipeRight", "dissolve", "wipeLeft", "slideUp"],
};

/**
 * Who is on screen for this beat.
 *
 * The narrator is the voice talking to camera (explaining, asking, framing);
 * the protagonist is the "you" the book is about and carries every lived beat;
 * the foil is whoever the protagonist is up against; the mentor shows up on
 * advice beats. Assigning ROLES rather than looks is what makes the same face
 * come back across 45 minutes instead of 224 strangers.
 */
function castRoles(cls, count, index) {
  if (!count) return [];
  const lead =
    cls === "title" || cls === "neutral" || cls === "question" || cls === "time"
      ? "narrator"
      : cls === "positive" && index % 4 === 3
        ? "mentor"
        : "protagonist";
  if (count === 1) return [lead];
  // A two-hander needs someone to push against — never the same role twice.
  const second = lead === "narrator" ? "protagonist" : cls === "positive" ? "mentor" : "foil";
  return [lead, second];
}

function genreSets(genre) {
  const g = String(genre || "").toLowerCase();
  for (const key of Object.keys(SET_MENU)) if (key !== "default" && g.includes(key)) return SET_MENU[key];
  if (/finance|invest|wealth/.test(g)) return SET_MENU.money;
  return SET_MENU.default;
}

/**
 * Director — stateful across the film so it can enforce anti-repeat, cooldowns
 * and pattern interrupts.
 */
function createDirector({ palette, genre, slug, bible }) {
  const PAL = palette;

  /**
   * WHERE THIS BOOK IS ALLOWED TO HAPPEN.
   *
   * The backdrop used to rotate through a GENRE's set menu, which knows nothing
   * about the book. Measured on `siddhartha` — a parable set in ancient India —
   * the film used 17 sets including `kitchen` x40, `cafe` x32, `highway` x31,
   * `classroom` x5 and `startupGarage` x6. A startup garage in ancient India is
   * not a near miss; it is the loudest mistake the engine can make, and no
   * amount of per-beat art direction fixes it because the rotation never asked.
   *
   * `books/<slug>/story-bible.json` already names the places a book actually
   * has (`plan-bible.js` finds them in the narration). When it does, the
   * rotation is restricted to those plus the placeless sets, which cannot be
   * anachronistic because they depict nowhere. A CONCEPT_SET override is
   * filtered through the same list, so "the word `launch` appeared" can no
   * longer teleport a 5th-century BCE scene into a garage.
   *
   * BACKWARD COMPATIBLE: a book with no story-bible.json, or one that declares
   * no places, keeps the genre rotation exactly as before.
   */
  const PLACELESS_SETS = ["abstract", "horizon", "sky", "stage"];
  // Read the story bible here rather than taking it from the caller: the `bible`
  // argument is `creative-bible.json` (a different, older artifact), and this
  // has to hold for anything that constructs a director.
  const storyBible = (() => {
    try {
      const fsx = require("fs");
      const p = require("path").join(__dirname, "..", "..", "books", String(slug || ""), "story-bible.json");
      return fsx.existsSync(p) ? JSON.parse(fsx.readFileSync(p, "utf8")) : null;
    } catch { return null; }
  })();
  const forbiddenSets = new Set([
    ...(storyBible?.world?.forbid || []).filter((f) => /^(classroom|office|workstation|startupGarage|serverRoom|pitchStage|kitchen|bedroom|hospital|street|highway)$/.test(f)),
  ]);
  const allowedSets = (() => {
    const declared = storyBible && storyBible.places
      ? [...new Set(Object.values(storyBible.places).map((p) => p && p.set).filter(Boolean))]
      : [];
    if (!declared.length) return null;                      // no claim -> no constraint
    return new Set([...declared, ...PLACELESS_SETS].filter((s) => !forbiddenSets.has(s)));
  })();
  const permitted = (set) => (!allowedSets || allowedSets.has(set)) && !forbiddenSets.has(set);

  const base = (bible && bible.antidote && Array.isArray(bible.antidote.preferredSets) && bible.antidote.preferredSets.length > 0)
    ? bible.antidote.preferredSets
    : genreSets(genre);
  const filtered = base.filter(permitted);
  // never leave the rotation empty — a book whose declared places share nothing
  // with its genre menu still needs somewhere to be
  const sets = filtered.length ? filtered
    : allowedSets ? [...allowedSets] : base;
  /**
   * PER-BOOK VISUAL VOCABULARY.
   *
   * `customSvg` is the escape hatch that lets a book carry an icon the shared
   * 74-motif registry does not have — as DATA, so it travels in the render
   * bundle and costs no per-book engine code. It has fired ZERO times in 15
   * books, because the only way to supply it was `creative-bible.json`'s
   * `activeCustomMotifs`, which only two of six universes ever populate and
   * which only five books even have.
   *
   * `books/<slug>/motifs.json` is the direct path: a plain map of
   *   { <key>: { title, viewBox, paths: [{ d, fill|stroke, strokeWidth }] } }
   * in the same shape the renderer already accepts. The story bible's `objects`
   * are where you find out which ones a book needs — anything whose `concept`
   * the lint reports as undrawable is a candidate.
   */
  const perBook = (() => {
    try {
      const p = require("path").join(__dirname, "..", "..", "books", String(slug || ""), "motifs.json");
      const fsx = require("fs");
      if (!fsx.existsSync(p)) return {};
      const loaded = JSON.parse(fsx.readFileSync(p, "utf8"));
      return loaded && typeof loaded === "object" ? (loaded.motifs || loaded) : {};
    } catch { return {}; }
  })();
  const customMotifs = {
    ...((bible && bible.antidote && bible.antidote.activeCustomMotifs) || {}),
    ...perBook,   // the per-book file wins
  };
  const seedBase = String(slug || "antidote").split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  const state = {
    recentShots: [],
    lastUsedAt: {}, // shot -> scene index
    recentTransitions: [],
    lastTransition: "",
    setRun: 0,
    setIndex: 0,
    lastMotif: "",
    scenesSinceInterrupt: 0,
    lastConceptAt: {}, // concept -> scene index (per-icon cooldown)
    scenesSinceIllustration: 99,
    lastDiagramAt: -99, // explanatory-diagram cooldown (4.0)
    // sustained-take bookkeeping
    sustainRun: 0, // how many beats the current take has already been extended by
    prev: null, // the previous beat's full decision, so a take can continue it
    lastHoldAt: -99,
    lastHold: "",
    lastWalkAt: -99,
    lastSitAt: -99,
    forcedSet: "", // a location the narration moved us to
    forcedSetAt: -99,
  };

  // ── COLOR SCRIPT ──────────────────────────────────────────────────────────
  // Rotating five backdrop palettes in a fixed order is decoration, not
  // direction: the frame's color said nothing about where you were in the book.
  // The field is now a function of narrative POSITION and beat VALENCE — a clean
  // neutral setup, a problem act that cools and closes in, the accent arriving
  // at the turn, and a warm open resolution. Within each act the field drifts
  // continuously, so neighbouring scenes match (continuity) while the film as a
  // whole visibly travels somewhere.
  const ACTS = [
    { until: 0.14, name: "setup" },
    { until: 0.55, name: "tension" },
    { until: 0.76, name: "turn" },
    { until: 1.01, name: "resolution" },
  ];
  const COOL = new Set(["negative", "contrast", "crowd"]);
  const WARM = new Set(["positive", "stat"]);

  function colorScript(pos, cls) {
    let i = ACTS.findIndex((a) => pos < a.until);
    if (i < 0) i = ACTS.length - 1;
    const from = i === 0 ? 0 : ACTS[i - 1].until;
    const k = Math.max(0, Math.min(1, (pos - from) / Math.max(0.001, ACTS[i].until - from))); // progress within the act
    // valence nudges the field without leaving the act's register
    const v = COOL.has(cls) ? -0.06 : WARM.has(cls) ? 0.06 : 0;
    const clamp = (x) => Math.max(0, Math.min(0.95, x));
    switch (ACTS[i].name) {
      case "setup":
        return { type: "gradient", colors: [lighten(PAL.paper, clamp(0.46 - k * 0.1 + v)), lighten(PAL.paper, clamp(0.24 + v))], act: "setup" };
      case "tension": {
        // steadily heavier and dimmer as the problem deepens
        const m = clamp(0.08 + k * 0.17 - v);
        return { type: "gradient", colors: [darken(lighten(PAL.paper, 0.3), m), darken(lighten(PAL.paper, 0.12), clamp(m + 0.06))], act: "tension" };
      }
      case "turn":
        return { type: "gradient", colors: [lighten(PAL.red, clamp(0.72 - k * 0.14 + v)), lighten(PAL.paper, clamp(0.3 + v))], act: "turn" };
      default:
        return { type: "gradient", colors: [lighten(PAL.gold, clamp(0.64 - k * 0.1 + v)), lighten(PAL.paper, clamp(0.16 + v))], act: "resolution" };
    }
  }

  function pickShot(cls, i, brief = null) {
    let rawMenu = SHOT_MENU[cls] || SHOT_MENU.neutral;
    if (brief && brief.antidote && Array.isArray(brief.antidote.shotPreference) && brief.antidote.shotPreference.length > 0) {
      rawMenu = [...brief.antidote.shotPreference, ...rawMenu];
    }
    const menu = filterShotsByContract(rawMenu, brief);
    const tail = state.recentShots.slice(-3);
    // force a pattern interrupt if the film has been "talking head" for too long
    const needInterrupt = state.scenesSinceInterrupt >= 6;
    const ranked = needInterrupt
      ? [...menu.filter((s) => INTERRUPTS.includes(s)), ...INTERRUPTS, ...menu]
      : menu;
    for (const shot of ranked) {
      if (tail.includes(shot)) continue;
      const last = state.lastUsedAt[shot];
      if (last !== undefined && i - last < (COOLDOWN[shot] ?? 0)) continue;
      return shot;
    }
    // everything on cooldown → the least recently used candidate that isn't the last shot
    const fallback = ranked.filter((s) => s !== state.recentShots[state.recentShots.length - 1]);
    const list = fallback.length ? fallback : ranked;
    let best = list[0];
    let bestAge = -1;
    for (const s of list) {
      const age = state.lastUsedAt[s] === undefined ? Number.MAX_SAFE_INTEGER : i - state.lastUsedAt[s];
      if (age > bestAge) { bestAge = age; best = s; }
    }
    return best;
  }

  const transFrames = (t) => (t === "flash" ? 8 : t.startsWith("whip") ? 12 : t === "irisIn" ? 14 : 10);

  function pickTransition(cls, i, setChanged) {
    // A location change gets a louder move — but rotated, because a whip on
    // every set change is exactly how a transition stops reading as punctuation.
    const menu = setChanged
      ? [["whipLeft", "irisIn", "wipeUp"], ["whipRight", "flash", "wipeLeft"], ["irisIn", "whipLeft", "slideUp"]][state.setIndex % 3]
      : TRANS_MENU[cls] || TRANS_MENU.neutral;
    // avoid anything used in the last two cuts, not just the last one
    const recent = state.recentTransitions.slice(-2);
    const pick = menu.find((t) => !recent.includes(t)) || menu.find((t) => t !== recent[recent.length - 1]) || menu[0];
    state.recentTransitions.push(pick);
    state.lastTransition = pick;
    return { type: pick, frames: transFrames(pick), color: PAL.red };
  }

// ── THE METAPHOR'S ARC ──────────────────────────────────────────────────────
// Phase 1 put the beat's literal SUBJECT on screen (CONCEPT_LEXICON), which
// stopped every beat being a talking head. But the subject was inert: a stone
// that means "shame" just sat there being a stone. The arc is what the object
// DOES across the beat, taken from the beat's own valence — the burden grows,
// the doubt drains away, the breakthrough rises. That is the difference between
// naming an idea and showing it.
//
// Motifs that ARE a quantity (counter/bars/ladder) animate their own value, so
// scaling them on top would fight their own read; they stay still.
// "lineChart" was never a propType — the drawable one is `lineGrowth`
// (motifs.tsx REGISTRY), so the guard that stops a redundant arc on a motif that
// already animates a quantity has been missing its most obvious member.
const SELF_ANIMATING = new Set(["counter", "barChart", "stack", "ladder", "clock", "lineGrowth"]);
const ARC_FOR_CLASS = {
  negative: "closein",   // the problem crowds the frame
  crowd: "grow",         // "everyone" gets bigger than you
  positive: "rise",
  stat: "grow",
  time: "fall",          // time running out, dropping through the frame
  contrast: "tilt",
  question: "tilt",
  story: "none",
  neutral: "none",
};
function arcFor(cls, motif) {
  if (SELF_ANIMATING.has(motif)) return "none";
  return ARC_FOR_CLASS[cls] || "none";
}

  /**
   * CONCEPT -> METAPHOR MOTIF.
   *
   * The gap this fills: a beat could KNOW its subject was `grave` and still draw
   * an `orbit`, because no mapping from a concept to a motif existed at all.
   * `pickMotif` read the beat's grammatical CLASS (stat/question/neutral...),
   * indexed a 2-4 entry menu, and chose inside it with `rnd(seed + i*7)`. That
   * is how 81.8% of every prop instance in the catalogue came out as abstract
   * filler.
   *
   * A concept that IS a drawable motif draws itself. The rest map to the motif
   * that means the same thing. Anything not listed falls through to the old
   * class menu, so nothing that worked before changes.
   */
  const CONCEPT_MOTIF = {
    law: "law", war: "war", home: "home", family: "family", school: "school",
    work: "work", city: "city", food: "food", photo: "photo", mask: "mask",
    key: "key", mirror: "mirror", game: "game", heart: "heart", fire: "fire",
    tree: "tree", star: "star", storm: "storm", road: "road", water: "water",
    grave: "grave", medical: "medical", phone: "phone", notes: "notes",
    crash: "crash", ledge: "ledge", coin: "coin", door: "door",
    // concepts with no icon of their own, mapped to the one that means it
    chains: "chains", compass: "compass", iceberg: "iceberg",
    lightbulb: "lightbulb", shadowSelf: "shadowSelf", puppeteer: "puppeteer",
    hourglass: "hourglass", shield: "shield", trophy: "trophy", sword: "sword",
    target: "target", magnifier: "magnifier", wallet: "wallet", gift: "gift",
    zap: "zap", subway: "subway", butterfly: "butterfly", coffee: "coffee", car: "car",
    alarmClock: "alarmClock", dominoCascade: "dominoCascade",
    icebergDepth: "icebergDepth", funnelTrap: "funnelTrap",
    codeWindow: "codeWindow", laptopMockup: "laptopMockup",
    rocketLaunch: "rocketLaunch", funnelMetrics: "funnelMetrics",
    dollarExchange: "dollarExchange",
  };

  function pickMotif(cls, shot, i, text, concept, brief = null) {
    const forbidden = new Set(brief?.mustNotShow || (brief?.antidote && brief.antidote.forbiddenMotifs) || []);

    // The beat's own subject, when we have one, beats a seeded draw from a menu
    // keyed on grammar. `state.lastMotif` still blocks an immediate repeat.
    if (concept && CONCEPT_MOTIF[concept] && !forbidden.has(CONCEPT_MOTIF[concept]) && CONCEPT_MOTIF[concept] !== state.lastMotif) {
      const type = CONCEPT_MOTIF[concept];
      state.lastMotif = type;
      return { type, scale: 1, enter: "pop", color: PAL.red, color2: PAL.ink, arc: arcFor(cls, type) };
    }
    if (customMotifs && typeof customMotifs === "object") {
      for (const [mKey, mDef] of Object.entries(customMotifs)) {
        if (forbidden.has(mKey)) continue;
        // Two landmines lived in this one line. An entry with no `title` built
        // `\b(key|)\b`, whose empty alternative matches EVERY beat — one custom
        // SVG on every scene of the film. And an unescaped `.` or `(` in a key
        // or title threw and killed the whole plan run. Build the alternation
        // from escaped, non-empty terms only.
        const terms = [mKey, mDef && mDef.title]
          .filter((t) => t && String(t).trim())
          .map((t) => String(t).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        if (!terms.length) continue;
        const kwPattern = new RegExp(`\\b(${terms.join("|")})\\b`, "i");
        if (kwPattern.test(text)) {
          return {
            type: "customSvg",
            customSvg: mDef,
            scale: 1,
            enter: "pop",
            color: PAL.accent || PAL.red,
            color2: PAL.ink,
            arc: "none",
          };
        }
      }
    }
    const isMoney = /\$|\bmoney|dollars?|wealth|income|salary|cost|price|invest/i.test(text);
    let menu = isMoney ? MONEY_MOTIFS : MOTIF_MENU[cls] || MOTIF_MENU.neutral;
    if (brief && brief.antidote && Array.isArray(brief.antidote.motifPreference) && brief.antidote.motifPreference.length > 0) {
      menu = [...brief.antidote.motifPreference, ...menu];
    }
    menu = filterMotifsByContract(menu, brief);
    menu = menu.filter((m) => m !== state.lastMotif);
    // A `counter` renders its number at 188px. With no number in the narration
    // it used to fall back to `value = 90` — twelve shipped scenes count up to a
    // "90" that is spoken nowhere in the film, and ten more count up to a year.
    // A quantity graphic must not invent a quantity, so the motif is simply not
    // available on a beat that states no number.
    const spokenNumber = (() => {
      const m = String(text).match(/\b(\d[\d,]{0,9})\b/);
      const n = m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
      return n > 0 && n < 1000000 ? n : null;
    })();
    if (spokenNumber === null) menu = menu.filter((m) => m !== "counter");
    if (!menu.length) {
      menu = filterMotifsByContract(MOTIF_MENU.neutral.filter((m) => m !== "counter"), brief);
    }
    if (!menu.length) {
      menu = ["spotlight"];
    }
    const motif = menu[Math.floor(rnd(seedBase + i * 7) * menu.length) % menu.length];
    state.lastMotif = motif;
    const spec = { type: motif, scale: 1, enter: "pop", color: PAL.red, color2: PAL.ink };
    if (motif === "counter") {
      spec.value = spokenNumber;
      if (/%|percent/i.test(text)) spec.label = "PERCENT";
      else if (/million/i.test(text)) spec.label = "MILLION";
      else if (/\$/.test(text)) spec.label = "DOLLARS";
    }
    if (motif === "barChart" || motif === "stack" || motif === "ladder") spec.value = 4 + (i % 3);
    spec.arc = arcFor(cls, motif);
    return spec;
  }

  /**
   * Direct one beat.
   * @returns {{shot,transition,bg,props,cast,camera,class:string}}
   */
  function direct({ text, index, isTitle, calloutAt, total, durationFrames, concept: authoredConcept, brief = null }) {
    const cls = isTitle ? "title" : classify(text);

    // ── SUBJECT → illustration shot ──────────────────────────────────────────
    // The beat's literal subject decides whether we cut to a concrete scene icon
    // instead of talking heads. Claude's authored concept wins (a truthy value
    // forces the icon; "" / "none" forces it off); otherwise the lexicon detects
    // one. Deterministic gates keep it from taking over the film: the icon can't
    // repeat within 8 scenes, illustrations don't run back-to-back, and only the
    // talking-head-prone classes yield to it (stat/crowd/contrast keep their own
    // strong shot). Same anti-repeat discipline as the shot picker.
    // Claude's authored concept used to be lowercased before the membership
    // test, so every camelCase icon the --emit-beats instructions advertise
    // (codeWindow, shadowSelf, dominoCascade, icebergDepth, funnelTrap,
    // rocketLaunch, alarmClock, …) failed `SCENE_ICON_SET.has()` and was
    // dropped in silence — the author had no way to learn the override never
    // took. Resolve case-insensitively to the canonical name instead, and say
    // so out loud when the name is not one we can draw.
    let concept = null;
    if (authoredConcept !== undefined && authoredConcept !== null && String(authoredConcept).trim()) {
      const canon = CONCEPT_BY_LOWER.get(String(authoredConcept).trim().toLowerCase());
      if (canon) concept = canon;
      else if (!warnedConcepts.has(String(authoredConcept))) {
        warnedConcepts.add(String(authoredConcept));
        console.warn(`  ⚠ authored concept "${authoredConcept}" is not a drawable icon — ignored (scene ${index})`);
      }
    } else {
      concept = detectConcept(text);
    }
    const conceptFresh = concept && index - (state.lastConceptAt[concept] ?? -99) >= 8;
    // A contrast beat isn't illustratable on its own (it keeps its split/two-shot),
    // EXCEPT when its concept has an opposite — then a two-icon beforeAfter says the
    // contrast better than talking heads do.
    const contrastPair = !!concept && cls === "contrast" && !!OPPOSITE[concept];
    const useIllustration =
      !isTitle && !!concept &&
      (authoredConcept
        ? true
        : (ILLUSTRATABLE.has(cls) || contrastPair) && conceptFresh && state.scenesSinceIllustration >= 2);

    // Within the illustration family, pick the composition: a contrast beat whose
    // concept has an opposite becomes a two-icon beforeAfter; an environmental
    // concept becomes a diorama (figure inside the scene); otherwise side-by-side.
    const otherIcon = concept ? OPPOSITE[concept] : null;
    const canBeforeAfter =
      useIllustration && cls === "contrast" && otherIcon &&
      index - (state.lastConceptAt[otherIcon] ?? -99) >= 6;
    const rawShot = isTitle
      ? "lowAngle"
      : useIllustration
        ? canBeforeAfter
          ? "beforeAfter"
          : DIORAMA_ICONS.has(concept)
            ? "diorama"
            : "illustration"
        : pickShot(cls, index, brief);
    let shot = rawShot;
    if (brief && brief.mustShow && brief.mustShow.includes("characters") && shot === "insert") {
      const allowed = filterShotsByContract(SHOT_MENU[cls] || SHOT_MENU.neutral, brief);
      shot = allowed[0] || "medium";
    }

    // ── SUSTAIN: is this beat a continuation of the previous take? ──────────
    // A sustained beat is deliberately NOT re-directed: same shot, same set,
    // same cast, no transition, and the camera picks up where it left off. That
    // is what turns three cuts into one developing take.
    const prev = state.prev;
    const canSustain =
      !!prev && !isTitle && index > 0 &&
      !useIllustration && !prev.usedIllustration &&
      SUSTAINABLE.has(prev.shot) &&
      state.sustainRun < MAX_SUSTAIN &&
      // A take may only be extended by a beat that CARRIES something. Sustaining
      // a silent beat doesn't create a continuous shot, it creates dead air: the
      // audit caught 30-second windows with nothing on screen but a slow drift.
      calloutAt != null &&
      // only carry a take through beats that don't demand their own structure
      (cls === "neutral" || cls === "story" || cls === prev.class) &&
      cls !== "stat" && cls !== "crowd" && cls !== "contrast";
    if (canSustain) {
      state.sustainRun += 1;
      const camPrev = prev.camera;
      // continue the same move rather than restarting it — a re-started drift is
      // exactly what makes a "continuous" take read as another cut
      const dz = camPrev.zoom[1] - camPrev.zoom[0];
      const dx = camPrev.panX[1] - camPrev.panX[0];
      const clampZ = (z) => Math.max(0.94, Math.min(1.2, z));
      const camera = {
        zoom: [clampZ(camPrev.zoom[1]), clampZ(camPrev.zoom[1] + dz * 0.8)],
        panX: [camPrev.panX[1], camPrev.panX[1] + dx * 0.8],
        panY: [camPrev.panY[1], camPrev.panY[1]],
      };
      if (calloutAt != null) camera.punch = { at: calloutAt, amount: cls === "stat" ? 0.09 : 0.05 };
      // Carry the lead's business into the continuation. A held object stays in
      // the hand and a walk keeps going FROM WHERE IT STOPPED — restarting the
      // travel range would teleport the figure back across the frame, which is
      // the opposite of a continuous take. `continued` tells the planner to
      // start the pose clock late so no entry spring replays.
      const pb = prev.cast.business;
      let carried = pb;
      if (pb && pb.travel) {
        const clamp = (v) => Math.max(-420, Math.min(420, v));
        const end = pb.travel[1];
        carried = { ...pb, travel: [clamp(end), clamp(end + (pb.travel[1] - pb.travel[0]) * 0.6)] };
      }
      const out = {
        shot: prev.shot,
        transition: { type: "cut", frames: 0 },
        bg: prev.bg,
        props: [],
        cast: { ...prev.cast, business: carried, continued: true },
        camera,
        class: cls,
        act: prev.act,
        concept: null,
        sustain: true,
      };
      state.recentShots.push(prev.shot);
      state.lastUsedAt[prev.shot] = index;
      state.scenesSinceInterrupt += 1;
      state.scenesSinceIllustration += 1;
      state.setRun += 1;
      state.prev = { ...out, usedIllustration: false };
      return out;
    }
    state.sustainRun = 0;

    // ── location ────────────────────────────────────────────────────────────
    // Default: hold a set for a run of 5–7 beats, then rotate. Override: when
    // the beat's concept names a real place we haven't just been in, MOVE there
    // — that is the difference between a backdrop and a location.
    const runLength = 5 + (index % 3);
    let setChanged = false;
    if (index === 0) {
      state.setRun = 0;
    } else if (state.setRun >= runLength) {
      state.setIndex += 1;
      state.setRun = 0;
      setChanged = true;
    }
    state.setRun += 1;
    let placed = concept ? CONCEPT_SET[concept] : null;
    // A concept may only move us somewhere the book actually has. Without this,
    // one loose regex hit ("launch", "class", "the doctor") relocates a scene to
    // a place the story does not contain — which is how a parable set in ancient
    // India acquired a startup garage. See the `allowedSets` note above; when a
    // book declares no places this is a no-op.
    if (placed && !permitted(placed)) placed = null;
    // Genre-aware sanitation (Antidote 5.0):
    // In business/tech/finance genres, strictly forbid domestic (kitchen/bedroom), clinical (hospital)
    // or criminal/legal (court) backdrops. Remap them to workplace/strategy equivalents.
    const isBusinessOrTech = /business|tech|money|finance|invest|startup|entrepreneur/.test(String(genre || "").toLowerCase());
    if (isBusinessOrTech && placed) {
      if (placed === "kitchen" || placed === "bedroom") placed = "workstation";
      else if (placed === "hospital") placed = "office";
      else if (placed === "court") placed = "pitchStage";
      else if (concept === "phone") placed = "workstation"; // cold outreach / customer validation is at the desk, not a cafe
      else if (placed === "forest" || placed === "shore") placed = "startupGarage";
      // the remap above can land on a set this book does not have either
      if (placed && !permitted(placed)) placed = null;
    }

    // Philosophy & Classical Antiquity sanitation (Antidote 6.1):
    const isAncientOrPhilosophy = /philosophy|ancient|classical|history|classics|stoic|greek|roman/.test(String(genre || "").toLowerCase()) ||
      (storyBible && (storyBible.world?.era?.includes("ancient") || storyBible.world?.era?.includes("classical") || (storyBible.world?.approxYear != null && storyBible.world.approxYear < 500)));
    if (isAncientOrPhilosophy) {
      if (placed === "classroom" || placed === "office" || placed === "workstation" || placed === "pitchStage" || placed === "startupGarage" || placed === "serverRoom") {
        placed = "agora";
      } else if (placed === "kitchen" || placed === "bedroom") {
        placed = "colonnade";
      } else if (placed === "hospital") {
        placed = "agora";
      }
      if (placed && !permitted(placed)) placed = "agora";
    }

    if (placed && placed !== state.forcedSet && index - state.forcedSetAt >= 3) {
      state.forcedSet = placed;
      state.forcedSetAt = index;
      state.setRun = 1;
      setChanged = index > 0;
    } else if (state.forcedSet && index - state.forcedSetAt >= 8) {
      // a location isn't sticky forever; fall back to the genre rotation
      state.forcedSet = "";
    }
    let set = state.forcedSet || sets[state.setIndex % sets.length];
    if (brief && brief.antidote && brief.antidote.set && permitted(brief.antidote.set)) {
      set = brief.antidote.set;
    }
    if (isAncientOrPhilosophy && !permitted(set)) {
      set = "agora";
    }
    const field = colorScript(total ? index / total : 0, cls);

    const bg = {
      type: field.type,
      colors: field.colors,
      set,
      texture: TEXTURE_FOR[set] || "grain",
      accent: PAL.ink,
      // Which act of the color script this field came from. Nothing renders it
      // today; it lands in the config so the arc is legible when auditing a
      // book by eye and so act-aware features (chapter cards, thumbnails) have
      // it without re-deriving position.
      act: field.act,
    };
    if (shot === "split") {
      bg.split = [lighten(PAL.paper, 0.34), lighten(PAL.red, 0.58)];
      bg.set = "none";
    }
    if (shot === "silhouette") {
      bg.type = "gradient";
      bg.colors = [lighten(PAL.red, 0.28), darken(PAL.red, 0.12)];
      bg.set = "sky";
      bg.texture = "rays";
    }

    const transition = index === 0 ? { type: "cut", frames: 0 } : pickTransition(cls, index, setChanged);

    // motif: mandatory on `insert` (there it IS the shot), otherwise ~1 in 3.
    // crowd is deliberately excluded from the "always" list — the crowd is
    // already the visual, a motif on top of it just fights for the same space.
    // On an illustration/diorama the scene icon IS the shot; beforeAfter places
    // two icons + an arrow; otherwise a metaphor motif fires on insert (mandatory)
    // or ~1 beat in 3.
    // A beat with NO callout has nothing else to offer the frame, so it always
    // gets its metaphor. This is the visual-event floor the audit enforces —
    // before it, a callout-less beat was a person standing on a gradient for
    // eight seconds, and a run of them was half a minute of nothing.
    const wantsMotif = shot === "insert" || calloutAt == null || rnd(seedBase + index * 13) < 0.34;
    let props;
    if (!useIllustration) {
      props = wantsMotif ? [pickMotif(cls, shot, index, text, concept, brief)] : [];
    } else if (shot === "beforeAfter") {
      props = [
        { type: concept, x: 548, y: 560, scale: 1.32, enter: "left", at: 0, color: PAL.red, color2: PAL.ink },
        { type: "arrow", x: 960, y: 566, scale: 0.72, enter: "pop", at: 8, color: PAL.ink, color2: PAL.ink },
        { type: otherIcon, x: 1372, y: 560, scale: 1.32, enter: "right", at: 12, color: PAL.red, color2: PAL.ink },
      ];
    } else {
      // illustration or diorama — the shot preset positions the single icon + figure
      props = [{ type: concept, scale: 1, enter: "pop", at: 0, color: PAL.red, color2: PAL.ink }];
    }
    if (brief && Array.isArray(brief.mustNotShow) && props.length > 0) {
      const forbidden = new Set(brief.mustNotShow);
      props = props.map((p) => {
        if (forbidden.has(p.type)) {
          const fallback = (concept && !forbidden.has(concept)) ? concept : "spotlight";
          return { ...p, type: fallback };
        }
        return p;
      });
    }

    // cast plan — staging comes from the shot preset, so only intent is stored.
    // Roles (not looks) are chosen here; the look is resolved from the book's
    // cast bible at render time, which is what lets a face actually recur.
    let castCount = 1;
    if (shot === "insert" || shot === "beforeAfter") castCount = 0;
    else if (shot === "twoShot" || shot === "split" || shot === "overShoulder") castCount = 2;
    if (brief && brief.mustShow && brief.mustShow.includes("characters") && castCount === 0) {
      castCount = 1;
      if (shot === "insert") shot = "medium";
    }
    const cast = { count: castCount, crowd: shot === "crowd" ? 7 + (index % 5) : 0, roles: castRoles(cls, castCount, index) };

    // ── BUSINESS: what the lead actually DOES with their body ───────────────
    // Rationed on purpose. A rig that walks in every wide and holds something in
    // every medium stops reading as behaviour and starts reading as a tic; these
    // land often enough to register and rarely enough to stay an event.
    const full = FULL_BODY_SHOTS.has(shot);
    let business = null;
    const holdProp = concept ? CONCEPT_HOLD[concept] : null;
    if (
      castCount > 0 && holdProp && HOLDABLE_SHOTS.has(shot) &&
      index - state.lastHoldAt >= 5 && holdProp !== state.lastHold
    ) {
      business = { action: "hold", holds: holdProp };
      state.lastHoldAt = index;
      state.lastHold = holdProp;
    } else if (
      castCount > 0 && full && WALKABLE_SETS.has(set) &&
      (cls === "story" || cls === "time" || cls === "neutral") &&
      index - state.lastWalkAt >= 7
    ) {
      // travel direction alternates so the film doesn't always drift one way
      const dir = index % 2 === 0 ? 1 : -1;
      business = { action: "walk", travel: [-150 * dir, 150 * dir] };
      state.lastWalkAt = index;
    } else if (
      castCount > 0 && full && SEATED_SETS.has(set) &&
      (cls === "question" || cls === "negative" || cls === "neutral") &&
      index - state.lastSitAt >= 9
    ) {
      business = { action: "sit" };
      state.lastSitAt = index;
    }
    cast.business = business;

    // camera: a slow drift + a punch on the callout frame
    const driftIn = index % 2 === 0;
    const wideish = shot === "wide" || shot === "crowd" || shot === "split";
    const camera = {
      zoom: driftIn ? [1.0, wideish ? 1.05 : 1.08] : [wideish ? 1.05 : 1.08, 1.0],
      panX: wideish ? [driftIn ? -26 : 26, driftIn ? 26 : -26] : [0, 0],
      panY: shot === "lowAngle" ? [18, -10] : [0, 0],
    };
    if (calloutAt != null) camera.punch = { at: calloutAt, amount: cls === "stat" ? 0.09 : 0.055 };
    // ── LONG-BEAT EVENT FLOOR ────────────────────────────────────────────────
    // A beat that runs 7+ seconds on one event is a still frame with a slow
    // drift on it. When there is no callout to punch on, the camera pushes in
    // once mid-beat; when the beat is very long, a second motif arrives late so
    // the frame changes again. Both are cheap and both are things the viewer
    // sees. (Measured by scripts/audit-antidote.js — this is what took the worst
    // dead window on a 36-minute plan from 31s to single digits.)
    const beatSecs = durationFrames ? durationFrames / 30 : 0;
    if (calloutAt == null && beatSecs >= 6.5) {
      camera.punch = { at: Math.round(durationFrames * 0.55), amount: 0.05 };
    }
    // A long beat also needs something in its BACK HALF. The worst remaining
    // windows were all "callout lands at second two, then eleven seconds of
    // drift" — so a beat that is long, or whose only event fires in its first
    // third, gets a second smaller motif late.
    const frontLoaded = calloutAt != null && calloutAt < durationFrames * 0.35;
    if ((beatSecs >= 10 || (beatSecs >= 7.5 && frontLoaded)) && !useIllustration && shot !== "insert" && shot !== "beforeAfter") {
      const late = pickMotif(cls, shot, index + 501, text, concept, brief);
      props = [...props, { ...late, at: Math.round(durationFrames * 0.66), enter: "fade", scale: 0.6 }];
    }

    // bookkeeping
    state.recentShots.push(shot);
    state.lastUsedAt[shot] = index;
    state.scenesSinceInterrupt = INTERRUPTS.includes(shot) ? 0 : state.scenesSinceInterrupt + 1;
    if (useIllustration) {
      state.lastConceptAt[concept] = index;
      state.scenesSinceIllustration = 0;
    } else {
      state.scenesSinceIllustration += 1;
    }

    // ── EXPLANATORY DIAGRAM (4.0) ────────────────────────────────────────────
    // A heuristic diagram is a fallback; Claude's authored `diagram` (via the
    // emit-beats handoff) wins in the planner. Gated by a cooldown so the graphic
    // stays an event, never on a title/illustration/insert beat.
    const heurDiagram =
      !isTitle && !useIllustration && shot !== "insert" && shot !== "beforeAfter" &&
      index - state.lastDiagramAt >= 10
        ? detectDiagram(text)
        : null;
    if (heurDiagram) state.lastDiagramAt = index;

    const emotion = detectEmotion(text, cls);
    const out = { shot, transition, bg, props, cast, camera, class: cls, act: field.act, concept: useIllustration ? concept : null, sustain: false, diagram: heurDiagram, emotion };
    state.prev = { ...out, usedIllustration: useIllustration };
    return out;
  }

  function stats() {
    const counts = {};
    for (const s of state.recentShots) counts[s] = (counts[s] || 0) + 1;
    return counts;
  }

  return { direct, stats };
}

module.exports = {
  createDirector, classify, detectConcept, detectDiagram, detectEmotion, lighten, darken,
  SCENE_ICONS: CONCEPT_LEXICON.map(([c]) => c),
  // The raw [name, regex] table. scripts/audit-relevance.js needs the regexes,
  // not just the names: to ask whether the icon on screen has any support in
  // the words actually being spoken while it is up.
  CONCEPT_LEXICON,
  CONCEPT_SET, CONCEPT_HOLD, FULL_BODY_SHOTS,
};
