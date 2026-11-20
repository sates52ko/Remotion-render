/**
 * told-rules.js — what a storyboard author is told about TOLD beats, and how merge checks one (Film Flow 2, 2026-11-14).
 *
 * The section is generated from the book's own storyboard/entities.json and from the compiler's vocabulary
 * (lib/told-compile.js), so the rules can never offer an action or a glyph the engine cannot draw. A book without
 * entities.json gets no section and no told beat is accepted: the stage is drawn from named things, and they are
 * named once, before the authors start (preview-hazirla; `node scripts/told.js entities --slug=<slug>` lists the
 * candidates the narration gives).
 */
const { DOS, LAYOUTS, GLYPHS, KINDS, wordFrame, LABELS_PER_THING, drawnAs, VERBS } = require("./told-compile");
const { RIG_ACTIONS } = require("../../src/engines/antidote/toldActs.ts");
/** told v3 — what a viewer SEES for each verb (the table an author reads; the compiler's VERBS says what each needs) */
const VERB_HELP = {
  hit: "walks up and strikes them — the fist lands on the word; the other is knocked back and stays so",
  bite: "closes in, takes hold, the head goes down to the neck on the word; the other turns away, eyes shut, and sinks",
  chase: "the other runs for the far side of the stage, this one runs after them",
  hide: "goes behind it and down — only the head shows over its edge",
  dig: "bends and digs: three thrusts, the first on the word (beside the target, if one is named)",
  type: "SITS at it: a desk, the thing on the desk under the hands, a run of key strokes from the word on",
  write: "sits at a desk and writes (on the target, if a drawn thing is named)",
  read: "the thing is in both hands in front of the chest, the head down to it",
  come: "WALKS up to them and stands there on the word — from off the stage when not yet on it. A PHYSICAL arrival only",
  fall: "falls on the word and lies there",
  point: "the arm goes out at it",
};
/**
 * HOW OFTEN A MUTED VIEWER READ EACH VERB — measured blind on dracula, 2026-11-17: 14 seeded-random `act` moments, a
 * fresh rater who does not see the subtitle is asked what each person is doing, on the frame where the verb is played.
 * Small numbers, said as they are; a verb that was only seen in the verb-lab clip says so. Update with every new test.
 */
const VERB_MEASURED = {
  type: "1 of 1 (\"sitting at a typewriter, typing\")", come: "5 of 6 WHILE WALKING — once arrived the person just stands", hide: "1 of 2", point: "1 of 2",
  read: "0 of 1 (it shared its beat with a second verb; alone it reads as \"holding an open book\")",
  bite: "not measured (lab clip: reads as one leaning onto the other)", hit: "not measured (lab clip only)", chase: "not measured (lab clip only)",
  dig: "not measured (lab clip only)", fall: "not measured (lab clip only)", write: "not measured (lab clip only)",
};
const ACTIVE = new Set(["act", "give", "take", "throw", "drop"]); // events in which a person DOES something
/** told v2: what an entity brings to the stage as DRAWINGS (as written: paths or a motif pointer) */
const drawn = (e) => !!e && e.kind !== "person" && drawnAs(e) === "icon";
const statesOf = (e) => (drawn(e) ? Object.keys(e.states || {}) : []);
const isPlaceDrawn = (e) => !!e && e.kind === "place" && (drawn(e) || !!e.backdrop);
const { checkString } = require("./screen-text");

