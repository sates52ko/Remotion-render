/**
 * narrative-form.js — every book is TOLD its own way (2026-11-18, operator: YPP "generic or repetitive content").
 *
 * Measured on the 46 prompts and 30 narrations in the repo: every prompt carried ONE spine (cold open → thesis → setup →
 * N beats → counterpoint → payoff) and ONE recipe for a beat (the "Depth Engine" a–e); the median prompt shared 40 % of
 * its words with the others; every film answered itself with the same words (per film: "right" 28×, "exactly" 18×,
 * "absolutely" 7×, in 30 of 30), 25 of 30 called themselves a "deep dive", and 28 of 32 films printed "INSIGHT n / N"
 * on screen. The openings were already each book's own (opening-grammar.js); the body was one template.
 *
 * So the body is a FORM chosen for the book: what the film is (a case file, a trial, a journey …), who the two hosts are
 * to each other in it, how one part is developed, how it ends, and what a part is CALLED on screen. The agent chooses
 * the form from the book (`--form=<key> --form-why="…"`); when it does not, the form is the one that fits the book's
 * kind and is farthest from the last 8 books — never the newest one again. Recorded in book.json (`form`), written
 * into the NotebookLM prompt, read by the planner for the on-screen part label.
 *
 * MEASURED on the first full recording (Dracula as a case file, 2026-11-18, audit/ypp-recovery/recordings/): 32.9
 * minutes for a 60-75 target; all ten exhibits announced in order (the film's labels and boards can follow them); the
 * answer-words per 1000 words fell from the channel's 5.3 "right" / 3.3 "exactly" to 1.4 / 0.4; no forbidden phrase,
 * no sign-off, the verdict last. Two faults, both the prompt's: a part ran 3.3 minutes, not 5-7 — so a part now gets
 * TWO scenes and a book gets more parts (make-prompt lengthTier) — and the fifth step's words were said aloud at the
 * end of nine exhibits ("Established … Open …"): a step is a direction, never a line, and says so.
 *
 * And the same recording ARGUED more than it TOLD (the operator asked: "are we still storytelling?"): sentences that
 * name a person of the book and carry no thesis word were 24 % of the old Dracula film and 13 % of this one; the
 * thesis' own words ("data", "audit", "paperwork" …) rose from 7.6 to 17.6 per 1000. Four of the five steps asked for
 * argument. (2026-11-20, operator: "original, a very good and accurate summary, in storytelling form" - measured on
 * three Dracula recordings the formed ones told 65-68 % against the plain summary's 81 %: the block now says TELL THE
 * WHOLE BOOK, two thirds of a part is telling, an objection takes two lines, ACCURATE.) So STORY FIRST was written into every form: half of a part is the book's events told as scenes, the second
 * pass of a part is a second scene told in full, and the thesis is not repeated in its own words.
 *
 * Every form keeps what makes the recording long enough (a five-step development of each part — the 30-minute floor
 * was measured to need it) and what the engine needs (PICTURE FIRST and FIRST MINUTE stay in the prompt, outside this).
 * Pure and deterministic: no LLM, no clock. Tested by test-narrative-form.js.
 */
const crypto = require("crypto");

