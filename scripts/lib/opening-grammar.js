/**
 * opening-grammar.js — every book opens its own way (2026-11-11, operator: nothing static; YPP "repetitive content").
 *
 * The channel's numbers say half the viewers leave before 0:50, so the first minute needs rules. A fixed block would
 * make 60 films open on the same formula, which is exactly what reads as mass-produced. So, like thumbnail-grammar.js,
 * the opening is a deterministic choice on three axes — HOW it hooks, WHEN the book is named, WHAT is promised — taken
 * farthest from the last 8 books, recorded in book.json (`opening`), written into the NotebookLM prompt, and later
 * read by the engine so the opening SCENES differ the same way the opening WORDS do.
 *
 * Pure and deterministic: no LLM, no clock (the caller passes the history). Tested by test-opening-grammar.js.
 */
const crypto = require("crypto");

const HOOKS = {
  scene: { for: ["fiction", "nonfiction"], say: "drop us into one moment from the book in present tense — one person, one place, one thing happening — before a single word of explanation" },
  belief: { for: ["fiction", "nonfiction"], say: "state what most readers believe about this book as if it were simply true, then break it with one fact from the book" },
  number: { for: ["nonfiction"], say: "open on one number, date or measurement from the book and what it cost a real person" },
  ending: { for: ["fiction"], say: "open on the book's final image or last decision, then ask how anyone ends up there" },
  object: { for: ["fiction", "nonfiction"], say: "open on one object from the book in someone's hands, and what it is about to be used for" },
  question: { for: ["fiction", "nonfiction"], say: "open on the one question this book was written to answer, asked the way a worried person would ask it" },
  contrast: { for: ["fiction", "nonfiction"], say: "open on two people from the book facing the same choice and choosing opposite ways" },
  confession: { for: ["nonfiction"], say: "one host admits in a single sentence what they got wrong about this book the first time; the other corrects it with a scene from the book" },
};
const NAMINGS = {
  early: "say the book's title and author in the second or third sentence",
  after: "hold the title back until the hook has landed, then say title and author before 0:30",
  author: "name the author first, as the person who noticed this, then the title, before 0:30",
};
const PROMISES = {
  three: "name the three specific things the listener will understand by the end",
  bet: "make one bet with the listener: name a belief they hold now that will not survive this conversation",
  map: "lay out the journey in one breath: where it starts, where it turns, where it ends",
  stake: "say in one concrete sentence what the listener will see or do differently afterwards",
};
const AXES = { hook: HOOKS, naming: NAMINGS, promise: PROMISES };

const hash = (s) => parseInt(crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 8), 16);

/** Every combination allowed for this kind of book. */
function candidates(kind) {
  const k = kind === "fiction" || kind === "nonfiction" ? kind : null;
  const out = [];
  for (const hook of Object.keys(HOOKS)) {
    if (k && !HOOKS[hook].for.includes(k)) continue;
    for (const naming of Object.keys(NAMINGS)) for (const promise of Object.keys(PROMISES)) out.push({ hook, naming, promise });
  }
  return out;
}

/** Distance from one earlier opening: the hook weighs most (it is what a viewer notices across films). */
const distance = (a, b) => (a.hook !== b.hook ? 3 : 0) + (a.promise !== b.promise ? 2 : 0) + (a.naming !== b.naming ? 1 : 0);

/**
 * pickOpening({slug, kind, recent}) → {hook, naming, promise}
 *   recent: the last openings, newest first (up to 8 are used; newer ones weigh more).
 * Rule: maximise the weighted distance to the recent openings, never repeat the newest hook, never repeat a full
 * combination inside the window; ties broken by the slug (stable for a book, different between books).
 */
function pickOpening({ slug, kind = null, recent = [] } = {}) {
  const win = recent.filter((r) => r && r.hook).slice(0, 8);
  let best = null;
  for (const c of candidates(kind)) {
    if (win[0] && win[0].hook === c.hook) continue;
    if (win.some((r) => distance(r, c) === 0)) continue;
    const score = win.reduce((s, r, i) => s + distance(r, c) * (win.length - i), 0);
    const tie = hash(`${slug}|${c.hook}|${c.naming}|${c.promise}`);
    if (!best || score > best.score || (score === best.score && tie > best.tie)) best = { ...c, score, tie };
  }
  if (!best) { const all = candidates(kind); best = all[hash(slug) % all.length]; }
  return { hook: best.hook, naming: best.naming, promise: best.promise };
}

function validOpening(o) {
  return !!o && Object.keys(AXES).every((a) => Object.prototype.hasOwnProperty.call(AXES[a], o[a]));
}

/** "scene/after/bet" → {hook, naming, promise} (an agent's explicit choice), or null. */
function parseOpening(s) {
  const [hook, naming, promise] = String(s || "").split(/[\/:,]/).map((x) => x.trim());
  const o = { hook, naming, promise };
  return validOpening(o) ? o : null;
}

/** The FIRST MINUTE block of the NotebookLM prompt for this opening. */
function openingBlock(o) {
  if (!validOpening(o)) throw new Error(`unknown opening ${JSON.stringify(o)}`);
  return [
    "FIRST MINUTE (half the audience decides before 0:50 — this opening belongs to this book; do not fall back to a standard intro):",
    `- OPEN: ${HOOKS[o.hook].say}.`,
    `- NAME IT: ${NAMINGS[o.naming]}; say plainly that this is an analysis of the whole book, its ending included.`,
    `- PROMISE (by 0:50): ${PROMISES[o.promise]}, then start at once.`,
    "- In the first minute: no greetings, no banter, no praise of the book, no talk about the conversation itself.",
  ].join("\n");
}

module.exports = { HOOKS, NAMINGS, PROMISES, AXES, candidates, distance, pickOpening, validOpening, parseOpening, openingBlock };