const EVENT_HELP = [
  ["arrange", "layout, who[]", "EXACTLY these on stage in a layout (they enter from their side; those already there move; anything not named leaves)"],
  ["enter / exit", "who", "one thing comes on (everyone makes room) / leaves"],
  ["title", "text, box? (accent | ink | red)", "2-5 words at the top of the screen; one at a time"],
  ["label", "who, text", "a property / product / fact of that thing, beside it (two at most; it leaves by itself after the next beat)"],
  ["crown / uncrown", "who", "the leader, the winner, the biggest"],
  ["world", "who[]", "each sits in its own world (a separate market, universe, camp)"],
  ["apart / together", "who[a, b]", "they move away from each other / come to meet"],
  ["collide", "who[a, b]", "they meet and clash (a burst, both shaken)"],
  ["burst", "who[a, b]?", "an impact between them (or in the middle)"],
  ["cross", "who[a, b] | who", "NO: no path between the two / this thing is ruled out"],
  ["stamp", "who, text", "a verdict stamped on it: FORGERY, BANNED, SOLD"],
  ["cover / uncover", "who[]", "it cannot see / is hidden (a bar across it)"],
  ["dim / restore", "who[]", "it loses (fades and tilts) / it is back"],
  ["grow", "who[], to?", "it gets bigger (to: 1.25 by default)"],
  ["shake", "who[]", "it is hit / shocked"],
  ["coins", "who?, n?", "money: paid, lost, at stake"],
  ["pair", "left, right, onRight?", "one comparison row under the two things on stage: LEFT vs RIGHT (up to four rows)"],
  ["date", "text, side? (left | right)", "a point on a timeline: \"1791 · MOZART DIES\""],
  ["focus / wide", "who / —", "the camera goes to one thing / comes back to the whole stage"],
  ["change", "who, look? action? holds? label?", "the same PERSON differently: another action, a changed look, something in the hand — `holds` is the id of a DRAWN thing of this book (it is drawn in their hand) or one of the engine's hand props; `holds: \"none\"` empties the hand"],
  ["change", "who, state", "the same DRAWN THING as what it has become (its states are listed with it above; `base` = as it was). It stays that way for the rest of the film"],
  ["give", "who[from, to], what", "a person hands a drawn thing to another: it travels from hand to hand and lands on the word (it need not be on stage first)"],
  ["take", "who, what", "a person picks up a drawn thing that stands on stage: it goes into their hand"],
  ["throw", "who, what, to?, state?", "a person throws a drawn thing, in one arc that lands on the word: off the stage (default), \"to\": \"<who or what on stage>\" (they are knocked), or \"to\": \"ground\" - with \"state\" it lies there as what it has become (shattered)"],
  ["drop", "who, what, state?", "a drawn thing falls from the person's hand to the ground at their feet, on the word; with \"state\" it lies there broken"],
  ["act", "who (a person), verb, target?", "the person DOES it on the word — see **Verbs** below. This is how a person shows what the narration says they do"],
  ["at", "who (a place) | —", "the stage is now AT that place: its drawing fades in behind everything (no `who`: the plain ground again)"],
  ["clear", "what? (titles | labels | rows)", "take the extras off the stage (default: all of them)"],
  ["raw", "item", "one bespoke drawn thing nothing else can show — rarely"],
];