const FORMS = {
  case: {
    for: ["fiction", "nonfiction"], label: "a case file", part: "EXHIBIT", name: "CASE FILE",
    fits: "a book with something that does not add up: a crime, a collapse, a mystery, a decision nobody can explain",
    is: "This is a CASE FILE. Something in this book does not add up; the film works it like investigators, exhibit by exhibit, until a verdict can be given.",
    hosts: "One host has worked this case and lays the evidence on the table. The other accepts NO conclusion until the evidence for it has been shown, and says what else it could mean.",
    parts: (n) => `${n} EXHIBITS — each ONE piece of evidence from the book (an object, a line, a date, a decision). One of them must point the other way.`,
    develop: ["put the exhibit in front of us as a scene: who holds it, where, when", "say what it seems to prove", "the second host gives the other way to read it", "bring a second piece from the book that settles it or makes it worse", "close it in your own words: what the two of you now agree happened, and what it still cannot explain"],
    ending: "THE VERDICT: say flatly what happened and who or what was responsible. A statement, not a question.",
  },
  trial: {
    for: ["nonfiction"], label: "the book's claim on trial", part: "ROUND", name: "THE TRIAL",
    fits: "a book that argues one big claim the reader could reject",
    is: "This is a TRIAL. The book's central claim is the accused: it is charged with being wrong, oversold or dangerous, and it is defended only with what the book itself contains.",
    hosts: "One host PROSECUTES the claim for the whole film. The other DEFENDS it with the book's own cases. They are opponents; neither changes sides to be polite.",
    parts: (n) => `${n} ROUNDS — each ONE charge against the claim, answered from the book.`,
    develop: ["the prosecutor states the charge in one plain sentence", "the defender answers with the book's strongest case, told as a scene", "cross-examination: what that case leaves out, with a number or a name", "one side concedes something specific", "one host admits what this round cost their side"],
    ending: "CLOSING STATEMENTS: each host says in two sentences where they ended up. They may still disagree — do not reconcile them.",
  },
  journey: {
    for: ["fiction", "nonfiction"], label: "one person followed from station to station", part: "STATION", name: "THE JOURNEY",
    fits: "a story or a life that changes one person: a novel with a clear protagonist, a memoir, a biography",
    is: "This is a JOURNEY. The film follows ONE person through the book in order, station by station, and never jumps ahead of what that person knows.",
    hosts: "One host walks us through each station as if it were happening now. The other keeps asking what that person knew, wanted and had already lost at that moment — never what happens later.",
    parts: (n) => `${n} STATIONS in the book's own order — each ONE place and time where that person makes a choice.`,
    develop: ["where we are and what is in their hands", "the choice in front of them, in their own terms", "what it costs them at once", "what a reader only understands about this moment later", "the one thing they carry to the next station"],
    ending: "THE LAST STATION: its final image, then one sentence on what is different in that person. No lesson for the listener.",
  },
  duel: {
    for: ["fiction", "nonfiction"], label: "two readings of the book that fight", part: "CLASH", name: "THE DUEL",
    fits: "a book people read in two opposite ways: hero or villain, love story or warning, wisdom or excuse",
    is: "This is a DUEL between two readings of the same book. Each host holds ONE reading from the first minute to the last and tries to win.",
    hosts: "Host A holds the first reading, host B the opposite one (the angle names both). They interrupt each other with evidence, not with agreement.",
    parts: (n) => `${n} CLASHES — each ONE scene or passage both readings claim.`,
    develop: ["A tells the scene as proof of their reading", "B tells the same scene and shows what A skipped", "each brings one more line or fact from the book", "one of them gives ground on something specific", "leave it where it stands: the point each still refuses"],
    ending: "THE STANDOFF: name the one point neither could move the other on, and leave it standing.",
  },
  practice: {
    for: ["nonfiction"], label: "the book tried on one ordinary life", part: "TRY", name: "PRACTICE RUN",
    fits: "a practical book: habits, money, work, relationships, health",
    is: "This is a PRACTICE RUN. The book's rules are not explained — they are tried, one by one, on one ordinary person's week, and some of them fail.",
    hosts: "One host has lived by this book. The other is new to it and brings ONE real, specific problem of their own that stays the same for the whole film.",
    parts: (n) => `${n} TRIES — each ONE rule from the book, used on that same problem.`,
    develop: ["the rule exactly as the book states it", "try it on the newcomer's problem, step by step, in a real day", "where it breaks or feels false", "the case from the book that shows how it is meant", "the newcomer says the rule again in their own words, changed"],
    ending: "ONE RULE: if they could keep only one, which, and what they will do tomorrow morning. Concrete, no summary.",
  },
  portraits: {
    for: ["fiction"], label: "the book told person by person", part: "PORTRAIT", name: "THE GALLERY",
    fits: "a novel carried by several people: a family, a town, a group, rivals",
    is: "This is a GALLERY. The book is told person by person; the plot only appears where two portraits touch.",
    hosts: "For each portrait one host speaks FOR that person and the other for the people they hurt. They swap sides at every portrait.",
    parts: (n) => `${n} PORTRAITS — each ONE person of the book (the last one is the person the reader misjudged).`,
    develop: ["what they want, in one sentence they would say themselves", "the scene where they show it", "what they hide, and from whom", "how one other person of the book sees them", "what they do to the person in the next portrait"],
    ending: "THE LAST LOOK: which portrait changed most between the first page and the last, shown in one image.",
  },
  question: {
    for: ["fiction", "nonfiction"], label: "one question, answered again and again until an answer holds", part: "ATTEMPT", name: "ONE QUESTION",
    fits: "a book written to answer one hard question: philosophy, a novel of ideas, a big-theory book",
    is: "This is ONE QUESTION. The book was written to answer it; the film tries the book's answers one after another, and each one fails better than the last.",
    hosts: "One host proposes each answer and means it. The other tests it against a case from the book until it gives way.",
    parts: (n) => `${n} ATTEMPTS at an answer — each taken from the book, each better than the one before.`,
    develop: ["the answer, shown working in one scene", "why a sensible person would stop here", "the case from the book that breaks it", "what survives of it", "the question asked again, sharper"],
    ending: "THE ANSWER THAT HOLDS: one sentence, and in one more sentence what it costs to believe it.",
  },
  anatomy: {
    for: ["nonfiction"], label: "one mechanism taken apart", part: "PART", name: "ANATOMY",
    fits: "a book that explains how something works: a system, a market, a mind, a science",
    is: "This is an ANATOMY. The book explains how one thing works; the film takes that thing apart piece by piece and puts it back together.",
    hosts: "One host is the builder who knows where each piece goes. The other keeps trying to break the machine: remove a piece, overload it, use it wrong.",
    parts: (n) => `${n} PARTS of the mechanism, in the order they act on each other.`,
    develop: ["what this part does, shown on one real case from the book", "watch it work once, step by step", "take it out: what stops working", "how people misuse it, with the book's example", "what it hands to the next part"],
    ending: "REASSEMBLY: the whole mechanism in three sentences, in order, with nothing left out.",
  },
};

/** What a listener heard in every film (measured, see the header): the hosts may not answer themselves with these. */
const SPEECH = [
  'SPEECH (keep out of this film): never reply with a bare "Exactly.", "Right." or "Absolutely." — add a fact, an objection or a picture. Never say "deep dive", "unpack", "which brings us to", "we have to look at", "I have to push back", "a great way to put it" or "I want to leave you with": move on by naming the next thing itself. No sign-off: the last sentence is the ending above.',
].join("\n");

const hash = (s) => parseInt(crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 8), 16);
const kindOf = (kind) => (kind === "fiction" || kind === "nonfiction" ? kind : null);

/** The forms a book of this kind can take. */
function candidates(kind) {
  const k = kindOf(kind);
  return Object.keys(FORMS).filter((f) => !k || FORMS[f].for.includes(k));
}

const validForm = (f) => !!f && typeof f.key === "string" && Object.prototype.hasOwnProperty.call(FORMS, f.key);

/**
 * pickForm({slug, kind, recent}) → key
 *   recent: the forms of the books before this one, newest first (keys or {key}); up to 8 are used.
 * Rule: never the newest book's form again; among the rest, the one used least in the window, the longest ago;
 * ties broken by the slug (stable for a book, different between books).
 */
function pickForm({ slug, kind = null, recent = [] } = {}) {
  const win = recent.map((r) => (typeof r === "string" ? r : r && r.key)).filter((k) => FORMS[k]).slice(0, 8);
  const all = candidates(kind);
  let pool = all.filter((k) => k !== win[0]);
  if (!pool.length) pool = all;
  const score = (k) => { const uses = win.filter((w) => w === k).length, last = win.indexOf(k); return -uses * 100 + (last < 0 ? 50 : last); };
  return pool.map((k) => ({ k, s: score(k), t: hash(`${slug}|${k}`) })).sort((a, b) => b.s - a.s || b.t - a.t)[0].k;
}

/** The body blocks of the NotebookLM prompt for this form: what the film is, the hosts, the parts, how a part is developed, the ending, the speech. */
function formBlock(key, tier = { beats: 8 }) {
  const f = FORMS[key];
  if (!f) throw new Error(`unknown narrative form "${key}" — one of ${Object.keys(FORMS).join(", ")}`);
  return [
    `THE FORM OF THIS FILM — the whole book, told as a story, arranged like this (never a list of insights):`,
    f.is,
    `- THE TWO HOSTS: ${f.hosts}`,
    `- THE PARTS: ${f.parts(tier.beats)} Say each one's number and name aloud as it starts ("${f.part.charAt(0) + f.part.slice(1).toLowerCase()} three: …"); finish one before the next.`,
    `- ONE HONEST CRITICISM of the book is argued inside this form.`,
    `- ${f.ending}`,
    "",
    `TELL THE WHOLE BOOK: someone who never read it must finish knowing what happens from its first page to its last — who, what, in the book's order, how it ends. The ${f.part.toLowerCase()}s together cover all of it; bridge each gap in one sentence.`,
    `- TWO THIRDS of every ${f.part.toLowerCase()} is telling: the book's events (in a book of ideas: its cases) as scenes — present tense, what is seen, said and done. Argument is the last third: an objection takes two lines, then the story goes on.`,
    `- ACCURATE: only what the sources say — names, order, numbers, outcomes. No invented quotation; when unsure, say less.`,
    `- Never repeat the thesis in its key words; at most two comparisons to today.`,
    "",
    `HOW EACH ${f.part} IS DEVELOPED (all five, every time):`,
    ...f.develop.map((d, i) => `${"abcde"[i]}) ${d};`.replace(/;$/, i === f.develop.length - 1 ? "." : ";")),
    `Step a is the longest. TWICE: before step e, tell a SECOND scene from the book in full, then b-d on it.`,
    `The steps are directions, never lines: do not say their words, and never end two ${f.part.toLowerCase()}s alike.`,
  ].join("\n");
}