function toldSection(entities) {
  const ids = Object.keys(entities || {});
  if (!ids.length) return "";
  const rows = ids.map((id) => {
    const e = entities[id], st = statesOf(e);
    const how = KINDS[e.kind] === "figure" ? " · person" : drawn(e) ? ` · the book's own drawing${st.length ? ` — states: ${st.map((s) => `\`${s}\``).join(", ")}` : ""}` : ` · emblem${e.glyph ? ` (${e.glyph})` : ""}`;
    return `- \`${id}\` — ${e.label || "(drawing)"} · ${e.kind}${how}${isPlaceDrawn(e) ? " · can be the stage's place (`at`)" : ""}${e.note ? ` — ${e.note}` : ""}`;
  }).join("\n");
  const people = ids.filter((id) => entities[id].kind === "person");
  const anyDrawn = ids.some((id) => drawn(entities[id])), anyState = ids.some((id) => statesOf(entities[id]).length), places = ids.filter((id) => isPlaceDrawn(entities[id]));
  // told v2 — said only for what THIS book has drawn (a rule about states in a book without one is noise)
  const drawnRules = !anyDrawn && !places.length ? "" : `
**This book's own drawings — use them; they are why a muted viewer understands the stage**
- A drawn thing is SEEN as itself (a ship is a ship, not a tile with a name). Prefer a stage of drawn things and
  people DOING something with them over a stage of emblems and labels.${anyState ? `
- **A thing the narration changes, changes on screen**: \`{ "on": "<the word>", "do": "change", "who": "<id>", "state": "<state>" }\` —
  only the states listed above exist. Once changed it stays changed in every later beat (write \`"state": "base"\` to
  show it as it was — a flashback).` : ""}${anyDrawn ? `
- **A mechanism** (\`"layout": "flow"\`, two to four things): the things are ONE machine — large, in the order you
  give them, an arrow from each to the next (inflow → stock → outflow; cause → effect → cost). Use it when the
  narration explains how things act on each other; change their \`state\` on the words that say what happens.
- **People handle the things**: \`{ "do": "change", "who": "<person>", "holds": "<thing id>" }\` puts it in their hand;
  \`{ "do": "give", "who": ["<from>", "<to>"], "what": "<thing id>" }\` hands it over on the word; \`take\` picks up a
  thing that stands on stage. The narration's verb decides — never put a thing in a hand the narration does not.
- **What happens to a thing, happens**: when the narration throws, hurls, flings, drops or smashes a thing, the thing
  DOES it on that word — \`{ "do": "throw", "who": "<person>", "what": "<thing id>" }\` (off the stage),
  \`"to": "<who or what>"\` (at them), \`"to": "ground", "state": "<state>"\` (it lies there broken);
  \`{ "do": "drop", "who": "<person>", "what": "<thing id>" }\`. A thing that is thrown in the narration and stands
  still on screen is the commonest reason a stage reads as a label.` : ""}${places.length ? `
- **Where it happens**: \`"stage": { "layout": …, "who": […], "at": "<place id>" }\` draws that place, pale, behind the
  stage (${places.map((p) => `\`${p}\``).join(", ")}). A new \`stage\` without \`at\` is nowhere in particular; the event
  \`at\` changes the place while the things stay. Name the place only when the narration is there.
- **The same place behind a beat that is NOT told**: \`"place": "<place id>"\` on the beat (next to \`set\`) draws the
  book's own drawing of that place behind the cast instead of the generic set. Every beat whose narration happens
  somewhere the book drew gets it — a film that stands in "office" and "room" could be any book.` : ""}
`;
  return `## The picture shows what is said — \`told\` beats (read this before anything else)
Measured on our films: when the narration names a company, a product, a person or a place, that thing was on screen
in 13–31 % of the scenes — the rest showed a figure and a text. So: **when the narration NAMES something, the viewer
SEES that thing, and what the narration says happens to it happens on screen, on the word.** For those beats you write
\`told\` INSTEAD of concept / cast / callout / diagram:

\`\`\`json
{ "i": 12,
  "told": { "stage": { "layout": "versus", "who": ["microsoft", "google"] },
            "events": [ { "on": "king", "do": "crown", "who": "microsoft" },
                        { "on": "operating", "do": "label", "who": "microsoft", "text": "Operating systems" } ] },
  "explainedBy": "Microsoft is crowned the king of operating systems", "noVisual": null }
\`\`\`

**This book's named things** (\`storyboard/entities.json\` — use these ids; you cannot add one: if the narration names
something that is missing, write the beat without it and say so in \`noVisual\`):
${rows}
${drawnRules}
**How it works**
- \`on\` is a word (or the first words of a phrase) of THIS beat's narration, spelled as in the chunk: the event LANDS
  on that word. Events are in the order the words are said. An event with no word uses \`"at": 0\` (the beat's start).
- **The stage is kept from beat to beat.** Write \`stage\` only when the things on stage change; in the next beat write
  only the new \`events\`. A beat without \`told\` ends the stage (the next told beat starts an empty one).
- A passage that talks about the same named things is a RUN of told beats — that is the normal case: the things stay,
  each beat makes one or two things HAPPEN to them. Never a beat where nothing changes.
- Layouts: ${LAYOUTS.map((l) => `\`${l}\``).join(", ")} — \`versus\` two things facing each other; \`row\` several side by side;
  \`court\` the first in the middle, the others around; \`solo\` one; \`pairs\` is set by \`pair\` itself.
- **\`stage\` lists EXACTLY who is on stage**: whoever you leave out walks off with their labels. So change it only
  when the narration turns to other things — not every beat. Inside a passage use \`enter\` / \`exit\` for one thing.
- **Extras expire by themselves:** a label stays for this beat and the next, an effect (burst, cross, coins) for its
  own beat, a stamp / cover and a set of rows a little longer. A thing has at most ${LABELS_PER_THING} labels (a third replaces
  the oldest). A crown and a world stay until you take them off. You never need to tidy up.
- **Keep a stage small: two or three things, four at most.** The compiler finds room (a person is drawn to fit under
  the title, a label goes beside its thing or — in a row — under it, a timeline lifts the things into a row of heads),
  but six people in a row are six small people.
- A **label** is a short noun phrase for a fact the narration states about that thing ("Operating systems") — not a
  sentence, not three keywords. Most beats need ONE event that shows the verb; a label is the exception, not the default.
- Titles are 2-5 words from the narration's own claim, never a label for the picture. At most 5 events in a beat.
- Every title and label is held to the screen-text rules at merge (no keyword soup, no fragments, nothing repeated
  across more than three beats).
- A person on a told stage does one thing at a time and stands still otherwise.${people.length ? `
- **PEOPLE PLAY THE VERB.** When the narration says a person DOES something — to someone, with something — write
  \`{ "on": "<the verb's word>", "do": "act", "who": "<person>", "verb": "<verb>", "target": "<id>" }\`: they turn to the
  other, close the distance, the gesture lands on the word, the other reacts. A title that NAMES the action over two
  standing people is not the action ("TYPING IN MANIFOLD" over Mina standing beside a typewriter: write
  \`"verb": "type", "target": "typewriter"\` and she sits at it and types). Merge warns about a beat that has a person
  on stage and nobody doing anything.
- \`change\` + \`action\` takes only the rig's own actions: ${RIG_ACTIONS.map((x) => `\`${x}\``).join(", ")}. Anything else
  (typing, reading, writing …) is NOT an action — the person would stand still: use \`act\`.` : ""}

**Events**
| do | fields | what the viewer sees |
|---|---|---|
${EVENT_HELP.map(([d, f, m]) => `| \`${d}\` | ${f} | ${m} |`).join("\n")}

${people.length ? `**Verbs** (\`act\`)
| verb | target | what the viewer sees | read by a muted viewer (measured) |
|---|---|---|---|
${Object.keys(VERBS).map((v) => `| \`${v}\` | ${VERBS[v].target === "person" ? "a person" : VERBS[v].target === "thing" ? "a drawn thing" : "a person or a thing"}${VERBS[v].need ? "" : " (optional)"} | ${VERB_HELP[v]} | ${VERB_MEASURED[v]} |`).join("\n")}