const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/**
 * partBadges(key, sceneTexts) → one badge per scene (what the corner of the screen says), or null for an unknown form.
 * The hosts are asked to SAY each part's number ("Exhibit three: …"); the badge is that number from the scene where it
 * is said — never a number computed from the film's length (until 2026-11-18 every film printed "INSIGHT n / N" by
 * position, whatever was being said). Before the first part, and in a recording where fewer than three parts were
 * announced in rising order, the badge is the form's own name without a number: nothing is invented.
 */
function partBadges(key, sceneTexts = []) {
  const f = FORMS[key];
  if (!f) return null;
  const name = f.name;
  const word = f.part.toLowerCase();
  const re = new RegExp(`\\b${word}s?\\s+(?:number\\s+)?(${NUMBER_WORDS.join("|")}|\\d{1,2})\\b`, "g");
  // read the film as ONE text: the hosts say "… Exhibit" at the end of one scene and "two, the atlas …" at the start of
  // the next (2026-11-18, the third Dracula recording: 12 exhibits said, none heard). An announcement belongs to the
  // scene where its first word is said.
  const said = sceneTexts.map(() => null), offs = []; let all = "";
  sceneTexts.forEach((t) => { offs.push(all.length); all += String(t || "").toLowerCase().replace(/\s+/g, " ").trim() + " "; });
  { let m, i = 0; re.lastIndex = 0; while ((m = re.exec(all))) { const n = NUMBER_WORDS.indexOf(m[1]) + 1 || Number(m[1]); while (i + 1 < offs.length && offs[i + 1] <= m.index) i++; if (n >= 1 && n <= 12) said[i] = n; } }
  // keep the announcements that rise by the film's order (a later "as we saw in exhibit two" is not a new part)
  let cur = 0; const at = said.map((n) => { if (n != null && n === cur + 1) cur = n; else if (n != null && cur === 0 && n === 1) cur = 1; return cur; });
  const total = cur;
  if (total < 3) return sceneTexts.map(() => name);
  return at.map((n) => (n ? `${f.part} ${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}` : name));
}

/**
 * partStarts(key, sceneTexts) → [scene index where part 1 starts, part 2, …] ([] when fewer than three were announced
 * in rising order, or the form is unknown). The same reading as partBadges: what the hosts said, nothing computed.
 */
function partStarts(key, sceneTexts = []) {
  const badges = partBadges(key, sceneTexts);
  if (!badges) return [];
  const starts = [];
  badges.forEach((b, i) => { const m = /(\d+) \/ \d+$/.exec(b); if (m && Number(m[1]) === starts.length + 1) starts.push(i); });
  return starts;
}

/** The titles of the parts as the agent wrote them in the prompt block: "3. The Demeter's log — a dead captain …" → "The Demeter's log". */
function partTitles(block) {
  const out = [];
  for (const line of String(block || "").split(/\r?\n/)) {
    const m = /^\s*(\d{1,2})\.\s+(.+)$/.exec(line);
    if (!m || Number(m[1]) !== out.length + 1) continue;
    out.push(m[2].split(/\s+[—–-]\s+|:\s/)[0].replace(/[.;,]+$/, "").trim().slice(0, 44));
  }
  return out;
}

/**
 * filmForm(form, scenes) → what the film's frame draws (config meta.form), or null. form = book.json form
 * ({ key, parts? }); scenes = [{ text, from }] (from in frames). The track of parts is drawn only when the recording
 * announced at least three of them; a part's title is the one the prompt gave it, else none.
 */
function filmForm(form, scenes = []) {
  if (!validForm(form)) return null;
  const f = FORMS[form.key], starts = partStarts(form.key, scenes.map((s) => s.text));
  const titles = Array.isArray(form.parts) ? form.parts : [];
  return { key: form.key, part: f.part, name: f.name, parts: starts.map((si, i) => ({ n: i + 1, from: scenes[si].from, ...(titles[i] ? { title: titles[i] } : {}) })) };
}

/** One line per form for the agent that chooses (make-prompt prints it; the notebooklm-prompt skill explains it). */
const menu = (kind) => candidates(kind).map((k) => `${k} — ${FORMS[k].label}: ${FORMS[k].fits}`);

module.exports = { FORMS, SPEECH, candidates, validForm, pickForm, formBlock, menu, partBadges, partStarts, partTitles, filmForm };