- **ONE verb per person per beat.** Two \`act\` events for the same person in one beat showed only the second; merge
  refuses it — give the second verb the next beat (a stage is carried), or choose the one the sentence is about.
- **\`come\` is a PHYSICAL arrival at a person or a thing on stage** — someone walks in and stands next to them. It is
  not for a figurative coming ("Dracula comes to London", "the story arrives at …"): that is where the stage IS
  (\`"stage": { …, "at": "<place>" }\`) or who is on it (\`enter\`). Merge warns about a \`come\` whose target is a place.
- **There is no verb for a glance.** \`look\` and eye contact were tried and read by nobody (0 of 2): the rig faces the
  viewer and a turned head is not seen. If the narration only says someone looks, watches or notices, stage what
  they look AT (a drawn thing, a state change, \`focus\`) — do not invent a verb for it.

` : ""}**When not to use it:** a beat about an unnamed person's inner state, or a general idea with nothing named — author
it the usual way below. Never put a host or a stand-in figure on a told stage to "have someone there".
`;
}

/** merge: is this authored told beat well-formed for this narration and these entities? → [messages] (empty = fine) */
function checkToldBeat(told, narration, entities) {
  const out = [];
  if (!told || typeof told !== "object" || Array.isArray(told)) return ["told must be an object { stage?, events? }"];
  const ids = new Set(Object.keys(entities || {}));
  if (!ids.size) return ["told: this book has no storyboard/entities.json — the named things are listed there before authoring"];
  const words = String(narration || "").split(/\s+/).filter(Boolean).map((w, i) => ({ w, f: i }));
  const names = (who) => (Array.isArray(who) ? who : who != null ? [who] : []);
  if (told.stage) {
    if (!LAYOUTS.includes(told.stage.layout)) out.push(`told.stage.layout "${told.stage.layout}" — one of ${LAYOUTS.join(", ")}`);
    if (!Array.isArray(told.stage.who) || !told.stage.who.length) out.push("told.stage.who: the ids on stage");
    for (const w of names(told.stage.who)) if (!ids.has(w)) out.push(`told.stage.who "${w}" is not in entities.json`);
    if (told.stage.at != null && !isPlaceDrawn(entities[told.stage.at])) out.push(`told.stage.at "${told.stage.at}" — a place of entities.json that has a drawing (${[...ids].filter((k) => isPlaceDrawn(entities[k])).join(", ") || "this book has none"})`);
  }
  if (told.events != null && !Array.isArray(told.events)) out.push("told.events must be an array");
  const events = Array.isArray(told.events) ? told.events : [];
  if (!told.stage && !events.length) out.push("told: nothing happens in this beat — a stage or at least one event");
  if (events.length > 6) out.push(`told: ${events.length} events in one beat — at most 5; split what happens over the beats that say it`);
  let cursor = 0;
  events.forEach((ev, k) => {
    const tag = `told.events[${k}]`;
    if (!ev || !DOS.includes(ev.do)) { out.push(`${tag}.do "${ev && ev.do}" — one of ${DOS.join(", ")}`); return; }
    for (const w of names(ev.who)) if (!ids.has(w)) out.push(`${tag}.who "${w}" is not in entities.json`);
    if (ev.on != null) {
      const hit = wordFrame(words, ev.on, cursor) || wordFrame(words, ev.on, 0);
      if (!hit) out.push(`${tag}.on "${ev.on}" — the narration of this beat does not say it`);
      else cursor = hit.index;
    } else if (!Number.isFinite(ev.at)) out.push(`${tag}: give "on" (a word of this beat) or "at": 0`);
    if (["title", "label", "stamp", "date"].includes(ev.do) && !String(ev.text || "").trim()) out.push(`${tag} (${ev.do}): needs text`);
    if (ev.do === "title" && String(ev.text || "").trim().split(/\s+/).length > 6) out.push(`${tag}: a title is 2-5 words ("${ev.text}")`);
    // the words a told beat prints pass the same rules as every other word on screen (lib/screen-text.js) — here,
    // while the author can still fix them, not at make-book
    for (const [text, kind] of [[ev.do === "title" ? ev.text : null, "text"], [["label", "stamp", "date"].includes(ev.do) ? ev.text : null, "label"], [ev.do === "pair" ? ev.left : null, "label"], [ev.do === "pair" ? ev.right : null, "label"]]) {
      if (!text) continue;
      for (const v of checkString(String(text), { kind, narration, authored: true })) out.push(`${tag} "${text}": ${v.code} — ${v.message}`);
    }
    if (ev.do === "pair" && !(ev.left && ev.right)) out.push(`${tag} (pair): needs left and right`);
    // told v3 (round 2): one verb per person per beat — the second replaced the first on screen
    if (ev.do === "act" && events.slice(0, k).some((p) => p && p.do === "act" && names(p.who)[0] === names(ev.who)[0])) out.push(`${tag} (act ${ev.verb}): ${names(ev.who)[0]} already plays a verb in this beat — one verb per person per beat (the second showed instead of the first); give this one the next beat or choose`);
    // told v2: the book's drawings — a state that is drawn, a thing that can be held, a place that can stand behind
    const w0 = names(ev.who)[0], e0 = entities[w0];
    if (ev.do === "change" && ev.state != null && e0 && ev.state !== "base" && !statesOf(e0).includes(ev.state)) out.push(`${tag} (change): "${w0}" has no state "${ev.state}" — ${statesOf(e0).length ? `one of base, ${statesOf(e0).join(", ")}` : drawn(e0) ? "no state is drawn for it" : "only a drawn thing has states"}`);
    if (ev.do === "change" && e0 && e0.kind !== "person" && ev.state == null) out.push(`${tag} (change): "${w0}" is a thing — it changes by "state"; look / action / holds are a person's`);
    if (ev.do === "change" && typeof ev.holds === "string" && ids.has(ev.holds) && !drawn(entities[ev.holds])) out.push(`${tag} (change): holds "${ev.holds}" — it has no drawing to hold`);
    if (ev.do === "give" || ev.do === "take") {
      const n = ev.do === "give" ? 2 : 1;
      if (names(ev.who).length !== n || names(ev.who).some((w) => entities[w] && entities[w].kind !== "person")) out.push(`${tag} (${ev.do}): who is ${n === 2 ? "[the person who gives, the person who gets]" : "the person who takes it"}`);
      if (!drawn(entities[ev.what])) out.push(`${tag} (${ev.do}): "what" is a drawn thing of entities.json${ev.what != null ? ` ("${ev.what}" is not)` : ""}`);
    }
    if (ev.do === "throw" || ev.do === "drop") {
      if (names(ev.who).length !== 1 || !e0 || e0.kind !== "person") out.push(`${tag} (${ev.do}): who is the one person who ${ev.do}s it`);
      if (!drawn(entities[ev.what])) out.push(`${tag} (${ev.do}): "what" is a drawn thing of entities.json${ev.what != null ? ` ("${ev.what}" is not)` : ""}`);
      else if (ev.state != null && !statesOf(entities[ev.what]).includes(ev.state)) out.push(`${tag} (${ev.do}): "${ev.what}" has no state "${ev.state}"${statesOf(entities[ev.what]).length ? ` - one of ${statesOf(entities[ev.what]).join(", ")}` : " (entities.json states)"}`);
      if (ev.do === "throw" && ev.to != null && ev.to !== "off" && ev.to !== "ground" && !ids.has(ev.to)) out.push(`${tag} (throw): "to" is "off", "ground" or an id of entities.json`);
    }
    if (ev.do === "at" && w0 != null && !isPlaceDrawn(e0)) out.push(`${tag} (at): "${w0}" is not a place with a drawing`);
    // told v3: a person plays a verb — the verb exists, a PERSON does it, and it has the other it needs
    if (ev.do === "act") {
      const spec = VERBS[ev.verb], t = entities[ev.target];
      if (!spec) out.push(`${tag} (act): verb "${ev.verb}" — one of ${Object.keys(VERBS).join(", ")}`);
      else {
        if (names(ev.who).length !== 1 || !e0 || e0.kind !== "person") out.push(`${tag} (act ${ev.verb}): "who" is the one PERSON who does it`);
        if (ev.target == null) { if (spec.need) out.push(`${tag} (act ${ev.verb}): needs "target" — ${spec.target === "person" ? "the person it is done to" : spec.target === "thing" ? "the drawn thing it is done with" : "who or what it is turned to"}`); }
        else if (!t) out.push(`${tag} (act ${ev.verb}): target "${ev.target}" is not in entities.json`);
        else if (spec.target === "person" && t.kind !== "person") out.push(`${tag} (act ${ev.verb}): target "${ev.target}" is not a person`);
        else if (spec.target === "thing" && !drawn(t)) out.push(`${tag} (act ${ev.verb}): target "${ev.target}" is not a drawn thing`);
        else if (ev.target === w0) out.push(`${tag} (act ${ev.verb}): a person does not ${ev.verb} themselves`);
      }
    }
    if (ev.do === "raw" && !(ev.item && ev.item.kind)) out.push(`${tag} (raw): needs item { kind, x, y, … }`);
  });
  return out;
}

/**
 * toldWatch(entities) → (told | null) → [warnings] — merge calls it for every beat IN FILM ORDER (null for a beat that
 * is not told). It follows who is on stage and says, without refusing the beat:
 *   - a PERSON is on stage and nobody does anything in this beat (no act / give / take, no `change` with an action):
 *     the verb is being carried by words — the first told book's people stood through the film;
 *   - `change` + `action` names something the rig cannot do (it would stand still).
 */
function toldWatch(entities) {
  let on = new Set();
  const names = (who) => (Array.isArray(who) ? who : who != null ? [who] : []);
  const isPerson = (id) => !!entities[id] && entities[id].kind === "person";
  return (told) => {
    if (!told || typeof told !== "object") { on = new Set(); return []; }
    const out = [], events = Array.isArray(told.events) ? told.events.filter(Boolean) : [];
    if (told.stage && Array.isArray(told.stage.who)) on = new Set(told.stage.who);
    for (const ev of events) {
      if (ev.do === "enter" || ev.do === "arrange") { if (ev.do === "arrange") on = new Set(); names(ev.who).forEach((w) => on.add(w)); }
      if (ev.do === "exit") names(ev.who).forEach((w) => on.delete(w));
      if (ev.do === "act" && ev.verb === "come") names(ev.who).forEach((w) => on.add(w));
      if (ev.do === "act" && ev.verb === "come" && entities[ev.target] && entities[ev.target].kind === "place") out.push(`told: act come → "${ev.target}" is a PLACE — \`come\` is someone physically walking up to a person or a thing on stage. For "${names(ev.who)[0]} comes to ${entities[ev.target].label || ev.target}" say where the stage is ("stage": { …, "at": "${ev.target}" }) or bring them on with \`enter\``);
      if (ev.do === "change" && ev.action != null && isPerson(names(ev.who)[0]) && !RIG_ACTIONS.includes(ev.action)) out.push(`told: change action "${ev.action}" is not an action of the rig — ${names(ev.who)[0]} would stand still. Use { "do": "act", "verb": … } (${Object.keys(VERBS).join(", ")}) or one of: ${RIG_ACTIONS.join(", ")}`);
    }
    const people = [...on].filter(isPerson);
    const doing = events.some((ev) => ACTIVE.has(ev.do) || (ev.do === "change" && isPerson(names(ev.who)[0]) && (RIG_ACTIONS.includes(ev.action) && !["idle", "talk"].includes(ev.action) || typeof ev.holds === "string")));
    if (people.length && !doing) out.push(`told: ${people.join(", ")} ${people.length > 1 ? "are" : "is"} on stage and nobody DOES anything in this beat — if the narration says what they do, play it: { "do": "act", "who": …, "verb": …, "target": … }`);
    return out;
  };
}

module.exports = { isPlaceDrawn, toldSection, checkToldBeat, toldWatch, EVENT_HELP, VERB_HELP, VERB_MEASURED, GLYPHS };
